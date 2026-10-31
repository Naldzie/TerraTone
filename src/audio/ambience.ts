/* AmbienceEngine — generic procedural Web Audio environment generator.
 *
 * Powers the Hurricane / Earthquake / Volcano / Deep Ocean / Wildfire sims.
 * All sound is synthesized locally from noise buffers + one sine "tone" layer;
 * nothing here is a recording. Each simulator drives the engine through small,
 * smoothed layer gains computed by PURE mapping functions (tested in
 * src/tests/hazards.test.ts), so identical params always sound identical.
 *
 * Safety: DynamicsCompressor + hard 0.5 master cap, setTargetAtTime
 * everywhere (no clicks), soft booms only, master mute/volume.
 */
import { clamp } from '../lib/dataUtils';
import { attachSubBass, thunderStrike, TickSynth } from './realism';
import type { SubBassNodes, TickMode } from './realism';

export interface AmbienceLayerDef {
  key: string;
  noise: 'white' | 'brown';
  filter: BiquadFilterType;
  freq: number;
  q: number;
}

interface LayerNodes { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode }

function makeNoise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return buf;
}

export class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private spatial: PannerNode | StereoPannerNode | null = null;
  private layers = new Map<string, LayerNodes>();
  private tone: { osc: OscillatorNode; gain: GainNode } | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private boomTimer: number | null = null;
  private tickTimer: number | null = null;
  private boomLevel = 0;
  private tickRate = 0;
  private tickGain = 0;
  private tickHp = 3000;
  private tickMode: TickMode = 'hiss';
  private tickBand: [number, number] = [1500, 5000];
  private sub: SubBassNodes | null = null;
  private tickSynth: TickSynth | null = null;
  private started = false;
  private lastMaster = 0.7;
  private lastMuted = false;

  get analyserNode(): AnalyserNode | null { return this.analyser; }

  start(defs: AmbienceLayerDef[], withTone: boolean): AudioContext {
    if (this.ctx && this.started) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 20; comp.ratio.value = 12;
    comp.attack.value = 0.01; comp.release.value = 0.4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    try {
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'exponential';
      pan.refDistance = 40; pan.rolloffFactor = 1.1;
      this.spatial = pan;
    } catch {
      this.spatial = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    }
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    if (this.spatial) this.spatial.connect(this.master);

    this.white = makeNoise(ctx, 3, false);
    this.brown = makeNoise(ctx, 4, true);
    for (const def of defs) {
      const src = ctx.createBufferSource();
      src.buffer = def.noise === 'brown' ? this.brown : this.white;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const filter = ctx.createBiquadFilter();
      filter.type = def.filter;
      filter.frequency.value = def.freq;
      filter.Q.value = def.q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter); filter.connect(gain);
      if (this.spatial) gain.connect(this.spatial);
      else gain.connect(this.master);
      src.start();
      this.layers.set(def.key, { src, filter, gain });
    }
    if (withTone) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 55;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      if (this.spatial) gain.connect(this.spatial);
      else gain.connect(this.master);
      osc.start();
      this.tone = { osc, gain };
    }
    this.started = true;
    this.sub = attachSubBass(ctx, this.master, 36);
    this.tickSynth = new TickSynth(ctx, this.spatial ?? this.master, this.white);
    this.scheduleBooms();
    this.scheduleTicks();
    this.applyMaster();
    return ctx;
  }

  /** Artistic layer level 0..1 (engine scales to safe gain). */
  setLayer(key: string, level: number, freq?: number): void {
    if (!this.ctx) return;
    const l = this.layers.get(key);
    if (!l) return;
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.4, t, 0.4);
    if (freq !== undefined) l.filter.frequency.setTargetAtTime(Math.max(30, Math.min(8000, freq)), t, 0.4);
  }

  /** Slow sine layer (whale calls, howling whistle, deep hum). */
  setTone(level: number, freq: number): void {
    if (!this.ctx || !this.tone) return;
    const t = this.ctx.currentTime;
    this.tone.gain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.22, t, 0.6);
    this.tone.osc.frequency.setTargetAtTime(Math.max(25, Math.min(2500, freq)), t, 0.8);
  }

  /** Soft distant booms (thunder, eruptions, quakes). intensity 0..1. */
  setBoom(intensity: number): void { this.boomLevel = clamp(intensity, 0, 1); }

  /** Sparse filtered clicks (bubbles, crackle, debris, creaks). */
  setTicks(ratePerSec: number, level: number, hpFreq = 3000): void {
    this.tickRate = Math.max(0, Math.min(30, ratePerSec));
    this.tickGain = clamp(level, 0, 1);
    this.tickHp = hpFreq;
  }

  /** Micro-event character: hiss (rain/spray), pop (crackle/clatter), bloop (bubbles). */
  setTickMode(mode: TickMode, bandLo = 1500, bandHi = 5000): void {
    this.tickMode = mode;
    this.tickBand = [Math.max(200, bandLo), Math.max(bandLo + 100, bandHi)];
  }

  /** Sub-bass weight (0..1 artistic) with center frequency. */
  setSub(level: number, freq = 38): void {
    if (!this.ctx || !this.sub) return;
    const t = this.ctx.currentTime;
    this.sub.gain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.3, t, 0.5);
    this.sub.osc.frequency.setTargetAtTime(Math.max(25, Math.min(70, freq)), t, 0.5);
  }

  setMaster(volume: number, muted: boolean): void {
    this.lastMaster = clamp(volume, 0, 1);
    this.lastMuted = muted;
    this.applyMaster();
  }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    const v = this.lastMuted ? 0 : Math.min(0.5, this.lastMaster * 0.9);
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }

  setBearing(bearingDeg: number, distanceM: number, spatialOn: boolean): void {
    if (!this.ctx || !this.spatial) return;
    const t = this.ctx.currentTime;
    const rad = (bearingDeg * Math.PI) / 180;
    const d = Math.max(8, Math.min(400, distanceM));
    if (this.spatial instanceof PannerNode) {
      this.spatial.positionX?.setTargetAtTime(spatialOn ? Math.sin(rad) * d : 0, t, 0.3);
      this.spatial.positionY?.setTargetAtTime(0, t, 0.3);
      this.spatial.positionZ?.setTargetAtTime(spatialOn ? -Math.cos(rad) * d : -60, t, 0.3);
    } else {
      (this.spatial as StereoPannerNode).pan.setTargetAtTime(spatialOn ? clamp(Math.sin(rad), -1, 1) * 0.8 : 0, t, 0.3);
    }
  }

  outputLevel(): number {
    if (!this.analyser) return 0;
    const arr = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(arr);
    let peak = 0;
    for (let i = 0; i < arr.length; i += 4) {
      const v = Math.abs(arr[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return clamp(peak, 0, 1);
  }

  suspend(): void {
    if (this.boomTimer !== null) { window.clearTimeout(this.boomTimer); this.boomTimer = null; }
    if (this.tickTimer !== null) { window.clearTimeout(this.tickTimer); this.tickTimer = null; }
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.started) { this.scheduleBooms(); this.scheduleTicks(); }
  }

  private boom(): void {
    if (!this.ctx || !this.master || !this.brown || !this.white || this.ctx.state !== 'running') return;
    if (this.boomLevel <= 0.01) return;
    thunderStrike(this.ctx, this.master, this.brown, this.white, this.boomLevel);
  }

  private scheduleBooms(): void {
    if (this.boomTimer !== null) window.clearTimeout(this.boomTimer);
    const next = () => {
      this.boom();
      const delay = 34000 - this.boomLevel * 24000 + Math.random() * 12000;
      this.boomTimer = window.setTimeout(next, Math.max(9000, delay));
    };
    this.boomTimer = window.setTimeout(next, 8000 + Math.random() * 8000);
  }

  private tick(): void {
    if (!this.ctx || !this.tickSynth || this.ctx.state !== 'running') return;
    if (this.tickRate <= 0 || this.tickGain <= 0.01) return;
    // Hiss mode keeps the caller's highpass frequency; pop/bloop use the band.
    const bandLo = this.tickMode === 'hiss' ? this.tickHp : this.tickBand[0];
    this.tickSynth.trigger(this.tickMode, this.tickGain, bandLo, this.tickBand[1]);
  }

  private scheduleTicks(): void {
    if (this.tickTimer !== null) window.clearTimeout(this.tickTimer);
    const next = () => {
      this.tick();
      const interval = this.tickRate > 0 ? 1000 / this.tickRate : 500;
      this.tickTimer = window.setTimeout(next, Math.max(40, interval * (0.6 + Math.random() * 0.8)));
    };
    this.tickTimer = window.setTimeout(next, 400);
  }

  dispose(): void {
    if (this.boomTimer !== null) window.clearTimeout(this.boomTimer);
    if (this.tickTimer !== null) window.clearTimeout(this.tickTimer);
    this.boomTimer = this.tickTimer = null;
    try { this.tone?.osc.stop(); } catch { /* noop */ }
    try { this.sub?.osc.stop(); this.sub?.lfo.stop(); } catch { /* noop */ }
    this.sub = null;
    this.tickSynth = null;
    for (const l of this.layers.values()) {
      try { l.src.stop(); l.src.disconnect(); } catch { /* noop */ }
    }
    this.layers.clear();
    this.tone = null;
    this.started = false;
    if (this.ctx) { void this.ctx.close().catch(() => undefined); this.ctx = null; this.master = null; }
  }
}
