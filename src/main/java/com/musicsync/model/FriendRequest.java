package com.musicsync.model;

public class FriendRequest {
    
    private String id;
    private String fromUserId;
    private String fromUsername;
    private String toUserId;
    private String toUsername;
    private long timestamp;
    private FriendRequestStatus status;

    public enum FriendRequestStatus {
        PENDING, ACCEPTED, REJECTED
    }

    public FriendRequest() {
        this.timestamp = System.currentTimeMillis();
        this.status = FriendRequestStatus.PENDING;
    }

    public FriendRequest(String id, String fromUserId, String fromUsername, String toUserId, String toUsername) {
        this();
        this.id = id;
        this.fromUserId = fromUserId;
        this.fromUsername = fromUsername;
        this.toUserId = toUserId;
        this.toUsername = toUsername;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getFromUserId() { return fromUserId; }
    public void setFromUserId(String fromUserId) { this.fromUserId = fromUserId; }
    public String getFromUsername() { return fromUsername; }
    public void setFromUsername(String fromUsername) { this.fromUsername = fromUsername; }
    public String getToUserId() { return toUserId; }
    public void setToUserId(String toUserId) { this.toUserId = toUserId; }
    public String getToUsername() { return toUsername; }
    public void setToUsername(String toUsername) { this.toUsername = toUsername; }
    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
    public FriendRequestStatus getStatus() { return status; }
    public void setStatus(FriendRequestStatus status) { this.status = status; }
}
