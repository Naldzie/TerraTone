import type { MouseEvent, PointerEvent } from 'react';

/**
 * Multi-touch taps for the sim control dock. Mobile browsers only turn a
 * single-finger tap into a `click`, so with a thumb on the joystick a second
 * finger's tap on Walk / Ride / Talk… did nothing. Spread these props on the
 * container: a touch that lifts over a button clicks it straight away, and the
 * browser's own (late, duplicate) click is swallowed.
 */
let lastTap = 0;

export const multiTouchTap = {
  onPointerUp(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'touch') return;
    const btn = (e.target as HTMLElement).closest('button');
    // The Jump pad handles its own touch-down / release.
    if (!btn || btn.disabled || btn.classList.contains('jumppad') || !e.currentTarget.contains(btn)) return;
    const r = btn.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    lastTap = performance.now();
    btn.click();
  },
  onClickCapture(e: MouseEvent<HTMLElement>) {
    if (e.isTrusted && performance.now() - lastTap < 700) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
};
