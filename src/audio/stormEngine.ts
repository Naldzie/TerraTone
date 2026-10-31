/* Procedural tornado soundscape — 100% locally synthesized Web Audio.
 *
 * This is NOT a recording of a real tornado. Every layer is generated from
 * filtered noise / oscillators with slow modulation:
 *  - deep rumble: brown noise → lowpass (depth control) + sine sub-bass
 *    with slow breathing + gentle saturation for body
 *  - wind bed: white noise → wandering bandpass
 *  - whistle/howl: narrow bandpass noise with slow pitch wander (detail control)
 *  - gusts: LFO + scheduled swells at the simulated gust rate
 *  - thunder: two-stage crack + rolling tail (no sharp transients)
 *  - debris: close-range resonant clatter pops near the funnel
 *
 * Safety: compressor + hard master cap (0.5), smoothed transitions
 * (setTargetAtTime everywhere), thunder peaks limited, mute + volume.
 */
import { clamp } from '../lib/dataUtils';
import { distanceDetail, distanceVolume, gustsPerSecond, stormLevel } from '../sim/stormTypes';
import type { StormParams } from '../sim/stormTypes';
import { attachSubBass, softClipCurve, thunderStrike, TickSynth } from './realism';
import type { SubBassNodes } from './realism';

export interface StormLayerGains {
  rumble: number; wind: number; whistle: number; gusts: number; thunder: number; debris: number;
}

export const DEFAULT_LAYERS: StormLayerGains = { rumble: 0.8, wind: 0.7, whistle: 0.5, gusts: 0.6, thunder: 0.5, debris: 0.4 };

function makeNoiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

export class StormAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private spatial: PannerNode | StereoPannerNode | null = null;
  private layers: Record<'rumble' | 'wind' | 'whistle' | 'debris', { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode }> | null = null;
  private gustLfo: OscillatorNode | null = null;
  private gustLfoGain: GainNode | null = null;
  private whistleLfo: OscillatorNode | null = null;
  private thunderTimer: number | null = null;
  private gustTimer: number | null = null;
  private debrisTimer: number | null = null;
  private sub: SubBassNodes | null = null;
  private ticks: TickSynth | null = null;
  private whiteBuf: AudioBuffer | null = null;
  private brownBuf: AudioBuffer | null = null;
  private started = false;
  private lastParams: { p: StormParams; master: number; layers: StormLayerGains } | null = null;

  get analyserNode(): AnalyserNode | null { return this.analyser; }
  get isStarted(): boolean { return this.started; }

  /** Call from a user gesture. Builds the whole graph once. */
  start(): AudioContext {
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

    // Spatial node: PannerNode when available, StereoPanner fallback.
    try {
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'exponential';
      pan.refDistance = 40; pan.rolloffFactor = 1.1;
      this.spatial = pan;
    } catch {
      this.spatial = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    }

    // master → comp → analyser → destination
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    const white = makeNoiseBuffer(ctx, 3, false);
    const brown = makeNoiseBuffer(ctx, 4, true);
    this.whiteBuf = white;
    this.brownBuf = brown;

    const mkLayer = (noise: AudioBuffer, type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise; src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const filter = ctx.createBiquadFilter();
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter); filter.connect(gain);
      if (this.spatial) gain.connect(this.spatial);
      else gain.connect(this.master!);
      src.start();
      return { src, filter, gain };
    };

    const rumble = mkLayer(brown, 'lowpass', 90, 0.6);
    const wind = mkLayer(white, 'bandpass', 500, 0.5);
    const whistle = mkLayer(white, 'bandpass', 1800, 9);
    const debris = mkLayer(white, 'highpass', 3800, 0.7);

    if (this.spatial) this.spatial.connect(this.master);

    // Sub-bass weight under the rumble + saturation glue on the rumble bus.
    this.sub = attachSubBass(ctx, this.master, 36);
    try {
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClipCurve();
      shaper.oversample = '2x';
      const dest = this.spatial ?? this.master;
      rumble.gain.disconnect();
      rumble.gain.connect(shaper);
      shaper.connect(dest);
    } catch { /* saturation is garnish — the dry path already plays */ }
    this.ticks = new TickSynth(ctx, this.spatial ?? this.master, white);

    // Gust LFO breathing on the wind gain.
    this.gustLfo = ctx.createOscillator();
    this.gustLfo.type = 'sine';
    this.gustLfo.frequency.value = 0.13;
    this.gustLfoGain = ctx.createGain();
    this.gustLfoGain.gain.value = 0.02;
    this.gustLfo.connect(this.gustLfoGain);
    this.gustLfoGain.connect(wind.gain.gain);
    this.gustLfo.start();

    // Slow whistle wander.
    this.whistleLfo = ctx.createOscillator();
    this.whistleLfo.type = 'sine';
    this.whistleLfo.frequency.value = 0.07;
    const wDepth = ctx.createGain();
    wDepth.gain.value = 500;
    this.whistleLfo.connect(wDepth);
    wDepth.connect(whistle.filter.frequency);
    this.whistleLfo.start();

    this.layers = { rumble, wind, whistle, debris };
    this.started = true;
    this.scheduleGusts();
    this.scheduleThunder();
    this.scheduleDebris();
    if (this.lastParams) this.applyParams(this.lastParams.p, this.lastParams.master, this.lastParams.layers, true);
    return ctx;
  }

  /** Smoothly drive every layer from sim params. Call ~10x/sec or on change. */
  applyParams(p: StormParams, masterVolume: number, layers: StormLayerGains, immediate = false): void {
    this.lastParams = { p, master: masterVolume, layers };
    if (!this.ctx || !this.master || !this.layers) return;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.01 : 0.4;
    const set = (param: AudioParam, v: number) => param.setTargetAtTime(Math.max(0, v), t, tc);

    const dVol = distanceVolume(p.distance);
    const detail = distanceDetail(p.distance);
    const lvl = stormLevel(p, 1); // artistic level; master applied below

    // Master: artistic level × user volume, hard-capped for safety.
    set(this.master.gain, Math.min(0.5, lvl * clamp(masterVolume, 0, 1) * 0.9));

    // Rumble grows with depth + intensity + closeness.
    set(this.layers.rumble.gain.gain, 0.5 * layers.rumble * (0.25 + 0.75 * p.rumbleDepth) * (0.3 + 0.7 * p.intensity) * (0.35 + 0.65 * dVol));
    set(this.layers.rumble.filter.frequency, 55 + 90 * p.rumbleDepth + 40 * p.intensity);
    // Sub-bass weight tracks the same rumble energy, an octave below hearing's edge.
    if (this.sub) {
      this.sub.gain.gain.setTargetAtTime(
        0.3 * layers.rumble * (0.2 + 0.8 * p.rumbleDepth) * (0.3 + 0.7 * p.intensity) * (0.4 + 0.6 * dVol), t, tc);
      this.sub.osc.frequency.setTargetAtTime(32 + p.rumbleDepth * 12, t, tc);
    }
    // Wind bed follows wind volume + gustiness.
    set(this.layers.wind.gain.gain, 0.34 * layers.wind * p.windVolume * (0.4 + 0.6 * dVol) * (0.5 + 0.5 * p.intensity));
    set(this.layers.wind.filter.frequency, 320 + 700 * p.intensity + 250 * dVol);
    if (this.gustLfo && this.gustLfoGain) {
      this.gustLfo.frequency.setTargetAtTime(0.08 + gustsPerSecond(p) * 0.55, t, tc);
      this.gustLfoGain.gain.setTargetAtTime(0.015 + 0.06 * layers.gusts * p.intensity, t, tc);
    }
    // Whistle/detail fades fast with distance (only near the funnel).
    set(this.layers.whistle.gain.gain, 0.16 * layers.whistle * detail * (0.3 + 0.7 * p.intensity));
    // Debris: faint airy bed + close-range resonant clatter pops.
    set(this.layers.debris.gain.gain, detail > 0.25 ? 0.02 * layers.debris * detail * p.intensity : 0);
  }

  /** Place the tornado in space: bearing degrees + distance meters. */
  setBearing(bearingDeg: number, distanceM: number, spatialOn: boolean): void {
    if (!this.ctx || !this.spatial) return;
    const t = this.ctx.currentTime;
    const rad = (bearingDeg * Math.PI) / 180;
    const d = Math.max(8, Math.min(400, distanceM));
    if (this.spatial instanceof PannerNode) {
      const x = Math.sin(rad) * d;
      const z = -Math.cos(rad) * d;
      this.spatial.positionX?.setTargetAtTime(spatialOn ? x : 0, t, 0.3);
      this.spatial.positionY?.setTargetAtTime(0, t, 0.3);
      this.spatial.positionZ?.setTargetAtTime(spatialOn ? z : -60, t, 0.3);
    } else {
      const pan = this.spatial as StereoPannerNode;
      pan.pan.setTargetAtTime(spatialOn ? clamp(Math.sin(rad), -1, 1) * 0.8 : 0, t, 0.3);
    }
  }

  /** Current output level 0..1 (for HUD meter), from the analyser. */
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

  mute(muted: boolean): void {
    if (!this.ctx || !this.master || !this.lastParams) return;
    const t = this.ctx.currentTime;
    const lvl = muted ? 0 : Math.min(0.5, stormLevel(this.lastParams.p, 1) * this.lastParams.master * 0.9);
    this.master.gain.setTargetAtTime(lvl, t, 0.08);
  }

  /** Pause: suspend context + stop schedulers (no background processing). */
  suspend(): void {
    if (this.thunderTimer !== null) { window.clearTimeout(this.thunderTimer); this.thunderTimer = null; }
    if (this.gustTimer !== null) { window.clearTimeout(this.gustTimer); this.gustTimer = null; }
    if (this.debrisTimer !== null) { window.clearTimeout(this.debrisTimer); this.debrisTimer = null; }
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.started) { this.scheduleGusts(); this.scheduleThunder(); this.scheduleDebris(); }
  }

  private scheduleGusts(): void {
    if (!this.ctx || !this.layers) return;
    if (this.gustTimer !== null) window.clearTimeout(this.gustTimer);
    const layers = this.layers;
    const swell = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const g = layers.wind.gain.gain;
      const base = Math.max(0.0001, g.value);
      const peak = Math.min(0.5, base * 1.6 + 0.02);
      try {
        g.cancelScheduledValues(t);
        g.setValueAtTime(base, t);
        g.linearRampToValueAtTime(peak, t + 0.9);
        g.linearRampToValueAtTime(base, t + 2.4);
      } catch { /* context closing */ }
    };
    const tick = () => {
      swell();
      const gustRate = Math.max(2, this.lastParams?.p.gustRate ?? 8);
      this.gustTimer = window.setTimeout(tick, (clamp(60 / gustRate, 2.5, 30) * 1000));
    };
    const gustRate = Math.max(2, this.lastParams?.p.gustRate ?? 8);
    this.gustTimer = window.setTimeout(tick, clamp(60 / gustRate, 2.5, 30) * 1000);
  }

  /** Close-range debris clatter: resonant pops, denser near the funnel. */
  private scheduleDebris(): void {
    if (!this.ctx || !this.layers) return;
    if (this.debrisTimer !== null) window.clearTimeout(this.debrisTimer);
    const tick = () => {
      if (this.ctx && this.ctx.state === 'running' && this.ticks && this.lastParams) {
        const p = this.lastParams.p;
        const d = distanceDetail(p.distance);
        if (d > 0.25) {
          this.ticks.trigger('pop', d * p.intensity * (this.lastParams.layers.debris ?? 0.5), 1200, 4500);
        }
      }
      const p = this.lastParams?.p;
      const d = p ? distanceDetail(p.distance) : 0;
      const rate = d > 0.25 ? 1 + d * (p?.intensity ?? 0) * 10 : 0.5;
      this.debrisTimer = window.setTimeout(tick, 1000 / Math.max(0.5, rate));
    };
    this.debrisTimer = window.setTimeout(tick, 600);
  }

  private scheduleThunder(): void {
    if (!this.ctx || !this.layers) return;
    if (this.thunderTimer !== null) window.clearTimeout(this.thunderTimer);
    const boom = () => {
      if (!this.ctx || !this.master || !this.layers || !this.brownBuf || !this.whiteBuf) return;
      if (this.ctx.state !== 'running') return;
      const p = this.lastParams?.p;
      thunderStrike(this.ctx, this.master, this.brownBuf, this.whiteBuf,
        this.lastParams ? 0.2 + 0.8 * p!.intensity : 0.3);
    };
    const next = () => {
      boom();
      const intensity = this.lastParams?.p.intensity ?? 0.4;
      const delay = 30000 - intensity * 20000 + Math.random() * 12000; // 10–42s
      this.thunderTimer = window.setTimeout(next, Math.max(9000, delay));
    };
    this.thunderTimer = window.setTimeout(next, 9000 + Math.random() * 9000);
  }

  dispose(): void {
    if (this.thunderTimer !== null) window.clearTimeout(this.thunderTimer);
    if (this.gustTimer !== null) window.clearTimeout(this.gustTimer);
    if (this.debrisTimer !== null) window.clearTimeout(this.debrisTimer);
    this.thunderTimer = this.gustTimer = this.debrisTimer = null;
    try { this.gustLfo?.stop(); this.whistleLfo?.stop(); } catch { /* noop */ }
    try { this.sub?.osc.stop(); this.sub?.lfo.stop(); } catch { /* noop */ }
    this.sub = null;
    this.ticks = null;
    if (this.layers) {
      for (const k of Object.keys(this.layers) as (keyof NonNullable<StormAudioEngine['layers']>)[]) {
        try { this.layers[k].src.stop(); this.layers[k].src.disconnect(); } catch { /* noop */ }
      }
    }
    this.layers = null;
    this.started = false;
    if (this.ctx) { void this.ctx.close().catch(() => undefined); this.ctx = null; this.master = null; }
  }
}

export const stormEngine = new StormAudioEngine();
