import { describe, expect, it, beforeEach } from 'vitest';
import { epicPngUrl } from '../lib/epic';
import { buildExplainPrompt, extractText, pickModel, rankModels } from '../lib/gemini';
import { clearStoredKey, getGeminiKey, getNasaKey, setStoredKey } from '../lib/keys';

describe('EPIC URL builder', () => {
  it('builds dated archive PNG URLs without an API key', () => {
    const url = epicPngUrl({ image: 'epic_1b_20250102120000', date: '2025-01-02 12:00:00' });
    expect(url).toBe('https://epic.gsfc.nasa.gov/archive/natural/2025/01/02/png/epic_1b_20250102120000.png');
    expect(url).not.toContain('api_key');
  });
});

describe('Gemini helpers', () => {
  it('grounds the prompt in real dataset facts', () => {
    const p = buildExplainPrompt({
      title: 'Demo temps', units: '°C', range: [-0.5, 1.6],
      summary: '10 frames, rising.', mappingNote: 'Up means higher pitch.', profile: 'Musical',
    });
    expect(p).toMatch(/Demo temps/);
    expect(p).toMatch(/10 frames, rising/);
    expect(p).toMatch(/Remember:/);
  });
  it('prefers flash models, falls back to any capable model', () => {
    const models = [{ name: 'models/gemini-pro' }, { name: 'models/gemini-2.0-flash' }];
    expect(pickModel(models)).toBe('models/gemini-2.0-flash');
    expect(pickModel([{ name: 'models/gemini-pro' }])).toBe('models/gemini-pro');
    expect(pickModel([{ name: 'other/thing' }])).toBeNull();
    expect(pickModel([])).toBeNull();
  });
  it('extracts text and rejects empty responses', () => {
    const ok = { candidates: [{ content: { parts: [{ text: 'Hello ' }, { text: 'world' }] } }] };
    expect(extractText(ok)).toBe('Hello world');
    expect(() => extractText({ candidates: [] })).toThrow(/empty/);
    expect(() => extractText({})).toThrow(/empty/);
    expect(() => extractText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/safety/i);
  });
  it('ranks stable flash models first, exotics last', () => {
    const ranked = rankModels([
      { name: 'models/gemini-2.5-flash-preview-tts' },
      { name: 'models/gemini-2.5-pro' },
      { name: 'models/gemini-2.5-flash' },
      { name: 'models/other-thing' },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['embedContent'] },
    ]);
    expect(ranked[0]).toBe('models/gemini-2.5-flash');
    expect(ranked).toContain('models/gemini-2.5-pro');
    expect(ranked[ranked.length - 1]).toBe('models/gemini-2.5-flash-preview-tts');
    // Unknown models/* IDs are kept as last resorts (they may still work).
    expect(ranked.indexOf('models/other-thing')).toBeGreaterThan(ranked.indexOf('models/gemini-2.5-pro'));
    expect(ranked.filter((m) => m === 'models/gemini-2.5-flash')).toHaveLength(1);
  });
});

describe('key storage (on-device only)', () => {
  beforeEach(() => {
    clearStoredKey('nasa');
    clearStoredKey('gemini');
  });
  it('round-trips keys through localStorage and clears them', () => {
    // NOTE: a real .env may provide fallback keys under test (Vite loads .env),
    // so assertions target the localStorage layer, not the effective value.
    clearStoredKey('nasa');
    clearStoredKey('gemini');
    expect(localStorage.getItem('tt_nasa_key')).toBeNull();
    setStoredKey('nasa', '  TEST-KEY  ');
    expect(getNasaKey()).toBe('TEST-KEY');
    expect(localStorage.getItem('tt_nasa_key')).toBe('TEST-KEY');
    clearStoredKey('nasa');
    expect(localStorage.getItem('tt_nasa_key')).toBeNull();
    setStoredKey('gemini', 'GKEY');
    expect(getGeminiKey()).toBe('GKEY');
    clearStoredKey('gemini');
    expect(localStorage.getItem('tt_gemini_key')).toBeNull();
  });
});
