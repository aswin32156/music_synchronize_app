package com.musicsync.service;

import java.security.SecureRandom;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.musicsync.model.PersistentUser;

@Service
public class UserService {

    private final Map<String, PersistentUser> usersById = new ConcurrentHashMap<>();
    private final Map<String, PersistentUser> usersByUsername = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    private static final String[] AVATAR_COLORS = {
        "#1DB954", "#1ED760", "#E91E63", "#9C27B0", "#673AB7",
        "#3F51B5", "#2196F3", "#00BCD4", "#009688", "#FF9800",
        "#FF5722", "#795548", "#607D8B", "#F44336", "#4CAF50"
    };

    public PersistentUser createUser(String username) {
        if (usersByUsername.containsKey(username.toLowerCase())) {
            throw new IllegalArgumentException("Username already exists");
        }

        String userId = UUID.randomUUID().toString();
        String avatarColor = AVATAR_COLORS[random.nextInt(AVATAR_COLORS.length)];
        
        PersistentUser user = new PersistentUser(userId, username, avatarColor);
        usersById.put(userId, user);
        usersByUsername.put(username.toLowerCase(), user);
        
        return user;
    }

    public PersistentUser getUserById(String userId) {
        return usersById.get(userId);
    }

    public PersistentUser getUserByUsername(String username) {
        return usersByUsername.get(username.toLowerCase());
    }

    public List<PersistentUser> searchUsers(String query) {
        String lowerQuery = query.toLowerCase();
        return usersByUsername.values().stream()
            .filter(u -> u.getUsername().toLowerCase().contains(lowerQuery))
            .limit(20)
            .toList();
    }

    public void setUserOnlineStatus(String userId, boolean online, String roomCode) {
        PersistentUser user = usersById.get(userId);
        if (user != null) {
            user.setOnline(online);
            user.setCurrentRoomCode(online ? roomCode : null);
        }
    }

    public boolean userExists(String username) {
        return usersByUsername.containsKey(username.toLowerCase());
    }

    public PersistentUser getOrCreateUser(String username) {
        PersistentUser user = getUserByUsername(username);
        if (user == null) {
            user = createUser(username);
        }
        return user;
    }
}
