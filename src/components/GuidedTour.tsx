/* In-house guided tour: dims the page, spotlights one element at a time and
 * explains it in a small card (title, text, Back / Next / Skip, step counter).
 * Keyboard: Esc closes, ← / → step, Tab stays inside the card. No remote
 * code or assets, so it works offline. Honors Reduce motion. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { findTourTarget } from '../lib/tours';
import type { TourStep } from '../lib/tours';
import { Icon } from './Icon';

interface Props {
  steps: TourStep[];
  /** Shown above the step title, e.g. "Explore tour". */
  label: string;
  onClose: () => void;
  reduceMotion?: boolean;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 6;
const GAP = 12;
const MARGIN = 12;
const PHONE = 640;

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

function systemReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GuidedTour({ steps, label, onClose, reduceMotion = false }: Props) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState({ w: 340, h: 200 });
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const still = reduceMotion || systemReducedMotion();
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const next = useCallback(() => {
    if (last) onClose();
    else setIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [last, onClose, steps.length]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Remember and restore focus around the whole tour.
  useEffect(() => {
    const active = document.activeElement;
    returnFocus.current = active instanceof HTMLElement ? active : null;
    return () => {
      const el = returnFocus.current;
      if (el && document.contains(el)) window.setTimeout(() => el.focus(), 0);
    };
  }, []);

  const measure = useCallback(() => {
    const el = targetRef.current;
    let nextBox: Box | null = null;
    if (el && document.contains(el)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) nextBox = { top: r.top, left: r.left, width: r.width, height: r.height };
    }
    setBox((prev) => (sameBox(prev, nextBox) ? prev : nextBox));
    setViewport((prev) => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
  }, []);

  // Find this step's element, bring it into view and focus the card title.
  useEffect(() => {
    const el = findTourTarget(step.target);
    targetRef.current = el;
    if (el) {
      const r = el.getBoundingClientRect();
      const fits = r.top >= 70 && r.bottom <= window.innerHeight - 90;
      if (!fits) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: still ? 'auto' : 'smooth' });
    }
    measure();
    // After the page's own focus handling (e.g. landing page switches).
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(t);
  }, [step, still, measure]);

  // Track the target while the page scrolls, resizes or re-renders
  // (event-driven plus a light poll for layout shifts; no busy rAF loop).
  useEffect(() => {
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const poll = window.setInterval(measure, 200);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      window.clearInterval(poll);
    };
  }, [measure]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setCard((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [index, viewport.w, box]);

  // Keys win over the page underneath (simulators listen for arrows and Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation(); next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation(); back();
      } else if (e.key === 'Tab') {
        const nodes = cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const end = nodes[nodes.length - 1];
        const inside = cardRef.current?.contains(document.activeElement);
        if (!inside) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
          e.preventDefault(); end.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault(); first.focus();
        }
      } else if (['ArrowUp', 'ArrowDown', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'Q', 'e', 'E', 't', 'T', 'c', 'C', 'f', 'F', 'h', 'H', '?'].includes(e.key)) {
        // Do not let simulator hotkeys fire behind the tour.
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [back, next, onClose]);

  // ---- placement ----
  const phone = viewport.w < PHONE;
  const spot = box ? {
    top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2,
  } : null;
  const style: CSSProperties = {};
  let placement = 'center';
  if (spot && phone) {
    // Dock to whichever screen edge the highlight is not on.
    const centre = spot.top + spot.height / 2;
    placement = centre > viewport.h / 2 ? 'top' : 'bottom';
  } else if (spot) {
    const below = viewport.h - (spot.top + spot.height) - GAP;
    const above = spot.top - GAP;
    const left = Math.min(Math.max(MARGIN, spot.left), viewport.w - card.w - MARGIN);
    if (below >= card.h + MARGIN) {
      placement = 'below';
      style.top = spot.top + spot.height + GAP;
      style.left = left;
    } else if (above >= card.h + MARGIN) {
      placement = 'above';
      style.top = spot.top - GAP - card.h;
      style.left = left;
    } else {
      // Big target (a whole 3D viewport): float the card inside it.
      placement = 'inside';
      style.top = Math.min(Math.max(MARGIN, spot.top + spot.height - card.h - MARGIN), viewport.h - card.h - MARGIN);
      style.left = Math.min(Math.max(MARGIN, spot.left + MARGIN), viewport.w - card.w - MARGIN);
    }
  }

  return createPortal(
    <div className={`tour${still ? ' tour--still' : ''}`} data-placement={placement}>
      {/* Swallows clicks so the page cannot change under the tour. */}
      <div className={`tour__shade${spot ? '' : ' tour__shade--dim'}`} aria-hidden="true" />
      {spot && <div className="tour__spot" aria-hidden="true" style={spot} />}
      <div
        ref={cardRef}
        className="tour__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={style}
      >
        <div className="tour__head">
          <span className="tour__label"><Icon name="help" /> {label}</span>
          <span className="tour__count" aria-live="polite">Step {index + 1} of {steps.length}</span>
        </div>
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="tour__title">{step.title}</h2>
        <p id={bodyId} className="tour__body">{step.body}</p>
        <div className="tour__dots" aria-hidden="true">
          {steps.map((s, i) => <span key={s.title + i} className={i === index ? 'is-on' : undefined} />)}
        </div>
        <div className="tour__actions">
          <button type="button" className="btn sm ghost" onClick={onClose}>{last ? 'Close' : 'Skip tour'}</button>
          <span className="tour__nav">
            <button type="button" className="btn sm" onClick={back} disabled={index === 0} aria-label="Previous step">
              <Icon name="arrow-left" /> Back
            </button>
            <button type="button" className="btn sm primary" onClick={next} aria-label={last ? 'Finish tour' : 'Next step'}>
              {last ? 'Finish' : 'Next'}
            </button>
          </span>
        </div>
        <p className="tour__keys" aria-hidden="true"><kbd>←</kbd> <kbd>→</kbd> step · <kbd>Esc</kbd> close</p>
      </div>
    </div>,
    document.body,
  );
}
