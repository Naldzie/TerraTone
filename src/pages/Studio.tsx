import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Player } from '../components/Player';
import { PROFILES } from '../types';
import type { SoundProfileId } from '../types';
import { engine } from '../audio/engine';
import { Icon } from '../components/Icon';

/** Custom Earth Jukebox Studio: dataset → range → mapping → profile → preview → play → save/share. */
export function Studio() {
  const { datasets, currentDataset: d, selectDataset, mapping, updateMapping, saveExperience } = useApp();
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  if (!d) return <div className="empty">No dataset.</div>;
  const end = to ?? d.points.length - 1;
  const sliceNote = `Using frames ${from + 1}–${end + 1} of ${d.points.length} (${d.points[from]?.t} → ${d.points[end]?.t}).`;

  const exportJson = () => {
    const payload = {
      app: 'TerraTone', version: 1, experience: name || 'Untitled Earth Jukebox mix',
      datasetId: d.id, datasetTitle: d.title,
      timeRange: [from, end], mapping,
      exportedAt: new Date().toISOString(),
      note: 'Share this file — the recipient can import it in Studio. Dataset must exist on their device (or be re-downloaded).',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `terratone-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setMsg('Configuration exported as JSON.');
  };

  const toggleRecord = async () => {
    setErr('');
    try {
      if (!recording) {
        engine.ensureContext();
        if (!engine.recordingMime) { setErr('Audio recording is not supported in this browser (needs MediaRecorder + Web Audio). Chrome/Edge on Android support it; Safari support is limited.'); return; }
        engine.startRecording();
        setRecording(true);
        setMsg('Recording… press Play, then stop recording to save a clip.');
      } else {
        const blob = await engine.stopRecording();
        setRecording(false);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        setMsg(`Recording saved (${(blob.size / 1024).toFixed(1)} KB, ${blob.type || 'audio'}). Play it below; long recordings use memory — keep clips short.`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Recording failed.'); }
  };

  return (
    <div>
      <div className="section-title"><h2>Earth Jukebox Studio</h2><span>create your mix</span></div>
      <ol className="steplist">
        <li>Select a dataset</li><li>Choose a time range</li><li>Pick a mapping profile</li>
        <li>Preview, play the synced show, record (if supported), save &amp; share</li>
      </ol>
      <div className="card">
        <div className="field"><label htmlFor="sd">1 · Dataset</label>
          <select id="sd" value={d.id} onChange={(e) => { selectDataset(e.target.value); setFrom(0); setTo(null); }}>
            {datasets.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select></div>
        <div className="row">
          <div className="field" style={{ flex: '1 1 180px' }}><label htmlFor="from">2 · From frame (1-based)</label>
            <div className="rangerow">
              <input id="from" type="number" min={1} max={d.points.length} value={from + 1}
                onChange={(e) => setFrom(Math.max(0, Math.min(d.points.length - 1, Number(e.target.value) - 1)))} />
              <input type="range" min={1} max={d.points.length} value={from + 1} aria-label="From frame slider"
                onChange={(e) => setFrom(Math.max(0, Math.min(d.points.length - 1, Number(e.target.value) - 1)))} />
            </div></div>
          <div className="field" style={{ flex: '1 1 180px' }}><label htmlFor="to">To frame</label>
            <div className="rangerow">
              <input id="to" type="number" min={1} max={d.points.length} value={end + 1}
                onChange={(e) => setTo(Math.max(0, Math.min(d.points.length - 1, Number(e.target.value) - 1)))} />
              <input type="range" min={1} max={d.points.length} value={end + 1} aria-label="To frame slider"
                onChange={(e) => setTo(Math.max(0, Math.min(d.points.length - 1, Number(e.target.value) - 1)))} />
            </div></div>
        </div>
        <p style={{ fontSize: '.85rem', color: 'var(--ink-dim)' }}>{sliceNote} (Playback below uses the full dataset; range is stored in the saved preset.)</p>
        <div className="field"><label htmlFor="sprof">3 · Sonification mapping</label>
          <select id="sprof" value={mapping.profileId} onChange={(e) => updateMapping({ profileId: e.target.value as SoundProfileId })}>
            {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.blurb}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sname">Mix name</label>
          <input id="sname" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warming century — ambient" /></div>
        <div className="row">
          <button className="btn sm" onClick={async () => { await saveExperience(name || 'Studio mix'); setMsg('Mix saved — reopen it offline from Library.'); }}><Icon name="save" /> 4 · Save mix</button>
          <button className="btn sm ghost" onClick={exportJson}><Icon name="upload" /> Export JSON</button>
          <button className="btn sm ghost" onClick={toggleRecord} aria-pressed={recording}><Icon name="record" /> {recording ? 'Stop recording' : 'Record clip'}</button>
        </div>
        {msg && <div className="alert" role="status">{msg}</div>}
        {err && <div className="alert error" role="alert">{err}</div>}
        {audioUrl && (
          <div className="clipbox"><h3>Your recorded clip</h3>
            <audio controls src={audioUrl} aria-label="Recorded sonification clip" />
            <a className="btn sm" href={audioUrl} download="terratone-clip.webm"><Icon name="download" /> Download clip</a>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <Player compact />
      </div>
    </div>
  );
}
