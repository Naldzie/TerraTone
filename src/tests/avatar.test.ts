import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  AVATAR_PRESETS, AvatarAnimator, DEFAULT_AVATAR, buildAvatarMesh, loadAvatar,
  randomAvatarOptions, saveAvatar,
} from '../sim/avatar';

/** Every mesh in the character, however deeply it's parented (head, limbs). */
function meshCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('avatar profiles', () => {
  it('ships a valid default + presets', () => {
    for (const p of [DEFAULT_AVATAR, ...AVATAR_PRESETS.map((x) => x.opts)]) {
      expect(['helmet', 'cap', 'none']).toContain(p.headgear);
      expect(['slim', 'standard', 'bulky']).toContain(p.build);
      for (const k of ['visorTint', 'hairColor', 'skin', 'suit', 'accent'] as const) {
        expect(Number.isFinite(p[k])).toBe(true);
      }
    }
  });
  it('randomizes deterministically with a seeded rng', () => {
    const a = randomAvatarOptions(seeded(7));
    const b = randomAvatarOptions(seeded(7));
    expect(a).toEqual(b);
    const c = randomAvatarOptions(seeded(8));
    expect(c).not.toEqual(a);
  });
  it('round-trips through localStorage and rejects garbage', () => {
    saveAvatar({ ...DEFAULT_AVATAR, hair: 'mohawk', suit: 0x123456 });
    const back = loadAvatar();
    expect(back.hair).toBe('mohawk');
    expect(back.suit).toBe(0x123456);
    localStorage.setItem('tt_avatar', '{not json');
    expect(loadAvatar()).toEqual(DEFAULT_AVATAR);
    localStorage.setItem('tt_avatar', JSON.stringify({ headgear: 'ufo', build: 'huge', suit: 'x' }));
    const fixed = loadAvatar();
    expect(fixed.headgear).toBe(DEFAULT_AVATAR.headgear);
    expect(fixed.build).toBe(DEFAULT_AVATAR.build);
    expect(fixed.suit).toBe(DEFAULT_AVATAR.suit);
    localStorage.removeItem('tt_avatar');
  });
});

describe('avatar builder', () => {
  it('returns all animatable refs with a populated body', () => {
    const b = buildAvatarMesh(DEFAULT_AVATAR);
    for (const part of [b.body, b.legL, b.legR, b.armL, b.armR]) {
      expect(part).toBeDefined();
    }
    expect(b.body.children.length).toBeGreaterThanOrEqual(8);
  });
  it('helmet vs cap produce different heads', () => {
    const helmeted = buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'helmet' });
    const capped = buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'cap', hair: 'ponytail' });
    const bare = buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'none', hair: 'mohawk' });
    const counts = [helmeted, capped, bare].map((b) => meshCount(b.body));
    expect(new Set(counts).size).toBeGreaterThan(1);
  });
  it('builds scale the torso', () => {
    const slim = buildAvatarMesh({ ...DEFAULT_AVATAR, build: 'slim' });
    const bulky = buildAvatarMesh({ ...DEFAULT_AVATAR, build: 'bulky' });
    const torsoOf = (b: ReturnType<typeof buildAvatarMesh>) => {
      const m = b.body.children.find((c) => {
        const g = (c as THREE.Mesh).geometry as THREE.CapsuleGeometry | undefined;
        return g?.type === 'CapsuleGeometry' && c.position.y === 3.1;
      }) as THREE.Mesh;
      return (m.geometry as THREE.CapsuleGeometry).parameters.radius as number;
    };
    expect(torsoOf(bulky)).toBeGreaterThan(torsoOf(slim));
  });
});

describe('jointed rig + animator', () => {
  it('pivots limbs at the joints: rotating a thigh moves the foot, not the hip', () => {
    const b = buildAvatarMesh(DEFAULT_AVATAR);
    b.body.updateMatrixWorld(true);
    const hip = new THREE.Vector3().setFromMatrixPosition(b.legL.matrixWorld);
    const foot0 = new THREE.Vector3().setFromMatrixPosition(b.bootL.matrixWorld);
    expect(hip.y).toBeGreaterThan(2);
    expect(foot0.y).toBeLessThan(0.5);
    b.legL.rotation.x = -0.8; // swing forward
    b.body.updateMatrixWorld(true);
    const hip2 = new THREE.Vector3().setFromMatrixPosition(b.legL.matrixWorld);
    const foot1 = new THREE.Vector3().setFromMatrixPosition(b.bootL.matrixWorld);
    expect(hip2.distanceTo(hip)).toBeLessThan(1e-6);
    expect(foot1.z).toBeGreaterThan(foot0.z + 0.5);
  });

  it('walk cycle counter-swings arms against legs and folds the swing knee', () => {
    const b = buildAvatarMesh(DEFAULT_AVATAR);
    const anim = new AvatarAnimator(b);
    let opposed = 0; let frames = 0; let kneeMax = 0;
    for (let i = 0; i < 240; i++) {
      anim.update({ dt: 1 / 60, t: i / 60, speed: 12 });
      if (i < 60) continue; // let the gait blend in
      frames++;
      if (Math.sign(b.legL.rotation.x) !== Math.sign(b.armL.rotation.x) || Math.abs(b.legL.rotation.x) < 0.05) opposed++;
      kneeMax = Math.max(kneeMax, b.shinL.rotation.x);
      expect(b.shinL.rotation.x).toBeGreaterThanOrEqual(0); // knees never hyper-extend
      expect(b.foreL.rotation.x).toBeLessThanOrEqual(0);    // elbows never bend backwards
    }
    expect(opposed / frames).toBeGreaterThan(0.9);
    expect(kneeMax).toBeGreaterThan(0.4);
  });

  it('settles to a breathing idle and squashes on landing', () => {
    const b = buildAvatarMesh(DEFAULT_AVATAR);
    const anim = new AvatarAnimator(b);
    for (let i = 0; i < 180; i++) anim.update({ dt: 1 / 60, t: i / 60, speed: 0 });
    expect(Math.abs(b.legL.rotation.x)).toBeLessThan(0.1);
    for (let i = 0; i < 20; i++) anim.update({ dt: 1 / 60, t: 3 + i / 60, speed: 0, airborne: true, velY: -6 });
    anim.update({ dt: 1 / 60, t: 4, speed: 0, airborne: false, velY: -7 });
    expect(anim.landing).toBeGreaterThan(0.5);
    expect(b.shinL.rotation.x).toBeGreaterThan(0.3);
  });
});

describe('avatar persistence hygiene', () => {
  beforeEach(() => localStorage.removeItem('tt_avatar'));
  it('defaults when nothing is stored', () => {
    expect(loadAvatar()).toEqual(DEFAULT_AVATAR);
  });
  it('round-trips the character type and wardrobe', () => {
    saveAvatar({
      ...DEFAULT_AVATAR, body: 'girl', headgear: 'crown', hair: 'long',
      face: 'goggles', neck: 'scarf', back: 'cape', ears: 'headphones',
    });
    const back = loadAvatar();
    expect(back.body).toBe('girl');
    expect(back.headgear).toBe('crown');
    expect(back.hair).toBe('long');
    expect(back.face).toBe('goggles');
    expect(back.neck).toBe('scarf');
    expect(back.back).toBe('cape');
    expect(back.ears).toBe('headphones');
  });
  it('rejects unknown wardrobe values', () => {
    localStorage.setItem('tt_avatar', JSON.stringify({
      ...DEFAULT_AVATAR, body: 'alien', headgear: 'ufo', hair: 'spikes',
      face: 'smirk', neck: 'tie', back: 'rocket', ears: 'earrings',
    }));
    expect(loadAvatar()).toEqual(DEFAULT_AVATAR);
  });
});

describe('character type + wardrobe', () => {
  it('builds girl and boy silhouettes differently', () => {
    const girl = buildAvatarMesh({ ...DEFAULT_AVATAR, body: 'girl' });
    const boy = buildAvatarMesh({ ...DEFAULT_AVATAR, body: 'boy' });
    expect(girl.body.children.length).toBeGreaterThan(boy.body.children.length); // tunic hem
    expect(Math.abs(girl.armL.position.x)).toBeLessThan(Math.abs(boy.armL.position.x));
    expect(Math.abs(girl.legL.position.x)).toBeLessThan(Math.abs(boy.legL.position.x));
    expect((girl.body.children[0] as THREE.Mesh).geometry)
      .not.toBe((boy.body.children[0] as THREE.Mesh).geometry);
  });

  it('adds meshes for everything the wardrobe can hold', () => {
    const bare = buildAvatarMesh({
      ...DEFAULT_AVATAR, headgear: 'none', face: 'friendly', back: 'none', neck: 'none', ears: 'none',
    });
    const worn = buildAvatarMesh({
      ...DEFAULT_AVATAR, headgear: 'crown', face: 'goggles', back: 'cape', neck: 'scarf', ears: 'headphones',
    });
    expect(meshCount(worn.body)).toBeGreaterThan(meshCount(bare.body) + 6);
  });

  it('wears every hat, face and hairstyle', () => {
    for (const headgear of ['helmet', 'cap', 'beanie', 'bucket', 'crown', 'headband', 'none'] as const) {
      for (const body of ['girl', 'boy'] as const) {
        expect(() => buildAvatarMesh({ ...DEFAULT_AVATAR, headgear, body })).not.toThrow();
      }
    }
    for (const face of ['friendly', 'brave', 'shades', 'goggles', 'spectacles'] as const) {
      expect(() => buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'none', face })).not.toThrow();
    }
    for (const hair of ['buzz', 'mohawk', 'bob', 'ponytail', 'long', 'buns', 'braids'] as const) {
      expect(() => buildAvatarMesh({ ...DEFAULT_AVATAR, headgear: 'cap', hair })).not.toThrow();
    }
  });

  it('random looks carry the new options', () => {
    const looks = Array.from({ length: 40 }, (_, i) => randomAvatarOptions(seeded(i + 1)));
    for (const k of ['body', 'headgear', 'face', 'hair', 'neck', 'back', 'ears'] as const) {
      expect(new Set(looks.map((l) => l[k])).size).toBeGreaterThan(1);
    }
  });
});
