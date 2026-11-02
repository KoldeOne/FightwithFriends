import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { makeWave, RUN_WAVES } from '../src/sim/content';
import { applyReward, autoChoose, completeWave, newRun, rewardOptions, type RunState } from '../src/sim/run';

function playWave(run: RunState): Battle {
  const b = new Battle({ seed: run.seed + run.wave, wave: makeWave(run.wave), playerClass: run.playerClass, builds: run.builds });
  while (b.outcome === 'running' && b.time < 900) b.step(STEP);
  return b;
}

describe('Run and rewards', () => {
  it('a new run starts everyone at level 1 with their starting ability', () => {
    const run = newRun('mage', 1);
    expect(run.wave).toBe(1);
    expect(run.builds.mage).toEqual({ level: 1, abilities: [{ id: 'fireball', power: 0, haste: 0 }], traits: [] });
  });

  it('offers 3 options, at least one new while slots are free', () => {
    const run = newRun('warrior', 7);
    for (let w = 1; w <= 4; w++) {
      const opts = rewardOptions(run, 'warrior');
      expect(opts).toHaveLength(3);
      expect(opts.some((o) => o.kind === 'ability' || o.kind === 'trait')).toBe(true);
      expect(new Set(opts.map((o) => `${o.kind}:${o.id}`)).size).toBe(3);
      completeWave(run, opts.find((o) => o.kind === 'ability' || o.kind === 'trait')!);
    }
    const b = run.builds.warrior;
    expect(b.abilities.length + b.traits.length).toBe(5);
    expect(b.level).toBe(5);
    // Slots full: only upgrades now.
    expect(rewardOptions(run, 'warrior').every((o) => o.kind === 'power' || o.kind === 'haste')).toBe(true);
  });

  it('options are the same for the same run and wave (no reroll by reloading)', () => {
    const run = newRun('rogue', 42);
    expect(rewardOptions(run, 'rogue')).toEqual(rewardOptions(run, 'rogue'));
  });

  it('AI teammates pick for themselves and everyone levels up', () => {
    const run = newRun('priest', 3);
    const picks = completeWave(run, rewardOptions(run, 'priest')[0]);
    expect(Object.keys(picks).sort()).toEqual(['mage', 'rogue', 'warrior']);
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) expect(run.builds[cls].level).toBe(2);
    expect(run.wave).toBe(2);
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
    expect(makeWave(6).spawns.some((s) => s.time > 10)).toBe(true);
    expect(makeWave(10).spawns.length).toBeGreaterThan(makeWave(1).spawns.length);
  });

  it('a full AI-played run can be completed', () => {
    let finished = 0;
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) {
      const run = newRun(cls, 11);
      while (run.wave <= RUN_WAVES) {
        const b = playWave(run);
        if (b.outcome !== 'victory') break;
        completeWave(run, autoChoose(cls, rewardOptions(run, cls)));
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
