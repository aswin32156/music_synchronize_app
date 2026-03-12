// ===== MusicSync Application =====

// ===== EXPOSE FUNCTIONS TO GLOBAL SCOPE FIRST (for inline onclick handlers) =====
window.showScreen = function(screenId) {
    console.log('showScreen called with:', screenId);
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    setTimeout(() => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            console.log('Screen activated:', screenId);
        } else {
            console.error('Screen not found:', screenId);
        }
    }, 50);
};

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
let currentLyrics = null;
let currentSongId = null;


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

// Splash Screen - DISABLED, go directly to home
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    fetchStats();
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
    console.log('createRoom function called');
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
        currentSongId = null;
        currentLyrics = null;
        document.getElementById('lyrics-container').innerHTML = '<div class="lyrics-empty"><i class="fas fa-music"></i><p>Lyrics will appear here when a song is playing</p></div>';
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

    // Load lyrics if song changed
    if (song.id !== currentSongId) {
        currentSongId = song.id;
        loadLyrics(song.id);
    }

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
    
    // Sync lyrics with playback
    syncLyrics();
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

    console.log('Attempting WebSocket connection to room:', roomCode);
    console.log('Current location:', window.location.href);
    
    try {
        const socket = new SockJS('/ws');
        stompClient = Stomp.over(socket);
        
        // Enable debug for troubleshooting
        stompClient.debug = function(str) {
            console.log('STOMP:', str);
        };

        stompClient.connect({}, function(frame) {
            console.log('WebSocket connected successfully!', frame);
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
            console.error('WebSocket connection failed:', error);
            console.error('Error details:', JSON.stringify(error));
            statusEl.className = 'connection-status show disconnected';
            statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Not connected to server</span>';
            
            // Try to reconnect after delay
            console.log('Will attempt to reconnect in 5 seconds...');
            setTimeout(() => {
                console.log('Reconnecting WebSocket...');
                connectWebSocket(roomCode);
            }, 5000);
        });
        
        // Handle socket errors
        socket.onclose = function(event) {
            console.log('SockJS connection closed:', event);
        };
        
    } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        statusEl.className = 'connection-status show disconnected';
        statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connection error</span>';
    }
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

// ===== Lyrics System =====
async function loadLyrics(songId) {
    const container = document.getElementById('lyrics-container');
    currentLyrics = null;
    
    // Show loading
    container.innerHTML = '<div class="lyrics-loading"><i class="fas fa-spinner fa-spin"></i> Loading lyrics...</div>';
    
    try {
        const res = await fetch(`/api/lyrics/${encodeURIComponent(songId)}`);
        
        if (!res.ok) {
            throw new Error('Lyrics not found');
        }
        
        const lyrics = await res.json();
        currentLyrics = lyrics;
        
        displayLyrics(lyrics);
    } catch (e) {
        // No lyrics found
        container.innerHTML = `
            <div class="lyrics-not-found">
                <i class="fas fa-search"></i>
                <p>Lyrics not available for this song</p>
            </div>
        `;
    }
}

function displayLyrics(lyrics) {
    const container = document.getElementById('lyrics-container');
    
    if (!lyrics) {
        container.innerHTML = '<div class="lyrics-empty"><i class="fas fa-music"></i><p>Lyrics will appear here when a song is playing</p></div>';
        return;
    }
    
    // If we have synced lyrics (LRC format with timestamps)
    if (lyrics.lines && lyrics.lines.length > 0) {
        container.innerHTML = lyrics.lines.map((line, idx) => 
            `<div class="lyric-line" data-time="${line.time}" data-index="${idx}">${escapeHtml(line.text)}</div>`
        ).join('');
    } 
    // Otherwise display plain lyrics
    else if (lyrics.plainLyrics) {
        container.innerHTML = `<div class="lyrics-plain">${escapeHtml(lyrics.plainLyrics)}</div>`;
    } 
    else {
        container.innerHTML = '<div class="lyrics-not-found"><i class="fas fa-search"></i><p>Lyrics not available</p></div>';
    }
}

function syncLyrics() {
    if (!currentLyrics || !currentLyrics.lines || currentLyrics.lines.length === 0) {
        return;
    }
    
    const lines = document.querySelectorAll('.lyric-line');
    if (lines.length === 0) return;
    
    let activeIndex = -1;
    
    // Find the current active line based on currentTime
    for (let i = currentLyrics.lines.length - 1; i >= 0; i--) {
        if (currentTime >= currentLyrics.lines[i].time) {
            activeIndex = i;
            break;
        }
    }
    
    // Update classes
    lines.forEach((line, idx) => {
        line.classList.remove('active', 'past');
        if (idx === activeIndex) {
            line.classList.add('active');
            // Auto-scroll to active line
            line.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (idx < activeIndex) {
            line.classList.add('past');
        }
    });
}

// ===== Expose functions to global scope for onclick handlers =====
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.togglePlayPause = togglePlayPause;
window.nextSong = nextSong;
window.previousSong = previousSong;
window.playSongAtIndex = playSongAtIndex;
window.seekTo = seekTo;
window.sendChat = sendChat;
window.switchTab = switchTab;
window.searchExternal = searchExternal;
window.quickSearch = quickSearch;
window.addToQueue = addToQueue;
window.copyRoomCode = copyRoomCode;
console.log('All functions exposed to window object');

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
