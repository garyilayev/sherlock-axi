// Last opened entities, for Spotlight's "Recent" group. Kept in memory and
// mirrored to localStorage (which may be unavailable, e.g. in private mode).
const KEY = 'sherlock.recent';
const MAX = 6;
let recent = null;

export function getRecent() {
  if (recent) return recent;
  try { recent = JSON.parse(localStorage.getItem(KEY) || '[]').filter((x) => typeof x === 'string').slice(0, MAX); } catch { recent = []; }
  return recent;
}

export function addRecent(id) {
  if (!id) return;
  recent = [id, ...getRecent().filter((x) => x !== id)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(recent)); } catch { /* ignore */ }
}
