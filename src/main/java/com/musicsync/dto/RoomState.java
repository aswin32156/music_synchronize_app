package com.musicsync.dto;

import com.musicsync.model.*;
import java.util.List;

public class RoomState {
    private String roomCode;
    private String roomName;
    private User host;
    private List<User> users;
    private List<Song> queue;
    private Song currentSong;
    private PlaybackState playbackState;
    private List<ChatMessage> chatHistory;

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }
    public String getRoomName() { return roomName; }
    public void setRoomName(String roomName) { this.roomName = roomName; }
    public User getHost() { return host; }
    public void setHost(User host) { this.host = host; }
    public List<User> getUsers() { return users; }
    public void setUsers(List<User> users) { this.users = users; }
    public List<Song> getQueue() { return queue; }
    public void setQueue(List<Song> queue) { this.queue = queue; }
    public Song getCurrentSong() { return currentSong; }
    public void setCurrentSong(Song currentSong) { this.currentSong = currentSong; }
    public PlaybackState getPlaybackState() { return playbackState; }
    public void setPlaybackState(PlaybackState playbackState) { this.playbackState = playbackState; }
    public List<ChatMessage> getChatHistory() { return chatHistory; }
    public void setChatHistory(List<ChatMessage> chatHistory) { this.chatHistory = chatHistory; }
}
