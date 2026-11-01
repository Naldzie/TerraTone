/* Live tab: a Listen-style "right now" readout plus a one-tap snapshot of every
 * NASA POWER variable at the selected point. Pure presentation — every number
 * comes from a dataset that was really fetched from NASA a moment ago. */
import { useEffect, useState } from 'react';
import { DataArt } from './DataArt';
import { Icon } from './Icon';
import { HelpTip } from './HelpTip';
import type { IconName } from './Icon';
import { latestReading } from '../lib/dataUtils';
import { POWER_LIVE_NOW, POWER_LIVE_VARS, fetchPowerNow } from '../lib/nasa';
import type { PowerLiveKey } from '../lib/nasa';
import type { DatasetMeta } from '../types';

export const VAR_ICON: Record<PowerLiveKey, IconName> = {
  T2M: 'thermometer',
  RH2M: 'cloud',
  WS2M: 'cyclone',
  PS: 'activity',
  PRECTOTCORR: 'cloud-rain',
};

/** Short tile names for the snapshot grid (POWER_LIVE_VARS keeps the full labels). */
export const VAR_SHORT: Record<PowerLiveKey, string> = {
  T2M: 'Temperature',
  RH2M: 'Humidity',
  WS2M: 'Wind',
  PS: 'Pressure',
  PRECTOTCORR: 'Precipitation',
};

/** Human "how fresh is this" phrasing for a fetch timestamp. */
export function relativeTime(fromMs: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Re-renders while mounted so the freshness label stays honest. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));

/** Big single-value readout of the newest published reading + auto-refresh switch. */
export function LiveReadout({ ds, varKey, place, autoLive, onToggleAuto, updating, offline, fetchedAt, onRefresh }: {
  ds: DatasetMeta;
  varKey: PowerLiveKey;
  place: string;
  autoLive: boolean;
  onToggleAuto: (on: boolean) => void;
  updating: boolean;
  offline: boolean;
  fetchedAt: number | null;
  onRefresh: () => void;
}) {
  const now = useNow();
  const r = latestReading(ds.points);
  const meta = POWER_LIVE_VARS.find((v) => v.key === varKey);
  const perFrame = ds.resolution.startsWith('Hourly') ? 'hour' : 'day';
  const deltaSign = r.delta === null ? '' : r.delta > 0 ? '+' : '';
  const arrow = r.dir === 'up' ? '▲' : r.dir === 'down' ? '▼' : '■';

  return (
    <section className="card livenow" aria-label={`Right now: ${meta?.label ?? varKey}`}>
      <div className="livenow__head">
        <span className="livebadge" data-on={autoLive ? '1' : '0'}>
          <i aria-hidden="true" />
          {autoLive ? 'Live · refreshes every 60 s' : 'Latest published reading'}
        </span>
        <div className="row">
          <span className="livenow__fresh" role="status">
            {updating ? 'Updating…' : fetchedAt ? `Updated ${relativeTime(fetchedAt, now)}` : `NASA ${ds.updatedAt}`}
          </span>
          <button className="btn sm ghost" onClick={onRefresh} disabled={offline || updating}>
            <Icon name="refresh" /> Refresh now
          </button>
        </div>
      </div>

      <div className="livenow__grid">
        <div className="livenow__main">
          <p className="livenow__var"><Icon name={VAR_ICON[varKey]} /> {meta?.label ?? varKey}</p>
          <p className="livenow__place">{place}</p>
          <p className="livenow__value" data-testid="now-value">
            {r.value === null ? '—' : fmt(r.value)}
            <span className="livenow__unit">{ds.units}</span>
          </p>
          {r.delta === null ? (
            <p className="livenow__delta" data-d="flat">No earlier published frame to compare yet.</p>
          ) : (
            <p className="livenow__delta" data-d={r.dir}>
              {arrow} {deltaSign}{fmt(r.delta)} {ds.units} vs previous {perFrame}
              {r.prev === null ? '' : ` (was ${fmt(r.prev)})`}
            </p>
          )}
          <div className="livenow__meta">
            <span><Icon name="clock" /> As of {r.at}</span>
            <span><Icon name="chart" /> {ds.points.length} frames in this window</span>
            <span><Icon name="satellite" /> {ds.sourceName}</span>
          </div>
        </div>
        <div className="livenow__spark">
          <DataArt dataset={ds} />
        </div>
      </div>

      <label className="switchrow">
        <input
          type="checkbox"
          checked={autoLive}
          disabled={offline}
          onChange={(e) => onToggleAuto(e.target.checked)}
        />
        <span>
          <b>Keep it live</b>
          <small>
            Re-read this place and variable every 60 seconds so the newest published NASA hour or day appears
            without another click. {offline ? 'Unavailable while offline.' : 'Pauses automatically when you go offline.'}
          </small>
        </span>
      </label>
    </section>
  );
}

interface Tile {
  key: PowerLiveKey;
  ds?: DatasetMeta;
  error?: string;
}

/** One-tap snapshot of every Live variable for the current point, each tile sonifiable. */
export function LiveSnapshot({ lat, lon, place, disabled, onAdopt }: {
  lat: number;
  lon: number;
  place: string;
  disabled: boolean;
  onAdopt: (d: DatasetMeta, key: PowerLiveKey) => void;
}) {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const out = await Promise.all<Tile>(POWER_LIVE_VARS.map(async (v) => {
      const req = POWER_LIVE_NOW[v.key];
      try {
        const ds = await fetchPowerNow(lat, lon, { key: v.key, series: req.series, window: req.window });
        if (!ds) return { key: v.key, error: 'NASA POWER returned no data for this point.' };
        return { key: v.key, ds };
      } catch (e) {
        return { key: v.key, error: e instanceof Error ? e.message : 'Live fetch failed for this variable.' };
      }
    }));
    setTiles(out);
    setBusy(false);
  };

  return (
    <section className="card" aria-label="All live NASA POWER variables for this location">
      <div className="row">
        <span className="livenow__place">{place}</span>
        <HelpTip label="all readings">
          Every NASA reading for this place at once. Tap one to hear it. NASA publishes these within about a week, so
          the newest value is not this exact second.
        </HelpTip>
        <button className="btn primary" onClick={() => void run()} disabled={busy || disabled}>
          {busy ? 'Reading every variable…' : <><Icon name="activity" /> Read everything live</>}
        </button>
      </div>
      {tiles && (
        <div className="snapgrid" role="group" aria-label="Live readings for this location">
          {tiles.map((t) => {
            const v = POWER_LIVE_VARS.find((x) => x.key === t.key)!;
            const r = t.ds ? latestReading(t.ds.points) : null;
            return (
              <div className="snap" key={t.key}>
                <span className="snap__label"><Icon name={VAR_ICON[t.key]} /> {VAR_SHORT[t.key]}</span>
                {t.ds && r ? (
                  <>
                    <span className="snap__val" data-testid={`snap-${t.key}`}>
                      {r.value === null ? '—' : fmt(r.value)}
                      <small>{v.units}</small>
                    </span>
                    <span className="snap__at">As of {r.at}</span>
                    <button
                      className="btn sm"
                      onClick={() => t.ds && onAdopt(t.ds, t.key)}
                      aria-label={`Hear ${VAR_SHORT[t.key].toLowerCase()} in the Listen console`}
                    >
                      <Icon name="headphones" /> Hear it
                    </button>
                  </>
                ) : (
                  <span className="snap__err" role="status">{t.error}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
