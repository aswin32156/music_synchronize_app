package com.musicsync.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.musicsync.model.Song;

@Service
public class JioSaavnService {

    private static final Logger log = LoggerFactory.getLogger(JioSaavnService.class);
    private static final String BASE_URL = "https://jiosaavn-api-privatecvc2.vercel.app";
    private static final int MAX_SEARCH_LIMIT = 300;
    private static final int PAGE_SIZE = 50;
    private static final int MAX_PAGES = 6;
    private final RestTemplate restTemplate;

    public JioSaavnService() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(1300);
        requestFactory.setReadTimeout(2300);
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public List<Song> searchSongs(String query, int limit) {
        List<Song> songs = new ArrayList<>();
        try {
            int requested = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT));
            int pageSize = Math.min(PAGE_SIZE, requested);
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            Set<String> seenIds = new LinkedHashSet<>();

            for (int page = 1; page <= MAX_PAGES && songs.size() < requested; page++) {
                String url = BASE_URL + "/search/songs?query=" + encodedQuery + "&limit=" + pageSize + "&page=" + page;
                String response = restTemplate.getForObject(url, String.class);
                if (response == null) break;

                JsonObject json = JsonParser.parseString(response).getAsJsonObject();
                String status = getStringField(json, "status");
                if (!"SUCCESS".equals(status)) {
                    break;
                }

                JsonObject data = json.getAsJsonObject("data");
                if (data == null || !data.has("results")) break;

                JsonArray results = data.getAsJsonArray("results");
                if (results == null || results.isEmpty()) {
                    break;
                }

                int addedInPage = 0;
                for (JsonElement elem : results) {
                    Song song = parseSong(elem.getAsJsonObject());
                    if (song == null || song.getId() == null || song.getId().isBlank()) {
                        continue;
                    }
                    if (seenIds.add(song.getId())) {
                        songs.add(song);
                        addedInPage++;
                    }
                    if (songs.size() >= requested) {
                        break;
                    }
                }

                if (addedInPage == 0 || results.size() < pageSize) {
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("JioSaavn search failed for query '{}': {}", query, e.getMessage());
        }
        return songs;
    }

    public Song getSongById(String saavnId) {
        try {
            String url = BASE_URL + "/songs?id=" + URLEncoder.encode(saavnId, StandardCharsets.UTF_8);
            String response = restTemplate.getForObject(url, String.class);
            if (response == null) return null;

            JsonObject json = JsonParser.parseString(response).getAsJsonObject();
            String status = getStringField(json, "status");
            if (!"SUCCESS".equals(status)) return null;

            JsonArray data = json.getAsJsonArray("data");
            if (data == null || data.isEmpty()) return null;

            return parseSong(data.get(0).getAsJsonObject());
        } catch (Exception e) {
            log.warn("JioSaavn getSongById failed for id '{}': {}", saavnId, e.getMessage());
            return null;
        }
    }

    private Song parseSong(JsonObject obj) {
        try {
            String id = "jio_" + getStringField(obj, "id");
            String title = getStringField(obj, "name");
            if (title == null || title.isEmpty()) return null;

            // Extract artist
            String artist = getStringField(obj, "primaryArtists");
            if (artist == null || artist.isEmpty()) artist = "Unknown Artist";

            // Extract album
            String album = "";
            if (obj.has("album") && obj.get("album").isJsonObject()) {
                album = getStringField(obj.getAsJsonObject("album"), "name");
            }
            if (album == null) album = "";

            // Extract cover image (get highest quality)
            String coverUrl = "";
            if (obj.has("image") && obj.get("image").isJsonArray()) {
                JsonArray images = obj.getAsJsonArray("image");
                for (int i = images.size() - 1; i >= 0; i--) {
                    JsonObject img = images.get(i).getAsJsonObject();
                    String link = getStringField(img, "link");
                    if (link != null && !link.isEmpty()) {
                        coverUrl = link;
                        break;
                    }
                }
            }

            // Duration
            int duration = 0;
            if (obj.has("duration")) {
                try {
                    duration = Integer.parseInt(obj.get("duration").getAsString());
                } catch (Exception ignored) {}
            }

            // Extract download/streaming URL (get highest quality)
            String audioUrl = "";
            if (obj.has("downloadUrl") && obj.get("downloadUrl").isJsonArray()) {
                JsonArray downloads = obj.getAsJsonArray("downloadUrl");
                for (int i = downloads.size() - 1; i >= 0; i--) {
                    JsonObject dl = downloads.get(i).getAsJsonObject();
                    String link = getStringField(dl, "link");
                    if (link != null && !link.isEmpty()) {
                        audioUrl = link;
                        break;
                    }
                }
            }

            if (audioUrl.isEmpty()) return null;

            return new Song(id, title, artist, album, coverUrl, duration, audioUrl);
        } catch (Exception e) {
            log.debug("Failed to parse JioSaavn song: {}", e.getMessage());
            return null;
        }
    }

    private String getStringField(JsonObject obj, String field) {
        if (obj.has(field) && !obj.get(field).isJsonNull()) {
            return obj.get(field).getAsString();
        }
        return null;
    }
}
