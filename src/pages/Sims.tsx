import { useEffect, useState } from 'react';
import { HAZARDS } from '../sim/hazards';
import type { HazardId } from '../sim/hazards';
import { HazardSim } from './HazardSim';
import { SimArt } from '../components/SimArt';
import { useApp } from '../store/AppContext';
import { Icon } from '../components/Icon';

const DIFF_COLOR: Record<string, string> = { Gentle: 'var(--green)', Moderate: 'var(--amber)', Intense: 'var(--rose)' };

/** Unified Simulator Library: tornado + hazard worlds, all offline-ready. */
export function Sims() {
  const { setTab, simTarget, clearSimTarget } = useApp();
  const [selected, setSelected] = useState<HazardId | null>(null);

  // Deep link from the Online hub (e.g. a live wildfire → Wildfire sim).
  useEffect(() => {
    if (simTarget) {
      setSelected(simTarget);
      clearSimTarget();
    }
  }, [simTarget, clearSimTarget]);

  if (selected) {
    const def = HAZARDS.find((h) => h.id === selected)!;
    return <HazardSim key={def.id} hazardId={def.id} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="hero">
        <h1>Simulator <span className="accent">Library</span></h1>
        <p>{HAZARDS.length + 1} explorable training worlds with live synthesized sound. Pick one, walk around, and listen to the environment react to you. Everything is simulated — nothing here forecasts real disasters.</p>
      </div>
      <div className="grid">
        <article className="card">
          <SimArt id="tornado" className="simart" />
          <span className="tag" data-p="nasa-live"><Icon name="check" /> Available offline</span>
          <h3>Tornado Simulator</h3>
          <div className="meta"><span><Icon name="cyclone" /> Storms &amp; wind</span><span style={{ color: DIFF_COLOR.Intense }}><Icon name="activity" /> Intense</span></div>
          <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: 0 }}>Chase a funnel across the plains as an explorer. Distance-reactive roar with full storm presets.</p>
          <div className="row">
            <button className="btn sm primary" onClick={() => setTab('storm')}><Icon name="play" /> Launch</button>
          </div>
        </article>
        {HAZARDS.map((h) => (
          <article className="card" key={h.id}>
            <SimArt id={h.id} className="simart" />
            <span className="tag" data-p="nasa-live"><Icon name="check" /> Available offline</span>
            <h3>{h.title}</h3>
            <div className="meta">
              <span><Icon name="folder" /> {h.category}</span>
              <span style={{ color: DIFF_COLOR[h.difficulty] }}><Icon name="activity" /> {h.difficulty}</span>
            </div>
            <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: 0 }}>{h.blurb}</p>
            <small style={{ color: 'var(--ink-faint)' }}>Presets: {h.presets.map((p) => p.name).join(' · ')}</small>
            <div className="row">
              <button className="btn sm primary" onClick={() => setSelected(h.id)}><Icon name="play" /> Launch</button>
            </div>
          </article>
        ))}
      </div>
      <div className="alert" role="note" style={{ marginTop: 12 }}>
        All {HAZARDS.length + 1} simulators generate their 3D worlds and audio on your device, so they replay offline after first load.
        They teach how environmental sound works — for real emergencies, always follow official guidance.
      </div>
    </div>
  );
}
