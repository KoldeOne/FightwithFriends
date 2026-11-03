import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { GEAR_BONUS, makeRound } from '../src/sim/content';
import { bankLoot, resetUpgrades, canAfford, gearCost, loadCamp, lootFor, newCamp, saveCamp, startLevel, upgradeDrills, upgradeGear, withGear } from '../src/sim/camp';
import { autoResolve, availableNodes, encounterFor, enterNode, finishFight, newRun, recruit } from '../src/sim/run';
import type { HeroClass } from '../src/sim/types';
import { playRun } from '../scripts/simlib';
import { settleFight } from '../src/sim/settle';

const TRIO: HeroClass[] = ['warrior', 'priest', 'mage'];

/** A tiny in-memory localStorage for the save tests. */
function fakeStorage(): void {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('The camp (between map runs)', () => {
  it('Drills start a run, and every recruit, at a higher level; XP adds on top', () => {
    const camp = newCamp();
    camp.drills = 2;
    const run = newRun('warrior', undefined, 5, startLevel(camp));
    expect(run.builds[0].level).toBe(3);
    // Walk to the first recruit campsite, winning fights on the way.
    for (let i = 0; i < 40 && run.team.length < 2; i++) {
      if (run.pending?.kind === 'recruit') recruit(run, 'priest');
      else if (run.pending) autoResolve(run);
      else if (run.status === 'fight') finishFight(run, true, [], encounterFor(run).spawns.map((s) => ({ kind: s.kind })));
      else enterNode(run, availableNodes(run)[0].id);
    }
    expect(run.builds[1].level).toBe(3);
    expect(run.builds[0].level).toBe(3 + Math.floor(run.xp[0] / 10));
  });

  it('gear raises damage, health and cooldown speed in battle', () => {
    const camp = newCamp();
    const builds = TRIO.map(() => ({ level: 1, abilities: [], traits: [] }));
    const plain = new Battle({ seed: 1, wave: makeRound(1), team: TRIO, builds: withGear(TRIO, builds, camp) }).heroes.find((h) => h.kind === 'mage')!;
    camp.gear.mage = { weapon: 3, armor: 2, trinket: 5 };
    const geared = new Battle({ seed: 1, wave: makeRound(1), team: TRIO, builds: withGear(TRIO, builds, camp) }).heroes.find((h) => h.kind === 'mage')!;
    expect(geared.damage).toBeCloseTo(plain.damage * (1 + 3 * GEAR_BONUS.weapon));
    // (Within rounding: the Priest's Fortitude aura is applied on top.)
    expect(Math.abs(geared.maxHp - plain.maxHp * (1 + 2 * GEAR_BONUS.armor))).toBeLessThanOrEqual(2);
    expect(geared.cooldownRate).toBeCloseTo(1 + 5 * GEAR_BONUS.trinketCooldown);
    expect(geared.focus!).toBeGreaterThan(plain.focus!);
  });

  it('loot: bosses drop a Trophy, later acts pay more, raised minions drop nothing', () => {
    const boss = lootFor([{ kind: 'warchief', summoned: false }], 1, 1);
    expect(boss.trophies).toBe(1);
    expect(boss.ore + boss.hide + boss.gems).toBe(3);
    const early = lootFor([{ kind: 'grunt', summoned: false }], 1, 1);
    const late = lootFor([{ kind: 'imp', summoned: false }], 3, 1);
    expect(late.spoils).toBe(early.spoils * 3);
    expect(lootFor([{ kind: 'skeleton', summoned: true }], 2, 1).spoils).toBe(0);
  });

  it('a battle records every enemy it kills', () => {
    const b = new Battle({ seed: 3, wave: makeRound(1), team: TRIO });
    while (b.outcome === 'running' && b.time < 300) b.step(STEP);
    expect(b.outcome).toBe('victory');
    expect(b.kills.map((k) => k.kind)).toEqual(['grunt', 'grunt', 'grunt']);
  });

  it('the damage meter splits each hero\'s damage and healing by source, auto-attacks included', () => {
    const b = new Battle({ seed: 3, wave: makeRound(5), team: TRIO, builds: [
      { level: 3, abilities: [{ id: 'heroicStrike', power: 0, haste: 0, mastery: false }], traits: [] },
      { level: 3, abilities: [{ id: 'heal', power: 0, haste: 0, mastery: false }], traits: [] },
      { level: 3, abilities: [{ id: 'fireball', power: 0, haste: 0, mastery: false }], traits: [] },
    ] });
    while (b.outcome === 'running' && b.time < 300) b.step(STEP);
    const by = (cls: string) => b.meter.get(b.units.find((u) => u.kind === cls)!.id)!;
    expect(by('warrior').damage['auto']).toBeGreaterThan(0);
    expect(by('warrior').damage['heroicStrike']).toBeGreaterThan(0);
    expect(Object.keys(by('mage').damage).some((k) => k.startsWith('fireball'))).toBe(true);
    expect(Object.values(by('priest').healing).reduce((a, v) => a + v, 0)).toBeGreaterThan(0);
  });

  it('settling fights adds up each hero\'s damage and healing for the whole run', () => {
    const run = newRun('warrior', undefined, 5);
    enterNode(run, availableNodes(run)[0].id);
    settleFight(run, undefined, { won: true, fallen: [], kills: [], meter: [{ slot: 0, damage: { auto: 10, heroicStrike: 5 }, healing: {} }] });
    enterNode(run, availableNodes(run)[0].id);
    if (run.status === 'fight') settleFight(run, undefined, { won: true, fallen: [], kills: [], meter: [{ slot: 0, damage: { auto: 7 }, healing: { other: 3 } }] });
    expect(run.meter?.[0].damage.auto).toBeGreaterThanOrEqual(10);
    expect(run.meter?.[0].damage.heroicStrike).toBe(5);
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

  it('resetting the camp gives back everything the upgrades cost', () => {
    const camp = newCamp();
    camp.loot = { spoils: 1000, ore: 50, hide: 50, gems: 50, trophies: 3 };
    const before = { ...camp.loot };
    upgradeGear(camp, 'mage', 'weapon');
    upgradeGear(camp, 'mage', 'weapon');
    upgradeGear(camp, 'warrior', 'armor');
    upgradeDrills(camp);
    expect(camp.loot).not.toEqual(before);
    resetUpgrades(camp);
    expect(camp.loot).toEqual(before);
    expect(camp.gear.mage.weapon).toBe(0);
    expect(camp.drills).toBe(0);
  });

  it('loot is banked at the camp; old Camp Mode saves keep their loot, gear and Drills', () => {
    fakeStorage();
    const camp = newCamp();
    bankLoot(camp, { spoils: 5, ore: 1, hide: 0, gems: 0, trophies: 1 });
    expect(camp.loot.spoils).toBe(5);
    saveCamp(camp);
    expect(loadCamp().loot.trophies).toBe(1);
    const old = { version: 1, loot: { spoils: 99, ore: 2, hide: 3, gems: 4, trophies: 1 }, gear: { ...newCamp().gear, mage: { weapon: 2, armor: 0, trinket: 1 } }, drills: 1, unlocked: [1, 11], best: 14, runs: 6, wins: 0 };
    localStorage.setItem('fightwithfriends.camp.v1', JSON.stringify(old));
    const loaded = loadCamp();
    expect(loaded.version).toBe(2);
    expect(loaded.loot.spoils).toBe(99);
    expect(loaded.gear.mage.weapon).toBe(2);
    expect(loaded.drills).toBe(1);
  });

  it('a map run with a camp banks loot from its fights and uses the gear', () => {
    const camp = newCamp();
    const rec = playRun('warrior', 77, 'ai', camp);
    expect(rec.rounds.length).toBeGreaterThan(0);
    expect(camp.loot.spoils).toBeGreaterThan(0);
    // A fully geared guild does at least as well on the same seed.
    const rich = newCamp();
    for (const cls of Object.keys(rich.gear) as HeroClass[]) rich.gear[cls] = { weapon: 10, armor: 10, trinket: 10 };
    rich.drills = 5;
    const geared = playRun('warrior', 77, 'ai', rich);
    const pos = (r: typeof rec) => (r.won ? 999 : r.reached);
    expect(pos(geared)).toBeGreaterThanOrEqual(pos(rec));
  });
});
