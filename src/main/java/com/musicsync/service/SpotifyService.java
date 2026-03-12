package com.musicsync.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.musicsync.model.Song;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
public class SpotifyService {

    private static final Logger log = LoggerFactory.getLogger(SpotifyService.class);
    private static final String AUTH_URL = "https://accounts.spotify.com/api/token";
    private static final String API_URL = "https://api.spotify.com/v1";

    @Value("${spotify.client-id:}")
    private String clientId;

    @Value("${spotify.client-secret:}")
    private String clientSecret;

    private final RestTemplate restTemplate;
    private String accessToken;
    private long tokenExpiry;

    public SpotifyService() {
        this.restTemplate = new RestTemplate();
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    public List<Song> searchSongs(String query, int limit) {
        List<Song> songs = new ArrayList<>();
        if (!isConfigured()) return songs;

        try {
            ensureValidToken();
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String url = API_URL + "/search?q=" + encodedQuery + "&type=track&limit=" + limit;

            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
            if (response.getBody() == null) return songs;

            JsonObject json = JsonParser.parseString(response.getBody()).getAsJsonObject();
            JsonObject tracks = json.getAsJsonObject("tracks");
            if (tracks == null || !tracks.has("items")) return songs;

            JsonArray items = tracks.getAsJsonArray("items");
            for (JsonElement elem : items) {
                Song song = parseTrack(elem.getAsJsonObject());
                if (song != null) {
                    songs.add(song);
                }
            }
        } catch (Exception e) {
            log.warn("Spotify search failed for query '{}': {}", query, e.getMessage());
        }
        return songs;
    }

    public Song getSongById(String spotifyId) {
        if (!isConfigured()) return null;
        try {
            ensureValidToken();
            String url = API_URL + "/tracks/" + URLEncoder.encode(spotifyId, StandardCharsets.UTF_8);

            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
            if (response.getBody() == null) return null;

            JsonObject json = JsonParser.parseString(response.getBody()).getAsJsonObject();
            return parseTrack(json);
        } catch (Exception e) {
            log.warn("Spotify getSongById failed for id '{}': {}", spotifyId, e.getMessage());
            return null;
        }
    }

    private Song parseTrack(JsonObject track) {
        try {
            String id = "spotify_" + getStringField(track, "id");
            String title = getStringField(track, "name");
            if (title == null || title.isEmpty()) return null;

            // Preview URL (30-second clip, available for free)
            String previewUrl = getStringField(track, "preview_url");
            if (previewUrl == null || previewUrl.isEmpty()) return null;

            // Artists
            List<String> artistNames = new ArrayList<>();
            if (track.has("artists") && track.get("artists").isJsonArray()) {
                for (JsonElement a : track.getAsJsonArray("artists")) {
                    String name = getStringField(a.getAsJsonObject(), "name");
                    if (name != null) artistNames.add(name);
                }
            }
            String artist = artistNames.isEmpty() ? "Unknown Artist" : String.join(", ", artistNames);

            // Album
            String album = "";
            String coverUrl = "";
            if (track.has("album") && track.get("album").isJsonObject()) {
                JsonObject albumObj = track.getAsJsonObject("album");
                album = getStringField(albumObj, "name");
                if (album == null) album = "";

                if (albumObj.has("images") && albumObj.get("images").isJsonArray()) {
                    JsonArray images = albumObj.getAsJsonArray("images");
                    if (!images.isEmpty()) {
                        coverUrl = getStringField(images.get(0).getAsJsonObject(), "url");
                        if (coverUrl == null) coverUrl = "";
                    }
                }
            }

            // Duration (ms to seconds)
            int duration = 0;
            if (track.has("duration_ms")) {
                duration = track.get("duration_ms").getAsInt() / 1000;
            }

            return new Song(id, title, artist, album, coverUrl, duration, previewUrl);
        } catch (Exception e) {
            log.debug("Failed to parse Spotify track: {}", e.getMessage());
            return null;
        }
    }

    private synchronized void ensureValidToken() {
        if (accessToken != null && System.currentTimeMillis() < tokenExpiry) {
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.setBasicAuth(clientId, clientSecret);

            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "client_credentials");

            HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(AUTH_URL, request, String.class);

            if (response.getBody() != null) {
                JsonObject json = JsonParser.parseString(response.getBody()).getAsJsonObject();
                accessToken = json.get("access_token").getAsString();
                int expiresIn = json.get("expires_in").getAsInt();
                tokenExpiry = System.currentTimeMillis() + (expiresIn - 60) * 1000L;
                log.info("Spotify access token refreshed, expires in {}s", expiresIn);
            }
        } catch (Exception e) {
            log.error("Failed to obtain Spotify access token: {}", e.getMessage());
            throw new RuntimeException("Spotify authentication failed", e);
        }
    }

    private String getStringField(JsonObject obj, String field) {
        if (obj.has(field) && !obj.get(field).isJsonNull()) {
            return obj.get(field).getAsString();
        }
        return null;
    }
}
