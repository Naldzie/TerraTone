import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EnvSim } from '../sim/EnvSim';
import type { EnvOptions, EnvQuality, EnvSnapshot } from '../sim/EnvSim';
import { compassPoint, WORLD } from '../sim/stormTypes';
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
  env: Omit<EnvOptions, 'quality' | 'reduceMotion' | 'onTick'>;
  vals: Record<string, number>;
  shake?: number;
  quality: EnvQuality;
  reduceEffects: boolean;
  paused: boolean;
  spawn: number;
  resetSignal: number;
  chips: string[];
  onSnapshot: (s: EnvSnapshot) => void;
  onPauseRequest: () => void;
  /** Show a Play overlay (first visit): one tap starts visuals + sound together. */
  startOverlay?: boolean;
  onStart?: () => void;
  /** Bystander NPCs on/off. */
  npcs?: boolean;
  /** Explorer appearance profile. */
  avatar?: AvatarOptions;
  /** Rideable vehicle (ocean scuba sub). Enables Ride button + E key. */
  vehicle?: { label: string; icon: IconName; hint?: string };
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
  /** Optional sim-specific action in the control dock (e.g. trigger a quake), with a keyboard key. */
  action?: { label: string; icon: IconName; key: string; onPress: () => void };
  /** Live analyser for the on-screen waveform + spectrum monitor. */
  getAnalyser?: () => AnalyserNode | null;
}

/**
 * Shared interactive viewport for all hazard simulators: EnvSim lifecycle,
 * keyboard (WASD/arrows + Shift + Space + Esc), touch joystick, drag-orbit
 * camera, walk/run toggle, optional gyro, HUD chips. touch-action:none
 * throughout so controls never scroll the page.
 */
export function SimViewport({ env, vals, shake = 0, quality, reduceEffects, paused, spawn, resetSignal, chips, onSnapshot, onPauseRequest, startOverlay, onStart, npcs = true, avatar, vehicle, onTalk, talkingNpc = null, chat, chatChoices, settings, action, getAnalyser }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<EnvSim | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const joy = useRef({ x: 0, z: 0 });
  const runModeRef = useRef(false);
  const [runMode, setRunMode] = useState(false);
  const [moving, setMoving] = useState(false);
  const [snap, setSnap] = useState<EnvSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroAvail, setGyroAvail] = useState(false);
  const joyBase = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const camId = useRef<number | null>(null);
  const camLast = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { ref: wrapRef, active: fullscreen, toggle: toggleFullscreen } = useFullscreenLandscape<HTMLDivElement>();
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
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sim = new EnvSim(canvas, {
      ...env,
      quality,
      reduceMotion: reduceEffects,
      onTick: (s) => { setSnap(s); snapRef.current(s); },
    });
    sim.reset(spawn);
    simRef.current = sim;
    const onResize = () => sim.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); sim.dispose(); simRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { simRef.current?.setVals(vals); }, [vals]);
  useEffect(() => { simRef.current?.setShake(shake); }, [shake]);
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
  const spawnRef = useRef(spawn);
  spawnRef.current = spawn;
  useEffect(() => { if (resetSignal > 0) simRef.current?.reset(spawnRef.current); }, [resetSignal]);
  useEffect(() => { runModeRef.current = runMode; pushInput(); }, [runMode]); // eslint-disable-line

  const pushInput = () => {
    const k = keys.current;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    simRef.current?.setInput(s + joy.current.x, f + joy.current.z, runModeRef.current || k.has('shift'));
    setMoving(f !== 0 || s !== 0 || joy.current.x !== 0 || joy.current.z !== 0);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { pauseRef.current(); return; }
      if (e.key === '?' || e.key.toLowerCase() === 'h') { setHelpOpen((v) => !v); return; }
      if (e.key.toLowerCase() === 'f' && !e.repeat) { void fsRef.current(); return; }
      if (e.key.toLowerCase() === 'q' && !e.repeat) { setSettingsOpen((v) => !v); return; }
      if (e.key.toLowerCase() === 't') { talkRef.current?.(); return; }
      const act = actionRef.current;
      if (act && !e.repeat && e.key.toLowerCase() === act.key.toLowerCase()) { act.onPress(); return; }
      if (vehicle && e.key.toLowerCase() === 'e') { simRef.current?.tryToggleMount(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.key === ' ') {
        e.preventDefault();
        if (vehicle && ridingRef.current) simRef.current?.setClimb(true);
        else if (!e.repeat) simRef.current?.queueJump();
        return;
      }
      keys.current.add(e.key.toLowerCase());
      const k = keys.current;
      const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      simRef.current?.setInput(s + joy.current.x, f + joy.current.z, runModeRef.current || k.has('shift'));
      setMoving(f !== 0 || s !== 0 || joy.current.x !== 0 || joy.current.z !== 0);
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
      if (e.key === ' ') simRef.current?.setClimb(false);
      pushInputRef.current();
    };
    const blur = () => {
      keys.current.clear();
      simRef.current?.setClimb(false);
      pushInputRef.current();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => { setGyroAvail(typeof DeviceOrientationEvent !== 'undefined'); }, []);
  const toggleGyro = async () => {
    if (gyroOn) { setGyroOn(false); return; }
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (DOE.requestPermission && (await DOE.requestPermission()) !== 'granted') return;
      setGyroOn(true);
    } catch { /* unsupported */ }
  };
  useEffect(() => {
    if (!gyroOn) return;
    let lb: number | null = null; let lg: number | null = null;
    const h = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (lb != null && lg != null) simRef.current?.addCameraOrbit((e.gamma - lg) * -4, (e.beta - lb) * -2);
      lb = e.beta; lg = e.gamma;
    };
    window.addEventListener('deviceorientation', h);
    return () => window.removeEventListener('deviceorientation', h);
  }, [gyroOn]);

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
    pushInputRef.current();
  };
  const pushInputRef = useRef(pushInput);
  pushInputRef.current = pushInput;

  const dist = snap?.distance ?? spawn;
  const bearing = snap?.bearing ?? 180;
  const yaw = snap?.yaw ?? 0;
  const compass = compassPoint(((bearing % 360) + 360) % 360);
  const riding = snap?.riding ?? false;
  const ridingRef = useRef(false);
  ridingRef.current = riding;
  const nearV = vehicle ? (snap?.nearVehicle ?? false) : false;
  const nearNpc = snap?.nearNpc ?? null;

  return (
    <>
    <div className="simwrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="simview"
        aria-label="Interactive 3D hazard simulation. Use WASD or the joystick to move."
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return; // mouse looks by hovering — no click needed
          camId.current = e.pointerId; camLast.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (camId.current !== e.pointerId) return;
          simRef.current?.addCameraOrbit(e.clientX - camLast.current.x, e.clientY - camLast.current.y);
          camLast.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => { if (camId.current === e.pointerId) camId.current = null; }}
        onPointerCancel={(e) => { if (camId.current === e.pointerId) camId.current = null; }}
      />
      {snap && (
        <Minimap
          x={snap.x} z={snap.z} yaw={yaw} halfSize={WORLD.halfSize} size={128}
          npcs={simRef.current?.getNpcs() ?? []}
          events={snap.hazardX != null && snap.hazardZ != null ? [{
            x: snap.hazardX, z: snap.hazardZ,
            kind: ((snap.hazardKind ?? 'vehicle') as MinimapEvent['kind']),
            label: snap.hazardLabel ?? 'Hazard', radius: 45,
          }] : []}
          temperature={snap.temperature}
          condition={chips.slice(0, 2).join(' · ') || 'simulated world'}
        />
      )}
      {getAnalyser && <SimAudioMonitor getAnalyser={getAnalyser} />}
      {startOverlay && (
        <button className="simstart" onClick={() => { captureMouse(canvasRef.current); onStart?.(); }} aria-label="Play simulation with sound">
          <span className="simstart-icon" aria-hidden="true"><Icon name="play" /></span>
          <span className="simstart-text">Play with sound</span>
        </button>
      )}
      <div className="simhud" aria-live="polite">
        <span className="simhud-chip simhud-chip--accent"><Icon name="compass" /> {compass}</span>
        <span className="simhud-chip"><Icon name="ruler" /> ~{Math.round(dist)} m</span>
        {chips.map((c) => <span className="simhud-chip" key={c}>{c}</span>)}
        {riding && vehicle && <span className="simhud-chip simhud-chip--live"><Icon name={vehicle.icon} /> {vehicle.label}</span>}
        {mouseLocked && <span className="simhud-chip"><Key k="Esc" /> frees the mouse</span>}
        {moving && <span className="simhud-chip simhud-chip--live"><Icon name={runMode ? 'run' : 'walk'} /> {runMode ? 'running' : 'moving'}</span>}
      </div>
      {talkingNpc && chat && <div ref={bubbleRef} className="npcbubble">{chat}</div>}
      {talkingNpc && chatChoices && <div className="npcchoices">{chatChoices}</div>}
      <div className="simcontrols">
        <div
          ref={joyBase}
          className="joystick"
          role="application"
          aria-label="Movement joystick"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); joyId.current = e.pointerId; moveJoy(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (joyId.current === e.pointerId) moveJoy(e.clientX, e.clientY); }}
          onPointerUp={(e) => { if (joyId.current === e.pointerId) { joyId.current = null; joy.current = { x: 0, z: 0 }; setKnob({ x: 0, y: 0 }); pushInputRef.current(); } }}
          onPointerCancel={(e) => { if (joyId.current === e.pointerId) { joyId.current = null; joy.current = { x: 0, z: 0 }; setKnob({ x: 0, y: 0 }); pushInputRef.current(); } }}
        >
          <div className="joyknob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
        <div className="simright" {...multiTouchTap}>
          {!startOverlay && !talkingNpc && (
            <SimPrompt
              riding={riding}
              vehicle={vehicle}
              nearVehicle={nearV}
              npcName={nearNpc?.name ?? null}
            />
          )}
          <JumpPad
            label={vehicle && riding ? 'Rise' : 'Jump'}
            onPress={() => { if (vehicle && riding) simRef.current?.setClimb(true); else simRef.current?.queueJump(); }}
            onRelease={() => simRef.current?.setClimb(false)}
          />
          <div className="simbtns">
            <button
              className="btn sm ghost"
              onClick={() => void toggleFullscreen()}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? 'Exit fullscreen landscape' : 'Fullscreen landscape'}
              title="Fullscreen (F)"
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
            <button className="btn sm" aria-pressed={runMode} onClick={() => setRunMode((v) => !v)}>
              {runMode ? <><Icon name="run" /> Run</> : <><Icon name="walk" /> Walk</>}<Key k="Shift" />
            </button>
            <button className="btn sm simjump-btn" onClick={() => simRef.current?.queueJump()} aria-label="Jump"
              onPointerDown={() => { if (vehicle && riding) simRef.current?.setClimb(true); }}
              onPointerUp={() => simRef.current?.setClimb(false)}
              onPointerLeave={() => simRef.current?.setClimb(false)}
              onPointerCancel={() => simRef.current?.setClimb(false)}
            ><Icon name="arrow-up" /> {riding ? 'Rise' : 'Jump'}<Key k="Space" /></button>
            {action && (
              <button className="btn sm simaction-btn" onClick={action.onPress} aria-label={action.label}>
                <Icon name={action.icon} /> {action.label}<Key k={action.key.toUpperCase()} />
              </button>
            )}
            {vehicle && (
              <button className="btn sm" onClick={() => simRef.current?.tryToggleMount()}
                disabled={!riding && !nearV}
                aria-label={riding ? `Exit the ${vehicle.label}` : `Ride the ${vehicle.label}`}>
                {riding ? <><Icon name={vehicle.icon} /> Exit</> : <><Icon name={vehicle.icon} /> Ride</>}<Key k="E" />
              </button>
            )}
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
      {helpOpen && <SimHelp vehicle={vehicle} onClose={() => setHelpOpen(false)} />}
    </div>
    <p className="simhint">
      <span className="simhint--desktop"><b>Mouse:</b> after Play (or one click on the scene) the cursor hides and the mouse looks around freely — Esc gives it back. <b>Keys:</b> WASD / arrows, Q settings, Shift run, Space jump, T talk, F fullscreen, H help.</span>
      <span className="simhint--touch"><b>Touch:</b> left joystick to move, drag the scene to look, buttons on the right to jump, talk and more. Fullscreen fills the phone.</span>
      {vehicle?.hint ? ` ${vehicle.hint}` : ''}
    </p>
    </>
  );
}
