import { describe, expect, it } from 'vitest';
import { playRun } from '../scripts/simlib';

/**
 * Bug sweep: whole map runs with the game's own rules (Auto's choices, and
 * random ones) must never break the simulation's invariants (health in range,
 * units inside the arena, no NaN, no fight that never ends).
 */
describe('full-run sweep', () => {
  for (const [cls, policy] of [['warrior', 'ai'], ['priest', 'ai'], ['rogue', 'random']] as const) {
    it(`a ${cls} run (${policy} choices) never breaks invariants`, () => {
      const rec = playRun(cls, 4242, policy);
      expect(rec.violations).toEqual([]);
      expect(rec.rounds.length).toBeGreaterThan(0);
      expect(rec.path[0]).toBe('fight');
    });
  }
});
