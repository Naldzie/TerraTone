import { describe, expect, it } from 'vitest';
import {
  colorT, columnFrame, columnPlan, noteColor,
  rampColor, rampCss, rampForDataset, rampLabel,
} from '../components/MusicViz3D';
import type { DatasetMeta } from '../types';

const mk = (id: string, category: string): DatasetMeta => ({
  id, category, title: id, description: '', units: 'u', range: [0, 1], provenance: 'sample',
  sourceName: '', sourceUrl: '', coverage: '', resolution: '', license: '', updatedAt: '',
  points: [], mappingNote: '',
});

describe('3D music view geometry (pure helpers)', () => {
  it('gives every sound profile its own shard color', () => {
    const cols = (['musical', 'ambient', 'minimal', 'scientific'] as const).map((p) => noteColor(p));
    expect(new Set(cols).size).toBe(4);
    expect(noteColor('musical')).toBe(noteColor('musical'));
  });
});

describe('data landscape layout (pure helpers)', () => {
  it('plans up to 150 columns and reports honest sampling', () => {
    const small = columnPlan(46);
    expect(small).toEqual({ cols: 46, step: 1, sampled: false });
    const big = columnPlan(1000);
    expect(big.cols).toBe(150);
    expect(big.sampled).toBe(true);
    expect(big.step).toBeCloseTo(999 / 149, 5);
    expect(columnPlan(1).cols).toBe(1);
  });
  it('round-trips column frame indices at the ends', () => {
    const plan = columnPlan(1000);
    expect(columnFrame(0, plan, 1000)).toBe(0);
    expect(columnFrame(149, plan, 1000)).toBe(999);
    expect(columnFrame(-3, plan, 1000)).toBe(0);
    expect(columnFrame(200, plan, 1000)).toBe(999);
  });
  it('picks semantic ramps per dataset family', () => {
    expect(rampForDataset(mk('sample-global-temp', 'Global temperature'))).toBe('diverging');
    expect(rampForDataset(mk('sample-sea-level', 'Sea-level change'))).toBe('cool');
    expect(rampForDataset(mk('sample-tides', 'Oceans and coasts'))).toBe('cool');
    expect(rampForDataset(mk('sample-fires', 'Wildfires'))).toBe('warm');
    expect(rampForDataset(mk('sample-stormwind', 'Storms'))).toBe('warm');
    expect(rampForDataset(mk('sample-vegetation', 'Vegetation and forests'))).toBe('green');
    expect(rampForDataset(mk('sample-co2', 'Air quality and atmosphere'))).toBe('green');
    expect(rampForDataset(mk('sample-kp', 'Sun and space weather'))).toBe('violet');
  });
  it('ramp colors interpolate, clamp and stay in gamut', () => {
    for (const name of ['diverging', 'cool', 'warm', 'green', 'violet'] as const) {
      const a = rampColor(name, 0);
      const b = rampColor(name, 1);
      expect(a).not.toEqual(b);
      expect(rampColor(name, -5)).toEqual(a);
      expect(rampColor(name, 5)).toEqual(b);
      const mid = rampColor(name, 0.5);
      expect(mid.every((c) => c >= 0 && c <= 1)).toBe(true);
      expect(rampCss(name)).toContain('rgb(');
      expect(rampLabel(name).length).toBeGreaterThan(10);
    }
  });
  it('centers the diverging ramp on zero when the range spans it', () => {
    const range: [number, number] = [-0.6, 1.7];
    expect(colorT(0, range, 'diverging')).toBeCloseTo(0.5);
    expect(colorT(-0.6, range, 'diverging')).toBe(0);
    expect(colorT(1.7, range, 'diverging')).toBe(1);
    expect(colorT(0, range, 'warm')).toBeCloseTo(0.6 / 2.3, 4);
  });
});
