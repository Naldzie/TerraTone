import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimViewport } from '../components/SimViewport';
import { HazardAudioPanel } from '../components/HazardAudioPanel';
import { Icon } from '../components/Icon';
import { SeismicPanel } from '../components/SeismicPanel';
import { AmbienceEngine } from '../audio/ambience';
import { clampVals, hazardById } from '../sim/hazards';
import type { HazardDef, HazardId, Vals } from '../sim/hazards';
import type { EnvQuality, EnvSnapshot } from '../sim/EnvSim';
import { hurricaneFeature, hurricanePalette } from '../sim/packs/hurricane';
import { earthquakeFeature, earthquakePalette } from '../sim/packs/earthquake';
import { volcanoFeature, volcanoPalette } from '../sim/packs/volcano';
import { oceanDrift, oceanFeature, oceanPalette, buildSubmersible } from '../sim/packs/ocean';
import type { EnvVehicleDef } from '../sim/EnvSim';
import { wildfireFeature, wildfirePalette } from '../sim/packs/wildfire';
import { tsunamiFeature, tsunamiPalette } from '../sim/packs/tsunami';
import { blackholeFeature, blackholePalette, blackholePull, BH_KILL_ZONE } from '../sim/packs/blackhole';
import { bigbangFeature, bigbangPalette } from '../sim/packs/bigbang';
import { spaceshipDef } from '../sim/packs/spaceship';
import { sunFeature, sunPalette } from '../sim/packs/sun';
import { useApp } from '../store/AppContext';
import { NpcBubble, NpcChoices, useNpcChat } from '../components/NpcChat';
import { BearingDial, GaugeBar } from '../components/Instruments';
import type { GuideTopic } from '../lib/nasaGuide';

const OCEAN_VEHICLE: EnvVehicleDef = {
  label: 'Scuba sub', icon: 'scuba', speed: 12, boostSpeed: 20, build: buildSubmersible,
  hint: 'Swim to the big yellow sub, press E or Ride — joystick steers, hold Rise to ascend, Run boosts.',
};

/* Space worlds: zero-g EVA in full suits, with a flyable shuttle parked nearby. */
const SPACE: Partial<Record<HazardId, { vehicle: EnvVehicleDef; env: Record<string, unknown> }>> = {
  sun: {
    vehicle: spaceshipDef({ x: 30, y: 3, z: 150 }),
    env: { zeroG: true, spaceSuit: true, npcFleeRadius: 0 },
  },
  blackhole: {
    vehicle: spaceshipDef({ x: 30, y: 6, z: 160 }),
    env: { zeroG: true, noGround: true, spaceSuit: true, npcFleeRadius: 0, faceHazard: true, pull: blackholePull, killZone: BH_KILL_ZONE },
  },
  bigbang: {
    vehicle: spaceshipDef({ x: 30, y: 6, z: 160 }),
    env: { zeroG: true, noGround: true, spaceSuit: true, npcFleeRadius: 0, faceHazard: true },
  },
};

function vehicleFor(id: HazardId): EnvVehicleDef | undefined {
  return id === 'ocean' ? OCEAN_VEHICLE : SPACE[id]?.vehicle;
}

const PACKS = {
  hurricane: { palette: hurricanePalette, feature: hurricaneFeature, suit: 0xe8eef7, accent: 0x22d3ee, swim: false, roads: true },
  earthquake: { palette: earthquakePalette, feature: earthquakeFeature, suit: 0xd8d4c8, accent: 0xfbbf24, swim: false, roads: true },
  volcano: { palette: volcanoPalette, feature: volcanoFeature, suit: 0xc8c2b8, accent: 0xff5a1a, swim: false, roads: false },
  ocean: { palette: oceanPalette, feature: oceanFeature, suit: 0x1f8a70, accent: 0x5ff5d2, swim: true, roads: false },
  wildfire: { palette: wildfirePalette, feature: wildfireFeature, suit: 0xd8b25a, accent: 0xff7a1a, swim: false, roads: false },
  tsunami: { palette: tsunamiPalette, feature: tsunamiFeature, suit: 0xd8cfc0, accent: 0x4aa8e8, swim: false, roads: false },
  blackhole: { palette: blackholePalette, feature: blackholeFeature, suit: 0xeef1f5, accent: 0xc084fc, swim: false, roads: false },
  bigbang: { palette: bigbangPalette, feature: bigbangFeature, suit: 0xeef1f5, accent: 0xfde68a, swim: false, roads: false },
  sun: { palette: sunPalette, feature: sunFeature, suit: 0xeef2f8, accent: 0xffb547, swim: false, roads: false },
} as const;

const HAZARD_EVENT: Record<HazardId, { hazardX: number; hazardZ: number; hazardKind: string; hazardLabel: string }> = {
  hurricane: { hazardX: 0, hazardZ: 0, hazardKind: 'eye', hazardLabel: 'Hurricane Eye' },
  earthquake: { hazardX: 0, hazardZ: 0, hazardKind: 'epicenter', hazardLabel: 'Epicenter' },
  volcano: { hazardX: 0, hazardZ: 0, hazardKind: 'crater', hazardLabel: 'Crater' },
  wildfire: { hazardX: 0, hazardZ: -40, hazardKind: 'front', hazardLabel: 'Fire Front' },
  ocean: { hazardX: 20, hazardZ: 140, hazardKind: 'submersible', hazardLabel: 'Scuba Sub' },
  tsunami: { hazardX: 0, hazardZ: 60, hazardKind: 'tsunami', hazardLabel: 'Wave Front' },
  blackhole: { hazardX: 0, hazardZ: 0, hazardKind: 'blackhole', hazardLabel: 'Black Hole' },
  bigbang: { hazardX: 0, hazardZ: 0, hazardKind: 'bigbang', hazardLabel: 'Cosmic Patch' },
  sun: { hazardX: 0, hazardZ: 330, hazardKind: 'sun', hazardLabel: 'Sunward Ridge' },
};

function fmtVal(def: HazardDef, key: string, v: number): string {
  const p = def.paramDefs.find((d) => d.key === key);
  if (!p) return String(v);
  const shown = p.unit === '%' ? Math.round(v * 100) : p.step < 1 && p.max <= 10 ? v.toFixed(1) : Math.round(v * 10) / 10;
  return `${shown}${p.unit === '%' ? '%' : ` ${p.unit}`}`;
}

export function HazardSim({ hazardId, onBack }: { hazardId: HazardId; onBack: () => void }) {
  const def = hazardById(hazardId);
  const pack = PACKS[hazardId];
  const { settings, setTab, avatar } = useApp();

  const [vals, setValsState] = useState<Vals>(() => ({ ...def.defaults }));
  const [presetId, setPresetId] = useState('custom');
  const [spawn, setSpawn] = useState(180);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [masterVolume, setMasterVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(false);
  const [spatialOn, setSpatialOn] = useState(true);
  const [paused, setPaused] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [npcs, setNpcs] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [quality, setQuality] = useState<EnvQuality>('medium');
  const [reduceEffects, setReduceEffects] = useState(settings.reduceMotion);
  const [tremorUi, setTremorUi] = useState(0);
  const [hud, setHud] = useState({ dist: spawn, bearing: 180, level: 0 });

  const engineRef = useRef<AmbienceEngine | null>(null);
  const audioOn = useRef(false);
  const tremorUntil = useRef(0);
  const elapsed = useRef(0);
  const hudSnap = useRef<EnvSnapshot | null>(null);
  const live = useRef({ vals, masterVolume, levels, spatialOn, muted });
  live.current = { vals, masterVolume, levels, spatialOn, muted };

  const magN = def.id === 'earthquake' ? ((vals.magnitude - 3) / 5.5) : 0;

  const tremorEnv = useCallback(() => {
    if (def.id !== 'earthquake') return 0;
    const now = Date.now();
    if (now >= tremorUntil.current) return 0;
    const total = Math.max(1, vals.duration) * 1000;
    const remain = tremorUntil.current - now;
    const p = 1 - remain / total; // 0 → 1
    const attack = Math.min(1, p / 0.08);
    const release = Math.min(1, remain / (total * 0.25));
    return Math.min(attack, release);
  }, [def.id, vals.duration]);

  const valsWithTremor = useMemo(() => ({ ...vals, _tremor: tremorUi }), [vals, tremorUi]);

  // For tsunami: include elapsed time for wave countdown
  const valsForHud = useMemo(() => {
    if (def.id === 'tsunami') {
      return { ...valsWithTremor, simTime: elapsed.current };
    }
    return valsWithTremor;
  }, [valsWithTremor, def.id, elapsed.current]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => { elapsed.current += 0.25; }, 250);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!audioOn.current || !engineRef.current) return;
    if (paused) engineRef.current.suspend();
    else engineRef.current.resume();
  }, [paused]);

  useEffect(() => () => { engineRef.current?.dispose(); engineRef.current = null; }, []);

  const handleSnapshot = useCallback((s: EnvSnapshot) => {
    hudSnap.current = s;
    const eng = engineRef.current;
    if (!audioOn.current || !eng) return;
    const L = live.current;
    const v = { ...L.vals, _tremor: tremorEnvRef.current() };
    const g = def.gains(v, s.distance);
    const f = def.freqs?.(v, s.distance) ?? {};
    for (const key of Object.keys(g)) {
      eng.setLayer(key, g[key] * (L.levels[key] ?? 1), f[key]);
    }
    const tn = def.tone(v, s.distance, elapsed.current);
    eng.setTone(tn.level, tn.freq);
    eng.setBoom(def.boom(v, s.distance));
    const tk = def.ticks(v, s.distance);
    eng.setTicks(tk.rate, tk.level, tk.hp);
    const sb = def.sub?.(v, s.distance);
    if (sb) eng.setSub(sb.level, sb.freq);
    eng.setBearing(s.bearing, s.distance, L.spatialOn);
  }, [def]);
  const tremorEnvRef = useRef(tremorEnv);
  tremorEnvRef.current = tremorEnv;

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = hudSnap.current;
      setTremorUi(+tremorEnvRef.current().toFixed(2));
      setHud({
        dist: s?.distance ?? spawn,
        bearing: s?.bearing ?? 180,
        level: audioOn.current && engineRef.current ? engineRef.current.outputLevel() : 0,
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [spawn]);

  const startAudio = () => {
    try {
      if (!engineRef.current) {
        const eng = new AmbienceEngine();
        eng.start(def.layers, def.withTone);
        eng.setTickMode(def.tickMode ?? 'hiss', ...(def.tickBand ?? [1500, 5000]));
        engineRef.current = eng;
      }
      engineRef.current.setMaster(muted ? 0 : masterVolume, muted);
      audioOn.current = true;
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

  // Talking to bystanders: answers draw on NASA research via your AI key.
  const [chatNpc, setChatNpc] = useState<string | null>(null);
  const openChat = () => {
    const near = hudSnap.current?.nearNpc;
    if (near) setChatNpc(near.name);
  };
  const simContextForChat = () => {
    const s = hudSnap.current;
    const vars = def.hud(s?.distance ?? spawn, s?.bearing ?? 180, valsWithTremor);
    return `${def.title} (SIMULATED world): ` + vars.map((h) => `${h.label} ${h.value}`).join(', ');
  };
  const npcChat = useNpcChat(chatNpc ?? '', hazardId as GuideTopic, simContextForChat());

  const setVals = (patch: Vals) => {
    setPresetId('custom');
    setValsState((s) => clampVals(def, { ...s, ...patch }));
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    if (id === 'custom') return;
    const p = def.presets.find((x) => x.id === id);
    if (!p) return;
    setValsState(clampVals(def, { ...def.defaults, ...p.values }));
    setSpawn(p.spawn);
    setResetSignal((n) => n + 1);
  };

  const getAnalyser = useCallback(() => engineRef.current?.analyserNode ?? null, []);
  const getShaking = useCallback(() => tremorEnvRef.current(), []);

  const hudVars = def.hud(hud.dist, hud.bearing, valsForHud);
  const bearingLabel = hudVars.find((h) => /bearing/i.test(h.label));
  const shakeAmt = def.id === 'earthquake' ? tremorUi * (vals.shake ?? 0.7) * (0.3 + magN) : 0;
  const oceanTop = 0.12 + (vals.depth / 200) * 0.3;
  const oceanBottom = 0.2 + (vals.depth / 200) * 0.35;

  const settingsPanel = (
    <>
      <div className="card">
        <h3 style={{ margin: '0 0 6px' }}>Simulation parameters <small style={{ color: 'var(--ink-faint)' }}>all simulated</small></h3>
        <div className="field">
          <label htmlFor="hz-preset">Preset</label>
          <select id="hz-preset" value={presetId} onChange={(e) => applyPreset(e.target.value)}>
            <option value="custom">Custom Simulation</option>
            {def.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="hint">{def.presets.find((p) => p.id === presetId)?.blurb ?? 'Your own mix of the sliders below.'}</span>
        </div>
        {def.paramDefs.map((p) => (
          <div className="field" key={p.key}>
            <label htmlFor={`hp-${p.key}`}>{p.label}: {fmtVal(def, p.key, vals[p.key])}</label>
            <input id={`hp-${p.key}`} type="range" min={p.min} max={p.max} step={p.step} value={vals[p.key]}
              onChange={(e) => setVals({ [p.key]: Number(e.target.value) })} />
            <span className="hint">{p.hint}</span>
          </div>
        ))}
        <div className="row">
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="hz-gfx">Graphics</label>
            <select id="hz-gfx" value={quality} onChange={(e) => setQuality(e.target.value as EnvQuality)}>
              <option value="low">Low (modest phones)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <label className="row" style={{ gap: 8, alignSelf: 'end' }}>
            <input type="checkbox" checked={reduceEffects} onChange={(e) => setReduceEffects(e.target.checked)} />
            <span>Reduce effects</span>
          </label>
          <label className="row" style={{ gap: 8, alignSelf: 'end' }}>
            <input type="checkbox" checked={npcs} onChange={(e) => setNpcs(e.target.checked)} />
            <span>Bystanders <small style={{ color: 'var(--ink-faint)' }}>(NPCs)</small></span>
          </label>
        </div>
      </div>
      <HazardAudioPanel
        def={def}
        levels={levels}
        onLevels={setLevels}
        masterVolume={masterVolume}
        onMasterVolume={(v) => { setMasterVolume(v); engineRef.current?.setMaster(muted ? 0 : v, muted); }}
        muted={muted}
        onMuted={(m) => { setMuted(m); engineRef.current?.setMaster(m ? 0 : masterVolume, m); }}
        spatialOn={spatialOn}
        onSpatial={setSpatialOn}
        running={!paused}
        audioReady={audioReady}
        statusLine={def.status(valsForHud, hud.dist)}
      />
    </>
  );

  return (
    <div>
      <button className="btn sm ghost" onClick={onBack} aria-label="Back to simulator library"><Icon name="arrow-left" /> All simulators</button>
      <div className="hero" style={{ marginTop: 10 }}>
        <h1><Icon name={def.icon} /> {def.title.replace(' Simulator', '')} <span className="accent">Simulator</span></h1>
        <p>{def.blurb}</p>
        <div className="row">
          {!hasStarted
            ? <button className="btn primary" onClick={play}><Icon name="play" /> Play simulation</button>
            : paused
              ? <button className="btn" onClick={() => setPaused(false)}><Icon name="play" /> Resume</button>
              : <button className="btn" onClick={() => setPaused(true)}><Icon name="pause" /> Pause</button>}
          <button className="btn ghost" onClick={() => setResetSignal((n) => n + 1)}><Icon name="restart" /> Reset</button>
          {def.tremorButton && (
            <button className="btn" onClick={() => { if (!hasStarted) play(); tremorUntil.current = Date.now() + vals.duration * 1000; }}>
              <Icon name="vibrate" /> Trigger tremor ({vals.duration}s)
            </button>
          )}
        </div>
      </div>

      <div className="alert" role="note"><Icon name="warning" /> <b>Simulated training world</b> — not live data, not a forecast. {def.safety}</div>

      <div className="simgrid" style={{ marginTop: 12 }}>
        <div className="simstage">
          <SimViewport
            env={{
              palette: pack.palette, feature: pack.feature,
              roads: pack.roads, suitColor: pack.suit, accentColor: pack.accent,
              swim: pack.swim, drift: hazardId === 'ocean' ? oceanDrift : undefined,
              vehicle: vehicleFor(hazardId),
              ...HAZARD_EVENT[hazardId],
              ...(SPACE[hazardId]?.env ?? {}),
            }}
            vehicle={vehicleFor(hazardId)}
            vals={valsWithTremor}
            shake={shakeAmt}
            quality={quality}
            reduceEffects={reduceEffects}
            paused={paused}
            spawn={spawn}
            resetSignal={resetSignal}
            chips={[`${def.difficulty}`, ...hudVars.slice(0, 2).map((h) => `${h.value}`)]}
            onSnapshot={handleSnapshot}
            onPauseRequest={togglePause}
            startOverlay={!hasStarted}
            onStart={play}
            npcs={npcs}
            avatar={avatar}
            onTalk={openChat}
            talkingNpc={chatNpc}
            chat={chatNpc ? <NpcBubble chat={npcChat} onClose={() => setChatNpc(null)} /> : null}
            chatChoices={chatNpc ? <NpcChoices chat={npcChat} onClose={() => setChatNpc(null)} /> : null}
            settings={settingsPanel}
            getAnalyser={getAnalyser}
          />
          {hazardId === 'ocean' && (
            <div aria-hidden="true" className="oceanTint" style={{ opacity: 1, background: 'linear-gradient(180deg, rgba(6,40,61,' + oceanTop.toFixed(2) + '), rgba(2,12,24,' + oceanBottom.toFixed(2) + '))' }} />
          )}
        </div>
        <div className="simbelow" style={{ gridColumn: '1 / -1' }}>
          {def.seismo && <SeismicPanel getShaking={getShaking} magnitude={vals.magnitude} />}
          <section className="card" aria-label="Simulation status">
            <h3 style={{ margin: '0 0 6px' }}>Status</h3>
            <table className="data">
              <tbody>
                {hudVars.map((h) => <tr key={h.label}><th scope="row">{h.label}</th><td>{h.value}</td></tr>)}
                <tr><th scope="row">Output level</th><td>
                  <span className="progress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.level * 100)} aria-label="Audio output level">
                    <span style={{ display: 'block', width: `${hud.level * 100}%` }} />
                  </span>
                </td></tr>
              </tbody>
            </table>
            {bearingLabel && <BearingDial bearing={hud.bearing} label={bearingLabel.label} />}
            {def.gauges && (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                {def.gauges(valsForHud).map((g) => <GaugeBar key={g.label} {...g} />)}
              </div>
            )}
            <h4>How the sound is made</h4>
            <ul style={{ fontSize: '.85rem', color: 'var(--ink-dim)' }}>
              {def.mappingExpl.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <h4>Learn</h4>
            <p style={{ fontSize: '.85rem', color: 'var(--ink-dim)' }}>{def.edu}</p>
            <div className="row">
              <button className="btn sm ghost" onClick={() => setTab('storm')}><Icon name="cyclone" /> Try the tornado too</button>
              <small style={{ color: 'var(--ink-faint)' }}>Offline-ready after first load — all geometry and audio generate on-device.</small>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
