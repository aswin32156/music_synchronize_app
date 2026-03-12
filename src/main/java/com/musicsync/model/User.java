package com.musicsync.model;

public class User {

    private String id;
    private String username;
    private String avatarColor;
    private boolean isHost;
    private String sessionId;

    public User() {}

    public User(String id, String username, String avatarColor, boolean isHost, String sessionId) {
        this.id = id;
        this.username = username;
        this.avatarColor = avatarColor;
        this.isHost = isHost;
        this.sessionId = sessionId;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getAvatarColor() { return avatarColor; }
    public void setAvatarColor(String avatarColor) { this.avatarColor = avatarColor; }
    public boolean isHost() { return isHost; }
    public void setHost(boolean host) { isHost = host; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
}
