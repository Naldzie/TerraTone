import { describe, expect, it } from 'vitest';
import { speakable, ttsAvailable } from '../lib/tts';

describe('speech helpers (AI voice)', () => {
  it('strips markdown, links and URLs so the voice reads clean prose', () => {
    const out = speakable('See **NASA** [GPM](https://gpm.nasa.gov/) live at https://example.com `now`.');
    expect(out).toContain('NASA');
    expect(out).toContain('GPM');
    expect(out).toContain('link');
    expect(out).not.toMatch(/https?:/);
    expect(out).not.toMatch(/[*_`#>[\]()]/);
  });
  it('never throws and reports availability as a boolean', () => {
    expect(typeof ttsAvailable()).toBe('boolean');
    expect(speakable('')).toBe('');
  });
});
