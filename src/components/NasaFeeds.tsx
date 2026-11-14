/* Live tab feeds from NASA FIRMS (active fires) and the Scientific
 * Visualization Studio (visualizations you can play as sound). */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { DatasetMeta } from '../types';
import {
  FIRMS_REGIONS, fetchFirmsFires, firmsDataset, hasFirmsAccess, searchSvs, svsImageDataset,
} from '../lib/nasaApis';
import type { FirmsFire, SvsItem } from '../lib/nasaApis';
import { Icon } from './Icon';
import { HelpTip } from './HelpTip';

interface FeedProps { disabled?: boolean; onPlay: (d: DatasetMeta) => void }

export function FiresPanel({ disabled, onPlay }: FeedProps) {
  const [regionId, setRegionId] = useState(FIRMS_REGIONS[0].id);
  const [days, setDays] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fires, setFires] = useState<FirmsFire[] | null>(null);
  const region = FIRMS_REGIONS.find((r) => r.id === regionId) ?? FIRMS_REGIONS[0];
  const ready = hasFirmsAccess();

  const load = async (play: boolean) => {
    setBusy(true); setErr('');
    try {
      const list = await fetchFirmsFires(region, days);
      setFires(list);
      if (play) onPlay(firmsDataset(region, days, list));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'FIRMS request failed.');
    } finally {
      setBusy(false);
    }
  };

  const strongest = fires ? [...fires].sort((a, b) => b.frp - a.frp)[0] : null;
  const dayCount = fires ? fires.filter((f) => f.daynight === 'D').length : 0;

  return (
    <div className="card feedcard">
      <div className="row">
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="firms-region">Region</label>
          <select id="firms-region" value={regionId} onChange={(e) => { setRegionId(e.target.value); setFires(null); }}>
            {FIRMS_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '0 1 140px' }}>
          <label htmlFor="firms-days">Period</label>
          <select id="firms-days" value={days} onChange={(e) => { setDays(Number(e.target.value)); setFires(null); }}>
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n === 1 ? 'Today (UTC)' : `Last ${n} days`}</option>)}
          </select>
        </div>
        <button className="btn primary" style={{ alignSelf: 'end' }} disabled={disabled || busy || !ready} onClick={() => void load(true)}>
          {busy ? 'Reading satellites…' : <><Icon name="play" /> Hear the fires</>}
        </button>
      </div>
      {!ready && <div className="alert warn">Add <code>VITE_FIRMS_MAP_KEY</code> to <code>.env</code> to turn on live fires.</div>}
      {err && <div className="alert error" role="alert">{err}</div>}
      {fires && (
        <div className="statgrid" role="group" aria-label="Fire detections">
          <div className="stat"><span>Detections</span><b>{fires.length}</b></div>
          <div className="stat"><span>Day / night</span><b>{dayCount} / {fires.length - dayCount}</b></div>
          <div className="stat"><span>Strongest</span><b>{strongest ? `${strongest.frp} MW` : '—'}</b></div>
          <div className="stat"><span>Where</span><b>{strongest ? `${strongest.lat.toFixed(1)}°, ${strongest.lon.toFixed(1)}°` : '—'}</b></div>
        </div>
      )}
    </div>
  );
}

const SVS_TOPICS = ['wildfire', 'sea surface temperature', 'hurricane', 'sea ice', 'carbon dioxide', 'earth information center'];

export function SvsPanel({ disabled, onPlay }: FeedProps) {
  const [query, setQuery] = useState(SVS_TOPICS[0]);
  const [items, setItems] = useState<SvsItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const run = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await searchSvs(q.trim(), 6);
      setItems(r);
      if (r.length === 0) setErr(`No SVS visualizations found for "${q}".`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'SVS search failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (!disabled) void run(SVS_TOPICS[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => { e.preventDefault(); void run(query); };

  const play = async (item: SvsItem) => {
    setPlaying(item.id); setErr('');
    try {
      onPlay(await svsImageDataset(item));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not turn that picture into sound.');
    } finally {
      setPlaying(null);
    }
  };

  return (
    <div className="card feedcard">
      <form className="row" onSubmit={submit}>
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="svs-q">Search NASA visualizations{' '}
            <HelpTip label="SVS search">Pictures from NASA's Scientific Visualization Studio. Press Play on one and TerraTone reads it left to right as sound.</HelpTip>
          </label>
          <input id="svs-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. sea ice" />
        </div>
        <button className="btn" type="submit" style={{ alignSelf: 'end' }} disabled={disabled || busy}>
          {busy ? 'Searching…' : <><Icon name="search" /> Search</>}
        </button>
      </form>
      <div className="row nowchips" role="group" aria-label="Visualization topics">
        {SVS_TOPICS.map((t) => (
          <button key={t} className="btn sm ghost" disabled={disabled || busy} onClick={() => { setQuery(t); void run(t); }}>{t}</button>
        ))}
      </div>
      {err && <div className="alert error" role="alert">{err}</div>}
      <div className="svsgrid">
        {items.map((it) => (
          <article key={it.id} className="svscard">
            {it.imageUrl
              ? <img src={it.imageUrl} alt={it.imageAlt} loading="lazy" />
              : <div className="svscard__noimg"><Icon name="telescope" /></div>}
            <div className="svscard__body">
              <b title={it.title}>{it.title}</b>
              <small>{it.eic && <span className="tag">EIC</span>} {it.releaseDate} · #{it.id}</small>
              <div className="row" style={{ gap: 6, margin: 0 }}>
                <button className="btn sm primary" disabled={disabled || !it.imageUrl || playing !== null} onClick={() => void play(it)}>
                  {playing === it.id ? 'Reading…' : <><Icon name="play" /> Play</>}
                </button>
                <a className="btn sm ghost" href={it.pageUrl} target="_blank" rel="noopener noreferrer"><Icon name="external-link" /> SVS</a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
