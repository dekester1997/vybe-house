// One-time copy of your data from the old (Render) database to the new one (Neon).
// Usage:  OLD_DATABASE_URL="<render external url>" DATABASE_URL="<neon url>" npm run migrate
// Safe to re-run: rows that already exist are skipped (admin password and site content are overwritten).
const { Pool } = require('pg');
const db = require('../server/db');

const OLD = process.env.OLD_DATABASE_URL;
if (!OLD || !process.env.DATABASE_URL) {
  console.error('Set both OLD_DATABASE_URL and DATABASE_URL.');
  process.exit(1);
}
const old = new Pool({ connectionString: OLD, ssl: { rejectUnauthorized: false } });

const TABLES = ['models', 'bookings', 'inquiries', 'testimonials', 'content', 'admin'];
const OVERWRITE = { content: true, admin: true };

(async () => {
  await db.init(); // creates the tables in the new database
  for (const t of TABLES) {
    const { rows } = await old.query('SELECT * FROM ' + t);
    let copied = 0;
    for (const r of rows) {
      const cols = Object.keys(r);
      const names = cols.map((c) => '"' + c + '"').join(', ');
      const marks = cols.map(() => '?').join(', ');
      const conflict = OVERWRITE[t]
        ? ' ON CONFLICT (id) DO UPDATE SET ' + cols.filter((c) => c !== 'id').map((c) => '"' + c + '" = EXCLUDED."' + c + '"').join(', ')
        : ' ON CONFLICT DO NOTHING';
      const res = await db.prepare('INSERT INTO ' + t + ' (' + names + ') VALUES (' + marks + ')' + conflict).run(...cols.map((c) => r[c]));
      copied += res.changes;
    }
    console.log(t + ': ' + rows.length + ' found, ' + copied + ' copied');
  }
  await old.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
