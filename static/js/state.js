// App state that survives reloads (liked songs, playlists, auto-queue) plus small UI flags.

let likedSongs = store.get('likedSongs', []);
if (!Array.isArray(likedSongs)) likedSongs = [];

// playlists: [{ id, name, tracks: [track, ...] }]
let playlists = store.get('playlists', []);
if (!Array.isArray(playlists)) playlists = [];

let autoQueueEnabled = store.get('autoQueue', true) !== false;

let shuffleOn = false;
let repeatOn = false;

function isLiked(id) { return likedSongs.some(s => s.id === id); }

function toggleLike(track) {
  if (!track) return;
  const i = likedSongs.findIndex(s => s.id === track.id);
  if (i > -1) likedSongs.splice(i, 1);
  else likedSongs.push(track);
  store.set('likedSongs', likedSongs);
}

function savePlaylists() { store.set('playlists', playlists); }
