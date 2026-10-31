import type { Gauge } from '../sim/hazards';

/** One meter bar under a simulation's Status card (label, filled fraction, caption). */
export function GaugeBar({ label, frac, text }: Gauge) {
  const pct = Math.round(Math.min(1, Math.max(0, frac)) * 100);
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{label}</b>
        <span style={{ color: 'var(--ink-dim)', fontSize: '.85rem' }}>{text}</span>
      </div>
      <span
        className="progress"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label}: ${text}`}
      >
        <span style={{ display: 'block', width: `${pct}%` }} />
      </span>
    </div>
  );
}

/**
 * Compass card showing where the hazard sits relative to the explorer.
 * 0° = north/ahead of you, rotation is clockwise; the needle points at it.
 */
export function BearingDial({ bearing, label }: { bearing: number; label: string }) {
  const deg = ((Math.round(bearing) % 360) + 360) % 360;
  const ticks = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <figure className="bearing-dial">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${deg} degrees`}>
        <circle className="face" cx="60" cy="60" r="52" />
        <path className="north" d="M60 2 L63.5 9 L56.5 9 Z" />
        {ticks.map((t) => (
          <line
            key={t}
            className={t % 90 === 0 ? 'tick cardinal' : 'tick'}
            x1="60"
            y1="14"
            x2="60"
            y2={t % 90 === 0 ? 24 : 20}
            transform={`rotate(${t} 60 60)`}
          />
        ))}
        <g transform={`rotate(${deg} 60 60)`}>
          <path className="needle" d="M60 18 L65.5 64 L60 58 L54.5 64 Z" />
        </g>
        <circle className="hub" cx="60" cy="60" r="5" />
      </svg>
      <figcaption>
        <b>{label}</b>
        <span>{deg}°</span>
      </figcaption>
    </figure>
  );
}
