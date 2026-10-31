import { afterEach, describe, expect, it, vi } from 'vitest';
import { POWER_LIVE_VARS, fetchPowerNow } from '../lib/nasa';

/** Sequential POWER-style keys ending at `endKey` (hourly: YYYYMMDDHH, daily: YYYYMMDD). */
function seqKeys(endKey: string, count: number, series: 'hourly' | 'daily'): string[] {
  const stepMs = series === 'hourly' ? 36e5 : 864e5;
  const end = series === 'hourly'
    ? new Date(+endKey.slice(0, 4), +endKey.slice(4, 6) - 1, +endKey.slice(6, 8), +endKey.slice(8, 10))
    : new Date(+endKey.slice(0, 4), +endKey.slice(4, 6) - 1, +endKey.slice(6, 8));
  const p = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end.getTime() - (count - 1 - i) * stepMs);
    return series === 'hourly'
      ? `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`
      : `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  });
}

const label = (k: string) =>
  k.length === 10
    ? `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)} ${k.slice(8, 10)}:00`
    : `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;

function fixture(key: string, data: Record<string, number>) {
  return { properties: { parameter: { [key]: data } } };
}

let lastUrl = '';

function mockFetchOnce(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    return { ok: true, json: async () => body } as Response;
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPowerNow (NASA POWER latest conditions)', () => {
  it('trims unpublished trailing hours and builds a 24-hour live window', async () => {
    const keys = seqKeys('2026102013', 60, 'hourly');
    const data: Record<string, number> = {};
    keys.forEach((k, i) => {
      data[k] = i >= 50 ? -999 : Number((10 + (i % 12)).toFixed(2)); // newest 10 h not published yet
    });
    mockFetchOnce(fixture('T2M', data));

    const ds = await fetchPowerNow(37.77, -122.42, { key: 'T2M', series: 'hourly', window: 24 });

    expect(ds.provenance).toBe('nasa-live');
    expect(ds.units).toBe('°C');
    expect(ds.resolution).toBe('Hourly analysis');
    expect(ds.id).toBe('nasa-power-now-T2M-hourly-37.77--122.42');
    expect(ds.title).toContain('last 24 hours');
    expect(ds.points).toHaveLength(24);
    expect(ds.points[ds.points.length - 1].t).toBe(label(keys[49])); // newest published hour
    expect(ds.points.every((p) => p.value !== null)).toBe(true);
    expect(ds.points.map((p) => p.t)).toEqual([...ds.points.map((p) => p.t)].sort());
    expect(ds.range[0]).toBeLessThan(ds.range[1]);
    expect(ds.mappingNote).toContain('newest published');

    const url = new URL(lastUrl);
    expect(`${url.origin}${url.pathname}`).toContain('/temporal/hourly/point');
    expect(url.searchParams.get('parameters')).toBe('T2M');
    expect(url.searchParams.get('latitude')).toBe('37.77');
    expect(url.searchParams.get('longitude')).toBe('-122.42');
    const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    const days = (parse(url.searchParams.get('end')!) - parse(url.searchParams.get('start')!)) / 864e5;
    expect(days).toBeGreaterThanOrEqual(14); // window + lag covered, then trimmed
  });

  it('keeps unpublished interior hours as null frames (silence, never interpolated)', async () => {
    const keys = seqKeys('2026102013', 60, 'hourly');
    const data: Record<string, number> = {};
    keys.forEach((k, i) => {
      data[k] = (i >= 40 && i <= 41) || i >= 50 ? -999 : 15;
    });
    mockFetchOnce(fixture('T2M', data));
    const ds = await fetchPowerNow(1, 2, { key: 'T2M', series: 'hourly', window: 24 });
    const nulls = ds.points.filter((p) => p.value === null);
    expect(nulls).toHaveLength(2);
    expect(nulls[0].t).toBe(label(keys[40]));
    expect(ds.points.filter((p) => p.value !== null)).toHaveLength(22);
  });

  it('serves daily precipitation windows with daily frame labels', async () => {
    const keys = seqKeys('20261030', 30, 'daily');
    const data: Record<string, number> = {};
    keys.forEach((k, i) => { data[k] = i >= 27 ? -999 : 3 + i; });
    mockFetchOnce(fixture('PRECTOTCORR', data));

    const ds = await fetchPowerNow(-1.29, 36.82, { key: 'PRECTOTCORR', series: 'daily', window: 14 });

    expect(ds.units).toBe('mm/day');
    expect(ds.resolution).toBe('Daily analysis');
    expect(ds.title).toContain('last 14 days');
    expect(ds.points).toHaveLength(14);
    expect(ds.points[ds.points.length - 1].t).toBe('2026-10-27');
    expect(ds.points[0].t).toBe('2026-10-14');
    expect(ds.coverage).toContain('2026-10-14 → 2026-10-27');
  });

  it('explains that POWER has not published recent data when everything is fill', async () => {
    const keys = seqKeys('2026102013', 48, 'hourly');
    const data: Record<string, number> = Object.fromEntries(keys.map((k) => [k, -999]));
    mockFetchOnce(fixture('T2M', data));
    await expect(fetchPowerNow(37, -122, { key: 'T2M', series: 'hourly', window: 24 }))
      .rejects.toThrow(/no usable recent data/i);
  });

  it('validates coordinates before touching the network', async () => {
    mockFetchOnce({});
    await expect(fetchPowerNow(95, 0, { key: 'T2M', series: 'hourly', window: 24 })).rejects.toThrow(/Latitude/);
    await expect(fetchPowerNow(0, 200, { key: 'T2M', series: 'hourly', window: 24 })).rejects.toThrow(/Longitude/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exposes variable metadata for the Live tab selects', () => {
    expect(POWER_LIVE_VARS.map((v) => v.key)).toEqual(['T2M', 'RH2M', 'WS2M', 'PS', 'PRECTOTCORR']);
    for (const v of POWER_LIVE_VARS) expect(v.label.length).toBeGreaterThan(3);
  });
});

const liveIt = import.meta.env.VITE_LIVE_API ? it : it.skip;

liveIt('hits the real NASA POWER API (set VITE_LIVE_API=1 to run)', async () => {
  const ds = await fetchPowerNow(37.77, -122.42, { key: 'T2M', series: 'hourly', window: 24 });
  expect(ds.provenance).toBe('nasa-live');
  expect(ds.points.length).toBeGreaterThanOrEqual(12);
  expect(ds.points.some((p) => p.value !== null)).toBe(true);
  expect(ds.range[0]).toBeLessThan(ds.range[1]);
}, 30000);
