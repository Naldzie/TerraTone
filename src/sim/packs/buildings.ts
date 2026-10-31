/* Shared building kit for the simulators — procedural, offline-safe.
 *
 *  · facadeMaterial(): canvas facade with floor ledges, framed windows (a few
 *    lit warm at random), and subtle wall grime; tiles by floor/bay count.
 *  · buildHouse(): walls + gable (or flat) roof with eaves, door, steps,
 *    chimney and window boxes.
 *  · buildTower(): office block with parapet, rooftop plant, water tank and a
 *    blinking red aviation light on the antenna (blink with blinkLights()).
 * Every builder returns a Group positioned at ground level plus its height.
 */
import * as THREE from 'three';

type Rng = () => number;

interface FacadeStyle {
  wall: string;
  trim: string;
  glass: string;
  /** Fraction of windows lit (warm interior light). */
  lit: number;
  /** 'brick' adds courses; 'siding' horizontal boards; 'concrete' panels. */
  finish: 'brick' | 'siding' | 'concrete' | 'glass';
}

const texCache = new Map<string, THREE.CanvasTexture>();

/** One storey × three bays of facade, tiled across the walls. */
function facadeTexture(style: FacadeStyle, seed: number): THREE.CanvasTexture | null {
  const key = `${style.wall}|${style.trim}|${style.glass}|${style.lit}|${style.finish}|${seed % 4}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const W = 256; const H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  g.fillStyle = style.wall;
  g.fillRect(0, 0, W, H);
  // Wall finish.
  g.globalAlpha = 0.16;
  if (style.finish === 'brick') {
    g.strokeStyle = '#000';
    for (let y = 0; y < H; y += 8) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
    }
  } else if (style.finish === 'siding') {
    g.strokeStyle = '#000';
    for (let y = 0; y < H; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  } else if (style.finish === 'concrete') {
    g.strokeStyle = '#000';
    for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  }
  // Grime streaks.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rnd() > 0.5 ? '#000' : '#fff';
    g.globalAlpha = 0.03 + rnd() * 0.05;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 10 + rnd() * 40);
  }
  g.globalAlpha = 1;
  // Floor ledge.
  g.fillStyle = style.trim;
  g.fillRect(0, H - 8, W, 8);
  // Windows: three bays per tile.
  const glassy = style.finish === 'glass';
  for (let b = 0; b < 3; b++) {
    const bw = W / 3;
    const wx = b * bw + (glassy ? 6 : bw * 0.22);
    const ww = glassy ? bw - 12 : bw * 0.56;
    const wy = glassy ? 10 : H * 0.2;
    const wh = glassy ? H - 26 : H * 0.52;
    g.fillStyle = style.trim;
    g.fillRect(wx - 4, wy - 4, ww + 8, wh + 10);           // frame + sill
    const lit = rnd() < style.lit;
    const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    if (lit) {
      grad.addColorStop(0, '#ffe2a0'); grad.addColorStop(1, '#f2a75a');
    } else {
      grad.addColorStop(0, style.glass); grad.addColorStop(1, '#0b1220');
    }
    g.fillStyle = grad;
    g.fillRect(wx, wy, ww, wh);
    // Mullions + a sky reflection streak.
    g.fillStyle = style.trim;
    g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    if (!glassy) g.fillRect(wx, wy + wh * 0.45, ww, 3);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.moveTo(wx + ww * 0.1, wy + wh); g.lineTo(wx + ww * 0.45, wy); g.lineTo(wx + ww * 0.6, wy); g.lineTo(wx + ww * 0.25, wy + wh); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** Facade material tiled for a wall of the given width × height (metres). */
export function facadeMaterial(style: FacadeStyle, seed: number, w: number, h: number, storey = 3.4): THREE.MeshLambertMaterial {
  const base = facadeTexture(style, seed);
  const map = base ? base.clone() : null;
  if (map) {
    map.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / storey)));
    map.needsUpdate = true;
  }
  return new THREE.MeshLambertMaterial({ map, color: 0xffffff, emissive: 0x1a1408, emissiveIntensity: style.lit > 0.2 ? 0.25 : 0.1 });
}

export const PALETTES = {
  coastal: [
    { wall: '#e9dcc3', trim: '#f7f3ea', glass: '#2a4f6e', lit: 0.25, finish: 'siding' },
    { wall: '#b9d3d8', trim: '#f2f5f5', glass: '#294a5f', lit: 0.2, finish: 'siding' },
    { wall: '#e6c1a6', trim: '#fbf1e6', glass: '#2b4660', lit: 0.25, finish: 'siding' },
    { wall: '#c8d6b4', trim: '#f4f4ec', glass: '#2a4558', lit: 0.2, finish: 'siding' },
  ],
  town: [
    { wall: '#8c5a46', trim: '#d9cbb8', glass: '#243649', lit: 0.35, finish: 'brick' },
    { wall: '#6f7684', trim: '#c9ced8', glass: '#1f3046', lit: 0.4, finish: 'concrete' },
    { wall: '#4f6a8a', trim: '#b8c6da', glass: '#1d2c40', lit: 0.45, finish: 'glass' },
    { wall: '#a9967a', trim: '#e6dccb', glass: '#26384a', lit: 0.35, finish: 'brick' },
  ],
} satisfies Record<string, FacadeStyle[]>;

export interface BuiltBuilding { group: THREE.Group; height: number; light?: THREE.Mesh }

/** A detached house: walls, roof with eaves, door, steps, chimney. */
export function buildHouse(rnd: Rng, opts: { w: number; d: number; h: number; style: FacadeStyle; roof?: 'gable' | 'flat' | 'none'; roofColor?: number }): BuiltBuilding {
  const { w, d, h, style } = opts;
  const g = new THREE.Group();
  const seed = Math.floor(rnd() * 1e6);
  const front = facadeMaterial(style, seed, w, h);
  const side = facadeMaterial(style, seed + 1, d, h);
  const plain = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.wall) });
  // Box faces: +x, -x, +y, -y, +z (front), -z.
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, plain, plain, front, front]);
  walls.position.y = h / 2;
  g.add(walls);
  // Foundation course.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4), new THREE.MeshLambertMaterial({ color: 0x55585e }));
  plinth.position.y = 0.3;
  g.add(plinth);
  const roofMat = new THREE.MeshLambertMaterial({ color: opts.roofColor ?? 0x5a3d33 });
  let top = h;
  if ((opts.roof ?? 'gable') === 'gable') {
    const rise = Math.min(w, d) * 0.38;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.8, 0); shape.lineTo(0, rise); shape.lineTo(w / 2 + 0.8, 0); shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 1.4, bevelEnabled: false });
    roofGeo.translate(0, 0, -(d + 1.4) / 2);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = h;
    g.add(roof);
    top = h + rise;
    // Chimney.
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.1, rise + 1.2, 1.1), new THREE.MeshLambertMaterial({ color: 0x6b4a3c }));
    ch.position.set(w * 0.25, h + (rise + 1.2) / 2, d * 0.15);
    g.add(ch);
  } else if (opts.roof === 'flat') {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8), roofMat);
    slab.position.y = h + 0.25;
    g.add(slab);
    top = h + 0.5;
  }
  // Door, steps and a porch light.
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), new THREE.MeshLambertMaterial({ color: 0x4a2f22 }));
  door.position.set(-w * 0.18, 1.8, d / 2 + 0.05);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a8a8a }));
  step.position.set(-w * 0.18, 0.25, d / 2 + 0.6);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd38a }));
  lamp.position.set(-w * 0.18 + 1.1, 2.9, d / 2 + 0.2);
  g.add(door, step, lamp);
  return { group: g, height: top };
}

/** An office / apartment block with rooftop details. */
export function buildTower(rnd: Rng, opts: { w: number; d: number; h: number; style: FacadeStyle }): BuiltBuilding {
  const { w, d, h, style } = opts;
  const g = new THREE.Group();
  const seed = Math.floor(rnd() * 1e6);
  const front = facadeMaterial(style, seed, w, h);
  const side = facadeMaterial(style, seed + 1, d, h);
  const roofM = new THREE.MeshLambertMaterial({ color: 0x3a3f48 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofM, roofM, front, front]);
  body.position.y = h / 2;
  g.add(body);
  // Ground-floor lobby band + parapet.
  const trim = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.trim).multiplyScalar(0.8) });
  const lobby = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 3.2, d + 0.3), new THREE.MeshLambertMaterial({ color: 0x1d2633, emissive: 0x2a2010, emissiveIntensity: 0.5 }));
  lobby.position.y = 1.6;
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1, d + 0.6), trim);
  parapet.position.y = h + 0.5;
  g.add(lobby, parapet);
  // Rooftop plant: AC units, a water tank, an antenna with an aviation light.
  const plantM = new THREE.MeshLambertMaterial({ color: 0x8a9099 });
  // Plant hugs the roof edges, leaving the middle clear for the helipad.
  for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.8 + rnd() * 1.4, 1.4, 1.8 + rnd() * 1.4), plantM);
    const edgeX = i % 2 === 0;
    ac.position.set(
      edgeX ? (rnd() < 0.5 ? -1 : 1) * (w / 2 - 1.6) : (rnd() - 0.5) * (w - 4),
      h + 1.7,
      edgeX ? (rnd() - 0.5) * (d - 4) : (rnd() < 0.5 ? -1 : 1) * (d / 2 - 1.6),
    );
    g.add(ac);
  }
  // Helipad: yellow ring with a white "H" — you can set the copter down here.
  const padR = Math.min(w, d) * 0.3;
  const padM = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const ring = new THREE.Mesh(new THREE.RingGeometry(padR * 0.86, padR, 32), padM);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = h + 1.03;
  const hM = new THREE.MeshBasicMaterial({ color: 0xf2f5fa });
  const barGeo = new THREE.PlaneGeometry(padR * 0.14, padR * 0.9);
  for (const sx of [-1, 1]) {
    const bar = new THREE.Mesh(barGeo, hM);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(sx * padR * 0.3, h + 1.04, 0);
    g.add(bar);
  }
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(padR * 0.6, padR * 0.14), hM);
  cross.rotation.x = -Math.PI / 2;
  cross.position.y = h + 1.04;
  g.add(ring, cross);
  if (rnd() < 0.6) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 12), new THREE.MeshLambertMaterial({ color: 0x6b5a48 }));
    tank.position.set(w / 2 - 2.2, h + 3.6, -(d / 2 - 2.2));
    const tankRoof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.2, 12), new THREE.MeshLambertMaterial({ color: 0x4a3d30 }));
    tankRoof.position.set(w / 2 - 2.2, h + 5.7, -(d / 2 - 2.2));
    g.add(tank, tankRoof);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 6, 6), plantM);
  mast.position.set(-(w / 2 - 1.2), h + 4, d / 2 - 1.2);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  light.position.set(-(w / 2 - 1.2), h + 7.1, d / 2 - 1.2);
  light.userData.phase = rnd() * 2;
  g.add(mast, light);
  return { group: g, height: h + 1, light };
}

/** Blink a scene's aviation lights (call once per frame). */
export function blinkLights(lights: THREE.Mesh[], t: number): void {
  for (const l of lights) l.visible = ((t + (l.userData.phase as number)) % 1.6) < 0.5;
}
