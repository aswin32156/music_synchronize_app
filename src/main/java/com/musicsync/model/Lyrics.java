package com.musicsync.model;

import java.util.ArrayList;
import java.util.List;

public class Lyrics {
    
    private String songId;
    private String plainLyrics;
    private String syncedLyrics; // LRC format
    private List<LyricLine> lines;
    
    public Lyrics() {
        this.lines = new ArrayList<>();
    }
    
    public Lyrics(String songId, String plainLyrics, String syncedLyrics) {
        this.songId = songId;
        this.plainLyrics = plainLyrics;
        this.syncedLyrics = syncedLyrics;
        this.lines = new ArrayList<>();
        if (syncedLyrics != null && !syncedLyrics.isEmpty()) {
            parseSyncedLyrics(syncedLyrics);
        }
    }
    
    private void parseSyncedLyrics(String lrc) {
        if (lrc == null || lrc.isEmpty()) return;
        
        String[] lrcLines = lrc.split("\n");
        for (String line : lrcLines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("[ar:") || line.startsWith("[al:") || 
                line.startsWith("[ti:") || line.startsWith("[by:") || line.startsWith("[length:")) {
                continue; // Skip metadata tags
            }
            
            // Parse [mm:ss.xx] or [mm:ss] format
            if (line.matches("^\\[\\d{2}:\\d{2}(\\.\\d{2})?\\].*")) {
                try {
                    int endBracket = line.indexOf(']');
                    String timestamp = line.substring(1, endBracket);
                    String text = line.substring(endBracket + 1).trim();
                    
                    String[] parts = timestamp.split(":");
                    int minutes = Integer.parseInt(parts[0]);
                    double seconds = Double.parseDouble(parts[1]);
                    double timeInSeconds = minutes * 60 + seconds;
                    
                    lines.add(new LyricLine(timeInSeconds, text));
                } catch (Exception e) {
                    // Skip malformed lines
                }
            }
        }
        
        // Sort by time
        lines.sort((a, b) -> Double.compare(a.getTime(), b.getTime()));
    }
    
    public String getSongId() { return songId; }
    public void setSongId(String songId) { this.songId = songId; }
    public String getPlainLyrics() { return plainLyrics; }
    public void setPlainLyrics(String plainLyrics) { this.plainLyrics = plainLyrics; }
    public String getSyncedLyrics() { return syncedLyrics; }
    public void setSyncedLyrics(String syncedLyrics) { this.syncedLyrics = syncedLyrics; }
    public List<LyricLine> getLines() { return lines; }
    public void setLines(List<LyricLine> lines) { this.lines = lines; }
    
    public static class LyricLine {
        private double time; // in seconds
        private String text;
        
        public LyricLine() {}
        
        public LyricLine(double time, String text) {
            this.time = time;
            this.text = text;
        }
        
        public double getTime() { return time; }
        public void setTime(double time) { this.time = time; }
        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
    }
}
