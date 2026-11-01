import { useEffect, useRef, useState } from 'react';
import { explainWithGemini } from '../lib/gemini';
import type { DatasetBrief } from '../lib/gemini';
import { hasGeminiAccess } from '../lib/keys';
import { speakText, stopSpeaking, ttsAvailable } from '../lib/tts';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

const TTS_ON_KEY = 'terratone.aiVoice';

/** Optional AI explanation of the current sonification — always labeled AI-generated. */
export function AiExplain({ brief }: { brief: DatasetBrief }) {
  const { setTab, connection } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState<boolean>(() => {
    try { return localStorage.getItem(TTS_ON_KEY) !== 'off'; } catch { return true; }
  });
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const speakSeq = useRef(0);

  useEffect(() => () => stopSpeaking(), []);

  /** Read an explanation aloud with the device voice (works offline). */
  const speak = (raw: string) => {
    if (!ttsAvailable()) return;
    const seq = ++speakSeq.current;
    stopSpeaking();
    setSpeaking(true);
    void speakText(raw, { rate: 1 }).finally(() => {
      if (seq === speakSeq.current) setSpeaking(false);
    });
  };

  const stop = () => {
    speakSeq.current++;
    stopSpeaking();
    setSpeaking(false);
  };

  const toggleVoice = () => {
    const next = !voiceOnRef.current;
    voiceOnRef.current = next;
    setVoiceOn(next);
    try { localStorage.setItem(TTS_ON_KEY, next ? 'on' : 'off'); } catch { /* private mode */ }
    if (!next) stop();
  };

  const ask = async () => {
    setBusy(true); setErr(''); setText('');
    stop();
    try {
      const answer = await explainWithGemini(brief);
      setText(answer);
      if (voiceOnRef.current) speak(answer);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}><Icon name="sparkles" /> AI explanation <small style={{ color: 'var(--ink-faint)' }}>optional · online only</small></h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: 0 }}>
        Ask Gemini to describe what this dataset sounds like from start to finish, based on its real statistics and mapping.
        {ttsAvailable() && ' With voice on, the answer is read aloud as it arrives.'}
      </p>
      <div className="row">
        <button className="btn sm primary" onClick={ask} disabled={busy || connection === 'offline'}>
          {busy ? 'Thinking…' : <><Icon name="sparkles" /> Explain this sound</>}
        </button>
        {ttsAvailable() && (
          <button
            className="btn sm ghost"
            aria-pressed={voiceOn}
            aria-label={voiceOn ? 'Turn explanation voice off' : 'Turn explanation voice on'}
            onClick={toggleVoice}
          >
            {voiceOn ? <><Icon name="volume-on" /> Voice on</> : <><Icon name="volume-off" /> Voice off</>}
          </button>
        )}
        {!hasGeminiAccess() && (
          <button className="btn sm ghost" onClick={() => setTab('settings')}><Icon name="key" /> Add Gemini key first</button>
        )}
      </div>
      {connection === 'offline' && <div className="alert warn">Offline — AI explanations need a connection.</div>}
      {err && <div className="alert error" role="alert">{err}</div>}
      {text && (
        <div className="alert" role="status">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <b><Icon name="bot" /> AI-generated (may contain errors — not NASA data):</b>
            {ttsAvailable() && (
              <button
                className="btn sm ghost"
                aria-label={speaking ? 'Stop reading aloud' : 'Read explanation aloud'}
                onClick={() => (speaking ? stop() : speak(text))}
              >
                {speaking ? <><Icon name="stop" /> Stop</> : <><Icon name="volume-on" /> Read aloud</>}
              </button>
            )}
          </div>
          {text}
        </div>
      )}
    </div>
  );
}
