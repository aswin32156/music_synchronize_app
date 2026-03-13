package com.musicsync.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.musicsync.model.Song;

@Service
public class MusicService {

    private final List<Song> library = new ArrayList<>();
    private final Map<String, Song> externalSongsCache = new ConcurrentHashMap<>();
    private final JioSaavnService jioSaavnService;
    private final YouTubeService youTubeService;

    public MusicService(JioSaavnService jioSaavnService, YouTubeService youTubeService) {
        this.jioSaavnService = jioSaavnService;
        this.youTubeService = youTubeService;
        initializeLibrary();
    }

    private void initializeLibrary() {
        // Using royalty-free sample audio from pixabay.com (Creative Commons)
        library.add(new Song("1", "Blinding Lights", "The Weeknd", "After Hours",
                "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36", 200,
                "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3"));
        library.add(new Song("2", "Starboy", "The Weeknd ft. Daft Punk", "Starboy",
                "https://i.scdn.co/image/ab67616d0000b273a048415d3328299c565cf565", 230,
                "https://cdn.pixabay.com/audio/2022/10/11/audio_2ceb382e2e.mp3"));
        library.add(new Song("3", "Shape of You", "Ed Sheeran", "÷ (Divide)",
                "https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96", 234,
                "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3"));
        library.add(new Song("4", "Levitating", "Dua Lipa", "Future Nostalgia",
                "https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010d49946", 203,
                "https://cdn.pixabay.com/audio/2021/11/25/audio_91b32e02f9.mp3"));
        library.add(new Song("5", "Save Your Tears", "The Weeknd", "After Hours",
                "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36", 216,
                "https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b3f25.mp3"));
        library.add(new Song("6", "Watermelon Sugar", "Harry Styles", "Fine Line",
                "https://i.scdn.co/image/ab67616d0000b273b46f74097655d7f353caab14", 174,
                "https://cdn.pixabay.com/audio/2022/08/04/audio_2dae668d83.mp3"));
        library.add(new Song("7", "drivers license", "Olivia Rodrigo", "SOUR",
                "https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd535571d7", 242,
                "https://cdn.pixabay.com/audio/2023/05/16/audio_166b39b10a.mp3"));
        library.add(new Song("8", "Peaches", "Justin Bieber", "Justice",
                "https://i.scdn.co/image/ab67616d0000b273e6f407c7f3a0ec98845e4431", 198,
                "https://cdn.pixabay.com/audio/2022/06/07/audio_b9bd4170e4.mp3"));
        library.add(new Song("9", "Good 4 U", "Olivia Rodrigo", "SOUR",
                "https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd535571d7", 178,
                "https://cdn.pixabay.com/audio/2023/09/04/audio_0e8a28a08c.mp3"));
        library.add(new Song("10", "Stay", "The Kid LAROI & Justin Bieber", "F*CK LOVE 3",
                "https://i.scdn.co/image/ab67616d0000b273a05a950d122466ffd3294d6a", 141,
                "https://cdn.pixabay.com/audio/2022/11/22/audio_febc508520.mp3"));
        library.add(new Song("11", "Montero", "Lil Nas X", "MONTERO",
                "https://i.scdn.co/image/ab67616d0000b273be82673b5f79d9658ec0a9fd", 137,
                "https://cdn.pixabay.com/audio/2022/04/27/audio_67bcb4e1c1.mp3"));
        library.add(new Song("12", "Heat Waves", "Glass Animals", "Dreamland",
                "https://i.scdn.co/image/ab67616d0000b273712701c5e263efc8726b1464", 239,
                "https://cdn.pixabay.com/audio/2023/07/30/audio_e5b1a26c75.mp3"));
    }

    public List<Song> getLibrary() {
        return new ArrayList<>(library);
    }

    public Song getSongById(String id) {
        // Check local library first
        Song local = library.stream()
                .filter(s -> s.getId().equals(id))
                .findFirst()
                .orElse(null);
        if (local != null) return local;

        // Check external songs cache
        Song cached = externalSongsCache.get(id);
        if (cached != null) return cached;

        // Try to fetch from external APIs by ID
        if (id.startsWith("jio_")) {
            Song song = jioSaavnService.getSongById(id.substring(4));
            if (song != null) {
                externalSongsCache.put(song.getId(), song);
                return song;
            }
        } else if (id.startsWith("yt_")) {
            Song song = youTubeService.getSongById(id.substring(3));
            if (song != null) {
                externalSongsCache.put(song.getId(), song);
                return song;
            }
        }
        return null;
    }

    public List<Song> searchSongs(String query) {
        if (query == null || query.isBlank()) {
            return getLibrary();
        }
        String lowerQuery = query.toLowerCase();
        return library.stream()
                .filter(s -> s.getTitle().toLowerCase().contains(lowerQuery) ||
                             s.getArtist().toLowerCase().contains(lowerQuery) ||
                             s.getAlbum().toLowerCase().contains(lowerQuery))
                .toList();
    }

    public List<Song> searchExternal(String query, int limit) {
        List<Song> results = new ArrayList<>();
        if (query == null || query.isBlank()) return results;

        // Search JioSaavn (always available)
        List<Song> jioResults = jioSaavnService.searchSongs(query, limit);
        results.addAll(jioResults);

        // Search YouTube Music metadata (API key or web fallback)
        List<Song> ytResults = youTubeService.searchSongs(query, limit);
        results.addAll(ytResults);

        // Cache all results so they can be retrieved by ID when adding to queue
        for (Song song : results) {
            externalSongsCache.put(song.getId(), song);
        }

        return results;
    }

    public Map<String, Object> getAvailableSources() {
        boolean youtubeConfigured = youTubeService.isConfigured();
        List<String> sources = new ArrayList<>();
        sources.add("jiosaavn");
        if (youtubeConfigured) {
            sources.add("youtube");
        }
        return Map.of(
            "sources", sources,
            "youtubeConfigured", youtubeConfigured,
            "youtubeApiConfigured", youTubeService.isApiConfigured(),
            "spotifyConfigured", false
        );
    }
}
