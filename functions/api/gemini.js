// Cloudflare Pages Function: POST /api/gemini
// Keeps the Gemini API key on the server. The browser never sees it.
//
// Environment variables (set in Cloudflare Pages > Settings > Variables, or .dev.vars locally):
//   GEMINI_API_KEY  (required) key from Google AI Studio
//   APP_PASSCODE    (recommended) shared passcode so strangers can't use your quota
//   GEMINI_MODEL    (optional) defaults to "gemini-flash-latest"

const MAX_BYTES = 19_000_000; // Gemini inline requests cap near 20 MB total

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function cleanParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((p) => {
    if (p && typeof p.text === 'string') return [{ text: p.text }];
    const d = p && (p.inline_data || p.inlineData);
    if (d && typeof d.data === 'string' && typeof (d.mime_type || d.mimeType) === 'string') {
      return [{ inline_data: { mime_type: d.mime_type || d.mimeType, data: d.data } }];
    }
    return [];
  });
}

export async function onRequestPost({ request, env }) {
  if (env.APP_PASSCODE && request.headers.get('x-app-pass') !== env.APP_PASSCODE) {
    return json({ error: 'Wrong or missing passcode' }, 401);
  }
  if (!env.GEMINI_API_KEY) return json({ error: 'Server is missing GEMINI_API_KEY' }, 500);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return json({ error: 'File too large. Try one under about 14 MB.' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request body' }, 400); }

  const contents = (Array.isArray(body.contents) ? body.contents : [])
    .map((c) => ({ role: c && c.role === 'model' ? 'model' : 'user', parts: cleanParts(c && c.parts) }))
    .filter((c) => c.parts.length);
  if (!contents.length) return json({ error: 'Nothing to send' }, 400);

  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const payload = {
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1.5) : 0.7
    }
  };
  if (typeof body.system === 'string' && body.system) payload.systemInstruction = { parts: [{ text: body.system }] };

  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ error: 'Could not reach Gemini' }, 502);
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || `Gemini error ${r.status}`;
    return json({ error: r.status === 429 ? 'Free quota used up for now. Try again later.' : msg }, r.status === 429 ? 429 : 502);
  }

  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map((p) => p.text || '').join('');
  if (!text) {
    const why = data.promptFeedback && data.promptFeedback.blockReason;
    return json({ error: 'Gemini returned nothing' + (why ? ` (${why})` : '') }, 502);
  }
  return json({ text });
}

export function onRequest() {
  return json({ error: 'Use POST' }, 405);
}
