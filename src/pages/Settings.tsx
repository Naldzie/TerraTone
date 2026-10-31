import { useApp } from '../store/AppContext';
import { requestIntroPreview } from '../lib/intro';
import { PROFILES } from '../types';
import type { IntroFrequency, SoundProfileId } from '../types';
import { Icon } from '../components/Icon';

export function Settings() {
  const { settings, updateSettings, setProfileOpen } = useApp();

  return (
    <div>
      <div className="section-title"><h2>Settings</h2><span>no account needed</span></div>
      <div className="card">
        <div className="field"><label htmlFor="prof">Default sound profile</label>
          <select id="prof" value={settings.profileId} onChange={(e) => updateSettings({ profileId: e.target.value as SoundProfileId })}>
            {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="vol">Default volume: {Math.round(settings.volume * 100)}%</label>
          <input id="vol" type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="spd">Default speed: {settings.speed} frames/sec</label>
          <input id="spd" type="range" min={1} max={20} step={1} value={settings.speed} onChange={(e) => updateSettings({ speed: Number(e.target.value) })} /></div>
      </div>

      <div className="section-title"><h2>Cinematic startup</h2><span>Earth, sound, and a fast escape</span></div>
      <div className="card">
        <label className="switchrow">
          <input
            type="checkbox"
            checked={settings.introEnabled}
            onChange={(e) => updateSettings({ introEnabled: e.target.checked })}
          />
          <span>
            <b>Play the cinematic intro</b>
            <small>A short Earth-and-sound title sequence. The full version is about 7 seconds; you can always skip it.</small>
          </span>
        </label>
        <div className="field">
          <label htmlFor="intro-frequency">When should it play?</label>
          <select
            id="intro-frequency"
            value={settings.introFrequency}
            disabled={!settings.introEnabled}
            onChange={(e) => updateSettings({ introFrequency: e.target.value as IntroFrequency })}
          >
            <option value="once">Only on the first launch</option>
            <option value="every">Every launch (full cinematic intro)</option>
          </select>
        </div>
        <div className="row">
          <button className="btn sm ghost" onClick={requestIntroPreview} disabled={!settings.introEnabled}>
            Preview intro
          </button>
          <span className="meta">Muted intro sound is remembered. Reduced-motion mode plays a calm, static version.</span>
        </div>
      </div>

      <div className="section-title"><h2>Explorer look</h2><span>your character, everywhere</span></div>
      <div className="card">
        <div className="row">
          <button className="btn" onClick={() => setProfileOpen(true)}>
            <Icon name="helmet" /> Edit your explorer look
          </button>
          <span className="meta">Now lives in the Profile menu (top bar): girl / boy characters, wardrobe, and more.</span>
        </div>
      </div>

      <div className="section-title"><h2>About &amp; data honesty</h2></div>
      <div className="card">
        <ul className="factgrid">
          <li><Icon name="database" /><span><b>Demo data</b> = small bundled synthetic series for trying everything offline. Never presented as NASA observations.</span></li>
          <li><Icon name="broadcast" /><span><b>Live NASA data</b> = fetched just now from NASA POWER (keyless public API) with timestamps shown.</span></li>
          <li><Icon name="cloud" /><span><b>Cached NASA data</b> = live data you downloaded earlier, replayable offline.</span></li>
          <li><Icon name="globe" /><span>NASA imagery tiles (GIBS) and catalog search (CMR) are keyless public services; the Earth Information Center site is linked for context (no public JSON API).</span></li>
          <li><Icon name="sparkles" /><span>EPIC Earth photos come from NASA’s public keyless EPIC service; APOD uses your NASA key when saved, else the shared rate-limited DEMO_KEY. AI explanations are machine-generated guesses, never NASA statements.</span></li>
          <li><Icon name="accessibility" /><span>No account, no trackers, no secrets in frontend code. Dynamics/compressor caps loudness; mappings are documented per dataset.</span></li>
        </ul>
      </div>
    </div>
  );
}
