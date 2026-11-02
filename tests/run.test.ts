import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { makeWave, RUN_WAVES } from '../src/sim/content';
import { applyReward, autoChoose, completeWave, isChoiceWave, newRun, rewardOptions, type RunState } from '../src/sim/run';

function playWave(run: RunState): Battle {
  const b = new Battle({ seed: run.seed + run.wave, wave: makeWave(run.wave), playerClass: run.playerClass, builds: run.builds });
  while (b.outcome === 'running' && b.time < 900) b.step(STEP);
  return b;
}

describe('Run and rewards', () => {
  it('a new run starts everyone at level 1 with their starting ability', () => {
    const run = newRun('mage', 1);
    expect(run.wave).toBe(1);
    expect(run.builds.mage).toEqual({ level: 1, abilities: [{ id: 'fireball', power: 0, haste: 0 }], traits: [], vitality: 0, might: 0 });
  });

  it('choices only after waves 2, 4, 6, 8; new abilities after 4 and 8', () => {
    const run = newRun('warrior', 7);
    const key = (o: { kind: string; id?: string }) => `${o.kind}:${o.id ?? ''}`;
    for (let w = 1; w <= 10; w++) {
      expect(isChoiceWave(run)).toBe([2, 4, 6, 8].includes(w));
      if (isChoiceWave(run)) {
        const opts = rewardOptions(run, 'warrior');
        expect(opts).toHaveLength(3);
        expect(new Set(opts.map(key)).size).toBe(3);
        const newOnes = opts.filter((o) => o.kind === 'ability');
        expect(newOnes.length > 0).toBe(w === 4 || w === 8);
        completeWave(run, newOnes[0] ?? opts[0]);
      } else {
        completeWave(run, null);
      }
    }
    const b = run.builds.warrior;
    expect(b.abilities.map((a) => a.id).filter((id) => id !== 'heroicStrike')).toHaveLength(2);
    expect(b.level).toBe(11);
  });

  it('Vitality and Might raise health and damage in battle', () => {
    const run = newRun('mage', 1);
    applyReward(run.builds.mage, { kind: 'vitality' });
    applyReward(run.builds.mage, { kind: 'might' });
    const b = new Battle({ seed: 1, wave: makeWave(1), playerClass: 'mage', builds: run.builds });
    const fresh = new Battle({ seed: 1, wave: makeWave(1), playerClass: 'mage' });
    expect(b.player!.maxHp).toBe(Math.round(fresh.player!.maxHp * 1.1));
    expect(b.player!.damage).toBeCloseTo(fresh.player!.damage * 1.1);
  });

  it('options are the same for the same run and wave (no reroll by reloading)', () => {
    const run = newRun('rogue', 42);
    expect(rewardOptions(run, 'rogue')).toEqual(rewardOptions(run, 'rogue'));
  });

  it('AI teammates pick for themselves and everyone levels up', () => {
    const run = newRun('priest', 3);
    run.wave = 2; // a choice wave
    const picks = completeWave(run, rewardOptions(run, 'priest')[0]);
    expect(Object.keys(picks).sort()).toEqual(['mage', 'rogue', 'warrior']);
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) expect(run.builds[cls].level).toBe(2);
    expect(run.wave).toBe(3);
  });

  it('upgrades raise power and shorten cooldowns', () => {
    const run = newRun('mage', 1);
    applyReward(run.builds.mage, { kind: 'power', id: 'fireball' });
    applyReward(run.builds.mage, { kind: 'haste', id: 'fireball' });
    const b = new Battle({ seed: 1, wave: makeWave(1), playerClass: 'mage', builds: run.builds });
    const slot = b.player!.abilities![0];
    expect(b.abilityScale(b.player!, slot)).toBeCloseTo(1.25);
    expect(b.abilityCooldown(slot)).toBeCloseTo(4 * 0.8);
  });

  it('levels carry into battle as more health', () => {
    const run = newRun('warrior', 1);
    run.builds.warrior.level = 5;
    const b = new Battle({ seed: 1, wave: makeWave(1), builds: run.builds });
    const w = b.heroes.find((h) => h.kind === 'warrior')!;
    const fresh = new Battle({ seed: 1, wave: makeWave(1) }).heroes.find((h) => h.kind === 'warrior')!;
    expect(w.maxHp).toBeGreaterThan(fresh.maxHp);
  });

  it('waves get bigger, casters arrive from wave 3, reinforcements from wave 6', () => {
    expect(makeWave(1).spawns.length).toBe(3);
    expect(makeWave(2).spawns.some((s) => s.kind === 'shaman')).toBe(false);
    expect(makeWave(3).spawns.some((s) => s.kind === 'shaman')).toBe(true);
    expect(makeWave(4).spawns.some((s) => s.y !== undefined)).toBe(true); // flank
    expect(makeWave(5).spawns.some((s) => s.kind === 'brute')).toBe(true); // elite
    expect(makeWave(6).spawns.some((s) => s.time > 10)).toBe(true);
    expect(makeWave(10).spawns.length).toBeGreaterThan(makeWave(1).spawns.length);
    for (let n = 1; n <= 10; n++) expect(makeWave(n).name).toBeTruthy();
  });

  it('a full AI-played run can be completed', () => {
    let finished = 0;
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) {
      const run = newRun(cls, 11);
      while (run.wave <= RUN_WAVES) {
        const b = playWave(run);
        if (b.outcome !== 'victory') break;
        completeWave(run, isChoiceWave(run) ? autoChoose(cls, rewardOptions(run, cls)) : null);
      }
      if (run.wave > RUN_WAVES) finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(3);
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
      const b = new Battle({ seed: 1, wave: makeWave(1), playerClass: cls });
      expect([b.player!.x, b.player!.y]).toEqual([270, 630]);
      const others = b.heroes.filter((h) => h.kind !== cls);
      expect(others).toHaveLength(3);
      const front = others.find((h) => h.y === 552)!;
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
