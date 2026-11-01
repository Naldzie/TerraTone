import * as THREE from 'three';
import { AvatarAnimator, buildAvatarMesh, randomAvatarOptions } from './avatar';
import type { AvatarOptions, BuiltAvatar } from './avatar';

/* Wandering bystander NPC — one shared class for EnvSim + TornadoScene.
 * Picks stroll targets, flees the hazard center when close, avoids building
 * footprints with the same cheap circle push-out as the player, and swings
 * its limbs while walking. Deterministic per seed.
 *
 * Visitors get noticed: when the player wanders close, each bystander may
 * pause, turn their way and pop a random emote bubble (wave, smile, …) —
 * weighted, deterministic per seed, cancelled while fleeing or chatting.
 *
 * Bystanders also chat with each other: two idle neighbors stop, face each
 * other and trade a short scripted exchange in speech bubbles (local lines,
 * no network), broken off if either has to flee or the visitor talks to one.
 */

export interface NpcCollider { x: number; z: number; r: number }

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bystanders spawned per world, and how many each graphics tier shows. */
export const NPC_COUNT = 14;
export function npcTierFor(q: 'low' | 'medium' | 'high'): number {
  return q === 'low' ? 5 : q === 'high' ? NPC_COUNT : 9;
}

const FLEE_RADIUS = 110;
const NOTICE_RADIUS = 24;   // they look up when the visitor gets this close
const NOTICE_CANCEL = 30;   // visitor walked on past → they carry on
const EMOTE_LIFE = 2.2;     // seconds an emote bubble stays up

/** Bystander-to-bystander small talk: each topic is an A, B, A exchange. */
export const SMALL_TALK: Record<'ground' | 'water' | 'space', string[][]> = {
  ground: [
    ['Did you feel that?', 'Yeah. Stay alert.', "Let's keep our distance."],
    ['Any signal on your phone?', 'One bar. Barely.', "Mine's completely dead."],
    ['NASA tracks this from space, right?', 'Yep, satellites see it live.', "That's so cool."],
    ['Should we head back?', 'Give it a minute.', 'Okay, but no closer.'],
    ["Where's the nearest shelter?", 'Past the tall building.', 'Good, remember that.'],
    ['Look at the sky!', "I've never seen it like this.", 'Get a photo, quick!'],
    ['Ever done a safety drill?', 'Every year at school.', 'Same. It really helps.'],
    ['Nice suit!', 'Thanks, it is brand new.', 'Very explorer-chic.'],
  ],
  water: [
    ['Check your air!', 'Plenty left.', "Good, let's explore."],
    ['Did you see the whale?', 'Huge, and so calm!', 'Best dive ever.'],
    ["The current's strong here.", 'Stay close to me.', 'Got it.'],
    ["What's that glowing?", 'A jellyfish, I think.', "Don't touch it!"],
  ],
  space: [
    ['Look how small Earth is.', 'Like a blue marble.', 'Makes you think.'],
    ["How's your oxygen?", 'Ninety percent.', 'Same here.'],
    ["Don't drift too far!", 'My tether is fine.', 'Okay, just checking.'],
    ['Can you hear anything?', 'Nothing. Space is silent.', 'Except our radios!'],
  ],
};
const CHAT_RADIUS = 10;     // neighbors this close may strike up a conversation
const CHAT_LINE_S = 2.8;    // seconds each line stays up
const CHAT_WAIT_MIN = 18;   // seconds before the same bystander chats again

interface Conversation { a: Npc; b: Npc; lines: string[]; idx: number; t: number }

/* Speech-bubble textures, rendered once per line. */
const lineTexCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
function lineTexture(text: string): { tex: THREE.CanvasTexture; aspect: number } {
  const hit = lineTexCache.get(text);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 30px system-ui, Segoe UI, Roboto, sans-serif';
  let w = 320;
  if (ctx) { ctx.font = font; w = Math.ceil(ctx.measureText(text).width) + 44; }
  c.width = Math.max(120, w);
  c.height = 84;
  if (ctx) {
    ctx.font = font;
    ctx.fillStyle = 'rgba(248, 252, 255, 0.96)';
    ctx.strokeStyle = 'rgba(8, 15, 30, 0.55)';
    ctx.lineWidth = 3;
    roundedRect(ctx, 4, 4, c.width - 8, 56, 22);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.width / 2 - 12, 58);
    ctx.lineTo(c.width / 2, 80);
    ctx.lineTo(c.width / 2 + 12, 58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b1424';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, 33);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const out = { tex, aspect: c.width / c.height };
  lineTexCache.set(text, out);
  return out;
}

export type EmoteName = 'wave' | 'smile' | 'thumbs-up' | 'alert' | 'heart' | 'cheer' | 'peace';

/** Emotes a bystander can throw your way, weighted (wave is the favorite). */
export const NPC_EMOTES: { emote: EmoteName; weight: number }[] = [
  { emote: 'wave', weight: 5 },
  { emote: 'smile', weight: 3 },
  { emote: 'thumbs-up', weight: 3 },
  { emote: 'alert', weight: 2 },
  { emote: 'heart', weight: 2 },
  { emote: 'cheer', weight: 2 },
  { emote: 'peace', weight: 2 },
];

/** Deterministic weighted pick from a 0…1 roll (unit-tested). */
export function pickEmote(r: number): EmoteName {
  let x = Math.min(0.999999, Math.max(0, r)) * NPC_EMOTES.reduce((s, e) => s + e.weight, 0);
  for (const e of NPC_EMOTES) { x -= e.weight; if (x < 0) return e.emote; }
  return NPC_EMOTES[NPC_EMOTES.length - 1].emote;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawEmoteGlyph(ctx: CanvasRenderingContext2D, emote: EmoteName): void {
  const color = emote === 'heart' || emote === 'alert' ? '#fb7185'
    : emote === 'smile' ? '#fbbf24'
      : emote === 'thumbs-up' ? '#34d399'
        : emote === 'cheer' ? '#a78bfa'
          : emote === 'peace' ? '#6ea8fe'
            : '#5ff5d2';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(64, 52);

  switch (emote) {
    case 'wave': {
      ctx.beginPath();
      ctx.moveTo(-14, 12);
      ctx.lineTo(-14, -2);
      ctx.quadraticCurveTo(-14, -8, -8, -8);
      ctx.lineTo(10, -8);
      ctx.quadraticCurveTo(16, -8, 16, -2);
      ctx.lineTo(16, 12);
      ctx.quadraticCurveTo(16, 18, 10, 18);
      ctx.lineTo(-8, 18);
      ctx.quadraticCurveTo(-14, 18, -14, 12);
      ctx.stroke();
      for (const x of [-10, -4, 2, 8]) {
        ctx.beginPath();
        ctx.moveTo(x, -8);
        ctx.lineTo(x, -24);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.quadraticCurveTo(-24, 0, -22, -8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(27, -2, 8, -0.8, 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, -2, 14, -0.7, 0.7);
      ctx.stroke();
      break;
    }
    case 'smile': {
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-7, -5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(7, -5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 2, 10, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'thumbs-up': {
      ctx.beginPath();
      ctx.moveTo(-14, 18);
      ctx.lineTo(-14, -2);
      ctx.quadraticCurveTo(-14, -8, -8, -8);
      ctx.lineTo(4, -8);
      ctx.quadraticCurveTo(10, -8, 10, -2);
      ctx.lineTo(10, 18);
      ctx.quadraticCurveTo(10, 24, 4, 24);
      ctx.lineTo(-8, 24);
      ctx.quadraticCurveTo(-14, 24, -14, 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -2);
      ctx.lineTo(-14, -20);
      ctx.quadraticCurveTo(-14, -26, -8, -26);
      ctx.quadraticCurveTo(-2, -26, -2, -20);
      ctx.lineTo(-2, -2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(6, 4);
      ctx.lineTo(16, 4);
      ctx.moveTo(6, 12);
      ctx.lineTo(16, 12);
      ctx.stroke();
      break;
    }
    case 'alert': {
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 21, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, 22);
      ctx.bezierCurveTo(-30, 0, -24, -22, -8, -22);
      ctx.bezierCurveTo(-2, -22, 2, -17, 4, -11);
      ctx.bezierCurveTo(6, -17, 10, -22, 16, -22);
      ctx.bezierCurveTo(32, -22, 30, 0, 0, 22);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cheer': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 24 : 10;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'peace': {
      ctx.beginPath();
      ctx.moveTo(-18, 22);
      ctx.lineTo(-7, -22);
      ctx.moveTo(18, 22);
      ctx.lineTo(7, -22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-18, 22);
      ctx.quadraticCurveTo(0, 32, 18, 22);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/* Shared icon-bubble textures (canvas-rendered once per emote). */
const emoteTexCache = new Map<EmoteName, THREE.CanvasTexture>();
function emoteTexture(emote: EmoteName): THREE.CanvasTexture {
  const hit = emoteTexCache.get(emote);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(8, 15, 30, 0.94)';
    ctx.strokeStyle = 'rgba(232, 241, 255, 0.8)';
    ctx.lineWidth = 4;
    roundedRect(ctx, 10, 8, 108, 86, 24);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(48, 92);
    ctx.lineTo(60, 118);
    ctx.lineTo(76, 92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawEmoteGlyph(ctx, emote);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  emoteTexCache.set(emote, tex);
  return tex;
}

/** Bystander call-signs, assigned deterministically from the NPC seed. */
export const NPC_NAMES = [
  'Mina', 'Theo', 'Priya', 'Jonas', 'Amara', 'Rafi',
  'Sofia', 'Kenji', 'Lena', 'Marco', 'Aisha', 'Diego',
  'Nadia', 'Omar', 'Yuki', 'Tomas', 'Leila', 'Bayani',
  'Chloe', 'Ivan', 'Malia', 'Ravi', 'Ingrid', 'Kwame',
];

type Activity = 'look' | 'watch' | 'phone';

/** How close another body has to be before a bystander side-steps it. */
const PERSONAL_SPACE = 5.5;
/** Flee hysteresis: calm down only this far beyond the flee radius. */
const CALM_MARGIN = 30;
/** Close enough to see the hazard clearly — they stop and stare / point. */
const WATCH_RADIUS = 240;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Npc {
  readonly group = new THREE.Group();
  /** Call-sign shown in chat; spawners may reassign it so a crowd has no twins. */
  name: string;
  private rig: BuiltAvatar;
  private anim: AvatarAnimator;
  private x: number;
  private z: number;
  private yaw = 0;
  private tx: number;
  private tz: number;
  private retarget = 0;
  private phase: number;
  private speed = 0;
  private rnd: () => number;
  private swim: boolean;
  private noticeCooldown = 0;
  private noticePending = -1;
  private emoteName: EmoteName | null = null;
  private emoteTtl = 0;
  private emoteSprite: THREE.Sprite | null = null;
  private convo: Conversation | null = null;
  private chatWait: number;
  private chatSprite: THREE.Sprite | null = null;
  private chatShown = -1;
  private topics: string[][];
  // Personality: everyone moves a little differently.
  private walkSpeed: number;
  private fleeSpeed: number;
  private nerve: number;          // 0 timid … 1 storm-chaser
  private fleeing = false;
  private pause = 0;              // seconds left standing at a stroll target
  private activity: Activity = 'look';
  private lookBack = 0;           // timer for over-the-shoulder glances while fleeing
  private sideX = 0; private sideZ = 0;
  /** Panic inside this distance of the hazard (0 = never flee). */
  fleeRadius = FLEE_RADIUS;

  constructor(seed: number, startX: number, startZ: number, swim = false, opts?: AvatarOptions, spaceSuit = false) {
    this.rnd = mulberry(seed);
    this.swim = swim;
    this.topics = spaceSuit ? SMALL_TALK.space : swim ? SMALL_TALK.water : SMALL_TALK.ground;
    this.chatWait = 2 + this.rnd() * 6;
    this.x = startX; this.z = startZ;
    this.tx = startX; this.tz = startZ;
    this.phase = this.rnd() * Math.PI * 2;
    this.yaw = this.rnd() * Math.PI * 2;
    this.name = NPC_NAMES[Math.floor(this.rnd() * NPC_NAMES.length)];

    // Every bystander gets their own randomized look.
    const look = opts ?? randomAvatarOptions(this.rnd);
    this.rig = buildAvatarMesh(look, { spaceSuit });
    this.anim = new AvatarAnimator(this.rig, seed % 97);
    this.walkSpeed = 3.6 + this.rnd() * 1.8;
    this.fleeSpeed = 9 + this.rnd() * 2.8;
    this.nerve = this.rnd();
    // Heights vary ±6 % like a real crowd.
    this.rig.body.scale.setScalar(0.94 + this.rnd() * 0.12);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    shadow.name = 'blobShadow';
    this.group.add(this.rig.body, shadow);
    this.group.position.set(this.x, swim ? 2.2 : 0, this.z);
  }

  /** Current emote while one is showing, else null (test hook). */
  get emoting(): EmoteName | null {
    return this.emoteTtl > 0 ? this.emoteName : null;
  }

  /** True while running from the hazard. */
  get isFleeing(): boolean { return this.fleeing; }

  /** Name of the bystander this one is chatting with, else null. */
  get chattingWith(): string | null {
    if (!this.convo) return null;
    return (this.convo.a === this ? this.convo.b : this.convo.a).name;
  }

  /** Line this bystander is saying right now, else null (test hook). */
  get saying(): string | null {
    const c = this.convo;
    if (!c) return null;
    const speaker = c.idx % 2 === 0 ? c.a : c.b;
    return speaker === this ? c.lines[c.idx] ?? null : null;
  }

  private endChat(): void {
    const c = this.convo;
    if (!c) return;
    for (const n of [c.a, c.b]) {
      n.convo = null;
      n.chatShown = -1;
      n.chatWait = CHAT_WAIT_MIN + n.rnd() * 25;
      if (n.chatSprite) n.chatSprite.visible = false;
    }
  }

  /** Free to start a conversation right now? */
  private chatReady(): boolean {
    if (this.convo || this.fleeing || this.chatWait > 0 || !this.group.visible) return false;
    // A greeting to the visitor in progress comes first.
    return this.emoteTtl <= 0 && this.noticePending < 0;
  }

  private tryStartChat(dt: number, neighbors: readonly Npc[]): void {
    if (!this.chatReady() || this.rnd() > dt * 0.8) return;
    for (const n of neighbors) {
      if (n === this || !n.chatReady()) continue;
      if (Math.hypot(n.x - this.x, n.z - this.z) > CHAT_RADIUS) continue;
      const lines = this.topics[Math.floor(this.rnd() * this.topics.length)];
      const c: Conversation = { a: this, b: n, lines, idx: 0, t: 0 };
      this.convo = c; n.convo = c;
      return;
    }
  }

  /** Stand, face the partner, show our line when it's our turn. False if the chat ended. */
  private updateChat(dt: number, t: number): boolean {
    const c = this.convo;
    if (!c) return false;
    const other = c.a === this ? c.b : c.a;
    if (!other.group.visible || other.convo !== c || other.fleeing) { this.endChat(); return false; }
    if (c.a === this) {
      c.t += dt;
      if (c.t > CHAT_LINE_S) { c.t = 0; c.idx++; }
      if (c.idx >= c.lines.length) { this.endChat(); return false; }
    }
    // Turn to face the partner.
    this.speed = 0;
    const want = Math.atan2(other.x - this.x, other.z - this.z);
    this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 5);
    this.anim.update({ dt, t, speed: 0, swim: this.swim, lookYaw: 0, lookPitch: -0.05 });
    const y = this.swim ? 2.2 + Math.sin(t * 1.1 + this.phase * 0.1) * 0.3 : 0;
    this.group.position.set(this.x, y, this.z);
    this.group.rotation.y = this.yaw;
    // Bubble over whoever is speaking; a small hand gesture while talking.
    const speaking = (c.idx % 2 === 0 ? c.a : c.b) === this;
    if (speaking) {
      if (this.chatShown !== c.idx) {
        this.chatShown = c.idx;
        const { tex, aspect } = lineTexture(c.lines[c.idx]);
        const sp = this.ensureChatSprite();
        const mat = sp.material as THREE.SpriteMaterial;
        mat.map = tex;
        mat.needsUpdate = true;
        sp.scale.set(2.1 * aspect, 2.1, 1);
        sp.visible = true;
      }
      const k = Math.min(1, c.t / 0.15) * Math.min(1, (CHAT_LINE_S - c.t) / 0.3);
      if (this.chatSprite) (this.chatSprite.material as THREE.SpriteMaterial).opacity = c.a === this ? k : 1;
      if (!this.swim) {
        const r = this.rig;
        r.armR.rotation.x = -0.9 + Math.sin(t * 5 + this.phase) * 0.25;
        r.foreR.rotation.x = -1.1;
      }
    } else if (this.chatSprite) {
      this.chatSprite.visible = false;
      this.chatShown = -1;
    }
    return true;
  }

  private ensureChatSprite(): THREE.Sprite {
    if (this.chatSprite) return this.chatSprite;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    s.position.set(0, 7.8, 0);
    s.visible = false;
    this.group.add(s);
    this.chatSprite = s;
    return s;
  }

  /** Stop and turn to face a point — used while the visitor is chatting. */
  faceToward(x: number, z: number, dt = 1 / 60, t = performance.now() / 1000): void {
    this.speed = 0;
    this.cancelEmote();
    this.endChat();
    const dy = wrapAngle(Math.atan2(x - this.x, z - this.z) - this.yaw);
    this.yaw += dy * Math.min(1, dt * 8);
    this.group.rotation.y = this.yaw;
    // Keep breathing and hold eye contact with the visitor while talking.
    this.anim.update({ dt, t, speed: 0, swim: this.swim, lookYaw: 0, lookPitch: -0.05 });
    if (!this.swim) this.group.position.y = 0;
  }

  /** Teleport (respawn) the NPC — resets wander state. */
  place(x: number, z: number): void {
    this.x = x; this.z = z;
    this.tx = x; this.tz = z;
    this.retarget = 0;
    this.speed = 0;
    this.pause = 0;
    this.fleeing = false;
    this.cancelEmote();
    this.endChat();
    this.noticeCooldown = 3 + this.rnd() * 5;
    this.yaw = Math.random() * Math.PI * 2;
    this.group.position.set(x, this.swim ? 2.2 : 0, z);
    this.group.rotation.y = this.yaw;
  }

  private cancelEmote(): void {
    this.noticePending = -1;
    this.emoteTtl = 0;
    if (this.emoteSprite) this.emoteSprite.visible = false;
  }

  private ensureEmoteSprite(): THREE.Sprite {
    if (this.emoteSprite) return this.emoteSprite;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    s.position.set(0, 6.6, 0);
    s.scale.setScalar(0.9);
    s.visible = false;
    this.group.add(s);
    this.emoteSprite = s;
    return s;
  }

  /** Notice the visitor: pause a beat, pick an emote, pop it; then cooldown. */
  private updateEmoteState(dt: number, player: { x: number; z: number } | undefined, fleeing: boolean): void {
    if (this.noticeCooldown > 0) this.noticeCooldown -= dt;
    if (this.emoteTtl > 0) this.emoteTtl -= dt;
    if (this.emoteSprite && this.emoteTtl <= 0) this.emoteSprite.visible = false;

    const d = player ? Math.hypot(player.x - this.x, player.z - this.z) : Infinity;
    const near = d < NOTICE_RADIUS;
    if (fleeing || d > NOTICE_CANCEL) {
      this.noticePending = -1;
      if (fleeing) { this.emoteTtl = 0; if (this.emoteSprite) this.emoteSprite.visible = false; }
    }

    if (near && !fleeing && this.noticeCooldown <= 0 && this.noticePending < 0 && this.emoteTtl <= 0) {
      this.noticePending = 0.15 + this.rnd() * 1.1;     // looks up after a beat
      this.emoteName = pickEmote(this.rnd());           // random wave / cheer / …
    }
    if (this.noticePending >= 0) {
      this.noticePending -= dt;
      if (this.noticePending < 0) {
        this.emoteTtl = EMOTE_LIFE;
        this.noticeCooldown = 14 + this.rnd() * 20;     // greet again if you linger
        const sp = this.ensureEmoteSprite();
        const mat = sp.material as THREE.SpriteMaterial;
        const emote = this.emoteName;
        if (emote) {
          mat.map = emoteTexture(emote);
          mat.needsUpdate = true;
          sp.visible = true;
        }
      }
    }
  }

  /** Pop-in, bob, drift and fade of the emote bubble; a matching gesture when standing. */
  private animateEmote(t: number): void {
    if (this.emoteTtl <= 0 || !this.emoteSprite) return;
    const sp = this.emoteSprite;
    const k = 1 - this.emoteTtl / EMOTE_LIFE;           // 0 → 1
    const inK = Math.min(1, k / 0.12);
    const outK = Math.min(1, this.emoteTtl / 0.45);
    sp.scale.setScalar(1.3 + 0.6 * inK);
    (sp.material as THREE.SpriteMaterial).opacity = outK;
    sp.position.y = 6.9 + Math.sin(t * 3.2 + this.phase) * 0.05 + k * 0.28;
    if (this.swim || this.speed >= 1.5) return;         // gestures need both feet planted

    const r = this.rig;
    const sway = Math.sin(t * 9 + this.phase * 0.2);
    switch (this.emoteName) {
      case 'wave':                                      // hand up, forearm waggles
        r.armR.rotation.x = -2.7; r.armR.rotation.z = 0.35;
        r.foreR.rotation.x = -0.35 + sway * 0.35;
        break;
      case 'thumbs-up':                                 // fist forward, thumb up
        r.armR.rotation.x = -1.3; r.foreR.rotation.x = -1.1 + Math.sin(t * 4.5) * 0.08;
        break;
      case 'peace':                                     // hand by the face
        r.armR.rotation.x = -2.2; r.armR.rotation.z = 0.5; r.foreR.rotation.x = -1.2;
        break;
      case 'heart':                                     // hands make a heart over the chest
        r.armL.rotation.x = -0.9; r.armR.rotation.x = -0.9;
        r.armL.rotation.z = 0.35; r.armR.rotation.z = -0.35;
        r.foreL.rotation.x = -1.5; r.foreR.rotation.x = -1.5;
        break;
      case 'cheer': {                                   // both arms pump overhead
        const cheer = Math.sin(t * 6.5 + this.phase);
        r.armL.rotation.x = -2.8 + cheer * 0.15; r.armR.rotation.x = -2.8 - cheer * 0.15;
        r.foreL.rotation.x = -0.2; r.foreR.rotation.x = -0.2;
        this.group.position.y += Math.abs(cheer) * 0.2 * outK;
        break;
      }
      case 'alert': {                                   // startled hop, hands up
        const hop = Math.abs(Math.sin(t * 7.2 + this.phase));
        r.armL.rotation.x = -1.5 - hop * 0.4; r.armR.rotation.x = -1.5 - hop * 0.4;
        r.foreL.rotation.x = -1.2; r.foreR.rotation.x = -1.2;
        this.group.position.y += hop * 0.35 * outK;
        break;
      }
      default:                                          // smile: little bounce, hands on hips
        r.armL.rotation.z = -0.55; r.armR.rotation.z = 0.55;
        r.foreL.rotation.x = -1.6; r.foreR.rotation.x = -1.6;
        this.group.position.y += Math.abs(sway) * 0.06 * outK;
    }
  }

  update(
    dt: number, t: number, half: number, colliders: NpcCollider[],
    threat: { x: number; z: number }, player?: { x: number; z: number },
    neighbors?: readonly Npc[],
  ): void {
    // Panic with hysteresis: bolt inside the flee radius, only calm down well clear.
    const tdx = this.x - threat.x;
    const tdz = this.z - threat.z;
    const tdist = Math.hypot(tdx, tdz);
    if (tdist < this.fleeRadius && tdist > 1e-3) this.fleeing = true;
    else if (tdist > this.fleeRadius + CALM_MARGIN) this.fleeing = false;
    const fleeing = this.fleeing && tdist > 1e-3;
    if (this.chatWait > 0) this.chatWait -= dt;
    if (fleeing && this.convo) this.endChat();
    if (this.convo && this.updateChat(dt, t)) return;
    if (!fleeing && neighbors) this.tryStartChat(dt, neighbors);
    if (this.convo && this.updateChat(dt, t)) return;
    this.updateEmoteState(dt, player, fleeing);

    let wantX = 0; let wantZ = 0; let targetSpeed = 0;
    let lookYaw: number | null = null;
    let lookPitch = 0;
    let watching = false;
    if (fleeing) {
      // Run directly away, bending along the map edge instead of pinning to it.
      wantX = tdx / tdist; wantZ = tdz / tdist;
      const edge = half - 25;
      const atEdgeX = Math.abs(this.x) > edge;
      const atEdgeZ = Math.abs(this.z) > edge;
      if (atEdgeX) wantX *= 0.2;
      if (atEdgeZ) wantZ *= 0.2;
      if (atEdgeX || atEdgeZ) {
        const ex = -tdz / tdist; const ez = tdx / tdist;
        const sgn = ex * -this.x + ez * -this.z > 0 ? 1 : -1;
        wantX += ex * sgn; wantZ += ez * sgn;
      }
      targetSpeed = this.fleeSpeed * (tdist < this.fleeRadius * 0.5 ? 1.12 : 1);
      this.pause = 0;
      // Glance back over the shoulder every couple of seconds.
      this.lookBack -= dt;
      if (this.lookBack < -0.7) this.lookBack = 1.4 + this.rnd() * 1.8;
      if (this.lookBack < 0) lookYaw = (Math.floor(t / 3) % 2 === 0 ? 1 : -1) * 1.1;
    } else {
      this.retarget -= dt;
      const dx = this.tx - this.x;
      const dz = this.tz - this.z;
      const d = Math.hypot(dx, dz);
      if (this.pause > 0) {
        this.pause -= dt;
      } else if (d < 3) {
        // Arrived: stand around for a while doing something.
        this.pause = 2.5 + this.rnd() * 5;
        this.retarget = 0;
        const roll = this.rnd();
        this.activity = tdist < WATCH_RADIUS && roll < 0.45 + this.nerve * 0.4
          ? 'watch' : roll < 0.75 ? 'look' : 'phone';
      } else {
        wantX = dx / d; wantZ = dz / d;
        targetSpeed = this.walkSpeed;
      }
      if (this.retarget <= 0 && this.pause <= 0) {
        this.retarget = 6 + this.rnd() * 8;
        // Sometimes stroll over to another bystander for a chat.
        const others = neighbors?.filter((n) => n !== this && n.group.visible && !n.fleeing) ?? [];
        if (others.length && this.chatWait <= 4 && this.rnd() < 0.65) {
          const n = others[Math.floor(this.rnd() * others.length)];
          this.tx = n.x + (this.rnd() - 0.5) * 6;
          this.tz = n.z + (this.rnd() - 0.5) * 6;
        } else {
          const a = this.rnd() * Math.PI * 2;
          const r = 40 + this.rnd() * (half - 60);
          this.tx = Math.cos(a) * r;
          this.tz = Math.sin(a) * r;
        }
      }
      if (this.pause > 0) {
        if (this.activity === 'watch' && tdist < WATCH_RADIUS) {
          watching = true;
          // Turn toward the hazard and track it with the head.
          const want = Math.atan2(threat.x - this.x, threat.z - this.z);
          this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 2.5);
          lookYaw = wrapAngle(want - this.yaw);
          lookPitch = -0.12;
        } else if (this.activity === 'phone') {
          lookPitch = 0.45;
          lookYaw = 0;
        }
      }
      // Pause to look at the visitor while the greeting plays.
      if (this.noticePending >= 0 || this.emoteTtl > 0) { wantX = 0; wantZ = 0; targetSpeed = 0; }
    }

    // Personal space: side-step neighbors and the visitor.
    const decay = Math.max(0, 1 - dt * 4);
    this.sideX *= decay; this.sideZ *= decay;
    const avoid = (ox: number, oz: number, radius: number) => {
      const ax = this.x - ox; const az = this.z - oz;
      const ad = Math.hypot(ax, az);
      if (ad < radius && ad > 1e-3) {
        const push = (1 - ad / radius) * 1.6;
        this.sideX += (ax / ad) * push * dt * 6;
        this.sideZ += (az / ad) * push * dt * 6;
      }
    };
    if (neighbors) for (const n of neighbors) if (n !== this && n.group.visible) avoid(n.x, n.z, PERSONAL_SPACE);
    if (player && !fleeing && this.emoteTtl <= 0 && this.noticePending < 0) avoid(player.x, player.z, 4);

    // Turn first, then walk: speed scales with how well we're facing the goal,
    // so nobody moonwalks or strafes sideways.
    const wl = Math.hypot(wantX, wantZ);
    let align = 1;
    if (wl > 0.01) {
      wantX /= wl; wantZ /= wl;
      const dyaw = wrapAngle(Math.atan2(wantX, wantZ) - this.yaw);
      this.yaw += dyaw * Math.min(1, dt * (fleeing ? 8 : 4.5));
      align = Math.max(0, Math.cos(dyaw));
    }
    const goal = targetSpeed * (0.25 + 0.75 * align);
    this.speed += (goal - this.speed) * Math.min(1, dt * (goal > this.speed ? 2.5 : 4));
    if (this.speed > 0.05 || Math.hypot(this.sideX, this.sideZ) > 0.01) {
      const fx = Math.sin(this.yaw); const fz = Math.cos(this.yaw);
      let nx = this.x + fx * this.speed * dt + this.sideX * dt * 4;
      let nz = this.z + fz * this.speed * dt + this.sideZ * dt * 4;
      nx = Math.min(half, Math.max(-half, nx));
      nz = Math.min(half, Math.max(-half, nz));
      for (const c of colliders) {
        const dx = nx - c.x; const dz = nz - c.z;
        const dd = Math.hypot(dx, dz);
        if (dd < c.r && dd > 1e-6) { nx = c.x + (dx / dd) * c.r; nz = c.z + (dz / dd) * c.r; }
      }
      this.x = nx; this.z = nz;
    }

    // Visitor noticed: turn to face them while the greeting is pending or playing.
    if ((this.noticePending >= 0 || this.emoteTtl > 0) && player && !fleeing && this.speed < 1) {
      const pdx = player.x - this.x;
      const pdz = player.z - this.z;
      if (Math.hypot(pdx, pdz) > 0.5) {
        const want = Math.atan2(pdx, pdz);
        this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 5);
        lookYaw = wrapAngle(want - this.yaw);
      }
    } else if (player && !fleeing && lookYaw === null) {
      // Passers-by follow the visitor with their eyes when close.
      const pdx = player.x - this.x; const pdz = player.z - this.z;
      const pd = Math.hypot(pdx, pdz);
      if (pd < NOTICE_CANCEL && pd > 0.5) {
        const rel = wrapAngle(Math.atan2(pdx, pdz) - this.yaw);
        if (Math.abs(rel) < 1.6) lookYaw = rel;
      }
    }

    this.phase += dt * (2 + this.speed * 1.4);
    this.anim.update({
      dt, t, speed: this.speed, swim: this.swim,
      run: fleeing ? Math.min(1, this.speed / this.fleeSpeed) : 0,
      panic: fleeing ? 0.4 + (1 - this.nerve) * 0.6 : 0,
      lookYaw, lookPitch,
    });
    const y = this.swim ? 2.2 + Math.sin(t * 1.1 + this.phase * 0.1) * 0.3 : 0;
    this.group.position.set(this.x, y, this.z);
    this.group.rotation.y = this.yaw;

    // Activity poses layered on top of the base idle.
    if (this.pause > 0 && this.speed < 0.6 && !fleeing && this.emoteTtl <= 0 && !this.swim) {
      const r = this.rig;
      if (watching && this.nerve > 0.55) {
        // Point at the hazard.
        r.armR.rotation.x = -1.55; r.armR.rotation.z = 0.15; r.foreR.rotation.x = -0.05;
      } else if (watching) {
        // Hand shading the eyes.
        r.armR.rotation.x = -2.35; r.armR.rotation.z = 0.55; r.foreR.rotation.x = -1.45;
      } else if (this.activity === 'phone') {
        r.armL.rotation.x = -0.55; r.foreL.rotation.x = -1.55; r.armL.rotation.z = 0.25;
        r.armR.rotation.x = -0.45; r.foreR.rotation.x = -1.5; r.armR.rotation.z = -0.25;
      }
    }
    this.animateEmote(t);
  }
}
