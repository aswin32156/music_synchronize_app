package com.musicsync.controller;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.musicsync.dto.ChatRequest;
import com.musicsync.dto.PlaybackCommand;
import com.musicsync.dto.QueueRequest;
import com.musicsync.dto.RoomState;
import com.musicsync.model.ChatMessage;
import com.musicsync.model.PlaybackState;
import com.musicsync.model.Room;
import com.musicsync.model.Song;
import com.musicsync.model.User;
import com.musicsync.service.MusicService;
import com.musicsync.service.RoomService;

@Controller
public class WebSocketController {

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomService roomService;
    private final MusicService musicService;

    public WebSocketController(SimpMessagingTemplate messagingTemplate,
                                RoomService roomService,
                                MusicService musicService) {
        this.messagingTemplate = messagingTemplate;
        this.roomService = roomService;
        this.musicService = musicService;
    }

    @MessageMapping("/room.register")
    public void registerToRoom(@Payload Map<String, String> payload,
                                SimpMessageHeaderAccessor headerAccessor) {
        String roomCode = payload.get("roomCode");
        String username = payload.get("username");
        if (roomCode == null || username == null) return;

        String sessionId = headerAccessor.getSessionId();
        roomService.updateUserSession(roomCode, username, sessionId);

        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        ChatMessage systemMsg = new ChatMessage(
            UUID.randomUUID().toString(), "System", "#1DB954",
            username + " joined the room", "system"
        );
        room.addChatMessage(systemMsg);

        broadcastRoomState(roomCode);
        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", systemMsg);
    }

    @MessageMapping("/room.playback")
    public void handlePlayback(@Payload PlaybackCommand command,
                               SimpMessageHeaderAccessor headerAccessor) {
        String roomCode = command.getRoomCode();
        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        String action = command.getAction();
        if (action == null || action.isBlank()) return;

        String sessionId = headerAccessor.getSessionId();
        User sender = roomService.findUserBySession(roomCode, sessionId);
        if (sender == null) return;

        boolean hostOnlyAction = "next".equals(action)
                || "previous".equals(action)
                || "seek".equals(action)
                || "select".equals(action);
        if (hostOnlyAction && !sender.isHost()) {
            return;
        }

        PlaybackState state = room.getPlaybackState();

        switch (action) {
            case "play":
                state.setPlaying(true);
                state.setCurrentTime(command.getCurrentTime());
                break;
            case "pause":
                state.setPlaying(false);
                state.setCurrentTime(command.getCurrentTime());
                break;
            case "seek":
                state.setCurrentTime(command.getCurrentTime());
                break;
            case "next":
                int nextIndex = state.getCurrentSongIndex() + 1;
                if (nextIndex < room.getQueue().size()) {
                    state.setCurrentSongIndex(nextIndex);
                    state.setCurrentTime(0);
                    state.setPlaying(true);
                } else {
                    state.setPlaying(false);
                    state.setCurrentTime(0);
                }
                break;
            case "previous":
                int prevIndex = state.getCurrentSongIndex() - 1;
                if (prevIndex >= 0) {
                    state.setCurrentSongIndex(prevIndex);
                    state.setCurrentTime(0);
                    state.setPlaying(true);
                }
                break;
            case "select":
                int selectIndex = (int) command.getCurrentTime();
                if (selectIndex >= 0 && selectIndex < room.getQueue().size()) {
                    state.setCurrentSongIndex(selectIndex);
                    state.setCurrentTime(0);
                    state.setPlaying(true);
                }
                break;
            default:
                break;
        }

        broadcastPlaybackState(roomCode);
    }

    @MessageMapping("/room.queue.add")
    public void addToQueue(@Payload QueueRequest request) {
        String roomCode = request.getRoomCode();
        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        Song song = musicService.getSongById(request.getSongId());
        if (song == null) return;

        Song queuedSong = new Song(
            song.getId(), song.getTitle(), song.getArtist(), song.getAlbum(),
            song.getCoverUrl(), song.getDurationSeconds(), song.getAudioUrl()
        );
        queuedSong.setAddedBy(request.getUsername());
        room.addSongToQueue(queuedSong);

        // Auto-play if this is the first song in the queue
        if (room.getQueue().size() == 1) {
            PlaybackState state = room.getPlaybackState();
            state.setCurrentSongIndex(0);
            state.setCurrentTime(0);
            state.setPlaying(true);
        }

        ChatMessage systemMsg = new ChatMessage(
            UUID.randomUUID().toString(), "System", "#1DB954",
            request.getUsername() + " added \"" + song.getTitle() + "\" to the queue", "system"
        );
        room.addChatMessage(systemMsg);

        // broadcastRoomState first so client loads the song, then playback state triggers play
        broadcastRoomState(roomCode);
        broadcastPlaybackState(roomCode);
        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", systemMsg);
    }

    @MessageMapping("/room.queue.remove")
    public void removeFromQueue(@Payload QueueRequest request,
                                SimpMessageHeaderAccessor headerAccessor) {
        String roomCode = request.getRoomCode();
        if (roomCode == null || roomCode.isBlank()) return;

        String songId = request.getSongId();
        if (songId == null || songId.isBlank()) return;

        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        String sessionId = headerAccessor.getSessionId();
        User sender = roomService.findUserBySession(roomCode, sessionId);
        User host = room.getHost();
        if (sender == null || host == null || !host.getId().equals(sender.getId())) {
            return;
        }

        int removedIndex = -1;
        List<Song> q = room.getQueue();
        for (int i = 0; i < q.size(); i++) {
            if (q.get(i).getId().equals(songId)) {
                removedIndex = i;
                break;
            }
        }

        room.removeSongFromQueue(songId);

        // Adjust currentSongIndex if needed
        if (removedIndex >= 0) {
            PlaybackState state = room.getPlaybackState();
            int currentIdx = state.getCurrentSongIndex();
            if (removedIndex < currentIdx) {
                state.setCurrentSongIndex(currentIdx - 1);
            } else if (removedIndex == currentIdx) {
                // Current song removed - stop or play next
                if (currentIdx >= room.getQueue().size()) {
                    state.setCurrentSongIndex(Math.max(0, room.getQueue().size() - 1));
                }
                if (room.getQueue().isEmpty()) {
                    state.setPlaying(false);
                    state.setCurrentTime(0);
                    state.setCurrentSongIndex(0);
                } else {
                    state.setCurrentTime(0);
                    state.setPlaying(true);
                }
            }
        }

        broadcastRoomState(roomCode);
        broadcastPlaybackState(roomCode);
    }

    @MessageMapping("/room.queue.reorder")
    public void reorderQueue(@Payload Map<String, Object> payload) {
        String roomCode = (String) payload.get("roomCode");
        int fromIndex = ((Number) payload.get("fromIndex")).intValue();
        int toIndex = ((Number) payload.get("toIndex")).intValue();

        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        // Adjust currentSongIndex to follow the currently playing song
        PlaybackState state = room.getPlaybackState();
        int currentIdx = state.getCurrentSongIndex();

        room.reorderQueue(fromIndex, toIndex);

        if (currentIdx == fromIndex) {
            state.setCurrentSongIndex(toIndex);
        } else if (fromIndex < currentIdx && toIndex >= currentIdx) {
            state.setCurrentSongIndex(currentIdx - 1);
        } else if (fromIndex > currentIdx && toIndex <= currentIdx) {
            state.setCurrentSongIndex(currentIdx + 1);
        }

        broadcastRoomState(roomCode);
        broadcastPlaybackState(roomCode);
    }

    @MessageMapping("/room.chat")
    public void handleChat(@Payload ChatRequest request) {
        String roomCode = request.getRoomCode();
        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        String message = request.getMessage();
        if (message == null || message.isBlank()) return;
        if (message.length() > 500) {
            message = message.substring(0, 500);
        }

        User user = roomService.findUserInRoom(roomCode, request.getUsername());
        String avatarColor = user != null ? user.getAvatarColor() : "#1DB954";

        ChatMessage chatMsg = new ChatMessage(
            UUID.randomUUID().toString(),
            request.getUsername(),
            avatarColor,
            message,
            "user"
        );
        room.addChatMessage(chatMsg);

        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", chatMsg);
    }

    @MessageMapping("/room.sync")
    public void syncRequest(@Payload Map<String, String> payload,
                             SimpMessageHeaderAccessor headerAccessor) {
        String roomCode = payload.get("roomCode");
        if (roomCode == null) return;

        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        String sessionId = headerAccessor.getSessionId();
        RoomState state = roomService.getRoomState(roomCode);
        if (state != null) {
            PlaybackState ps = state.getPlaybackState();
            ps.setCurrentTime(room.getPlaybackState().getEstimatedCurrentTime());
            messagingTemplate.convertAndSendToUser(
                sessionId, "/queue/sync", state,
                createHeaders(sessionId).getMessageHeaders()
            );
        }
    }

    private void broadcastRoomState(String roomCode) {
        RoomState state = roomService.getRoomState(roomCode);
        if (state != null) {
            messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/state", state);
        }
    }

    private void broadcastPlaybackState(String roomCode) {
        Room room = roomService.getRoom(roomCode);
        if (room == null) return;

        PlaybackState ps = room.getPlaybackState();
        PlaybackState psCopy = new PlaybackState();
        psCopy.setPlaying(ps.isPlaying());
        psCopy.setCurrentTime(ps.getEstimatedCurrentTime());
        psCopy.setLastUpdated(ps.getLastUpdated());
        psCopy.setCurrentSongIndex(ps.getCurrentSongIndex());

        Map<String, Object> playbackUpdate = Map.of(
            "playbackState", psCopy,
            "currentSong", room.getCurrentSong() != null ? room.getCurrentSong() : Map.of(),
            "queueSize", room.getQueue().size()
        );
        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/playback", playbackUpdate);
    }

    private org.springframework.messaging.simp.SimpMessageHeaderAccessor createHeaders(String sessionId) {
        org.springframework.messaging.simp.SimpMessageHeaderAccessor headerAccessor =
            org.springframework.messaging.simp.SimpMessageHeaderAccessor.create(
                org.springframework.messaging.simp.SimpMessageType.MESSAGE);
        headerAccessor.setSessionId(sessionId);
        headerAccessor.setLeaveMutable(true);
        return headerAccessor;
    }
}
