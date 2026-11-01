import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApodPanel } from '../components/ApodPanel';
import { EonetPanel } from '../components/EonetPanel';
import { EpicPanel } from '../components/EpicPanel';
import { Icon } from '../components/Icon';
import { HelpTip } from '../components/HelpTip';
import { LiveReadout, LiveSnapshot, VAR_ICON } from '../components/LiveNow';
import { PlacePickerMap } from '../components/PlacePickerMap';
import { Listen } from './Listen';
import { useApp } from '../store/AppContext';
import type { DatasetMeta } from '../types';
import { POWER_LIVE_NOW, POWER_LIVE_VARS, POWER_LIVE_WINDOWS, fetchPowerNow } from '../lib/nasa';
import type { PowerLiveKey } from '../lib/nasa';

const PLACES: ReadonlyArray<{ name: string; lat: number; lon: number }> = [
  { name: 'San Francisco, USA', lat: 37.77, lon: -122.42 },
  { name: 'New York, USA', lat: 40.71, lon: -74.01 },
  { name: 'London, UK', lat: 51.51, lon: -0.13 },
  { name: 'Reykjavík, Iceland', lat: 64.15, lon: -21.94 },
  { name: 'Nairobi, Kenya', lat: -1.29, lon: 36.82 },
  { name: 'Delhi, India', lat: 28.61, lon: 77.21 },
  { name: 'Tokyo, Japan', lat: 35.68, lon: 139.69 },
  { name: 'Sydney, Australia', lat: -33.87, lon: 151.21 },
  { name: 'São Paulo, Brazil', lat: -23.55, lon: -46.63 },
  { name: 'Custom point (map / my location)', lat: 0, lon: 0 },
];

/** One tap = the newest published reading of that variable, straight into Listen. */
const PRESETS: ReadonlyArray<{ key: PowerLiveKey; label: string }> = [
  { key: 'T2M', label: 'Temperature now' },
  { key: 'RH2M', label: 'Humidity now' },
  { key: 'WS2M', label: 'Wind now' },
  { key: 'PS', label: 'Pressure now' },
  { key: 'PRECTOTCORR', label: 'Rain · daily' },
];

const AUTO_REFRESH_MS = 60_000;

type LiveRequest = { key: PowerLiveKey; series: 'hourly' | 'daily'; window: number };

/** Online hub — live NASA feeds plus a Listen-style console for the newest POWER readings. */
export function Online() {
  const { connection, requestSim, addSessionDataset, selectDataset } = useApp();
  const offline = connection === 'offline';

  const [place, setPlace] = useState(0);
  const [lat, setLat] = useState(String(PLACES[0].lat));
  const [lon, setLon] = useState(String(PLACES[0].lon));
  const [varKey, setVarKey] = useState<PowerLiveKey>('T2M');
  const [winIdx, setWinIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [autoLive, setAutoLive] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [err, setErr] = useState<{ msg: string; auto?: boolean } | null>(null);
  const [liveDs, setLiveDs] = useState<DatasetMeta | null>(null);

  const windows = POWER_LIVE_WINDOWS;
  /** Precipitation only exists as a daily product — fall back to the first daily window. */
  const win = varKey === 'PRECTOTCORR' && windows[winIdx].series === 'hourly'
    ? windows.find((w) => w.series === 'daily')!
    : windows[winIdx];

  const req: LiveRequest = { key: varKey, series: win.series, window: win.window };

  const runFetch = useCallback(async (r: LiveRequest, manual: boolean) => {
    if (manual) setBusy(true);
    else setUpdating(true);
    setErr(null);
    try {
      const d = await fetchPowerNow(Number(lat), Number(lon), r);
      addSessionDataset(d);
      selectDataset(d.id);
      setLiveDs(d);
      setFetchedAt(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Live fetch failed. Try another location or a bundled demo.';
      setErr(manual ? { msg } : { msg: `Auto-refresh failed — the last reading is still shown. ${msg}`, auto: true });
    } finally {
      if (manual) setBusy(false);
      else setUpdating(false);
    }
  }, [lat, lon, addSessionDataset, selectDataset]);

  const fetchNow = () => void runFetch(req, true);

  /** Adopt any fetched dataset (main flow or snapshot tile) into the Listen console. */
  const adopt = useCallback((d: DatasetMeta, key?: PowerLiveKey) => {
    addSessionDataset(d);
    selectDataset(d.id);
    setLiveDs(d);
    setFetchedAt(Date.now());
    if (key) {
      setVarKey(key);
      const next = POWER_LIVE_NOW[key];
      const idx = POWER_LIVE_WINDOWS.findIndex((w) => w.series === next.series && w.window === next.window);
      if (idx >= 0) setWinIdx(idx);
    }
  }, [addSessionDataset, selectDataset]);

  const quickFetch = (key: PowerLiveKey) => {
    const next = POWER_LIVE_NOW[key];
    const r: LiveRequest = { key, series: next.series, window: next.window };
    const idx = windows.findIndex((w) => w.series === r.series && w.window === r.window);
    setVarKey(key);
    if (idx >= 0) setWinIdx(idx);
    void runFetch(r, true);
  };

  const onVar = (k: PowerLiveKey) => {
    setVarKey(k);
    if (k === 'PRECTOTCORR' && windows[winIdx].series === 'hourly') {
      setWinIdx(windows.findIndex((w) => w.series === 'daily'));
    }
  };

  const setCoords = (nextLat: string, nextLon: string) => {
    setLat(nextLat);
    setLon(nextLon);
    setPlace(PLACES.length - 1); // custom
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setErr({ msg: 'Geolocation is not available in this browser — pick a city or drop a pin on the map.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords(p.coords.latitude.toFixed(2), p.coords.longitude.toFixed(2)),
      () => setErr({ msg: 'Could not read your location — pick a city or drop a pin on the map instead.' }),
      { timeout: 8000 },
    );
  };

  /** Latest request + fetcher, read by the auto-refresh timer without restarting it. */
  const liveReq = useRef({ run: runFetch, req });
  useEffect(() => { liveReq.current = { run: runFetch, req }; });

  useEffect(() => {
    if (!autoLive || offline) return;
    const id = window.setInterval(() => {
      void liveReq.current.run(liveReq.current.req, false);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoLive, offline]);

  const stats = useMemo(() => {
    if (!liveDs) return null;
    const vals = liveDs.points.map((p) => p.value).filter((v): v is number => v !== null);
    const latest = [...liveDs.points].reverse().find((p) => p.value !== null);
    if (vals.length === 0 || !latest) return null;
    const u = liveDs.units;
    return {
      frames: liveDs.points.length,
      latestAt: latest.t,
      latest: `${latest.value} ${u}`,
      lo: `${Math.min(...vals)} ${u}`,
      hi: `${Math.max(...vals)} ${u}`,
    };
  }, [liveDs]);

  const selectionLabel = place < PLACES.length - 1 ? PLACES[place].name : `${lat}°, ${lon}°`;
  /** The readout names the dataset's own point so it never mislabels stale data. */
  const dsPoint = liveDs?.points.find((p) => p.value !== null) ?? liveDs?.points[0];
  const samePoint = !!dsPoint && Number(lat) === dsPoint.lat && Number(lon) === dsPoint.lon;
  const readoutPlace = !dsPoint
    ? ''
    : samePoint && place < PLACES.length - 1
      ? PLACES[place].name
      : `${dsPoint.lat}°, ${dsPoint.lon}°`;

  return (
    <div>
      <div className="hero">
        <h1>Live from <span className="accent">NASA</span>{' '}
          <HelpTip label="the Live tab">
            Real NASA data from today: weather for any place, natural events on a map, and Earth and space photos.
            Tap an event to open its simulator.
          </HelpTip>
        </h1>
        {offline && <p>You are offline. Showing saved copies.</p>}
      </div>

      <div className="section-title">
        <h2>Hear the latest conditions{' '}
          <HelpTip label="latest conditions">
            Pick a city or drop a pin, choose what to measure, and play NASA's newest readings for that spot.
          </HelpTip>
        </h2>
      </div>
      <div className="card">
        <div className="row">
          <div className="field" style={{ flex: '1 1 240px' }}>
            <label htmlFor="place">Place</label>
            <select
              id="place"
              value={place}
              onChange={(e) => {
                const i = Number(e.target.value);
                setPlace(i);
                if (i < PLACES.length - 1) {
                  setLat(String(PLACES[i].lat));
                  setLon(String(PLACES[i].lon));
                }
              }}
            >
              {PLACES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn sm ghost" onClick={locate} disabled={offline} style={{ alignSelf: 'end' }}>
            <Icon name="map-pin" /> My location
          </button>
          <span className="placepoint" data-testid="picked-point">
            <Icon name="map-pin" /> {selectionLabel}
          </span>
        </div>
        <PlacePickerMap
          lat={Number(lat)}
          lon={Number(lon)}
          onPick={(la, lo) => setCoords(String(la), String(lo))}
        />
        <div className="row">
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="lvar">Variable</label>
            <select id="lvar" value={varKey} onChange={(e) => onVar(e.target.value as PowerLiveKey)}>
              {POWER_LIVE_VARS.map((v) => <option key={v.key} value={v.key}>{v.label} ({v.units})</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="lwin">Window</label>
            <select id="lwin" value={winIdx} onChange={(e) => setWinIdx(Number(e.target.value))}>
              {windows.map((w, i) => (
                <option key={w.label} value={i} disabled={varKey === 'PRECTOTCORR' && w.series === 'hourly'}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary" onClick={fetchNow} disabled={busy || offline} style={{ alignSelf: 'end' }}>
            {busy ? 'Fetching latest…' : <><Icon name="download" /> Fetch latest data</>}
          </button>
        </div>
        <div className="row nowchips" role="group" aria-label="One-tap live readings">
          <span className="nowchips__label">One tap:</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className="btn sm ghost"
              onClick={() => quickFetch(p.key)}
              disabled={busy || offline}
            >
              <Icon name={VAR_ICON[p.key]} /> {p.label}
            </button>
          ))}
        </div>
        {offline && (
          <div className="alert warn">You are offline — live NASA POWER fetches need a connection. Saved downloads still play from Library.</div>
        )}
        {err && (
          <div className={`alert ${err.auto ? 'warn' : 'error'}`} role={err.auto ? 'status' : 'alert'}>{err.msg}</div>
        )}
        {stats && (
          <div className="statgrid" role="group" aria-label="Latest published values">
            <div className="stat"><span>Newest frame</span><b>{stats.latestAt}</b></div>
            <div className="stat"><span>Latest value</span><b>{stats.latest}</b></div>
            <div className="stat"><span>Range low</span><b>{stats.lo}</b></div>
            <div className="stat"><span>Range high</span><b>{stats.hi}</b></div>
            <div className="stat"><span>Frames</span><b>{stats.frames}</b></div>
          </div>
        )}
      </div>

      <div className="section-title">
        <h2>Right now</h2>
        <span>{liveDs ? 'newest published reading · NASA POWER' : 'waiting for your first fetch'}</span>
      </div>
      {liveDs ? (
        <LiveReadout
          ds={liveDs}
          varKey={varKey}
          place={readoutPlace}
          autoLive={autoLive}
          onToggleAuto={setAutoLive}
          updating={updating}
          offline={offline}
          fetchedAt={fetchedAt}
          onRefresh={() => void runFetch(req, false)}
        />
      ) : (
        <div className="empty" role="status">
          Nothing loaded yet — press <b>Fetch latest data</b> (or any one-tap reading above) and this panel
          becomes a live readout of the newest NASA value, with the full Listen console underneath it.
        </div>
      )}

      <div className="section-title"><h2>Everything live here</h2><span>all NASA POWER variables · keyless</span></div>
      <LiveSnapshot
        lat={Number(lat)}
        lon={Number(lon)}
        place={selectionLabel}
        disabled={offline}
        onAdopt={adopt}
      />

      {liveDs && (
        <>
          <div className="section-title"><h2>Live console</h2><span>same experience as the Listen tab</span></div>
          <Listen />
        </>
      )}

      <div className="section-title"><h2>Natural events now</h2><span>EONET · keyless</span></div>
      <EonetPanel onLaunchSim={requestSim} />

      <div className="section-title"><h2>Earth from space</h2><span>EPIC · keyless</span></div>
      <EpicPanel />

      <div className="section-title"><h2>Space bonus</h2><span>APOD · NASA key</span></div>
      <ApodPanel />
    </div>
  );
}
