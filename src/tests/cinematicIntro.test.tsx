import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CinematicIntro } from '../components/CinematicIntro';

// The 3D Earth is lazy and needs WebGL; the intro itself is what we assert here.
vi.mock('../components/IntroEarth', () => ({
  IntroEarth: () => <div data-testid="intro-earth" />,
}));

let closedContexts = 0;

class FakeParam {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  connect() { return this; }
  disconnect() { /* noop */ }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeOsc extends FakeNode { frequency = new FakeParam(); type = 'sine'; start() { /* noop */ } stop() { /* noop */ } }
class FakeBufferSource extends FakeNode { buffer: unknown = null; loop = false; start() { /* noop */ } stop() { /* noop */ } }
class FakeFilter extends FakeNode { type = 'lowpass'; frequency = new FakeParam(); Q = new FakeParam(); }
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam();
  attack = new FakeParam(); release = new FakeParam();
}
class FakePanner extends FakeNode { pan = new FakeParam(); }
class FakeBuffer {
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {}
  getChannelData() { return new Float32Array(this.length); }
}
class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  createGain() { return new FakeGain(); }
  createOscillator() { return new FakeOsc(); }
  createBufferSource() { return new FakeBufferSource(); }
  createBiquadFilter() { return new FakeFilter(); }
  createDynamicsCompressor() { return new FakeCompressor(); }
  createStereoPanner() { return new FakePanner(); }
  createBuffer(c: number, l: number, s: number) { return new FakeBuffer(c, l, s); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; closedContexts += 1; }
}

describe('CinematicIntro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    closedContexts = 0;
    localStorage.clear();
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  afterEach(() => {
    cleanup();
    act(() => { vi.advanceTimersByTime(400); });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const base = {
    variant: 'full' as const,
    volume: 0.7,
    audioAllowed: false,
    reduceMotion: false,
  };

  it('shows the brand, tagline, subtitle and both controls', () => {
    render(<CinematicIntro {...base} onFinish={() => undefined} />);
    expect(screen.getByRole('heading', { name: /terratone/i })).toBeInTheDocument();
    expect(screen.getByText('LISTEN TO THE PLANET.')).toBeInTheDocument();
    expect(screen.getByText(/Explore Earth\. Experience Nature\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip intro/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quiet mode or zero volume/i })).toBeInTheDocument();
  });

  it('skips quickly instead of forcing the user to watch it', async () => {
    const onFinish = vi.fn();
    render(<CinematicIntro {...base} onFinish={onFinish} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));
    });
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('skip');
  });

  it('lets Escape act as a skip shortcut', async () => {
    const onFinish = vi.fn();
    render(<CinematicIntro {...base} onFinish={onFinish} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(onFinish).toHaveBeenCalledWith('skip');
  });

  it('finishes on its own and reports a complete run', async () => {
    const onFinish = vi.fn();
    render(<CinematicIntro {...base} onFinish={onFinish} />);
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(onFinish).toHaveBeenCalledWith('complete');
  });

  it('never lets the run exceed the advertised duration', async () => {
    const onFinish = vi.fn();
    render(<CinematicIntro {...base} onFinish={onFinish} />);
    await act(async () => { vi.advanceTimersByTime(7000); });
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('drops the waveform and the 3D Earth for reduced motion', () => {
    const { container } = render(
      <CinematicIntro {...base} variant="reduced" reduceMotion onFinish={() => undefined} />,
    );
    expect(container.querySelector('.intro__wave')).toBeNull();
    expect(screen.queryByTestId('intro-earth')).toBeNull();
    expect(screen.getByText('LISTEN TO THE PLANET.')).toBeInTheDocument();
  });

  it('starts with sound enabled even if a previous run was muted', async () => {
    localStorage.setItem('tt_intro_muted', '1');
    const { unmount } = render(<CinematicIntro {...base} audioAllowed onFinish={() => undefined} />);
    await act(async () => { /* let the audio graph start */ });
    expect(screen.getByRole('button', { name: /mute the cinematic intro/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /mute the cinematic intro/i }));
    });
    expect(screen.getByRole('button', { name: /unmute the cinematic intro/i })).toBeInTheDocument();
    unmount();
    render(<CinematicIntro {...base} audioAllowed onFinish={() => undefined} />);
    await act(async () => { /* let the audio graph start again */ });
    expect(screen.getByRole('button', { name: /mute the cinematic intro/i })).toBeInTheDocument();
  });

  it('closes the audio context once the intro is over', async () => {
    const onFinish = vi.fn();
    render(<CinematicIntro {...base} audioAllowed onFinish={onFinish} />);
    await act(async () => { /* let the audio graph start */ });
    expect(closedContexts).toBe(0);
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(onFinish).toHaveBeenCalledWith('complete');
    expect(closedContexts).toBeGreaterThan(0);
  });

  it('stays silent and says so when audio is not allowed', () => {
    render(<CinematicIntro {...base} audioAllowed={false} onFinish={() => undefined} />);
    const button = screen.getByRole('button', { name: /quiet mode or zero volume/i });
    expect(button).toBeDisabled();
  });
});
