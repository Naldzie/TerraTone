/* Instrument-specific sound profiles for the Listen tab.
 *
 * Every profile is a compact synthesis recipe (oscillators, additive partials,
 * FM, envelopes, filters, noise, modulation and effects). The engine in
 * instrumentEngine.ts turns these recipes into sound with the Web Audio API,
 * so the whole feature works offline and ships without sample files.
 */

export type InstrumentId =
  | 'piano'
  | 'electric-guitar'
  | 'acoustic-guitar'
  | 'bass-guitar'
  | 'drum-machine'
  | 'violin'
  | 'flute'
  | 'synthesizer';

export type DrumVoice = 'kick' | 'snare' | 'hat' | 'open-hat' | 'tom' | 'clap' | 'rim';

export interface DemoEvent {
  /** Offset from the start of the pattern, in beats. */
  beats: number;
  midi?: number;
  drum?: DrumVoice;
  /** Note length in beats. */
  duration: number;
  velocity?: number;
}

export interface DemoPattern {
  bpm: number;
  beats: number;
  events: DemoEvent[];
}

export interface OscillatorLayer {
  type: OscillatorType;
  /** Octave offset relative to the written note. */
  octave?: number;
  /** Fine detune in cents. */
  detune?: number;
  gain?: number;
}

export interface FilterPlan {
  type: BiquadFilterType;
  frequency: number;
  q?: number;
  /** Multiplier applied to frequency at the transient. */
  envAmount?: number;
  /** Seconds for the cutoff to settle back to `frequency`. */
  envDecay?: number;
}

export interface NoisePlan {
  level: number;
  decay: number;
  frequency: number;
  type?: BiquadFilterType;
  q?: number;
}

export interface BodyPlan {
  frequency: number;
  q?: number;
  gain: number;
}

export interface EffectsPlan {
  /** 0..1, session-wide saturation. */
  drive?: number;
  delay?: { time: number; feedback: number; mix: number };
  reverb?: { decay: number; mix: number };
  chorus?: { rate: number; depth: number; mix: number };
}

export interface DrumKitPlan {
  kick: { startHz: number; endHz: number; decay: number; click: number; level: number };
  snare: { toneHz: number; decay: number; noise: number; snap: number; level: number };
  hat: { decay: number; frequency: number; level: number; metallic: number };
  openHat: { decay: number; frequency: number; level: number };
  tom: { startHz: number; endHz: number; decay: number; level: number };
  clap?: { decay: number; frequency: number; level: number };
  rim?: { frequency: number; decay: number; level: number };
  /** 0..0.35 — delays off-beat eighths for a swung feel. */
  swing?: number;
  /** 0..1 — continuous vinyl/tape hiss while the loop plays. */
  vinyl?: number;
}

export interface ProfileSpec {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gain: number;
  /** Semitone shift applied to written notes. */
  octave?: number;
  layers?: OscillatorLayer[];
  /** Additive sine partial amplitudes for piano-family voices. */
  partials?: number[];
  filter?: FilterPlan;
  body?: BodyPlan;
  noise?: NoisePlan;
  vibrato?: { rate: number; depth: number; delay?: number };
  tremolo?: { rate: number; depth: number };
  fm?: { ratio: number; index: number; decay: number };
  effects: EffectsPlan;
  kit?: DrumKitPlan;
  /** Optional profile-specific performance used instead of the instrument demo. */
  demo?: DemoPattern;
}

export interface InstrumentSoundProfile {
  id: string;
  name: string;
  description: string;
  spec: ProfileSpec;
}

export interface MusicalInstrument {
  id: InstrumentId;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  demo: DemoPattern;
  /** Note phrase used by the profile preview control. */
  audition: number[];
  /** Playable MIDI range used when the instrument voices a dataset. */
  frameRange: [number, number];
  profiles: InstrumentSoundProfile[];
}

const n = (beats: number, midi: number, duration = 0.5, velocity = 0.8): DemoEvent => ({
  beats, midi, duration, velocity,
});

const hit = (beats: number, drum: DrumVoice, velocity = 0.85, duration = 0.25): DemoEvent => ({
  beats, drum, duration, velocity,
});

const PIANO_DEMO: DemoPattern = {
  bpm: 92,
  beats: 8,
  events: [
    n(0, 48, 3.5, 0.55), n(0, 60, 2, 0.8), n(0.5, 64, 1.6, 0.72),
    n(1, 67, 1.6, 0.72), n(1.5, 71, 1.4, 0.68), n(2, 64, 1.6, 0.65),
    n(2.5, 67, 1.4, 0.6), n(3, 72, 1.6, 0.62), n(3.5, 67, 1, 0.55),
    n(4, 41, 3.5, 0.52), n(4, 53, 2, 0.68), n(4.5, 57, 1.6, 0.64),
    n(5, 60, 1.6, 0.64), n(5.5, 64, 1.4, 0.6), n(6, 69, 1.8, 0.65),
    n(6.5, 64, 1.4, 0.58), n(7, 60, 2, 0.6), n(7.5, 57, 1, 0.5),
  ],
};

const ELECTRIC_DEMO: DemoPattern = {
  bpm: 112,
  beats: 8,
  events: [
    n(0, 40, 0.4, 0.9), n(0, 47, 0.4, 0.85), n(0.5, 40, 0.35, 0.8),
    n(1, 43, 0.35, 0.85), n(1.5, 40, 0.35, 0.8), n(2, 45, 0.35, 0.85),
    n(2.5, 47, 0.35, 0.85), n(3, 52, 0.65, 0.85), n(3.5, 55, 0.4, 0.8),
    n(4, 52, 0.4, 0.9), n(4, 59, 0.4, 0.8), n(4.5, 59, 0.6, 0.85),
    n(5, 55, 0.3, 0.8), n(5.5, 52, 0.3, 0.8), n(6, 45, 0.4, 0.9),
    n(6, 52, 0.4, 0.85), n(6.5, 47, 0.35, 0.8), n(7, 40, 0.5, 0.85),
    n(7.5, 43, 0.35, 0.8),
  ],
};

const ELECTRIC_AMBIENT_DEMO: DemoPattern = {
  bpm: 76,
  beats: 8,
  events: [
    n(0, 52, 4, 0.55), n(0.4, 59, 4, 0.5), n(0.8, 64, 3.6, 0.45),
    n(1.2, 67, 3.2, 0.4), n(4, 48, 4, 0.5), n(4.4, 55, 4, 0.45),
    n(4.8, 60, 3.6, 0.4), n(5.2, 64, 3.2, 0.35),
  ],
};

const ACOUSTIC_DEMO: DemoPattern = {
  bpm: 100,
  beats: 8,
  events: [
    n(0, 48, 3, 0.55), n(0, 60, 1.5, 0.7), n(0.5, 64, 1.2, 0.66),
    n(1, 67, 1.2, 0.64), n(1.5, 72, 1.2, 0.6), n(2, 43, 3, 0.5),
    n(2, 62, 1.2, 0.62), n(2.5, 67, 1.2, 0.6), n(3, 71, 1.2, 0.58),
    n(3.5, 74, 1, 0.55), n(4, 45, 3, 0.5), n(4, 60, 1.2, 0.66),
    n(4.5, 64, 1.2, 0.62), n(5, 69, 1.2, 0.6), n(5.5, 72, 1, 0.58),
    n(6, 41, 3, 0.5), n(6, 60, 1.2, 0.64), n(6.5, 65, 1.2, 0.6),
    n(7, 69, 1.2, 0.6), n(7.5, 72, 1, 0.56),
  ],
};

const DRUM_DEMO: DemoPattern = {
  bpm: 100,
  beats: 8,
  events: [
    hit(0, 'kick', 0.95), hit(0, 'hat', 0.5), hit(0.5, 'hat', 0.35),
    hit(1, 'snare', 0.85), hit(1, 'hat', 0.45), hit(1.5, 'kick', 0.8),
    hit(1.5, 'hat', 0.35), hit(2, 'hat', 0.5), hit(2.5, 'kick', 0.8),
    hit(2.5, 'hat', 0.35), hit(3, 'snare', 0.85), hit(3, 'hat', 0.45),
    hit(3.5, 'open-hat', 0.55), hit(4, 'kick', 0.95), hit(4, 'hat', 0.5),
    hit(4.5, 'hat', 0.35), hit(5, 'snare', 0.85), hit(5, 'hat', 0.45),
    hit(5.5, 'kick', 0.8), hit(5.5, 'hat', 0.35), hit(6, 'hat', 0.5),
    hit(6.5, 'kick', 0.85), hit(6.5, 'tom', 0.65), hit(6.75, 'tom', 0.7),
    hit(7, 'snare', 0.9), hit(7, 'hat', 0.45), hit(7.25, 'clap', 0.45),
    hit(7.5, 'tom', 0.72), hit(7.5, 'hat', 0.35),
  ],
};

const BASS_DEMO: DemoPattern = {
  bpm: 96,
  beats: 8,
  events: [
    n(0, 36, 0.9, 0.9), n(0, 48, 0.4, 0.38),
    n(1, 36, 0.45, 0.7), n(1.5, 43, 0.45, 0.75),
    n(2, 41, 0.9, 0.8), n(2, 53, 0.4, 0.35),
    n(3, 48, 0.45, 0.7), n(3.5, 43, 0.45, 0.68),
    n(4, 38, 0.9, 0.85), n(4, 50, 0.4, 0.36),
    n(5, 38, 0.45, 0.7), n(5.5, 45, 0.45, 0.75),
    n(6, 43, 0.9, 0.8), n(6, 55, 0.4, 0.35),
    n(7, 40, 0.6, 0.75), n(7.5, 43, 0.4, 0.65),
  ],
};

const STRING_DEMO: DemoPattern = {
  bpm: 72,
  beats: 8,
  events: [
    n(0, 60, 3.6, 0.6), n(0, 67, 3.6, 0.5), n(0, 72, 3.4, 0.55),
    n(4, 62, 3.6, 0.6), n(4, 69, 3.6, 0.5), n(4, 74, 3.4, 0.55),
    n(7.5, 76, 0.5, 0.5),
  ],
};

const WIND_DEMO: DemoPattern = {
  bpm: 84,
  beats: 8,
  events: [
    n(0, 72, 1.4, 0.7), n(1.5, 76, 1.2, 0.65), n(3, 79, 1.6, 0.7),
    n(4.5, 74, 1.4, 0.6), n(6, 71, 1.2, 0.6), n(7, 67, 1, 0.55),
  ],
};

const SYNTH_DEMO: DemoPattern = {
  bpm: 120,
  beats: 8,
  events: [
    n(0, 48, 0.5, 0.85), n(0, 60, 0.5, 0.7), n(1, 55, 0.5, 0.75),
    n(2, 58, 0.5, 0.8), n(3, 63, 0.75, 0.7), n(4, 48, 0.5, 0.85),
    n(4, 67, 0.5, 0.7), n(5, 55, 0.5, 0.75), n(6, 51, 0.5, 0.8),
    n(7, 60, 1, 0.75),
  ],
};

const acousticBase = {
  attack: 0.006, decay: 0.7, sustain: 0.1, release: 0.5, gain: 0.14,
  filter: { type: 'lowpass' as BiquadFilterType, frequency: 5200, q: 0.6, envAmount: 1.7, envDecay: 0.16 },
  body: { frequency: 110, q: 1.6, gain: 5 },
  noise: { level: 0.06, decay: 0.04, frequency: 3500, type: 'bandpass' as BiquadFilterType, q: 0.8 },
  effects: { reverb: { decay: 0.7, mix: 0.11 } },
};

export const INSTRUMENTS: MusicalInstrument[] = [
  {
    id: 'piano',
    name: 'Piano',
    tagline: 'Additive tines · hammer · resonance',
    description: 'Additive piano partials with hammer noise, wooden body resonance and room reverb. Every profile is synthesized live — no sample files needed.',
    accent: '#f5c26b',
    demo: PIANO_DEMO,
    audition: [60, 64, 67, 72],
    frameRange: [24, 96],
    profiles: [
      {
        id: 'grand-piano',
        name: 'Grand Piano',
        description: 'Full concert tone: blooming overtones, a bright hammer and a long, open decay.',
        spec: {
          attack: 0.004, decay: 2.1, sustain: 0.17, release: 1.4, gain: 0.16,
          partials: [1, 0.58, 0.34, 0.21, 0.13, 0.08],
          filter: { type: 'lowpass', frequency: 7200, q: 0.4 },
          noise: { level: 0.028, decay: 0.06, frequency: 3600, type: 'highpass' },
          effects: { reverb: { decay: 1.8, mix: 0.18 } },
        },
      },
      {
        id: 'soft-piano',
        name: 'Soft Piano',
        description: 'Felt-muted and intimate: gentle attack, rounded top end and a close, quiet room.',
        spec: {
          attack: 0.02, decay: 1.7, sustain: 0.12, release: 1.5, gain: 0.15,
          partials: [1, 0.3, 0.14, 0.06, 0.025],
          filter: { type: 'lowpass', frequency: 1650, q: 0.5 },
          noise: { level: 0.012, decay: 0.04, frequency: 1200, type: 'lowpass' },
          effects: { reverb: { decay: 0.9, mix: 0.16 } },
        },
      },
      {
        id: 'electric-piano',
        name: 'Electric Piano',
        description: 'Twin-tine FM bell with a soft tremolo shimmer — warm, vintage and slightly percussive.',
        spec: {
          attack: 0.006, decay: 1.3, sustain: 0.22, release: 1, gain: 0.15,
          partials: [1, 0.18, 0.06],
          fm: { ratio: 3.01, index: 2.6, decay: 0.9 },
          filter: { type: 'lowpass', frequency: 5000, q: 0.45 },
          tremolo: { rate: 5.2, depth: 0.24 },
          noise: { level: 0.01, decay: 0.04, frequency: 2400, type: 'bandpass' },
          effects: { chorus: { rate: 1.2, depth: 0.0025, mix: 0.2 }, reverb: { decay: 0.8, mix: 0.14 } },
        },
      },
      {
        id: 'bright-piano',
        name: 'Bright Piano',
        description: 'Pop-ready attack with sparkling high partials, a crisp hammer click and a short room.',
        spec: {
          attack: 0.002, decay: 0.9, sustain: 0.14, release: 0.8, gain: 0.15,
          partials: [1, 0.78, 0.54, 0.36, 0.23, 0.14, 0.08],
          filter: { type: 'lowpass', frequency: 11000, q: 0.35 },
          noise: { level: 0.05, decay: 0.05, frequency: 5200, type: 'highpass' },
          effects: { reverb: { decay: 0.6, mix: 0.1 } },
        },
      },
      {
        id: 'warm-piano',
        name: 'Warm Piano',
        description: 'Wooden body resonance and rolled-off highs — an intimate, candlelit upright.',
        spec: {
          attack: 0.012, decay: 1.6, sustain: 0.2, release: 1.4, gain: 0.15,
          partials: [1, 0.42, 0.19, 0.08, 0.03],
          filter: { type: 'lowpass', frequency: 2150, q: 0.5 },
          body: { frequency: 180, q: 1.1, gain: 3.5 },
          noise: { level: 0.018, decay: 0.04, frequency: 1500, type: 'lowpass' },
          effects: { reverb: { decay: 1.4, mix: 0.24 } },
        },
      },
    ],
  },
  {
    id: 'electric-guitar',
    name: 'Electric Guitar',
    tagline: 'Pickups · pedals · amp gain',
    description: 'A modeled electric guitar with five chains: clean, overdrive, distortion, a cutting rock lead and an ambient wash. Every profile is synthesized live — no sample files needed.',
    accent: '#f97316',
    demo: ELECTRIC_DEMO,
    audition: [60, 64, 67, 71],
    frameRange: [40, 88],
    profiles: [
      {
        id: 'clean',
        name: 'Clean',
        description: 'Glassy twin-pickup clean with a light chorus and a short, airy room.',
        spec: {
          attack: 0.004, decay: 0.35, sustain: 0.28, release: 0.35, gain: 0.14,
          layers: [{ type: 'sawtooth', gain: 0.55 }, { type: 'triangle', gain: 0.45, detune: 4 }],
          filter: { type: 'lowpass', frequency: 4200, q: 0.7, envAmount: 1.8, envDecay: 0.18 },
          noise: { level: 0.055, decay: 0.03, frequency: 5200, type: 'highpass' },
          effects: { chorus: { rate: 1.1, depth: 0.002, mix: 0.14 }, reverb: { decay: 0.6, mix: 0.08 } },
          demo: ELECTRIC_DEMO,
        },
      },
      {
        id: 'overdrive',
        name: 'Overdrive',
        description: 'Edge-of-breakup valve crunch, mid-forward and dynamic, with a touch of slapback.',
        spec: {
          attack: 0.004, decay: 0.5, sustain: 0.4, release: 0.45, gain: 0.12,
          layers: [{ type: 'sawtooth', gain: 0.62 }, { type: 'square', gain: 0.2, detune: 5 }],
          filter: { type: 'lowpass', frequency: 2600, q: 0.9, envAmount: 2.2, envDecay: 0.25 },
          noise: { level: 0.08, decay: 0.03, frequency: 3200, type: 'bandpass', q: 0.7 },
          effects: { drive: 0.38, delay: { time: 0.28, feedback: 0.18, mix: 0.1 }, reverb: { decay: 0.8, mix: 0.08 } },
          demo: ELECTRIC_DEMO,
        },
      },
      {
        id: 'distortion',
        name: 'Distortion',
        description: 'Saturated high-gain wall of harmonics with a tight low end and a short room.',
        spec: {
          attack: 0.003, decay: 0.8, sustain: 0.55, release: 0.5, gain: 0.1,
          layers: [{ type: 'sawtooth', gain: 0.65 }, { type: 'sawtooth', gain: 0.3, detune: -6 }],
          filter: { type: 'lowpass', frequency: 3200, q: 1.1, envAmount: 3, envDecay: 0.3 },
          noise: { level: 0.1, decay: 0.035, frequency: 4000, type: 'bandpass', q: 0.8 },
          effects: { drive: 0.9, delay: { time: 0.3, feedback: 0.22, mix: 0.12 }, reverb: { decay: 0.7, mix: 0.1 } },
          demo: ELECTRIC_DEMO,
        },
      },
      {
        id: 'rock-lead',
        name: 'Rock Lead',
        description: 'A cutting single-coil lead with vibrato, bright resonant mids and a long dotted delay.',
        spec: {
          attack: 0.005, decay: 1.2, sustain: 0.5, release: 0.6, gain: 0.11,
          layers: [{ type: 'sawtooth', gain: 0.6 }, { type: 'square', gain: 0.22, detune: 7 }],
          filter: { type: 'lowpass', frequency: 3800, q: 3.2, envAmount: 2.4, envDecay: 0.22 },
          noise: { level: 0.06, decay: 0.03, frequency: 6000, type: 'highpass' },
          vibrato: { rate: 5.5, depth: 0.12, delay: 0.18 },
          effects: { drive: 0.55, delay: { time: 0.34, feedback: 0.28, mix: 0.16 }, reverb: { decay: 0.9, mix: 0.12 } },
          demo: ELECTRIC_DEMO,
        },
      },
      {
        id: 'ambient-guitar',
        name: 'Ambient Guitar',
        description: 'Slow-swelling chords washed in chorus, long delay and a cavernous reverb.',
        spec: {
          attack: 0.35, decay: 1.8, sustain: 0.45, release: 2.5, gain: 0.1,
          layers: [{ type: 'triangle', gain: 0.5 }, { type: 'sawtooth', gain: 0.25, detune: 8 }],
          filter: { type: 'lowpass', frequency: 2600, q: 0.6, envAmount: 1.4, envDecay: 0.8 },
          noise: { level: 0.022, decay: 0.5, frequency: 2800, type: 'bandpass' },
          effects: {
            drive: 0.08,
            chorus: { rate: 0.45, depth: 0.004, mix: 0.35 },
            delay: { time: 0.48, feedback: 0.45, mix: 0.3 },
            reverb: { decay: 2.6, mix: 0.45 },
          },
          demo: ELECTRIC_AMBIENT_DEMO,
        },
      },
    ],
  },
  {
    id: 'acoustic-guitar',
    name: 'Acoustic Guitar',
    tagline: 'Steel · nylon · fingerstyle',
    description: 'Five acoustic guitars from a bright steel-string to a mellow nylon, each with its own body resonance, pick noise and room.',
    accent: '#fbbf24',
    demo: ACOUSTIC_DEMO,
    audition: [48, 55, 60, 64],
    frameRange: [40, 88],
    profiles: [
      {
        id: 'steel-string',
        name: 'Steel String',
        description: 'Bright steel sparkle, a firm pick attack and a quick, lively body resonance.',
        spec: {
          ...acousticBase,
          layers: [{ type: 'triangle', gain: 0.55 }, { type: 'sawtooth', gain: 0.24, detune: 3 }],
          filter: { type: 'lowpass', frequency: 6500, q: 0.5, envAmount: 1.6, envDecay: 0.15 },
          body: { frequency: 105, q: 1.6, gain: 5 },
          noise: { level: 0.08, decay: 0.04, frequency: 3500, type: 'bandpass', q: 0.8 },
          effects: { reverb: { decay: 0.7, mix: 0.1 } },
        },
      },
      {
        id: 'nylon-string',
        name: 'Nylon String',
        description: 'Round nylon tone with a soft fingertip attack and a dark, intimate body.',
        spec: {
          attack: 0.008, decay: 1.8, sustain: 0.14, release: 1.1, gain: 0.15,
          layers: [{ type: 'triangle', gain: 0.62 }, { type: 'sine', gain: 0.28, detune: -4 }],
          filter: { type: 'lowpass', frequency: 2600, q: 0.5, envAmount: 1.3, envDecay: 0.2 },
          body: { frequency: 120, q: 1.4, gain: 4.5 },
          noise: { level: 0.04, decay: 0.05, frequency: 2200, type: 'lowpass' },
          effects: { reverb: { decay: 1.0, mix: 0.16 } },
        },
      },
      {
        id: 'fingerstyle',
        name: 'Fingerstyle',
        description: 'Gentle thumb-and-finger plucks, wide sustain and a light chorus over a soft body.',
        spec: {
          attack: 0.012, decay: 1.1, sustain: 0.16, release: 0.9, gain: 0.16,
          layers: [{ type: 'triangle', gain: 0.6 }, { type: 'sine', gain: 0.3, detune: -4 }],
          filter: { type: 'lowpass', frequency: 3800, q: 0.6, envAmount: 1.5, envDecay: 0.18 },
          body: { frequency: 140, q: 1.5, gain: 4.8 },
          noise: { level: 0.03, decay: 0.05, frequency: 2600, type: 'bandpass', q: 0.9 },
          effects: { chorus: { rate: 1.0, depth: 0.0018, mix: 0.12 }, reverb: { decay: 0.9, mix: 0.14 } },
        },
      },
      {
        id: 'warm-acoustic',
        name: 'Warm Acoustic',
        description: 'Darker, guitar-in-the-room warmth — soft attack, heavy body and a long, cloudy reverb.',
        spec: {
          attack: 0.015, decay: 2.2, sustain: 0.2, release: 1.5, gain: 0.15,
          layers: [{ type: 'triangle', gain: 0.55 }, { type: 'sawtooth', gain: 0.16, detune: -8 }],
          filter: { type: 'lowpass', frequency: 2000, q: 0.5, envAmount: 1.2, envDecay: 0.3 },
          body: { frequency: 160, q: 1.7, gain: 6 },
          noise: { level: 0.02, decay: 0.04, frequency: 1400, type: 'lowpass' },
          effects: { reverb: { decay: 1.6, mix: 0.24 } },
        },
      },
      {
        id: 'bright-acoustic',
        name: 'Bright Acoustic',
        description: 'Sparkling high-end shimmer with a crisp pick, airy top and a short delay slap.',
        spec: {
          attack: 0.003, decay: 1.0, sustain: 0.12, release: 0.7, gain: 0.15,
          layers: [{ type: 'triangle', gain: 0.5 }, { type: 'sawtooth', gain: 0.3, detune: 6 }],
          filter: { type: 'lowpass', frequency: 9500, q: 0.5, envAmount: 1.7, envDecay: 0.12 },
          body: { frequency: 90, q: 1.2, gain: 4 },
          noise: { level: 0.1, decay: 0.035, frequency: 6000, type: 'highpass' },
          effects: { delay: { time: 0.22, feedback: 0.16, mix: 0.1 }, reverb: { decay: 0.5, mix: 0.09 } },
        },
      },
    ],
  },
  {
    id: 'bass-guitar',
    name: 'Bass Guitar',
    tagline: 'Finger · pick · slap · synth',
    description: 'Five bass voices — fingerstyle warmth, pick bite, slap snap, a deep sub and a synth bass — all synthesized live in the browser.',
    accent: '#60a5fa',
    demo: BASS_DEMO,
    audition: [36, 43, 48, 52],
    frameRange: [28, 76],
    profiles: [
      {
        id: 'finger-bass',
        name: 'Finger Bass',
        description: 'Round fingerstyle low end with a soft attack, tight filter and a woody body.',
        spec: {
          attack: 0.008, decay: 0.9, sustain: 0.3, release: 0.5, gain: 0.17,
          layers: [{ type: 'triangle', gain: 0.7 }, { type: 'sine', gain: 0.5, detune: 3 }],
          filter: { type: 'lowpass', frequency: 1400, q: 0.8, envAmount: 2.0, envDecay: 0.2 },
          body: { frequency: 90, q: 1.4, gain: 6 },
          noise: { level: 0.03, decay: 0.04, frequency: 2400, type: 'bandpass', q: 0.9 },
          effects: { reverb: { decay: 0.5, mix: 0.06 } },
        },
      },
      {
        id: 'pick-bass',
        name: 'Pick Bass',
        description: 'Pick-attacked bass with biting highs, a short drive and a clicky transient.',
        spec: {
          attack: 0.004, decay: 0.55, sustain: 0.35, release: 0.4, gain: 0.15,
          layers: [{ type: 'sawtooth', gain: 0.55 }, { type: 'triangle', gain: 0.4, detune: 5 }],
          filter: { type: 'lowpass', frequency: 2600, q: 1.1, envAmount: 2.6, envDecay: 0.12 },
          noise: { level: 0.09, decay: 0.03, frequency: 4200, type: 'highpass' },
          effects: { drive: 0.15, reverb: { decay: 0.4, mix: 0.06 } },
        },
      },
      {
        id: 'slap-bass',
        name: 'Slap Bass',
        description: 'Slap-and-pop snap with a resonant filter sweep, mid-body punch and a slapback.',
        spec: {
          attack: 0.002, decay: 0.4, sustain: 0.25, release: 0.35, gain: 0.16,
          layers: [{ type: 'square', gain: 0.3 }, { type: 'triangle', gain: 0.6, detune: -3 }],
          filter: { type: 'lowpass', frequency: 3200, q: 1.6, envAmount: 3.2, envDecay: 0.1 },
          noise: { level: 0.11, decay: 0.025, frequency: 3000, type: 'bandpass', q: 1.2 },
          body: { frequency: 160, q: 2.0, gain: 4 },
          effects: { delay: { time: 0.24, feedback: 0.14, mix: 0.1 }, reverb: { decay: 0.5, mix: 0.07 } },
        },
      },
      {
        id: 'deep-bass',
        name: 'Deep Bass',
        description: 'Sub-heavy sine bass with a slow attack and a long, dark sustain under the mix.',
        spec: {
          attack: 0.02, decay: 1.4, sustain: 0.5, release: 1.0, gain: 0.2,
          layers: [{ type: 'sine', gain: 0.8 }, { type: 'triangle', gain: 0.35, detune: 2 }],
          filter: { type: 'lowpass', frequency: 700, q: 0.7, envAmount: 1.6, envDecay: 0.4 },
          body: { frequency: 60, q: 1.2, gain: 5 },
          noise: { level: 0.012, decay: 0.06, frequency: 900, type: 'lowpass' },
          effects: { reverb: { decay: 0.8, mix: 0.1 } },
        },
      },
      {
        id: 'synth-bass',
        name: 'Synth Bass',
        description: 'An FM-leaning synth bass with a fast filter envelope, gentle tremolo and grit.',
        spec: {
          attack: 0.006, decay: 0.7, sustain: 0.45, release: 0.4, gain: 0.14,
          layers: [{ type: 'sawtooth', gain: 0.5 }, { type: 'square', gain: 0.25, detune: 7 }],
          fm: { ratio: 2, index: 3, decay: 0.5 },
          filter: { type: 'lowpass', frequency: 1800, q: 2.4, envAmount: 2.8, envDecay: 0.18 },
          tremolo: { rate: 6, depth: 0.12 },
          noise: { level: 0.02, decay: 0.03, frequency: 2000, type: 'bandpass' },
          effects: { drive: 0.2, chorus: { rate: 1.4, depth: 0.002, mix: 0.16 }, reverb: { decay: 0.5, mix: 0.06 } },
        },
      },
    ],
  },
  {
    id: 'drum-machine',
    name: 'Drum Machine',
    tagline: 'Kicks · snares · hats · swing',
    description: 'Five synthesized kits — kicks, snares, hats, toms and claps built from pitch drops, noise sweeps and filters, with swing and vinyl beds where the style needs them. No samples.',
    accent: '#34d399',
    demo: DRUM_DEMO,
    audition: [],
    frameRange: [24, 96],
    profiles: [
      {
        id: 'acoustic-kit',
        name: 'Acoustic Kit',
        description: 'Natural kit with a soft kick, cracky snare, metallic hats and a small room.',
        spec: {
          attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.12, gain: 0.2,
          effects: { reverb: { decay: 0.5, mix: 0.1 } },
          kit: {
            kick: { startHz: 150, endHz: 48, decay: 0.35, click: 0.06, level: 0.9 },
            snare: { toneHz: 190, decay: 0.22, noise: 0.5, snap: 0.12, level: 0.75 },
            hat: { decay: 0.045, frequency: 7000, level: 0.25, metallic: 0.15 },
            openHat: { decay: 0.35, frequency: 6500, level: 0.22 },
            tom: { startHz: 180, endHz: 90, decay: 0.35, level: 0.55 },
            clap: { decay: 0.16, frequency: 1500, level: 0.4 },
            rim: { frequency: 800, decay: 0.03, level: 0.4 },
          },
        },
      },
      {
        id: 'electronic-kit',
        name: 'Electronic Kit',
        description: 'Punchy electronic kit: deep sine kick, synthetic snare and bright digital hats.',
        spec: {
          attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.1, gain: 0.2,
          effects: { drive: 0.18, delay: { time: 0.16, feedback: 0.18, mix: 0.06 }, reverb: { decay: 0.3, mix: 0.05 } },
          kit: {
            kick: { startHz: 180, endHz: 40, decay: 0.5, click: 0.1, level: 1 },
            snare: { toneHz: 320, decay: 0.25, noise: 0.35, snap: 0.2, level: 0.7 },
            hat: { decay: 0.03, frequency: 9000, level: 0.3, metallic: 0.35 },
            openHat: { decay: 0.3, frequency: 8500, level: 0.25 },
            tom: { startHz: 240, endHz: 100, decay: 0.3, level: 0.5 },
            clap: { decay: 0.15, frequency: 2200, level: 0.35 },
            rim: { frequency: 1100, decay: 0.025, level: 0.35 },
          },
        },
      },
      {
        id: 'hip-hop',
        name: 'Hip-Hop',
        description: 'Laid-back boom-bap: swung hats, fat kick, dusty snare and a touch of vinyl noise.',
        spec: {
          attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.12, gain: 0.2,
          effects: { drive: 0.12, delay: { time: 0.18, feedback: 0.15, mix: 0.07 }, reverb: { decay: 0.35, mix: 0.06 } },
          kit: {
            kick: { startHz: 120, endHz: 42, decay: 0.55, click: 0.08, level: 0.95 },
            snare: { toneHz: 220, decay: 0.28, noise: 0.45, snap: 0.18, level: 0.75 },
            hat: { decay: 0.05, frequency: 8000, level: 0.22, metallic: 0.2 },
            openHat: { decay: 0.4, frequency: 7500, level: 0.2 },
            tom: { startHz: 160, endHz: 80, decay: 0.4, level: 0.5 },
            clap: { decay: 0.18, frequency: 1300, level: 0.42 },
            swing: 0.16,
            vinyl: 0.015,
          },
        },
      },
      {
        id: 'rock-kit',
        name: 'Rock Kit',
        description: 'Big room rock kit: hard snare crack, boomy kick and wide open cymbals.',
        spec: {
          attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.12, gain: 0.21,
          effects: { drive: 0.08, reverb: { decay: 0.9, mix: 0.2 } },
          kit: {
            kick: { startHz: 160, endHz: 50, decay: 0.28, click: 0.04, level: 1 },
            snare: { toneHz: 180, decay: 0.18, noise: 0.65, snap: 0.2, level: 0.85 },
            hat: { decay: 0.035, frequency: 9000, level: 0.3, metallic: 0.18 },
            openHat: { decay: 0.28, frequency: 8200, level: 0.28 },
            tom: { startHz: 200, endHz: 85, decay: 0.3, level: 0.62 },
            clap: { decay: 0.15, frequency: 1700, level: 0.4 },
          },
        },
      },
      {
        id: 'lo-fi-drums',
        name: 'Lo-Fi Drums',
        description: 'Dusty, filtered drums with saturated transients, swing and a warm tape-hiss bed.',
        spec: {
          attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.15, gain: 0.19,
          effects: { drive: 0.45, delay: { time: 0.18, feedback: 0.12, mix: 0.08 }, reverb: { decay: 1.4, mix: 0.16 } },
          kit: {
            kick: { startHz: 110, endHz: 38, decay: 0.5, click: 0.02, level: 0.85 },
            snare: { toneHz: 170, decay: 0.3, noise: 0.4, snap: 0.1, level: 0.65 },
            hat: { decay: 0.05, frequency: 3500, level: 0.16, metallic: 0.08 },
            openHat: { decay: 0.3, frequency: 3000, level: 0.18 },
            tom: { startHz: 150, endHz: 70, decay: 0.35, level: 0.45 },
            clap: { decay: 0.2, frequency: 1000, level: 0.32 },
            swing: 0.22,
            vinyl: 0.035,
          },
        },
      },
    ],
  },
  {
    id: 'violin',
    name: 'Violin',
    tagline: 'Bow · body · vibrato',
    description: 'Five bowed-string voices, from a dry classical bow to a wide cinematic tremolo — sawtooth harmonics, body resonance and bow noise, all synthesized live.',
    accent: '#c084fc',
    demo: STRING_DEMO,
    audition: [67, 72, 76, 79],
    frameRange: [48, 96],
    profiles: [
      {
        id: 'classical',
        name: 'Classical',
        description: 'A clean, focused bow with slow attack, a shaped body and natural slow vibrato.',
        spec: {
          attack: 0.08, decay: 1.6, sustain: 0.55, release: 0.6, gain: 0.13,
          layers: [{ type: 'sawtooth', gain: 0.5 }, { type: 'triangle', gain: 0.35, detune: 4 }],
          filter: { type: 'lowpass', frequency: 3400, q: 1.2, envAmount: 1.4, envDecay: 0.3 },
          body: { frequency: 240, q: 2.2, gain: 5 },
          noise: { level: 0.05, decay: 0.09, frequency: 4200, type: 'bandpass', q: 1.1 },
          vibrato: { rate: 5.2, depth: 0.08, delay: 0.35 },
          effects: { reverb: { decay: 1.2, mix: 0.16 } },
        },
      },
      {
        id: 'warm-strings',
        name: 'Warm Strings',
        description: 'Rounded ensemble warmth with a soft attack, a dark filter and a gentle chorus.',
        spec: {
          attack: 0.16, decay: 1.8, sustain: 0.6, release: 1.2, gain: 0.13,
          layers: [{ type: 'sawtooth', gain: 0.4 }, { type: 'sine', gain: 0.4, detune: -3 }],
          filter: { type: 'lowpass', frequency: 2000, q: 0.9, envAmount: 1.2, envDecay: 0.5 },
          body: { frequency: 180, q: 1.8, gain: 6 },
          noise: { level: 0.03, decay: 0.12, frequency: 3000, type: 'lowpass' },
          vibrato: { rate: 4.6, depth: 0.06, delay: 0.5 },
          effects: { chorus: { rate: 0.8, depth: 0.003, mix: 0.18 }, reverb: { decay: 1.6, mix: 0.2 } },
        },
      },
      {
        id: 'cinematic',
        name: 'Cinematic',
        description: 'Big-score strings: long swell, wide delay and a cavernous hall that fills the mix.',
        spec: {
          attack: 0.35, decay: 2.4, sustain: 0.6, release: 1.8, gain: 0.12,
          layers: [{ type: 'sawtooth', gain: 0.45 }, { type: 'sawtooth', gain: 0.3, detune: 8 }],
          filter: { type: 'lowpass', frequency: 2600, q: 1.6, envAmount: 1.3, envDecay: 0.6 },
          body: { frequency: 140, q: 2.6, gain: 5.5 },
          noise: { level: 0.04, decay: 0.15, frequency: 2400, type: 'bandpass' },
          effects: { delay: { time: 0.42, feedback: 0.32, mix: 0.2 }, reverb: { decay: 2.8, mix: 0.42 } },
        },
      },
      {
        id: 'soft-legato',
        name: 'Soft Legato',
        description: 'Mellow, connected phrasing — soft bow, low filter and a close, cloudy room.',
        spec: {
          attack: 0.22, decay: 1.9, sustain: 0.7, release: 1.4, gain: 0.14,
          layers: [{ type: 'triangle', gain: 0.55 }, { type: 'sawtooth', gain: 0.25, detune: -5 }],
          filter: { type: 'lowpass', frequency: 1700, q: 0.8, envAmount: 1.1, envDecay: 0.4 },
          body: { frequency: 200, q: 1.6, gain: 4 },
          noise: { level: 0.025, decay: 0.1, frequency: 2600, type: 'lowpass' },
          vibrato: { rate: 4.2, depth: 0.05, delay: 0.6 },
          effects: { reverb: { decay: 1.4, mix: 0.22 } },
        },
      },
      {
        id: 'vibrato',
        name: 'Vibrato',
        description: 'Expressive solo bow with a fast, wide vibrato and a bright resonant filter.',
        spec: {
          attack: 0.06, decay: 1.2, sustain: 0.5, release: 0.7, gain: 0.13,
          layers: [{ type: 'sawtooth', gain: 0.5 }, { type: 'triangle', gain: 0.3, detune: 6 }],
          filter: { type: 'lowpass', frequency: 3000, q: 2.8, envAmount: 1.8, envDecay: 0.25 },
          noise: { level: 0.06, decay: 0.08, frequency: 5000, type: 'bandpass' },
          vibrato: { rate: 6.4, depth: 0.2 },
          effects: { chorus: { rate: 1.6, depth: 0.0025, mix: 0.2 }, reverb: { decay: 0.9, mix: 0.12 } },
        },
      },
    ],
  },
  {
    id: 'flute',
    name: 'Flute',
    tagline: 'Air · breath · embouchure',
    description: 'Five woodwind voices built from sine partials, filtered breath noise and gentle vibrato — no samples anywhere.',
    accent: '#7dd3fc',
    demo: WIND_DEMO,
    audition: [72, 76, 79, 84],
    frameRange: [55, 96],
    profiles: [
      {
        id: 'concert-flute',
        name: 'Concert Flute',
        description: 'A clear concert flute with a light breath edge, balanced partials and a small hall.',
        spec: {
          attack: 0.05, decay: 0.9, sustain: 0.65, release: 0.45, gain: 0.14,
          partials: [1, 0.24, 0.08, 0.03],
          filter: { type: 'lowpass', frequency: 4200, q: 0.8, envAmount: 1.3, envDecay: 0.2 },
          noise: { level: 0.07, decay: 0.09, frequency: 5200, type: 'bandpass', q: 1.0 },
          vibrato: { rate: 5.0, depth: 0.06, delay: 0.4 },
          effects: { reverb: { decay: 0.9, mix: 0.14 } },
        },
      },
      {
        id: 'soft-flute',
        name: 'Soft Flute',
        description: 'Quiet, breathy tone with a slow attack, dark filter and a close, gentle room.',
        spec: {
          attack: 0.09, decay: 1.2, sustain: 0.7, release: 0.7, gain: 0.13,
          partials: [1, 0.12, 0.04],
          filter: { type: 'lowpass', frequency: 2400, q: 0.7, envAmount: 1.2, envDecay: 0.3 },
          noise: { level: 0.04, decay: 0.12, frequency: 3600, type: 'lowpass' },
          vibrato: { rate: 4.4, depth: 0.04, delay: 0.6 },
          effects: { reverb: { decay: 1.2, mix: 0.2 } },
        },
      },
      {
        id: 'airy-flute',
        name: 'Airy Flute',
        description: 'Air-first flute: a band-passed breath bed, shimmering top and a soft chorus.',
        spec: {
          attack: 0.13, decay: 1.0, sustain: 0.6, release: 0.8, gain: 0.12,
          partials: [1, 0.18, 0.05],
          filter: { type: 'bandpass', frequency: 3000, q: 1.4, envAmount: 1.5, envDecay: 0.3 },
          noise: { level: 0.13, decay: 0.15, frequency: 6500, type: 'highpass' },
          effects: { chorus: { rate: 1.1, depth: 0.003, mix: 0.22 }, reverb: { decay: 1.0, mix: 0.18 } },
        },
      },
      {
        id: 'warm-flute',
        name: 'Warm Flute',
        description: 'Round, wooden warmth from a low filter and a shaped air-column body resonance.',
        spec: {
          attack: 0.07, decay: 1.4, sustain: 0.62, release: 0.9, gain: 0.14,
          partials: [1, 0.3, 0.11, 0.05],
          filter: { type: 'lowpass', frequency: 1800, q: 0.9, envAmount: 1.1, envDecay: 0.4 },
          body: { frequency: 520, q: 3.0, gain: 3 },
          noise: { level: 0.03, decay: 0.08, frequency: 2800, type: 'lowpass' },
          vibrato: { rate: 4.8, depth: 0.07, delay: 0.5 },
          effects: { reverb: { decay: 1.5, mix: 0.24 } },
        },
      },
      {
        id: 'cinematic-flute',
        name: 'Cinematic Flute',
        description: 'A long, soaring flute over a dotted delay and a wide, deep hall.',
        spec: {
          attack: 0.18, decay: 2.0, sustain: 0.75, release: 1.6, gain: 0.13,
          partials: [1, 0.4, 0.16, 0.07, 0.02],
          filter: { type: 'lowpass', frequency: 3200, q: 1.1, envAmount: 1.4, envDecay: 0.5 },
          noise: { level: 0.05, decay: 0.2, frequency: 4800, type: 'bandpass' },
          vibrato: { rate: 5.4, depth: 0.09, delay: 0.7 },
          effects: { delay: { time: 0.36, feedback: 0.3, mix: 0.18 }, reverb: { decay: 2.4, mix: 0.4 } },
        },
      },
    ],
  },
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    tagline: 'Analog · pads · retro · bass',
    description: 'Five synthesizer patches — an analog lead, two pads, a retro mono synth and a bass patch — modulated and saturated in the browser.',
    accent: '#f472b6',
    demo: SYNTH_DEMO,
    audition: [60, 63, 67, 70],
    frameRange: [36, 96],
    profiles: [
      {
        id: 'analog-lead',
        name: 'Analog Lead',
        description: 'Detuned saw-to-square lead with a bright envelope filter, vibrato and a dotted delay.',
        spec: {
          attack: 0.005, decay: 0.8, sustain: 0.5, release: 0.45, gain: 0.12,
          layers: [{ type: 'sawtooth', gain: 0.6 }, { type: 'square', gain: 0.25, detune: 7 }],
          filter: { type: 'lowpass', frequency: 3600, q: 2.6, envAmount: 3, envDecay: 0.2 },
          vibrato: { rate: 5.6, depth: 0.1 },
          effects: { drive: 0.25, delay: { time: 0.3, feedback: 0.26, mix: 0.14 } },
        },
      },
      {
        id: 'warm-pad',
        name: 'Warm Pad',
        description: 'A slow-attack three-oscillator pad with chorus and a long, dark hall.',
        spec: {
          attack: 0.55, decay: 2.6, sustain: 0.7, release: 2.4, gain: 0.11,
          layers: [{ type: 'sawtooth', gain: 0.4 }, { type: 'triangle', gain: 0.4, detune: -6 }, { type: 'sawtooth', gain: 0.2, detune: 9 }],
          filter: { type: 'lowpass', frequency: 1800, q: 0.9, envAmount: 1.4, envDecay: 1.2 },
          effects: { chorus: { rate: 0.5, depth: 0.004, mix: 0.3 }, reverb: { decay: 2.6, mix: 0.4 } },
        },
      },
      {
        id: 'ambient-pad',
        name: 'Ambient Pad',
        description: 'Drone-like FM pad with a very slow swell, filtered noise air and a deep delay wash.',
        spec: {
          attack: 0.9, decay: 3.2, sustain: 0.8, release: 3.5, gain: 0.1,
          layers: [{ type: 'sine', gain: 0.6 }, { type: 'triangle', gain: 0.3, detune: 4 }],
          fm: { ratio: 1.5, index: 1.4, decay: 2.0 },
          filter: { type: 'lowpass', frequency: 1200, q: 1.4, envAmount: 1.2, envDecay: 2.0 },
          noise: { level: 0.02, decay: 0.6, frequency: 2200, type: 'bandpass' },
          effects: { delay: { time: 0.5, feedback: 0.45, mix: 0.32 }, reverb: { decay: 3.2, mix: 0.5 } },
        },
      },
      {
        id: 'retro-synth',
        name: 'Retro Synth',
        description: 'Plucky retro mono synth — square/saw blend, resonant filter, tremolo and grit.',
        spec: {
          attack: 0.004, decay: 0.6, sustain: 0.35, release: 0.35, gain: 0.13,
          layers: [{ type: 'square', gain: 0.5 }, { type: 'sawtooth', gain: 0.3, detune: -9 }],
          filter: { type: 'lowpass', frequency: 2400, q: 3.2, envAmount: 2.6, envDecay: 0.15 },
          tremolo: { rate: 7, depth: 0.16 },
          effects: { drive: 0.3, chorus: { rate: 1.8, depth: 0.002, mix: 0.2 } },
        },
      },
      {
        id: 'bass-synth',
        name: 'Bass Synth',
        description: 'Down-octave synth bass with a fast resonant filter envelope and saturated drive.',
        spec: {
          attack: 0.003, decay: 0.5, sustain: 0.5, release: 0.35, gain: 0.17,
          layers: [{ type: 'sawtooth', gain: 0.55 }, { type: 'sine', gain: 0.4, detune: 3 }],
          octave: -12,
          filter: { type: 'lowpass', frequency: 900, q: 3.0, envAmount: 3.4, envDecay: 0.12 },
          noise: { level: 0.05, decay: 0.03, frequency: 1800, type: 'bandpass' },
          effects: { drive: 0.35, delay: { time: 0.2, feedback: 0.15, mix: 0.08 } },
        },
      },
    ],
  },
];

export const DEFAULT_INSTRUMENT_ID: InstrumentId = 'piano';
export const DEFAULT_PROFILE_ID = 'grand-piano';

/** Old ids kept alive so saved settings still resolve to a sensible voice. */
const LEGACY_INSTRUMENT_IDS: Record<string, InstrumentId> = {
  guitar: 'electric-guitar',
  drums: 'drum-machine',
};

export function getInstrument(id: InstrumentId | undefined): MusicalInstrument {
  const wanted = id ? (LEGACY_INSTRUMENT_IDS[id] ?? id) : id;
  return INSTRUMENTS.find((instrument) => instrument.id === wanted) ?? INSTRUMENTS[0];
}

export function getProfile(instrument: MusicalInstrument, profileId: string | undefined): InstrumentSoundProfile {
  return instrument.profiles.find((profile) => profile.id === profileId) ?? instrument.profiles[0];
}

export function effectTags(spec: ProfileSpec): string[] {
  const tags: string[] = [];
  if (spec.fm) tags.push('FM');
  if (spec.partials) tags.push('Additive');
  if (spec.noise) tags.push('Noise layer');
  if (spec.vibrato) tags.push('Vibrato');
  if (spec.tremolo) tags.push('Tremolo');
  if (spec.filter) tags.push(spec.filter.q && spec.filter.q >= 3 ? 'Resonant filter' : 'Filter');
  if (spec.body) tags.push('Body resonance');
  if (spec.effects.drive) tags.push('Drive');
  if (spec.effects.chorus) tags.push('Chorus');
  if (spec.effects.delay) tags.push('Delay');
  if (spec.effects.reverb) tags.push('Reverb');
  if (spec.kit?.swing) tags.push('Swing');
  if (spec.kit?.vinyl) tags.push('Vinyl');
  return tags.slice(0, 4);
}

export function instrumentLabel(id: InstrumentId): string {
  return getInstrument(id).name;
}
