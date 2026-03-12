package com.musicsync.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.musicsync.model.FriendRequest;
import com.musicsync.model.PersistentUser;
import com.musicsync.service.FriendService;
import com.musicsync.service.UserService;

@RestController
@RequestMapping("/api/friends")
public class FriendController {

    private final FriendService friendService;
    private final UserService userService;

    public FriendController(FriendService friendService, UserService userService) {
        this.friendService = friendService;
        this.userService = userService;
    }

    @PostMapping("/request")
    public ResponseEntity<?> sendFriendRequest(@RequestBody Map<String, String> payload) {
        try {
            String userId = payload.get("userId");
            String toUsername = payload.get("toUsername");

            if (userId == null || toUsername == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required fields"));
            }

            FriendRequest request = friendService.sendFriendRequest(userId, toUsername);
            return ResponseEntity.ok(request);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/request/{requestId}/accept")
    public ResponseEntity<?> acceptFriendRequest(@PathVariable String requestId, 
                                                  @RequestBody Map<String, String> payload) {
        try {
            String userId = payload.get("userId");
            if (userId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "User ID required"));
            }

            friendService.acceptFriendRequest(requestId, userId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/request/{requestId}/reject")
    public ResponseEntity<?> rejectFriendRequest(@PathVariable String requestId, 
                                                  @RequestBody Map<String, String> payload) {
        try {
            String userId = payload.get("userId");
            if (userId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "User ID required"));
            }

            friendService.rejectFriendRequest(requestId, userId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{userId}")
    public ResponseEntity<?> getFriends(@PathVariable String userId) {
        List<PersistentUser> friends = friendService.getFriends(userId);
        return ResponseEntity.ok(friends);
    }

    @GetMapping("/{userId}/requests")
    public ResponseEntity<?> getPendingRequests(@PathVariable String userId) {
        List<FriendRequest> requests = friendService.getPendingRequests(userId);
        return ResponseEntity.ok(requests);
    }

    @DeleteMapping("/{userId}/{friendId}")
    public ResponseEntity<?> removeFriend(@PathVariable String userId, @PathVariable String friendId) {
        friendService.removeFriend(userId, friendId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/search")
    public ResponseEntity<?> searchUsers(@RequestParam String q) {
        if (q == null || q.trim().length() < 2) {
            return ResponseEntity.badRequest().body(Map.of("error", "Query must be at least 2 characters"));
        }
        List<PersistentUser> users = userService.searchUsers(q.trim());
        return ResponseEntity.ok(users);
    }
}
