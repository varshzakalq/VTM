// Shared helpers: DOM lookup, storage, formatting, toast.

const $ = id => document.getElementById(id);

// No quote characters inside, so it is safe to use anywhere in HTML or JS strings.
const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2750%27 height=%2750%27%3E%3Crect width=%2750%27 height=%2750%27 fill=%27%232a2a36%27/%3E%3C/svg%3E";

// Any <img> that fails to load gets the placeholder (replaces inline onerror handlers).
document.addEventListener('error', e => {
  const el = e.target;
  if (el && el.tagName === 'IMG' && el.dataset.fb !== '1') {
    el.dataset.fb = '1';
    el.src = FALLBACK_IMG;
  }
}, true);

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function icon(name) { return `<svg class="ico"><use href="#i-${name}"/></svg>`; }
function thumbOf(track) { return escapeHtml((track && track.thumbnail) || FALLBACK_IMG); }
function fmtTime(t) {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// id -> track, so buttons only need to carry the id
const trackCache = {};
function remember(track) { if (track && track.id) trackCache[track.id] = track; }

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
