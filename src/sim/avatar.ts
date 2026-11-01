/* Shared explorer avatar system — one builder for players + NPCs.
 *
 * Options cover character type (girl / boy), headgear, eyewear, hairstyle +
 * colors, neck / back / ear wardrobe, suit colors, and build. Returns the same
 * animatable refs (body/legs/arms) the 3D engines already drive, so
 * idle/walk/run/swim animation is untouched.
 * Pure + localStorage persistence; meshes build without a GL context (tested).
 */
import * as THREE from 'three';
import type { IconName } from '../components/Icon';

export type BodyType = 'girl' | 'boy';
export type Headgear = 'helmet' | 'cap' | 'beanie' | 'bucket' | 'crown' | 'headband' | 'tophat' | 'antennae' | 'none';
export type VisorStyle = 'classic' | 'wide' | 'round';
export type FaceStyle = 'friendly' | 'brave' | 'shades' | 'goggles' | 'spectacles';
export type HairStyle = 'buzz' | 'mohawk' | 'bob' | 'ponytail' | 'long' | 'buns' | 'braids';
export type NeckWear = 'none' | 'scarf' | 'bandana' | 'bowtie' | 'medal';
export type BackWear = 'pack' | 'cape' | 'wings' | 'jetpack' | 'none';
export type EarWear = 'none' | 'headphones';
export type BuildType = 'slim' | 'standard' | 'bulky';

export interface AvatarOptions {
  body: BodyType;
  headgear: Headgear;
  visor: VisorStyle;
  visorTint: number;
  face: FaceStyle;
  hair: HairStyle;
  hairColor: number;
  skin: number;
  suit: number;
  accent: number;
  neck: NeckWear;
  back: BackWear;
  ears: EarWear;
  build: BuildType;
  /** Trousers color; MATCH_SUIT (-1) = same as the suit. */
  pants: number;
  /** Glove color; MATCH_AUTO (-1) = accent with a helmet, else skin. */
  gloves: number;
  boots: number;
}

/** "Same as the suit / automatic" for the optional color slots. */
export const MATCH = -1;

export interface Swatch { name: string; value: number }

export const SKINS: Swatch[] = [
  { name: 'Sand', value: 0xf2c9a0 }, { name: 'Bronze', value: 0xc98d5f },
  { name: 'Umber', value: 0x8a5a33 }, { name: 'Espresso', value: 0x5a3822 },
  { name: 'Porcelain', value: 0xf7e0c8 },
];
export const HAIR_COLORS: Swatch[] = [
  { name: 'Black', value: 0x1c1c22 }, { name: 'Brown', value: 0x5a3a22 },
  { name: 'Auburn', value: 0xa03a1a }, { name: 'Blond', value: 0xd8b25a },
  { name: 'Glacier', value: 0x22d3ee },
];
export const SUITS: Swatch[] = [
  { name: 'Arctic', value: 0xe8eef7 }, { name: 'Ember', value: 0xe8641f },
  { name: 'Reef', value: 0x1f8a70 }, { name: 'Nebula', value: 0x6a5acd },
  { name: 'Crimson', value: 0xb03a3a }, { name: 'Moss', value: 0x7a8a2a },
];
export const ACCENTS: Swatch[] = [
  { name: 'Cyan', value: 0x22d3ee }, { name: 'Amber', value: 0xfbbf24 },
  { name: 'Violet', value: 0xa78bfa }, { name: 'Coral', value: 0xfb7185 },
  { name: 'Mint', value: 0x34d399 }, { name: 'Blaze', value: 0xff5a1a },
];
export const BOOTS: Swatch[] = [
  { name: 'Graphite', value: 0x2b2f38 }, { name: 'Leather', value: 0x6b4226 },
  { name: 'Snow', value: 0xe8eef7 }, { name: 'Ember', value: 0xe8641f }, { name: 'Gold', value: 0xd4a017 },
];
export const VISOR_TINTS: Swatch[] = [
  { name: 'Abyss', value: 0x0b1e33 }, { name: 'Lagoon', value: 0x0e5a6e },
  { name: 'Grape', value: 0x3a2060 }, { name: 'Gold', value: 0x6e5210 },
];

export const DEFAULT_AVATAR: AvatarOptions = {
  body: 'boy', headgear: 'helmet', visor: 'classic', visorTint: 0x0b1e33,
  face: 'friendly', hair: 'buzz', hairColor: 0x1c1c22, skin: 0xf2c9a0,
  suit: 0xe8eef7, accent: 0x22d3ee, neck: 'none', back: 'pack', ears: 'none',
  build: 'standard', pants: MATCH, gloves: MATCH, boots: 0x2b2f38,
};

export const AVATAR_PRESETS: { name: string; icon: IconName; opts: AvatarOptions }[] = [
  {
    name: 'Ranger', icon: 'helmet',
    opts: { ...DEFAULT_AVATAR, headgear: 'helmet', visor: 'wide', visorTint: 0x0e5a6e, suit: 0xe8eef7, accent: 0x22d3ee },
  },
  {
    name: 'Trailblazer', icon: 'cap',
    opts: { ...DEFAULT_AVATAR, headgear: 'cap', hair: 'ponytail', hairColor: 0x5a3a22, skin: 0xc98d5f, suit: 0xe8641f, accent: 0xfbbf24, face: 'brave', build: 'standard' },
  },
  {
    name: 'Drifter', icon: 'hair',
    opts: { ...DEFAULT_AVATAR, headgear: 'none', hair: 'mohawk', hairColor: 0xa03a1a, skin: 0x8a5a33, suit: 0x1f8a70, accent: 0x34d399, face: 'shades', build: 'bulky' },
  },
  {
    name: 'Voyager', icon: 'telescope',
    opts: { ...DEFAULT_AVATAR, body: 'girl', headgear: 'cap', hair: 'long', hairColor: 0xd8b25a, skin: 0xf7e0c8, suit: 0x6a5acd, accent: 0xa78bfa, face: 'friendly', neck: 'scarf', build: 'slim' },
  },
  {
    name: 'Pathfinder', icon: 'compass',
    opts: { ...DEFAULT_AVATAR, body: 'girl', headgear: 'none', hair: 'buns', hairColor: 0x1c1c22, skin: 0x5a3822, suit: 0xb03a3a, accent: 0xfb7185, face: 'spectacles', back: 'cape', build: 'standard' },
  },
];

const BUILD_SCALE: Record<BuildType, number> = { slim: 0.92, standard: 1, bulky: 1.12 };

export type Rng = () => number;

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Random profile (seedable for tests). Unseeded = Math.random. */
export function randomAvatarOptions(rng: Rng = Math.random): AvatarOptions {
  const headgear = pick(rng, ['helmet', 'cap', 'beanie', 'bucket', 'crown', 'headband', 'tophat', 'antennae', 'none'] as const);
  return {
    body: pick(rng, ['girl', 'boy'] as const),
    headgear,
    visor: pick(rng, ['classic', 'wide', 'round'] as const),
    visorTint: pick(rng, VISOR_TINTS).value,
    face: pick(rng, ['friendly', 'brave', 'shades', 'goggles', 'spectacles'] as const),
    hair: pick(rng, ['buzz', 'mohawk', 'bob', 'ponytail', 'long', 'buns', 'braids'] as const),
    hairColor: pick(rng, HAIR_COLORS).value,
    skin: pick(rng, SKINS).value,
    suit: pick(rng, SUITS).value,
    accent: pick(rng, ACCENTS).value,
    neck: pick(rng, ['none', 'scarf', 'bandana', 'bowtie', 'medal'] as const),
    back: pick(rng, ['pack', 'cape', 'wings', 'jetpack', 'none'] as const),
    ears: pick(rng, ['none', 'headphones'] as const),
    build: pick(rng, ['slim', 'standard', 'bulky'] as const),
    pants: rng() < 0.6 ? MATCH : pick(rng, SUITS).value,
    gloves: MATCH,
    boots: pick(rng, BOOTS).value,
  };
}

const AVATAR_KEY = 'tt_avatar';

function validEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function validNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Load the saved profile (garbage in → defaults out). */
export function loadAvatar(): AvatarOptions {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (!raw) return { ...DEFAULT_AVATAR };
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      body: validEnum(o.body, ['girl', 'boy'], DEFAULT_AVATAR.body),
      headgear: validEnum(o.headgear, ['helmet', 'cap', 'beanie', 'bucket', 'crown', 'headband', 'tophat', 'antennae', 'none'], DEFAULT_AVATAR.headgear),
      visor: validEnum(o.visor, ['classic', 'wide', 'round'], DEFAULT_AVATAR.visor),
      visorTint: validNum(o.visorTint, DEFAULT_AVATAR.visorTint),
      face: validEnum(o.face, ['friendly', 'brave', 'shades', 'goggles', 'spectacles'], DEFAULT_AVATAR.face),
      hair: validEnum(o.hair, ['buzz', 'mohawk', 'bob', 'ponytail', 'long', 'buns', 'braids'], DEFAULT_AVATAR.hair),
      hairColor: validNum(o.hairColor, DEFAULT_AVATAR.hairColor),
      skin: validNum(o.skin, DEFAULT_AVATAR.skin),
      suit: validNum(o.suit, DEFAULT_AVATAR.suit),
      accent: validNum(o.accent, DEFAULT_AVATAR.accent),
      neck: validEnum(o.neck, ['none', 'scarf', 'bandana', 'bowtie', 'medal'], DEFAULT_AVATAR.neck),
      back: validEnum(o.back, ['pack', 'cape', 'wings', 'jetpack', 'none'], DEFAULT_AVATAR.back),
      ears: validEnum(o.ears, ['none', 'headphones'], DEFAULT_AVATAR.ears),
      build: validEnum(o.build, ['slim', 'standard', 'bulky'], DEFAULT_AVATAR.build),
      pants: validNum(o.pants, DEFAULT_AVATAR.pants),
      gloves: validNum(o.gloves, DEFAULT_AVATAR.gloves),
      boots: validNum(o.boots, DEFAULT_AVATAR.boots),
    };
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

export function saveAvatar(o: AvatarOptions): void {
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(o));
  } catch { /* private mode — profile just won't persist */ }
}

export interface BuiltAvatar {
  body: THREE.Group;
  torso: THREE.Mesh;
  /** Neck pivot — rotate to nod / look around. */
  head: THREE.Group;
  /** Thighs (pivot at the hip). */
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  /** Shins (pivot at the knee; positive x folds the knee). */
  shinL: THREE.Mesh;
  shinR: THREE.Mesh;
  bootL: THREE.Mesh;
  bootR: THREE.Mesh;
  /** Upper arms (pivot at the shoulder; negative x swings forward / up). */
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  /** Forearms (pivot at the elbow; negative x bends the elbow). */
  foreL: THREE.Mesh;
  foreR: THREE.Mesh;
}

/* Joint heights in body space (ground = 0, character ≈ 5.7 tall). */
const HIP_Y = 2.3;
const KNEE_DROP = 1.05;
const SHOULDER_Y = 4.1;
const ELBOW_DROP = 0.95;
const NECK_Y = 4.3;

/** Build the posable explorer. Same proportions as the original astronauts. */
export interface BuildExtras {
  /** Full EVA suit: white thermal layers, gold sun visor, life-support
   *  backpack, chest control unit, joint bearings and helmet lamps. */
  spaceSuit?: boolean;
}

export function buildAvatarMesh(look: AvatarOptions, extras: BuildExtras = {}): BuiltAvatar {
  const eva = !!extras.spaceSuit;
  // Real EVA suits are white (to reflect sunlight) with a gold-coated visor.
  const o: AvatarOptions = eva
    ? { ...look, headgear: 'helmet', visor: 'wide', visorTint: 0x9a7420, back: 'pack', neck: 'none', ears: 'none', suit: 0xeef1f5 }
    : look;
  const s = BUILD_SCALE[o.build];
  const girl = o.body === 'girl';
  const suit = new THREE.MeshStandardMaterial({ color: o.suit, roughness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: o.accent, roughness: 0.4, emissive: o.accent, emissiveIntensity: 0.25 });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.7 });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hairColor, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: o.visorTint, roughness: 0.15, metalness: 0.6 });

  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.1 * s * (girl ? 0.93 : 1), 1.6, 4, 10), suit);
  torso.position.y = 3.1;
  body.add(torso);

  // Back: the classic pack, a hero cape, or a pair of wings.
  if (o.back === 'pack') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 0.9), accent);
    pack.position.set(0, 3.2, -1.2);
    body.add(pack);
  } else if (o.back === 'cape') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 0.16), accent);
    cape.position.set(0, 3.3, -1.32);
    body.add(cape);
  } else if (o.back === 'jetpack') {
    // Twin tanks on a harness plate, with glowing nozzles.
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8c2d0, roughness: 0.35, metalness: 0.7 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.3), accent);
    plate.position.set(0, 3.3, -1.12);
    body.add(plate);
    for (const sx of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.3, 4, 10), metal);
      tank.position.set(sx * 0.42, 3.3, -1.5);
      const glow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.45, 10), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      glow.position.set(sx * 0.42, 2.25, -1.5);
      glow.rotation.x = Math.PI;
      body.add(tank, glow);
    }
  } else if (o.back === 'wings') {
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.14), accent);
      wing.position.set(sx * 1.1, 3.7, -1.15);
      wing.rotation.z = sx * 0.5;
      body.add(wing);
    }
  }

  // Girl silhouette: narrower shoulders over a flared tunic hem.
  if (girl) {
    const tunic = new THREE.Mesh(new THREE.CylinderGeometry(1.16 * s, 1.55 * s, 1, 14), suit);
    tunic.position.y = 2;
    body.add(tunic);
  }

  // Neckwear sits at the base of the head (this build has no separate neck).
  const neckR = (o.headgear === 'helmet' ? 1.05 : 0.98) * s;
  if (o.neck === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(neckR, 0.2, 8, 18), accent);
    scarf.position.y = 4.55;
    scarf.rotation.x = Math.PI / 2;
    body.add(scarf);
  } else if (o.neck === 'bandana') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(neckR, neckR * 0.95, 0.3, 16), accent);
    band.position.y = 4.55;
    body.add(band);
  } else if (o.neck === 'bowtie') {
    for (const sx of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 4), accent);
      loop.position.set(sx * 0.24 * s, 4.5, neckR * 1.02);
      loop.rotation.z = (sx * Math.PI) / 2;
      body.add(loop);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), accent);
    knot.position.set(0, 4.5, neckR * 1.05);
    body.add(knot);
  } else if (o.neck === 'medal') {
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(neckR * 0.98, 0.07, 6, 20), accent);
    ribbon.position.y = 4.42;
    ribbon.rotation.x = Math.PI / 2 - 0.35;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.75, emissive: 0x6e5210, emissiveIntensity: 0.3 }));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 3.95, 1.12 * s);
    body.add(ribbon, disc);
  }

  // Head hangs off a neck pivot so it can nod, look around and counter the
  // gait; everything worn on the head rides along inside it.
  const headY = 4.85;
  const head = new THREE.Group();
  head.position.y = NECK_Y;
  const headInner = new THREE.Group();
  headInner.position.y = -NECK_Y;
  head.add(headInner);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.72 * s, 16, 14), skin);
  skull.position.y = headY;
  headInner.add(skull);
  // Ears + nose give the bare head a readable profile from any angle.
  if (o.headgear !== 'helmet') {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 8, 6), skin);
    nose.position.set(0, headY - 0.1, 0.7 * s);
    nose.scale.set(1, 1.15, 0.9);
    headInner.add(nose);
    if (o.ears !== 'headphones') {
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 8, 6), skin);
        ear.position.set(sx * 0.7 * s, headY, 0.02);
        ear.scale.set(0.55, 1, 0.8);
        headInner.add(ear);
      }
    }
  }

  if (o.headgear === 'helmet') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.95 * s, 14, 12), suit);
    shell.position.y = headY + 0.12;
    headInner.add(shell);
    if (o.visor === 'round') {
      // Twin goggle lenses.
      for (const sx of [-0.32, 0.32]) {
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), glass);
        lens.position.set(sx * s, headY + 0.15, 0.72 * s);
        headInner.add(lens);
      }
    } else {
      const wide = o.visor === 'wide';
      const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.78 * s, 14, 12,
          wide ? -Math.PI / 2.2 : -Math.PI / 3,
          wide ? Math.PI / 1.1 : (Math.PI * 2) / 3,
          Math.PI / 4, Math.PI / 2.4),
        glass,
      );
      visor.position.set(0, headY + 0.12, 0.28 * s);
      headInner.add(visor);
    }
  } else {
    if (o.headgear === 'cap') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * s, 0.84 * s, 0.4, 12), accent);
      crown.position.y = headY + 0.55;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(1.1 * s, 0.08, 0.9), accent);
      brim.position.set(0, headY + 0.38, 0.85 * s);
      headInner.add(crown, brim);
    } else if (o.headgear === 'beanie') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.8 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        accent,
      );
      dome.position.y = headY + 0.42;
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.82 * s, 0.84 * s, 0.24, 16), accent);
      fold.position.y = headY + 0.42;
      const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), accent);
      bobble.position.y = headY + 1.24;
      headInner.add(dome, fold, bobble);
    } else if (o.headgear === 'bucket') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.72 * s, 0.82 * s, 0.5, 12), suit);
      crown.position.y = headY + 0.58;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * s, 1.2 * s, 0.08, 18), suit);
      brim.position.y = headY + 0.34;
      headInner.add(crown, brim);
    } else if (o.headgear === 'crown') {
      const gold = new THREE.MeshStandardMaterial({
        color: 0xfbbf24, roughness: 0.3, metalness: 0.7, emissive: 0x6e5210, emissiveIntensity: 0.3,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * s, 0.76 * s, 0.3, 14), gold);
      band.position.y = headY + 0.6;
      headInner.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 6), gold);
        spike.position.set(Math.cos(a) * 0.68 * s, headY + 0.9, Math.sin(a) * 0.68 * s);
        headInner.add(spike);
      }
    } else if (o.headgear === 'headband') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.72 * s, 0.1, 8, 22), accent);
      band.position.y = headY + 0.4;
      band.rotation.x = Math.PI / 2;
      headInner.add(band);
    } else if (o.headgear === 'tophat') {
      const felt = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.7 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * s, 0.66 * s, 1.1, 16), felt);
      crown.position.y = headY + 1.05;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * s, 1.05 * s, 0.08, 20), felt);
      brim.position.y = headY + 0.5;
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.665 * s, 0.67 * s, 0.18, 16), accent);
      ribbon.position.y = headY + 0.66;
      headInner.add(crown, brim, ribbon);
    } else if (o.headgear === 'antennae') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.74 * s, 0.07, 6, 22, Math.PI), accent);
      band.position.y = headY + 0.25;
      headInner.add(band);
      for (const sx of [-1, 1]) {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), accent);
        stalk.position.set(sx * 0.4 * s, headY + 1.05, 0);
        stalk.rotation.z = -sx * 0.35;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: o.accent }));
        ball.position.set(sx * 0.58 * s, headY + 1.5, 0);
        headInner.add(stalk, ball);
      }
    }
    // Hair (visible with cap or bare head).
    const hy = headY + 0.35;
    if (o.hair === 'buzz') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.74 * s, 12, 8), hairM);
      h.scale.set(1, 0.55, 1);
      h.position.y = hy;
      headInner.add(h);
    } else if (o.hair === 'mohawk') {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.95), hairM);
      h.position.set(0, hy + 0.25, -0.05);
      headInner.add(h);
    } else if (o.hair === 'bob') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.84 * s, 12, 10), hairM);
      h.scale.set(1, 0.95, 1);
      h.position.set(0, hy, -0.12);
      headInner.add(h);
    } else if (o.hair === 'ponytail') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.74 * s, 12, 8), hairM);
      h.scale.set(1, 0.55, 1);
      h.position.y = hy;
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.9, 8), hairM);
      tail.position.set(0, headY - 0.15, -0.8 * s);
      tail.rotation.x = 0.35;
      headInner.add(h, tail);
    } else if (o.hair === 'long') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.8 * s, 12, 10), hairM);
      h.scale.set(1, 0.6, 1);
      h.position.y = hy;
      const fall = new THREE.Mesh(new THREE.BoxGeometry(1.1 * s, 1.7, 0.4), hairM);
      fall.position.set(0, headY - 0.5, -0.62 * s);
      headInner.add(h, fall);
    } else if (o.hair === 'buns') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.74 * s, 12, 8), hairM);
      h.scale.set(1, 0.55, 1);
      h.position.y = hy;
      headInner.add(h);
      for (const sx of [-1, 1]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), hairM);
        bun.position.set(sx * 0.66 * s, hy + 0.34, -0.1 * s);
        headInner.add(bun);
      }
    } else {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.74 * s, 12, 8), hairM);
      h.scale.set(1, 0.55, 1);
      h.position.y = hy;
      headInner.add(h);
      for (const sx of [-1, 1]) {
        const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 1, 3, 8), hairM);
        braid.position.set(sx * 0.62 * s, headY - 0.28, -0.3 * s);
        braid.rotation.z = sx * 0.14;
        headInner.add(braid);
      }
    }
    // Face. Eyewear hides the eyes; the mouth still reads underneath it.
    const eyeR = o.face === 'friendly' ? 0.13 : 0.1;
    if (o.face === 'shades') {
      const shades = new THREE.Mesh(new THREE.BoxGeometry(0.95 * s, 0.3, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.2 }));
      shades.position.set(0, headY + 0.05, 0.62 * s);
      headInner.add(shades);
    } else if (o.face === 'goggles') {
      const ringM = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.4, metalness: 0.5 });
      const lensM = new THREE.MeshStandardMaterial({ color: o.visorTint, roughness: 0.15, metalness: 0.6 });
      for (const sx of [-0.3, 0.3]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 16), ringM);
        ring.position.set(sx * s, headY + 0.05, 0.6 * s);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), lensM);
        lens.position.set(sx * s, headY + 0.05, 0.61 * s);
        headInner.add(ring, lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), ringM);
      bridge.position.set(0, headY + 0.05, 0.62 * s);
      headInner.add(bridge);
    } else if (o.face === 'spectacles') {
      const wire = new THREE.MeshStandardMaterial({ color: 0xc8d2e6, roughness: 0.3, metalness: 0.7 });
      for (const sx of [-0.3, 0.3]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 18), wire);
        ring.position.set(sx * s, headY + 0.05, 0.62 * s);
        headInner.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), wire);
      bridge.position.set(0, headY + 0.05, 0.63 * s);
      headInner.add(bridge);
    } else {
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.4 });
      for (const sx of [-0.27, 0.27]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 8, 8), eyeM);
        eye.position.set(sx * s, headY + 0.05, 0.64 * s);
        headInner.add(eye);
      }
    }
    if (o.face !== 'shades') {
      if (o.face === 'brave') {
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.05),
          new THREE.MeshStandardMaterial({ color: 0x5a3028, roughness: 0.7 }));
        mouth.position.set(0, headY - 0.35, 0.68 * s);
        headInner.add(mouth);
      } else {
        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 6, 12, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x5a3028, roughness: 0.7 }));
        smile.position.set(0, headY - 0.28, 0.66 * s);
        smile.rotation.z = Math.PI;
        headInner.add(smile);
      }
    }
  }

  // Music on your head: the band arches over the skull, cups sit at the ears
  // (they tuck under a helmet shell, so the two never collide visually).
  if (o.ears === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.84 * s, 0.07, 6, 22, Math.PI), accent);
    band.position.y = headY + 0.3;
    headInner.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 12), accent);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(sx * (0.72 * s + 0.14), headY, 0);
      headInner.add(cup);
    }
  }

  // Belt + chest badge break up the suit so the torso reads in motion.
  const trim = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5, metalness: 0.3 });
  const belt = new THREE.Mesh(new THREE.TorusGeometry(1.08 * s * (girl ? 0.93 : 1), 0.12, 6, 24), trim);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 2.45;
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), accent);
  badge.position.set(0.42 * s, 3.85, 1.06 * s * (girl ? 0.93 : 1));
  badge.rotation.x = -0.25;
  body.add(belt, badge);

  // Jointed limbs. Each segment's geometry hangs below its pivot, so rotating
  // the thigh swings from the hip, the shin from the knee, the upper arm from
  // the shoulder and the forearm from the elbow — no mid-limb hinging.
  const hip = girl ? 0.5 : 0.55;
  const shoulder = girl ? 1.5 : 1.6;
  const hanging = (r: number, len: number, drop: number) => {
    const g = new THREE.CapsuleGeometry(r, len, 3, 8);
    g.translate(0, -drop, 0);
    return g;
  };
  const thighGeo = hanging(0.36 * s, 0.7, 0.55);
  const shinGeo = hanging(0.31 * s, 0.6, 0.45);
  const upperGeo = hanging(0.31 * s, 0.55, 0.45);
  const foreGeo = hanging(0.27 * s, 0.5, 0.4);
  const bootGeo = new THREE.BoxGeometry(0.66 * s, 0.4, 1.0 * s);
  bootGeo.translate(0, 0, 0.16);
  const bootM = new THREE.MeshStandardMaterial({ color: o.boots ?? 0x2b2f38, roughness: 0.8 });
  const gloveM = o.gloves != null && o.gloves !== MATCH
    ? new THREE.MeshStandardMaterial({ color: o.gloves, roughness: 0.6 })
    : o.headgear === 'helmet' ? accent : skin;
  const pantsM = o.pants != null && o.pants !== MATCH
    ? new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.65 })
    : suit;

  const leg = (sx: number) => {
    const thigh = new THREE.Mesh(thighGeo, pantsM);
    thigh.position.set(sx * hip, HIP_Y, 0);
    const shin = new THREE.Mesh(shinGeo, pantsM);
    shin.position.y = -KNEE_DROP;
    const boot = new THREE.Mesh(bootGeo, bootM);
    boot.position.y = -1.05;
    shin.add(boot);
    thigh.add(shin);
    return { thigh, shin, boot };
  };
  const arm = (sx: number) => {
    const upper = new THREE.Mesh(upperGeo, suit);
    upper.position.set(sx * shoulder, SHOULDER_Y, 0);
    const fore = new THREE.Mesh(foreGeo, suit);
    fore.position.y = -ELBOW_DROP;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 10, 8), gloveM);
    hand.position.y = -0.9;
    hand.scale.set(0.9, 1.05, 0.8);
    fore.add(hand);
    upper.add(fore);
    return { upper, fore };
  };
  const L = leg(-1); const R = leg(1);
  const AL = arm(-1); const AR = arm(1);
  if (eva) {
    // Chest-mounted display & control module with status lights.
    const dcm = new THREE.Mesh(new THREE.BoxGeometry(1.1 * s, 0.7, 0.4), new THREE.MeshStandardMaterial({ color: 0xd4d9e2, roughness: 0.5 }));
    dcm.position.set(0, 3.55, 1.08 * s);
    body.add(dcm);
    const leds = [0x34d399, 0xfbbf24, 0xfb7185];
    leds.forEach((c, i) => {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: c }));
      led.position.set((i - 1) * 0.28, 3.6, 1.29 * s);
      body.add(led);
    });
    // Portable life-support system: a big pack with an antenna.
    const plss = new THREE.Mesh(new THREE.BoxGeometry(2.1 * s, 2.6, 1.0), new THREE.MeshStandardMaterial({ color: 0xe4e8ee, roughness: 0.55 }));
    plss.position.set(0, 3.4, -1.45 * s);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), trim);
    antenna.position.set(0.7 * s, 5.2, -1.6 * s);
    body.add(plss, antenna);
    // Helmet lamps either side of the visor.
    const lampM = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 10), lampM);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(sx * 0.82 * s, 4.95, 0.45 * s);
      headInner.add(lamp);
    }
    // Bearing rings at knees, elbows and wrists; accent stripes on the thighs.
    const ringM = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.35, metalness: 0.7 });
    for (const seg of [L.shin, R.shin, AL.fore, AR.fore]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 * s, 0.07, 6, 16), ringM);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.05;
      seg.add(ring);
    }
    for (const thigh of [L.thigh, R.thigh]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.37 * s, 0.06, 6, 16), accent);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.6;
      thigh.add(band);
    }
    for (const boot of [L.boot, R.boot]) boot.scale.set(1.12, 1.15, 1.1);
  }
  body.add(L.thigh, R.thigh, AL.upper, AR.upper);
  return {
    body, torso, head,
    legL: L.thigh, legR: R.thigh, shinL: L.shin, shinR: R.shin, bootL: L.boot, bootR: R.boot,
    armL: AL.upper, armR: AR.upper, foreL: AL.fore, foreR: AR.fore,
  };
}

/* ------------------------------------------------------------------------
 * Procedural animation shared by the player, NPCs and the studio preview.
 * Gait follows a simple biomechanical model: legs swing from the hip with the
 * knee folding during the swing phase, arms counter-swing (left arm with the
 * right leg), the pelvis rises at mid-stance twice per stride, and the torso
 * leans into speed while the head stays level. Cadence scales with ground
 * speed so feet don't skate.
 * --------------------------------------------------------------------- */

export interface RigPose {
  dt: number;
  /** Seconds, monotonic — drives breathing and idle fidgets. */
  t: number;
  /** Horizontal ground speed (world units / s). */
  speed: number;
  /** 0 = walk, 1 = full sprint. Derived from speed when omitted. */
  run?: number;
  airborne?: boolean;
  /** Vertical velocity — rising vs falling changes the jump pose. */
  velY?: number;
  swim?: boolean;
  /** Prone on a vehicle (diver holding onto the scooter). */
  ride?: boolean;
  /** Tumbling in a vortex — limbs flail. */
  flail?: boolean;
  /** 0..1 frightened: arms pump high, shoulders hunch. */
  panic?: number;
  /** Desired head yaw relative to the body (rad); null = idle glances. */
  lookYaw?: number | null;
  lookPitch?: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * Math.min(1, dt * rate);

export class AvatarAnimator {
  private phase = 0;
  private move = 0;      // smoothed 0..1 locomotion blend
  private runK = 0;
  private amp = 0;
  private airK = 0;
  private swimK = 0;
  private land = 0;
  private wasAir = false;
  private headYaw = 0;
  private headPitch = 0;
  private seed: number;

  constructor(public rig: BuiltAvatar, seed = 0) {
    this.seed = seed;
    this.phase = seed * 1.7;
  }

  /** Swap meshes (wardrobe change) without losing the stride. */
  setRig(rig: BuiltAvatar): void { this.rig = rig; }

  /** Landing impulse 0..1 (drives a knee-bend squash; exposed for camera dip). */
  get landing(): number { return this.land; }

  update(p: RigPose): void {
    const r = this.rig;
    const { dt, t } = p;
    const moving = p.speed > 0.25;
    this.move = approach(this.move, moving ? 1 : 0, moving ? 8 : 5, dt);
    const runTarget = p.run ?? clamp01((p.speed - 13) / 9);
    this.runK = approach(this.runK, runTarget, 5, dt);
    this.amp = approach(this.amp, moving ? Math.min(0.95, 0.24 + p.speed * 0.03) : 0, 6, dt);
    const air = !!p.airborne && !p.swim && !p.ride;
    if (this.wasAir && !air) this.land = Math.min(1, 0.5 + Math.abs(p.velY ?? 6) * 0.06);
    this.wasAir = air;
    this.airK = approach(this.airK, air ? 1 : 0, 12, dt);
    this.swimK = approach(this.swimK, p.swim ? 1 : 0, 4, dt);
    this.land = Math.max(0, this.land - dt * 4.5);

    // Cadence: ~1.3 strides/s walking, ~2 s⁻¹ sprinting.
    const cadence = moving ? 4.2 + p.speed * 0.33 : 0;
    this.phase += dt * (p.flail ? 13 : p.swim ? 2.2 + p.speed * 0.25 : cadence);
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const g = this.move;
    const A = this.amp;
    const rk = this.runK;
    const panic = p.panic ?? 0;
    const breath = Math.sin(t * 1.7 + this.seed);

    // --- Ground locomotion (walk / run / idle) ---
    let thighL = -s * A;
    let thighR = s * A;
    const swingBend = 0.45 + 0.95 * rk;
    let kneeL = g * (0.12 + 0.1 * rk + swingBend * Math.max(0, c));
    let kneeR = g * (0.12 + 0.1 * rk + swingBend * Math.max(0, -c));
    const armAmp = A * (0.85 + 0.25 * rk) + panic * 0.25 * g;
    let armL = s * armAmp - panic * 0.35;
    let armR = -s * armAmp - panic * 0.35;
    const elbowBase = 0.18 + (1 - g) * 0.04 + g * (0.2 + 1.05 * rk) + panic * 0.6;
    let foreL = -(elbowBase + g * 0.3 * Math.max(0, -s));
    let foreR = -(elbowBase + g * 0.3 * Math.max(0, s));
    let splay = 0.07 + panic * 0.1;
    let bodyY = g * (0.06 + 0.22 * rk) * (0.5 + 0.5 * Math.cos(2 * ph));
    let lean = g * (0.04 + 0.17 * rk) + panic * 0.06 * g;
    let roll = g * s * 0.035 * (1 - rk);
    // Idle: breathing rise, slow weight shift, relaxed arms.
    const idle = 1 - g;
    bodyY += idle * (0.03 + breath * 0.025);
    roll += idle * Math.sin(t * 0.45 + this.seed * 3) * 0.025;
    armL += idle * breath * 0.03;
    armR += idle * breath * 0.03;
    thighL += idle * Math.max(0, Math.sin(t * 0.45 + this.seed * 3)) * 0.06;
    kneeL += idle * Math.max(0, Math.sin(t * 0.45 + this.seed * 3)) * 0.1;

    // --- Airborne: tuck one leg, reach with the arms; falling flails wider ---
    const ak = this.airK;
    if (ak > 0.001) {
      const rising = (p.velY ?? 0) > 0;
      thighL = mix(thighL, -0.85, ak); kneeL = mix(kneeL, 1.35, ak);
      thighR = mix(thighR, -0.15, ak); kneeR = mix(kneeR, 0.55, ak);
      armL = mix(armL, rising ? -0.6 : -1.3, ak); armR = mix(armR, rising ? 0.3 : -1.1, ak);
      foreL = mix(foreL, -0.5, ak); foreR = mix(foreR, -0.4, ak);
      splay = mix(splay, rising ? 0.2 : 0.55, ak);
      lean = mix(lean, rising ? 0.08 : -0.05, ak);
    }
    // --- Landing squash: hips drop, knees absorb ---
    if (this.land > 0) {
      const l = this.land * this.land;
      bodyY -= l * 0.45;
      thighL -= l * 0.55; thighR -= l * 0.55;
      kneeL += l * 0.95; kneeR += l * 0.95;
      lean += l * 0.18;
    }

    // --- Swimming: body goes horizontal, flutter kick + sweeping stroke ---
    const sk = this.swimK;
    if (sk > 0.001) {
      const sw = p.speed > 0.25 ? 1 : 0;
      const kick = Math.sin(ph * 2.6);
      const stroke = Math.sin(ph);
      thighL = mix(thighL, mix(Math.sin(t * 1.4) * 0.3, kick * 0.35, sw), sk);
      thighR = mix(thighR, mix(-Math.sin(t * 1.4) * 0.3, -kick * 0.35, sw), sk);
      kneeL = mix(kneeL, mix(0.6 + Math.sin(t * 1.4) * 0.3, 0.2 + Math.max(0, kick) * 0.3, sw), sk);
      kneeR = mix(kneeR, mix(0.6 - Math.sin(t * 1.4) * 0.3, 0.2 + Math.max(0, -kick) * 0.3, sw), sk);
      armL = mix(armL, mix(-0.9 + stroke * 0.25, -2.3 + stroke * 0.7, sw), sk);
      armR = mix(armR, mix(-0.9 - stroke * 0.25, -2.3 + stroke * 0.7, sw), sk);
      foreL = mix(foreL, -0.35, sk); foreR = mix(foreR, -0.35, sk);
      splay = mix(splay, mix(0.5 + stroke * 0.25, 0.25 + Math.max(0, -stroke) * 0.6, sw), sk);
      lean = mix(lean, mix(0.12, 1.15, sw), sk);
      bodyY = mix(bodyY, Math.sin(t * 1.3 + this.seed) * 0.15, sk);
      roll = mix(roll, sw * stroke * 0.12, sk);
    }

    // --- Prone ride / vortex flail override everything ---
    if (p.ride) {
      armL = -2.6; armR = -2.6; foreL = -0.25; foreR = -0.25; splay = 0.18;
      const kick = Math.sin(ph * 2.2) * 0.35;
      thighL = kick; thighR = -kick; kneeL = 0.3 + Math.max(0, kick); kneeR = 0.3 + Math.max(0, -kick);
      lean = 1.25; bodyY = 0; roll = 0;
    }
    if (p.flail) {
      const f1 = Math.sin(t * 11 + this.seed); const f2 = Math.sin(t * 13.7 + 1.3);
      armL = -2.2 + f1 * 0.9; armR = -2.0 - f2 * 0.9; foreL = -0.6 - f2 * 0.5; foreR = -0.6 - f1 * 0.5;
      splay = 0.7 + f2 * 0.3;
      thighL = f2 * 0.9; thighR = -f1 * 0.9; kneeL = 0.8 + f1 * 0.5; kneeR = 0.8 + f2 * 0.5;
      lean = 0; bodyY = 0;
    }

    r.legL.rotation.x = thighL; r.legR.rotation.x = thighR;
    r.shinL.rotation.x = Math.max(0, kneeL); r.shinR.rotation.x = Math.max(0, kneeR);
    // Feet roll heel-to-toe and stay roughly parallel to the ground.
    r.bootL.rotation.x = -(thighL + Math.max(0, kneeL)) * 0.55 * (1 - sk);
    r.bootR.rotation.x = -(thighR + Math.max(0, kneeR)) * 0.55 * (1 - sk);
    r.armL.rotation.x = armL; r.armR.rotation.x = armR;
    r.armL.rotation.z = -splay; r.armR.rotation.z = splay;
    r.foreL.rotation.x = Math.min(0, foreL); r.foreR.rotation.x = Math.min(0, foreR);
    r.body.position.y = bodyY;
    r.body.rotation.x = lean;
    r.body.rotation.z = roll;
    r.torso.scale.set(1 + idle * breath * 0.012, 1 + idle * breath * 0.02, 1 + idle * breath * 0.012);

    // Head: aim where asked, otherwise glance around when standing still;
    // pitch counters the torso lean so the gaze stays on the horizon.
    const glance = idle * (Math.sin(t * 0.31 + this.seed * 5) * 0.5 + Math.sin(t * 0.83 + this.seed) * 0.2);
    const yawT = Math.max(-1.2, Math.min(1.2, p.lookYaw ?? glance));
    this.headYaw = approach(this.headYaw, yawT, 5, dt);
    this.headPitch = approach(this.headPitch, (p.lookPitch ?? 0) - lean * 0.7 * (1 - sk * 0.5), 6, dt);
    r.head.rotation.set(this.headPitch, this.headYaw, -roll * 0.5);
  }
}

function mix(a: number, b: number, k: number): number { return a + (b - a) * k; }

/** Dispose a built body before rebuilding (leaks GL memory otherwise). */
export function disposeAvatarBody(body: THREE.Group): void {
  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | undefined;
    if (mat) mat.dispose();
  });
}
