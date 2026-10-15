/* LOCAL TEST STUB ONLY - not part of the app.
 * Serves public/ statically and implements the same POST /api/gemini contract
 * as functions/api/gemini.js, but calls Google via curl (this sandbox's
 * workerd runtime has no direct egress; curl goes through the egress proxy).
 * Reads GEMINI_API_KEY / APP_PASSCODE from ../.dev.vars (same as wrangler).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const PORT = 8901;

const env = {};
fs.readFileSync(path.join(ROOT, '.dev.vars'), 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !m[1].startsWith('#')) env[m[1]] = m[2];
});
const PASS = env.APP_PASSCODE || '';
const KEY = env.GEMINI_API_KEY || '';
const MODEL = env.GEMINI_MODEL || 'gemini-flash-latest';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
};

const json = (res, obj, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

function callGemini(payload) {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(KEY)}`;
    execFile('curl', ['-s', '--max-time', '180', '-X', 'POST', url,
      '-H', 'content-type: application/json', '-d', JSON.stringify(payload)],
      { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('curl to Google failed: ' + err.message));
        try { resolve(JSON.parse(stdout)); }
        catch { reject(new Error('Google returned non-JSON (' + String(stdout).slice(0, 120) + ')')); }
      });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/gemini') {
    if (req.method !== 'POST') return json(res, { error: 'Use POST' }, 405);
    let body = '';
    for await (const c of req) body += c;
    if (PASS && req.headers['x-app-pass'] !== PASS) return json(res, { error: 'Wrong or missing passcode' }, 401);
    let j;
    try { j = JSON.parse(body); } catch { return json(res, { error: 'Bad request body' }, 400); }
    const contents = (Array.isArray(j.contents) ? j.contents : []).filter((c) => c && Array.isArray(c.parts) && c.parts.length);
    if (!contents.length) return json(res, { error: 'Nothing to send' }, 400);
    const payload = {
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: typeof j.temperature === 'number' ? Math.min(Math.max(j.temperature, 0), 1.5) : 0.7,
      },
    };
    if (typeof j.system === 'string' && j.system) payload.systemInstruction = { parts: [{ text: j.system }] };
    try {
      const data = await callGemini(payload);
      if (data.error) {
        const msg = data.error.message || 'Gemini error';
        const code = /quota|429/i.test(msg) ? 429 : 502;
        return json(res, { error: code === 429 ? 'Free quota used up for now. Try again later.' : msg }, code);
      }
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.map((p) => p.text || '').join('');
      if (!text) {
        const why = (data.promptFeedback || {}).blockReason;
        return json(res, { error: 'Gemini returned nothing' + (why ? ` (${why})` : '') }, 502);
      }
      return json(res, { text });
    } catch (e) { return json(res, { error: e.message }, 502); }
  }
  // static
  let p = path.normalize(path.join(PUB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)));
  if (!p.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`stub up on http://127.0.0.1:${PORT}`));
