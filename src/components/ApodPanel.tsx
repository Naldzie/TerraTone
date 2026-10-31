import { useEffect, useState } from 'react';
import { fetchApod, loadApodCache } from '../lib/apod';
import type { Apod } from '../lib/apod';
import { getNasaKey } from '../lib/keys';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

/** Astronomy Picture of the Day — labeled as astronomy, cached offline. */
export function ApodPanel() {
  const { connection, setTab } = useApp();
  const [apod, setApod] = useState<Apod | null>(null);
  const [at, setAt] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const offline = connection === 'offline';

  const load = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetchApod();
      setApod(r.apod);
      setAt(new Date().toISOString());
      setFromCache(false);
    } catch (e) {
      const cached = await loadApodCache();
      if (cached) {
        setApod(cached.apod);
        setAt(cached.at);
        setFromCache(true);
      } else {
        setErr(e instanceof Error ? e.message : 'APOD request failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (connection === 'online') void load();
    else {
      void (async () => {
        const cached = await loadApodCache();
        if (cached) {
          setApod(cached.apod);
          setAt(cached.at);
          setFromCache(true);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card">
      <h3 style={{ margin: 0 }}><Icon name="telescope" /> Astronomy Picture of the Day <small style={{ color: 'var(--ink-faint)' }}>space bonus · via NASA key</small></h3>
      <div className="row">
        <button className="btn sm" onClick={load} disabled={busy || offline}>{busy ? 'Loading…' : <><Icon name="refresh" /> Refresh</>}</button>
        {!getNasaKey() && (
          <button className="btn sm ghost" onClick={() => setTab('settings')}><Icon name="key" /> Add my NASA key</button>
        )}
      </div>
      {offline && <div className="alert warn">Offline — showing the cached picture{apod ? ` from ${new Date(at).toLocaleDateString()}` : ''}.</div>}
      {err && <div className="alert error" role="alert">{err}</div>}
      {apod && (
        <figure style={{ margin: '8px 0 0' }}>
          {apod.media_type === 'image' ? (
            <img
              src={apod.url}
              alt={apod.title}
              loading="lazy"
              style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <a className="btn sm" href={apod.url} target="_blank" rel="noreferrer"><Icon name="play" /> Watch today's video <Icon name="external-link" /></a>
          )}
          <figcaption style={{ fontSize: '.85rem', color: 'var(--ink-dim)' }}>
            <b>{apod.title}</b> · {apod.date}{apod.copyright ? ` · © ${apod.copyright}` : ' · Public domain'}
            {fromCache && ' · cached copy'}
            <br />{apod.explanation.slice(0, 320)}{apod.explanation.length > 320 ? '…' : ''}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
