import { describe, expect, it } from 'vitest';
import {
  clamp, normalizeValue, normToFreq, quantizePentatonic, lonToPan,
  summarizeSeries, latestReading,
} from '../lib/dataUtils';
import { computeFrameSound } from '../audio/engine';

describe('data normalization and mapping', () => {
  it('normalizes within dataset range', () => {
    expect(normalizeValue(-0.5, [-0.5, 1.6])).toBeCloseTo(0);
    expect(normalizeValue(1.6, [-0.5, 1.6])).toBeCloseTo(1);
    expect(normalizeValue(0.55, [-0.5, 1.6])).toBeCloseTo(0.5);
  });
  it('clamps outliers instead of exploding', () => {
    expect(normalizeValue(999, [-0.5, 1.6])).toBe(1);
    expect(normalizeValue(-999, [-0.5, 1.6])).toBe(0);
  });
  it('handles missing / invalid values as null', () => {
    expect(normalizeValue(null, [0, 1])).toBeNull();
    expect(normalizeValue(undefined, [0, 1])).toBeNull();
    expect(normalizeValue(NaN, [0, 1])).toBeNull();
    expect(normalizeValue(Infinity, [0, 1])).toBeNull();
  });
  it('maps norm to bounded audio frequencies deterministically', () => {
    const a = normToFreq(0.5, 220, 880);
    const b = normToFreq(0.5, 220, 880);
    expect(a).toBe(b); // reproducible
    expect(normToFreq(0, 220, 880)).toBeCloseTo(220);
    expect(normToFreq(1, 220, 880)).toBeCloseTo(880);
    expect(normToFreq(5, 220, 880)).toBeCloseTo(880); // clamped
    expect(normToFreq(0.5, 200, 1200)).toBeGreaterThanOrEqual(200);
  });
  it('quantizes musical profile to pentatonic degrees', () => {
    const q = quantizePentatonic(440);
    expect(q).toBeGreaterThan(0);
    // 440 is A4 — already pentatonic, should stay
    expect(q).toBeCloseTo(440, 0);
  });
  it('maps longitude to stereo pan', () => {
    expect(lonToPan(-180)).toBe(-1);
    expect(lonToPan(180)).toBe(1);
    expect(lonToPan(undefined)).toBe(0);
  });
});

describe('audio parameter bounds', () => {
  it('keeps gain in safe band and freq in hearing-safe range', () => {
    for (const v of [-10, 0, 0.5, 5, 100]) {
      const s = computeFrameSound({ t: 'x', value: v }, [0, 5], 'musical', 1, true);
      expect(s.silent).toBe(false);
      expect(s.freq).toBeGreaterThanOrEqual(30);
      expect(s.freq).toBeLessThanOrEqual(4000);
      expect(s.gain).toBeGreaterThan(0);
      expect(s.gain).toBeLessThanOrEqual(0.5);
    }
  });
  it('volume 0 silences output; mute-equivalent gain is 0', () => {
    const s = computeFrameSound({ t: 'x', value: 3 }, [0, 5], 'minimal', 0, false);
    expect(s.gain).toBe(0);
  });
  it('missing values are silent gaps', () => {
    const s = computeFrameSound({ t: 'x', value: null }, [0, 5], 'scientific', 1, false);
    expect(s.silent).toBe(true);
    expect(s.gain).toBe(0);
  });
  it('deterministic: same data + settings = same sound', () => {
    const p = { t: '2020-01', value: 1.2, lon: -122 };
    const a = computeFrameSound(p, [-0.5, 1.6], 'musical', 0.7, true);
    const b = computeFrameSound(p, [-0.5, 1.6], 'musical', 0.7, true);
    expect(a).toEqual(b);
  });
  it('clamp never exceeds bounds', () => {
    expect(clamp(99, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
  });
});

describe('timeline synchronization + summaries', () => {
  it('frame index math stays in bounds', () => {
    const n = 146;
    const next = (f: number) => Math.min(n - 1, f + 1);
    expect(next(145)).toBe(145);
    expect(next(0)).toBe(1);
  });
  it('summarizes series with trend + missing count', () => {
    const s = summarizeSeries([
      { t: '2020-01', value: 1 }, { t: '2020-02', value: null }, { t: '2020-03', value: 3 },
    ]);
    expect(s).toMatch(/3 frames/);
    expect(s).toMatch(/rising/);
    expect(s).toMatch(/1 frame\(s\) missing/);
  });
  it('handles all-missing series gracefully', () => {
    expect(summarizeSeries([{ t: 'x', value: null }])).toMatch(/No valid data/);
  });
});

describe('latestReading (the Live tab "right now" value)', () => {
  it('reads the newest published frame and the change from the one before it', () => {
    const r = latestReading([
      { t: '2026-10-26 11:00', value: 14 },
      { t: '2026-10-26 12:00', value: 15.2 },
      { t: '2026-10-26 13:00', value: 18.4 },
    ]);
    expect(r.value).toBe(18.4);
    expect(r.at).toBe('2026-10-26 13:00');
    expect(r.prev).toBe(15.2);
    expect(r.delta).toBeCloseTo(3.2);
    expect(r.dir).toBe('up');
  });
  it('skips unpublished (null) trailing frames instead of inventing a value', () => {
    const r = latestReading([
      { t: '2026-10-26 13:00', value: 15.2 },
      { t: '2026-10-26 14:00', value: null },
      { t: '2026-10-26 15:00', value: null },
    ]);
    expect(r.value).toBe(15.2);
    expect(r.at).toBe('2026-10-26 13:00');
    expect(r.delta).toBeNull();
    expect(r.dir).toBeNull();
  });
  it('reports flat and falling movement', () => {
    expect(latestReading([{ t: 'a', value: 2 }, { t: 'b', value: 2 }]).dir).toBe('flat');
    expect(latestReading([{ t: 'a', value: 2 }, { t: 'b', value: 1 }]).delta).toBe(-1);
    expect(latestReading([{ t: 'a', value: 2 }, { t: 'b', value: 1 }]).dir).toBe('down');
  });
  it('returns an empty reading when nothing is published', () => {
    expect(latestReading([])).toEqual({ value: null, at: '', prev: null, delta: null, dir: null });
    expect(latestReading([{ t: 'x', value: null }]))
      .toEqual({ value: null, at: 'x', prev: null, delta: null, dir: null });
  });
});
