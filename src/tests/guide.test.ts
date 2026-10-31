import { describe, expect, it } from 'vitest';
import { GUIDES, buildGuidePrompt, guideSources } from '../lib/nasaGuide';
import type { GuideTopic } from '../lib/nasaGuide';
import { NPC_NAMES, Npc } from '../sim/npc';

const TOPICS: GuideTopic[] = ['tornado', 'hurricane', 'earthquake', 'volcano', 'ocean', 'wildfire', 'tsunami', 'blackhole', 'bigbang', 'sun'];

describe('NASA guide knowledge', () => {
  it('covers every simulator topic with facts, sources, and questions', () => {
    for (const t of TOPICS) {
      const g = GUIDES[t];
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.facts.length).toBeGreaterThanOrEqual(3);
      expect(g.sources.length).toBeGreaterThanOrEqual(2);
      expect(g.questions.length).toBeGreaterThanOrEqual(3);
      for (const s of g.sources) {
        expect(s.url.startsWith('https://')).toBe(true);
        expect(s.label.length).toBeGreaterThan(0);
      }
    }
  });
  it('grounds prompts in facts, live context, and history', () => {
    const p = buildGuidePrompt('volcano', 'Mina', 'eruption 65% (SIMULATED), ~170 m away',
      [{ role: 'user', text: 'hi' }, { role: 'model', text: 'hello' }], 'Why does it explode?');
    expect(p).toContain('Mina');
    expect(p).toContain('eruption 65%');
    expect(p).toContain('Why does it explode?');
    expect(p).toContain('hi');
    expect(p).toMatch(/SIMULATED|simulat/i);
    // At least one real fact from the topic makes it in.
    expect(GUIDES.volcano.facts.some((f) => p.includes(f.slice(0, 40)))).toBe(true);
  });
  it('caps history to the last 6 turns', () => {
    const long = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `q${i}` }));
    const p = buildGuidePrompt('ocean', 'Theo', 'ctx', long, 'final?');
    expect(p).not.toContain('q0');
    expect(p).toContain('q9');
    expect(p).toContain('final?');
  });
  it('exposes the same sources the UI renders', () => {
    expect(guideSources('wildfire').some((s) => s.url.includes('firms'))).toBe(true);
  });
});

describe('NPC names', () => {
  it('assigns deterministic names from the seed', () => {
    const a = new Npc(1234, 0, 0);
    const b = new Npc(1234, 0, 0);
    expect(a.name).toBe(b.name);
    expect(NPC_NAMES).toContain(a.name);
    const varied = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => new Npc(s * 977, 0, 0).name));
    expect(varied.size).toBeGreaterThan(1);
  });
});
