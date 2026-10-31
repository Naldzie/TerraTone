import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { InstrumentProfilePanel } from '../components/InstrumentProfilePanel';

const h = vi.hoisted(() => ({ updateMapping: vi.fn() }));

vi.mock('../store/AppContext', () => ({
  useApp: () => ({
    mapping: {
      profileId: 'musical',
      speed: 4,
      masterVolume: 0.8,
      muted: false,
      spatialPan: false,
      instrument: 'piano',
      instrumentProfileId: 'grand-piano',
      useInstrumentVoice: false,
    },
    updateMapping: h.updateMapping,
  }),
}));

describe('InstrumentProfilePanel', () => {
  afterEach(() => {
    cleanup();
    h.updateMapping.mockClear();
  });

  it('lists exactly eight instruments and the selected profile', () => {
    render(<InstrumentProfilePanel />);
    const picker = screen.getByRole('group', { name: 'Choose an instrument' });
    const chips = within(picker).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      'Piano', 'Electric Guitar', 'Acoustic Guitar', 'Bass Guitar',
      'Drum Machine', 'Violin', 'Flute', 'Synthesizer',
    ]);
    expect(screen.getByRole('radio', { name: /Grand Piano/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: /Sound profiles for Piano/ })).toBeInTheDocument();
    expect(screen.getByText(/on Piano/)).toBeInTheDocument();
  });

  it('offers five named profiles with their effect tags', () => {
    render(<InstrumentProfilePanel />);
    const group = screen.getByRole('radiogroup');
    const cards = within(group).getAllByRole('radio');
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining('Grand Piano'),
      expect.stringContaining('Soft Piano'),
      expect.stringContaining('Electric Piano'),
      expect.stringContaining('Bright Piano'),
      expect.stringContaining('Warm Piano'),
    ]);
    expect(group.textContent).toContain('Additive');
    expect(group.textContent).toContain('Reverb');
  });

  it('switches instrument and resets to that instrument’s first profile', () => {
    render(<InstrumentProfilePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Electric Guitar' }));
    expect(h.updateMapping).toHaveBeenCalledWith({ instrument: 'electric-guitar', instrumentProfileId: 'clean' });
  });

  it('selects a profile card', () => {
    render(<InstrumentProfilePanel />);
    fireEvent.click(screen.getByRole('radio', { name: /Warm Piano/ }));
    expect(h.updateMapping).toHaveBeenCalledWith({ instrumentProfileId: 'warm-piano' });
  });

  it('routes the mapping for volume, mute target and the player switch', () => {
    render(<InstrumentProfilePanel />);
    fireEvent.change(screen.getByLabelText(/Profile volume/), { target: { value: '0.35' } });
    expect(h.updateMapping).toHaveBeenLastCalledWith({ masterVolume: 0.35 });

    fireEvent.click(screen.getByRole('checkbox'));
    expect(h.updateMapping).toHaveBeenLastCalledWith({ useInstrumentVoice: true });
  });

  it('embeds inside the dataset sound profile card when asked', () => {
    const { container } = render(<InstrumentProfilePanel embedded />);
    expect(container.querySelector('.sound-profile--embedded')).not.toBeNull();
    expect(container.querySelector('.sound-profile__eyebrow')).toBeNull();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('leaves playback controls to the player and mirrors its state', () => {
    const view = render(<InstrumentProfilePanel embedded playing={false} />);
    expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Preview/ })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Idle');

    view.rerender(<InstrumentProfilePanel embedded playing />);
    expect(screen.getByRole('status')).toHaveTextContent('Playing dataset');
  });
});
