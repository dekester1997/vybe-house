// One-time job: moves every photo stored inside the database into Vercel Blob
// and leaves a short link behind. Safe to re-run (only touches embedded photos).
// Usage:  DATABASE_URL="<neon url>" BLOB_READ_WRITE_TOKEN="<token>" npm run move-photos
const { put } = require('@vercel/blob');
const db = require('../server/db');
const { isData, mapData } = require('../server/images');

if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Set both DATABASE_URL and BLOB_READ_WRITE_TOKEN.');
  process.exit(1);
}

const done = new Map(); // identical photos are uploaded once
let uploaded = 0;
async function toBlob(dataUrl) {
  if (done.has(dataUrl)) return done.get(dataUrl);
  const m = /^data:([\w\/+.-]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) return dataUrl;
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg').replace('+xml', '');
  const blob = await put('vybe/' + Date.now() + '.' + ext, Buffer.from(m[2], 'base64'), {
    access: 'public', contentType: m[1], addRandomSuffix: true, cacheControlMaxAge: 31536000
  });
  uploaded++;
  done.set(dataUrl, blob.url);
  return blob.url;
}

(async () => {
  await db.init();

  for (const r of await db.prepare('SELECT id, "photoUrls" FROM models').all()) {
    const list = JSON.parse(r.photoUrls || '[]');
    if (!list.some(isData)) continue;
    const out = [];
    for (const p of list) out.push(isData(p) ? await toBlob(p) : p);
    await db.prepare('UPDATE models SET "photoUrls" = ? WHERE id = ?').run(JSON.stringify(out), r.id);
    console.log('model ' + r.id + ': ' + list.length + ' photos moved');
  }

  for (const r of await db.prepare('SELECT id, photo FROM testimonials').all()) {
    if (!isData(r.photo)) continue;
    await db.prepare('UPDATE testimonials SET photo = ? WHERE id = ?').run(await toBlob(r.photo), r.id);
    console.log('testimonial ' + r.id + ': photo moved');
  }

  const row = await db.prepare('SELECT data FROM content WHERE id = 1').get();
  if (row) {
    const data = JSON.parse(row.data);
    const found = [];
    mapData(data, (s) => { found.push(s); return s; });
    if (found.length) {
      const links = [];
      for (const s of found) links.push(await toBlob(s));
      await db.prepare('UPDATE content SET data = ? WHERE id = 1').run(JSON.stringify(mapData(data, (s, i) => links[i])));
      console.log('site content: ' + found.length + ' images moved');
    }
  }

  console.log('Done. ' + uploaded + ' photos uploaded to Blob.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
