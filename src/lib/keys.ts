/* API key storage — keys live ONLY on the user's device.
 *
 * Priority: localStorage (entered in Settings UI) → build-time env
 * (VITE_NASA_API_KEY / VITE_GEMINI_API_KEY in a local, gitignored .env).
 * Keys are NEVER hardcoded, never logged, and never sent anywhere except
 * the official api.nasa.gov / generativelanguage.googleapis.com endpoints.
 */
import { useReducer } from 'react';

const LS_NASA = 'tt_nasa_key';
const LS_GEMINI = 'tt_gemini_key';

function lsGet(k: string): string {
  try {
    return (localStorage.getItem(k) ?? '').trim();
  } catch {
    return '';
  }
}

function envGet(name: string): string {
  try {
    const v = (import.meta.env as Record<string, unknown>)[name];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

export function getNasaKey(): string {
  return lsGet(LS_NASA) || envGet('VITE_NASA_API_KEY');
}

export function getGeminiKey(): string {
  return lsGet(LS_GEMINI) || envGet('VITE_GEMINI_API_KEY');
}

export function setStoredKey(which: 'nasa' | 'gemini', value: string): void {
  try {
    localStorage.setItem(which === 'nasa' ? LS_NASA : LS_GEMINI, value.trim());
  } catch { /* private mode — keys just won't persist */ }
}

export function clearStoredKey(which: 'nasa' | 'gemini'): void {
  try {
    localStorage.removeItem(which === 'nasa' ? LS_NASA : LS_GEMINI);
  } catch { /* noop */ }
}

export function hasStoredKey(which: 'nasa' | 'gemini'): boolean {
  return lsGet(which === 'nasa' ? LS_NASA : LS_GEMINI).length > 0;
}

export type KeySource = 'device' | 'env' | 'none';

/** Where the effective key comes from (never exposes the value to UI). */
export function keySource(which: 'nasa' | 'gemini'): KeySource {
  if (hasStoredKey(which)) return 'device';
  const env = which === 'nasa' ? envGet('VITE_NASA_API_KEY') : envGet('VITE_GEMINI_API_KEY');
  return env ? 'env' : 'none';
}

/** Tiny hook so Settings inputs re-render on save/clear. */
export function useKeyState(which: 'nasa' | 'gemini'): {
  source: KeySource;
  save: (v: string) => void;
  clear: () => void;
} {
  const [, force] = useReducer((x: number) => x + 1, 0);
  return {
    source: keySource(which),
    save: (v: string) => { setStoredKey(which, v); force(); },
    clear: () => { clearStoredKey(which); force(); },
  };
}
