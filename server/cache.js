// Tiny in-memory cache for public responses (pre-built JSON strings).
// Cleared automatically after any write (POST/PUT/PATCH/DELETE), so the
// admin's changes show up straight away.
const store = new Map();
const TTL = process.env.VERCEL ? 20 * 1000 : 5 * 60 * 1000; // several instances on Vercel, so keep it short
function get(key) {
  const e = store.get(key);
  if (e && e.exp > Date.now()) return e.v;
  store.delete(key);
  return null;
}
function set(key, v) { store.set(key, { v, exp: Date.now() + TTL }); }
function clear() { store.clear(); }
// On Vercel the edge network keeps a copy and serves it instantly, refreshing in the background.
const cc = process.env.VERCEL
  ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=3600'
  : 'no-cache';
module.exports = { get, set, clear, cc };
