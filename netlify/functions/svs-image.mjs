/* Image relay for SVS visualizations so the app can read their pixels
 * (image sonification). Only svs.gsfc.nasa.gov images are fetched. */
import { allowedOrigin, cors, json, preflight } from '../lib/shared.mjs';

export default async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (!allowedOrigin(req)) return json(403, { error: 'Not allowed from this origin.' });
  if (req.method !== 'GET') return json(405, { error: 'GET only.' }, req);
  let target;
  try { target = new URL(new URL(req.url).searchParams.get('url') || ''); } catch { return json(400, { error: 'Bad url.' }, req); }
  if (target.hostname !== 'svs.gsfc.nasa.gov' || !/\.(jpe?g|png|gif|webp)$/i.test(target.pathname)) {
    return json(400, { error: 'Only SVS images are relayed.' }, req);
  }
  target.protocol = 'https:';
  const res = await fetch(target);
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!res.ok || !type.startsWith('image/')) return json(502, { error: `SVS image responded ${res.status}.` }, req);
  return new Response(res.body, {
    status: 200,
    headers: { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Netlify-CDN-Cache-Control': 'public, max-age=86400' },
  });
};

export const config = { path: '/api/svs-image' };
