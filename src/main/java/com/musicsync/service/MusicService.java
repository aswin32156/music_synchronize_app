package com.musicsync.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import com.musicsync.model.Song;

@Service
public class MusicService {

    private static final int SEARCH_PROVIDER_LIMIT_CAP = 12;
    private static final int SEARCH_JIO_TIMEOUT_MS = 2200;
    private static final int SEARCH_YOUTUBE_TIMEOUT_MS = 4800;
    private static final long SEARCH_CACHE_TTL_MS = 30_000;

    private final List<Song> library = new ArrayList<>();
    private final Map<String, Song> externalSongsCache = new ConcurrentHashMap<>();
    private final Map<String, CachedExternalSearch> externalSearchCache = new ConcurrentHashMap<>();
    private final JioSaavnService jioSaavnService;
    private final YouTubeService youTubeService;

    private static final class CachedExternalSearch {
        private final long cachedAt;
        private final List<Song> results;

        private CachedExternalSearch(long cachedAt, List<Song> results) {
            this.cachedAt = cachedAt;
            this.results = results;
        }
    }

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
        if (cached != null) {
            // Search can cache YouTube metadata quickly with unresolved audio.
            // Resolve audio lazily when a song is actually requested for playback.
            boolean unresolvedYouTubeAudio = id.startsWith("yt_")
                    && (cached.getAudioUrl() == null || cached.getAudioUrl().isBlank());
            if (!unresolvedYouTubeAudio) {
                return cached;
            }
        }

        // Try to fetch from external APIs by ID
        if (id.startsWith("jio_")) {
            Song song = jioSaavnService.getSongById(id.substring(4));
            if (song != null) {
                externalSongsCache.put(song.getId(), song);
                return song;
            }
        } else if (id.startsWith("yt_")) {
            if (cached != null
                    && (cached.getAudioUrl() == null || cached.getAudioUrl().isBlank())
                    && cached.getTitle() != null
                    && !cached.getTitle().isBlank()) {
                Song resolvedFromMetadata = youTubeService.resolveSongFromMetadata(
                        id.substring(3),
                        cached.getTitle(),
                        cached.getArtist(),
                        cached.getCoverUrl(),
                        cached.getDurationSeconds());
                if (resolvedFromMetadata != null) {
                    externalSongsCache.put(resolvedFromMetadata.getId(), resolvedFromMetadata);
                    return resolvedFromMetadata;
                }
            }

            Song song = youTubeService.getSongById(id.substring(3));
            if (song != null) {
                externalSongsCache.put(song.getId(), song);
                return song;
            }
        } else if (id.startsWith("ytv_")) {
            Song song = youTubeService.getVideoContentById(id.substring(4));
            if (song != null) {
                externalSongsCache.put(song.getId(), song);
                return song;
            }
        }
        return null;
    }

    public Song resolveSongFromMetadata(String id,
                                        String title,
                                        String artist,
                                        String album,
                                        String coverUrl,
                                        int durationSeconds) {
        if (id == null || id.isBlank()) return null;

        String normalizedTitle = title != null ? title.trim() : "";
        String normalizedArtist = artist != null ? artist.trim() : "";
        String normalizedAlbum = album != null ? album.trim() : "";
        String normalizedCover = coverUrl != null ? coverUrl.trim() : "";
        int normalizedDuration = Math.max(0, durationSeconds);

        Song resolved = null;

        if (id.startsWith("yt_")) {
            resolved = youTubeService.resolveSongFromMetadata(
                    id.substring(3),
                    normalizedTitle,
                    normalizedArtist,
                    normalizedCover,
                    normalizedDuration);
        } else if (id.startsWith("ytv_")) {
            String videoId = id.substring(4);
            String safeTitle = normalizedTitle.isBlank() ? "YouTube Video" : normalizedTitle;
            String safeArtist = normalizedArtist.isBlank() ? "YouTube" : normalizedArtist;
            String safeAlbum = normalizedAlbum.isBlank() ? "YouTube Video" : normalizedAlbum;
            String safeCover = normalizedCover.isBlank()
                    ? "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
                    : normalizedCover;
            resolved = new Song(id, safeTitle, safeArtist, safeAlbum, safeCover, normalizedDuration, "");
        }

        if (resolved != null && resolved.getId() != null && !resolved.getId().isBlank()) {
            externalSongsCache.put(resolved.getId(), resolved);
        }

        return resolved;
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

        int normalizedLimit = Math.max(1, Math.min(limit, 30));
        int providerLimit = Math.max(6, Math.min(normalizedLimit, SEARCH_PROVIDER_LIMIT_CAP));
        String normalizedQuery = query.trim();
        String searchKey = normalizedQuery.toLowerCase() + "#" + providerLimit;

        CachedExternalSearch cachedSearch = externalSearchCache.get(searchKey);
        long now = System.currentTimeMillis();
        if (cachedSearch != null && (now - cachedSearch.cachedAt) <= SEARCH_CACHE_TTL_MS) {
            return new ArrayList<>(cachedSearch.results);
        }

        CompletableFuture<List<Song>> jioFuture = CompletableFuture
                .supplyAsync(() -> jioSaavnService.searchSongs(normalizedQuery, providerLimit))
            .completeOnTimeout(List.of(), SEARCH_JIO_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .exceptionally(e -> List.of());

        CompletableFuture<List<Song>> ytMusicFuture = CompletableFuture
                .supplyAsync(() -> youTubeService.searchSongs(normalizedQuery, providerLimit))
            .completeOnTimeout(List.of(), SEARCH_YOUTUBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .exceptionally(e -> List.of());

        CompletableFuture<List<Song>> ytVideoFuture = CompletableFuture
                .supplyAsync(() -> youTubeService.searchVideoContent(normalizedQuery, providerLimit))
            .completeOnTimeout(List.of(), SEARCH_YOUTUBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .exceptionally(e -> List.of());

        List<Song> jioResults = safeJoin(jioFuture);
        List<Song> ytResults = safeJoin(ytMusicFuture);
        List<Song> ytvResults = safeJoin(ytVideoFuture);

        Set<String> seenIds = new LinkedHashSet<>();
        appendUnique(results, jioResults, seenIds);
        appendUnique(results, ytResults, seenIds);
        appendUnique(results, ytvResults, seenIds);

        // Cache results so queue add can resolve by ID later.
        for (Song song : results) {
            if (song == null || song.getId() == null) continue;

            externalSongsCache.put(song.getId(), song);
        }

        boolean hasAnyYouTubeResult = !ytResults.isEmpty() || !ytvResults.isEmpty();
        if (hasAnyYouTubeResult) {
            externalSearchCache.put(searchKey, new CachedExternalSearch(now, new ArrayList<>(results)));
        } else {
            // Do not cache degraded jio-only snapshots; allow a new attempt on the next search.
            externalSearchCache.remove(searchKey);
        }

        return results;
    }

    private List<Song> safeJoin(CompletableFuture<List<Song>> future) {
        try {
            return future.join();
        } catch (Exception e) {
            return List.of();
        }
    }

    private void appendUnique(List<Song> target, List<Song> source, Set<String> seenIds) {
        if (source == null || source.isEmpty()) return;

        for (Song song : source) {
            if (song == null || song.getId() == null || song.getId().isBlank()) continue;
            if (seenIds.add(song.getId())) {
                target.add(song);
            }
        }
    }

    public Map<String, Object> getAvailableSources() {
        boolean youtubeConfigured = youTubeService.isConfigured();
        List<String> sources = new ArrayList<>();
        sources.add("jiosaavn");
        if (youtubeConfigured) {
            sources.add("youtube");
            sources.add("youtubevideo");
        }
        return Map.of(
            "sources", sources,
            "youtubeConfigured", youtubeConfigured,
            "youtubeApiConfigured", youTubeService.isApiConfigured(),
            "spotifyConfigured", false
        );
    }
}
