import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SimSettingsOverlay } from '../components/SimSettingsOverlay';

describe('SimSettingsOverlay', () => {
  it('stays out of the way while closed', () => {
    render(
      <SimSettingsOverlay open={false} onClose={() => {}}>
        <p>Storm intensity</p>
      </SimSettingsOverlay>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the settings and closes from the header button', () => {
    const onClose = vi.fn();
    render(
      <SimSettingsOverlay open onClose={onClose}>
        <p>Storm soundscape</p>
        <p>Master volume</p>
      </SimSettingsOverlay>,
    );
    expect(screen.getByRole('dialog', { name: 'Simulation settings' })).toBeInTheDocument();
    expect(screen.getByText('Storm soundscape')).toBeInTheDocument();
    expect(screen.getByText('Master volume')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape without bubbling to the sim controls', () => {
    const onClose = vi.fn();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    render(
      <SimSettingsOverlay open onClose={onClose}>
        <p>Storm intensity</p>
      </SimSettingsOverlay>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    window.removeEventListener('keydown', onWindowKey);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onWindowKey).not.toHaveBeenCalled();
  });
});
