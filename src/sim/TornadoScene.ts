/* TornadoSim — procedural low-poly Three.js storm world (no downloads, offline-safe).
 *
 * Contents: terrain + roads, buildings (with collision circles), trees,
 * rotating funnel (2 counter-rotating lathes + dust ring + debris points),
 * wind particles, rain curtain, ground scar trail, drifting storm clouds,
 * lightning flashes + bolts, astronaut-like avatar (idle / walk / run /
 * jump), smooth follow camera, ground distance rings (100/200/300 m).
 */
import * as THREE from 'three';
import { clampToWorld, resolveCollisions, WORLD, WORLD_SCALE } from './stormTypes';
import { Npc, NPC_COUNT, NPC_NAMES, npcTierFor } from './npc';
import { AvatarAnimator, buildAvatarMesh, disposeAvatarBody, DEFAULT_AVATAR } from './avatar';
import { blinkLights, buildHouse, buildTower, PALETTES } from './packs/buildings';
import type { AvatarOptions } from './avatar';

export type SimQuality = 'low' | 'medium' | 'high';

export interface SimInput {
  x: number; // strafe right +
  z: number; // forward +
  run: boolean;
}

export interface SimSnapshot {
  x: number; z: number;
  yaw: number;
  distance: number;
  bearing: number;
  moving: boolean;
  speed: number;
  airborne: boolean;
  /** True while the funnel has picked the explorer up. */
  caught: boolean;
  /** NPC-driven vehicle currently swirling (explorer is free). */
  caughtRide: 'heli' | 'car' | null;
  /** Vehicle currently ridden, if any. */
  riding: 'heli' | 'car' | null;
  /** Vehicle within boarding range, if any. */
  nearVehicle: 'heli' | 'car' | null;
  /** Nearest talkable bystander within chat range, if any. */
  nearNpc: { name: string; dist: number } | null;
  /** Funnel (tornado) position in world space. */
  hazardX: number; hazardZ: number;
  /** Hazard kind label for the minimap event legend. */
  hazardKind: string; hazardLabel: string;
  /** Simulated ambient temperature in °C (cooler near/in the storm). */
  temperature: number;
}

type VehicleKind = 'heli' | 'car';

/** NPC joyrider: driver npc index, remaining time, wander target. */
interface Driver { npc: number; timer: number; tx: number; tz: number; retarget: number }

/** A rideable helicopter or car (several of each are parked around the town). */
interface Vehicle {
  kind: VehicleKind;
  group: THREE.Group;
  rotor: THREE.Object3D | null;
  wheels: THREE.Mesh[];
  x: number; z: number; y: number; yaw: number;
  homeX: number; homeZ: number; homeY: number; homeYaw: number;
  collider: { x: number; z: number; r: number };
  driver: Driver | null;
}

// Skid compensation so the upscaled helicopter still rests on the ground.
const HELI_GROUND_Y = -0.7;
const BOARD_RADIUS = 11;
/** Model offset: the upscaled copter's skids sit below its origin. */
const lift = (v: Vehicle) => (v.kind === 'heli' ? HELI_GROUND_Y : 0);

export const CATCH_RADIUS = 60; // yellow danger ring: entering it picks you up
const DESTROY_RADIUS = 30; // trees flattened / NPCs scattered inside this radius
const NPC_RESPAWN_S = 12;
const QUALITY: Record<SimQuality, { debris: number; wind: number; trees: number; pixelRatio: number }> = {
  low: { debris: 150, wind: 300, trees: 36, pixelRatio: 1 },
  medium: { debris: 300, wind: 650, trees: 70, pixelRatio: 1.5 },
  high: { debris: 520, wind: 1100, trees: 110, pixelRatio: 2 },
};

/** Deterministic PRNG so the town layout is identical every launch. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d3a2a'; g.fillRect(0, 0, 512, 512);
  const rnd = mulberry32(7);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${40 + rnd() * 40},${90 + rnd() * 50},${50 + rnd() * 30},0.5)`;
    g.fillRect(rnd() * 512, rnd() * 512, 3, 3);
  }
  // roads: cross through the map
  g.fillStyle = '#3a3f4a';
  g.fillRect(0, 236, 512, 40);
  g.fillRect(236, 0, 40, 512);
  g.fillStyle = '#c8b45a';
  for (let x = 8; x < 512; x += 32) g.fillRect(x, 254, 14, 4);
  for (let y = 8; y < 512; y += 32) g.fillRect(254, y, 4, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Spiral streaks for the condensation funnel; alpha thins toward the base,
 *  where the funnel is wrapped in dust rather than solid cloud. */
function funnelTexture(): THREE.CanvasTexture | null {
  const W = 256; const H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  const rnd = mulberry32(31);
  g.fillStyle = '#c9d4e6';
  g.fillRect(0, 0, W, H);
  // Helical bands: diagonal strokes, so scrolling u reads as rotation + rise.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const w = 4 + rnd() * 16;
    const shade = 120 + Math.floor(rnd() * 110);
    g.strokeStyle = `rgba(${shade - 30},${shade - 15},${shade + 10},${0.25 + rnd() * 0.35})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, -10);
    g.bezierCurveTo(x + 40, H * 0.3, x + 70, H * 0.7, x + 120, H + 10);
    g.stroke();
    // Wrap the band so the texture tiles around the funnel.
    g.beginPath();
    g.moveTo(x - W, -10);
    g.bezierCurveTo(x - W + 40, H * 0.3, x - W + 70, H * 0.7, x - W + 120, H + 10);
    g.stroke();
  }
  // Opacity: solid near the cloud (top of image), thinner toward the ground.
  const img = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const a = Math.round(255 * (0.97 - 0.32 * (y / H) ** 1.6));
    for (let x = 0; x < W; x++) img.data[(y * W + x) * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

export class TornadoSim {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private last = 0;
  private running = true;
  private disposed = false;

  private avatar = new THREE.Group();
  private anim!: AvatarAnimator;
  private prevX = 0; private prevZ = 0;
  private groundSpeed = 0;
  private funnelTex: THREE.CanvasTexture | null = null;
  private towerLights: THREE.Mesh[] = [];
  private funnelInnerTex: THREE.Texture | null = null;
  /** Undeformed funnel vertices, so the vortex can bend and sway each frame. */
  private funnelBase: { geo: THREE.BufferGeometry; base: Float32Array }[] = [];
  private bodyG!: THREE.Group;
  private funnel!: THREE.Group;
  private funnelOuter!: THREE.Mesh; private funnelInner!: THREE.Mesh;
  private dust!: THREE.Mesh;
  private debris!: THREE.Points; private debrisVel: Float32Array = new Float32Array(0);
  private windPts!: THREE.Points;
  private rain!: THREE.Points;
  private scarPool: THREE.Mesh[] = [];
  private scarIdx = 0;
  private lastScar = { x: 1e9, z: 1e9 };
  private floaters: { mesh: THREE.Mesh; angle: number; radius: number; speed: number; phase: number; tumble: number; yBase: number }[] = [];
  private lift = 0;
  private clouds: THREE.Mesh[] = [];
  private bolt: THREE.Line | null = null;
  private hemi!: THREE.HemisphereLight;
  private dir!: THREE.DirectionalLight;
  private flash = 0;
  // Transformer power flashes: roofs the funnel can blow past, plus the brief
  // blue-white burst placed at the nearest one (a classic tornado sign).
  private bldRoof: { x: number; y: number; z: number }[] = [];
  private powerMesh!: THREE.Mesh;
  private powerT = 3;
  private powerFlash = 0;

  private pos = new THREE.Vector3(0, 0, 200);
  private velY = 0;
  /** Standing on the ground or a rooftop (not mid-jump / falling). */
  private onGround = true;
  private yaw = 0; // avatar facing
  private camYaw = Math.PI; private camPitch = 0.32;
  private input: SimInput = { x: 0, z: 0, run: false };
  private jumpQueued = false;
  /** Jump held while flying the copter: climb. */
  private climb = false;
  private lightningT = 6;
  private intensity = 0.5;
  private windKmh = 130;
  private colliders: { x: number; z: number; r: number; top?: number }[] = [];
  /** Building footprints (axis-aligned) with their roof heights — helipads and walkable rooftops. */
  private roofs: { x: number; z: number; hx: number; hz: number; top: number }[] = [];
  private npcs: Npc[] = [];
  private npcsOn = true;
  private npcTier = 4;
  private npcDead: number[] = [];
  private talkingNpc: string | null = null;
  // Roaming funnel state (virtual meters from map center).
  private tx = 0;
  private tz = 0;
  private tAngle = 0.6;
  // Catch-and-fling flight state.
  private caught = false;
  private swirlA = 0;
  private swirlR = 0;
  private swirlH = 0;
  private caughtT = 0;
  /** An NPC-driven vehicle the funnel grabbed — swirls on its own, never moves the explorer. */
  private rideSwirl: { v: Vehicle; a: number; r: number; h: number; t: number } | null = null;
  // Tree destruction state.
  private treeTrunks: THREE.InstancedMesh | null = null;
  private treeLeaves: THREE.InstancedMesh | null = null;
  private treePos: { x: number; z: number }[] = [];
  private treeAlive: boolean[] = [];
  private treeRegrow: number[] = [];
  private dummy = new THREE.Object3D();
  private vehicles: Vehicle[] = [];
  private mounted: Vehicle | null = null;
  private reduceMotion: boolean;
  private quality: SimQuality;
  private onTick: (s: SimSnapshot) => void;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { quality?: SimQuality; reduceMotion?: boolean; onTick?: (s: SimSnapshot) => void } = {},
  ) {
    this.quality = opts.quality ?? 'medium';
    this.reduceMotion = opts.reduceMotion ?? false;
    this.onTick = opts.onTick ?? (() => undefined);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].pixelRatio));
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1200);
    this.scene.background = new THREE.Color(0x0a1428);
    this.scene.fog = new THREE.Fog(0x0a1428, 120, 620);
    this.buildWorld();
    this.npcTier = npcTierFor(this.quality);
    this.spawnNpcs();
    this.buildFloaters();
    this.resize();
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.running) this.update(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- construction ----------

  private buildWorld(): void {
    const q = QUALITY[this.quality];
    const rnd = mulberry32(42);

    this.hemi = new THREE.HemisphereLight(0x8fa3c7, 0x1a2b1f, 0.85);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xbfd4ff, 0.7);
    this.dir.position.set(120, 200, 60);
    this.scene.add(this.dir);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.halfSize * 2 + 80, WORLD.halfSize * 2 + 80),
      new THREE.MeshLambertMaterial({ map: groundTexture() }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Distance rings around tornado (100 / 200 / 300 m) — parented to the
    // funnel further down so they roam with it; see buildTornado().

    // Buildings: towers downtown, houses further out — kept off the roads,
    // away from the funnel plaza, and facing the nearest road.
    // The ground texture stretches with the grid, so the road half-width does too.
    const roadHalf = 24 * WORLD_SCALE;
    const town = Math.round(10 * WORLD_SCALE * WORLD_SCALE);
    let placed = 0;
    let guard = 0;
    while (placed < town && guard++ < town * 24) {
      const x = (rnd() * 2 - 1) * (WORLD.halfSize - 30);
      const z = (rnd() * 2 - 1) * (WORLD.halfSize - 30);
      if (Math.hypot(x, z) < 70) continue; // keep funnel plaza clear
      if (Math.abs(x) < roadHalf || Math.abs(z) < roadHalf) continue; // keep roads clear
      const w = 14 + rnd() * 14;
      const h = 10 + rnd() * 26;
      const tall = h > 20;
      const built = tall
        ? buildTower(rnd, { w, d: w, h, style: PALETTES.town[placed % PALETTES.town.length] })
        : buildHouse(rnd, { w, d: w * 0.8, h: Math.max(7, h * 0.55), style: PALETTES.coastal[placed % PALETTES.coastal.length] });
      built.group.position.set(x, 0, z);
      built.group.rotation.y = Math.abs(x) < Math.abs(z)
        ? (x > 0 ? -Math.PI / 2 : Math.PI / 2)
        : (z > 0 ? Math.PI : 0);
      this.scene.add(built.group);
      if (built.light) this.towerLights.push(built.light);
      const depth = tall ? w : w * 0.8;
      const turned = Math.abs(Math.sin(built.group.rotation.y)) > 0.5;
      this.roofs.push({ x, z, hx: (turned ? depth : w) / 2, hz: (turned ? w : depth) / 2, top: built.height });
      this.colliders.push({ x, z, r: w * 0.75 + 2, top: built.height });
      this.bldRoof.push({ x, y: built.height + 1, z });
      placed++;
    }

    // Emissive burst for transformer blow-outs when the funnel rips past.
    this.powerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0 }),
    );
    this.powerMesh.visible = false;
    this.scene.add(this.powerMesh);

    // Trees (instanced trunks + canopies) — count follows the bigger grid.
    const trees = Math.round(q.trees * WORLD_SCALE * WORLD_SCALE);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 4, 5);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
    const leafGeo = new THREE.ConeGeometry(3.2, 8, 6);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b3e });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, trees);
    const m = new THREE.Matrix4();
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < trees; i++) {
      let x = 0; let z = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = (rnd() * 2 - 1) * (WORLD.halfSize - 10);
        z = (rnd() * 2 - 1) * (WORLD.halfSize - 10);
        if (Math.hypot(x, z) > 55 && Math.abs(x) > roadHalf && Math.abs(z) > roadHalf) break;
      }
      m.makeTranslation(x, 2, z); trunks.setMatrixAt(i, m);
      m.makeTranslation(x, 8, z); leaves.setMatrixAt(i, m);
      trunks.setColorAt(i, white);
      leaves.setColorAt(i, white);
      this.treePos.push({ x, z });
      this.treeAlive.push(true);
      this.treeRegrow.push(0);
    }
    this.treeTrunks = trunks;
    this.treeLeaves = leaves;
    this.scene.add(trunks, leaves);

    this.buildTornado();
    this.buildAvatar();
    this.buildVehicles();
    this.buildParticles(q);
    this.buildClouds();
    this.buildRain();
    this.buildScars();
  }

  /** Rain curtain streaming down around the funnel (wraps within a radius). */
  private buildRain(): void {
    const q = QUALITY[this.quality];
    const rn = Math.floor(q.wind * 0.6);
    const pos = new Float32Array(rn * 3);
    const rnd = mulberry32(555);
    for (let i = 0; i < rn; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 30 + rnd() * 190;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rnd() * 60;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xa8c8e8, size: 0.9, transparent: true, opacity: 0.4 }));
    this.funnel.add(this.rain);
  }

  /** Dark ground scars left behind by the funnel's path. */
  private buildScars(): void {
    const rnd = mulberry32(313);
    for (let i = 0; i < 36; i++) {
      const scar = new THREE.Mesh(
        new THREE.CircleGeometry(9 + rnd() * 7, 12),
        new THREE.MeshBasicMaterial({ color: 0x120e0a, transparent: true, opacity: 0 }),
      );
      scar.rotation.x = -Math.PI / 2;
      scar.rotation.z = rnd() * Math.PI;
      scar.position.y = 0.08 + i * 0.0004;
      scar.visible = false;
      this.scarPool.push(scar);
      this.scene.add(scar);
    }
  }

  private buildTornado(): void {
    this.funnel = new THREE.Group();
    const profile: THREE.Vector2[] = [];
    // Condensation funnel: narrow where it touches down, flaring into the
    // wall cloud (radius grows ~quadratically with height).
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      profile.push(new THREE.Vector2(6 + t * t * 46, t * 130));
    }
    // Spiral streak texture: scrolling it around the funnel makes the spin read
    // clearly (a flat colour looks static however fast it turns).
    this.funnelTex = funnelTexture();
    const funnelMat = new THREE.MeshStandardMaterial({
      color: 0xb4c4de, map: this.funnelTex, transparent: true, opacity: 0.9,
      roughness: 0.95, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    this.funnelOuter = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), funnelMat);
    this.funnelInnerTex = this.funnelTex?.clone() ?? null;
    if (this.funnelInnerTex) this.funnelInnerTex.repeat.set(2, 1);
    this.funnelInner = new THREE.Mesh(
      new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p.x * 0.62, p.y)), 28),
      new THREE.MeshStandardMaterial({ color: 0x6a7fa6, map: this.funnelInnerTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.funnelOuter.renderOrder = 2;
    this.funnelInner.renderOrder = 1;
    // Rotating wall cloud the funnel hangs from.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(58, 74, 16, 36, 1),
      new THREE.MeshLambertMaterial({ color: 0x2c3448, transparent: true, opacity: 0.94 }),
    );
    wall.position.y = 134;
    wall.name = 'wallCloud';
    this.funnel.add(wall);
    this.funnel.add(this.funnelOuter, this.funnelInner);
    for (const m of [this.funnelOuter, this.funnelInner]) {
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      this.funnelBase.push({ geo: m.geometry, base: Float32Array.from(pos.array as Float32Array) });
    }
    // Debris cloud: the swirling skirt of dirt kicked up where the vortex
    // meets the ground — wider and denser than the funnel tip itself.
    const cloud = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 26, 14, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x7a6a4e, transparent: true, opacity: 0.5, roughness: 1, side: THREE.DoubleSide, depthWrite: false }),
    );
    cloud.position.y = 7;
    cloud.name = 'debrisCloud';
    this.funnel.add(cloud);
    // Dust ring at base
    this.dust = new THREE.Mesh(
      new THREE.RingGeometry(8, 42, 48),
      new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    this.dust.rotation.x = -Math.PI / 2;
    this.dust.position.y = 1;
    this.funnel.add(this.dust);
    // Distance rings roam with the funnel; the yellow ring marks the
    // catch zone — cross it and the funnel picks you up.
    for (const [r, color, opacity] of [
      [100, 0x22d3ee, 0.5],
      [200, 0xa78bfa, 0.5],
      [300, 0xfb7185, 0.5],
      [CATCH_RADIUS, 0xffd23f, 0.85],
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 1.2, r + 1.2, 96),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15;
      if (r === CATCH_RADIUS) ring.name = 'catchRing';
      this.funnel.add(ring);
    }
    this.scene.add(this.funnel);
  }

  private avatarOpts: AvatarOptions = { ...DEFAULT_AVATAR };
  private buildAvatar(): void {
    const b = buildAvatarMesh(this.avatarOpts);
    this.bodyG = b.body;
    this.anim = new AvatarAnimator(b);
    // blob shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    this.avatar.add(this.bodyG, shadow);
    this.avatar.position.copy(this.pos);
    this.scene.add(this.avatar);
  }

  /** Swap the explorer's look live (profile editor, presets). */
  setAvatar(o: AvatarOptions): void {
    this.avatarOpts = { ...o };
    if (!this.bodyG) return;
    disposeAvatarBody(this.bodyG);
    this.avatar.remove(this.bodyG);
    const b = buildAvatarMesh(this.avatarOpts);
    this.bodyG = b.body;
    this.anim.setRig(b);
    this.avatar.add(this.bodyG);
  }

  private buildParticles(q: (typeof QUALITY)[SimQuality]): void {
    // Debris orbiting the funnel
    const dn = q.debris;
    const dPos = new Float32Array(dn * 3);
    this.debrisVel = new Float32Array(dn * 2); // angle, radius, (height in y)
    const rnd = mulberry32(99);
    for (let i = 0; i < dn; i++) {
      this.debrisVel[i * 2] = rnd() * Math.PI * 2;
      this.debrisVel[i * 2 + 1] = 8 + rnd() * 40;
      dPos[i * 3 + 1] = rnd() * 70;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    this.debris = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xc9b78a, size: 1.1 }));
    this.funnel.add(this.debris);

    // Wind streaks across the whole field
    const wn = q.wind;
    const wPos = new Float32Array(wn * 3);
    for (let i = 0; i < wn; i++) {
      wPos[i * 3] = (rnd() * 2 - 1) * WORLD.halfSize;
      wPos[i * 3 + 1] = 1 + rnd() * 40;
      wPos[i * 3 + 2] = (rnd() * 2 - 1) * WORLD.halfSize;
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    this.windPts = new THREE.Points(wGeo, new THREE.PointsMaterial({ color: 0x9fd8e8, size: 0.7, transparent: true, opacity: 0.7 }));
    this.scene.add(this.windPts);
  }

  private buildClouds(): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a3350, transparent: true, opacity: 0.92 });
    const rnd = mulberry32(1234);
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(28 + rnd() * 30, 10, 8), mat);
      const a = (i / 12) * Math.PI * 2;
      c.position.set(Math.cos(a) * (180 + rnd() * 160), 95 + rnd() * 45, Math.sin(a) * (180 + rnd() * 160));
      c.scale.y = 0.42;
      this.clouds.push(c);
      this.scene.add(c);
    }
  }

  // ---------- public control ----------

  setInput(i: SimInput): void { this.input = i; }
  queueJump(): void { this.jumpQueued = true; }
  setClimb(on: boolean): void { this.climb = on; }
  addCameraOrbit(dx: number, dy: number): void {
    this.camYaw -= dx * 0.005;
    // Negative pitch drops the camera and lifts the look point: drag up to
    // take in the funnel and the cloud deck, drag down to study the ground.
    this.camPitch = Math.min(1.15, Math.max(-1, this.camPitch + dy * 0.004));
  }
  setStorm(intensity: number, windKmh: number): void {
    this.intensity = Math.min(1, Math.max(0, intensity));
    this.windKmh = windKmh;
  }
  setPaused(paused: boolean): void {
    this.running = !paused;
    this.last = performance.now();
  }
  reset(spawnDistance = 200): void {
    this.pos.set(0, 0, spawnDistance);
    this.velY = 0;
    // Start behind the explorer, looking at the funnel (which resets to 0, 0).
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.tx = 0; this.tz = 0; this.tAngle = 0.6;
    this.funnel.position.set(0, 0, 0);
    this.caught = false;
    this.rideSwirl = null;
    this.lift = 0;
    this.avatar.rotation.x = 0;
    this.avatar.rotation.z = 0;
    this.mounted = null;
    this.avatar.visible = true;
    for (const v of this.vehicles) {
      if (v.driver) this.npcs[v.driver.npc].place(v.homeX + 5, v.homeZ + 5);
      v.driver = null;
    }
    this.scarIdx = 0;
    this.lastScar = { x: 1e9, z: 1e9 };
    for (const s of this.scarPool) {
      s.visible = false;
      (s.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    this.applyNpcVisibility();
    for (const v of this.vehicles) {
      v.x = v.homeX; v.z = v.homeZ; v.y = v.homeY; v.yaw = v.homeYaw;
      v.group.position.set(v.x, v.y + lift(v), v.z);
      v.group.rotation.set(0, v.yaw, 0);
      v.collider.x = v.x; v.collider.z = v.z;
    }
  }
  setQuality(qn: SimQuality): void {
    if (qn === this.quality) return;
    this.quality = qn;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[qn].pixelRatio));
    // Rebuild particle systems at the new density (cheap, runs rarely).
    this.funnel.remove(this.debris);
    this.scene.remove(this.windPts);
    this.funnel.remove(this.rain);
    this.debris.geometry.dispose();
    this.windPts.geometry.dispose();
    this.rain.geometry.dispose();
    this.buildParticles(QUALITY[qn]);
    this.buildRain();
    this.npcTier = npcTierFor(qn);
    this.applyNpcVisibility();
  }
  /** Bystander NPCs: wander, keep clear of buildings, flee the funnel. */
  private spawnNpcs(): void {
    for (let i = 0; i < NPC_COUNT; i++) {
      // Spawn in pairs (friends wander together and soon strike up a chat).
      const pair = Math.floor(i / 2);
      const a = (pair / Math.ceil(NPC_COUNT / 2)) * Math.PI * 2 + 0.4;
      const r = 110 + (pair % 3) * 35;
      const npc = new Npc(2000 + i * 77,
        Math.cos(a) * r + (i % 2) * 6, Math.sin(a) * r);
      npc.name = NPC_NAMES[(i * 7) % NPC_NAMES.length];
      this.npcs.push(npc);
      this.npcDead.push(0);
      this.scene.add(npc.group);
    }
    this.applyNpcVisibility();
  }

  private applyNpcVisibility(): void {
    this.npcs.forEach((n, i) => { n.group.visible = this.npcsOn && i < this.npcTier; });
  }

  setNpcs(on: boolean): void {
    this.npcsOn = on;
    this.applyNpcVisibility();
  }

  /** Freeze the named bystander while the visitor chats — they stop and face you. */
  setNpcTalking(name: string | null): void {
    this.talkingNpc = name;
  }

  /** Screen-space anchors (CSS px relative to the canvas) above a bystander's head and at their feet. */
  npcAnchor(name: string): { head: { x: number; y: number }; feet: { x: number; y: number } } | null {
    const npc = this.npcs.find((n) => n.name === name);
    if (!npc || !npc.group.visible) return null;
    const el = this.renderer.domElement;
    const toScreen = (dy: number) => {
      const v = new THREE.Vector3(npc.group.position.x, npc.group.position.y + dy, npc.group.position.z);
      if (v.applyMatrix4(this.camera.matrixWorldInverse).z > -0.2) return null;
      v.project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight };
    };
    const head = toScreen(1.9);
    const feet = toScreen(0.08);
    if (!head || !feet) return null;
    return { head, feet };
  }

  /** Flatten trees inside the funnel's path; they regrow after a minute. */
  private updateTrees(dt: number): void {
    if (!this.treeTrunks || !this.treeLeaves) return;
    const brown = new THREE.Color(0x4a3826);
    const dryLeaf = new THREE.Color(0x6b4f28);
    const white = new THREE.Color(0xffffff);
    let dirty = false;
    for (let i = 0; i < this.treePos.length; i++) {
      const tp = this.treePos[i];
      const d = Math.hypot(tp.x - this.tx, tp.z - this.tz);
      if (this.treeAlive[i] && d < DESTROY_RADIUS) {
        this.treeAlive[i] = false;
        this.treeRegrow[i] = 60;
        this.dummy.position.set(tp.x, 0.6, tp.z);
        this.dummy.rotation.set(0.2, 0, 1.35);
        this.dummy.scale.set(1, 0.25, 1);
        this.dummy.updateMatrix();
        this.treeTrunks.setMatrixAt(i, this.dummy.matrix);
        this.dummy.position.set(tp.x, 1.2, tp.z);
        this.dummy.updateMatrix();
        this.treeLeaves.setMatrixAt(i, this.dummy.matrix);
        this.treeTrunks.setColorAt(i, brown);
        this.treeLeaves.setColorAt(i, dryLeaf);
        dirty = true;
      } else if (!this.treeAlive[i]) {
        this.treeRegrow[i] -= dt;
        if (this.treeRegrow[i] <= 0) {
          this.treeAlive[i] = true;
          this.dummy.position.set(tp.x, 2, tp.z);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          this.treeTrunks.setMatrixAt(i, this.dummy.matrix);
          this.dummy.position.set(tp.x, 8, tp.z);
          this.dummy.updateMatrix();
          this.treeLeaves.setMatrixAt(i, this.dummy.matrix);
          this.treeTrunks.setColorAt(i, white);
          this.treeLeaves.setColorAt(i, white);
          dirty = true;
        }
      }
    }
    if (dirty) {
      this.treeTrunks.instanceMatrix.needsUpdate = true;
      this.treeLeaves.instanceMatrix.needsUpdate = true;
      if (this.treeTrunks.instanceColor) this.treeTrunks.instanceColor.needsUpdate = true;
      if (this.treeLeaves.instanceColor) this.treeLeaves.instanceColor.needsUpdate = true;
    }
  }

  /** Solid props (planks, crates, wreckage) caught swirling in the funnel. */
  private buildFloaters(): void {
    const rnd = mulberry32(777);
    const mats = [0x8a6a45, 0x6b4a35, 0x9aa0ad, 0xb03a3a, 0x3a6ab0, 0x5a5f6a]
      .map((c) => new THREE.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < 16; i++) {
      const plank = rnd() < 0.5;
      const w = plank ? 2 + rnd() * 3 : 1 + rnd() * 1.6;
      const h = plank ? 0.5 + rnd() * 0.6 : 1 + rnd() * 2;
      const d = plank ? 0.5 + rnd() * 0.8 : 1 + rnd() * 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[i % mats.length]);
      this.funnel.add(mesh);
      this.floaters.push({
        mesh,
        angle: rnd() * Math.PI * 2,
        radius: 14 + rnd() * 24,
        speed: 0.9 + rnd() * 1.2,
        phase: rnd() * Math.PI * 2,
        tumble: 1 + rnd() * 2.5,
        yBase: 4 + rnd() * 40,
      });
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Rideable helicopters + cars: parked by the spawn, around town and on a rooftop helipad. */
  private buildVehicles(): void {
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1e33, roughness: 0.15, metalness: 0.6 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
    // Nudge a parking spot clear of buildings, trees and other vehicles.
    const clear = (x: number, z: number): { x: number; z: number } => {
      for (let k = 0; k < 24; k++) {
        const blocked = this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 6)
          || this.vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < 14);
        if (!blocked) break;
        x += 9 * Math.cos(k * 1.7); z += 9 * Math.sin(k * 1.7);
      }
      return { x, z };
    };
    const add = (v: Omit<Vehicle, 'homeX' | 'homeZ' | 'homeY' | 'homeYaw' | 'collider' | 'driver'>) => {
      const full: Vehicle = { ...v, homeX: v.x, homeZ: v.z, homeY: v.y, homeYaw: v.yaw, collider: { x: v.x, z: v.z, r: 5 }, driver: null };
      full.group.position.set(v.x, v.y + lift(full), v.z);
      full.group.rotation.y = v.yaw;
      this.scene.add(full.group);
      // Rooftop copters aren't ground obstacles.
      if (v.y === 0) this.colliders.push(full.collider);
      this.vehicles.push(full);
    };

    // --- Helicopters (face +z at yaw 0) ---
    const heli = (color: number, x: number, z: number, y = 0, yaw = 0) => {
      const hg = new THREE.Group();
      const hullMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 3, 4, 10), hullMat);
      body.rotation.x = Math.PI / 2;
      body.position.y = 2.2;
      const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 10), glassMat);
      cockpit.position.set(0, 2.4, 1.9);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 5.5, 8), hullMat);
      boom.rotation.x = Math.PI / 2;
      boom.position.set(0, 2.5, -4.2);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.9), hullMat);
      fin.position.set(0, 3.1, -6.8);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.1, 8), darkMat);
      mast.position.y = 3.9;
      const rotor = new THREE.Group();
      const bladeGeo = new THREE.BoxGeometry(9.5, 0.12, 0.7);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1c2027 });
      const b1 = new THREE.Mesh(bladeGeo, bladeMat);
      const b2 = new THREE.Mesh(bladeGeo, bladeMat);
      b2.rotation.y = Math.PI / 2;
      rotor.add(b1, b2);
      rotor.position.y = 4.5;
      for (const sx of [-1.4, 1.4]) {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4.2), darkMat);
        skid.position.set(sx, 0.55, 0.4);
        hg.add(skid);
      }
      hg.add(body, cockpit, boom, fin, mast, rotor);
      hg.scale.setScalar(1.6);
      const p = y > 0 ? { x, z } : clear(x, z);
      add({ kind: 'heli', group: hg, rotor, wheels: [], x: p.x, z: p.z, y, yaw });
    };

    // --- Cars ---
    const car = (color: number, x: number, z: number, yaw = 0) => {
      const cg = new THREE.Group();
      const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      const bodyC = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 6.5), paintMat);
      bodyC.position.y = 1.15;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 3.2), glassMat);
      cabin.position.set(0, 2.15, -0.3);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
      const wheels: THREE.Mesh[] = [];
      const wheelGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.6, 12);
      for (const [wx, wz] of [[-1.7, 2.2], [1.7, 2.2], [-1.7, -2.2], [1.7, -2.2]] as const) {
        const wheel = new THREE.Mesh(wheelGeo, darkMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.7, wz);
        wheels.push(wheel);
        cg.add(wheel);
      }
      for (const hx of [-1.1, 1.1]) {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), lightMat);
        head.position.set(hx, 1.1, 3.3);
        cg.add(head);
      }
      cg.add(bodyC, cabin);
      cg.scale.setScalar(1.5);
      const p = clear(x, z);
      add({ kind: 'car', group: cg, rotor: null, wheels, x: p.x, z: p.z, y: 0, yaw });
    };

    heli(0xe8641f, 28, 225);                 // orange, by the spawn
    car(0xb03a3a, -28, 225);                 // red, by the spawn
    heli(0x2563eb, 95, 170, 0, -0.8);        // blue, east field
    car(0x2f6fd1, -60, 200, 0.6);            // blue
    car(0xe0b324, 70, 245, -1.2);            // yellow
    // One copter waits on the tallest rooftop helipad.
    const pad = [...this.roofs].sort((a, b) => b.top - a.top)[0];
    if (pad) heli(0x16a34a, pad.x, pad.z, pad.top, 0.4);
    else heli(0x16a34a, -110, 150);
  }

  /** Nearest boardable vehicle (not NPC-driven), or null. */
  private nearestFreeVehicle(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = BOARD_RADIUS;
    for (const v of this.vehicles) {
      if (v.driver) continue;
      // Copters: same level (ground or the rooftop it sits on). Cars: on the ground.
      if (v.kind === 'heli' ? Math.abs(this.pos.y - v.y) >= 6 : this.pos.y >= 3) continue;
      const d = Math.hypot(this.pos.x - v.x, this.pos.z - v.z);
      if (d < bestD) { best = v; bestD = d; }
    }
    return best;
  }

  /** Kind of the nearest boardable vehicle, or null. */
  nearVehicle(): VehicleKind | null {
    return this.nearestFreeVehicle()?.kind ?? null;
  }

  /** Board a nearby vehicle, or dismount the current one. Returns what's ridden now. */
  tryToggleMount(): VehicleKind | null {
    if (this.mounted) {
      const v = this.mounted;
      const roof = v.kind === 'heli' ? this.roofAt(v.x, v.z) : 0;
      if (roof > 0 && v.y <= roof + 1) {
        // Landed on a rooftop: step out onto the roof beside the copter.
        const a = v.yaw + Math.PI / 2;
        const r = this.roofUnder(v.x, v.z);
        const sx = r ? Math.min(r.x + r.hx - 1, Math.max(r.x - r.hx + 1, v.x + Math.cos(a) * 4)) : v.x;
        const sz = r ? Math.min(r.z + r.hz - 1, Math.max(r.z - r.hz + 1, v.z + Math.sin(a) * 4)) : v.z;
        this.pos.set(sx, roof, sz);
      } else {
        const a = v.yaw + Math.PI / 2;
        const p = resolveCollisions(
          clampToWorld({ x: v.x + Math.cos(a) * 6, z: v.z + Math.sin(a) * 6 }),
          this.colliders,
        );
        this.pos.set(p.x, 0, p.z);
      }
      this.velY = 0;
      this.mounted = null;
      this.avatar.visible = true;
      this.caught = false;
      this.avatar.rotation.x = 0;
      return null;
    }
    const near = this.nearestFreeVehicle();
    if (near) {
      this.mounted = near;
      this.avatar.visible = false;
      this.caught = false;
      this.avatar.rotation.x = 0;
      this.pos.set(near.x, near.kind === 'heli' ? near.y : 0, near.z);
      return near.kind;
    }
    return null;
  }

  /** The building footprint containing (x, z), if any. */
  private roofUnder(x: number, z: number): { x: number; z: number; hx: number; hz: number; top: number } | null {
    for (const r of this.roofs) {
      if (Math.abs(x - r.x) <= r.hx && Math.abs(z - r.z) <= r.hz) return r;
    }
    return null;
  }

  /** Roof height under (x, z), or 0 over open ground. */
  private roofAt(x: number, z: number): number {
    return this.roofUnder(x, z)?.top ?? 0;
  }

  /** Is bystander `i` currently driving a vehicle? */
  private isDriving(i: number): boolean {
    return this.vehicles.some((v) => v.driver?.npc === i);
  }

  /** NPC joyriders: nearby bystanders board free vehicles, joyride, hop out. */
  private updateDrivers(dt: number): void {
    for (const v of this.vehicles) this.driveNpcVehicle(v, dt);
    this.tryNpcBoard();
  }

  private tryNpcBoard(): void {
    // Leave most vehicles parked for the visitor: at most two joyrides at once.
    if (this.vehicles.filter((v) => v.driver).length >= 2) return;
    for (const v of this.vehicles) {
      if (v.driver || v === this.mounted) continue;
      for (let i = 0; i < this.npcs.length; i++) {
        const npc = this.npcs[i];
        if (!npc.group.visible || this.isDriving(i)) continue;
        if (Math.abs(npc.group.position.y - v.y) > 4) continue; // can't reach a rooftop copter
        const dx = npc.group.position.x - v.x;
        const dz = npc.group.position.z - v.z;
        if (Math.hypot(dx, dz) < 14) {
          npc.group.visible = false;
          v.driver = { npc: i, timer: 15 + Math.random() * 15, tx: v.x, tz: v.z, retarget: 0 };
          return;
        }
      }
    }
  }

  /** Nearest visible, non-driving bystander within chat range (12 m). */
  nearestNpc(range = 12): { name: string; dist: number } | null {
    let best: { name: string; dist: number } | null = null;
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (!npc.group.visible) continue;
      if (this.isDriving(i)) continue;
      const d = Math.hypot(npc.group.position.x - this.pos.x, npc.group.position.z - this.pos.z);
      if (d <= range && (!best || d < best.dist)) best = { name: npc.name, dist: d };
    }
    return best;
  }

  /** All bystander NPCs with position + state for the minimap. */
  getNpcs(): { x: number; z: number; name: string; state: 'wandering' | 'fleeing' | 'driving' }[] {
    const out: { x: number; z: number; name: string; state: 'wandering' | 'fleeing' | 'driving' }[] = [];
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (!npc.group.visible) continue;
      let state: 'wandering' | 'fleeing' | 'driving' = 'wandering';
      if (this.isDriving(i)) state = 'driving';
      else {
        const ndx = npc.group.position.x - this.tx;
        const ndz = npc.group.position.z - this.tz;
        if (Math.hypot(ndx, ndz) < 110) state = 'fleeing';
      }
      out.push({ x: npc.group.position.x, z: npc.group.position.z, name: npc.name, state });
    }
    return out;
  }

  private driveNpcVehicle(v: Vehicle, dt: number): void {
    const drv = v.driver;
    if (!drv) return;
    // While the funnel is flinging it the driver just holds on (no bail-out, no steering).
    if (this.rideSwirl?.v === v) return;
    drv.timer -= dt;
    drv.retarget -= dt;
    if (drv.timer <= 0) {
      const npc = this.npcs[drv.npc];
      npc.place(
        Math.min(WORLD.halfSize, Math.max(-WORLD.halfSize, v.x + 5)),
        Math.min(WORLD.halfSize, Math.max(-WORLD.halfSize, v.z + 5)),
      );
      npc.group.visible = this.npcsOn && drv.npc < this.npcTier;
      v.driver = null;
      return;
    }
    const dx = drv.tx - v.x;
    const dz = drv.tz - v.z;
    if (Math.hypot(dx, dz) < 10 || drv.retarget <= 0) {
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 120;
      drv.tx = Math.cos(a) * r;
      drv.tz = Math.sin(a) * r;
      drv.retarget = 6 + Math.random() * 8;
      return;
    }
    const d = Math.hypot(dx, dz) || 1;
    const spd = v.kind === 'heli' ? 14 : 16;
    const next = clampToWorld({ x: v.x + (dx / d) * spd * dt, z: v.z + (dz / d) * spd * dt });
    const fixed = v.kind === 'heli'
      ? next   // airborne: straight over / through buildings
      : resolveCollisions(next, this.colliders.filter((c) => c !== v.collider));
    v.x = fixed.x; v.z = fixed.z;
    v.collider.x = v.x; v.collider.z = v.z;
    const targetYaw = Math.atan2(dx, dz);
    let dy = targetYaw - v.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    v.yaw += dy * Math.min(1, dt * 5);
    if (v.kind === 'heli') {
      v.y += (Math.max(14, this.roofAt(v.x, v.z) + 8) - v.y) * Math.min(1, dt * 1.2);
    } else {
      v.y = Math.max(0, v.y - 22 * dt);
      for (const w of v.wheels) w.rotation.x += dt * 8;
    }
    v.group.position.set(v.x, v.y + lift(v), v.z);
    v.group.rotation.y = v.yaw;
  }

  /** Swirl (then fling) an NPC-driven vehicle the funnel grabbed. Never touches the explorer. */
  private updateRideSwirl(dt: number, nowMs: number): void {
    if (!this.rideSwirl) {
      for (const v of this.vehicles) {
        if (!v.driver) continue;
        const gdx = v.x - this.tx; const gdz = v.z - this.tz;
        const gdist = Math.hypot(gdx, gdz);
        if (gdist < CATCH_RADIUS) {
          this.rideSwirl = { v, a: Math.atan2(-gdz, gdx), r: Math.max(10, gdist), h: v.y, t: 0 };
          break;
        }
      }
      if (!this.rideSwirl) return;
    }
    const s = this.rideSwirl;
    const v = s.v;
    s.t += dt;
    s.a += dt * (2.2 + this.intensity * 2.6);
    s.r += (16 - s.r) * Math.min(1, dt * 0.8);
    s.h += (26 + this.intensity * 22 - s.h) * Math.min(1, dt * 1.2);
    if (s.t > 9) {
      // Flung clear; the shaken driver lands and carries on.
      const fx = this.tx + Math.cos(s.a) * 95;
      const fz = this.tz - Math.sin(s.a) * 95;
      v.x = fx; v.z = fz; v.y = 6;
      v.group.position.set(fx, 6 + lift(v), fz);
      v.group.rotation.x = 0;
      this.rideSwirl = null;
      return;
    }
    const px = this.tx + Math.cos(s.a) * s.r;
    const pz = this.tz - Math.sin(s.a) * s.r;
    const py = Math.max(0, s.h + Math.sin(nowMs / 300) * 2);
    v.x = px; v.z = pz; v.y = py;
    v.group.position.set(px, py + lift(v), pz);
    v.group.rotation.x += dt * 4;
    v.collider.x = px; v.collider.z = pz;
  }

  /** On-foot step with collisions + facing. Returns true (moving). */
  private moveOnFoot(wish: { x: number; z: number }, len: number, speed: number, dt: number): boolean {
    const nx = this.pos.x + (wish.x / len) * speed * dt;
    const nz = this.pos.z + (wish.z / len) * speed * dt;
    const solid = this.pos.y > 0.5
      ? this.colliders.filter((c) => c.top == null || this.pos.y < c.top - 0.6)
      : this.colliders;
    const fixed = resolveCollisions(clampToWorld({ x: nx, z: nz }), solid);
    this.pos.x = fixed.x; this.pos.z = fixed.z;
    const targetYaw = Math.atan2(wish.x, wish.z);
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 10);
    return true;
  }

  // ---------- simulation ----------

  private update(dt: number): void {
    const speedScale = this.reduceMotion ? 0.6 : 1;
    const nowMs = performance.now();

    // Roaming funnel: slow wander, steering home near the map edge.
    const roamSpeed = (5 + this.intensity * 9) * (this.reduceMotion ? 0.5 : 1);
    this.tAngle += dt * 0.3 * Math.sin(nowMs / 7000);
    this.tx += Math.cos(this.tAngle) * roamSpeed * dt;
    this.tz += Math.sin(this.tAngle * 0.8) * roamSpeed * dt;
    if (Math.hypot(this.tx, this.tz) > 130) {
      this.tAngle = Math.atan2(-this.tz, -this.tx) + (Math.random() - 0.5) * 0.6;
      this.tx = Math.min(140, Math.max(-140, this.tx));
      this.tz = Math.min(140, Math.max(-140, this.tz));
    }
    this.funnel.position.set(this.tx, 0, this.tz);

    // Movement (camera-relative)
    const fwd = { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
    const right = { x: -fwd.z, z: fwd.x };
    const wish = {
      x: right.x * this.input.x + fwd.x * this.input.z,
      z: right.z * this.input.x + fwd.z * this.input.z,
    };
    const speed = this.input.run ? WORLD.runSpeed : WORLD.walkSpeed;
    const len = Math.hypot(wish.x, wish.z);
    let moving = false;
    const turnTo = (current: number, tx: number, tz: number, rate: number, dt2: number): number => {
      const targetYaw = Math.atan2(tx, tz);
      let dd = targetYaw - current;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      return current + dd * Math.min(1, dt2 * rate);
    };
    const mv = this.mounted;
    if (mv?.kind === 'car' && !this.caught) {
      moving = len > 0.01;
      this.jumpQueued = false;
      if (moving) {
        const nx = mv.x + (wish.x / len) * 30 * dt;
        const nz = mv.z + (wish.z / len) * 30 * dt;
        const others = this.colliders.filter((c) => c !== mv.collider);
        const fixed = resolveCollisions(clampToWorld({ x: nx, z: nz }), others);
        mv.x = fixed.x; mv.z = fixed.z;
        mv.yaw = turnTo(mv.yaw, wish.x / len, wish.z / len, 8, dt);
      }
      // A flung car falls back to earth.
      mv.y = Math.max(0, mv.y - 22 * dt);
      mv.collider.x = mv.x;
      mv.collider.z = mv.z;
      mv.group.position.set(mv.x, mv.y, mv.z);
      mv.group.rotation.y = mv.yaw;
      for (const w of mv.wheels) w.rotation.x += dt * (moving ? 14 : 0);
      this.pos.set(mv.x, mv.y, mv.z);
      this.yaw = mv.yaw;
    } else if (mv?.kind === 'heli' && !this.caught) {
      moving = len > 0.01;
      this.jumpQueued = false;
      if (moving) {
        // Airborne: the copter passes over / through buildings — no ground colliders.
        const fixed = clampToWorld({ x: mv.x + (wish.x / len) * 24 * dt, z: mv.z + (wish.z / len) * 24 * dt });
        mv.x = fixed.x; mv.z = fixed.z;
        mv.yaw = turnTo(mv.yaw, wish.x / len, wish.z / len, 6, dt);
      }
      // Hold Jump/Space to climb. Cruising, it hovers a few metres above
      // whatever is below; let go of the stick and it settles down to land —
      // on the ground or on a rooftop helipad.
      const below = this.roofAt(mv.x, mv.z);
      const targetY = this.climb ? Math.max(34, below + 12) : moving ? Math.max(9, below + 6) : below;
      mv.y += (targetY - mv.y) * Math.min(1, dt * (moving || this.climb ? 1.5 : 1.1));
      if (!moving && !this.climb && Math.abs(mv.y - below) < 0.15) mv.y = below;
      mv.collider.x = mv.x;
      mv.collider.z = mv.z;
      mv.group.position.set(mv.x, mv.y + HELI_GROUND_Y, mv.z);
      mv.group.rotation.y = mv.yaw;
      mv.group.rotation.x = moving ? 0.16 : 0;
      this.pos.set(mv.x, mv.y, mv.z);
      this.yaw = mv.yaw;
    } else if (this.caught) {
      // Caught: swirl around the funnel — you, or the vehicle you ride.
      // Struggle outward to break free, or ride it out and get flung clear.
      moving = true;
      const rdx = this.pos.x - this.tx;
      const rdz = this.pos.z - this.tz;
      const rd = Math.hypot(rdx, rdz) || 1;
      const outward = (wish.x * rdx + wish.z * rdz) / rd;
      this.swirlR += outward * 14 * dt;
      this.caughtT += dt;
      this.swirlA += dt * (2.2 + this.intensity * 2.6);
      this.swirlR += (16 - this.swirlR) * Math.min(1, dt * 0.8);
      this.swirlH += (26 + this.intensity * 22 - this.swirlH) * Math.min(1, dt * 1.2);
      const px = this.tx + Math.cos(this.swirlA) * this.swirlR;
      const pz = this.tz - Math.sin(this.swirlA) * this.swirlR;
      const py = Math.max(0, this.swirlH + Math.sin(nowMs / 300) * 2);
      if (mv) {
        mv.x = px; mv.z = pz; mv.y = py;
        mv.group.position.set(px, py + lift(mv), pz);
        mv.group.rotation.x += dt * 4;
      }
      this.pos.set(px, py, pz);
      this.jumpQueued = false;
      this.velY = 0;
      if (this.swirlR > CATCH_RADIUS + 8 || this.caughtT > 9) {
        // Escape: struggled out, or timed out and flung clear.
        const flung = this.caughtT > 9;
        const fr = flung ? 95 : this.swirlR + 4;
        const fx = this.tx + Math.cos(this.swirlA) * fr;
        const fz = this.tz - Math.sin(this.swirlA) * fr;
        const fy = flung ? 6 : py * 0.5;
        if (mv) {
          mv.x = fx; mv.z = fz; mv.y = fy;
          mv.group.position.set(fx, fy + lift(mv), fz);
          mv.group.rotation.x = 0;
        } else {
          this.velY = flung ? 3 : 0;
        }
        this.pos.set(fx, fy, fz);
        this.caught = false;
        this.avatar.rotation.x = 0;
      } else if (!mv) {
        this.avatar.rotation.x += dt * 5; // tumbling ride
      }
    } else if (len > 0.01) {
      moving = this.moveOnFoot(wish, len, speed, dt);
    }
    // Crossed the yellow ring — on foot or riding? The funnel picks you up.
    if (!this.caught) {
      const gdx = this.pos.x - this.tx;
      const gdz = this.pos.z - this.tz;
      const gdist = Math.hypot(gdx, gdz);
      if (gdist < CATCH_RADIUS) {
        this.caught = true;
        this.caughtT = 0;
        this.swirlA = Math.atan2(-gdz, gdx);
        this.swirlR = Math.max(10, gdist);
        this.swirlH = this.pos.y;
        this.velY = 0;
      }
    }
    // An NPC-driven vehicle that blunders in swirls on its own track.
    this.updateRideSwirl(dt, nowMs);
    // Rotors idle on the pad, scream in the air.
    for (const v of this.vehicles) if (v.rotor) v.rotor.rotation.y += dt * (v === this.mounted || v.driver ? 22 : 2.5);
    // Jump / gravity (suspended while caught — the funnel has you — or driving).
    if (!this.caught && !this.mounted) {
      // Floor is the roof you're standing on (if you're up there), else the ground.
      const roof = this.roofAt(this.pos.x, this.pos.z);
      const floor = this.pos.y >= roof - 0.6 ? roof : 0;
      if (this.jumpQueued) {
        this.jumpQueued = false;
        if (this.pos.y <= floor + 0.01) this.velY = 7;
      }
      if (this.pos.y > floor || this.velY !== 0) {
        this.velY -= 22 * dt;
        this.pos.y = Math.max(floor, this.pos.y + this.velY * dt);
        if (this.pos.y === floor) this.velY = 0;
      }
      this.onGround = this.pos.y <= floor + 0.05 && this.velY === 0;
    } else {
      this.jumpQueued = false;
      this.onGround = true;
    }

    // Avatar animation from the ground speed actually achieved; flail while
    // caught, brace (lean into the wind) when the funnel is close.
    const moved = Math.hypot(this.pos.x - this.prevX, this.pos.z - this.prevZ) / Math.max(1e-4, dt);
    this.prevX = this.pos.x; this.prevZ = this.pos.z;
    this.groundSpeed += (Math.min(moved, WORLD.runSpeed * 1.2) - this.groundSpeed) * Math.min(1, dt * 12);
    const nearFunnel = Math.max(0, 1 - Math.hypot(this.pos.x - this.tx, this.pos.z - this.tz) / 140);
    this.anim.update({
      dt, t: nowMs / 1000,
      speed: moving && !this.caught && !this.mounted ? this.groundSpeed : 0,
      airborne: !this.caught && !this.mounted && !this.onGround,
      velY: this.velY,
      flail: this.caught && !this.mounted,
      ride: !!this.mounted && !this.caught,
      panic: nearFunnel * this.intensity,
    });
    this.avatar.position.copy(this.pos);
    this.avatar.rotation.y = this.yaw;

    // Funnel lift: the explorer floats when very close (but not caught —
    // then the swirl above owns the altitude).
    const pdist = Math.hypot(this.pos.x - this.tx, this.pos.z - this.tz);
    const liftTarget = !this.caught && pdist < 70 ? (1 - pdist / 70) * 8 : 0;
    this.lift += (liftTarget - this.lift) * Math.min(1, dt * 2.5);
    this.avatar.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
    this.avatar.rotation.z = !this.reduceMotion && this.lift > 0.3
      ? Math.sin(nowMs / 130) * 0.09 * Math.min(1, this.lift / 4)
      : 0;

    // Bystanders: wander, flee the funnel — destroyed if it runs them over.
    // (Drivers stay posed inside their vehicles; see updateDrivers.)
    this.updateDrivers(dt);
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (this.isDriving(i)) continue;
      if (!npc.group.visible) {
        this.npcDead[i] -= dt;
        if (this.npcDead[i] <= 0) {
          const a = Math.random() * Math.PI * 2;
          npc.place(Math.cos(a) * 190, Math.sin(a) * 190);
          npc.group.visible = this.npcsOn && i < this.npcTier;
        }
        continue;
      }
      const ndx = npc.group.position.x - this.tx;
      const ndz = npc.group.position.z - this.tz;
      if (Math.hypot(ndx, ndz) < DESTROY_RADIUS) {
        npc.group.visible = false;
        this.npcDead[i] = NPC_RESPAWN_S;
        continue;
      }
      if (this.talkingNpc && npc.name === this.talkingNpc) {
        npc.faceToward(this.pos.x, this.pos.z, dt, nowMs / 1000);
        continue;
      }
      npc.update(dt, nowMs / 1000, WORLD.halfSize, this.colliders, { x: this.tx, z: this.tz }, { x: this.pos.x, z: this.pos.z }, this.npcs);
    }

    // Trees: flattened in the funnel's path, regrowing after a minute.
    this.updateTrees(dt);
    blinkLights(this.towerLights, nowMs / 1000);

    // Tornado rotation + breathing
    // The whole vortex turns the same way (cyclonic, counter-clockwise from
    // above); the tighter core spins faster, as angular speed rises inward.
    const spin = (1.2 + this.intensity * 5) * speedScale;
    this.funnelOuter.rotation.y += dt * spin;
    this.funnelInner.rotation.y += dt * spin * 1.7;
    this.dust.rotation.z += dt * spin * 0.5;
    // Streaks race round the funnel (and slowly climb, like rising condensation).
    if (this.funnelTex) {
      this.funnelTex.offset.x -= dt * spin * 0.12;
      this.funnelTex.offset.y -= dt * (0.02 + this.intensity * 0.05) * speedScale;
    }
    if (this.funnelInnerTex) {
      this.funnelInnerTex.offset.x -= dt * spin * 0.2;
      this.funnelInnerTex.offset.y -= dt * (0.03 + this.intensity * 0.06) * speedScale;
    }
    const wallCloud = this.funnel.getObjectByName('wallCloud');
    if (wallCloud) wallCloud.rotation.y += dt * spin * 0.15;
    const cloud = this.funnel.getObjectByName('debrisCloud');
    if (cloud) {
      cloud.rotation.y += dt * spin * 0.8;
      cloud.scale.set(0.7 + this.intensity * 0.6, 0.6 + this.intensity * 0.8, 0.7 + this.intensity * 0.6);
    }
    // Rope-like sway: the column stays planted in its debris cloud and hangs
    // from the wall cloud, bowing and snaking in between. Weak tornadoes are
    // thin and wiggly; strong ones stiffen into a wedge.
    if (!this.reduceMotion) {
      const ts = nowMs / 1000;
      const amp = 3 + (1 - this.intensity) * 7;
      for (const fb of this.funnelBase) {
        const pos = fb.geo.getAttribute('position') as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const t = fb.base[i + 1] / 130;           // 0 ground … 1 cloud
          const bow = Math.sin(Math.PI * t);        // pinned at both ends
          const snake = Math.sin(Math.PI * 2 * t);  // S-bend second mode
          arr[i] = fb.base[i] + (Math.sin(ts * 0.6) * bow + Math.sin(ts * 1.1 + 1) * snake * 0.35) * amp;
          arr[i + 2] = fb.base[i + 2] + (Math.cos(ts * 0.47) * bow + Math.cos(ts * 0.9) * snake * 0.3) * amp * 0.8;
        }
        pos.needsUpdate = true;
      }
    }
    const breathe = 1 + Math.sin(performance.now() / 1400) * 0.03 * (this.reduceMotion ? 0 : 1);
    const wide = 0.8 + this.intensity * 0.5;
    this.funnel.scale.set(wide * breathe, 1, wide * breathe);

    // Floating wreckage orbiting the funnel (faster + higher when intense).
    const fSpin = (1.4 + this.intensity * 3.4) * speedScale;
    const nowS = performance.now() / 1000;
    for (const f of this.floaters) {
      f.angle += dt * fSpin * f.speed * (f.radius < 24 ? 1.3 : 0.9);
      const y = f.yBase * (0.5 + this.intensity * 0.9) + Math.sin(nowS * f.speed + f.phase) * (3 + this.intensity * 7);
      f.mesh.position.set(Math.cos(f.angle) * f.radius, Math.max(1.5, y), -Math.sin(f.angle) * f.radius);
      f.mesh.rotation.x += dt * f.tumble;
      f.mesh.rotation.y += dt * f.tumble * 0.7;
    }

    // Debris swirl
    const dp = this.debris.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = dp.count;
    const dSpin = (0.9 + this.intensity * 3.2) * speedScale;
    for (let i = 0; i < n; i++) {
      let a = this.debrisVel[i * 2] + dt * dSpin * (1.6 - this.debrisVel[i * 2 + 1] / 60);
      if (a > Math.PI * 2) a -= Math.PI * 2;
      this.debrisVel[i * 2] = a;
      const r0 = this.debrisVel[i * 2 + 1];
      let y = dp.getY(i) + dt * (2 + this.intensity * 9);
      if (y > 75) y = 0;
      // Low debris spirals inward along the surface inflow, then rides the
      // updraft out along the flaring funnel wall.
      const r = r0 * (y < 6 ? 1.4 - (y / 6) * 0.6 : 0.8 + (y / 75) * 0.7);
      dp.setXYZ(i, Math.cos(a) * r, y, -Math.sin(a) * r);
    }
    dp.needsUpdate = true;

    // Wind streaks blow past (direction rotates slowly with the storm)
    const wp = this.windPts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const wv = 14 + (this.windKmh / 260) * 90;
    const wa = performance.now() / 9000;
    const wx = Math.cos(wa) * wv * dt * speedScale;
    const wz = Math.sin(wa) * wv * dt * speedScale;
    for (let i = 0; i < wp.count; i++) {
      let x = wp.getX(i) + wx;
      let z = wp.getZ(i) + wz;
      if (x > WORLD.halfSize) x = -WORLD.halfSize;
      if (x < -WORLD.halfSize) x = WORLD.halfSize;
      if (z > WORLD.halfSize) z = -WORLD.halfSize;
      if (z < -WORLD.halfSize) z = WORLD.halfSize;
      wp.setX(i, x); wp.setZ(i, z);
    }
    wp.needsUpdate = true;

    // Rain curtain streaming down around the funnel.
    const rp2 = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const rainFall = (34 + this.intensity * 46) * dt * speedScale;
    for (let i = 0; i < rp2.count; i++) {
      let y = rp2.getY(i) - rainFall;
      if (y < 0) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 190;
        rp2.setX(i, Math.cos(a) * r);
        rp2.setZ(i, Math.sin(a) * r);
        y = 50 + Math.random() * 15;
      }
      rp2.setY(i, y);
    }
    rp2.needsUpdate = true;
    (this.rain.material as THREE.PointsMaterial).opacity = 0.08 + this.intensity * 0.55;

    // Scar trail: the funnel darkens the ground along its path.
    if (Math.hypot(this.tx - this.lastScar.x, this.tz - this.lastScar.z) > 14) {
      this.lastScar.x = this.tx;
      this.lastScar.z = this.tz;
      const scar = this.scarPool[this.scarIdx % this.scarPool.length];
      this.scarIdx++;
      scar.visible = true;
      scar.position.set(this.tx, scar.position.y, this.tz);
      scar.scale.setScalar(0.6 + this.intensity * 0.8);
      scar.rotation.z = Math.random() * Math.PI;
      (scar.material as THREE.MeshBasicMaterial).opacity = 0.22 + this.intensity * 0.3;
    }

    // Clouds drift
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (2 + this.intensity * 8) * speedScale * (i % 2 === 0 ? 1 : -1);
      if (c.position.x > 420) c.position.x = -420;
      if (c.position.x < -420) c.position.x = 420;
    }

    // Lightning (skipped flashes when reduced motion; bolt hidden)
    this.lightningT -= dt;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      const f = this.reduceMotion ? 0 : this.flash;
      this.dir.intensity = 0.7 + f * 4;
      this.hemi.intensity = 0.85 + f * 2;
    }
    if (this.lightningT <= 0) {
      this.lightningT = 14 - this.intensity * 10 + Math.random() * 8;
      if (!this.reduceMotion) {
        this.flash = 1;
        this.showBolt();
      }
    }

    // Transformer power flashes: only when the funnel tears past a roof.
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = 1.4 + Math.random() * 3.6;
      if (!this.reduceMotion && this.intensity > 0.35 && this.windKmh >= 105 && this.bldRoof.length) {
        let best = -1;
        let bestD = 90;
        for (let i = 0; i < this.bldRoof.length; i++) {
          const r = this.bldRoof[i];
          const dd = Math.hypot(r.x - this.tx, r.z - this.tz);
          if (dd < bestD) { bestD = dd; best = i; }
        }
        if (best >= 0) {
          const r = this.bldRoof[best];
          this.powerMesh.position.set(r.x, r.y, r.z);
          this.powerFlash = 1;
        }
      }
    }
    if (this.powerFlash > 0) {
      this.powerFlash = Math.max(0, this.powerFlash - dt * 5);
      const pf = this.powerFlash;
      this.powerMesh.visible = pf > 0.03;
      (this.powerMesh.material as THREE.MeshBasicMaterial).opacity = pf;
      this.powerMesh.scale.setScalar(0.8 + (1 - pf) * 4.5);
    } else if (this.powerMesh.visible) {
      this.powerMesh.visible = false;
    }

    // Storm darkens the world
    const dark = 1 - this.intensity * 0.25;
    (this.scene.background as THREE.Color).setRGB(0.04 * dark, 0.08 * dark, 0.16 * dark);

    // Follow camera
    const camDist = 15;
    const tx = this.pos.x + Math.sin(this.camYaw) * camDist;
    const tz = this.pos.z + Math.cos(this.camYaw) * camDist;
    const ty = this.pos.y + this.lift * 0.7 + 4 + Math.sin(this.camPitch) * camDist;
    const k = 1 - Math.pow(0.0001, dt); // smooth follow
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (Math.max(2.5, ty) - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    const lookUp = Math.max(0, -Math.sin(this.camPitch)) * 12;
    this.camera.lookAt(this.pos.x, this.pos.y + this.lift * 0.7 + 4.5 + lookUp, this.pos.z);

    this.renderer.render(this.scene, this.camera);

    // Simulated ambient temperature (°C): cooler in stronger storms and in
    // the cold downdraft near the funnel.
    const temp = 24 - this.intensity * 6 - Math.max(0, Math.min(1, (70 - pdist) / 70)) * 6;

    const dx = this.pos.x - this.tx;
    const dz = this.pos.z - this.tz;
    this.onTick({
      x: this.pos.x, z: this.pos.z,
      yaw: this.yaw,
      distance: Math.hypot(dx, dz),
      bearing: (Math.atan2(-dx, dz) * 180) / Math.PI,
      moving, speed: moving ? speed : 0,
      airborne: (this.caught || this.mounted ? this.pos.y > 0.5 : !this.onGround) || this.lift > 0.5,
      caught: this.caught,
      caughtRide: this.rideSwirl?.v.kind ?? null,
      riding: this.mounted?.kind ?? null,
      nearVehicle: this.nearVehicle(),
      nearNpc: this.nearestNpc(),
      hazardX: this.tx, hazardZ: this.tz,
      hazardKind: 'tornado', hazardLabel: 'Tornado',
      temperature: Math.round(temp),
    });
  }

  private showBolt(): void {
    if (this.bolt) {
      this.scene.remove(this.bolt);
      this.bolt.geometry.dispose();
      this.bolt = null;
    }
    const pts: THREE.Vector3[] = [];
    let x = (Math.random() * 2 - 1) * 200;
    let z = (Math.random() * 2 - 1) * 200;
    for (let y = 130; y > 0; y -= 14) {
      pts.push(new THREE.Vector3(x, y, z));
      x += (Math.random() * 2 - 1) * 16;
      z += (Math.random() * 2 - 1) * 16;
    }
    this.bolt = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(this.bolt);
    window.setTimeout(() => {
      if (this.bolt && !this.disposed) {
        this.scene.remove(this.bolt);
        this.bolt.geometry.dispose();
        this.bolt = null;
      }
    }, 140);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }
}
