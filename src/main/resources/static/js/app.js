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


// Audio player
const audioPlayer = new Audio();
audioPlayer.volume = 1.0;
audioPlayer.addEventListener('ended', () => {
    if (isHost) {
        nextSong();
    }
});
audioPlayer.addEventListener('timeupdate', () => {
    currentTime = audioPlayer.currentTime;
    duration = audioPlayer.duration || 0;
    updateProgress();
});
audioPlayer.addEventListener('loadedmetadata', () => {
    duration = audioPlayer.duration || 0;
    document.getElementById('time-total').textContent = formatTime(Math.floor(duration));
});

// ===== Screen Management =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    setTimeout(() => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
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
    const password = document.getElementById('create-password').value.trim();
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
            body: JSON.stringify({ 
                username, 
                roomName: roomName || undefined,
                password: password || undefined
            })
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
    const password = document.getElementById('join-password').value.trim();
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
            body: JSON.stringify({ 
                username, 
                roomCode,
                password: password || undefined
            })
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
    checkSources();

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

    // Set current user ID (extract from users list)
    if (!currentUserId && currentUser) {
        const user = state.users.find(u => u.username === currentUser);
        if (user) {
            currentUserId = user.id;
            loadFriends();
            loadFriendRequests();
            // Auto-refresh friends every 10 seconds
            setInterval(() => {
                loadFriends();
                loadFriendRequests();
            }, 10000);
        }
    }

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

        // Load audio for the current song
        if (song && song.audioUrl && audioPlayer.getAttribute('data-song-id') !== song.id) {
            audioPlayer.setAttribute('data-song-id', song.id);
            audioPlayer.src = song.audioUrl;
            audioPlayer.load();
        }

        // Sync seek position
        if (audioPlayer.src && Math.abs(audioPlayer.currentTime - currentTime) > 2) {
            audioPlayer.currentTime = currentTime;
        }

        if (isPlaying) {
            audioPlayer.play().catch(() => {});
            startProgressTimer();
            document.getElementById('sound-waves').classList.add('active');
        } else {
            audioPlayer.pause();
            stopProgressTimer();
            document.getElementById('sound-waves').classList.remove('active');
        }

        updateProgress();
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

// ===== External Search (JioSaavn + Spotify) =====
let searchTimeout = null;

async function searchExternal() {
    const input = document.getElementById('external-search');
    const query = input.value.trim();
    if (!query) {
        showToast('Please enter a search query', 'info');
        return;
    }

    const statusEl = document.getElementById('search-status');
    const emptyEl = document.getElementById('search-empty');
    const resultsList = document.getElementById('search-results');

    statusEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    resultsList.innerHTML = '';

    try {
        const res = await fetch('/api/music/search/external?q=' + encodeURIComponent(query) + '&limit=20');
        if (!res.ok) throw new Error('Search failed');
        const songs = await res.json();

        statusEl.classList.add('hidden');

        if (songs.length === 0) {
            resultsList.innerHTML = `
                <div class="search-no-results">
                    <i class="fas fa-search" style="font-size: 2rem; color: #666; margin-bottom: 0.5rem;"></i>
                    <p>No results found for "${escapeHtml(query)}"</p>
                    <p style="font-size: 0.8rem; color: #888;">Try different keywords or check spelling</p>
                </div>`;
            return;
        }

        renderSearchResults(songs);
    } catch (e) {
        statusEl.classList.add('hidden');
        showToast('Search failed: ' + e.message, 'error');
        console.error('External search failed:', e);
    }
}

function quickSearch(query) {
    document.getElementById('external-search').value = query;
    searchExternal();
}

function renderSearchResults(songs) {
    const list = document.getElementById('search-results');
    list.innerHTML = songs.map(song => {
        const sourceIcon = song.id.startsWith('jio_')
            ? '<span class="source-tag jio">JioSaavn</span>'
            : song.id.startsWith('spotify_')
            ? '<span class="source-tag spot">Spotify</span>'
            : '';
        return `
        <div class="song-item">
            <img class="song-item-cover" src="${escapeAttr(song.coverUrl)}" alt="${escapeAttr(song.title)}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22><rect fill=%22%23333%22 width=%2250%22 height=%2250%22/><text x=%2225%22 y=%2230%22 fill=%22%23888%22 text-anchor=%22middle%22 font-size=%2220%22>♪</text></svg>'">
            <div class="song-item-info">
                <div class="song-item-title">${escapeHtml(song.title)}</div>
                <div class="song-item-artist">${escapeHtml(song.artist)} · ${escapeHtml(song.album)}</div>
            </div>
            ${sourceIcon}
            <span class="song-item-duration">${formatTime(song.durationSeconds)}</span>
            <button class="song-item-action" onclick="event.stopPropagation(); addToQueue('${escapeAttr(song.id)}')" title="Add to queue">
                <i class="fas fa-plus"></i>
            </button>
        </div>`;
    }).join('');
}

async function checkSources() {
    try {
        const res = await fetch('/api/music/sources');
        const data = await res.json();
        if (data.spotifyConfigured) {
            const badge = document.getElementById('spotify-badge');
            if (badge) badge.classList.remove('hidden');
        }
    } catch (e) {
        console.log('Could not check sources:', e);
    }
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
    sendPlaybackCommand(action, audioPlayer.currentTime || currentTime);
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
    if (audioPlayer.currentTime > 3) {
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
    const seekTime = pos * (audioPlayer.duration || duration);
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
    // Audio timeupdate event handles progress now, but keep a backup timer for UI sync
    progressInterval = setInterval(() => {
        if (isPlaying) {
            updateProgress();
        }
    }, 500);
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

    const audioDur = audioPlayer.duration || duration;
    const audioTime = audioPlayer.currentTime || currentTime;
    const pct = audioDur > 0 ? (audioTime / audioDur) * 100 : 0;
    fill.style.width = pct + '%';
    timeCurrent.textContent = formatTime(Math.floor(audioTime));
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

    if (song && song.title) {
        document.getElementById('no-song-placeholder').classList.add('hidden');
        document.getElementById('song-title').textContent = song.title;
        document.getElementById('song-artist').textContent = song.artist;
        document.getElementById('song-album').textContent = song.album || '';
        document.getElementById('album-cover-img').src = song.coverUrl || '';
        document.getElementById('now-playing-bg').style.backgroundImage = `url(${song.coverUrl})`;
        duration = song.durationSeconds || 0;
        document.getElementById('time-total').textContent = formatTime(duration);

        // Load new audio if song changed
        if (song.audioUrl && audioPlayer.getAttribute('data-song-id') !== song.id) {
            audioPlayer.setAttribute('data-song-id', song.id);
            audioPlayer.src = song.audioUrl;
            audioPlayer.load();
        }
    }

    if (ps) {
        isPlaying = ps.playing;
        currentTime = ps.currentTime || 0;
        currentSongIndex = ps.currentSongIndex;
        updatePlayPauseIcon();

        // Sync audio playback
        if (Math.abs(audioPlayer.currentTime - currentTime) > 2) {
            audioPlayer.currentTime = currentTime;
        }

        if (isPlaying) {
            audioPlayer.play().catch(() => {});
            startProgressTimer();
            document.getElementById('sound-waves').classList.add('active');
        } else {
            audioPlayer.pause();
            stopProgressTimer();
            document.getElementById('sound-waves').classList.remove('active');
        }

        updateProgress();
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
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.removeAttribute('data-song-id');
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

// ===== Friends System =====
let currentUserId = null;
let friendsListData = [];
let searchTimeout = null;

function toggleFriendsPanel() {
    const panel = document.getElementById('friends-panel');
    const icon = document.getElementById('friends-expand-icon');
    panel.classList.toggle('hidden');
    icon.classList.toggle('rotate-180');
}

async function loadFriends() {
    if (!currentUserId) return;
    
    try {
        const res = await fetch(`/api/friends/${currentUserId}`);
        friendsListData = await res.json();
        renderFriendsList();
        document.getElementById('friend-count').textContent = friendsListData.length;
    } catch (e) {
        console.error('Failed to load friends:', e);
    }
}

async function loadFriendRequests() {
    if (!currentUserId) return;
    
    try {
        const res = await fetch(`/api/friends/${currentUserId}/requests`);
        const requests = await res.json();
        
        if (requests.length > 0) {
            document.getElementById('friend-requests-section').classList.remove('hidden');
            document.getElementById('request-count').textContent = requests.length;
            renderFriendRequests(requests);
        } else {
            document.getElementById('friend-requests-section').classList.add('hidden');
        }
    } catch (e) {
        console.error('Failed to load friend requests:', e);
    }
}

function renderFriendsList() {
    const list = document.getElementById('friends-list');
    
    if (friendsListData.length === 0) {
        list.innerHTML = '<div class="empty-friends"><p>No friends yet. Search above to add friends!</p></div>';
        return;
    }
    
    list.innerHTML = friendsListData.map(friend => `
        <div class="friend-item">
            <div class="user-avatar" style="background: ${escapeAttr(friend.avatarColor)}">
                ${escapeHtml(friend.username.charAt(0).toUpperCase())}
                ${friend.online ? '<div class="online-dot"></div>' : ''}
            </div>
            <div class="friend-info">
                <div class="friend-name">${escapeHtml(friend.username)}</div>
                <div class="friend-status">
                    ${friend.online ? (friend.currentRoomCode ? `<span class="status-in-room">In room ${friend.currentRoomCode}</span>` : '<span class="status-online">Online</span>') : '<span class="status-offline">Offline</span>'}
                </div>
            </div>
            <div class="friend-actions">
                ${friend.online && friend.currentRoomCode ? `<button class="btn-icon-small" onclick="joinFriendRoom('${escapeAttr(friend.currentRoomCode)}')" title="Join their room"><i class="fas fa-sign-in-alt"></i></button>` : ''}
                <button class="btn-icon-small danger" onclick="removeFriend('${escapeAttr(friend.id)}')" title="Remove friend"><i class="fas fa-user-times"></i></button>
            </div>
        </div>
    `).join('');
}

function renderFriendRequests(requests) {
    const list = document.getElementById('friend-requests-list');
    list.innerHTML = requests.map(req => `
        <div class="friend-request-item">
            <div class="request-info">
                <strong>${escapeHtml(req.fromUsername)}</strong> wants to be friends
            </div>
            <div class="request-actions">
                <button class="btn-sm btn-primary" onclick="acceptFriendRequest('${escapeAttr(req.id)}')">Accept</button>
                <button class="btn-sm" onclick="rejectFriendRequest('${escapeAttr(req.id)}')">Reject</button>
            </div>
        </div>
    `).join('');
}

async function searchFriends(query) {
    const resultsDiv = document.getElementById('friend-search-results');
    
    clearTimeout(searchTimeout);
    
    if (!query || query.trim().length < 2) {
        resultsDiv.innerHTML = '';
        resultsDiv.classList.remove('active');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`);
            const users = await res.json();
            
            if (users.length === 0) {
                resultsDiv.innerHTML = '<div class="search-result-empty">No users found</div>';
            } else {
                resultsDiv.innerHTML = users
                    .filter(u => u.id !== currentUserId)
                    .filter(u => !friendsListData.some(f => f.id === u.id))
                    .map(user => `
                        <div class="search-result-item" onclick="sendFriendRequest('${escapeAttr(user.username)}')">
                            <div class="user-avatar" style="background: ${escapeAttr(user.avatarColor)}">
                                ${escapeHtml(user.username.charAt(0).toUpperCase())}
                            </div>
                            <div class="result-name">${escapeHtml(user.username)}</div>
                            <i class="fas fa-user-plus"></i>
                        </div>
                    `).join('');
            }
            
            resultsDiv.classList.add('active');
        } catch (e) {
            console.error('Search failed:', e);
            resultsDiv.innerHTML = '<div class="search-result-empty">Search failed</div>';
        }
    }, 300);
}

async function sendFriendRequest(toUsername) {
    if (!currentUserId) return;
    
    try {
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, toUsername })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to send request');
        }
        
        showToast(`Friend request sent to ${toUsername}`, 'success');
        document.getElementById('friend-search-input').value = '';
        document.getElementById('friend-search-results').innerHTML = '';
        document.getElementById('friend-search-results').classList.remove('active');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function acceptFriendRequest(requestId) {
    try {
        const res = await fetch(`/api/friends/request/${requestId}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId })
        });
        
        if (!res.ok) throw new Error('Failed to accept request');
        
        showToast('Friend request accepted!', 'success');
        loadFriendRequests();
        loadFriends();
    } catch (e) {
        showToast('Failed to accept request', 'error');
    }
}

async function rejectFriendRequest(requestId) {
    try {
        const res = await fetch(`/api/friends/request/${requestId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId })
        });
        
        if (!res.ok) throw new Error('Failed to reject request');
        
        showToast('Friend request rejected', 'info');
        loadFriendRequests();
    } catch (e) {
        showToast('Failed to reject request', 'error');
    }
}

async function removeFriend(friendId) {
    if (!confirm('Remove this friend?')) return;
    
    try {
        const res = await fetch(`/api/friends/${currentUserId}/${friendId}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) throw new Error('Failed to remove friend');
        
        showToast('Friend removed', 'info');
        loadFriends();
    } catch (e) {
        showToast('Failed to remove friend', 'error');
    }
}

function joinFriendRoom(roomCode) {
    if (!currentUser) return;
    showToast(`Joining room ${roomCode}...`, 'info');
    window.location.reload(); // Reload to join screen, then auto-join with code
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
