const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { notifyAdmin } = require('../mailer');

const router = express.Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Public: submit a booking request.
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.clientName || !b.email) {
    return res.status(400).json({ error: 'clientName and email are required' });
  }
  const booking = {
    id: uid(),
    createdAt: Date.now(),
    modelId: b.modelId || '',
    modelName: b.modelName || '',
    clientName: String(b.clientName).trim(),
    email: String(b.email).trim(),
    phone: String(b.phone || '').trim(),
    shootType: b.shootType || '',
    date: b.date || '',
    message: b.message || '',
    status: 'new'
  };
  await db.prepare(
    `INSERT INTO bookings (id, "createdAt", "modelId", "modelName", "clientName", email, phone, "shootType", date, message, status)
     VALUES (@id, @createdAt, @modelId, @modelName, @clientName, @email, @phone, @shootType, @date, @message, @status)`
  ).run(booking);
  notifyAdmin('New booking request from ' + booking.clientName, [
    'For model: ' + (booking.modelName || '—'),
    'Client: ' + booking.clientName,
    'Email: ' + booking.email,
    'Phone: ' + booking.phone,
    'Shoot type: ' + booking.shootType,
    'Date: ' + booking.date,
    'Message: ' + booking.message
  ]);
  res.status(201).json(booking);
});

// Admin: list all bookings.
router.get('/admin/all', requireAdmin, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM bookings ORDER BY "createdAt" DESC').all();
  res.json(rows);
});

// Admin: update status (e.g. new -> confirmed -> done).
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const existing = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const status = req.body.status || existing.status;
  await db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ...existing, status });
});

// Admin: delete a booking.
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const info = await db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
