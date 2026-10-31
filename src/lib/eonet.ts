/* EONET — NASA Earth Observatory Natural Event Tracker (keyless, live).
 * Docs: https://eonet.gsfc.nasa.gov/docs/v3 — open events: wildfires,
 * storms, volcanoes, quakes, floods, ice, and more, with coordinates.
 * Snapshots are cached in IndexedDB so the last feed is viewable offline,
 * always labeled with its fetch time.
 */
import { db } from './db';
import type { HazardId } from '../sim/hazards';

export interface EonetGeometry {
  date: string;
  type: 'Point' | 'Polygon' | 'LineString';
  coordinates: unknown;
}

export interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  geometry: EonetGeometry[];
}

export interface EonetCache {
  at: string;
  events: EonetEvent[];
}

const CACHE_KEY = 'eonet-cache-v1';

/** First usable [lon, lat] point from a geometry (polygons → first ring point). Pure. */
export function geometryPoint(g: EonetGeometry): { lon: number; lat: number } | null {
  const c = g.coordinates;
  const pair = (v: unknown): { lon: number; lat: number } | null => {
    if (!Array.isArray(v) || v.length < 2) return null;
    const [lon, lat] = v as [unknown, unknown];
    return typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat)
      ? { lon, lat }
      : null;
  };
  if (g.type === 'Point') return pair(c);
  if (Array.isArray(c)) {
    for (const item of c) {
      const p = pair(item) ?? (Array.isArray(item) ? pair((item as unknown[])[0]) : null);
      if (p) return p;
    }
  }
  return null;
}

/** Representative event location: latest geometry with coordinates. Pure. */
export function eventPoint(ev: EonetEvent): { lon: number; lat: number } | null {
  for (let i = ev.geometry.length - 1; i >= 0; i--) {
    const p = geometryPoint(ev.geometry[i]);
    if (p) return p;
  }
  return null;
}

/** Latest observation date of an event. Pure. */
export function eventLatestDate(ev: EonetEvent): string {
  let best = '';
  for (const g of ev.geometry) {
    if (typeof g.date === 'string' && g.date > best) best = g.date;
  }
  return best;
}

/** Map an EONET category onto a TerraTone simulator (null = no match). Pure. */
export function categoryToSim(categoryId: string): HazardId | null {
  switch (categoryId) {
    case 'wildfires': return 'wildfire';
    case 'volcanoes': return 'volcano';
    case 'severeStorms': return 'hurricane';
    case 'earthquakes': return 'earthquake';
    default: return null;
  }
}

/** Filter events by category id ('all' = everything). Pure. */
export function filterEvents(events: EonetEvent[], category: string): EonetEvent[] {
  if (category === 'all') return events;
  return events.filter((e) => e.categories.some((c) => c.id === category));
}

/** Category chips present in a feed, in feed order. Pure. */
export function feedCategories(events: EonetEvent[]): { id: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const e of events) {
    for (const c of e.categories) {
      if (!seen.has(c.id)) seen.set(c.id, c.title);
    }
  }
  return [...seen.entries()].map(([id, title]) => ({ id, title }));
}

/** Live fetch of open events (last `days` days). Throws human-readable errors. */
export async function fetchEonetEvents(days = 30, limit = 100): Promise<EonetEvent[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(
      `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=${days}&limit=${limit}`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`EONET responded ${res.status}. Retry in a bit.`);
    const json = (await res.json()) as { events?: EonetEvent[] };
    if (!Array.isArray(json.events)) throw new Error('EONET returned an unexpected response.');
    return json.events;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('EONET request timed out. Check your connection.');
    throw e instanceof Error ? e : new Error('EONET request failed.');
  } finally {
    clearTimeout(t);
  }
}

export async function saveEonetCache(events: EonetEvent[]): Promise<EonetCache> {
  const snap: EonetCache = { at: new Date().toISOString(), events };
  try {
    await db.setKv(CACHE_KEY, snap);
  } catch { /* offline cache best-effort */ }
  return snap;
}

export async function loadEonetCache(): Promise<EonetCache | null> {
  try {
    return (await db.getKv<EonetCache>(CACHE_KEY)) ?? null;
  } catch {
    return null;
  }
}
