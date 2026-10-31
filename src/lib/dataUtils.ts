/* Pure, testable data helpers: normalization and mapping math. */

export function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Normalize a value into [0,1] using dataset range; null/invalid -> null (missing). */
export function normalizeValue(value: number | null | undefined, range: [number, number]): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const [lo, hi] = range;
  if (hi === lo) return 0.5;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

/** Deterministic log-frequency interpolation. norm in [0,1]. */
export function normToFreq(norm: number, minFreq: number, maxFreq: number): number {
  const n = clamp(norm, 0, 1);
  const lo = Math.max(20, Math.min(minFreq, maxFreq));
  const hi = Math.max(lo + 1, Math.max(minFreq, maxFreq));
  return lo * Math.pow(hi / lo, n);
}

/** Quantize a frequency to the nearest pentatonic degree above A2 base. */
const PENTA = [0, 2, 4, 7, 9];
export function quantizePentatonic(freq: number, base = 220): number {
  const semis = 12 * Math.log2(Math.max(1, freq) / base);
  const oct = Math.floor(semis / 12);
  const rem = semis - oct * 12;
  let best = PENTA[0];
  let bestD = Infinity;
  for (const s of PENTA) {
    const d = Math.abs(s - rem);
    if (d < bestD) { bestD = d; best = s; }
  }
  return base * Math.pow(2, (oct * 12 + best) / 12);
}

/** Long/lat -> stereo pan [-1,1]. Longitude maps linearly across [-180,180]. */
export function lonToPan(lon: number | undefined): number {
  if (lon === undefined || !Number.isFinite(lon)) return 0;
  return clamp(lon / 180, -1, 1);
}

export interface LatestReading {
  /** Newest published value, or null when no frame carries data. */
  value: number | null;
  /** Frame label of the newest published value ('' when there is none). */
  at: string;
  /** Value of the previous published frame, or null when there is only one. */
  prev: number | null;
  /** value − prev, or null when either side is missing. */
  delta: number | null;
  /** Direction of change since the previous published frame. */
  dir: 'up' | 'down' | 'flat' | null;
}

/** Newest published reading of a series plus the change from the one before it. */
export function latestReading(points: { t: string; value: number | null }[]): LatestReading {
  const published = points.filter((p) => p.value !== null && Number.isFinite(p.value));
  if (published.length === 0) {
    const lastFrame = points.length ? points[points.length - 1].t : '';
    return { value: null, at: lastFrame, prev: null, delta: null, dir: null };
  }
  const last = published[published.length - 1];
  const before = published[published.length - 2];
  const delta = before ? (last.value as number) - (before.value as number) : null;
  return {
    value: last.value,
    at: last.t,
    prev: before ? before.value : null,
    delta,
    dir: delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

/** Summarize a dataset run into text (screen-reader + captions support). */
export function summarizeSeries(points: { t: string; value: number | null }[]): string {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return 'No valid data points in this range.';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const first = vals[0];
  const last = vals[vals.length - 1];
  const trend = last > first ? 'rising' : last < first ? 'falling' : 'flat';
  const missing = points.length - vals.length;
  return `${points.length} frames (${points[0].t} to ${points[points.length - 1].t}). ` +
    `Minimum ${min.toFixed(2)}, maximum ${max.toFixed(2)}, mean ${avg.toFixed(2)}. ` +
    `Overall trend: ${trend}.${missing > 0 ? ` ${missing} frame(s) missing data (silent gaps).` : ''}`;
}
