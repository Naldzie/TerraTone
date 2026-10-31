/* Volcano pack — cone, glowing crater, scrolling lava flows, ash column, gas bursts. */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { WORLD } from '../stormTypes';

export const volcanoPalette: EnvPalette = {
  ground: '#3a3230', speckle: '#5c4a42', sky: 0x241a20, fog: 0x241a20,
  fogNear: 110, fogFar: 560, hemiSky: 0xb08a7a, hemiGround: 0x2c2226, sun: 0xd8a075,
};

function lavaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a1408'; g.fillRect(0, 0, 128, 128);
  let s = 99;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) {
    g.fillStyle = r() > 0.4 ? '#ff7a1a' : '#ffd23f';
    g.globalAlpha = 0.5 + r() * 0.5;
    const w = 3 + r() * 9;
    g.fillRect(r() * 128, r() * 128, w, 2 + r() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Height of the volcano's flank at distance r from the vent (walkable terrain). */
export function volcanoHeight(r: number): number {
  if (r >= 95) return 0;
  if (r <= 26) return 110;                 // rim / crater lip
  return (110 * (95 - r)) / (95 - 26);
}

export function volcanoFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(904);
  const grp = new THREE.Group();
  // Cone with a crater mouth.
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x4a3a34, roughness: 1, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(26, 95, 110, 24, 1, true),
    coneMat,
  );
  cone.position.y = 55;
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.9 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 109;
  grp.add(cone, glow);
  // Lava flows: ribbons lying ON the cone slope (slope-matched basis so the
  // long axis runs rim-to-base, offset just above the rock — never buried).
  const lavaTex = lavaTexture();
  // Churning lava lake filling the crater mouth.
  const lakeMat = new THREE.MeshBasicMaterial({ map: lavaTex.clone(), transparent: true, opacity: 0.9 });
  (lakeMat.map as THREE.Texture).repeat.set(2, 2);
  (lakeMat.map as THREE.Texture).needsUpdate = true;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(23.5, 24), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = 109.4;
  grp.add(lake);
  const flows: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // Cone surface: r 95 @ y0 → r 26 @ y110. Slope-frame (unit, orthogonal):
    const upSlope = radial.clone().multiplyScalar(-0.531).add(new THREE.Vector3(0, 0.847, 0));
    const normal = radial.clone().multiplyScalar(0.847).add(new THREE.Vector3(0, 0.531, 0));
    const xAxis = new THREE.Vector3().crossVectors(upSlope, normal);
    const top = radial.clone().multiplyScalar(30).setY(104);
    const bottom = radial.clone().multiplyScalar(95).setY(0.5);
    const mid = top.clone().add(bottom).multiplyScalar(0.5);
    const flow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 122),
      new THREE.MeshBasicMaterial({ map: lavaTex.clone(), transparent: true, opacity: 0.95 }),
    );
    (flow.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;
    flow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, upSlope, normal));
    flow.position.copy(mid).addScaledVector(normal, 1.0);
    flows.push(flow);
    grp.add(flow);
  }
  // Ash column rising from the crater (base positions + bounded sway —
  // never random-walks away).
  const AN = Math.floor(420 * (ctx.quality === 'low' ? 0.5 : 1));
  const ag = new THREE.BufferGeometry();
  const ap = new THREE.BufferAttribute(new Float32Array(AN * 3), 3);
  ag.setAttribute('position', ap);
  const ages = new Float32Array(AN);
  const baseX = new Float32Array(AN);
  const baseZ = new Float32Array(AN);
  for (let i = 0; i < AN; i++) {
    ages[i] = rnd();
    baseX[i] = (rnd() * 2 - 1) * 20;
    baseZ[i] = (rnd() * 2 - 1) * 20;
    ap.setXYZ(i, baseX[i], 108 + rnd() * 90, baseZ[i]);
  }
  const ash = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0x6e6560, size: 3.4, transparent: true, opacity: 0.7 }));
  grp.add(ash);
  // Volcanic bombs: glowing ballistic embers arcing out of the crater.
  const BN = Math.floor(70 * (ctx.quality === 'low' ? 0.5 : 1));
  const bg = new THREE.BufferGeometry();
  const bp = new THREE.BufferAttribute(new Float32Array(BN * 3), 3);
  bg.setAttribute('position', bp);
  const bv = new Float32Array(BN * 3);
  const launchBomb = (i: number, e0: number) => {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 12;
    bp.setXYZ(i, Math.cos(a) * r, 110, Math.sin(a) * r);
    const sp = 0.4 + e0 * 0.9;
    bv[i * 3] = Math.cos(a) * (8 + rnd() * 14) * sp;
    bv[i * 3 + 1] = (26 + rnd() * 30) * sp;
    bv[i * 3 + 2] = Math.sin(a) * (8 + rnd() * 14) * sp;
  };
  for (let i = 0; i < BN; i++) { launchBomb(i, 0.5); bp.setY(i, rnd() * 120); }
  const bombs = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xffa63f, size: 1.6, transparent: true, opacity: 0.95 }));
  grp.add(bombs);
  // Gas-burst flash light.
  const flash = new THREE.PointLight(0xff8a3a, 0, 300, 1.8);
  flash.position.y = 120;
  grp.add(flash);
  // Steady crater glow so the rim and flows read at all intensities.
  const craterLight = new THREE.PointLight(0xff5a1a, 120, 240, 1.8);
  craterLight.position.y = 112;
  grp.add(craterLight);
  // Volcanic lightning: ONE brief emissive bolt that flickers inside/above
  // the ash column; flash frequency rises with ash × eruption.
  const boltMat = new THREE.MeshBasicMaterial({
    color: 0xdde8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const bolt = new THREE.Mesh(new THREE.SphereGeometry(2.6, 6, 5), boltMat);
  bolt.position.y = 150;
  grp.add(bolt);
  let boltT = 1.4;
  let boltPow = 0;
  // Old lava rocks around the base (colliders).
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x33291f });
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * (120 + rnd() * 80);
    const z = Math.sin(a) * (120 + rnd() * 80);
    const size = 4 + rnd() * 5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), rockMat);
    rock.position.set(x, 3, z);
    scene.add(rock);
    // Old lava boulders are walkable humps: scramble up onto them.
    ctx.addCollider(x, z, size * 1.25, { top: 3 + size * 0.85 });
  }
  // Steaming fumaroles ringing the base.
  const steamVents: { pts: THREE.Points; pos: THREE.BufferAttribute; ph: Float32Array; x: number; z: number }[] = [];
  const moundMat = new THREE.MeshLambertMaterial({ color: 0x3a2f28 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.9;
    const vx = Math.cos(a) * (105 + rnd() * 30);
    const vz = Math.sin(a) * (105 + rnd() * 30);
    const mound = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.5, 7), moundMat);
    mound.position.set(vx, 1.2, vz);
    ctx.addCollider(vx, vz, 4.2, { top: 2.4 });
    const PN = Math.floor(26 * (ctx.quality === 'low' ? 0.5 : 1));
    const pg = new THREE.BufferGeometry();
    const pp = new THREE.BufferAttribute(new Float32Array(PN * 3), 3);
    pg.setAttribute('position', pp);
    const ph = new Float32Array(PN);
    for (let k = 0; k < PN; k++) ph[k] = rnd();
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xcfd4d8, size: 2.6, transparent: true, opacity: 0.4 }));
    grp.add(mound, pts);
    steamVents.push({ pts, pos: pp, ph, x: vx, z: vz });
  }
  // Ash fallout drifting over the whole field.
  const AEN = Math.floor(220 * (ctx.quality === 'low' ? 0.5 : 1));
  const fg = new THREE.BufferGeometry();
  const fp = new THREE.BufferAttribute(new Float32Array(AEN * 3), 3);
  const fv = new Float32Array(AEN);
  fg.setAttribute('position', fp);
  for (let i = 0; i < AEN; i++) {
    fp.setXYZ(i, (rnd() * 2 - 1) * 230, rnd() * 60, (rnd() * 2 - 1) * 230);
    fv[i] = 1.5 + rnd() * 3;
  }
  const fallout = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0x8a827c, size: 1.6, transparent: true, opacity: 0.5 }));
  grp.add(fallout);
  // Ash accumulation: cumulative ash exposure darkens the cone, rocks and
  // mounds (color lerp toward grey-black) and coats the ground with a faint
  // dark disc; lightens again slowly when the ash output drops.
  const coneBaseC = new THREE.Color(0x4a3a34);
  const coneAshC = new THREE.Color(0x211d1b);
  const rockBaseC = new THREE.Color(0x33291f);
  const rockAshC = new THREE.Color(0x181512);
  const moundBaseC = new THREE.Color(0x3a2f28);
  const moundAshC = new THREE.Color(0x1b1714);
  const gad = [200, 280, 340][ctx.quality === 'low' ? 0 : ctx.quality === 'medium' ? 1 : 2];
  const groundAshMat = new THREE.MeshBasicMaterial({ color: 0x2b2724, transparent: true, opacity: 0, depthWrite: false });
  const groundAsh = new THREE.Mesh(new THREE.CircleGeometry(gad, 36), groundAshMat);
  groundAsh.rotation.x = -Math.PI / 2;
  groundAsh.position.y = 0.12;
  scene.add(groundAsh);
  // The cone is terrain you can hike (see groundHeight); bystanders keep off
  // it, and nobody can wade into the lava lake inside the rim.
  ctx.addCollider(0, 0, 96, { npcOnly: true });
  ctx.addCollider(0, 0, 23);
  scene.add(grp);

  let burstT = 2;
  let accum = 0;
  return {
    // Cone surface: base radius 95 at y 0 rising to the 26 m rim at y 110.
    groundHeight: (x, z) => volcanoHeight(Math.hypot(x, z)),
    update: (dt, t, v) => {
      const e = v.eruption ?? 0.55;
      const ashN = v.ash ?? 0.5;
      const lava = v.lava ?? 0.5;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.55 + lava * 0.45;
      const gs = 1 + Math.sin(t * 3) * 0.06 * e;
      glow.scale.set(gs, gs, 1);
      craterLight.intensity = 90 + lava * 170 + e * 60 + Math.sin(t * 7.3) * 25 * (0.3 + e);
      flows.forEach((f, i) => {
        const m = f.material as THREE.MeshBasicMaterial;
        m.opacity = 0.25 + lava * 0.7;
        // Local +Y runs rim-ward, so +offset scrolls the pattern downhill.
        if (m.map) m.map.offset.y += dt * (0.2 + lava * 0.8 + i * 0.1);
      });
      for (let i = 0; i < AN; i++) {
        ages[i] += dt * (0.12 + e * 0.3);
        if (ages[i] > 1) ages[i] = 0;
        const a = ages[i];
        const spread = 4 + a * (10 + e * 22);
        ap.setXYZ(
          i,
          baseX[i] + Math.sin(t * 0.9 + i * 1.7) * spread,
          108 + a * (70 + e * 60),
          baseZ[i] + Math.cos(t * 0.8 + i * 2.3) * spread,
        );
      }
      ap.needsUpdate = true;
      (ash.material as THREE.PointsMaterial).opacity = 0.25 + ashN * 0.55;
      for (let i = 0; i < BN; i++) {
        bv[i * 3 + 1] -= 34 * dt;
        bp.setXYZ(
          i,
          bp.getX(i) + bv[i * 3] * dt,
          bp.getY(i) + bv[i * 3 + 1] * dt,
          bp.getZ(i) + bv[i * 3 + 2] * dt,
        );
        const bx = bp.getX(i);
        const bz = bp.getZ(i);
        const br = Math.hypot(bx, bz);
        // Cone surface: y = 110*(95-r)/69 inside r 26..95, else terrain ~0.
        const surfY = br < 26 ? 108 : br < 95 ? (110 * (95 - br)) / 69 + 1 : 1;
        if (bp.getY(i) < surfY) launchBomb(i, e);
      }
      bp.needsUpdate = true;
      (bombs.material as THREE.PointsMaterial).opacity = 0.35 + e * 0.6;
      // Rhythmic gas bursts: flash + brief glow pop.
      burstT -= dt * (0.5 + e * 2);
      if (burstT <= 0) {
        burstT = 1.5 + rnd() * 2;
        flash.intensity = 250 + e * 600;
      }
      flash.intensity = Math.max(0, flash.intensity - dt * 2500);
      // Volcanic lightning: brief emissive flickers inside/above the column;
      // frequency scales with ash × eruption (single bolt, rm-damped).
      boltT -= dt * (0.35 + ashN * e * 3.4);
      if (boltT <= 0) {
        boltT = 0.5 + rnd() * 3.2 * (1.35 - ashN * 0.55) * (1.3 - e * 0.45);
        const ba = rnd() * Math.PI * 2;
        const br = rnd() * (10 + e * 26);
        bolt.position.set(Math.cos(ba) * br, 124 + rnd() * (40 + e * 40), Math.sin(ba) * br);
        boltPow = (0.5 + rnd() * 0.5) * (ctx.reduceMotion ? 0.4 : 1);
      }
      boltPow = Math.max(0, boltPow - dt * 8);
      boltMat.opacity = boltPow * 0.9;
      const bsc = 0.6 + boltPow * 1.7;
      bolt.scale.set(bsc, bsc * 1.5, bsc);
      // Ash accumulation: rock/cone darken and the ground gains a grey-black
      // coat while ash is emitted; the coat lifts slowly when ash drops.
      if (ashN > 0.02) accum = Math.min(1, accum + dt * (0.012 + ashN * 0.05));
      else accum = Math.max(0, accum - dt * 0.01);
      coneMat.color.copy(coneBaseC).lerp(coneAshC, accum * 0.85);
      rockMat.color.copy(rockBaseC).lerp(rockAshC, accum * 0.75);
      moundMat.color.copy(moundBaseC).lerp(moundAshC, accum * 0.75);
      groundAshMat.opacity = accum * 0.4;
      // Lava lake churns; texture drifts with output.
      (lakeMat.map as THREE.Texture).offset.x += dt * (0.015 + lava * 0.03);
      (lakeMat.map as THREE.Texture).offset.y -= dt * 0.012;
      lakeMat.opacity = 0.35 + lava * 0.6;
      // Fumarole steam puffs rise and dissipate.
      for (const ven of steamVents) {
        const speed = 0.1 + e * 0.22;
        for (let k = 0; k < ven.ph.length; k++) {
          const a = (ven.ph[k] + t * speed) % 1;
          ven.pos.setXYZ(
            k,
            ven.x + Math.sin(t * 0.6 + ven.ph[k] * 9) * (1 + a * 5),
            3 + a * 13,
            ven.z + Math.cos(t * 0.5 + ven.ph[k] * 7) * (1 + a * 5),
          );
        }
        ven.pos.needsUpdate = true;
        // Steam dims with low eruption output but never fully vanishes.
        (ven.pts.material as THREE.PointsMaterial).opacity = (0.12 + ashN * 0.45) * (0.55 + 0.45 * e);
      }
      // Ash fallout settles over the field.
      (fallout.material as THREE.PointsMaterial).opacity = 0.12 + ashN * 0.55;
      for (let i = 0; i < AEN; i++) {
        let y = fp.getY(i) - fv[i] * dt * (0.5 + ashN);
        let x = fp.getX(i) + Math.sin(t * 0.8 + i) * dt * 1.5;
        if (y < 0.3) { y = 50 + rnd() * 20; x = (rnd() * 2 - 1) * 230; fp.setZ(i, (rnd() * 2 - 1) * 230); }
        fp.setXYZ(i, x, y, fp.getZ(i));
      }
      fp.needsUpdate = true;
    },
  };
}
