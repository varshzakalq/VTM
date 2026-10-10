// HTML builders for song rows and playlist tiles.

// ctx: { builderId } -> Search screen in playlist-builder mode (shows a + for that playlist)
//      { playlistId } -> row inside a playlist detail (shows a remove button)
//      {}             -> normal row (shows "add to playlist")
function trackTileHTML(track, ctx = {}) {
  remember(track);
  const id = escapeHtml(track.id);
  const cur = currentTrack();
  const playing = !!cur && cur.id === track.id;
  const liked = isLiked(track.id);
  const queued = inQueue(track.id);

  let last;
  if (ctx.builderId) {
    const has = playlistHas(ctx.builderId, track.id);
    last = `<button class="act-add ${has ? 'done' : ''}" data-action="pl-add" data-id="${id}" data-pid="${escapeHtml(ctx.builderId)}"
              aria-label="${has ? 'Already in playlist' : 'Add to playlist'}" title="${has ? 'In playlist' : 'Add to playlist'}">${icon(has ? 'check' : 'plus')}</button>`;
  } else if (ctx.playlistId) {
    last = `<button data-action="pl-remove" data-id="${id}" data-pid="${escapeHtml(ctx.playlistId)}" aria-label="Remove from playlist" title="Remove from playlist">${icon('x')}</button>`;
  } else {
    last = `<button data-action="pick-playlist" data-id="${id}" aria-label="Add to playlist" title="Add to playlist">${icon('playlist-add')}</button>`;
  }

  return `
    <div class="song-card ${playing ? 'playing' : ''}">
      <div class="song-main" role="button" tabindex="0" data-action="play" data-id="${id}">
        <img src="${thumbOf(track)}" alt="">
        <div class="song-info">
          <div class="song-title">${escapeHtml(track.title)}</div>
          <div class="song-artist">${escapeHtml(track.artist)}</div>
        </div>
      </div>
      <div class="actions">
        <button class="${queued ? 'done' : ''}" data-action="queue" data-id="${id}" aria-label="Add to queue" title="Add to queue">${icon(queued ? 'check' : 'queue-add')}</button>
        <button class="like-btn ${liked ? 'liked' : ''}" data-action="like" data-id="${id}" aria-label="Like" title="Like">${icon(liked ? 'heart-fill' : 'heart')}</button>
        ${last}
      </div>
    </div>`;
}

function playlistCoverHTML(p) {
  const thumbs = [];
  p.tracks.forEach(t => { if (t.thumbnail && thumbs.length < 4 && !thumbs.includes(t.thumbnail)) thumbs.push(t.thumbnail); });
  if (thumbs.length >= 4) {
    return `<div class="pl-cover mosaic">${thumbs.map(src => `<img src="${escapeHtml(src)}" alt="">`).join('')}</div>`;
  }
  if (thumbs.length) {
    return `<div class="pl-cover single"><img src="${escapeHtml(thumbs[0])}" alt=""></div>`;
  }
  return `<div class="pl-cover">${icon('playlist-add')}</div>`;
}

function playlistTileHTML(p) {
  const n = p.tracks.length;
  return `
    <button class="pl-tile" data-action="open-playlist" data-pid="${escapeHtml(p.id)}">
      ${playlistCoverHTML(p)}
      <div class="pl-name">${escapeHtml(p.name)}</div>
      <div class="pl-sub">${n} song${n === 1 ? '' : 's'}</div>
    </button>`;
}

// The "+" tile, shaped like a playlist
function newPlaylistTileHTML() {
  return `
    <button class="pl-tile add" data-action="new-playlist" aria-label="Create a playlist">
      <div class="pl-cover">${icon('plus')}</div>
      <div class="pl-name">New playlist</div>
      <div class="pl-sub">Tap to create</div>
    </button>`;
}
