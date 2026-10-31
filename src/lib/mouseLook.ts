/* Mouse look for the 3D viewports.
 *
 * Preferred mode — pointer lock: once the scene captures the mouse (on Play
 * or a click into the scene) the cursor disappears entirely and every mouse
 * movement turns the camera, with no limit and no button held. Esc (or
 * opening a menu) gives the cursor back.
 *
 * Fallback — hover look: if the mouse isn't captured, moving it over the
 * scene still turns the camera, and resting it near an edge keeps turning.
 * Touch and pen are untouched: they keep drag-to-look.
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Fraction of the view width/height that counts as the turning edge. */
export const EDGE_ZONE = 0.09;
/** Pixels-per-second of equivalent mouse travel at the very edge. */
const EDGE_SPEED_X = 520;
const EDGE_SPEED_Y = 260;
/** Hover sensitivity (1 = same as dragging). */
const HOVER_GAIN = 0.85;
/** Pointer-lock sensitivity (raw mouse counts). */
const LOCK_GAIN = 0.9;

/** How hard to auto-turn for a cursor at fraction f (0..1) across the view. */
export function edgeTurn(f: number, zone = EDGE_ZONE): number {
  if (f < zone) return -(zone - Math.max(0, f)) / zone;
  if (f > 1 - zone) return (Math.min(1, f) - (1 - zone)) / zone;
  return 0;
}

/** Ask the browser to capture the mouse for `el` (must run inside a user gesture). */
export function captureMouse(el: HTMLElement | null): void {
  if (!el || typeof el.requestPointerLock !== 'function') return;
  if (document.pointerLockElement === el) return;
  try {
    const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  } catch { /* not allowed here (e.g. iframe sandbox) — hover look still works */ }
}

/** Release the mouse if `el` holds it. */
export function releaseMouse(el: HTMLElement | null): void {
  if (el && document.pointerLockElement === el && typeof document.exitPointerLock === 'function') {
    document.exitPointerLock();
  }
}

/**
 * Attach mouse look to `target`. `orbit(dx, dy)` receives pixel-like deltas
 * (positive dx = look right, positive dy = look down).
 * Returns whether the mouse is currently captured (pointer lock).
 */
export function useMouseLook(
  target: RefObject<HTMLElement | null>,
  orbit: (dx: number, dy: number) => void,
  enabled: boolean,
): boolean {
  const orbitRef = useRef(orbit);
  orbitRef.current = orbit;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [locked, setLocked] = useState(false);

  // Hand the cursor back whenever looking is switched off (pause, menus).
  useEffect(() => { if (!enabled) releaseMouse(target.current); }, [enabled, target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let last: { x: number; y: number } | null = null;
    let hovering = false;
    let fx = 0.5; let fy = 0.5;
    let raf = 0;
    let prev = performance.now();
    const isLocked = () => document.pointerLockElement === el;

    // Captured: raw movement from anywhere on the page.
    const onLockedMove = (e: MouseEvent) => {
      if (!isLocked() || !enabledRef.current) return;
      orbitRef.current(e.movementX * LOCK_GAIN, e.movementY * LOCK_GAIN);
    };
    // Not captured: steer by hovering over the scene.
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || isLocked()) return;
      const r = el.getBoundingClientRect();
      fx = (e.clientX - r.left) / Math.max(1, r.width);
      fy = (e.clientY - r.top) / Math.max(1, r.height);
      hovering = true;
      if (last && enabledRef.current) {
        orbitRef.current((e.clientX - last.x) * HOVER_GAIN, (e.clientY - last.y) * HOVER_GAIN);
      }
      last = { x: e.clientX, y: e.clientY };
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      last = null; hovering = false; fx = 0.5; fy = 0.5;
    };
    // Clicking into the scene (re)captures the mouse.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && enabledRef.current) captureMouse(el);
    };
    const onLockChange = () => {
      const l = isLocked();
      setLocked(l);
      last = null;
      if (l) hovering = false;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!hovering || isLocked() || !enabledRef.current) return;
      const tx = edgeTurn(fx); const ty = edgeTurn(fy);
      if (tx !== 0 || ty !== 0) orbitRef.current(tx * EDGE_SPEED_X * dt, ty * EDGE_SPEED_Y * dt);
    };
    document.addEventListener('mousemove', onLockedMove);
    document.addEventListener('pointerlockchange', onLockChange);
    el.addEventListener('pointermove', onHover);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('mousemove', onLockedMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      el.removeEventListener('pointermove', onHover);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      cancelAnimationFrame(raf);
      releaseMouse(el);
    };
  }, [target]);

  return locked;
}
