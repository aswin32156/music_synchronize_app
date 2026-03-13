// ===== MusicSync Application =====

// ===== SCREEN NAVIGATION WITH HISTORY =====
const screenHistory = [];

window.showScreen = function(screenId, pushHistory = true) {
    console.log('showScreen called with:', screenId);
    const current = document.querySelector('.screen.active');
    const currentId = current ? current.id : null;
    // Push current to history so we can go back
    // Skip if: not pushing, no current screen, same destination, going home already in history, or inside room
    if (pushHistory && currentId && currentId !== screenId && currentId !== 'room-screen') {
        // Avoid consecutive duplicates in the stack
        if (screenHistory[screenHistory.length - 1] !== currentId) {
            screenHistory.push(currentId);
        }
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    setTimeout(() => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            console.log('Screen activated:', screenId);
        } else {
            console.error('Screen not found:', screenId);
        }
    }, 50);
    // Update browser history so the OS/browser back button works
    if (pushHistory) {
        history.pushState({ screenId }, '', '#' + screenId);
    }
    _updateBackBtnVisibility();
};

window.goBack = function() {
    if (screenHistory.length > 0) {
        const prev = screenHistory.pop();
        showScreen(prev, false);
        // Keep browser URL in sync without adding a new history entry
        history.replaceState({ screenId: prev }, '', '#' + prev);
    } else {
        showScreen('home-screen', false);
        history.replaceState({ screenId: 'home-screen' }, '', '#home-screen');
    }
};

function _updateBackBtnVisibility() {
    // show/hide the room-level back btn (not applicable in room-screen)
    // The main back buttons are per-screen (create/join already have them)
}

// Handle browser back button
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.screenId) {
        showScreen(e.state.screenId, false);
    } else {
        goBack();
    }
});

// State
let stompClient = null;
let currentUser = null;
let currentUserId = null;
let currentRoom = null;
let isHost = false;
let isPlaying = false;
let currentSongIndex = -1;
let progressInterval = null;
let currentTime = 0;
let duration = 0;
let currentUsers = [];
let connectionRetries = 0;
let maxRetries = 5;
let isConnecting = false;
let pendingActions = [];
let roomStateRefreshTimeout = null;
let roomStatePollInterval = null;

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

function getListenerCount(users) {
    return (Array.isArray(users) ? users : []).filter(user => !user.host).length;
}

async function refreshRoomStateOnce(roomCode) {
    if (!roomCode) return;
    try {
        const res = await fetch('/api/rooms/' + encodeURIComponent(roomCode));
        if (!res.ok) return;
        const latest = await res.json();
        updateRoomUI(latest);
    } catch (e) {
        // Ignore transient polling errors; realtime updates keep the normal flow.
    }
}

function scheduleRoomStateRefresh(delayMs = 150) {
    if (!currentRoom || !currentRoom.roomCode) return;

    if (roomStateRefreshTimeout) {
        clearTimeout(roomStateRefreshTimeout);
    }

    roomStateRefreshTimeout = setTimeout(() => {
        roomStateRefreshTimeout = null;
        refreshRoomStateOnce(currentRoom.roomCode);
    }, delayMs);
}

function startRoomStatePolling(roomCode) {
    if (!roomCode) return;
    stopRoomStatePolling();
    roomStatePollInterval = setInterval(() => {
        refreshRoomStateOnce(roomCode);
    }, 4000);
}

function stopRoomStatePolling() {
    if (roomStatePollInterval) {
        clearInterval(roomStatePollInterval);
        roomStatePollInterval = null;
    }
    if (roomStateRefreshTimeout) {
        clearTimeout(roomStateRefreshTimeout);
        roomStateRefreshTimeout = null;
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

    startRoomStatePolling(roomState.roomCode);
    scheduleRoomStateRefresh(0);

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
    if (!state || typeof state !== 'object') return;

    currentRoom = state;
    const roomUsers = Array.isArray(state.users) ? state.users : [];
    const roomQueue = Array.isArray(state.queue) ? state.queue : [];

    // Room info
    document.getElementById('room-name-display').textContent = state.roomName || 'Music Room';
    document.getElementById('room-code-display').textContent = state.roomCode;

    // Set current user ID (extract from users list)
    if (!currentUserId && currentUser) {
        const user = roomUsers.find(u => u.username === currentUser);
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
    updateUsersList(roomUsers);

    // Queue
    updateQueue(roomQueue, state.playbackState);

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
    currentUsers = Array.isArray(users) ? [...users] : [];

    const list = document.getElementById('users-list');
    const countBadge = document.getElementById('user-count');
    if (countBadge) {
        countBadge.textContent = getListenerCount(currentUsers);
    }

    if (currentRoom) {
        currentRoom.users = currentUsers;
    }

    if (list) {
        list.innerHTML = currentUsers.map(user => `
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

    const modal = document.getElementById('listeners-modal');
    if (modal && !modal.classList.contains('hidden')) {
        renderListenersModal();
    }
}

function getActiveListeners() {
    if (currentRoom && Array.isArray(currentRoom.users) && currentRoom.users.length > 0) {
        return currentRoom.users;
    }
    if (Array.isArray(currentUsers) && currentUsers.length > 0) {
        return currentUsers;
    }
    return [];
}

function renderListenersModal() {
    const title = document.getElementById('listeners-modal-title');
    const list = document.getElementById('listeners-modal-list');
    if (!title || !list) return;

    const listeners = getActiveListeners();
    const count = getListenerCount(listeners);
    title.textContent = count === 1 ? '1 person is listening now' : `${count} people are listening now`;

    const listenerRows = listeners.filter(user => !user.host);

    if (listenerRows.length === 0) {
        list.innerHTML = '<div class="listeners-empty">No listeners are connected right now.</div>';
        return;
    }

    list.innerHTML = listenerRows.map(user => `
        <div class="listener-row">
            <div class="listener-avatar" style="background: ${escapeAttr(user.avatarColor || '#1DB954')}">
                ${escapeHtml((user.username || '?').charAt(0).toUpperCase())}
            </div>
            <div class="listener-meta">
                <div class="listener-name">${escapeHtml(user.username || 'Unknown User')}${user.username === currentUser ? ' (You)' : ''}</div>
                <div class="listener-role">${user.host ? 'Host' : 'Listener'}</div>
            </div>
            ${user.host ? '<span class="listener-tag host">Host</span>' : '<span class="listener-tag">Live</span>'}
        </div>
    `).join('');
}

function openListenersModal() {
    const modal = document.getElementById('listeners-modal');
    if (!modal) return;

    renderListenersModal();
    modal.classList.remove('hidden');
}

function closeListenersModal() {
    const modal = document.getElementById('listeners-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function handleListenersModalBackdrop(event) {
    if (event.target && event.target.id === 'listeners-modal') {
        closeListenersModal();
    }
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
        <div class="song-item ${index === currentIdx ? 'playing' : ''}"
             data-index="${index}" data-song-id="${escapeAttr(song.id)}">
            <span class="song-item-drag" title="Drag to reorder">
                <i class="fas fa-grip-vertical"></i>
            </span>
            <span class="song-item-index">
                ${index === currentIdx && isPlaying
                    ? '<i class="fas fa-volume-up" style="color: var(--accent); font-size: 12px;"></i>'
                    : index + 1}
            </span>
            <img class="song-item-cover" draggable="false" src="${escapeAttr(song.coverUrl)}" alt="${escapeAttr(song.title)}">
            <div class="song-item-info">
                <div class="song-item-title">${escapeHtml(song.title)}</div>
                <div class="song-item-artist">${escapeHtml(song.artist)}</div>
            </div>
            ${song.addedBy ? `<span class="song-item-added">Added by ${escapeHtml(song.addedBy)}</span>` : ''}
            <span class="song-item-duration">${formatTime(song.durationSeconds)}</span>
            <button class="song-item-action remove" title="Remove from queue">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    // Attach all event listeners programmatically — avoids currentTarget/encoding issues
    queueList.querySelectorAll('.song-item').forEach(item => {
        const idx = parseInt(item.dataset.index);
        const songId = item.dataset.songId;

        // Play on click
        item.addEventListener('click', () => playSongAtIndex(idx));

        // Remove button
        item.querySelector('.song-item-action.remove').addEventListener('click', e => {
            e.stopPropagation();
            removeFromQueue(songId);
        });

        // Drag handle — prevent click from bubbling to play
        item.querySelector('.song-item-drag').addEventListener('click', e => e.stopPropagation());

        // Drag to reorder
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', e => {
            dragSrcIndex = idx;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(idx));
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = item.getBoundingClientRect();
            item.classList.remove('drag-over-top', 'drag-over-bottom');
            item.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('drag-over-top', 'drag-over-bottom');
            if (dragSrcIndex !== null && dragSrcIndex !== idx) {
                reorderQueue(dragSrcIndex, idx);
            }
            dragSrcIndex = null;
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            queueList.querySelectorAll('.song-item').forEach(el =>
                el.classList.remove('drag-over-top', 'drag-over-bottom')
            );
            dragSrcIndex = null;
        });
    });
}

// ===== Queue Drag & Drop =====
let dragSrcIndex = null;

// Legacy inline-handler stubs (kept for safety, not used in queue rendering)
function onQueueDragStart(e) {}
function onQueueDragOver(e) { e.preventDefault(); }
function onQueueDrop(e) { e.preventDefault(); }
function onQueueDragEnd(e) {}

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

// ===== External Search (JioSaavn + YouTube Music) =====
let searchTimeout = null;
let _allSearchResults = []; // cache last results for filter re-render
let _activeFilters = new Set(['jiosaavn', 'youtube']);
let isYouTubeConfigured = false;
let currentSearchResultTab = 'songs';
const searchViewHistory = [];

function cloneSearchResults(results) {
    return Array.isArray(results) ? results.map(song => ({ ...song })) : [];
}

function getFilteredSearchResults(results = _allSearchResults) {
    return (Array.isArray(results) ? results : []).filter(song => {
        if (song.id.startsWith('jio_')) return _activeFilters.has('jiosaavn');
        if (song.id.startsWith('yt_')) return _activeFilters.has('youtube');
        return true;
    });
}

function renderEmptyFilteredResults(resultsList) {
    resultsList.innerHTML = `<div class="search-no-results">
        <i class="fas fa-filter" style="font-size:2rem;color:#666;margin-bottom:.5rem"></i>
        <p>No results for the selected source.</p>
        <p style="font-size:.8rem;color:#888">Toggle a source filter above to see results.</p>
    </div>`;
}

function updateSourceFilterButtons(hasYouTube = false) {
    const jioBtn = document.getElementById('filter-jiosaavn');
    const youTubeBtn = document.getElementById('filter-youtube');
    if (jioBtn) {
        jioBtn.classList.toggle('active', _activeFilters.has('jiosaavn'));
    }
    if (youTubeBtn) {
        youTubeBtn.classList.toggle('disabled', !isYouTubeConfigured);
        youTubeBtn.classList.toggle('active', _activeFilters.has('youtube'));
        youTubeBtn.classList.toggle('has-results', !!hasYouTube);
    }
}

function buildSearchViewSnapshot(mode) {
    const input = document.getElementById('external-search');
    const youTubeBtn = document.getElementById('filter-youtube');
    return {
        mode,
        query: input ? input.value : '',
        allResults: cloneSearchResults(_allSearchResults),
        activeFilters: Array.from(_activeFilters),
        currentResultTab: currentSearchResultTab,
        hasYouTube: !!youTubeBtn && youTubeBtn.classList.contains('has-results')
    };
}

function rememberSearchView(mode) {
    const snapshot = buildSearchViewSnapshot(mode);
    const last = searchViewHistory[searchViewHistory.length - 1];
    if (
        last
        && last.mode === snapshot.mode
        && last.query === snapshot.query
        && last.currentResultTab === snapshot.currentResultTab
        && last.hasYouTube === snapshot.hasYouTube
        && last.activeFilters.join('|') === snapshot.activeFilters.join('|')
        && last.allResults.length === snapshot.allResults.length
    ) {
        return;
    }
    searchViewHistory.push(snapshot);
}

function restoreSearchView(snapshot) {
    const input = document.getElementById('external-search');
    const statusEl = document.getElementById('search-status');
    const emptyEl = document.getElementById('search-empty');
    const resultsList = document.getElementById('search-results');

    if (input) input.value = snapshot.query || '';
    if (statusEl) statusEl.classList.add('hidden');

    currentSearchResultTab = snapshot.currentResultTab || 'songs';
    _activeFilters = new Set(
        Array.isArray(snapshot.activeFilters) && snapshot.activeFilters.length > 0
            ? snapshot.activeFilters
            : ['jiosaavn']
    );

    if (!isYouTubeConfigured) {
        _activeFilters.delete('youtube');
        if (!_activeFilters.has('jiosaavn')) {
            _activeFilters.add('jiosaavn');
        }
    }

    if (snapshot.mode === 'results') {
        _allSearchResults = cloneSearchResults(snapshot.allResults);
        if (emptyEl) emptyEl.classList.add('hidden');
        updateSourceFilterButtons(snapshot.hasYouTube);
        if (resultsList) {
            const filtered = getFilteredSearchResults(_allSearchResults);
            if (filtered.length === 0) {
                renderEmptyFilteredResults(resultsList);
            } else {
                renderSearchResults(filtered);
            }
        }
    } else {
        _allSearchResults = [];
        currentSearchResultTab = 'songs';
        if (resultsList) resultsList.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        updateSourceFilterButtons(false);
    }

    _updateSearchBackBtn();
}

window.toggleSourceFilter = function(source) {
    const btn = document.getElementById('filter-' + source);
    if (!btn) return;

    if (source === 'youtube' && !isYouTubeConfigured) {
        showToast('YouTube source is currently unavailable on server.', 'info');
        return;
    }

    if (_activeFilters.has(source)) {
        // keep at least one source active
        if (_activeFilters.size === 1) return;
        _activeFilters.delete(source);
    } else {
        _activeFilters.add(source);
    }
    updateSourceFilterButtons(_allSearchResults.some(song => song.id.startsWith('yt_')));
    if (_allSearchResults.length > 0) {
        const filtered = getFilteredSearchResults(_allSearchResults);
        const resultsList = document.getElementById('search-results');
        if (filtered.length === 0) {
            renderEmptyFilteredResults(resultsList);
        } else {
            renderSearchResults(filtered);
        }
    }
};

async function searchExternal(preserveCurrentView = true) {
    await checkSources();

    const input = document.getElementById('external-search');
    const query = input.value.trim();
    if (!query) {
        showToast('Please enter a search query', 'info');
        return;
    }

    const statusEl = document.getElementById('search-status');
    const emptyEl = document.getElementById('search-empty');
    const resultsList = document.getElementById('search-results');

    if (preserveCurrentView && document.querySelector('#tab-search.active')) {
        if (_allSearchResults.length > 0) {
            rememberSearchView('results');
        } else if (emptyEl && !emptyEl.classList.contains('hidden')) {
            rememberSearchView('suggestions');
        }
    }

    _allSearchResults = [];
    currentSearchResultTab = 'songs';
    statusEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    resultsList.innerHTML = '';
    const searchBackBtn = document.getElementById('search-back-btn');
    if (searchBackBtn) searchBackBtn.classList.add('hidden');

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

        _allSearchResults = cloneSearchResults(songs);
        updateSourceFilterButtons(songs.some(s => s.id.startsWith('yt_')));

        const filtered = getFilteredSearchResults(_allSearchResults);
        renderSearchResults(filtered);
        _updateSearchBackBtn();
    } catch (e) {
        statusEl.classList.add('hidden');
        showToast('Search failed: ' + e.message, 'error');
        console.error('External search failed:', e);
    }
}

window.clearSearch = function() {
    _allSearchResults = [];
    currentSearchResultTab = 'songs';
    searchViewHistory.length = 0;
    const input = document.getElementById('external-search');
    if (input) input.value = '';
    const resultsList = document.getElementById('search-results');
    if (resultsList) resultsList.innerHTML = '';
    const emptyEl = document.getElementById('search-empty');
    if (emptyEl) emptyEl.classList.remove('hidden');
    updateSourceFilterButtons(false);
    if (input) input.focus();
    _updateSearchBackBtn();
};

function quickSearch(query) {
    document.getElementById('external-search').value = query;
    searchExternal(true);
}

function renderSearchResults(songs) {
    const list = document.getElementById('search-results');
    const fallbackImg = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect fill=%22%23333%22 width=%2260%22 height=%2260%22/><text x=%2230%22 y=%2236%22 fill=%22%23888%22 text-anchor=%22middle%22 font-size=%2224%22>♪</text></svg>";

    // Collect unique artists and albums
    const artistMap = new Map();
    const albumMap = new Map();
    songs.forEach(song => {
        const artistName = (song.artist || '').trim();
        if (artistName && artistName !== 'Unknown Artist') {
            if (!artistMap.has(artistName)) {
                artistMap.set(artistName, { name: artistName, cover: song.coverUrl, count: 0 });
            }
            artistMap.get(artistName).count++;
        }
        const albumName = (song.album || '').trim();
        if (albumName) {
            const key = albumName + '||' + artistName;
            if (!albumMap.has(key)) {
                albumMap.set(key, { name: albumName, artist: artistName, cover: song.coverUrl, count: 0 });
            }
            albumMap.get(key).count++;
        }
    });

    const activeResultTab = ['songs', 'artists', 'albums'].includes(currentSearchResultTab)
        ? currentSearchResultTab
        : 'songs';

    // ── Tab bar ───────────────────────────────────────────────
    let html = `<div class="sr-tabs">
        <button class="sr-tab${activeResultTab === 'songs' ? ' active' : ''}" data-tab="songs" onclick="switchSearchTab('songs')">
            <i class="fas fa-music"></i> Songs <span class="sr-tab-count">${songs.length}</span>
        </button>
        <button class="sr-tab${activeResultTab === 'artists' ? ' active' : ''}" data-tab="artists" onclick="switchSearchTab('artists')">
            <i class="fas fa-user"></i> Artists <span class="sr-tab-count">${artistMap.size}</span>
        </button>
        <button class="sr-tab${activeResultTab === 'albums' ? ' active' : ''}" data-tab="albums" onclick="switchSearchTab('albums')">
            <i class="fas fa-record-vinyl"></i> Albums <span class="sr-tab-count">${albumMap.size}</span>
        </button>
    </div>`;

    // ── Songs panel ───────────────────────────────────────────
    html += `<div class="sr-panel${activeResultTab === 'songs' ? '' : ' hidden'}" id="sr-panel-songs">`;
    html += songs.map(song => {
        const sourceIcon = song.id.startsWith('jio_')
            ? '<span class="source-tag jio">JioSaavn</span>'
            : song.id.startsWith('yt_')
            ? '<span class="source-tag yt">YouTube</span>'
            : '';
        const albumPart = song.album ? ` <span class="song-meta-album"><i class="fas fa-compact-disc"></i> ${escapeHtml(song.album)}</span>` : '';
        return `
        <div class="song-item">
            <img class="song-item-cover" src="${escapeAttr(song.coverUrl)}" alt="${escapeAttr(song.title)}"
                 onerror="this.src='${fallbackImg}'">
            <div class="song-item-info">
                <div class="song-item-title">${escapeHtml(song.title)}</div>
                <div class="song-item-meta">
                    <span class="song-meta-artist"><i class="fas fa-user"></i> ${escapeHtml(song.artist)}</span>${albumPart}
                </div>
            </div>
            ${sourceIcon}
            <span class="song-item-duration">${formatTime(song.durationSeconds)}</span>
            <button class="song-item-action" onclick="event.stopPropagation(); addToQueue('${escapeAttr(song.id)}')" title="Add to queue">
                <i class="fas fa-plus"></i>
            </button>
        </div>`;
    }).join('');
    html += `</div>`;

    // ── Artists panel ─────────────────────────────────────────
    html += `<div class="sr-panel${activeResultTab === 'artists' ? '' : ' hidden'}" id="sr-panel-artists">`;
    if (artistMap.size === 0) {
        html += `<div class="sr-panel-empty"><i class="fas fa-user-slash"></i><p>No artists found</p></div>`;
    } else {
        html += `<div class="sr-grid">`;
        artistMap.forEach(a => {
            html += `<div class="sr-card sr-artist-card" onclick="quickSearch('${escapeAttr(a.name)}')" title="Search songs by ${escapeAttr(a.name)}">
                <div class="sr-card-img-wrap sr-artist-img">
                    <img src="${escapeAttr(a.cover)}" alt="${escapeAttr(a.name)}" onerror="this.src='${fallbackImg}'">
                    <div class="sr-card-overlay"><i class="fas fa-search"></i></div>
                </div>
                <div class="sr-card-body">
                    <div class="sr-card-title">${escapeHtml(a.name)}</div>
                    <div class="sr-card-sub">${a.count} song${a.count !== 1 ? 's' : ''}</div>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    html += `</div>`;

    // ── Albums panel ──────────────────────────────────────────
    html += `<div class="sr-panel${activeResultTab === 'albums' ? '' : ' hidden'}" id="sr-panel-albums">`;
    if (albumMap.size === 0) {
        html += `<div class="sr-panel-empty"><i class="fas fa-compact-disc"></i><p>No albums found</p></div>`;
    } else {
        html += `<div class="sr-grid">`;
        albumMap.forEach(al => {
            html += `<div class="sr-card sr-album-card" onclick="quickSearch('${escapeAttr(al.name)}')" title="Search songs from ${escapeAttr(al.name)}">
                <div class="sr-card-img-wrap">
                    <img src="${escapeAttr(al.cover)}" alt="${escapeAttr(al.name)}" onerror="this.src='${fallbackImg}'">
                    <div class="sr-card-overlay"><i class="fas fa-search"></i></div>
                </div>
                <div class="sr-card-body">
                    <div class="sr-card-title">${escapeHtml(al.name)}</div>
                    <div class="sr-card-sub">${escapeHtml(al.artist)}</div>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    html += `</div>`;

    list.innerHTML = html;
}

window.switchSearchTab = function(tab, pushHistory = true) {
    if (pushHistory && _allSearchResults.length > 0 && currentSearchResultTab && currentSearchResultTab !== tab) {
        rememberSearchView('results');
    }
    currentSearchResultTab = tab;
    document.querySelectorAll('.sr-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.sr-panel').forEach(panel => {
        panel.classList.toggle('hidden', !panel.id.endsWith(tab));
    });
    _updateSearchBackBtn();
};

async function checkSources() {
    try {
        const res = await fetch('/api/music/sources');
        const data = await res.json();
        isYouTubeConfigured = !!(data.youtubeConfigured ?? data.spotifyConfigured);

        if (isYouTubeConfigured) {
            if (!_activeFilters.has('youtube')) {
                _activeFilters.add('youtube');
            }
        } else {
            _activeFilters.delete('youtube');
            _activeFilters.add('jiosaavn');
        }

        const hasYouTubeInResults = _allSearchResults.some(song => song.id.startsWith('yt_'));
        updateSourceFilterButtons(hasYouTubeInResults);

        if (_allSearchResults.length > 0) {
            const resultsList = document.getElementById('search-results');
            const filtered = getFilteredSearchResults(_allSearchResults);
            if (filtered.length === 0) {
                renderEmptyFilteredResults(resultsList);
            } else {
                renderSearchResults(filtered);
            }
        }
    } catch (e) {
        console.log('Could not check sources:', e);
    }
}

const pendingAddSongs = new Set();

function addToQueue(songId) {
    if (pendingAddSongs.has(songId)) return; // prevent duplicate queuing
    const doAdd = () => {
        pendingAddSongs.delete(songId);
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
        pendingAddSongs.add(songId);
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
    const pointerX = typeof event.clientX === 'number'
        ? event.clientX
        : (event.touches && event.touches[0] ? event.touches[0].clientX : null);
    if (pointerX === null) return;

    const pos = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
    const totalDuration = audioPlayer.duration || duration;
    if (!totalDuration || totalDuration <= 0) return;

    const seekTime = pos * totalDuration;

    // Apply immediately for host responsiveness; room sync keeps everyone aligned.
    currentTime = seekTime;
    try {
        audioPlayer.currentTime = seekTime;
    } catch (err) {
        console.warn('[Playback] Failed to apply local seek:', err);
    }
    updateProgress();

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

        // Explicit sync helps late joiners and listener count stay aligned.
        stompClient.send('/app/room.sync', {}, JSON.stringify({
            roomCode: roomCode
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
        isPlaying = ps.playing;
        currentSongIndex = ps.currentSongIndex;
        updatePlayPauseIcon();

        // Only reload audio and seek if song actually changed
        if (song && song.audioUrl && audioPlayer.getAttribute('data-song-id') !== song.id) {
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
            // Same song — still sync position so seek works across clients.
            const serverTime = Number(ps.currentTime);
            if (Number.isFinite(serverTime) && serverTime >= 0) {
                const knownDuration = (Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0)
                    ? audioPlayer.duration
                    : duration;
                const clampedTime = knownDuration > 0 ? Math.min(serverTime, knownDuration) : serverTime;

                currentTime = clampedTime;
                if (Math.abs((audioPlayer.currentTime || 0) - clampedTime) > 0.7) {
                    try {
                        audioPlayer.currentTime = clampedTime;
                    } catch (err) {
                        console.warn('[Playback] Failed to apply synced time:', err);
                    }
                }
            }

            if (isPlaying && audioPlayer.paused) {
                audioPlayer.play().catch(() => {});
                startProgressTimer();
                document.getElementById('sound-waves').classList.add('active');
            } else if (!isPlaying && !audioPlayer.paused) {
                audioPlayer.pause();
                stopProgressTimer();
                document.getElementById('sound-waves').classList.remove('active');
            }
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
        const text = typeof msg.message === 'string' ? msg.message.trim() : '';

        container.innerHTML += `
            <div class="chat-msg system">
                <div class="chat-msg-content">
                    <div class="chat-msg-text">${escapeHtml(msg.message)}</div>
                </div>
            </div>
        `;

        if (/joined the room/i.test(text) || /left the room/i.test(text)) {
            scheduleRoomStateRefresh(120);
        }
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
const tabHistory = [];

function switchTab(tabName, pushHistory = true) {
    const current = document.querySelector('.tab-btn.active');
    const currentTab = current ? current.id.replace('tab-', '') : null;
    if (pushHistory && currentTab && currentTab !== tabName) {
        if (tabHistory[tabHistory.length - 1] !== currentTab) {
            tabHistory.push(currentTab);
        }
    }
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    document.getElementById(tabName + '-panel').classList.add('active');
    _updateSearchBackBtn();
}

function _updateSearchBackBtn() {
    const btn = document.getElementById('search-back-btn');
    if (!btn) return;
    const onSearchTab = !!document.querySelector('#tab-search.active');
    if (onSearchTab && (tabHistory.length > 0 || searchViewHistory.length > 0 || _allSearchResults.length > 0)) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

function goBackInSearch() {
    if (searchViewHistory.length > 0) {
        restoreSearchView(searchViewHistory.pop());
        return;
    }

    if (_allSearchResults.length > 0) {
        const input = document.getElementById('external-search');
        const resultsList = document.getElementById('search-results');
        const emptyEl = document.getElementById('search-empty');
        _allSearchResults = [];
        currentSearchResultTab = 'songs';
        if (resultsList) resultsList.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        updateSourceFilterButtons(false);
        if (input) input.focus();
    } else {
        const prev = tabHistory.length > 0 ? tabHistory.pop() : 'queue';
        switchTab(prev, false);
    }
    _updateSearchBackBtn();
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
    stopRoomStatePolling();
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.removeAttribute('data-song-id');
    currentRoom = null;
    currentUser = null;
    currentUserId = null;
    currentUsers = [];
    isHost = false;
    isPlaying = false;
    stopProgressTimer();
    closeListenersModal();

    tabHistory.length = 0;
    currentSearchResultTab = 'songs';
    searchViewHistory.length = 0;
    // Clear navigation history so back always returns to home after leaving a room
    screenHistory.length = 0;
    showScreen('home-screen', false);
    history.replaceState({ screenId: 'home-screen' }, '', '#home-screen');
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
window.goBackInSearch = goBackInSearch;
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
window.openListenersModal = openListenersModal;
window.closeListenersModal = closeListenersModal;
window.handleListenersModalBackdrop = handleListenersModalBackdrop;
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

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeListenersModal();
        }
    });
});
