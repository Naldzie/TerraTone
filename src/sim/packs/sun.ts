/* Sun pack — a lunar solar observatory under the Milky Way.
 *
 * The explorer walks a cratered Moon in 1/6 g while the Sun fills the sky.
 * The solar disk is a shader that follows the real physics we can see:
 *  · differential rotation (≈25 d at the equator, ≈35 d near the poles),
 *  · limb darkening (the edge is dimmer and redder than the centre),
 *  · convective granulation, faculae, and sunspots (umbra + penumbra) in two
 *    activity belts whose latitude follows Spörer's law,
 *  · flares that brighten an active region, and CMEs that sweep past the Moon
 *    on their way to Earth, which hangs in the sky with its magnetosphere
 *    and auroral ovals responding to the simulated Kp.
 * The sky is an equirectangular Milky Way painted on a canvas at load time.
 * Everything is procedural (offline-safe). Sizes and distances are NOT to scale.
 */
import * as THREE from 'three';
import type { EnvPalette, FeatureCtx, FeatureHandle } from '../EnvSim';
import { solarRotationRate, solarWeather } from '../hazards';
import { galaxySky, glowTexture, starDome } from './space';

/** Where the Sun sits in the sky (world units). */
export const SUN_POS: [number, number, number] = [0, 68, 680];
const SUN_R = 64;
const EARTH_POS = new THREE.Vector3(-430, 250, -520);
const EARTH_R = 42;
/** Simulated days that pass per real second (keeps the real period ratios). */
const DAYS_PER_SEC = 0.1;
const MAX_SPOTS = 14;

export const sunPalette: EnvPalette = {
  ground: '#6b6c72', speckle: '#45464c', sky: 0x010208, fog: 0x010208,
  fogNear: 240, fogFar: 640, hemiSky: 0x2a3350, hemiGround: 0x0b0b10, sun: 0xfff3e2,
  sunPos: SUN_POS, sunIntensity: 1.35, hemiIntensity: 0.55,
};

/* ---------------------------------------------------------------- sun --- */

const SUN_VERT = /* glsl */ `
varying vec3 vObjN;
varying float vMu;
void main() {
  vObjN = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vMu = clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SUN_FRAG = /* glsl */ `
uniform float uDays;
uniform float uTime;
uniform float uActivity;
uniform float uFlare;
uniform vec3 uFlareAt;          // flare site, co-rotating unit vector
uniform vec4 uSpots[${MAX_SPOTS}]; // lat, lon, radius, strength
uniform int uSpotCount;
varying vec3 vObjN;
varying float vMu;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 n = normalize(vObjN);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  // Differential rotation: ω(φ) = 14.713 − 2.396 sin²φ − 1.787 sin⁴φ  (°/day).
  float s2 = sin(lat) * sin(lat);
  float omega = radians(14.713 - 2.396 * s2 - 1.787 * s2 * s2);
  float lonR = lon + omega * uDays;   // co-rotating longitude
  vec3 p = vec3(cos(lat) * cos(lonR), sin(lat), cos(lat) * sin(lonR));

  // Granulation: bright cell centres, dark intergranular lanes.
  float gran = fbm(p * 38.0 + vec3(0.0, uTime * 0.05, 0.0));
  float cells = smoothstep(0.25, 0.75, gran);
  float bright = 0.86 + 0.18 * cells;

  // Sunspots: dark umbra in a lighter penumbra; faculae ring them.
  float spot = 1.0;
  float facula = 0.0;
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (i >= uSpotCount) break;
    vec4 s = uSpots[i];
    vec3 c = vec3(cos(s.x) * cos(s.y), sin(s.x), cos(s.x) * sin(s.y));
    float d = acos(clamp(dot(p, c), -1.0, 1.0));
    float r = s.z;
    float pen = smoothstep(r, r * 0.55, d);
    float umb = smoothstep(r * 0.5, r * 0.3, d);
    spot = min(spot, 1.0 - s.w * (0.4 * pen + 0.42 * umb));
    facula += s.w * smoothstep(r * 3.2, r * 1.1, d) * (1.0 - pen);
  }
  // Faculae show up mostly toward the limb.
  bright += facula * 0.22 * (1.0 - vMu) * (0.5 + uActivity);

  // Limb darkening (Eddington, u ≈ 0.6): I(μ) = 1 − u(1 − μ). The edge also reddens.
  float limb = 1.0 - 0.6 * (1.0 - vMu);
  vec3 core = vec3(1.0, 0.95, 0.84);
  vec3 edge = vec3(1.0, 0.55, 0.22);
  vec3 col = mix(edge, core, pow(vMu, 0.45)) * limb * bright * spot;
  // Spot interiors are cooler (~3,800 K): shift them amber, not just darker.
  col = mix(col, col * vec3(1.0, 0.55, 0.3), (1.0 - spot) * 0.8);

  // Flare: a blinding white-blue kernel over the active region.
  float fd = acos(clamp(dot(p, normalize(uFlareAt)), -1.0, 1.0));
  col += vec3(0.85, 0.9, 1.0) * uFlare * (exp(-fd * fd * 260.0) * 2.2 + exp(-fd * fd * 18.0) * 0.25);
  gl_FragColor = vec4(col * 1.35, 1.0);
}`;

/* CME front: a bubble that is bright only where you see it edge-on (like the
 * loop-shaped fronts in coronagraph images), threaded with filaments, and
 * nearly invisible face-on — so flying through one tints the sky only faintly. */
const CME_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
varying vec3 vObj;
void main() {
  vObj = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const CME_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uSeed;
varying vec3 vN;
varying vec3 vView;
varying vec3 vObj;
void main() {
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vView)));
  float edge = pow(rim, 3.0);
  float fil = 0.55 + 0.45 * sin(vObj.x * 9.0 + uSeed) * sin(vObj.y * 7.0 - uSeed) * sin(vObj.z * 8.0);
  gl_FragColor = vec4(vec3(1.0, 0.86, 0.7) * edge * fil * uOpacity * 0.6, 1.0);
}`;

/** White-light corona: helmet streamers fanning out of the limb. */
function coronaTexture(rnd: () => number): THREE.CanvasTexture | null {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const cx = S / 2;
  const disk = S * 0.19; // sprite is 5.2 R wide → R ≈ 0.19 S
  const halo = g.createRadialGradient(cx, cx, disk * 0.9, cx, cx, S / 2);
  halo.addColorStop(0, 'rgba(255,248,230,0.85)');
  halo.addColorStop(0.12, 'rgba(255,236,200,0.38)');
  halo.addColorStop(0.45, 'rgba(255,220,170,0.08)');
  halo.addColorStop(1, 'rgba(255,210,160,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  // Streamers are faint, diffuse plasma: blur them so they read as glow, not beams.
  g.filter = 'blur(9px)';
  for (let i = 0; i < 18; i++) {
    // Streamers cluster near the equator (as at solar minimum/mid-cycle).
    const eq = rnd() < 0.7;
    const a = (eq ? (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.9 : rnd() * Math.PI * 2);
    const len = disk * (0.9 + rnd() * 1.6);
    const wid = 0.08 + rnd() * 0.14;
    g.save();
    g.translate(cx, cx);
    g.rotate(a);
    const grad = g.createLinearGradient(disk * 0.95, 0, disk + len, 0);
    grad.addColorStop(0, 'rgba(255,226,180,0.13)');
    grad.addColorStop(0.5, 'rgba(255,214,160,0.05)');
    grad.addColorStop(1, 'rgba(255,210,150,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(disk * 0.95, -disk * wid * 2.2);
    g.quadraticCurveTo(disk * 1.4, 0, disk + len, 0);
    g.quadraticCurveTo(disk * 1.4, 0, disk * 0.95, disk * wid * 2.2);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural Earth: oceans, continents, ice caps. */
function earthTexture(rnd: () => number): THREE.CanvasTexture | null {
  const W = 512; const H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#1b4f8a';
  g.fillRect(0, 0, W, H);
  const land = ['#4f7a3a', '#6f8a46', '#9a8656', '#3f6a34'];
  for (let k = 0; k < 9; k++) {
    const cx = rnd() * W; const cy = H * (0.25 + rnd() * 0.5);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = land[Math.floor(rnd() * land.length)];
      g.beginPath();
      g.ellipse(cx + (rnd() - 0.5) * 90, cy + (rnd() - 0.5) * 50, 6 + rnd() * 22, 4 + rnd() * 14, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = '#eef4fa';
  g.fillRect(0, 0, W, H * 0.07);
  g.fillRect(0, H * 0.93, W, H * 0.07);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture(rnd: () => number): THREE.CanvasTexture | null {
  const W = 512; const H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  for (let i = 0; i < 520; i++) {
    const y = H * (0.5 + (rnd() - 0.5) * 0.9);
    g.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.22})`;
    g.beginPath();
    g.ellipse(rnd() * W, y, 8 + rnd() * 30, 2 + rnd() * 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

interface Spot { lat: number; lon: number; r: number; life: number; age: number }
interface Cme { mesh: THREE.Mesh; dir: THREE.Vector3; dist: number; speed: number; toEarth: boolean }

export function sunFeature(ctx: FeatureCtx): FeatureHandle {
  const { scene, rand } = ctx;
  const rnd = rand(1859);
  const hi = ctx.quality !== 'low';
  const sunVec = new THREE.Vector3(...SUN_POS);

  // Deep-space sky.
  const sky = galaxySky(rnd, ctx.quality !== 'low');
  if (sky) scene.background = sky;
  scene.add(starDome(rnd, ctx.quality === 'low' ? 2500 : ctx.quality === 'medium' ? 5000 : 8000));

  // ---------------------------------------------------------------- Sun
  const sunGroup = new THREE.Group();
  sunGroup.position.copy(sunVec);
  sunGroup.rotation.z = THREE.MathUtils.degToRad(7.25); // solar axial tilt
  scene.add(sunGroup);
  const spotUniform = Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4());
  const sunMat = new THREE.ShaderMaterial({
    vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, fog: false,
    uniforms: {
      uDays: { value: 0 }, uTime: { value: 0 }, uActivity: { value: 0.5 },
      uFlare: { value: 0 }, uFlareAt: { value: new THREE.Vector3(1, 0, 0) },
      uSpots: { value: spotUniform }, uSpotCount: { value: 0 },
    },
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, hi ? 96 : 56, hi ? 64 : 40), sunMat);
  sunGroup.add(sun);

  const additive = (map: THREE.Texture | null, color: number, opacity: number) =>
    new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const corona = new THREE.Sprite(additive(coronaTexture(rnd), 0xffffff, 0.8));
  corona.scale.setScalar(SUN_R * 5.2);
  const innerGlow = new THREE.Sprite(additive(glowTexture([
    [0, 'rgba(255,240,210,1)'], [0.38, 'rgba(255,220,160,0.55)'], [0.5, 'rgba(255,190,120,0.12)'], [1, 'rgba(255,170,90,0)'],
  ]), 0xffffff, 0.55));
  innerGlow.scale.setScalar(SUN_R * 2.7);
  const flareFlash = new THREE.Sprite(additive(glowTexture([
    [0, 'rgba(235,245,255,1)'], [0.3, 'rgba(200,220,255,0.35)'], [1, 'rgba(180,200,255,0)'],
  ]), 0xffffff, 0));
  flareFlash.scale.setScalar(SUN_R * 1.2);
  sunGroup.add(corona, innerGlow, flareFlash);

  // Prominences: H-alpha loops of cool plasma held up by magnetic arches.
  const promMat = new THREE.MeshBasicMaterial({
    color: 0xff5a6e, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const proms: { mesh: THREE.Mesh; lat: number; lon: number; phase: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(SUN_R * (0.07 + rnd() * 0.08), SUN_R * 0.012, 6, 28, Math.PI), promMat);
    const lat = (rnd() - 0.5) * 1.1;
    proms.push({ mesh: loop, lat, lon: rnd() * Math.PI * 2, phase: rnd() * 6 });
    sunGroup.add(loop);
  }

  // Sunspots, born in the activity belts and decaying over weeks.
  const spots: Spot[] = [];
  const spawnSpot = (beltDeg: number) => {
    const hemi = rnd() < 0.5 ? -1 : 1;
    const lat = THREE.MathUtils.degToRad(hemi * (beltDeg + (rnd() - 0.5) * 12));
    const lon = rnd() * Math.PI * 2;
    // Spots come in bipolar groups: a leader and one or two followers.
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n && spots.length < MAX_SPOTS; k++) {
      spots.push({
        lat: lat + (rnd() - 0.5) * 0.04, lon: lon - k * (0.05 + rnd() * 0.05),
        r: (k === 0 ? 0.035 : 0.022) + rnd() * 0.03, life: 18 + rnd() * 30, age: 0,
      });
    }
  };

  // Light from the Sun that we can flash during flares.
  const flashLight = new THREE.DirectionalLight(0xdfe8ff, 0);
  flashLight.position.copy(sunVec);
  scene.add(flashLight);

  // Inner planets on their real relative periods (Mercury 88 d, Venus 225 d).
  const planets: { mesh: THREE.Mesh; r: number; period: number; a0: number }[] = [];
  const orbitPlane = new THREE.Group();
  orbitPlane.position.copy(sunVec);
  orbitPlane.rotation.x = 0.32;
  scene.add(orbitPlane);
  for (const [r, period, size, color] of [[230, 88, 6, 0x9c9488], [330, 225, 11, 0xe8d3a4]] as const) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.9, fog: false }));
    orbitPlane.add(mesh);
    planets.push({ mesh, r, period, a0: rnd() * Math.PI * 2 });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.5, r + 0.5, 128),
      new THREE.MeshBasicMaterial({ color: 0x8ea2c8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    orbitPlane.add(ring);
  }

  // ---------------------------------------------------------------- Earth
  const earthGroup = new THREE.Group();
  earthGroup.position.copy(EARTH_POS);
  scene.add(earthGroup);
  const earthTilt = new THREE.Group();
  earthTilt.rotation.z = THREE.MathUtils.degToRad(23.44);
  earthGroup.add(earthTilt);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 48, 32),
    new THREE.MeshStandardMaterial({ map: earthTexture(rnd), roughness: 0.75, metalness: 0, fog: false }),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.015, 48, 32),
    new THREE.MeshStandardMaterial({ map: cloudTexture(rnd), transparent: true, depthWrite: false, fog: false }),
  );
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.07, 40, 28),
    new THREE.MeshBasicMaterial({ color: 0x5fa8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  earthTilt.add(earth, clouds, atmo);
  // Auroral ovals: rings of green (557.7 nm oxygen) with a red (630 nm) fringe.
  const auroraMat = new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const auroraRedMat = auroraMat.clone();
  auroraRedMat.color.set(0xff4f6a);
  const auroras: THREE.Mesh[] = [];
  for (const pole of [1, -1]) {
    for (const [mat, lift] of [[auroraMat, 1.03], [auroraRedMat, 1.06]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), mat);
      ring.rotation.x = Math.PI / 2;
      ring.userData = { pole, lift };
      earthTilt.add(ring);
      auroras.push(ring);
    }
  }
  // Magnetosphere: a bow-shaped magnetopause facing the Sun, open into a tail.
  const mpProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const r = (i / 24) * 2.2;
    mpProfile.push(new THREE.Vector2(r, 1 - (r * r) / 2.2));   // paraboloid, nose at y = 1
  }
  const magneto = new THREE.Mesh(
    new THREE.LatheGeometry(mpProfile, 40),
    new THREE.MeshBasicMaterial({ color: 0x64d2ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false, wireframe: false }),
  );
  const magnetoPivot = new THREE.Group();
  magnetoPivot.add(magneto);
  magnetoPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunVec.clone().sub(EARTH_POS).normalize());
  earthGroup.add(magnetoPivot);
  let earthHit = 0; // CME impact glow, decays

  // ---------------------------------------------------------------- CMEs + wind
  const cmeGeo = new THREE.SphereGeometry(1, 24, 16);
  const cmes: Cme[] = [];
  const launchCme = (from: THREE.Vector3, speedKms: number) => {
    const toEarth = rnd() < 0.55;
    const earthDir = EARTH_POS.clone().sub(sunVec).normalize();
    const dir = toEarth ? earthDir.clone().lerp(from, 0.25).normalize() : from.clone();
    const mesh = new THREE.Mesh(cmeGeo, new THREE.ShaderMaterial({
      vertexShader: CME_VERT, fragmentShader: CME_FRAG,
      uniforms: { uOpacity: { value: 0.9 }, uSeed: { value: rnd() * 50 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    scene.add(mesh);
    cmes.push({ mesh, dir, dist: SUN_R, speed: 60 + speedKms * 0.11, toEarth });
  };

  const WN = Math.floor(900 * (ctx.quality === 'low' ? 0.4 : ctx.quality === 'medium' ? 0.7 : 1));
  const wGeo = new THREE.BufferGeometry();
  const wPos = new THREE.BufferAttribute(new Float32Array(WN * 3), 3);
  const wDir = new Float32Array(WN * 3);
  const wDist = new Float32Array(WN);
  wGeo.setAttribute('position', wPos);
  const windPts = new THREE.Points(wGeo, new THREE.PointsMaterial({
    map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 32),
    color: 0xffe9b8, size: 1.1, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  windPts.frustumCulled = false;
  scene.add(windPts);
  const respawnWind = (i: number, spread: boolean) => {
    // Aim at a random point around (and beyond) the observatory so the stream
    // visibly washes over the explorer.
    const tx = (rnd() - 0.5) * 900; const ty = rnd() * 160; const tz = 200 - rnd() * 900;
    const d = new THREE.Vector3(tx, ty, tz).sub(sunVec).normalize();
    wDir[i * 3] = d.x; wDir[i * 3 + 1] = d.y; wDir[i * 3 + 2] = d.z;
    wDist[i] = SUN_R * 1.1 + (spread ? rnd() * 1300 : 0);
  };
  for (let i = 0; i < WN; i++) respawnWind(i, true);

  // ---------------------------------------------------------------- Moon surface
  const regolith = new THREE.MeshStandardMaterial({ color: 0x77787e, roughness: 1 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 2 - 1) * 330; const z = (rnd() * 2 - 1) * 330;
    if (Math.hypot(x, z - 150) < 40 || Math.hypot(x, z + 60) < 70) continue;
    const r = 6 + rnd() * rnd() * 34;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 28), dark);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.06, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 6, 32), regolith);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 1, 0.45);
    rim.position.set(x, 0.1, z);
    rim.receiveShadow = true;
    scene.add(floor, rim);
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 40; i++) {
    const x = (rnd() * 2 - 1) * 340; const z = (rnd() * 2 - 1) * 340;
    if (Math.hypot(x, z - 150) < 30 || Math.hypot(x, z + 60) < 60) continue;
    const s = 1 + rnd() * rnd() * 7;
    const rock = new THREE.Mesh(rockGeo, regolith);
    rock.scale.set(s, s * (0.5 + rnd() * 0.5), s * (0.7 + rnd() * 0.5));
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rock.position.set(x, s * 0.3, z);
    rock.castShadow = true;
    scene.add(rock);
    // Boulders are walkable humps you can climb onto.
    if (s > 1.5) ctx.addCollider(x, z, s * 1.3, { top: s * 0.75 });
  }

  // Observatory: dome + heliostat telescope tracking the Sun, solar arrays.
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.5, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.4, metalness: 0.7 });
  const obs = new THREE.Group();
  obs.position.set(0, 0, -60);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(18, 19, 8, 32), white);
  base.position.y = 4;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
  dome.position.y = 8;
  const slit = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 19), new THREE.MeshStandardMaterial({ color: 0x1a1f2a, roughness: 0.6 }));
  slit.position.set(0, 21, -6);
  slit.rotation.x = 0.7;
  obs.add(base, dome, slit);
  const scope = new THREE.Group();
  scope.position.set(30, 0, 8);
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 7, 12), metal);
  pier.position.y = 3.5;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 18), white);
  const filter = new THREE.Mesh(new THREE.CircleGeometry(1.55, 20), new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.1, metalness: 0.9 }));
  filter.position.y = 6.01;
  filter.rotation.x = -Math.PI / 2;
  const tubeHolder = new THREE.Group();
  tubeHolder.position.y = 7.5;
  tube.add(filter);
  tubeHolder.add(tube);
  scope.add(pier, tubeHolder);
  obs.add(scope);
  scene.add(obs);
  ctx.addCollider(0, -60, 21);
  ctx.addCollider(30, -52, 3);
  // Point the telescope (its +y axis) at the Sun.
  const scopeWorld = new THREE.Vector3(30, 7.5, -52);
  tubeHolder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunVec.clone().sub(scopeWorld).normalize());

  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.25, metalness: 0.6, emissive: 0x0a1230, emissiveIntensity: 0.4 });
  const sunDirFlat = Math.atan2(sunVec.x, sunVec.z);
  const sunElev = Math.atan2(sunVec.y, Math.hypot(sunVec.x, sunVec.z));
  for (let i = 0; i < 6; i++) {
    const x = -90 + (i % 3) * 22; const z = -10 + Math.floor(i / 3) * 22;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 8), metal);
    mast.position.set(x, 2, z);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 8), panelMat);
    panel.position.set(x, 4.4, z);
    // Tilt each array square-on to the Sun (normal along the sun direction).
    panel.rotation.order = 'YXZ';
    panel.rotation.y = sunDirFlat;
    panel.rotation.x = Math.PI / 2 - sunElev;
    panel.castShadow = true;
    scene.add(mast, panel);
    ctx.addCollider(x, z, 5);
  }
  // Habitat module + lander, for scale.
  const hab = new THREE.Mesh(new THREE.CapsuleGeometry(7, 20, 6, 16), white);
  hab.rotation.z = Math.PI / 2;
  hab.position.set(80, 7, 40);
  hab.castShadow = true;
  scene.add(hab);
  ctx.addCollider(70, 40, 9); ctx.addCollider(90, 40, 9);
  const lander = new THREE.Group();
  lander.position.set(-60, 0, 110);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 6, 8), new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.35, metalness: 0.8 }));
  body.position.y = 7;
  lander.add(body);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 6), metal);
    leg.position.set(Math.cos(a) * 6, 3.5, Math.sin(a) * 6);
    leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 10), metal);
    pad.position.set(Math.cos(a) * 8, 0.2, Math.sin(a) * 8);
    lander.add(leg, pad);
  }
  scene.add(lander);
  ctx.addCollider(-60, 110, 9);

  // Sunward ridge: the hazard anchor (walk toward the Sun to hear it louder).
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(60, 110, 26, 9, 1), regolith);
  ridge.scale.set(3.4, 1, 0.6);
  ridge.position.set(0, 0, 400);
  scene.add(ridge);

  // ---------------------------------------------------------------- state
  let days = 0;
  let flareT = 2;
  let flareLevel = 0;
  const flareAt = new THREE.Vector3(1, 0, 0);
  const tmp = new THREE.Vector3();

  const reset = () => {
    for (const c of cmes) { scene.remove(c.mesh); (c.mesh.material as THREE.Material).dispose(); }
    cmes.length = 0;
    flareLevel = 0;
    earthHit = 0;
  };

  return {
    reset,
    update: (dt, t, v) => {
      const sw = solarWeather(v);
      const act = Math.min(1, Math.max(0, v.activity ?? 0.5));
      const flare = Math.min(1, Math.max(0, v.flare ?? 0.5));
      days += dt * DAYS_PER_SEC;
      const u = sunMat.uniforms;
      u.uDays.value = days;
      u.uTime.value = t;
      u.uActivity.value = act;

      // Sunspot population tracks the cycle; new groups emerge in the belts.
      const wanted = Math.round(1 + act * (MAX_SPOTS - 1));
      for (const s of spots) s.age += dt * DAYS_PER_SEC * 10;
      for (let i = spots.length - 1; i >= 0; i--) if (spots[i].age > spots[i].life) spots.splice(i, 1);
      if (spots.length < wanted && rnd() < dt * 2) spawnSpot(sw.spotLatDeg);
      u.uSpotCount.value = spots.length;
      spots.forEach((s, i) => {
        const grow = Math.min(1, s.age / 3) * Math.min(1, (s.life - s.age) / 4);
        spotUniform[i].set(s.lat, s.lon, s.r, Math.max(0, grow));
      });

      // Prominences ride the rotation and swell with activity.
      proms.forEach((p, i) => {
        const on = i < 2 + Math.round(act * 5);
        p.mesh.visible = on;
        if (!on) return;
        const lonW = p.lon - THREE.MathUtils.degToRad(solarRotationRate(THREE.MathUtils.radToDeg(p.lat))) * days;
        const n = tmp.set(Math.cos(p.lat) * Math.cos(lonW), Math.sin(p.lat), Math.cos(p.lat) * Math.sin(lonW));
        p.mesh.position.copy(n).multiplyScalar(SUN_R * 0.985);
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        p.mesh.rotateY(p.phase);
        p.mesh.scale.setScalar(0.7 + act * 0.6 + Math.sin(t * 0.4 + p.phase) * 0.08);
      });
      promMat.opacity = 0.35 + act * 0.4;

      // Corona brightens and swells toward solar maximum.
      (corona.material as THREE.SpriteMaterial).opacity = 0.45 + act * 0.5;
      corona.scale.setScalar(SUN_R * (4.6 + act * 1.4));
      (corona.material as THREE.SpriteMaterial).rotation = t * 0.004;

      // Flares: more frequent and brighter as the flare slider rises.
      flareT -= dt;
      if (flareT <= 0 && spots.length) {
        flareT = (ctx.reduceMotion ? 1.6 : 1) * (14 - flare * 10) * (0.6 + rnd() * 0.8);
        const s = spots[Math.floor(rnd() * spots.length)];
        flareAt.set(Math.cos(s.lat) * Math.cos(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.sin(s.lon));
        flareLevel = 0.35 + flare * 0.65;
        // CMEs often (not always) accompany big flares.
        if (rnd() < 0.25 + flare * 0.6) {
          const lonW = s.lon - THREE.MathUtils.degToRad(solarRotationRate(THREE.MathUtils.radToDeg(s.lat))) * days;
          const n = new THREE.Vector3(Math.cos(s.lat) * Math.cos(lonW), Math.sin(s.lat), Math.cos(s.lat) * Math.sin(lonW));
          n.applyQuaternion(sunGroup.quaternion);
          launchCme(n, v.cme ?? 800);
        }
      }
      flareLevel = Math.max(0, flareLevel - dt * 0.6);
      const flash = ctx.reduceMotion ? flareLevel * 0.3 : flareLevel;
      u.uFlare.value = flash;
      u.uFlareAt.value.copy(flareAt);
      (flareFlash.material as THREE.SpriteMaterial).opacity = flash * 0.5;
      flashLight.intensity = flash * 1.6;

      // CMEs expand as a cone (~45° wide) and fade; Earth-directed ones ring Earth.
      const earthDist = EARTH_POS.distanceTo(sunVec);
      for (let i = cmes.length - 1; i >= 0; i--) {
        const c = cmes[i];
        c.dist += c.speed * dt;
        const r = c.dist * 0.42;
        c.mesh.position.copy(sunVec).addScaledVector(c.dir, c.dist);
        c.mesh.scale.setScalar(r);
        (c.mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.9 * Math.max(0, 1 - c.dist / 1500);
        if (c.toEarth && c.dist >= earthDist - EARTH_R * 2) {
          earthHit = Math.max(earthHit, 0.4 + sw.kp / 9 * 0.6);
          c.toEarth = false;
        }
        if (c.dist > 1500) {
          scene.remove(c.mesh);
          (c.mesh.material as THREE.Material).dispose();
          cmes.splice(i, 1);
        }
      }

      // Solar wind streaming outward, faster with the slider.
      const wSpeed = 40 + (v.wind ?? 450) * 0.22;
      for (let i = 0; i < WN; i++) {
        wDist[i] += wSpeed * dt;
        if (wDist[i] > 1500) respawnWind(i, false);
        wPos.setXYZ(i,
          sunVec.x + wDir[i * 3] * wDist[i],
          sunVec.y + wDir[i * 3 + 1] * wDist[i],
          sunVec.z + wDir[i * 3 + 2] * wDist[i]);
      }
      wPos.needsUpdate = true;
      (windPts.material as THREE.PointsMaterial).opacity = 0.25 + Math.min(1, ((v.wind ?? 450) - 250) / 650) * 0.5;

      // Planets on their orbits (counter-clockwise seen from ecliptic north).
      for (const p of planets) {
        const a = p.a0 + (days / p.period) * Math.PI * 2;
        p.mesh.position.set(Math.cos(a) * p.r, 0, -Math.sin(a) * p.r);
      }

      // Earth: one turn per sidereal day; clouds drift a little faster.
      earth.rotation.y = (days / 0.9973) * Math.PI * 2;
      clouds.rotation.y = earth.rotation.y * 1.04;
      // Magnetopause pushed in by solar-wind pressure (and harder by a CME hit).
      const standoff = sw.standoffRe * (1 - earthHit * 0.35);
      magnetoPivot.scale.setScalar(EARTH_R * standoff * 0.3);
      (magneto.material as THREE.MeshBasicMaterial).opacity = 0.06 + earthHit * 0.18;
      earthHit = Math.max(0, earthHit - dt * 0.12);
      // Aurora ovals slide equatorward with Kp and flare up on CME impact.
      const kpNow = Math.min(9, sw.kp + earthHit * 4);
      const latR = THREE.MathUtils.degToRad(66.5 - 2.5 * kpNow);
      for (const ring of auroras) {
        const { pole, lift } = ring.userData as { pole: number; lift: number };
        const R = EARTH_R * lift;
        ring.scale.setScalar(R * Math.cos(latR));
        ring.position.y = pole * R * Math.sin(latR);
        const m = ring.material as THREE.MeshBasicMaterial;
        const base = (lift > 1.04 ? 0.5 : 1) * (0.08 + kpNow / 9 * 0.6);
        m.opacity = base * (ctx.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 3 + pole));
      }
    },
  };
}
