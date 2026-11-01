import { useEffect, useMemo, useRef, useState } from 'react';
import { EonetMap } from './EonetMap';
import {
  categoryToSim, eventLatestDate, eventPoint, feedCategories, fetchEonetEvents,
  filterEvents, loadEonetCache, saveEonetCache,
} from '../lib/eonet';
import type { EonetEvent } from '../lib/eonet';
import { hazardById } from '../sim/hazards';
import type { HazardId } from '../sim/hazards';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';
import { HelpTip } from './HelpTip';

/** Live NASA natural-events feed with map, filters, cache, and sim launches. */
export function EonetPanel({ onLaunchSim }: { onLaunchSim: (id: HazardId) => void }) {
  const { connection } = useApp();
  const [events, setEvents] = useState<EonetEvent[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [highlight, setHighlight] = useState('');
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const offline = connection === 'offline';

  const load = async (allowCacheFallback = true) => {
    setBusy(true); setErr('');
    try {
      const fresh = await fetchEonetEvents();
      setEvents(fresh);
      setFetchedAt(new Date().toISOString());
      setFromCache(false);
      await saveEonetCache(fresh);
    } catch (e) {
      if (allowCacheFallback) {
        const cached = await loadEonetCache();
        if (cached) {
          setEvents(cached.events);
          setFetchedAt(cached.at);
          setFromCache(true);
          setErr('');
        } else {
          setErr(e instanceof Error ? e.message : 'EONET request failed.');
        }
      } else {
        setErr(e instanceof Error ? e.message : 'EONET request failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (connection === 'online') void load();
    else {
      void (async () => {
        const cached = await loadEonetCache();
        if (cached) {
          setEvents(cached.events);
          setFetchedAt(cached.at);
          setFromCache(true);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cats = useMemo(() => feedCategories(events), [events]);
  const visible = useMemo(() => filterEvents(events, filter).slice(0, 40), [events, filter]);

  useEffect(() => {
    if (highlight) itemRefs.current.get(highlight)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlight]);

  return (
    <div className="card">
      <h3 style={{ margin: 0 }}><Icon name="flame" /> Natural events now{' '}
        <HelpTip label="natural events">
          Wildfires, storms, volcanoes and more that NASA is tracking right now. The simulators they open are practice
          worlds, not forecasts.
        </HelpTip>
      </h3>
      {fetchedAt && (
        <small style={{ color: 'var(--ink-faint)' }}>
          Updated {new Date(fetchedAt).toLocaleString()}{fromCache && ' (saved copy)'}
        </small>
      )}
      <div className="row">
        <button className="btn sm" onClick={() => load(false)} disabled={busy || offline}>
          {busy ? 'Updating…' : <><Icon name="refresh" /> Refresh live feed</>}
        </button>
        <div className="row" role="group" aria-label="Filter events by category" style={{ gap: 6 }}>
          <button className={filter === 'all' ? 'btn sm primary' : 'btn sm ghost'} onClick={() => setFilter('all')}>
            All ({events.length})
          </button>
          {cats.slice(0, 6).map((c) => (
            <button key={c.id} className={filter === c.id ? 'btn sm primary' : 'btn sm ghost'} onClick={() => setFilter(c.id)}>
              {c.title}
            </button>
          ))}
        </div>
      </div>
      {offline && <div className="alert warn">Offline — showing the last cached feed. New events need a connection.</div>}
      {err && <div className="alert error" role="alert">{err}</div>}
      {!offline && events.length > 0 && <EonetMap events={visible} onSelect={setHighlight} />}
      {visible.length === 0 && !busy && (
        <div className="empty">{events.length === 0 ? 'No events loaded yet.' : 'No events in this category right now.'}</div>
      )}
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
        {visible.map((ev) => {
          const sim = ev.categories.map((c) => categoryToSim(c.id)).find(Boolean) ?? null;
          const pt = eventPoint(ev);
          return (
            <li
              key={ev.id}
              ref={(el) => { if (el) itemRefs.current.set(ev.id, el); }}
              className="eventrow"
              data-hot={highlight === ev.id ? '1' : undefined}
            >
              <div>
                <b>{ev.title}</b>
                <div className="meta">
                  <span>{ev.categories.map((c) => c.title).join(' · ')}</span>
                  {eventLatestDate(ev) && <span><Icon name="clock" /> {new Date(eventLatestDate(ev)).toLocaleDateString()}</span>}
                  {pt && <span><Icon name="map-pin" /> {pt.lat.toFixed(1)}°, {pt.lon.toFixed(1)}°</span>}
                </div>
              </div>
              <div className="row">
                {sim && (
                  <button
                    className="btn sm primary"
                    title={`Open the ${hazardById(sim).title} to explore this kind of event virtually`}
                    onClick={() => onLaunchSim(sim)}
                  >
                    <Icon name="play" /> Simulate: {hazardById(sim).title.replace(' Simulator', '')}
                  </button>
                )}
                <a className="btn sm ghost" href={ev.link} target="_blank" rel="noreferrer">EONET <Icon name="external-link" /></a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
