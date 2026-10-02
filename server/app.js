require('express-async-errors'); // a failed query returns an error instead of hanging
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cache = require('./cache');

const db = require('./db');

const authRoutes = require('./routes/auth');
const modelsRoutes = require('./routes/models');
const bookingsRoutes = require('./routes/bookings');
const inquiriesRoutes = require('./routes/inquiries');
const contentRoutes = require('./routes/content');
const testimonialsRoutes = require('./routes/testimonials');

const app = express();

app.set('trust proxy', 1);
app.use(compression());
app.use(cors({ maxAge: 86400 })); // browsers remember the CORS check for a day
// Any write clears the public cache so edits show up immediately.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'OPTIONS' && req.method !== 'HEAD') res.on('finish', cache.clear);
  next();
});
// Model applications include several compressed base64 photos, so allow a
// generous body size.
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/inquiries', inquiriesRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/testimonials', testimonialsRoutes);
app.use('/api/upload', require('./routes/upload'));

// Basic error handler so a thrown error returns JSON instead of an HTML stack trace.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});


module.exports = app;
