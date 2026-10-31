/* Detailed 3D visualization of the sonification ("3D music view").
 *
 * The scene is a DATA LANDSCAPE of the dataset currently playing — one column
 * per (sampled) frame along the time axis, height and color = the value on a
 * semantic ramp (temperature anomalies go blue → white → red around zero,
 * fires go gold → hot red, sea level / ice go deep blue → aqua, vegetation and
 * CO₂ go dim → bright green, sun/space weather goes indigo → magenta).
 *
 * Live layers on top of the landscape:
 *  - Playhead beacon  — the column being played pulses, with a light column and
 *                       a floating label (time · value · units).
 *  - Note fountain     — every scheduled frame spawns a glowing, spinning shard
 *                       at the playhead (x offset = stereo pan).
 *  - Atmosphere        — bloom, glow backdrop, starfield, grid, fog; the
 *                       master-bus level gently pumps bloom and the accents.
 *
 * Cameras: drag to orbit; during playback the view follows the playhead, idle
 * it slowly orbits the whole record. Fully offline; lazy-loaded by Player.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { engine } from '../audio/engine';
import type { NoteEvent } from '../audio/engine';
import { clamp, normalizeValue } from '../lib/dataUtils';
import type { DatasetMeta, SoundProfileId } from '../types';

/* ---------- pure helpers (unit-tested, no WebGL needed) ---------- */

export function noteColor(profileId: SoundProfileId): number {
  switch (profileId) {
    case 'ambient': return 0xa78bfa;
    case 'minimal': return 0xe2e8f0;
    case 'scientific': return 0x34d399;
    default: return 0x22d3ee;
  }
}

/** How the record is laid out: up to `max` columns, evenly sampled. */
export function columnPlan(len: number, max = 150): { cols: number; step: number; sampled: boolean } {
  const cols = Math.max(1, Math.min(len, max));
  const step = cols > 1 ? (len - 1) / (cols - 1) : 0;
  return { cols, step, sampled: len > max };
}

/** The frame index represented by column i of the plan. */
export function columnFrame(i: number, plan: { cols: number; step: number }, len: number): number {
  return Math.min(len - 1, Math.max(0, Math.round(i * plan.step)));
}

export type RampName = 'diverging' | 'cool' | 'warm' | 'green' | 'violet';

/** Semantic color ramp per dataset — honest, category-aware, documented in the legend. */
export function rampForDataset(d: DatasetMeta): RampName {
  const key = `${d.id} ${d.category} ${d.title}`.toLowerCase();
  if (key.includes('temperature')) return 'diverging';
  if (/(sea|ice|glacier|cryo|ocean|coast|precip|rain|monsoon|tide)/.test(key)) return 'cool';
  if (/(fire|storm|lightning|wind|cyclone|heat)/.test(key)) return 'warm';
  if (/(co2|vegetation|forest|green|ndvi)/.test(key)) return 'green';
  return 'violet';
}

const RAMPS: Record<RampName, [number, number, number][]> = {
  // classic cool–white–warm for signed anomalies
  diverging: [[0.23, 0.30, 0.75], [0.87, 0.87, 0.87], [0.71, 0.02, 0.15]],
  cool: [[0.06, 0.16, 0.35], [0.13, 0.59, 0.82], [0.49, 0.89, 0.97]],
  warm: [[0.35, 0.20, 0.05], [0.94, 0.59, 0.16], [0.98, 0.86, 0.47]],
  green: [[0.07, 0.27, 0.18], [0.20, 0.63, 0.35], [0.63, 0.90, 0.55]],
  violet: [[0.18, 0.14, 0.47], [0.51, 0.31, 0.86], [0.94, 0.47, 0.90]],
};

/** Ramp color at t∈0…1 as sRGB components. */
export function rampColor(name: RampName, t: number): [number, number, number] {
  const stops = RAMPS[name];
  const tt = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(tt));
  const f = tt - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** CSS gradient for the on-screen legend. */
export function rampCss(name: RampName): string {
  const stops = RAMPS[name];
  return `linear-gradient(90deg, ${stops.map((s, i) => `rgb(${Math.round(s[0] * 255)},${Math.round(s[1] * 255)},${Math.round(s[2] * 255)}) ${Math.round((i / (stops.length - 1)) * 100)}%`).join(', ')})`;
}

export function rampLabel(name: RampName): string {
  switch (name) {
    case 'diverging': return 'blue = below normal · red = above normal';
    case 'cool': return 'deep blue = low · bright aqua = high';
    case 'warm': return 'dark gold = low · hot red = high';
    case 'green': return 'dim green = low · bright green = high';
    default: return 'indigo = low · magenta = high';
  }
}

/** Value → 0…1 for coloring; diverging ramps center at 0 when the range spans it. */
export function colorT(value: number, range: [number, number], ramp: RampName): number {
  const [r0, r1] = range;
  if (ramp === 'diverging' && r0 < 0 && r1 > 0) {
    return value >= 0 ? 0.5 + 0.5 * clamp(value / r1, 0, 1) : 0.5 - 0.5 * clamp(value / r0, 0, 1);
  }
  const span = r1 - r0 || 1;
  return clamp((value - r0) / span, 0, 1);
}

/* ---------- component ---------- */

const WIDTH = 15;          // time axis length in scene units
const MAX_COLUMNS = 150;   // sampled columns across the record
const MAX_H = 4.6;         // column height for the top of the range
const PARTICLE_POOL = 110;

type VizMode = 'live' | 'idle' | 'fallback';

/** Canvas label sprite helper (time labels, playhead label). */
function makeLabelSprite(fontPx: number, scaleX: number, scaleY: number): {
  sprite: THREE.Sprite; tex: THREE.CanvasTexture; draw: (text: string, color?: string) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(scaleX, scaleY, 1);
  const c2 = canvas.getContext('2d');
  const draw = (text: string, color = '#b8c6e4') => {
    if (!c2) return;
    c2.clearRect(0, 0, canvas.width, canvas.height);
    c2.font = `600 ${fontPx}px system-ui, sans-serif`;
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.shadowColor = 'rgba(0,0,0,0.85)';
    c2.shadowBlur = 8;
    c2.fillStyle = color;
    c2.fillText(text, canvas.width / 2, canvas.height / 2);
    tex.needsUpdate = true;
  };
  return { sprite, tex, draw };
}

export function MusicViz3D({ dataset, frame, profileId, reduceMotion, playing }: {
  dataset: DatasetMeta;
  frame: number;
  profileId: SoundProfileId;
  reduceMotion: boolean;
  playing: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<VizMode>('idle');
  const modeRef = useRef<VizMode>('idle');
  const updateMode = (m: VizMode) => { if (modeRef.current !== m) { modeRef.current = m; setMode(m); } };
  const updateModeRef = useRef(updateMode);
  updateModeRef.current = updateMode;

  const pointsRef = useRef(dataset.points);
  const rangeRef = useRef(dataset.range);
  const profileRef = useRef(profileId);
  const frameRef = useRef(frame);
  const motionRef = useRef(reduceMotion);
  const playingRef = useRef(playing);
  pointsRef.current = dataset.points;
  rangeRef.current = dataset.range;
  profileRef.current = profileId;
  frameRef.current = frame;
  motionRef.current = reduceMotion;
  playingRef.current = playing;

  const ramp = rampForDataset(dataset);
  const plan = columnPlan(dataset.points.length, MAX_COLUMNS);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    let composer: EffectComposer;
    let bloom: UnrealBloomPass;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 320;
      renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
      renderer.setSize(w, h);
      // Filmic tone mapping keeps bright accents from clipping to white.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      composer = new EffectComposer(renderer);
      composer.setSize(w, h);
      // Only genuine highlights bloom (high threshold, gentle strength) — the
      // earlier low-threshold bloom washed the whole landscape out.
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.32, 0.85);
    } catch {
      updateModeRef.current('fallback');
      return;
    }
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.touchAction = 'pan-y';

    const { cols, step } = plan;
    const len = pointsRef.current.length;
    const spacing = cols > 1 ? WIDTH / (cols - 1) : 0;
    const colX = (i: number) => (cols > 1 ? -WIDTH / 2 + i * spacing : 0);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b16);
    scene.fog = new THREE.Fog(0x070b16, 12, 26);
    const camera = new THREE.PerspectiveCamera(45, (host.clientWidth || 640) / (host.clientHeight || 320), 0.1, 90);

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    scene.add(new THREE.HemisphereLight(0x4a5d85, 0x0a0f1e, 1.3));
    const l1 = new THREE.PointLight(0x22d3ee, 30, 22); l1.position.set(4, 6, 4); scene.add(l1);
    const l2 = new THREE.PointLight(0xa78bfa, 24, 22); l2.position.set(-4, 4, -2); scene.add(l2);

    /* --- atmosphere: floor, grid, glow backdrop, stars --- */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), new THREE.MeshBasicMaterial({ color: 0x0b1120 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);
    const grid = new THREE.GridHelper(22, 44, 0x25355a, 0x131e36);
    scene.add(grid);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    if (gctx) {
      const grd = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
      grd.addColorStop(0, 'rgba(56,189,248,0.26)');
      grd.addColorStop(0.45, 'rgba(139,92,246,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      gctx.fillStyle = grd;
      gctx.fillRect(0, 0, 256, 256);
    }
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 15),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.position.set(0, 4.5, -10);
    scene.add(glow);

    const starCount = 260;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 15 + Math.random() * 10;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.6 + 1;
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 0.09, color: 0x9fb4dd, transparent: true, opacity: 0.7, sizeAttenuation: true, depthWrite: false,
    }));
    scene.add(stars);

    /* --- the data landscape: one column per sampled frame --- */
    const colGeo = new THREE.BoxGeometry(0.11, 1, 0.11);
    colGeo.translate(0, 0.5, 0);
    const columns = new THREE.InstancedMesh(colGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), cols);
    columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const baseColors: THREE.Color[] = [];
    const tmpM0 = new THREE.Matrix4();
    const tmpQ0 = new THREE.Quaternion();
    const tmpV0 = new THREE.Vector3();
    const tmpS0 = new THREE.Vector3();
    for (let i = 0; i < cols; i++) {
      const fi = columnFrame(i, plan, len);
      const p = pointsRef.current[fi];
      const norm = p && p.value !== null ? normalizeValue(p.value, rangeRef.current) : null;
      const h = norm === null ? 0.06 : 0.06 + norm * MAX_H;
      tmpV0.set(colX(i), 0, 0);
      tmpS0.set(1, h, 1);
      tmpM0.compose(tmpV0, tmpQ0, tmpS0);
      columns.setMatrixAt(i, tmpM0);
      const rgb = norm === null ? [0.35, 0.38, 0.45] as [number, number, number] : rampColor(ramp, colorT(p!.value as number, rangeRef.current, ramp));
      const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      baseColors.push(c);
      columns.setColorAt(i, c);
    }
    columns.instanceMatrix.needsUpdate = true;
    scene.add(columns);
    let lastPlayCol = -1;

    /* --- time labels along the front edge --- */
    const labelTexs: THREE.CanvasTexture[] = [];
    const labelEvery = Math.max(1, Math.ceil(cols / 9));
    for (let i = 0; i < cols; i += labelEvery) {
      const fi = columnFrame(i, plan, len);
      const p = pointsRef.current[fi];
      if (!p) continue;
      const { sprite, tex, draw } = makeLabelSprite(30, 1.5, 0.34);
      draw(p.t);
      sprite.position.set(colX(i), 0.14, 1.7);
      scene.add(sprite);
      labelTexs.push(tex);
    }

    /* --- playhead: floor ring, beacon, light column, floating label --- */
    const floorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.02, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    floorRing.rotation.x = -Math.PI / 2;
    scene.add(floorRing);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(noteColor(profileRef.current)).multiplyScalar(1.6) }),
    );
    scene.add(beacon);
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 10, 1);
    beamGeo.translate(0, 0.5, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0x67e8f9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const beamGlowGeo = new THREE.CylinderGeometry(0.13, 0.13, 1, 10, 1);
    beamGlowGeo.translate(0, 0.5, 0);
    const beamGlow = new THREE.Mesh(beamGlowGeo, new THREE.MeshBasicMaterial({
      color: 0x38bdf8, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(beam, beamGlow);
    const headLabel = makeLabelSprite(34, 3.1, 0.58);
    scene.add(headLabel.sprite);
    labelTexs.push(headLabel.tex);
    let lastHeadText = '';

    /* --- note fountain (instanced shards with spin) --- */
    const shardGeo = new THREE.OctahedronGeometry(0.1, 0);
    const shards = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PARTICLE_POOL);
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PARTICLE_POOL; i++) shards.setColorAt(i, new THREE.Color(0x22d3ee));
    const parts: {
      x: number; y: number; z: number; vy: number; vx: number; ttl: number; life: number;
      size: number; rx: number; ry: number; color: THREE.Color;
    }[] = [];
    for (let i = 0; i < PARTICLE_POOL; i++) {
      parts.push({ x: 0, y: -10, z: 0, vy: 0, vx: 0, ttl: 0, life: 1, size: 0.001, rx: 0, ry: 0, color: new THREE.Color(0x22d3ee) });
    }
    let partCursor = 0;
    let pendingSpawns = 0;
    let pendingGain = 0.2;
    let pendingPan = 0;
    scene.add(shards);
    const hideM = new THREE.Matrix4().makeScale(0, 0, 0);

    const unsubscribe = engine.onNote((n: NoteEvent) => {
      if (n.silent) return;
      pendingSpawns = Math.min(14, pendingSpawns + 1 + n.ticks);
      pendingGain = n.gain;
      pendingPan = n.pan;
    });

    let playX = 0;      // current playhead x
    let playTop = 0.2;  // current column top
    const consumeNoteSpawns = () => {
      const count = pendingSpawns;
      pendingSpawns = 0;
      const baseColor = new THREE.Color(noteColor(profileRef.current)).multiplyScalar(1.5);
      for (let k = 0; k < count; k++) {
        const p = parts[partCursor];
        partCursor = (partCursor + 1) % PARTICLE_POOL;
        p.x = playX + clamp(pendingPan, -1, 1) * 0.55 + (Math.random() - 0.5) * 0.2;
        p.y = playTop + 0.1 + Math.random() * 0.2;
        p.z = (Math.random() - 0.5) * 0.3;
        p.vy = 1.1 + pendingGain * 3.4;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.life = 1 + Math.random() * 0.8;
        p.ttl = p.life;
        p.size = 0.5 + pendingGain * 2.4;
        p.rx = (Math.random() - 0.5) * 6;
        p.ry = (Math.random() - 0.5) * 6;
        p.color.copy(baseColor);
      }
    };

    /* --- drag-to-orbit camera --- */
    let yaw = 0;
    let pitch = 0.4;
    let tYaw = yaw;
    let tPitch = pitch;
    const dist = 9.4;
    let camX = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastInteract = -10;
    let elapsed = 0;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      tYaw -= dx * 0.005;
      tPitch = clamp(tPitch + dy * 0.004, 0.08, 1.02);
      lastInteract = elapsed;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    /* --- resize --- */
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 320;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    /* --- animation loop --- */
    const clock = new THREE.Clock();
    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const tmpE = new THREE.Euler();
    const tmpV = new THREE.Vector3();
    const tmpS = new THREE.Vector3();
    const tmpC = new THREE.Color();
    const timeData = new Uint8Array(512);
    const camTarget = new THREE.Vector3(0, 1.7, 0);

    renderer.setAnimationLoop((timeMs) => {
      const dt = Math.min(0.05, clock.getDelta());
      const t = timeMs * 0.001;
      elapsed += dt;
      consumeNoteSpawns();

      // 1) master-bus RMS drives the glow accents (bloom, beacon, playhead)
      let rms = 0;
      const an = engine.getAnalyser();
      if (an) {
        an.getByteTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) { const v = (timeData[i] - 128) / 128; sum += v * v; }
        rms = Math.sqrt(sum / timeData.length);
        updateModeRef.current('live');
        bloom.strength = 0.34 + rms * 0.3;
      } else {
        updateModeRef.current('idle');
        bloom.strength = 0.38;
      }

      // 2) note fountain
      for (let i = 0; i < PARTICLE_POOL; i++) {
        const p = parts[i];
        if (p.ttl > 0) {
          p.ttl -= dt;
          p.y += p.vy * dt;
          p.x += p.vx * dt;
          p.vy *= 0.985;
          p.rx += dt * 4;
          p.ry += dt * 3;
          const k = Math.max(0, p.ttl / p.life);
          tmpV.set(p.x, p.y, p.z);
          tmpE.set(p.rx, p.ry, 0);
          tmpQ.setFromEuler(tmpE);
          tmpS.setScalar(p.size * (0.4 + 0.6 * k));
          tmpM.compose(tmpV, tmpQ, tmpS);
          shards.setMatrixAt(i, tmpM);
          shards.setColorAt(i, p.color);
        } else {
          shards.setMatrixAt(i, hideM);
        }
      }
      shards.instanceMatrix.needsUpdate = true;
      if (shards.instanceColor) shards.instanceColor.needsUpdate = true;

      // 3) playhead state: which column, top height, label text
      const frameIdx = Math.min(len - 1, Math.max(0, frameRef.current));
      const playCol = Math.min(cols - 1, Math.max(0, Math.round(frameIdx / (step || 1))));
      const pNow = pointsRef.current[frameIdx];
      const normNow = pNow && pNow.value !== null ? normalizeValue(pNow.value, rangeRef.current) : null;
      playX = colX(playCol);
      playTop = normNow === null ? 0.12 : 0.06 + normNow * MAX_H;

      // pulse the current column's glow (restore the previous one when it moves)
      if (lastPlayCol >= 0 && lastPlayCol !== playCol) columns.setColorAt(lastPlayCol, baseColors[lastPlayCol]);
      lastPlayCol = playCol;
      tmpC.copy(baseColors[playCol]).multiplyScalar(1.08 + rms * 0.4 + 0.06 * Math.sin(t * 6));
      columns.setColorAt(playCol, tmpC);
      if (columns.instanceColor) columns.instanceColor.needsUpdate = true;

      // 4) playhead visuals
      floorRing.position.set(playX, 0.01, 0);
      floorRing.scale.setScalar(1 + 0.18 * Math.sin(t * 5));
      beacon.position.set(playX, playTop, 0);
      beacon.scale.setScalar((1 + 0.22 * Math.sin(t * 5.5)) * (1 + rms * 0.6));
      beacon.visible = normNow !== null;
      beam.visible = beamGlow.visible = normNow !== null;
      beam.position.set(playX, 0, 0);
      beam.scale.set(1, playTop, 1);
      beamGlow.position.set(playX, 0, 0);
      beamGlow.scale.set(1, playTop, 1);
      const headText = pNow
        ? (pNow.value === null ? `${pNow.t} · no data` : `${pNow.t} · ${pNow.value} ${dataset.units}`)
        : '';
      if (headText !== lastHeadText) {
        lastHeadText = headText;
        headLabel.draw(headText, normNow === null ? '#94a3b8' : '#eaf4ff');
      }
      headLabel.sprite.position.set(playX, playTop + 0.62, 0);
      headLabel.sprite.visible = normNow !== null;

      // 5) camera: follow the playhead while playing, orbit around the record when idle
      if (!dragging && !motionRef.current && elapsed - lastInteract > 3) {
        tYaw += dt * 0.05;
      }
      const followTarget = playingRef.current ? clamp(playX * 0.85, -WIDTH / 2, WIDTH / 2) : 0;
      camX += (followTarget - camX) * Math.min(1, dt * 2.2);
      yaw += (tYaw - yaw) * Math.min(1, dt * 6);
      pitch += (tPitch - pitch) * Math.min(1, dt * 6);
      camTarget.set(camX, 1.7, 0);
      const cy = Math.cos(pitch) * dist;
      camera.position.set(camX + Math.sin(yaw) * cy, Math.sin(pitch) * dist + 0.4, Math.cos(yaw) * cy);
      camera.lookAt(camTarget);
      stars.rotation.y = t * 0.004;
      glow.position.y = 4.5 + Math.sin(t * 0.3) * 0.15;

      composer.render();
    });

    return () => {
      renderer.setAnimationLoop(null);
      unsubscribe();
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      glowTex.dispose();
      labelTexs.forEach((tx) => tx.dispose());
      bloom.dispose();
      composer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [dataset.id]);

  const shown = plan.sampled ? `1 column ≈ ${Math.round(plan.step)} frames (sampled evenly)` : '1 column = 1 frame';
  const label = mode === 'fallback'
    ? '3D view unavailable (WebGL could not start) — the chart and captions still show every frame.'
    : mode === 'live'
      ? `Live 3D data landscape of ${dataset.title}: columns show the values over time, shards mark each note.`
      : `Idle 3D data landscape of ${dataset.title}: columns show the values over time as a colored skyline.`;

  return (
    <div className="musicviz3d" role="img" aria-label={label}>
      <div ref={hostRef} className="musicviz-stage" />
      <div className="musicviz-status" aria-hidden="true">
        {mode === 'live' ? `LIVE · columns = ${dataset.title} over time · shards = notes · drag to orbit`
          : mode === 'fallback' ? 'WebGL unavailable — using chart view'
            : `IDLE · columns = ${dataset.title} over time · press Play for live shards · drag to orbit`}
      </div>
      <div className="musicviz-legend" aria-hidden="true">
        <div className="musicviz-ramp" style={{ background: rampCss(ramp) }} />
        <div className="musicviz-ramp-labels">
          <span>{dataset.range[0]}</span>
          <span>{dataset.units}</span>
          <span>{dataset.range[1]}</span>
        </div>
        <div className="musicviz-ramp-note">{rampLabel(ramp)} · {shown}</div>
      </div>
      {mode === 'fallback' && <div className="musicviz-fallback">3D view needs WebGL — the 2D chart and captions continue below.</div>}
    </div>
  );
}
