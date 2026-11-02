import { describe, expect, it } from 'vitest';
import { playRun, sensibleRecruit } from '../scripts/simlib';

/**
 * Bug sweep: whole runs with the game's own rules must never break the
 * simulation's invariants (health in range, units inside the arena, no NaN,
 * no fight that never ends).
 */
describe('full-run sweep', () => {
  const recruitPolicy = sensibleRecruit('warrior', 'priest', ['mage', 'rogue']);
  const teams = [
    ['warrior', 'priest', 'mage'],
    ['rogue', 'rogue', 'priest'],
    ['mage', 'mage', 'mage'],
  ] as const;
  for (const team of teams) {
    it(`${team.join('+')} plays 25 rounds without breaking invariants`, () => {
      const rec = playRun([...team], 4242, recruitPolicy, 25);
      expect(rec.violations).toEqual([]);
      expect(rec.rounds.length).toBeGreaterThan(0);
    });
  }
});
