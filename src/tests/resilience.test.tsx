import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { clearStoredKey, keySource, setStoredKey } from '../lib/keys';

function Boom(): never {
  throw new Error('test crash');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return () => vi.restoreAllMocks();
  });

  it('renders children when nothing crashes', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows a recovery screen instead of a blank page on crash', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload terratone/i })).toBeInTheDocument();
    // Raw message is available for bug reports, but tucked inside collapsed details.
    const details = screen.getByText(/technical details/i).closest('details');
    expect(details).toBeInTheDocument();
    expect((details as HTMLDetailsElement | null)?.open).toBe(false);
    expect(screen.getByText('test crash')).toBeInTheDocument();
  });
});

describe('keySource', () => {
  beforeEach(() => {
    clearStoredKey('nasa');
    clearStoredKey('gemini');
  });

  it('reports device source for stored keys, env/none otherwise', () => {
    clearStoredKey('nasa');
    // A real .env may supply a fallback key under test — either non-device source is correct.
    expect(keySource('nasa')).not.toBe('device');
    setStoredKey('nasa', 'ABC');
    expect(keySource('nasa')).toBe('device');
    clearStoredKey('nasa');
    expect(keySource('nasa')).not.toBe('device');
  });
});
