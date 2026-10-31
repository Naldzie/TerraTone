import { useEffect, useRef } from 'react';

/** Live waveform + spectrum canvases fed by a Web Audio AnalyserNode. */
export function AudioViz({ getAnalyser, compact = false }: {
  getAnalyser: () => AnalyserNode | null;
  compact?: boolean;
}) {
  const waveRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const an = getAnalyser();
      const wave = waveRef.current;
      const spec = specRef.current;
      if (!an || !wave || !spec) return;
      const css = getComputedStyle(document.documentElement);
      const cyan = css.getPropertyValue('--cyan').trim() || '#22d3ee';
      const violet = css.getPropertyValue('--violet').trim() || '#a78bfa';
      const wctx = wave.getContext('2d');
      if (wctx) {
        const W = (wave.width = Math.max(2, Math.round(wave.clientWidth * 2)));
        const H = (wave.height = Math.max(2, Math.round(wave.clientHeight * 2)));
        const data = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(data);
        wctx.clearRect(0, 0, W, H);
        wctx.strokeStyle = 'rgba(148,163,184,0.25)';
        wctx.beginPath(); wctx.moveTo(0, H / 2); wctx.lineTo(W, H / 2); wctx.stroke();
        wctx.strokeStyle = cyan;
        wctx.lineWidth = 2;
        wctx.beginPath();
        const step = Math.max(1, Math.floor(data.length / W));
        for (let x = 0; x < W; x++) {
          const v = data[Math.min(data.length - 1, x * step)] / 128 - 1;
          const y = H / 2 + v * (H / 2 - 4);
          if (x === 0) wctx.moveTo(x, y); else wctx.lineTo(x, y);
        }
        wctx.stroke();
      }
      const sctx = spec.getContext('2d');
      if (sctx) {
        const W = (spec.width = Math.max(2, Math.round(spec.clientWidth * 2)));
        const H = (spec.height = Math.max(2, Math.round(spec.clientHeight * 2)));
        const bins = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(bins);
        sctx.clearRect(0, 0, W, H);
        const bars = 48;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor(Math.pow(i / bars, 1.8) * bins.length * 0.7);
          const bh = Math.max(2, (bins[idx] / 255) * H);
          sctx.fillStyle = i < bars * 0.3 ? cyan : violet;
          sctx.globalAlpha = 0.85;
          sctx.fillRect((i * W) / bars + 1, H - bh, W / bars - 2, bh);
        }
        sctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, compact]);

  return (
    <div className="row">
      <div className="simaudio-chart">
        <h4>Waveform <small>live output</small></h4>
        <canvas ref={waveRef} className="minichart" role="img" aria-label="Live waveform of the generated audio" />
      </div>
      <div className="simaudio-chart">
        <h4>Spectrum <small>live output</small></h4>
        <canvas ref={specRef} className="minichart" role="img" aria-label="Live frequency spectrum of the generated audio" />
      </div>
    </div>
  );
}

/** Compact always-on audio monitor docked inside the 3D simulation screen. */
export function SimAudioMonitor({ getAnalyser }: { getAnalyser: () => AnalyserNode | null }) {
  return (
    <div className="simaudio" role="group" aria-label="Live audio output">
      <AudioViz getAnalyser={getAnalyser} compact />
    </div>
  );
}
