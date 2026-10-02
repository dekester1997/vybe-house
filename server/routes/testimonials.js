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

// Public: approved testimonials for the homepage, newest first.
router.get('/', async (req, res) => {
  const key = 'testimonials:list:' + baseUrl(req);
  let body = cache.get(key);
  if (!body) {
    const base = baseUrl(req);
    const rows = await db.prepare("SELECT * FROM testimonials WHERE status = 'approved' ORDER BY \"createdAt\" DESC").all();
    body = JSON.stringify(rows.map((r) => (isData(r.photo)
      ? { ...r, photo: base + '/api/testimonials/img/' + encodeURIComponent(r.id) + '?v=' + ver(r.photo) }
      : r)));
    cache.set(key, body);
  }
  res.set('Cache-Control', cache.cc).type('json').send(body);
});

// Public: a testimonial's photo as a cacheable image.
router.get('/img/:id', async (req, res) => {
  const row = await db.prepare("SELECT photo FROM testimonials WHERE id = ? AND status = 'approved'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  sendDataUrl(res, row.photo);
});

// Public: submit a testimonial. It goes live immediately (no admin step)
// so people can share their own story without waiting on anyone — the
// admin dashboard's Testimonials tab can hide or delete one afterwards
// if it's ever inappropriate or spam.
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.quote) {
    return res.status(400).json({ error: 'name and quote are required' });
  }
  const testimonial = {
    id: uid(),
    createdAt: Date.now(),
    name: String(b.name).trim(),
    role: String(b.role || '').trim(),
    quote: String(b.quote).trim(),
    photo: b.photo || '',
    status: 'approved'
  };
  await db.prepare(
    `INSERT INTO testimonials (id, "createdAt", name, role, quote, photo, status)
     VALUES (@id, @createdAt, @name, @role, @quote, @photo, @status)`
  ).run(testimonial);
  notifyAdmin('New testimonial from ' + testimonial.name, [
    'Name: ' + testimonial.name,
    'Role: ' + testimonial.role,
    'Quote: ' + testimonial.quote,
    '',
    'It is already live on the site. Remove it from the admin dashboard, Testimonials tab, if needed.'
  ]);
  res.status(201).json(testimonial);
});

// Admin: every testimonial regardless of status (for moderation).
router.get('/admin/all', requireAdmin, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM testimonials ORDER BY "createdAt" DESC').all();
  res.json(rows);
});

// Admin: hide/unhide (status toggle) or edit a testimonial.
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const existing = await db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const allowed = ['name', 'role', 'quote', 'photo', 'status'];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = Object.keys(updates).map((k) => `"${k}" = @${k}`).join(', ');
  await db.prepare(`UPDATE testimonials SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const updated = await db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const info = await db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
