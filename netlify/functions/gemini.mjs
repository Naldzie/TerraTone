/* Gemini proxy — lets every visitor use the site owner's Gemini key without
 * the key ever reaching the browser. The key lives in the Netlify environment
 * variable GEMINI_API_KEY (Site configuration → Environment variables).
 *
 *   GET  /api/gemini/models                         → list models
 *   POST /api/gemini/models/<id>:generateContent    → generate text
 *
 * Only those two calls are forwarded, only from this site (or the TerraTone
 * app), and replies are capped, so the endpoint can't be used as an open
 * Gemini relay.
 */
import { allowedOrigin, cors, json, ownerKey, preflight } from '../lib/shared.mjs';

const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_BODY = 16 * 1024;
const MAX_TOKENS = 800;

export default async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!allowedOrigin(req)) return json(403, { error: 'Not allowed from this origin.' });
  const key = ownerKey('GEMINI_API_KEY');
  if (!key) return json(503, { error: 'The site has no Gemini key configured.' }, req);
  const headers = { 'Content-Type': 'application/json', ...cors(req) };

  const path = new URL(req.url).pathname.replace(/^\/api\/gemini\/?/, '');

  if (req.method === 'GET' && path === 'models') {
    const res = await fetch(`${UPSTREAM}/models?pageSize=200&key=${encodeURIComponent(key)}`);
    return new Response(await res.text(), { status: res.status, headers });
  }

  if (req.method === 'POST' && /^models\/[A-Za-z0-9._-]+:generateContent$/.test(path)) {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'Request too large.' }, req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: 'Invalid JSON.' }, req);
    }
    const config = body.generationConfig ?? {};
    body.generationConfig = { ...config, maxOutputTokens: Math.min(Number(config.maxOutputTokens) || 400, MAX_TOKENS) };
    const res = await fetch(`${UPSTREAM}/${path}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return new Response(await res.text(), { status: res.status, headers });
  }

  return json(404, { error: 'Unknown Gemini route.' }, req);
};

export const config = { path: '/api/gemini/*' };
