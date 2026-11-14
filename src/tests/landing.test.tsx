import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LaunchLanding } from '../components/LaunchLanding';

function goTo(label: 'Welcome' | 'Download' | 'Stats' | 'About' | 'Privacy') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }));
}

describe('LaunchLanding', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_INSTALLER_WINDOWS', '');
    vi.stubEnv('VITE_INSTALLER_MAC', '');
    vi.stubEnv('VITE_INSTALLER_PHONE', '');
    vi.stubEnv('VITE_INSTALLER_IOS', '');
    vi.stubEnv('VITE_GITHUB_REPO', '');
    localStorage.clear();
    // The download button probes same-origin installers first; answer like a
    // server that has a real (large, binary) installer ready.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'content-length': '124000000' },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('offers the website plus downloads for Windows, phone, and Mac', () => {
    render(<LaunchLanding onProceed={() => undefined} />);
    expect(screen.getByRole('heading', { name: /hear the pulse of our planet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /proceed to website/i })).toBeInTheDocument();
    goTo('Download');
    expect(screen.getByRole('button', { name: /download for windows/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download for phone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download for mac/i })).toBeInTheDocument();
    // The release badge tracks package.json (v2 after the big update).
    expect(screen.getByText(/^Version 2\.\d+\.\d+$/)).toBeInTheDocument();
  });

  it('switches between the landing pages from the header buttons', () => {
    render(<LaunchLanding onProceed={() => undefined} />);
    const nav = screen.getByRole('navigation', { name: /landing pages/i });
    expect(nav).toBeInTheDocument();
    goTo('Download');
    expect(screen.getByRole('heading', { name: /get the app/i })).toBeInTheDocument();
    goTo('Stats');
    expect(screen.getByRole('heading', { name: /terratone in numbers/i })).toBeInTheDocument();
    goTo('About');
    expect(screen.getByRole('heading', { name: /about terratone/i })).toBeInTheDocument();
    goTo('Privacy');
    expect(screen.getByRole('heading', { name: /privacy/i })).toBeInTheDocument();
    goTo('Welcome');
    expect(screen.getByRole('heading', { name: /hear the pulse of our planet/i })).toBeInTheDocument();
  });

  it('shows total downloads, per-device visits, and music dataset counts', () => {
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Stats');
    expect(screen.getByText(/total downloads/i)).toBeInTheDocument();
    expect(screen.getByText(/total visits/i)).toBeInTheDocument();
    expect(screen.getByText(/music datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/visits by device/i)).toBeInTheDocument();
  });

  it('introduces the project with three anime-style team profiles', () => {
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('About');
    expect(screen.getByText(/a local-first progressive web app/i)).toBeInTheDocument();
    const avatars = screen.getAllByRole('img', { name: /^avatar of /i });
    expect(avatars).toHaveLength(3);
    expect(avatars.map((img) => img.getAttribute('src'))).toEqual([1, 4, 5].map((n) => `/icons/pic${n}.jpg`));
    for (const name of [
      'Ronald Francis Andalis', 'Tristan Kier Ferrer Villacrucis', 'Marysol Ayen Largo',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Team lead')).toBeInTheDocument();
    for (const removed of [/babol/i, /fragata/i, /bolongaita/i]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }
  });

  it('explains privacy in plain language', () => {
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Privacy');
    expect(screen.getByRole('heading', { name: /no accounts, no tracking/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what stays on your device/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /live nasa data/i })).toBeInTheDocument();
  });

  it('enters the website from the primary action', () => {
    const onProceed = vi.fn();
    render(<LaunchLanding onProceed={onProceed} />);
    fireEvent.click(screen.getByRole('button', { name: /proceed to website/i }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('stays inert behind the intro until it is revealed', () => {
    const onProceed = vi.fn();
    const { container, rerender } = render(<LaunchLanding onProceed={onProceed} active={false} />);
    const region = container.querySelector('.landing');
    expect(region).toHaveAttribute('inert');
    expect(region).toHaveAttribute('aria-hidden', 'true');

    rerender(<LaunchLanding onProceed={onProceed} active />);
    const visible = screen.getByRole('region', { name: /welcome to terratone/i });
    expect(visible).not.toHaveAttribute('inert');
    expect(visible).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: /proceed to website/i })).toHaveFocus();
  });

  it('turns into an in-app entry screen inside a native shell', () => {
    const onProceed = vi.fn();
    render(<LaunchLanding onProceed={onProceed} nativeShell />);
    expect(screen.getByRole('button', { name: /enter terratone/i })).toBeInTheDocument();
    goTo('Download');
    expect(screen.getByRole('heading', { name: /get the app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download for windows/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download for phone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download for mac/i })).toBeInTheDocument();
    goTo('Welcome');
    fireEvent.click(screen.getByRole('button', { name: /enter terratone/i }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('shows install instructions when the browser cannot show its install prompt', async () => {
    // No macOS installer is hosted, so the Mac button falls back to the web-app install.
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for mac/i }));
    const dialog = await screen.findByRole('dialog', { name: /install terratone for mac/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/install icon in the address bar/i)).toBeInTheDocument();
  });

  it('downloads a configured installer artifact directly', async () => {
    vi.stubEnv('VITE_INSTALLER_WINDOWS', '/downloads/TerraTone-Setup.exe');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for windows/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/downloads/TerraTone-Setup.exe');
    expect(screen.getByRole('status')).toHaveTextContent(/downloading terratone for windows/i);
  });

  it('never saves a broken file when the installer is missing', async () => {
    vi.stubEnv('VITE_INSTALLER_WINDOWS', '/downloads/TerraTone-Windows-Setup.exe');
    // A missing installer used to fall back to the web page (saved as a fake .exe).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for windows/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/isn't available right now/i));
    expect(click).not.toHaveBeenCalled();
  });

  it('downloads the hosted Google Drive installers by default', async () => {
    vi.stubEnv('VITE_GITHUB_REPO', 'example/terratone');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for windows/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toMatch(
      /^https:\/\/drive\.usercontent\.google\.com\/download\?id=[\w-]+&export=download&confirm=t$/,
    );
  });

  it('downloads through the site lookup function on hosted builds', async () => {
    vi.stubEnv('VITE_API_PROXY', '/api');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for windows/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/api/download/windows');
  });

  it('falls back to the stable GitHub release asset', async () => {
    vi.stubEnv('VITE_GITHUB_REPO', 'example/terratone');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for mac/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe(
      'https://github.com/example/terratone/releases/latest/download/TerraTone-macOS.dmg',
    );
  });

  it('uses the iOS installer instead of the Android APK on an iPhone', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );
    vi.stubEnv('VITE_INSTALLER_IOS', '/downloads/TerraTone.ipa');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for phone/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/downloads/TerraTone.ipa');
  });

  it('opens a configured TestFlight link on iOS', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );
    vi.stubEnv('VITE_INSTALLER_IOS', 'https://testflight.apple.com/join/terratone');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for phone/i }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(
      'https://testflight.apple.com/join/terratone',
      '_blank',
      'noopener',
    ));
    expect(screen.getByRole('status')).toHaveTextContent(/opening testflight/i);
  });

  it('keeps platform-specific downloads working on iOS', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );
    vi.stubEnv('VITE_INSTALLER_MAC', '/downloads/TerraTone.dmg');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for mac/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/downloads/TerraTone.dmg');
  });

  it('does not send iOS users to a missing GitHub IPA asset', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );
    vi.stubEnv('VITE_GITHUB_REPO', 'example/terratone');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for phone/i }));
    expect(await screen.findByRole('dialog', { name: /install terratone on your phone/i })).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
  });

  it('shows Add to Home Screen instructions on iOS without an IPA', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for phone/i }));
    expect(await screen.findByRole('dialog', { name: /install terratone on your phone/i })).toBeInTheDocument();
    expect(screen.getByText(/tap share, then choose add to home screen/i)).toBeInTheDocument();
  });

  it('closes the install dialog with Escape', async () => {
    render(<LaunchLanding onProceed={() => undefined} />);
    goTo('Download');
    fireEvent.click(screen.getByRole('button', { name: /download for mac/i }));
    const dialog = await screen.findByRole('dialog', { name: /install terratone for mac/i });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
