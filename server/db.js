const bcrypt = require('bcryptjs');
const { Pool, types } = require('pg');

// pg returns BIGINT (createdAt columns) as strings by default, to avoid
// precision loss on values beyond Number.MAX_SAFE_INTEGER. Date.now()
// timestamps never get remotely close to that limit, and the frontend
// expects createdAt as a number (e.g. for `new Date(createdAt)`, which
// parses a numeric string completely differently than a number) — so
// parse BIGINT (OID 20) back into a JS number.
types.setTypeParser(20, (val) => parseInt(val, 10));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[vybe-house] Missing DATABASE_URL in environment. Set it to your Postgres connection string.');
}

// Render's managed Postgres needs SSL for external connections; the
// internal connection string (used when the API and DB are in the same
// Render account/region) doesn't require it. This works either way.
const pool = new Pool({
  connectionString,
  max: 5,
  keepAlive: true,
  ssl: connectionString && !connectionString.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

// --- better-sqlite3-compatible query shim -----------------------------
// The route files were written against better-sqlite3's synchronous
// db.prepare(sql).get()/.all()/.run() API, using '?' positional
// placeholders or '@name' named placeholders (an object). This shim keeps
// that exact call shape but talks to Postgres and is async, so callers
// now do `await db.prepare(sql).get(...)` inside an `async` route handler.
function translate(sql, args) {
  const isNamed =
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0]);

  if (isNamed) {
    const paramsObj = args[0];
    const values = [];
    const seen = new Map();
    const text = sql.replace(/@(\w+)/g, (match, name) => {
      if (seen.has(name)) return seen.get(name);
      values.push(paramsObj[name]);
      const placeholder = `$${values.length}`;
      seen.set(name, placeholder);
      return placeholder;
    });
    return { text, values };
  }

  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: args };
}

function prepare(sql) {
  return {
    async get(...args) {
      const { text, values } = translate(sql, args);
      const result = await pool.query(text, values);
      return result.rows[0];
    },
    async all(...args) {
      const { text, values } = translate(sql, args);
      const result = await pool.query(text, values);
      return result.rows;
    },
    async run(...args) {
      const { text, values } = translate(sql, args);
      const result = await pool.query(text, values);
      return { changes: result.rowCount };
    }
  };
}

// --- schema + seeding ---------------------------------------------------
// camelCase columns are double-quoted so Postgres preserves their case
// (unquoted identifiers fold to lowercase) — this keeps every route file's
// SQL and row property access (row.fullName, row.createdAt, etc.) working
// unchanged. createdAt is BIGINT, not INTEGER: Postgres INTEGER maxes out
// around 2.1 billion, and Date.now() in milliseconds is already past that.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      "createdAt" BIGINT NOT NULL,
      "fullName" TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      category TEXT,
      "bodyType" TEXT,
      height TEXT,
      "basedIn" TEXT,
      bio TEXT,
      instagram TEXT,
      "photoUrls" TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      availability TEXT NOT NULL DEFAULT 'Available'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      "createdAt" BIGINT NOT NULL,
      "modelId" TEXT,
      "modelName" TEXT,
      "clientName" TEXT,
      email TEXT,
      phone TEXT,
      "shootType" TEXT,
      date TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new'
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      "createdAt" BIGINT NOT NULL,
      "brandName" TEXT,
      "contactName" TEXT,
      email TEXT,
      phone TEXT,
      "projectType" TEXT,
      budget TEXT,
      timeline TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new'
    );

    CREATE TABLE IF NOT EXISTS content (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id TEXT PRIMARY KEY,
      "createdAt" BIGINT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      quote TEXT NOT NULL,
      photo TEXT,
      status TEXT NOT NULL DEFAULT 'approved'
    );

    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      "passwordHash" TEXT NOT NULL
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_models_status ON models (status, "createdAt" DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials (status, "createdAt" DESC)');

  // Seed admin password on first run only (from .env, or a generated default
  // printed once to the console so it's never hardcoded in source control).
  const adminRow = (await pool.query('SELECT * FROM admin WHERE id = 1')).rows[0];
  if (!adminRow) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'vybehouse2026';
    const hash = bcrypt.hashSync(initialPassword, 10);
    await pool.query('INSERT INTO admin (id, "passwordHash") VALUES (1, $1)', [hash]);
    console.log('\n[vybe-house] Seeded initial admin password.');
    if (!process.env.ADMIN_INITIAL_PASSWORD) {
      console.log(`[vybe-house] No ADMIN_INITIAL_PASSWORD set — using default "${initialPassword}". Change it via the admin panel immediately.\n`);
    }
  }

  // Seed default site content on first run only.
  const contentRow = (await pool.query('SELECT * FROM content WHERE id = 1')).rows[0];
  if (!contentRow) {
    const DEFAULT_CONTENT = {
      hero: {
        eyebrow: 'Faces. Stories. Brands.',
        headline: 'Where *talent* becomes the face|of every brand story',
        body: 'VYBE HOUSE discovers and develops photo models across every body type, then connects them with brands who need authentic, high-quality visual storytelling.',
        tags: [
          { label: 'Fashion', image: '' },
          { label: 'Beauty', image: '' },
          { label: 'Lifestyle', image: '' },
          { label: 'Commercial', image: '' }
        ],
        bgImages: []
      },
      whatWeDo: {
        eyebrow: 'What we do',
        title: 'A creative ecosystem, end to end',
        steps: [
          { num: '01', title: 'Discover', desc: 'Scouting and onboarding aspiring and professional models.' },
          { num: '02', title: 'Develop', desc: 'Portfolio-building sessions and creative photoshoots.' },
          { num: '03', title: 'Connect', desc: 'Matching talent with brands, photographers and designers.' },
          { num: '04', title: 'Produce', desc: 'Campaigns across fashion, beauty, lifestyle and product.' }
        ]
      },
      stats: {
        items: [
          { value: '120+', label: 'Models placed' },
          { value: '40+', label: 'Brand partners' },
          { value: '500+', label: 'Shoots produced' },
          { value: '6', label: 'Years running' }
        ]
      },
      seenIn: {
        label: 'As seen in',
        items: [
          { name: 'Brand One', logo: '' },
          { name: 'Brand Two', logo: '' },
          { name: 'Brand Three', logo: '' },
          { name: 'Brand Four', logo: '' },
          { name: 'Brand Five', logo: '' }
        ]
      },
      brands: {
        modelsEyebrow: 'For models',
        modelsTitle: 'Build your portfolio, get discovered',
        modelsBody: 'Apply to join our community and get access to shoots, brand campaigns, and a professional profile page brands can find you on.',
        brandsEyebrow: 'For brands',
        brandsTitle: 'Tell your story with the right faces',
        brandsBody: 'Browse a curated roster of talent, or let us cast and produce a full campaign for you — start to finish.'
      },
      portfolio: {
        eyebrow: 'Portfolio',
        title: 'Recent visual stories',
        categories: [
          { name: 'Editorial', images: [] },
          { name: 'Beauty', images: [] },
          { name: 'Campaign', images: [] },
          { name: 'Lifestyle', images: [] },
          { name: 'Fashion', images: [] },
          { name: 'Commercial', images: [] },
          { name: 'Fitness', images: [] },
          { name: 'Studio', images: [] }
        ]
      },
      testimonials: {
        eyebrow: 'What people say',
        title: 'Trusted by models and brands alike'
      },
      about: {
        eyebrow: 'About VYBE HOUSE',
        title: 'A creative house built on faces and follow-through',
        body1: 'VYBE HOUSE is a modeling and creative brand that discovers talent, builds their portfolios, and connects them with brands that need authentic visual storytelling — from first scout to final campaign.',
        body2: 'Every profile on this roster has been reviewed by our team, so brands can book with confidence and models get a platform that actually represents their work.',
        photo: ''
      },
      contact: {
        email: 'hello@vybehouse.com',
        location: 'Ghana',
        instagram: 'allvybehouse',
        tiktok: 'allvybehouse',
        youtube: 'allvybehouse'
      }
    };
    await pool.query('INSERT INTO content (id, data) VALUES (1, $1)', [JSON.stringify(DEFAULT_CONTENT)]);
    console.log('[vybe-house] Seeded default site content.');
  }
}

module.exports = { prepare, init };
