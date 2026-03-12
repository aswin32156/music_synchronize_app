package com.musicsync.model;

import java.time.LocalDateTime;

public class ChatMessage {

    private String id;
    private String username;
    private String avatarColor;
    private String message;
    private LocalDateTime timestamp;
    private String type;

    public ChatMessage() {
        this.timestamp = LocalDateTime.now();
    }

    public ChatMessage(String id, String username, String avatarColor, String message, String type) {
        this.id = id;
        this.username = username;
        this.avatarColor = avatarColor;
        this.message = message;
        this.timestamp = LocalDateTime.now();
        this.type = type;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getAvatarColor() { return avatarColor; }
    public void setAvatarColor(String avatarColor) { this.avatarColor = avatarColor; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
}
