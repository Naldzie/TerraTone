export type InstallPlatform = 'windows' | 'phone' | 'mac' | 'other';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export interface InstallInstructions {
  title: string;
  steps: string[];
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify(): void {
  for (const listener of listeners) listener(deferredPrompt !== null);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribeInstallPrompt(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  listener(deferredPrompt !== null);
  return () => {
    listeners.delete(listener);
  };
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';
  deferredPrompt = null;
  notify();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const touchMac = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/android|iphone|ipad|ipod/i.test(ua) || touchMac) return 'phone';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh|mac os x/i.test(ua)) return 'mac';
  return 'other';
}

const RELEASE_ASSETS: Record<Exclude<InstallPlatform, 'other'>, string> = {
  windows: 'TerraTone-Windows-Setup.exe',
  mac: 'TerraTone-macOS.dmg',
  phone: 'TerraTone-Android.apk',
};

function envValue(key: string): string | null {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const value = env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function releaseUrl(asset: string): string | null {
  const repo = envValue('VITE_GITHUB_REPO');
  if (!repo) return null;
  const base = /^https?:\/\//i.test(repo) ? repo.replace(/\/+$/, '') : `https://github.com/${repo}`;
  return `${base}/releases/latest/download/${asset}`;
}

/**
 * Optional direct installer artifacts. Set the platform-specific VITE_INSTALLER_*
 * variables for custom URLs, or VITE_GITHUB_REPO to use the stable asset names
 * published by the release workflow.
 */
export function installerUrl(platform: InstallPlatform): string | null {
  if (platform === 'other') return null;
  const key = platform === 'windows' ? 'VITE_INSTALLER_WINDOWS'
    : platform === 'mac' ? 'VITE_INSTALLER_MAC'
    : 'VITE_INSTALLER_PHONE';
  return envValue(key) ?? releaseUrl(RELEASE_ASSETS[platform]);
}

/**
 * Check that a same-origin installer link really serves an installer (not a
 * 404 or the web page), so the browser never saves a corrupt ".exe"/".apk".
 * Cross-origin links (GitHub releases, TestFlight) can't be probed and pass.
 */
export async function installerAvailable(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return true;
  let target: URL;
  try {
    target = new URL(url, window.location.href);
  } catch {
    return false;
  }
  if (target.origin !== window.location.origin) return true;
  try {
    const res = await fetch(target.href, { method: 'HEAD', cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    const size = Number(res.headers.get('content-length') ?? '0');
    return res.ok && !/text\/html/i.test(type) && (size === 0 || size > 1024 * 1024);
  } catch {
    return false;
  }
}

export function iosInstallerUrl(): string | null {
  // The release workflow does not produce an IPA (Apple signing is required).
  // Only use an explicitly configured iOS artifact.
  return envValue('VITE_INSTALLER_IOS');
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua)
    || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

export function installInstructions(platform: InstallPlatform): InstallInstructions {
  switch (platform) {
    case 'windows':
      return {
        title: 'Install TerraTone for Windows',
        steps: [
          'Open TerraTone in Microsoft Edge or Google Chrome.',
          'Click the install icon in the address bar, or open the browser menu and choose Install TerraTone.',
          'Confirm Install. TerraTone opens in its own window and keeps working offline.',
        ],
      };
    case 'mac':
      return {
        title: 'Install TerraTone for Mac',
        steps: [
          'Open TerraTone in Google Chrome or Microsoft Edge.',
          'Choose Install TerraTone from the install icon in the address bar or the browser menu.',
          'In Safari 17 or newer, use File > Add to Dock instead.',
        ],
      };
    case 'phone':
      return {
        title: 'Install TerraTone on your phone',
        steps: [
          'On Android, open the browser menu and choose Install app or Add to Home screen.',
          'On iPhone or iPad, tap Share, then choose Add to Home Screen.',
          'Launch TerraTone from your home screen. It opens full screen and works offline.',
        ],
      };
    default:
      return {
        title: 'Install TerraTone',
        steps: [
          'Open TerraTone in Chrome, Edge, or Safari.',
          'Use the browser install option, or choose Add to Home Screen on mobile.',
          'TerraTone then opens in its own window and works offline.',
        ],
      };
  }
}
