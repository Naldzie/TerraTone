/* Relay for the NASA Scientific Visualization Studio API. SVS only answers
 * browsers on its partner origin, so the app reads it through here. */
import { allowedOrigin, cors, json, preflight } from '../lib/shared.mjs';

const BASE = (process.env.VITE_SVS_API_BASE || 'https://svs.gsfc.nasa.gov/api').replace(/\/+$/, '');

export default async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (!allowedOrigin(req)) return json(403, { error: 'Not allowed from this origin.' });
  if (req.method !== 'GET') return json(405, { error: 'GET only.' }, req);
  const url = new URL(req.url);
  const rest = url.pathname.replace(/^\/api\/svs\/?/, '');
  // Only "search/" and numeric visualization ids are relayed.
  if (!/^(search\/?|\d{1,7}\/?)$/.test(rest)) return json(400, { error: 'Unsupported SVS path.' }, req);
  const res = await fetch(`${BASE}/${rest}${url.search}`, { headers: { Accept: 'application/json' } });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', ...cors(req), ...(res.ok ? { 'Netlify-CDN-Cache-Control': 'public, max-age=3600' } : {}) },
  });
};

export const config = { path: ['/api/svs', '/api/svs/*'] };
