import { describe, expect, it } from 'vitest';
import {
  AU_KM, cmeTransitHours, flareClassOf, hazardById, magnetopauseStandoff,
  radioBlackout, solarRotationRate, solarWeather,
} from '../sim/hazards';

describe('space-weather model', () => {
  it('names GOES flare classes from peak X-ray flux', () => {
    expect(flareClassOf(3e-8)).toBe('A3.0');
    expect(flareClassOf(2.5e-7)).toBe('B2.5');
    expect(flareClassOf(1e-6)).toBe('C1.0');
    expect(flareClassOf(5.4e-5)).toBe('M5.4');
    expect(flareClassOf(2e-4)).toBe('X2.0');
    expect(flareClassOf(1e-3)).toBe('X10.0');
  });

  it('maps flux onto the NOAA radio-blackout scale', () => {
    expect(radioBlackout(5e-6)).toBe(0);
    expect(radioBlackout(1e-5)).toBe(1);   // M1
    expect(radioBlackout(5e-5)).toBe(2);   // M5
    expect(radioBlackout(1e-4)).toBe(3);   // X1
    expect(radioBlackout(1e-3)).toBe(4);   // X10
    expect(radioBlackout(2e-3)).toBe(5);   // X20
  });

  it('gives realistic CME transit times over 1 AU', () => {
    // Slow CMEs take ~3-4 days; Carrington-class ones under a day.
    expect(cmeTransitHours(450, 400)).toBeGreaterThan(72);
    expect(cmeTransitHours(450, 400)).toBeLessThan(110);
    expect(cmeTransitHours(2800, 750)).toBeLessThan(24);
    expect(cmeTransitHours(1500, 450)).toBeLessThan(cmeTransitHours(800, 450));
    expect(AU_KM).toBeCloseTo(1.496e8, -5);
  });

  it('puts the magnetopause near 10-11 Earth radii in a typical wind, closer in a fast one', () => {
    const calm = magnetopauseStandoff(5, 400);
    expect(calm.re).toBeGreaterThan(9.5);
    expect(calm.re).toBeLessThan(12);
    expect(calm.pressure).toBeCloseTo(1.34, 1);
    expect(magnetopauseStandoff(20, 900).re).toBeLessThan(calm.re);
  });

  it('rotates faster at the equator than near the poles', () => {
    expect(solarRotationRate(0)).toBeCloseTo(14.713, 3);
    expect(360 / solarRotationRate(0)).toBeCloseTo(24.5, 0);
    expect(solarRotationRate(75)).toBeLessThan(solarRotationRate(30));
  });

  it('scales storms with CME speed and pushes the aurora equatorward', () => {
    const quiet = solarWeather({ activity: 0.05, flare: 0.15, cme: 350, wind: 350 });
    const storm = solarWeather({ activity: 1, flare: 1, cme: 2800, wind: 750 });
    expect(quiet.gScale).toBe(0);
    expect(storm.kp).toBe(9);
    expect(storm.gScale).toBe(5);
    expect(storm.auroraLat).toBeLessThan(quiet.auroraLat);
    expect(storm.sunspots).toBeGreaterThan(quiet.sunspots);
    expect(storm.spotLatDeg).toBeLessThan(quiet.spotLatDeg); // Spörer's law
    expect(storm.flareClass.startsWith('X')).toBe(true);
    const junk = solarWeather({ activity: NaN, cme: Infinity });
    expect(Number.isFinite(junk.kp)).toBe(true);
  });
});

describe('sun registry entry', () => {
  it('replaces drought with a space-weather simulator', () => {
    const d = hazardById('sun');
    expect(d.id).toBe('sun');
    expect(d.title).toMatch(/Sun/);
    expect(d.category).toBe('Space weather');
    expect(d.paramDefs.map((p) => p.key)).toEqual(['activity', 'flare', 'cme', 'wind']);
    const quiet = d.gauges!({ ...d.defaults, ...d.presets[0].values });
    const storm = d.gauges!({ ...d.defaults, ...d.presets[2].values });
    for (let i = 0; i < quiet.length; i++) {
      expect(storm[i].frac).toBeGreaterThan(quiet[i].frac);
      expect(storm[i].frac).toBeLessThanOrEqual(1);
      expect(quiet[i].frac).toBeGreaterThanOrEqual(0);
    }
    expect(d.status({ ...d.defaults }, 90)).toContain('90');
  });

  it('sounds the 5-minute solar oscillation sped up into the audible range', () => {
    const d = hazardById('sun');
    const tone = d.tone({ ...d.defaults, activity: 0 }, 40, 0);
    expect(tone.freq).toBeGreaterThan(100);
    expect(tone.freq).toBeLessThan(115);
    const quiet = d.gains({ ...d.defaults, ...d.presets[0].values }, 80);
    const storm = d.gains({ ...d.defaults, ...d.presets[2].values }, 80);
    expect(storm.wind).toBeGreaterThan(quiet.wind);
    expect(storm.corona).toBeGreaterThan(quiet.corona);
  });
});
