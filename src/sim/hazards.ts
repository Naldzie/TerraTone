/* Hazard registry — nine 3D environmental and space-weather simulators.
 *
 * EVERY numeric parameter is SIMULATED (virtual meters, simulated km/h,
 * simulated magnitude). Nothing here measures the real world or forecasts
 * disasters. Each hazard defines its own params, presets, PURE audio-gain
 * mappings (unit-tested), HUD variables, and safety/education copy.
 */
import type { AmbienceLayerDef } from '../audio/ambience';
import type { IconName } from '../components/Icon';
import { distanceDetail, distanceVolume } from './stormTypes';

export type HazardId = 'hurricane' | 'earthquake' | 'volcano' | 'ocean' | 'wildfire' | 'tsunami' | 'blackhole' | 'bigbang' | 'sun';
export type Vals = Record<string, number>;

export interface ParamDef {
  key: string; label: string; min: number; max: number; step: number;
  unit: string; hint: string;
}
export interface HazardPreset { id: string; name: string; blurb: string; values: Vals; spawn: number }
export interface HudVar { label: string; value: string }
/** Live meter bar: frac must stay in [0,1]. */
export interface Gauge { label: string; frac: number; text: string }

export interface HazardDef {
  id: HazardId;
  title: string;
  icon: IconName;
  category: string;
  difficulty: 'Gentle' | 'Moderate' | 'Intense';
  blurb: string;
  edu: string;
  safety: string;
  mappingExpl: string[];
  paramDefs: ParamDef[];
  defaults: Vals;
  presets: HazardPreset[];
  layers: AmbienceLayerDef[];
  withTone: boolean;
  /** 0..1 artistic gain per layer key. */
  gains: (v: Vals, distance: number) => Record<string, number>;
  tone: (v: Vals, distance: number, t: number) => { level: number; freq: number };
  boom: (v: Vals, distance: number) => number;
  ticks: (v: Vals, distance: number) => { rate: number; level: number; hp: number };
  hud: (distance: number, bearing: number, v: Vals, extra?: string) => HudVar[];
  status: (v: Vals, distance: number) => string;
  /** Optional live meter bars rendered under Status (pure, tested). */
  gauges?: (v: Vals) => Gauge[];
  /** Optional runner features. */
  tremorButton?: boolean;
  seismo?: boolean;
  /** Layer freq hints applied when pushing gains (key -> freq fn). */
  freqs?: (v: Vals, distance: number) => Record<string, number>;
  /** Micro-event character for the tick synth (default 'hiss'). */
  tickMode?: 'hiss' | 'pop' | 'bloop';
  /** Resonant band for 'pop' mode (default [1500, 5000]). */
  tickBand?: [number, number];
  /** Sub-bass weight: deep sine bed tracking the hazard's low energy. */
  sub?: (v: Vals, distance: number) => { level: number; freq: number };
}

const dVol = (d: number) => distanceVolume(d);
const det = (d: number) => distanceDetail(d);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const finite = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

/* --- Derived readouts (SIMULATED, never measurements) ---------------------
 * Small published-style fits that give each simulator the headline number its
 * hazard is known for: pressure under a hurricane, ground acceleration under
 * a quake, run-up under a tsunami, and so on. Every value stays inside the
 * gauge bounds the tests require. */

/** Wind → central pressure drop below 1013 mb ambient (mb). */
export function pressureDropMb(windKmh: number): number {
  return Math.min(100, 0.0123 * Math.pow(Math.max(0, windKmh), 1.6));
}

/** Coastal storm surge piled ashore by a slow storm (m). */
export function surgeMetres(windKmh: number, intensity = 1): number {
  const wn = clamp01((windKmh - 60) / 220);
  return Math.pow(wn, 1.8) * 4.5 * (0.45 + 0.55 * clamp01(intensity));
}

/** Moment magnitude → peak ground acceleration at ~10 km (g, capped). */
export function peakGroundG(magnitude: number): number {
  return Math.min(1.5, 0.4 * Math.pow(10, 0.5 * (magnitude - 6)));
}

/** Radius around the epicentre where the shaking is still felt (km). */
export function feltRadiusKm(magnitude: number): number {
  return Math.pow(10, 0.42 * (magnitude - 2));
}

/** Simulated share of a building stock suffering heavy damage / collapse (0..1). */
export function collapseRisk(magnitude: number, duration = 20): number {
  const mN = clamp01((magnitude - 3) / 5.5);
  const dN = clamp01((duration - 5) / 55);
  return clamp01(mN * 0.78 + dN * 0.22);
}

/** Human label for a collapse-risk fraction. */
export function damageLabel(risk: number): string {
  return risk >= 0.85 ? 'widespread collapse' : risk >= 0.6 ? 'heavy damage · collapses likely'
    : risk >= 0.35 ? 'moderate damage · some failures' : risk >= 0.15 ? 'minor cracking' : 'essentially intact';
}

/* ---------------------------------------------------------------------------
 * Black-hole model (SIMULATED, pure + unit-tested). Standard GR results:
 *  · Schwarzschild radius r_s = 2GM/c² ≈ 2.953 km per solar mass
 *  · Kerr horizon r+ = (1 + √(1 − a²)) GM/c²; ISCO from Bardeen–Press–Teukolsky
 *  · shadow radius ≈ √27 GM/c² ≈ 2.6 r_s (photon capture)
 *  · Hawking temperature T = 6.17×10⁻⁸ K · (M☉/M); Eddington L = 1.26×10³¹ W · (M/M☉)
 *  · thin-disk peak temperature ∝ M^-¼ ṁ^¼ (≈10⁷ K for 10 M☉ at Eddington)
 *  · clock rate (static observer) √(1 − r_s/r); tidal stretch Δa = 2GM·L / r³
 * ------------------------------------------------------------------------- */

const G_SI = 6.674e-11;
const M_SUN = 1.989e30;
const C_SI = 2.998e8;

/** Innermost stable circular orbit (prograde) in units of GM/c². */
export function iscoRadius(spin: number): number {
  const a = Math.min(0.9999, Math.max(0, spin));
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

/** Rate a static clock at r (in Schwarzschild radii) ticks vs one far away. */
export function clockRate(rOverRs: number): number {
  return rOverRs <= 1 ? 0 : Math.sqrt(1 - 1 / rOverRs);
}

/** Head-to-toe tidal acceleration on a 2 m body at r (in r_s), in g. */
export function tidalG(massSun: number, rOverRs: number): number {
  const M = massSun * M_SUN;
  const rs = (2 * G_SI * M) / (C_SI * C_SI);
  const r = Math.max(1e-3, rOverRs) * rs;
  return (2 * G_SI * M * 2) / (r * r * r) / 9.81;
}

export interface BlackHoleState {
  massSun: number;
  spin: number;
  rsKm: number;
  horizonRs: number;
  iscoRs: number;
  shadowRs: number;
  hawkingK: number;
  luminosityW: number;
  diskTempK: number;
  peakNm: number;
  band: string;
  jets: boolean;
  horizonTidalG: number;
}

export function blackHole(v: Vals): BlackHoleState {
  const logM = Math.min(10, Math.max(0.5, finite(v.logMass, 1.3)));
  const spin = Math.min(0.998, Math.max(0, finite(v.spin, 0.5)));
  const mdot = clamp01(finite(v.accretion, 0.3));
  const massSun = Math.pow(10, logM);
  const isco = iscoRadius(spin);                         // GM/c²
  const diskTempK = mdot <= 0 ? 0
    : 1e7 * Math.pow(massSun / 10, -0.25) * Math.pow(mdot, 0.25) * Math.pow(6 / isco, 0.75);
  const peakNm = diskTempK > 0 ? 2.898e6 / diskTempK : Infinity;
  const band = peakNm < 0.01 ? 'gamma rays' : peakNm < 10 ? 'X-rays' : peakNm < 400 ? 'ultraviolet'
    : peakNm < 700 ? 'visible light' : 'infrared';
  return {
    massSun,
    spin,
    rsKm: 2.953 * massSun,
    horizonRs: (1 + Math.sqrt(1 - spin * spin)) / 2,
    iscoRs: isco / 2,
    shadowRs: Math.sqrt(27) / 2,
    hawkingK: 6.17e-8 / massSun,
    luminosityW: mdot * 1.26e31 * massSun,
    diskTempK,
    peakNm,
    band,
    jets: spin > 0.3 && mdot > 0.05,
    horizonTidalG: tidalG(massSun, 1),
  };
}

/** World units per Schwarzschild radius inside the black-hole scene. */
export const BH_UNITS_PER_RS = 8;

const fmtSci = (x: number, unit = '') => {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return `0${unit}`;
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 5) return `${x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toPrecision(3)}${unit}`;
  return `${(x / 10 ** e).toFixed(1)}×10^${e}${unit}`;
};

/* ---------------------------------------------------------------------------
 * Cosmology (SIMULATED, pure + unit-tested): a Friedmann–Lemaître model with
 * radiation, matter, curvature and dark energy. H(a) = H0·E(a),
 * E² = Ωr a⁻⁴ + Ωm a⁻³ + Ωk a⁻² + ΩΛ. Cosmic time t(a) = ∫ da / (a H).
 * Temperature T = 2.7255 K / a; redshift z = 1/a − 1.
 * ------------------------------------------------------------------------- */

export const OMEGA_R = 9.1e-5;
const SEC_PER_GYR = 3.156e16;

export interface CosmoParams { h0: number; om: number; ol: number }

function cosmoParams(v: Vals): CosmoParams {
  return {
    h0: Math.min(90, Math.max(50, finite(v.h0, 67.4))),
    om: Math.min(1, Math.max(0.05, finite(v.om, 0.315))),
    ol: Math.min(1, Math.max(0, finite(v.ol, 0.685))),
  };
}

function e2(a: number, p: CosmoParams): number {
  const ok = 1 - p.om - p.ol - OMEGA_R;
  return OMEGA_R / a ** 4 + p.om / a ** 3 + ok / (a * a) + p.ol;
}

/** Hubble time 1/H0 in Gyr. */
export function hubbleTimeGyr(h0: number): number {
  return 977.8 / h0;
}

/** Scale factor where expansion would halt (closed, Λ-poor universes), else Infinity. */
export function turnaroundA(p: CosmoParams): number {
  let lo = Math.log(1e-3);
  if (e2(Math.exp(lo), p) <= 0) return Math.exp(lo);
  const hiMax = Math.log(1e4);
  // Scan upward for the first a where E² ≤ 0.
  for (let la = lo; la <= hiMax; la += 0.02) {
    if (e2(Math.exp(la), p) <= 0) {
      let hi = la;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (e2(Math.exp(m), p) > 0) lo = m; else hi = m; }
      return Math.exp(lo);
    }
    lo = la;
  }
  return Infinity;
}

/** Cosmic time (Gyr) when the scale factor reached a (expanding branch). */
export function ageAtA(a: number, p: CosmoParams): number {
  const th = hubbleTimeGyr(p.h0);
  const a0 = 1e-8;
  // Radiation-dominated start, analytically: t = a² / (2√Ωr) · t_H.
  let t = (a0 * a0) / (2 * Math.sqrt(OMEGA_R)) * th;
  if (a <= a0) return (a * a) / (2 * Math.sqrt(OMEGA_R)) * th;
  const n = 600;
  const l0 = Math.log(a0); const l1 = Math.log(a);
  const h = (l1 - l0) / n;
  const f = (l: number) => 1 / Math.sqrt(Math.max(1e-12, e2(Math.exp(l), p)));
  let sum = f(l0) + f(l1);
  for (let i = 1; i < n; i++) sum += f(l0 + i * h) * (i % 2 ? 4 : 2);
  t += (sum * h) / 3 * th;
  return t;
}

/** Scale factor at cosmic time t (Gyr); handles recollapse (Big Crunch → 0). */
export function scaleFactorAt(tGyr: number, p: CosmoParams): number {
  const th = hubbleTimeGyr(p.h0);
  const aTurn = turnaroundA(p);
  const tTurn = Number.isFinite(aTurn) ? ageAtA(aTurn, p) : Infinity;
  let t = tGyr;
  if (t > tTurn) {
    if (t >= 2 * tTurn) return 0;
    t = 2 * tTurn - t;                                   // symmetric collapse
  }
  const aRad = Math.sqrt((2 * Math.sqrt(OMEGA_R) * t) / th);
  if (aRad < 1e-8) return aRad;
  let lo = Math.log(1e-8);
  let hi = Math.log(Math.min(Number.isFinite(aTurn) ? aTurn : 1e4, 1e4));
  if (ageAtA(Math.exp(hi), p) < t) return Math.exp(hi);
  for (let k = 0; k < 48; k++) {
    const m = (lo + hi) / 2;
    if (ageAtA(Math.exp(m), p) < t) lo = m; else hi = m;
  }
  return Math.exp((lo + hi) / 2);
}

/** Map the 0..1 epoch slider onto cosmic time in seconds (10⁻³⁶ s … ~100 Gyr). */
export function epochSeconds(epoch: number): number {
  return Math.pow(10, -36 + 54.5 * clamp01(epoch));
}

export interface CosmicState {
  tSec: number;
  a: number;
  z: number;
  tempK: number;
  hubble: number;          // km/s/Mpc at that time
  accelerating: boolean;
  ageTodayGyr: number;
  phase: string;
  /** 0..1 transparency of the universe (opaque plasma → clear after recombination). */
  clarity: number;
  /** 0..1 how much structure (filaments, stars, galaxies) has formed. */
  structure: number;
  /** 0..1 star light switched on (cosmic dawn onward). */
  starlight: number;
  crunch: boolean;
}

export function cosmicState(v: Vals): CosmicState {
  const p = cosmoParams(v);
  const tSec = epochSeconds(finite(v.epoch, 0.97));
  const tGyr = tSec / SEC_PER_GYR;
  const a = Math.max(1e-40, scaleFactorAt(tGyr, p));
  const aTurn = turnaroundA(p);
  const collapsing = Number.isFinite(aTurn) && tGyr > ageAtA(aTurn, p);
  const crunch = a <= 1e-30 && tSec > 1e10;
  const ageTodayGyr = Number.isFinite(aTurn) && aTurn < 1 ? NaN : ageAtA(1, p);
  const E = Math.sqrt(Math.max(0, e2(a, p)));
  const q = (OMEGA_R / a ** 4 + p.om / (2 * a ** 3) - p.ol) / Math.max(1e-12, E * E);
  const yr = 3.156e7;
  const phase = crunch ? 'Big Crunch'
    : collapsing ? 'Collapsing universe'
      : tSec < 1e-32 ? 'Cosmic inflation'
        : tSec < 1e-6 ? 'Quark–gluon plasma'
          : tSec < 1 ? 'Hadron epoch'
            : tSec < 1200 ? 'Big Bang nucleosynthesis'
              : tSec < 3.8e5 * yr ? 'Opaque plasma (photon epoch)'
                : tSec < 1.5e8 * yr ? 'Dark Ages (CMB released)'
                  : tSec < 1e9 * yr ? 'Cosmic Dawn & reionization'
                    : Math.abs(tGyr - ageTodayGyr) < 0.6 ? 'Today'
                      : tGyr < (ageTodayGyr || 13.8) ? 'Age of galaxies'
                        : 'Far future';
  const lt = Math.log10(tSec);
  return {
    tSec, a, z: 1 / a - 1, tempK: 2.7255 / a, hubble: p.h0 * E,
    accelerating: q < 0, ageTodayGyr, phase,
    clarity: clamp01((lt - Math.log10(2.5e5 * yr)) / (Math.log10(6e5 * yr) - Math.log10(2.5e5 * yr))),
    structure: clamp01((lt - Math.log10(5e7 * yr)) / (Math.log10(3e9 * yr) - Math.log10(5e7 * yr))),
    starlight: clamp01((lt - Math.log10(1e8 * yr)) / (Math.log10(4e8 * yr) - Math.log10(1e8 * yr))),
    crunch,
  };
}

/** Human-readable cosmic age. */
export function fmtCosmicTime(sec: number): string {
  const yr = 3.156e7;
  if (sec < 1e-3) return `${fmtSci(sec)} s`;
  if (sec < 120) return `${sec.toPrecision(3)} s`;
  if (sec < 7200) return `${(sec / 60).toPrecision(3)} min`;
  if (sec < yr) return `${(sec / 86400).toPrecision(3)} days`;
  if (sec < 1e6 * yr) return `${Math.round(sec / yr).toLocaleString('en-US')} years`;
  if (sec < 1e9 * yr) return `${(sec / yr / 1e6).toPrecision(3)} million years`;
  return `${(sec / yr / 1e9).toPrecision(3)} billion years`;
}

/* ---------------------------------------------------------------------------
 * Space-weather model (SIMULATED, pure + unit-tested). Formulas follow the
 * standard textbook / NOAA SWPC relations, simplified for teaching:
 *  · GOES X-ray flare classes: A < 1e-7 ≤ B < 1e-6 ≤ C < 1e-5 ≤ M < 1e-4 ≤ X (W/m²)
 *  · NOAA radio-blackout scale R1 (M1) … R5 (X20)
 *  · CME Sun→Earth transit over 1 AU with drag pulling the CME toward the
 *    ambient solar-wind speed
 *  · Magnetopause stand-off from solar-wind dynamic pressure (Shue et al. 1998, Bz ≈ 0)
 *  · Kp → NOAA G-scale (Kp 5 = G1 … Kp 9 = G5); aurora boundary ≈ 66.5° − 2.5°·Kp
 * ------------------------------------------------------------------------- */

/** One astronomical unit in km. */
export const AU_KM = 1.496e8;

export interface SolarWeather {
  /** International sunspot number. */
  sunspots: number;
  /** Peak GOES 1–8 Å X-ray flux (W/m²). */
  xrayFlux: number;
  flareClass: string;
  /** NOAA radio blackout level 0..5 (0 = none). */
  rScale: number;
  /** CME Sun→Earth transit time in hours. */
  transitHours: number;
  /** Planetary K-index 0..9. */
  kp: number;
  /** NOAA geomagnetic storm level 0..5 (0 = none). */
  gScale: number;
  /** Lowest geomagnetic latitude where aurora is likely overhead (°). */
  auroraLat: number;
  /** Magnetopause stand-off distance in Earth radii. */
  standoffRe: number;
  /** Solar-wind dynamic pressure (nPa). */
  pressureNpa: number;
  /** Coronal temperature in millions of kelvin. */
  coronaMK: number;
  /** Typical sunspot latitude at this activity (Spörer's law), degrees. */
  spotLatDeg: number;
}


/** GOES letter class for a peak X-ray flux, e.g. 3.2e-5 → "M3.2". */
export function flareClassOf(flux: number): string {
  const f = Math.max(1e-9, flux);
  const bands: [string, number][] = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]];
  for (const [letter, base] of bands) {
    if (f >= base) return `${letter}${(f / base).toFixed(1)}`;
  }
  return `A${(f / 1e-8).toFixed(1)}`;
}

/** NOAA radio-blackout scale (0..5) from peak X-ray flux. */
export function radioBlackout(flux: number): number {
  return flux >= 2e-3 ? 5 : flux >= 1e-3 ? 4 : flux >= 1e-4 ? 3 : flux >= 5e-5 ? 2 : flux >= 1e-5 ? 1 : 0;
}

/** CME transit time (h) over 1 AU, with drag toward the solar-wind speed. */
export function cmeTransitHours(cmeKms: number, windKms: number): number {
  const w = Math.max(200, windKms);
  const v = Math.max(100, cmeKms);
  const vEff = w + (v - w) * 0.6;
  return AU_KM / vEff / 3600;
}

/** Magnetopause stand-off (R_E) for density n (cm⁻³) and speed v (km/s). */
export function magnetopauseStandoff(n: number, v: number): { re: number; pressure: number } {
  const pressure = 1.6726e-6 * Math.max(0.1, n) * Math.max(100, v) ** 2; // nPa
  return { re: 11.4 * Math.pow(pressure, -1 / 6.6), pressure };
}

/** Full simulated space-weather state from the slider values. */
export function solarWeather(v: Vals): SolarWeather {
  const activity = clamp01(finite(v.activity, 0.5));
  const flare = clamp01(finite(v.flare, 0.4));
  const cme = Math.min(3000, Math.max(250, finite(v.cme, 800)));
  const wind = Math.min(900, Math.max(250, finite(v.wind, 450)));
  const sunspots = Math.round(5 + 215 * Math.pow(activity, 1.2));
  const xrayFlux = Math.pow(10, -8 + 5 * flare);
  const kp = Math.min(9, Math.max(0, 1 + (wind - 350) / 120 + Math.max(0, cme - 450) / 330));
  const gScale = kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0;
  const mp = magnetopauseStandoff(5, wind);
  return {
    sunspots,
    xrayFlux,
    flareClass: flareClassOf(xrayFlux),
    rScale: radioBlackout(xrayFlux),
    transitHours: cmeTransitHours(cme, wind),
    kp,
    gScale,
    auroraLat: 66.5 - 2.5 * kp,
    standoffRe: mp.re,
    pressureNpa: mp.pressure,
    coronaMK: 1 + 1.5 * activity,
    spotLatDeg: 28 - 18 * activity,
  };
}

/** Sun's differential rotation rate (°/day) at a heliographic latitude (°). */
export function solarRotationRate(latDeg: number): number {
  const s2 = Math.sin((latDeg * Math.PI) / 180) ** 2;
  return 14.713 - 2.396 * s2 - 1.787 * s2 * s2;
}

const fmtTransit = (h: number) => (h >= 48 ? `~${(h / 24).toFixed(1)} days` : `~${Math.round(h)} h`);

export const HAZARDS: HazardDef[] = [
  {
    id: 'hurricane', title: 'Hurricane Simulator', icon: 'cyclone', category: 'Storms & wind',
    difficulty: 'Intense',
    blurb: 'Walk a coastal town as a spiral storm churns offshore. Wind, rain bands, surf and thunder all track your distance to the eye.',
    edu: 'Real hurricanes are heat engines: warm ocean water evaporates, rises, and the Coriolis effect spins the inflow. The calm eye sits inside the violent eyewall. Category ratings use sustained wind — this sim compresses all of that into audible layers.',
    safety: 'Never chase real hurricanes. Heed evacuation orders; storm surge — not wind — causes most deaths. This is a learning toy, not a forecast.',
    mappingExpl: [
      'Closer to the eye → louder wind bed and deeper surf roar.',
      'Rainfall slider → steady high hiss of rain bands.',
      'Storm-direction slider → slants the rain and swings the surf around you (spatial audio follows).',
      'Thunder booms arrive more often at higher simulated intensity.',
    ],
    paramDefs: [
      { key: 'intensity', label: 'Storm intensity', min: 0.1, max: 1, step: 0.05, unit: '%', hint: 'Overall simulated strength' },
      { key: 'rainfall', label: 'Rainfall rate', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Simulated rain-band density' },
      { key: 'windKmh', label: 'Wind speed', min: 60, max: 280, step: 5, unit: 'km/h (sim)', hint: 'Simulated sustained wind' },
      { key: 'direction', label: 'Storm direction', min: 0, max: 360, step: 5, unit: '° (sim)', hint: 'Which way bands stream past you' },
    ],
    defaults: { intensity: 0.6, rainfall: 0.6, windKmh: 150, direction: 40 },
    presets: [
      { id: 'ts', name: 'Tropical Storm', blurb: 'Breezy outer bands, modest surf.', values: { intensity: 0.3, rainfall: 0.4, windKmh: 90, direction: 40 }, spawn: 280 },
      { id: 'cat3', name: 'Major Hurricane', blurb: 'Howling eyewall within reach.', values: { intensity: 0.7, rainfall: 0.7, windKmh: 190, direction: 40 }, spawn: 190 },
      { id: 'cat5', name: 'Extreme Landfall', blurb: 'Maximum simulated fury — audio stays capped.', values: { intensity: 1, rainfall: 1, windKmh: 270, direction: 40 }, spawn: 130 },
    ],
    layers: [
      { key: 'rumble', noise: 'brown', filter: 'lowpass', freq: 80, q: 0.6 },
      { key: 'wind', noise: 'white', filter: 'bandpass', freq: 500, q: 0.5 },
      { key: 'rain', noise: 'white', filter: 'highpass', freq: 4500, q: 0.5 },
      { key: 'surf', noise: 'brown', filter: 'lowpass', freq: 220, q: 0.8 },
    ],
    withTone: true,
    gains: (v, d) => {
      const dv = dVol(d);
      const wn = (v.windKmh - 60) / 220;
      return {
        rumble: 0.5 * v.intensity * (0.3 + 0.7 * dv),
        wind: (0.25 + 0.75 * wn) * (0.35 + 0.65 * dv),
        rain: v.rainfall * (0.35 + 0.65 * dv),
        surf: (0.3 + 0.6 * v.intensity) * dv,
      };
    },
    tone: (v, d, t) => ({ level: det(d) * v.intensity * 0.8, freq: 700 + 500 * v.intensity + 150 * Math.sin(t / 3) }),
    boom: (v, d) => v.intensity * dVol(d) * 0.9,
    ticks: (v, d) => ({ rate: v.rainfall * (3 + 11 * dVol(d)), level: v.rainfall * (0.3 + 0.7 * dVol(d)), hp: 5200 }),
    tickMode: 'hiss',
    sub: (v, d) => ({ level: (0.25 + 0.75 * v.intensity) * (0.35 + 0.65 * dVol(d)), freq: 34 + v.intensity * 8 }),
    freqs: (v) => ({ wind: 300 + ((v.windKmh - 60) / 220) * 900, surf: 140 + v.intensity * 160 }),
    hud: (d, b, v) => [
      { label: 'Wind (sim)', value: `~${Math.round(v.windKmh)} km/h` },
      { label: 'Central pressure (sim)', value: `~${Math.round(1013 - pressureDropMb(v.windKmh))} mb` },
      { label: 'Storm surge (sim)', value: `~${surgeMetres(v.windKmh, v.intensity).toFixed(1)} m` },
      { label: 'Rain (sim)', value: `${Math.round(v.rainfall * 100)}%` },
      { label: 'Eye distance', value: `~${Math.round(d)} m` },
      { label: 'Eye bearing', value: `${Math.round(b)}°` },
    ],
    status: (v, d) => `Simulated ${Math.round(v.windKmh)} km/h winds, rain at ${Math.round(v.rainfall * 100)}%, eye ~${Math.round(d)} m away — ${d < 150 ? 'you are inside the roar; surf and wind dominate.' : 'outer bands hiss; the deep surf stays distant.'}`,
    gauges: (v) => {
      const w = v.windKmh;
      const cat = w >= 179 ? 5 : w >= 157 ? 4 : w >= 130 ? 3 : w >= 111 ? 2 : w >= 94 ? 1 : 0;
      const cls = cat === 0
        ? (w >= 63 ? 'Tropical storm' : 'Tropical depression')
        : `Category ${cat} hurricane`;
      return [
        { label: 'Saffir–Simpson (sim)', frac: Math.min(1, w / 260), text: `${cls} · ~${Math.round(w)} km/h` },
        { label: 'Rain rate', frac: v.rainfall, text: v.rainfall > 0.7 ? 'torrential' : v.rainfall > 0.4 ? 'heavy' : 'moderate' },
        { label: 'Central pressure (sim)', frac: pressureDropMb(w) / 100, text: `~${Math.round(1013 - pressureDropMb(w))} mb · −${Math.round(pressureDropMb(w))} mb (sim)` },
        { label: 'Storm surge (sim)', frac: clamp01(surgeMetres(w, v.intensity) / 6), text: `~${surgeMetres(w, v.intensity).toFixed(1)} m ashore (sim)` },
      ];
    },
  },
  {
    id: 'earthquake', title: 'Earthquake Simulator', icon: 'activity', category: 'Geology',
    difficulty: 'Moderate',
    blurb: 'Feel a virtual city block shake — and break. Dial a simulated magnitude, trigger tremors, and watch buildings crack, lean, and pancake into rubble.',
    edu: 'Quakes release energy as seismic waves: fast P-waves, then destructive S- and surface waves. Each magnitude step is ~32× the energy. Low rumbles arrive first in this sim, shaking peaks with the S-wave, then creaks settle. Weak buildings fail first; sustained shaking topples even stronger ones, and broken gas lines can ignite fires in the ruins.',
    safety: 'Real quakes: Drop, Cover, and Hold On. Never run outside during shaking. This sim cannot predict or reproduce real events.',
    mappingExpl: [
      'Magnitude slider → deeper rumble and stronger camera shake.',
      'Trigger tremor → a shaking episode lasting your duration setting.',
      'Creaks and crashes peak mid-tremor, then decay like settling buildings.',
      'Damage accumulates while shaking — weak buildings crack, lean, and collapse into rubble piles.',
      'After strong quakes, dust rises from the ruins and broken gas lines spark fires.',
      'The seismograph draws shaking amplitude live — watch P, S, and coda phases.',
    ],
    paramDefs: [
      { key: 'magnitude', label: 'Magnitude', min: 3, max: 8.5, step: 0.1, unit: 'Mw (sim)', hint: 'Simulated moment magnitude' },
      { key: 'duration', label: 'Tremor duration', min: 5, max: 60, step: 5, unit: 's (sim)', hint: 'How long a triggered tremor lasts' },
      { key: 'shake', label: 'Camera shake', min: 0, max: 1, step: 0.05, unit: '%', hint: 'How much your view rattles' },
    ],
    defaults: { magnitude: 5.5, duration: 20, shake: 0.7 },
    presets: [
      { id: 'minor', name: 'Minor Tremor', blurb: 'Rattling windows, gentle sway.', values: { magnitude: 4, duration: 10, shake: 0.5 }, spawn: 150 },
      { id: 'major', name: 'Major Quake', blurb: 'Strong shaking, falling debris sounds.', values: { magnitude: 6.5, duration: 25, shake: 0.8 }, spawn: 150 },
      { id: 'great', name: 'Great Quake', blurb: 'Maximum simulated shaking — capped audio.', values: { magnitude: 8.2, duration: 45, shake: 1 }, spawn: 150 },
    ],
    layers: [
      { key: 'rumble', noise: 'brown', filter: 'lowpass', freq: 60, q: 0.7 },
      { key: 'grind', noise: 'white', filter: 'bandpass', freq: 240, q: 1.2 },
      { key: 'creak', noise: 'white', filter: 'bandpass', freq: 900, q: 6 },
    ],
    withTone: false,
    gains: (v, d) => {
      const m = (v.magnitude - 3) / 5.5;
      const tremor = v._tremor ?? 0; // injected envelope 0..1 by the runner
      const env = 0.25 + 0.75 * tremor;
      const dv = 0.4 + 0.6 * dVol(d);
      return {
        rumble: (0.3 + 0.7 * m) * env * dv,
        grind: m * tremor * dv,
        creak: Math.max(0, m - 0.3) * tremor * det(d),
      };
    },
    tone: () => ({ level: 0, freq: 55 }),
    boom: (v) => ((v._tremor ?? 0) > 0.85 && v.magnitude > 6) || (v.magnitude > 7 && (v._tremor ?? 0) > 0.5) ? 0.5 : 0,
    ticks: (v, d) => {
      const m = (v.magnitude - 3) / 5.5;
      const tremor = v._tremor ?? 0;
      return { rate: tremor * m * 20, level: tremor * m * dVol(d), hp: 1800 };
    },
    tickMode: 'pop',
    tickBand: [700, 3200],
    sub: (v) => {
      const m = (v.magnitude - 3) / 5.5;
      const tremor = v._tremor ?? 0;
      return { level: (0.2 + 0.8 * m) * (0.25 + 0.75 * tremor), freq: 30 + m * 8 };
    },
    freqs: (v) => ({ rumble: 45 + (v.magnitude - 3) * 12, grind: 180 + (v._tremor ?? 0) * 160 }),
    hud: (d, _b, v) => [
      { label: 'Magnitude (sim)', value: `Mw ${v.magnitude.toFixed(1)}` },
      { label: 'Peak ground accel (sim)', value: `${peakGroundG(v.magnitude).toFixed(2)} g` },
      { label: 'Felt radius (sim)', value: `~${feltRadiusKm(v.magnitude).toFixed(1)} km` },
      { label: 'Collapse risk (sim)', value: `${Math.round(collapseRisk(v.magnitude, v.duration) * 100)}%` },
      { label: 'Shaking', value: `${Math.round((v._tremor ?? 0) * 100)}%` },
      { label: 'Epicenter', value: `~${Math.round(d)} m` },
      { label: 'Duration (sim)', value: `${v.duration}s` },
    ],
    status: (v) => {
      const t = v._tremor ?? 0;
      return t > 0.6 ? `Simulated Mw ${v.magnitude.toFixed(1)} — strong shaking now; structures cracking and failing at their peak.` :
        t > 0.15 ? 'Tremor fading — creaks, dust, and settling rubble as shaking decays.' :
        'Quiet street. Press “Trigger tremor” to feel your magnitude setting.';
    },
    gauges: (v) => {
      const m = v.magnitude;
      const mmi = m >= 8 ? 'IX violent' : m >= 7 ? 'VIII severe' : m >= 6 ? 'VII very strong' : m >= 5.5 ? 'VI strong' : m >= 4.5 ? 'V moderate' : 'IV light';
      const energy = Math.pow(32, m - 5);
      const risk = collapseRisk(m, v.duration);
      return [
        { label: 'Shaking intensity (MMI)', frac: (m - 3) / 5.5, text: `${mmi} · Mw ${m.toFixed(1)} (sim)` },
        {
          label: 'Energy vs M5.0',
          frac: Math.min(1, Math.log10(Math.max(1, energy)) / 3),
          text: `≈ ${energy >= 1000 ? energy.toExponential(1) : energy.toFixed(0)}× (sim)`,
        },
        { label: 'Peak ground accel (sim)', frac: peakGroundG(m) / 1.5, text: `${peakGroundG(m).toFixed(2)} g at ~10 km (sim)` },
        { label: 'Structural damage (sim)', frac: risk, text: `${damageLabel(risk)} (sim)` },
        { label: 'Felt radius (sim)', frac: Math.log10(Math.max(1, feltRadiusKm(m))) / 3, text: `shaking felt ~${feltRadiusKm(m).toFixed(1)} km out (sim)` },
      ];
    },
    tremorButton: true,
    seismo: true,
  },
  {
    id: 'volcano', title: 'Volcano Simulator', icon: 'volcano', category: 'Geology',
    difficulty: 'Intense',
    blurb: 'Climb the flank of a restless cone. Eruption columns, hissing gas, glowing lava flows — all louder as you near the crater.',
    edu: 'Eruptions fragment magma into ash when gas bubbles burst; fluid basaltic lava can flow for kilometers. Blast loudness in this sim tracks eruption rate, hiss tracks gas, glow tracks lava output.',
    safety: 'Real volcanoes kill with pyroclastic flows, lahars, and toxic gas — from kilometers away. Never approach an erupting volcano. Toy only.',
    mappingExpl: [
      'Eruption slider → roar of the column and flash rate of gas bursts.',
      'Ash slider → gritty wind layer and gray plume density.',
      'Lava slider → deep glow-hum and brightness of flows.',
      'Crater booms scale with eruption × closeness (always capped).',
    ],
    paramDefs: [
      { key: 'eruption', label: 'Eruption intensity', min: 0.05, max: 1, step: 0.05, unit: '%', hint: 'Simulated eruption rate' },
      { key: 'ash', label: 'Ash emission', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Simulated ash output' },
      { key: 'lava', label: 'Lava output', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Simulated lava flow rate' },
    ],
    defaults: { eruption: 0.55, ash: 0.5, lava: 0.5 },
    presets: [
      { id: 'stromb', name: 'Strombolian Bursts', blurb: 'Rhythmic pops and glowing vents.', values: { eruption: 0.35, ash: 0.3, lava: 0.6 }, spawn: 220 },
      { id: 'vulc', name: 'Vulcanian Column', blurb: 'Tall ash column, heavy rumble.', values: { eruption: 0.65, ash: 0.7, lava: 0.4 }, spawn: 170 },
      { id: 'plin', name: 'Plinian Blast', blurb: 'Maximum simulated column — capped audio.', values: { eruption: 1, ash: 1, lava: 0.7 }, spawn: 140 },
    ],
    layers: [
      { key: 'rumble', noise: 'brown', filter: 'lowpass', freq: 70, q: 0.6 },
      { key: 'roar', noise: 'white', filter: 'bandpass', freq: 350, q: 0.7 },
      { key: 'ashwind', noise: 'white', filter: 'bandpass', freq: 1400, q: 0.8 },
      { key: 'hiss', noise: 'white', filter: 'highpass', freq: 5200, q: 0.5 },
    ],
    withTone: true,
    gains: (v, d) => {
      const dv = dVol(d);
      return {
        rumble: (0.3 + 0.7 * v.eruption) * (0.35 + 0.65 * dv),
        roar: v.eruption * (0.4 + 0.6 * dv),
        ashwind: v.ash * (0.4 + 0.6 * det(d)),
        hiss: (0.2 + 0.8 * v.eruption) * det(d) * 0.8,
      };
    },
    tone: (v, d, t) => ({ level: v.lava * dVol(d) * 0.7, freq: 48 + v.lava * 30 + 4 * Math.sin(t / 5) }),
    boom: (v, d) => v.eruption * dVol(d),
    ticks: (v, d) => ({ rate: v.eruption * det(d) * 6, level: v.eruption * det(d) * 0.7, hp: 2400 }),
    tickMode: 'pop',
    tickBand: [800, 2600],
    sub: (v, d) => ({ level: v.eruption * (0.4 + 0.6 * dVol(d)), freq: 32 + v.eruption * 10 }),
    freqs: (v) => ({ roar: 250 + v.eruption * 350, ashwind: 900 + v.ash * 900 }),
    hud: (d, b, v) => [
      { label: 'Eruption (sim)', value: `${Math.round(v.eruption * 100)}%` },
      { label: 'Ash (sim)', value: `${Math.round(v.ash * 100)}%` },
      { label: 'Lava temp (sim)', value: `${Math.round(1000 + v.lava * 200)} °C` },
      { label: 'SO2 flux (sim)', value: `${Math.round(200 + v.eruption * 19800)} t/day` },
      { label: 'Crater distance', value: `~${Math.round(d)} m` },
      { label: 'Crater bearing', value: `${Math.round(b)}°` },
    ],
    status: (v, d) => `Simulated eruption at ${Math.round(v.eruption * 100)}%, crater ~${Math.round(d)} m — ${d < 150 ? 'column roar and gas hiss dominate.' : 'a deep rolling grumble with drifting ash hiss.'}`,
    gauges: (v) => {
      const vei = Math.max(1, Math.min(5, Math.round(1 + v.eruption * 2.2 + v.ash * 1.6)));
      const plume = 2 + v.ash * 16;
      return [
        {
          label: 'Eruptive power (VEI)',
          frac: vei / 5,
          text: `VEI ${vei} · ${v.eruption > 0.85 ? 'catastrophic' : v.eruption > 0.6 ? 'explosive' : 'moderate'} (sim)`,
        },
        { label: 'Ash plume', frac: v.ash, text: `~${plume.toFixed(0)} km altitude (sim)` },
        { label: 'Lava effusion', frac: v.lava, text: v.lava > 0.7 ? 'rapid flows' : v.lava > 0.4 ? 'steady flows' : 'slow ooze' },
        { label: 'Lava temperature (sim)', frac: clamp01(v.lava), text: `${Math.round(1000 + v.lava * 200)} °C · basaltic (sim)` },
        { label: 'SO2 flux (sim)', frac: clamp01(v.eruption), text: `${Math.round(200 + v.eruption * 19800)} t/day (sim)` },
      ];
    },
  },
  {
    id: 'ocean', title: 'Deep Ocean Simulator', icon: 'waves', category: 'Oceans',
    difficulty: 'Gentle',
    blurb: 'Drift over a twilight seafloor as a diver. Filtered wash, rising bubbles, tugging currents, and a distant whale.',
    edu: 'Water absorbs high frequencies fast, so the deep sea sounds muffled and low. Sperm-whale clicks and baleen moans travel kilometers. Pressure rises ~1 atm per 10 m — your depth slider darkens and quiets the world like descent.',
    safety: 'Real diving needs training, a buddy, and depth limits. This is a surface-dry daydream, not dive instruction.',
    mappingExpl: [
      'Depth slider → darker water, quieter wash, stronger whale presence.',
      'Current slider → push on your diver, faster particle drift, louder flow textures.',
      'Temperature is ambience flavor: colder adds brittle high detail, warmer softens it.',
      'Bubbles tick upward around you; distant geology rumbles faintly below.',
      'Board the big yellow scuba sub (E key or Ride button) — joystick steers, Jump rises, Run boosts.',
    ],
    paramDefs: [
      { key: 'depth', label: 'Depth', min: 5, max: 200, step: 5, unit: 'm (sim)', hint: 'Simulated dive depth' },
      { key: 'current', label: 'Current strength', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Simulated current push' },
      { key: 'temp', label: 'Water temperature', min: -2, max: 30, step: 1, unit: '°C (sim)', hint: 'Simulated temperature flavor' },
    ],
    defaults: { depth: 60, current: 0.4, temp: 8 },
    presets: [
      { id: 'reef', name: 'Sunlit Reef', blurb: 'Bright, busy, bubbly shallows.', values: { depth: 12, current: 0.25, temp: 24 }, spawn: 120 },
      { id: 'twilight', name: 'Twilight Zone', blurb: 'Dim blue, strong drift, whale song.', values: { depth: 120, current: 0.55, temp: 8 }, spawn: 120 },
      { id: 'abyss', name: 'Abyss Edge', blurb: 'Near-dark, muffled, geological groans.', values: { depth: 195, current: 0.3, temp: 2 }, spawn: 120 },
    ],
    layers: [
      { key: 'wash', noise: 'brown', filter: 'lowpass', freq: 300, q: 0.5 },
      { key: 'flow', noise: 'white', filter: 'bandpass', freq: 700, q: 0.9 },
      { key: 'sparkle', noise: 'white', filter: 'highpass', freq: 6000, q: 0.6 },
      { key: 'geo', noise: 'brown', filter: 'lowpass', freq: 55, q: 0.7 },
    ],
    withTone: true,
    gains: (v) => {
      const dn = v.depth / 200;
      const cold = 1 - (v.temp + 2) / 32;
      return {
        wash: 0.75 - dn * 0.35,
        flow: 0.2 + v.current * 0.7,
        sparkle: (1 - dn) * (0.25 + 0.5 * cold),
        geo: 0.25 + dn * 0.5,
      };
    },
    tone: (v, _d, t) => {
      const dn = v.depth / 200;
      return { level: 0.25 + dn * 0.65, freq: 52 + 26 * Math.sin(t / 9) + 10 * Math.sin(t / 23) };
    },
    boom: (v) => (v.depth > 150 ? 0.25 : 0.08),
    ticks: (v) => ({ rate: 2 + (1 - v.depth / 200) * 7, level: 0.5, hp: 3800 }),
    tickMode: 'bloop',
    sub: (v) => ({ level: 0.3 + (v.depth / 200) * 0.6, freq: 30 + (1 - v.depth / 200) * 8 }),
    freqs: (v) => ({ wash: 380 - (v.depth / 200) * 220, flow: 450 + v.current * 700 }),
    hud: (_d, _b, v) => [
      { label: 'Depth (sim)', value: `~${Math.round(v.depth)} m` },
      { label: 'Pressure (sim)', value: `${(1 + v.depth / 10).toFixed(1)} atm` },
      { label: 'Light at surface (sim)', value: v.depth < 40 ? 'Sunlit' : v.depth < 140 ? 'Twilight' : 'Near-dark' },
      { label: 'Current (sim)', value: `${Math.round(v.current * 100)}%` },
      { label: 'Temp (sim)', value: `${v.temp}°C` },
      { label: 'Light', value: v.depth < 40 ? 'Sunlit' : v.depth < 140 ? 'Twilight' : 'Near-dark' },
    ],
    status: (v) => `Simulated ${Math.round(v.depth)} m down, ${v.temp}°C water — ${v.depth < 40 ? 'bright bubbly shallows.' : v.depth < 140 ? 'muffled blue with a singing whale.' : 'near-dark; geology groans below.'}`,
    gauges: (v) => {
      const dn = Math.min(1, Math.max(0, v.depth / 200));
      const atm = 1 + v.depth / 10;
      const zone = v.depth < 40 ? 'Sunlit' : v.depth < 140 ? 'Twilight' : 'Near-dark';
      const lightPct = Math.round(100 * Math.exp(-0.045 * Math.max(0, v.depth)));
      return [
        { label: 'Depth meter', frac: dn, text: `~${Math.round(v.depth)} m · ~${atm.toFixed(1)} atm · ${zone}` },
        { label: 'Light penetration (sim)', frac: lightPct / 100, text: lightPct < 1 ? '<1% of surface light (sim)' : `${lightPct}% of surface light (sim)` },
      ];
    },
  },
  {
    id: 'wildfire', title: 'Wildfire Simulator', icon: 'flame', category: 'Land & forests',
    difficulty: 'Intense',
    blurb: 'Edge a pine forest as a fire front advances. Crackle density, roar, and smoke all follow dryness, wind, and your distance.',
    edu: 'Fire needs heat, oxygen, and fuel — dryness sets fuel readiness, wind drives spread and long-range spotting. Crackle rate in this sim tracks burning intensity; the roar tracks the flaming front, not your safety.',
    safety: 'Real wildfire: leave early, never outrun a front, watch for smoke. Report smoke to local authorities. This sim teaches sound, not survival.',
    mappingExpl: [
      'Fire intensity × dryness → crackle density and flame roar.',
      'Wind speed pushes smoke/embers and feeds the roar; direction swings them around you.',
      'Closer to the front → brighter crackle detail; smoke rumble lingers even far away.',
      'Green (damp) settings hush the fire to ember pops.',
    ],
    paramDefs: [
      { key: 'fire', label: 'Fire intensity', min: 0.05, max: 1, step: 0.05, unit: '%', hint: 'Simulated front intensity' },
      { key: 'dryness', label: 'Vegetation dryness', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Simulated fuel dryness' },
      { key: 'windSpeed', label: 'Wind speed', min: 0, max: 60, step: 2, unit: 'km/h (sim)', hint: 'Simulated wind pushing the front' },
      { key: 'windDir', label: 'Wind direction', min: 0, max: 360, step: 5, unit: '° (sim)', hint: 'Where smoke and embers drift' },
    ],
    defaults: { fire: 0.1, dryness: 0.5, windSpeed: 10, windDir: 90 },
    presets: [
      { id: 'smolder', name: 'Smoldering Edge', blurb: 'Ember pops, thin smoke.', values: { fire: 0.25, dryness: 0.4, windSpeed: 8, windDir: 90 }, spawn: 200 },
      { id: 'crown', name: 'Crown Run', blurb: 'Roaring front, thick embers.', values: { fire: 0.7, dryness: 0.8, windSpeed: 30, windDir: 90 }, spawn: 160 },
      { id: 'mega', name: 'Megafire Blowup', blurb: 'Maximum simulated front — capped audio.', values: { fire: 1, dryness: 1, windSpeed: 55, windDir: 90 }, spawn: 130 },
    ],
    layers: [
      { key: 'rumble', noise: 'brown', filter: 'lowpass', freq: 110, q: 0.6 },
      { key: 'roar', noise: 'white', filter: 'bandpass', freq: 420, q: 0.6 },
      { key: 'wind', noise: 'white', filter: 'bandpass', freq: 800, q: 0.5 },
    ],
    withTone: false,
    gains: (v, d) => {
      const dv = dVol(d);
      const burn = v.fire * (0.3 + 0.7 * v.dryness);
      const wn = v.windSpeed / 60;
      return {
        rumble: (0.2 + 0.5 * burn) * (0.4 + 0.6 * dv),
        roar: burn * (0.35 + 0.65 * dv) * (0.6 + 0.4 * wn),
        wind: wn * (0.4 + 0.6 * dv),
      };
    },
    tone: () => ({ level: 0, freq: 55 }),
    boom: () => 0,
    ticks: (v, d) => {
      const burn = v.fire * (0.3 + 0.7 * v.dryness);
      return { rate: 2 + burn * det(d) * 24, level: 0.3 + burn * det(d) * 0.7, hp: 2600 };
    },
    tickMode: 'pop',
    tickBand: [1500, 5200],
    sub: (v, d) => {
      const burn = v.fire * (0.3 + 0.7 * v.dryness);
      return { level: burn * (0.35 + 0.65 * dVol(d)) * 0.8, freq: 36 + burn * 8 };
    },
    freqs: (v) => ({ roar: 300 + v.fire * 400, wind: 500 + (v.windSpeed / 60) * 800 }),
    hud: (d, _b, v) => [
      { label: 'Front (sim)', value: `${Math.round(v.fire * 100)}%` },
      { label: 'Flame length (sim)', value: `~${(v.fire * (0.5 + 2 * v.dryness)).toFixed(1)} m` },
      { label: 'Head-fire intensity (sim)', value: `${Math.round(25000 * Math.pow(v.fire, 1.5) * (0.4 + 0.6 * v.dryness))} kW/m` },
      { label: 'Dryness (sim)', value: `${Math.round(v.dryness * 100)}%` },
      { label: 'Fireline distance', value: `~${Math.round(d)} m` },
      { label: 'Wind (sim)', value: `${Math.round(v.windSpeed)} km/h → ${Math.round(v.windDir)}°` },
    ],
    status: (v, d) => `Simulated front at ${Math.round(v.fire * 100)}% with ${Math.round(v.dryness * 100)}% dry fuel, ~${Math.round(d)} m off — ${d < 140 ? 'crackle and roar close in.' : 'a low smoky rumble with drifting pops.'}`,
    gauges: (v) => {
      const fwi = Math.round(v.fire * 20 + v.dryness * 15 + v.windSpeed * 0.4);
      const fwiClass = fwi >= 50 ? 'extreme' : fwi >= 30 ? 'very high' : fwi >= 15 ? 'high' : fwi >= 5 ? 'moderate' : 'low';
      const spread = v.fire * (0.4 + 0.6 * v.dryness) * (0.5 + v.windSpeed / 60);
      const smoke = clamp01(v.fire * (0.4 + 0.6 * v.dryness));
      return [
        { label: 'Fire weather index', frac: Math.min(1, fwi / 60), text: `${fwi} · ${fwiClass} (sim)` },
        { label: 'Head fire spread', frac: Math.min(1, spread), text: `~${(spread * 12).toFixed(1)} km/h (sim)` },
        { label: 'Flame length (sim)', frac: clamp01((v.fire * (0.5 + 2 * v.dryness)) / 5), text: `~${(v.fire * (0.5 + 2 * v.dryness)).toFixed(1)} m flames (sim)` },
        { label: 'Smoke visibility (sim)', frac: clamp01(smoke), text: smoke > 0.6 ? 'heavy smoke, ~2 km visibility (sim)' : smoke > 0.3 ? 'hazy smoke, ~10 km visibility (sim)' : 'light smoke, clear air (sim)' },
      ];
    },
  },
  {
    id: 'tsunami', title: 'Tsunami Simulator', icon: 'waves', category: 'Oceans',
    difficulty: 'Intense',
    blurb: 'Stand on a waterfront promenade as a wall of water rises offshore and surges inland. Rolling roar, spray, and sub-bass surge all follow wave height and the front’s distance.',
    edu: 'Real tsunamis are long-wavelength waves usually triggered by undersea earthquakes or landslides — not by weather. In the open ocean a tsunami can be under a meter tall yet race at 700+ km/h with wavelengths over 100 km; it only steepens into a wall as the sea shallows. NASA satellite altimeters like Sentinel-6 measure sea surface height from orbit; local detection uses ocean buoy networks like NOAA’s DART.',
    safety: 'If you feel strong or long shaking at the coast, or the sea suddenly pulls back, go to high ground immediately — do not wait for an official warning. This is a training toy, not a forecast.',
    mappingExpl: [
      'Wave height → weight of the sub-bass surge and how much water piles onto the shore.',
      'Wave speed → how fast the front crosses the water; the rush hiss sharpens as it climbs.',
      'Closer to the front → sharper spray and louder rolling roar; everything else stays a deep offshore grumble.',
      'Sea temperature flavors the ambience: colder adds brittle high hiss, warmer softens it.',
    ],
    paramDefs: [
      { key: 'waveHeight', label: 'Wave height', min: 2, max: 20, step: 1, unit: 'm (sim)', hint: 'Simulated crest height at the shore' },
      { key: 'waveSpeed', label: 'Wave speed', min: 30, max: 120, step: 5, unit: 'km/h (sim)', hint: 'Simulated front travel speed' },
      { key: 'pullback', label: 'Surge run-up', min: 0, max: 1, step: 0.05, unit: '%', hint: 'How far the water pushes inland' },
      { key: 'temp', label: 'Sea temperature', min: -2, max: 30, step: 1, unit: '°C (sim)', hint: 'Simulated temperature flavor' },
    ],
    defaults: { waveHeight: 8, waveSpeed: 70, pullback: 0.5, temp: 17 },
    presets: [
      { id: 'swell', name: 'Distant Swell', blurb: 'Small long-period waves, soft roar.', values: { waveHeight: 4, waveSpeed: 40, pullback: 0.3, temp: 20 }, spawn: 240 },
      { id: 'warning', name: 'Coastal Warning', blurb: 'A real wall of water at the promenade.', values: { waveHeight: 10, waveSpeed: 75, pullback: 0.55, temp: 17 }, spawn: 170 },
      { id: 'mega', name: 'Mega Tsunami', blurb: 'Maximum simulated surge — capped audio.', values: { waveHeight: 20, waveSpeed: 115, pullback: 0.8, temp: 15 }, spawn: 120 },
    ],
    layers: [
      { key: 'rumble', noise: 'brown', filter: 'lowpass', freq: 55, q: 0.7 },
      { key: 'surge', noise: 'brown', filter: 'lowpass', freq: 160, q: 0.9 },
      { key: 'rush', noise: 'white', filter: 'bandpass', freq: 420, q: 0.7 },
      { key: 'spray', noise: 'white', filter: 'highpass', freq: 5500, q: 0.5 },
    ],
    withTone: true,
    gains: (v, d) => {
      const dv = dVol(d);
      const hn = (v.waveHeight - 2) / 18;
      const sn = (v.waveSpeed - 30) / 90;
      const cold = 1 - (v.temp + 2) / 32;
      return {
        rumble: (0.25 + 0.75 * hn) * (0.3 + 0.7 * dv),
        surge: (0.2 + 0.6 * hn) * (0.35 + 0.65 * dv),
        rush: sn * (0.3 + 0.7 * det(d)),
        spray: hn * (0.2 + 0.5 * cold) * det(d) * 0.9,
      };
    },
    tone: (v, d, t) => {
      const hn = (v.waveHeight - 2) / 18;
      return { level: (0.2 + 0.8 * hn) * dVol(d) * 0.7, freq: 42 + hn * 26 + 3 * Math.sin(t / 4) };
    },
    boom: (v, d) => {
      const hn = (v.waveHeight - 2) / 18;
      return hn * dVol(d) * 0.85;
    },
    ticks: (v, d) => {
      const hn = (v.waveHeight - 2) / 18;
      return { rate: hn * (4 + 10 * dVol(d)), level: hn * (0.25 + 0.75 * dVol(d)), hp: 5800 };
    },
    tickMode: 'hiss',
    sub: (v, d) => {
      const hn = (v.waveHeight - 2) / 18;
      return { level: (0.3 + 0.7 * hn) * (0.35 + 0.65 * dVol(d)), freq: 30 + hn * 8 };
    },
    freqs: (v) => {
      const hn = (v.waveHeight - 2) / 18;
      const sn = (v.waveSpeed - 30) / 90;
      return { surge: 110 + hn * 120, rush: 260 + sn * 420 };
    },
    hud: (d, _b, v) => {
      const cyclePhase = ((v.simTime ?? 0) / 60) % 1;
      const timeToWave = Math.max(0, 60 * (1 - cyclePhase));
      const mins = Math.floor(timeToWave / 60);
      const secs = Math.floor(timeToWave % 60);
      return [
        { label: 'Wave height (sim)', value: `~${Math.round(v.waveHeight)} m` },
        { label: 'Wave speed (sim)', value: `~${Math.round(v.waveSpeed)} km/h` },
        { label: 'Run-up (sim)', value: `~${(v.waveHeight * (0.55 + 0.5 * v.pullback)).toFixed(1)} m inland` },
        { label: 'Wavelength (sim)', value: `~${(v.waveSpeed * 0.2).toFixed(0)} km` },
        { label: 'Next wave in', value: `${mins}:${secs.toString().padStart(2, '0')}` },
        { label: 'Front distance', value: `~${Math.round(d)} m` },
        { label: 'ETA (sim)', value: `${Math.max(1, Math.round(d / (v.waveSpeed / 3.6)))} s` },
      ];
    },
    status: (v, d) => {
      const cyclePhase = ((v.simTime ?? 0) / 60) % 1;
      const timeToWave = Math.max(0, 60 * (1 - cyclePhase));
      const mins = Math.floor(timeToWave / 60);
      const secs = Math.floor(timeToWave % 60);
      const waveState = timeToWave < 15 ? '⚠ WAVE IMMINENT — EVACUATE NOW!' : timeToWave < 30 ? '⚠ Wave approaching — prepare to evacuate' : 'Monitoring — next wave in ' + mins + ':' + secs.toString().padStart(2, '0');
      return `Simulated ${Math.round(v.waveHeight)} m wave at ~${Math.round(v.waveSpeed)} km/h, front ~${Math.round(d)} m out — ${waveState}`;
    },
    gauges: (v) => {
      const hn = Math.min(1, Math.max(0, (v.waveHeight - 2) / 18));
      const sn = Math.min(1, Math.max(0, (v.waveSpeed - 30) / 90));
      const runup = v.waveHeight * (0.55 + 0.5 * v.pullback);
      return [
        { label: 'Wave energy', frac: hn * 0.5 + sn * 0.5, text: `${Math.round(hn * 100)}% height · ${Math.round(sn * 100)}% speed` },
        { label: 'Shore run-up (sim)', frac: clamp01(runup / 25), text: `~${runup.toFixed(1)} m inland (sim)` },
        { label: 'Wave wavelength (sim)', frac: clamp01((v.waveSpeed * 0.2) / 25), text: `~${(v.waveSpeed * 0.2).toFixed(0)} km crest to crest (sim)` },
      ];
    },
  },
  {
    id: 'blackhole', title: 'Black Hole Simulator', icon: 'blackhole', category: 'Space & cosmology',
    difficulty: 'Intense',
    blurb: 'Float in zero-g beside a black hole. Starlight bends around the shadow, the accretion disk blazes brighter on the side racing toward you, and clocks slow as you fly closer.',
    edu: 'A black hole is mass squeezed inside its Schwarzschild radius (about 3 km per solar mass), where escape would need more than light speed. We see its "shadow" — about 2.6 times the horizon radius — framed by a photon ring of light that orbited it, and the far side of the accretion disk lensed over the top. The approaching side of the disk looks brighter and bluer (relativistic beaming). Gas can orbit stably only down to the ISCO, which shrinks as the hole spins faster. The Event Horizon Telescope imaged M87* (2019) and Sagittarius A* (2022); NASA\'s Chandra and NuSTAR watch the X-rays from their disks. Scales here are not real.',
    safety: 'There is no black hole anywhere near Earth — the closest known is ~1,500 light-years away. Everything here is a simulation for learning, not a forecast.',
    mappingExpl: [
      'Mass → a deeper drone (NASA\'s Perseus-cluster sonification found a black hole "humming" a B-flat 57 octaves below middle C).',
      'Accretion rate → a brighter, hotter disk and a louder roar of infalling gas.',
      'Spin → a smaller ISCO, a hotter inner disk, and jets when spin and feeding are high.',
      'Distance → closer means louder, slower clocks and stronger tidal stretch.',
    ],
    paramDefs: [
      { key: 'logMass', label: 'Mass (log₁₀ M☉)', min: 0.5, max: 10, step: 0.1, unit: 'log M☉', hint: '1 = 10 Suns · 6.6 = Sagittarius A* · 9.8 = M87*' },
      { key: 'spin', label: 'Spin a*', min: 0, max: 0.998, step: 0.01, unit: 'a*', hint: '0 = not spinning, 0.998 = near-maximal Kerr' },
      { key: 'accretion', label: 'Accretion rate', min: 0, max: 1, step: 0.02, unit: '%', hint: 'Fraction of the Eddington limit' },
    ],
    defaults: { logMass: 1.3, spin: 0.5, accretion: 0.3 },
    presets: [
      { id: 'cygx1', name: 'Cygnus X-1', blurb: 'A ~21 M☉ black hole spinning near its limit, sipping gas from a blue supergiant.', values: { logMass: 1.32, spin: 0.95, accretion: 0.04 }, spawn: 150 },
      { id: 'sgra', name: 'Sagittarius A*', blurb: 'Our galaxy\'s 4 million M☉ center — huge but starved, its disk dim.', values: { logMass: 6.63, spin: 0.5, accretion: 0.02 }, spawn: 160 },
      { id: 'm87', name: 'M87*', blurb: 'A 6.5 billion M☉ giant with a powerful jet — the first black hole ever imaged.', values: { logMass: 9.81, spin: 0.9, accretion: 0.3 }, spawn: 170 },
    ],
    layers: [
      { key: 'rumble', noise: 'brown', filter: 'lowpass', freq: 60, q: 0.7 },
      { key: 'roar', noise: 'white', filter: 'bandpass', freq: 420, q: 0.8 },
      { key: 'shimmer', noise: 'white', filter: 'highpass', freq: 6800, q: 0.5 },
    ],
    withTone: true,
    gains: (v, d) => {
      const dv = dVol(d);
      const acc = clamp01(finite(v.accretion, 0.3));
      const spin = clamp01(finite(v.spin, 0.5));
      return {
        rumble: (0.2 + 0.5 * acc) * (0.35 + 0.65 * dv),
        roar: acc * (0.3 + 0.7 * dv) * 0.9,
        shimmer: (0.1 + 0.5 * spin * acc) * (0.2 + 0.8 * det(d)),
      };
    },
    // NASA raised the Perseus pressure waves ~57 octaves to B-flat; heavier holes hum lower here.
    tone: (v, d, t) => {
      const logM = Math.min(10, Math.max(0.5, finite(v.logMass, 1.3)));
      return { level: 0.35 * dVol(d) + 0.1, freq: Math.max(26, 233.08 * Math.pow(2, -(logM - 0.5) / 3)) + Math.sin(t / 4) };
    },
    boom: () => 0,
    ticks: (v, d) => {
      const acc = clamp01(finite(v.accretion, 0.3));
      return { rate: acc * (1 + 10 * dVol(d)), level: acc * (0.25 + 0.75 * dVol(d)), hp: 3800 };
    },
    tickMode: 'pop',
    tickBand: [1400, 5200],
    sub: (v, d) => {
      const logM = Math.min(10, Math.max(0.5, finite(v.logMass, 1.3)));
      return { level: (0.25 + 0.5 * dVol(d)), freq: 22 + (10 - logM) * 1.5 };
    },
    freqs: (v) => ({ roar: 260 + clamp01(finite(v.accretion, 0.3)) * 520 }),
    hud: (d, _b, v) => {
      const bh = blackHole(v);
      const x = Math.max(1.01, d / BH_UNITS_PER_RS);
      return [
        { label: 'Event horizon (sim)', value: `${fmtSci(bh.rsKm * bh.horizonRs * 2, ' km')} across` },
        { label: 'Disk inner edge (ISCO)', value: `${bh.iscoRs.toFixed(2)} r_s` },
        { label: 'Disk glows in (sim)', value: bh.diskTempK > 0 ? `${bh.band} · ${fmtSci(bh.diskTempK, ' K')}` : 'no disk' },
        { label: 'Your distance', value: `${x.toFixed(1)} r_s` },
        { label: 'Your clocks run (sim)', value: `${clockRate(x).toFixed(3)}× far-away time` },
        { label: 'Tidal stretch on you (sim)', value: `${fmtSci(tidalG(bh.massSun, x), ' g')}` },
      ];
    },
    status: (v, d) => {
      const bh = blackHole(v);
      const x = Math.max(1.01, d / BH_UNITS_PER_RS);
      const tid = tidalG(bh.massSun, x);
      return `Simulated ${fmtSci(bh.massSun)} M☉ black hole (spin ${bh.spin.toFixed(2)}) — you float ${x.toFixed(1)} r_s out (~${Math.round(d)} m in the scene), where your clock runs at ${clockRate(x).toFixed(3)}×: ${tid > 1000 ? 'tides here would spaghettify a person.' : tid > 1 ? 'tides would already stretch you painfully.' : 'tides are gentle — big black holes are kinder up close.'}`;
    },
    gauges: (v) => {
      const bh = blackHole(v);
      return [
        { label: 'Mass', frac: clamp01((Math.log10(bh.massSun) - 0.5) / 9.5), text: `${fmtSci(bh.massSun)} M☉ · horizon ${fmtSci(bh.rsKm * bh.horizonRs * 2, ' km')} wide` },
        { label: 'Disk power (sim)', frac: clamp01(finite(v.accretion, 0.3)), text: `${fmtSci(bh.luminosityW, ' W')} · peaks in ${bh.band}` },
        { label: 'Spin (ISCO)', frac: bh.spin, text: `a* ${bh.spin.toFixed(2)} · ISCO ${bh.iscoRs.toFixed(2)} r_s${bh.jets ? ' · jets on' : ''}` },
      ];
    },
  },
  {
    id: 'bigbang', title: 'Big Bang Simulator', icon: 'bigbang', category: 'Space & cosmology',
    difficulty: 'Moderate',
    blurb: 'Drift through 13.8 billion years of cosmic history: a white-hot plasma, the first light, the cosmic web, the first stars and galaxies rushing apart.',
    edu: 'The Big Bang was not an explosion at a point — space itself expanded everywhere at once, so every distant galaxy recedes from every other. The early universe was a hot, dense, opaque plasma; nuclei of hydrogen and helium formed in the first ~20 minutes; at about 380,000 years it cooled to ~3,000 K, atoms formed and light streamed free — the cosmic microwave background we still see at 2.7 K. Gravity then pulled dark matter and gas into a cosmic web where the first stars lit up after ~100–200 million years. About 5 billion years ago dark energy began to accelerate the expansion. Expansion here follows the Friedmann equations for your chosen H₀, Ωm and ΩΛ; NASA\'s COBE, WMAP and JWST tell this story. Scales are not real.',
    safety: 'Cosmology is a calm subject — but always follow official guidance for real hazards. This is a learning toy, not a forecast.',
    mappingExpl: [
      'Cosmic time → the pitch falls as the universe expands and cools (as in sonifications of the CMB\'s acoustic waves).',
      'Opaque early plasma → a dense roar; after recombination the hiss thins out.',
      'Star and galaxy formation → a bright sparkle layer.',
      'More dark energy (ΩΛ) → faster late-time acceleration; more matter (Ωm) can even recollapse into a Big Crunch.',
    ],
    paramDefs: [
      { key: 'epoch', label: 'Cosmic time', min: 0, max: 1, step: 0.005, unit: '%', hint: 'Log scale: 10⁻³⁶ s → ~100 billion years' },
      { key: 'h0', label: 'Hubble constant H₀', min: 50, max: 90, step: 0.5, unit: 'km/s/Mpc', hint: 'Today\'s expansion rate (Planck ≈ 67, local ≈ 73)' },
      { key: 'om', label: 'Matter Ωm', min: 0.05, max: 1, step: 0.01, unit: 'Ω', hint: 'Dark + ordinary matter density' },
      { key: 'ol', label: 'Dark energy ΩΛ', min: 0, max: 1, step: 0.01, unit: 'Ω', hint: 'Cosmological-constant density' },
    ],
    defaults: { epoch: 0.97, h0: 67.4, om: 0.315, ol: 0.685 },
    presets: [
      { id: 'plasma', name: 'First Minutes', blurb: 'Nucleosynthesis: a billion-degree plasma forging hydrogen and helium nuclei.', values: { epoch: 0.69, h0: 67.4, om: 0.315, ol: 0.685 }, spawn: 150 },
      { id: 'cmb', name: 'First Light (CMB)', blurb: '380,000 years: atoms form and the universe turns transparent.', values: { epoch: 0.893, h0: 67.4, om: 0.315, ol: 0.685 }, spawn: 150 },
      { id: 'dawn', name: 'Cosmic Dawn', blurb: '~200 million years: the first blue stars ignite along the cosmic web.', values: { epoch: 0.95, h0: 67.4, om: 0.315, ol: 0.685 }, spawn: 150 },
      { id: 'today', name: 'Today', blurb: '13.8 billion years: galaxies everywhere, expansion accelerating.', values: { epoch: 0.9752, h0: 67.4, om: 0.315, ol: 0.685 }, spawn: 150 },
      { id: 'crunch', name: 'Big Crunch universe', blurb: 'No dark energy and heavy matter: expansion halts and reverses.', values: { epoch: 0.985, h0: 67.4, om: 1, ol: 0 }, spawn: 150 },
    ],
    layers: [
      { key: 'roar', noise: 'brown', filter: 'lowpass', freq: 120, q: 0.6 },
      { key: 'hiss', noise: 'white', filter: 'bandpass', freq: 900, q: 0.7 },
      { key: 'sparkle', noise: 'white', filter: 'highpass', freq: 7000, q: 0.5 },
    ],
    withTone: true,
    gains: (v, d) => {
      const c = cosmicState(v);
      const dv = dVol(d);
      const hot = clamp01(Math.log10(Math.max(1, c.tempK)) / 12);
      return {
        roar: (0.12 + 0.6 * hot) * (0.35 + 0.65 * dv),
        hiss: (0.1 + 0.6 * (1 - c.clarity)) * (0.35 + 0.65 * dv),
        sparkle: c.starlight * (0.25 + 0.75 * det(d)) * 0.8,
      };
    },
    tone: (v, d, t) => {
      const c = cosmicState(v);
      const hot = clamp01(Math.log10(Math.max(1, c.tempK)) / 12);
      return { level: (0.15 + 0.4 * hot) * dVol(d) + 0.05, freq: 40 + 360 * hot + 2 * Math.sin(t / 5) };
    },
    boom: (v, d) => (cosmicState(v).tSec < 1e-30 ? 0.5 : 0) * dVol(d),
    ticks: (v, d) => {
      const c = cosmicState(v);
      return { rate: c.starlight * (1 + 8 * dVol(d)), level: c.starlight * (0.25 + 0.75 * dVol(d)), hp: 5400 };
    },
    tickMode: 'pop',
    tickBand: [2600, 7600],
    sub: (v, d) => {
      const c = cosmicState(v);
      return { level: (0.2 + 0.5 * (1 - c.clarity)) * (0.35 + 0.65 * dVol(d)), freq: 24 + c.structure * 10 };
    },
    freqs: (v) => ({ hiss: 500 + 1400 * (1 - cosmicState(v).clarity) }),
    hud: (_d, _b, v) => {
      const c = cosmicState(v);
      return [
        { label: 'Cosmic age (sim)', value: c.crunch ? 'ended in a Big Crunch' : fmtCosmicTime(c.tSec) },
        { label: 'Era', value: c.phase },
        { label: 'Temperature (sim)', value: `${fmtSci(c.tempK, ' K')}` },
        { label: 'Redshift z (sim)', value: c.crunch ? '—' : fmtSci(c.z) },
        { label: 'Size vs today', value: c.crunch ? '0' : `${fmtSci(c.a)}×` },
        { label: 'Expansion (sim)', value: `${fmtSci(c.hubble, ' km/s/Mpc')}${c.accelerating ? ' · accelerating' : ' · slowing'}` },
      ];
    },
    status: (v, d) => {
      const c = cosmicState(v);
      return `Simulated universe at ${c.crunch ? 'its Big Crunch' : fmtCosmicTime(c.tSec)} — ${c.phase.toLowerCase()}, ${fmtSci(c.tempK, ' K')}, everything ${fmtSci(c.a)}× today's size${Number.isFinite(c.ageTodayGyr) ? `; this model's "today" is ${c.ageTodayGyr.toFixed(1)} billion years after the Big Bang` : ''}. You are ~${Math.round(d)} m from the scene centre.`;
    },
    gauges: (v) => {
      const c = cosmicState(v);
      return [
        { label: 'Cosmic time', frac: clamp01(finite(v.epoch, 0.97)), text: c.crunch ? 'Big Crunch' : `${fmtCosmicTime(c.tSec)} · ${c.phase}` },
        { label: 'Transparency', frac: c.clarity, text: c.clarity < 0.5 ? 'opaque plasma — light can\'t travel' : 'transparent — the CMB streams free' },
        { label: 'Structure (sim)', frac: c.structure, text: c.structure < 0.05 ? 'smooth gas' : c.starlight < 0.5 ? 'cosmic web forming' : 'stars & galaxies shining' },
      ];
    },
  },
  {
    id: 'sun', title: 'Sun Simulator', icon: 'sun', category: 'Space weather',
    difficulty: 'Moderate',
    blurb: 'Stand on a lunar observatory under the Milky Way while the Sun churns overhead. Dial the solar cycle, fire flares and launch CMEs at Earth hanging in the sky.',
    edu: 'The Sun is a 5,772 K ball of plasma that rotates faster at its equator (~25 days) than near its poles (~35 days). That shear twists magnetic fields into sunspots, which follow an ~11-year cycle and drift toward the equator as it progresses. When twisted fields snap, flares release X-rays that reach Earth in about 8 minutes, and coronal mass ejections (CMEs) hurl billions of tonnes of plasma that take one to four days to arrive. NASA\'s Solar Dynamics Observatory, SOHO and Parker Solar Probe watch it all; NOAA turns the data into R (radio blackout), S (radiation) and G (geomagnetic storm) scales. Sizes and distances here are NOT to scale.',
    safety: 'Never look at the Sun directly or through binoculars or a telescope without a certified solar filter — it causes permanent eye damage in seconds. Strong space weather can disrupt GPS, radio and power grids; follow NOAA SWPC alerts. This is a learning toy, not a forecast.',
    mappingExpl: [
      'Solar cycle → more sunspots, a hotter, brighter corona, and a higher plasma drone.',
      'Flare strength → GOES X-ray class (A … X); stronger flares fire more often and crackle like a particle counter.',
      'CME speed → how fast the plasma cloud crosses 1 AU and how hard Earth\'s magnetosphere rings.',
      'Solar wind speed → the hiss streaming past you and how far Earth\'s magnetopause is pushed in.',
    ],
    paramDefs: [
      { key: 'activity', label: 'Solar cycle', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Solar minimum (0) to maximum (100%)' },
      { key: 'flare', label: 'Flare strength', min: 0, max: 1, step: 0.05, unit: '%', hint: 'Peak X-ray flux, A-class to X10' },
      { key: 'cme', label: 'CME speed', min: 250, max: 3000, step: 50, unit: 'km/s (sim)', hint: 'Launch speed of coronal mass ejections' },
      { key: 'wind', label: 'Solar wind', min: 250, max: 900, step: 25, unit: 'km/s (sim)', hint: 'Ambient solar-wind speed' },
    ],
    defaults: { activity: 0.5, flare: 0.5, cme: 800, wind: 450 },
    presets: [
      { id: 'min', name: 'Solar Minimum', blurb: 'A nearly spotless Sun, faint corona, slow wind.', values: { activity: 0.05, flare: 0.15, cme: 350, wind: 350 }, spawn: 180 },
      { id: 'max', name: 'Solar Maximum', blurb: 'Spotted disk, M-class flares, frequent CMEs.', values: { activity: 0.9, flare: 0.65, cme: 1500, wind: 600 }, spawn: 150 },
      { id: 'carrington', name: 'Carrington-class Storm', blurb: 'An X-class flare and a ~2,800 km/s CME — the 1859-style extreme. Capped audio.', values: { activity: 1, flare: 1, cme: 2800, wind: 750 }, spawn: 120 },
    ],
    layers: [
      { key: 'plasma', noise: 'brown', filter: 'lowpass', freq: 90, q: 0.6 },
      { key: 'wind', noise: 'white', filter: 'bandpass', freq: 700, q: 0.7 },
      { key: 'corona', noise: 'white', filter: 'highpass', freq: 6200, q: 0.5 },
    ],
    withTone: true,
    gains: (v, d) => {
      const dv = dVol(d);
      const sw = solarWeather(v);
      const act = clamp01(finite(v.activity, 0.5));
      const windN = clamp01((sw.pressureNpa - 0.5) / 4.5);
      return {
        plasma: (0.12 + 0.5 * act) * (0.4 + 0.6 * dv),
        wind: (0.15 + 0.6 * windN) * (0.35 + 0.65 * dv),
        corona: clamp01((sw.coronaMK - 1) / 1.5) * (0.25 + 0.75 * det(d)) * 0.8,
      };
    },
    // The Sun "rings" with ~5-minute (≈3.3 mHz) acoustic p-mode oscillations;
    // sped up 2^15× they land near 108 Hz — the drone you hear.
    tone: (v, d, t) => {
      const act = clamp01(finite(v.activity, 0.5));
      return { level: (0.15 + 0.45 * act) * dVol(d), freq: 3.3e-3 * 32768 + act * 14 + 2 * Math.sin(t / 6) };
    },
    boom: (v, d) => (solarWeather(v).xrayFlux >= 1e-4 ? 0.4 : 0.04) * dVol(d),
    ticks: (v, d) => {
      const fl = clamp01(finite(v.flare, 0.4));
      return { rate: fl * fl * (2 + 14 * dVol(d)), level: fl * (0.3 + 0.7 * dVol(d)), hp: 5200 };
    },
    tickMode: 'pop',
    tickBand: [2200, 6800],
    sub: (v, d) => {
      const act = clamp01(finite(v.activity, 0.5));
      return { level: (0.12 + 0.5 * act) * (0.35 + 0.65 * dVol(d)), freq: 27 + act * 9 };
    },
    freqs: (v) => {
      const wind = Math.min(900, Math.max(250, finite(v.wind, 450)));
      return { wind: 380 + (wind - 250) * 1.4, plasma: 60 + clamp01(finite(v.activity, 0.5)) * 50 };
    },
    hud: (d, _b, v) => {
      const sw = solarWeather(v);
      return [
        { label: 'Sunspot number (sim)', value: `${sw.sunspots}` },
        { label: 'Flare class (sim)', value: `${sw.flareClass}${sw.rScale ? ` · R${sw.rScale}` : ''}` },
        { label: 'CME to Earth (sim)', value: fmtTransit(sw.transitHours) },
        { label: 'Geomagnetic (sim)', value: `Kp ${sw.kp.toFixed(1)}${sw.gScale ? ` · G${sw.gScale}` : ''}` },
        { label: 'Aurora reaches (sim)', value: `~${Math.round(sw.auroraLat)}° mag. lat` },
        { label: 'Sunward ridge', value: `~${Math.round(d)} m` },
      ];
    },
    status: (v, d) => {
      const sw = solarWeather(v);
      return `Simulated Sun with ${sw.sunspots} sunspots firing ${sw.flareClass} flares; a CME would reach Earth in ${fmtTransit(sw.transitHours)} for Kp ${sw.kp.toFixed(1)} — ridge ~${Math.round(d)} m away: ${sw.gScale >= 3 ? 'a severe geomagnetic storm, aurora far from the poles.' : sw.gScale >= 1 ? 'a geomagnetic storm is brewing; the aurora is spreading.' : 'quiet space weather; the aurora hugs the poles.'}`;
    },
    gauges: (v) => {
      const sw = solarWeather(v);
      return [
        { label: 'Solar activity', frac: clamp01(sw.sunspots / 220), text: `${sw.sunspots} sunspots · corona ~${sw.coronaMK.toFixed(1)} MK (sim)` },
        { label: 'X-ray flare (sim)', frac: clamp01((Math.log10(sw.xrayFlux) + 8) / 5), text: `${sw.flareClass}${sw.rScale ? ` · R${sw.rScale} radio blackout` : ' · no blackout'}` },
        { label: 'Geomagnetic storm (sim)', frac: clamp01(sw.kp / 9), text: `Kp ${sw.kp.toFixed(1)} · ${sw.gScale ? `G${sw.gScale} storm` : 'quiet'} · magnetopause ${sw.standoffRe.toFixed(1)} R⊕` },
      ];
    },
  },
];

export function hazardById(id: HazardId): HazardDef {
  return HAZARDS.find((h) => h.id === id) ?? HAZARDS[0];
}

/** Clamp user values into param ranges (pure, tested). */
export function clampVals(def: HazardDef, v: Vals): Vals {
  const out: Vals = { ...v };
  for (const p of def.paramDefs) {
    const raw = Number(out[p.key]);
    out[p.key] = Number.isFinite(raw) ? Math.min(p.max, Math.max(p.min, raw)) : def.defaults[p.key];
  }
  return out;
}
