package com.musicsync.dto;

public class QueueRequest {
    private String roomCode;
    private String songId;
    private String username;

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }
    public String getSongId() { return songId; }
    public void setSongId(String songId) { this.songId = songId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
}
