import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { ProvTag } from '../components/Bits';
import { DataArt } from '../components/DataArt';
import type { DatasetMeta } from '../types';
import { Icon } from '../components/Icon';

export function Library() {
  const { datasets, downloadedIds, downloading, saveDataset, removeDataset, cancelDownload, experiences, storage, selectDataset, setTab } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => datasets.filter((d) => {
    const okQ = q.trim() === '' || `${d.title} ${d.category}`.toLowerCase().includes(q.toLowerCase());
    const okF = filter === 'all' || (filter === 'downloaded' && downloadedIds.has(d.id)) || (filter === 'demo' && d.provenance === 'sample');
    return okQ && okF;
  }).sort((a, b) => a.title.localeCompare(b.title)), [datasets, q, filter, downloadedIds]);

  const download = async (d: DatasetMeta) => {
    setErr(''); setMsg(''); setBusy(d.id);
    try { await saveDataset(d); setMsg(`“${d.title}” saved for offline use.`); }
    catch (e) { if ((e as Error).message !== 'Download cancelled.') setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="section-title"><h2>Dataset library</h2><span>{downloadedIds.size} saved offline</span></div>
      <div className="card">
        <div className="meta"><span><Icon name="database" /> Storage used: <b>{storage.usedMB} MB</b> of ~{storage.quotaMB} MB</span></div>
        <div className="row" role="search">
          <input type="search" placeholder="Search library…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search library" style={{ flex: '2 1 180px' }} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Library filter" style={{ flex: '1 1 140px' }}>
            <option value="all">All</option><option value="downloaded">Downloaded</option><option value="demo">Bundled demos</option>
          </select>
        </div>
      </div>
      {msg && <div className="alert" role="status" style={{ marginTop: 10 }}>{msg}</div>}
      {err && <div className="alert error" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div className="grid" style={{ marginTop: 12 }}>
        {rows.map((d) => {
          const prog = downloading[d.id];
          const saved = downloadedIds.has(d.id);
          return (
            <article className="card" key={d.id}>
              <DataArt dataset={d} className="dataart" />
              <ProvTag p={d.provenance} />
              <h3>{d.title}</h3>
              <div className="meta"><span>{d.points.length} frames</span><span>{d.units}</span><span>{saved ? <><Icon name="check" /> offline ready</> : <><Icon name="cloud" /> not downloaded</>}</span></div>
              {prog !== undefined && (
                <div>
                  <div className="progress" role="progressbar" aria-valuenow={Math.round(prog * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Downloading ${d.title}`}>
                    <div style={{ width: `${prog * 100}%` }} />
                  </div>
                  <button className="btn sm danger" onClick={() => cancelDownload(d.id)} style={{ marginTop: 6 }}>Cancel download</button>
                </div>
              )}
              <div className="row">
                <button className="btn sm primary" onClick={() => { selectDataset(d.id); setTab('listen'); }}><Icon name="play" /> Play</button>
                {!saved && prog === undefined && <button className="btn sm" disabled={busy === d.id} onClick={() => download(d)}>{busy === d.id ? 'Saving…' : <><Icon name="download" /> Download</>}</button>}
                {saved && d.provenance !== 'sample' && <button className="btn sm danger" onClick={() => removeDataset(d.id).then(() => setMsg('Deleted from offline storage.'))}><Icon name="trash" /> Delete</button>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="section-title"><h2>Saved experiences</h2><span>replayable offline</span></div>
      {experiences.length === 0 ? <div className="empty">No saved experiences yet — save one from the Listen tab.</div> :
        <div className="grid">{experiences.map((x) => (
          <div className="card" key={x.id}><h3>{x.name}</h3>
            <div className="meta"><span>{x.mapping.profileId}</span><span>{x.mapping.speed} fps</span></div>
            <button className="btn sm" onClick={() => { selectDataset(x.datasetId); setTab('listen'); }}><Icon name="refresh" /> Reopen</button>
          </div>))}</div>}
    </div>
  );
}
