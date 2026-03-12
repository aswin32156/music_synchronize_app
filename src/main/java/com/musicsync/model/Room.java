package com.musicsync.model;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class Room {

    private String roomCode;
    private String roomName;
    private String password;
    private User host;
    private final List<User> users = new CopyOnWriteArrayList<>();
    private final List<Song> queue = new CopyOnWriteArrayList<>();
    private final List<ChatMessage> chatHistory = new CopyOnWriteArrayList<>();
    private PlaybackState playbackState;
    private long createdAt;

    public Room() {
        this.playbackState = new PlaybackState();
        this.createdAt = System.currentTimeMillis();
    }

    public Room(String roomCode, String roomName, String password, User host) {
        this();
        this.roomCode = roomCode;
        this.roomName = roomName;
        this.password = password;
        this.host = host;
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }
    public String getRoomName() { return roomName; }
    public void setRoomName(String roomName) { this.roomName = roomName; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public User getHost() { return host; }
    public void setHost(User host) { this.host = host; }
    public List<User> getUsers() { return users; }
    public List<Song> getQueue() { return queue; }
    public List<ChatMessage> getChatHistory() { return chatHistory; }
    public PlaybackState getPlaybackState() { return playbackState; }
    public void setPlaybackState(PlaybackState playbackState) { this.playbackState = playbackState; }
    public long getCreatedAt() { return createdAt; }

    public void addUser(User user) {
        users.removeIf(u -> u.getId().equals(user.getId()));
        users.add(user);
    }

    public void removeUser(String userId) {
        users.removeIf(u -> u.getId().equals(userId));
    }

    public void removeUserBySession(String sessionId) {
        users.removeIf(u -> u.getSessionId() != null && u.getSessionId().equals(sessionId));
    }

    public void addSongToQueue(Song song) {
        queue.add(song);
    }

    public void removeSongFromQueue(String songId) {
        queue.removeIf(s -> s.getId().equals(songId));
    }

    public void addChatMessage(ChatMessage message) {
        chatHistory.add(message);
        if (chatHistory.size() > 200) {
            chatHistory.remove(0);
        }
    }

    public Song getCurrentSong() {
        int index = playbackState.getCurrentSongIndex();
        if (index >= 0 && index < queue.size()) {
            return queue.get(index);
        }
        return null;
    }
}
