/* NASA APOD proxy — today's Astronomy Picture of the Day fetched with the site
 * owner's NASA key (Netlify environment variable NASA_API_KEY), so visitors
 * don't share the rate-limited DEMO_KEY. Cached at the edge for an hour.
 *
 *   GET /api/apod
 */
import { allowedOrigin, cors, json, ownerKey, preflight } from '../lib/shared.mjs';

export default async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!allowedOrigin(req)) return json(403, { error: 'Not allowed from this origin.' });
  if (req.method !== 'GET') return json(405, { error: 'GET only.' }, req);
  const key = ownerKey('NASA_API_KEY') || 'DEMO_KEY';
  const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`, {
    headers: { Accept: 'application/json' },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      ...cors(req),
      ...(res.ok ? { 'Netlify-CDN-Cache-Control': 'public, max-age=3600' } : {}),
    },
  });
};

export const config = { path: '/api/apod' };
