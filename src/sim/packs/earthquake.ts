/* Earthquake pack — downtown block with real structural damage: buildings
 * crack, lean, and pancake into rubble piles; cars flip; lamps and power
 * poles topple; the epicenter opens into a chasm; liquefaction pools spread
 * and settle foundations; dust bursts and debris fly; broken gas lines
 * ignite fires in the ruins. Driven by the runner's tremor envelope
 * (v._tremor 0..1) and magnitude (v.magnitude, Mw sim).
 */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';

export const earthquakePalette: EnvPalette = {
  ground: '#4c4c52', speckle: '#6a6a72', sky: 0x1c2230, fog: 0x1c2230,
  fogNear: 110, fogFar: 540, hemiSky: 0x8fa0bd, hemiGround: 0x33333a, sun: 0xb9c6dd,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const FACADES = ['#3d4457', '#54483d', '#3d5450'];

/** Facade texture with a window grid; `broken` fraction shows shattered panes. */
function facadeTexture(hex: string, broken: number, rnd: () => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = hex; g.fillRect(0, 0, 64, 128);
  const rows = 9; const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x0 = 5 + k * 12; const y0 = 8 + r * 13;
      const roll = rnd();
      g.fillStyle = roll < broken ? '#0b0d12' : roll < broken + 0.22 ? '#ffd98a' : '#63708a';
      g.fillRect(x0, y0, 8, 8);
    }
  }
  return new THREE.CanvasTexture(c);
}

interface Building {
  piv: THREE.Group; tower: THREE.Group; body: THREE.Mesh;
  x: number; z: number; w: number; h: number; ci: number;
  phase: number; sway: number; strength: number; leanX: number; leanZ: number;
  damage: number; ruined: boolean; collapseT: number; texLevel: number;
  pile: THREE.Group; nearPool: number;
  fire: THREE.Group; fireLight: THREE.PointLight; fireOn: boolean; igniteAt: number;
}

interface Car { grp: THREE.Group; homeY: number; phase: number; flipped: boolean; flipDir: number; flipT: number; x: number; z: number }
interface Lamp { grp: THREE.Group; phase: number; x: number; z: number; fall: number; fallDir: number; dmg: number }

export function earthquakeFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(702);
  const qi = ctx.quality === 'low' ? 0 : ctx.quality === 'medium' ? 1 : 2;
  const rm = ctx.reduceMotion ? 0.55 : 1; // animation-speed scale under reduce-motion

  // Nine shared facade textures: 3 colors × 3 damage levels.
  const tex: THREE.CanvasTexture[][] = FACADES.map((hex, i) => [
    facadeTexture(hex, 0.04, rand(11 + i * 101)),
    facadeTexture(hex, 0.32, rand(23 + i * 101)),
    facadeTexture(hex, 0.68, rand(37 + i * 101)),
  ]);

  const poolSpots: [number, number][] = [
    [0, 0], [58, 7], [-66, -9], [9, 84], [-11, -100], [140, 11], [-155, -7], [7, 180],
  ];

  // ---- Buildings: stacked story body + rooftop, base-pivot for lean/sway. --
  const buildings: Building[] = [];
  let tries = 0;
  while (buildings.length < 14 && tries < 120) {
    tries++;
    const x = (rnd() * 2 - 1) * 200;
    const z = (rnd() * 2 - 1) * 200;
    if (Math.hypot(x, z) < 60 || Math.abs(x) < 24 || Math.abs(z) < 24) continue;
    const w = 10 + rnd() * 12;
    const h = 14 + rnd() * 30;
    const ci = buildings.length % 3;

    const piv = new THREE.Group();
    piv.position.set(x, 0, z);
    const tower = new THREE.Group();
    piv.add(tower);

    const bodyMat = new THREE.MeshLambertMaterial({ map: tex[ci][0] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bodyMat);
    body.position.y = h / 2;
    tower.add(body);

    // Rooftop slab + occasional antenna/water tower.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.55, 1.2, w * 0.55),
      new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
    );
    roof.position.y = h + 0.6;
    tower.add(roof);
    if (h > 28 && rnd() < 0.6) {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 4.5, 5),
        new THREE.MeshLambertMaterial({ color: 0x8892a0 }),
      );
      ant.position.y = h + 3.4;
      tower.add(ant);
    } else if (rnd() < 0.4) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 2.4, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a5560 }),
      );
      tank.position.y = h + 2.4;
      tower.add(tank);
    }

    // Hidden rubble pile revealed at collapse.
    const pile = new THREE.Group();
    const chunkMat = new THREE.MeshLambertMaterial({ color: 0x6e6a63 });
    for (let k = 0; k < 7; k++) {
      const cw = 1.6 + rnd() * (w * 0.28);
      const ch = 0.7 + rnd() * 1.6;
      const cm = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cw * (0.6 + rnd() * 0.6)), chunkMat);
      const a = rnd() * Math.PI * 2; const rr = rnd() * w * 0.55;
      cm.position.set(Math.cos(a) * rr, ch / 2 + rnd() * 0.6, Math.sin(a) * rr);
      cm.rotation.set(rnd() * 0.5, rnd() * Math.PI, rnd() * 0.5);
      pile.add(cm);
    }
    pile.visible = false;
    piv.add(pile);

    // Hidden fire (broken gas line) + light, ignites after collapse at M≥6.
    const fire = new THREE.Group();
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 7),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 }),
    );
    flame.position.y = 1.1;
    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.4, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 }),
    );
    flameCore.position.y = 0.9;
    const fireLight = new THREE.PointLight(0xff9040, 0, 34, 2);
    fireLight.position.y = 2.2;
    fire.add(flame, flameCore, fireLight);
    const fa = rnd() * Math.PI * 2;
    fire.position.set(Math.cos(fa) * w * 0.5, 0.2, Math.sin(fa) * w * 0.5);
    fire.visible = false;
    piv.add(fire);

    scene.add(piv);
    const nearPool = poolSpots.reduce((m, s) => Math.min(m, 1 - clamp01(Math.hypot(s[0] - x, s[1] - z) / 30)), 1);
    buildings.push({
      piv, tower, body, x, z, w, h, ci,
      phase: rnd() * Math.PI * 2,
      sway: 0.55 + (h / 42) * 0.95,
      strength: Math.min(0.95, Math.max(0.18, 0.3 + rnd() * 0.7 - ((h - 14) / 30) * 0.25)),
      leanX: (rnd() * 2 - 1), leanZ: (rnd() * 2 - 1),
      damage: 0, ruined: false, collapseT: 0, texLevel: 0,
      pile, nearPool, fire, fireLight, fireOn: false, igniteAt: 0,
    });
    ctx.addCollider(x, z, w * 0.72 + 2);
  }

  // ---- Cars parked along the street bands. -------------------------------
  const carSpots: [number, number][] = [
    [40, 10], [-70, -12], [12, 90], [-10, -130], [110, 14], [-140, -8], [8, 150], [-9, -60],
  ];
  const carColors = [0x8a3030, 0x30508a, 0x8a7a30, 0x3a6a4a, 0x6a4a7a, 0x7a5a30];
  const cars: Car[] = [];
  for (let i = 0; i < carSpots.length; i++) {
    const [x, z] = carSpots[i];
    const grp = new THREE.Group();
    const col = carColors[i % carColors.length];
    const bodyM = new THREE.MeshLambertMaterial({ color: col });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 3.6), bodyM);
    body.position.y = 0.75;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.8), new THREE.MeshLambertMaterial({ color: 0x1c2430 }));
    cabin.position.set(0, 1.45, -0.2);
    const wheelM = new THREE.MeshLambertMaterial({ color: 0x14161a });
    for (const [wx, wz] of [[-0.8, 1.1], [0.8, 1.1], [-0.8, -1.1], [0.8, -1.1]] as const) {
      const wm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.55), wheelM);
      wm.position.set(wx, 0.3, wz);
      grp.add(wm);
    }
    grp.add(body, cabin);
    grp.position.set(x, 0, z);
    grp.rotation.y = Math.abs(z) > Math.abs(x) ? Math.PI / 2 : 0;
    scene.add(grp);
    cars.push({ grp, homeY: 0, phase: rnd() * Math.PI * 2, flipped: false, flipDir: 1, flipT: 0, x, z });
  }

  // ---- Street lamps (rattle, topple near collapses). ----------------------
  const lamps: Lamp[] = [];
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f343c });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.6;
    const x = Math.cos(a) * (50 + rnd() * 110);
    const z = Math.sin(a) * (50 + rnd() * 110);
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 6), poleMat);
    pole.position.y = 4.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), headMat);
    head.position.y = 9.2;
    lamp.add(pole, head);
    lamp.position.set(x, 0, z);
    lamps.push({ grp: lamp, phase: rnd() * Math.PI * 2, x, z, fall: 0, fallDir: rnd() < 0.5 ? -1 : 1, dmg: 0 });
    scene.add(lamp);
  }

  // ---- Power pole carrying the sparking transformer. ---------------------
  const poleGrp = new THREE.Group();
  const pPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 12, 6), poleMat);
  pPole.position.y = 6;
  const pArm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 0.28), headMat);
  pArm.position.y = 11.4;
  const spark = new THREE.PointLight(0xffe0a0, 0, 80, 2);
  spark.position.y = 10.6;
  const sparkPos = new THREE.Vector3(60, 0, -40);
  poleGrp.add(pPole, pArm, spark);
  poleGrp.position.copy(sparkPos);
  scene.add(poleGrp);
  let poleFall = 0; let poleDmg = 0;

  // ---- Epicenter chasm + radiating cracks. --------------------------------
  const chasm = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.5, 3.4),
    new THREE.MeshBasicMaterial({ color: 0x07070a, transparent: true, opacity: 0 }),
  );
  chasm.position.set(0, 0.06, 0);
  chasm.rotation.y = 0.4;
  scene.add(chasm);

  const cracks: THREE.Mesh[] = [];
  const crackMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0 });
  for (let i = 0; i < 9; i++) {
    const len = 30 + rnd() * 60;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len), crackMat);
    c.rotation.x = -Math.PI / 2;
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
    c.position.set(Math.cos(a) * (len / 2 + 8), 0.25, Math.sin(a) * (len / 2 + 8));
    c.rotation.z = -a + Math.PI / 2;
    cracks.push(c);
    scene.add(c);
  }

  // ---- Liquefaction pools + sand boils. -----------------------------------
  const PNT = [3, 5, 8][qi];
  const pools: { m: THREE.Mesh; maxR: number; stagger: number }[] = [];
  for (let i = 0; i < PNT; i++) {
    const spot = poolSpots[i % poolSpots.length];
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1, 18),
      new THREE.MeshBasicMaterial({ color: 0x3a5a6a, transparent: true, opacity: 0, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(spot[0], 0.26, spot[1]);
    scene.add(m);
    pools.push({ m, maxR: 11 + rnd() * 13, stagger: (i / Math.max(1, PNT)) * 0.55 });
  }
  const boils: THREE.Mesh[] = [];
  const boilMat = new THREE.MeshLambertMaterial({ color: 0x8a8060 });
  for (let i = 0; i < 3; i++) {
    const spot = poolSpots[(i * 2 + 1) % poolSpots.length];
    const b = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 8), boilMat);
    b.position.set(spot[0] + 6 + rnd() * 5, 0, spot[1] - 4 - rnd() * 4);
    b.scale.setScalar(0.001);
    scene.add(b);
    boils.push(b);
  }
  let poolLv = 0;

  // ---- Ambient dust (slow rising haze during shaking). --------------------
  const DN = Math.floor(320 * (qi === 0 ? 0.5 : 1));
  const dg = new THREE.BufferGeometry();
  const dp = new THREE.BufferAttribute(new Float32Array(DN * 3), 3);
  const dv = new Float32Array(DN);
  dg.setAttribute('position', dp);
  for (let i = 0; i < DN; i++) {
    dp.setXYZ(i, (rnd() * 2 - 1) * 120, rnd() * 4, (rnd() * 2 - 1) * 120);
    dv[i] = 2 + rnd() * 5;
  }
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x9a938a, size: 2.2, transparent: true, opacity: 0 }));
  scene.add(dust);

  // ---- Dust-burst pool (collapse / crash puffs). --------------------------
  const BN = [140, 220, 300][qi];
  const bg = new THREE.BufferGeometry();
  const bp = new THREE.BufferAttribute(new Float32Array(BN * 3), 3);
  const bvel = new Float32Array(BN * 3);
  const blife = new Float32Array(BN);
  bg.setAttribute('position', bp);
  for (let i = 0; i < BN; i++) bp.setXYZ(i, 0, -999, 0);
  const burstPts = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xa8a096, size: 2.6, transparent: true, opacity: 0.65, depthWrite: false }));
  scene.add(burstPts);
  let burstCursor = 0;
  const burst = (x: number, z: number, n: number) => {
    const count = Math.floor(n * (ctx.reduceMotion ? 0.5 : 1));
    for (let k = 0; k < count; k++) {
      const i = burstCursor; burstCursor = (burstCursor + 1) % BN;
      bp.setXYZ(i, x + (rnd() * 2 - 1) * 4, 0.6 + rnd() * 2.5, z + (rnd() * 2 - 1) * 4);
      const a = rnd() * Math.PI * 2; const sp = 2 + rnd() * 5;
      bvel[i * 3] = Math.cos(a) * sp; bvel[i * 3 + 1] = 3.5 + rnd() * 5.5; bvel[i * 3 + 2] = Math.sin(a) * sp;
      blife[i] = 1;
    }
  };

  // ---- Debris chunks ( ballistic concrete pieces flung by collapses ). ----
  const CN = [10, 16, 24][qi];
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMat = new THREE.MeshLambertMaterial({ color: 0x7a756c });
  const debris: { m: THREE.Mesh; vx: number; vy: number; vz: number; spin: number; landed: boolean }[] = [];
  for (let i = 0; i < CN; i++) {
    const m = new THREE.Mesh(chunkGeo, debrisMat);
    const s = 0.5 + rnd() * 0.9;
    m.scale.set(s, s * (0.6 + rnd() * 0.5), s * (0.7 + rnd() * 0.5));
    m.position.set(0, -999, 0);
    m.visible = false;
    scene.add(m);
    debris.push({ m, vx: 0, vy: 0, vz: 0, spin: 0, landed: false });
  }
  let debrisCursor = 0;
  const launchDebris = (x: number, z: number, h: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const d = debris[debrisCursor]; debrisCursor = (debrisCursor + 1) % CN;
      d.m.position.set(x + (rnd() * 2 - 1) * 3, h * (0.4 + rnd() * 0.5), z + (rnd() * 2 - 1) * 3);
      const a = rnd() * Math.PI * 2; const sp = 3 + rnd() * 7;
      d.vx = Math.cos(a) * sp; d.vz = Math.sin(a) * sp; d.vy = 2 + rnd() * 4;
      d.spin = (rnd() * 2 - 1) * 6;
      d.landed = false;
      d.m.visible = true;
    }
  };

  // ---- Smoke from fires (small shared pool). ------------------------------
  const SN = 90;
  const sg = new THREE.BufferGeometry();
  const sp = new THREE.BufferAttribute(new Float32Array(SN * 3), 3);
  const svel = new Float32Array(SN);
  const slife = new Float32Array(SN);
  sg.setAttribute('position', sp);
  for (let i = 0; i < SN; i++) sp.setXYZ(i, 0, -999, 0);
  const smoke = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x4a4a52, size: 2.0, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(smoke);
  let smokeCursor = 0; let smokeAcc = 0;
  const puffSmoke = (x: number, z: number) => {
    const i = smokeCursor; smokeCursor = (smokeCursor + 1) % SN;
    sp.setXYZ(i, x + (rnd() * 2 - 1) * 1.5, 1.5 + rnd(), z + (rnd() * 2 - 1) * 1.5);
    svel[i] = 1.6 + rnd() * 2.2;
    slife[i] = 1;
  };

  // ---- Roof-tile rubble rain (kept from the original pack). ---------------
  const RD = Math.floor(130 * (qi === 0 ? 0.5 : 1));
  const rg = new THREE.BufferGeometry();
  const rp = new THREE.BufferAttribute(new Float32Array(RD * 3), 3);
  const rv = new Float32Array(RD);
  rg.setAttribute('position', rp);
  for (let i = 0; i < RD; i++) {
    rp.setXYZ(i, (rnd() * 2 - 1) * 170, rnd() * 26, (rnd() * 2 - 1) * 170);
    rv[i] = 6 + rnd() * 10;
  }
  const rubble = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0x9a938a, size: 1.2, transparent: true, opacity: 0 }));
  scene.add(rubble);

  // ---- Collapse handler. ---------------------------------------------------
  const collapse = (b: Building) => {
    b.ruined = true;
    b.collapseT = 0;
    b.pile.visible = true;
    b.pile.scale.setScalar(0.01);
    burst(b.x, b.z, 46);
    launchDebris(b.x, b.z, b.h, 7);
    // Flip nearby cars, topple nearby lamps.
    for (const c of cars) {
      if (!c.flipped && Math.hypot(c.x - b.x, c.z - b.z) < 28) {
        c.flipped = true; c.flipDir = rnd() < 0.5 ? -1 : 1; c.flipT = 0;
      }
    }
    for (const l of lamps) {
      if (l.fall < 0.02 && Math.hypot(l.x - b.x, l.z - b.z) < 22) l.fall = 0.001;
    }
  };

  return {
    update: (dt, t, v) => {
      const mag = v.magnitude ?? 5.5;
      const tremor = v._tremor ?? 0;
      const mN = (mag - 3) / 5.5;
      const intensity = mN * tremor;

      // Ground cracks keep a permanent footprint after big quakes; they widen
      // and stretch with the live tremor. The epicenter opens into a chasm.
      crackMat.opacity = Math.min(0.9, mN * 0.9);
      for (const c of cracks) {
        c.scale.x = 0.5 + mN * 0.9 + tremor * 0.85;
        c.scale.y = 1 + mN * 0.25 + tremor * 0.32;
      }
      const chasmMat = chasm.material as THREE.MeshBasicMaterial;
      chasmMat.opacity = Math.min(0.95, mN * 0.55 + tremor * mN * 0.4);
      chasm.scale.x = 0.15 + mN * 1.35 + tremor * 0.18 * mN;
      chasm.scale.z = 1 + tremor * 0.35;

      // Liquefaction: builds during sustained strong shaking (M ≥ 6), spreads
      // patch-by-patch, recedes slowly; sand boils pop up at the edges.
      if (mag >= 6 && tremor > 0.45) poolLv = Math.min(1, poolLv + dt * 0.16 * tremor * mN);
      else poolLv = Math.max(0, poolLv - dt * 0.035);
      for (const p of pools) {
        const local = clamp01((poolLv - p.stagger) / 0.4);
        const s = local * p.maxR;
        p.m.scale.set(s, s, 1);
        (p.m.material as THREE.MeshBasicMaterial).opacity = local * 0.34;
      }
      for (const b of boils) b.scale.set(0.001 + poolLv * 1.2, 0.001 + poolLv, 0.001 + poolLv * 1.2);

      // ---- Buildings: sway + accumulating damage + pancake collapse. ------
      const swayAmp = intensity * 0.042 * (ctx.reduceMotion ? 0.4 : 1);
      const swayFx = 2.4 + mN * 2.2;
      for (const b of buildings) {
        if (!b.ruined) {
          // Damage accrues while shaking exceeds this building's threshold.
          const local = intensity * (0.55 + 0.45 * b.sway) * (1 + b.nearPool * poolLv * 0.8);
          const failAt = 0.1 + b.strength * 0.45;
          if (local > failAt) {
            b.damage = Math.min(1, b.damage + dt * (local - failAt) * (1.5 / Math.max(0.25, b.strength)) * (ctx.reduceMotion ? 0.6 : 1));
          }
          // Liquefaction settlement sinks foundations even without peak shaking.
          if (b.nearPool > 0 && poolLv > 0.35) {
            b.damage = Math.min(1, b.damage + dt * 0.04 * poolLv * b.nearPool);
            b.piv.position.y = -poolLv * 0.9 * b.nearPool;
          }
          // Swap the facade texture as windows shatter.
          const lvl = b.damage < 0.33 ? 0 : b.damage < 0.7 ? 1 : 2;
          if (lvl !== b.texLevel) {
            b.texLevel = lvl;
            const mats = b.body.material as THREE.MeshLambertMaterial;
            mats.map = tex[b.ci][lvl];
            mats.needsUpdate = true;
          }
          // Permanent lean grows through the damaged range; dynamic sway on top.
          const lean = clamp01((b.damage - 0.35) / 0.65) * 0.24;
          b.piv.rotation.x = b.leanX * lean + Math.sin(t * swayFx + b.phase) * swayAmp * b.sway;
          b.piv.rotation.z = b.leanZ * lean + Math.cos(t * (swayFx * 0.86) + b.phase * 1.7) * swayAmp * b.sway * 0.72;
          if (b.damage >= 1) collapse(b);
        } else {
          // Pancake animation, then a settled ruin with rubble + possible fire.
          b.collapseT += dt;
          const CT = 1.1 / rm;
          const p = Math.min(1, b.collapseT / CT);
          const e = p * p;
          b.tower.scale.y = 1 - 0.9 * e;
          b.tower.rotation.x = b.leanX * 0.4 * e;
          b.tower.rotation.z = b.leanZ * 0.4 * e;
          b.tower.position.y = -b.h * 0.04 * e;
          b.pile.scale.setScalar(Math.min(1, 0.01 + e * 1.7));
          // Gas-fire ignition shortly after the collapse (M ≥ 6).
          if (!b.fireOn && mag >= 6 && b.collapseT > 0.01 && b.igniteAt === 0) {
            b.igniteAt = t + 2.2 + rnd() * 2.4;
          }
          if (!b.fireOn && b.igniteAt > 0 && t >= b.igniteAt) {
            b.fireOn = true;
            b.fire.visible = true;
          }
          if (b.fireOn) {
            const fl = 0.75 + Math.abs(Math.sin(t * 9 + b.phase)) * 0.55;
            b.fireLight.intensity = 90 * fl;
            b.fire.scale.set(fl * 0.9, fl, fl * 0.9);
            smokeAcc += dt;
            if (smokeAcc > 0.14) { smokeAcc = 0; puffSmoke(b.x + b.fire.position.x, b.z + b.fire.position.z); }
          }
        }
      }

      // ---- Cars: rattle while shaking; flip when a building comes down. ---
      for (const c of cars) {
        if (c.flipped) {
          c.flipT = Math.min(1, c.flipT + dt * 2.4 * rm);
          const e = c.flipT;
          c.grp.rotation.z = c.flipDir * 1.45 * e;
          c.grp.position.y = c.homeY + Math.sin(e * Math.PI) * 0.9;
        } else {
          c.grp.position.y = c.homeY + Math.abs(Math.sin(t * 11 + c.phase)) * intensity * 0.45;
          c.grp.rotation.z = Math.sin(t * 9 + c.phase) * intensity * 0.06;
        }
      }

      // ---- Lamps: rattle standing; accumulate damage and topple when
      //      shaken hard or a collapse lands nearby. -------------------------
      for (const l of lamps) {
        if (l.fall > 0) {
          l.fall = Math.min(1, l.fall + dt * 1.8 * rm);
          l.grp.rotation.x = l.fallDir * 1.5 * l.fall;
          l.grp.rotation.z = 0;
        } else {
          l.grp.rotation.z = Math.sin(t * 7 + l.phase) * tremor * 0.22;
          l.grp.rotation.x = Math.cos(t * 6.3 + l.phase) * tremor * 0.16;
          if (intensity > 0.5) l.dmg = Math.min(1, l.dmg + dt * (intensity - 0.5) * 2.4);
          if (l.dmg >= 1) l.fall = 0.001;
        }
      }

      // ---- Power pole: accumulate damage, fall, kill the spark. -----------
      if (poleFall < 1) {
        if (intensity > 0.55) poleDmg = Math.min(1, poleDmg + dt * (intensity - 0.55) * 2.2);
        if (poleDmg >= 1) {
          poleFall = 0.001;
          burst(sparkPos.x, sparkPos.z, 18);
        }
      } else {
        poleFall = Math.min(1, poleFall + dt * 1.6 * rm);
        poleGrp.rotation.z = 1.45 * poleFall;
      }
      spark.intensity = poleFall === 0 ? tremor * (140 + 260 * Math.abs(Math.sin(t * 23))) : 0;

      // ---- Ambient dust haze. ---------------------------------------------
      const dmat = dust.material as THREE.PointsMaterial;
      dmat.opacity = tremor * 0.55;
      if (tremor > 0.02) {
        for (let i = 0; i < DN; i++) {
          let y = dp.getY(i) + dv[i] * dt * (0.5 + tremor) * rm;
          if (y > 14) y = 0;
          dp.setY(i, y);
          dp.setX(i, dp.getX(i) + Math.sin(t * 3 + i) * dt * 2);
        }
        dp.needsUpdate = true;
      }

      // ---- Dust bursts (collapse puffs) drift outward and fade. -----------
      let burstAlive = false;
      for (let i = 0; i < BN; i++) {
        if (blife[i] <= 0) continue;
        burstAlive = true;
        blife[i] -= dt * 0.42;
        bp.setX(i, bp.getX(i) + bvel[i * 3] * dt);
        bp.setY(i, bp.getY(i) + bvel[i * 3 + 1] * dt);
        bp.setZ(i, bp.getZ(i) + bvel[i * 3 + 2] * dt);
        bvel[i * 3] *= 1 - dt * 1.6;
        bvel[i * 3 + 1] = bvel[i * 3 + 1] * (1 - dt * 1.1) + dt * 0.4; // settle
        bvel[i * 3 + 2] *= 1 - dt * 1.6;
        if (blife[i] <= 0) bp.setY(i, -999);
      }
      bp.needsUpdate = true;
      (burstPts.material as THREE.PointsMaterial).opacity = burstAlive ? 0.65 : 0;

      // ---- Smoke rises from burning ruins. ---------------------------------
      let smokeAlive = false;
      for (let i = 0; i < SN; i++) {
        if (slife[i] <= 0) continue;
        smokeAlive = true;
        slife[i] -= dt * 0.3;
        sp.setY(i, sp.getY(i) + svel[i] * dt);
        sp.setX(i, sp.getX(i) + Math.sin(t * 1.7 + i) * dt * 0.8);
        if (slife[i] <= 0) sp.setY(i, -999);
      }
      sp.needsUpdate = true;
      (smoke.material as THREE.PointsMaterial).opacity = smokeAlive ? 0.5 : 0;

      // ---- Debris chunks: ballistic flight, then rest in the street. ------
      for (const d of debris) {
        if (!d.m.visible || d.landed) continue;
        d.vy -= 18 * dt;
        d.m.position.x += d.vx * dt;
        d.m.position.y += d.vy * dt;
        d.m.position.z += d.vz * dt;
        d.m.rotation.x += d.spin * dt;
        d.m.rotation.z += d.spin * 0.7 * dt;
        if (d.m.position.y < 0.3) { d.m.position.y = 0.3; d.landed = true; }
      }

      // ---- Roof tiles and rivets rain during the shaking. ------------------
      (rubble.material as THREE.PointsMaterial).opacity = tremor * 0.7;
      if (tremor > 0.02) {
        for (let i = 0; i < RD; i++) {
          let y = rp.getY(i) - rv[i] * dt * (0.6 + tremor);
          if (y < 0.4) { y = 16 + rnd() * 16; rp.setX(i, (rnd() * 2 - 1) * 170); rp.setZ(i, (rnd() * 2 - 1) * 170); }
          rp.setY(i, y);
        }
        rp.needsUpdate = true;
      }
    },

    reset: () => {
      for (const b of buildings) {
        b.damage = 0; b.ruined = false; b.collapseT = 0; b.texLevel = 0; b.igniteAt = 0; b.fireOn = false;
        b.piv.rotation.set(0, 0, 0);
        b.piv.position.y = 0;
        b.tower.scale.set(1, 1, 1);
        b.tower.position.set(0, 0, 0);
        b.pile.visible = false;
        b.pile.scale.setScalar(1);
        b.fire.visible = false;
        b.fireLight.intensity = 0;
        const mats = b.body.material as THREE.MeshLambertMaterial;
        mats.map = tex[b.ci][0];
        mats.needsUpdate = true;
      }
      for (const c of cars) {
        c.flipped = false; c.flipT = 0;
        c.grp.rotation.set(0, Math.abs(c.z) > Math.abs(c.x) ? Math.PI / 2 : 0, 0);
        c.grp.position.y = c.homeY;
      }
      for (const l of lamps) { l.fall = 0; l.dmg = 0; l.grp.rotation.set(0, 0, 0); }
      poleFall = 0; poleDmg = 0; poleGrp.rotation.set(0, 0, 0);
      spark.intensity = 0;
      poolLv = 0;
      chasm.scale.set(1, 1, 1);
      (chasm.material as THREE.MeshBasicMaterial).opacity = 0;
      for (const b of boils) b.scale.setScalar(0.001);
      for (let i = 0; i < BN; i++) { blife[i] = 0; bp.setY(i, -999); }
      bp.needsUpdate = true;
      for (const d of debris) { d.m.visible = false; d.landed = false; d.m.position.set(0, -999, 0); }
      for (let i = 0; i < SN; i++) { slife[i] = 0; sp.setY(i, -999); }
      sp.needsUpdate = true;
    },
  };
}
