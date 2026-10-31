import type { StormLayerGains } from '../audio/stormEngine';
import { describeStorm } from '../sim/stormTypes';
import type { StormParams } from '../sim/stormTypes';
import { Icon } from './Icon';

interface Props {
  storm: StormParams;
  layers: StormLayerGains;
  onLayers: (l: StormLayerGains) => void;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  muted: boolean;
  onMuted: (m: boolean) => void;
  spatialOn: boolean;
  onSpatial: (s: boolean) => void;
  running: boolean;
  audioReady: boolean;
}

/** Mixer for the storm engine's synthesized layers and master output. */
export function StormAudioPanel(p: Props) {
  const L = (key: keyof StormLayerGains, label: string) => (
    <div className="field" key={key} style={{ flex: '1 1 140px' }}>
      <label htmlFor={`layer-${key}`}>{label}</label>
      <input
        id={`layer-${key}`}
        type="range" min={0} max={1} step={0.05}
        value={p.layers[key]}
        onChange={(e) => p.onLayers({ ...p.layers, [key]: Number(e.target.value) })}
      />
    </div>
  );

  return (
    <section className="card" aria-label="Storm audio panel">
      <h3 style={{ margin: 0 }}><Icon name="volume-on" /> Storm soundscape <small style={{ color: 'var(--ink-faint)' }}>100% synthesized locally</small></h3>
      {!p.audioReady && <div className="alert">Press <b>Play</b> above — sound starts automatically with the simulation, then follows your distance.</div>}
      <p style={{ fontSize: '.88rem', color: 'var(--ink-dim)' }} aria-live="polite">{describeStorm(p.storm, p.masterVolume)}</p>
      <div className="row">
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label htmlFor="storm-master">Master volume</label>
          <input id="storm-master" type="range" min={0} max={1} step={0.05} value={p.masterVolume}
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
        {L('rumble', 'Deep rumble')}
        {L('wind', 'Wind bed')}
        {L('whistle', 'Whistle & howl')}
      </div>
      <div className="row">
        {L('gusts', 'Gust swells')}
        {L('thunder', 'Thunder')}
        {L('debris', 'Debris ticks')}
      </div>
      <small style={{ color: 'var(--ink-faint)' }}>
        Output is capped by a limiter and never exceeds safe levels, even at maximum simulated intensity up close.
        {p.running ? '' : ' Paused: rendering and audio processing are suspended.'}
      </small>
    </section>
  );
}
