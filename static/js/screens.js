// Screens: Home, Saved Songs, Search (+ playlist builder), Playlist detail.

let currentScreen = 'home';
let openPlaylistId = null;
let lastResults = [];
let searched = false;
let searchToken = 0;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ---------- Router ----------

function showScreen(name, playlistId) {
  if (name !== 'search') builderPlaylistId = null;   // leaving Search ends builder mode
  if (name === 'playlist') openPlaylistId = playlistId;
  currentScreen = name;

  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  const navKey = name === 'playlist' ? 'home' : name;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === navKey));

  renderActiveScreen();
  window.scrollTo(0, 0);
}

function renderActiveScreen() {
  switch (currentScreen) {
    case 'home':     renderHome(); break;
    case 'liked':    renderLiked(); break;
    case 'search':   renderSearch(); break;
    case 'playlist': renderPlaylistDetail(); break;
  }
}

// ---------- Home ----------

function renderHome() {
  $('greeting').textContent = greeting();
  $('playlist-count').textContent = playlists.length;
  $('playlist-grid').innerHTML = playlists.map(playlistTileHTML).join('') + newPlaylistTileHTML();
}

// ---------- Saved songs ----------

function renderLiked() {
  const n = likedSongs.length;
  $('screen-liked').innerHTML = `
    <div class="screen-head">
      <div>
        <h2 class="screen-title">Saved Songs</h2>
        <p class="screen-sub">${n} song${n === 1 ? '' : 's'}</p>
      </div>
    </div>
    ${n ? `<div class="head-actions"><button class="pill primary" data-action="play-liked">${icon('play')}Play all</button></div>` : ''}
    <div class="song-list">
      ${n ? likedSongs.map(t => trackTileHTML(t)).join('') : '<div class="empty">No liked songs yet. Tap the heart on any song.</div>'}
    </div>`;
}

// ---------- Search + builder ----------

function enterBuilder(pid) {
  showScreen('search');
  builderPlaylistId = pid;
  renderSearch();
  $('searchInput').focus();
}

function exitBuilder() {
  builderPlaylistId = null;
  showScreen('home');
}

function renderBuilderBanner() {
  const el = $('builderBanner');
  const p = builderPlaylistId ? getPlaylist(builderPlaylistId) : null;
  if (!p) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const qn = queue.length;
  el.innerHTML = `
    <div class="bb-info">
      <span class="bb-label">Adding to</span>
      <span class="bb-name">${escapeHtml(p.name)}<span class="bb-count">${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}</span></span>
    </div>
    <div class="bb-actions">
      <button class="pill" data-action="pl-add-queue" ${qn ? '' : 'disabled'}>${icon('queue-add')}Add queue${qn ? ` (${qn})` : ''}</button>
      <button class="pill primary" data-action="builder-done">Done</button>
    </div>`;
}

function renderSearchResults() {
  const el = $('search-results');
  if (!lastResults.length) {
    el.innerHTML = searched
      ? '<div class="empty">No songs found.</div>'
      : `<div class="empty">${builderPlaylistId ? 'Search for songs to add to your playlist.' : 'Search for a song to get started.'}</div>`;
    return;
  }
  const ctx = builderPlaylistId ? { builderId: builderPlaylistId } : {};
  el.innerHTML = lastResults.map(t => trackTileHTML(t, ctx)).join('');
}

function renderSearch() {
  renderBuilderBanner();
  renderSearchResults();
}

async function doSearch() {
  const query = $('searchInput').value.trim();
  if (!query) return;
  const my = ++searchToken;
  $('search-results').innerHTML = '<div class="loading">Searching YouTube Music...</div>';
  try {
    const songs = await apiSearch(query);
    if (my !== searchToken) return;
    lastResults = songs;
    searched = true;
    renderSearchResults();
  } catch (err) {
    if (my !== searchToken) return;
    $('search-results').innerHTML = `<div class="error">Search failed: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Playlist detail ----------

function renderPlaylistDetail() {
  const p = getPlaylist(openPlaylistId);
  if (!p) { showScreen('home'); return; }
  const n = p.tracks.length;
  const pid = escapeHtml(p.id);
  $('screen-playlist').innerHTML = `
    <div class="screen-head">
      <button class="icon-circle" data-action="go-home" aria-label="Back">${icon('back')}</button>
      <div>
        <h2 class="screen-title">${escapeHtml(p.name)}</h2>
        <p class="screen-sub">${n} song${n === 1 ? '' : 's'}</p>
      </div>
    </div>
    <div class="head-actions">
      ${n ? `<button class="pill primary" data-action="play-playlist" data-pid="${pid}">${icon('play')}Play all</button>` : ''}
      <button class="pill" data-action="builder-open" data-pid="${pid}">${icon('plus')}Add songs</button>
      <button class="pill danger" data-action="delete-playlist" data-pid="${pid}" aria-label="Delete playlist">${icon('trash')}</button>
    </div>
    <div class="song-list">
      ${n ? p.tracks.map(t => trackTileHTML(t, { playlistId: p.id })).join('') : '<div class="empty">This playlist is empty. Tap “Add songs”.</div>'}
    </div>`;
}
