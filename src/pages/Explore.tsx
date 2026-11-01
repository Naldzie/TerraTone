import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { ProvTag } from '../components/Bits';
import { DataArt } from '../components/DataArt';
import { CATEGORIES, PROFILES } from '../types';
import { EIC_URL, fetchPowerClimatology, searchCmrCollections } from '../lib/nasa';
import { Icon } from '../components/Icon';
import { HelpTip } from '../components/HelpTip';

export function Explore() {
  const { datasets, currentDatasetId, selectDataset, setTab, recent, connection, addSessionDataset } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [lat, setLat] = useState('37.0');
  const [lon, setLon] = useState('-122.0');
  const [liveMsg, setLiveMsg] = useState('');
  const [liveErr, setLiveErr] = useState('');
  const [liveBusy, setLiveBusy] = useState(false);
  const [cmr, setCmr] = useState<{ title: string; id: string }[]>([]);
  const [cmrQ, setCmrQ] = useState('sea surface temperature');

  // Only show categories that actually have datasets.
  const availableCats = useMemo(() => {
    const have = new Set(datasets.map((d) => d.category));
    return ['All', ...CATEGORIES.filter((c) => have.has(c))];
  }, [datasets]);

  const filtered = useMemo(() => datasets.filter((d) =>
    (cat === 'All' || d.category === cat) &&
    (q.trim() === '' || `${d.title} ${d.description} ${d.category}`.toLowerCase().includes(q.toLowerCase())),
  ), [datasets, q, cat]);

  const fetchLive = async () => {
    setLiveBusy(true); setLiveErr(''); setLiveMsg('');
    try {
      const d = await fetchPowerClimatology(Number(lat), Number(lon));
      addSessionDataset(d);
      selectDataset(d.id);
      setLiveMsg(`Live NASA POWER data loaded: ${d.points.length} monthly normals. It is in this session — press Download to keep it offline.`);
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : 'Live fetch failed. Try the bundled demos or a saved download.');
    } finally { setLiveBusy(false); }
  };

  const runCmr = async () => {
    setLiveErr('');
    try { setCmr(await searchCmrCollections(cmrQ)); }
    catch (e) { setLiveErr(e instanceof Error ? e.message : 'CMR search failed.'); }
  };

  return (
    <div>
      <div className="hero">
        <h1>Hear the <span className="accent">Pulse of Our Planet</span>{' '}
          <HelpTip label="TerraTone">
            <b>Earth data you can hear.</b>
            <ol>
              <li>Pick a dataset</li>
              <li>Values become pitch, loudness and rhythm</li>
              <li>Sound and chart play together</li>
              <li>Save it and replay offline</li>
            </ol>
          </HelpTip>
        </h1>
        <div className="row">
          <span className="conn" data-s={connection} style={{ margin: 0 }}>
            <span className="dot" aria-hidden="true" />{connection === 'online' ? 'Online' : connection === 'cached' ? 'Using cached data' : 'Offline'}
          </span>
          <a className="btn sm ghost" href={EIC_URL} target="_blank" rel="noreferrer"><Icon name="satellite" /> NASA Earth Information Center</a>
        </div>
      </div>

      <div className="section-title"><h2>Featured datasets</h2><span>{filtered.length} available</span></div>
      <div className="row" role="search">
        <input type="search" placeholder="Search datasets…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search datasets" style={{ flex: '2 1 200px' }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category" style={{ flex: '1 1 160px' }}>
          {availableCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        {filtered.map((d) => (
          <article className="card" key={d.id} aria-current={d.id === currentDatasetId ? 'true' : undefined}>
            <DataArt dataset={d} className="dataart" />
            <ProvTag p={d.provenance} />
            <h3>{d.title}{' '}
              <HelpTip label={d.title}>
                {d.description}
                <br /><small>Source: <a href={d.sourceUrl} target="_blank" rel="noreferrer">{d.sourceName}</a></small>
              </HelpTip>
            </h3>
            <div className="meta">
              <span><Icon name="folder" /> {d.category}</span>
              <span><Icon name="clock" /> {d.coverage}</span>
            </div>
            <div className="row">
              <button className="btn sm primary" onClick={() => { selectDataset(d.id); setTab('listen'); }}><Icon name="play" /> Open & listen</button>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <div className="empty">No datasets match. Clear the search or pick another category.</div>}

      <div className="section-title"><h2>Live NASA data</h2></div>
      <div className="card">
        <h3><Icon name="thermometer" /> Temperature for any place{' '}
          <HelpTip label="live temperature">
            Gets 12 monthly temperature averages from NASA POWER for the spot you enter. Free, no key.
          </HelpTip>
        </h3>
        <div className="row">
          <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="lat">Latitude</label>
            <input id="lat" type="number" min={-90} max={90} step={0.1} value={lat} onChange={(e) => setLat(e.target.value)} /></div>
          <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="lon">Longitude</label>
            <input id="lon" type="number" min={-180} max={180} step={0.1} value={lon} onChange={(e) => setLon(e.target.value)} /></div>
          <button className="btn primary" onClick={fetchLive} disabled={liveBusy || connection === 'offline'} style={{ alignSelf: 'end' }}>
            {liveBusy ? 'Fetching…' : <><Icon name="download" /> Fetch live data</>}
          </button>
        </div>
        {connection === 'offline' && <div className="alert warn">You are offline — new live NASA data cannot be fetched. Use bundled demos or saved downloads.</div>}
        {liveMsg && <div className="alert" role="status">{liveMsg}</div>}
        {liveErr && <div className="alert error" role="alert">{liveErr}</div>}
        <div className="field">
          <label htmlFor="cmrq">Search NASA's catalog{' '}
            <HelpTip label="catalog search">Finds real NASA datasets by name (citations, not values).</HelpTip>
          </label>
          <div className="row">
            <input id="cmrq" type="text" value={cmrQ} onChange={(e) => setCmrQ(e.target.value)} style={{ flex: '2 1 200px' }} />
            <button className="btn sm" onClick={runCmr} disabled={connection === 'offline'}><Icon name="search" /> Search NASA CMR</button>
          </div>
        </div>
        {cmr.length > 0 && (
          <ul>{cmr.map((c) => <li key={c.id} style={{ fontSize: '.85rem' }}>{c.title} <code style={{ color: 'var(--ink-faint)' }}>{c.id}</code></li>)}</ul>
        )}
      </div>

      <div className="alert row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <span><Icon name="satellite" /> Live weather and natural events</span>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => setTab('online')}><Icon name="broadcast" /> Live</button>
          <button className="btn sm" onClick={() => setTab('events')}><Icon name="flame" /> Events</button>
        </span>
      </div>

      <div className="section-title"><h2>Recently played</h2><span>on this device</span></div>
      {recent.length === 0
        ? <div className="empty">Nothing yet — press Play on any dataset and it will appear here.</div>
        : <div className="grid">{recent.map((r) => (
          <div className="card" key={r.id}>
            <h3>{r.name}</h3>
            <div className="meta"><span><Icon name="volume-on" /> {PROFILES.find((p) => p.id === r.mapping.profileId)?.name}</span><span><Icon name="clock" /> {new Date(r.lastPlayedAt).toLocaleString()}</span></div>
            <button className="btn sm" onClick={() => { selectDataset(r.datasetId); setTab('listen'); }}><Icon name="refresh" /> Replay</button>
          </div>))}</div>}
    </div>
  );
}
