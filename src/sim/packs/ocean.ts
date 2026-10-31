/* Ocean pack — twilight reef, kelp, light rays, rising bubbles, current drift. */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { WORLD } from '../stormTypes';

export const oceanPalette: EnvPalette = {
  ground: '#4a5f6e', speckle: '#6e8898', sky: 0x06283d, fog: 0x06283d,
  fogNear: 30, fogFar: 320, hemiSky: 0x3f7fa0, hemiGround: 0x0c2233, sun: 0x9fd4e8,
};

export function oceanDrift(vals: Record<string, number>): { x: number; z: number } {
  const c = vals.current ?? 0.4;
  return { x: c * 5, z: c * 1.6 };
}

export interface Submersible {
  group: THREE.Group;
  prop: THREE.Object3D;
  home: { x: number; z: number };
}

/** Big rideable research sub: yellow hull, glass viewport, spinning prop, headlight. */
export function buildSubmersible(scene: THREE.Scene, addCollider: (x: number, z: number, r: number) => void): Submersible {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2b32a, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2a3a, roughness: 0.1, metalness: 0.7 });
  const lampM = new THREE.MeshBasicMaterial({ color: 0xe8fbff });

  const hullGeo = new THREE.CapsuleGeometry(2.1, 6.5, 6, 12);
  hullGeo.rotateX(Math.PI / 2); // long axis along z (travel direction)
  const hull = new THREE.Mesh(hullGeo, paint);
  hull.position.y = 3;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 7.2), dark);
  stripe.position.y = 2.4;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.8, 10), paint);
  tower.position.set(0, 5.6, -0.5);
  const viewport = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), glass);
  viewport.position.set(0, 3.4, 4.6);
  for (const sx of [-2.6, 2.6]) {
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2.2, 4, 8), dark);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(sx, 2.2, -0.5);
    g.add(pod);
  }
  const prop = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.18), dark);
    blade.rotation.z = (i / 3) * Math.PI * 2;
    prop.add(blade);
  }
  prop.position.set(0, 3, -5.4); // spun via prop.rotation.z by the sim
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 8);
  for (const lx of [-1.2, 1.2]) {
    const lamp = new THREE.Mesh(lampGeo, lampM);
    lamp.position.set(lx, 2.6, 5.2);
    g.add(lamp);
  }
  const beam = new THREE.SpotLight(0xcfefff, 400, 70, 0.45, 0.5, 1.2);
  beam.position.set(0, 3, 5);
  const beamTarget = new THREE.Object3D();
  beamTarget.position.set(0, 0, 30);
  g.add(beamTarget);
  beam.target = beamTarget;
  g.add(beam);
  g.add(hull, stripe, tower, viewport, prop);
  // Face travel direction (+z) like the diver.
  g.rotation.y = 0;
  const home = { x: 20, z: 140 };
  g.position.set(home.x, 2.5, home.z);
  scene.add(g);
  addCollider(home.x, home.z, 6);
  return { group: g, prop, home };
}

export function oceanFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand, reduceMotion } = ctx;
  const rnd = rand(1203);
  const grp = new THREE.Group();
  // Rock spires + corals (colliders).
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x3d4a55 });
  const coralMats = [0xc96a7a, 0xd8913f, 0x7ac9a0].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 16; i++) {
    const x = (rnd() * 2 - 1) * 210;
    const z = (rnd() * 2 - 1) * 210;
    if (Math.hypot(x, z) < 40) continue;
    const h = 6 + rnd() * 16;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(h / 2.4), rockMat);
    rock.position.set(x, h / 4, z);
    grp.add(rock);
    ctx.addCollider(x, z, h / 2 + 1.5);
    if (rnd() > 0.4) {
      const coral = new THREE.Mesh(new THREE.ConeGeometry(1.4 + rnd(), 3 + rnd() * 4, 6), coralMats[i % 3]);
      coral.position.set(x + 3 + rnd() * 4, 2, z + 2);
      grp.add(coral);
    }
  }
  // Kelp fronds swaying.
  const kelp: THREE.Mesh[] = [];
  const kelpMat = new THREE.MeshLambertMaterial({ color: 0x2e7b4f, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 26; i++) {
    const k = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 9 + rnd() * 7), kelpMat);
    k.position.set((rnd() * 2 - 1) * 220, 5, (rnd() * 2 - 1) * 220);
    kelp.push(k);
    grp.add(k);
  }
  // Light rays slanting down.
  const rayMat = new THREE.MeshBasicMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(10, 90), rayMat);
    r.position.set((rnd() * 2 - 1) * 160, 45, (rnd() * 2 - 1) * 160);
    r.rotation.z = 0.35;
    r.rotation.y = rnd() * Math.PI;
    rays.push(r);
    grp.add(r);
  }
  // Bubbles rising around the diver's patrol area.
  const BN = Math.floor(240 * (ctx.quality === 'low' ? 0.5 : 1));
  const bg = new THREE.BufferGeometry();
  const bp = new THREE.BufferAttribute(new Float32Array(BN * 3), 3);
  bg.setAttribute('position', bp);
  for (let i = 0; i < BN; i++) bp.setXYZ(i, (rnd() * 2 - 1) * 120, rnd() * 30, (rnd() * 2 - 1) * 120);
  const bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xcfeef8, size: 0.9, transparent: true, opacity: 0.8 }));
  grp.add(bubbles);

  // Fish schools: three circling shoals, fewer on low-end devices.
  const schoolN = ctx.quality === 'low' ? 2 : 3;
  const fishPer = ctx.quality === 'low' ? 12 : 20;
  const schoolCols = [0x9fd4e8, 0xffd23f, 0xff8a5a];
  const schools: { mesh: THREE.InstancedMesh; cx: number; cz: number; r: number; y: number; dir: number; phase: number[] }[] = [];
  const dummy = new THREE.Object3D();
  const fishGeo = new THREE.ConeGeometry(0.5, 1.8, 5);
  fishGeo.rotateX(Math.PI / 2); // nose toward +z
  for (let s = 0; s < schoolN; s++) {
    const mesh = new THREE.InstancedMesh(
      fishGeo,
      new THREE.MeshLambertMaterial({ color: schoolCols[s % schoolCols.length] }),
      fishPer,
    );
    mesh.frustumCulled = false; // matrices roam far from the origin
    const a = (s / schoolN) * Math.PI * 2 + 0.7;
    const phase = Array.from({ length: fishPer }, () => rnd() * Math.PI * 2);
    schools.push({ mesh, cx: Math.cos(a) * 110, cz: Math.sin(a) * 110, r: 22 + rnd() * 18, y: 8 + rnd() * 12, dir: s % 2 === 0 ? 1 : -1, phase });
    grp.add(mesh);
  }

  // Sharks: two slow patrol hunters with swaying tails.
  const sharkN = ctx.quality === 'low' ? 1 : 2;
  const sharks: { grp: THREE.Group; tail: THREE.Mesh; cx: number; cz: number; r: number; y: number; a: number; speed: number }[] = [];
  const sharkMat = new THREE.MeshStandardMaterial({ color: 0x5a6b7a, roughness: 0.6 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xcfd8de, roughness: 0.6 });
  for (let i = 0; i < sharkN; i++) {
    const g = new THREE.Group();
    const bodyGeo = new THREE.CapsuleGeometry(1.1, 4.5, 4, 8);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyM = new THREE.Mesh(bodyGeo, sharkMat);
    const bellyGeo = new THREE.CapsuleGeometry(0.95, 4.2, 4, 8);
    bellyGeo.rotateX(Math.PI / 2);
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.y = -0.25;
    const dorsalGeo = new THREE.ConeGeometry(0.7, 1.8, 4);
    dorsalGeo.scale(1, 1, 0.35);
    const dorsal = new THREE.Mesh(dorsalGeo, sharkMat);
    dorsal.position.set(0, 1.5, 0.3);
    const tailGeo = new THREE.ConeGeometry(0.9, 2.4, 4);
    tailGeo.scale(1, 1, 0.3);
    tailGeo.rotateX(-Math.PI / 2); // point backward (-z)
    const tail = new THREE.Mesh(tailGeo, sharkMat);
    tail.position.set(0, 0, -3.9);
    g.add(bodyM, belly, dorsal, tail);
    const a = (i / Math.max(1, sharkN)) * Math.PI * 2 + 2.1;
    sharks.push({ grp: g, tail, cx: Math.cos(a) * 60, cz: Math.sin(a) * 60, r: 55 + i * 30, y: 10 + i * 5, a, speed: 0.12 + rnd() * 0.06 });
    grp.add(g);
  }

  // Jellyfish: pulsing drifters.
  const jellyN = ctx.quality === 'low' ? 3 : 5;
  const jellies: { mesh: THREE.Mesh; x: number; z: number; y0: number; phase: number }[] = [];
  const jellyGeo = new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < jellyN; i++) {
    const m = new THREE.Mesh(jellyGeo, new THREE.MeshBasicMaterial({
      color: 0xd8a0e8, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
    }));
    const x = (rnd() * 2 - 1) * 140;
    const z = (rnd() * 2 - 1) * 140;
    jellies.push({ mesh: m, x, z, y0: 10 + rnd() * 16, phase: rnd() * Math.PI * 2 });
    grp.add(m);
  }
  // Marine snow: slow-falling flecks drifting with the current.
  const MN = Math.floor(280 * (ctx.quality === 'low' ? 0.5 : 1));
  const mg = new THREE.BufferGeometry();
  const mp = new THREE.BufferAttribute(new Float32Array(MN * 3), 3);
  mg.setAttribute('position', mp);
  const mv = new Float32Array(MN);
  for (let i = 0; i < MN; i++) {
    mp.setXYZ(i, (rnd() * 2 - 1) * 120, rnd() * 40, (rnd() * 2 - 1) * 120);
    mv[i] = 0.6 + rnd() * 1.6;
  }
  const marineSnow = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xbfe8f8, size: 0.6, transparent: true, opacity: 0.55 }));
  grp.add(marineSnow);

  // Seagrass meadows swaying on the floor.
  const grass: THREE.Mesh[] = [];
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x3f8f5f, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 40; i++) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4 + rnd() * 2), grassMat);
    gp.position.set((rnd() * 2 - 1) * 200, 1.3, (rnd() * 2 - 1) * 200);
    grass.push(gp);
    grp.add(gp);
  }

  // Hydrothermal vent field: black smokers + shimmer plumes on the deep floor.
  const vents: { grp: THREE.Group; plume: THREE.Mesh; plumeMat: THREE.MeshBasicMaterial; phase: number }[] = [];
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x241f1c, roughness: 0.9 });
  const ventGlowMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0 });
  const ventCount = ctx.quality === 'low' ? 3 : 5;
  for (let i = 0; i < ventCount; i++) {
    const vg = new THREE.Group();
    const a = (i / ventCount) * Math.PI * 2 + 0.5;
    const cx = Math.cos(a) * 78 + (rnd() * 2 - 1) * 14;
    const cz = Math.sin(a) * 78 + (rnd() * 2 - 1) * 14;
    const ch = 5 + rnd() * 7;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + rnd() * 0.5, 1.5 + rnd(), ch, 7), chimneyMat);
    stack.position.y = ch / 2;
    vg.add(stack);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1, 7), ventGlowMat);
    tip.position.y = ch - 0.2;
    vg.add(tip);
    for (let k = 0; k < 3; k++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 2 + rnd() * 2.5, 6), chimneyMat);
      knob.position.set((rnd() * 2 - 1) * 2.4, 1 + rnd() * 2, (rnd() * 2 - 1) * 2.4);
      knob.rotation.z = (rnd() * 2 - 1) * 0.4;
      vg.add(knob);
    }
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0xcfd8de, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const plume = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 8, 1, true), plumeMat);
    plume.position.y = ch + 7;
    vg.add(plume);
    vg.position.set(cx, 0, cz);
    vents.push({ grp: vg, plume, plumeMat, phase: rnd() * Math.PI * 2 });
    grp.add(vg);
    ctx.addCollider(cx, cz, 2.6);
  }

  // A passing whale silhouetted in the distance.
  const whale = new THREE.Group();
  const whaleMat = new THREE.MeshStandardMaterial({ color: 0x3a4b5c, roughness: 0.7 });
  const whaleBellyMat = new THREE.MeshStandardMaterial({ color: 0x9fb2c0, roughness: 0.7 });
  const wBody = new THREE.Mesh(new THREE.CapsuleGeometry(3, 12, 6, 12), whaleMat);
  wBody.rotation.x = Math.PI / 2;
  const wBelly = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 11, 6, 12), whaleBellyMat);
  wBelly.rotation.x = Math.PI / 2;
  wBelly.position.y = -0.8;
  const whaleTail = new THREE.Group();
  for (const s of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.4, 4), whaleMat);
    fluke.scale.set(1, 1, 0.25);
    fluke.rotation.z = s * 0.9;
    fluke.position.set(s * 1.6, 0, 0);
    whaleTail.add(fluke);
  }
  whaleTail.position.set(0, 0, -7.2);
  const finGeo = new THREE.ConeGeometry(1, 3.6, 4);
  finGeo.scale(1, 1, 0.3);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, whaleMat);
    fin.position.set(s * 3, -0.4, -2.5);
    fin.rotation.z = s * 2.2;
    fin.rotation.y = s * 0.4;
    whale.add(fin);
  }
  whale.add(wBody, wBelly, whaleTail);
  whale.scale.setScalar(1.3);
  grp.add(whale);

  scene.add(grp);

  // --- Depth-driven light rig: dim the engine's lights, retune fog + background.
  const lights: { hemi: THREE.HemisphereLight | null; dir: THREE.DirectionalLight | null } = { hemi: null, dir: null };
  scene.traverse((o) => {
    if (!lights.hemi && (o as THREE.HemisphereLight).isHemisphereLight) lights.hemi = o as THREE.HemisphereLight;
    else if (!lights.dir && (o as THREE.DirectionalLight).isDirectionalLight) lights.dir = o as THREE.DirectionalLight;
  });
  const hemiLight = lights.hemi;
  const dirLight = lights.dir;
  const hemiBase = hemiLight ? hemiLight.intensity : 0.9;
  const dirBase = dirLight ? dirLight.intensity : 0.75;
  const bgBase = scene.background instanceof THREE.Color ? scene.background.clone() : new THREE.Color(0x06283d);
  const fogBase = scene.fog instanceof THREE.Fog ? scene.fog.color.clone() : new THREE.Color(0x06283d);
  const fogNearBase = scene.fog instanceof THREE.Fog ? scene.fog.near : 30;
  const fogFarBase = scene.fog instanceof THREE.Fog ? scene.fog.far : 320;
  // Scratch colours — mutated in place, never reallocated.
  const cShallow = new THREE.Color(0x1d7f9e);
  const cDeep = new THREE.Color(0x01060e);
  const cBgS = new THREE.Color(0x2e93ad);
  const cBgD = new THREE.Color(0x020a14);
  const cPlume = new THREE.Color(0x9aa6ad);
  const cPlumeDeep = new THREE.Color(0x5a4a44);

  return {
    update: (dt, t, v) => {
      const depth = v.depth ?? 60;
      const dn = Math.min(1, Math.max(0, depth / 200));
      const cur = v.current ?? 0.4;
      // Depth drives every atmospheric cue: light energy, fog reach, water colour.
      const lightMul = 1 - 0.9 * dn * dn;
      if (lights.hemi) lights.hemi.intensity = hemiBase * (1 - 0.85 * dn);
      if (lights.dir) lights.dir.intensity = dirBase * lightMul;
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(fogBase).lerp(cShallow, Math.max(0, 1 - dn * 2)).lerp(cDeep, dn * dn);
        scene.fog.near = fogNearBase * (1 - dn * 0.65);
        scene.fog.far = fogFarBase * (0.12 + 0.88 * (1 - dn) * (1 - dn));
      }
      if (scene.background instanceof THREE.Color) {
        scene.background.copy(bgBase).lerp(cBgS, Math.max(0, 1 - dn * 2)).lerp(cBgD, dn * dn);
      }
      kelp.forEach((k, i) => { k.rotation.z = Math.sin(t * (0.8 + cur) + i) * (0.12 + cur * 0.25) * (reduceMotion ? 0.4 : 1); });
      (rayMat as THREE.MeshBasicMaterial).opacity = Math.max(0.02, 0.14 - dn * 0.12);
      // Marine snow + bubbles thin out in the dark deep but never fully vanish.
      (bubbles.material as THREE.PointsMaterial).opacity = 0.85 - dn * 0.45;
      (marineSnow.material as THREE.PointsMaterial).opacity = 0.35 + (1 - dn) * 0.3;
      for (let i = 0; i < BN; i++) {
        let y = bp.getY(i) + dt * (2.5 + cur * 2);
        let x = bp.getX(i) + dt * cur * 5;
        if (y > 32) { y = 0; x = (rnd() * 2 - 1) * 120; }
        if (x > 130) x = -130;
        bp.setXYZ(i, x, y, bp.getZ(i));
      }
      bp.needsUpdate = true;
      for (const s of schools) {
        const w = 0.25 + cur * 0.2;
        for (let i = 0; i < fishPer; i++) {
          const a = t * w * s.dir + s.phase[i];
          const rr = s.r + Math.sin(t * 0.7 + s.phase[i]) * 4;
          const x = s.cx + Math.cos(a) * rr;
          const z = s.cz + Math.sin(a) * rr;
          const y = s.y + Math.sin(t * 1.1 + s.phase[i] * 2) * 1.5;
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, -a + (s.dir > 0 ? 0 : Math.PI), Math.sin(t * 6 + s.phase[i]) * 0.2);
          dummy.updateMatrix();
          s.mesh.setMatrixAt(i, dummy.matrix);
        }
        s.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const sh of sharks) {
        sh.a += dt * sh.speed * (reduceMotion ? 0.4 : 1);
        const x = sh.cx + Math.cos(sh.a) * sh.r;
        const z = sh.cz + Math.sin(sh.a) * sh.r;
        sh.grp.position.set(x, sh.y + Math.sin(t * 0.5) * 1.5, z);
        // Face along the swimming direction (tangent of the circle).
        sh.grp.rotation.y = Math.atan2(-Math.sin(sh.a), Math.cos(sh.a));
        sh.tail.rotation.y = Math.sin(t * 3) * (reduceMotion ? 0.1 : 0.45);
      }
      for (const j of jellies) {
        const pulse = 1 + Math.sin(t * 1.6 + j.phase) * 0.18;
        j.mesh.scale.set(pulse, 2 - pulse, pulse);
        j.mesh.position.set(
          j.x + Math.sin(t * 0.3 + j.phase) * 4,
          j.y0 + Math.sin(t * 0.45 + j.phase) * 3,
          j.z + Math.cos(t * 0.25 + j.phase) * 4,
        );
      }
      // Marine snow sifts down and drifts with the current.
      for (let i = 0; i < MN; i++) {
        let y = mp.getY(i) - mv[i] * dt;
        let x = mp.getX(i) + dt * cur * 2.2 + Math.sin(t * 0.4 + i) * dt * 0.5;
        if (y < 0) { y = 36 + rnd() * 6; x = (rnd() * 2 - 1) * 120; mp.setZ(i, (rnd() * 2 - 1) * 120); }
        if (x > 130) x = -130;
        mp.setXYZ(i, x, y, mp.getZ(i));
      }
      mp.needsUpdate = true;
      // Seagrass bends with the flow.
      const grassAmp = reduceMotion ? 0.4 : 1;
      grass.forEach((g, i) => {
        g.rotation.z = Math.sin(t * (1.1 + cur) + i * 1.7) * (0.1 + cur * 0.2) * grassAmp;
        g.rotation.x = Math.cos(t * 0.9 + i) * 0.06 * grassAmp;
      });
      // Whale patrols the far perimeter, tail swishing.
      const wa = t * 0.05 * (reduceMotion ? 0.5 : 1) + 2.4;
      whale.position.set(Math.cos(wa) * 165, 34 + Math.sin(t * 0.3) * 3, Math.sin(wa) * 165);
      whale.rotation.y = Math.atan2(-Math.sin(wa), Math.cos(wa));
      whale.rotation.x = Math.sin(t * 0.4) * 0.06;
      whaleTail.rotation.x = Math.sin(t * 1.6) * (reduceMotion ? 0.15 : 0.5);
      // Hydrothermal vents only matter past ~150 m: glow + shimmer ramp in the deep range.
      const deepN = Math.min(1, Math.max(0, (depth - 140) / 60));
      for (const vt of vents) {
        vt.grp.visible = deepN > 0.02;
        const shimmer = 0.5 + 0.5 * Math.sin(t * (reduceMotion ? 0.8 : 2.2) + vt.phase);
        vt.plume.scale.set(0.8 + shimmer * 0.5, 0.85 + shimmer * 0.45, 0.8 + shimmer * 0.5);
        vt.plume.rotation.y = t * (reduceMotion ? 0.15 : 0.5) + vt.phase;
        vt.plumeMat.opacity = deepN * (0.1 + shimmer * 0.16);
        vt.plumeMat.color.copy(cPlume).lerp(cPlumeDeep, dn * 0.6);
      }
      ventGlowMat.opacity = deepN * (0.45 + 0.35 * Math.sin(t * 3.4));
    },
  };
}
