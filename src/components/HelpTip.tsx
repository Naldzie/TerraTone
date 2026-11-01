import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Small "?" button that reveals a short explanation on demand, so pages stay
 * clean: hover (mouse) or tap / click to show, click again, Esc, scrolling or
 * tapping outside hides it. The bubble is portaled to <body> and positioned
 * against the viewport, so no card, header or stacking context can clip or
 * cover it.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = pos !== null;

  const show = (pin: boolean) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const top = r.bottom + 8;
    // Phones: span the screen. Wider screens: hang off the button toward the open side.
    if (vw < 560) setPos({ top, left: 8, right: 8, width: 'auto', maxWidth: 'none' });
    else setPos(r.left > vw / 2 ? { top, right: Math.max(8, vw - r.right - 6) } : { top, left: Math.max(8, r.left - 6) });
    if (pin) setPinned(true);
  };
  const hide = () => { setPos(null); setPinned(false); };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !document.getElementById(id)?.contains(t)) hide();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, id]);

  return (
    <span
      className="helptip"
      ref={ref}
      onMouseEnter={() => { if (window.matchMedia?.('(hover: hover)').matches && !open) show(false); }}
      onMouseLeave={() => { if (!pinned) setPos(null); }}
    >
      <button
        type="button"
        className="helptip-btn"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (pinned ? hide() : show(true))}
      >?</button>
      {pos && createPortal(
        <span className="helptip-pop" id={id} role="note" style={pos}>
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}
