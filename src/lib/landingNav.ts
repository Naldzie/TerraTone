/** "Back to the landing page" requests. Any page (or a simulator deep in the
 *  tree) can call requestLanding(); the launch gate in App.tsx listens and
 *  shows the landing page again. A window event keeps it prop-drilling free. */
const EVENT = 'terratone:landing';

export function requestLanding(): void {
  if (typeof window === 'undefined') return;
  // Fullscreen / pointer lock would hide the landing page or keep the mouse captive.
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  } catch { /* not supported */ }
  try {
    if (document.pointerLockElement) document.exitPointerLock();
  } catch { /* not supported */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onLandingRequest(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
