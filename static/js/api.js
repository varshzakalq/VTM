// Talks to the Flask backend. Endpoints are unchanged from before.

function normalizeTrack(t) {
  return { ...t, id: t.id || t.videoId };
}

async function apiSearch(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
  const songs = await res.json();
  return Array.isArray(songs) ? songs.map(normalizeTrack).filter(t => t.id) : [];
}

async function apiStream(id) {
  const res = await fetch(`/api/stream/${encodeURIComponent(id)}`);
  return res.json();
}

async function apiRelated(id) {
  const res = await fetch(`/api/related/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.tracks || []);
  return list.map(normalizeTrack).filter(t => t.id);
}
