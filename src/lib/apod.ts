/* APOD — NASA Astronomy Picture of the Day (api.nasa.gov, key or DEMO_KEY).
 * Docs: https://api.nasa.gov — labeled clearly as astronomy, not Earth data.
 */
import { db } from './db';
import { apiProxy, getNasaKey } from './keys';
import { DEMO_KEY } from './epic';

export interface Apod {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: 'image' | 'video';
  copyright?: string;
}

const CACHE_KEY = 'apod-cache-v1';

/** Type-guard + normalize a raw APOD payload. Pure (tested). */
export function parseApod(json: unknown): Apod {
  const o = (json ?? {}) as Record<string, unknown>;
  if (typeof o.title !== 'string' || typeof o.url !== 'string' || typeof o.date !== 'string') {
    throw new Error('APOD returned an unexpected response.');
  }
  return {
    date: o.date,
    title: o.title,
    explanation: typeof o.explanation === 'string' ? o.explanation : '',
    url: o.url,
    hdurl: typeof o.hdurl === 'string' ? o.hdurl : undefined,
    media_type: o.media_type === 'video' ? 'video' : 'image',
    copyright: typeof o.copyright === 'string' ? o.copyright.replace(/^\n+/, '').trim() : undefined,
  };
}

/** Today's APOD (cached for offline viewing). Throws human-readable errors. */
export async function fetchApod(): Promise<{ apod: Apod; usedDemoKey: boolean }> {
  const key = getNasaKey();
  // No own key: the site's proxy (owner's key) if there is one, else DEMO_KEY.
  const proxy = key ? '' : apiProxy();
  const usedDemoKey = !key && !proxy;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(
      proxy ? `${proxy}/apod` : `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(usedDemoKey ? DEMO_KEY : key)}`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    );
    if (res.status === 403 || res.status === 429) {
      throw new Error('NASA rate limit reached (likely on DEMO_KEY). Add your personal NASA key in Settings → API keys.');
    }
    if (res.status >= 500) throw new Error(`NASA's picture-of-the-day service is having problems right now (HTTP ${res.status}). It isn't your key — try again later.`);
    if (!res.ok) throw new Error(`APOD responded ${res.status}. Check your key in Settings → API keys.`);
    const apod = parseApod(await res.json());
    try {
      await db.setKv(CACHE_KEY, { at: new Date().toISOString(), apod });
    } catch { /* best-effort */ }
    return { apod, usedDemoKey };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('APOD request timed out. Check your connection.');
    throw e instanceof Error ? e : new Error('APOD request failed.');
  } finally {
    clearTimeout(t);
  }
}

export async function loadApodCache(): Promise<{ at: string; apod: Apod } | null> {
  try {
    return (await db.getKv<{ at: string; apod: Apod }>(CACHE_KEY)) ?? null;
  } catch {
    return null;
  }
}
