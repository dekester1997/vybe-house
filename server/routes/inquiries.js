const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { notifyAdmin } = require('../mailer');

const router = express.Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Public: submit a "start a project" brief from a brand.
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.brandName || !b.contactName || !b.email) {
    return res.status(400).json({ error: 'brandName, contactName and email are required' });
  }
  const inquiry = {
    id: uid(),
    createdAt: Date.now(),
    brandName: String(b.brandName).trim(),
    contactName: String(b.contactName).trim(),
    email: String(b.email).trim(),
    phone: String(b.phone || '').trim(),
    projectType: b.projectType || '',
    budget: b.budget || '',
    timeline: b.timeline || '',
    message: b.message || '',
    status: 'new'
  };
  await db.prepare(
    `INSERT INTO inquiries (id, "createdAt", "brandName", "contactName", email, phone, "projectType", budget, timeline, message, status)
     VALUES (@id, @createdAt, @brandName, @contactName, @email, @phone, @projectType, @budget, @timeline, @message, @status)`
  ).run(inquiry);
  notifyAdmin('New project brief from ' + inquiry.brandName, [
    'Brand: ' + inquiry.brandName,
    'Contact: ' + inquiry.contactName,
    'Email: ' + inquiry.email,
    'Phone: ' + inquiry.phone,
    'Project type: ' + inquiry.projectType,
    'Budget: ' + inquiry.budget,
    'Timeline: ' + inquiry.timeline,
    'Message: ' + inquiry.message
  ]);
  res.status(201).json(inquiry);
});

// Admin: list all inquiries.
router.get('/admin/all', requireAdmin, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM inquiries ORDER BY "createdAt" DESC').all();
  res.json(rows);
});

router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const existing = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const status = req.body.status || existing.status;
  await db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ...existing, status });
});

router.delete('/admin/:id', requireAdmin, async (req, res) => {
  const info = await db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
