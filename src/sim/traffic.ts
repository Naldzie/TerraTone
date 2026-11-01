/* NPC-driven traffic for the shared hazard worlds (EnvSim): cars and a
 * helicopter on land, a submarine underwater, a spaceship in space. Purely
 * ambient — they cruise between random waypoints, keep clear of the hazard,
 * the visitor and buildings, and show on the minimap as "driving".
 * Built from primitives (offline-safe). */
import * as THREE from 'three';
import type { EnvVehicle } from './EnvSim';

export type TrafficKind = 'car' | 'heli' | 'sub' | 'ship';

interface Agent {
  kind: TrafficKind;
  group: THREE.Group;
  wheels: THREE.Object3D[];
  rotor: THREE.Object3D | null;
  prop: THREE.Object3D | null;
  thrust?: (k: number, dt: number) => void;
  x: number; y: number; z: number; yaw: number;
  tx: number; ty: number; tz: number;
  home: { x: number; y: number; z: number };
  speed: number;
  retarget: number;
}

export interface TrafficWorld {
  half: number;
  groundAt: (x: number, z: number) => number;
  colliders: readonly { x: number; z: number; r: number; top?: number }[];
  hazard: { x: number; z: number };
  player: { x: number; y: number; z: number };
}

const glass = () => new THREE.MeshStandardMaterial({ color: 0x0b1e33, roughness: 0.15, metalness: 0.6 });
const dark = () => new THREE.MeshLambertMaterial({ color: 0x2a2f38 });

/** Boxy hatchback (faces +z). */
export function buildCarModel(color: number): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 6.5), paint);
  body.position.y = 1.15;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 3.2), glass());
  cabin.position.set(0, 2.15, -0.3);
  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.6, 12);
  const tyre = dark();
  for (const [wx, wz] of [[-1.7, 2.2], [1.7, 2.2], [-1.7, -2.2], [1.7, -2.2]] as const) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.7, wz);
    wheels.push(w);
    g.add(w);
  }
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-1.1, 1.1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), lamp);
    head.position.set(hx, 1.1, 3.3);
    g.add(head);
  }
  g.add(body, cabin);
  g.scale.setScalar(1.5);
  return { group: g, wheels };
}

/** Light helicopter (faces +z), rotor returned for spinning. */
export function buildHeliModel(color: number): { group: THREE.Group; rotor: THREE.Group } {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 3, 4, 10), hull);
  body.rotation.x = Math.PI / 2;
  body.position.y = 2.2;
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 10), glass());
  cockpit.position.set(0, 2.4, 1.9);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 5.5, 8), hull);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 2.5, -4.2);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.9), hull);
  fin.position.set(0, 3.1, -6.8);
  const rotor = new THREE.Group();
  const blade = new THREE.BoxGeometry(9.5, 0.12, 0.7);
  const bladeM = new THREE.MeshLambertMaterial({ color: 0x1c2027 });
  const b2 = new THREE.Mesh(blade, bladeM);
  b2.rotation.y = Math.PI / 2;
  rotor.add(new THREE.Mesh(blade, bladeM), b2);
  rotor.position.y = 4.5;
  for (const sx of [-1.4, 1.4]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4.2), dark());
    skid.position.set(sx, 0.55, 0.4);
    g.add(skid);
  }
  g.add(body, cockpit, boom, fin, rotor);
  g.scale.setScalar(1.6);
  return { group: g, rotor };
}

const SPEED: Record<TrafficKind, number> = { car: 13, heli: 17, sub: 7, ship: 26 };
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Traffic {
  private agents: Agent[] = [];
  private rnd: () => number;

  constructor(private scene: THREE.Scene, seed = 7) {
    let s = seed >>> 0;
    this.rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  get count(): number { return this.agents.length; }

  private add(kind: TrafficKind, group: THREE.Group, home: { x: number; y: number; z: number },
    parts: { wheels?: THREE.Object3D[]; rotor?: THREE.Object3D | null; prop?: THREE.Object3D | null; thrust?: Agent['thrust'] } = {}): void {
    group.rotation.order = 'YXZ';
    if (!group.parent) this.scene.add(group);
    this.agents.push({
      kind, group, wheels: parts.wheels ?? [], rotor: parts.rotor ?? null, prop: parts.prop ?? null, thrust: parts.thrust,
      x: home.x, y: home.y, z: home.z, yaw: this.rnd() * Math.PI * 2,
      tx: home.x, ty: home.y, tz: home.z, home: { ...home }, speed: 0, retarget: 0,
    });
  }

  addCar(color: number, x: number, z: number): void {
    const m = buildCarModel(color);
    this.add('car', m.group, { x, y: 0, z }, { wheels: m.wheels });
  }
  addHeli(color: number, x: number, z: number): void {
    const m = buildHeliModel(color);
    this.add('heli', m.group, { x, y: 30, z }, { rotor: m.rotor });
  }
  /** A pack-built vehicle (sub / ship) flown by an NPC. */
  addPiloted(kind: 'sub' | 'ship', v: EnvVehicle, home: { x: number; y: number; z: number }): void {
    this.add(kind, v.group, home, { prop: v.prop ?? null, thrust: v.thrust });
  }

  setVisible(on: boolean): void { for (const a of this.agents) a.group.visible = on; }

  reset(): void {
    for (const a of this.agents) {
      a.x = a.home.x; a.y = a.home.y; a.z = a.home.z; a.speed = 0; a.retarget = 0;
      a.tx = a.x; a.ty = a.y; a.tz = a.z;
    }
  }

  /** Minimap markers. */
  positions(): { x: number; z: number; kind: TrafficKind }[] {
    return this.agents.filter((a) => a.group.visible).map((a) => ({ x: a.x, z: a.z, kind: a.kind }));
  }

  private pickTarget(a: Agent, w: TrafficWorld): void {
    const inner = a.kind === 'ship' ? 20 : 40;
    for (let k = 0; k < 8; k++) {
      const ang = this.rnd() * Math.PI * 2;
      const r = inner + this.rnd() * (w.half - inner - 30);
      const tx = Math.cos(ang) * r; const tz = Math.sin(ang) * r;
      // Keep well clear of the hazard (the ship in space doesn't care).
      if (a.kind !== 'ship' && Math.hypot(tx - w.hazard.x, tz - w.hazard.z) < 90) continue;
      a.tx = tx; a.tz = tz;
      break;
    }
    a.ty = a.kind === 'ship' ? 20 + this.rnd() * 70 : a.kind === 'sub' ? 3 + this.rnd() * 9 : 0;
    a.retarget = 10 + this.rnd() * 14;
  }

  update(dt: number, t: number, w: TrafficWorld): void {
    for (const a of this.agents) {
      if (!a.group.visible) continue;
      a.retarget -= dt;
      const dx = a.tx - a.x; const dz = a.tz - a.z;
      const flat = Math.hypot(dx, dz);
      if (flat < 12 || a.retarget <= 0) this.pickTarget(a, w);

      // Turn toward the waypoint, then go; slow to a stop beside the visitor.
      const want = Math.atan2(dx, dz);
      const dyaw = wrap(want - a.yaw);
      a.yaw += dyaw * Math.min(1, dt * (a.kind === 'car' ? 1.6 : 1.1));
      const near = Math.hypot(w.player.x - a.x, w.player.z - a.z) < (a.kind === 'car' ? 9 : 0);
      const goal = near ? 0 : SPEED[a.kind] * (0.35 + 0.65 * Math.max(0, Math.cos(dyaw)));
      a.speed += (goal - a.speed) * Math.min(1, dt * 1.5);
      let nx = a.x + Math.sin(a.yaw) * a.speed * dt;
      let nz = a.z + Math.cos(a.yaw) * a.speed * dt;
      nx = Math.max(-w.half, Math.min(w.half, nx));
      nz = Math.max(-w.half, Math.min(w.half, nz));
      if (a.kind === 'car') {
        // Slide around buildings / trees like everyone else.
        for (const c of w.colliders) {
          const ox = nx - c.x; const oz = nz - c.z; const d = Math.hypot(ox, oz); const r = c.r + 3;
          if (d < r && d > 1e-6) { nx = c.x + (ox / d) * r; nz = c.z + (oz / d) * r; }
        }
      }
      a.x = nx; a.z = nz;

      if (a.kind === 'car') {
        a.y = w.groundAt(a.x, a.z);
        for (const wh of a.wheels) wh.rotation.x += a.speed * dt * 1.1;
        a.group.rotation.set(0, a.yaw, 0);
      } else if (a.kind === 'heli') {
        a.y += (w.groundAt(a.x, a.z) + 30 - a.y) * Math.min(1, dt * 0.8);
        if (a.rotor) a.rotor.rotation.y += dt * 22;
        a.group.rotation.set(Math.min(0.18, a.speed * 0.012), a.yaw, -dyaw * 0.25);
      } else if (a.kind === 'sub') {
        a.y += (a.ty + Math.sin(t * 0.6) * 0.6 - a.y) * Math.min(1, dt * 0.5);
        if (a.prop) a.prop.rotation.z += dt * (4 + a.speed * 2);
        a.group.rotation.set(0, a.yaw, 0);
      } else {
        a.y += (a.ty - a.y) * Math.min(1, dt * 0.4);
        a.thrust?.(Math.min(1, a.speed / SPEED.ship), dt);
        a.group.rotation.set(-(a.ty - a.y) * 0.01, a.yaw, -dyaw * 0.5);
      }
      a.group.position.set(a.x, a.y, a.z);
    }
  }
}
