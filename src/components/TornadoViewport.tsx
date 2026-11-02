import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { TornadoSim } from '../sim/TornadoScene';
import type { SimQuality, SimSnapshot } from '../sim/TornadoScene';
import { compassPoint, WORLD } from '../sim/stormTypes';
import type { StormParams } from '../sim/stormTypes';
import type { AvatarOptions } from '../sim/avatar';
import { Minimap } from './Minimap';
import type { MinimapEvent } from './Minimap';
import { SimSettingsOverlay } from './SimSettingsOverlay';
import { SimAudioMonitor } from './AudioViz';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { useFullscreenLandscape } from '../lib/fullscreen';
import { captureMouse, useMouseLook } from '../lib/mouseLook';
import { SimHelp, SimPrompt, Key } from './SimChrome';
import { JumpPad } from './JumpPad';
import { multiTouchTap } from '../lib/multiTouch';

interface Props {
  storm: StormParams;
  quality: SimQuality;
  reduceEffects: boolean;
  paused: boolean;
  onSnapshot: (s: SimSnapshot) => void;
  onPauseRequest: () => void;
  resetSignal: number;
  intensityLabel: string;
  /** Show a Play overlay (first visit): one tap starts visuals + sound together. */
  startOverlay?: boolean;
  onStart?: () => void;
  /** Bystander NPCs on/off. */
  npcs?: boolean;
  /** Explorer appearance profile. */
  avatar?: AvatarOptions;
  /** Open a chat with the nearest bystander. */
  onTalk?: () => void;
  /** Name of the bystander being chatted with — they stop and face you. */
  talkingNpc?: string | null;
  /** In-scene dialogue overlay (speech bubble) rendered on top of the 3D view at the NPC's head. */
  chat?: ReactNode;
  /** Dialogue choices rendered below the NPC's feet. */
  chatChoices?: ReactNode;
  /** Simulation settings shown in the in-scene, scrollable settings drawer. */
  settings?: ReactNode;
  /** Live analyser for the on-screen waveform + spectrum monitor. */
  getAnalyser?: () => AnalyserNode | null;
}

/**
 * Interactive 3D viewport: keyboard (WASD/arrows + Shift + Space + Esc),
 * touch joystick + drag camera + walk/run toggle + optional gyro.
 * All movement is clamped to the world and collides with buildings;
 * controls use touch-action:none so they never scroll the page.
 */
export function TornadoViewport({ storm, quality, reduceEffects, paused, onSnapshot, onPauseRequest, resetSignal, intensityLabel, startOverlay, onStart, npcs = true, avatar, onTalk, talkingNpc = null, chat, chatChoices, settings, getAnalyser }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<TornadoSim | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const joy = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const [runMode, setRunMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [snap, setSnap] = useState<SimSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroAvail, setGyroAvail] = useState(false);
  const joyBase = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const camId = useRef<number | null>(null);
  const camLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { ref: wrapRef, active: fullscreen, toggle: toggleFullscreen, enter: enterFullscreen } = useFullscreenLandscape<HTMLDivElement>();
  // Pressing Play (the overlay or the page's Play button) goes straight to
  // fullscreen — landscape on phones and in the app.
  const wasOverlay = useRef(startOverlay);
  useEffect(() => {
    if (wasOverlay.current && !startOverlay) void enterFullscreen();
    wasOverlay.current = startOverlay;
  }, [startOverlay, enterFullscreen]);
  // Mouse: captured on Play / a click into the scene, then every movement looks
  // (cursor hidden; Esc frees it). Uncaptured, hovering still looks. Touch: drag.
  const mouseLocked = useMouseLook(canvasRef, (dx, dy) => simRef.current?.addCameraOrbit(dx, dy), !paused && !settingsOpen && !startOverlay && !helpOpen);
  const fsRef = useRef(toggleFullscreen);
  fsRef.current = toggleFullscreen;

  const snapRef = useRef(onSnapshot);
  snapRef.current = onSnapshot;
  const pauseRef = useRef(onPauseRequest);
  pauseRef.current = onPauseRequest;
  const talkRef = useRef(onTalk);
  talkRef.current = onTalk;
  // Create / dispose the sim.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sim = new TornadoSim(canvas, {
      quality,
      reduceMotion: reduceEffects,
      onTick: (s) => { setSnap(s); snapRef.current(s); },
    });
    sim.reset(storm.distance);
    simRef.current = sim;
    const onResize = () => sim.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sim.dispose();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push storm + pause + quality changes into the sim.
  useEffect(() => { simRef.current?.setStorm(storm.intensity, storm.windKmh); }, [storm.intensity, storm.windKmh]);
  useEffect(() => { simRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => { simRef.current?.setQuality(quality); }, [quality]);
  useEffect(() => { simRef.current?.setNpcs(npcs); }, [npcs]);
  useEffect(() => { simRef.current?.setNpcTalking(talkingNpc); }, [talkingNpc]);
  useEffect(() => {
    const id = window.setTimeout(() => simRef.current?.resize(), 120);
    return () => window.clearTimeout(id);
  }, [fullscreen]);

  // Float the chat bubble at the NPC's head (the choices dock to the bottom of the view).
  useEffect(() => {
    if (!talkingNpc) return;
    let raf = 0;
    const place = () => {
      const a = simRef.current?.npcAnchor(talkingNpc);
      const bubble = bubbleRef.current;
      const cw = canvasRef.current?.clientWidth ?? 0;
      if (!bubble) { raf = requestAnimationFrame(place); return; }
      if (!a) {
        bubble.style.opacity = '0';
      } else {
        const w = bubble.offsetWidth; const h = bubble.offsetHeight;
        const x = Math.min(Math.max(a.head.x, w / 2 + 6), Math.max(w / 2 + 6, cw - w / 2 - 6));
        const y = Math.max(a.head.y - 10, h + 6);
        bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        bubble.style.opacity = '1';
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talkingNpc]);
  useEffect(() => { if (avatar) simRef.current?.setAvatar(avatar); }, [avatar]);

  // Reset when the parent bumps resetSignal.
  const stormDist = useRef(storm.distance);
  stormDist.current = storm.distance;
  useEffect(() => {
    if (resetSignal > 0) simRef.current?.reset(stormDist.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const runModeRef = useRef(runMode);
  runModeRef.current = runMode;

  const pushCombinedInput = () => {
    const k = keys.current;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    simRef.current?.setInput({ x: s + joy.current.x, z: f + joy.current.z, run: runModeRef.current || k.has('shift') });
    setRunning(f !== 0 || s !== 0 || joy.current.x !== 0 || joy.current.z !== 0);
  };

  // Keyboard controls.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { pauseRef.current(); return; }
      if (e.key === '?' || e.key.toLowerCase() === 'h') { setHelpOpen((v) => !v); return; }
      if (e.key.toLowerCase() === 'f' && !e.repeat) { void fsRef.current(); return; }
      if (e.key.toLowerCase() === 'q' && !e.repeat) { setSettingsOpen((v) => !v); return; }
      if (e.key.toLowerCase() === 'e') { simRef.current?.tryToggleMount(); return; }
      if (e.key.toLowerCase() === 't') { talkRef.current?.(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.key === ' ') {
        e.preventDefault();
        simRef.current?.setClimb(true);
        if (!e.repeat) simRef.current?.queueJump();
        return;
      }
      keys.current.add(e.key.toLowerCase());
      pushCombinedInput();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') simRef.current?.setClimb(false);
      keys.current.delete(e.key.toLowerCase()); pushCombinedInput();
    };
    const blur = () => { keys.current.clear(); simRef.current?.setClimb(false); pushCombinedInput(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { pushCombinedInput(); }, [runMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gyroscope camera (optional, permission-gated).
  useEffect(() => {
    setGyroAvail(typeof DeviceOrientationEvent !== 'undefined');
  }, []);
  const toggleGyro = async () => {
    if (gyroOn) { setGyroOn(false); return; }
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (DOE.requestPermission) {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return;
      }
      setGyroOn(true);
    } catch { /* unsupported */ }
  };
  useEffect(() => {
    if (!gyroOn) return;
    let lastBeta: number | null = null;
    let lastGamma: number | null = null;
    const h = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (lastBeta != null && lastGamma != null) {
        simRef.current?.addCameraOrbit((e.gamma - lastGamma) * -4, (e.beta - lastBeta) * -2);
      }
      lastBeta = e.beta; lastGamma = e.gamma;
    };
    window.addEventListener('deviceorientation', h);
    return () => window.removeEventListener('deviceorientation', h);
  }, [gyroOn]);

  // Joystick pointer handling.
  const onJoyDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    joyId.current = e.pointerId;
    moveJoy(e.clientX, e.clientY);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    moveJoy(e.clientX, e.clientY);
  };
  const onJoyUp = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    joy.current = { x: 0, z: 0 };
    setKnob({ x: 0, y: 0 });
    pushCombinedInput();
  };
  const moveJoy = (cx: number, cy: number) => {
    const el = joyBase.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const max = r.width / 2;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob({ x: dx, y: dy });
    joy.current = { x: dx / max, z: -dy / max };
    pushCombinedInput();
  };

  // Camera drag on the canvas.
  const onCamDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return; // mouse looks by hovering — no click needed
    if (joyId.current === e.pointerId) return;
    camId.current = e.pointerId;
    camLast.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onCamMove = (e: React.PointerEvent) => {
    if (camId.current !== e.pointerId) return;
    simRef.current?.addCameraOrbit(e.clientX - camLast.current.x, e.clientY - camLast.current.y);
    camLast.current = { x: e.clientX, y: e.clientY };
  };
  const onCamUp = (e: React.PointerEvent) => {
    if (camId.current === e.pointerId) camId.current = null;
  };

  const dist = snap?.distance ?? storm.distance;
  const bearing = snap?.bearing ?? 180;
  const yaw = snap?.yaw ?? 0;
  const compass = compassPoint(((bearing % 360) + 360) % 360);
  const caught = snap?.caught ?? false;
  const caughtRide = snap?.caughtRide ?? null;
  const riding = snap?.riding ?? null;
  const nearV = snap?.nearVehicle ?? null;
  const nearNpc = snap?.nearNpc ?? null;
  const rideIcon: IconName = riding === 'heli' ? 'helicopter'
    : riding === 'car' ? 'car'
    : nearV === 'heli' ? 'helicopter'
    : 'car';
  const rideText = riding === 'heli' ? 'Exit copter'
    : riding === 'car' ? 'Exit car'
    : nearV === 'heli' ? 'Ride copter'
    : nearV === 'car' ? 'Ride car' : 'Ride';

  return (
    <>
    <div className="simwrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="simview"
        aria-label="Interactive 3D tornado simulation. Use WASD or the joystick to move the explorer."
        onPointerDown={onCamDown}
        onPointerMove={onCamMove}
        onPointerUp={onCamUp}
        onPointerCancel={onCamUp}
      />
      {snap && (
        <Minimap
          x={snap.x} z={snap.z} yaw={yaw} halfSize={WORLD.halfSize} size={128}
          npcs={simRef.current?.getNpcs() ?? []}
          events={snap.hazardX != null ? [{
            x: snap.hazardX, z: snap.hazardZ,
            kind: snap.hazardKind as MinimapEvent['kind'],
            label: snap.hazardLabel, radius: 60,
          }] : []}
          temperature={snap.temperature}
          condition={`${intensityLabel} · wind ~${storm.windKmh} km/h`}
        />
      )}
      {getAnalyser && <SimAudioMonitor getAnalyser={getAnalyser} />}
      {startOverlay && (
        <button className="simstart" onClick={() => { captureMouse(canvasRef.current); onStart?.(); }} aria-label="Play simulation with sound">
          <span className="simstart-icon" aria-hidden="true"><Icon name="play" /></span>
          <span className="simstart-text">Play with sound</span>
        </button>
      )}
      {/* HUD */}
      <div className="simhud" aria-live="polite">
        <span className="simhud-chip simhud-chip--accent" title="Tornado direction"><Icon name="compass" /> {compass}</span>
        <span className="simhud-chip" title="Approximate distance to tornado"><Icon name="ruler" /> ~{Math.round(dist)} m</span>
        <span className="simhud-chip" title="Storm intensity"><Icon name="cyclone" /> {intensityLabel}</span>
        {caught
          ? <span className="simhud-chip simhud-chip--alert" title="The funnel has picked you up — push outward to break free"><Icon name="cyclone" /> caught! push out!</span>
          : caughtRide
            ? <span className="simhud-chip simhud-chip--alert" title="The funnel grabbed an NPC-driven vehicle"><Icon name="cyclone" /> funnel grabbed the {caughtRide === 'heli' ? 'copter' : 'car'}!</span>
            : riding
              ? <span className="simhud-chip simhud-chip--live" title="You are driving"><Icon name={riding === 'heli' ? 'helicopter' : 'car'} /> riding {riding === 'heli' ? 'copter' : 'car'}</span>
              : running && <span className="simhud-chip simhud-chip--live" title="Movement state"><Icon name={runMode ? 'run' : 'walk'} /> {runMode ? 'running' : 'moving'}</span>}
        {mouseLocked && <span className="simhud-chip"><Key k="Esc" /> frees the mouse</span>}
      </div>
      {talkingNpc && chat && <div ref={bubbleRef} className="npcbubble">{chat}</div>}
      {talkingNpc && chatChoices && <div className="npcchoices">{chatChoices}</div>}
      {/* Controls */}
      <div className="simcontrols">
        <div
          ref={joyBase}
          className="joystick"
          role="application"
          aria-label="Movement joystick"
          onPointerDown={onJoyDown}
          onPointerMove={onJoyMove}
          onPointerUp={onJoyUp}
          onPointerCancel={onJoyUp}
        >
          <div className="joyknob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
        <div className="simright" {...multiTouchTap}>
          {!startOverlay && !talkingNpc && (
            <SimPrompt
              riding={false}
              nearVehicle={false}
              npcName={nearNpc?.name ?? null}
              extra={riding ? `Exit the ${riding === 'heli' ? 'copter' : 'car'}` : nearV ? `Ride the ${nearV === 'heli' ? 'copter' : 'car'}` : null}
            />
          )}
          <JumpPad
            label={riding === 'heli' ? 'Rise' : 'Jump'}
            onPress={() => { simRef.current?.setClimb(true); simRef.current?.queueJump(); }}
            onRelease={() => simRef.current?.setClimb(false)}
          />
          <div className="simbtns">
            <button
              className="btn sm ghost"
              onClick={() => void toggleFullscreen()}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? 'Exit fullscreen landscape' : 'Fullscreen landscape'}
              title="Best on phones — fullscreen landscape simulation"
            ><Icon name="maximize" /> {fullscreen ? 'Exit' : 'Fullscreen'}<Key k="F" /></button>
            {settings && (
              <button
                className="btn sm simsettings-btn"
                onClick={() => setSettingsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
                aria-label="Simulation settings"
              ><Icon name="settings" /> Settings<Key k="Q" /></button>
            )}
            <button
              className="btn sm"
              aria-pressed={runMode}
              onClick={() => setRunMode((v) => !v)}
            >{runMode ? <><Icon name="run" /> Run</> : <><Icon name="walk" /> Walk</>}<Key k="Shift" /></button>
            <button className="btn sm simjump-btn" onClick={() => simRef.current?.queueJump()} aria-label="Jump"
              onPointerDown={() => simRef.current?.setClimb(true)}
              onPointerUp={() => simRef.current?.setClimb(false)}
              onPointerLeave={() => simRef.current?.setClimb(false)}
              onPointerCancel={() => simRef.current?.setClimb(false)}
            ><Icon name="arrow-up" /> Jump<Key k="Space" /></button>
            <button
              className="btn sm"
              onClick={() => simRef.current?.tryToggleMount()}
              disabled={!riding && !nearV}
              aria-label={riding ? `Exit the ${riding === 'heli' ? 'helicopter' : 'car'}` : 'Ride the nearby vehicle'}
            ><Icon name={rideIcon} /> {rideText}<Key k="E" /></button>
            <button
              className="btn sm"
              onClick={() => talkRef.current?.()}
              disabled={!nearNpc}
              aria-label={nearNpc ? `Talk to ${nearNpc.name}, ${Math.round(nearNpc.dist)} meters away` : 'Walk up to a bystander to talk'}
            ><Icon name="message" /> {nearNpc ? nearNpc.name : 'Talk'}<Key k="T" /></button>
            <button className="btn sm ghost simhelp-btn" onClick={() => setHelpOpen(true)} aria-label="Show controls" aria-expanded={helpOpen}>
              ?<Key k="H" />
            </button>
            {gyroAvail && (
              <button className="btn sm ghost" onClick={toggleGyro} aria-pressed={gyroOn}>
                <Icon name="smartphone" /> Gyro {gyroOn ? 'on' : 'off'}
              </button>
            )}
          </div>
        </div>
      </div>
      <SimSettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        {settings}
      </SimSettingsOverlay>
      {helpOpen && <SimHelp vehicle={{ label: 'copter / car', hint: 'A copter and a car are parked by the spawn — press E beside one to ride; hold Jump to climb the copter, let go of the stick to land — tower rooftops have helipads.' }} onClose={() => setHelpOpen(false)} />}
    </div>
    <p className="simhint">
      <span className="simhint--desktop"><b>Mouse:</b> after Play (or one click on the scene) the cursor hides and the mouse looks around freely — Esc gives it back. <b>Keys:</b> WASD / arrows, Q settings, Shift run, Space jump, E ride, T talk, F fullscreen, H help.</span>
      <span className="simhint--touch"><b>Touch:</b> left joystick to move, drag the scene to look, buttons on the right to jump, ride, talk and more. Fullscreen fills the phone.</span>
      {' '}<Icon name="helicopter" /> <Icon name="car" /> parked by spawn — hold Jump to climb the copter, let go of the stick to land — tower rooftops have helipads.
    </p>
    </>
  );
}
