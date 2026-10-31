import { useApp } from '../store/AppContext';
import { Icon } from '../components/Icon';

export function Access() {
  const { settings, updateSettings } = useApp();
  return (
    <div>
      <div className="section-title"><h2>Accessibility</h2><span>sonification is a companion, not a conclusion</span></div>
      <div className="alert" role="note">
        Sound alone does not make a scientific conclusion accessible. Every visualization here ships with a text summary,
        frame-by-frame captions, units, ranges and mapping explanations so you can interpret what you hear.
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="ts">Text size</label>
          <select id="ts" value={String(settings.textScale)} onChange={(e) => updateSettings({ textScale: Number(e.target.value) })}>
            <option value="0.875">Compact</option><option value="1">Default</option>
            <option value="1.125">Large</option><option value="1.25">Extra large</option>
          </select></div>
        <label className="switchrow">
          <input type="checkbox" checked={settings.highContrast} onChange={(e) => updateSettings({ highContrast: e.target.checked })} />
          <span><b>High-contrast theme</b><small>Pure blacks, maximum-bright accents, stronger focus rings.</small></span>
        </label>
        <label className="switchrow">
          <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => updateSettings({ reduceMotion: e.target.checked })} />
          <span><b>Reduce motion</b><small>Disables transitions and decorative animation.</small></span>
        </label>
        <label className="switchrow">
          <input type="checkbox" checked={settings.disableNonessentialSound} onChange={(e) => updateSettings({ disableNonessentialSound: e.target.checked })} />
          <span><b>Quiet mode (captions + visuals only)</b><small>Stops all sonification; captions and summaries keep working.</small></span>
        </label>
        <h3>Keyboard map</h3>
        <table className="data">
          <thead><tr><th>Key</th><th>Action</th></tr></thead>
          <tbody>
            <tr><td><kbd>Tab</kbd> <kbd>Shift+Tab</kbd></td><td>Move through every control (visible focus ring)</td></tr>
            <tr><td><kbd>Space</kbd> <kbd>Enter</kbd></td><td>Activate buttons, play/pause</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Move timeline slider one frame when focused</td></tr>
          </tbody>
        </table>
        <h3>How to read the sound</h3>
        <ul className="legendgrid">
          <li><Icon name="waves" /><span><b>Rising pitch</b> = rising value within that dataset’s range (see Listen tab for exact min/max).</span></li>
          <li><Icon name="stop" /><span><b>Silence</b> = missing data for that frame — listed in captions, never interpolated.</span></li>
          <li><Icon name="clock" /><span><b>Faster ticking</b> = higher rainfall / fire-count density mapping.</span></li>
          <li><Icon name="headphones" /><span><b>Left/right position</b> = longitude, only when spatial pan is on.</span></li>
        </ul>
      </div>
    </div>
  );
}
