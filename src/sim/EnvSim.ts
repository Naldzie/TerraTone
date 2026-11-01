/* EnvSim — shared real-time 3D world for the hazard simulators.
 *
 * One engine, six worlds: renderer + follow camera + avatar (walker/diver)
 * + input + collisions + quality tiers + pause/reset/dispose live here.
 * Each hazard injects its own palette, terrain dressing, and a "feature"
 * builder (hurricane spiral, volcano cone, reef, burning forest, city).
 * All geometry is procedural (offline-safe); no downloads, no post-processing.
 */
import * as THREE from 'three';
import type { IconName } from '../components/Icon';
import { WORLD } from './stormTypes';
import { Npc, NPC_COUNT, NPC_NAMES, npcTierFor } from './npc';
import { AvatarAnimator, buildAvatarMesh, disposeAvatarBody, DEFAULT_AVATAR, randomAvatarOptions } from './avatar';
import type { AvatarOptions } from './avatar';

export type EnvQuality = 'low' | 'medium' | 'high';

export interface EnvSnapshot {
  x: number; z: number;
  yaw: number;
  distance: number;
  bearing: number;
  moving: boolean;
  speed: number;
  airborne: boolean;
  riding: boolean;
  nearVehicle: boolean;
  /** Nearest talkable bystander within chat range, if any. */
  nearNpc: { name: string; dist: number } | null;
  /** Simulated ambient temperature in °C. */
  temperature: number;
  /** Optional hazard event location for the minimap. */
  hazardX?: number; hazardZ?: number;
  hazardKind?: string; hazardLabel?: string;
}

export interface FeatureCtx {
  scene: THREE.Scene;
  rand: (seed: number) => () => number;
  /** Block a circle. `top` makes it a walkable mound instead (height at the
   *  centre, sloping to 0 at r); `npcOnly` blocks bystanders but not you
   *  (for terrain you climb via `groundHeight`). */
  addCollider: (x: number, z: number, r: number, opts?: ColliderOpts) => void;
  /** Move the hazard anchor (e.g. a drifting hurricane eye) — audio, NPCs, minimap follow. */
  setHazard: (x: number, z: number) => void;
  quality: EnvQuality;
  reduceMotion: boolean;
  /** Live explorer position (read-only). */
  player: THREE.Vector3;
}

export interface ColliderOpts { top?: number; npcOnly?: boolean }

interface Collider { x: number; z: number; r: number; top?: number; npcOnly?: boolean }

export interface FeatureHandle {
  update: (dt: number, t: number, vals: Record<string, number>) => void;
  /** Terrain height under (x, z) — e.g. a volcano slope you can hike up. */
  groundHeight?: (x: number, z: number) => number;
  /** Optional — called on reset() so packs can restore damaged/changed state. */
  reset?: () => void;
}

export interface EnvPalette {
  ground: string; speckle: string; sky: number; fog: number;
  fogNear: number; fogFar: number; hemiSky: number; hemiGround: number; sun: number;
  /** World position of a visible sun, so sunlight (and shadows) come from it. */
  sunPos?: [number, number, number];
  /** Sunlight strength (default 0.75). */
  sunIntensity?: number;
  /** Sky-fill strength (default 0.9) — near zero in airless space. */
  hemiIntensity?: number;
}

/** Rideable vehicle built by a pack (e.g. the ocean scuba sub). */
export interface EnvVehicle {
  group: THREE.Group;
  prop?: THREE.Object3D | null;
  home: { x: number; z: number; y?: number };
  /** Engine-glow hook: k = 0 idle … 1 full boost. */
  thrust?: (k: number, dt: number) => void;
}

/** Where a fleet copy parks, plus an optional accent tint. */
export interface VehicleSpot { x: number; y?: number; z: number; tint?: number }

export interface EnvVehicleDef {
  label: string;
  icon: IconName;
  speed: number;
  boostSpeed: number;
  build: (scene: THREE.Scene, addCollider: (x: number, z: number, r: number) => void, spot?: VehicleSpot) => EnvVehicle;
  /** Extra copies parked at these spots (board whichever is nearest). */
  fleet?: VehicleSpot[];
  /** True 3D flight: climbs / dives with the camera, banks into turns, holds altitude. */
  flight?: boolean;
  /** Pilot sits inside (hide the explorer while aboard). */
  hideRider?: boolean;
  /** Chase-camera distance while aboard. */
  camDist?: number;
  /** Boarding range. */
  boardRange?: number;
  /** One-line control hint for the HUD. */
  hint?: string;
}

export interface EnvOptions {
  quality?: EnvQuality;
  reduceMotion?: boolean;
  palette: EnvPalette;
  roads?: boolean;
  suitColor?: number;
  accentColor?: number;
  swim?: boolean;
  feature: (ctx: FeatureCtx) => FeatureHandle;
  drift?: (vals: Record<string, number>) => { x: number; z: number };
  vehicle?: EnvVehicleDef;
  onTick?: (s: EnvSnapshot) => void;
  /** Optional hazard event location + label for the minimap. */
  hazardX?: number; hazardZ?: number;
  hazardKind?: string; hazardLabel?: string;
  /** Gravity in world units / s² (Earth default 22; the Moon is ~1/6 of that). */
  gravity?: number;
  /** Bystanders flee the hazard inside this radius (default 110; 0 = never). */
  npcFleeRadius?: number;
  /** Dress every bystander in a sealed helmet (airless worlds). */
  npcHelmets?: boolean;
  /** Microgravity: no falling — the explorer drifts with a jetpack, moving
   *  forward climbs or dives with the camera, Jump thrusts upward. */
  zeroG?: boolean;
  /** Deep space: no ground plane (pair with zeroG). */
  noGround?: boolean;
  /** Everyone (explorer + bystanders) wears a full EVA suit. */
  spaceSuit?: boolean;
  /** Extra acceleration at a point (e.g. a black hole's pull), world units / s². */
  pull?: (x: number, y: number, z: number, vals: Record<string, number>) => { x: number; y: number; z: number };
  /** Entering this sphere respawns the explorer (e.g. an event horizon). */
  killZone?: { x: number; y: number; z: number; r: number };
  /** Start each run with the camera looking toward the hazard. */
  faceHazard?: boolean;
}

const DENSITY: Record<EnvQuality, number> = { low: 0.45, medium: 0.75, high: 1 };

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundTexture(base: string, fleck: string, roads: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  const rnd = seeded(11);
  // Large soft patches (soil moisture / vegetation variation) under the detail.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512; const y = rnd() * 512; const r = 30 + rnd() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    grad.addColorStop(0, light ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Pebbles, clumps and grass blades at a few scales.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = fleck;
    g.globalAlpha = 0.15 + rnd() * 0.4;
    const sz = rnd() < 0.85 ? 1 + rnd() * 2.5 : 3 + rnd() * 4;
    g.fillRect(rnd() * 512, rnd() * 512, sz, sz);
  }
  g.strokeStyle = fleck;
  g.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * 512; const y = rnd() * 512;
    g.globalAlpha = 0.12 + rnd() * 0.25;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4); g.stroke();
  }
  g.globalAlpha = 1;
  if (roads) {
    // Asphalt with worn wheel tracks and a dashed centre line.
    g.fillStyle = '#3a3f4a';
    g.fillRect(0, 236, 512, 40);
    g.fillRect(236, 0, 40, 512);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 244, 512, 4); g.fillRect(0, 264, 512, 4);
    g.fillRect(244, 0, 4, 512); g.fillRect(264, 0, 4, 512);
    g.fillStyle = 'rgba(240,200,80,0.55)';
    for (let i = 0; i < 512; i += 32) {
      if (i < 230 || i > 282) { g.fillRect(i, 255, 16, 2); g.fillRect(255, i, 2, 16); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

/** Opt a subtree into the real-time shadow map (High quality only). */
export function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'blobShadow') o.castShadow = true;
  });
}

export class EnvSim {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private last = 0;
  private running = true;
  private disposed = false;
  private elapsed = 0;

  private avatar = new THREE.Group();
  private bodyG = new THREE.Group();
  private anim!: AvatarAnimator;
  private blob!: THREE.Mesh;
  private shadows = false;
  private prevX = 0; private prevZ = 0;
  private groundSpeed = 0;
  /** Light position relative to the explorer (points back at the sun). */
  private sunOffset = new THREE.Vector3(120, 200, 60);
  private gravity: number;
  private zeroG: boolean;
  private noGround: boolean;
  private vel = new THREE.Vector3();
  private lastSpawn = 160;
  private feature: FeatureHandle;
  private colliders: Collider[] = [];
  /** Colliders that physically block the explorer (not mounds / NPC-only). */
  private walls: Collider[] = [];
  private mounds: Collider[] = [];
  private onGround = true;

  private pos = new THREE.Vector3(0, 0, 160);
  private velY = 0;
  private yaw = 0;
  private camYaw = Math.PI;
  private camPitch = 0.32;
  private input = { x: 0, z: 0, run: false };
  private jumpQueued = false;
  private vals: Record<string, number> = {};
  private shake = 0;
  private drift: EnvOptions['drift'];
  private swim: boolean;
  private reduceMotion: boolean;
  private onTick: (s: EnvSnapshot) => void;
  private hemi!: THREE.HemisphereLight;
  private dir!: THREE.DirectionalLight;
  private npcs: Npc[] = [];
  private npcsOn = true;
  private npcTier = 4;
  private talkingNpc: string | null = null;
  private vehicleDef: EnvVehicleDef | undefined;
  private vehicle: EnvVehicle | null = null;
  private vehCollider = { x: 0, z: 0, r: 5 };
  /** Every parked copy; `vehicle` / `veh` / `vehCollider` point at the one in use. */
  private fleet: { vehicle: EnvVehicle; veh: EnvSim['veh']; collider: { x: number; z: number; r: number } }[] = [];
  private mounted = false;
  private veh = { x: 0, z: 0, y: 2.5, yaw: 0, bank: 0, pitch: 0 };
  private climb = false;
  private hazardX = 0; private hazardZ = 0;
  private hazardKind = ''; private hazardLabel = '';

  constructor(private canvas: HTMLCanvasElement, private opts: EnvOptions) {
    this.reduceMotion = opts.reduceMotion ?? false;
    this.drift = opts.drift;
    this.swim = opts.swim ?? false;
    this.gravity = opts.gravity ?? 22;
    this.zeroG = opts.zeroG ?? false;
    this.noGround = opts.noGround ?? false;
    this.onTick = opts.onTick ?? (() => undefined);
    this.hazardX = opts.hazardX ?? 0;
    this.hazardZ = opts.hazardZ ?? 0;
    this.hazardKind = opts.hazardKind ?? '';
    this.hazardLabel = opts.hazardLabel ?? '';
    const q = opts.quality ?? 'medium';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2));
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1400);
    const p = opts.palette;
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    this.hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiIntensity ?? 0.9);
    this.dir = new THREE.DirectionalLight(p.sun, p.sunIntensity ?? 0.75);
    if (p.sunPos) {
      const d = new THREE.Vector3(...p.sunPos).normalize().multiplyScalar(260);
      this.sunOffset.set(d.x, d.y, d.z);
    }
    this.dir.position.copy(this.sunOffset);
    // Real-time shadows on High only: a tight shadow frustum that follows the
    // explorer keeps it cheap while grounding everyone near the camera.
    this.shadows = q === 'high';
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.dir.castShadow = true;
      this.dir.shadow.mapSize.set(1024, 1024);
      const sc = this.dir.shadow.camera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 500;
      this.dir.shadow.bias = -0.0008;
      this.dir.shadow.normalBias = 0.4;
    }
    this.scene.add(this.hemi, this.dir, this.dir.target);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.halfSize * 2 + 80, WORLD.halfSize * 2 + 80),
      new THREE.MeshLambertMaterial({ map: groundTexture(p.ground, p.speckle, opts.roads ?? false) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = this.shadows;
    ground.visible = !this.noGround;
    this.scene.add(ground);
    this.buildAvatar(opts.suitColor ?? 0xe8eef7, opts.accentColor ?? 0x22d3ee);
    const density = DENSITY[q];
    this.feature = opts.feature({
      scene: this.scene,
      rand: seeded,
      addCollider: (x, z, r, o) => this.addCollider({ x, z, r, ...o }),
      setHazard: (x, z) => { this.hazardX = x; this.hazardZ = z; },
      quality: q,
      reduceMotion: this.reduceMotion,
      player: this.pos,
    });
    void density;
    this.vehicleDef = opts.vehicle;
    if (opts.vehicle) {
      const def = opts.vehicle;
      const spots: (VehicleSpot | undefined)[] = [undefined, ...(def.fleet ?? [])];
      for (const spot of spots) {
        const vehicle = def.build(this.scene, (x, z, r) => this.addCollider({ x, z, r }), spot);
        const veh = { x: vehicle.home.x, z: vehicle.home.z, y: vehicle.home.y ?? 2.5, yaw: 0, bank: 0, pitch: 0 };
        vehicle.group.rotation.order = 'YXZ';
        const collider = { x: veh.x, z: veh.z, r: 5 };
        if (!def.flight) this.addCollider(collider);
        this.fleet.push({ vehicle, veh, collider });
      }
      this.useVehicle(0);
    }
    this.npcTier = npcTierFor(q);
    this.spawnNpcs();
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

  private addCollider(c: Collider): void {
    this.colliders.push(c);
    if (c.top != null) this.mounds.push(c);
    else if (!c.npcOnly) this.walls.push(c);
  }

  /** Ground under (x, z): terrain from the pack, raised by any walkable mound. */
  private groundAt(x: number, z: number): number {
    if (this.noGround) return -140;
    let g = this.feature?.groundHeight?.(x, z) ?? 0;
    for (const m of this.mounds) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d < m.r) g = Math.max(g, (m.top ?? 0) * (1 - (d / m.r) ** 2));
    }
    return g;
  }

  /** Push (nx, nz) out of solid colliders. */
  private pushOut(nx: number, nz: number, skip?: Collider): { x: number; z: number } {
    for (const c of this.walls) {
      if (c === skip) continue;
      const dx = nx - c.x; const dz = nz - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd < c.r && dd > 1e-6) { nx = c.x + (dx / dd) * c.r; nz = c.z + (dz / dd) * c.r; }
    }
    return { x: nx, z: nz };
  }

  /** Bystander NPCs: wander, keep clear of buildings, flee the hazard. */
  private spawnNpcs(): void {
    for (let i = 0; i < NPC_COUNT; i++) {
      // Spawn in pairs (friends wander together and soon strike up a chat).
      const pair = Math.floor(i / 2);
      const a = (pair / Math.ceil(NPC_COUNT / 2)) * Math.PI * 2 + 0.4;
      const r = 110 + (pair % 3) * 35;
      const look = this.opts.npcHelmets || this.opts.spaceSuit
        ? { ...randomAvatarOptions(seeded(3000 + i * 13)), headgear: 'helmet' as const }
        : undefined;
      const npc = new Npc(1000 + i * 77,
        Math.cos(a) * r + (i % 2) * 6, Math.sin(a) * r, this.swim || this.zeroG, look, this.opts.spaceSuit);
      npc.name = NPC_NAMES[(i * 7 + 3) % NPC_NAMES.length];
      if (this.opts.npcFleeRadius != null) npc.fleeRadius = this.opts.npcFleeRadius;
      if (this.shadows) castShadows(npc.group);
      this.npcs.push(npc);
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

  /** Nearest visible bystander within chat range (12 m). */
  nearestNpc(range = 12): { name: string; dist: number } | null {
    let best: { name: string; dist: number } | null = null;
    for (const npc of this.npcs) {
      if (!npc.group.visible) continue;
      const d = Math.hypot(npc.group.position.x - this.pos.x, npc.group.position.z - this.pos.z);
      if (d <= range && (!best || d < best.dist)) best = { name: npc.name, dist: d };
    }
    return best;
  }

  /** All bystander NPCs with position + state for the minimap. */
  getNpcs(): { x: number; z: number; name: string; state: 'wandering' | 'fleeing' | 'driving' }[] {
    const out: { x: number; z: number; name: string; state: 'wandering' | 'fleeing' | 'driving' }[] = [];
    for (const npc of this.npcs) {
      if (!npc.group.visible) continue;
      const state = npc.isFleeing ? 'fleeing' : 'wandering';
      out.push({ x: npc.group.position.x, z: npc.group.position.z, name: npc.name, state });
    }
    return out;
  }

  private avatarOpts: AvatarOptions = { ...DEFAULT_AVATAR };
  private buildAvatar(_suitColor: number, _accentColor: number): void {
    void _suitColor; void _accentColor; // look now comes from the avatar profile
    const b = buildAvatarMesh(this.avatarOpts, { spaceSuit: this.opts.spaceSuit });
    this.bodyG = b.body;
    this.anim = new AvatarAnimator(b);
    if (this.shadows) castShadows(b.body);
    // Contact shadow stays on the ground and shrinks / fades as you jump.
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.05;
    this.avatar.add(this.bodyG);
    this.blob.visible = !this.opts.noGround;
    this.scene.add(this.blob);
    this.avatar.position.copy(this.pos);
    this.scene.add(this.avatar);
  }

  /** Swap the explorer's look live (profile editor, presets). */
  setAvatar(o: AvatarOptions): void {
    this.avatarOpts = { ...o };
    if (!this.bodyG) return;
    disposeAvatarBody(this.bodyG);
    this.avatar.remove(this.bodyG);
    const b = buildAvatarMesh(this.avatarOpts, { spaceSuit: this.opts.spaceSuit });
    this.bodyG = b.body;
    this.anim.setRig(b);
    if (this.shadows) castShadows(b.body);
    this.avatar.add(this.bodyG);
  }

  setInput(x: number, z: number, run: boolean): void { this.input = { x, z, run }; }
  queueJump(): void { this.jumpQueued = true; }
  setClimb(on: boolean): void { this.climb = on; }
  /** Point the active-vehicle fields at fleet entry `i`. */
  private useVehicle(i: number): void {
    const f = this.fleet[i];
    if (!f) return;
    this.vehicle = f.vehicle;
    this.veh = f.veh;
    this.vehCollider = f.collider;
  }
  /** Index of the nearest parked vehicle within boarding range, or -1. */
  private nearestVehicle(): number {
    const range = this.vehicleDef?.boardRange ?? 11;
    const fly = this.zeroG || this.vehicleDef?.flight;
    let best = -1; let bestD = range;
    this.fleet.forEach((f, i) => {
      const d = Math.hypot(this.pos.x - f.veh.x, fly ? this.pos.y - f.veh.y : 0, this.pos.z - f.veh.z);
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  }
  /** Within boarding range of a parked vehicle? */
  nearVehicle(): boolean {
    if (!this.vehicle || this.mounted) return false;
    return this.nearestVehicle() >= 0;
  }
  /** Board / dismount. Returns mounted state. */
  tryToggleMount(): boolean {
    if (!this.vehicle) return false;
    if (this.mounted) {
      // Step out beside the hatch, carrying a little of the ship's momentum.
      const sx = Math.cos(this.veh.yaw) * 7; const sz = -Math.sin(this.veh.yaw) * 7;
      const floor = this.noGround ? -1e9 : this.zeroG ? 0 : 1.2;
      this.pos.set(this.veh.x + sx, Math.max(floor, this.veh.y), this.veh.z + sz);
      this.vel.multiplyScalar(this.zeroG ? 0.3 : 0);
      this.velY = 0;
      this.jumpQueued = false;
      this.mounted = false;
      this.avatar.visible = true;
      return false;
    }
    const near = this.nearestVehicle();
    if (near < 0) return false;
    this.useVehicle(near);
    this.mounted = true;
    this.jumpQueued = false;
    return true;
  }
  addCameraOrbit(dx: number, dy: number): void {
    this.camYaw -= dx * 0.005;
    // Negative pitch swings the camera under the shoulder and lifts the look
    // point, so drag up = look up at the sky, drag down = look at the ground.
    this.camPitch = Math.min(1.15, Math.max(-1, this.camPitch + dy * 0.004));
  }
  setVals(v: Record<string, number>): void { this.vals = v; }
  setShake(s: number): void { this.shake = Math.min(1, Math.max(0, s)); }
  setPaused(p: boolean): void { this.running = !p; this.last = performance.now(); }
  reset(spawn: number): void {
    this.lastSpawn = spawn;
    this.pos.set(0, this.zeroG ? (this.noGround ? 4 : 1) : 0, spawn);
    if (!this.zeroG && !this.swim) this.pos.y = this.groundAt(0, spawn);
    this.onGround = true;
    this.vel.set(0, 0, 0);
    this.velY = 0;
    this.avatar.visible = true;
    // Default: camera south of the explorer looking north; optionally behind
    // the explorer looking at the hazard so the main event is in view.
    this.camYaw = this.opts.faceHazard
      ? Math.atan2(this.pos.x - this.hazardX, this.pos.z - this.hazardZ)
      : Math.PI;
    this.camPitch = 0.32;
    this.mounted = false;
    this.climb = false;
    this.prevX = this.pos.x; this.prevZ = this.pos.z;
    this.groundSpeed = 0;
    this.feature.reset?.();
    for (const f of this.fleet) {
      Object.assign(f.veh, { x: f.vehicle.home.x, z: f.vehicle.home.z, y: f.vehicle.home.y ?? 2.5, yaw: 0, bank: 0, pitch: 0 });
      f.vehicle.group.position.set(f.veh.x, f.veh.y, f.veh.z);
      f.vehicle.group.rotation.set(0, 0, 0);
      f.collider.x = f.veh.x;
      f.collider.z = f.veh.z;
    }
    this.useVehicle(0);
  }
  setQuality(q: EnvQuality): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2));
    this.npcTier = npcTierFor(q);
    this.applyNpcVisibility();
  }
  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    const speedScale = this.reduceMotion ? 0.7 : 1;
    const fwd = { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
    const right = { x: -fwd.z, z: fwd.x };
    const wish = {
      x: right.x * this.input.x + fwd.x * this.input.z,
      z: right.z * this.input.x + fwd.z * this.input.z,
    };
    const speed = this.input.run ? WORLD.runSpeed : WORLD.walkSpeed;
    const len = Math.hypot(wish.x, wish.z);
    let moving = false;
    // Forward motion climbs or dives with the camera (relative to the default
    // look-down angle, so straight ahead holds altitude).
    const pitchClimb = -(Math.sin(this.camPitch) - Math.sin(0.32)) * 1.6;
    const pulled = (x: number, y: number, z: number) =>
      this.opts.pull ? this.opts.pull(x, y, z, this.vals) : null;
    const yFloor = this.noGround ? -140 : 0;
    if (this.mounted && this.vehicle && this.vehicleDef?.flight) {
      // Spaceship: inertial 3D flight. Steer with the stick, aim the nose with
      // the camera, Rise climbs, Run boosts; it holds altitude when idle.
      moving = len > 0.01;
      this.jumpQueued = false;
      const spd = this.input.run ? this.vehicleDef.boostSpeed : this.vehicleDef.speed;
      const tvx = moving ? (wish.x / len) * spd : 0;
      const tvz = moving ? (wish.z / len) * spd : 0;
      const tvy = (moving ? pitchClimb * spd * Math.max(0, this.input.z) : 0) + (this.climb ? spd * 0.6 : 0);
      const resp = Math.min(1, dt * (moving || this.climb ? 1.8 : 0.9));
      this.vel.x += (tvx - this.vel.x) * resp;
      this.vel.y += (tvy - this.vel.y) * resp;
      this.vel.z += (tvz - this.vel.z) * resp;
      const pa = pulled(this.veh.x, this.veh.y, this.veh.z);
      if (pa) { this.vel.x += pa.x * dt; this.vel.y += pa.y * dt; this.vel.z += pa.z * dt; }
      const h = WORLD.halfSize;
      this.veh.x = Math.min(h, Math.max(-h, this.veh.x + this.vel.x * dt));
      this.veh.z = Math.min(h, Math.max(-h, this.veh.z + this.vel.z * dt));
      this.veh.y = Math.min(220, Math.max(yFloor + 2, this.veh.y + this.vel.y * dt));
      const hs = Math.hypot(this.vel.x, this.vel.z);
      let turn = 0;
      if (hs > 1) {
        let dy = Math.atan2(this.vel.x, this.vel.z) - this.veh.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        turn = dy;
        this.veh.yaw += dy * Math.min(1, dt * 3);
      }
      // Bank into turns and pitch along the climb, like an aircraft.
      this.veh.bank += (Math.max(-0.7, Math.min(0.7, -turn * 1.4)) - this.veh.bank) * Math.min(1, dt * 3);
      this.veh.pitch += (-Math.atan2(this.vel.y, Math.max(4, hs)) * 0.8 - this.veh.pitch) * Math.min(1, dt * 3);
      this.yaw = this.veh.yaw;
      this.vehicle.group.position.set(this.veh.x, this.veh.y, this.veh.z);
      this.vehicle.group.rotation.set(this.veh.pitch, this.veh.yaw, this.veh.bank);
      this.vehicle.thrust?.(Math.min(1, this.vel.length() / this.vehicleDef.boostSpeed), dt);
      this.pos.set(this.veh.x, this.veh.y - 3, this.veh.z);
      this.avatar.visible = !this.vehicleDef.hideRider;
      this.avatar.position.copy(this.pos);
      this.avatar.rotation.y = this.veh.yaw;
      this.anim.update({ dt, t: this.elapsed, speed: 0, ride: true });
    } else if (this.mounted && this.vehicle && this.vehicleDef) {
      // Riding: steer the vehicle, climb with Jump-hold, Run boosts.
      moving = len > 0.01;
      this.jumpQueued = false;
      const spd = this.input.run ? this.vehicleDef.boostSpeed : this.vehicleDef.speed;
      if (moving) {
        let nx = this.veh.x + (wish.x / len) * spd * dt;
        let nz = this.veh.z + (wish.z / len) * spd * dt;
        if (this.drift) {
          const d = this.drift(this.vals);
          nx += d.x * dt; nz += d.z * dt;
        }
        const h = WORLD.halfSize;
        nx = Math.min(h, Math.max(-h, nx));
        nz = Math.min(h, Math.max(-h, nz));
        ({ x: nx, z: nz } = this.pushOut(nx, nz, this.vehCollider));
        this.veh.x = nx; this.veh.z = nz;
        const targetYaw = Math.atan2(wish.x, wish.z);
        let dy = targetYaw - this.veh.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.veh.yaw += dy * Math.min(1, dt * 6);
        this.yaw = this.veh.yaw;
      }
      this.veh.y = Math.min(30, Math.max(1.2, this.veh.y + (this.climb ? 7 : -1.2) * dt));
      this.vehCollider.x = this.veh.x;
      this.vehCollider.z = this.veh.z;
      this.vehicle.group.position.set(this.veh.x, this.veh.y, this.veh.z);
      this.vehicle.group.rotation.y = this.veh.yaw;
      if (this.vehicle.prop) this.vehicle.prop.rotation.z += dt * (moving ? 16 : 4);
      // Diver rides prone at the stern, holding on.
      const fx = Math.sin(this.veh.yaw);
      const fz = Math.cos(this.veh.yaw);
      this.pos.set(this.veh.x - fx * 6.5, this.veh.y + 0.9, this.veh.z - fz * 6.5);
      this.avatar.position.copy(this.pos);
      this.avatar.rotation.y = this.veh.yaw;
      this.anim.update({ dt, t: this.elapsed, speed: moving ? 6 : 1, ride: true });
    } else if (this.zeroG) {
      // Microgravity EVA: thrusters ease you toward the stick direction; let
      // go and you keep drifting (only a gentle damping, no falling).
      const thrusting = len > 0.01;
      const tvx = thrusting ? (wish.x / len) * speed : 0;
      const tvz = thrusting ? (wish.z / len) * speed : 0;
      const tvy = thrusting ? pitchClimb * speed * Math.max(0, this.input.z) : 0;
      const kx = Math.min(1, dt * (thrusting ? 2.5 : 0.35));
      this.vel.x += (tvx - this.vel.x) * kx;
      this.vel.z += (tvz - this.vel.z) * kx;
      this.vel.y += (tvy - this.vel.y) * Math.min(1, dt * (thrusting ? 2.5 : 0.35));
      if (this.jumpQueued) { this.jumpQueued = false; this.vel.y += 8; }
      const pa = pulled(this.pos.x, this.pos.y, this.pos.z);
      if (pa) { this.vel.x += pa.x * dt; this.vel.y += pa.y * dt; this.vel.z += pa.z * dt; }
      const h = WORLD.halfSize;
      let nx = Math.min(h, Math.max(-h, this.pos.x + this.vel.x * dt));
      let nz = Math.min(h, Math.max(-h, this.pos.z + this.vel.z * dt));
      if (this.pos.y < 14) ({ x: nx, z: nz } = this.pushOut(nx, nz));
      this.pos.x = nx; this.pos.z = nz;
      this.pos.y += this.vel.y * dt;
      const floorZ = Math.max(yFloor, this.groundAt(nx, nz));
      if (this.pos.y < floorZ) { this.pos.y = floorZ; this.vel.y = Math.abs(this.vel.y) * 0.25; }
      if (this.pos.y > 160) { this.pos.y = 160; this.vel.y = Math.min(0, this.vel.y); }
      const hs = Math.hypot(this.vel.x, this.vel.z);
      moving = thrusting || hs > 1;
      if (hs > 0.5) {
        let dy = Math.atan2(this.vel.x, this.vel.z) - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, dt * 4);
      }
    } else if (len > 0.01) {
      moving = true;
      let nx = this.pos.x + (wish.x / len) * speed * dt;
      let nz = this.pos.z + (wish.z / len) * speed * dt;
      if (this.drift) {
        const d = this.drift(this.vals);
        nx += d.x * dt; nz += d.z * dt;
      }
      const h = WORLD.halfSize;
      nx = Math.min(h, Math.max(-h, nx));
      nz = Math.min(h, Math.max(-h, nz));
      ({ x: nx, z: nz } = this.pushOut(nx, nz));
      // Uphill is slower (steeper = slower); downhill is free.
      const stepLen = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      if (stepLen > 1e-4 && !this.swim) {
        const rise = this.groundAt(nx, nz) - this.groundAt(this.pos.x, this.pos.z);
        const slope = Math.max(0, rise / stepLen);
        const k = 1 / (1 + slope * 0.7);
        nx = this.pos.x + (nx - this.pos.x) * k;
        nz = this.pos.z + (nz - this.pos.z) * k;
      }
      this.pos.x = nx; this.pos.z = nz;
      const targetYaw = Math.atan2(wish.x, wish.z);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 10);
    } else if (this.drift) {
      const d = this.drift(this.vals);
      const h = WORLD.halfSize;
      this.pos.x = Math.min(h, Math.max(-h, this.pos.x + d.x * dt));
      this.pos.z = Math.min(h, Math.max(-h, this.pos.z + d.z * dt));
    }
    if (this.zeroG || this.mounted) {
      // Handled above (drift / vehicle).
    } else if (!this.swim) {
      const ground = this.groundAt(this.pos.x, this.pos.z);
      if (this.jumpQueued) { this.jumpQueued = false; if (this.onGround) this.velY = 7; }
      if (this.onGround && this.velY <= 0 && this.pos.y - ground < 1.6) {
        // Stick to slopes and mound tops (walk down them instead of hopping off).
        this.pos.y = ground;
        this.velY = 0;
      } else {
        this.velY -= this.gravity * dt;
        this.pos.y += this.velY * dt;
        if (this.pos.y <= ground) { this.pos.y = ground; this.velY = 0; }
      }
      this.onGround = this.pos.y <= ground + 0.01 && this.velY <= 0;
    } else {
      this.jumpQueued = false;
      this.pos.y = 2.5 + Math.sin(this.elapsed * 1.2) * 0.4; // gentle hover
    }
    // Event horizon (or similar): crossing it ends the excursion.
    const kz = this.opts.killZone;
    if (kz) {
      const kp = this.mounted ? new THREE.Vector3(this.veh.x, this.veh.y, this.veh.z) : this.pos;
      if (kp.distanceTo(new THREE.Vector3(kz.x, kz.y, kz.z)) < kz.r) this.reset(this.lastSpawn);
    }

    // Animate from the speed actually achieved (walls and colliders stop the
    // stride instead of leaving the explorer running on the spot).
    const moved = Math.hypot(this.pos.x - this.prevX, this.pos.z - this.prevZ) / Math.max(1e-4, dt);
    this.prevX = this.pos.x; this.prevZ = this.pos.z;
    this.groundSpeed += (Math.min(moved, WORLD.runSpeed * 1.2) - this.groundSpeed) * Math.min(1, dt * 12);
    if (!this.mounted) {
      this.anim.update({
        dt, t: this.elapsed,
        speed: moving ? (this.zeroG ? Math.max(this.groundSpeed, Math.abs(this.vel.y)) : this.groundSpeed) : 0,
        airborne: !this.zeroG && !this.swim && !this.onGround, velY: this.velY, swim: this.swim || this.zeroG,
      });
      this.avatar.position.copy(this.pos);
      this.avatar.rotation.y = this.yaw;
    }
    // Contact shadow: stays on the ground under the explorer.
    const groundHere = this.groundAt(this.pos.x, this.pos.z);
    const lift = this.swim || this.mounted ? 3 : Math.max(0, this.pos.y - groundHere);
    this.blob.position.set(this.pos.x, groundHere + 0.05, this.pos.z);
    this.blob.scale.setScalar(Math.max(0.45, 1 - lift * 0.08));
    (this.blob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.35 - lift * 0.03) * (this.shadows ? 0.5 : 1);

    this.feature.update(dt * speedScale, this.elapsed, this.vals);

    for (const npc of this.npcs) {
      if (!npc.group.visible) continue;
      if (this.talkingNpc && npc.name === this.talkingNpc) {
        npc.faceToward(this.pos.x, this.pos.z, dt, this.elapsed);
        continue;
      }
      npc.update(dt, this.elapsed, WORLD.halfSize, this.colliders, { x: this.hazardX, z: this.hazardZ }, { x: this.pos.x, z: this.pos.z }, this.npcs);
    }

    // Camera pulls back and widens a touch at a sprint; a landing dips it.
    const sprint = moving && this.input.run && !this.mounted ? 1 : 0;
    const fovT = 60 + sprint * 6;
    if (Math.abs(this.camera.fov - fovT) > 0.05) {
      this.camera.fov += (fovT - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    const riderCam = this.mounted && this.vehicleDef?.camDist ? this.vehicleDef.camDist : 15;
    const camDist = riderCam + sprint * 1.5;
    const tx = this.pos.x + Math.sin(this.camYaw) * camDist;
    const tz = this.pos.z + Math.cos(this.camYaw) * camDist;
    const ty = this.pos.y + 4 + Math.sin(this.camPitch) * camDist - this.anim.landing * 0.6;
    const k = 1 - Math.pow(0.0001, dt);
    this.camera.position.x += (tx - this.camera.position.x) * k;
    const camFloor = this.noGround ? -1e9 : this.groundAt(this.camera.position.x, this.camera.position.z) + 2.5;
    this.camera.position.y += (Math.max(camFloor, ty) - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    let sx = 0; let sy = 0;
    if (this.shake > 0 && !this.reduceMotion) {
      const a = this.shake * 1.6;
      sx = (Math.random() * 2 - 1) * a;
      sy = (Math.random() * 2 - 1) * a;
    }
    const lookUp = Math.max(0, -Math.sin(this.camPitch)) * 12;
    this.camera.lookAt(this.pos.x + sx, this.pos.y + 4.5 + lookUp + sy, this.pos.z);
    if (this.shadows) {
      this.dir.target.position.set(this.pos.x, 0, this.pos.z);
      this.dir.position.set(this.pos.x + this.sunOffset.x, this.sunOffset.y, this.pos.z + this.sunOffset.z);
    }
    this.renderer.render(this.scene, this.camera);

    const dx = this.pos.x - this.hazardX;
    const dz = this.pos.z - this.hazardZ;
    this.onTick({
      x: this.pos.x, z: this.pos.z,
      yaw: this.yaw,
      distance: Math.hypot(dx, dz),
      bearing: (Math.atan2(-dx, dz) * 180) / Math.PI,
      moving, speed: moving ? speed : 0,
      airborne: !this.onGround,
      riding: this.mounted,
      nearVehicle: this.nearVehicle(),
      nearNpc: this.nearestNpc(),
      temperature: this.vals.temp != null ? Math.round(this.vals.temp) : 20,
      hazardX: this.hazardX, hazardZ: this.hazardZ,
      hazardKind: this.hazardKind, hazardLabel: this.hazardLabel,
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }
}
