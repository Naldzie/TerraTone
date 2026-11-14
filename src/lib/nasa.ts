/* Online NASA integrations — all keyless, documented public services.
 *
 * Verified services (no API key required for these endpoints):
 *  1. NASA POWER (power.larc.nasa.gov) — point climatology + daily time series,
 *     JSON, community=AG. Docs: https://power.larc.nasa.gov/docs/
 *  2. NASA GIBS WMTS (gibs.earthdata.nasa.gov) — global imagery tiles used as
 *     an optional map backdrop layer. Docs: https://nasa-gibs.github.io/gibs-api-docs/
 *  3. NASA CMR granule search (cmr.earthdata.nasa.gov) — public STAC-like
 *     search to cite real dataset holdings. Docs: https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
 *  4. NASA Earth Information Center (earth.gov) — linked for context; it has
 *     no public JSON API, so we deep-link rather than scrape.
 *
 * Licensing: NASA Earth science data is generally U.S. public domain; each
 * dataset page states its own use policy which we surface in citations.
 */
import type { DatasetMeta, FrameDateMode } from '../types';

const POWER_BASE = (import.meta.env.VITE_POWER_BASE as string) || 'https://power.larc.nasa.gov/api';
const GIBS_BASE = (import.meta.env.VITE_GIBS_BASE as string) || 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const CMR_BASE = ((import.meta.env.VITE_CMR_API_BASE as string) || 'https://cmr.earthdata.nasa.gov/search').replace(/\/+$/, '');

export const EIC_URL = 'https://earth.gov/';
export const POWER_DOCS = 'https://power.larc.nasa.gov/docs/';
export const GIBS_DOCS = 'https://nasa-gibs.github.io/gibs-api-docs/';

async function fetchJson(url: string, timeoutMs = 15000): Promise<unknown> {
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

/** Fetch NASA POWER monthly climatology for one point → sonifiable DatasetMeta. */
export async function fetchPowerClimatology(lat: number, lon: number): Promise<DatasetMeta> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Latitude must be between −90 and 90.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('Longitude must be between −180 and 180.');
  const params = new URLSearchParams({
    parameters: 'T2M,PRECTOTCORR',
    community: 'AG',
    longitude: String(lon),
    latitude: String(lat),
    format: 'JSON',
  });
  const url = `${POWER_BASE}/temporal/climatology/point?${params.toString()}`;
  const raw = (await fetchJson(url)) as {
    properties?: { parameter?: { T2M?: Record<string, number>; PRECTOTCORR?: Record<string, number> } };
  };
  const t2m = raw?.properties?.parameter?.T2M;
  if (!t2m) throw new Error('NASA POWER returned an unexpected response (no T2M climatology).');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const points = months.map((m, i) => ({
    t: `clima-${String(i + 1).padStart(2, '0')}`,
    value: Number.isFinite(t2m[m]) ? t2m[m] : null,
    lat,
    lon,
  }));
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...vals) - 2);
  const hi = Math.ceil(Math.max(...vals) + 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    id: `nasa-power-${lat.toFixed(2)}-${lon.toFixed(2)}`,
    title: `NASA POWER 2-m air temperature climatology (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
    category: 'Weather and precipitation',
    description:
      'Twelve monthly long-term mean 2-metre air temperatures from the NASA POWER climatology product ' +
      '(MERRA-2 / GEOS based). Live data fetched just now from power.larc.nasa.gov for the coordinates you chose.',
    units: '°C',
    range: [lo, hi],
    provenance: 'nasa-live',
    sourceName: 'NASA POWER (Prediction of Worldwide Energy Resources)',
    sourceUrl: 'https://power.larc.nasa.gov/',
    coverage: `Point ${lat.toFixed(2)}°, ${lon.toFixed(2)}°; 30-year climatology normals`,
    resolution: 'Monthly normals',
    license: 'U.S. public domain NASA data; cite NASA POWER',
    updatedAt: stamp,
    points,
    mappingNote: 'Monthly mean temperature → pitch across the year. January starts left (low or high depending on hemisphere).',
  };
}

/** Variables offered on the Live tab's "latest conditions" console (POWER point product). */
export type PowerLiveKey = 'T2M' | 'RH2M' | 'WS2M' | 'PS' | 'PRECTOTCORR';

export const POWER_LIVE_VARS: ReadonlyArray<{ key: PowerLiveKey; label: string; units: string }> = [
  { key: 'T2M', label: 'Air temperature (2 m)', units: '°C' },
  { key: 'RH2M', label: 'Relative humidity (2 m)', units: '%' },
  { key: 'WS2M', label: 'Wind speed (2 m)', units: 'm/s' },
  { key: 'PS', label: 'Surface pressure', units: 'kPa' },
  { key: 'PRECTOTCORR', label: 'Precipitation (daily totals)', units: 'mm/day' },
];

/** Default "right now" request per variable: the newest hour for most, the newest day for precipitation. */
export const POWER_LIVE_NOW: Readonly<Record<PowerLiveKey, { series: 'hourly' | 'daily'; window: number }>> = {
  T2M: { series: 'hourly', window: 24 },
  RH2M: { series: 'hourly', window: 24 },
  WS2M: { series: 'hourly', window: 24 },
  PS: { series: 'hourly', window: 24 },
  PRECTOTCORR: { series: 'daily', window: 14 },
};

export const POWER_LIVE_WINDOWS: ReadonlyArray<{ label: string; series: 'hourly' | 'daily'; window: number }> = [
  { label: 'Hourly · last 24 h', series: 'hourly', window: 24 },
  { label: 'Hourly · last 48 h', series: 'hourly', window: 48 },
  { label: 'Daily · last 14 days', series: 'daily', window: 14 },
  { label: 'Daily · last 30 days', series: 'daily', window: 30 },
];

/** POWER marks unpublished hours/days with -999; real values (even °C) never go this low. */
const POWER_FILL = -900;

/** POWER near-real-time analysis lags wall-clock time by about a week — request extra days and trim. */
const POWER_LAG_DAYS = 12;

function powerFrameLabel(key: string, series: 'hourly' | 'daily'): string {
  const y = key.slice(0, 4);
  const mo = key.slice(4, 6);
  const da = key.slice(6, 8);
  return series === 'hourly' ? `${y}-${mo}-${da} ${key.slice(8, 10)}:00` : `${y}-${mo}-${da}`;
}

/**
 * Newest published NASA POWER point series for one location → sonifiable DatasetMeta.
 * POWER's near-real-time product trails real time by ~a week, so this asks for
 * `window + lag` days and trims to the newest hours/days that actually contain data —
 * the resulting dataset always ends at NASA's latest published reading for that point.
 */
export async function fetchPowerNow(
  lat: number,
  lon: number,
  opts: { key: PowerLiveKey; series: 'hourly' | 'daily'; window: number },
): Promise<DatasetMeta> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Latitude must be between −90 and 90.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('Longitude must be between −180 and 180.');
  const { key, series } = opts;
  const windowSize = Math.max(2, Math.round(opts.window));
  const end = new Date();
  // Ask for the window plus the near-real-time lag (in days) plus one spare day.
  const span = series === 'hourly'
    ? (windowSize + POWER_LAG_DAYS * 24 + 24) * 36e5
    : (windowSize + POWER_LAG_DAYS + 1) * 864e5;
  const start = new Date(end.getTime() - span);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const params = new URLSearchParams({
    parameters: key,
    community: 'AG',
    longitude: String(lon),
    latitude: String(lat),
    start: ymd(start),
    end: ymd(end),
    format: 'JSON',
  });
  const url = `${POWER_BASE}/temporal/${series}/point?${params.toString()}`;
  const raw = (await fetchJson(url, 20000)) as {
    properties?: { parameter?: Record<string, Record<string, number>> };
  };
  const seriesData = raw?.properties?.parameter?.[key];
  const varMeta = POWER_LIVE_VARS.find((v) => v.key === key);
  if (!varMeta) throw new Error('Unknown NASA POWER variable.');
  if (!seriesData || Object.keys(seriesData).length === 0) {
    throw new Error(`NASA POWER returned no ${varMeta.label} series for these coordinates.`);
  }
  const keys = Object.keys(seriesData).sort();
  const goodKeys = keys.filter((k) => Number.isFinite(seriesData[k]) && seriesData[k] > POWER_FILL);
  if (goodKeys.length < 2) {
    throw new Error(
      'NASA POWER has no usable recent data for these coordinates yet — its near-real-time analysis is still catching up. Try again later, another location, or a bundled demo dataset.',
    );
  }
  const lastIdx = keys.indexOf(goodKeys[goodKeys.length - 1]);
  const windowKeys = keys.slice(Math.max(0, lastIdx - windowSize + 1), lastIdx + 1);
  const goodSet = new Set(goodKeys);
  const points = windowKeys.map((k) => ({
    t: powerFrameLabel(k, series),
    value: goodSet.has(k) ? seriesData[k] : null,
    lat,
    lon,
  }));
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.1, 0.5);
  const windowWords = series === 'hourly' ? `last ${windowSize} hours` : `last ${windowSize} days`;
  return {
    id: `nasa-power-now-${key}-${series}-${lat.toFixed(2)}-${lon.toFixed(2)}`,
    title: `${varMeta.label} — ${windowWords} (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
    category: 'Weather and precipitation',
    description:
      `${series === 'hourly' ? 'Hourly' : 'Daily'} ${varMeta.label.toLowerCase()} from the NASA POWER near-real-time product ` +
      '(MERRA-2 / GEOS based), fetched just now for your coordinates. Frames run oldest to newest and end at the ' +
      'newest analysis NASA has published (POWER catches up within about a week), so this is the latest available ' +
      'reading rather than a sensor streaming this exact second.',
    units: varMeta.units,
    range: [Math.floor(min - pad), Math.ceil(max + pad)],
    provenance: 'nasa-live',
    sourceName: 'NASA POWER (Prediction of Worldwide Energy Resources)',
    sourceUrl: 'https://power.larc.nasa.gov/',
    coverage: `Point ${lat.toFixed(2)}°, ${lon.toFixed(2)}°; ${points[0].t} → ${points[points.length - 1].t}`,
    resolution: series === 'hourly' ? 'Hourly analysis' : 'Daily analysis',
    license: 'U.S. public domain NASA data; cite NASA POWER',
    updatedAt: new Date().toISOString().slice(0, 16),
    points,
    mappingNote:
      `${varMeta.label} over time → pitch across the dataset range; the final frame is NASA's newest published ` +
      `${series === 'hourly' ? 'hour' : 'day'}. Silence marks hours POWER has not published yet.`,
  };
}

/** Search NASA CMR for real dataset holdings (citations, not values). */
export async function searchCmrCollections(keyword: string): Promise<{ title: string; id: string }[]> {
  const params = new URLSearchParams({ keyword, page_size: '8', pretty: 'true' });
  const raw = (await fetchJson(`${CMR_BASE}/collections.json?${params.toString()}`)) as {
    feed?: { entry?: { title?: string; id?: string }[] };
  };
  return (raw?.feed?.entry ?? []).map((e) => ({ title: e.title ?? 'Untitled collection', id: e.id ?? '' }));
}

/** Build a GIBS WMTS tile URL template for an optional imagery backdrop. */
export function gibsTileUrl(layer: string, dateIso: string): string {
  return `${GIBS_BASE}/${layer}/default/${dateIso}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg`;
}

export const GIBS_LAYERS = [
  { id: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS Terra true color' },
  { id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', label: 'VIIRS true color' },
  { id: 'MODIS_Terra_Land_Surface_Temp_Day', label: 'Land surface temp (day)' },
];

/** Derive an ISO date (YYYY-MM-DD) from a frame label + dateMode for GIBS tile lookup. */
export function frameDate(t: string, mode: FrameDateMode): string | null {
  const m = t.match(/(\d{4})[-/](\d{2})?[-/](\d{2})?/);
  if (m) {
    const y = m[1];
    const mo = m[2] ?? '01';
    const d = m[3] ?? '01';
    return `${y}-${mo}-${d}`;
  }
  if (mode === 'month') {
    const mm = t.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i);
    if (mm) {
      const idx = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
        .indexOf(mm[1].toUpperCase());
      return `2000-${String(idx + 1).padStart(2, '0')}-01`;
    }
  }
  if (mode === 'year') {
    const yy = t.match(/^(\d{4})$/);
    if (yy) return `${yy[1]}-01-01`;
  }
  return null;
}

/** Build a GIBS WMTS tile URL for one frame's date + layer. */
export function gibsFrameUrl(layer: string, dateIso: string): string {
  return gibsTileUrl(layer, dateIso);
}

/** EIC deep link for a dataset — open the matching Earth Information Center view. */
export function eicDeepLink(layer: string, dateIso: string): string {
  return `${EIC_URL}?layer=${encodeURIComponent(layer)}&date=${encodeURIComponent(dateIso)}`;
}
