import { useEffect, useState } from 'react';
import { epicPngUrl, fetchEpicNatural } from '../lib/epic';
import type { EpicImage } from '../lib/epic';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

/** Latest full-disc Earth photos from NASA EPIC (DSCOVR). Keyless public service. */
export function EpicPanel() {
  const { connection } = useApp();
  const [images, setImages] = useState<EpicImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const offline = connection === 'offline';

  const load = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetchEpicNatural(3);
      setImages(r.images);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'EPIC request failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (connection === 'online') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}><Icon name="globe" /> Earth from space — NASA EPIC <small style={{ color: 'var(--ink-faint)' }}>live photos</small></h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: 0 }}>
        The latest natural-color full-disc Earth images from DSCOVR/EPIC (public domain).
        No API key needed.
      </p>
      <div className="row">
        <button className="btn sm" onClick={load} disabled={busy || offline}>
          {busy ? 'Loading…' : <><Icon name="refresh" /> Refresh images</>}
        </button>
      </div>
      {offline && <div className="alert warn">Offline — fresh EPIC photos need a connection. Previously viewed images may still be in the browser cache.</div>}
      {err && <div className="alert error" role="alert">{err}</div>}
      {images.length > 0 && (
        <div className="grid">
          {images.map((img) => (
            <figure key={img.identifier} style={{ margin: 0 }}>
              <img
                src={epicPngUrl(img)}
                alt={`Full-disc Earth from DSCOVR on ${new Date(img.date).toUTCString()}`}
                loading="lazy"
                style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <figcaption style={{ fontSize: '.8rem', color: 'var(--ink-dim)' }}>
                {new Date(img.date).toUTCString()} · {img.caption} · Credit: NASA EPIC
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
