import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GuidedTour } from '../components/GuidedTour';
import { TOURS, dismissTourOffer, tourOfferPending } from '../lib/tours';
import type { TourStep } from '../lib/tours';

const STEPS: TourStep[] = [
  { title: 'First', body: 'One' },
  { target: '#missing', title: 'Second', body: 'Two' },
  { title: 'Third', body: 'Three' },
];

describe('GuidedTour', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows a labelled dialog with a step counter', () => {
    render(<GuidedTour steps={STEPS} label="Test tour" onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'First' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous step/i })).toBeDisabled();
  });

  it('steps with Next/Back buttons and arrow keys, and finishes on the last step', () => {
    const onClose = vi.fn();
    render(<GuidedTour steps={STEPS} label="Test tour" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: 'Third' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /finish tour/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on Skip', () => {
    const onClose = vi.fn();
    render(<GuidedTour steps={STEPS} label="Test tour" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /skip tour/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('tour content', () => {
  it('covers every page, the simulator view and the landing page', () => {
    for (const id of ['landing', 'explore', 'listen', 'online', 'events', 'sims', 'sim', 'storm', 'studio', 'library', 'access', 'settings'] as const) {
      expect(TOURS[id].steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('offers the first-visit tour once per device', () => {
    window.localStorage.clear();
    expect(tourOfferPending()).toBe(true);
    dismissTourOffer();
    expect(tourOfferPending()).toBe(false);
  });
});
