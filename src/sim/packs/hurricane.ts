/* Hurricane pack — spiral eyewall + rain bands + surf for the shared EnvSim. */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { WORLD } from '../stormTypes';
import { buildHouse, PALETTES } from './buildings';

export const hurricanePalette: EnvPalette = {
  ground: '#3d4a3a', speckle: '#5a6b52', sky: 0x2a3648, fog: 0x2a3648,
  fogNear: 100, fogFar: 560, hemiSky: 0x9fb4cc, hemiGround: 0x2c3a2c, sun: 0xaFC4e0,
};

function points(n: number, color: number, size: number, opacity: number): { pts: THREE.Points; pos: THREE.BufferAttribute } {
  const g = new THREE.BufferGeometry();
  const a = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  g.setAttribute('position', a);
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity }));
  return { pts, pos: a };
}

/** Radius of maximum wind — the eyewall (virtual meters). */
const RMW = 38;

/**
 * Surface wind of a Northern-Hemisphere hurricane at (dx, dz) from the eye:
 * counter-clockwise rotation, ~20° inflow toward the centre, a calm eye
 * (solid-body core inside the RMW) and a modified-Rankine decay outside it.
 * The storm's forward motion adds on the right-hand side, so the right-front
 * quadrant blows hardest. Returns velocity in world units / s.
 */
export function hurricaneWind(dx: number, dz: number, vmax: number, motionX: number, motionZ: number): { x: number; z: number } {
  const r = Math.hypot(dx, dz);
  if (r < 1e-3) return { x: motionX, z: motionZ };
  const v = r < RMW ? vmax * (r / RMW) : vmax * Math.pow(RMW / r, 0.5);
  const tx = dz / r; const tz = -dx / r;       // counter-clockwise tangent (from above)
  const ix = -dx / r; const iz = -dz / r;      // radial inflow
  const inflow = 0.36;                         // tan(20°)
  // Translation adds fully where tangent and motion align (right of track).
  return { x: (tx + ix * inflow) * v + motionX, z: (tz + iz * inflow) * v + motionZ };
}

export function hurricaneFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(501);
  const grp = new THREE.Group();

  // Eyewall: tall open cylinder + inner calm eye disc.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(46, 30, 120, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xb9c6da, transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 1 }),
  );
  wall.position.y = 60;
  const eye = new THREE.Mesh(
    new THREE.CircleGeometry(28, 32),
    new THREE.MeshBasicMaterial({ color: 0x3d5266, transparent: true, opacity: 0.85 }),
  );
  eye.rotation.x = -Math.PI / 2;
  eye.position.y = 0.3;
  // Spiral rain bands: 3 flat rings rotating at different rates.
  const bands: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(
      new THREE.RingGeometry(52 + i * 34, 74 + i * 34, 64, 1, 0, Math.PI * 1.2),
      new THREE.MeshBasicMaterial({ color: 0x8fa3bd, transparent: true, opacity: 0.4 - i * 0.08, side: THREE.DoubleSide }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.y = 2 + i * 1.5;
    bands.push(band);
    grp.add(band);
  }
  // Surf: pulsing disc around the eye.
  const surf = new THREE.Mesh(
    new THREE.CircleGeometry(60, 48),
    new THREE.MeshBasicMaterial({ color: 0x3f6f8f, transparent: true, opacity: 0.55 }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = 0.2;
  grp.add(wall, eye, surf);
  scene.add(grp);
  // The storm itself drifts (virtual meters), steering back near the coast.
  let hx = 0; let hz = 0; let hAngle = 0.6;

  // Rain streaks across the field.
  const RN = Math.floor(700 * (ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.8 : 1));
  const rain = points(RN, 0xbdd7ee, 0.8, 0.65);
  for (let i = 0; i < RN; i++) {
    rain.pos.setXYZ(i, (rnd() * 2 - 1) * WORLD.halfSize, 5 + rnd() * 55, (rnd() * 2 - 1) * WORLD.halfSize);
  }
  scene.add(rain.pts);

  // Rugged coastal town: blocky homes + palms (trunk + crossed planes).
  const homes: { x: number; z: number; h: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const x = (rnd() * 2 - 1) * 190;
    const z = 60 + rnd() * 150;
    if (Math.abs(x) < 22) continue;
    const h = 7 + rnd() * 8;
    // Coastal homes: pastel clapboard, gable roofs, facing the sea (−z).
    const home = buildHouse(rnd, { w: 12, d: 10, h, style: PALETTES.coastal[homes.length % PALETTES.coastal.length], roofColor: 0x6b7a8f });
    home.group.position.set(x, 0, z);
    home.group.rotation.y = Math.PI;
    scene.add(home.group);
    ctx.addCollider(x, z, 10);
    homes.push({ x, z, h });
  }

  // Rotating storm-cloud ceiling: broad arc rings high overhead with a clear
  // eye hole, parented to grp so they drift with the storm. Opacity and spin
  // track intensity + rainfall.
  const qLevel = ctx.quality === 'low' ? 0 : ctx.quality === 'medium' ? 1 : 2;
  const ceilSegs = [20, 28, 40][qLevel];
  const ceilMatA = new THREE.MeshBasicMaterial({ color: 0x74849a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const ceilingA = new THREE.Mesh(new THREE.RingGeometry(42, 250, ceilSegs, 1, 0, Math.PI * 1.35), ceilMatA);
  ceilingA.rotation.x = -Math.PI / 2;
  ceilingA.position.y = 108;
  ceilingA.scale.set(1.12, 0.94, 1);
  const ceilMatB = new THREE.MeshBasicMaterial({ color: 0x8a99ad, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const ceilingB = new THREE.Mesh(new THREE.RingGeometry(54, 300, ceilSegs, 1, 0, Math.PI * 1.6), ceilMatB);
  ceilingB.rotation.x = -Math.PI / 2;
  ceilingB.position.y = 126;
  ceilingB.scale.set(1.08, 0.96, 1);

  // Storm surge sheet: shallow flood creeping up the low coastal streets,
  // capped well short of the whole map and visually distinct from the surf disc.
  const surgeMat = new THREE.MeshBasicMaterial({ color: 0x2f5d78, transparent: true, opacity: 0, depthWrite: false });
  const surge = new THREE.Mesh(new THREE.PlaneGeometry(440, 130), surgeMat);
  surge.rotation.x = -Math.PI / 2;
  surge.position.set(0, 0.25, 200);
  grp.add(ceilingA, ceilingB);
  scene.add(surge);

  // Wind damage: two homes shed a roof panel above ~0.75 intensity. The panel
  // starts as an intact roof cap and peels off downwind when damage ramps in.
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x69748a });
  const damaged: { panel: THREE.Mesh; x: number; z: number; y: number }[] = [];
  const dmgIdx: number[] = [];
  if (homes.length > 0) dmgIdx.push(Math.floor(homes.length * 0.3));
  if (homes.length > 1) dmgIdx.push(Math.floor(homes.length * 0.7));
  for (const i of dmgIdx) {
    const hm = homes[i];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.55, 10.6), roofMat);
    panel.position.set(hm.x, hm.h + 0.28, hm.z);
    scene.add(panel);
    damaged.push({ panel, x: hm.x, z: hm.z, y: hm.h + 0.28 });
  }
  let dmgCur = 0;
  let snapCur = 0;

  // Palms that lean and thrash with the gusts. Each sits in a base-pivot
  // group so one can snap flat to the ground at high intensity.
  const palms: { pivot: THREE.Group; fronds: THREE.Group; trunk: THREE.Mesh; phase: number; x: number; z: number }[] = [];
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6e5a3f });
  const palmFrondMat = new THREE.MeshLambertMaterial({ color: 0x2e7b4f, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const x = -180 + i * 52 + rnd() * 12;
    const z = 70 + rnd() * 90;
    if (Math.abs(x) < 26 && z < 100) continue;
    const h = 8 + rnd() * 5;
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, h, 6), palmTrunkMat);
    trunk.position.set(0, h / 2, 0);
    const fronds = new THREE.Group();
    fronds.position.set(0, h, 0);
    for (let f = 0; f < 6; f++) {
      const holder = new THREE.Group();
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5.5), palmFrondMat);
      frond.rotation.x = -1.15;
      frond.position.set(0, 0.5, 2.7);
      holder.rotation.y = (f / 6) * Math.PI * 2;
      holder.add(frond);
      fronds.add(holder);
    }
    palms.push({ pivot, fronds, trunk, phase: rnd() * Math.PI * 2, x, z });
    scene.add(pivot);
    ctx.addCollider(x, z, 1.4);
  }

  // Wind-blown debris streaming downwind of the eyewall.
  const DN = Math.floor(110 * (ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.8 : 1));
  const dbg = new THREE.BufferGeometry();
  const dbp = new THREE.BufferAttribute(new Float32Array(DN * 3), 3);
  dbg.setAttribute('position', dbp);
  for (let i = 0; i < DN; i++) dbp.setXYZ(i, (rnd() * 2 - 1) * WORLD.halfSize, 1 + rnd() * 30, (rnd() * 2 - 1) * WORLD.halfSize);
  const debris = new THREE.Points(dbg, new THREE.PointsMaterial({ color: 0xd8e0e8, size: 1.4, transparent: true, opacity: 0.7 }));
  scene.add(debris);

  // Foam rings expanding outward across the surf disc.
  const foamRings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xe8f4fa, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.35;
    foamRings.push(ring);
    grp.add(ring);
  }

  return {
    update: (dt, t, v) => {
      const inten = v.intensity ?? 0.6;
      const dirRad = ((v.direction ?? 40) * Math.PI) / 180;
      // The eye wanders the coast — audio distances, NPCs, and the minimap
      // event all follow it via ctx.setHazard.
      hAngle += dt * 0.25 * Math.sin(t / 9);
      const drift = 1.5 + inten * 4.5;
      hx += Math.cos(hAngle) * drift * dt;
      hz += Math.sin(hAngle * 0.8) * drift * dt;
      if (Math.hypot(hx, hz) > 80) {
        hAngle = Math.atan2(-hz, -hx) + (rnd() - 0.5) * 0.6;
        hx = Math.min(70, Math.max(-70, hx));
        hz = Math.min(70, Math.max(-70, hz));
      }
      grp.position.set(hx, 0, hz);
      ctx.setHazard(hx, hz);
      wall.rotation.y += dt * (0.6 + inten * 2.4);
      bands.forEach((b, i) => { b.rotation.z += dt * (0.25 + inten * (0.9 - i * 0.2)); });
      // Storm ceiling thickens with intensity + rainfall and spins slowly
      // (amplitude damped under reduceMotion).
      const rainN = v.rainfall ?? 0.5;
      const ceilOp = Math.min(0.8, 0.1 + inten * 0.42 + rainN * 0.22);
      ceilMatA.opacity = ceilOp;
      ceilMatB.opacity = ceilOp * 0.55;
      const ceilSpin = (0.03 + inten * 0.09) * (ctx.reduceMotion ? 0.4 : 1);
      ceilingA.rotation.z += ceilSpin;
      ceilingB.rotation.z -= ceilSpin * 0.55;
      const pulse = 1 + Math.sin(t * 2.2) * 0.04 * inten;
      surf.scale.set(pulse, pulse, 1);
      // Storm surge advances inland with intensity & wind, rises a little,
      // and ripples gently — extent is capped so the map is never submerged.
      const windN = Math.min(1, Math.max(0, ((v.windKmh ?? 150) - 60) / 220));
      const surgeN = Math.min(1, inten * 0.8 + windN * 0.25);
      surge.scale.set(1 + Math.sin(t * 1.6) * 0.02 * surgeN * (ctx.reduceMotion ? 0.4 : 1), 0.55 + surgeN * 0.85, 1);
      surge.position.z = 215 - surgeN * 80;
      surge.position.y = 0.16 + surgeN * 0.5;
      surgeMat.opacity = surgeN * 0.4;
      // Local wind everywhere comes from the vortex around the moving eye.
      const vmax = 20 + inten * 60;
      const motionX = Math.cos(dirRad) * vmax * 0.12;
      const motionZ = Math.sin(dirRad) * vmax * 0.12;
      const windAt = (px: number, pz: number) => hurricaneWind(px - hx, pz - hz, vmax, motionX, motionZ);
      // Rain falls fast and is driven sideways by the local wind — almost
      // horizontal in the eyewall, nearly vertical in the calm eye.
      const fall = (30 + inten * 60) * dt;
      const drive = (0.25 + (v.rainfall ?? 0.5) * 0.45) * dt;
      for (let i = 0; i < RN; i++) {
        let y = rain.pos.getY(i) - fall;
        let x = rain.pos.getX(i);
        let z = rain.pos.getZ(i);
        const w = windAt(x, z);
        x += w.x * drive; z += w.z * drive;
        if (y < 0) { y = 60; x = (rnd() * 2 - 1) * WORLD.halfSize; z = (rnd() * 2 - 1) * WORLD.halfSize; }
        if (x > WORLD.halfSize) x = -WORLD.halfSize;
        if (x < -WORLD.halfSize) x = WORLD.halfSize;
        if (z > WORLD.halfSize) z = -WORLD.halfSize;
        if (z < -WORLD.halfSize) z = WORLD.halfSize;
        rain.pos.setXYZ(i, x, y, z);
      }
      rain.pos.needsUpdate = true;
      rain.pts.visible = (v.rainfall ?? 0.5) > 0.02;
      // Palms bend downwind of their *local* wind (which swings round as the
      // eye passes) and thrash harder near the eyewall; gusts come in waves.
      palms.forEach((p, pi) => {
        const w = windAt(p.x, p.z);
        const ws = Math.min(1.4, Math.hypot(w.x, w.z) / Math.max(1, vmax));
        if (!(pi === 0 && snapCur > 0.05)) {
          const want = Math.atan2(-w.z, w.x);   // local +x points downwind
          let d = want - p.pivot.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          p.pivot.rotation.y += d * Math.min(1, dt * 1.5);
        }
        const gust = 0.5 + 0.5 * Math.sin(t * 0.7 + p.phase);
        p.fronds.rotation.z = Math.sin(t * 2.1 + p.phase) * (0.06 + ws * 0.3) * (0.5 + gust) - ws * 0.35;
        p.fronds.rotation.x = Math.cos(t * 1.7 + p.phase) * 0.08 * ws;
        p.trunk.rotation.z = -ws * 0.14 * (0.6 + gust * 0.4);
      });
      // Wind damage above ~0.75 intensity: roof panels peel off downwind and
      // the first palm snaps flat — both eased so nothing teleports.
      dmgCur += (Math.min(1, Math.max(0, (inten - 0.75) / 0.17)) - dmgCur) * Math.min(1, dt * 2.5);
      const downX = Math.cos(dirRad) * 13;
      const downZ = Math.sin(dirRad) * 13;
      for (const d of damaged) {
        d.panel.position.x = d.x + downX * dmgCur;
        d.panel.position.z = d.z + downZ * dmgCur;
        d.panel.position.y = d.y + (0.4 - d.y) * dmgCur;
        d.panel.rotation.x = dmgCur * 0.38;
        d.panel.rotation.z = -dmgCur * 0.52;
      }
      if (palms.length > 0) {
        snapCur += (Math.min(1, Math.max(0, (inten - 0.78) / 0.15)) - snapCur) * Math.min(1, dt * 1.8);
        palms[0].pivot.rotation.z = -snapCur * 1.4;   // falls downwind
        palms[0].pivot.rotation.x = -snapCur * 0.18;
      }
      // Debris circles the eye with the wind field.
      for (let i = 0; i < DN; i++) {
        const w = windAt(dbp.getX(i), dbp.getZ(i));
        let x = dbp.getX(i) + w.x * dt;
        let z = dbp.getZ(i) + w.z * dt;
        if (x > WORLD.halfSize) x = -WORLD.halfSize;
        if (x < -WORLD.halfSize) x = WORLD.halfSize;
        if (z > WORLD.halfSize) z = -WORLD.halfSize;
        if (z < -WORLD.halfSize) z = WORLD.halfSize;
        dbp.setXYZ(i, x, dbp.getY(i), z);
      }
      dbp.needsUpdate = true;
      (debris.material as THREE.PointsMaterial).opacity = 0.2 + inten * 0.6;
      // Foam rings ripple outward and fade.
      foamRings.forEach((ring, i) => {
        const ph = (t * (0.18 + inten * 0.25) + i / 3) % 1;
        const r = 14 + ph * 46;
        ring.scale.set(r, r, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * (0.1 + 0.5 * inten);
      });
    },
  };
}
