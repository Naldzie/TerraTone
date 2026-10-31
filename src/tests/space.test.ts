import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ageAtA, blackHole, clockRate, cosmicState, epochSeconds, hazardById, iscoRadius,
  scaleFactorAt, tidalG, turnaroundA,
} from '../sim/hazards';
import { blackbodyColor } from '../sim/packs/bigbang';
import { blackholePull, BH_CENTER } from '../sim/packs/blackhole';
import { spaceshipDef } from '../sim/packs/spaceship';
import { DEFAULT_AVATAR, buildAvatarMesh } from '../sim/avatar';

const PLANCK = { h0: 67.4, om: 0.315, ol: 0.685 };

describe('black-hole physics', () => {
  it('puts the ISCO at 6 GM/c² without spin and ~1 GM/c² near maximal spin', () => {
    expect(iscoRadius(0)).toBeCloseTo(6, 5);
    expect(iscoRadius(0.998)).toBeLessThan(1.3);
    expect(iscoRadius(0.5)).toBeLessThan(iscoRadius(0.2));
  });

  it('scales the horizon with mass and follows Hawking temperature', () => {
    const sun = blackHole({ logMass: 0.5 + Math.log10(1 / 10 ** 0.5) + 0.5, spin: 0, accretion: 0.3 });
    expect(sun.rsKm / sun.massSun).toBeCloseTo(2.953, 3);
    const m87 = blackHole({ logMass: 9.81, spin: 0.9, accretion: 0.3 });
    expect(m87.hawkingK).toBeLessThan(1e-16);
    expect(blackHole({ spin: 0 }).horizonRs).toBeCloseTo(1, 5);
    expect(blackHole({ spin: 0.998 }).horizonRs).toBeLessThan(0.6);
    expect(m87.shadowRs).toBeCloseTo(2.598, 2);
  });

  it('makes stellar disks hotter (X-rays) than supermassive ones (UV)', () => {
    const stellar = blackHole({ logMass: 1, spin: 0, accretion: 1 });
    const smbh = blackHole({ logMass: 8, spin: 0, accretion: 1 });
    expect(stellar.diskTempK).toBeGreaterThan(5e6);
    expect(stellar.band).toBe('X-rays');
    expect(smbh.diskTempK).toBeLessThan(stellar.diskTempK);
    expect(['ultraviolet', 'X-rays']).toContain(smbh.band);
  });

  it('slows clocks and has gentle tides near supermassive holes, brutal near small ones', () => {
    expect(clockRate(1)).toBe(0);
    expect(clockRate(4)).toBeCloseTo(Math.sqrt(0.75), 6);
    expect(clockRate(1000)).toBeGreaterThan(0.999);
    expect(tidalG(10, 1)).toBeGreaterThan(1e6);
    expect(tidalG(4.3e6, 1)).toBeLessThan(1);
  });

  it('pulls toward the hole, harder when closer', () => {
    const far = blackholePull(BH_CENTER.x, BH_CENTER.y, BH_CENTER.z + 200);
    const near = blackholePull(BH_CENTER.x, BH_CENTER.y, BH_CENTER.z + 60);
    expect(near.z).toBeLessThan(0);
    expect(Math.abs(near.z)).toBeGreaterThan(Math.abs(far.z));
  });
});

describe('cosmology (Friedmann model)', () => {
  it('gives the Planck universe an age near 13.8 billion years', () => {
    const t0 = ageAtA(1, PLANCK);
    expect(t0).toBeGreaterThan(13.4);
    expect(t0).toBeLessThan(14.2);
  });

  it('inverts age → scale factor consistently', () => {
    for (const a of [1e-4, 1e-2, 0.5, 1, 2]) {
      const t = ageAtA(a, PLANCK);
      expect(scaleFactorAt(t, PLANCK) / a).toBeCloseTo(1, 2);
    }
  });

  it('releases the CMB near 3,000 K at ~380,000 years, and reads 2.7 K today', () => {
    const yr = 3.156e7;
    const toEpoch = (sec: number) => (Math.log10(sec) + 36) / 54.5;
    const cmb = cosmicState({ ...PLANCK, epoch: toEpoch(3.8e5 * yr) });
    expect(cmb.tempK).toBeGreaterThan(2000);
    expect(cmb.tempK).toBeLessThan(4500);
    expect(cmb.z).toBeGreaterThan(700);
    const today = cosmicState({ ...PLANCK, epoch: toEpoch(13.8e9 * yr) });
    expect(today.tempK).toBeCloseTo(2.73, 1);
    expect(today.phase).toBe('Today');
    expect(today.accelerating).toBe(true);
    // Deceleration → acceleration happened ~7.7 billion years after the Big Bang (z ≈ 0.63).
    expect(cosmicState({ ...PLANCK, epoch: toEpoch(9e9 * yr) }).accelerating).toBe(true);
    expect(cosmicState({ ...PLANCK, epoch: toEpoch(6e9 * yr) }).accelerating).toBe(false);
  });

  it('walks through the eras in order and lifts the fog after recombination', () => {
    const e = (x: number) => cosmicState({ ...PLANCK, epoch: x });
    expect(e(0).phase).toBe('Cosmic inflation');
    expect(e(0.69).phase).toBe('Big Bang nucleosynthesis');
    expect(e(0.69).clarity).toBe(0);
    expect(e(0.92).clarity).toBe(1);
    expect(epochSeconds(0)).toBeCloseTo(1e-36, 40);
  });

  it('recollapses a matter-only, closed universe (Big Crunch)', () => {
    const closed = { h0: 67.4, om: 1, ol: 0 };
    expect(Number.isFinite(turnaroundA({ h0: 67.4, om: 2, ol: 0 }))).toBe(true);
    expect(turnaroundA(PLANCK)).toBe(Infinity);
    const heavy = cosmicState({ ...closed, om: 1, epoch: 1 });
    expect(heavy.tSec).toBeGreaterThan(1e18);
  });

  it('colours blackbodies from red through white', () => {
    const cool = blackbodyColor(1500);
    const sun = blackbodyColor(5800);
    expect(cool.r).toBeGreaterThan(cool.b);
    expect(sun.g).toBeGreaterThan(0.6);
  });
});

describe('space sims', () => {
  it('registers Black Hole and Big Bang in place of Flood and Landslide', () => {
    expect(hazardById('blackhole').title).toMatch(/Black Hole/);
    expect(hazardById('bigbang').title).toMatch(/Big Bang/);
    for (const id of ['blackhole', 'bigbang'] as const) {
      const d = hazardById(id);
      const near = d.gains({ ...d.defaults }, 40);
      for (const k of Object.keys(near)) expect(near[k]).toBeLessThanOrEqual(1);
      expect(d.hud(120, 0, { ...d.defaults }).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('builds a flyable spaceship with engines that respond to thrust', () => {
    const def = spaceshipDef({ x: 1, y: 2, z: 3 });
    expect(def.flight).toBe(true);
    expect(def.boostSpeed).toBeGreaterThan(def.speed);
    const scene = new THREE.Scene();
    const ship = def.build(scene, () => undefined);
    expect(ship.group.position.toArray()).toEqual([1, 2, 3]);
    expect(() => ship.thrust?.(1, 0.016)).not.toThrow();
  });

  it('dresses everyone in a full EVA suit with a gold visor', () => {
    const casual = buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'cap', back: 'cape' });
    const eva = buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'cap', back: 'cape' }, { spaceSuit: true });
    let n0 = 0; let n1 = 0;
    casual.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) n0++; });
    eva.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) n1++; });
    expect(n1).toBeGreaterThan(n0);
    const torso = eva.torso.material as THREE.MeshStandardMaterial;
    expect(torso.color.getHex()).toBe(0xeef1f5);
  });
});
