package com.musicsync.controller;

import com.musicsync.dto.*;
import com.musicsync.model.*;
import com.musicsync.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class RoomController {

    private final RoomService roomService;
    private final MusicService musicService;

    public RoomController(RoomService roomService, MusicService musicService) {
        this.roomService = roomService;
        this.musicService = musicService;
    }

    @PostMapping("/rooms/create")
    public ResponseEntity<?> createRoom(@RequestBody CreateRoomRequest request) {
        if (request.getUsername() == null || request.getUsername().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username is required"));
        }
        if (request.getRoomName() == null || request.getRoomName().isBlank()) {
            request.setRoomName(request.getUsername() + "'s Room");
        }
        Room room = roomService.createRoom(request.getUsername().trim(), request.getRoomName().trim());
        RoomState state = roomService.getRoomState(room.getRoomCode());
        return ResponseEntity.ok(state);
    }

    @PostMapping("/rooms/join")
    public ResponseEntity<?> joinRoom(@RequestBody JoinRoomRequest request) {
        if (request.getUsername() == null || request.getUsername().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username is required"));
        }
        if (request.getRoomCode() == null || request.getRoomCode().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Room code is required"));
        }
        String code = request.getRoomCode().trim().toUpperCase();
        if (!roomService.roomExists(code)) {
            return ResponseEntity.status(404).body(Map.of("error", "Room not found. Check the code and try again."));
        }
        Room room = roomService.joinRoom(code, request.getUsername().trim());
        RoomState state = roomService.getRoomState(room.getRoomCode());
        return ResponseEntity.ok(state);
    }

    @GetMapping("/rooms/{roomCode}")
    public ResponseEntity<?> getRoomState(@PathVariable String roomCode) {
        RoomState state = roomService.getRoomState(roomCode.toUpperCase());
        if (state == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Room not found"));
        }
        return ResponseEntity.ok(state);
    }

    @GetMapping("/rooms/{roomCode}/exists")
    public ResponseEntity<?> checkRoom(@PathVariable String roomCode) {
        boolean exists = roomService.roomExists(roomCode.toUpperCase());
        return ResponseEntity.ok(Map.of("exists", exists));
    }

    @GetMapping("/music/library")
    public ResponseEntity<List<Song>> getLibrary() {
        return ResponseEntity.ok(musicService.getLibrary());
    }

    @GetMapping("/music/search")
    public ResponseEntity<List<Song>> searchSongs(@RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok(musicService.searchSongs(q));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        return ResponseEntity.ok(Map.of("activeRooms", roomService.getActiveRoomCount()));
    }
}
