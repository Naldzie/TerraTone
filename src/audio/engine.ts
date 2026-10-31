/* TerraTone sonification engine — Web Audio API, deterministic mappings.
 *
 * Mapping contract (documented in UI + README):
 *  - value → pitch: log interpolation across profile [minFreq, maxFreq];
 *    Musical profile quantizes to pentatonic; Scientific does not.
 *  - |value| magnitude → loudness within a safe band (never above 0.5 gain,
 *    with a soft limiter via DynamicsCompressor).
 *  - precipitation-style density: frame norm controls extra rhythm ticks.
 *  - longitude → stereo pan (optional toggle).
 *  - time → sequence: one scheduled note per frame, so scrubbing the
 *    timeline replays exactly the same sound (deterministic).
 *
 * Safety: master gain capped, compressor on master bus, mute + volume,
 * short envelopes (no endless drones), stop() releases every node.
 */
import { normToFreq, quantizePentatonic, lonToPan, normalizeValue, clamp } from '../lib/dataUtils';
import type { DataPoint, FrameImage, MappingConfig, SoundProfileId } from '../types';
import { PROFILES } from '../types';

export interface FrameSound {
  freq: number;
  gain: number;
  pan: number;
  ticks: number;
  silent: boolean;
  /** Image-derived modifiers (undefined when no visual frame is sonified). */
  timbre?: 'bright' | 'muted' | 'harsh';
  /** Image-derived note density multiplier (1 = baseline). */
  density?: number;
}

interface ImageMeta {
  /** 0 = dark (night/ocean), 1 = bright (clouds/ice/snow). */
  brightness: number;
  /** 0 = cool (blue/green), 1 = warm (red/orange/yellow). */
  warmth: number;
}

function sampleImageMeta(canvas: HTMLCanvasElement | null, width: number, height: number): ImageMeta | null {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const iw = Math.max(1, Math.floor(width * dpr));
  const ih = Math.max(1, Math.floor(height * dpr));
  let r = 0, g = 0, b = 0, n = 0;
  // Sample a grid of pixels (downsampled for speed).
  const step = Math.max(1, Math.floor(Math.min(iw, ih) / 40));
  for (let y = 0; y < ih; y += step) {
    for (let x = 0; x < iw; x += step) {
      const px = ctx.getImageData(x, y, 1, 1).data;
      r += px[0]; g += px[1]; b += px[2]; n++;
    }
  }
  if (n === 0) return null;
  const avg = { r: r / n, g: g / n, b: b / n };
  const brightness = (0.299 * avg.r + 0.587 * avg.g + 0.114 * avg.b) / 255;
  const warmth = Math.max(0, Math.min(1, (avg.r - avg.b) / 255 + 0.5));
  return { brightness, warmth };
}

/** Extract a coarse brightness/warmth signature from a rendered visual-frame canvas. */
export function imageSignature(canvas: HTMLCanvasElement | null, width: number, height: number): ImageMeta | null {
  return sampleImageMeta(canvas, width, height);
}

/** Compute sound from data value, optionally shifted by image-derived timbre/density. */
export function computeFrameSound(
  point: DataPoint,
  range: [number, number],
  profileId: SoundProfileId,
  volume: number,
  spatialPan: boolean,
  image?: ImageMeta,
): FrameSound {
  const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0];
  const norm = normalizeValue(point.value, range);
  if (norm === null) return { freq: 0, gain: 0, pan: 0, ticks: 0, silent: true };
  let freq = normToFreq(norm, profile.minFreq, profile.maxFreq);
  // Image timbre shifts pitch: bright frames higher, warm frames slightly lower.
  if (image) {
    freq *= 1 + (image.brightness - 0.5) * 0.35;
    freq *= 1 - (image.warmth - 0.5) * 0.15;
  }
  if (profileId === 'musical') freq = quantizePentatonic(freq);
  // Loudness band 0.12–0.4 scaled by user volume; never 0 for valid data (audible = present).
  const gain = clamp(0.12 + norm * 0.28, 0, 0.5) * clamp(volume, 0, 1);
  const pan = spatialPan ? lonToPan(point.lon) : 0;
  const ticks = Math.round(norm * 3); // 0–3 extra rhythm ticks (precipitation-style density)
  let density = 1;
  let timbre: 'bright' | 'muted' | 'harsh' | undefined;
  if (image) {
    density = 1 + image.brightness * 1.5; // bright frames sound busier
    if (image.brightness > 0.65) timbre = 'bright';
    else if (image.brightness < 0.35) timbre = 'muted';
    else if (image.warmth > 0.6) timbre = 'harsh';
  }
  return { freq, gain, pan, ticks, silent: false, timbre, density };
}

type ActiveNodes = { osc: OscillatorNode; gain: GainNode; stopAt: number };

/** One scheduled frame's note, broadcast to live visualizers (3D music view). */
export interface NoteEvent {
  freq: number;
  gain: number;
  pan: number;
  ticks: number;
  silent: boolean;
}

export class SonificationEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private active: ActiveNodes[] = [];
  private recordedDest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private noteSubs = new Set<(n: NoteEvent) => void>();

  /** Must be called from a user gesture at least once (browser autoplay policy). */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 8;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.recordedDest = this.ctx.createMediaStreamDestination();
      comp.connect(this.recordedDest);
      // Post-master analysis tap for live visualizations (no output routing).
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      comp.connect(this.analyser);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Live master-bus analyser (null until audio context exists). */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** Subscribe to per-frame note events (3D music view). Returns unsubscribe. */
  onNote(fn: (n: NoteEvent) => void): () => void {
    this.noteSubs.add(fn);
    return () => { this.noteSubs.delete(fn); };
  }

  /** Broadcast a frame note built elsewhere (the instrument voice uses this). */
  emitNote(n: NoteEvent): void {
    for (const fn of this.noteSubs) {
      try { fn(n); } catch { /* listener error must never break audio */ }
    }
  }

  get recordingMime(): string | null {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
  }

  startRecording(): void {
    if (!this.recordedDest || !this.recordingMime) throw new Error('Recording is not supported in this browser.');
    this.chunks = [];
    this.recorder = new MediaRecorder(this.recordedDest.stream, { mimeType: this.recordingMime });
    this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start();
  }

  async stopRecording(): Promise<Blob> {
    const rec = this.recorder;
    if (!rec) throw new Error('No recording in progress.');
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }));
    });
    rec.stop();
    this.recorder = null;
    return done;
  }

  /** Play a short preview tone for the middle of the dataset range. */
  preview(profileId: SoundProfileId, volume: number): void {
    const ctx = this.ensureContext();
    if (!this.master) return;
    const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0];
    const freq = normToFreq(0.5, profile.minFreq, profile.maxFreq);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = profile.wave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.3 * clamp(volume, 0, 1)), t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.9);
  }

  /** Schedule one frame's sound at an absolute context time. */
  playFrame(sound: FrameSound, profileId: SoundProfileId, when: number, frameSeconds: number): void {
    const ctx = this.ensureContext();
    for (const fn of this.noteSubs) {
      try { fn({ freq: sound.freq, gain: sound.gain, pan: sound.pan, ticks: sound.ticks, silent: sound.silent }); } catch { /* listener error must never break audio */ }
    }
    if (!this.master || sound.silent) return;
    const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0];
    const dur = profileId === 'ambient'
      ? Math.min(1.6, frameSeconds * 1.8)
      : profileId === 'scientific' ? 0.12 : Math.min(0.6, frameSeconds * 0.9);
    const attack = profileId === 'ambient' ? 0.25 : 0.02;

    const mk = (freq: number, at: number, peak: number, d: number) => {
      if (!ctx || !this.master) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.type = profileId === 'scientific' ? 'sine' : profile.wave;
      osc.frequency.value = clamp(freq, 30, 4000);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      osc.connect(g);
      if (panner) { panner.pan.value = clamp(sound.pan, -1, 1); g.connect(panner); panner.connect(this.master); }
      else g.connect(this.master);
      osc.start(at); osc.stop(at + d + 0.05);
      this.active.push({ osc, gain: g, stopAt: at + d + 0.05 });
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* noop */ } };
    };

    mk(sound.freq, when, sound.gain, dur);
    // Density ticks: short high blips for precip-style data.
    for (let k = 0; k < sound.ticks; k++) {
      mk(sound.freq * 2, when + ((k + 1) * dur) / (sound.ticks + 1), sound.gain * 0.35, 0.06);
    }
    // Scientific profile adds a soft reference tick so frames are countable.
    if (profileId === 'scientific') mk(1200, when, 0.05, 0.03);
  }

  /** Apply master volume/mute. */
  setMaster(cfg: Pick<MappingConfig, 'masterVolume' | 'muted'>): void {
    if (!this.ctx || !this.master) return;
    const v = cfg.muted ? 0 : clamp(cfg.masterVolume, 0, 1) * 0.9;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  /** Stop all sound immediately and release nodes. */
  stopAll(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const n of this.active) {
      try { n.gain.gain.cancelScheduledValues(now); n.gain.gain.setTargetAtTime(0.0001, now, 0.015); n.osc.stop(now + 0.1); } catch { /* already stopped */ }
    }
    this.active = [];
  }

  dispose(): void {
    this.stopAll();
    this.noteSubs.clear();
    this.analyser = null;
    if (this.ctx) { void this.ctx.close().catch(() => undefined); this.ctx = null; this.master = null; }
  }
}

export const engine = new SonificationEngine();
