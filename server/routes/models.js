const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { notifyAdmin } = require('../mailer');
const cache = require('../cache');
const { baseUrl, isData, ver, sendDataUrl } = require('../images');

const router = express.Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function slugify(name) {
  return (
    String(name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Math.random().toString(36).slice(2, 6)
  );
}

function rowToModel(row) {
  return { ...row, photoUrls: JSON.parse(row.photoUrls || '[]') };
}

// Public view of a model: each base64 photo becomes a small image URL.
function publicModel(row, req) {
  const m = rowToModel(row);
  const base = baseUrl(req);
  m.photoUrls = m.photoUrls.map((p, i) =>
    isData(p) ? base + '/api/models/' + encodeURIComponent(row.slug) + '/photo/' + i + '?v=' + ver(p) : p
  );
  return m;
}

// Public: list approved models only.
router.get('/', async (req, res) => {
  const key = 'models:list:' + baseUrl(req);
  let body = cache.get(key);
  if (!body) {
    const rows = await db.prepare('SELECT * FROM models WHERE status = \'approved\' ORDER BY "createdAt" DESC').all();
    body = JSON.stringify(rows.map((r) => publicModel(r, req)));
    cache.set(key, body);
  }
  res.set('Cache-Control', cache.cc).type('json').send(body);
});

// Public: one photo of an approved model, as a real image the browser can cache.
router.get('/:slug/photo/:i', async (req, res) => {
  const row = await db.prepare("SELECT \"photoUrls\" FROM models WHERE slug = ? AND status = 'approved'").get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const photos = JSON.parse(row.photoUrls || '[]');
  sendDataUrl(res, photos[parseInt(req.params.i, 10)]);
});

// Public: single approved model by slug (for profile pages).
router.get('/:slug', async (req, res) => {
  const row = await db.prepare("SELECT * FROM models WHERE slug = ? AND status = 'approved'").get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.set('Cache-Control', cache.cc).json(publicModel(row, req));
});

// Public: submit an application. Photos arrive as an array of data-URL
// strings (already compressed client-side, same as the old localStorage flow).
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.fullName || !Array.isArray(b.photoUrls) || b.photoUrls.length === 0) {
    return res.status(400).json({ error: 'fullName and at least one photo are required' });
  }
  const model = {
    id: uid(),
    slug: slugify(b.fullName),
    createdAt: Date.now(),
    fullName: String(b.fullName).trim(),
    email: String(b.email || '').trim(),
    phone: String(b.phone || '').trim(),
    category: b.category || '',
    bodyType: b.bodyType || '',
    height: b.height || '',
    basedIn: b.basedIn || '',
    bio: b.bio || '',
    instagram: b.instagram || '',
    photoUrls: JSON.stringify(b.photoUrls),
    status: 'pending',
    availability: 'Available'
  };
  await db.prepare(
    `INSERT INTO models (id, slug, "createdAt", "fullName", email, phone, category, "bodyType", height, "basedIn", bio, instagram, "photoUrls", status, availability)
     VALUES (@id, @slug, @createdAt, @fullName, @email, @phone, @category, @bodyType, @height, @basedIn, @bio, @instagram, @photoUrls, @status, @availability)`
  ).run(model);
  notifyAdmin('New model application: ' + model.fullName, [
    'Name: ' + model.fullName,
    'Email: ' + model.email,
    'Phone: ' + model.phone,
    'Category: ' + model.category,
    'Based in: ' + model.basedIn,
    '',
    'Review it in the admin dashboard, Applications tab.'
  ]);
  res.status(201).json(rowToModel(model));
});

// Admin: full list regardless of status.
router.get('/admin/all', requireAdmin, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM models ORDER BY "createdAt" DESC').all();
  res.json(rows.map(rowToModel));
});

// Admin: update a model (approve/reject, edit fields, toggle availability).
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const existing = await db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const allowed = [
    'fullName', 'email', 'phone', 'category', 'bodyType', 'height',
    'basedIn', 'bio', 'instagram', 'status', 'availability'
  ];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });
  if (Array.isArray(req.body.photoUrls)) updates.photoUrls = JSON.stringify(req.body.photoUrls);

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = Object.keys(updates).map((k) => `"${k}" = @${k}`).join(', ');
  await db.prepare(`UPDATE models SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const updated = await db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
  res.json(rowToModel(updated));
});

// Admin: delete a model.
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const info = await db.prepare('DELETE FROM models WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
