import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { IntroEarth } from '../components/IntroEarth';

vi.mock('three', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('three');
  const stats = { created: 0, disposed: 0, failLoad: false };

  class FakeWebGLRenderer {
    domElement = document.createElement('canvas');
    capabilities = { getMaxAnisotropy: () => 2 };
    outputColorSpace = 0;
    toneMapping = 0;
    toneMappingExposure = 1;
    constructor() { stats.created += 1; }
    setPixelRatio() { /* noop */ }
    setSize() { /* noop */ }
    setClearColor() { /* noop */ }
    render() { /* noop */ }
    dispose() { stats.disposed += 1; }
    forceContextLoss() { /* noop */ }
  }

  class FakeTextureLoader {
    load(
      _url: string,
      onLoad: (texture: unknown) => void,
      _onProgress?: unknown,
      onError?: (error: unknown) => void,
    ) {
      if (stats.failLoad) {
        onError?.(new Error('texture unavailable'));
        return;
      }
      onLoad({ dispose() { /* noop */ }, colorSpace: '', anisotropy: 1 });
    }
  }

  return { ...actual, WebGLRenderer: FakeWebGLRenderer, TextureLoader: FakeTextureLoader, __introStats: stats };
});

interface IntroStats { created: number; disposed: number; failLoad: boolean }
const stats = (THREE as unknown as { __introStats: IntroStats }).__introStats;

class FakeResizeObserver {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}

describe('IntroEarth', () => {
  beforeEach(() => {
    stats.created = 0;
    stats.disposed = 0;
    stats.failLoad = false;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the WebGL scene alive when the parent re-renders', async () => {
    const { rerender } = render(
      <IntroEarth quality="high" onReady={() => { /* noop */ }} onError={() => { /* noop */ }} />,
    );
    await waitFor(() => expect(stats.created).toBe(1));

    // New callback identities on every parent render must not tear the scene
    // down: rebuilding it would recreate the GL context and reload textures.
    rerender(<IntroEarth quality="high" onReady={() => { /* noop */ }} onError={() => { /* noop */ }} />);
    await act(async () => { await Promise.resolve(); });

    expect(stats.created).toBe(1);
    expect(stats.disposed).toBe(0);
  });

  it('releases GPU resources when the intro closes', async () => {
    const { unmount } = render(
      <IntroEarth quality="high" onReady={() => { /* noop */ }} onError={() => { /* noop */ }} />,
    );
    await waitFor(() => expect(stats.created).toBe(1));
    unmount();
    expect(stats.disposed).toBe(1);
  });

  it('falls back to the illustrated Earth when the textures cannot be loaded', async () => {
    stats.failLoad = true;
    const onError = vi.fn();
    render(<IntroEarth quality="high" onReady={() => { /* noop */ }} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(stats.created).toBe(0);
  });
});
