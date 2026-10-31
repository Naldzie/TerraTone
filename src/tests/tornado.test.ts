import { describe, expect, it } from 'vitest';
import {
  STORM_PRESETS, bearingToTornado, characterDistance, clampToWorld,
  compassPoint, describeStorm, distanceDetail, distanceVolume, gustsPerSecond,
  paramsFromPreset, presetById, resolveCollisions, stepMovement, stormLevel,
} from '../sim/stormTypes';
import { DEFAULT_LAYERS } from '../audio/stormEngine';

describe('distance calculation', () => {
  it('measures character-to-tornado distance', () => {
    expect(characterDistance({ x: 0, z: 200 })).toBeCloseTo(200);
    expect(characterDistance({ x: 0, z: 0 })).toBe(0);
    expect(characterDistance({ x: 30, z: 40 })).toBeCloseTo(50);
  });
  it('is symmetric and tornado-relative', () => {
    const a = characterDistance({ x: 10, z: 5 }, { x: 4, z: 1 });
    expect(a).toBeCloseTo(Math.hypot(6, 4));
  });
});

describe('distance-to-volume curve', () => {
  it('is loudest near the funnel and never fully silent', () => {
    expect(distanceVolume(0)).toBeCloseTo(1);
    expect(distanceVolume(25)).toBeGreaterThan(0.9);
    expect(distanceVolume(10000)).toBeCloseTo(0.12); // floor: distant rumble
  });
  it('decreases monotonically with distance (no audible jumps up)', () => {
    let prev = Infinity;
    for (let d = 0; d <= 500; d += 10) {
      const v = distanceVolume(d);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0.12);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
  it('detail fades faster than loudness', () => {
    expect(distanceDetail(250)).toBeLessThan(distanceVolume(250));
    expect(distanceDetail(0)).toBeCloseTo(1);
  });
});

describe('storm level mapping', () => {
  const distant = paramsFromPreset(presetById('distant'));
  const extreme = paramsFromPreset(presetById('extreme'));
  it('extreme preset is louder than distant at the same spot', () => {
    const near = { ...extreme, distance: 100 };
    const far = { ...distant, distance: 100 };
    expect(stormLevel(near, 1)).toBeGreaterThan(stormLevel(far, 1));
  });
  it('approaching the funnel raises the level', () => {
    const p = { ...extreme, distance: 300 };
    expect(stormLevel({ ...p, distance: 60 }, 1)).toBeGreaterThan(stormLevel(p, 1));
  });
  it('master 0 silences; output stays bounded', () => {
    expect(stormLevel(extreme, 0)).toBe(0);
    expect(stormLevel({ ...extreme, distance: 0 }, 1)).toBeLessThanOrEqual(1);
  });
  it('gust rate converts to events per second', () => {
    expect(gustsPerSecond({ gustRate: 12 })).toBeCloseTo(0.2);
    expect(gustsPerSecond({ gustRate: -5 })).toBe(0);
  });
});

describe('bearings and compass', () => {
  it('faces north when the funnel is up ahead (-Z)', () => {
    expect(bearingToTornado({ x: 0, z: 200 })).toBeCloseTo(0);
    expect(compassPoint(0)).toBe('N');
  });
  it('reports east when the funnel is to the right', () => {
    expect(bearingToTornado({ x: -200, z: 0 })).toBeCloseTo(90);
    expect(compassPoint(90)).toBe('E');
  });
  it('wraps compass points', () => {
    expect(compassPoint(360)).toBe('N');
    expect(compassPoint(-45)).toBe('NW');
  });
});

describe('movement and collision behavior', () => {
  it('walks and runs at different speeds', () => {
    const w = stepMovement({ x: 0, z: 0 }, { x: 0, z: 1 }, 1, false);
    const r = stepMovement({ x: 0, z: 0 }, { x: 0, z: 1 }, 1, true);
    expect(r.speed).toBeGreaterThan(w.speed);
    expect(w.moving && r.moving).toBe(true);
  });
  it('stays still with no input and stays in the world', () => {
    expect(stepMovement({ x: 0, z: 0 }, { x: 0, z: 0 }, 1, false).moving).toBe(false);
    const p = stepMovement({ x: 239, z: 0 }, { x: 1, z: 0 }, 5, true).pos;
    expect(clampToWorld(p)).toEqual(p);
  });
  it('is pushed out of building footprints', () => {
    const cols = [{ x: 50, z: 50, r: 12 }];
    const out = resolveCollisions({ x: 50, z: 50 }, cols);
    expect(Math.hypot(out.x - 50, out.z - 50)).toBeCloseTo(12);
  });
});

describe('simulation state and presets', () => {
  it('has all five presets with sane ranges', () => {
    expect(STORM_PRESETS.map((p) => p.id)).toEqual(['distant', 'developing', 'strong', 'extreme', 'custom']);
    for (const p of STORM_PRESETS) {
      expect(p.intensity).toBeGreaterThan(0);
      expect(p.intensity).toBeLessThanOrEqual(1);
      expect(p.windKmh).toBeGreaterThan(0);
    }
  });
  it('falls back to a valid preset for unknown ids', () => {
    expect(presetById('nope' as never).id).toBe('distant');
  });
  it('status text reflects live params, not fake precision', () => {
    const t = describeStorm({ ...paramsFromPreset(presetById('strong')), distance: 80 }, 0.8);
    expect(t).toMatch(/80 m/);
    expect(t).toMatch(/km\/h/);
  });
  it('exposes the documented layer set for the mixer', () => {
    expect(Object.keys(DEFAULT_LAYERS).sort()).toEqual(['debris', 'gusts', 'rumble', 'thunder', 'whistle', 'wind']);
  });
});
