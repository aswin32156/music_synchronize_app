package com.musicsync.service;

import com.musicsync.dto.RoomState;
import com.musicsync.model.*;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    private static final String[] AVATAR_COLORS = {
        "#1DB954", "#1ED760", "#E91E63", "#9C27B0", "#673AB7",
        "#3F51B5", "#2196F3", "#00BCD4", "#009688", "#FF9800",
        "#FF5722", "#795548", "#607D8B", "#F44336", "#4CAF50"
    };

    public Room createRoom(String username, String roomName) {
        String roomCode = generateRoomCode();
        String userId = UUID.randomUUID().toString();
        String avatarColor = AVATAR_COLORS[random.nextInt(AVATAR_COLORS.length)];

        User host = new User(userId, username, avatarColor, true, null);
        Room room = new Room(roomCode, roomName, host);
        room.addUser(host);

        rooms.put(roomCode, room);
        return room;
    }

    public Room joinRoom(String roomCode, String username) {
        Room room = rooms.get(roomCode.toUpperCase());
        if (room == null) {
            return null;
        }
        String userId = UUID.randomUUID().toString();
        String avatarColor = AVATAR_COLORS[random.nextInt(AVATAR_COLORS.length)];
        User user = new User(userId, username, avatarColor, false, null);
        room.addUser(user);
        return room;
    }

    public Room getRoom(String roomCode) {
        return rooms.get(roomCode.toUpperCase());
    }

    public boolean roomExists(String roomCode) {
        return rooms.containsKey(roomCode.toUpperCase());
    }

    public void registerSession(String sessionId, String roomCode) {
        sessionToRoom.put(sessionId, roomCode.toUpperCase());
    }

    public String getRoomCodeBySession(String sessionId) {
        return sessionToRoom.get(sessionId);
    }

    public void handleDisconnect(String sessionId) {
        String roomCode = sessionToRoom.remove(sessionId);
        if (roomCode != null) {
            Room room = rooms.get(roomCode);
            if (room != null) {
                room.removeUserBySession(sessionId);
                if (room.getUsers().isEmpty()) {
                    rooms.remove(roomCode);
                }
            }
        }
    }

    public User findUserInRoom(String roomCode, String username) {
        Room room = rooms.get(roomCode.toUpperCase());
        if (room == null) return null;
        return room.getUsers().stream()
                .filter(u -> u.getUsername().equals(username))
                .findFirst()
                .orElse(null);
    }

    public void updateUserSession(String roomCode, String username, String sessionId) {
        User user = findUserInRoom(roomCode, username);
        if (user != null) {
            user.setSessionId(sessionId);
            sessionToRoom.put(sessionId, roomCode.toUpperCase());
        }
    }

    public RoomState getRoomState(String roomCode) {
        Room room = rooms.get(roomCode.toUpperCase());
        if (room == null) return null;

        RoomState state = new RoomState();
        state.setRoomCode(room.getRoomCode());
        state.setRoomName(room.getRoomName());
        state.setHost(room.getHost());
        state.setUsers(new ArrayList<>(room.getUsers()));
        state.setQueue(new ArrayList<>(room.getQueue()));
        state.setCurrentSong(room.getCurrentSong());
        state.setPlaybackState(room.getPlaybackState());
        state.setChatHistory(new ArrayList<>(room.getChatHistory()));
        return state;
    }

    public void removeRoom(String roomCode) {
        rooms.remove(roomCode.toUpperCase());
    }

    public int getActiveRoomCount() {
        return rooms.size();
    }

    private String generateRoomCode() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(chars.charAt(random.nextInt(chars.length())));
        }
        String roomCode = code.toString();
        if (rooms.containsKey(roomCode)) {
            return generateRoomCode();
        }
        return roomCode;
    }
}
