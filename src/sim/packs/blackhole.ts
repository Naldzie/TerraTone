/* Black Hole pack — zero-g deep space beside an accreting black hole.
 *
 * Physically motivated visuals (scaled for a game, NOT to scale):
 *  · Shadow of radius √27/2 r_s ≈ 2.6 r_s (photon capture), ringed by a thin
 *    photon ring.
 *  · Gravitational lensing of the sky: a camera-facing shader bends each view
 *    ray by the weak-field angle α = 2 r_s / b (b = impact parameter), so
 *    stars smear into arcs and an Einstein ring; rays that pass just outside
 *    the shadow are bent onto the far side of the disk, drawing the famous
 *    lensed arc over the top and under the bottom of the hole.
 *  · Thin accretion disk from the ISCO outward with the Shakura–Sunyaev
 *    temperature profile T ∝ r^-¾ (1 − √(r_in/r))^¼, Keplerian shear
 *    (Ω ∝ r^-3/2), relativistic Doppler beaming (∝ δ⁴, approaching side
 *    brighter and bluer) and gravitational redshift √(1 − r_s/r).
 *  · Relativistic jets along the spin axis when spin and feeding are high.
 *  · Gas clumps spiralling in and plunging once they cross the ISCO.
 */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { BH_UNITS_PER_RS, blackHole } from '../hazards';
import { galaxySky, glowTexture, starDome } from './space';

const RS = BH_UNITS_PER_RS;
/** The hole floats above the play area so you can fly under and around it. */
export const BH_CENTER = new THREE.Vector3(0, 46, 0);
const SHADOW_R = 2.598 * RS;
const DISK_OUT = 15 * RS;
const DISK_TILT = 0.2;

export const blackholePalette: EnvPalette = {
  ground: '#05060c', speckle: '#0b0d16', sky: 0x010108, fog: 0x010108,
  fogNear: 900, fogFar: 1400, hemiSky: 0x3a3050, hemiGround: 0x0a0812, sun: 0xffd9a8,
  sunPos: [0, 46, 0], sunIntensity: 0.9, hemiIntensity: 0.55,
};

/** Gentle Newtonian pull toward the hole (world units / s²), capped. */
export function blackholePull(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const dx = BH_CENTER.x - x; const dy = BH_CENTER.y - y; const dz = BH_CENTER.z - z;
  const r = Math.hypot(dx, dy, dz);
  if (r > 300 || r < 1) return { x: 0, y: 0, z: 0 };
  const a = Math.min(30, 22000 / (r * r));
  return { x: (dx / r) * a, y: (dy / r) * a, z: (dz / r) * a };
}

export const BH_KILL_ZONE = { x: BH_CENTER.x, y: BH_CENTER.y, z: BH_CENTER.z, r: SHADOW_R * 0.9 };

/* ---------------------------------------------------------------- lens --- */

const LENS_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const LENS_FRAG = /* glsl */ `
uniform sampler2D uSky;
uniform vec3 uCenter;
uniform float uRs;
uniform float uShadow;
uniform float uLensR;
uniform vec3 uDiskN;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskGlow;
uniform float uTime;
varying vec3 vWorld;
const float PI = 3.14159265;

vec3 sky(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  return texture2D(uSky, uv).rgb;
}
vec3 diskColor(float x) {          // x = r / r_in ≥ 1
  float t = pow(x, -0.75) * pow(max(0.0, 1.0 - sqrt(1.0 / x)), 0.25) * 2.2;
  return mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.92, 0.8), clamp(t, 0.0, 1.0)) * t;
}

void main() {
  vec3 ro = cameraPosition;
  vec3 d = normalize(vWorld - ro);
  vec3 oc = uCenter - ro;
  float tc = dot(oc, d);
  vec3 closest = ro + d * tc;
  vec3 bvec = uCenter - closest;
  float b = length(bvec);
  float edge = smoothstep(uLensR, uLensR * 0.75, length(vWorld - uCenter));
  if (tc < 0.0) { gl_FragColor = vec4(0.0); return; }

  vec3 col;
  if (b < uShadow) {
    col = vec3(0.0);                                   // captured photons: the shadow
  } else {
    float alpha = min(2.2, 2.0 * uRs / b);             // weak-field deflection 4GM/(c² b)
    vec3 dl = normalize(d + normalize(bvec) * alpha);
    col = sky(dl);
    // Lensed image of the far side of the disk: follow the bent ray from the
    // point of closest approach until it crosses the disk plane.
    float denom = dot(dl, uDiskN);
    if (abs(denom) > 1e-3) {
      float th = dot(uCenter - closest, uDiskN) / denom;
      if (th > 0.0) {
        vec3 hit = closest + dl * th;
        float r = length(hit - uCenter);
        if (r > uDiskIn && r < uDiskOut) {
          float fade = smoothstep(uDiskOut, uDiskOut * 0.6, r);
          col += diskColor(r / uDiskIn) * uDiskGlow * fade * (0.8 + 0.2 * sin(r * 0.6 - uTime * 2.0));
        }
      }
    }
    // Photon ring: light that looped the hole, piled up just outside the shadow.
    float ring = exp(-pow((b - uShadow * 1.02) / (uShadow * 0.025), 2.0));
    col += vec3(1.0, 0.85, 0.6) * ring * (0.6 + uDiskGlow);
  }
  gl_FragColor = vec4(col, edge);
}`;

/* ---------------------------------------------------------------- disk --- */

const DISK_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const DISK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uRin;
uniform float uRout;
uniform float uRs;
uniform float uGlow;
uniform mat3 uRot;          // disk local → world rotation
varying vec3 vLocal;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  float r = length(vLocal.xz);
  if (r < uRin || r > uRout) discard;
  float x = r / uRin;
  // Shakura–Sunyaev effective temperature (normalised).
  float T = pow(x, -0.75) * pow(max(0.0, 1.0 - sqrt(1.0 / x)), 0.25) / 0.488;
  // Keplerian shear: angular speed ∝ r^-1.5 winds turbulence into spirals.
  float ang = atan(vLocal.z, vLocal.x);
  float omega = 3.0 * pow(r / uRin, -1.5);
  float turb = noise(vec2(ang * 6.0 - omega * uTime, r * 0.35)) * 0.6 + noise(vec2(ang * 18.0 - omega * uTime * 3.0, r * 1.1)) * 0.4;
  // Doppler beaming: orbital speed β = √(r_s / 2r), toward the camera brightens.
  float beta = min(0.7, sqrt(uRs / (2.0 * r)));
  vec3 tangent = uRot * normalize(vec3(-vLocal.z, 0.0, vLocal.x));
  vec3 view = normalize(cameraPosition - vWorld);
  float bl = beta * dot(tangent, view);
  float gamma = 1.0 / sqrt(1.0 - beta * beta);
  float dop = 1.0 / (gamma * (1.0 - bl));
  float grav = sqrt(max(0.0, 1.0 - uRs / r));
  float shift = dop * grav;
  float I = T * pow(shift, 4.0) * (0.55 + 0.75 * turb) * uGlow;
  // Colour from the shifted temperature: red-orange outer, white-blue inner.
  float tc = clamp(T * shift * 0.9, 0.0, 1.6);
  vec3 col = mix(vec3(0.9, 0.22, 0.05), vec3(1.0, 0.78, 0.45), clamp(tc, 0.0, 1.0));
  col = mix(col, vec3(0.75, 0.85, 1.0), clamp(tc - 1.0, 0.0, 0.6));
  float edgeFade = smoothstep(uRout, uRout * 0.8, r) * smoothstep(uRin, uRin * 1.06, r);
  gl_FragColor = vec4(col * I * edgeFade, 1.0);
}`;

export function blackholeFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(4242);

  const skyTex = galaxySky(rnd, ctx.quality !== 'low', { stars: true });
  if (skyTex) scene.background = skyTex;
  scene.add(starDome(rnd, ctx.quality === 'low' ? 1500 : 3500));

  const hole = new THREE.Group();
  hole.position.copy(BH_CENTER);
  scene.add(hole);

  // The shadow: an opaque black sphere hides the disk behind it.
  const shadow = new THREE.Mesh(new THREE.SphereGeometry(SHADOW_R, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  hole.add(shadow);

  // Lensing billboard (drawn before the disk, behind everything at the hole).
  const lensR = 26 * RS;
  const lensMat = new THREE.ShaderMaterial({
    vertexShader: LENS_VERT, fragmentShader: LENS_FRAG,
    transparent: true, depthWrite: false,
    uniforms: {
      uSky: { value: skyTex }, uCenter: { value: BH_CENTER.clone() }, uRs: { value: RS },
      uShadow: { value: SHADOW_R }, uLensR: { value: lensR },
      uDiskN: { value: new THREE.Vector3(0, 1, 0) }, uDiskIn: { value: 3 * RS }, uDiskOut: { value: DISK_OUT },
      uDiskGlow: { value: 0.6 }, uTime: { value: 0 },
    },
  });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(lensR * 2, lensR * 2), lensMat);
  lens.renderOrder = -5;
  lens.frustumCulled = false;
  lens.onBeforeRender = (_r, _s, camera) => {
    lens.quaternion.copy(camera.quaternion);
    lens.updateMatrixWorld(true);
  };
  hole.add(lens);

  // Accretion disk.
  const diskPivot = new THREE.Group();
  diskPivot.rotation.set(DISK_TILT, 0, 0.12);
  hole.add(diskPivot);
  const diskGeo = new THREE.RingGeometry(0.5 * RS, DISK_OUT, 192, 8);
  diskGeo.rotateX(-Math.PI / 2);
  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT, fragmentShader: DISK_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uRin: { value: 3 * RS }, uRout: { value: DISK_OUT }, uRs: { value: RS },
      uGlow: { value: 1 }, uRot: { value: new THREE.Matrix3() },
    },
  });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  diskPivot.add(disk);
  diskPivot.updateMatrixWorld(true);
  const diskNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(diskPivot.quaternion).normalize();
  lensMat.uniforms.uDiskN.value.copy(diskNormal);
  diskMat.uniforms.uRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(diskPivot.quaternion));

  // Soft glow around the inner disk.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(255,200,140,0.5)'], [0.35, 'rgba(255,150,80,0.15)'], [1, 'rgba(255,120,60,0)']]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  glow.scale.setScalar(DISK_OUT * 2.6);
  glow.renderOrder = -4;
  hole.add(glow);

  // Relativistic jets along the spin axis (blue synchrotron glow with knots).
  const jetMat = new THREE.MeshBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const jets: THREE.Mesh[] = [];
  for (const dir of [1, -1]) {
    const geo = new THREE.ConeGeometry(RS * 2.2, RS * 40, 24, 1, true);
    geo.translate(0, -RS * 20, 0);
    const jet = new THREE.Mesh(geo, jetMat);
    jet.rotation.x = dir > 0 ? Math.PI : 0;   // apex at the hole, opening outward
    diskPivot.add(jet);
    jets.push(jet);
  }
  const knots = new THREE.Group();
  const knotTex = glowTexture([[0, 'rgba(200,225,255,1)'], [1, 'rgba(160,200,255,0)']], 64);
  for (let i = 0; i < 16; i++) {
    const k = new THREE.Sprite(new THREE.SpriteMaterial({ map: knotTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    k.userData = { dir: i % 2 ? 1 : -1, phase: rnd() };
    knots.add(k);
  }
  diskPivot.add(knots);

  // Infalling gas clumps: spiral in (drag), then plunge inside the ISCO.
  const CN = ctx.quality === 'low' ? 140 : 320;
  const cGeo = new THREE.BufferGeometry();
  const cPos = new THREE.BufferAttribute(new Float32Array(CN * 3), 3);
  cGeo.setAttribute('position', cPos);
  const clumpR = new Float32Array(CN); const clumpA = new Float32Array(CN); const clumpH = new Float32Array(CN);
  for (let i = 0; i < CN; i++) { clumpR[i] = 3 * RS + rnd() * (DISK_OUT * 1.4); clumpA[i] = rnd() * Math.PI * 2; clumpH[i] = (rnd() - 0.5) * RS * 0.6; }
  const clumps = new THREE.Points(cGeo, new THREE.PointsMaterial({
    map: glowTexture([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], 32),
    color: 0xffc58a, size: 2.2, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  clumps.frustumCulled = false;
  diskPivot.add(clumps);

  // A distant companion star feeding the disk through a thin stream (like Cygnus X-1).
  const star = new THREE.Mesh(new THREE.SphereGeometry(22, 32, 20), new THREE.MeshBasicMaterial({ color: 0xbfd6ff, fog: false }));
  star.position.set(-300, 120, -260);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(200,220,255,0.9)'], [0.4, 'rgba(170,200,255,0.25)'], [1, 'rgba(150,180,255,0)']]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  starGlow.scale.setScalar(120);
  star.add(starGlow);
  scene.add(star);
  const streamPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    const p = new THREE.Vector3().lerpVectors(star.position, BH_CENTER, k);
    p.y += Math.sin(k * Math.PI) * 40;
    p.x += Math.sin(k * Math.PI) * 60 * (1 - k);
    streamPts.push(p);
  }
  const stream = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(streamPts), 80, 2.2, 8, false),
    new THREE.MeshBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  scene.add(stream);

  // A drifting research station so the void has a sense of scale.
  const station = new THREE.Group();
  station.position.set(-60, 8, 170);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd0d6e0, roughness: 0.4, metalness: 0.5 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(26, 2.4, 12, 48), metal);
  torus.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 12, 16), metal);
  station.add(torus, hub);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 26, 8), metal);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 4) * Math.PI;
    station.add(spoke);
  }
  scene.add(station);

  return {
    update: (dt, t, v) => {
      const bh = blackHole(v);
      const acc = Math.min(1, Math.max(0, v.accretion ?? 0.3));
      // Disk inner edge at the ISCO (but never inside the drawn shadow).
      const rin = Math.max(SHADOW_R * 1.08, bh.iscoRs * RS);
      diskMat.uniforms.uRin.value = rin;
      diskMat.uniforms.uTime.value = t;
      diskMat.uniforms.uGlow.value = 0.15 + acc * 1.4;
      disk.visible = acc > 0.005;
      lensMat.uniforms.uDiskIn.value = rin;
      lensMat.uniforms.uDiskGlow.value = disk.visible ? 0.15 + acc * 1.1 : 0;
      lensMat.uniforms.uTime.value = t;
      (glow.material as THREE.SpriteMaterial).opacity = 0.2 + acc * 0.8;

      // Jets: on for fast spin + healthy feeding; knots stream outward.
      const jetK = bh.jets ? Math.min(1, (bh.spin - 0.3) / 0.6) * Math.min(1, acc / 0.3) : 0;
      jetMat.opacity = jetK * 0.32;
      for (const j of jets) j.visible = jetK > 0.02;
      knots.visible = jetK > 0.02;
      for (const k of knots.children) {
        const u = k.userData as { dir: number; phase: number };
        const s = (u.phase + t * 0.12) % 1;
        k.position.set(0, u.dir * (SHADOW_R + s * RS * 40), 0);
        k.scale.setScalar(RS * (1.2 + s * 3));
        (k as THREE.Sprite).material.opacity = jetK * (1 - s) * 0.9;
      }

      // Gas clumps: Keplerian orbits with drag; inside the ISCO they plunge fast.
      clumps.visible = acc > 0.005;
      for (let i = 0; i < CN; i++) {
        const r = clumpR[i];
        const omega = 0.9 * Math.pow(r / (3 * RS), -1.5);
        clumpA[i] += omega * dt;
        clumpR[i] -= dt * (r < rin ? 60 : 1.2 + acc * 4);
        if (clumpR[i] < SHADOW_R * 0.95) { clumpR[i] = DISK_OUT * (0.9 + rnd() * 0.5); clumpA[i] = rnd() * Math.PI * 2; }
        cPos.setXYZ(i, Math.cos(clumpA[i]) * clumpR[i], clumpH[i] * Math.min(1, clumpR[i] / (6 * RS)), Math.sin(clumpA[i]) * clumpR[i]);
      }
      cPos.needsUpdate = true;

      station.rotation.y += dt * 0.05;
    },
  };
}
