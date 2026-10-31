import { useCallback, useEffect, useRef, useState } from 'react';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type OrientationApi = {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

function currentFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function orientationApi(): OrientationApi | undefined {
  return typeof screen !== 'undefined'
    ? (screen.orientation as unknown as OrientationApi | undefined)
    : undefined;
}

/**
 * Fullscreen + landscape lock for a simulation stage.
 *
 * Phones honour both calls (Android Chrome, most tablets); desktop browsers
 * only enter fullscreen, and iOS Safari may refuse both — the stage still
 * stays usable, so every failure is deliberately swallowed.
 */
export function useFullscreenLandscape<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(currentFullscreenElement() === ref.current);
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(async () => {
    const el = ref.current as FullscreenElement | null;
    if (!el) return;
    if (currentFullscreenElement() === el) {
      const doc = document as FullscreenDocument;
      try {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } catch { /* noop */ }
      try { orientationApi()?.unlock?.(); } catch { /* noop */ }
      return;
    }
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    } catch { /* fullscreen unavailable (iOS Safari) */ }
    try { await orientationApi()?.lock?.('landscape'); } catch { /* lock needs mobile fullscreen */ }
  }, []);

  return { ref, active, toggle };
}
