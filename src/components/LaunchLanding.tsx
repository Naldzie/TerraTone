import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { GuidedTour } from './GuidedTour';
import { TOURS, dismissLandingTour, landingTourPending } from '../lib/tours';
import {
  detectInstallPlatform,
  installerAvailable,
  installerUrl,
  iosInstallerUrl,
  isIos,
  isStandalone,
  installInstructions,
  promptInstall,
  subscribeInstallPrompt,
} from '../lib/install';
import type { InstallPlatform } from '../lib/install';
import { SAMPLE_DATASETS } from '../data/samples';

interface LaunchLandingProps {
  onProceed: () => void;
  nativeShell?: boolean;
  active?: boolean;
}

type LandingPage = 'welcome' | 'download' | 'stats' | 'about' | 'privacy';

const PAGES: { id: LandingPage; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'download', label: 'Download' },
  { id: 'stats', label: 'Stats' },
  { id: 'about', label: 'About' },
  { id: 'privacy', label: 'Privacy' },
];

const PLATFORMS: { id: InstallPlatform; label: string; detail: string; action: string }[] = [
  { id: 'windows', label: 'Windows', detail: 'Windows 10 & 11 · Desktop app', action: 'Download for Windows' },
  { id: 'phone', label: 'Phone', detail: 'Android & iPhone · Mobile app', action: 'Download for phone' },
  { id: 'mac', label: 'Mac', detail: 'macOS · Desktop app', action: 'Download for Mac' },
];

/* The team, with the avatar each member chose (public/icons/pic*.jpg). */
const TEAM: { name: string; role: string; photo: string }[] = [
  { name: 'Ronald Francis Andalis', role: 'Team lead', photo: '/icons/pic1.jpg' },
  { name: 'Tristan Kier Ferrer Villacrucis', role: 'Team member', photo: '/icons/pic4.jpg' },
  { name: 'Marysol Ayen Largo', role: 'Team member', photo: '/icons/pic5.jpg' },
];

/** Current release (from package.json); a fallback keeps tests and odd builds working. */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '2.0.0';

const STATS_KEY = 'terratone.landing.stats';

interface LandingStats {
  visits: number;
  downloads: number;
  devices: Record<string, number>;
}

function readStats(): LandingStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { visits: 0, downloads: 0, devices: {} };
    const parsed = JSON.parse(raw) as Partial<LandingStats>;
    return {
      visits: Number(parsed.visits) || 0,
      downloads: Number(parsed.downloads) || 0,
      devices: parsed.devices && typeof parsed.devices === 'object' ? { ...parsed.devices } : {},
    };
  } catch {
    return { visits: 0, downloads: 0, devices: {} };
  }
}

function writeStats(stats: LandingStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* storage may be blocked — stats simply stay in memory-less mode */
  }
}

function deviceKey(platform: InstallPlatform): string {
  return platform === 'phone' ? 'phone' : platform === 'mac' ? 'mac' : platform === 'windows' ? 'windows' : 'other';
}

function deviceLabel(key: string): string {
  if (key === 'windows') return 'Windows desktop';
  if (key === 'mac') return 'Mac desktop';
  if (key === 'phone') return 'Phone';
  return 'Other devices';
}

/* Count the visit once per page load — StrictMode must not double-count. */
let visitCounted = false;

function PlatformIcon({ platform }: { platform: InstallPlatform }) {
  if (platform === 'windows') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 4.6 10.4 3.6v7.2H3V4.6Zm8.4-1.1L21 2v8.8h-9.6V3.5ZM3 11.8h7.4V19L3 18v-6.2Zm8.4 0H21V22l-9.6-1.3v-8.9Z" fill="currentColor" />
      </svg>
    );
  }
  if (platform === 'phone') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 5.4h3M11 18.5h2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 20h8M12 17v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v10m-4-4 4 4 4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .7 3.3 2.3 3.8 4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function WaveGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h2l2-6 3 12 3-14 3 16 2-8h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InstallDialog({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const info = useMemo(() => installInstructions(platform), [platform]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="landing__overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="landing__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
        onKeyDown={onKeyDown}
      >
        <button
          ref={closeRef}
          type="button"
          className="landing__dialogclose"
          onClick={onClose}
          aria-label="Close install instructions"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
        <span className="landing__dialogicon"><PlatformIcon platform={platform} /></span>
        <h2 id="install-dialog-title">{info.title}</h2>
        <ol className="landing__steps">
          {info.steps.map((step, index) => (
            <li key={step}>
              <span aria-hidden="true">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="landing__dialognote">
          TerraTone installs directly from your browser as a lightweight offline app. No app store or account is required.
        </p>
        <button type="button" className="landing__dialogdone" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

export function LaunchLanding({ onProceed, nativeShell = false, active = true }: LaunchLandingProps) {
  const [page, setPage] = useState<LandingPage>('welcome');
  const [currentPlatform] = useState<InstallPlatform>(detectInstallPlatform);
  const [promptReady, setPromptReady] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const [dialogPlatform, setDialogPlatform] = useState<InstallPlatform | null>(null);
  const [status, setStatus] = useState('');
  const [stats, setStats] = useState<LandingStats>(() => readStats());
  const [touring, setTouring] = useState(false);
  const proceedRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!active) return;
    proceedRef.current?.focus();
  }, [active]);

  /* First visit to the website: walk the newcomer through the landing page
   * automatically, once per device (the Guide button replays it any time). */
  useEffect(() => {
    if (!active || !landingTourPending()) return;
    const timer = window.setTimeout(() => {
      dismissLandingTour();
      setPage('welcome');
      setTouring(true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => subscribeInstallPrompt(setPromptReady), []);

  useEffect(() => {
    if (visitCounted) return;
    visitCounted = true;
    const next = readStats();
    next.visits += 1;
    const key = deviceKey(currentPlatform);
    next.devices[key] = (next.devices[key] ?? 0) + 1;
    writeStats(next);
    setStats(next);
  }, [currentPlatform]);

  const goTo = useCallback((next: LandingPage) => {
    setPage(next);
    setStatus('');
  }, []);

  useEffect(() => {
    if (page === 'welcome') {
      proceedRef.current?.focus();
    } else {
      headingRef.current?.focus();
    }
  }, [page]);

  const recordDownload = useCallback(() => {
    const next = readStats();
    next.downloads += 1;
    writeStats(next);
    setStats(next);
  }, []);

  const handleInstall = useCallback(async (platform: InstallPlatform) => {
    setStatus('');
    if (installed) {
      setStatus('TerraTone is already installed on this device.');
      return;
    }
    const onIos = isIos();
    const direct = platform === 'phone' && onIos ? iosInstallerUrl() : installerUrl(platform);
    if (direct) {
      if (platform === 'phone' && onIos && /^https:\/\/testflight\.apple\.com\//i.test(direct)) {
        window.open(direct, '_blank', 'noopener');
        recordDownload();
        setStatus('Opening TestFlight… Install TerraTone from the TestFlight app.');
        return;
      }
      const label = PLATFORMS.find((entry) => entry.id === platform)?.label ?? 'your device';
      if (!(await installerAvailable(direct))) {
        setStatus(`The ${label} installer isn't available right now (it may still be building). Please try again in a few minutes.`);
        return;
      }
      const link = document.createElement('a');
      link.href = direct;
      link.download = '';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      recordDownload();
      setStatus(`Downloading TerraTone for ${label}… Open the downloaded file to install.`);
      return;
    }
    if (platform === 'phone' && onIos) {
      setDialogPlatform(platform);
      return;
    }
    if (promptReady && (platform === currentPlatform || currentPlatform === 'other')) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setInstalled(true);
        recordDownload();
        setStatus('TerraTone is installing. Open it from your home screen or app menu.');
        return;
      }
      if (outcome === 'dismissed') {
        setStatus('Install cancelled. You can try again or proceed to the website.');
        return;
      }
    }
    setDialogPlatform(platform);
  }, [currentPlatform, installed, promptReady, recordDownload]);

  const deviceEntries = Object.entries(stats.devices)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div
      className={`landing${nativeShell ? ' landing--native' : ''}`}
      role="region"
      aria-label="Welcome to TerraTone"
      inert={active ? undefined : true}
      aria-hidden={active ? undefined : true}
    >
      <div className="landing__backdrop" aria-hidden="true">
        <div className="landing__stars" />
        <div className="landing__aurora" />
        <div className="landing__grid" />
        <div className="landing__planet" />
      </div>

      <header className="landing__nav">
        <span className="landing__brand">
          <img src="/icons/logo.png" alt="" aria-hidden="true" />
          <span>TerraTone<small>Hear the pulse of our planet</small></span>
        </span>
        <span className="landing__signal"><i aria-hidden="true" />Earth system online</span>
        <nav className="landing__pages" aria-label="Landing pages">
          {PAGES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`landing__pagebtn${page === entry.id ? ' is-active' : ''}`}
              aria-current={page === entry.id ? 'page' : undefined}
              onClick={() => goTo(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="landing__guide"
          onClick={() => { setPage('welcome'); setStatus(''); setTouring(true); }}
          aria-label="Guide: take a tour of the landing page"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8M12 17h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Guide
        </button>
      </header>

      <main className="landing__main">
        {page === 'welcome' && (
          <section className="landing__page" aria-labelledby="landing-title">
            <p className="landing__eyebrow"><span aria-hidden="true" />Listen to the planet<span aria-hidden="true" /></p>
            <h1 id="landing-title">Hear the pulse{' '}<br />of our planet<em>.</em></h1>
            <p className="landing__lede">
              Turn NASA Earth science data into sound. Explore climate, weather, and natural hazards through
              sight and hearing — in your browser or as an offline app.
            </p>
            <div className="landing__actions">
              <button ref={proceedRef} type="button" className="landing__proceed" onClick={onProceed}>
                {nativeShell ? 'Enter TerraTone' : 'Proceed to website'}
                <ArrowGlyph />
              </button>
              <p className="landing__meta">
                <span>Free</span>
                <span>No account</span>
                <span>Works offline</span>
              </p>
            </div>
            <div className="landing__quicklinks">
              <button type="button" onClick={() => goTo('download')}>Get the app <ArrowGlyph /></button>
              <button type="button" onClick={() => goTo('stats')}>See the numbers <ArrowGlyph /></button>
              <button type="button" onClick={() => goTo('about')}>Meet the team <ArrowGlyph /></button>
            </div>
          </section>
        )}

        {page === 'download' && (
          <section className="landing__page landing__page--narrow" aria-labelledby="install-title">
            <div className="landing__install">
              <div className="landing__installhead">
                <p className="landing__eyebrow"><span aria-hidden="true" />Install anywhere<span aria-hidden="true" /></p>
                <h2 id="install-title" ref={headingRef} tabIndex={-1}>Get the app</h2>
                <p>Install TerraTone for full-screen listening and offline exploration.</p>
              </div>
              <div className="landing__platforms">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    className={`landing__platform${currentPlatform === platform.id ? ' is-recommended' : ''}`}
                    onClick={() => void handleInstall(platform.id)}
                    aria-label={platform.action}
                  >
                    <span className="landing__platformicon"><PlatformIcon platform={platform.id} /></span>
                    <span className="landing__platformtext">
                      <span className="landing__platformname">
                        {platform.label}
                        {currentPlatform === platform.id && <em>Your device</em>}
                      </span>
                      <span className="landing__platformdetail">{platform.detail}</span>
                    </span>
                    <span className="landing__platformcta">
                      Download
                      <DownloadGlyph />
                    </span>
                  </button>
                ))}
              </div>
              <p className="landing__installnote">
                <span className="landing__version">Version {APP_VERSION}</span>
                Installs straight from your browser — no app store or account required.
              </p>
              <p className="landing__status" role="status" aria-live="polite">{status}</p>
            </div>
          </section>
        )}

        {page === 'stats' && (
          <section className="landing__page landing__page--wide" aria-labelledby="stats-title">
            <div className="landing__pagehead">
              <p className="landing__eyebrow"><span aria-hidden="true" />Live counters<span aria-hidden="true" /></p>
              <h2 id="stats-title" ref={headingRef} tabIndex={-1}>TerraTone in numbers</h2>
              <p>
                Download counts and visits are tallied on this device while the project has no server.
                The music dataset count comes from the real bundled library.
              </p>
            </div>
            <div className="landing__statgrid">
              <article className="landing__stat">
                <span className="landing__staticon"><DownloadGlyph /></span>
                <p className="landing__statnum">{stats.downloads.toLocaleString()}</p>
                <h3 className="landing__statlabel">Total downloads</h3>
                <p className="landing__statnote">Install starts recorded on this device.</p>
              </article>
              <article className="landing__stat">
                <span className="landing__staticon"><UsersGlyph /></span>
                <p className="landing__statnum">{stats.visits.toLocaleString()}</p>
                <h3 className="landing__statlabel">Total visits</h3>
                <p className="landing__statnote">Times the landing page has been opened here.</p>
                <div className="landing__devices">
                  {deviceEntries.length > 0
                    ? deviceEntries.map(([key, count]) => (
                        <span key={key} className="landing__device">
                          {deviceLabel(key)} · {count}
                        </span>
                      ))
                    : <span className="landing__device">No visits recorded yet</span>}
                </div>
              </article>
              <article className="landing__stat">
                <span className="landing__staticon"><WaveGlyph /></span>
                <p className="landing__statnum">{SAMPLE_DATASETS.length.toLocaleString()}</p>
                <h3 className="landing__statlabel">Music datasets</h3>
                <p className="landing__statnote">
                  Earth-science series you can sonify right now — plus anything you import or fetch online.
                </p>
              </article>
            </div>
            <div className="landing__devicebreakdown">
              <span className="landing__breakdowntitle"><ClockGlyph /> Visits by device</span>
              <div className="landing__bars">
                {deviceEntries.map(([key, count]) => {
                  const share = stats.visits > 0 ? Math.round((count / stats.visits) * 100) : 0;
                  return (
                    <span key={key} className="landing__bar">
                      <span className="landing__barlabel">{deviceLabel(key)}</span>
                      <span className="landing__bartrack" aria-hidden="true">
                        <span className="landing__barfill" style={{ width: `${share}%` }} />
                      </span>
                      <span className="landing__barvalue">{count} · {share}%</span>
                    </span>
                  );
                })}
                {deviceEntries.length === 0 && (
                  <p className="landing__breakdownnote">No visits recorded yet on this device.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {page === 'about' && (
          <section className="landing__page landing__page--wide" aria-labelledby="about-title">
            <div className="landing__pagehead">
              <p className="landing__eyebrow"><span aria-hidden="true" />Who and why<span aria-hidden="true" /></p>
              <h2 id="about-title" ref={headingRef} tabIndex={-1}>About TerraTone</h2>
              <p>
                TerraTone is an Earth-science sonification studio: it turns climate, weather, ocean, and
                hazard datasets into sound you can listen to, not just charts you squint at. Built as a
                local-first progressive web app, it runs offline, needs no account, and treats scientific
                honesty — real provenance, labelled demo data — as a feature, not a footnote.
              </p>
            </div>
            <div className="landing__team" aria-label="Team">
              {TEAM.map((member, index) => (
                <article className={`landing__member${index === 0 ? ' landing__member--lead' : ''}`} key={member.name}>
                  <img className="landing__avatar" src={member.photo} alt={`Avatar of ${member.name}`} loading="lazy" decoding="async" />
                  <div>
                    <h3>{member.name}</h3>
                    <p className="landing__memberrole">{member.role}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'privacy' && (
          <section className="landing__page" aria-labelledby="privacy-title">
            <div className="landing__pagehead">
              <p className="landing__eyebrow"><span aria-hidden="true" />Plain language<span aria-hidden="true" /></p>
              <h2 id="privacy-title" ref={headingRef} tabIndex={-1}>Privacy</h2>
              <p>The short version: TerraTone is local-first, has no accounts, and does not sell or share personal data.</p>
            </div>
            <div className="landing__prose">
              <section>
                <h3>No accounts, no tracking</h3>
                <p>
                  You can use every feature of TerraTone without signing in. There is no analytics SDK, no
                  advertising identifier, and no server-side profile of you. Nothing about your listening
                  leaves your device unless you explicitly export or share it.
                </p>
              </section>
              <section>
                <h3>What stays on your device</h3>
                <p>
                  Datasets you save, experiences you build, and preferences such as volume, theme, and
                  accessibility settings are stored locally in your browser (IndexedDB and localStorage).
                  The landing-page counters for visits and downloads also live in localStorage on this
                  device only — they are never sent anywhere.
                </p>
              </section>
              <section>
                <h3>Live NASA data</h3>
                <p>
                  When you open the Online tab, the app requests public NASA endpoints (POWER, GIBS, CMR,
                  EPIC, EONET, APOD) directly from your browser. Those requests follow NASA’s own public
                  API policies; TerraTone does not attach any personal identifier to them.
                </p>
              </section>
              <section>
                <h3>Optional AI features</h3>
                <p>
                  If you choose to add your own AI API key, requests go from your device to that provider
                  under its terms. Keys are stored locally and are never transmitted to us — there is no “us”
                  in the data path.
                </p>
              </section>
              <section>
                <h3>Removing your data</h3>
                <p>
                  Clearing your browser’s site data for TerraTone deletes everything it stored: datasets,
                  experiences, settings, and counters. Uninstalling the app works the same way — no account
                  deletion request required.
                </p>
              </section>
            </div>
          </section>
        )}
      </main>

      <footer className="landing__footer">
        <span>NASA data · Local-first · Accessible by design</span>
        <span>TerraTone / 2026</span>
      </footer>

      {touring && active && (
        <GuidedTour
          steps={TOURS.landing.steps}
          label="Landing page tour"
          reduceMotion={typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced'}
          onClose={() => setTouring(false)}
        />
      )}
      {dialogPlatform && <InstallDialog platform={dialogPlatform} onClose={() => setDialogPlatform(null)} />}
    </div>
  );
}
