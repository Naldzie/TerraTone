import { useCallback, useEffect, useRef, useState } from 'react';
import { TornadoViewport } from '../components/TornadoViewport';
import { StormAudioPanel } from '../components/StormAudioPanel';
import { NpcBubble, NpcChoices, useNpcChat } from '../components/NpcChat';
import { stormEngine, DEFAULT_LAYERS } from '../audio/stormEngine';
import type { StormLayerGains } from '../audio/stormEngine';
import {
  STORM_PRESETS, describeStorm, paramsFromPreset, presetById,
  corePressureDropMb, efScale, funnelWidthM,
} from '../sim/stormTypes';
import type { StormParams, StormPresetId } from '../sim/stormTypes';
import type { SimQuality, SimSnapshot } from '../sim/TornadoScene';
import { useApp } from '../store/AppContext';
import { Icon } from '../components/Icon';
import { requestLanding } from '../lib/landingNav';
import { BearingDial, GaugeBar } from '../components/Instruments';

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Enhanced Fujita rating from the simulated wind (real EF damage thresholds, km/h). */
function efRating(windKmh: number) {
  const ef = efScale(windKmh);
  return {
    frac: Math.min(1, windKmh / 323),
    text: ef < 0
      ? `~${Math.round(windKmh)} km/h · below EF0 (sim)`
      : `EF${ef} · ~${Math.round(windKmh)} km/h (sim)`,
  };
}

/** Interactive tornado simulator: 3D exploration + procedural storm audio. */
export function Tornado() {
  const { settings, avatar, setTab } = useApp();
  const [presetId, setPresetId] = useState<StormPresetId>('developing');
  const [storm, setStorm] = useState<StormParams>(() => paramsFromPreset(presetById('developing')));
  const [layers, setLayers] = useState<StormLayerGains>({ ...DEFAULT_LAYERS });
  const [masterVolume, setMasterVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(false);
  const [spatialOn, setSpatialOn] = useState(true);
  const [paused, setPaused] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [npcs, setNpcs] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [quality, setQuality] = useState<SimQuality>('medium');
  const [reduceEffects, setReduceEffects] = useState(settings.reduceMotion);
  const [hud, setHud] = useState({ dist: storm.distance, bearing: 180, level: 0 });

  // Live refs so the 60 fps sim loop never triggers React re-renders.
  const live = useRef({ storm, masterVolume, layers, spatialOn, muted });
  live.current = { storm, masterVolume, layers, spatialOn, muted };
  const audioOn = useRef(false);
  const hudSnap = useRef<SimSnapshot | null>(null);

  // Sim clock.
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setStorm((s) => ({ ...s, simTime: s.simTime + 1 })), 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  // Pause audio + rendering work together; resume both together.
  useEffect(() => {
    if (!audioOn.current) return;
    if (paused) stormEngine.suspend();
    else stormEngine.resume();
  }, [paused]);

  useEffect(() => () => { stormEngine.suspend(); }, []);

  const handleSnapshot = useCallback((s: SimSnapshot) => {
    hudSnap.current = s;
    if (!audioOn.current) return;
    const L = live.current;
    const now: StormParams = { ...L.storm, distance: s.distance };
    stormEngine.applyParams(now, L.muted ? 0 : L.masterVolume, L.layers);
    stormEngine.setBearing(s.bearing, s.distance, L.spatialOn);
  }, []);

  const getStormAnalyser = useCallback(() => stormEngine.analyserNode, []);

  // HUD + level meter at 4 Hz (cheap, accessible).
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = hudSnap.current;
      setHud({
        dist: s?.distance ?? live.current.storm.distance,
        bearing: s?.bearing ?? 180,
        level: audioOn.current ? stormEngine.outputLevel() : 0,
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const startAudio = () => {
    try {
      stormEngine.start();
      audioOn.current = true;
      const L = live.current;
      stormEngine.applyParams({ ...L.storm, distance: hudSnap.current?.distance ?? L.storm.distance }, L.muted ? 0 : L.masterVolume, L.layers, true);
      setAudioReady(true);
    } catch {
      setAudioReady(false);
    }
  };

  /** One Play starts visuals + sound together (the tap satisfies autoplay policy). */
  const play = () => {
    startAudio();
    setHasStarted(true);
    setPaused(false);
  };

  const togglePause = () => {
    if (!hasStarted) play();
    else setPaused((v) => !v);
  };

  // Talking to bystanders.
  const [chatNpc, setChatNpc] = useState<string | null>(null);
  const openChat = () => {
    const near = hudSnap.current?.nearNpc;
    if (near) setChatNpc(near.name);
  };
  const simContextForChat = () => {
    const s = hudSnap.current;
    return `tornado sim, preset ${preset.name}, simulated wind ~${storm.windKmh} km/h, ` +
      `intensity ${Math.round(storm.intensity * 100)}%, explorer ~${Math.round(s?.distance ?? storm.distance)} m from the funnel`;
  };

  const applyPreset = (id: StormPresetId) => {
    setPresetId(id);
    setStorm((s) => ({ ...paramsFromPreset(presetById(id)), simTime: 0 }));
    setResetSignal((n) => n + 1); // respawn at the preset's distance
  };

  const tweak = (patch: Partial<StormParams>) => {
    setPresetId('custom');
    setStorm((s) => ({ ...s, ...patch, preset: 'custom' as StormPresetId }));
  };

  const preset = presetById(presetId);
  const npcChat = useNpcChat(chatNpc ?? '', 'tornado', simContextForChat());

  const settingsPanel = (
    <>
      <div className="card">
        <h3 style={{ margin: '0 0 6px' }}>Storm intensity</h3>
        <div className="field">
          <label htmlFor="storm-preset">Preset</label>
          <select id="storm-preset" value={presetId} onChange={(e) => applyPreset(e.target.value as StormPresetId)}>
            {STORM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name} — ~{p.windKmh} km/h (simulated)</option>)}
          </select>
          <span className="hint">{preset.blurb}</span>
        </div>
        <div className="row">
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="st-int">Tornado intensity: {Math.round(storm.intensity * 100)}%</label>
            <input id="st-int" type="range" min={0.05} max={1} step={0.05} value={storm.intensity} onChange={(e) => tweak({ intensity: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="st-wind">Wind: {storm.windKmh} km/h (sim)</label>
            <input id="st-wind" type="range" min={20} max={300} step={5} value={storm.windKmh} onChange={(e) => tweak({ windKmh: Number(e.target.value) })} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="st-wv">Ambient wind volume</label>
            <input id="st-wv" type="range" min={0} max={1} step={0.05} value={storm.windVolume} onChange={(e) => tweak({ windVolume: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="st-rd">Rumbling depth</label>
            <input id="st-rd" type="range" min={0} max={1} step={0.05} value={storm.rumbleDepth} onChange={(e) => tweak({ rumbleDepth: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="st-gf">Gusts/min (sim): {storm.gustRate}</label>
            <input id="st-gf" type="range" min={2} max={30} step={1} value={storm.gustRate} onChange={(e) => tweak({ gustRate: Number(e.target.value) })} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="gfx">Graphics</label>
            <select id="gfx" value={quality} onChange={(e) => setQuality(e.target.value as SimQuality)}>
              <option value="low">Low (modest phones)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <label className="row" style={{ gap: 8, alignSelf: 'end' }}>
            <input type="checkbox" checked={reduceEffects} onChange={(e) => setReduceEffects(e.target.checked)} />
            <span>Reduce effects <small style={{ color: 'var(--ink-faint)' }}>(no lightning flashes)</small></span>
          </label>
          <label className="row" style={{ gap: 8, alignSelf: 'end' }}>
            <input type="checkbox" checked={npcs} onChange={(e) => setNpcs(e.target.checked)} />
            <span>Bystanders <small style={{ color: 'var(--ink-faint)' }}>(wandering NPCs)</small></span>
          </label>
        </div>
      </div>
      <StormAudioPanel
        storm={{ ...storm, distance: hud.dist }}
        layers={layers}
        onLayers={setLayers}
        masterVolume={masterVolume}
        onMasterVolume={setMasterVolume}
        muted={muted}
        onMuted={(m) => { setMuted(m); stormEngine.mute(m); }}
        spatialOn={spatialOn}
        onSpatial={setSpatialOn}
        running={!paused}
        audioReady={audioReady}
      />
    </>
  );

  return (
    <div>
      <div className="row simnav" data-tour="sim-nav">
        <button className="btn sm ghost" onClick={() => setTab('sims')} aria-label="Back to simulator library"><Icon name="arrow-left" /> All simulators</button>
        <button className="btn sm ghost" onClick={requestLanding} aria-label="Home: back to the landing page"><Icon name="home" /> Home</button>
      </div>
      <div className="hero" style={{ marginTop: 10 }}>
        <h1><Icon name="cyclone" /> Tornado <span className="accent">Simulator</span></h1>
        <p>
          Explore a virtual storm as an astronaut-like explorer. The roar is <b>synthesized live</b> in your browser —
          it gets louder and more detailed as you walk toward the funnel. A learning environment, not a forecast tool.
        </p>
        <div className="row">
          {!hasStarted
            ? <button className="btn primary" onClick={play}><Icon name="play" /> Play simulation</button>
            : paused
              ? <button className="btn" onClick={() => setPaused(false)}><Icon name="play" /> Resume</button>
              : <button className="btn" onClick={() => setPaused(true)}><Icon name="pause" /> Pause</button>}
          <button className="btn ghost" onClick={() => { setStorm((s) => ({ ...s, simTime: 0 })); setResetSignal((n) => n + 1); }}>
            <Icon name="restart" /> Reset
          </button>
        </div>
      </div>

      <div className="alert" role="note">
        <Icon name="warning" /> <b>Educational simulation only</b> — not real-time tracking or forecasting, and all wind speeds are simulated values.
        Never approach a real tornado. If you hear a tornado warning for your area, follow official guidance and take shelter.
      </div>

      <div className="simgrid">
        <div className="simstage">
          <TornadoViewport
            storm={storm}
            quality={quality}
            reduceEffects={reduceEffects}
            paused={paused}
            onSnapshot={handleSnapshot}
            onPauseRequest={togglePause}
            resetSignal={resetSignal}
            intensityLabel={preset.name}
            startOverlay={!hasStarted}
            onStart={play}
            npcs={npcs}
            avatar={avatar}
            onTalk={openChat}
            talkingNpc={chatNpc}
            chat={chatNpc ? <NpcBubble chat={npcChat} onClose={() => setChatNpc(null)} /> : null}
            chatChoices={chatNpc ? <NpcChoices chat={npcChat} onClose={() => setChatNpc(null)} /> : null}
            settings={settingsPanel}
            getAnalyser={getStormAnalyser}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <section className="card" aria-label="Simulation status">
            <h3 style={{ margin: '0 0 6px' }}>Status</h3>
            <table className="data">
              <tbody>
                <tr><th scope="row">Preset</th><td>{preset.name}</td></tr>
                <tr><th scope="row">Simulated wind</th><td>~{storm.windKmh} km/h (simulated, not measured)</td></tr>
                <tr><th scope="row">EF rating (sim)</th><td>{efScale(storm.windKmh) < 0 ? 'below EF0 · ~no damage' : `EF${efScale(storm.windKmh)} · ${storm.windKmh >= 267 ? 'incredible damage' : storm.windKmh >= 178 ? 'devastating damage' : storm.windKmh >= 138 ? 'considerable damage' : 'moderate damage'}`}</td></tr>
                <tr><th scope="row">Core pressure drop (sim)</th><td>~{Math.round(corePressureDropMb(storm.windKmh))} mb below ambient</td></tr>
                <tr><th scope="row">Funnel width (sim)</th><td>~{funnelWidthM(storm.windKmh)} m across the base</td></tr>
                <tr><th scope="row">Distance to funnel</th><td>~{Math.round(hud.dist)} m (virtual)</td></tr>
                <tr><th scope="row">Bearing</th><td>{Math.round(hud.bearing)}°</td></tr>
                <tr><th scope="row">Simulation time</th><td>{fmtTime(storm.simTime)}</td></tr>
                <tr><th scope="row">Output level</th><td>
                  <span className="progress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.level * 100)} aria-label="Audio output level">
                    <span style={{ display: 'block', width: `${hud.level * 100}%` }} />
                  </span>
                </td></tr>
              </tbody>
            </table>
            <BearingDial bearing={hud.bearing} label="Bearing to funnel" />
            <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
              <GaugeBar label="EF rating (sim)" {...efRating(storm.windKmh)} />
              <GaugeBar
                label="Core pressure drop (sim)"
                frac={Math.min(1, corePressureDropMb(storm.windKmh) / 115)}
                text={`~${Math.round(corePressureDropMb(storm.windKmh))} mb below ambient (sim)`}
              />
              <GaugeBar
                label="Funnel width (sim)"
                frac={Math.min(1, funnelWidthM(storm.windKmh) / 600)}
                text={`~${funnelWidthM(storm.windKmh)} m across the base (sim)`}
              />
              <GaugeBar
                label="Funnel proximity"
                frac={Math.max(0, Math.min(1, 1 - hud.dist / 400))}
                text={`~${Math.round(hud.dist)} m · ${hud.dist < 150 ? 'inside the danger ring' : hud.dist < 260 ? 'close' : 'at a safe spread'}`}
              />
            </div>
            <h4>How distance becomes sound</h4>
            <p style={{ fontSize: '.88rem', color: 'var(--ink-dim)' }}>{describeStorm({ ...storm, distance: hud.dist }, muted ? 0 : masterVolume)}</p>
            <ul style={{ fontSize: '.85rem', color: 'var(--ink-dim)' }}>
              <li>Closer → louder overall (smooth curve, never linear jumps), deeper rumble, brighter whistle.</li>
              <li>Cross the <b>yellow ring (~60 m)</b> and the funnel picks you up — push outward to break free, or ride it out and get flung clear.</li>
              <li><Icon name="helicopter" /> <Icon name="car" /> A big helicopter and car wait near your spawn — walk up and press <b>E</b> (or Ride) to take it; hold Jump (Space) to climb the copter. Fly or drive into the yellow ring and the funnel grabs the vehicle too. Bystanders steal parked vehicles for joyrides — and the funnel grabs those too.</li>
              <li>The funnel roams the map, flattening trees and scattering bystanders in its path (both recover).</li>
              <li>Farther → quiet distant rumble; fine detail fades first, like a real storm on the horizon.</li>
              <li>Left/right placement follows the funnel's direction around you (graceful stereo fallback on basic speakers).</li>
            </ul>
            <h4>Learn</h4>
            <p style={{ fontSize: '.85rem', color: 'var(--ink-dim)' }}>
              Tornadoes are born where warm, moist air meets cool, dry air under strong wind shear. The shear lays a
              horizontal rolling tube of air that a thunderstorm updraft tips vertical; conservation of angular
              momentum tightens the spin — the same physics that lets a skater spin faster by pulling in their arms —
              and a rotating funnel drops from the wall cloud. The visible condensation funnel only marks where pressure
              has fallen far enough for vapour to condense; the damaging winds continue invisibly below it. The
              <b> Enhanced Fujita scale</b> rates a tornado by the damage its winds leave behind — EF0 snaps branches,
              EF5 sweeps building foundations clean — which is why the meter above reads a rating, not a measurement.
              The simulated winds here never leave the screen.
            </p>
            <small style={{ color: 'var(--ink-faint)' }}>Works offline after first load — 3D and audio are generated on-device; no NASA data needed.</small>
          </section>
        </div>
      </div>
    </div>
  );
}
