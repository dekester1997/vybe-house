const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Very small brute-force guard: cap login attempts per IP in memory.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}
function recordFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

router.post('/login', async (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  const row = await db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET || 'dev-only-insecure-secret', { expiresIn: '12h' });
  res.json({ token });
});

router.post('/change-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE admin SET "passwordHash" = ? WHERE id = 1').run(hash);
  res.json({ ok: true });
});

module.exports = router;
