import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BearingDial, GaugeBar } from '../components/Instruments';

afterEach(cleanup);

describe('GaugeBar', () => {
  it('exposes a labelled meter with clamped value', () => {
    render(<GaugeBar label="Wind speed" frac={0.62} text="120 kt" />);
    const meter = screen.getByRole('meter', { name: 'Wind speed: 120 kt' });
    expect(meter).toHaveAttribute('aria-valuenow', '62');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('120 kt')).toBeInTheDocument();
  });
  it('clamps out-of-range fractions into 0..100', () => {
    const { rerender } = render(<GaugeBar label="Over" frac={1.7} text="hot" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    rerender(<GaugeBar label="Over" frac={-0.4} text="cold" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('BearingDial', () => {
  it('normalises the bearing and labels the compass image', () => {
    render(<BearingDial bearing={-30} label="Bearing to funnel" />);
    expect(screen.getByRole('img', { name: 'Bearing to funnel: 330 degrees' })).toBeInTheDocument();
    expect(screen.getByText('Bearing to funnel')).toBeInTheDocument();
    expect(screen.getByText('330°')).toBeInTheDocument();
  });
  it('draws 16 ticks and rotates the needle to the bearing', () => {
    const { container } = render(<BearingDial bearing={90} label="Bearing" />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('line.tick')).toHaveLength(16);
    const needle = svg.querySelector('g[transform="rotate(90 60 60)"]');
    expect(needle).not.toBeNull();
  });
  it('wraps bearings above 360 back into the circle', () => {
    render(<BearingDial bearing={390} label="Bearing" />);
    expect(screen.getByRole('img', { name: 'Bearing: 30 degrees' })).toBeInTheDocument();
  });
});
