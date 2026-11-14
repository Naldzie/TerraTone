/* NASA FIRMS active fires, with the MAP_KEY kept on the server
 * (Netlify env FIRMS_MAP_KEY or VITE_FIRMS_MAP_KEY). */
import { allowedOrigin, cors, json, ownerKey, preflight } from '../lib/shared.mjs';

const BASE = (process.env.VITE_FIRMS_API_BASE || 'https://firms.modaps.eosdis.nasa.gov/api').replace(/\/+$/, '');

export default async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (!allowedOrigin(req)) return json(403, { error: 'Not allowed from this origin.' });
  if (req.method !== 'GET') return json(405, { error: 'GET only.' }, req);
  const key = ownerKey('FIRMS_MAP_KEY');
  if (!key) return json(503, { error: 'FIRMS is not configured on this site.' }, req);
  const q = new URL(req.url).searchParams;
  const bbox = (q.get('bbox') || '').split(',').map(Number);
  const days = Math.max(1, Math.min(5, Number(q.get('days')) || 2));
  const source = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT'].includes(q.get('source')) ? q.get('source') : 'VIIRS_NOAA20_NRT';
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n) || Math.abs(n) > 180)) return json(400, { error: 'bbox must be W,S,E,N.' }, req);
  const res = await fetch(`${BASE}/area/csv/${encodeURIComponent(key)}/${source}/${bbox.join(',')}/${days}`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', ...cors(req), ...(res.ok ? { 'Netlify-CDN-Cache-Control': 'public, max-age=900' } : {}) },
  });
};

export const config = { path: '/api/firms' };
