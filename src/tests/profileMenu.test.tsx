import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AppProvider, useApp } from '../store/AppContext';
import { ProfileMenu } from '../components/ProfileMenu';

// jsdom has no WebGL: the 3D preview must cope without a context.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

function Harness() {
  const { profileOpen, setProfileOpen, tab } = useApp();
  return (
    <>
      <button onClick={() => setProfileOpen(true)}>open profile</button>
      <span data-testid="tab">{tab}</span>
      <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

function openProfile() {
  render(
    <AppProvider>
      <Harness />
    </AppProvider>,
  );
  expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'open profile' }));
  return screen.getByRole('dialog', { name: 'Profile' });
}

describe('ProfileMenu', () => {
  beforeEach(() => localStorage.removeItem('tt_avatar'));

  it('holds the Explorer look editor, moved out of Settings', () => {
    const dialog = openProfile();
    expect(within(dialog).getByRole('heading', { name: /explorer look/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Character' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Headgear' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Neck' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Back' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Ears' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /wardrobe/i })).toBeInTheDocument();
  });

  it('offers girl and boy characters', () => {
    const dialog = openProfile();
    const group = within(dialog).getByRole('group', { name: 'Character' });
    const girl = within(group).getByRole('button', { name: 'Girl' });
    const boy = within(group).getByRole('button', { name: 'Boy' });
    expect(girl).toHaveAttribute('aria-pressed', 'false');
    expect(boy).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(girl);
    expect(girl).toHaveAttribute('aria-pressed', 'true');
    expect(boy).toHaveAttribute('aria-pressed', 'false');
  });

  it('reveals the More options section', () => {
    const dialog = openProfile();
    const more = within(dialog).getByRole('button', { name: /more options/i });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('button', { name: /access/i })).toBeNull();
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    for (const name of [/settings/i, /access/i, /sims/i, /library/i]) {
      expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /settings/i }));
    expect(screen.getByTestId('tab')).toHaveTextContent('settings');
    expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull();
  });

  it('closes from the Close button and from Escape', () => {
    openProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Close profile menu' }));
    expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'open profile' }));
    expect(screen.getByRole('dialog', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull();
  });
});
