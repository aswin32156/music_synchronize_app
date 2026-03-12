package com.musicsync.model;

public class PlaybackState {

    private boolean playing;
    private double currentTime;
    private long lastUpdated;
    private int currentSongIndex;

    public PlaybackState() {
        this.playing = false;
        this.currentTime = 0;
        this.lastUpdated = System.currentTimeMillis();
        this.currentSongIndex = 0;
    }

    public boolean isPlaying() { return playing; }
    public void setPlaying(boolean playing) {
        this.playing = playing;
        this.lastUpdated = System.currentTimeMillis();
    }
    public double getCurrentTime() { return currentTime; }
    public void setCurrentTime(double currentTime) {
        this.currentTime = currentTime;
        this.lastUpdated = System.currentTimeMillis();
    }
    public long getLastUpdated() { return lastUpdated; }
    public void setLastUpdated(long lastUpdated) { this.lastUpdated = lastUpdated; }
    public int getCurrentSongIndex() { return currentSongIndex; }
    public void setCurrentSongIndex(int currentSongIndex) { this.currentSongIndex = currentSongIndex; }

    public double getEstimatedCurrentTime() {
        if (!playing) return currentTime;
        double elapsed = (System.currentTimeMillis() - lastUpdated) / 1000.0;
        return currentTime + elapsed;
    }
}
