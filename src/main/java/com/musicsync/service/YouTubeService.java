package com.musicsync.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.musicsync.model.Song;

@Service
public class YouTubeService {

    private static final Logger log = LoggerFactory.getLogger(YouTubeService.class);
    private static final String API_URL = "https://www.googleapis.com/youtube/v3";
    private static final String WEB_SEARCH_URL = "https://www.youtube.com/results?search_query=";
    private static final String OEMBED_URL = "https://www.youtube.com/oembed?url=";

    @Value("${youtube.api-key:}")
    private String apiKey;

    private final RestTemplate restTemplate;
    private final JioSaavnService jioSaavnService;
    private final Map<String, String> fallbackAudioCache = new ConcurrentHashMap<>();

    public YouTubeService(JioSaavnService jioSaavnService) {
        this.restTemplate = new RestTemplate();
        this.jioSaavnService = jioSaavnService;
    }

    public boolean isConfigured() {
        // Service remains available via keyless web fallback when API key is absent.
        return true;
    }

    public boolean isApiConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public List<Song> searchSongs(String query, int limit) {
        List<Song> songs = new ArrayList<>();
        if (query == null || query.isBlank()) return songs;

        int cappedLimit = Math.max(1, Math.min(limit, 50));
        Set<String> seenIds = new LinkedHashSet<>();

        if (isApiConfigured()) {
            List<Song> apiSongs = searchSongsWithApi(query, cappedLimit);
            for (Song song : apiSongs) {
                if (seenIds.add(song.getId())) {
                    songs.add(song);
                }
                if (songs.size() >= cappedLimit) {
                    return songs;
                }
            }
        }

        List<Song> webSongs = searchSongsFromWeb(query, cappedLimit);
        for (Song song : webSongs) {
            if (seenIds.add(song.getId())) {
                songs.add(song);
            }
            if (songs.size() >= cappedLimit) {
                break;
            }
        }

        return songs;
    }

    private List<Song> searchSongsWithApi(String query, int limit) {
        List<Song> songs = new ArrayList<>();

        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String url = API_URL + "/search?part=snippet&type=video&videoCategoryId=10&maxResults=" + limit
                    + "&q=" + encodedQuery + "&key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);

            String response = restTemplate.getForObject(url, String.class);
            if (response == null) return songs;

            JsonObject json = JsonParser.parseString(response).getAsJsonObject();
            JsonArray items = json.has("items") ? json.getAsJsonArray("items") : null;
            if (items == null) return songs;

            for (int i = 0; i < items.size(); i++) {
                JsonObject item = items.get(i).getAsJsonObject();
                Song song = parseSearchItem(item);
                if (song != null) {
                    songs.add(song);
                }
            }
        } catch (Exception e) {
            log.warn("YouTube Data API search failed for query '{}': {}", query, e.getMessage());
        }

        return songs;
    }

    private List<Song> searchSongsFromWeb(String query, int limit) {
        List<Song> songs = new ArrayList<>();

        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String response = restTemplate.getForObject(WEB_SEARCH_URL + encodedQuery, String.class);
            if (response == null || response.isBlank()) return songs;

            String initialData = extractInitialDataJson(response);
            if (initialData == null || initialData.isBlank()) return songs;

            JsonObject initialDataObject = JsonParser.parseString(initialData).getAsJsonObject();
            List<JsonObject> renderers = new ArrayList<>();
            collectVideoRenderers(initialDataObject, renderers);

            Set<String> seenVideoIds = new LinkedHashSet<>();
            for (JsonObject renderer : renderers) {
                Song song = parseVideoRenderer(renderer);
                if (song == null) continue;
                if (seenVideoIds.add(song.getId())) {
                    songs.add(song);
                }
                if (songs.size() >= limit) {
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("YouTube web fallback search failed for query '{}': {}", query, e.getMessage());
        }

        return songs;
    }

    public Song getSongById(String videoId) {
        if (videoId == null || videoId.isBlank()) return null;

        if (isApiConfigured()) {
            try {
                String url = API_URL + "/videos?part=snippet,contentDetails&id="
                        + URLEncoder.encode(videoId, StandardCharsets.UTF_8)
                        + "&key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);

                String response = restTemplate.getForObject(url, String.class);
                if (response != null) {
                    JsonObject json = JsonParser.parseString(response).getAsJsonObject();
                    JsonArray items = json.has("items") ? json.getAsJsonArray("items") : null;
                    if (items != null && !items.isEmpty()) {
                        JsonObject item = items.get(0).getAsJsonObject();
                        Song song = parseVideoItem(item, videoId);
                        if (song != null) {
                            return song;
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("YouTube Data API getSongById failed for id '{}': {}", videoId, e.getMessage());
            }
        }

        return getSongByIdFromOEmbed(videoId);
    }

    private Song getSongByIdFromOEmbed(String videoId) {
        try {
            String watchUrl = "https://www.youtube.com/watch?v=" + videoId;
            String url = OEMBED_URL + URLEncoder.encode(watchUrl, StandardCharsets.UTF_8) + "&format=json";

            String response = restTemplate.getForObject(url, String.class);
            if (response == null) return null;

            JsonObject json = JsonParser.parseString(response).getAsJsonObject();
            String title = getStringField(json, "title");
            if (title == null || title.isBlank()) return null;

            String artist = getStringField(json, "author_name");
            if (artist == null || artist.isBlank()) artist = "Unknown Artist";

            String coverUrl = getStringField(json, "thumbnail_url");
            if (coverUrl == null) coverUrl = "";

            String audioUrl = resolveFallbackAudio(videoId, title, artist);
            if (audioUrl == null || audioUrl.isBlank()) return null;

            return new Song("yt_" + videoId, title, artist, "YouTube Music", coverUrl, 0, audioUrl);
        } catch (Exception e) {
            log.warn("YouTube oEmbed getSongById failed for id '{}': {}", videoId, e.getMessage());
            return null;
        }
    }

    private Song parseSearchItem(JsonObject item) {
        if (!item.has("id") || !item.get("id").isJsonObject()) return null;
        JsonObject idObj = item.getAsJsonObject("id");
        String videoId = getStringField(idObj, "videoId");
        if (videoId == null || videoId.isEmpty()) return null;

        if (!item.has("snippet") || !item.get("snippet").isJsonObject()) return null;
        JsonObject snippet = item.getAsJsonObject("snippet");

        String title = getStringField(snippet, "title");
        if (title == null || title.isEmpty()) return null;

        String artist = getStringField(snippet, "channelTitle");
        if (artist == null || artist.isEmpty()) artist = "Unknown Artist";

        String coverUrl = getThumbnailUrl(snippet);
        String audioUrl = resolveFallbackAudio(videoId, title, artist);
        if (audioUrl == null || audioUrl.isEmpty()) return null;

        return new Song("yt_" + videoId, title, artist, "YouTube Music", coverUrl, 0, audioUrl);
    }

    private Song parseVideoRenderer(JsonObject renderer) {
        String videoId = getStringField(renderer, "videoId");
        if (videoId == null || videoId.isBlank()) return null;

        String title = getTextField(renderer.get("title"));
        if (title == null || title.isBlank()) return null;

        String artist = getTextField(renderer.get("ownerText"));
        if (artist == null || artist.isBlank()) {
            artist = getTextField(renderer.get("longBylineText"));
        }
        if (artist == null || artist.isBlank()) {
            artist = "Unknown Artist";
        }

        int duration = parseDurationLabel(getTextField(renderer.get("lengthText")));
        String coverUrl = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
        String audioUrl = resolveFallbackAudio(videoId, title, artist);
        if (audioUrl == null || audioUrl.isBlank()) return null;

        return new Song("yt_" + videoId, title, artist, "YouTube Music", coverUrl, duration, audioUrl);
    }

    private Song parseVideoItem(JsonObject item, String videoId) {
        if (!item.has("snippet") || !item.get("snippet").isJsonObject()) return null;
        JsonObject snippet = item.getAsJsonObject("snippet");

        String title = getStringField(snippet, "title");
        if (title == null || title.isEmpty()) return null;

        String artist = getStringField(snippet, "channelTitle");
        if (artist == null || artist.isEmpty()) artist = "Unknown Artist";

        int duration = 0;
        if (item.has("contentDetails") && item.get("contentDetails").isJsonObject()) {
            String isoDuration = getStringField(item.getAsJsonObject("contentDetails"), "duration");
            duration = parseDurationSeconds(isoDuration);
        }

        String coverUrl = getThumbnailUrl(snippet);
        String audioUrl = resolveFallbackAudio(videoId, title, artist);
        if (audioUrl == null || audioUrl.isEmpty()) return null;

        return new Song("yt_" + videoId, title, artist, "YouTube Music", coverUrl, duration, audioUrl);
    }

    private void collectVideoRenderers(JsonElement element, List<JsonObject> renderers) {
        if (element == null || element.isJsonNull()) return;

        if (element.isJsonObject()) {
            JsonObject object = element.getAsJsonObject();
            if (object.has("videoRenderer") && object.get("videoRenderer").isJsonObject()) {
                renderers.add(object.getAsJsonObject("videoRenderer"));
            }
            for (Map.Entry<String, JsonElement> entry : object.entrySet()) {
                collectVideoRenderers(entry.getValue(), renderers);
            }
            return;
        }

        if (element.isJsonArray()) {
            for (JsonElement item : element.getAsJsonArray()) {
                collectVideoRenderers(item, renderers);
            }
        }
    }

    private String extractInitialDataJson(String html) {
        if (html == null || html.isBlank()) return null;

        String[] markers = {
            "var ytInitialData = ",
            "window[\"ytInitialData\"] = ",
            "ytInitialData = "
        };

        int startIndex = -1;
        for (String marker : markers) {
            int markerIndex = html.indexOf(marker);
            if (markerIndex >= 0) {
                startIndex = markerIndex + marker.length();
                break;
            }
        }

        if (startIndex < 0) return null;

        int jsonStart = html.indexOf('{', startIndex);
        if (jsonStart < 0) return null;

        int depth = 0;
        boolean inString = false;
        boolean escape = false;

        for (int i = jsonStart; i < html.length(); i++) {
            char c = html.charAt(i);

            if (inString) {
                if (escape) {
                    escape = false;
                } else if (c == '\\') {
                    escape = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }

            if (c == '"') {
                inString = true;
                continue;
            }

            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return html.substring(jsonStart, i + 1);
                }
            }
        }

        return null;
    }

    private String getTextField(JsonElement element) {
        if (element == null || element.isJsonNull()) return null;

        if (element.isJsonPrimitive()) {
            return element.getAsString();
        }

        if (!element.isJsonObject()) return null;
        JsonObject object = element.getAsJsonObject();

        String simpleText = getStringField(object, "simpleText");
        if (simpleText != null && !simpleText.isBlank()) {
            return simpleText;
        }

        if (object.has("runs") && object.get("runs").isJsonArray()) {
            StringBuilder text = new StringBuilder();
            for (JsonElement runElement : object.getAsJsonArray("runs")) {
                if (!runElement.isJsonObject()) continue;
                String runText = getStringField(runElement.getAsJsonObject(), "text");
                if (runText == null || runText.isBlank()) continue;
                if (text.length() > 0) text.append(' ');
                text.append(runText);
            }
            return text.length() == 0 ? null : text.toString();
        }

        return null;
    }

    private int parseDurationLabel(String durationLabel) {
        if (durationLabel == null || durationLabel.isBlank()) return 0;

        String normalized = durationLabel.trim().replaceAll("[^0-9:]", "");
        if (normalized.isBlank() || !normalized.contains(":")) return 0;

        String[] parts = normalized.split(":");
        int total = 0;
        for (String part : parts) {
            if (part.isBlank()) return 0;
            try {
                total = total * 60 + Integer.parseInt(part);
            } catch (NumberFormatException e) {
                return 0;
            }
        }

        return total;
    }

    private String resolveFallbackAudio(String videoId, String title, String artist) {
        String cached = fallbackAudioCache.get(videoId);
        if (cached != null) {
            return cached;
        }

        try {
            String query = (title == null ? "" : title.trim()) + " " + (artist == null ? "" : artist.trim());
            if (query.isBlank()) {
                fallbackAudioCache.put(videoId, "");
                return "";
            }

            List<Song> candidates = jioSaavnService.searchSongs(query, 1);
            if (!candidates.isEmpty()) {
                String fallbackUrl = candidates.get(0).getAudioUrl();
                if (fallbackUrl != null && !fallbackUrl.isBlank()) {
                    fallbackAudioCache.put(videoId, fallbackUrl);
                    return fallbackUrl;
                }
            }
        } catch (Exception e) {
            log.debug("YouTube fallback audio lookup failed for '{}': {}", videoId, e.getMessage());
        }

        fallbackAudioCache.put(videoId, "");
        return "";
    }

    private int parseDurationSeconds(String isoDuration) {
        if (isoDuration == null || isoDuration.isBlank()) return 0;
        try {
            return (int) Duration.parse(isoDuration).getSeconds();
        } catch (Exception e) {
            return 0;
        }
    }

    private String getThumbnailUrl(JsonObject snippet) {
        if (!snippet.has("thumbnails") || !snippet.get("thumbnails").isJsonObject()) return "";
        JsonObject thumbnails = snippet.getAsJsonObject("thumbnails");

        String[] keys = { "high", "medium", "default" };
        for (String key : keys) {
            if (thumbnails.has(key) && thumbnails.get(key).isJsonObject()) {
                String url = getStringField(thumbnails.getAsJsonObject(key), "url");
                if (url != null && !url.isBlank()) {
                    return url;
                }
            }
        }
        return "";
    }

    private String getStringField(JsonObject obj, String field) {
        if (obj != null && obj.has(field) && !obj.get(field).isJsonNull()) {
            return obj.get(field).getAsString();
        }
        return null;
    }
}
