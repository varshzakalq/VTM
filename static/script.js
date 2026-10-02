// --- State ---
let queue = [];
let currentTrackIndex = -1;
let lastResults = [];
let shuffleOn = false;
let repeatOn = false;
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
function icon(name) { return `<svg class="ico"><use href="#i-${name}"/></svg>`; }
function fmtTime(t) { if (!isFinite(t)) return '0:00'; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

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
        <button class="play-btn" data-action="play" data-id="${id}">${icon('play')}<span>Play</span></button>
        <button data-action="queue" data-id="${id}">${icon('plus')}<span>Queue</span></button>
        <button class="like-btn ${isLiked(track.id) ? 'liked' : ''}" data-action="like" data-id="${id}" aria-label="Like">${icon(isLiked(track.id) ? 'heart-fill' : 'heart')}</button>
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
        <button class="icon-only" data-action="queue-play" data-index="${index}" aria-label="Play">${icon('play')}</button>
        <button class="icon-only" data-action="queue-remove" data-index="${index}" aria-label="Remove">${icon('x')}</button>
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
  // Full player: bigger artwork inside the U-shaped cover
  document.getElementById('fpTitle').innerText = titleOverride || track.title;
  document.getElementById('fpArtist').innerText = track.artist;
  const big = (track.thumbnail || '').replace(/=w\d+-h\d+[^&]*/, '=w600-h600-l90-rj');
  document.getElementById('uCover').style.backgroundImage = big ? `url("${big}")` : 'none';
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
  if (shuffleOn && queue.length > 1) {
    let i;
    do { i = Math.floor(Math.random() * queue.length); } while (i === currentTrackIndex);
    playTrackFromQueue(i);
    return;
  }
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
audioPlayer.addEventListener('ended', () => {
  if (repeatOn) { audioPlayer.currentTime = 0; audioPlayer.play(); } else playNextTrack();
});

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

function syncPlayPauseUI() {
  const html = icon(audioPlayer.paused ? 'play' : 'pause');
  playPauseBtn.innerHTML = html;
  document.getElementById('fpPlayBtn').innerHTML = html;
}
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

// --- Full player: rises when the bottom banner is tapped ---
const fullPlayer = document.getElementById('full-player');
const arcEl = document.getElementById('arc');
const ARC = { cx: 160, cy: 14, r: 146 };
let arcDragging = false;

function openFullPlayer() {
  if (currentTrackIndex < 0) return;
  fullPlayer.classList.add('open');
  fullPlayer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}
function closeFullPlayer() {
  fullPlayer.classList.remove('open');
  fullPlayer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}
playerBar.addEventListener('click', e => { if (!e.target.closest('button, input')) openFullPlayer(); });
document.getElementById('fpClose').addEventListener('click', closeFullPlayer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFullPlayer(); });

// Arc seek: f = 0..1 along the curve
function drawArc(f) {
  const a = f * Math.PI;
  document.getElementById('arcProgress').setAttribute('stroke-dasharray', `${f * 100} 100`);
  const knob = document.getElementById('arcKnob');
  knob.setAttribute('cx', ARC.cx - ARC.r * Math.cos(a));
  knob.setAttribute('cy', ARC.cy + ARC.r * Math.sin(a));
}
function arcFraction(clientX) {
  const rect = arcEl.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 320;
  const c = Math.max(-1, Math.min(1, (ARC.cx - x) / ARC.r));
  return Math.acos(c) / Math.PI;
}
function refreshArc() {
  const d = audioPlayer.duration;
  const f = isFinite(d) && d > 0 ? audioPlayer.currentTime / d : 0;
  drawArc(f);
  document.getElementById('fpTime').innerText = `${fmtTime(audioPlayer.currentTime)} / ${fmtTime(d)}`;
}
audioPlayer.addEventListener('timeupdate', () => { if (!arcDragging) refreshArc(); });
audioPlayer.addEventListener('loadedmetadata', refreshArc);

arcEl.addEventListener('pointerdown', e => { arcDragging = true; arcEl.setPointerCapture(e.pointerId); drawArc(arcFraction(e.clientX)); });
arcEl.addEventListener('pointermove', e => { if (arcDragging) drawArc(arcFraction(e.clientX)); });
arcEl.addEventListener('pointerup', e => {
  if (!arcDragging) return;
  arcDragging = false;
  if (isFinite(audioPlayer.duration)) audioPlayer.currentTime = arcFraction(e.clientX) * audioPlayer.duration;
});

// Full player buttons
document.getElementById('fpPlayBtn').addEventListener('click', () => playPauseBtn.click());
document.getElementById('fpPrevBtn').addEventListener('click', playPreviousTrack);
document.getElementById('fpNextBtn').addEventListener('click', playNextTrack);
document.getElementById('shuffleBtn').addEventListener('click', e => {
  shuffleOn = !shuffleOn; e.currentTarget.classList.toggle('active', shuffleOn);
});
document.getElementById('repeatBtn').addEventListener('click', e => {
  repeatOn = !repeatOn; e.currentTarget.classList.toggle('active', repeatOn);
});

// --- Init ---
syncAutoQueueUI();
syncQueueCollapseUI();
renderAll();