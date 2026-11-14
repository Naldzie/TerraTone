/* NASA Scientific Visualization Studio (SVS) + FIRMS active-fire feeds.
 *
 * SVS only allows browser calls from its own partner origin (CORS), so the
 * app reaches it through a relay that fits the platform it runs on:
 *  - deployed site → Netlify function  /api/svs/* and /api/svs-image
 *  - `npm run dev` → the same paths, served by the Vite dev middleware
 *  - Android app   → native HTTP (CapacitorHttp), which has no CORS
 *  - Windows app   → direct; Electron adds the missing CORS header
 * FIRMS allows any origin, so it is called directly with the MAP_KEY from
 * .env, or through /api/firms when the site keeps the key server-side. */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { apiProxy } from './keys';
import type { DatasetMeta, DataPoint } from '../types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const SVS_BASE = (env.VITE_SVS_API_BASE || 'https://svs.gsfc.nasa.gov/api').replace(/\/+$/, '');
const FIRMS_BASE = (env.VITE_FIRMS_API_BASE || 'https://firms.modaps.eosdis.nasa.gov/api').replace(/\/+$/, '');
const FIRMS_KEY = env.VITE_FIRMS_MAP_KEY || '';

const native = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};
/** Dev server relay (vite.config.ts) — only during `npm run dev`. */
const devRelay = () => Boolean(env.DEV) && !native();

async function getJson(url: string, timeoutMs = 15000): Promise<unknown> {
  if (native() && /^https?:\/\//.test(url)) {
    const r = await CapacitorHttp.get({ url, headers: { Accept: 'application/json' }, connectTimeout: timeoutMs, readTimeout: timeoutMs });
    if (r.status < 200 || r.status >= 300) throw new Error(`Server responded ${r.status}`);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Server responded ${res.status} ${res.statusText}`);
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Request timed out. Check your connection and retry.');
    throw e instanceof Error ? e : new Error('Network request failed.');
  } finally {
    clearTimeout(t);
  }
}

/** Where an SVS API path (e.g. "search/?search=fire") is fetched from on this platform. */
export function svsApiUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  const proxy = apiProxy();
  if (proxy && !native()) return `${proxy}/svs/${clean}`;
  if (devRelay()) return `/api/svs/${clean}`;
  return `${SVS_BASE}/${clean}`;
}

export interface SvsItem {
  id: number;
  title: string;
  description: string;
  releaseDate: string;
  pageUrl: string;
  imageUrl: string | null;
  imageAlt: string;
  /** True when the visualization is one of the Earth Information Center pieces. */
  eic: boolean;
}

interface SvsSearchRaw { results?: { id?: number; title?: string; description?: string; release_date?: string; url?: string; result_type?: string }[] }
interface SvsDetailRaw {
  id?: number; title?: string; description?: string; release_date?: string; url?: string;
  main_image?: { url?: string; alt_text?: string } | null;
  keywords?: unknown;
}

const https = (u?: string | null) => (u ? u.replace(/^http:\/\//i, 'https://') : null);
const strip = (s?: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Search SVS, then load each hit's detail (for its preview image). */
export async function searchSvs(query: string, limit = 6): Promise<SvsItem[]> {
  const q = new URLSearchParams({ search: query, limit: String(Math.max(limit * 2, 10)) });
  const raw = (await getJson(svsApiUrl(`search/?${q.toString()}`))) as SvsSearchRaw;
  const hits = (raw.results ?? [])
    .filter((r) => typeof r.id === 'number' && (!r.result_type || /visualization|animation/i.test(r.result_type)))
    .slice(0, limit);
  const details = await Promise.all(hits.map(async (h) => {
    try {
      return (await getJson(svsApiUrl(`${h.id}/`))) as SvsDetailRaw;
    } catch {
      return { id: h.id, title: h.title, description: h.description, release_date: h.release_date, url: h.url } as SvsDetailRaw;
    }
  }));
  return details.map((d) => {
    const img = https(d.main_image?.url);
    const kw = JSON.stringify(d.keywords ?? '').toLowerCase();
    return {
      id: d.id ?? 0,
      title: strip(d.title) || 'Untitled visualization',
      description: strip(d.description).slice(0, 320),
      releaseDate: (d.release_date ?? '').slice(0, 10),
      pageUrl: https(d.url) ?? `https://svs.gsfc.nasa.gov/${d.id}`,
      imageUrl: img,
      imageAlt: strip(d.main_image?.alt_text) || strip(d.title),
      eic: /eic/i.test(img ?? '') || kw.includes('earth information center'),
    };
  });
}

/** An SVS image URL that a canvas may read pixels from (CORS-clean) on this platform. */
export async function readableSvsImage(url: string): Promise<string> {
  const proxy = apiProxy();
  if (native()) {
    const r = await CapacitorHttp.get({ url, responseType: 'blob', readTimeout: 20000, connectTimeout: 20000 });
    if (r.status < 200 || r.status >= 300) throw new Error(`Image responded ${r.status}`);
    const type = /\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg';
    return `data:${type};base64,${String(r.data)}`;
  }
  if (proxy) return `${proxy}/svs-image?url=${encodeURIComponent(url)}`;
  if (devRelay()) return `/api/svs-image?url=${encodeURIComponent(url)}`;
  return url;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the visualization image.'));
    img.src = src;
  });
}

/** Sweep a picture left → right: each column's brightness becomes one frame of sound. */
export function columnBrightness(data: Uint8ClampedArray, w: number, h: number, frames: number): number[] {
  const out: number[] = [];
  for (let f = 0; f < frames; f += 1) {
    const x0 = Math.floor((f * w) / frames);
    const x1 = Math.max(x0 + 1, Math.floor(((f + 1) * w) / frames));
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * w + x) * 4;
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n += 1;
      }
    }
    out.push(n ? Math.round((sum / n / 255) * 1000) / 10 : 0);
  }
  return out;
}

/** Turn an SVS visualization image into a playable dataset (image sonification). */
export async function svsImageDataset(item: SvsItem, frames = 64): Promise<DatasetMeta> {
  if (!item.imageUrl) throw new Error('This visualization has no preview image to play.');
  const img = await loadImage(await readableSvsImage(item.imageUrl));
  const w = 256;
  const h = Math.max(32, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, w, h).data;
  } catch {
    throw new Error('The image could not be read for sound (blocked by the server). Try again online.');
  }
  const values = columnBrightness(pixels, w, h, frames);
  const points: DataPoint[] = values.map((v, i) => ({
    t: `column ${i + 1}`,
    value: v,
    // Spread across longitudes so spatial pan sweeps left → right with the picture.
    lat: 0,
    lon: Math.round(-180 + (360 * (i + 0.5)) / frames),
  }));
  return {
    id: `svs-${item.id}`,
    title: `SVS · ${item.title}`,
    category: 'NASA visualization',
    description: item.description || item.title,
    units: '% brightness',
    range: [0, 100],
    provenance: 'nasa-live',
    sourceName: `NASA Scientific Visualization Studio #${item.id}`,
    sourceUrl: item.pageUrl,
    coverage: `Image swept left → right in ${frames} columns`,
    resolution: `${frames} columns × ${h} rows`,
    license: 'NASA imagery — public domain unless noted on the SVS page',
    updatedAt: item.releaseDate || new Date().toISOString().slice(0, 10),
    points,
    mappingNote: 'The picture is read left to right: brighter columns play higher and louder, darker ones lower and softer. Sound pans with the sweep.',
  };
}

// ---------------------------------------------------------------- FIRMS

export interface FirmsRegion { id: string; label: string; bbox: [number, number, number, number] }

/** west, south, east, north */
export const FIRMS_REGIONS: FirmsRegion[] = [
  { id: 'ph', label: 'Philippines', bbox: [116, 4.5, 127, 21.5] },
  { id: 'sea', label: 'Southeast Asia', bbox: [92, -11, 141, 24] },
  { id: 'aus', label: 'Australia', bbox: [112, -44, 154, -10] },
  { id: 'amazon', label: 'Amazon basin', bbox: [-75, -18, -44, 5] },
  { id: 'africa', label: 'Central Africa', bbox: [8, -15, 40, 12] },
  { id: 'cal', label: 'California', bbox: [-124.5, 32.5, -114, 42] },
  { id: 'canada', label: 'Canada', bbox: [-140, 48, -52, 70] },
];

export interface FirmsFire { lat: number; lon: number; frp: number; date: string; time: string; confidence: string; daynight: string }

export function hasFirmsAccess(): boolean {
  return Boolean(FIRMS_KEY || apiProxy());
}

/** Parse a FIRMS area CSV (VIIRS columns). */
export function parseFirmsCsv(csv: string): FirmsFire[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((s) => s.trim());
  const col = (n: string) => head.indexOf(n);
  const iLat = col('latitude'); const iLon = col('longitude'); const iFrp = col('frp');
  const iDate = col('acq_date'); const iTime = col('acq_time'); const iConf = col('confidence'); const iDn = col('daynight');
  if (iLat < 0 || iLon < 0) throw new Error(lines[0].slice(0, 140) || 'FIRMS returned an unexpected answer.');
  const out: FirmsFire[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const lat = Number(c[iLat]); const lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      lat, lon,
      frp: Number(c[iFrp]) || 0,
      date: c[iDate] ?? '',
      time: (c[iTime] ?? '').padStart(4, '0'),
      confidence: c[iConf] ?? '',
      daynight: c[iDn] ?? '',
    });
  }
  return out;
}

/** VIIRS satellites tried in order (S-NPP's near-real-time feed has gone quiet). */
export const FIRMS_SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] as const;
export type FirmsSource = (typeof FIRMS_SOURCES)[number];

/** Newest VIIRS fire detections for a region (1–5 days; "1" is only the current UTC day). */
export async function fetchFirmsFires(region: FirmsRegion, days = 2): Promise<FirmsFire[]> {
  for (const source of FIRMS_SOURCES) {
    const fires = await fetchFirmsSource(region, days, source);
    if (fires.length > 0 || source === FIRMS_SOURCES[FIRMS_SOURCES.length - 1]) return fires;
  }
  return [];
}

async function fetchFirmsSource(region: FirmsRegion, days: number, source: FirmsSource): Promise<FirmsFire[]> {
  const d = Math.max(1, Math.min(5, Math.round(days)));
  const box = region.bbox.join(',');
  const proxy = apiProxy();
  const url = FIRMS_KEY
    ? `${FIRMS_BASE}/area/csv/${FIRMS_KEY}/${source}/${box}/${d}`
    : proxy
      ? `${proxy}/firms?bbox=${encodeURIComponent(box)}&days=${d}&source=${source}`
      : '';
  if (!url) throw new Error('FIRMS needs a MAP_KEY — add VITE_FIRMS_MAP_KEY to .env.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`FIRMS responded ${res.status}: ${text.slice(0, 120)}`);
    return parseFirmsCsv(text);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('FIRMS timed out. Try a smaller region or fewer days.');
    throw e instanceof Error ? e : new Error('FIRMS request failed.');
  } finally {
    clearTimeout(t);
  }
}

/** Fires → a playable sweep from west to east; fire power (FRP) sets the pitch. */
export function firmsDataset(region: FirmsRegion, days: number, fires: FirmsFire[], maxFrames = 120): DatasetMeta {
  if (fires.length === 0) throw new Error(`No active fires detected over ${region.label} in the last ${days} day(s).`);
  const strongest = [...fires].sort((a, b) => b.frp - a.frp).slice(0, maxFrames);
  const sweep = strongest.sort((a, b) => a.lon - b.lon);
  const frps = sweep.map((f) => f.frp).sort((a, b) => a - b);
  const p95 = frps[Math.min(frps.length - 1, Math.floor(frps.length * 0.95))] || 1;
  const points: DataPoint[] = sweep.map((f) => ({
    t: `${f.date} ${f.time.slice(0, 2)}:${f.time.slice(2)} UTC · ${f.lat.toFixed(2)}°, ${f.lon.toFixed(2)}°`,
    value: Math.round(f.frp * 10) / 10,
    lat: f.lat,
    lon: f.lon,
  }));
  return {
    id: `firms-${region.id}-${days}d`,
    title: `Active fires · ${region.label} (last ${days} day${days > 1 ? 's' : ''})`,
    category: 'Fire',
    description: `${fires.length} VIIRS fire detections from NASA FIRMS over ${region.label}. The ${sweep.length} most intense are played west to east.`,
    units: 'MW (fire radiative power)',
    range: [0, Math.max(5, Math.ceil(p95))],
    provenance: 'nasa-live',
    sourceName: 'NASA FIRMS · VIIRS (NOAA-20 / NOAA-21) near real time',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/map/',
    coverage: `${region.label}; ${region.bbox.join(', ')} (W,S,E,N)`,
    resolution: '375 m fire pixels',
    license: 'NASA FIRMS — free and open; cite NASA FIRMS',
    updatedAt: new Date().toISOString().slice(0, 16),
    points,
    mappingNote: 'Each note is one fire, swept west → east (sound pans with it). Stronger fires (more radiative power) play higher and louder.',
  };
}
