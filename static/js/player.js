// Player UI: mini player, Up Next dropdown, Auto Queue toggle, seek bar, full player.

const audio = $('audioPlayer');
const seekBar = $('seekBar');
const playPauseBtn = $('playPauseBtn');
const playerCard = $('miniPlayer');
const dockEl = document.querySelector('.dock');
const fullPlayer = $('full-player');
const arcEl = $('arc');

let isSeeking = false;
let queueOpen = false;
let arcDragging = false;

// ---------- Now playing ----------

function setNowPlaying(track, titleOverride) {
  if (!track) {
    $('currentTitle').textContent = 'Select a song to play';
    $('currentArtist').textContent = '--';
    $('currentThumb').src = FALLBACK_IMG;
    $('fpTitle').textContent = 'Nothing playing';
    $('fpArtist').textContent = '--';
    $('uCover').style.backgroundImage = 'none';
    syncLikeButtons();
    return;
  }
  const title = titleOverride || track.title;
  $('currentThumb').dataset.fb = '';
  $('currentTitle').textContent = title;
  $('currentArtist').textContent = track.artist;
  $('currentThumb').src = track.thumbnail || FALLBACK_IMG;
  $('fpTitle').textContent = title;
  $('fpArtist').textContent = track.artist;
  const big = (track.thumbnail || '').replace(/=w\d+-h\d+[^&]*/, '=w600-h600-l90-rj');
  $('uCover').style.backgroundImage = big ? `url("${big}")` : 'none';
  syncLikeButtons();
}

// Temporary status in the title line (e.g. while Auto Queue searches)
function setStatusTitle(text) {
  const t = currentTrack();
  if (t) setNowPlaying(t, text);
}

function stopPlayback() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setNowPlaying(null);
  resetSeek();
  refreshArc();
  syncPlayPauseUI();
  closeFullPlayer();
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    artwork: [{ src: track.thumbnail || FALLBACK_IMG, sizes: '512x512', type: 'image/jpeg' }]
  });
  navigator.mediaSession.setActionHandler('previoustrack', playPreviousTrack);
  navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
}

function syncLikeButtons() {
  const t = currentTrack();
  const liked = !!t && isLiked(t.id);
  const btn = $('fpLikeBtn');
  btn.classList.toggle('liked', liked);
  btn.innerHTML = icon(liked ? 'heart-fill' : 'heart');
}

// ---------- Auto Queue toggle ----------

function syncAutoQueueUI() {
  const btn = $('auto-queue-btn');
  btn.classList.toggle('active', autoQueueEnabled);
  btn.setAttribute('aria-pressed', String(autoQueueEnabled));
  btn.querySelector('.toggle-label').textContent = `Auto Queue: ${autoQueueEnabled ? 'ON' : 'OFF'}`;
}

function toggleAutoQueue() {
  autoQueueEnabled = !autoQueueEnabled;
  store.set('autoQueue', autoQueueEnabled);
  syncAutoQueueUI();
  if (autoQueueEnabled) maybeAutoQueue();
}

// ---------- Up Next dropdown ----------

let queueDragging = false;   // while true, the list is not re-rendered under the finger
let drag = null;

function renderQueueUI() {
  const upNext = queue.slice(1);
  $('queue-count').textContent = upNext.length;
  $('queue-meta').textContent = `${queue.length}/${QUEUE_MAX} in queue`;
  if (queueDragging) return;

  $('queue-list').innerHTML = upNext.length
    ? upNext.map((t, i) => `
        <div class="qd-row">
          <div class="qd-grip" aria-label="Drag to reorder" title="Drag to reorder">${icon('grip')}</div>
          <div class="qd-main" role="button" tabindex="0" data-action="queue-play" data-index="${i + 1}">
            <img src="${thumbOf(t)}" alt="">
            <div class="song-info">
              <div class="song-title">${escapeHtml(t.title)}</div>
              <div class="song-artist">${escapeHtml(t.artist)}${t.manual ? '<span class="qd-tag">Added</span>' : ''}</div>
            </div>
          </div>
          <button class="qd-x" data-action="queue-remove" data-index="${i + 1}" aria-label="Remove from queue">${icon('x')}</button>
        </div>`).join('')
    : `<div class="empty">${currentTrack() ? 'Nothing up next.' : 'Queue is empty.'}</div>`;
}

// ---------- Drag to reorder (mouse + touch) ----------
// Rows slide out of the way while you drag; the queue is only changed when you let go.

function dragUpdate() {
  if (!drag) return;
  const { rows, from, h } = drag;
  const dy = (drag.lastY - drag.startY) + (drag.list.scrollTop - drag.startScroll);
  const clamped = Math.max(-from * h, Math.min((rows.length - 1 - from) * h, dy));
  const to = Math.max(0, Math.min(rows.length - 1, Math.round(from + clamped / h)));
  drag.to = to;
  rows.forEach((r, i) => {
    if (i === from) { r.style.transform = `translateY(${clamped}px)`; return; }
    let shift = 0;
    if (from < to && i > from && i <= to) shift = -h;
    else if (from > to && i < from && i >= to) shift = h;
    r.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}

// Scroll the list when the finger is near its top or bottom edge
function dragAutoScroll() {
  if (!drag) return;
  const rect = drag.list.getBoundingClientRect();
  const edge = 36;
  let v = 0;
  if (drag.lastY < rect.top + edge) v = -8;
  else if (drag.lastY > rect.bottom - edge) v = 8;
  if (v) { drag.list.scrollTop += v; dragUpdate(); }
  drag.raf = requestAnimationFrame(dragAutoScroll);
}

function endDrag(commit) {
  if (!drag) return;
  cancelAnimationFrame(drag.raf);
  const { from, to, rows } = drag;
  drag = null;
  rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
  queueDragging = false;
  if (commit && from !== to) moveInUpNext(from + 1, to + 1);   // +1: queue[0] is the playing song
  else renderQueueUI();
}

(function initQueueDrag() {
  const list = $('queue-list');

  list.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.qd-grip');
    if (!grip || drag) return;
    const row = grip.closest('.qd-row');
    const rows = [...list.querySelectorAll('.qd-row')];
    const from = rows.indexOf(row);
    if (from < 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    queueDragging = true;
    drag = {
      list, rows, from, to: from, id: e.pointerId,
      h: row.getBoundingClientRect().height,
      startY: e.clientY, lastY: e.clientY, startScroll: list.scrollTop, raf: 0
    };
    row.classList.add('dragging');
    drag.raf = requestAnimationFrame(dragAutoScroll);
  });

  list.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.lastY = e.clientY;
    dragUpdate();
  });
  list.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) endDrag(true); });
  list.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(false); });
})();

function setQueueOpen(open) {
  queueOpen = open;
  $('queueDrop').classList.toggle('open', open);
  $('queue-toggle-btn').setAttribute('aria-expanded', String(open));
}

// ---------- Seek bar + play/pause ----------

function setSeekFill() { seekBar.style.setProperty('--seek', seekBar.value + '%'); }
function resetSeek() { seekBar.value = 0; setSeekFill(); }

audio.addEventListener('timeupdate', () => {
  if (isSeeking || !isFinite(audio.duration) || audio.duration === 0) return;
  seekBar.value = (audio.currentTime / audio.duration) * 100;
  setSeekFill();
});
audio.addEventListener('loadstart', resetSeek);

seekBar.addEventListener('input', () => { isSeeking = true; setSeekFill(); });
seekBar.addEventListener('change', () => {
  if (isFinite(audio.duration)) audio.currentTime = (seekBar.value / 100) * audio.duration;
  isSeeking = false;
});

function syncPlayPauseUI() {
  const html = icon(audio.paused ? 'play' : 'pause');
  playPauseBtn.innerHTML = html;
  $('fpPlayBtn').innerHTML = html;
}
audio.addEventListener('play', syncPlayPauseUI);
audio.addEventListener('pause', syncPlayPauseUI);

// A finished song is removed from the queue by playNextTrack()
audio.addEventListener('ended', () => {
  if (repeatOn) { audio.currentTime = 0; audio.play(); }
  else playNextTrack();
});

function togglePlayPause() {
  if (!audio.getAttribute('src')) return;
  if (audio.paused) audio.play(); else audio.pause();
}

// ---------- Keep page content clear of the dock ----------

function fitBodyToDock() { document.body.style.paddingBottom = (dockEl.offsetHeight + 28) + 'px'; }
if ('ResizeObserver' in window) new ResizeObserver(fitBodyToDock).observe(dockEl);
window.addEventListener('resize', fitBodyToDock);

// ---------- Full player ----------

const ARC = { cx: 160, cy: 14, r: 146 };

function openFullPlayer() {
  if (!currentTrack()) return;
  setQueueOpen(false);
  syncLikeButtons();
  fullPlayer.classList.add('open');
  fullPlayer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}
function closeFullPlayer() {
  fullPlayer.classList.remove('open');
  fullPlayer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

function drawArc(f) {
  const a = f * Math.PI;
  $('arcProgress').setAttribute('stroke-dasharray', `${f * 100} 100`);
  const knob = $('arcKnob');
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
  const d = audio.duration;
  const f = isFinite(d) && d > 0 ? audio.currentTime / d : 0;
  drawArc(f);
  $('fpTime').textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(d)}`;
}
audio.addEventListener('timeupdate', () => { if (!arcDragging) refreshArc(); });
audio.addEventListener('loadedmetadata', refreshArc);

arcEl.addEventListener('pointerdown', e => { arcDragging = true; arcEl.setPointerCapture(e.pointerId); drawArc(arcFraction(e.clientX)); });
arcEl.addEventListener('pointermove', e => { if (arcDragging) drawArc(arcFraction(e.clientX)); });
arcEl.addEventListener('pointerup', e => {
  if (!arcDragging) return;
  arcDragging = false;
  if (isFinite(audio.duration)) audio.currentTime = arcFraction(e.clientX) * audio.duration;
});
