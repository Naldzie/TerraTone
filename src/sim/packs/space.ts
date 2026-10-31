/* Shared deep-space dressing for the space simulators (Sun, Black Hole, Big Bang):
 * a Milky Way sky painted onto an equirectangular canvas, a crisp star dome
 * that rides with the camera (stars at infinity), and soft glow textures.
 * Procedural and offline-safe.
 */
import * as THREE from 'three';

/* ---------------------------------------------------------------- sky --- */

/** Rough star colour by spectral class mix (most stars are cool K/M dwarfs). */
export function starColor(r: number): string {
  return r < 0.04 ? '#9bb5ff' : r < 0.14 ? '#cad7ff' : r < 0.42 ? '#f8f7ff'
    : r < 0.7 ? '#fff4e8' : r < 0.9 ? '#ffd2a1' : '#ffb07a';
}

/** Same sinusoid the sky texture uses, as a direction-space latitude (rad). */
function bandLat(lon: number): number {
  return -Math.sin((lon / (Math.PI * 2)) * Math.PI * 2 + 0.6) * 0.28 * Math.PI;
}

/**
 * Crisp stars as screen-sized points on a dome that rides with the camera
 * (so they sit at infinity, with no parallax and no far-plane clipping).
 * Three magnitude groups; ~half cluster toward the galactic plane.
 */
export function starDome(rnd: () => number, count: number): THREE.Group {
  const dome = new THREE.Group();
  const R = 900;
  const tiers: [number, number, number][] = [[0.78, 1.2, 0.75], [0.19, 2, 0.95], [0.03, 3.2, 1]];
  for (const [share, size, opacity] of tiers) {
    const n = Math.floor(count * share);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // Match three's equirect lookup, u = atan2(z, x) / 2π + 0.5, so stars line up with the band.
      const lon = rnd() * Math.PI * 2;
      const lat = rnd() < 0.45
        ? bandLat(lon) + (rnd() - 0.5) * 0.45
        : Math.asin(rnd() * 2 - 1);
      const phi = lon - Math.PI;
      pos[i * 3] = Math.cos(lat) * Math.cos(phi) * R;
      pos[i * 3 + 1] = Math.sin(lat) * R;
      pos[i * 3 + 2] = Math.cos(lat) * Math.sin(phi) * R;
      c.set(starColor(rnd())).multiplyScalar(0.55 + rnd() * 0.45);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity,
      depthWrite: false, fog: false,
    }));
    pts.frustumCulled = false;
    pts.renderOrder = -10;
    dome.add(pts);
  }
  // Follow the camera right before drawing.
  for (const child of dome.children) {
    child.onBeforeRender = (_r, _s, camera) => {
      dome.position.copy(camera.position);
      dome.updateMatrixWorld(true);
    };
  }
  return dome;
}

export function galaxySky(rnd: () => number, hi: boolean, opts: { stars?: boolean } = {}): THREE.CanvasTexture | null {
  const W = hi ? 2048 : 1024; const H = W / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#010208';
  g.fillRect(0, 0, W, H);
  // The Milky Way is a great circle tilted ~60° to the ecliptic — on an
  // equirectangular map that's a sinusoid. Glow, then dust lanes on top.
  const bandY = (x: number) => H * 0.5 + Math.sin((x / W) * Math.PI * 2 + 0.6) * H * 0.28;
  const coreX = W * 0.62;
  for (let i = 0; i < (hi ? 14000 : 6000); i++) {
    const x = rnd() * W;
    const spread = (rnd() + rnd() + rnd() - 1.5) * H * 0.09;
    const y = bandY(x) + spread;
    const core = Math.exp(-(((x - coreX) / (W * 0.12)) ** 2));
    const r = 2 + rnd() * (6 + core * 14);
    const warm = core * 0.8;
    g.fillStyle = `rgba(${Math.round(190 + 60 * warm)},${Math.round(196 + 30 * warm)},${Math.round(230 - 60 * warm)},${(0.018 + core * 0.03) * (1 - Math.abs(spread) / (H * 0.2))})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < (hi ? 2600 : 1200); i++) {
    const x = rnd() * W;
    const y = bandY(x) + (rnd() - 0.5) * H * 0.035 + Math.sin(x * 0.02) * H * 0.01;
    g.fillStyle = `rgba(4,3,8,${0.05 + rnd() * 0.08})`;
    g.beginPath(); g.ellipse(x, y, 4 + rnd() * 10, 1.5 + rnd() * 4, 0.3, 0, Math.PI * 2); g.fill();
  }
  // Emission nebulae (hydrogen-alpha pink) and a reflection nebula (blue).
  const nebula = (x: number, y: number, r: number, rgb: string, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  nebula(W * 0.58, bandY(W * 0.58) - H * 0.03, H * 0.07, '255,90,140', 0.16);
  nebula(W * 0.3, bandY(W * 0.3) + H * 0.04, H * 0.05, '120,170,255', 0.12);
  nebula(W * 0.83, bandY(W * 0.83), H * 0.06, '255,120,170', 0.1);
  // Andromeda: a tilted spiral smudge well off the plane.
  g.save();
  g.translate(W * 0.18, H * 0.24);
  g.rotate(-0.5);
  const and = g.createRadialGradient(0, 0, 0, 0, 0, H * 0.05);
  and.addColorStop(0, 'rgba(255,240,220,0.55)');
  and.addColorStop(0.25, 'rgba(220,210,240,0.18)');
  and.addColorStop(1, 'rgba(200,200,255,0)');
  g.scale(1, 0.32);
  g.fillStyle = and;
  g.beginPath(); g.arc(0, 0, H * 0.05, 0, Math.PI * 2); g.fill();
  g.restore();
  // Unresolved star haze along the band (individual stars are drawn as points).
  for (let i = 0; i < (hi ? 30000 : 12000); i++) {
    const x = rnd() * W;
    const y = bandY(x) + (rnd() + rnd() - 1) * H * 0.08;
    g.fillStyle = `rgba(230,232,255,${0.08 + rnd() * 0.18})`;
    g.fillRect(x, y, 1, 1);
  }
  // Optional painted stars: needed where a shader bends the sky (lensing),
  // since the crisp point stars can't be distorted.
  if (opts.stars) {
    for (let i = 0; i < (hi ? 7000 : 3500); i++) {
      const x = rnd() * W; const y = rnd() * H;
      // Sub-texel dots: they stay pin-sharp when the texture is magnified.
      const bright = rnd() < 0.04;
      g.fillStyle = starColor(rnd());
      g.globalAlpha = bright ? 0.95 : 0.35 + rnd() * 0.5;
      g.fillRect(x, y, bright ? 1.5 : 1, bright ? 1.5 : 1);
    }
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}


/** Soft radial texture for glows (corona halo, flare flash). */
export function glowTexture(stops: [number, string][], size = 256): THREE.CanvasTexture | null {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

