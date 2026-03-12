package com.musicsync.service;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.musicsync.model.Lyrics;
import com.musicsync.model.Song;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LyricsService {
    
    private static final Logger log = LoggerFactory.getLogger(LyricsService.class);
    private static final String LRCLIB_API = "https://lrclib.net/api";
    private final RestTemplate restTemplate;
    private final Map<String, Lyrics> lyricsCache = new ConcurrentHashMap<>();
    
    public LyricsService() {
        this.restTemplate = new RestTemplate();
    }
    
    public Lyrics getLyrics(Song song) {
        if (song == null || song.getId() == null) return null;
        
        // Check cache first
        if (lyricsCache.containsKey(song.getId())) {
            return lyricsCache.get(song.getId());
        }
        
        // Try to fetch from lrclib.net
        Lyrics lyrics = fetchFromLrclib(song);
        
        // Cache the result (even if null to avoid repeated failed requests)
        if (lyrics != null) {
            lyricsCache.put(song.getId(), lyrics);
        }
        
        return lyrics;
    }
    
    private Lyrics fetchFromLrclib(Song song) {
        try {
            // Clean up song title and artist for better matching
            String title = cleanSearchTerm(song.getTitle());
            String artist = cleanSearchTerm(song.getArtist());
            
            // API endpoint: /get?artist_name=xxx&track_name=xxx
            String url = String.format("%s/get?track_name=%s&artist_name=%s",
                    LRCLIB_API,
                    URLEncoder.encode(title, StandardCharsets.UTF_8),
                    URLEncoder.encode(artist, StandardCharsets.UTF_8));
            
            String response = restTemplate.getForObject(url, String.class);
            if (response == null || response.trim().isEmpty()) return null;
            
            JsonObject json = JsonParser.parseString(response).getAsJsonObject();
            
            String plainLyrics = getStringField(json, "plainLyrics");
            String syncedLyrics = getStringField(json, "syncedLyrics");
            
            // If we have either plain or synced lyrics, create Lyrics object
            if ((plainLyrics != null && !plainLyrics.isEmpty()) || 
                (syncedLyrics != null && !syncedLyrics.isEmpty())) {
                return new Lyrics(song.getId(), plainLyrics, syncedLyrics);
            }
            
            return null;
        } catch (Exception e) {
            log.debug("Failed to fetch lyrics for '{}' by '{}': {}", 
                    song.getTitle(), song.getArtist(), e.getMessage());
            return null;
        }
    }
    
    private String cleanSearchTerm(String term) {
        if (term == null) return "";
        
        // Remove common extras in brackets
        term = term.replaceAll("\\([^)]*\\)", "");
        term = term.replaceAll("\\[[^\\]]*\\]", "");
        
        // Remove "ft.", "feat.", etc.
        term = term.replaceAll("(?i)(ft\\.|feat\\.|featuring).*", "");
        
        // Clean up extra whitespace
        term = term.trim().replaceAll("\\s+", " ");
        
        return term;
    }
    
    private String getStringField(JsonObject obj, String field) {
        if (obj == null || !obj.has(field)) return null;
        JsonElement elem = obj.get(field);
        return (elem != null && !elem.isJsonNull()) ? elem.getAsString() : null;
    }
}
