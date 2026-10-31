/* Big Bang pack — float through cosmic history in zero-g.
 *
 * Everything is driven by the Friedmann model in hazards.ts (cosmicState):
 *  · Size: every structure sits at a comoving position scaled by the scale
 *    factor a(t), so the whole scene expands (or recollapses) together —
 *    there is no centre of the Big Bang, the patch around you just stretches.
 *  · Opaque plasma: before recombination the universe glows at the
 *    blackbody colour of T = 2.7255 K / a and light can't travel far (fog).
 *    Particles change from quarks (colour charge) → protons & neutrons →
 *    hydrogen + ~8 % helium nuclei (25 % by mass) as it cools.
 *  · First light: at ~380,000 years the fog lifts and the cosmic microwave
 *    background glows orange (≈3,000 K), then reddens and fades as it
 *    redshifts toward 2.7 K microwaves.
 *  · Structure: gas slides from a smooth spread onto the cosmic web as the
 *    growth of structure proceeds; blue Population III stars ignite at the
 *    web's knots, then galaxies — redder the farther they are from you.
 * Scales are illustrative, not real.
 */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { cosmicState, epochSeconds } from '../hazards';
import { galaxySky, glowTexture, starDome } from './space';

const CENTER = new THREE.Vector3(0, 40, 0);

export const bigbangPalette: EnvPalette = {
  ground: '#05050a', speckle: '#0a0a12', sky: 0x020208, fog: 0x020208,
  fogNear: 900, fogFar: 1400, hemiSky: 0x5a5a7a, hemiGround: 0x101018, sun: 0xfff2e0,
  sunPos: [200, 300, 100], sunIntensity: 0.8, hemiIntensity: 0.7,
};

/** Approximate sRGB colour of a blackbody at T kelvin (Tanner Helland fit). */
export function blackbodyColor(T: number, out = new THREE.Color()): THREE.Color {
  const t = Math.min(40000, Math.max(1000, T)) / 100;
  let r: number; let g: number; let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (x: number) => Math.min(255, Math.max(0, x)) / 255;
  return out.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

/** Visual radius of the comoving patch for a scale factor (illustrative). */
function patchRadius(a: number): number {
  return Math.min(1400, Math.max(6, 380 * Math.pow(10, 0.22 * Math.log10(Math.max(1e-40, a)))));
}

function cmbTexture(rnd: () => number): THREE.CanvasTexture | null {
  const W = 1024; const H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  // Anisotropies: tiny (1 part in 100,000) hot/cold spots, exaggerated to be seen.
  for (const [n, rMax, a] of [[900, 40, 0.12], [3000, 14, 0.1], [9000, 5, 0.08]] as const) {
    for (let i = 0; i < n; i++) {
      const hot = rnd() > 0.5;
      g.fillStyle = hot ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.beginPath(); g.arc(rnd() * W, rnd() * H, 2 + rnd() * rMax, 0, Math.PI * 2); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function spiralTexture(rnd: () => number, hue: string): THREE.CanvasTexture | null {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.18);
  core.addColorStop(0, 'rgba(255,240,210,1)');
  core.addColorStop(1, 'rgba(255,220,180,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);
  // Two logarithmic arms of young blue stars.
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 260; i++) {
      const th = (i / 260) * Math.PI * 3.2;
      const r = 6 * Math.exp(0.28 * th);
      if (r > S * 0.48) break;
      const a = th + arm * Math.PI;
      const x = S / 2 + Math.cos(a) * r + (rnd() - 0.5) * 6;
      const y = S / 2 + Math.sin(a) * r * 0.6 + (rnd() - 0.5) * 4;
      g.fillStyle = `${hue}${(0.15 + rnd() * 0.35).toFixed(2)})`;
      g.beginPath(); g.arc(x, y, 1 + rnd() * 2, 0, Math.PI * 2); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function bigbangFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(1380);
  const hi = ctx.quality !== 'low';

  const skyTex = galaxySky(rnd, hi);
  const deepSky = new THREE.Color(0x020208);
  scene.background = deepSky.clone();
  const stars = starDome(rnd, ctx.quality === 'low' ? 1200 : 2500);
  scene.add(stars);
  const fog = scene.fog as THREE.Fog;

  // Backdrop sphere riding with the camera: the glowing plasma, then the CMB.
  const cmbTex = cmbTexture(rnd);
  const veilMat = new THREE.MeshBasicMaterial({ map: cmbTex, color: 0xffffff, side: THREE.BackSide, depthWrite: false, fog: false, transparent: true });
  const veil = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), veilMat);
  veil.renderOrder = -20;
  veil.frustumCulled = false;
  veil.onBeforeRender = (_r, _s, camera) => { veil.position.copy(camera.position); veil.updateMatrixWorld(true); };
  scene.add(veil);

  // ---- The cosmic web (comoving unit sphere) ----
  const NODES = 46;
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < NODES; i++) {
    const v = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.7, rnd() * 2 - 1);
    if (v.length() > 1) v.setLength(0.4 + rnd() * 0.6);
    nodes.push(v);
  }
  const edges: [number, number][] = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => ({ j, d: n.distanceTo(m) })).filter((e) => e.j !== i).sort((a, b) => a.d - b.d).slice(0, 3);
    for (const e of near) if (i < e.j) edges.push([i, e.j]);
  });
  const GN = Math.floor(1400 * (ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.8 : 1));
  const smooth = new Float32Array(GN * 3);
  const web = new Float32Array(GN * 3);
  const kind = new Float32Array(GN);   // 0..1 random per particle
  for (let i = 0; i < GN; i++) {
    const v = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.7, rnd() * 2 - 1);
    smooth.set([v.x, v.y, v.z], i * 3);
    const onNode = rnd() < 0.3;
    let w: THREE.Vector3;
    if (onNode) {
      w = nodes[Math.floor(rnd() * NODES)].clone().add(new THREE.Vector3((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06));
    } else {
      const [ia, ib] = edges[Math.floor(rnd() * edges.length)];
      w = nodes[ia].clone().lerp(nodes[ib], rnd()).add(new THREE.Vector3((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03));
    }
    web.set([w.x, w.y, w.z], i * 3);
    kind[i] = rnd();
  }
  const gGeo = new THREE.BufferGeometry();
  const gPos = new THREE.BufferAttribute(new Float32Array(GN * 3), 3);
  const gCol = new THREE.BufferAttribute(new Float32Array(GN * 3), 3);
  gGeo.setAttribute('position', gPos);
  gGeo.setAttribute('color', gCol);
  const dot = glowTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']], 64);
  const gasMat = new THREE.PointsMaterial({ map: dot, size: 5, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const gas = new THREE.Points(gGeo, gasMat);
  gas.frustumCulled = false;
  gas.position.copy(CENTER);
  scene.add(gas);

  // Filament lines (faint dark-matter scaffolding once structure forms).
  const lineGeo = new THREE.BufferGeometry();
  const lPos = new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3);
  lineGeo.setAttribute('position', lPos);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x6a5acd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.position.copy(CENTER);
  scene.add(lines);

  // Big spiral galaxies at the richest knots.
  const galaxyTex = [spiralTexture(rnd, 'rgba(150,190,255,'), spiralTexture(rnd, 'rgba(255,210,170,')];
  const bigGalaxies: { s: THREE.Sprite; node: THREE.Vector3; size: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTex[i % 2], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, rotation: rnd() * Math.PI * 2 }));
    bigGalaxies.push({ s, node: nodes[(i * 7) % NODES], size: 0.03 + rnd() * 0.04 });
    s.position.copy(CENTER);
    scene.add(s);
  }

  // Inflation flash: a blinding seed of light when t < 10⁻³² s.
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(230,220,255,0.6)'], [1, 'rgba(200,180,255,0)']]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  flash.position.copy(CENTER);
  scene.add(flash);

  // ---- State ----
  let logT = -10;                 // displayed log10(t / s), eased toward the slider
  let cacheKey = '';
  let state = cosmicState({ epoch: 0.97 });
  const tmp = new THREE.Color();
  const tint = new THREE.Color();
  const plasmaCol = new THREE.Color();
  const cfg = { h0: 67.4, om: 0.315, ol: 0.685 };

  return {
    reset: () => { cacheKey = ''; },
    update: (dt, t, v) => {
      // Ease cosmic time so preset jumps play as a fast-forward of history.
      const target = Math.log10(epochSeconds(v.epoch ?? 0.97));
      const step = (ctx.reduceMotion ? 4 : 8) * dt;     // decades per second
      logT += Math.max(-step, Math.min(step, target - logT));
      cfg.h0 = v.h0 ?? 67.4; cfg.om = v.om ?? 0.315; cfg.ol = v.ol ?? 0.685;
      const key = `${logT.toFixed(3)}|${cfg.h0}|${cfg.om}|${cfg.ol}`;
      if (key !== cacheKey) {
        cacheKey = key;
        const epoch = (logT + 36) / 54.5;
        state = cosmicState({ epoch, h0: cfg.h0, om: cfg.om, ol: cfg.ol });
      }
      const c = state;
      const R = c.crunch ? 6 : patchRadius(c.a);
      const tempK = c.tempK;

      // Opaque plasma: the universe glows at its blackbody colour; fog closes in.
      const opaque = 1 - c.clarity;
      if (tempK > 1e5) plasmaCol.setRGB(1, 0.97, 1.0); else blackbodyColor(tempK, plasmaCol);
      if (logT < -32) plasmaCol.setRGB(1, 1, 1);
      fog.color.copy(deepSky).lerp(plasmaCol, opaque);
      fog.near = 2 + c.clarity * 900;
      fog.far = 70 + c.clarity * 1330;
      // Once galaxies shine, a Milky Way-like sky surrounds you.
      if (c.clarity > 0.98 && skyTex && c.starlight > 0.5 && !c.crunch) {
        scene.background = skyTex;
      } else {
        if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
        (scene.background as THREE.Color).copy(deepSky).lerp(plasmaCol, opaque);
      }
      stars.visible = c.starlight > 0.6 && !c.crunch;

      // CMB on the backdrop: bright orange at release, fading as it redshifts
      // (intensity ∝ T⁴), invisible to eyes once it slips into infrared.
      const cmbVis = c.clarity * Math.min(1, Math.pow(Math.max(0, tempK) / 3000, 4)) + opaque;
      veilMat.color.copy(opaque > 0.5 ? plasmaCol : blackbodyColor(Math.max(1000, tempK), tmp));
      veilMat.opacity = Math.min(1, cmbVis);
      veil.visible = veilMat.opacity > 0.01;

      // Gas: smooth → cosmic web as structure grows; colours by era.
      const sGrow = c.structure;
      const jitter = opaque * 0.02 * (logT < -6 ? 3 : 1);
      const px = ctx.player.x - CENTER.x; const py = ctx.player.y - CENTER.y; const pz = ctx.player.z - CENTER.z;
      for (let i = 0; i < GN; i++) {
        const k = i * 3;
        let x = smooth[k] + (web[k] - smooth[k]) * sGrow;
        let y = smooth[k + 1] + (web[k + 1] - smooth[k + 1]) * sGrow;
        let z = smooth[k + 2] + (web[k + 2] - smooth[k + 2]) * sGrow;
        if (jitter > 0) { x += (Math.random() - 0.5) * jitter; y += (Math.random() - 0.5) * jitter; z += (Math.random() - 0.5) * jitter; }
        gPos.setXYZ(i, x * R, y * R, z * R);
        const q = kind[i];
        if (logT < -6) {
          // Quark–gluon plasma: "colour charge" red / green / blue.
          tint.setRGB(q < 0.33 ? 1 : 0.3, q >= 0.33 && q < 0.66 ? 1 : 0.3, q >= 0.66 ? 1 : 0.3);
        } else if (logT < 0) {
          tint.set(q < 0.5 ? 0xff7a7a : 0xc8c8d0);           // protons / neutrons
        } else if (c.clarity < 0.5) {
          tint.set(q < 0.92 ? 0xf0f4ff : 0xffd36a);          // H vs He nuclei (~8 % by number)
        } else {
          // Neutral gas, then stars & galaxies; Pop III stars are blue-white.
          const lit = c.starlight > q;
          if (lit) tint.set(q < 0.2 ? 0x9fc0ff : q < 0.6 ? 0xfff1d8 : 0xffc78a);
          else tint.setRGB(0.35, 0.12, 0.1).multiplyScalar(0.5 + 0.5 * sGrow);
          // Cosmological redshift: the farther from you, the redder.
          const dd = Math.hypot(x * R - px, y * R - py, z * R - pz);
          const red = Math.min(0.8, dd / 1400) * c.starlight;
          tint.lerp(tmp.setRGB(1, 0.25, 0.1), red);
        }
        gCol.setXYZ(i, tint.r, tint.g, tint.b);
      }
      gPos.needsUpdate = true;
      gCol.needsUpdate = true;
      gasMat.size = c.clarity < 0.5 ? 3 : 3 + c.starlight * 5;
      gasMat.opacity = c.crunch ? 0 : 0.35 + 0.6 * Math.max(opaque, c.starlight, 0.3);

      // Filaments fade in as dark matter pulls gas onto the web.
      edges.forEach(([ia, ib], i) => {
        lPos.setXYZ(i * 2, nodes[ia].x * R, nodes[ia].y * R, nodes[ia].z * R);
        lPos.setXYZ(i * 2 + 1, nodes[ib].x * R, nodes[ib].y * R, nodes[ib].z * R);
      });
      lPos.needsUpdate = true;
      lineMat.opacity = sGrow * 0.25 * (1 - c.starlight * 0.5);

      // Galaxies grow at the knots after cosmic dawn.
      const gal = Math.max(0, (c.starlight - 0.4) / 0.6);
      for (const g of bigGalaxies) {
        g.s.visible = gal > 0.01 && !c.crunch;
        g.s.position.set(CENTER.x + g.node.x * R, CENTER.y + g.node.y * R, CENTER.z + g.node.z * R);
        g.s.scale.setScalar(Math.max(4, g.size * R * (0.4 + 0.6 * gal)));
        (g.s.material as THREE.SpriteMaterial).opacity = gal;
      }

      // Inflation (and a crunch) flare up as one blinding point.
      const flare = logT < -30 ? 1 : c.crunch ? 1 : 0;
      (flash.material as THREE.SpriteMaterial).opacity = flare * (0.85 + 0.15 * Math.sin(t * 9));
      flash.scale.setScalar(60 + Math.max(0, -30 - logT) * 4);
    },
  };
}
