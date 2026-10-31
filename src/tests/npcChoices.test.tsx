import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NpcChoices } from '../components/NpcChat';
import type { NpcChatState } from '../components/NpcChat';
import { GUIDES } from '../lib/nasaGuide';

function fakeChat(over: Partial<NpcChatState> = {}): NpcChatState {
  return {
    npcName: 'Mina', topic: 'sun', guide: GUIDES.sun, history: [], draft: '',
    setDraft: vi.fn(), busy: false, err: '', offline: false, hasKey: true,
    voiceOn: false, toggleVoice: vi.fn(), goSettings: vi.fn(), speak: vi.fn(), ask: vi.fn(),
    ...over,
  };
}

describe('NPC dialogue choices (keyboard)', () => {
  it('numbers every choice 1–5', () => {
    render(<NpcChoices chat={fakeChat()} onClose={() => undefined} />);
    const nums = screen.getAllByRole('button').map((b) => b.querySelector('kbd')?.textContent).filter(Boolean);
    expect(nums).toEqual(['1', '2', '3', '4', '5']);
  });

  it('asks the matching question for keys 1–3', () => {
    const chat = fakeChat();
    render(<NpcChoices chat={chat} />);
    fireEvent.keyDown(window, { key: '2' });
    expect(chat.ask).toHaveBeenCalledWith(GUIDES.sun.questions[1]);
  });

  it('4 jumps into the text box; Escape leaves it; 5 says goodbye', () => {
    const onClose = vi.fn();
    render(<NpcChoices chat={fakeChat()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: '4' });
    const input = screen.getByRole('textbox');
    expect(document.activeElement).toBe(input);
    // Digits typed into the box are text, not shortcuts.
    fireEvent.keyDown(input, { key: '5' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: '5' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores number keys while the guide is thinking', () => {
    const chat = fakeChat({ busy: true });
    render(<NpcChoices chat={chat} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(chat.ask).not.toHaveBeenCalled();
  });
});
