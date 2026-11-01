import type { PointerEvent } from 'react';

/**
 * Big round touch Jump button (diamond-plate disc, ring, up arrow) that sits
 * beside the control dock on phones. Fires on touch-down so a jump never waits
 * for the finger to lift; `onRelease` lets riders hold it to keep rising.
 * Hidden on mouse + keyboard devices, where Space does the job.
 */
export function JumpPad({ label = 'Jump', onPress, onRelease }: {
  label?: string;
  onPress: () => void;
  onRelease?: () => void;
}) {
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.dataset.down = '';
    onPress();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    delete e.currentTarget.dataset.down;
    onRelease?.();
  };
  return (
    <button
      type="button"
      className="jumppad"
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      // Keyboard activation (Enter / Space on the focused button) has no pointer.
      onClick={(e) => { if (e.detail === 0) { onPress(); onRelease?.(); } }}
    >
      <svg className="jumppad-arrow" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 7 L41 25 H31 V34 H17 V25 H7 Z" />
        <rect x="16" y="38" width="16" height="3" rx="1" />
      </svg>
    </button>
  );
}
