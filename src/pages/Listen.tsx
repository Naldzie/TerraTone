import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Player } from '../components/Player';
import { AiExplain } from '../components/AiExplain';
import { ProvTag } from '../components/Bits';
import { InstrumentProfilePanel } from '../components/InstrumentProfilePanel';
import { summarizeSeries } from '../lib/dataUtils';
import { PROFILES } from '../types';
import { Icon } from '../components/Icon';

export function Listen() {
  const { datasets, currentDataset: d, selectDataset, mapping, updateMapping, setTab } = useApp();
  const [datasetPlaying, setDatasetPlaying] = useState(false);
  if (!d) return <div className="empty">No dataset available.</div>;
  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 260px', margin: 0 }}>
          <label htmlFor="ds">Dataset</label>
          <select id="ds" value={d.id} onChange={(e) => selectDataset(e.target.value)}>
            {datasets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </div>
        <button
          className="btn sm ghost"
          onClick={() => setTab('online')}
          title="Open the Live tab to read NASA's newest published values"
        >
          <Icon name="broadcast" /> {d.provenance === 'nasa-live' ? 'Newer live data' : 'Get live NASA data'}
        </button>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <ProvTag p={d.provenance} />
        <h2 style={{ margin: 0 }}>{d.title}</h2>
        <p style={{ color: 'var(--ink-dim)', margin: 0 }}>{d.description}</p>
        <div className="meta">
          <span><Icon name="ruler" /> <code>{d.units}</code> (range {d.range[0]}…{d.range[1]})</span>
          <span><Icon name="clock" /> {d.coverage} · {d.resolution}</span>
          <span><Icon name="building" /> Source: <a href={d.sourceUrl} target="_blank" rel="noreferrer">{d.sourceName}</a></span>
          <span><Icon name="scroll" /> {d.license}</span>
          <span><Icon name="refresh" /> Updated {d.updatedAt}</span>
        </div>
        <p className="callout">
          <b>Mapping meaning:</b> {d.mappingNote} Sonification is illustrative — a louder or higher sound is
          <b> not </b> automatically a more severe event; it only reflects the mapping you chose below.
        </p>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="prof">Dataset sound profile</label>
          <select id="prof" value={mapping.profileId} onChange={(e) => updateMapping({ profileId: e.target.value as never })}>
            {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.minFreq}–{p.maxFreq} Hz</option>)}
          </select>
          <span className="hint">{PROFILES.find((p) => p.id === mapping.profileId)?.blurb}</span>
        </div>
        <InstrumentProfilePanel embedded playing={datasetPlaying} />
      </div>
      <Player onPlayingChange={setDatasetPlaying} />
      <AiExplain brief={{
        title: d.title,
        units: d.units,
        range: d.range,
        summary: summarizeSeries(d.points),
        mappingNote: d.mappingNote,
        profile: PROFILES.find((p) => p.id === mapping.profileId)?.name ?? mapping.profileId,
      }} />
    </div>
  );
}