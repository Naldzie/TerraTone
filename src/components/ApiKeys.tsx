import { useState } from 'react';
import { useKeyState } from '../lib/keys';
import { Icon } from './Icon';

const SOURCE_LABEL: Record<string, string> = {
  device: 'saved on this device',
  env: 'provided by the app build',
  none: 'not set',
};

function KeyRow({ which, label, hint, docs }: {
  which: 'nasa' | 'gemini'; label: string; hint: string; docs: string;
}) {
  const { source, save, clear } = useKeyState(which);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');

  return (
    <div className="field">
      <label htmlFor={`key-${which}`}>{label}: <Icon name={source === 'none' ? 'x' : 'check'} /> {SOURCE_LABEL[source]}</label>
      <div className="row">
        <input
          id={`key-${which}`}
          type="password"
          autoComplete="off"
          placeholder={source === 'device' ? '•••••••• (enter a new key to replace)' : 'Paste key here'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: '2 1 200px' }}
        />
        <button className="btn sm" disabled={!draft.trim()} onClick={() => { save(draft); setDraft(''); setMsg('Saved in this browser only.'); }}>
          <Icon name="save" /> Save
        </button>
        {source === 'device' && <button className="btn sm danger" onClick={() => { clear(); setDraft(''); setMsg('Removed from this browser.'); }}>Remove</button>}
      </div>
      <span className="hint">{hint} Docs: {docs}</span>
      {msg && <span className="hint" role="status">{msg}</span>}
    </div>
  );
}

/** API keys section: NASA (APOD) + Gemini (AI explanations). On-device only. */
export function ApiKeys() {
  return (
    <div className="card">
      <h3 style={{ margin: 0 }}><Icon name="key" /> API keys <small style={{ color: 'var(--ink-faint)' }}>optional · stored only in this browser</small></h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: 0 }}>
        Keys are kept in this device's localStorage (or a local <code>.env</code>) and sent only to the official
        NASA / Google endpoints. They are never uploaded to TerraTone servers — there are none. Core features
        work without any key.
      </p>
      <KeyRow
        which="nasa"
        label="NASA API key"
        hint="Unlocks APOD space photos with your own generous limits (otherwise the shared DEMO_KEY is used). EPIC Earth photos are keyless and need no key."
        docs="api.nasa.gov"
      />
      <KeyRow
        which="gemini"
        label="Gemini API key"
        hint='Enables AI explanations. AI Studio keys start with "AIza". If calls fail with HTTP 400/403, the key is wrong or restricted — generate a fresh one.'
        docs="aistudio.google.com"
      />
      <small style={{ color: 'var(--ink-faint)' }}>
        Security: if a key was ever pasted into a chat, email, or screenshot, regenerate it at its provider console —
        chat history counts as exposed.
      </small>
    </div>
  );
}
