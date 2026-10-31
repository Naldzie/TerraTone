import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isNativeShell } from './lib/native';
import './styles.css';

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
