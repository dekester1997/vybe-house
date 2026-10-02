const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const cache = require('../cache');
const { baseUrl, ver, sendDataUrl, mapData } = require('../images');

const router = express.Router();

// Public: fetch the current editable site content (hero, portfolio, etc).
// ?slim=1 (used by the public site) swaps embedded base64 images for image URLs.
// Without it you get the full object, which the admin editor needs to save back.
router.get('/', async (req, res) => {
  if (!req.query.slim) {
    const row = await db.prepare('SELECT data FROM content WHERE id = 1').get();
    return res.json(JSON.parse(row.data));
  }
  const key = 'content:slim:' + baseUrl(req);
  let body = cache.get(key);
  if (!body) {
    const row = await db.prepare('SELECT data FROM content WHERE id = 1').get();
    const base = baseUrl(req);
    body = JSON.stringify(mapData(JSON.parse(row.data), (s, i) => base + '/api/content/img/' + i + '?v=' + ver(s)));
    cache.set(key, body);
  }
  res.set('Cache-Control', cache.cc).type('json').send(body);
});

// Public: one embedded image from the site content, as a cacheable image.
router.get('/img/:i', async (req, res) => {
  const row = await db.prepare('SELECT data FROM content WHERE id = 1').get();
  const want = parseInt(req.params.i, 10);
  let found = null;
  mapData(JSON.parse(row.data), (s, i) => { if (i === want) found = s; return s; });
  sendDataUrl(res, found);
});

// Admin: overwrite site content (the admin panel sends the full object back,
// same shape as the old localStorage DEFAULT_CONTENT).
router.put('/', requireAdmin, async (req, res) => {
  const content = req.body;
  if (!content || typeof content !== 'object') {
    return res.status(400).json({ error: 'Body must be a content object' });
  }
  await db.prepare('UPDATE content SET data = ? WHERE id = 1').run(JSON.stringify(content));
  res.json(content);
});

module.exports = router;
