import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import type { TabId } from './store/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { Logo } from './components/Bits';
import { CinematicIntro } from './components/CinematicIntro';
import { LaunchLanding } from './components/LaunchLanding';
import { ProfileMenu } from './components/ProfileMenu';
import { isNativeShell } from './lib/native';
import { onLandingRequest, requestLanding } from './lib/landingNav';
import { GuidedTour } from './components/GuidedTour';
import { TOURS, dismissTourOffer, tourIdFor, tourOfferPending } from './lib/tours';
import type { TourId } from './lib/tours';
import { Explore } from './pages/Explore';
import { Listen } from './pages/Listen';
import { Library } from './pages/Library';
import { Studio } from './pages/Studio';
import { Access } from './pages/Access';
import { Settings } from './pages/Settings';
import {
  hasSeenIntro,
  markIntroSeen,
  onIntroPreview,
  resolveIntroVariant,
} from './lib/intro';
import type { IntroFinishReason, IntroVariant } from './lib/intro';
import type { AppSettings } from './types';

// Lazy: keeps three.js out of the main bundle; cached offline by the SW after first visit.
const Tornado = lazy(() => import('./pages/Tornado').then((m) => ({ default: m.Tornado })));
const Sims = lazy(() => import('./pages/Sims').then((m) => ({ default: m.Sims })));
const Online = lazy(() => import('./pages/Online').then((m) => ({ default: m.Online })));
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })));

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'explore', label: 'Explore', icon: 'globe' },
  { id: 'listen', label: 'Listen', icon: 'headphones' },
  { id: 'online', label: 'Live', icon: 'broadcast' },
  { id: 'events', label: 'Events', icon: 'flame' },
  { id: 'sims', label: 'Sims', icon: 'gamepad' },
  { id: 'studio', label: 'Studio', icon: 'music' },
  { id: 'library', label: 'Library', icon: 'database' },
  { id: 'access', label: 'Access', icon: 'accessibility' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const NAV_GROUPS: { label: string; tabs: TabId[] }[] = [
  { label: 'Main', tabs: ['explore', 'listen', 'online', 'events', 'sims'] },
  { label: 'Your Music', tabs: ['studio', 'library'] },
  { label: 'System', tabs: ['access', 'settings'] },
];

/** Decorative, pointer-transparent backdrop: slow aurora orbs, drifting stars,
 *  a faint grid and light rays. Motion is disabled by the reduced-motion rules
 *  in styles.css, and the whole layer is hidden in high-contrast mode. */
function BackgroundFX() {
  return (
    <div className="bgfx" aria-hidden="true">
      <div className="bgfx__stars bgfx__stars--far" />
      <div className="bgfx__stars bgfx__stars--near" />
      <div className="bgfx__rays" />
      <div className="bgfx__orb bgfx__orb--a" />
      <div className="bgfx__orb bgfx__orb--b" />
      <div className="bgfx__orb bgfx__orb--c" />
      <div className="bgfx__orb bgfx__orb--d" />
      <div className="bgfx__grid" />
      <div className="bgfx__vignette" />
    </div>
  );
}

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function launchVariantFor(settings: AppSettings): IntroVariant | null {
  return resolveIntroVariant(
    { enabled: settings.introEnabled, frequency: settings.introFrequency },
    hasSeenIntro(),
    settings.reduceMotion || systemPrefersReducedMotion(),
  );
}

function LaunchGate() {
  const { settings } = useApp();
  const nativeShell = isNativeShell();
  const [launch, setLaunch] = useState<IntroVariant | null>(() => launchVariantFor(settings));
  const [landing, setLanding] = useState(true);
  const previousFocus = useRef<HTMLElement | null>(null);
  /** A preview requested from Settings is not a launch: it must not consume
   *  the first-launch intro the user may still be waiting for. */
  const isPreview = useRef(false);
  /** Bumped when the user goes back to the landing page, so the app below
   *  remounts: simulators and players stop their sound instead of playing on. */
  const [appKey, setAppKey] = useState(0);
  const [tourOffer, setTourOffer] = useState(false);

  useEffect(() => onLandingRequest(() => {
    setAppKey((k) => k + 1);
    setLanding(true);
  }), []);

  const finishIntro = useCallback((_reason: IntroFinishReason) => {
    const preview = isPreview.current;
    if (!preview) markIntroSeen();
    isPreview.current = false;
    setLaunch(null);
    setLanding(!preview);
    if (preview) {
      window.setTimeout(() => {
        const target = previousFocus.current && document.contains(previousFocus.current)
          ? previousFocus.current
          : document.querySelector<HTMLElement>('#main');
        target?.focus();
      }, 30);
    }
  }, []);

  const enterWebsite = useCallback(() => {
    setLanding(false);
    if (tourOfferPending()) setTourOffer(true);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>('#main')?.focus();
    }, 30);
  }, []);

  useEffect(() => onIntroPreview(() => {
    const active = document.activeElement;
    previousFocus.current = active instanceof HTMLElement ? active : null;
    isPreview.current = true;
    setLanding(false);
    setLaunch(settings.reduceMotion || systemPrefersReducedMotion() ? 'reduced' : 'full');
  }), [settings.reduceMotion]);

  useEffect(() => {
    if (!launch && !landing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [launch, landing]);

  const introVolume = settings.volume > 0 ? settings.volume : 0.7;
  const blocked = Boolean(launch) || landing;

  return (
    <>
      <div
        className="app-under-intro"
        inert={blocked ? true : undefined}
        aria-hidden={blocked ? true : undefined}
      >
        <Chrome key={appKey} tourOffer={tourOffer && !blocked} onTourOfferDone={() => { dismissTourOffer(); setTourOffer(false); }} />
      </div>
      {launch && (
        <CinematicIntro
          variant={launch}
          reduceMotion={launch === 'reduced'}
          audioAllowed
          volume={introVolume}
          onFinish={finishIntro}
        />
      )}
      {landing && <LaunchLanding onProceed={enterWebsite} nativeShell={nativeShell} active={!launch} />}
    </>
  );
}

function TourOffer({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="tour-offer" role="region" aria-label="Guided tour offer">
      <span className="tour-offer__icon" aria-hidden="true"><Icon name="help" /></span>
      <p><b>New to TerraTone?</b> Take a one-minute tour of this page. You can replay it any time with the Guide button.</p>
      <div className="tour-offer__actions">
        <button type="button" className="btn sm primary" onClick={onStart}>Start tour</button>
        <button type="button" className="btn sm ghost" onClick={onDismiss}>No thanks</button>
      </div>
    </div>
  );
}

function Chrome({ tourOffer = false, onTourOfferDone }: { tourOffer?: boolean; onTourOfferDone?: () => void }) {
  const { tab, setTab, connection, profileOpen, setProfileOpen, settings } = useApp();
  const [tour, setTour] = useState<TourId | null>(null);
  const startTour = useCallback(() => {
    setProfileOpen(false);
    setTour(tourIdFor(tab));
  }, [setProfileOpen, tab]);
  // A tour belongs to one page: switching pages ends it.
  useEffect(() => { setTour(null); }, [tab]);
  const label = connection === 'online' ? 'Online' : connection === 'cached' ? 'Using cached data' : 'Offline';
  useEffect(() => {
    const name = tab === 'storm' ? 'Storm'
      : tab === 'studio' ? 'Studio'
      : TABS.find((t) => t.id === tab)?.label ?? 'Explore';
    document.title = `TerraTone — ${name} | Hear the Pulse of Our Planet`;
  }, [tab]);
  return (
    <div className="shell">
      <nav className="side" aria-label="Primary">
        <Logo />
        {NAV_GROUPS.map((g) => (
          <div className="navgrp" key={g.label}>
            <div className="navlabel">{g.label}</div>
            {g.tabs.map((id) => {
              const t = TABS.find((x) => x.id === id)!;
              return (
                <button key={t.id} className="navbtn" aria-current={tab === t.id || (t.id === 'sims' && tab === 'storm') ? 'page' : undefined} onClick={() => setTab(t.id)}>
                  <span className="ico" aria-hidden="true"><Icon name={t.icon} /></span>{t.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="topbar">
          <Logo />
          <span className="conn" data-s={connection} role="status" aria-label={`Connection: ${label}`}>
            <span className="dot" aria-hidden="true" />
            {label}
          </span>
          <div className="topbar__tools">
            <button
              type="button"
              className="profilebtn"
              aria-haspopup="dialog"
              aria-label="Guide: take a tour of this page"
              title="Guided tour of this page"
              onClick={startTour}
            >
              <Icon name="help" />
              <span className="profilebtn__text">Guide</span>
            </button>
            <button
              type="button"
              className="profilebtn"
              aria-label="Home: back to the landing page"
              title="Back to the landing page"
              onClick={requestLanding}
            >
              <Icon name="home" />
              <span className="profilebtn__text">Home</span>
            </button>
            <button
              type="button"
              className="profilebtn"
              aria-haspopup="dialog"
              aria-expanded={profileOpen}
              aria-label="Profile"
              onClick={() => setProfileOpen(true)}
            >
              <Icon name="helmet" />
              <span className="profilebtn__text">Profile</span>
            </button>
          </div>
        </header>
        <main className="main" id="main" tabIndex={-1}>
          {tab === 'explore' && <Explore />}
          {tab === 'listen' && <Listen />}
          {tab === 'storm' && (
            <Suspense fallback={<div className="empty" role="status">Loading storm simulator…</div>}>
              <Tornado />
            </Suspense>
          )}
          {tab === 'sims' && (
            <Suspense fallback={<div className="empty" role="status">Loading simulator library…</div>}>
              <Sims />
            </Suspense>
          )}
          {tab === 'online' && (
            <Suspense fallback={<div className="empty" role="status">Loading live feeds…</div>}>
              <Online />
            </Suspense>
          )}
          {tab === 'events' && (
            <Suspense fallback={<div className="empty" role="status">Loading natural events…</div>}>
              <Events />
            </Suspense>
          )}
          {tab === 'library' && <Library />}
          {tab === 'studio' && <Studio />}
          {tab === 'access' && <Access />}
          {tab === 'settings' && <Settings />}
        </main>
        <nav className="topnav" aria-label="Primary">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id || (t.id === 'sims' && tab === 'storm') ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <span className="ico" aria-hidden="true"><Icon name={t.icon} /></span>{t.label}
            </button>
          ))}
        </nav>
        <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} />
        {tourOffer && !tour && (
          <TourOffer
            onStart={() => { onTourOfferDone?.(); startTour(); }}
            onDismiss={() => onTourOfferDone?.()}
          />
        )}
        {tour && (
          <GuidedTour
            key={tour}
            steps={TOURS[tour].steps}
            label={`${TOURS[tour].label} tour`}
            reduceMotion={settings.reduceMotion}
            onClose={() => setTour(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BackgroundFX />
        <LaunchGate />
      </AppProvider>
    </ErrorBoundary>
  );
}
