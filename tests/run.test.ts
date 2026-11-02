import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { BOARD, DEFAULT_TEAM, enemyTilePos, heroTilePos, makeRound, partySize, SPOTS, START_LIVES } from '../src/sim/content';
import { applyReward, completeWave, isChoiceWave, loseRound, needsRecruit, newRun, recruit, rewardOptions, type RunState } from '../src/sim/run';

function playWave(run: RunState): Battle {
  const b = new Battle({ seed: run.seed + run.wave + run.lives * 7, wave: makeRound(run.wave), team: run.team, builds: run.builds, placement: run.placement });
  while (b.outcome === 'running' && b.time < 900) b.step(STEP);
  return b;
}

describe('Run and rewards', () => {
  it('a new run starts everyone at level 1 with their starting ability', () => {
    const run = newRun(DEFAULT_TEAM, 1);
    expect(run.wave).toBe(1);
    expect(run.team).toEqual(DEFAULT_TEAM);
    expect(run.builds[2]).toEqual({ level: 1, abilities: [{ id: 'fireball', power: 0, haste: 0 }], traits: [], vitality: 0, might: 0 });
  });

  it('a reward choice every 5 waves, offering new abilities', () => {
    const run = newRun(DEFAULT_TEAM, 7);
    for (let w = 1; w <= 10; w++) {
      expect(isChoiceWave(run)).toBe(w === 5 || w === 10);
      if (isChoiceWave(run)) {
        const opts = rewardOptions(run, 0);
        expect(opts).toHaveLength(3);
        expect(opts.filter((o) => o.kind === 'ability').length).toBeGreaterThan(0);
        completeWave(run, [opts.find((o) => o.kind === 'ability')!]);
      } else {
        completeWave(run);
      }
    }
    expect(run.builds[0].abilities).toHaveLength(3);
    expect(run.builds[0].level).toBe(11);
  });

  it('Vitality and Might raise health and damage in battle', () => {
    const run = newRun(DEFAULT_TEAM, 1);
    applyReward(run.builds[2], { kind: 'vitality' });
    applyReward(run.builds[2], { kind: 'might' });
    const b = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage', builds: run.builds });
    const fresh = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage' });
    expect(b.player!.maxHp).toBe(Math.round(fresh.player!.maxHp * 1.1));
    expect(b.player!.damage).toBeCloseTo(fresh.player!.damage * 1.1);
  });

  it('options are the same for the same run and wave (no reroll by reloading)', () => {
    const run = newRun(DEFAULT_TEAM, 42);
    expect(rewardOptions(run, 2)).toEqual(rewardOptions(run, 2));
  });

  it('AI teammates pick for themselves and everyone levels up', () => {
    const run = newRun(DEFAULT_TEAM, 3);
    run.wave = 5; // a choice wave
    const picks = completeWave(run, [undefined, rewardOptions(run, 1)[0]]);
    expect(picks.filter(Boolean)).toHaveLength(3); // the rest were chosen automatically
    for (const b of run.builds) expect(b.level).toBe(2);
    expect(run.wave).toBe(6);
  });

  it('upgrades raise power and shorten cooldowns', () => {
    const run = newRun(DEFAULT_TEAM, 1);
    applyReward(run.builds[2], { kind: 'power', id: 'fireball' });
    applyReward(run.builds[2], { kind: 'haste', id: 'fireball' });
    const b = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage', builds: run.builds });
    const slot = b.player!.abilities![0];
    expect(b.abilityScale(b.player!, slot)).toBeCloseTo(1.25);
    expect(b.abilityCooldown(slot)).toBeCloseTo(4 * 0.8);
  });

  it('levels carry into battle as more health', () => {
    const run = newRun(DEFAULT_TEAM, 1);
    run.builds[0].level = 5;
    const b = new Battle({ seed: 1, wave: makeRound(1), builds: run.builds });
    const w = b.heroes.find((h) => h.kind === 'warrior')!;
    const fresh = new Battle({ seed: 1, wave: makeRound(1) }).heroes.find((h) => h.kind === 'warrior')!;
    expect(w.maxHp).toBeGreaterThan(fresh.maxHp);
  });

  it('the enemy side grows 3 -> 4 -> 5 with the party, with a boss every 10th round', () => {
    expect(makeRound(1).spawns.map((s) => s.kind)).toEqual(['grunt', 'grunt', 'grunt']);
    for (let n = 1; n <= 40; n++) {
      const r = makeRound(n);
      expect(r.spawns).toHaveLength(partySize(n));
      expect(r.name).toBeTruthy();
      expect(r.boss).toBe(n % 10 === 0);
      expect(r.spawns.filter((s) => ['warchief', 'boneKing', 'demonLord'].includes(s.kind))).toHaveLength(n % 10 === 0 ? 1 : 0);
    }
    expect(makeRound(11).spawns.every((s) => ['skeleton', 'boneArcher', 'cultist', 'ghoul', 'abomination'].includes(s.kind))).toBe(true);
    // Rounds after 20 change line-up every round and keep getting stronger.
    for (let n = 21; n < 40; n++) {
      expect(makeRound(n + 1).spawns).not.toEqual(makeRound(n).spawns);
      expect(makeRound(n + 1).strength!).toBeGreaterThan(makeRound(n).strength!);
    }
  });

  it('enemies start on their board tiles, visible before the fight', () => {
    const r = makeRound(4);
    const b = new Battle({ seed: 1, wave: r, team: DEFAULT_TEAM });
    expect(b.time).toBe(0);
    expect(b.enemies).toHaveLength(r.spawns.length);
    for (const e of b.enemies) expect(BOARD.enemyRowY).toContain(e.y);
    expect(b.enemies[1]).toMatchObject(enemyTilePos({ col: 0, row: 2 }));
  });

  it('heroes stand on their tiles; placing onto a taken tile swaps the two', () => {
    const run = newRun(DEFAULT_TEAM, 1);
    // Default layout: warrior up front, priest and mage behind.
    expect(run.placement[0].row).toBe(0);
    expect(run.placement[1].row).toBe(2);
    expect(run.placement[2].row).toBe(2);
    const b = new Battle({ seed: 1, wave: makeRound(1), team: run.team, builds: run.builds, placement: run.placement });
    const [w, p] = [0, 1].map((slot) => b.heroes.find((h) => h.slot === slot)!);
    expect(w).toMatchObject(heroTilePos(run.placement[0]));
    const priestTile = { ...p.tile! };
    const warriorTile = { ...w.tile! };
    expect(b.placeHero(0, priestTile)).toBe(true);
    expect(w.tile).toEqual(priestTile);
    expect(p.tile).toEqual(warriorTile);
    expect(b.placement[0]).toEqual(priestTile);
    b.step(STEP);
    expect(b.placeHero(0, warriorTile)).toBe(false); // no moving once the fight is on
  });

  it('after the round 10 and 20 bosses a new hero joins, at the party level', () => {
    const run = newRun(DEFAULT_TEAM, 5);
    while (run.wave <= 10) {
      expect(needsRecruit(run)).toBe(false);
      completeWave(run);
    }
    expect(needsRecruit(run)).toBe(true);
    recruit(run, 'rogue');
    expect(run.team).toHaveLength(4);
    expect(run.placement).toHaveLength(4);
    expect(new Set(run.placement.map((t) => `${t.col},${t.row}`)).size).toBe(4);
    expect(run.builds[3].level).toBe(run.builds[0].level);
    expect(run.builds[3].abilities.length).toBe(run.builds[0].abilities.length); // caught up on rewards
    while (run.wave <= 20) completeWave(run);
    expect(needsRecruit(run)).toBe(true);
    recruit(run, 'mage');
    expect(run.team).toHaveLength(5);
    expect(needsRecruit(run)).toBe(false);
  });

  it('losing a round costs a life; the run ends at zero', () => {
    const run = newRun(DEFAULT_TEAM, 1);
    expect(run.lives).toBe(START_LIVES);
    expect(loseRound(run)).toBe(true);
    expect(loseRound(run)).toBe(true);
    expect(loseRound(run)).toBe(false);
    expect(run.lives).toBe(0);
  });

  it('an AI-played run gets through the first 20 rounds (with lives to spare)', () => {
    let made = 0;
    for (const seed of [11, 12, 13, 14]) {
      const run = newRun(DEFAULT_TEAM, seed);
      while (run.wave <= 20 && run.lives > 0) {
        if (needsRecruit(run)) recruit(run, 'rogue');
        if (playWave(run).outcome === 'victory') completeWave(run);
        else loseRound(run);
      }
      if (run.wave > 20) made++;
    }
    expect(made).toBeGreaterThanOrEqual(3);
  });

  it('teams can repeat classes', () => {
    const run = newRun(['mage', 'mage', 'priest', 'warrior'], 1);
    const b = new Battle({ seed: 1, wave: makeRound(1), team: run.team, builds: run.builds });
    expect(b.heroes.map((h) => h.label).sort()).toEqual(['Mage', 'Mage 2', 'Priest', 'Warrior']);
    run.wave = 5;
    const picks = completeWave(run);
    expect(picks).toHaveLength(4);
    expect(run.builds[0].abilities.length).toBe(2);
    expect(run.builds[1].abilities.length).toBe(2);
  });
});

describe('New earnable abilities', () => {
  const grunts = (n: number) => ({ number: 1, spawns: Array.from({ length: n }, (_, i) => ({ time: 0, kind: 'grunt' as const, x: 230 + i * 30 })) });
  const setup = (cls: 'warrior' | 'priest' | 'mage' | 'rogue', id: Parameters<Battle['learnAbility']>[1], n = 2) => {
    const b = new Battle({ seed: 2, wave: grunts(n), playerClass: cls });
    b.playerAuto = false;
    b.step(STEP);
    b.learnAbility(b.player!, id);
    b.player!.resource = 100;
    b.player!.passiveCooldown = 999;
    return b;
  };

  it('Whirlwind hits all nearby enemies', () => {
    const b = setup('warrior', 'whirlwind');
    const w = b.player!;
    b.enemies.forEach((e, i) => ((e.x = w.x - 20 + i * 40), (e.y = w.y - 50)));
    expect(b.useAbility(1)).toBe('ok');
    for (const e of b.enemies) expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('Shield Block halves incoming damage', () => {
    const b = setup('warrior', 'shieldBlock');
    expect(b.useAbility(1)).toBe('ok');
    expect(b.hasEffect(b.player!, 'block')).toBe(true);
  });

  it('Power Shield absorbs damage on an ally', () => {
    const b = setup('priest', 'powerShield');
    const rogue = b.heroes.find((h) => h.kind === 'rogue')!;
    b.setFocus(rogue.id);
    expect(b.useAbility(1)).toBe('ok');
    expect(b.hasEffect(rogue, 'shield')).toBe(true);
  });

  it('Prayer of Healing heals every hurt ally', () => {
    const b = setup('priest', 'prayerOfHealing');
    for (const h of b.heroes) h.hp = h.maxHp - 50;
    expect(b.useAbility(1)).toBe('ok');
    for (const h of b.heroes) expect(h.hp).toBeGreaterThan(h.maxHp - 50);
  });

  it('Ice Lance and Eviscerate deal damage', () => {
    const m = setup('mage', 'iceLance', 1);
    m.enemies[0].y = 400;
    expect(m.useAbility(1)).toBe('ok');
    for (let i = 0; i < 0.7 / STEP; i++) m.step(STEP); // the Ice Lance is in flight
    expect(m.enemies[0].hp).toBeLessThan(m.enemies[0].maxHp);
    const r = setup('rogue', 'eviscerate', 1);
    r.enemies[0].x = r.player!.x;
    r.enemies[0].y = r.player!.y - 50;
    expect(r.useAbility(1)).toBe('ok');
    expect(r.enemies[0].hp).toBeLessThan(r.enemies[0].maxHp);
  });

  it('Blizzard creates a damaging zone on a group', () => {
    const b = setup('mage', 'blizzard', 3);
    for (const e of b.enemies) e.y = 400;
    expect(b.useAbility(1)).toBe('ok');
    expect(b.zones).toHaveLength(1);
    for (let i = 0; i < 3 / STEP; i++) b.step(STEP);
    for (const e of b.enemies) expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('Evasion dodges most attacks', () => {
    const b = setup('rogue', 'evasion');
    expect(b.useAbility(1)).toBe('ok');
    expect(b.hasEffect(b.player!, 'evasion')).toBe(true);
  });
});

describe('Formation', () => {
  it("the player's hero starts in the center; AI teammates front, left and right", () => {
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) {
      const b = new Battle({ seed: 1, wave: makeRound(1), playerClass: cls });
      expect([b.player!.x, b.player!.y]).toEqual([SPOTS.center.x, SPOTS.center.y]);
      const others = b.heroes.filter((h) => h.kind !== cls);
      expect(others).toHaveLength(3);
      const front = others.find((h) => h.y === SPOTS.front.y)!;
      expect(front.kind).toBe(cls === 'warrior' ? 'rogue' : 'warrior');
    }
  });
});

describe('Goblin Brute', () => {
  const bruteWave = { number: 1, spawns: [{ time: 0, kind: 'brute' as const, x: 270 }] };
  const setup = () => {
    const b = new Battle({ seed: 1, wave: bruteWave, playerClass: 'rogue', heroes: ['warrior', 'rogue'] });
    b.playerAuto = false;
    b.step(STEP);
    const brute = b.enemies[0];
    const w = b.heroes.find((h) => h.kind === 'warrior')!;
    brute.x = w.x;
    brute.y = w.y - 50;
    for (let i = 0; i < 20 && !brute.casting; i++) b.step(STEP);
    return { b, brute, w };
  };

  it('winds up a telegraphed Smash that hits hard', () => {
    const { b, brute, w } = setup();
    expect(brute.casting?.spell).toBe('Smash');
    const before = w.hp;
    for (let i = 0; i < 2 / STEP; i++) b.step(STEP);
    expect(before - w.hp).toBeGreaterThanOrEqual(40);
  });

  it('Smash can be interrupted', () => {
    const { b, brute } = setup();
    b.learnAbility(b.player!, 'kick');
    expect(b.useAbility(1)).toBe('ok');
    expect(brute.casting).toBeUndefined();
  });
});
