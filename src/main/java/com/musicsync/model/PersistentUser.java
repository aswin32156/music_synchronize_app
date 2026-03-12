package com.musicsync.model;

public class PersistentUser {
    
    private String id;
    private String username;
    private String avatarColor;
    private long createdAt;
    private String currentRoomCode;
    private boolean online;

    public PersistentUser() {
        this.createdAt = System.currentTimeMillis();
        this.online = false;
    }

    public PersistentUser(String id, String username, String avatarColor) {
        this();
        this.id = id;
        this.username = username;
        this.avatarColor = avatarColor;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getAvatarColor() { return avatarColor; }
    public void setAvatarColor(String avatarColor) { this.avatarColor = avatarColor; }
    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long createdAt) { this.createdAt = createdAt; }
    public String getCurrentRoomCode() { return currentRoomCode; }
    public void setCurrentRoomCode(String currentRoomCode) { this.currentRoomCode = currentRoomCode; }
    public boolean isOnline() { return online; }
    public void setOnline(boolean online) { this.online = online; }
}
