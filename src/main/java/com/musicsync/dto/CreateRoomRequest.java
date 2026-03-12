package com.musicsync.dto;

public class CreateRoomRequest {
    private String username;
    private String roomName;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getRoomName() { return roomName; }
    public void setRoomName(String roomName) { this.roomName = roomName; }
}
