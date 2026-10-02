// Local / traditional-host entry point (npm start). On Vercel, api/index.js is used instead.
require('dotenv').config();
const app = require('./app');
const db = require('./db');
const PORT = process.env.PORT || 4000;
db.init()
  .then(() => app.listen(PORT, () => console.log('[vybe-house] API listening on http://localhost:' + PORT)))
  .catch((err) => { console.error('[vybe-house] Failed to initialize database:', err); process.exit(1); });
