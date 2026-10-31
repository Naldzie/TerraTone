import { beforeAll, describe, expect, it } from 'vitest';
import { Npc, NPC_EMOTES, pickEmote } from '../sim/npc';

const EMOTES = NPC_EMOTES.map((e) => e.emote);

// jsdom has no canvas 2D — the NPC guards for this; stub it so no error noise.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const step = (npc: Npc, i: number, player: { x: number; z: number }) => {
  npc.update(1 / 60, i / 60, 300, [], { x: 999, z: 999 }, player);
};

describe('NPC emotes', () => {
  it('picks a deterministic weighted emote from a 0…1 roll', () => {
    for (const r of [0, 0.2, 0.5, 0.9, 0.999]) {
      const e = pickEmote(r);
      expect(EMOTES).toContain(e);
      expect(pickEmote(r)).toBe(e);
    }
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const e = pickEmote(i / 300);
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    expect(counts.size).toBe(EMOTES.length);
    const wave = counts.get('wave') ?? 0;
    expect(Math.max(...counts.values())).toBe(wave);
  });

  it('walks up to a bystander and they emote (deterministic per seed)', () => {
    const npc = new Npc(42, 0, 0);
    for (let i = 0; i < 120; i++) step(npc, i, { x: 400, z: 400 });
    expect(npc.emoting).toBeNull();
    let emoted = false;
    for (let i = 120; i < 720 && !emoted; i++) {
      step(npc, i, { x: 8, z: 0 });
      if (npc.emoting) emoted = true;
    }
    expect(emoted).toBe(true);
    expect(EMOTES).toContain(npc.emoting);
  });

  it('every bystander greets a nearby visitor, whatever their seed', () => {
    for (const seed of [1, 2, 3, 7, 99, 1234]) {
      const npc = new Npc(seed, 0, 0);
      let emoted = false;
      for (let i = 0; i < 300 && !emoted; i++) {
        step(npc, i, { x: 8, z: 0 });
        emoted = npc.emoting !== null;
      }
      expect(emoted, `seed ${seed}`).toBe(true);
    }
  });

  it('never emotes while fleeing the hazard', () => {
    const npc = new Npc(7, 0, 0);
    for (let i = 0; i < 300; i++) {
      npc.update(1 / 60, i / 60, 300, [], { x: 5, z: 0 }, { x: 6, z: 0 });
      expect(npc.emoting).toBeNull();
    }
  });

  it('cancels an emote when the visitor starts chatting', () => {
    const npc = new Npc(42, 0, 0);
    let emoted = false;
    for (let i = 0; i < 720 && !emoted; i++) {
      step(npc, i, { x: 8, z: 0 });
      if (npc.emoting) emoted = true;
    }
    expect(emoted).toBe(true);
    npc.faceToward(8, 0);
    expect(npc.emoting).toBeNull();
  });
});
