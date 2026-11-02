import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeShell } from './native';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type OrientationApi = {
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
  unlock?: () => void;
};

interface ScreenPlugin { setFullscreen(o: { on: boolean }): Promise<void> }
const nativeScreen = registerPlugin<ScreenPlugin>('TerraToneScreen');

function currentFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function orientationApi(): OrientationApi | undefined {
  return typeof screen !== 'undefined'
    ? (screen.orientation as unknown as OrientationApi | undefined)
    : undefined;
}

/** The Android app rotates natively (WebViews can't lock orientation). */
function nativeScreenAvailable(): boolean {
  try {
    return isNativeShell() && Capacitor.isPluginAvailable('TerraToneScreen');
  } catch {
    return false;
  }
}

/**
 * Fullscreen + landscape for a simulation stage; leaving goes back to portrait.
 *
 * - Android app: the stage fills the screen via CSS (`.is-fullscreen`) while
 *   the native TerraToneScreen plugin turns the phone to landscape and hides
 *   the system bars; Back leaves fullscreen (portrait again, bars back).
 * - Browsers: the Fullscreen API, plus a landscape lock on phones. Before
 *   leaving, the lock flips to portrait so the phone returns upright.
 * Every failure is swallowed — the stage always stays usable (iOS Safari
 * refuses both calls).
 */
export function useFullscreenLandscape<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);
  const native = nativeScreenAvailable();

  const setNative = useCallback((on: boolean) => {
    const el = ref.current;
    if (el) el.classList.toggle('is-fullscreen', on);
    document.documentElement.classList.toggle('sim-fullscreen', on);
    setActive(on);
    void nativeScreen.setFullscreen({ on }).catch(() => undefined);
  }, []);

  const enter = useCallback(async () => {
    const el = ref.current as FullscreenElement | null;
    if (!el) return;
    if (native) { setNative(true); return; }
    if (currentFullscreenElement() === el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    } catch { /* fullscreen unavailable (iOS Safari) */ }
    try { await orientationApi()?.lock?.('landscape'); } catch { /* lock needs mobile fullscreen */ }
  }, [native, setNative]);

  const exit = useCallback(async () => {
    if (native) { setNative(false); return; }
    if (!currentFullscreenElement()) return;
    // Turn upright while the lock is still allowed, then leave fullscreen.
    try { await orientationApi()?.lock?.('portrait'); } catch { /* not a phone */ }
    const doc = document as FullscreenDocument;
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } catch { /* noop */ }
    try { orientationApi()?.unlock?.(); } catch { /* noop */ }
  }, [native, setNative]);

  const toggle = useCallback(async () => {
    if (native ? ref.current?.classList.contains('is-fullscreen') : currentFullscreenElement() === ref.current) await exit();
    else await enter();
  }, [native, enter, exit]);

  useEffect(() => {
    if (native) {
      // Android Back while fullscreen (sent by MainActivity) leaves it.
      const back = () => setNative(false);
      window.addEventListener('tt-native-back', back);
      return () => {
        window.removeEventListener('tt-native-back', back);
        // Leaving the page (or the sim) never strands the app in landscape.
        if (ref.current?.classList.contains('is-fullscreen')) setNative(false);
      };
    }
    const sync = () => {
      const on = currentFullscreenElement() === ref.current && ref.current !== null;
      setActive(on);
      // Left with Esc / the system Back gesture: release the landscape lock.
      if (!on) { try { orientationApi()?.unlock?.(); } catch { /* noop */ } }
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [native, setNative]);

  return { ref, active, toggle, enter, exit };
}
