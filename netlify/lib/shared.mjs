/* Helpers shared by the API proxies in ../functions (kept outside that folder
 * so Netlify doesn't deploy this file as a function of its own). */

/** The TerraTone apps and local dev: Android (https://localhost), Windows
 *  (http://127.0.0.1:<port>), iOS (capacitor://localhost), Vite dev/preview. */
const APP_ORIGIN = /^(https:\/\/localhost|capacitor:\/\/localhost|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

function appOrigin(req) {
  const origin = req.headers.get('origin');
  return origin && APP_ORIGIN.test(origin) ? origin : null;
}

export function allowedOrigin(req) {
  const origin = req.headers.get('origin');
  // Same-origin GETs may omit Origin; the browser always sends it cross-origin.
  if (!origin) return true;
  return origin === new URL(req.url).origin || appOrigin(req) !== null;
}

/** CORS headers so the installed apps (a different origin) can read replies. */
export function cors(req) {
  const origin = appOrigin(req);
  return origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

/** Answer a CORS preflight, or null when this isn't one. */
export function preflight(req) {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: allowedOrigin(req) ? 204 : 403, headers: { ...cors(req), 'Access-Control-Max-Age': '86400' } });
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

export function json(status, body, req) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(req ? cors(req) : {}) } });
}
