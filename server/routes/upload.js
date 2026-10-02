// Image uploads go to Vercel Blob (real image storage with a CDN),
// so the database only keeps a short link instead of the whole photo.
const express = require('express');
const { put } = require('@vercel/blob');

const router = express.Router();

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function looksLikeImage(buf, type) {
  if (type === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/png') return buf.slice(0, 4).toString('hex') === '89504e47';
  if (type === 'image/webp') return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return false;
}

// Simple per-visitor limit so the open upload endpoint can't be used to fill the storage.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 10 * 60 * 1000 }); return false; }
  return ++h.n > 60;
}

router.post('/', express.raw({ type: Object.keys(TYPES), limit: '4mb' }), async (req, res) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Image storage is not set up' });
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many uploads, try again soon' });
  const type = (req.headers['content-type'] || '').split(';')[0];
  if (!TYPES[type] || !Buffer.isBuffer(req.body) || req.body.length < 100 || !looksLikeImage(req.body, type)) {
    return res.status(400).json({ error: 'Send a JPEG, PNG or WebP image' });
  }
  const blob = await put('vybe/' + Date.now() + '.' + TYPES[type], req.body, {
    access: 'public',
    contentType: type,
    addRandomSuffix: true,
    cacheControlMaxAge: 31536000
  });
  res.json({ url: blob.url });
});

module.exports = router;
