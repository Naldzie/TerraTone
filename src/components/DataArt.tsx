/* Procedural dataset thumbnails — a category-tinted sparkline of the real
 * values, drawn as inline SVG so it works fully offline. No images shipped,
 * no external requests, deterministic output. */
import type { DatasetMeta } from '../types';

export function dataHue(category: string): number {
  let h = 7;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return h % 360;
}

export interface SparkGeometry {
  line: string;
  area: string;
  last: { x: number; y: number } | null;
  n: number;
  lo: number;
  hi: number;
}

export function sparkGeometry(points: { value: number | null }[], w = 320, h = 180, pad = 16, maxPoints = 140): SparkGeometry {
  const vals = points.map((p) => p.value);
  const finite = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  const base = h - pad;
  if (finite.length < 2) return { line: '', area: '', last: null, n: finite.length, lo: 0, hi: 1 };
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const rng = hi - lo || 1;
  const step = Math.max(1, Math.ceil(vals.length / maxPoints));
  const xs = (i: number) => pad + (i / Math.max(1, vals.length - 1)) * (w - 2 * pad);
  const ys = (v: number) => base - ((v - lo) / rng) * (h - 2 * pad);
  let line = '';
  let area = '';
  let open = false;
  let prevX = 0;
  let last: { x: number; y: number } | null = null;
  for (let i = 0; i < vals.length; i += step) {
    const v = vals[i];
    if (v === null || !Number.isFinite(v)) {
      if (open) { area += `L${prevX.toFixed(1)} ${base.toFixed(1)}Z`; open = false; }
      continue;
    }
    const x = +xs(i).toFixed(1);
    const y = +ys(v).toFixed(1);
    if (!open) {
      line += `M${x} ${y}`;
      area += `M${x} ${base}L${x} ${y}`;
      open = true;
    } else {
      line += `L${x} ${y}`;
      area += `L${x} ${y}`;
    }
    prevX = x;
    last = { x, y };
  }
  if (open) area += `L${prevX.toFixed(1)} ${base.toFixed(1)}Z`;
  return { line, area, last, n: finite.length, lo, hi };
}

export function DataArt({ dataset, className }: { dataset: DatasetMeta; className?: string }) {
  const hue = dataHue(dataset.category);
  const { line, area, last } = sparkGeometry(dataset.points);
  const gid = `da-g-${dataset.id}`;
  const units = dataset.units.length > 18 ? `${dataset.units.slice(0, 17)}…` : dataset.units;
  return (
    <svg viewBox="0 0 320 180" role="img" className={className}
      aria-label={`Data thumbnail for ${dataset.title}: sparkline of ${dataset.points.length} ${dataset.units} points`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 55% 26%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 45) % 360} 65% 12%)`} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${gid})`} />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="12" y1={(180 * f).toFixed(0)} x2="308" y2={(180 * f).toFixed(0)}
          stroke={`hsl(${hue} 60% 70% / 0.16)`} strokeWidth="1" />
      ))}
      {area && <path d={area} fill={`hsl(${hue} 70% 62% / 0.22)`} />}
      {line && <path d={line} fill="none" stroke={`hsl(${hue} 85% 72%)`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {last && <circle cx={last.x} cy={last.y} r="4" fill={`hsl(${hue} 90% 80%)`} stroke={`hsl(${hue} 60% 20%)`} strokeWidth="1.5" />}
      {dataset.provenance === 'sample'
        ? <text x="12" y="24" fontSize="13" fill="hsl(0 0% 100% / 0.8)" fontFamily="inherit">DEMO · {units}</text>
        : <text x="12" y="24" fontSize="13" fill="hsl(0 0% 100% / 0.8)" fontFamily="inherit">{units}</text>}
    </svg>
  );
}
