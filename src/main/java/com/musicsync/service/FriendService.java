package com.musicsync.service;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.musicsync.model.FriendRequest;
import com.musicsync.model.PersistentUser;

@Service
public class FriendService {

    private final Map<String, FriendRequest> friendRequests = new ConcurrentHashMap<>();
    private final UserService userService;

    public FriendService(UserService userService) {
        this.userService = userService;
    }

    public FriendRequest sendFriendRequest(String fromUserId, String toUsername) {
        PersistentUser fromUser = userService.getUserById(fromUserId);
        PersistentUser toUser = userService.getUserByUsername(toUsername);

        if (fromUser == null) {
            throw new IllegalArgumentException("Sender not found");
        }
        if (toUser == null) {
            throw new IllegalArgumentException("User '" + toUsername + "' not found");
        }
        if (fromUser.getId().equals(toUser.getId())) {
            throw new IllegalArgumentException("Cannot send friend request to yourself");
        }
        if (fromUser.getFriendIds().contains(toUser.getId())) {
            throw new IllegalArgumentException("Already friends with " + toUsername);
        }

        // Check if request already exists
        Optional<FriendRequest> existing = friendRequests.values().stream()
            .filter(r -> r.getStatus() == FriendRequest.FriendRequestStatus.PENDING)
            .filter(r -> (r.getFromUserId().equals(fromUserId) && r.getToUserId().equals(toUser.getId())) ||
                        (r.getFromUserId().equals(toUser.getId()) && r.getToUserId().equals(fromUserId)))
            .findFirst();

        if (existing.isPresent()) {
            throw new IllegalArgumentException("Friend request already pending");
        }

        String requestId = UUID.randomUUID().toString();
        FriendRequest request = new FriendRequest(
            requestId,
            fromUser.getId(),
            fromUser.getUsername(),
            toUser.getId(),
            toUser.getUsername()
        );

        friendRequests.put(requestId, request);
        return request;
    }

    public void acceptFriendRequest(String requestId, String userId) {
        FriendRequest request = friendRequests.get(requestId);
        if (request == null) {
            throw new IllegalArgumentException("Friend request not found");
        }
        if (!request.getToUserId().equals(userId)) {
            throw new IllegalArgumentException("Not authorized to accept this request");
        }
        if (request.getStatus() != FriendRequest.FriendRequestStatus.PENDING) {
            throw new IllegalArgumentException("Request already processed");
        }

        request.setStatus(FriendRequest.FriendRequestStatus.ACCEPTED);

        // Add both users as friends
        PersistentUser user1 = userService.getUserById(request.getFromUserId());
        PersistentUser user2 = userService.getUserById(request.getToUserId());
        
        if (user1 != null && user2 != null) {
            user1.addFriend(user2.getId());
            user2.addFriend(user1.getId());
        }
    }

    public void rejectFriendRequest(String requestId, String userId) {
        FriendRequest request = friendRequests.get(requestId);
        if (request == null) {
            throw new IllegalArgumentException("Friend request not found");
        }
        if (!request.getToUserId().equals(userId)) {
            throw new IllegalArgumentException("Not authorized to reject this request");
        }
        
        request.setStatus(FriendRequest.FriendRequestStatus.REJECTED);
    }

    public List<FriendRequest> getPendingRequests(String userId) {
        return friendRequests.values().stream()
            .filter(r -> r.getToUserId().equals(userId))
            .filter(r -> r.getStatus() == FriendRequest.FriendRequestStatus.PENDING)
            .sorted(Comparator.comparingLong(FriendRequest::getTimestamp).reversed())
            .collect(Collectors.toList());
    }

    public List<PersistentUser> getFriends(String userId) {
        PersistentUser user = userService.getUserById(userId);
        if (user == null) {
            return Collections.emptyList();
        }

        return user.getFriendIds().stream()
            .map(userService::getUserById)
            .filter(Objects::nonNull)
            .sorted(Comparator.comparing(PersistentUser::getUsername))
            .collect(Collectors.toList());
    }

    public void removeFriend(String userId, String friendId) {
        PersistentUser user = userService.getUserById(userId);
        PersistentUser friend = userService.getUserById(friendId);

        if (user != null && friend != null) {
            user.removeFriend(friendId);
            friend.removeFriend(userId);
        }
    }
}
