// --- State ---
let queue = [];
let currentTrackIndex = -1;
let lastResults = [];
let likedSongs = [];
try { likedSongs = JSON.parse(localStorage.getItem('likedSongs')) || []; } catch (e) { likedSongs = []; }

// Auto Queue (remembered between visits, ON by default)
let autoQueueEnabled = true;
try {
  const saved = localStorage.getItem('autoQueue');
  if (saved !== null) autoQueueEnabled = saved === 'true';
} catch (e) {}
let relatedInFlight = null;       // shared promise so "ended" can wait for a fetch already running
const relatedFetched = new Set(); // track ids we already pulled related songs for

const trackCache = {}; // id -> track, so buttons only need the id
const audioPlayer = document.getElementById('audioPlayer');
const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' fill='%232a2a36'/%3E%3C/svg%3E";

// --- Helpers ---
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function remember(track) { if (track && track.id) trackCache[track.id] = track; }
function isLiked(id) { return likedSongs.some(s => s.id === id); }
function thumbOf(track) { return escapeHtml(track.thumbnail || FALLBACK_IMG); }

// --- Track card (shared by results / liked) ---
function trackCardHTML(track) {
  remember(track);
  const id = escapeHtml(track.id);
  const playing = currentTrackIndex >= 0 && queue[currentTrackIndex] && queue[currentTrackIndex].id === track.id;
  return `
    <div class="song-card ${playing ? 'playing' : ''}">
      <img src="${thumbOf(track)}" alt="Art" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="song-info">
        <div class="song-title">${escapeHtml(track.title)}</div>
        <div class="song-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="actions">
        <button class="play-btn" data-action="play" data-id="${id}">Play</button>
        <button data-action="queue" data-id="${id}">+ Queue</button>
        <button data-action="like" data-id="${id}">${isLiked(track.id) ? '❤️' : '🤍'}</button>
      </div>
    </div>`;
}

// --- Renderers ---
function renderSearchResults() {
  const el = document.getElementById('search-results');
  el.innerHTML = lastResults.length
    ? lastResults.map(trackCardHTML).join('')
    : '<div class="empty">Search for a song to get started.</div>';
}

function renderQueue() {
  const el = document.getElementById('queue-list');
  document.getElementById('queue-count').innerText = queue.length;
  if (queue.length === 0) {
    el.innerHTML = '<div class="empty">Queue is empty.</div>';
    return;
  }
  el.innerHTML = queue.map((track, index) => {
    remember(track);
    return `
    <div class="song-card ${index === currentTrackIndex ? 'playing' : ''}">
      <img src="${thumbOf(track)}" alt="Art" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="song-info">
        <div class="song-title">${index + 1}. ${escapeHtml(track.title)}</div>
        <div class="song-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="actions">
        <button data-action="queue-play" data-index="${index}">▶</button>
        <button data-action="queue-remove" data-index="${index}">✕</button>
      </div>
    </div>`;
  }).join('');
}

function renderLikedSongs() {
  const el = document.getElementById('liked-songs-list');
  el.innerHTML = likedSongs.length
    ? likedSongs.map(trackCardHTML).join('')
    : '<div class="empty">No liked songs yet.</div>';
}

function renderAll() {
  renderSearchResults();
  renderQueue();
  renderLikedSongs();
}

// --- Now playing UI ---
function updateNowPlayingUI(track, titleOverride) {
  document.getElementById('currentTitle').innerText = titleOverride || track.title;
  document.getElementById('currentArtist').innerText = track.artist;
  document.getElementById('currentThumb').src = track.thumbnail || FALLBACK_IMG;
}

// --- Collapsible Up Next ---
let queueCollapsed = false;
try { queueCollapsed = localStorage.getItem('queueCollapsed') === 'true'; } catch (e) {}

function syncQueueCollapseUI() {
  document.getElementById('queue-list').classList.toggle('collapsed', queueCollapsed);
  const btn = document.getElementById('queue-collapse-btn');
  btn.classList.toggle('collapsed', queueCollapsed);
  btn.setAttribute('aria-expanded', String(!queueCollapsed));
}

function toggleQueueCollapse() {
  queueCollapsed = !queueCollapsed;
  try { localStorage.setItem('queueCollapsed', String(queueCollapsed)); } catch (e) {}
  syncQueueCollapseUI();
}

// --- Auto Queue ---
function syncAutoQueueUI() {
  const btn = document.getElementById('auto-queue-btn');
  if (!btn) return;
  btn.classList.toggle('active', autoQueueEnabled);
  btn.setAttribute('aria-pressed', String(autoQueueEnabled));
  btn.querySelector('.toggle-label').innerText = `Auto Queue: ${autoQueueEnabled ? 'ON' : 'OFF'}`;
}

function toggleAutoQueue() {
  autoQueueEnabled = !autoQueueEnabled;
  try { localStorage.setItem('autoQueue', String(autoQueueEnabled)); } catch (e) {}
  syncAutoQueueUI();
  if (autoQueueEnabled) maybeAutoQueue(); // fill right away if we're near the end
}

// Fetch similar songs and append them (skipping duplicates). Resolves to how many were added.
// If a fetch is already running, callers share it instead of starting a second one.
function loadRelatedTracks(videoId) {
  if (!videoId) return Promise.resolve(0);
  if (relatedInFlight) return relatedInFlight;
  if (relatedFetched.has(videoId)) return Promise.resolve(0);

  relatedInFlight = (async () => {
    let added = 0;
    try {
      const res = await fetch(`/api/related/${encodeURIComponent(videoId)}`);
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      const tracks = Array.isArray(data) ? data : (data.tracks || []);

      tracks.forEach(t => {
        const track = { ...t, id: t.id || t.videoId };
        if (track.id && !queue.some(q => q.id === track.id)) {
          remember(track);
          queue.push(track);
          added++;
        }
      });
      relatedFetched.add(videoId); // only mark done on success, so failures can retry
      if (added) renderQueue();
    } catch (err) {
      console.error('Auto queue error:', err);
    }
    return added;
  })().finally(() => { relatedInFlight = null; });

  return relatedInFlight;
}

// If we're on one of the last 2 tracks, top up the queue ahead of time
function maybeAutoQueue() {
  if (!autoQueueEnabled || currentTrackIndex < 0) return;
  if (currentTrackIndex >= queue.length - 2) {
    loadRelatedTracks(queue[currentTrackIndex].id);
  }
}

// --- Queue / playback ---
function addToQueue(track) {
  queue.push(track);
  if (currentTrackIndex === -1) {
    playTrackFromQueue(queue.length - 1);
  } else {
    renderAll();
  }
}

function playNow(track) {
  let index = queue.findIndex(t => t.id === track.id);
  if (index === -1) {
    queue.push(track);
    index = queue.length - 1;
  }
  playTrackFromQueue(index);
}

async function playTrackFromQueue(index) {
  if (index < 0 || index >= queue.length) return;

  currentTrackIndex = index;
  const track = queue[index];
  renderAll();
  updateNowPlayingUI(track, 'Extracting stream...');
  maybeAutoQueue();

  try {
    const res = await fetch(`/api/stream/${encodeURIComponent(track.id)}`);
    const data = await res.json();

    // Ignore if the user already switched to another track
    if (queue[currentTrackIndex] !== track) return;

    if (data.error || !data.stream_url) {
      updateNowPlayingUI(track, 'Error playing track');
      alert('Could not resolve stream URL for this track.');
      return;
    }

    audioPlayer.src = data.stream_url;
    updateNowPlayingUI(track);
    await audioPlayer.play();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: [{ src: track.thumbnail || FALLBACK_IMG, sizes: '512x512', type: 'image/jpeg' }]
      });
      navigator.mediaSession.setActionHandler('previoustrack', playPreviousTrack);
      navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
    }
  } catch (err) {
    console.error('Playback error:', err);
    updateNowPlayingUI(track, 'Error playing track');
  }
}

async function playNextTrack() {
  if (currentTrackIndex + 1 < queue.length) {
    playTrackFromQueue(currentTrackIndex + 1);
    return;
  }
  // End of queue: wait for Auto Queue (including a fetch already in progress), then keep playing
  if (autoQueueEnabled && currentTrackIndex >= 0) {
    const current = queue[currentTrackIndex];
    updateNowPlayingUI(current, 'Finding similar songs...');
    await loadRelatedTracks(current.id);
    if (queue[currentTrackIndex] !== current) return; // user changed track meanwhile
    if (currentTrackIndex + 1 < queue.length) {
      playTrackFromQueue(currentTrackIndex + 1);
    } else {
      updateNowPlayingUI(current);
    }
  }
}

function playPreviousTrack() {
  if (currentTrackIndex - 1 >= 0) playTrackFromQueue(currentTrackIndex - 1);
}

function removeFromQueue(index) {
  if (index === currentTrackIndex) {
    queue.splice(index, 1);
    audioPlayer.pause();
    if (index < queue.length) {
      playTrackFromQueue(index);
    } else {
      currentTrackIndex = -1;
      renderAll();
    }
    return;
  }
  queue.splice(index, 1);
  if (index < currentTrackIndex) currentTrackIndex--;
  renderAll();
}

// --- Likes ---
function toggleLike(track) {
  const i = likedSongs.findIndex(s => s.id === track.id);
  if (i > -1) likedSongs.splice(i, 1);
  else likedSongs.push(track);
  try { localStorage.setItem('likedSongs', JSON.stringify(likedSongs)); } catch (e) {}
  renderSearchResults();
  renderLikedSongs();
}

// --- Search ---
async function searchSongs() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  const el = document.getElementById('search-results');
  el.innerHTML = '<div class="loading">Searching YouTube Music...</div>';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const songs = await res.json();

    if (!Array.isArray(songs) || songs.length === 0) {
      lastResults = [];
      el.innerHTML = '<div class="empty">No songs found.</div>';
      return;
    }
    lastResults = songs;
    renderSearchResults();
  } catch (err) {
    el.innerHTML = `<div class="error">Search failed: ${escapeHtml(err.message)}</div>`;
  }
}

// --- Events ---
document.getElementById('searchBtn').addEventListener('click', searchSongs);
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchSongs();
});
document.getElementById('prevBtn').addEventListener('click', playPreviousTrack);
document.getElementById('nextBtn').addEventListener('click', playNextTrack);
document.getElementById('auto-queue-btn').addEventListener('click', toggleAutoQueue);
document.getElementById('queue-collapse-btn').addEventListener('click', toggleQueueCollapse);
audioPlayer.addEventListener('ended', playNextTrack);

// One click handler for every button in the lists
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id, index } = btn.dataset;
  const track = id ? trackCache[id] : null;

  switch (action) {
    case 'play':         if (track) playNow(track); break;
    case 'queue':        if (track) addToQueue(track); break;
    case 'like':         if (track) toggleLike(track); break;
    case 'queue-play':   playTrackFromQueue(Number(index)); break;
    case 'queue-remove': removeFromQueue(Number(index)); break;
  }
});

// --- Seek line + play/pause ---
const seekBar = document.getElementById('seekBar');
const playPauseBtn = document.getElementById('playPauseBtn');
let isSeeking = false;

function setSeekFill() { seekBar.style.setProperty('--seek', seekBar.value + '%'); }
function resetSeek() { seekBar.value = 0; setSeekFill(); }

audioPlayer.addEventListener('timeupdate', () => {
  if (isSeeking || !isFinite(audioPlayer.duration) || audioPlayer.duration === 0) return;
  seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  setSeekFill();
});
audioPlayer.addEventListener('loadstart', resetSeek);

// Drag shows position; releasing jumps the song there
seekBar.addEventListener('input', () => { isSeeking = true; setSeekFill(); });
seekBar.addEventListener('change', () => {
  if (isFinite(audioPlayer.duration)) {
    audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
  }
  isSeeking = false;
});

function syncPlayPauseUI() { playPauseBtn.innerText = audioPlayer.paused ? '▶' : '⏸'; }
audioPlayer.addEventListener('play', syncPlayPauseUI);
audioPlayer.addEventListener('pause', syncPlayPauseUI);
audioPlayer.addEventListener('ended', syncPlayPauseUI);

playPauseBtn.addEventListener('click', () => {
  if (!audioPlayer.getAttribute('src')) return; // nothing loaded yet
  if (audioPlayer.paused) audioPlayer.play(); else audioPlayer.pause();
});

// --- Keep page content clear of the fixed player, whatever its height ---
const playerBar = document.querySelector('.player-bar');
function fitBodyToPlayer() { document.body.style.paddingBottom = (playerBar.offsetHeight + 24) + 'px'; }
if ('ResizeObserver' in window) new ResizeObserver(fitBodyToPlayer).observe(playerBar);
window.addEventListener('resize', fitBodyToPlayer);
fitBodyToPlayer();

// --- Init ---
syncAutoQueueUI();
syncQueueCollapseUI();
renderAll();