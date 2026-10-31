/* Tsunami pack — waterfront town facing a moving wave front + inland surge.
 *
 * The wave advances from deep water (z = +230) to a run-up distance set by the
 * "pullback" slider, holds, then recedes — an endless simulated cycle. Crest
 * height/foam track the waveHeight slider, spray density tracks height+speed,
 * and floating debris drifts shoreward with the front.
 */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { WORLD } from '../stormTypes';
import { facadeMaterial, PALETTES } from './buildings';

export const tsunamiPalette: EnvPalette = {
  ground: '#b3a077', speckle: '#8f7f5c', sky: 0x37414c, fog: 0x37414c,
  fogNear: 130, fogFar: 700, hemiSky: 0xaab6c4, hemiGround: 0x6b614c, sun: 0xd8e0e8,
};

const SHORE_Z = 60;
const DEEP_Z = 230;

const ease = (p: number) => p * p * (3 - 2 * p);

  // Fixed 60-second wave cycle for the countdown
  const CYCLE_DURATION = 60; // seconds
  const CYCLE_SPEED = 1 / CYCLE_DURATION;

  export function tsunamiFeature(ctx: FeatureCtx): FeatureHandle {
    const { scene, rand, reduceMotion, setHazard } = ctx;
    const rnd = rand(1911);
    const grp = new THREE.Group();

  // Open sea beyond the shoreline (static body of water).
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.halfSize * 2 + 120, WORLD.halfSize + 120),
    new THREE.MeshStandardMaterial({ color: 0x1f5f8a, transparent: true, opacity: 0.9, roughness: 0.4 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 2.0, SHORE_Z + WORLD.halfSize / 2 + 60);
  grp.add(sea);

  // Rolling crest: long cylinder ridge spanning the whole coast (local +Y = world X).
  const crestGeo = new THREE.CylinderGeometry(1, 1, WORLD.halfSize * 2 + 120, 14);
  const crest = new THREE.Mesh(crestGeo, new THREE.MeshStandardMaterial({ color: 0x2d7aa8, transparent: true, opacity: 0.92, roughness: 0.35 }));
  crest.rotation.z = Math.PI / 2;
  const foam = new THREE.Mesh(crestGeo.clone(), new THREE.MeshBasicMaterial({ color: 0xe8f4fa, transparent: true, opacity: 0.85 }));
  foam.rotation.z = Math.PI / 2;
  grp.add(crest, foam);

  // Inland flood sheet — grows from the shore toward the front during run-up.
  const flood = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.halfSize * 2 + 120, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a6f9a, transparent: true, opacity: 0.82, roughness: 0.5 }),
  );
  flood.rotation.x = -Math.PI / 2;
  flood.visible = false;
  grp.add(flood);

  // Spray thrown off the crest (73% CORS-free procedural points).
  const SP = Math.floor(300 * (ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.8 : 1));
  const sprayGeo = new THREE.BufferGeometry();
  const sprayPos = new THREE.BufferAttribute(new Float32Array(SP * 3), 3);
  sprayGeo.setAttribute('position', sprayPos);
  const sprayX = new Float32Array(SP);
  const sprayOff = new Float32Array(SP);
  const sprayPh = new Float32Array(SP);
  const sprayMag = new Float32Array(SP);
  for (let i = 0; i < SP; i++) {
    sprayX[i] = (rnd() * 2 - 1) * (WORLD.halfSize + 30);
    sprayOff[i] = (rnd() * 2 - 1) * 12;
    sprayPh[i] = rnd() * Math.PI * 2;
    sprayMag[i] = 0.6 + rnd() * 1.1;
  }
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xdff2fc, size: 1.3, transparent: true, opacity: 0.6 }));
  grp.add(spray);

  // Stilt houses behind the shore (raised for storm surge, like real coastal builds).
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a7f6a });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a4a3a });
  const stiltMat = new THREE.MeshLambertMaterial({ color: 0x5a5044 });
  for (let i = 0; i < 10; i++) {
    const x = -170 + i * 38 + (rnd() * 2 - 1) * 10;
    const z = -10 - rnd() * 110;
    const w = 10 + rnd() * 6;
    const body = new THREE.Group();
    // Clapboard walls with windows on the long sides (sea-facing and street-facing).
    const style = PALETTES.coastal[i % PALETTES.coastal.length];
    const seed = Math.floor(rnd() * 1e6);
    const front = facadeMaterial(style, seed, w, 5, 5);
    const side = facadeMaterial(style, seed + 1, 8, 5, 5);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w, 5, 8), [side, side, wallMat, wallMat, front, front]);
    cabin.position.y = 8;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 3.5, 4), roofMat);
    roof.position.y = 12.1;
    roof.rotation.y = Math.PI / 4;
    body.add(cabin, roof);
    for (const [lx, lz] of [[-w / 2 + 1, -3], [w / 2 - 1, -3], [-w / 2 + 1, 3], [w / 2 - 1, 3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 6), stiltMat);
      leg.position.set(lx, 3, lz);
      body.add(leg);
    }
    body.position.set(x, 0, z);
    grp.add(body);
    ctx.addCollider(x, z, w / 2 + 1);
  }

  // Palm-lined promenade.
  const palms: { fronds: THREE.Group; phase: number }[] = [];
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6e5a3f });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7b4f, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const x = -140 + i * 40 + rnd() * 8;
    const z = 34 + rnd() * 10;
    const h = 9 + rnd() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, h, 6), trunkMat);
    trunk.position.set(x, h / 2, z);
    const fronds = new THREE.Group();
    fronds.position.set(x, h, z);
    for (let f = 0; f < 6; f++) {
      const holder = new THREE.Group();
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5.2), frondMat);
      frond.rotation.x = -1.15;
      frond.position.set(0, 0.5, 2.6);
      holder.rotation.y = (f / 6) * Math.PI * 2;
      holder.add(frond);
      fronds.add(holder);
    }
    palms.push({ fronds, phase: rnd() * Math.PI * 2 });
    grp.add(trunk, fronds);
    ctx.addCollider(x, z, 1.4);
  }
  // Promenade railing along the waterline.
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8a8a90 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(WORLD.halfSize * 2, 0.25, 0.25), railMat);
  rail.position.set(0, 3.2, 48);
  grp.add(rail);
  for (let x = -220; x <= 220; x += 20) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 0.35), railMat);
    post.position.set(x, 1.7, 48);
    grp.add(post);
  }

  // Fishing boats rocking on the swell.
  const boats: { grp: THREE.Group; x0: number; z: number; off: number }[] = [];
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xd8d0c0 });
  const boatCabinMat = new THREE.MeshLambertMaterial({ color: 0x4a6a8a });
  for (let i = 0; i < 3; i++) {
    const bg = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 8), hullMat);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.6), boatCabinMat);
    cabin.position.set(0, 1.4, 1.2);
    bg.add(hull, cabin);
    boats.push({ grp: bg, x0: (rnd() * 2 - 1) * 150, z: 130 + i * 45, off: rnd() * Math.PI * 2 });
    grp.add(bg);
  }

  // Debris planks drifting shoreward inside the surge.
  const debris: { mesh: THREE.Mesh; x: number; off: number }[] = [];
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 3), plankMat);
    debris.push({ mesh: plank, x: (rnd() * 2 - 1) * 200, off: rnd() * 200 });
    grp.add(plank);
  }

  // Exposed sandy seabed + ripples + stranded boats, revealed during sea withdrawal.
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.halfSize * 2 + 120, SHORE_Z + 45),
    new THREE.MeshLambertMaterial({ color: 0xc9b285 }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, 0.12, SHORE_Z + 15);
  grp.add(bed);
  // Sand ripple ridges across the exposed bed.
  const rippleMat = new THREE.MeshLambertMaterial({ color: 0xb59c72 });
  for (let i = 0; i < 14; i++) {
    const ripple = new THREE.Mesh(new THREE.BoxGeometry(WORLD.halfSize * 2 + 100, 0.25, 2 + rnd() * 2), rippleMat);
    ripple.position.set((rnd() * 2 - 1) * 8, 0.22, 76 + i * 9 + (rnd() * 2 - 1) * 3);
    grp.add(ripple);
  }
  // Stranded boats left high and dry on the seabed during withdrawal.
  const stranded: { grp: THREE.Group; listY: number }[] = [];
  const strandHullMat = new THREE.MeshLambertMaterial({ color: 0xb8ac94 });
  for (let i = 0; i < 3; i++) {
    const bg = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 8), strandHullMat);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.6), boatCabinMat);
    cabin.position.set(0, 1.4, 1.2);
    bg.add(hull, cabin);
    bg.position.set(-120 + i * 110 + (rnd() * 2 - 1) * 20, 0.75, 85 + rnd() * 55);
    bg.rotation.set(0, rnd() * Math.PI, (rnd() * 2 - 1) * 0.14);
    stranded.push({ grp: bg, listY: 0.75 });
    grp.add(bg);
  }

  // High-water marks: permanent wrack/debris line + stained band on the promenade wall.
  const wrackMat = new THREE.MeshLambertMaterial({ color: 0x5c4a30 });
  for (let i = 0; i < 26; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(4 + rnd() * 7, 0.4 + rnd() * 0.35, 1.4 + rnd() * 1.2), wrackMat);
    w.position.set(-210 + i * 16 + (rnd() * 2 - 1) * 4, 0.3, 52 + (rnd() * 2 - 1) * 2.5);
    w.rotation.y = rnd() * Math.PI;
    grp.add(w);
  }
  const stainMat = new THREE.MeshBasicMaterial({ color: 0x6a5c44, transparent: true, opacity: 0.7 });
  const stain = new THREE.Mesh(new THREE.BoxGeometry(WORLD.halfSize * 2, 1.1, 0.08), stainMat);
  stain.position.set(0, 2.4, 47.8);
  grp.add(stain);

  // Warning siren light - flashes red when wave is approaching (last 15 seconds)
  const sirenLight = new THREE.PointLight(0xff3333, 0, 200, 2);
  sirenLight.position.set(0, 15, 60);
  sirenLight.visible = false;
  grp.add(sirenLight);

  // Cars/signs carried by the surge once it passes them (run-up phase only).
  const cars: { grp: THREE.Group; x: number; z0: number; yaw: number; roll: number }[] = [];
  const carColors = [0xb03a2e, 0x2e5a8a, 0xc9c9c9, 0x3f6b4a];
  for (let i = 0; i < 4; i++) {
    const cg = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: carColors[i % carColors.length] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 4.8), bodyMat);
    body.position.y = 0.7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 2.2), bodyMat);
    cab.position.set(0, 1.6, -0.3);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [wx2, wz2] of [[-1.2, -1.5], [1.2, -1.5], [-1.2, 1.5], [1.2, 1.5]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 8), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx2, 0.45, wz2);
      cg.add(wheel);
    }
    cg.add(body, cab);
    const cx = -150 + i * 95 + (rnd() * 2 - 1) * 12;
    const cz0 = 26 + rnd() * 14;
    cg.position.set(cx, 0, cz0);
    cars.push({ grp: cg, x: cx, z0: cz0, yaw: (rnd() * 2 - 1) * 0.8, roll: (rnd() * 2 - 1) * 0.2 });
    grp.add(cg);
    ctx.addCollider(cx, cz0, 2.6);
  }

  scene.add(grp);

  return {
    update: (_dt, t, v) => {
      const waveH = v.waveHeight ?? 8;
      const waveS = v.waveSpeed ?? 70;
      const pull = v.pullback ?? 0.5;
      const hN = (waveH - 2) / 18;
      const sN = (waveS - 30) / 90;

      // Fixed 60-second wave cycle with countdown
      const cyclePhase = (t * CYCLE_SPEED) % 1;
      const timeToWave = Math.max(0, CYCLE_DURATION * (1 - cyclePhase));
      const runup = SHORE_Z - 40 - pull * 150;
      let frontZ: number;
      if (cyclePhase < 0.42) frontZ = DEEP_Z + (runup - DEEP_Z) * ease(cyclePhase / 0.42);
      else if (cyclePhase < 0.52) frontZ = runup;
      else frontZ = runup + (DEEP_Z - runup) * ease((cyclePhase - 0.52) / 0.48);

      // Set hazard position at wave front for NPC evacuation
      setHazard(0, frontZ);

      const depth = 3 + waveH * 0.5;
      crest.position.set(0, waveH * 0.55, frontZ);
      crest.scale.set(waveH, 1, depth);
      foam.position.set(0, waveH * 0.5, frontZ - depth * 0.5);
      foam.scale.set(waveH * 0.55, 1, depth * 1.08);
      (crest.material as THREE.MeshStandardMaterial).opacity = 0.72 + hN * 0.22;

      // Inland flood sheet follows the front once it passes the shoreline.
      // When wave reaches max run-up, it floods the entire town area.
      if (frontZ < SHORE_Z - 2) {
        flood.visible = true;
        const maxRunupZ = SHORE_Z - 40 - pull * 150; // same as runup
        const isAtMaxRunup = frontZ <= maxRunupZ + 5;
        const targetZ = isAtMaxRunup ? -WORLD.halfSize + 20 : frontZ; // flood entire town at max runup
        const span = SHORE_Z - targetZ + 4;
        flood.scale.y = span;
        flood.position.set(0, 2.2, (SHORE_Z + targetZ) / 2);
        (flood.material as THREE.MeshStandardMaterial).opacity = 0.75 + hN * 0.2;
        // Deepen water color at max runup
        if (isAtMaxRunup) {
          (flood.material as THREE.MeshStandardMaterial).color.setHex(0x1a4a7a);
        } else {
          (flood.material as THREE.MeshStandardMaterial).color.setHex(0x2a6f9a);
        }
      } else {
        flood.visible = false;
      }

      // Warning siren: flashes red during last 15 seconds before wave impact
      const warningTime = 15; // seconds
      const inWarning = timeToWave > 0 && timeToWave <= warningTime && cyclePhase < 0.42;
      sirenLight.visible = inWarning;
      if (inWarning) {
        const flash = Math.sin(t * 10) > 0; // rapid flash
        sirenLight.intensity = flash ? 8 : 0;
        sirenLight.color.setHex(flash ? 0xff3333 : 0xff6666);
      }

      // Sea withdrawal: before arrival (and with higher pullback) the water pulls
      // back off the shore, exposing wet sand, ripples and stranded boats — then
      // the front returns and re-covers them.
      let withdraw = 0;
      if (cyclePhase < 0.42) withdraw = 1 - ease(cyclePhase / 0.42);
      else if (cyclePhase >= 0.52) withdraw = ease((cyclePhase - 0.52) / 0.48) * (1 - ease((cyclePhase - 0.52) / 0.48)) * 4;
      withdraw = Math.min(1, withdraw * (0.35 + pull * 0.65));
      const waterY = 2 - withdraw * 1.9;
      for (const st of stranded) {
        st.grp.visible = withdraw > 0.06;
        st.grp.position.y = st.listY - withdraw * 0.05;
        st.grp.rotation.z += Math.sin(t * 0.4 + st.listY * 7) * 0.0008 * withdraw;
      }

      // Sea swell breathes with the front's approach.
      sea.position.y = waterY + Math.sin(t * 1.1) * 0.2 + hN * 0.4;

      // Spray: procedural arcs peaking above the crest.
      const sprayW = 2.2 + sN * 3;
      for (let i = 0; i < SP; i++) {
        const f = Math.abs(Math.sin(t * sprayW + sprayPh[i]));
        sprayPos.setXYZ(
          i,
          sprayX[i] + Math.sin(t * 0.7 + sprayPh[i]) * 5,
          2 + Math.pow(f, 1.4) * waveH * sprayMag[i],
          frontZ - 6 + sprayOff[i] + f * 4,
        );
      }
      sprayPos.needsUpdate = true;
      (spray.material as THREE.PointsMaterial).opacity = 0.3 + hN * 0.5;

      // Palms lean with the onshore wind.
      for (const pl of palms) {
        pl.fronds.rotation.z = Math.sin(t * (1.1 + sN * 0.8) + pl.phase) * (0.06 + hN * 0.14);
        pl.fronds.rotation.x = Math.cos(t * (0.9 + sN * 0.6) + pl.phase) * 0.05;
      }

      // Boats bob; they pitch harder as the crest sweeps under them.
      for (const b of boats) {
        const nearFront = Math.abs(b.z - frontZ) < 40 ? 1 : 0;
        const bob = 0.35 + nearFront * (0.8 + hN * 1.2);
        b.grp.position.set(b.x0 + Math.sin(t * 0.15 + b.off) * 10, 2.3 + Math.sin(t * 1.35 + b.off) * bob, b.z + Math.sin(t * 0.22 + b.off) * 6);
        b.grp.rotation.z = Math.sin(t * 1.5 + b.off) * (0.06 + nearFront * 0.18);
        b.grp.rotation.y = b.off + Math.sin(t * 0.3 + b.off) * 0.1;
      }

      // Cars and signs are picked up by the surge and ride it shoreward during
      // run-up, tumbling as they go; they settle once the front recedes.
      const rideSpd = (2.5 + sN * 6) * (reduceMotion ? 0.4 : 1);
      for (const c of cars) {
        const picked = frontZ < c.z0;
        if (picked) {
          c.z0 -= rideSpd * _dt;
          if (c.z0 < -30) c.z0 = 26 + rnd() * 14;
          c.grp.position.set(
            c.x + Math.sin(t * 0.6 + c.x) * 2.5,
            1.1 + Math.sin(t * 2.2 + c.x) * 0.35 * (0.5 + hN),
            c.z0,
          );
          c.grp.rotation.set(
            Math.sin(t * 1.7 + c.x) * 0.22 * hN,
            c.yaw + Math.sin(t * 0.9 + c.x) * 0.3,
            c.roll + Math.sin(t * 2.4 + c.x) * 0.18 * hN,
          );
        } else {
          c.grp.position.set(c.x, 0, c.z0);
          c.grp.rotation.set(0, c.yaw, 0);
        }
      }

      // Planks ride the surge toward the shore, then recycle offshore.
      for (const d of debris) {
        const z = SHORE_Z + 12 + ((t * (1.5 + sN * 5) + d.off) % 200);
        d.mesh.position.set(d.x + Math.sin(t * 0.5 + d.off) * 3, 2.35 + Math.sin(t * 1.6 + d.off) * 0.35, z);
        d.mesh.rotation.set(Math.sin(t * 0.9 + d.off) * 0.2, d.off, Math.cos(t * 1.2 + d.off) * 0.15);
      }
    },
  };
}
