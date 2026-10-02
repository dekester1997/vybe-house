// Vercel entry point: every /api/* request lands here.
const app = require('../server/app');
const db = require('../server/db');

let ready = null; // schema check runs once per warm instance, not per request
module.exports = async (req, res) => {
  try {
    ready = ready || db.init();
    await ready;
  } catch (err) {
    ready = null;
    console.error('[vybe-house] DB init failed:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Database unavailable' }));
  }
  return app(req, res);
};
