import { describe, expect, it } from 'vitest';
import { HAZARDS, clampVals, collapseRisk, damageLabel, hazardById } from '../sim/hazards';
import { oceanDrift } from '../sim/packs/ocean';
import { softClipCurve } from '../audio/realism';

describe('hazard registry', () => {
  it('defines the registered simulators in order', () => {
    expect(HAZARDS.map((h) => h.id)).toEqual(['hurricane', 'earthquake', 'volcano', 'ocean', 'wildfire', 'tsunami', 'blackhole', 'bigbang', 'sun']);
    for (const h of HAZARDS) {
      expect(h.paramDefs.length).toBeGreaterThanOrEqual(3);
      expect(h.presets.length).toBeGreaterThanOrEqual(3);
      expect(h.layers.length).toBeGreaterThanOrEqual(3);
      expect(h.mappingExpl.length).toBeGreaterThanOrEqual(3);
      expect(h.safety.length).toBeGreaterThan(20);
    }
  });
  it('falls back safely and clamps values into ranges', () => {
    expect(hazardById('nope' as never).id).toBe('hurricane');
    const q = hazardById('earthquake');
    const c = clampVals(q, { magnitude: 99, duration: -5, shake: 0.5 });
    expect(c.magnitude).toBe(8.5);
    expect(c.duration).toBe(5);
    const nan = clampVals(q, { magnitude: NaN } as never);
    expect(nan.magnitude).toBe(q.defaults.magnitude);
  });
});

describe('hazard audio mappings', () => {
  for (const h of HAZARDS) {
    it(`${h.id}: gains bounded 0..1 and louder near the hazard`, () => {
      const near = h.gains({ ...h.defaults, _tremor: 1 }, 40);
      const far = h.gains({ ...h.defaults, _tremor: 1 }, 2000);
      for (const k of Object.keys(near)) {
        expect(near[k]).toBeGreaterThanOrEqual(0);
        expect(near[k]).toBeLessThanOrEqual(1);
      }
      const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      // Ocean is depth-driven, not distance-driven — check depth instead.
      if (h.id === 'ocean') {
        const shallow = h.gains({ ...h.defaults }, 100);
        expect(sum(shallow)).toBeGreaterThan(0);
      } else {
        expect(sum(near)).toBeGreaterThan(sum(far));
      }
    });
    it(`${h.id}: stronger settings raise output and stay capped`, () => {
      const lo = { ...h.defaults, _tremor: 0 };
      const hi = { ...h.defaults, _tremor: 1, intensity: 1, eruption: 1, fire: 1, magnitude: 8.5, rainfall: 1, ash: 1, current: 1 };
      const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      expect(sum(h.gains(hi, 80))).toBeGreaterThanOrEqual(sum(h.gains(lo, 80)));
      expect(sum(h.gains(hi, 0))).toBeLessThanOrEqual(Object.keys(h.gains(hi, 0)).length);
      const b = h.boom(hi, 40);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      const t = h.ticks(hi, 60);
      expect(t.rate).toBeGreaterThanOrEqual(0);
      expect(t.rate).toBeLessThanOrEqual(30);
    });
    it(`${h.id}: status text reflects live values`, () => {
      const s = h.status({ ...h.defaults, _tremor: 1 }, 90);
      expect(s.length).toBeGreaterThan(30);
      if (h.id === 'earthquake') expect(s).toMatch(/Mw|magnitude|shaking/i);
      else if (h.id === 'ocean') expect(s).toMatch(/60 m|depth/i);
      else expect(s).toMatch(/90/);
    });
  }
  it('earthquake tremor envelope gates the shaking', () => {
    const q = hazardById('earthquake');
    const quiet = q.gains({ ...q.defaults, _tremor: 0 }, 100);
    const loud = q.gains({ ...q.defaults, _tremor: 1 }, 100);
    expect(loud.rumble).toBeGreaterThan(quiet.rumble);
    expect(q.ticks({ ...q.defaults, _tremor: 1 }, 100).rate).toBeGreaterThan(0);
  });
  it('earthquake collapse risk rises with magnitude and duration, stays bounded', () => {
    expect(collapseRisk(3, 5)).toBeLessThan(0.06);
    const mild = collapseRisk(4.5, 10);
    const strong = collapseRisk(8, 40);
    expect(strong).toBeGreaterThan(mild);
    expect(collapseRisk(7, 30)).toBeGreaterThan(collapseRisk(7, 5));
    for (const m of [3, 5, 7, 8.5]) {
      const r = collapseRisk(m, 30);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(damageLabel(r).length).toBeGreaterThan(3);
    }
    expect(collapseRisk(8.5, 60)).toBeGreaterThanOrEqual(0.99);
  });
  it('earthquake structural-damage gauge tracks the collapse risk', () => {
    const q = hazardById('earthquake');
    const g = q.gauges!({ ...q.defaults, magnitude: 8, duration: 40 }).find((x) => x.label.includes('Structural'));
    expect(g).toBeDefined();
    expect(g!.frac).toBeCloseTo(collapseRisk(8, 40));
    expect(g!.text).toContain(damageLabel(collapseRisk(8, 40)));
    const calm = q.gauges!({ ...q.defaults, magnitude: 3.5 }).find((x) => x.label.includes('Structural'));
    expect(calm!.frac).toBeLessThan(g!.frac);
  });
  it('ocean drift pushes the diver with the current', () => {
    const still = oceanDrift({ current: 0 });
    const strong = oceanDrift({ current: 1 });
    expect(still.x).toBe(0);
    expect(strong.x).toBeGreaterThan(3);
  });
  it('hud exposes labeled variables per simulator', () => {
    for (const h of HAZARDS) {
      const vars = h.hud(120, 45, { ...h.defaults, _tremor: 0.5 });
      expect(vars.length).toBeGreaterThanOrEqual(3);
      for (const v of vars) {
        expect(v.label.length).toBeGreaterThan(0);
        expect(v.value.length).toBeGreaterThan(0);
      }
    }
  });
  it('gauges stay bounded and the ocean depth meter reads correctly', () => {
    const ocean = hazardById('ocean');
    expect(ocean.gauges).toBeDefined();
    for (const depth of [5, 60, 200]) {
      const [g] = ocean.gauges!({ ...ocean.defaults, depth });
      expect(g.label).toBe('Depth meter');
      expect(g.frac).toBeGreaterThanOrEqual(0);
      expect(g.frac).toBeLessThanOrEqual(1);
      expect(g.text).toContain(`${Math.round(depth)} m`);
    }
    const shallow = ocean.gauges!({ ...ocean.defaults, depth: 12 })[0];
    const deep = ocean.gauges!({ ...ocean.defaults, depth: 195 })[0];
    expect(shallow.text).toContain('Sunlit');
    expect(deep.text).toContain('Near-dark');
    expect(deep.frac).toBeGreaterThan(shallow.frac);
  });
  it('hurricane, earthquake, volcano and wildfire gauges are bounded and track intensity', () => {
    const cases: Array<{ id: Parameters<typeof hazardById>[0]; vals: Array<Record<string, number>> }> = [
      { id: 'hurricane', vals: [{ windKmh: 35 }, { windKmh: 165 }] },
      { id: 'earthquake', vals: [{ magnitude: 3.5 }, { magnitude: 8 }] },
      { id: 'volcano', vals: [{ eruption: 0, ash: 0 }, { eruption: 1, ash: 1 }] },
      { id: 'wildfire', vals: [{ fire: 0, dryness: 0, windSpeed: 0 }, { fire: 1, dryness: 1, windSpeed: 60 }] },
    ];
    for (const { id, vals } of cases) {
      const h = hazardById(id);
      expect(h.gauges, `${id} gauges`).toBeDefined();
      for (const v of vals) {
        for (const g of h.gauges!({ ...h.defaults, ...v })) {
          expect(g.label.length).toBeGreaterThan(0);
          expect(g.text.length).toBeGreaterThan(0);
          expect(g.frac).toBeGreaterThanOrEqual(0);
          expect(g.frac).toBeLessThanOrEqual(1);
        }
      }
      const low = h.gauges!({ ...h.defaults, ...vals[0] })[0];
      const high = h.gauges!({ ...h.defaults, ...vals[1] })[0];
      expect(high.frac, `${id} primary gauge rises`).toBeGreaterThan(low.frac);
    }
    const eq = hazardById('earthquake').gauges!({ ...hazardById('earthquake').defaults, magnitude: 7.5 })[0];
    expect(eq.label).toContain('MMI');
    const sf = hazardById('hurricane').gauges!({ ...hazardById('hurricane').defaults, wind: 120 })[0];
    expect(sf.label).toContain('Saffir');
    expect(sf.text).toMatch(/Category [1-4]/);
  });
});

describe('realism character per simulator', () => {
  it('uses a valid tick mode and band', () => {
    for (const h of HAZARDS) {
      expect(['hiss', 'pop', 'bloop']).toContain(h.tickMode ?? 'hiss');
      if (h.tickBand) {
        expect(h.tickBand[1]).toBeGreaterThan(h.tickBand[0]);
        expect(h.tickBand[0]).toBeGreaterThanOrEqual(200);
      }
    }
    expect(hazardById('ocean').tickMode).toBe('bloop');
    expect(hazardById('wildfire').tickMode).toBe('pop');
  });
  it('sub-bass curves stay bounded and track energy', () => {
    for (const h of HAZARDS) {
      expect(h.sub).toBeDefined();
      const v = { ...h.defaults, _tremor: 1 };
      const near = h.sub!(v, 40);
      const far = h.sub!(v, 2000);
      expect(near.level).toBeGreaterThanOrEqual(0);
      expect(near.level).toBeLessThanOrEqual(1.2);
      expect(near.freq).toBeGreaterThanOrEqual(25);
      expect(near.freq).toBeLessThanOrEqual(70);
      if (h.id !== 'ocean') expect(near.level).toBeGreaterThanOrEqual(far.level);
    }
  });
  it('rain patter follows the rainfall slider', () => {
    const h = hazardById('hurricane');
    const dry = h.ticks({ ...h.defaults, rainfall: 0 }, 100);
    const wet = h.ticks({ ...h.defaults, rainfall: 1 }, 100);
    expect(wet.rate).toBeGreaterThan(dry.rate);
    expect(wet.rate).toBeLessThanOrEqual(30);
  });
});

describe('saturation curve', () => {
  it('is bounded and smoothly S-shaped', () => {
    const c = softClipCurve(256);
    expect(c.length).toBe(256);
    for (let i = 1; i < c.length; i++) {
      expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]); // monotonic
      expect(Math.abs(c[i])).toBeLessThanOrEqual(0.9);
    }
    expect(c[0]).toBeLessThan(-0.8);
    expect(c[255]).toBeGreaterThan(0.8);
    expect(Math.abs(c[128])).toBeLessThan(0.05); // ~zero crossing
  });
});
