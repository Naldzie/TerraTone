import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Player } from '../components/Player';
import { SAMPLE_DATASETS } from '../data/samples';

vi.mock('../components/TimeChart', () => ({ TimeChart: () => null }));
vi.mock('../components/MusicViz3D', () => ({ MusicViz3D: () => null }));

vi.mock('../store/AppContext', async () => {
  const { SAMPLE_DATASETS: samples } = await import('../data/samples');
  return {
    useApp: () => ({
      currentDataset: samples[0],
      mapping: {
        profileId: 'musical',
        speed: 4,
        masterVolume: 0.7,
        muted: false,
        spatialPan: true,
        instrument: 'piano',
        instrumentProfileId: 'grand-piano',
        useInstrumentVoice: false,
      },
      updateMapping: vi.fn(),
      settings: { disableNonessentialSound: false, reduceMotion: true },
      saveExperience: vi.fn(),
    }),
  };
});

const FRAME_MS = 250; // speed 4 frames/sec
const total = SAMPLE_DATASETS[0].points.length;

const frameLabel = () => document.querySelector('.player output')?.textContent ?? '';

const tick = (frames: number) => { act(() => { vi.advanceTimersByTime(frames * FRAME_MS); }); };

describe('Player transport', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('repeats automatically when the timeline ends', () => {
    const onPlayingChange = vi.fn();
    render(<Player compact onPlayingChange={onPlayingChange} />);
    onPlayingChange.mockClear(); // drop the mount notification, keep only what playback does
    fireEvent.click(screen.getByRole('button', { name: 'Play synchronized visualization and sound' }));
    expect(frameLabel()).toContain(`frame 1/${total}`);

    tick(total + 3);
    expect(onPlayingChange).not.toHaveBeenCalledWith(false);
    expect(onPlayingChange).toHaveBeenCalledWith(true);
    expect(frameLabel()).toContain(`frame ${((total + 3) % total) + 1}/${total}`);
  });

  it('stops at the end when repeat is switched off', () => {
    const onPlayingChange = vi.fn();
    render(<Player compact onPlayingChange={onPlayingChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Repeat on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play synchronized visualization and sound' }));

    tick(total + 2);
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
  });

  it('plays backwards from the newest frame to the oldest', () => {
    render(<Player compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forwards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play synchronized visualization and sound' }));
    expect(frameLabel()).toContain(`frame ${total}/${total}`);

    tick(2);
    expect(frameLabel()).toContain(`frame ${total - 2}/${total}`);

    tick(total - 2); // wraps past the oldest frame and lands on the newest one again
    expect(frameLabel()).toContain(`frame ${total}/${total}`);
  });
});
