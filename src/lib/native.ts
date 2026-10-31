/**
 * True when the web app is running inside one of the packaged shells
 * (Electron/Tauri desktop or Capacitor mobile). The browser-only landing
 * page and service worker are skipped in those builds.
 */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const shell = window as Window & {
    Capacitor?: unknown;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  const electron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
  return Boolean(shell.Capacitor || shell.__TAURI_INTERNALS__ || shell.__TAURI__ || electron);
}
