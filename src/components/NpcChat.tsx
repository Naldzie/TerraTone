import { useEffect, useRef, useState } from 'react';
import { GUIDES, buildGuidePrompt, guideSources } from '../lib/nasaGuide';
import type { ChatTurn, GuideTopic } from '../lib/nasaGuide';
import { generateText } from '../lib/gemini';
import { hasGeminiAccess } from '../lib/keys';
import { speakText, stopSpeaking, ttsAvailable } from '../lib/tts';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

const TTS_ON_KEY = 'terratone.npcVoice';

/** Stable per-NPC voice flavor so every bystander sounds a little different. */
function voiceProfile(name: string): { pitch: number; rate: number; hash: number } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { pitch: 0.85 + (h % 6) * 0.07, rate: 0.96 + ((h >> 3) % 5) * 0.04, hash: h };
}

export interface NpcChatState {
  npcName: string;
  topic: GuideTopic;
  guide: (typeof GUIDES)[GuideTopic];
  history: ChatTurn[];
  draft: string;
  setDraft: (v: string) => void;
  busy: boolean;
  err: string;
  offline: boolean;
  hasKey: boolean;
  voiceOn: boolean;
  toggleVoice: () => void;
  goSettings: () => void;
  speak: (text: string) => void;
  ask: (question: string) => void;
}

/**
 * Conversation state for talking to a bystander: Gemini answers grounded in
 * NASA research + the live sim state. Session-only history; needs key +
 * connection. Optionally reads answers aloud with the browser voice.
 */
export function useNpcChat(npcName: string, topic: GuideTopic, simContext: string): NpcChatState {
  const { setTab, connection } = useApp();
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [voiceOn, setVoiceOn] = useState<boolean>(() => {
    try { return localStorage.getItem(TTS_ON_KEY) !== 'off'; } catch { return true; }
  });
  const voiceOnRef = useRef(voiceOn);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  const offline = connection === 'offline';

  // Fresh conversation + silence when you walk up to a different bystander.
  useEffect(() => {
    setHistory([]); setDraft(''); setErr('');
    stopSpeaking();
  }, [npcName]);
  useEffect(() => () => stopSpeaking(), []);

  /** Read a message aloud with the device voice. */
  const speak = (text: string) => {
    if (!ttsAvailable() || !npcName) return;
    const { pitch, rate, hash } = voiceProfile(npcName);
    void speakText(text, { pitch, rate, voiceIndex: hash });
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy || !npcName) return;
    setErr('');
    stopSpeaking();
    const next = [...history, { role: 'user' as const, text: q }];
    setHistory(next);
    setDraft('');
    setBusy(true);
    try {
      const answer = await generateText(buildGuidePrompt(topic, npcName, simContext, next.slice(0, -1), q), 400, 0.5);
      setHistory([...next, { role: 'model', text: answer }]);
      if (voiceOnRef.current) speak(answer);
    } catch (e) {
      setHistory(next);
      setErr(e instanceof Error ? e.message : 'AI request failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = () => {
    const nextOn = !voiceOnRef.current;
    voiceOnRef.current = nextOn;
    setVoiceOn(nextOn);
    try { localStorage.setItem(TTS_ON_KEY, nextOn ? 'on' : 'off'); } catch { /* private mode */ }
    if (!nextOn) stopSpeaking();
  };

  return {
    npcName, topic, guide: GUIDES[topic], history, draft, setDraft, busy, err,
    offline, hasKey: Boolean(hasGeminiAccess()), voiceOn, toggleVoice,
    goSettings: () => setTab('settings'), speak, ask,
  };
}

/** Speech bubble that floats above the NPC's head in the sim. */
export function NpcBubble({ chat, onClose }: { chat: NpcChatState; onClose: () => void }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat.history, chat.busy]);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}><Icon name="message" /> {chat.npcName} <small style={{ color: 'var(--ink-faint)' }}>· field guide · {chat.guide.title}</small></h3>
        <div className="row" style={{ gap: 6 }}>
          {ttsAvailable() && (
            <button
              className="btn sm ghost"
              aria-pressed={chat.voiceOn}
              aria-label={chat.voiceOn ? 'Turn voice off' : 'Turn voice on'}
              onClick={chat.toggleVoice}
            >
              {chat.voiceOn ? <><Icon name="volume-on" /> Voice on</> : <><Icon name="volume-off" /> Voice off</>}
            </button>
          )}
          <button className="btn sm ghost" onClick={onClose} aria-label="Close chat"><Icon name="x" /></button>
        </div>
      </div>
      <div ref={logRef} className="captions" role="log" aria-label="Conversation">
        {chat.history.length === 0 && !chat.busy && (
          <p style={{ color: 'var(--ink-dim)', margin: '4px 0' }}>
            Walked up to {chat.npcName}? Ask anything about {chat.guide.title.toLowerCase()} — answers draw on NASA research.
          </p>
        )}
        {chat.history.map((h, i) => (
          <p
            key={i}
            style={{ margin: '6px 0', cursor: h.role === 'model' && ttsAvailable() ? 'pointer' : undefined }}
            title={h.role === 'model' && ttsAvailable() ? 'Click to hear it again' : undefined}
            onClick={() => { if (h.role === 'model') chat.speak(h.text); }}
          >
            <b>{h.role === 'user' ? 'You' : <><Icon name="bot" /> {chat.npcName}</>}:</b> {h.text}
          </p>
        ))}
        {chat.busy && <p aria-live="polite" style={{ color: 'var(--ink-dim)' }}>{chat.npcName} is thinking…</p>}
      </div>
      {chat.err && (
        <div className="alert error" role="alert">
          {chat.err}
          {!chat.hasKey && (
            <> <button className="btn sm ghost" onClick={chat.goSettings}><Icon name="key" /> Add Gemini key</button></>
          )}
        </div>
      )}
      {chat.offline && <div className="alert warn">Offline — chats need a connection (and a Gemini key).</div>}
      <small style={{ color: 'var(--ink-faint)' }}>
        <Icon name="bot" /> AI-generated — may be wrong, never live data.
        {ttsAvailable() && chat.voiceOn && <> <Icon name="volume-on" /> Read aloud — click any answer to replay.</>}
        {' '}Sources:{' '}
        {guideSources(chat.topic).map((s, i) => (
          <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
        ))}
      </small>
    </>
  );
}

/**
 * Dialogue choices + your own question, docked below the NPC. Every choice is
 * numbered so the conversation works from the keyboard (the cursor is hidden
 * over the scene): 1–3 ask a suggested question, 4 jumps into the text box
 * (Enter sends, Esc goes back to the numbers), 5 says goodbye.
 */
export function NpcChoices({ chat, onClose }: { chat: NpcChatState; onClose?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const questions = chat.guide.questions.slice(0, 3);
  const askOwnKey = questions.length + 1;
  const byeKey = askOwnKey + 1;
  const locked = chat.busy || chat.offline;
  const live = useRef({ chat, questions, locked, onClose });
  live.current = { chat, questions, locked, onClose };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      const L = live.current;
      if (n <= L.questions.length) {
        e.preventDefault();
        if (!L.locked) L.chat.ask(L.questions[n - 1]);
      } else if (n === L.questions.length + 1) {
        e.preventDefault();
        if (!L.locked) inputRef.current?.focus();
      } else if (n === L.questions.length + 2 && L.onClose) {
        e.preventDefault();
        L.onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <ol className="npcchoice-list" aria-label={`Things to say to ${chat.npcName}`}>
        {questions.map((q, i) => (
          <li key={q}>
            <button className="npcchoice" disabled={locked} onClick={() => chat.ask(q)}>
              <kbd className="npcchoice-num">{i + 1}</kbd><span>{q}</span>
            </button>
          </li>
        ))}
        <li>
          <button className="npcchoice" disabled={locked} onClick={() => inputRef.current?.focus()}>
            <kbd className="npcchoice-num">{askOwnKey}</kbd><span>Ask my own question…</span>
          </button>
        </li>
        {onClose && (
          <li>
            <button className="npcchoice npcchoice--bye" onClick={onClose}>
              <kbd className="npcchoice-num">{byeKey}</kbd><span>Goodbye</span>
            </button>
          </li>
        )}
      </ol>
      <form
        className="row"
        onSubmit={(e) => { e.preventDefault(); chat.ask(chat.draft); inputRef.current?.blur(); }}
      >
        <input
          ref={inputRef}
          type="text"
          value={chat.draft}
          onChange={(e) => chat.setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inputRef.current?.blur(); } }}
          placeholder={`Ask ${chat.npcName}… (press ${askOwnKey} to type, Enter to send)`}
          aria-label={`Message to ${chat.npcName}`}
          disabled={locked}
          style={{ flex: '1 1 160px' }}
        />
        <button className="btn sm primary" type="submit" disabled={locked || !chat.draft.trim()}>
          {chat.busy ? '…' : 'Send'}
        </button>
      </form>
    </>
  );
}
