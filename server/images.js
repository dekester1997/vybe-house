// Photos are stored as base64 data URLs. Instead of sending them inside the
// JSON (huge), public routes swap each one for a small image URL. The browser
// then loads and caches every image on its own.
function baseUrl(req) {
  return (process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
}
function isData(s) { return typeof s === 'string' && s.indexOf('data:') === 0; }
function ver(s) { return s.length.toString(36); }

function sendDataUrl(res, dataUrl) {
  const m = /^data:([\w\/+.-]+);base64,([\s\S]*)$/.exec(dataUrl || '');
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.set({
    'Content-Type': m[1],
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  res.send(Buffer.from(m[2], 'base64'));
}

// Walks an object in a fixed order; fn(dataUrl, index) returns its replacement.
function mapData(node, fn, counter) {
  counter = counter || { n: 0 };
  if (isData(node)) return fn(node, counter.n++);
  if (Array.isArray(node)) return node.map((x) => mapData(x, fn, counter));
  if (node && typeof node === 'object') {
    const out = {};
    Object.keys(node).forEach((k) => { out[k] = mapData(node[k], fn, counter); });
    return out;
  }
  return node;
}

module.exports = { baseUrl, isData, ver, sendDataUrl, mapData };
