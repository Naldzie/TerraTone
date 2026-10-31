import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isNativeShell } from './lib/native';
import './styles.css';

// Lite visuals on phones and in the mobile app: Android/iOS WebViews can't keep
// up with stacked full-screen animated layers, blur and masks — they skip
// painting ("checkerboard"), leaving half-drawn text and blank screens.
{
  const ua = navigator.userAgent;
  const mobileShell = isNativeShell() && /android|iphone|ipad|ipod/i.test(ua);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) < 900;
  if (mobileShell || (coarse && smallScreen)) document.documentElement.dataset.lite = 'true';
}

// Register the service worker for the installable offline PWA (web only).
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeShell()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
