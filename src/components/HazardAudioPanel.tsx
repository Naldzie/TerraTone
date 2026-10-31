import type { HazardDef } from '../sim/hazards';
import { Icon } from './Icon';

interface Props {
  def: HazardDef;
  levels: Record<string, number>;
  onLevels: (l: Record<string, number>) => void;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  muted: boolean;
  onMuted: (m: boolean) => void;
  spatialOn: boolean;
  onSpatial: (s: boolean) => void;
  running: boolean;
  audioReady: boolean;
  statusLine: string;
}

/** Generic mixer panel: per-layer levels + master/mute/spatial. */
export function HazardAudioPanel(p: Props) {
  return (
    <section className="card" aria-label={`${p.def.title} audio panel`}>
      <h3 style={{ margin: 0 }}><Icon name={p.def.icon} /> Soundscape <small style={{ color: 'var(--ink-faint)' }}>100% synthesized locally</small></h3>
      {!p.audioReady && <div className="alert">Press <b>Play</b> above — sound starts automatically with the simulation, then follows your distance.</div>}
      <p style={{ fontSize: '.88rem', color: 'var(--ink-dim)' }} aria-live="polite">{p.statusLine}</p>
      <div className="row">
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label htmlFor="hz-master">Master volume</label>
          <input id="hz-master" type="range" min={0} max={1} step={0.05} value={p.masterVolume}
            onChange={(e) => p.onMasterVolume(Number(e.target.value))} />
        </div>
        <button className="btn sm" onClick={() => p.onMuted(!p.muted)} aria-pressed={p.muted} style={{ alignSelf: 'end' }}>
          {p.muted ? <><Icon name="volume-off" /> Unmute</> : <><Icon name="volume-on" /> Mute</>}
        </button>
        <button className="btn sm ghost" onClick={() => p.onSpatial(!p.spatialOn)} aria-pressed={p.spatialOn} style={{ alignSelf: 'end' }}>
          <Icon name="headphones" /> Spatial {p.spatialOn ? 'on' : 'off'}
        </button>
      </div>
      <h4 style={{ margin: '6px 0 0' }}>Sound layers</h4>
      <div className="row">
        {p.def.layers.map((l) => (
          <div className="field" key={l.key} style={{ flex: '1 1 140px' }}>
            <label htmlFor={`hl-${l.key}`}>{l.key}</label>
            <input id={`hl-${l.key}`} type="range" min={0} max={1} step={0.05}
              value={p.levels[l.key] ?? 1}
              onChange={(e) => p.onLevels({ ...p.levels, [l.key]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      <small style={{ color: 'var(--ink-faint)' }}>
        Output is limiter-capped and never exceeds safe levels.
        {p.running ? '' : ' Paused: rendering and audio processing are suspended.'}
      </small>
    </section>
  );
}
