/* Shared realism toolkit for TerraTone's procedural audio engines.
 *
 * Same rule as everywhere: 100% synthesized, capped levels, no clicks.
 * - softClipCurve: gentle saturation that glues beds together (still capped
 *   downstream by the limiter).
 * - thunderStrike: two-stage strike — sharp close crack + rolling low tail
 *   with a fading re-strike, like real thunder.
 * - SubBass: sine sub layer (30–50 Hz) with slow breathing AM for chest-feel.
 * - TickSynth: expressive micro-events — hiss (rain/spray), pop (fire
 *   crackle, debris clatter, creaks), bloop (underwater bubbles).
 */
import { clamp } from '../lib/dataUtils';

/** Gentle tanh-style saturation curve, bounded to ±0.9. Pure (tested). */
export function softClipCurve(size = 256): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.6 * x) * 0.9;
  }
  return curve;
}

/** Two-stage thunder: crack + rolling tail + faint re-strike. Capped amp. */
export function thunderStrike(
  ctx: AudioContext,
  dest: AudioNode,
  brown: AudioBuffer,
  white: AudioBuffer,
  level: number,
): void {
  const t = ctx.currentTime + 0.03;
  const amp = Math.min(0.14, 0.04 + clamp(level, 0, 1) * 0.1);

  // 1) Close crack: short bandpassed white burst.
  const crack = ctx.createBufferSource();
  crack.buffer = white;
  crack.playbackRate.value = 0.9 + Math.random() * 0.4;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 500 + Math.random() * 500;
  bp.Q.value = 0.8;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, t);
  cg.gain.exponentialRampToValueAtTime(Math.max(0.001, amp * 0.8), t + 0.02);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  crack.connect(bp); bp.connect(cg); cg.connect(dest);
  crack.start(t); crack.stop(t + 0.5);

  // 2) Rolling low tail with a fading re-strike bump.
  const tail = ctx.createBufferSource();
  tail.buffer = brown;
  tail.loop = true;
  tail.playbackRate.value = 0.28 + Math.random() * 0.12;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 110 + clamp(level, 0, 1) * 90;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, t + 0.05);
  tg.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), t + 0.35);
  tg.gain.setValueAtTime(Math.max(0.001, amp), t + 1.4);
  tg.gain.linearRampToValueAtTime(Math.max(0.001, amp * 0.55), t + 2.2); // re-strike swell
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
  tail.connect(lp); lp.connect(tg); tg.connect(dest);
  tail.start(t); tail.stop(t + 4.8);
}

export type TickMode = 'hiss' | 'pop' | 'bloop';

/** Micro-event synthesizer: rain hiss, fire/debris pops, bubble bloops. */
export class TickSynth {
  constructor(private ctx: AudioContext, private dest: AudioNode, private white: AudioBuffer) {}

  trigger(mode: TickMode, level: number, bandLo = 1500, bandHi = 5000): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const l = clamp(level, 0, 1);
    if (l <= 0.01) return;

    if (mode === 'bloop') {
      // Rising-then-falling sine "bloop" of a bubble.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = 300 + Math.random() * 350;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, f0 * 0.45), t + 0.09);
      const g = ctx.createGain();
      const amp = Math.min(0.12, 0.02 + l * 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g); g.connect(this.dest);
      osc.start(t); osc.stop(t + 0.2);
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = 0.8 + Math.random() * 0.7;
    const f = ctx.createBiquadFilter();
    if (mode === 'pop') {
      // Resonant knock with random pitch + fast decay: crackle, clatter.
      f.type = 'bandpass';
      f.frequency.value = bandLo + Math.random() * Math.max(100, bandHi - bandLo);
      f.Q.value = 2.5 + Math.random() * 3;
    } else {
      // Airy spray: rain, surf hiss.
      f.type = 'highpass';
      f.frequency.value = bandLo;
    }
    const g = ctx.createGain();
    const amp = Math.min(mode === 'pop' ? 0.2 : 0.1, 0.02 + l * (mode === 'pop' ? 0.16 : 0.07));
    const decay = mode === 'pop' ? 0.05 + Math.random() * 0.06 : 0.09 + Math.random() * 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f); f.connect(g); g.connect(this.dest);
    src.start(t); src.stop(t + decay + 0.05);
  }
}

/** Sub-bass bed: deep sine with slow breathing amplitude. Wire into rumble. */
export interface SubBassNodes {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
}

export function attachSubBass(ctx: AudioContext, dest: AudioNode, freq = 38): SubBassNodes {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.09 + Math.random() * 0.05;
  const depth = ctx.createGain();
  depth.gain.value = 0.35; // AM depth applied multiplicatively below
  lfo.connect(depth);
  // depth output scales the gain param around its set value:
  const amFix = ctx.createGain();
  amFix.gain.value = 1;
  depth.connect(amFix.gain);
  osc.connect(gain);
  gain.connect(amFix);
  amFix.connect(dest);
  osc.start();
  lfo.start();
  return { osc, gain, lfo };
}
