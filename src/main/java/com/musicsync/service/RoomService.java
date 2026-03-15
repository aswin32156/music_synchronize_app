package com.musicsync.service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.musicsync.dto.RoomState;
import com.musicsync.model.PersistentUser;
import com.musicsync.model.PlaybackState;
import com.musicsync.model.Room;
import com.musicsync.model.User;

@Service
public class RoomService {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToRoom = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToUserId = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final UserService userService;

    private static final String[] AVATAR_COLORS = {
        "#1DB954", "#1ED760", "#E91E63", "#9C27B0", "#673AB7",
        "#3F51B5", "#2196F3", "#00BCD4", "#009688", "#FF9800",
        "#FF5722", "#795548", "#607D8B", "#F44336", "#4CAF50"
    };

    public RoomService(UserService userService) {
        this.userService = userService;
    }

    public Room createRoom(String username, String roomName, String password) {
        String roomCode = generateRoomCode();
        
        // Get or create persistent user
        PersistentUser persistentUser = userService.getOrCreateUser(username);
        
        User host = new User(persistentUser.getId(), username, persistentUser.getAvatarColor(), true, null);
        Room room = new Room(roomCode, roomName, password, host);
        room.addUser(host);

        rooms.put(roomCode, room);
        userService.setUserOnlineStatus(persistentUser.getId(), true, roomCode);
        return room;
    }

    public Room joinRoom(String roomCode, String username, String password) {
        Room room = rooms.get(roomCode.toUpperCase());
        if (room == null) {
            return null;
        }
        // Validate password
        if (room.getPassword() != null && !room.getPassword().isEmpty()) {
            if (password == null || !password.equals(room.getPassword())) {
                throw new IllegalArgumentException("Incorrect password");
            }
        }
        
        // Get or create persistent user
        PersistentUser persistentUser = userService.getOrCreateUser(username);

        // Allow reconnect for existing members, but block new joins when room is full
        if (room.isFull() && !room.hasUser(persistentUser.getId())) {
            throw new IllegalArgumentException("Room is full. Maximum 6 members allowed.");
        }
        
        User user = new User(persistentUser.getId(), username, persistentUser.getAvatarColor(), false, null);
        room.addUser(user);
        userService.setUserOnlineStatus(persistentUser.getId(), true, roomCode);
        return room;
    }

    public Room getRoom(String roomCode) {
        return rooms.get(roomCode.toUpperCase());
    }

    public boolean roomExists(String roomCode) {
        return rooms.containsKey(roomCode.toUpperCase());
    }

    public String getRoomCodeBySession(String sessionId) {
        return sessionToRoom.get(sessionId);
    }

    public void handleDisconnect(String sessionId) {
        String roomCode = sessionToRoom.remove(sessionId);
        String userId = sessionToUserId.remove(sessionId);
        
        if (roomCode != null) {
            Room room = rooms.get(roomCode);
            if (room != null) {
                room.removeUserBySession(sessionId);
                
                // Set user offline if not in any other room
                if (userId != null) {
                    userService.setUserOnlineStatus(userId, false, null);
                }
                
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

    public User findUserBySession(String roomCode, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return null;

        Room room = rooms.get(roomCode.toUpperCase());
        if (room == null) return null;

        return room.getUsers().stream()
                .filter(u -> sessionId.equals(u.getSessionId()))
                .findFirst()
                .orElse(null);
    }

    public void updateUserSession(String roomCode, String username, String sessionId) {
        User user = findUserInRoom(roomCode, username);
        if (user != null) {
            user.setSessionId(sessionId);
            sessionToRoom.put(sessionId, roomCode.toUpperCase());
            sessionToUserId.put(sessionId, user.getId());
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

        // Send estimated current time so clients don't reset playback
        PlaybackState ps = room.getPlaybackState();
        PlaybackState psCopy = new PlaybackState();
        psCopy.setPlaying(ps.isPlaying());
        psCopy.setCurrentTime(ps.getEstimatedCurrentTime());
        psCopy.setLastUpdated(ps.getLastUpdated());
        psCopy.setCurrentSongIndex(ps.getCurrentSongIndex());
        state.setPlaybackState(psCopy);

        state.setChatHistory(new ArrayList<>(room.getChatHistory()));
        return state;
    }

    public void removeRoom(String roomCode) {
        rooms.remove(roomCode.toUpperCase());
    }

    public int getActiveRoomCount() {
        return rooms.size();
    }

    public List<Room> getAllRoomsSnapshot() {
        return new ArrayList<>(rooms.values());
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
