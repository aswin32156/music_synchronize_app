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
let connectionRetries = 0;
let maxRetries = 5;
let isConnecting = false;
let pendingActions = [];

function executePendingActions() {
    while (pendingActions.length > 0) {
        const action = pendingActions.shift();
        try { action(); } catch(e) { console.error('Pending action error:', e); }
    }
}

function waitForConnection(action) {
    if (stompClient && stompClient.connected) {
        action();
    } else {
        pendingActions.push(action);
        if (currentRoom && currentRoom.roomCode && !isConnecting) {
            connectWebSocket(currentRoom.roomCode);
        }
    }
}


// Audio player
const audioPlayer = new Audio();
audioPlayer.volume = 1.0;
audioPlayer.crossOrigin = "anonymous"; // Enable CORS for external audio sources
let audioUnlocked = false;

// Unlock audio playback on user gesture (needed for browsers' autoplay policy)
function unlockAudio() {
    if (audioUnlocked) return;
    audioPlayer.muted = true;
    audioPlayer.play().then(() => {
        audioPlayer.pause();
        audioPlayer.muted = false;
        audioPlayer.currentTime = 0;
        audioUnlocked = true;
        console.log('[Audio] Audio unlocked for autoplay');
    }).catch(() => {
        audioPlayer.muted = false;
        console.warn('[Audio] Could not unlock audio');
    });
}

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

// Add error handling for audio playback
audioPlayer.addEventListener('error', (e) => {
    console.error('Audio playback error:', e);
    const error = audioPlayer.error;
    let errorMsg = 'Failed to play audio';
    
    if (error) {
        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                errorMsg = 'Audio playback was aborted';
                break;
            case error.MEDIA_ERR_NETWORK:
                errorMsg = 'Network error while loading audio';
                break;
            case error.MEDIA_ERR_DECODE:
                errorMsg = 'Audio format not supported';
                break;
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMsg = 'Audio source not available';
                break;
        }
    }
    
    console.error('Audio error details:', errorMsg);
    showToast(errorMsg + '. Try skipping to next song.', 'error');
    
    // Auto-skip to next song if host
    if (isHost) {
        setTimeout(() => nextSong(), 2000);
    }
});

audioPlayer.addEventListener('loadstart', () => {
    console.log('Loading audio:', audioPlayer.src);
});

audioPlayer.addEventListener('canplay', () => {
    console.log('Audio ready to play');
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

    unlockAudio();

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

    unlockAudio();

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
    console.log('[Room] Entering room:', roomState);
    showScreen('room-screen');
    updateRoomUI(roomState);
    
    console.log('[Room] About to connect WebSocket with room code:', roomState.roomCode);
    connectWebSocket(roomState.roomCode);
    
    console.log('[Room] Checking sources...');
    checkSources();

    // Show/hide host controls
    const hostIndicator = document.getElementById('host-indicator');
    if (isHost) {
        hostIndicator.classList.add('hidden');
    } else {
        hostIndicator.classList.remove('hidden');
    }
    console.log('[Room] Room entry complete. isHost:', isHost);
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
        currentSongIndex = playbackState.currentSongIndex;
        updatePlayPauseIcon();

        // Load audio for the current song — only if song changed
        if (song && song.audioUrl && audioPlayer.getAttribute('data-song-id') !== song.id) {
            audioPlayer.setAttribute('data-song-id', song.id);
            audioPlayer.src = song.audioUrl;
            audioPlayer.load();

            isPlaying = playbackState.playing;
            currentTime = playbackState.currentTime || 0;

            // Sync seek position for new song
            if (currentTime > 0) {
                audioPlayer.currentTime = currentTime;
            }

            if (isPlaying) {
                const playPromise = audioPlayer.play();
                if (playPromise !== undefined) {
                    playPromise.catch((err) => {
                        console.error('Failed to play audio:', err);
                        setTimeout(() => {
                            audioPlayer.play().catch(() => {
                                showToast('Click anywhere to enable audio playback.', 'info');
                                document.addEventListener('click', function resumeAudio() {
                                    audioPlayer.play().catch(() => {});
                                    document.removeEventListener('click', resumeAudio);
                                }, { once: true });
                            });
                        }, 300);
                    });
                }
                startProgressTimer();
                document.getElementById('sound-waves').classList.add('active');
            } else {
                audioPlayer.pause();
                stopProgressTimer();
                document.getElementById('sound-waves').classList.remove('active');
            }
        }
        // Same song still playing — don't touch audio, just update UI state
        
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
        <div class="song-item ${index === currentIdx ? 'playing' : ''}" draggable="true"
             data-index="${index}" data-song-id="${escapeAttr(song.id)}"
             ondragstart="onQueueDragStart(event)" ondragover="onQueueDragOver(event)"
             ondrop="onQueueDrop(event)" ondragend="onQueueDragEnd(event)"
             onclick="playSongAtIndex(${index})">
            <span class="song-item-drag" title="Drag to reorder" onclick="event.stopPropagation()">
                <i class="fas fa-grip-vertical"></i>
            </span>
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
            <button class="song-item-action remove" title="Remove from queue"
                    onclick="event.stopPropagation(); removeFromQueue('${escapeAttr(song.id)}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// ===== Queue Drag & Drop =====
let dragSrcIndex = null;

function onQueueDragStart(e) {
    dragSrcIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIndex);
}

function onQueueDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.currentTarget;
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    item.classList.remove('drag-over-top', 'drag-over-bottom');
    if (e.clientY < midY) {
        item.classList.add('drag-over-top');
    } else {
        item.classList.add('drag-over-bottom');
    }
}

function onQueueDrop(e) {
    e.preventDefault();
    const toIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    if (dragSrcIndex !== null && dragSrcIndex !== toIndex) {
        reorderQueue(dragSrcIndex, toIndex);
    }
    dragSrcIndex = null;
}

function onQueueDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.song-item').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    dragSrcIndex = null;
}

function reorderQueue(fromIndex, toIndex) {
    waitForConnection(() => {
        stompClient.send('/app/room.queue.reorder', {}, JSON.stringify({
            roomCode: currentRoom.roomCode,
            fromIndex: fromIndex,
            toIndex: toIndex
        }));
    });
}

function removeFromQueue(songId) {
    waitForConnection(() => {
        stompClient.send('/app/room.queue.remove', {}, JSON.stringify({
            roomCode: currentRoom.roomCode,
            songId: songId
        }));
    });
    showToast('Song removed from queue', 'success');
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
    const doAdd = () => {
        stompClient.send('/app/room.queue.add', {}, JSON.stringify({
            roomCode: currentRoom.roomCode,
            songId: songId,
            username: currentUser
        }));
        showToast('Song added to queue!', 'success');
    };
    if (stompClient && stompClient.connected) {
        doAdd();
    } else {
        showToast('Connecting... song will be added shortly.', 'info');
        waitForConnection(doAdd);
    }
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
    // If a song is currently playing, don't interrupt it
    if (isPlaying && currentSongIndex >= 0) {
        showToast('Song will play when its turn comes in the queue', 'info');
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
    const doSend = () => {
        stompClient.send('/app/room.playback', {}, JSON.stringify({
            roomCode: currentRoom.roomCode,
            action: action,
            currentTime: time
        }));
    };
    if (stompClient && stompClient.connected) {
        doSend();
    } else {
        waitForConnection(doSend);
    }
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
    console.log('[WebSocket] connectWebSocket called with roomCode:', roomCode);
    
    // Check if libraries are loaded
    if (typeof SockJS === 'undefined') {
        console.error('[WebSocket] SockJS library not loaded!');
        showToast('WebSocket library loading error. Please refresh the page.', 'error');
        return;
    }
    
    if (typeof Stomp === 'undefined') {
        console.error('[WebSocket] Stomp library not loaded!');
        showToast('WebSocket library loading error. Please refresh the page.', 'error');
        return;
    }
    
    if (isConnecting) {
        console.log('[WebSocket] Already attempting to connect, skipping...');
        return;
    }
    
    if (connectionRetries >= maxRetries) {
        console.error('[WebSocket] Max retries reached. Please refresh the page.');
        showToast('Connection failed. Please refresh the page.', 'error');
        return;
    }
    
    isConnecting = true;
    connectionRetries++;
    
    const statusEl = document.getElementById('connection-status');
    statusEl.className = 'connection-status show';
    statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connecting' + (connectionRetries > 1 ? ' (attempt ' + connectionRetries + ')' : '') + '...</span>';

    console.log('[WebSocket] Connecting to /ws endpoint (attempt ' + connectionRetries + ')...');
    
    try {
        const socket = new SockJS('/ws');
        
        // Add socket-level error handlers
        socket.onerror = function(error) {
            console.error('[WebSocket] Socket error:', error);
            isConnecting = false;
        };
        
        socket.onclose = function(event) {
            console.warn('[WebSocket] Socket closed:', event.code, event.reason);
            isConnecting = false;
        };
        
        stompClient = Stomp.over(socket);
        
        // Enable debug to see what's happening
        stompClient.debug = function(str) {
            console.log('[STOMP Debug]', str);
        };

        stompClient.connect({}, function(frame) {
            console.log('[WebSocket] Connected successfully!', frame);
            isConnecting = false;
            connectionRetries = 0; // Reset on success
            statusEl.className = 'connection-status show connected';
            statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connected</span>';
            setTimeout(() => statusEl.classList.remove('show'), 2000);

        // Execute any pending actions
        executePendingActions();

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
        console.error('[WebSocket] Connection failed:', error);
        console.error('[WebSocket] Error details:', {
            message: error.message || 'Unknown error',
            headers: error.headers || {},
            command: error.command || 'N/A'
        });
        
        isConnecting = false;
        
        statusEl.className = 'connection-status show disconnected';
        statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connection failed</span>';
        
        // Show error with retry info
        if (connectionRetries < maxRetries) {
            showToast('Connection failed. Retrying...', 'error');
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            const delay = Math.min(1000 * Math.pow(2, connectionRetries - 1), 10000);
            console.log('[WebSocket] Will retry in ' + delay + 'ms...');
            setTimeout(() => connectWebSocket(roomCode), delay);
        } else {
            showToast('Cannot connect to server. Please refresh the page.', 'error');
        }
    });
    } catch (err) {
        console.error('[WebSocket] Exception during connection:', err);
        isConnecting = false;
        statusEl.className = 'connection-status show disconnected';
        statusEl.innerHTML = '<i class="fas fa-wifi"></i><span>Connection error</span>';
        showToast('WebSocket error: ' + err.message, 'error');
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
        currentSongIndex = ps.currentSongIndex;
        updatePlayPauseIcon();

        // Only reload audio and seek if song actually changed
        if (song && song.audioUrl && audioPlayer.getAttribute('data-song-id') !== song.id) {
            isPlaying = ps.playing;
            currentTime = ps.currentTime || 0;
            audioPlayer.setAttribute('data-song-id', song.id);
            audioPlayer.src = song.audioUrl;
            audioPlayer.load();

            if (currentTime > 0) {
                audioPlayer.currentTime = currentTime;
            }

            if (isPlaying) {
                const playPromise = audioPlayer.play();
                if (playPromise !== undefined) {
                    playPromise.catch((err) => {
                        console.error('Failed to sync audio playback:', err);
                        setTimeout(() => audioPlayer.play().catch(() => {}), 300);
                    });
                }
                startProgressTimer();
                document.getElementById('sound-waves').classList.add('active');
            } else {
                audioPlayer.pause();
                stopProgressTimer();
                document.getElementById('sound-waves').classList.remove('active');
            }
        } else {
            // Same song — only sync play/pause state, don't touch position
            if (ps.playing && audioPlayer.paused) {
                audioPlayer.play().catch(() => {});
                startProgressTimer();
                document.getElementById('sound-waves').classList.add('active');
            } else if (!ps.playing && !audioPlayer.paused) {
                audioPlayer.pause();
                stopProgressTimer();
                document.getElementById('sound-waves').classList.remove('active');
            }
            isPlaying = ps.playing;
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
window.removeFromQueue = removeFromQueue;
window.reorderQueue = reorderQueue;
window.onQueueDragStart = onQueueDragStart;
window.onQueueDragOver = onQueueDragOver;
window.onQueueDrop = onQueueDrop;
window.onQueueDragEnd = onQueueDragEnd;
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
