import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Player } from '../components/Player';
import { AiExplain } from '../components/AiExplain';
import { ProvTag } from '../components/Bits';
import { InstrumentProfilePanel } from '../components/InstrumentProfilePanel';
import { summarizeSeries } from '../lib/dataUtils';
import { PROFILES } from '../types';
import { Icon } from '../components/Icon';
import { HelpTip } from '../components/HelpTip';

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
        <h2 style={{ margin: 0 }}>{d.title}{' '}
          <HelpTip label="this dataset">
            {d.description}
            <br /><br /><b>How it sounds:</b> {d.mappingNote} Louder or higher does not mean more dangerous.
            <br /><br /><small>Source: <a href={d.sourceUrl} target="_blank" rel="noreferrer">{d.sourceName}</a> · {d.license} · updated {d.updatedAt}</small>
          </HelpTip>
        </h2>
        <div className="meta">
          <span><Icon name="ruler" /> <code>{d.units}</code></span>
          <span><Icon name="clock" /> {d.coverage}</span>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="prof">Sound style{' '}
            <HelpTip label="sound style">{PROFILES.find((p) => p.id === mapping.profileId)?.blurb}</HelpTip>
          </label>
          <select id="prof" value={mapping.profileId} onChange={(e) => updateMapping({ profileId: e.target.value as never })}>
            {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.minFreq}–{p.maxFreq} Hz</option>)}
          </select>
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