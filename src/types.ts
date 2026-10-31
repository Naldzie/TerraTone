/* Shared domain types for TerraTone. */
import type { InstrumentId } from './audio/instrumentProfiles';

export type Provenance = 'nasa-live' | 'nasa-cached' | 'sample';

export interface DataPoint {
  /** ISO-ish label, e.g. "2024-01" or "1880". */
  t: string;
  /** Numeric value in dataset units; null = missing. */
  value: number | null;
  lat?: number;
  lon?: number;
}

export type FrameDateMode = 'month' | 'year' | 'exact';

export interface FrameImage {
  /** GIBS/EIC imagery layer id, e.g. "MODIS_Terra_CorrectedReflectance_TrueColor". */
  layer: string;
  /** How to derive the tile date from a frame's `t` label: "month" | "year" | "exact". */
  dateMode: FrameDateMode;
  /** Optional attribution line shown under the visual frame. */
  attribution?: string;
  /** Optional bounding box [west, south, east, north] to frame the view. */
  bounds?: [number, number, number, number];
}

export interface DatasetMeta {
  id: string;
  title: string;
  category: string;
  description: string;
  units: string;
  /** Expected data range used for normalization + audio mapping. */
  range: [number, number];
  provenance: Provenance;
  sourceName: string;
  sourceUrl: string;
  coverage: string;
  resolution: string;
  license: string;
  updatedAt: string;
  points: DataPoint[];
  mappingNote: string;
  /** When set, the player renders a GIBS/EIC visual frame per timeline frame instead of (or alongside) the abstract chart. */
  frameImage?: FrameImage;
}

export type SoundProfileId = 'musical' | 'ambient' | 'minimal' | 'scientific';

export interface SoundProfile {
  id: SoundProfileId;
  name: string;
  blurb: string;
  minFreq: number;
  maxFreq: number;
  wave: OscillatorType;
}

export interface MappingConfig {
  profileId: SoundProfileId;
  /** Frames per second during playback. */
  speed: number;
  masterVolume: number;
  muted: boolean;
  /** Stereo pan follows longitude when points carry lon. */
  spatialPan: boolean;
  /** Instrument selected in the Listen sound-profile panel. */
  instrument: InstrumentId;
  /** Sound profile (synthesis recipe) of the selected instrument. */
  instrumentProfileId: string;
  /** Route dataset frames through the instrument engine instead of the plain synth. */
  useInstrumentVoice: boolean;
}

export interface Experience {
  id: string;
  name: string;
  datasetId: string;
  mapping: MappingConfig;
  timeRange: [number, number] | null;
  createdAt: string;
  lastPlayedAt: string;
}

export type IntroFrequency = 'once' | 'every';

export interface AppSettings {
  volume: number;
  speed: number;
  profileId: SoundProfileId;
  highContrast: boolean;
  reduceMotion: boolean;
  textScale: number; // 0.875 | 1 | 1.125 | 1.25
  disableNonessentialSound: boolean;
  /** Cinematic startup intro on/off. */
  introEnabled: boolean;
  /** First launch only, or the full intro on every launch. */
  introFrequency: IntroFrequency;
}

export const PROFILES: SoundProfile[] = [
  { id: 'musical', name: 'Musical', blurb: 'Values snap to a pentatonic scale — melodic and easy to follow.', minFreq: 220, maxFreq: 880, wave: 'triangle' },
  { id: 'ambient', name: 'Ambient', blurb: 'Soft evolving pads with slow attack. Calm, continuous texture.', minFreq: 110, maxFreq: 660, wave: 'sine' },
  { id: 'minimal', name: 'Minimal', blurb: 'Short sine blips per frame. Clearest cause-and-effect listening.', minFreq: 330, maxFreq: 990, wave: 'sine' },
  { id: 'scientific', name: 'Scientific', blurb: 'Unquantized linear pitch + short data ticks. Most faithful to raw values.', minFreq: 200, maxFreq: 1200, wave: 'square' },
];

export const CATEGORIES = [
  'Global temperature',
  'Weather and precipitation',
  'Ocean and sea surface',
  'Sea-level change',
  'Ice and snow',
  'Vegetation and forests',
  'Wildfires',
  'Air quality and atmosphere',
] as const;
