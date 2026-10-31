import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  drumVoiceForMidi,
  InstrumentEngine,
  mapValueToMidi,
  snapPentatonic,
  valueVelocity,
} from '../audio/instrumentEngine';
import {
  DEFAULT_INSTRUMENT_ID,
  DEFAULT_PROFILE_ID,
  effectTags,
  getInstrument,
  getProfile,
  INSTRUMENTS,
  type InstrumentId,
} from '../audio/instrumentProfiles';

/* ------------------------------------------------------------------ *
 * Minimal Web Audio mock — jsdom has no AudioContext, and the engine
 * must be fully exercisable offline (no samples, no real rendering).
 * ------------------------------------------------------------------ */

class MockParam {
  value: number;
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; return this; }
  linearRampToValueAtTime(value: number) { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number) { this.value = value; return this; }
  setTargetAtTime(value: number) { this.value = value; return this; }
  cancelScheduledValues() { return this; }
}

type EndedListener = () => void;

class MockNode {
  connections: unknown[] = [];
  connect(node: unknown) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
}

class MockSource extends MockNode {
  started = false;
  stopped = false;
  loop = false;
  buffer: unknown = null;
  private listeners: EndedListener[] = [];
  start() { this.started = true; }
  stop() { this.stopped = true; for (const fn of this.listeners) fn(); }
  addEventListener(type: string, fn: EndedListener) {
    if (type === 'ended') this.listeners.push(fn);
  }
}

class MockOscillator extends MockSource {
  type: OscillatorType = 'sine';
  frequency = new MockParam(440);
  detune = new MockParam(0);
  setPeriodicWave() { /* wave applied */ }
}

class MockGain extends MockNode { gain = new MockParam(1); }
class MockFilter extends MockNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockParam(350);
  Q = new MockParam(1);
}
class MockPanner extends MockNode { pan = new MockParam(0); }
class MockDelay extends MockNode { delayTime = new MockParam(0); }
class MockShaper extends MockNode { curve: Float32Array | null = null; oversample: OverSampleType = 'none'; }
class MockConvolver extends MockNode { buffer: AudioBuffer | null = null; }
class MockCompressor extends MockNode {
  threshold = new MockParam(-24);
  ratio = new MockParam(12);
  knee = new MockParam(30);
  attack = new MockParam(0.003);
  release = new MockParam(0.25);
}

function mockBuffer(length: number, sampleRate: number) {
  return {
    length,
    sampleRate,
    numberOfChannels: 1,
    duration: length / sampleRate,
    getChannelData: () => new Float32Array(length),
  } as unknown as AudioBuffer;
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = new MockNode();
  sources: MockSource[] = [];
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { return new MockGain(); }
  createDynamicsCompressor() { return new MockCompressor(); }
  createBiquadFilter() { return new MockFilter(); }
  createStereoPanner() { return new MockPanner(); }
  createDelay() { return new MockDelay(); }
  createWaveShaper() { return new MockShaper(); }
  createConvolver() { return new MockConvolver(); }
  createOscillator() { const osc = new MockOscillator(); this.sources.push(osc); return osc; }
  createBufferSource() { const src = new MockSource(); this.sources.push(src); return src; }
  createBuffer(channels: number, length: number, sampleRate: number) {
    void channels;
    return mockBuffer(length, sampleRate);
  }
  createPeriodicWave() { return {} as PeriodicWave; }
}

const installMock = () => {
  (window as unknown as Record<string, unknown>).AudioContext = MockAudioContext;
};

const uninstallMock = () => {
  delete (window as unknown as Record<string, unknown>).AudioContext;
};

/* ------------------------------------------------------------------ *
 * Profile data contract
 * ------------------------------------------------------------------ */

describe('instrument profiles', () => {
  it('offers exactly eight instruments', () => {
    expect(INSTRUMENTS.map((i) => i.id)).toEqual([
      'piano', 'electric-guitar', 'acoustic-guitar', 'bass-guitar',
      'drum-machine', 'violin', 'flute', 'synthesizer',
    ]);
    expect(INSTRUMENTS.map((i) => i.name)).toEqual([
      'Piano', 'Electric Guitar', 'Acoustic Guitar', 'Bass Guitar',
      'Drum Machine', 'Violin', 'Flute', 'Synthesizer',
    ]);
  });

  it('gives every instrument five named profiles', () => {
    const expected: Record<InstrumentId, string[]> = {
      piano: ['Grand Piano', 'Soft Piano', 'Electric Piano', 'Bright Piano', 'Warm Piano'],
      'electric-guitar': ['Clean', 'Overdrive', 'Distortion', 'Rock Lead', 'Ambient Guitar'],
      'acoustic-guitar': ['Steel String', 'Nylon String', 'Fingerstyle', 'Warm Acoustic', 'Bright Acoustic'],
      'bass-guitar': ['Finger Bass', 'Pick Bass', 'Slap Bass', 'Deep Bass', 'Synth Bass'],
      'drum-machine': ['Acoustic Kit', 'Electronic Kit', 'Hip-Hop', 'Rock Kit', 'Lo-Fi Drums'],
      violin: ['Classical', 'Warm Strings', 'Cinematic', 'Soft Legato', 'Vibrato'],
      flute: ['Concert Flute', 'Soft Flute', 'Airy Flute', 'Warm Flute', 'Cinematic Flute'],
      synthesizer: ['Analog Lead', 'Warm Pad', 'Ambient Pad', 'Retro Synth', 'Bass Synth'],
    };
    for (const instrument of INSTRUMENTS) {
      expect(instrument.profiles.map((p) => p.name)).toEqual(expected[instrument.id]);
      expect(instrument.profiles).toHaveLength(5);
      expect(new Set(instrument.profiles.map((p) => p.id)).size).toBe(5);
    }
  });

  it('keeps defaults valid and falls back to the first profile', () => {
    expect(DEFAULT_INSTRUMENT_ID).toBe('piano');
    expect(DEFAULT_PROFILE_ID).toBe('grand-piano');
    const piano = getInstrument(DEFAULT_INSTRUMENT_ID);
    expect(getProfile(piano, DEFAULT_PROFILE_ID).name).toBe('Grand Piano');
    expect(getProfile(piano, 'no-such-profile')).toBe(piano.profiles[0]);
    expect(getInstrument('no-such-instrument' as InstrumentId)).toBe(INSTRUMENTS[0]);
  });

  it('describes each profile with synthesis effect tags', () => {
    const grand = getProfile(getInstrument('piano'), 'grand-piano');
    expect(effectTags(grand.spec)).toContain('Additive');
    const overdrive = getProfile(getInstrument('electric-guitar'), 'overdrive');
    expect(effectTags(overdrive.spec)).toEqual(expect.arrayContaining(['Drive', 'Delay']));
    const lofi = getProfile(getInstrument('drum-machine'), 'lo-fi-drums');
    expect(effectTags(lofi.spec)).toEqual(expect.arrayContaining(['Drive', 'Swing']));
    expect(lofi.spec.kit?.vinyl).toBeGreaterThan(0);
  });

  it('carries playable data ranges and demos on every instrument', () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrument.frameRange[1]).toBeGreaterThan(instrument.frameRange[0]);
      expect(instrument.demo.events.length).toBeGreaterThan(4);
      expect(instrument.demo.bpm).toBeGreaterThanOrEqual(30);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Pure mapping helpers
 * ------------------------------------------------------------------ */

describe('mapping helpers', () => {
  it('snaps to the nearest minor-pentatonic note', () => {
    expect(snapPentatonic(60)).toBe(60);
    expect(snapPentatonic(61)).toBe(60);
    expect(snapPentatonic(62)).toBe(63);
    expect(snapPentatonic(63)).toBe(63);
    expect(snapPentatonic(66)).toBe(65);
    expect(snapPentatonic(69)).toBe(70);
  });

  it('maps values across the instrument range', () => {
    const frame: [number, number] = [40, 88];
    expect(mapValueToMidi(0, [0, 100], frame)).toBe(snapPentatonic(40));
    expect(mapValueToMidi(100, [0, 100], frame)).toBe(snapPentatonic(88));
    const mid = mapValueToMidi(50, [0, 100], frame);
    expect(mid).toBeGreaterThanOrEqual(60);
    expect(mid).toBeLessThanOrEqual(72);
  });

  it('keeps missing data silent', () => {
    expect(mapValueToMidi(null, [0, 100], [40, 88])).toBeNull();
    expect(mapValueToMidi(Number.NaN, [0, 100], [40, 88])).toBeNull();
    expect(valueVelocity(null, [0, 100])).toBe(0);
  });

  it('raises loudness with the value, within a safe band', () => {
    const low = valueVelocity(0, [0, 100]);
    const high = valueVelocity(100, [0, 100]);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(0.3);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('routes drum kits by pitch band', () => {
    expect(drumVoiceForMidi(24)).toBe('kick');
    expect(drumVoiceForMidi(40)).toBe('tom');
    expect(drumVoiceForMidi(50)).toBe('snare');
    expect(drumVoiceForMidi(60)).toBe('clap');
    expect(drumVoiceForMidi(72)).toBe('rim');
    expect(drumVoiceForMidi(84)).toBe('hat');
    expect(drumVoiceForMidi(96)).toBe('open-hat');
  });
});

/* ------------------------------------------------------------------ *
 * Engine behaviour
 * ------------------------------------------------------------------ */

describe('InstrumentEngine', () => {
  let engine: InstrumentEngine;

  beforeEach(() => {
    installMock();
    vi.useFakeTimers();
    engine = new InstrumentEngine();
  });

  afterEach(() => {
    engine.stopAll();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    uninstallMock();
  });

  const ctxOf = (target: InstrumentEngine) => (target as unknown as { ctx: MockAudioContext }).ctx;

  it('starts only after a gesture and reports readiness', async () => {
    expect(engine.ready).toBe(false);
    await expect(engine.start()).resolves.toBe(true);
    expect(engine.ready).toBe(true);
    expect(ctxOf(engine)).toBeInstanceOf(MockAudioContext);
  });

  it('loops the selected profile demo and stops cleanly', async () => {
    await engine.start();
    expect(engine.playing).toBe(false);
    expect(engine.playLoop()).toBe(true);
    expect(engine.playing).toBe(true);
    const ctx = (engine as unknown as { ctx: MockAudioContext }).ctx;
    expect(ctx.sources.filter((s) => s.started).length).toBeGreaterThan(0);

    // The lookahead queue schedules a second cycle without gap.
    const before = ctx.sources.length;
    vi.advanceTimersByTime(400);
    expect(ctx.sources.length).toBeGreaterThanOrEqual(before);

    engine.stopAll();
    expect(engine.playing).toBe(false);
    expect(ctx.sources.every((s) => s.stopped)).toBe(true);
    vi.runOnlyPendingTimers();
  });

  it('returns a duration for the preview phrase', async () => {
    await engine.start();
    const ms = engine.previewProfile();
    expect(ms).toBeGreaterThan(800);
    const ctx = (engine as unknown as { ctx: MockAudioContext }).ctx;
    expect(ctx.sources.some((s) => s.started)).toBe(true);
  });

  it('voices dataset frames and stays silent when data is missing', async () => {
    await engine.start();
    const ctx = (engine as unknown as { ctx: MockAudioContext }).ctx;
    const started = () => ctx.sources.filter((s) => s.started).length;
    const baseline = started();

    engine.playFrame(null, 0.9, 0.5);
    expect(started()).toBe(baseline);

    engine.playFrame(60, 0.9, 0.5);
    expect(started()).toBeGreaterThan(baseline);
  });

  it('rebuilds the chain when the profile changes', async () => {
    await engine.start();
    engine.setProfile('electric-guitar', 'overdrive');
    expect(engine.currentProfile.name).toBe('Overdrive');
    expect(engine.instrumentId).toBe('electric-guitar');
    engine.playLoop();
    expect(engine.playing).toBe(true);

    engine.setProfile('drum-machine', 'lo-fi-drums');
    expect(engine.currentProfile.name).toBe('Lo-Fi Drums');
    expect(engine.playing).toBe(true); // the loop restarts on the new recipe

    const ctx = (engine as unknown as { ctx: MockAudioContext }).ctx;
    engine.playFrame(40, 0.8, 0.4);
    expect(ctx.sources.some((s) => s.started)).toBe(true);
    engine.stopAll();
    vi.runOnlyPendingTimers();
  });

  it('applies volume and mute to the master bus', async () => {
    await engine.start();
    engine.setVolume(0.4);
    const master = (engine as unknown as { master: MockGain }).master;
    expect(master.gain.value).toBeCloseTo(0.4, 3);
    engine.setMuted(true);
    expect(master.gain.value).toBeLessThan(0.01);
    engine.setMuted(false);
    engine.setVolume(5);
    expect(master.gain.value).toBeLessThanOrEqual(1);
  });

  it('stays quiet instead of throwing when audio is unavailable', async () => {
    uninstallMock();
    const bare = new InstrumentEngine();
    await expect(bare.start()).resolves.toBe(false);
    expect(bare.ready).toBe(false);
    expect(bare.playLoop()).toBe(false);
    expect(bare.previewProfile()).toBe(0);
    expect(() => bare.playFrame(60, 0.8, 0.5)).not.toThrow();
    expect(() => bare.stopAll()).not.toThrow();
    bare.setProfile('electric-guitar', 'distortion');
    expect(bare.currentProfile.name).toBe('Distortion');
  });
});
