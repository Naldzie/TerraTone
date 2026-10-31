import { beforeEach, describe, expect, it } from 'vitest';
import {
  INTRO_TIMELINES,
  hasSeenIntro,
  introTotalMs,
  isIntroMuted,
  loadStartupPrefs,
  markIntroSeen,
  resetIntroSeen,
  resolveIntroVariant,
  saveIntroMuted,
  saveStartupPrefs,
} from '../lib/intro';

describe('cinematic intro launch policy', () => {
  const prefs = { enabled: true, frequency: 'once' as const };

  it('plays the full version on the first launch', () => {
    expect(resolveIntroVariant(prefs, false, false)).toBe('full');
    expect(resolveIntroVariant({ enabled: true, frequency: 'every' }, false, false)).toBe('full');
  });

  it('replays the full intro on later visits when recurring intros are enabled', () => {
    expect(resolveIntroVariant({ enabled: true, frequency: 'every' }, true, false)).toBe('full');
    expect(resolveIntroVariant({ enabled: true, frequency: 'once' }, true, false)).toBeNull();
  });

  it('never overrides the user preference to disable intros', () => {
    expect(resolveIntroVariant({ enabled: false, frequency: 'every' }, false, false)).toBeNull();
    expect(resolveIntroVariant({ enabled: false, frequency: 'every' }, true, true)).toBeNull();
  });

  it('uses a calm variant for reduced-motion users without extending the wait', () => {
    expect(resolveIntroVariant(prefs, false, true)).toBe('reduced');
    expect(resolveIntroVariant({ enabled: true, frequency: 'every' }, true, true)).toBe('reduced');
    expect(resolveIntroVariant({ enabled: true, frequency: 'once' }, true, true)).toBeNull();
  });

  it('keeps first-launch and recurring durations in the requested ranges', () => {
    expect(introTotalMs('full')).toBeGreaterThanOrEqual(5000);
    expect(introTotalMs('full')).toBeLessThanOrEqual(8000);
    expect(introTotalMs('short')).toBeGreaterThanOrEqual(2000);
    expect(introTotalMs('short')).toBeLessThanOrEqual(3000);
    expect(introTotalMs('reduced')).toBeLessThan(introTotalMs('full'));
    expect(INTRO_TIMELINES.full.exitAt).toBeGreaterThan(INTRO_TIMELINES.full.subtitleAt);
  });
});

describe('intro preference persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetIntroSeen();
  });

  it('round-trips startup preferences and ignores malformed data', () => {
    expect(loadStartupPrefs()).toEqual({});
    saveStartupPrefs({ enabled: false, frequency: 'every', quiet: true, volume: 0.4 });
    expect(loadStartupPrefs()).toEqual({ enabled: false, frequency: 'every', quiet: true, volume: 0.4 });

    localStorage.setItem('tt_intro_prefs', '{broken');
    expect(loadStartupPrefs()).toEqual({});
    localStorage.setItem('tt_intro_prefs', JSON.stringify({ enabled: 'yes', frequency: 'sometimes' }));
    expect(loadStartupPrefs()).toEqual({});
  });

  it('keeps the audio gate available on the first paint', () => {
    // Quiet mode and the chosen volume must be readable synchronously, before
    // IndexedDB answers, otherwise the intro would start audio for a muted user.
    saveStartupPrefs({ enabled: true, frequency: 'once', quiet: true, volume: 0 });
    const prefs = loadStartupPrefs();
    expect(prefs.quiet).toBe(true);
    expect(prefs.volume).toBe(0);
  });

  it('clamps a corrupted volume instead of trusting it', () => {
    localStorage.setItem('tt_intro_prefs', JSON.stringify({ volume: 42 }));
    expect(loadStartupPrefs().volume).toBe(1);
    localStorage.setItem('tt_intro_prefs', JSON.stringify({ volume: -5 }));
    expect(loadStartupPrefs().volume).toBe(0);
    localStorage.setItem('tt_intro_prefs', JSON.stringify({ volume: 'loud' }));
    expect(loadStartupPrefs().volume).toBeUndefined();
  });

  it('remembers that the intro was seen and the intro mute choice', () => {
    expect(hasSeenIntro()).toBe(false);
    markIntroSeen();
    expect(hasSeenIntro()).toBe(true);

    expect(isIntroMuted()).toBe(false);
    saveIntroMuted(true);
    expect(isIntroMuted()).toBe(true);
    saveIntroMuted(false);
    expect(isIntroMuted()).toBe(false);
  });

  it('lets the intro play again once the user re-enables it', () => {
    markIntroSeen();
    expect(resolveIntroVariant({ enabled: true, frequency: 'once' }, hasSeenIntro(), false)).toBeNull();
    resetIntroSeen();
    expect(resolveIntroVariant({ enabled: true, frequency: 'once' }, hasSeenIntro(), false)).toBe('full');
  });
});
