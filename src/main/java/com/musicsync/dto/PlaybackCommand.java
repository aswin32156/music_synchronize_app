package com.musicsync.dto;

public class PlaybackCommand {
    private String roomCode;
    private String action;
    private double currentTime;

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public double getCurrentTime() { return currentTime; }
    public void setCurrentTime(double currentTime) { this.currentTime = currentTime; }
}
