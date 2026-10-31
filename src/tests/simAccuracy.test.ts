import { beforeAll, describe, expect, it } from 'vitest';
import { Npc } from '../sim/npc';
import { hurricaneWind } from '../sim/packs/hurricane';

// jsdom has no canvas 2D — stub it so the NPC emote bubbles stay quiet.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

describe('hurricane wind field', () => {
  it('rotates counter-clockwise seen from above (Northern Hemisphere)', () => {
    // East of the eye (+x) the wind blows toward -z, i.e. "north" on screen.
    const east = hurricaneWind(60, 0, 50, 0, 0);
    expect(east.z).toBeLessThan(0);
    // North of the eye (-z) it blows west (-x).
    const north = hurricaneWind(0, -60, 50, 0, 0);
    expect(north.x).toBeLessThan(0);
  });

  it('has a calm eye, peaks at the eyewall and spirals inward', () => {
    const speed = (r: number) => Math.hypot(hurricaneWind(r, 0, 50, 0, 0).x, hurricaneWind(r, 0, 50, 0, 0).z);
    expect(speed(4)).toBeLessThan(speed(38) * 0.2);
    expect(speed(38)).toBeGreaterThan(speed(120));
    expect(speed(38)).toBeGreaterThan(speed(15));
    expect(hurricaneWind(80, 0, 50, 0, 0).x).toBeLessThan(0); // inflow toward the eye
  });

  it('blows hardest right of the track (storm motion adds there)', () => {
    // Heading +x (east), the right-hand side is +z (south on screen) — where the
    // counter-clockwise flow runs the same way the storm is moving.
    const right = hurricaneWind(0, 40, 50, 6, 0);
    const left = hurricaneWind(0, -40, 50, 6, 0);
    expect(Math.hypot(right.x, right.z)).toBeGreaterThan(Math.hypot(left.x, left.z));
  });
});

describe('bystander behavior', () => {
  const step = (npc: Npc, i: number, threat: { x: number; z: number }, others?: Npc[]) =>
    npc.update(1 / 60, i / 60, 300, [], threat, undefined, others);

  it('flees with hysteresis: keeps running until well clear of the hazard', () => {
    const npc = new Npc(5, 0, 0);
    step(npc, 0, { x: 100, z: 0 });
    expect(npc.isFleeing).toBe(true);
    let i = 1;
    // Still fleeing just outside the trigger radius…
    while (Math.hypot(npc.group.position.x - 100, npc.group.position.z) < 120 && i < 2000) step(npc, i++, { x: 100, z: 0 });
    expect(npc.isFleeing).toBe(true);
    // …and calmer once far away.
    while (Math.hypot(npc.group.position.x - 100, npc.group.position.z) < 150 && i < 4000) step(npc, i++, { x: 100, z: 0 });
    step(npc, i, { x: 100, z: 0 });
    expect(npc.isFleeing).toBe(false);
  });

  it('runs away from the hazard rather than toward it', () => {
    const npc = new Npc(9, 0, 0);
    for (let i = 0; i < 240; i++) step(npc, i, { x: 40, z: 0 });
    expect(npc.group.position.x).toBeLessThan(-10);
  });

  it('keeps personal space instead of walking through other bystanders', () => {
    const a = new Npc(11, 0, 0);
    const b = new Npc(12, 1, 0);
    const crowd = [a, b];
    for (let i = 0; i < 120; i++) {
      step(a, i, { x: 999, z: 999 }, crowd);
      step(b, i, { x: 999, z: 999 }, crowd);
    }
    const d = Math.hypot(a.group.position.x - b.group.position.x, a.group.position.z - b.group.position.z);
    expect(d).toBeGreaterThan(2.5);
  });
});
