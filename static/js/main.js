// Wires everything together: navigation, click handling, player buttons, init.

// ---------- One click handler for every data-action button ----------

document.addEventListener('click', e => {
  // Clicking anywhere outside the Up Next dropdown closes it
  // (isConnected: a row re-rendered right after a drag leaves a detached target, which is not an outside click)
  if (queueOpen && e.target.isConnected && !e.target.closest('.queue-drop, #queue-toggle-btn')) setQueueOpen(false);

  const nav = e.target.closest('[data-nav]');
  if (nav) { showScreen(nav.dataset.nav); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id, pid } = btn.dataset;
  const index = Number(btn.dataset.index);
  const track = id ? trackCache[id] : null;

  switch (action) {
    // songs
    case 'play':          if (track) playNow(track); break;
    case 'queue':         if (track) addToQueue(track); break;
    case 'like':
      if (track) { toggleLike(track); renderActiveScreen(); syncLikeButtons(); }
      break;
    case 'pick-playlist': if (track) openPickSheet({ kind: 'track', id }); break;

    // playlist builder (Search screen)
    case 'pl-add': {
      if (!track) break;
      const p = getPlaylist(pid);
      const n = addTracksToPlaylist(pid, [track]);
      if (p) toast(n ? `Added to “${p.name}”` : `Already in “${p.name}”`);
      renderActiveScreen();
      break;
    }
    case 'pl-add-queue': {
      const p = getPlaylist(builderPlaylistId);
      if (!p) break;
      if (!queue.length) { toast('Your queue is empty'); break; }
      const n = addTracksToPlaylist(p.id, queue);
      toast(n ? `Added ${n} song${n === 1 ? '' : 's'} from your queue` : 'Everything in your queue is already in this playlist');
      renderActiveScreen();
      break;
    }
    case 'builder-done': exitBuilder(); break;
    case 'builder-open': enterBuilder(pid); break;

    // playlists
    case 'new-playlist':    openNewPlaylistSheet(); break;
    case 'open-playlist':   showScreen('playlist', pid); break;
    case 'go-home':         showScreen('home'); break;
    case 'play-playlist': {
      const p = getPlaylist(pid);
      if (p) playList(p.tracks);
      break;
    }
    case 'pl-remove':       removeTrackFromPlaylist(pid, id); renderActiveScreen(); break;
    case 'delete-playlist': {
      const p = getPlaylist(pid);
      if (p && confirm(`Delete “${p.name}”?`)) { deletePlaylist(pid); showScreen('home'); }
      break;
    }
    case 'play-liked':      playList(likedSongs); break;

    // Up Next dropdown
    case 'queue-play':   playFromUpNext(index); setQueueOpen(false); break;
    case 'queue-remove': removeFromUpNext(index); break;
    case 'clear-queue':  clearUpNext(); break;
    case 'save-queue':
      if (!queue.length) { toast('Your queue is empty'); break; }
      setQueueOpen(false);
      openPickSheet({ kind: 'queue' });
      break;
  }
});

// Enter / Space on the div-buttons (song rows)
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Escape') { setQueueOpen(false); closeFullPlayer(); }
});

// ---------- Search ----------

$('searchBtn').addEventListener('click', doSearch);
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

// ---------- Mini player ----------

$('prevBtn').addEventListener('click', playPreviousTrack);
$('nextBtn').addEventListener('click', playNextTrack);
playPauseBtn.addEventListener('click', togglePlayPause);
$('auto-queue-btn').addEventListener('click', toggleAutoQueue);
$('queue-toggle-btn').addEventListener('click', () => setQueueOpen(!queueOpen));

// Tapping the card itself (not its buttons / dropdown) opens the full player
playerCard.addEventListener('click', e => {
  if (e.target.closest('button, input, .queue-drop')) return;
  openFullPlayer();
});

// ---------- Full player ----------

$('fpClose').addEventListener('click', closeFullPlayer);
$('fpPlayBtn').addEventListener('click', togglePlayPause);
$('fpPrevBtn').addEventListener('click', playPreviousTrack);
$('fpNextBtn').addEventListener('click', playNextTrack);
$('shuffleBtn').addEventListener('click', e => {
  shuffleOn = !shuffleOn; e.currentTarget.classList.toggle('active', shuffleOn);
});
$('repeatBtn').addEventListener('click', e => {
  repeatOn = !repeatOn; e.currentTarget.classList.toggle('active', repeatOn);
});
$('fpLikeBtn').addEventListener('click', () => {
  const t = currentTrack();
  if (!t) return;
  toggleLike(t);
  syncLikeButtons();
  renderActiveScreen();
});
$('fpPlaylistBtn').addEventListener('click', () => {
  const t = currentTrack();
  if (!t) return;
  openPickSheet({ kind: 'track', id: t.id });
});

// ---------- Init ----------

setNowPlaying(null);
syncAutoQueueUI();
renderQueueUI();
syncPlayPauseUI();
fitBodyToDock();
showScreen('home');
