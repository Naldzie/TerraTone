/* Procedural cinematic intro soundscape.
 *
 * A separate, short-lived Web Audio graph (never the sonification engine):
 * filtered brown-noise wind, two very low sine pads, soft pulses and one
 * synchronized impact. It is created silently, only ramps up when the browser
 * permits playback, and is fully closed when the intro ends or is skipped.
 */
export type IntroAudioStatus = 'running' | 'blocked' | 'unsupported';

const MAX_MASTER = 0.5;

function makeNoise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

export class IntroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private pulseTimer: number | null = null;
  private targetGain = 0.0001;
  private stopped = false;

  async start(volume: number): Promise<IntroAudioStatus> {
    if (this.stopped) return 'unsupported';
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return 'unsupported';

    try {
      if (!this.ctx) this.build(AC, volume);
      const ctx = this.ctx;
      if (!ctx) return 'unsupported';

      this.targetGain = Math.max(0.0001, Math.min(MAX_MASTER, Math.min(1, Math.max(0, volume)) * MAX_MASTER));
      if (ctx.state === 'suspended') {
        await Promise.race([
          ctx.resume().catch(() => undefined),
          new Promise<void>((resolve) => window.setTimeout(resolve, 320)),
        ]);
      }
      if (ctx.state !== 'running') {
        this.rampGain(0.0001, 0.08);
        return 'blocked';
      }

      this.rampGain(this.targetGain, 1.4);
      this.ensurePulseTimer();
      return 'running';
    } catch {
      this.stop(0);
      return 'unsupported';
    }
  }

  mute(muted: boolean): void {
    if (this.stopped) return;
    this.rampGain(muted ? 0.0001 : this.targetGain, muted ? 0.25 : 0.5);
  }

  pulse(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running' || this.stopped) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, now);
      osc.frequency.exponentialRampToValueAtTime(294, now + 0.6);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.11, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
      if (pan) {
        pan.pan.value = Math.sin(now * 0.7) * 0.18;
        osc.connect(gain).connect(pan).connect(master);
      } else {
        osc.connect(gain).connect(master);
      }
      osc.start(now);
      osc.stop(now + 0.65);
    } catch {
      /* a pulse is decorative; never break the intro */
    }
  }

  /** Deep, brief hit used exactly when the logo appears. */
  impact(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running' || this.stopped) return;
    try {
      const now = ctx.currentTime;

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      const subFilter = ctx.createBiquadFilter();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(58, now);
      sub.frequency.exponentialRampToValueAtTime(29, now + 1.5);
      subFilter.type = 'lowpass';
      subFilter.frequency.value = 120;
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.exponentialRampToValueAtTime(0.46, now + 0.025);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
      sub.connect(subFilter).connect(subGain).connect(master);
      sub.start(now);
      sub.stop(now + 1.7);

      const air = ctx.createBufferSource();
      const airFilter = ctx.createBiquadFilter();
      const airGain = ctx.createGain();
      air.buffer = makeNoise(ctx, 1.8, true);
      airFilter.type = 'lowpass';
      airFilter.frequency.setValueAtTime(620, now);
      airFilter.frequency.exponentialRampToValueAtTime(90, now + 1.2);
      airGain.gain.setValueAtTime(0.0001, now);
      airGain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
      airGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
      air.connect(airFilter).connect(airGain).connect(master);
      air.start(now);
      air.stop(now + 1.4);

      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(523.25, now);
      chime.frequency.exponentialRampToValueAtTime(392, now + 1.2);
      chimeGain.gain.setValueAtTime(0.0001, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      chime.connect(chimeGain).connect(master);
      chime.start(now);
      chime.stop(now + 1.45);
    } catch {
      /* optional cinematic layer */
    }
  }

  stop(fadeSeconds = 0.5): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pulseTimer !== null) {
      window.clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    this.rampGain(0.0001, Math.max(0.01, fadeSeconds));
    const close = () => {
      for (const source of this.sources) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      this.sources = [];
      void ctx.close().catch(() => undefined);
    };
    if (fadeSeconds <= 0.02) close();
    else window.setTimeout(close, fadeSeconds * 1000 + 40);
    this.ctx = null;
    this.master = null;
  }

  private build(AC: typeof AudioContext, volume: number): void {
    const ctx = new AC();
    this.ctx = ctx;
    this.targetGain = Math.max(0.0001, Math.min(1, Math.max(0, volume)) * MAX_MASTER);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.38;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.master = master;

    const brown = makeNoise(ctx, 4, true);
    const white = makeNoise(ctx, 3, false);

    const wind = ctx.createBufferSource();
    wind.buffer = brown;
    wind.loop = true;
    const windLowpass = ctx.createBiquadFilter();
    windLowpass.type = 'lowpass';
    windLowpass.frequency.value = 420;
    windLowpass.Q.value = 0.5;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.14;
    wind.connect(windLowpass).connect(windGain).connect(master);
    wind.start();

    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.085;
    lfoDepth.gain.value = 0.04;
    lfo.connect(lfoDepth).connect(windGain.gain);
    lfo.start();

    const air = ctx.createBufferSource();
    air.buffer = white;
    air.loop = true;
    const airHighpass = ctx.createBiquadFilter();
    airHighpass.type = 'highpass';
    airHighpass.frequency.value = 1400;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.02;
    air.connect(airHighpass).connect(airGain).connect(master);
    air.start();

    for (const [freq, level] of [[55, 0.06], [82.5, 0.022], [110, 0.012], [220, 0.03], [330, 0.018], [440, 0.012]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = level;
      osc.connect(gain).connect(master);
      osc.start();
      this.sources.push(osc);
    }

    this.sources.push(wind, lfo, air);
  }

  private ensurePulseTimer(): void {
    if (this.pulseTimer !== null || this.stopped) return;
    this.pulse();
    this.pulseTimer = window.setInterval(() => this.pulse(), 1350);
  }

  private rampGain(target: number, seconds: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const safeTarget = Math.max(0.0001, target);
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(safeTarget, now + Math.max(0.02, seconds));
    } catch {
      master.gain.value = safeTarget;
    }
  }
}
