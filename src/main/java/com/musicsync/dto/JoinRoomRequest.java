package com.musicsync.dto;

public class JoinRoomRequest {
    private String username;
    private String roomCode;
    private String password;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
