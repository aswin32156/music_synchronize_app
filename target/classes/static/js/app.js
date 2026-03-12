// ===== MusicSync Application =====

// State
let stompClient = null;
let currentUser = null;
let currentRoom = null;
let isHost = false;
let isPlaying = false;
let currentSongIndex = -1;
let progressInterval = null;
let currentTime = 0;
let duration = 0;
let library = [];

// ===== Screen Management =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    setTimeout(() => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.style.display = 'flex';
            requestAnimationFrame(() => screen.classList.add('active'));
        }
    }, 50);
}

// Splash Screen
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        showScreen('home-screen');
        fetchStats();
    }, 2500);
});

// ===== API Calls =====
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('active-rooms-count').textContent = data.activeRooms || 0;
    } catch (e) {
        console.error('Failed to fetch stats:', e);
    }
}

async function createRoom() {
    const username = document.getElementById('create-username').value.trim();
    const roomName = document.getElementById('create-room-name').value.trim();
    const errorEl = document.getElementById('create-error');
    errorEl.classList.add('hidden');

    if (!username) {
        showFormError('create-error', 'Please enter your name');
        return;
    }

    const btn = document.getElementById('btn-create-room');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    try {
        const res = await fetch('/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, roomName: roomName || undefined })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to create room');
        }

        const roomState = await res.json();
        currentUser = username;
        currentRoom = roomState;
        isHost = true;

        enterRoom(roomState);
        showToast('Room created! Share the code with friends.', 'success');
    } catch (e) {
        showFormError('create-error', e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rocket"></i> Create Room';
    }
}

async function joinRoom() {
    const username = document.getElementById('join-username').value.trim();
    const roomCode = document.getElementById('join-room-code').value.trim().toUpperCase();
    const errorEl = document.getElementById('join-error');
    errorEl.classList.add('hidden');

    if (!username) {
        showFormError('join-error', 'Please enter your name');
        return;
    }
    if (!roomCode || roomCode.length < 4) {
        showFormError('join-error', 'Please enter a valid room code');
        return;
    }

    const btn = document.getElementById('btn-join-room');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Joining...';

    try {
        const res = await fetch('/api/rooms/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, roomCode })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to join room');
        }

        const roomState = await res.json();
        currentUser = username;
        currentRoom = roomState;
        isHost = false;

        enterRoom(roomState);
        showToast('Joined the room!', 'success');
    } catch (e) {
        showFormError('join-error', e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-headphones"></i> Join Room';
    }
}

// ===== Room Logic =====
function enterRoom(roomState) {
    showScreen('room-screen');
    updateRoomUI(roomState);
    connectWebSocket(roomState.roomCode);
    loadLibrary();

    // Show/hide host controls
    const hostIndicator = document.getElementById('host-indicator');
    if (isHost) {
        hostIndicator.classList.add('hidden');
    } else {
        hostIndicator.classList.remove('hidden');
    }
}

function updateRoomUI(state) {
    currentRoom = state;

    // Room info
    document.getElementById('room-name-display').textContent = state.roomName || 'Music Room';
    document.getElementById('room-code-display').textContent = state.roomCode;

    // Users
    updateUsersList(state.users);

    // Queue
    updateQueue(state.queue, state.playbackState);

    // Playback
    if (state.currentSong) {
        updateNowPlaying(state.currentSong, state.playbackState);
    }

    // Check host status
    if (state.host && state.host.username === currentUser) {
        isHost = true;
        document.getElementById('host-indicator').classList.add('hidden');
    }
}

function updateUsersList(users) {
    const list = document.getElementById('users-list');
    document.getElementById('user-count').textContent = users.length;

    list.innerHTML = users.map(user => `
        <div class="user-item">
            <div class="user-avatar" style="background: ${escapeAttr(user.avatarColor)}">
                ${escapeHtml(user.username.charAt(0).toUpperCase())}
                <div class="online-dot"></div>
            </div>
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.username)}${user.username === currentUser ? ' (You)' : ''}</div>
                <div class="user-role">${user.host ? '👑 Host' : 'Listener'}</div>
            </div>
            ${user.host ? '<i class="fas fa-crown host-badge"></i>' : ''}
        </div>
    `).join('');
}

function updateNowPlaying(song, playbackState) {
    if (!song || !song.title) {
        document.getElementById('song-title').textContent = 'No Song Playing';
        document.getElementById('song-artist').textContent = 'Add songs to the queue to start listening';
        document.getElementById('song-album').textContent = '';
        document.getElementById('album-cover-img').src = '';
        document.getElementById('no-song-placeholder').classList.remove('hidden');
        document.getElementById('now-playing-bg').style.backgroundImage = '';
        document.getElementById('sound-waves').classList.remove('active');
        stopProgressTimer();
        return;
    }

    document.getElementById('no-song-placeholder').classList.add('hidden');
    document.getElementById('song-title').textContent = song.title;
    document.getElementById('song-artist').textContent = song.artist;
    document.getElementById('song-album').textContent = song.album || '';
    document.getElementById('album-cover-img').src = song.coverUrl || '';
    document.getElementById('now-playing-bg').style.backgroundImage = `url(${song.coverUrl})`;

    duration = song.durationSeconds || 0;
    document.getElementById('time-total').textContent = formatTime(duration);

    if (playbackState) {
        isPlaying = playbackState.playing;
        currentTime = playbackState.currentTime || 0;
        currentSongIndex = playbackState.currentSongIndex;
        updatePlayPauseIcon();
        updateProgress();

        if (isPlaying) {
            startProgressTimer();
            document.getElementById('sound-waves').classList.add('active');
        } else {
            stopProgressTimer();
            document.getElementById('sound-waves').classList.remove('active');
        }
    }
}

function updateQueue(queue, playbackState) {
    const queueList = document.getElementById('queue-list');
    const queueEmpty = document.getElementById('queue-empty');
    const queueCount = document.getElementById('queue-count');
    const currentIdx = playbackState ? playbackState.currentSongIndex : -1;

    queueCount.textContent = queue.length;

    if (queue.length === 0) {
        queueEmpty.classList.remove('hidden');
        queueList.innerHTML = '';
        return;
    }

    queueEmpty.classList.add('hidden');
    queueList.innerHTML = queue.map((song, index) => `
        <div class="song-item ${index === currentIdx ? 'playing' : ''}"
             onclick="playSongAtIndex(${index})">
            <span class="song-item-index">
                ${index === currentIdx && isPlaying
                    ? '<i class="fas fa-volume-up" style="color: var(--accent); font-size: 12px;"></i>'
                    : index + 1}
            </span>
            <img class="song-item-cover" src="${escapeAttr(song.coverUrl)}" alt="${escapeAttr(song.title)}">
            <div class="song-item-info">
                <div class="song-item-title">${escapeHtml(song.title)}</div>
                <div class="song-item-artist">${escapeHtml(song.artist)}</div>
            </div>
            ${song.addedBy ? `<span class="song-item-added">Added by ${escapeHtml(song.addedBy)}</span>` : ''}
            <span class="song-item-duration">${formatTime(song.durationSeconds)}</span>
        </div>
    `).join('');
}

// ===== Library =====
async function loadLibrary() {
    try {
        const res = await fetch('/api/music/library');
        library = await res.json();
        renderLibrary(library);
    } catch (e) {
        console.error('Failed to load library:', e);
    }
}

function renderLibrary(songs) {
    const list = document.getElementById('library-list');
    list.innerHTML = songs.map(song => `
        <div class="song-item">
            <img class="song-item-cover" src="${escapeAttr(song.coverUrl)}" alt="${escapeAttr(song.title)}">
            <div class="song-item-info">
                <div class="song-item-title">${escapeHtml(song.title)}</div>
                <div class="song-item-artist">${escapeHtml(song.artist)} · ${escapeHtml(song.album)}</div>
            </div>
            <span class="song-item-duration">${formatTime(song.durationSeconds)}</span>
            <button class="song-item-action" onclick="event.stopPropagation(); addToQueue('${escapeAttr(song.id)}')" title="Add to queue">
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `).join('');
}

function searchLibrary(query) {
    if (!query) {
        renderLibrary(library);
        return;
    }
    const lower = query.toLowerCase();
    const filtered = library.filter(s =>
        s.title.toLowerCase().includes(lower) ||
        s.artist.toLowerCase().includes(lower) ||
        s.album.toLowerCase().includes(lower)
    );
    renderLibrary(filtered);
}

function addToQueue(songId) {
    if (!stompClient || !stompClient.connected) {
        showToast('Not connected to server', 'error');
        return;
    }
    stompClient.send('/app/room.queue.add', {}, JSON.stringify({
        roomCode: currentRoom.roomCode,
        songId: songId,
        username: currentUser
    }));
    showToast('Song added to queue!', 'success');
}

// ===== Playback Controls =====
function togglePlayPause() {
    if (!isHost) {
        showToast('Only the host can control playback', 'info');
        return;
    }
    if (!currentRoom || !currentRoom.queue || currentRoom.queue.length === 0) {
        showToast('Add songs to the queue first', 'info');
        return;
    }

    const action = isPlaying ? 'pause' : 'play';
    sendPlaybackCommand(action, currentTime);
}

function nextSong() {
    if (!isHost) {
        showToast('Only the host can control playback', 'info');
        return;
    }
    sendPlaybackCommand('next', 0);
}

function previousSong() {
    if (!isHost) {
        showToast('Only the host can control playback', 'info');
        return;
    }
    if (currentTime > 3) {
        sendPlaybackCommand('seek', 0);
    } else {
        sendPlaybackCommand('previous', 0);
    }
}

function playSongAtIndex(index) {
    if (!isHost) {
        showToast('Only the host can control playback', 'info');
        return;
    }
    sendPlaybackCommand('select', index);
}

function seekTo(event) {
    if (!isHost) return;
    const bar = document.getElementById('progress-bar');
    const rect = bar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    const seekTime = pos * duration;
    sendPlaybackCommand('seek', seekTime);
}

function sendPlaybackCommand(action, time) {
    if (!stompClient || !stompClient.connected) return;
    stompClient.send('/app/room.playback', {}, JSON.stringify({
        roomCode: currentRoom.roomCode,
        action: action,
        currentTime: time
    }));
}

// ===== Progress Timer =====
function startProgressTimer() {
    stopProgressTimer();
    progressInterval = setInterval(() => {
        if (isPlaying && duration > 0) {
            currentTime += 0.25;
            if (currentTime >= duration) {
                currentTime = duration;
                if (isHost) {
                    nextSong();
                }
            }
            updateProgress();
        }
    }, 250);
}

function stopProgressTimer() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function updateProgress() {
    const fill = document.getElementById('progress-fill');
    const thumb = document.getElementById('progress-thumb');
    const timeCurrent = document.getElementById('time-current');

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    fill.style.width = pct + '%';
    timeCurrent.textContent = formatTime(Math.floor(currentTime));
}

function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
}

// ===== WebSocket =====
function connectWebSocket(roomCode) {
    const statusEl = document.getElementById('connection-status');
    statusEl.className = 'connection-status show';
    statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connecting...</span>';

    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null; // disable debug logs

    stompClient.connect({}, function(frame) {
        statusEl.className = 'connection-status show connected';
        statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connected</span>';
        setTimeout(() => statusEl.classList.remove('show'), 2000);

        // Subscribe to room state updates
        stompClient.subscribe('/topic/room/' + roomCode + '/state', function(msg) {
            const state = JSON.parse(msg.body);
            updateRoomUI(state);
        });

        // Subscribe to playback updates
        stompClient.subscribe('/topic/room/' + roomCode + '/playback', function(msg) {
            const data = JSON.parse(msg.body);
            handlePlaybackUpdate(data);
        });

        // Subscribe to chat
        stompClient.subscribe('/topic/room/' + roomCode + '/chat', function(msg) {
            const chatMsg = JSON.parse(msg.body);
            appendChatMessage(chatMsg);
        });

        // Subscribe to personal sync responses
        stompClient.subscribe('/user/queue/sync', function(msg) {
            const state = JSON.parse(msg.body);
            updateRoomUI(state);
        });

        // Register in the room
        stompClient.send('/app/room.register', {}, JSON.stringify({
            roomCode: roomCode,
            username: currentUser
        }));

    }, function(error) {
        statusEl.className = 'connection-status show disconnected';
        statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Disconnected - Reconnecting...</span>';
        console.error('WebSocket error:', error);

        setTimeout(() => connectWebSocket(roomCode), 3000);
    });
}

function handlePlaybackUpdate(data) {
    const ps = data.playbackState;
    const song = data.currentSong;

    if (ps) {
        isPlaying = ps.playing;
        currentTime = ps.currentTime || 0;
        currentSongIndex = ps.currentSongIndex;
        updatePlayPauseIcon();
        updateProgress();

        if (isPlaying) {
            startProgressTimer();
            document.getElementById('sound-waves').classList.add('active');
        } else {
            stopProgressTimer();
            document.getElementById('sound-waves').classList.remove('active');
        }
    }

    if (song && song.title) {
        document.getElementById('no-song-placeholder').classList.add('hidden');
        document.getElementById('song-title').textContent = song.title;
        document.getElementById('song-artist').textContent = song.artist;
        document.getElementById('song-album').textContent = song.album || '';
        document.getElementById('album-cover-img').src = song.coverUrl || '';
        document.getElementById('now-playing-bg').style.backgroundImage = `url(${song.coverUrl})`;
        duration = song.durationSeconds || 0;
        document.getElementById('time-total').textContent = formatTime(duration);
    }

    // Update queue highlighting
    if (currentRoom && currentRoom.queue) {
        updateQueue(currentRoom.queue, ps || { currentSongIndex: currentSongIndex });
    }
}

// ===== Chat =====
function sendChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    if (!stompClient || !stompClient.connected) {
        showToast('Not connected to server', 'error');
        return;
    }

    stompClient.send('/app/room.chat', {}, JSON.stringify({
        roomCode: currentRoom.roomCode,
        username: currentUser,
        message: message
    }));

    input.value = '';
}

function handleChatKeypress(e) {
    if (e.key === 'Enter') {
        sendChat();
    }
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');

    if (msg.type === 'system') {
        container.innerHTML += `
            <div class="chat-msg system">
                <div class="chat-msg-content">
                    <div class="chat-msg-text">${escapeHtml(msg.message)}</div>
                </div>
            </div>
        `;
    } else {
        const initial = msg.username ? msg.username.charAt(0).toUpperCase() : '?';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        container.innerHTML += `
            <div class="chat-msg">
                <div class="chat-msg-avatar" style="background: ${escapeAttr(msg.avatarColor || '#1DB954')}">${escapeHtml(initial)}</div>
                <div class="chat-msg-content">
                    <div class="chat-msg-header">
                        <span class="chat-msg-name">${escapeHtml(msg.username)}</span>
                        <span class="chat-msg-time">${escapeHtml(time)}</span>
                    </div>
                    <div class="chat-msg-text">${escapeHtml(msg.message)}</div>
                </div>
            </div>
        `;
    }

    container.scrollTop = container.scrollHeight;
}

// ===== UI Helpers =====
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));

    document.getElementById('tab-' + tabName).classList.add('active');
    document.getElementById(tabName + '-panel').classList.add('active');
}

function copyRoomCode() {
    const code = currentRoom?.roomCode;
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
        const tooltip = document.querySelector('.copy-tooltip');
        tooltip.classList.add('show');
        setTimeout(() => tooltip.classList.remove('show'), 1500);
    }).catch(() => {
        showToast('Room code: ' + code, 'info');
    });
}

function leaveRoom() {
    if (stompClient) {
        stompClient.disconnect();
        stompClient = null;
    }
    currentRoom = null;
    currentUser = null;
    isHost = false;
    isPlaying = false;
    stopProgressTimer();

    showScreen('home-screen');
    fetchStats();
    showToast('Left the room', 'info');
}

function showFormError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.remove('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span class="toast-message">${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

function formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Enter key handlers for forms
document.addEventListener('DOMContentLoaded', () => {
    const createUsername = document.getElementById('create-username');
    const createRoomName = document.getElementById('create-room-name');
    const joinUsername = document.getElementById('join-username');
    const joinRoomCode = document.getElementById('join-room-code');

    if (createUsername) createUsername.addEventListener('keypress', e => { if (e.key === 'Enter') createRoom(); });
    if (createRoomName) createRoomName.addEventListener('keypress', e => { if (e.key === 'Enter') createRoom(); });
    if (joinUsername) joinUsername.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('join-room-code').focus(); });
    if (joinRoomCode) joinRoomCode.addEventListener('keypress', e => { if (e.key === 'Enter') joinRoom(); });
});
