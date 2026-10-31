/* Cinematic intro launch policy + persistence.
 *
 * The intro decision must be synchronous on first paint, so the small set of
 * intro preferences is mirrored to localStorage (the rest of the app settings
 * stay in IndexedDB). The "seen" and mute flags are device-local by design.
 */
import type { IntroFrequency } from '../types';

export type { IntroFrequency } from '../types';

export type IntroVariant = 'full' | 'short' | 'reduced';
export type IntroFinishReason = 'complete' | 'skip';

export interface IntroPreferences {
  enabled: boolean;
  frequency: IntroFrequency;
}

/**
 * Everything the intro needs *synchronously*, on the very first paint.
 *
 * The rest of the app settings live in IndexedDB and therefore arrive one
 * tick too late for a launch-time decision: without this mirror a user who
 * enabled Quiet mode would still be greeted by intro audio, and the intro
 * would start at the default volume instead of the one they chose.
 */
export interface StartupPreferences extends IntroPreferences {
  /** Quiet mode (captions + visuals only): the intro must stay silent. */
  quiet: boolean;
  /** Master volume the intro soundscape should honour. */
  volume: number;
}

export interface IntroTimeline {
  logoAt: number;
  impactAt: number;
  taglineAt: number;
  subtitleAt: number;
  exitAt: number;
  exitDuration: number;
}

/** Delays in milliseconds. Full intro ≈ 7.4s, recurring ≈ 2.8s. */
export const INTRO_TIMELINES: Record<IntroVariant, IntroTimeline> = {
  full: { logoAt: 1250, impactAt: 1800, taglineAt: 2600, subtitleAt: 3350, exitAt: 6000, exitDuration: 1400 },
  short: { logoAt: 260, impactAt: 460, taglineAt: 760, subtitleAt: 1050, exitAt: 1900, exitDuration: 850 },
  reduced: { logoAt: 0, impactAt: 120, taglineAt: 120, subtitleAt: 220, exitAt: 2000, exitDuration: 220 },
};

export function introTotalMs(variant: IntroVariant): number {
  const t = INTRO_TIMELINES[variant];
  return t.exitAt + t.exitDuration;
}

const PREFS_KEY = 'tt_intro_prefs';
const SEEN_KEY = 'tt_intro_seen';
const MUTED_KEY = 'tt_intro_muted';
const FREQUENCY_CHOSEN_KEY = 'tt_intro_freq_chosen';
export const INTRO_PREVIEW_EVENT = 'terratone:intro-preview';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled: intro still works, preferences reset per visit */
  }
}

/** Read the mirrored startup preferences (safe against old/corrupt values). */
export function loadStartupPrefs(): Partial<StartupPreferences> {
  const raw = safeGet(PREFS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<StartupPreferences>;
    const out: Partial<StartupPreferences> = {};
    if (typeof parsed.enabled === 'boolean') out.enabled = parsed.enabled;
    if (parsed.frequency === 'once' || parsed.frequency === 'every') out.frequency = parsed.frequency;
    if (typeof parsed.quiet === 'boolean') out.quiet = parsed.quiet;
    if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
      out.volume = Math.min(1, Math.max(0, parsed.volume));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStartupPrefs(prefs: StartupPreferences): void {
  safeSet(PREFS_KEY, JSON.stringify({
    enabled: prefs.enabled,
    frequency: prefs.frequency,
    quiet: prefs.quiet,
    volume: prefs.volume,
  }));
}

export function hasSeenIntro(): boolean {
  return safeGet(SEEN_KEY) === '1';
}

export function markIntroSeen(): void {
  safeSet(SEEN_KEY, '1');
}

export function resetIntroSeen(): void {
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch {
    /* noop */
  }
}

export function isIntroMuted(): boolean {
  return safeGet(MUTED_KEY) === '1';
}

export function saveIntroMuted(muted: boolean): void {
  safeSet(MUTED_KEY, muted ? '1' : '0');
}

/**
 * The launch policy:
 *  - disabled → no intro
 *  - first visit → full intro
 *  - every launch → the same full intro on later visits
 *  - first-launch-only and already seen → straight to the dashboard
 *  - reduced motion → static version of the same policy
 */
export function resolveIntroVariant(
  prefs: IntroPreferences,
  seen: boolean,
  reduceMotion: boolean,
): IntroVariant | null {
  if (!prefs.enabled) return null;
  if (seen && prefs.frequency === 'once') return null;
  if (reduceMotion) return 'reduced';
  return 'full';
}

/** Remember that the user explicitly picked a frequency in Settings. */
export function markIntroFrequencyChosen(): void {
  safeSet(FREQUENCY_CHOSEN_KEY, '1');
}

/** Whether the intro frequency is a deliberate user choice (vs. the legacy default). */
export function introFrequencyChosen(): boolean {
  return safeGet(FREQUENCY_CHOSEN_KEY) === '1';
}

export function requestIntroPreview(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INTRO_PREVIEW_EVENT));
}

export function onIntroPreview(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(INTRO_PREVIEW_EVENT, handler);
  return () => window.removeEventListener(INTRO_PREVIEW_EVENT, handler);
}
