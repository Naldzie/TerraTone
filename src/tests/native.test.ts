import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeShell } from '../lib/native';

type ShellWindow = Window & {
  Capacitor?: unknown;
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
};

const shellWindow = window as ShellWindow;

describe('isNativeShell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete shellWindow.Capacitor;
    delete shellWindow.__TAURI_INTERNALS__;
    delete shellWindow.__TAURI__;
  });

  it('returns false in a regular browser', () => {
    expect(isNativeShell()).toBe(false);
  });

  it('detects the Capacitor shell', () => {
    shellWindow.Capacitor = {};
    expect(isNativeShell()).toBe(true);
  });

  it('detects the Tauri shell', () => {
    shellWindow.__TAURI_INTERNALS__ = {};
    expect(isNativeShell()).toBe(true);
  });

  it('detects the Electron shell from its user agent', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Electron/45.0.0 Safari/537.36',
    );
    expect(isNativeShell()).toBe(true);
  });
});
