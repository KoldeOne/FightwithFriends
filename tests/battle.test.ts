import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { WAVE_1 } from '../src/sim/content';

function runToEnd(battle: Battle, maxSeconds = 600): void {
  const steps = Math.ceil(maxSeconds / STEP);
  for (let i = 0; i < steps && battle.outcome === 'running'; i++) battle.step(STEP);
}

describe('Battle', () => {
  it('a full party wins wave 1', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const battle = new Battle({ seed, wave: WAVE_1 });
      runToEnd(battle);
      expect(battle.outcome).toBe('victory');
      expect(battle.gate.hp).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = new Battle({ seed: 7, wave: WAVE_1 });
    const b = new Battle({ seed: 7, wave: WAVE_1 });
    runToEnd(a);
    runToEnd(b);
    expect(a.time).toBe(b.time);
    expect(a.gate.hp).toBe(b.gate.hp);
    expect(a.heroes.map((h) => h.hp)).toEqual(b.heroes.map((h) => h.hp));
  });

  it('with no heroes, enemies break the gate', () => {
    const battle = new Battle({ seed: 1, wave: WAVE_1, heroes: [] });
    runToEnd(battle);
    expect(battle.outcome).toBe('defeat');
    expect(battle.gate.hp).toBe(0);
  });

  it('heroes hold their positions', () => {
    const battle = new Battle({ seed: 3, wave: WAVE_1 });
    const start = battle.heroes.map((h) => [h.x, h.y]);
    runToEnd(battle);
    expect(battle.heroes.map((h) => [h.x, h.y])).toEqual(start);
  });
});
