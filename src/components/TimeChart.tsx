import { useEffect, useRef } from 'react';
import type { DatasetMeta } from '../types';

/** Accessible canvas time-series with playhead, min/max markers, missing-data gaps. */
export function TimeChart({ dataset, frame, onSeek }: {
  dataset: DatasetMeta;
  frame: number;
  onSeek: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 600;
    const h = 190;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    const cyan = css.getPropertyValue('--cyan').trim() || '#22d3ee';
    const faint = css.getPropertyValue('--ink-faint').trim() || '#6f80a3';
    const pad = { l: 46, r: 12, t: 14, b: 26 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const pts = dataset.points;
    const [lo, hi] = dataset.range;
    const X = (i: number) => pad.l + (pts.length <= 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;

    // gridlines
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.fillStyle = faint;
    ctx.font = '10px system-ui';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const v = lo + ((hi - lo) * g) / 4;
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), 6, y + 3);
    }
    // date labels
    const n = pts.length;
    const picks = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
    for (const i of picks) ctx.fillText(pts[i]?.t ?? '', X(i) - 10, h - 8);

    // missing-data gaps
    ctx.fillStyle = 'rgba(251,113,133,0.18)';
    pts.forEach((p, i) => {
      if (p.value === null) ctx.fillRect(X(i) - 2, pad.t, 4, ih);
    });

    // series line (path through valid points only)
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    pts.forEach((p, i) => {
      if (p.value === null) { started = false; return; }
      const x = X(i); const y = Y(p.value);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // valid dots (sparse for perf)
    const stride = Math.max(1, Math.floor(n / 120));
    ctx.fillStyle = cyan;
    pts.forEach((p, i) => {
      if (p.value !== null && i % stride === 0) { ctx.beginPath(); ctx.arc(X(i), Y(p.value), 2, 0, 7); ctx.fill(); }
    });

    // playhead
    const fx = X(Math.min(frame, n - 1));
    const hc = document.documentElement.dataset.contrast === 'high';
    ctx.strokeStyle = hc ? '#ffff00' : '#a78bfa';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(fx, pad.t - 4); ctx.lineTo(fx, pad.t + ih + 4); ctx.stroke();

    // frame readout
    const p = pts[Math.min(frame, n - 1)];
    ctx.fillStyle = '#e8f1ff';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText(`${p?.t ?? ''}: ${p?.value === null || p?.value === undefined ? 'no data' : `${p.value} ${dataset.units}`}`, pad.l + 4, pad.t + 12);
  }, [dataset, frame]);

  return (
    <div>
      <canvas
        ref={ref}
        className="chart"
        role="img"
        aria-label={`Time series chart of ${dataset.title}. Use the timeline slider below to move through frames.`}
        style={{ height: 190 }}
      />
      <input
        type="range" min={0} max={Math.max(0, dataset.points.length - 1)} step={1}
        value={Math.min(frame, dataset.points.length - 1)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label={`Timeline scrubber for ${dataset.title}`}
      />
    </div>
  );
}
