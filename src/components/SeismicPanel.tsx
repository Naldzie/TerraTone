import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

/** Animated seismic waveform: draws live shaking amplitude (P → S → coda). */
export function SeismicPanel({ getShaking, magnitude }: {
  getShaking: () => number;
  magnitude: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const trace: number[] = new Array(300).fill(0);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = (canvas.width = canvas.clientWidth * 2 || 600);
      const H = (canvas.height = 110);
      const amp = getShaking();
      trace.push((Math.random() * 2 - 1) * amp);
      trace.shift();
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(148,163,184,0.3)';
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      const css = getComputedStyle(document.documentElement);
      ctx.strokeStyle = css.getPropertyValue('--rose').trim() || '#fb7185';
      ctx.lineWidth = 2;
      ctx.beginPath();
      trace.forEach((v, i) => {
        const x = (i / (trace.length - 1)) * W;
        const y = H / 2 + v * (H / 2 - 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getShaking]);

  const mmi = magnitude < 4.5 ? 'II–IV · Felt lightly' : magnitude < 6 ? 'V–VI · Strong' : magnitude < 7.5 ? 'VII–VIII · Severe' : 'IX+ · Violent (simulated)';
  return (
    <section className="card" aria-label="Seismic monitor">
      <h3 style={{ margin: 0 }}><Icon name="chart" /> Seismic monitor <small style={{ color: 'var(--ink-faint)' }}>simulated Mw {magnitude.toFixed(1)}</small></h3>
      <canvas ref={ref} className="minichart" style={{ height: 55 }} role="img" aria-label="Animated seismic waveform of the simulated shaking" />
      <div className="meta"><span>Simulated intensity: <b>{mmi}</b></span></div>
    </section>
  );
}
