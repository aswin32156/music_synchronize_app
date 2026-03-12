package com.musicsync.service;

import com.musicsync.model.Song;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class MusicService {

    private final List<Song> library = new ArrayList<>();

    public MusicService() {
        initializeLibrary();
    }

    private void initializeLibrary() {
        library.add(new Song("1", "Blinding Lights", "The Weeknd", "After Hours",
                "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36", 200,
                "/audio/blinding-lights.mp3"));
        library.add(new Song("2", "Starboy", "The Weeknd ft. Daft Punk", "Starboy",
                "https://i.scdn.co/image/ab67616d0000b273a048415d3328299c565cf565", 230,
                "/audio/starboy.mp3"));
        library.add(new Song("3", "Shape of You", "Ed Sheeran", "÷ (Divide)",
                "https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96", 234,
                "/audio/shape-of-you.mp3"));
        library.add(new Song("4", "Levitating", "Dua Lipa", "Future Nostalgia",
                "https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010d49946", 203,
                "/audio/levitating.mp3"));
        library.add(new Song("5", "Save Your Tears", "The Weeknd", "After Hours",
                "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36", 216,
                "/audio/save-your-tears.mp3"));
        library.add(new Song("6", "Watermelon Sugar", "Harry Styles", "Fine Line",
                "https://i.scdn.co/image/ab67616d0000b273b46f74097655d7f353caab14", 174,
                "/audio/watermelon-sugar.mp3"));
        library.add(new Song("7", "drivers license", "Olivia Rodrigo", "SOUR",
                "https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd535571d7", 242,
                "/audio/drivers-license.mp3"));
        library.add(new Song("8", "Peaches", "Justin Bieber", "Justice",
                "https://i.scdn.co/image/ab67616d0000b273e6f407c7f3a0ec98845e4431", 198,
                "/audio/peaches.mp3"));
        library.add(new Song("9", "Good 4 U", "Olivia Rodrigo", "SOUR",
                "https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd535571d7", 178,
                "/audio/good-4-u.mp3"));
        library.add(new Song("10", "Stay", "The Kid LAROI & Justin Bieber", "F*CK LOVE 3",
                "https://i.scdn.co/image/ab67616d0000b273a05a950d122466ffd3294d6a", 141,
                "/audio/stay.mp3"));
        library.add(new Song("11", "Montero", "Lil Nas X", "MONTERO",
                "https://i.scdn.co/image/ab67616d0000b273be82673b5f79d9658ec0a9fd", 137,
                "/audio/montero.mp3"));
        library.add(new Song("12", "Heat Waves", "Glass Animals", "Dreamland",
                "https://i.scdn.co/image/ab67616d0000b273712701c5e263efc8726b1464", 239,
                "/audio/heat-waves.mp3"));
    }

    public List<Song> getLibrary() {
        return new ArrayList<>(library);
    }

    public Song getSongById(String id) {
        return library.stream()
                .filter(s -> s.getId().equals(id))
                .findFirst()
                .orElse(null);
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
}
