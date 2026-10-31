/* Wildfire pack — pine forest, flickering flame front, drifting smoke + embers. */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { WORLD, WORLD_SCALE } from '../stormTypes';

export const wildfirePalette: EnvPalette = {
  ground: '#3f4432', speckle: '#5c6344', sky: 0x2b2118, fog: 0x2b2118,
  fogNear: 90, fogFar: 480, hemiSky: 0xc7a06a, hemiGround: 0x2c2a1e, sun: 0xffb45e,
};

export function wildfireFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(1507);
  const grp = new THREE.Group();
  const FRONT_Z = -40; // fireline position (hazard focus at origin sits just ahead of it)
  // Firebreak: a cleared lane cut across the forest perpendicular to the front.
  const LANE_X = 52;
  const LANE_W = 24;

  // Pine forest: green far from front, scorched near it.
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2e5b34 });
  const charMat = new THREE.MeshLambertMaterial({ color: 0x1e1a14 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
  const treeCount = Math.floor(120 * (ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.8 : 1) * WORLD_SCALE);
  for (let i = 0; i < treeCount; i++) {
    const x = (rnd() * 2 - 1) * 225 * WORLD_SCALE;
    const z = (rnd() * 2 - 1) * 225 * WORLD_SCALE;
    if (Math.abs(x) < 20 && Math.abs(z) < WORLD.halfSize) continue;
    if (Math.abs(x - LANE_X) < LANE_W / 2 + 2) continue; // keep the firebreak clear
    const h = 9 + rnd() * 9;
    const burnt = z < FRONT_Z + 25;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3 + rnd() * 1.5, h, 6), burnt ? charMat : pineMat);
    crown.position.set(x, h / 2 + 2, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 5), trunkMat);
    trunk.position.set(x, 1.5, z);
    grp.add(crown, trunk);
    if (rnd() > 0.55) ctx.addCollider(x, z, 3.4);
  }

  // Firebreak strip: bare/scorched earth with wet dark edges the flames respect.
  const laneMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, 460), laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(LANE_X, 0.14, FRONT_Z - 60);
  grp.add(lane);
  const wetMat = new THREE.MeshBasicMaterial({ color: 0x171d18, transparent: true, opacity: 0.75 });
  const wetEdges: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 460), wetMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(LANE_X + side * (LANE_W / 2 + 1.6), 0.16, FRONT_Z - 60);
    wetEdges.push(edge);
    grp.add(edge);
  }

  // Flame cones along the front — skipped inside the firebreak lane.
  const flames: { mesh: THREE.Mesh; w0: number; h0: number; phase: number }[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.92 });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95 });
  for (let x = -150; x <= 150; x += 12) {
    const fx = x + rnd() * 5;
    if (fx > LANE_X - LANE_W / 2 - 3 && fx < LANE_X + LANE_W / 2 + 3) continue; // fire does not cross
    const h0 = 0.7 + rnd() * 0.7; // per-segment height variety
    const w0 = 0.75 + rnd() * 0.6; // per-segment width variety
    const f = new THREE.Mesh(new THREE.ConeGeometry(3.2, 9 * h0, 6), flameMat);
    f.position.set(fx, 5, FRONT_Z + (rnd() * 2 - 1) * 8);
    const core = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5 * h0, 5), coreMat);
    core.position.y = -1;
    f.add(core);
    flames.push({ mesh: f, w0, h0, phase: rnd() * Math.PI * 2 });
    grp.add(f);
  }
  const frontGlow = new THREE.PointLight(0xff6a1a, 800, 320);
  frontGlow.position.set(0, 12, FRONT_Z);
  grp.add(frontGlow);
  // Char scar disc under the burned zone.
  const scar = new THREE.Mesh(
    new THREE.CircleGeometry(190 * WORLD_SCALE, 40),
    new THREE.MeshBasicMaterial({ color: 0x141210, transparent: true, opacity: 0.55 }),
  );
  scar.rotation.x = -Math.PI / 2;
  scar.position.set(0, 0.12, FRONT_Z - 90);
  grp.add(scar);

  // Smoke columns + embers, both advected by wind.
  const SN = Math.floor(380 * (ctx.quality === 'low' ? 0.5 : 1));
  const sg = new THREE.BufferGeometry();
  const sp = new THREE.BufferAttribute(new Float32Array(SN * 3), 3);
  sg.setAttribute('position', sp);
  for (let i = 0; i < SN; i++) sp.setXYZ(i, (rnd() * 2 - 1) * 160, rnd() * 70, FRONT_Z + (rnd() * 2 - 1) * 60);
  const smoke = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x5c5650, size: 5, transparent: true, opacity: 0.5 }));
  grp.add(smoke);
  const EN = Math.floor(260 * (ctx.quality === 'low' ? 0.5 : 1));
  const eg = new THREE.BufferGeometry();
  const ep = new THREE.BufferAttribute(new Float32Array(EN * 3), 3);
  eg.setAttribute('position', ep);
  for (let i = 0; i < EN; i++) ep.setXYZ(i, (rnd() * 2 - 1) * 150, rnd() * 25, FRONT_Z + (rnd() * 2 - 1) * 40);
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa63f, size: 1, transparent: true, opacity: 0.95 }));
  grp.add(embers);

  // Firebrands: glowing embers that arc out of the front and land downwind.
  const FB = Math.floor(64 * (ctx.quality === 'low' ? 0.5 : 1));
  const fbg = new THREE.BufferGeometry();
  const fbp = new THREE.BufferAttribute(new Float32Array(FB * 3), 3);
  fbg.setAttribute('position', fbp);
  const fbv = new Float32Array(FB * 3);
  const launchBrand = (i: number, f0: number) => {
    fbp.setXYZ(i, (rnd() * 2 - 1) * 150, 4 + rnd() * 8, FRONT_Z + (rnd() * 2 - 1) * 6);
    fbv[i * 3] = (rnd() * 2 - 1) * 4;
    fbv[i * 3 + 1] = 10 + rnd() * 16 * (0.5 + f0 * 0.5);
    fbv[i * 3 + 2] = 6 + f0 * 12;
  };
  for (let i = 0; i < FB; i++) { launchBrand(i, 0.6); fbp.setY(i, rnd() * 20); }
  const firebrands = new THREE.Points(fbg, new THREE.PointsMaterial({ color: 0xff8a3f, size: 1.1, transparent: true, opacity: 0.9 }));
  grp.add(firebrands);

  // Embers still glowing on the burnt ground behind the front.
  const GE = Math.floor(120 * (ctx.quality === 'low' ? 0.5 : 1));
  const geg = new THREE.BufferGeometry();
  const gep = new THREE.BufferAttribute(new Float32Array(GE * 3), 3);
  geg.setAttribute('position', gep);
  for (let i = 0; i < GE; i++) {
    gep.setXYZ(i, (rnd() * 2 - 1) * 190, 0.6, FRONT_Z - rnd() * 150);
  }
  const groundEmbers = new THREE.Points(geg, new THREE.PointsMaterial({ color: 0xff6a2a, size: 0.9, transparent: true, opacity: 0.6 }));
  grp.add(groundEmbers);

  // Deer bolting ahead of the fireline.
  const deer: { grp: THREE.Group; legs: THREE.Mesh[]; x: number; speed: number; phase: number }[] = [];
  const deerMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 3), deerMat);
    trunk.position.y = 3.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.6), deerMat);
    head.position.set(0, 4.2, 2);
    d.add(trunk, head);
    const legs: THREE.Mesh[] = [];
    for (const [lx, lz] of [[-0.5, -1], [0.5, -1], [-0.5, 1.2], [0.5, 1.2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 5), deerMat);
      leg.position.set(lx, 1.3, lz);
      legs.push(leg);
      d.add(leg);
    }
    const x = (i - 1) * 30 + (rnd() * 2 - 1) * 10;
    d.position.set(x, 0, FRONT_Z + 10 + rnd() * 40);
    deer.push({ grp: d, legs, x, speed: 5 + rnd() * 3, phase: rnd() * Math.PI * 2 });
    grp.add(d);
  }
  scene.add(grp);

  // Smoke-choked sky: drive fog + hemisphere light from smoke load (fire x dryness).
  const hemiSlot: { hemi: THREE.HemisphereLight | null } = { hemi: null };
  scene.traverse((o) => {
    if (!hemiSlot.hemi && (o as THREE.HemisphereLight).isHemisphereLight) hemiSlot.hemi = o as THREE.HemisphereLight;
  });
  const hemiLight = hemiSlot.hemi;
  const fogBase = scene.fog instanceof THREE.Fog ? scene.fog.color.clone() : new THREE.Color(0x2b2118);
  const hemiBase = hemiLight ? hemiLight.intensity : 0.9;
  const rmAmp = ctx.reduceMotion ? 0.4 : 1;
  const cClear = new THREE.Color(0x3a3428);
  const cSmoke = new THREE.Color(0x6b5240);
  const cHemiSky = new THREE.Color(0xc7a06a);
  const cHemiSmoke = new THREE.Color(0xd89050);

  return {
    update: (dt, t, v) => {
      const fire = v.fire ?? 0.6;
      const dry = v.dryness ?? 0.7;
      const burn = fire * (0.3 + 0.7 * dry);
      const smokeLoad = Math.min(1, burn * 1.4); // smoke load from fire x dryness
      const wSpeed = v.windSpeed ?? 20;
      const wRad = ((v.windDir ?? 90) * Math.PI) / 180;
      const wDirX = Math.cos(wRad); // unit downwind vector (x)
      const wDirZ = Math.sin(wRad); // unit downwind vector (z)
      const wx = wDirX * wSpeed * dt * 0.9;
      const wz = wDirZ * wSpeed * dt * 0.9;
      // Smoke-choked sky: fog closes in and turns orange-grey under heavy fire.
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(fogBase).lerp(cClear, 0.3).lerp(cSmoke, smokeLoad);
        scene.fog.near = 90 - smokeLoad * 65;
        scene.fog.far = 480 - smokeLoad * 280;
      }
      if (hemiLight) {
        hemiLight.intensity = hemiBase * (1 - smokeLoad * 0.45);
        hemiLight.color.copy(cHemiSky).lerp(cHemiSmoke, smokeLoad);
      }
      // Flame front: lean downwind, height/width vary per segment with dryness + wind.
      const lean = wSpeed / 60; // 0..1
      const flick = rmAmp;
      flames.forEach((fl, i) => {
        const segFlick = 0.5 + 0.5 * Math.sin(t * 9 + fl.phase * 3 + i * 1.7);
        const height = fl.h0 * (0.6 + dry * 0.8 + burn * 0.6) * (0.8 + segFlick * 0.4 * flick);
        const width = fl.w0 * (0.7 + dry * 0.4);
        fl.mesh.scale.set(width, height, width);
        // Lean the flame in the wind direction (downwind = windDir).
        fl.mesh.rotation.z = -wDirX * lean * 0.55;
        fl.mesh.rotation.x = wDirZ * lean * 0.55;
      });
      frontGlow.intensity = 300 + burn * 900 + Math.sin(t * 7) * 120 * burn;
      const advect = (attr: THREE.BufferAttribute, n: number, rise: number, spread: number, hMax: number) => {
        for (let i = 0; i < n; i++) {
          let y = attr.getY(i) + rise * dt;
          let x = attr.getX(i) + wx + Math.sin(t * 2 + i) * dt * spread;
          let z = attr.getZ(i) + wz;
          if (y > hMax) { y = rnd() * 8; x = (rnd() * 2 - 1) * 150; z = FRONT_Z + (rnd() * 2 - 1) * 40; }
          if (x > WORLD.halfSize) x = -WORLD.halfSize; if (x < -WORLD.halfSize) x = WORLD.halfSize;
          if (z > WORLD.halfSize) z = -WORLD.halfSize; if (z < -WORLD.halfSize) z = WORLD.halfSize;
          attr.setXYZ(i, x, y, z);
        }
        attr.needsUpdate = true;
      };
      advect(sp, SN, 4 + burn * 7, 3, 75);
      advect(ep, EN, 3 + burn * 6, 7, 30);
      (smoke.material as THREE.PointsMaterial).opacity = 0.3 + burn * 0.35;
      (embers.material as THREE.PointsMaterial).opacity = 0.4 + burn * 0.55;
      // Firebrands arc into the air, land, and relaunch.
      for (let i = 0; i < FB; i++) {
        fbv[i * 3 + 1] -= 22 * dt;
        const bx = fbp.getX(i) + fbv[i * 3] * dt + wx * 2;
        const by = fbp.getY(i) + fbv[i * 3 + 1] * dt;
        const bz = fbp.getZ(i) + fbv[i * 3 + 2] * dt;
        if (by < 0.5) { launchBrand(i, burn); continue; }
        fbp.setXYZ(i, bx, by, bz);
      }
      fbp.needsUpdate = true;
      (firebrands.material as THREE.PointsMaterial).opacity = 0.3 + burn * 0.6;
      // Embers on the burned ground throb.
      (groundEmbers.material as THREE.PointsMaterial).opacity = (0.25 + burn * 0.5) * (0.6 + 0.4 * Math.sin(t * 2.3));
      // Deer gallop away from the advancing fireline.
      for (const de of deer) {
        let z = de.grp.position.z + de.speed * dt * (0.6 + burn * 0.8);
        if (z > 210) { z = FRONT_Z + 6; de.x = (rnd() * 2 - 1) * 120; de.speed = 5 + rnd() * 3; }
        const bounce = Math.abs(Math.sin(t * 9 * (de.speed / 6) + de.phase * 3)) * 0.3;
        de.grp.position.set(de.x + Math.sin(t * 2 + de.phase) * 1.2, bounce, z);
        const gallop = Math.sin(t * 9 * (de.speed / 6) + de.phase * 3) * 0.8;
        de.legs.forEach((leg, k) => { leg.rotation.x = k % 2 === 0 ? gallop : -gallop; });
      }
    },
  };
}
