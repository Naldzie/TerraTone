/* Live Web Audio engine for the Listen tab's instrument sound profiles.
 *
 * Every voice is synthesized in the browser from the recipes in
 * instrumentProfiles.ts — oscillators, additive partials, FM, filters, noise,
 * envelopes and effects — so the feature ships without sample files and works
 * fully offline. The same engine voices dataset frames when the "route the
 * player through this instrument" option is switched on.
 */
import { clamp } from '../lib/dataUtils';
import {
  DEFAULT_INSTRUMENT_ID,
  DEFAULT_PROFILE_ID,
  getInstrument,
  getProfile,
  type DemoPattern,
  type DrumKitPlan,
  type DrumVoice,
  type EffectsPlan,
  type InstrumentId,
  type InstrumentSoundProfile,
  type ProfileSpec,
} from './instrumentProfiles';
import { softClipCurve } from './realism';

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Minor pentatonic pitch classes — mapped dataset notes snap to these. */
const PENTATONIC = [0, 3, 5, 7, 10];

/** Nearest minor-pentatonic MIDI note. Pure (tested). */
export function snapPentatonic(midi: number): number {
  const pitch = Math.round(midi);
  const base = Math.floor(pitch / 12) * 12;
  let best = base + PENTATONIC[0];
  let bestDist = Infinity;
  for (const step of PENTATONIC) {
    for (const oct of [-12, 0, 12]) {
      const candidate = base + oct + step;
      const dist = Math.abs(candidate - pitch);
      if (dist < bestDist) { bestDist = dist; best = candidate; }
    }
  }
  return best;
}

/** Map a dataset value onto an instrument's playable range. Pure (tested).
 * Returns null for missing data — a silent frame, exactly as the mapping says. */
export function mapValueToMidi(
  value: number | null,
  range: [number, number],
  frameRange: [number, number],
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const [lo, hi] = range;
  const t = hi === lo ? 0.5 : clamp((value - lo) / (hi - lo), 0, 1);
  return snapPentatonic(frameRange[0] + t * (frameRange[1] - frameRange[0]));
}

/** Loudness for a mapped value — loudness follows the data, never the danger. */
export function valueVelocity(value: number | null, range: [number, number]): number {
  if (value === null || !Number.isFinite(value)) return 0;
  const [lo, hi] = range;
  const t = hi === lo ? 0.5 : clamp((value - lo) / (hi - lo), 0, 1);
  return 0.4 + t * 0.55;
}

/** Pitch band → kit voice, so drum kits can voice dataset frames. */
export function drumVoiceForMidi(midi: number): DrumVoice {
  if (midi < 34) return 'kick';
  if (midi < 44) return 'tom';
  if (midi < 56) return 'snare';
  if (midi < 66) return 'clap';
  if (midi < 78) return 'rim';
  if (midi < 90) return 'hat';
  return 'open-hat';
}

/** One live chain (dataset playback or a preview) with its node bookkeeping. */
interface Performance {
  input: GainNode;
  nodes: Set<AudioNode>;
  sources: Set<AudioScheduledSourceNode>;
}

export class InstrumentEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private impulses = new Map<string, AudioBuffer>();
  private instrument: InstrumentId = DEFAULT_INSTRUMENT_ID;
  private profile: InstrumentSoundProfile = getProfile(getInstrument(DEFAULT_INSTRUMENT_ID), DEFAULT_PROFILE_ID);
  private volume = 0.8;
  private muted = false;
  private performance: Performance | null = null;
  private effectNodes: AudioNode[] = [];
  private sessionSources: AudioScheduledSourceNode[] = [];
  private loop: { pattern: DemoPattern; nextTime: number; timer: number } | null = null;

  constructor(instrument: InstrumentId = DEFAULT_INSTRUMENT_ID, profileId: string = DEFAULT_PROFILE_ID) {
    this.instrument = instrument;
    this.profile = getProfile(getInstrument(instrument), profileId);
  }

  /** True once an AudioContext exists (created lazily on the first gesture). */
  get ready(): boolean { return this.ctx !== null && this.ctx.state !== 'closed'; }

  /** True while the selected profile's demo pattern is looping. */
  get playing(): boolean { return this.loop !== null; }

  get instrumentId(): InstrumentId { return this.instrument; }

  get currentProfile(): InstrumentSoundProfile { return this.profile; }

  /** Create the context and its master bus; call from a user gesture. */
  async start(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* gesture policy */ }
    }
    return true;
  }

  /** Select instrument + profile. The live chain is rebuilt for the new recipe. */
  setProfile(instrument: InstrumentId, profileId: string): void {
    const inst = getInstrument(instrument);
    const next = getProfile(inst, profileId);
    if (inst.id === this.instrument && next.id === this.profile.id) return;
    const wasPlaying = this.loop !== null;
    this.stopAll();
    this.instrument = inst.id;
    this.profile = next;
    if (wasPlaying) this.playLoop();
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1);
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  /** Loop the selected profile's demo pattern until stopAll(). */
  playLoop(): boolean {
    const ctx = this.ensureContext();
    const perf = this.ensureSession();
    if (!ctx || !perf || this.loop) return false;
    const pattern = this.profile.spec.demo ?? getInstrument(this.instrument).demo;
    const beatSec = 60 / clamp(pattern.bpm, 30, 240);
    const timer = window.setInterval(() => this.scheduleAhead(beatSec), 200);
    this.loop = { pattern, nextTime: ctx.currentTime + 0.08, timer };
    this.scheduleAhead(beatSec);
    return true;
  }

  /** Short audition phrase for the selected profile. Returns its duration in
   * milliseconds (0 = audio is unavailable until a gesture unlocks it). */
  previewProfile(): number {
    const ctx = this.ensureContext();
    const perf = this.ensureSession();
    if (!ctx || !perf) return 0;
    const spec = this.profile.spec;
    const start = ctx.currentTime + 0.06;
    if (spec.kit) {
      const kit = spec.kit;
      const beatSec = 0.45;
      const phrase: { voice: DrumVoice; beats: number; velocity: number }[] = [
        { voice: 'kick', beats: 0, velocity: 0.95 },
        { voice: 'hat', beats: 0.5, velocity: 0.5 },
        { voice: 'snare', beats: 1, velocity: 0.9 },
        { voice: 'hat', beats: 1.5, velocity: 0.45 },
        { voice: 'kick', beats: 2, velocity: 0.85 },
        { voice: 'clap', beats: 3, velocity: 0.7 },
        { voice: 'open-hat', beats: 3.5, velocity: 0.55 },
      ];
      for (const hit of phrase) {
        this.scheduleDrum(perf, kit, hit.voice, start + hit.beats * beatSec, hit.velocity);
      }
      return Math.round((3.5 * beatSec + 1) * 1000);
    }
    const audition = getInstrument(this.instrument).audition;
    const notes = audition.length ? audition : [60, 64, 67, 72];
    const step = 0.24;
    notes.forEach((midi, index) => {
      const velocity = index === notes.length - 1 ? 0.85 : 0.68;
      this.scheduleVoice(perf, spec, midi, velocity, start + index * step, step * 1.6, perf.input);
    });
    return Math.round(((notes.length - 1) * step + 1.1) * 1000);
  }

  /** Voice one dataset frame. A null value is a silent frame (missing data). */
  playFrame(midi: number | null, velocity: number, duration: number): void {
    if (midi === null || !Number.isFinite(midi)) return;
    const perf = this.ensureSession();
    if (!perf || !this.ctx) return;
    const spec = this.profile.spec;
    const when = this.ctx.currentTime + 0.02;
    const vel = clamp(velocity, 0.05, 1);
    if (spec.kit) {
      this.scheduleDrum(perf, spec.kit, drumVoiceForMidi(midi), when, vel);
      return;
    }
    this.scheduleVoice(perf, spec, midi, vel, when, Math.max(0.05, duration), perf.input);
  }

  /** Stop everything now — loop, previews and dataset voices — then drop the chain. */
  stopAll(): void {
    const loop = this.loop;
    if (loop) { window.clearInterval(loop.timer); this.loop = null; }
    const ctx = this.ctx;
    const perf = this.performance;
    if (!ctx || !perf) return;
    const now = ctx.currentTime;
    try {
      perf.input.gain.cancelScheduledValues(now);
      perf.input.gain.setValueAtTime(perf.input.gain.value, now);
      perf.input.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    } catch { /* param already idle */ }
    const sources = [...perf.sources, ...this.sessionSources];
    for (const source of sources) {
      try { source.stop(now + 0.06); } catch { /* already stopped */ }
    }
    const nodes = [...perf.nodes, ...this.effectNodes];
    this.performance = null;
    this.effectNodes = [];
    this.sessionSources = [];
    window.setTimeout(() => {
      for (const source of sources) { try { source.disconnect(); } catch { /* noop */ } }
      for (const node of nodes) { try { node.disconnect(); } catch { /* noop */ } }
    }, 160);
  }

  /** Create/resume the context. Safe to call before any gesture exists. */
  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try { void this.ctx.resume(); } catch { /* gesture needed */ }
      }
      return this.ctx;
    }
    try {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0.0001 : this.volume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.ratio.value = 6;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch { return null; }
  }

  private applyVolume(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const target = this.muted ? 0.0001 : this.volume;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
    } catch { master.gain.value = target; }
  }

  /** Open the live chain for a session (idempotent). */
  private ensureSession(): Performance | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return null;
    if (this.performance) return this.performance;
    const input = ctx.createGain();
    input.gain.value = 1;
    this.effectNodes = [input];
    this.sessionSources = [];
    this.buildEffects(input, this.profile.spec.effects);
    const perf: Performance = { input, nodes: new Set(), sources: new Set() };
    this.performance = perf;
    this.startVinyl(perf);
    return perf;
  }

  /** Wire the profile's effect plan between the session input and the master bus. */
  private buildEffects(input: GainNode, effects: EffectsPlan): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    let head: AudioNode = input;
    const drive = effects.drive ?? 0;
    if (drive > 0) {
      head = this.insertWet(head, clamp(drive, 0, 1), (into) => {
        const pre = ctx.createGain();
        pre.gain.value = 1 + drive * 7;
        const shaper = ctx.createWaveShaper();
        shaper.curve = softClipCurve(1024);
        shaper.oversample = '2x';
        const post = ctx.createGain();
        post.gain.value = 1 / (1 + drive * 4);
        into.connect(pre); pre.connect(shaper); shaper.connect(post);
        this.effectNodes.push(pre, shaper, post);
        return post;
      });
    }
    if (effects.chorus) {
      const chorus = effects.chorus;
      head = this.insertWet(head, clamp(chorus.mix, 0, 1), (into) => {
        const delay = ctx.createDelay(0.12);
        delay.delayTime.value = 0.02 + clamp(chorus.depth, 0.0005, 0.04);
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = clamp(chorus.rate, 0.05, 8);
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = clamp(chorus.depth, 0.0002, 0.02);
        into.connect(delay);
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        try { lfo.start(); } catch { /* already running */ }
        this.effectNodes.push(delay, lfoGain);
        this.sessionSources.push(lfo);
        return delay;
      });
    }
    if (effects.delay) {
      const echo = effects.delay;
      head = this.insertWet(head, clamp(echo.mix, 0, 1), (into) => {
        const delay = ctx.createDelay(4);
        delay.delayTime.value = clamp(echo.time, 0.01, 4);
        const feedback = ctx.createGain();
        feedback.gain.value = clamp(echo.feedback, 0, 0.85);
        into.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        this.effectNodes.push(delay, feedback);
        return delay;
      });
    }
    if (effects.reverb) {
      const room = effects.reverb;
      head = this.insertWet(head, clamp(room.mix, 0, 1), (into) => {
        const convolver = ctx.createConvolver();
        convolver.buffer = this.getImpulse(ctx, room.decay);
        into.connect(convolver);
        this.effectNodes.push(convolver);
        return convolver;
      });
    }
    head.connect(master);
  }

  /** Split a stage into dry + wet paths and return the merged output. */
  private insertWet(head: AudioNode, mix: number, build: (into: GainNode) => AudioNode): AudioNode {
    const ctx = this.ctx;
    if (!ctx) return head;
    const dry = ctx.createGain();
    dry.gain.value = clamp(1 - mix, 0, 1);
    const wet = ctx.createGain();
    wet.gain.value = clamp(mix, 0, 1);
    const into = ctx.createGain();
    const out = build(into);
    const merge = ctx.createGain();
    head.connect(dry);
    head.connect(into);
    dry.connect(merge);
    out.connect(wet);
    wet.connect(merge);
    this.effectNodes.push(dry, wet, into, merge);
    return merge;
  }

  /** Tape/vinyl hiss bed for kits that call for it; lives with the session. */
  private startVinyl(perf: Performance): void {
    const ctx = this.ctx;
    const vinyl = this.profile.spec.kit?.vinyl ?? 0;
    if (!ctx || vinyl <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = this.getNoise(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    const gain = ctx.createGain();
    gain.gain.value = clamp(vinyl * 2, 0, 0.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(perf.input);
    try { source.start(); } catch { /* noop */ }
    perf.nodes.add(filter);
    perf.nodes.add(gain);
    perf.sources.add(source);
  }

  /** Queue pattern cycles ~0.5 s ahead so playback never gaps between ticks. */
  private scheduleAhead(beatSec: number): void {
    const loop = this.loop;
    const ctx = this.ctx;
    if (!loop || !ctx) return;
    const cycle = Math.max(0.5, loop.pattern.beats * beatSec);
    while (loop.nextTime - ctx.currentTime < 0.5) {
      this.scheduleCycle(loop.pattern, loop.nextTime, beatSec);
      loop.nextTime += cycle;
    }
  }

  /** Schedule one pass of a demo pattern on the Web Audio clock. */
  private scheduleCycle(pattern: DemoPattern, start: number, beatSec: number): void {
    const perf = this.performance;
    if (!perf) return;
    const spec = this.profile.spec;
    const kit = spec.kit;
    for (const event of pattern.events) {
      let swing = 0;
      if (kit?.swing && Math.abs((event.beats * 2) % 2 - 1) < 0.001) {
        swing = kit.swing * beatSec * 0.5;
      }
      const when = start + event.beats * beatSec + swing;
      const velocity = clamp(event.velocity ?? 0.8, 0.05, 1);
      if (event.drum) {
        if (kit) this.scheduleDrum(perf, kit, event.drum, when, velocity);
        continue;
      }
      if (event.midi === undefined) continue;
      this.scheduleVoice(perf, spec, event.midi, velocity, when, event.duration * beatSec, perf.input);
    }
  }

  private scheduleVoice(
    perf: Performance,
    spec: ProfileSpec,
    midi: number,
    velocity: number,
    when: number,
    duration: number,
    destination: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = Math.max(ctx.currentTime + 0.005, when);
    const vel = clamp(velocity, 0.01, 1);
    const attack = clamp(spec.attack, 0.001, 3);
    const sustain = clamp(spec.sustain, 0, 1);
    const decay = clamp(spec.decay, 0.01, 6);
    const release = clamp(spec.release, 0.01, 6);
    const peak = Math.max(0.0002, spec.gain * vel);
    const peakAt = t0 + attack;
    const decayEnd = peakAt + decay;
    const holdEnd = t0 + Math.max(duration, attack + 0.02);
    const stopAt = Math.max(decayEnd, holdEnd) + release;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const amp = ctx.createGain();
    const chainIn = ctx.createGain();
    nodes.push(amp, chainIn);
    let chain: AudioNode = chainIn;

    if (spec.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = spec.filter.type ?? 'lowpass';
      const base = clamp(spec.filter.frequency, 40, 18000);
      filter.frequency.setValueAtTime(base, t0);
      filter.Q.value = clamp(spec.filter.q ?? 0.7, 0.0001, 24);
      if (spec.filter.envAmount && spec.filter.envAmount > 1) {
        const peakFreq = clamp(base * spec.filter.envAmount, 80, 18000);
        filter.frequency.setValueAtTime(peakFreq, t0 + Math.min(0.02, attack));
        filter.frequency.exponentialRampToValueAtTime(
          base,
          t0 + Math.max(0.05, spec.filter.envDecay ?? 0.25),
        );
      }
      chain.connect(filter);
      chain = filter;
      nodes.push(filter);
    }

    if (spec.body) {
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = clamp(spec.body.frequency, 60, 1200);
      body.Q.value = clamp(spec.body.q ?? 1, 0.0001, 18);
      body.gain.value = clamp(spec.body.gain, 0, 18);
      chain.connect(body);
      chain = body;
      nodes.push(body);
    }

    chain.connect(amp);
    let afterAmp: AudioNode = amp;
    if (spec.tremolo) {
      const trem = ctx.createGain();
      const depth = clamp(spec.tremolo.depth, 0, 0.9);
      trem.gain.value = 1 - depth / 2;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = clamp(spec.tremolo.rate, 0.1, 12);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depth / 2;
      lfo.connect(lfoGain);
      lfoGain.connect(trem.gain);
      lfo.start(t0);
      lfo.stop(stopAt);
      amp.connect(trem);
      afterAmp = trem;
      sources.push(lfo);
      nodes.push(trem, lfoGain);
    }
    afterAmp.connect(destination);

    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(Math.max(0.0002, peak), peakAt);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sustain), decayEnd);
    if (holdEnd > decayEnd) {
      amp.gain.setValueAtTime(Math.max(0.0002, peak * sustain), holdEnd);
    }
    amp.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const carriers: OscillatorNode[] = [];
    const baseFreq = midiToFreq(midi + (spec.octave ?? 0));
    if (spec.partials && spec.partials.length) {
      const osc = ctx.createOscillator();
      const real = new Float32Array(spec.partials.length + 1);
      const imag = new Float32Array(spec.partials.length + 1);
      spec.partials.forEach((ampValue, index) => { imag[index + 1] = ampValue; });
      osc.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
      osc.frequency.value = clamp(baseFreq, 18, 9000);
      const layerGain = ctx.createGain();
      layerGain.gain.value = 1;
      osc.connect(layerGain);
      layerGain.connect(chainIn);
      osc.start(t0);
      osc.stop(stopAt);
      carriers.push(osc);
      sources.push(osc);
      nodes.push(layerGain);
    } else {
      const layers = spec.layers?.length ? spec.layers : [{ type: 'triangle' as OscillatorType, gain: 1 }];
      const total = layers.reduce((sum, layer) => sum + Math.max(0.001, layer.gain ?? 1), 0);
      for (const layer of layers) {
        const osc = ctx.createOscillator();
        osc.type = layer.type;
        osc.frequency.value = clamp(baseFreq * Math.pow(2, layer.octave ?? 0), 18, 9000);
        osc.detune.value = clamp(layer.detune ?? 0, -100, 100);
        const layerGain = ctx.createGain();
        layerGain.gain.value = Math.max(0.001, layer.gain ?? 1) / total;
        osc.connect(layerGain);
        layerGain.connect(chainIn);
        osc.start(t0);
        osc.stop(stopAt);
        carriers.push(osc);
        sources.push(osc);
        nodes.push(layerGain);
      }
    }

    if (spec.fm && carriers.length) {
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = clamp(baseFreq * clamp(spec.fm.ratio, 0.25, 12), 18, 12000);
      const modGain = ctx.createGain();
      const index = Math.max(1, baseFreq * clamp(spec.fm.index, 0, 10));
      modGain.gain.setValueAtTime(index, t0);
      modGain.gain.exponentialRampToValueAtTime(Math.max(0.001, index * 0.015), t0 + Math.max(0.05, spec.fm.decay));
      mod.connect(modGain);
      for (const carrier of carriers) modGain.connect(carrier.frequency);
      mod.start(t0);
      mod.stop(stopAt);
      sources.push(mod);
      nodes.push(modGain);
    }

    if (spec.vibrato && carriers.length) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = clamp(spec.vibrato.rate, 0.1, 12);
      const lfoGain = ctx.createGain();
      const delay = clamp(spec.vibrato.delay ?? 0, 0, 2);
      lfoGain.gain.setValueAtTime(0.0001, t0);
      lfoGain.gain.setValueAtTime(0.0001, t0 + delay + 0.001);
      lfoGain.gain.linearRampToValueAtTime(clamp(spec.vibrato.depth, 0, 80), t0 + delay + 0.2);
      lfo.connect(lfoGain);
      for (const carrier of carriers) lfoGain.connect(carrier.detune);
      lfo.start(t0);
      lfo.stop(stopAt);
      sources.push(lfo);
      nodes.push(lfoGain);
    }

    if (spec.noise) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoise(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = spec.noise.type ?? 'bandpass';
      filter.frequency.value = clamp(spec.noise.frequency, 80, 16000);
      filter.Q.value = clamp(spec.noise.q ?? 0.7, 0.0001, 20);
      const gain = ctx.createGain();
      const decayTime = clamp(spec.noise.decay, 0.01, 3);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.noise.level * vel), t0 + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decayTime);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      noise.start(t0);
      noise.stop(t0 + decayTime + 0.04);
      sources.push(noise);
      nodes.push(filter, gain);
    }

    this.trackVoice(perf, nodes, sources);
  }

  private scheduleDrum(
    perf: Performance,
    kit: DrumKitPlan,
    voice: DrumVoice,
    when: number,
    velocity: number,
    offset = 0,
    pan = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const at = Math.max(ctx.currentTime + 0.005, when + offset);
    const vel = clamp(velocity, 0.01, 1);
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const noise = this.getNoise(ctx);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const destination: AudioNode = panner ?? perf.input;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(perf.input);
      nodes.push(panner);
    }

    const noiseHit = (
      level: number,
      decay: number,
      filterType: BiquadFilterType,
      frequency: number,
      q = 0.8,
      startAt = at,
    ) => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = clamp(frequency, 40, 18000);
      filter.Q.value = clamp(q, 0.0001, 20);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * vel), startAt + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      source.start(startAt);
      source.stop(startAt + decay + 0.04);
      sources.push(source);
      nodes.push(filter, gain);
    };

    const toneHit = (
      type: OscillatorType,
      startHz: number,
      endHz: number,
      decay: number,
      level: number,
      startAt = at,
    ) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(clamp(startHz, 20, 12000), startAt);
      osc.frequency.exponentialRampToValueAtTime(clamp(endHz, 20, 12000), startAt + Math.max(0.03, decay));
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * vel), startAt + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(startAt);
      osc.stop(startAt + decay + 0.04);
      sources.push(osc);
      nodes.push(gain);
    };

    switch (voice) {
      case 'kick': {
        const { startHz, endHz, decay, click, level } = kit.kick;
        toneHit('sine', startHz, endHz, decay, level * 0.95);
        if (click > 0) {
          noiseHit(click, 0.025, 'highpass', 2800, 0.6);
        }
        break;
      }
      case 'snare': {
        const { toneHz, decay, noise: noiseLevel, snap, level } = kit.snare;
        toneHit('triangle', toneHz, toneHz * 0.82, decay * 0.75, level * 0.36);
        noiseHit(noiseLevel * level, decay, 'highpass', 1700, 0.65);
        if (snap > 0) noiseHit(snap, 0.04, 'bandpass', 4200, 1.1);
        break;
      }
      case 'hat': {
        const { decay, frequency, level, metallic } = kit.hat;
        noiseHit(level, decay, 'highpass', frequency, 0.9);
        if (metallic > 0) noiseHit(level * metallic, decay * 0.7, 'bandpass', 9800, 1.4);
        break;
      }
      case 'open-hat': {
        noiseHit(kit.openHat.level, kit.openHat.decay, 'highpass', kit.openHat.frequency, 0.9);
        noiseHit(kit.openHat.level * 0.25, kit.openHat.decay * 0.8, 'bandpass', 9200, 1.2);
        break;
      }
      case 'tom': {
        const { startHz, endHz, decay, level } = kit.tom;
        toneHit('sine', startHz, endHz, decay, level);
        noiseHit(level * 0.1, 0.03, 'bandpass', 900, 0.8);
        break;
      }
      case 'clap': {
        const clap = kit.clap;
        if (!clap) {
          noiseHit(0.35, 0.12, 'bandpass', 1600, 1.1);
          break;
        }
        for (let i = 0; i < 3; i++) {
          noiseHit(clap.level * 0.5, 0.025, 'bandpass', clap.frequency, 1.1, at + i * 0.012);
        }
        noiseHit(clap.level, clap.decay, 'bandpass', clap.frequency * 0.85, 0.9, at + 0.036);
        break;
      }
      case 'rim': {
        const rim = kit.rim;
        if (!rim) {
          noiseHit(0.3, 0.04, 'bandpass', 1200, 1.5);
          break;
        }
        toneHit('square', rim.frequency, rim.frequency * 0.9, rim.decay, rim.level * 0.2);
        noiseHit(rim.level * 0.6, rim.decay, 'bandpass', rim.frequency * 2.4, 1.4);
        break;
      }
    }

    this.trackVoice(perf, nodes, sources);
  }

  private trackVoice(
    perf: Performance,
    nodes: AudioNode[],
    sources: AudioScheduledSourceNode[],
  ): void {
    for (const node of nodes) perf.nodes.add(node);
    if (sources.length === 0) {
      for (const node of nodes) {
        window.setTimeout(() => {
          try { node.disconnect(); } catch { /* noop */ }
          perf.nodes.delete(node);
        }, 4000);
      }
      return;
    }
    const sourceSet = new Set(sources);
    let ended = 0;
    for (const source of sourceSet) {
      perf.sources.add(source);
      source.addEventListener('ended', () => {
        perf.sources.delete(source);
        ended++;
        if (ended >= sourceSet.size) {
          for (const node of nodes) {
            try { node.disconnect(); } catch { /* noop */ }
            perf.nodes.delete(node);
          }
        }
      }, { once: true });
    }
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noise && this.noise.sampleRate === ctx.sampleRate) return this.noise;
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x12345678;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  private getImpulse(ctx: AudioContext, decay: number): AudioBuffer {
    const seconds = clamp(decay, 0.2, 4);
    const key = `${seconds.toFixed(2)}:${ctx.sampleRate}`;
    const cached = this.impulses.get(key);
    if (cached) return cached;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const damp = Math.pow(1 - i / length, 2.6);
        data[i] = (Math.random() * 2 - 1) * damp;
      }
    }
    if (this.impulses.size > 12) {
      const first = this.impulses.keys().next().value;
      if (first !== undefined) this.impulses.delete(first);
    }
    this.impulses.set(key, buffer);
    return buffer;
  }
}

export const instrumentEngine = new InstrumentEngine();
