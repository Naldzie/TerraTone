/* Helpers shared by the API proxies in ../functions (kept outside that folder
 * so Netlify doesn't deploy this file as a function of its own). */

/** Requests from this site itself, local dev, or the TerraTone mobile app. */
const APP_ORIGINS = new Set([
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:8888',
]);

export function allowedOrigin(req) {
  const origin = req.headers.get('origin');
  // Same-origin GETs may omit Origin; the browser always sends it cross-origin.
  if (!origin) return true;
  return origin === new URL(req.url).origin || APP_ORIGINS.has(origin);
}

/**
 * The owner's API key from the Netlify environment, under the local .env name
 * (VITE_GEMINI_API_KEY) or the plain one (GEMINI_API_KEY), cleaning up what a
 * paste often drags along: surrounding quotes or spaces, or a whole
 * "NAME=value" line.
 *
 * The .env name wins: Netlify's AI Gateway injects its own GEMINI_API_KEY into
 * every function (a gateway token, announced by GOOGLE_GEMINI_BASE_URL) that
 * Google rejects as "API key not valid", so that one is ignored.
 */
export function ownerKey(name) {
  const gatewayToken = name === 'GEMINI_API_KEY' && Boolean(process.env.GOOGLE_GEMINI_BASE_URL);
  const raw = process.env[`VITE_${name}`] || (gatewayToken ? '' : process.env[name]) || '';
  return raw.trim().replace(/^[A-Z_]+=/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

export function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
