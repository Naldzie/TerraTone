import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { IntroAudio } from '../audio/introAudio';
import type { IntroAudioStatus } from '../audio/introAudio';
import { INTRO_TIMELINES } from '../lib/intro';
import type { IntroFinishReason, IntroVariant } from '../lib/intro';

const IntroEarth = lazy(() => import('./IntroEarth').then((m) => ({ default: m.IntroEarth })));

type AudioState = 'off' | 'starting' | 'playing' | 'blocked' | 'muted' | 'unsupported';

interface CinematicIntroProps {
  variant: IntroVariant;
  volume: number;
  audioAllowed: boolean;
  reduceMotion: boolean;
  onFinish: (reason: IntroFinishReason) => void;
}

interface ThreeBoundaryProps {
  children: ReactNode;
  onError: () => void;
}

class ThreeBoundary extends Component<ThreeBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/**
 * Narrow viewport probe. Guarded because `matchMedia` is missing in some
 * embedded webviews and test environments — the intro must never be the
 * reason the whole app fails to boot.
 */
function prefersNarrowViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(max-width: 720px)').matches;
  } catch {
    return false;
  }
}

function seededStarfield(count: number): { x: number; y: number; r: number; o: number; d: number }[] {
  let seed = 20260211;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: random() * 1000,
    y: random() * 1000,
    r: 0.4 + random() * 1.7,
    o: 0.15 + random() * 0.7,
    d: random() * 8,
  }));
}

function IntroStars({ count }: { count: number }) {
  const stars = useMemo(() => seededStarfield(count), [count]);
  return (
    <svg className="intro__stars" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {stars.map((star, i) => (
        <circle
          key={i}
          cx={star.x}
          cy={star.y}
          r={star.r}
          opacity={star.o}
          className={i % 7 === 0 ? 'intro__twinkle' : undefined}
          style={{ animationDelay: `${star.d}s` }}
        />
      ))}
    </svg>
  );
}

function IntroWaveform({ bars, reduceMotion }: { bars: number; reduceMotion: boolean }) {
  const lines = useMemo(() => Array.from({ length: bars }, (_, i) => {
    const angle = (i / bars) * 360;
    const variance = Math.abs(Math.sin(i * 1.83)) * 14 + (i % 9 === 0 ? 8 : 0);
    return { angle, length: 5 + variance, delay: (i % 13) * 0.11 };
  }), [bars]);

  return (
    <svg className="intro__wave" viewBox="0 0 500 500" aria-hidden="true">
      <defs>
        <linearGradient id="tt-wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5ff5d2" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#6ea8fe" />
        </linearGradient>
      </defs>
      <circle cx="250" cy="250" r="233" className="intro__ripple intro__ripple--1" />
      <circle cx="250" cy="250" r="233" className="intro__ripple intro__ripple--2" />
      <circle cx="250" cy="250" r="198" className="intro__orbit intro__orbit--1" />
      <circle cx="250" cy="250" r="216" className="intro__orbit intro__orbit--2" />
      <g className="intro__wavebars">
        {lines.map((line, i) => (
          <line
            key={i}
            x1="250"
            y1="47"
            x2="250"
            y2={47 - line.length}
            transform={`rotate(${line.angle} 250 250)`}
            style={reduceMotion ? undefined : { animationDelay: `${line.delay}s` }}
            className="intro__wavebar"
          />
        ))}
      </g>
    </svg>
  );
}

function SoundGlyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="intro__soundglyph">
      <path d="M4 9.5v5h3.3L12 18V6L7.3 9.5H4Z" fill="currentColor" />
      {on ? (
        <>
          <path d="M15 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function CinematicIntro({
  variant,
  volume,
  audioAllowed,
  reduceMotion,
  onFinish,
}: CinematicIntroProps) {
  const timeline = INTRO_TIMELINES[variant];
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<IntroAudio | null>(null);
  const mutedRef = useRef(!audioAllowed);
  const finishedRef = useRef(false);
  const finishTimer = useRef<number | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const [stage, setStage] = useState(variant === 'reduced' ? 3 : 0);
  const [impact, setImpact] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitMs, setExitMs] = useState(timeline.exitDuration);
  const [earthReady, setEarthReady] = useState(false);
  const [audioState, setAudioState] = useState<AudioState>(() => (
    !audioAllowed ? 'off' : 'starting'
  ));
  const [muted, setMuted] = useState(mutedRef.current);
  const [smallScreen] = useState(prefersNarrowViewport);

  const setSoundMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
  }, []);

  // Stable identities keep the lazy WebGL scene alive across intro stage changes.
  const handleEarthReady = useCallback(() => setEarthReady(true), []);
  const handleEarthError = useCallback(() => setEarthReady(false), []);
  const handleBoundaryError = useCallback(() => undefined, []);

  const beginExit = useCallback((reason: IntroFinishReason) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    audioRef.current?.stop(reason === 'skip' ? 0.22 : 0.6);
    const ms = reduceMotion ? 120 : reason === 'skip' ? (variant === 'full' ? 620 : 460) : timeline.exitDuration;
    setExitMs(ms);
    setExiting(true);
    finishTimer.current = window.setTimeout(() => {
      onFinishRef.current(reason);
    }, ms + 70);
  }, [reduceMotion, timeline.exitDuration, variant]);

  useEffect(() => {
    const root = rootRef.current;
    root?.focus();
    const timers: number[] = [];
    if (variant !== 'reduced') {
      timers.push(window.setTimeout(() => setStage(1), timeline.logoAt));
      timers.push(window.setTimeout(() => setStage(2), timeline.taglineAt));
      timers.push(window.setTimeout(() => setStage(3), timeline.subtitleAt));
    }
    timers.push(window.setTimeout(() => {
      setImpact(true);
      audioRef.current?.impact();
    }, timeline.impactAt));
    timers.push(window.setTimeout(() => beginExit('complete'), timeline.exitAt));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      if (finishTimer.current !== null) window.clearTimeout(finishTimer.current);
    };
  }, [variant, timeline, beginExit]);

  useEffect(() => {
    if (!audioAllowed || mutedRef.current) {
      setAudioState('off');
      return;
    }
    let cancelled = false;
    const audio = new IntroAudio();
    audioRef.current = audio;
    void audio.start(volume).then((status: IntroAudioStatus) => {
      if (cancelled) return;
      if (status === 'running') {
        if (mutedRef.current) {
          audio.mute(true);
          setAudioState('muted');
        } else {
          setAudioState('playing');
        }
      } else {
        setAudioState(status === 'unsupported' ? 'unsupported' : 'blocked');
      }
    });
    return () => {
      cancelled = true;
      audio.stop(0.18);
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioAllowed, volume]);

  useEffect(() => {
    if (audioState !== 'starting') return;
    const timer = window.setTimeout(() => setAudioState('blocked'), 1200);
    return () => window.clearTimeout(timer);
  }, [audioState]);

  useEffect(() => {
    if (audioState !== 'blocked') return;
    const unlock = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.intro__sound')) return;
      const audio = audioRef.current;
      if (!audio) return;
      setAudioState('starting');
      void audio.start(volume).then((status) => {
        setAudioState(status === 'running' ? 'playing' : status === 'unsupported' ? 'unsupported' : 'blocked');
      });
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audioState, volume]);

  useEffect(() => () => {
    audioRef.current?.stop(0);
    audioRef.current = null;
    if (finishTimer.current !== null) window.clearTimeout(finishTimer.current);
  }, []);

  const toggleSound = async () => {
    if (!audioAllowed || audioState === 'unsupported') return;
    if (audioState === 'playing' || audioState === 'starting') {
      setSoundMuted(true);
      if (audioState === 'playing') {
        audioRef.current?.mute(true);
        setAudioState('muted');
      }
      return;
    }
    setSoundMuted(false);
    let audio = audioRef.current;
    if (!audio) {
      audio = new IntroAudio();
      audioRef.current = audio;
    }
    setAudioState('starting');
    const status = await audio.start(volume);
    if (status === 'running') {
      audio.pulse();
      if (mutedRef.current) {
        audio.mute(true);
        setAudioState('muted');
      } else {
        setAudioState('playing');
      }
    } else {
      setAudioState(status === 'unsupported' ? 'unsupported' : 'blocked');
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      beginExit('skip');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = rootRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
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

  const soundOn = audioState === 'playing';
  let soundLabel = 'Sound on';
  let soundTitle = 'Enable cinematic intro sound';
  if (!audioAllowed) {
    soundLabel = 'Sound off';
    soundTitle = 'Intro sound is disabled by Quiet mode or zero volume in Settings.';
  } else if (audioState === 'unsupported') {
    soundLabel = 'Audio unavailable';
    soundTitle = 'This browser cannot play the intro sound. The intro still works silently.';
  } else if (audioState === 'blocked') {
    soundLabel = 'Enable sound';
    soundTitle = 'Your browser needs a click before it can play intro audio.';
  } else if (audioState === 'playing') {
    soundLabel = 'Mute sound';
    soundTitle = 'Mute the cinematic intro';
  } else if (audioState === 'starting') {
    soundLabel = 'Starting audio';
    soundTitle = 'Waiting for the browser to allow audio';
  } else if (audioState === 'muted') {
    soundLabel = 'Unmute sound';
    soundTitle = 'Unmute the cinematic intro';
  }

  const stageClass = stage >= 1 ? ' is-logo' : '';
  const taglineClass = stage >= 2 ? ' is-tagline' : '';
  const subtitleClass = stage >= 3 ? ' is-subtitle' : '';
  const rootStyle = { '--intro-exit-ms': `${exitMs}ms` } as CSSProperties;
  const bars = reduceMotion ? 0 : smallScreen ? 36 : 64;

  return (
    <div
      ref={rootRef}
      className={`intro intro--${variant}${exiting ? ' is-exiting' : ''}${impact ? ' is-impact' : ''}${muted || !audioAllowed ? ' is-muted' : ''}`}
      style={rootStyle}
      role="dialog"
      aria-modal="true"
      aria-label="TerraTone cinematic introduction"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="intro__backdrop" aria-hidden="true">
        <IntroStars count={smallScreen ? 60 : reduceMotion ? 40 : 150} />
        <div className="intro__aurora" />
        <div className="intro__rays" />
      </div>

      <div className="intro__stage" aria-hidden="true">
        <div className="intro__glow" />
        <div className={`intro__planet${earthReady ? ' is-live' : ''}`}>
          <div className="intro__planet-fallback">
            <div className="intro__planet-map" />
            <div className="intro__planet-clouds" />
            <div className="intro__planet-shade" />
          </div>
          {!reduceMotion && (
            <Suspense fallback={null}>
              <ThreeBoundary onError={handleBoundaryError}>
                <IntroEarth
                  quality={smallScreen ? 'low' : 'high'}
                  reduceMotion={reduceMotion}
                  onReady={handleEarthReady}
                  onError={handleEarthError}
                />
              </ThreeBoundary>
            </Suspense>
          )}
          <div className="intro__planet-rim" />
        </div>
        {bars > 0 && <IntroWaveform bars={bars} reduceMotion={reduceMotion} />}
      </div>

      <div className={`intro__content${stageClass}${taglineClass}${subtitleClass}`}>
        <div className="intro__eyebrow"><span />Earth · Sound · Data<span /></div>
        <div className="intro__brand">
          <span className="intro__mark"><img src="/icons/logo.png" alt="" /></span>
          <h1>Terra<span>Tone</span></h1>
        </div>
        <p className="intro__tagline">LISTEN TO THE PLANET.</p>
        <p className="intro__subtitle">Explore Earth. Experience Nature. Discover the Sounds of Our World.</p>
      </div>

      <div className="intro__hud intro__hud--tl" aria-hidden="true">
        <span className="intro__hud-dot" />TERRATONE <i>/</i> EARTH SYSTEM
      </div>
      <div className="intro__hud intro__hud--tr" aria-hidden="true">
        ORBITAL FEED <i>01</i>
      </div>
      <div className="intro__hud intro__hud--bl" aria-hidden="true">
        ATMOSPHERE <i>·</i> HYDROSPHERE <i>·</i> BIOSPHERE
      </div>
      <div className="intro__vignette" aria-hidden="true" />

      <div className="intro__controls">
        <button
          type="button"
          className="intro__control intro__sound"
          onClick={() => void toggleSound()}
          disabled={!audioAllowed || audioState === 'unsupported'}
          aria-pressed={soundOn}
          aria-label={soundTitle}
          title={soundTitle}
        >
          <SoundGlyph on={soundOn} />
          <span>{soundLabel}</span>
        </button>
        <button
          type="button"
          className="intro__control intro__skip"
          onClick={() => beginExit('skip')}
        >
          <span>Skip Intro</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}
