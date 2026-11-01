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

describe('Aggro', () => {
  const tinyWave = { number: 1, spawns: [{ time: 0, kind: 'grunt' as const, x: 270 }] };

  function stepUntil(b: Battle, pred: () => boolean, maxSeconds = 120): void {
    for (let i = 0; i < maxSeconds / STEP && !pred() && b.outcome === 'running'; i++) b.step(STEP);
  }

  it('damage builds threat on the enemy', () => {
    const b = new Battle({ seed: 1, wave: tinyWave });
    stepUntil(b, () => b.enemies.some((e) => Object.keys(e.threat ?? {}).length > 0));
    const e = b.enemies[0];
    expect(b.topThreat(e).value).toBeGreaterThan(0);
  });

  it('an enemy attacks the hero with the most threat', () => {
    const b = new Battle({ seed: 1, wave: tinyWave, heroes: ['rogue', 'mage'] });
    b.step(STEP);
    const e = b.enemies[0];
    const mage = b.heroes.find((h) => h.kind === 'mage')!;
    e.threat = { [mage.id]: 500 };
    b.step(STEP);
    expect(e.targetId).toBe(mage.id);
  });

  it('needs more than 110% threat to steal aggro', () => {
    const b = new Battle({ seed: 1, wave: tinyWave, heroes: ['rogue', 'mage'] });
    b.step(STEP);
    const e = b.enemies[0];
    const [rogue, mage] = [b.heroes.find((h) => h.kind === 'rogue')!, b.heroes.find((h) => h.kind === 'mage')!];
    e.threat = { [rogue.id]: 100, [mage.id]: 0 };
    b.step(STEP);
    expect(e.targetId).toBe(rogue.id);
    e.threat = { [rogue.id]: 100, [mage.id]: 105 };
    b.step(STEP);
    expect(e.targetId).toBe(rogue.id); // 105% is not enough
    e.threat = { [rogue.id]: 100, [mage.id]: 120 };
    b.step(STEP);
    expect(e.targetId).toBe(mage.id);
  });

  it('the warrior taunts an enemy off another hero', () => {
    const b = new Battle({ seed: 1, wave: tinyWave });
    b.step(STEP);
    const e = b.enemies[0];
    const mage = b.heroes.find((h) => h.kind === 'mage')!;
    const warrior = b.heroes.find((h) => h.kind === 'warrior')!;
    e.y = 520; // well within taunt range
    e.threat = { [mage.id]: 1000 };
    stepUntil(b, () => e.targetId === warrior.id, 2);
    expect(e.targetId).toBe(warrior.id);
    expect(b.aggroLevel(warrior.id)).toBe('aggro');
  });

  it('shows warning when close to pulling aggro', () => {
    const b = new Battle({ seed: 1, wave: tinyWave });
    b.step(STEP);
    const e = b.enemies[0];
    const mage = b.heroes.find((h) => h.kind === 'mage')!;
    const warrior = b.heroes.find((h) => h.kind === 'warrior')!;
    e.threat = { [warrior.id]: 100, [mage.id]: 85 };
    e.targetId = warrior.id;
    expect(b.aggroLevel(mage.id)).toBe('warning');
    e.threat = { [warrior.id]: 100, [mage.id]: 50 };
    expect(b.aggroLevel(mage.id)).toBe('none');
  });

  it('careful AI keeps damage dealers from pulling melee enemies off the tank', () => {
    const dpsPulls = (carefulAI: boolean): number => {
      let pulls = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const b = new Battle({ seed, wave: WAVE_1, carefulAI });
        const last = new Map<number, number | null>();
        while (b.outcome === 'running' && b.time < 600) {
          b.step(STEP);
          for (const e of b.enemies) {
            const prev = last.get(e.id);
            const was = prev != null && prev >= 0 ? b.unit(prev) : undefined;
            const now = e.targetId != null && e.targetId >= 0 ? b.unit(e.targetId) : undefined;
            if (e.kind === 'grunt' && was?.isTank && (now?.kind === 'mage' || now?.kind === 'rogue')) pulls++;
            last.set(e.id, e.targetId);
          }
        }
      }
      return pulls;
    };
    expect(dpsPulls(true)).toBe(0);
    expect(dpsPulls(false)).toBeGreaterThan(0);
  });
});
