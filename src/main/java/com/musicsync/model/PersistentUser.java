package com.musicsync.model;

import java.util.HashSet;
import java.util.Set;

public class PersistentUser {
    
    private String id;
    private String username;
    private String avatarColor;
    private long createdAt;
    private Set<String> friendIds;
    private String currentRoomCode;
    private boolean online;

    public PersistentUser() {
        this.createdAt = System.currentTimeMillis();
        this.friendIds = new HashSet<>();
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
    public Set<String> getFriendIds() { return friendIds; }
    public void setFriendIds(Set<String> friendIds) { this.friendIds = friendIds; }
    public String getCurrentRoomCode() { return currentRoomCode; }
    public void setCurrentRoomCode(String currentRoomCode) { this.currentRoomCode = currentRoomCode; }
    public boolean isOnline() { return online; }
    public void setOnline(boolean online) { this.online = online; }

    public void addFriend(String friendId) {
        this.friendIds.add(friendId);
    }

    public void removeFriend(String friendId) {
        this.friendIds.remove(friendId);
    }
}
