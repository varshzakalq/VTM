// Playlists: data operations + the bottom sheet (create / add-to-playlist) + builder mode flag.

// When set, the Search screen is in "add songs to this playlist" mode.
let builderPlaylistId = null;
let sheetTarget = null;   // what the "add to playlist" sheet will add: { kind:'track', id } | { kind:'queue' }

// ---------- Data ----------

function getPlaylist(id) { return playlists.find(p => p.id === id) || null; }
function playlistHas(pid, trackId) {
  const p = getPlaylist(pid);
  return !!p && p.tracks.some(t => t.id === trackId);
}

function createPlaylist(name) {
  const clean = String(name || '').trim().slice(0, 40) || `Playlist ${playlists.length + 1}`;
  const p = { id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: clean, tracks: [] };
  playlists.push(p);
  savePlaylists();
  return p;
}

function deletePlaylist(id) {
  playlists = playlists.filter(p => p.id !== id);
  savePlaylists();
}

// Returns how many songs were actually added (duplicates are skipped).
function addTracksToPlaylist(pid, tracks) {
  const p = getPlaylist(pid);
  if (!p) return 0;
  let added = 0;
  (tracks || []).forEach(t => {
    if (t && t.id && !p.tracks.some(x => x.id === t.id)) {
      remember(t);
      p.tracks.push({ id: t.id, title: t.title, artist: t.artist, thumbnail: t.thumbnail });
      added++;
    }
  });
  if (added) savePlaylists();
  return added;
}

function removeTrackFromPlaylist(pid, trackId) {
  const p = getPlaylist(pid);
  if (!p) return;
  p.tracks = p.tracks.filter(t => t.id !== trackId);
  savePlaylists();
}

// ---------- Sheet ----------

const sheetEl = $('sheet');
const sheetBackdrop = $('sheetBackdrop');

function openSheet(title, html) {
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  sheetEl.classList.add('open');
  sheetBackdrop.classList.add('open');
  sheetEl.setAttribute('aria-hidden', 'false');
  const input = $('sheetName');
  if (input) setTimeout(() => input.focus(), 250);
}

function closeSheet() {
  sheetEl.classList.remove('open');
  sheetBackdrop.classList.remove('open');
  sheetEl.setAttribute('aria-hidden', 'true');
}

function newPlaylistRowHTML(action, label) {
  return `
    <div class="sheet-new">
      <input type="text" id="sheetName" placeholder="Playlist name" maxlength="40" autocomplete="off">
      <button class="pill primary" data-sheet="${action}">${label}</button>
    </div>`;
}

// Home "+" tile: name it, then jump to Search to add songs.
function openNewPlaylistSheet() {
  openSheet('New playlist', newPlaylistRowHTML('create-build', 'Create') +
    '<p style="color:var(--muted);font-size:13px;margin-top:12px">You will go to Search, where you can add songs or your whole queue.</p>');
}

// "Add to playlist": pick an existing playlist or create one.
function openPickSheet(target) {
  sheetTarget = target;
  const trackId = target.kind === 'track' ? target.id : null;
  const rows = playlists.map(p => {
    const has = trackId && playlistHas(p.id, trackId);
    const first = p.tracks[0];
    const cover = first ? `<img src="${thumbOf(first)}" alt="">` : icon('playlist-add');
    return `
      <button class="sheet-row" data-sheet="pick" data-pid="${escapeHtml(p.id)}">
        <span class="sr-cover">${cover}</span>
        <span style="display:flex;flex-direction:column;min-width:0">
          <span class="sr-name">${escapeHtml(p.name)}</span>
          <span class="sr-sub">${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}</span>
        </span>
        ${has ? `<span class="sr-check">${icon('check')}</span>` : ''}
      </button>`;
  }).join('');
  const title = target.kind === 'queue' ? 'Save queue to playlist' : 'Add to playlist';
  openSheet(title, rows + newPlaylistRowHTML('create-pick', 'Create'));
}

function applyTargetToPlaylist(pid) {
  const p = getPlaylist(pid);
  if (!p || !sheetTarget) return;
  if (sheetTarget.kind === 'queue') {
    const n = addTracksToPlaylist(pid, queue);
    toast(n ? `Added ${n} song${n === 1 ? '' : 's'} from your queue to “${p.name}”` : `Those songs are already in “${p.name}”`);
  } else {
    const n = addTracksToPlaylist(pid, [trackCache[sheetTarget.id]]);
    toast(n ? `Added to “${p.name}”` : `Already in “${p.name}”`);
  }
  renderActiveScreen();
}

// Sheet clicks (delegated)
$('sheetBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-sheet]');
  if (!btn) return;
  const kind = btn.dataset.sheet;
  const typed = ($('sheetName') || {}).value;

  if (kind === 'pick') {
    applyTargetToPlaylist(btn.dataset.pid);
    closeSheet();
  } else if (kind === 'create-pick') {
    const p = createPlaylist(typed);
    applyTargetToPlaylist(p.id);
    closeSheet();
  } else if (kind === 'create-build') {
    const p = createPlaylist(typed);
    closeSheet();
    enterBuilder(p.id);
  }
});

$('sheetBody').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const primary = $('sheetBody').querySelector('.sheet-new .pill');
  if (primary) primary.click();
});

sheetBackdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
