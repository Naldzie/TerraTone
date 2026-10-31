/** Speech synthesis helpers — browser voice on the web, native Android TTS in the APK. */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface TerraToneTtsPlugin {
  speak(options: { text: string; pitch?: number; rate?: number }): Promise<void>;
  stop(): Promise<void>;
  isAvailable(): Promise<{ available: boolean }>;
}

const nativeTts = registerPlugin<TerraToneTtsPlugin>('TerraToneTts');

function nativeTtsAvailable(): boolean {
  return typeof window !== 'undefined'
    && Capacitor.getPlatform() === 'android'
    && Capacitor.isPluginAvailable('TerraToneTts');
}

export function ttsAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return nativeTtsAvailable() || 'speechSynthesis' in window;
}

/** Strip markdown/links so the voice reads clean prose. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_`#>]/g, '')
    .trim();
}

export interface SpeakOptions {
  pitch?: number;
  rate?: number;
  voiceIndex?: number;
}

function speechTimeoutMs(text: string, rate: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(4000, (words * 600) / Math.max(0.5, rate) + 3000);
}

export async function speakText(text: string, options: SpeakOptions = {}): Promise<void> {
  const clean = speakable(text);
  if (!clean) return;

  if (nativeTtsAvailable()) {
    try {
      await nativeTts.speak({ text: clean, pitch: options.pitch, rate: options.rate });
      return;
    } catch {
      /* Native TTS failed; fall back to the browser voice. */
    }
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.pitch = options.pitch ?? 1;
    utterance.rate = options.rate ?? 1;
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (voices.length) utterance.voice = voices[(options.voiceIndex ?? 0) % voices.length];
    let settled = false;
    let timer = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    timer = window.setTimeout(finish, speechTimeoutMs(clean, utterance.rate));
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (nativeTtsAvailable()) {
    void nativeTts.stop().catch(() => {});
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
