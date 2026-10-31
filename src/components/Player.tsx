import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { computeFrameSound, engine, imageSignature } from '../audio/engine';
import { instrumentEngine, mapValueToMidi, midiToFreq, valueVelocity } from '../audio/instrumentEngine';
import { getInstrument } from '../audio/instrumentProfiles';
import { TimeChart } from './TimeChart';
import { lonToPan, normalizeValue, summarizeSeries } from '../lib/dataUtils';
import { frameDate, gibsFrameUrl, eicDeepLink } from '../lib/nasa';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

/** three.js music visualizer — lazy chunk so the main bundle stays lean. */
const MusicViz3D = lazy(() => import('./MusicViz3D').then((m) => ({ default: m.MusicViz3D })));

/**
 * Synchronized visualization + sonification player.
 * Timer-driven: every tick advances one frame and schedules exactly one
 * deterministic note, so audio and playhead can never drift apart.
 * When the dataset carries a frameImage (GIBS/EIC layer), a real Earth
 * visual frame is rendered per timeline frame and its brightness/warmth
 * shifts the synthesized timbre — sight translated into sound.
 * With "route this player through the instrument" on, each frame is voiced by
 * the selected instrument sound profile instead of the plain synth.
 * Playback loops by default and can run forwards or backwards; this is the
 * single set of transport controls (the Sound profile card only shows state).
 */
export function Player({ compact = false, onPlayingChange }: {
  compact?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { currentDataset: d, mapping, updateMapping, settings, saveExperience } = useApp();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [viz3d, setViz3d] = useState(!compact);
  const [loop, setLoop] = useState(true);
  const [backward, setBackward] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const [expName, setExpName] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [visualMsg, setVisualMsg] = useState('');
  const timer = useRef<number | null>(null);
  const frameRef = useRef(0);
  frameRef.current = frame;
  const visualRef = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const frameImageMeta = useRef<ReturnType<typeof imageSignature> | null>(null);
  const visualUrl = useRef<string | null>(null);

  const fps = Math.max(0.5, Math.min(30, mapping.speed));
  const frameMs = 1000 / fps;
  const instrument = getInstrument(mapping.instrument);
  const useInstrumentVoice = mapping.useInstrumentVoice;

  const stopTimer = useCallback(() => {
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
  }, []);

  useEffect(() => () => { stopTimer(); engine.stopAll(); instrumentEngine.stopAll(); }, [stopTimer]);
  useEffect(() => {
    setFrame(0); setPlaying(false); stopTimer();
    engine.stopAll(); instrumentEngine.stopAll();
    setCaptions([]); setVisualMsg('');
  }, [d?.id, stopTimer]);

  // Keep the instrument engine on the mapping the panel edits.
  useEffect(() => {
    instrumentEngine.setProfile(mapping.instrument, mapping.instrumentProfileId);
    instrumentEngine.setVolume(mapping.masterVolume);
    instrumentEngine.setMuted(mapping.muted);
  }, [mapping.instrument, mapping.instrumentProfileId, mapping.masterVolume, mapping.muted]);

  const speakFrame = useCallback((i: number) => {
    if (!d) return;
    const p = d.points[i];
    if (!p) return;
    let image = '';
    if (d.frameImage) {
      const meta = frameImageMeta.current;
      image = meta ? ` · frame ${meta.brightness.toFixed(2)} brightness` : ' · frame loading';
    }
    const label = p.value === null
      ? `Frame ${i + 1}: ${p.t} — no data, silence.${image}`
      : `Frame ${i + 1}: ${p.t} — ${p.value} ${d.units}.${image}`;
    setCaptions((c) => [...c.slice(-29), label]);
  }, [d]);

  /** Voice one frame with the selected instrument and mirror it to the 3D view. */
  const playInstrumentFrame = useCallback((i: number) => {
    const p = d?.points[i];
    if (!d || !p) return;
    const midi = mapValueToMidi(p.value, d.range, instrument.frameRange);
    const gain = valueVelocity(p.value, d.range);
    engine.emitNote({
      freq: midi === null ? 0 : midiToFreq(midi),
      gain,
      pan: mapping.spatialPan ? lonToPan(p.lon) : 0,
      ticks: midi === null ? 0 : Math.round((normalizeValue(p.value, d.range) ?? 0) * 3),
      silent: midi === null,
    });
    instrumentEngine.playFrame(midi, gain, 1 / fps);
  }, [d, instrument.frameRange, mapping.spatialPan, fps]);

  /** Voice one frame with whichever engine is active: the routed instrument or the plain synth. */
  const soundFrame = useCallback((i: number) => {
    if (!d || settings.disableNonessentialSound) return;
    try {
      if (useInstrumentVoice) {
        playInstrumentFrame(i);
        return;
      }
      const ctx = engine.ensureContext();
      engine.setMaster(mapping);
      const snd = computeFrameSound(d.points[i], d.range, mapping.profileId, mapping.masterVolume, mapping.spatialPan, frameImageMeta.current ?? undefined);
      engine.playFrame(snd, mapping.profileId, ctx.currentTime + 0.02, 1 / fps);
    } catch { /* audio unavailable — visuals continue */ }
  }, [d, fps, mapping, playInstrumentFrame, settings.disableNonessentialSound, useInstrumentVoice]);

  const scheduleFrame = useCallback((i: number) => {
    if (!d) return;
    soundFrame(i);
    speakFrame(i);
  }, [d, soundFrame, speakFrame]);

  const loadVisual = useCallback((i: number) => {
    if (!d || !d.frameImage || audioOnly) {
      if (visualRef.current) visualRef.current.getContext('2d')?.clearRect(0, 0, 600, 190);
      frameImageMeta.current = null;
      setVisualMsg('');
      return;
    }
    const p = d.points[i];
    if (!p) return;
    const fi = d.frameImage;
    const date = frameDate(p.t, fi.dateMode);
    if (!date) { setVisualMsg(`No tile date for "${p.t}".`); frameImageMeta.current = null; return; }
    const url = gibsFrameUrl(fi.layer, date);
    if (visualUrl.current === url) return; // already this frame
    visualUrl.current = url;
    setVisualMsg(`Loading ${fi.attribution ?? fi.layer} frame for ${date}…`);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    img.current = image;
    image.onload = () => {
      if (img.current !== image) return; // stale
      const canvas = visualRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 600;
      const h = 190;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);
      // attribution strip
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, h - 20, w, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '11px system-ui';
      ctx.fillText(`${fi.attribution ?? 'NASA GIBS'} · ${date} · frame ${i + 1}/${d.points.length}`, 6, h - 6);
      try {
        frameImageMeta.current = imageSignature(canvas, w, h);
      } catch { frameImageMeta.current = null; }
      setVisualMsg(`Earth frame ${i + 1}: ${date} — ${fi.attribution ?? 'NASA GIBS imagery'}.`);
    };
    image.onerror = () => {
      setVisualMsg(`Could not load imagery for ${date}. Audio continues; visuals use chart only.`);
      frameImageMeta.current = null;
    };
    image.src = url;
  }, [d, frame, audioOnly]);

  const play = useCallback(() => {
    if (!d || d.points.length === 0) return;
    try { engine.ensureContext(); setAudioReady(true); } catch { /* keep visual-only */ }
    if (settings.disableNonessentialSound) { setAudioReady(false); }
    engine.setMaster(mapping);
    if (useInstrumentVoice && !settings.disableNonessentialSound) {
      instrumentEngine.stopAll(); // hand the engine over to dataset frames
      void instrumentEngine.start().then((ok) => { if (ok) setAudioReady(true); });
      setCaptions((c) => [...c.slice(-29), `Sound routed through ${instrument.name} — ${instrumentEngine.currentProfile.name}.`]);
    }
    // Forwards starts at the oldest frame, backwards at the newest one.
    const last = d.points.length - 1;
    const start = backward && frameRef.current <= 0
      ? last
      : !backward && last > 0 && frameRef.current >= last
        ? 0
        : frameRef.current;
    frameRef.current = start;
    setFrame(start);
    setPlaying(true);
    stopTimer();
    loadVisual(start);
    soundFrame(start); // the opening note lands immediately, no waiting for the timer
    speakFrame(start);
    timer.current = window.setInterval(() => {
      if (!d) return;
      const count = d.points.length;
      let next = frameRef.current + (backward ? -1 : 1);
      if (next >= count || next < 0) {
        if (!loop) {
          stopTimer(); setPlaying(false); engine.stopAll(); instrumentEngine.stopAll();
          setCaptions((c) => [...c, 'Playback finished.']);
          return;
        }
        const wrappedToStart = next >= count;
        next = wrappedToStart ? 0 : count - 1;
        setCaptions((c) => [...c.slice(-29), wrappedToStart ? 'Loop — replaying from the oldest frame.' : 'Loop — replaying from the newest frame.']);
      }
      frameRef.current = next;
      setFrame(next);
      loadVisual(next);
      soundFrame(next);
      const p = d.points[next];
      let image = '';
      if (d.frameImage) {
        const meta = frameImageMeta.current;
        image = meta ? ` · frame ${meta.brightness.toFixed(2)} brightness` : ' · frame ?';
      }
      const label = p.value === null
        ? `Frame ${next + 1}: ${p.t} — no data, silence.${image}`
        : `Frame ${next + 1}: ${p.t} — ${p.value} ${d.units}.${image}`;
      setCaptions((c) => [...c.slice(-29), label]);
    }, frameMs);
  }, [d, mapping, frameMs, fps, loop, backward, settings.disableNonessentialSound, stopTimer, loadVisual, soundFrame, speakFrame, useInstrumentVoice, instrument.name]);

  const pause = useCallback(() => {
    setPlaying(false); stopTimer(); engine.stopAll(); instrumentEngine.stopAll();
  }, [stopTimer]);
  const stop = useCallback(() => {
    setPlaying(false); stopTimer(); engine.stopAll(); instrumentEngine.stopAll();
    setFrame(0); loadVisual(0);
  }, [stopTimer, loadVisual]);
  const restart = useCallback(() => { stop(); setTimeout(() => { setFrame(0); loadVisual(0); }, 0); }, [stop, loadVisual]);

  useEffect(() => { onPlayingChange?.(playing); }, [playing, onPlayingChange]);

  const preview = useCallback(() => {
    if (useInstrumentVoice) {
      const ms = instrumentEngine.previewProfile();
      if (ms > 0) {
        setAudioReady(true);
        setCaptions((c) => [...c, `Previewing ${instrumentEngine.currentProfile.name} (${instrument.name}).`]);
      } else {
        setCaptions((c) => [...c, 'Audio unavailable — press play needs a tap first.']);
      }
      return;
    }
    try {
      engine.ensureContext(); setAudioReady(true);
      engine.preview(mapping.profileId, mapping.masterVolume);
      setCaptions((c) => [...c, 'Preview tone played (mid-range reference).']);
    } catch { setCaptions((c) => [...c, 'Audio unavailable — press play needs a tap first.']); }
  }, [mapping.profileId, mapping.masterVolume, useInstrumentVoice, instrument.name]);

  const seek = useCallback((i: number) => {
    pause();
    setFrame(i);
    loadVisual(i);
    if (audioReady && !settings.disableNonessentialSound) scheduleFrame(i);
    else speakFrame(i);
  }, [pause, audioReady, scheduleFrame, speakFrame, settings.disableNonessentialSound, loadVisual]);

  if (!d) return <div className="empty">No dataset selected.</div>;
  const cur = d.points[Math.min(frame, d.points.length - 1)];
  const fi = d.frameImage;
  const hasVisual = Boolean(fi) && !audioOnly;
  const routeNote = useInstrumentVoice
    ? `${instrument.name} voices each frame`
    : hasVisual ? 'visual frame drives timbre' : 'chart only';

  return (
    <section className="player" aria-label={`Player for ${d.title}`}>
      {!audioOnly && <TimeChart dataset={d} frame={frame} onSeek={seek} />}
      {!audioOnly && viz3d && (
        <Suspense fallback={<div className="musicviz3d"><div className="musicviz-fallback">Loading 3D music view…</div></div>}>
          <MusicViz3D dataset={d} frame={frame} profileId={mapping.profileId} reduceMotion={settings.reduceMotion} playing={playing} />
        </Suspense>
      )}
      {fi && !audioOnly && (
        <div className="visual-frame" aria-label={`Earth visual frame ${frame + 1} of ${d.points.length}`}>
          <canvas ref={visualRef} className="visual" role="img"
            aria-label={`Satellite/Earth imagery frame ${frame + 1} for ${cur?.t ?? ''}`} style={{ height: 190 }} />
          <div className="visual-caption" aria-live="polite">{visualMsg}</div>
          {fi.attribution && (
            <a className="eic-link" href={eicDeepLink(fi.layer, frameDate(cur?.t ?? '', fi.dateMode) ?? '')}
              target="_blank" rel="noopener noreferrer" aria-label="Open matching view in NASA Earth Information Center">
              <Icon name="external-link" /> View in Earth Information Center
            </a>
          )}
        </div>
      )}
      <div className="timeline">
        <span aria-hidden="true"><Icon name="clock" /></span>
        <output aria-live="polite">
          {cur ? `${cur.t} · ${cur.value === null ? 'no data' : `${cur.value} ${d.units}`} · frame ${frame + 1}/${d.points.length}` : '—'}
        </output>
      </div>
      <div className="legend" aria-label="Legend">
        <span className="scalebar" aria-hidden="true" />
        <span>Low {d.range[0]} → high {d.range[1]} {d.units} · red bands = missing data (silent) · {routeNote}</span>
      </div>
      <div className="transport" role="group" aria-label="Playback controls">
        {!playing
          ? <button className="btn primary" onClick={play} aria-label={frame > 0 ? 'Resume synchronized playback' : 'Play synchronized visualization and sound'}><Icon name="play" /> {frame > 0 ? 'Resume' : 'Play'}</button>
          : <button className="btn primary" onClick={pause} aria-label="Pause both visualization and audio"><Icon name="pause" /> Pause</button>}
        <button className="btn" onClick={restart} aria-label="Restart from first frame"><Icon name="restart" /> Restart</button>
        <button className="btn" onClick={stop} aria-label="Stop and rewind"><Icon name="stop" /> Stop</button>
        <button className="btn ghost" onClick={preview} aria-label="Preview reference tone"><Icon name="bell" /> Tone preview</button>
      </div>
      <div className="row">
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="spd">Speed (frames/sec): {fps}</label>
          <input id="spd" type="range" min={1} max={20} step={1} value={Math.round(fps)}
            onChange={(e) => updateMapping({ speed: Number(e.target.value) })} />
        </div>
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="vol">Master volume {mapping.muted ? '(muted)' : ''}</label>
          <input id="vol" type="range" min={0} max={1} step={0.05} value={mapping.masterVolume}
            onChange={(e) => { updateMapping({ masterVolume: Number(e.target.value) }); engine.setMaster({ masterVolume: Number(e.target.value), muted: mapping.muted }); }} />
        </div>
      </div>
      <div className="row">
        <button className="btn sm ghost" onClick={() => setLoop((v) => !v)} aria-pressed={loop}
          title="When the timeline ends, start over automatically">
          <Icon name="restart" /> Repeat {loop ? 'on' : 'off'}
        </button>
        <button className="btn sm ghost" onClick={() => setBackward((v) => !v)} aria-pressed={backward}
          title="Play from the newest frame back to the oldest">
          <Icon name="play" style={backward ? { transform: 'scaleX(-1)' } : undefined} /> {backward ? 'Backwards' : 'Forwards'}
        </button>
        <button className="btn sm ghost" onClick={() => { updateMapping({ muted: !mapping.muted }); engine.setMaster({ masterVolume: mapping.masterVolume, muted: !mapping.muted }); }} aria-pressed={mapping.muted}>
          {mapping.muted ? <><Icon name="volume-off" /> Unmute</> : <><Icon name="volume-on" /> Mute</>}
        </button>
        <button className="btn sm ghost" onClick={() => updateMapping({ spatialPan: !mapping.spatialPan })} aria-pressed={mapping.spatialPan} title="Pan sound left/right by longitude">
          <Icon name="headphones" /> Spatial pan {mapping.spatialPan ? 'on' : 'off'}
        </button>
        <button className="btn sm ghost" onClick={() => setViz3d((v) => !v)} aria-pressed={viz3d} title="Note shards, a playhead beacon and a 3D data landscape">
          <Icon name="cube" /> 3D music view {viz3d ? 'on' : 'off'}
        </button>
        <button className="btn sm ghost" onClick={() => setAudioOnly((v) => !v)} aria-pressed={audioOnly}>
          {audioOnly ? <><Icon name="eye" /> Show visuals</> : <><Icon name="volume-off" /> Audio-only mode</>}
        </button>
      </div>
      {!compact && (
        <>
          <div>
            <h3 style={{ margin: '4px 0' }}>Audio events &amp; captions</h3>
            <ul className="captions" aria-live="polite" aria-label="Playback captions log">
              {captions.length === 0 && <li>Press Play — every frame is captioned here as text.</li>}
              {captions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
          <div>
            <h3 style={{ margin: '4px 0' }}>Text data summary</h3>
            <p style={{ color: 'var(--ink-dim)', fontSize: '.9rem' }}>{summarizeSeries(d.points)} {d.mappingNote}</p>
          </div>
          <div className="row">
            <input type="text" placeholder="Name this experience…" value={expName} onChange={(e) => setExpName(e.target.value)}
              aria-label="Experience name" style={{ flex: '1 1 180px' }} />
            <button className="btn sm" onClick={async () => { await saveExperience(expName); setExpName(''); setSavedMsg('Saved — find it in Library, replayable offline.'); }}><Icon name="save" /> Save experience</button>
          </div>
          {savedMsg && <div className="alert" role="status">{savedMsg}</div>}
          {!audioReady && <div className="alert" role="note"><Icon name="volume-on" /> Browsers require a tap before audio starts — press Play once to enable sound.</div>}
        </>
      )}
    </section>
  );
}
