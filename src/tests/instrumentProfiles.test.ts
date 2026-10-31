import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTRUMENT_ID,
  DEFAULT_PROFILE_ID,
  INSTRUMENTS,
  effectTags,
  getInstrument,
  getProfile,
} from '../audio/instrumentProfiles';

const EXPECTED: Record<string, string[]> = {
  piano: ['Grand Piano', 'Soft Piano', 'Electric Piano', 'Bright Piano', 'Warm Piano'],
  'electric-guitar': ['Clean', 'Overdrive', 'Distortion', 'Rock Lead', 'Ambient Guitar'],
  'acoustic-guitar': ['Steel String', 'Nylon String', 'Fingerstyle', 'Warm Acoustic', 'Bright Acoustic'],
  'bass-guitar': ['Finger Bass', 'Pick Bass', 'Slap Bass', 'Deep Bass', 'Synth Bass'],
  'drum-machine': ['Acoustic Kit', 'Electronic Kit', 'Hip-Hop', 'Rock Kit', 'Lo-Fi Drums'],
  violin: ['Classical', 'Warm Strings', 'Cinematic', 'Soft Legato', 'Vibrato'],
  flute: ['Concert Flute', 'Soft Flute', 'Airy Flute', 'Warm Flute', 'Cinematic Flute'],
  synthesizer: ['Analog Lead', 'Warm Pad', 'Ambient Pad', 'Retro Synth', 'Bass Synth'],
};

describe('instrument sound profile catalog', () => {
  it('ships all eight Listen instruments in display order', () => {
    expect(INSTRUMENTS.map((instrument) => instrument.id)).toEqual(Object.keys(EXPECTED));
  });

  it('offers the five required profiles for every instrument', () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrument.profiles.map((profile) => profile.name), instrument.id).toEqual(EXPECTED[instrument.id]);
    }
  });

  it('keeps profile ids unique within each instrument', () => {
    for (const instrument of INSTRUMENTS) {
      const ids = instrument.profiles.map((profile) => profile.id);
      expect(new Set(ids).size, instrument.id).toBe(ids.length);
    }
  });

  it('gives every profile a synthesis differentiator and an effects chain', () => {
    for (const instrument of INSTRUMENTS) {
      for (const profile of instrument.profiles) {
        const spec = profile.spec;
        const hasVoice = Boolean(spec.kit || spec.partials || spec.layers || spec.fm);
        expect(hasVoice, `${instrument.id}/${profile.id} needs a voice`).toBe(true);
        expect(spec.attack, `${instrument.id}/${profile.id} attack`).toBeGreaterThan(0);
        expect(spec.decay, `${instrument.id}/${profile.id} decay`).toBeGreaterThan(0);
        expect(spec.release, `${instrument.id}/${profile.id} release`).toBeGreaterThan(0);
        expect(spec.gain, `${instrument.id}/${profile.id} gain`).toBeGreaterThan(0);
        expect(Object.keys(spec.effects).length, `${instrument.id}/${profile.id} effects`).toBeGreaterThan(0);
      }
    }
  });

  it('produces distinct recipes for the five profiles of each instrument', () => {
    for (const instrument of INSTRUMENTS) {
      const recipes = instrument.profiles.map((profile) => JSON.stringify(profile.spec));
      expect(new Set(recipes).size, instrument.id).toBe(recipes.length);
    }
  });

  it('uses different synthesis families across instruments', () => {
    const piano = getInstrument('piano').profiles[0].spec;
    const guitar = getInstrument('electric-guitar').profiles[0].spec;
    const bass = getInstrument('bass-guitar').profiles[0].spec;
    const drums = getInstrument('drum-machine').profiles[0].spec;
    expect(piano.partials?.length).toBeGreaterThan(0);
    expect(guitar.layers?.length).toBeGreaterThan(0);
    expect(bass.layers?.length).toBeGreaterThan(0);
    expect(drums.kit).toBeTruthy();
  });

  it('defaults to the grand piano and falls back safely', () => {
    expect(DEFAULT_INSTRUMENT_ID).toBe('piano');
    expect(DEFAULT_PROFILE_ID).toBe('grand-piano');
    const instrument = getInstrument(undefined);
    expect(instrument.id).toBe('piano');
    expect(getProfile(instrument, 'missing-profile').id).toBe('grand-piano');
    expect(getInstrument('not-an-instrument' as never).id).toBe('piano');
  });

  it('exposes short effect tags for cards and a frame range for every instrument', () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrument.frameRange[0]).toBeLessThan(instrument.frameRange[1]);
      if (instrument.id !== 'drum-machine') {
        expect(instrument.audition.length).toBeGreaterThanOrEqual(3);
      }
      for (const profile of instrument.profiles) {
        const tags = effectTags(profile.spec);
        expect(tags.length).toBeGreaterThan(0);
        expect(tags.length).toBeLessThanOrEqual(4);
      }
    }
  });
});
