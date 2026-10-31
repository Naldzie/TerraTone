/* Tornado simulator — pure simulation math (no DOM, no audio, fully unit-tested).
 *
 * All speeds / intensities are SIMULATED values for learning, not live
 * measurements or forecasts. Distance units are virtual meters inside the
 * 3D scene.
 */

export interface Vec2 { x: number; z: number }

export type StormPresetId = 'distant' | 'developing' | 'strong' | 'extreme' | 'custom';

export interface StormParams {
  preset: StormPresetId;
  /** 0..1 tornado intensity. */
  intensity: number;
  /** Simulated wind speed in km/h (label only). */
  windKmh: number;
  /** 0..1 ambient wind layer volume. */
  windVolume: number;
  /** 0..1 rumble depth (low-frequency weight). */
  rumbleDepth: number;
  /** Gusts per minute (simulated). */
  gustRate: number;
  /** Character→tornado distance in virtual meters. */
  distance: number;
  /** Elapsed simulation seconds. */
  simTime: number;
}

export interface StormPreset {
  id: StormPresetId;
  name: string;
  blurb: string;
  intensity: number;
  windKmh: number;
  windVolume: number;
  rumbleDepth: number;
  gustRate: number;
  distance: number;
}

export const STORM_PRESETS: StormPreset[] = [
  { id: 'distant', name: 'Distant Storm', blurb: 'A far-off rumble on the horizon. Quiet, slow, safe to explore.', intensity: 0.15, windKmh: 40, windVolume: 0.25, rumbleDepth: 0.3, gustRate: 4, distance: 320 },
  { id: 'developing', name: 'Developing Tornado', blurb: 'A funnel is forming. Wind picks up as you get closer.', intensity: 0.4, windKmh: 110, windVolume: 0.45, rumbleDepth: 0.5, gustRate: 8, distance: 220 },
  { id: 'strong', name: 'Strong Tornado', blurb: 'A loud, fast rope on the ground. Keep your virtual distance.', intensity: 0.7, windKmh: 180, windVolume: 0.65, rumbleDepth: 0.75, gustRate: 14, distance: 150 },
  { id: 'extreme', name: 'Extreme Tornado', blurb: 'Maximum simulated intensity. Overwhelming up close — audio stays capped for safety.', intensity: 1, windKmh: 260, windVolume: 0.85, rumbleDepth: 1, gustRate: 22, distance: 110 },
  { id: 'custom', name: 'Custom Simulation', blurb: 'Your own mix of the sliders below.', intensity: 0.5, windKmh: 130, windVolume: 0.5, rumbleDepth: 0.6, gustRate: 10, distance: 200 },
];

export const WORLD = {
  /** Walkable half-extent in virtual meters (square). */
  halfSize: 360,
  /** Tornado base position. */
  tornado: { x: 0, z: 0 } as Vec2,
  /** Distance range the volume curve is tuned for. */
  minDistance: 25,
  maxDistance: 420,
  walkSpeed: 12,
  runSpeed: 24,
} as const;

/** Growth of the walkable grid versus the original 240 m layout. Scene dressing
 * (road widths, prop counts) scales by it so a bigger world stays populated. */
export const WORLD_SCALE = WORLD.halfSize / 240;

export function presetById(id: StormPresetId): StormPreset {
  return STORM_PRESETS.find((p) => p.id === id) ?? STORM_PRESETS[0];
}

export function paramsFromPreset(p: StormPreset): StormParams {
  return {
    preset: p.id, intensity: p.intensity, windKmh: p.windKmh,
    windVolume: p.windVolume, rumbleDepth: p.rumbleDepth,
    gustRate: p.gustRate, distance: p.distance, simTime: 0,
  };
}

/** Euclidean distance between character and tornado in virtual meters. */
export function characterDistance(a: Vec2, b: Vec2 = WORLD.tornado): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Configurable distance→volume curve (not linear): full near the funnel,
 * smooth exponential-style falloff with distance, never fully silent so the
 * storm stays audible as a distant rumble. Returns 0..1 multiplier.
 */
export function distanceVolume(distanceM: number, curve = 1.6, floor = 0.12): number {
  const d = Math.max(0, distanceM);
  const t = 1 - Math.min(1, d / WORLD.maxDistance);
  return floor + (1 - floor) * Math.pow(t, curve);
}

/** Distance→detail: high-frequency wind detail fades faster than the rumble. */
export function distanceDetail(distanceM: number): number {
  const t = 1 - Math.min(1, Math.max(0, distanceM) / WORLD.maxDistance);
  return Math.pow(t, 2.2);
}

/**
 * Combined storm loudness 0..1 from params + master volume.
 * Master output stage caps this again (safety), so this is artistic level.
 */
export function stormLevel(p: StormParams, masterVolume: number): number {
  const dVol = distanceVolume(p.distance);
  const level = (0.25 + 0.75 * p.intensity) * (0.35 + 0.65 * dVol) * (0.4 + 0.6 * p.windVolume);
  return clamp01(level) * clamp01(masterVolume);
}

/** Gust events per second from simulated gust rate. */
export function gustsPerSecond(p: Pick<StormParams, 'gustRate'>): number {
  return Math.max(0, p.gustRate) / 60;
}

/** Bearing from character to tornado in degrees (0 = north/-Z, clockwise). */
export function bearingToTornado(pos: Vec2, tornado: Vec2 = WORLD.tornado): number {
  const dx = tornado.x - pos.x;
  const dz = tornado.z - pos.z;
  return (Math.atan2(dx, -dz) * 180) / Math.PI;
}

/** Compass point for a bearing. */
export function compassPoint(bearingDeg: number): string {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = ((Math.round(bearingDeg / 45) % 8) + 8) % 8;
  return pts[i];
}

/** Clamp a position inside the walkable square. */
export function clampToWorld(pos: Vec2): Vec2 {
  const h = WORLD.halfSize;
  return { x: Math.min(h, Math.max(-h, pos.x)), z: Math.min(h, Math.max(-h, pos.z)) };
}

/**
 * Circle-collider resolution: push the character out of building footprints.
 * Returns the corrected position (pure — tested).
 */
export function resolveCollisions(pos: Vec2, colliders: { x: number; z: number; r: number }[]): Vec2 {
  let { x, z } = pos;
  for (const c of colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r && d > 1e-6) {
      x = c.x + (dx / d) * c.r;
      z = c.z + (dz / d) * c.r;
    } else if (d <= 1e-6) {
      x = c.x + c.r; // degenerate: nudge out along +x
    }
  }
  return clampToWorld({ x, z });
}

/** Integrate one movement step. Returns new position + whether running. */
export function stepMovement(
  pos: Vec2,
  dir: Vec2,
  dt: number,
  running: boolean,
  colliders: { x: number; z: number; r: number }[] = [],
): { pos: Vec2; moving: boolean; speed: number } {
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-6 || dt <= 0) return { pos, moving: false, speed: 0 };
  const speed = running ? WORLD.runSpeed : WORLD.walkSpeed;
  const nx = pos.x + (dir.x / len) * speed * dt;
  const nz = pos.z + (dir.z / len) * speed * dt;
  return { pos: resolveCollisions({ x: nx, z: nz }, colliders), moving: true, speed };
}

/** Human-readable status line that always reflects live params (no fake precision). */
export function describeStorm(p: StormParams, masterVolume: number): string {
  const lvl = stormLevel(p, masterVolume);
  const loud = lvl > 0.66 ? 'loud and intense' : lvl > 0.33 ? 'clearly audible' : 'a distant rumble';
  const detail = distanceDetail(p.distance) > 0.4 ? 'High whistle and debris details are prominent.' : 'Mostly low rumble; fine detail fades with distance.';
  return `Simulated ${p.windKmh} km/h winds at ${Math.round(p.distance)} m — ${loud}. ${detail} Low rumble ${p.distance < 150 ? 'increasing' : 'steady'} as the ${p.distance < 150 ? 'storm feels close' : 'storm stays distant'}.`;
}

/* --- Derived tornado readouts (SIMULATED, never measurements) ------------- */

/** Enhanced Fujita rating from a 3-second gust (km/h); -1 = below EF0. */
export function efScale(windKmh: number): number {
  return windKmh >= 323 ? 5 : windKmh >= 267 ? 4 : windKmh >= 218 ? 3
    : windKmh >= 178 ? 2 : windKmh >= 138 ? 1 : windKmh >= 105 ? 0 : -1;
}

/**
 * Core pressure deficit under a tornado of this wind speed (mb below ambient).
 * A published-style wind→pressure fit, capped for the scale of violent storms.
 */
export function corePressureDropMb(windKmh: number): number {
  return Math.min(115, 0.0013 * Math.pow(Math.max(0, windKmh), 1.9));
}

/** Typical funnel ground width for a tornado of this wind speed (m). */
export function funnelWidthM(windKmh: number): number {
  return Math.round(30 + Math.pow(Math.max(0, windKmh) / 323, 1.6) * 570);
}

