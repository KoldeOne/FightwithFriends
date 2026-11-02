import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { CAMP, campRound, makeRound } from '../src/sim/content';
import { bankRound, campRunOver, canAfford, gearCost, lootFor, newCamp, newCampRun, upgradeDrills, upgradeGear, withGear } from '../src/sim/camp';
import type { HeroClass } from '../src/sim/types';

const TRIO: HeroClass[] = ['warrior', 'priest', 'mage'];

describe('Camp Mode', () => {
  it('a run from round 1 starts at level 1 with one life', () => {
    const run = newCampRun(TRIO, 1, newCamp(), 5);
    expect(run.mode).toBe('camp');
    expect(run.lives).toBe(1);
    expect(run.wave).toBe(1);
    expect(run.builds.map((b) => b.level)).toEqual([1, 1, 1]);
  });

  it('starting at round 11 begins at that level, with rewards picked so far and Drills on top', () => {
    const camp = newCamp();
    camp.drills = 2;
    const run = newCampRun([...TRIO, 'rogue'], 11, camp, 5);
    expect(run.wave).toBe(11);
    expect(run.startRound).toBe(11);
    expect(run.builds.every((b) => b.level === 13)).toBe(true);
    // Rewards after rounds 5 and 10: two more abilities each.
    expect(run.builds[0].abilities.length + run.builds[0].traits.length).toBe(3);
  });

  it('camp rounds are the Arena line-ups with tougher enemies', () => {
    expect(campRound(7).spawns).toEqual(makeRound(7).spawns);
    expect(campRound(7).strength).toBeCloseTo(makeRound(7).strength! * CAMP.difficulty);
  });

  it('gear raises damage, health and cooldown speed in battle', () => {
    const camp = newCamp();
    const run = newCampRun(TRIO, 1, camp, 1);
    const plain = new Battle({ seed: 1, wave: campRound(1), team: run.team, builds: withGear(run, camp) }).heroes.find((h) => h.kind === 'mage')!;
    camp.gear.mage = { weapon: 3, armor: 2, trinket: 5 };
    const geared = new Battle({ seed: 1, wave: campRound(1), team: run.team, builds: withGear(run, camp) }).heroes.find((h) => h.kind === 'mage')!;
    expect(geared.damage).toBeCloseTo(plain.damage * 1.24);
    // (Within rounding: the Priest's Fortitude aura is applied on top.)
    expect(Math.abs(geared.maxHp - plain.maxHp * 1.16)).toBeLessThanOrEqual(2);
    expect(geared.cooldownRate).toBeCloseTo(1.2);
    expect(geared.focus!).toBeGreaterThan(plain.focus!);
  });

  it('loot: bosses drop a Trophy, later camps pay more, raised minions drop nothing', () => {
    const boss = lootFor([{ kind: 'warchief', summoned: false }], 10, 1);
    expect(boss.trophies).toBe(1);
    expect(boss.ore + boss.hide + boss.gems).toBe(3);
    const early = lootFor([{ kind: 'grunt', summoned: false }], 3, 1);
    const late = lootFor([{ kind: 'imp', summoned: false }], 23, 1);
    expect(late.spoils).toBe(early.spoils * 3);
    expect(lootFor([{ kind: 'skeleton', summoned: true }], 20, 1).spoils).toBe(0);
  });

  it('a battle records every enemy it kills', () => {
    const b = new Battle({ seed: 3, wave: makeRound(1), team: TRIO });
    while (b.outcome === 'running' && b.time < 300) b.step(STEP);
    expect(b.outcome).toBe('victory');
    expect(b.kills.map((k) => k.kind)).toEqual(['grunt', 'grunt', 'grunt']);
  });

  it('upgrades cost loot, can be refused, and every 5th gear level takes a Trophy', () => {
    const camp = newCamp();
    expect(upgradeGear(camp, 'warrior', 'weapon')).toBe(false);
    camp.loot = { spoils: 1000, ore: 50, hide: 0, gems: 0, trophies: 0 };
    for (let i = 0; i < 4; i++) expect(upgradeGear(camp, 'warrior', 'weapon')).toBe(true);
    expect(camp.gear.warrior.weapon).toBe(4);
    expect(gearCost('weapon', 4)!.trophies).toBe(1);
    expect(upgradeGear(camp, 'warrior', 'weapon')).toBe(false);
    expect(upgradeGear(camp, 'warrior', 'armor')).toBe(false); // no Hide
    expect(upgradeDrills(camp)).toBe(false); // needs a Trophy
    camp.loot.trophies = 1;
    expect(canAfford(camp.loot, gearCost('weapon', 4))).toBe(true);
    expect(upgradeGear(camp, 'warrior', 'weapon')).toBe(true);
    expect(camp.loot.trophies).toBe(0);
    expect(camp.loot.spoils).toBe(1000 - (13 + 32 + 57 + 88 + 125));
  });

  it('loot is banked every round; beating a boss opens the next camp; any defeat ends the run', () => {
    const camp = newCamp();
    const run = newCampRun(TRIO, 1, camp, 1);
    run.wave = 10;
    bankRound(camp, run, { spoils: 5, ore: 1, hide: 0, gems: 0, trophies: 1 }, true);
    expect(camp.unlocked).toEqual([1, 11]);
    expect(camp.loot.spoils).toBe(5);
    expect(run.loot!.trophies).toBe(1);
    expect(camp.best).toBe(10);
    expect(campRunOver(run, true)).toBe(false);
    expect(campRunOver(run, false)).toBe(true);
    run.wave = CAMP.finalRound;
    bankRound(camp, run, { spoils: 0, ore: 0, hide: 0, gems: 0, trophies: 0 }, true);
    expect(campRunOver(run, true)).toBe(true);
    expect(camp.wins).toBe(1);
  });
});
