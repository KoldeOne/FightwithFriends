import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { HERO_MOVE, makeRound, ROUND_1 } from '../src/sim/content';
import type { EnemyKind, HeroClass } from '../src/sim/types';

function runToEnd(battle: Battle, maxSeconds = 600): void {
  const steps = Math.ceil(maxSeconds / STEP);
  for (let i = 0; i < steps && battle.outcome === 'running'; i++) battle.step(STEP);
}

describe('Battle', () => {
  it('a full party wins round 1', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const battle = new Battle({ seed, wave: ROUND_1 });
      runToEnd(battle);
      expect(battle.outcome).toBe('victory');
      expect(battle.heroes.some((h) => h.alive)).toBe(true);
    }
  });

  it('pushes never shove a hero off the arena', () => {
    // Two teammates crowding each other against the left wall.
    const battle = new Battle({ seed: 3, wave: ROUND_1, heroes: ['mage', 'mage'] });
    const [a, b] = battle.heroes;
    a.x = a.radius;
    b.x = a.x + 4;
    a.y = b.y = 600;
    for (let i = 0; i < 40; i++) {
      battle.step(STEP);
      for (const h of battle.heroes) expect(h.x).toBeGreaterThanOrEqual(h.radius - 1e-9);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = new Battle({ seed: 7, wave: ROUND_1 });
    const b = new Battle({ seed: 7, wave: ROUND_1 });
    runToEnd(a);
    runToEnd(b);
    expect(a.time).toBe(b.time);
    expect(a.heroes.map((h) => h.hp)).toEqual(b.heroes.map((h) => h.hp));
  });

  it('with no heroes, the round is lost', () => {
    const battle = new Battle({ seed: 1, wave: ROUND_1, heroes: [] });
    runToEnd(battle);
    expect(battle.outcome).toBe('defeat');
  });

  it('the round is lost when every hero is down', () => {
    const battle = new Battle({ seed: 1, wave: ROUND_1, heroes: ['mage'] });
    battle.heroes[0].hp = 1;
    runToEnd(battle);
    expect(battle.outcome).toBe('defeat');
    expect(battle.enemies.some((e) => e.alive)).toBe(true);
  });

  it('sudden death: hits land harder after a minute, so fights always end', () => {
    const battle = new Battle({ seed: 1, wave: ROUND_1 });
    expect(battle.damageRamp).toBe(1);
    battle.time = 80;
    expect(battle.damageRamp).toBeCloseTo(2);
  });

  it("your hero never moves; AI teammates stay close to the party", () => {
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) {
      const battle = new Battle({ seed: 3, wave: makeRound(6), playerClass: cls });
      const p = battle.player!;
      const start = [p.x, p.y];
      let maxFromPlayer = 0;
      let moved = 0;
      while (battle.outcome === 'running' && battle.time < 600) {
        battle.step(STEP);
        for (const h of battle.heroes) {
          if (h.id === p.id || !h.alive) continue;
          maxFromPlayer = Math.max(maxFromPlayer, Math.hypot(h.x - p.x, h.y - p.y));
          moved = Math.max(moved, Math.hypot(h.x - h.homeX!, h.y - h.homeY!));
        }
      }
      expect([p.x, p.y]).toEqual(start);
      expect(maxFromPlayer).toBeLessThanOrEqual(HERO_MOVE.leash + 40);
      expect(moved).toBeGreaterThan(10); // teammates do actually move
    }
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
    const b = new Battle({ seed: 1, wave: tinyWave, heroes: ['priest', 'mage'] });
    b.step(STEP);
    const e = b.enemies[0];
    // (the priest stands in for "the current target" here)
    const [rogue, mage] = [b.heroes.find((h) => h.kind === 'priest')!, b.heroes.find((h) => h.kind === 'mage')!];
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
        const b = new Battle({ seed, wave: ROUND_1, carefulAI });
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
    // In the arena the enemies start within the mage's range, so a shot or burn
    // already in flight can occasionally tip an enemy over; careful AI keeps it rare.
    const careful = dpsPulls(true);
    expect(careful).toBeLessThanOrEqual(1);
    expect(dpsPulls(false)).toBeGreaterThan(careful * 3);
  });
});

describe('Starting abilities and player controls', () => {
  const grunts = (n: number) => ({
    number: 1,
    spawns: Array.from({ length: n }, (_, i) => ({ time: 0, kind: 'grunt' as const, x: 200 + i * 40 })),
  });
  const hero = (b: Battle, kind: string) => b.heroes.find((h) => h.kind === kind)!;
  const run = (b: Battle, seconds: number) => {
    for (let i = 0; i < seconds / STEP; i++) b.step(STEP);
  };

  it('each class starts with exactly one ability', () => {
    const b = new Battle({ seed: 1, wave: ROUND_1 });
    const kit = Object.fromEntries(b.heroes.map((h) => [h.kind, h.abilities!.map((a) => a.id)]));
    expect(kit).toEqual({ warrior: ['heroicStrike'], priest: ['heal'], mage: ['fireball'], rogue: ['sinisterStrike'] });
    const passives = Object.fromEntries(b.heroes.map((h) => [h.kind, h.passive]));
    expect(passives).toEqual({ warrior: 'autoTaunt', priest: 'fortitudeAura', mage: 'autoPolymorph', rogue: 'stealth' });
  });

  it('heroes start with no traits', () => {
    const b = new Battle({ seed: 1, wave: ROUND_1 });
    for (const h of b.heroes) expect(h.traits).toEqual([]);
  });

  it('learnAbility fills up to 5 slots, no duplicates', () => {
    const b = new Battle({ seed: 1, wave: ROUND_1 });
    const w = hero(b, 'warrior');
    expect(b.learnAbility(w, 'heroicStrike')).toBe(false); // already has it
    for (const id of ['thunderclap', 'heal', 'renew', 'fireball'] as const) expect(b.learnAbility(w, id)).toBe(true);
    expect(w.abilities!.length).toBe(5);
    expect(b.learnAbility(w, 'kick')).toBe(false);
  });

  it('the player can pick a hero', () => {
    const b = new Battle({ seed: 1, wave: ROUND_1, playerClass: 'mage' });
    expect(b.player?.kind).toBe('mage');
  });

  it('using an ability spends resource and starts a cooldown', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    const e = b.enemies[0];
    e.y = 400;
    expect(b.useAbility()).toBe('ok');
    expect(b.player!.resource).toBe(70);
    expect(b.useAbility()).toBe('cooldown');
    for (let i = 0; i < 0.7 / STEP; i++) b.step(STEP); // the Fireball is in flight
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('reports no target when nothing is in range', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'rogue' });
    b.playerAuto = false;
    b.step(STEP);
    expect(b.useAbility()).toBe('target');
    expect(b.player!.resource).toBeGreaterThanOrEqual(99);
  });

  it('shows out of range for a focused target that is too far, then in range', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    const e = b.enemies[0];
    e.y = -20;
    b.setFocus(e.id);
    expect(b.abilityInRange()).toBe(false);
    expect(b.useAbility()).toBe('target');
    e.y = 400;
    expect(b.abilityInRange()).toBe(true);
    expect(b.useAbility()).toBe('ok');
  });

  it('Heroic Strike spends rage and hits hard with extra threat', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'warrior' });
    b.playerAuto = false;
    b.step(STEP);
    const w = b.player!;
    const e = b.enemies[0];
    e.x = w.x;
    e.y = w.y - 45;
    expect(b.useAbility()).toBe('resource'); // no rage yet
    w.resource = 50;
    expect(b.useAbility()).toBe('ok');
    expect(w.abilities![0].cooldown).toBeGreaterThan(0);
    expect(e.hp).toBeLessThanOrEqual(e.maxHp - 23);
    expect(b.topThreat(e).id).toBe(w.id);
  });

  it('Taunt passive works even with AUTO off', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'warrior' });
    b.playerAuto = false;
    b.step(STEP);
    const e = b.enemies[0];
    e.y = 450;
    e.threat = { [hero(b, 'mage').id]: 500 };
    e.targetId = hero(b, 'mage').id;
    b.step(STEP);
    expect(e.targetId).toBe(b.player!.id);
    expect(b.player!.passiveCooldown).toBeGreaterThan(7);
  });

  it('Fortitude passive: the whole party starts with +20% max health when a priest is present', () => {
    const withPriest = new Battle({ seed: 1, wave: grunts(1) });
    const without = new Battle({ seed: 1, wave: grunts(1), heroes: ['warrior', 'mage', 'rogue'] });
    const w1 = withPriest.heroes.find((h) => h.kind === 'warrior')!;
    const w2 = without.heroes.find((h) => h.kind === 'warrior')!;
    expect(w1.maxHp).toBe(w2.maxHp + Math.round(w2.maxHp * 0.2));
    expect(w1.hp).toBe(w1.maxHp);
    run(withPriest, 40);
    expect(withPriest.hasEffect(w1, 'fortitude')).toBe(true); // never wears off
  });

  it('Polymorph passive sheeps casters before others, and never the last enemy', () => {
    const wave = { number: 1, spawns: [{ time: 0, kind: 'grunt' as const, x: 230 }, { time: 0, kind: 'shaman' as const, x: 310 }] };
    const b = new Battle({ seed: 1, wave, playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    for (const e of b.enemies) e.y = 400;
    b.step(STEP);
    const shaman = b.enemies.find((e) => e.kind === 'shaman')!;
    expect(b.isSheep(shaman)).toBe(true);

    const solo = new Battle({ seed: 1, wave: grunts(1), playerClass: 'mage' });
    solo.step(STEP);
    solo.enemies[0].y = 400;
    run(solo, 1);
    expect(solo.isSheep(solo.enemies[0])).toBe(false);
  });

  it('Polymorph passive prefers elites', () => {
    const wave = { number: 1, spawns: [{ time: 0, kind: 'shaman' as const, x: 230 }, { time: 0, kind: 'grunt' as const, x: 310 }] };
    const b = new Battle({ seed: 1, wave, playerClass: 'mage' });
    b.step(STEP);
    const grunt = b.enemies.find((e) => e.kind === 'grunt')!;
    grunt.isElite = true;
    for (const e of b.enemies) e.y = 400;
    b.player!.passiveCooldown = 0;
    b.step(STEP);
    expect(b.isSheep(grunt)).toBe(true);
  });

  it('Stealth: enemies ignore the rogue; the first hit is a double-damage ambush', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'rogue', heroes: ['rogue'] });
    b.playerAuto = false;
    b.step(STEP);
    const r = b.player!;
    const e = b.enemies[0];
    expect(b.hasEffect(r, 'stealth')).toBe(true);
    e.x = r.x;
    e.y = r.y - 50;
    e.hp = e.maxHp = 5000;
    r.cooldown = 99; // no auto attack yet
    b.step(STEP);
    expect(e.targetId).not.toBe(r.id); // can't see the rogue
    b.drainEvents();
    expect(b.useAbility()).toBe('ok');
    const hit = b.drainEvents().find((x) => x.type === 'attack' && x.from === r.id);
    expect(hit && hit.type === 'attack' ? hit.amount : 0).toBeGreaterThanOrEqual(57); // 32 x 2, -10% roll
    expect(b.hasEffect(r, 'stealth')).toBe(false);
  });

  it('Stealth: the rogue re-stealths after 5s out of combat', () => {
    // No enemies on the field yet (the only spawn is much later).
    const b = new Battle({ seed: 1, wave: { number: 1, spawns: [{ time: 100, kind: 'grunt', x: 270 }] }, playerClass: 'rogue', heroes: ['rogue'] });
    b.step(STEP);
    const r = b.player!;
    r.effects = [];
    run(b, 5.2);
    expect(b.hasEffect(r, 'stealth')).toBe(true);
  });

  it('Heal (player) heals the focused ally', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'priest' });
    b.playerAuto = false;
    b.step(STEP);
    const rogue = hero(b, 'rogue');
    rogue.hp = 50;
    b.setFocus(rogue.id);
    expect(b.useAbility()).toBe('ok');
    expect(rogue.hp).toBeGreaterThanOrEqual(50 + 70);
    expect(b.player!.resource).toBe(75);
  });

  it('the player hero attacks its focus target', () => {
    const b = new Battle({ seed: 1, wave: grunts(2), playerClass: 'mage' });
    b.step(STEP);
    const [a, c] = b.enemies;
    a.y = 300;
    c.y = 420;
    b.setFocus(a.id);
    const mine: number[] = [];
    for (let i = 0; i < 2 / STEP; i++) {
      b.step(STEP);
      for (const ev of b.drainEvents()) if (ev.type === 'attack' && ev.from === b.player!.id) mine.push(ev.to);
    }
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((id) => id === a.id)).toBe(true); // every hit of yours went to the focus
  });

  it('with AUTO off, the AI does not use the player ability', () => {
    const b = new Battle({ seed: 1, wave: ROUND_1, playerClass: 'mage' });
    b.playerAuto = false;
    while (b.outcome === 'running' && b.time < 600) b.step(STEP);
    expect(b.outcome).toBe('victory');
    expect(b.player!.resource).toBe(100);
  });

  it('a party with a player on AUTO still wins wave 1', () => {
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) {
      const b = new Battle({ seed: 5, wave: ROUND_1, playerClass: cls });
      while (b.outcome === 'running' && b.time < 600) b.step(STEP);
      expect(b.outcome).toBe('victory');
    }
  });

  it('warrior starts with no rage and builds it in combat', () => {
    const b = new Battle({ seed: 1, wave: grunts(2), playerClass: 'warrior', heroes: ['warrior'] });
    expect(b.player!.resource).toBe(0);
    run(b, 30);
    expect(b.player!.resource).toBeGreaterThan(0);
  });
});

describe('Earnable abilities', () => {
  const wave = (kinds: ('grunt' | 'shaman' | 'archer')[]) => ({
    number: 1,
    spawns: kinds.map((kind, i) => ({ time: 0, kind, x: 200 + i * 50 })),
  });
  const hero = (b: Battle, kind: string) => b.heroes.find((h) => h.kind === kind)!;
  const run = (b: Battle, seconds: number) => {
    for (let i = 0; i < seconds / STEP; i++) b.step(STEP);
  };

  it('Thunderclap hits every nearby enemy and slows them', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt', 'grunt', 'grunt']), playerClass: 'warrior' });
    b.playerAuto = false;
    b.step(STEP);
    const w = b.player!;
    b.learnAbility(w, 'thunderclap');
    w.resource = 100;
    b.enemies.forEach((e, i) => {
      e.x = w.x - 40 + i * 40;
      e.y = w.y - 60;
    });
    expect(b.useAbility(1)).toBe('ok');
    for (const e of b.enemies) {
      expect(e.hp).toBeLessThan(e.maxHp);
      expect(b.hasEffect(e, 'slow')).toBe(true);
      expect(b.topThreat(e).id).toBe(w.id);
    }
  });

  it('Renew heals the focused ally over time', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'priest' });
    b.playerAuto = false;
    b.step(STEP);
    b.learnAbility(b.player!, 'renew');
    const rogue = hero(b, 'rogue');
    rogue.hp = 100;
    b.setFocus(rogue.id);
    expect(b.useAbility(1)).toBe('ok');
    expect(b.hasEffect(rogue, 'hot')).toBe(true);
    run(b, 9.5);
    expect(rogue.hp).toBeGreaterThanOrEqual(160);
  });

  it('Power Word: Fortitude (earned, without a priest) raises max health, then wears off', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'warrior', heroes: ['warrior', 'mage'] });
    b.playerAuto = false;
    b.step(STEP);
    b.learnAbility(b.player!, 'fortitude');
    const before = b.heroes.map((h) => h.maxHp);
    expect(b.useAbility(1)).toBe('ok');
    b.heroes.forEach((h, i) => expect(h.maxHp).toBe(before[i] + Math.round(before[i] * 0.2)));
    b.enemies[0].y = -1000;
    b.enemies[0].speed = 0;
    run(b, 31);
    b.heroes.forEach((h, i) => {
      expect(h.maxHp).toBe(before[i]);
      expect(h.hp).toBeLessThanOrEqual(h.maxHp);
    });
  });

  it('Polymorph: sheep do not attack and ignore AoE', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt', 'grunt']), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    b.learnAbility(b.player!, 'polymorph');
    const [sheep, other] = b.enemies;
    sheep.y = 400;
    b.setFocus(sheep.id);
    expect(b.useAbility(1)).toBe('ok');
    expect(b.isSheep(sheep)).toBe(true);
    const before = sheep.hp;
    run(b, 4);
    expect(sheep.hp).toBe(before);
    expect(sheep.targetId).toBeNull();

    const w = hero(b, 'warrior');
    b.learnAbility(w, 'thunderclap');
    w.resource = 100;
    sheep.x = w.x;
    sheep.y = w.y - 50;
    other.x = w.x + 30;
    other.y = w.y - 50;
    b.step(STEP);
    expect(sheep.hp).toBe(before);
    expect(b.isSheep(sheep)).toBe(true);
  });

  it('a direct hit breaks Polymorph; casting it clears your focus', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt', 'grunt']), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    b.learnAbility(b.player!, 'polymorph');
    const sheep = b.enemies[0];
    sheep.y = 400;
    b.setFocus(sheep.id);
    b.useAbility(1);
    expect(b.focusId).toBeNull();
    b.setFocus(sheep.id);
    expect(b.useAbility(0)).toBe('ok'); // Fireball it on purpose
    for (let i = 0; i < 0.7 / STEP; i++) b.step(STEP); // ...and let it land
    expect(b.isSheep(sheep)).toBe(false);
  });

  const shamanSetup = (cls: 'rogue' | 'mage', interrupt: 'kick' | 'counterspell') => {
    const b = new Battle({ seed: 1, wave: wave(['shaman', 'grunt']), playerClass: cls, heroes: [cls, 'priest'] });
    b.playerAuto = false;
    b.player!.passiveCooldown = 999; // keep the mage's auto-Polymorph out of this test
    b.step(STEP);
    b.learnAbility(b.player!, interrupt);
    const [shaman, grunt] = b.enemies;
    grunt.hp = 100;
    shaman.x = grunt.x = b.player!.x;
    shaman.y = b.player!.y - 200;
    grunt.y = b.player!.y - 230;
    b.step(STEP);
    return { b, shaman, grunt };
  };

  it('the shaman heals goblins unless interrupted', () => {
    const { b, grunt, shaman } = shamanSetup('rogue', 'kick');
    expect(shaman.casting).toBeDefined();
    run(b, 3);
    expect(grunt.hp).toBeGreaterThan(100);
  });

  for (const [cls, id] of [['rogue', 'kick'], ['mage', 'counterspell']] as const) {
    it(`${id} interrupts and silences a cast`, () => {
      const { b, shaman, grunt } = shamanSetup(cls, id);
      expect(shaman.casting).toBeDefined();
      expect(b.useAbility(1)).toBe('ok');
      expect(shaman.casting).toBeUndefined();
      expect(b.hasEffect(shaman, 'silence')).toBe(true);
      run(b, 2);
      expect(grunt.hp).toBeLessThan(120);
    });
  }

  it('AI uses an earned interrupt on its own', () => {
    const b = new Battle({ seed: 1, wave: wave(['shaman', 'grunt']), heroes: ['rogue'] });
    b.step(STEP);
    const rogue = hero(b, 'rogue');
    b.learnAbility(rogue, 'kick');
    const [shaman, grunt] = b.enemies;
    grunt.hp = 100;
    shaman.x = grunt.x = rogue.x;
    shaman.y = rogue.y - 200;
    grunt.y = rogue.y - 230;
    let interrupted = false;
    for (let i = 0; i < 40 && !interrupted; i++) {
      b.step(STEP);
      interrupted = b.drainEvents().some((e) => e.type === 'castEnd' && e.interrupted);
    }
    expect(interrupted).toBe(true);
  });
});

describe('Traits (future rewards)', () => {
  const one = { number: 1, spawns: [{ time: 0, kind: 'grunt' as const, x: 270 }] };
  const run = (b: Battle, seconds: number) => {
    for (let i = 0; i < seconds / STEP; i++) b.step(STEP);
  };

  it('Combo Points: auto attacks build them and Sinister Strike spends them', () => {
    const b = new Battle({ seed: 1, wave: one, playerClass: 'rogue', heroes: ['rogue'] });
    b.playerAuto = false;
    b.step(STEP);
    const r = b.player!;
    r.traits = ['comboPoints'];
    const e = b.enemies[0];
    e.x = r.x;
    e.y = r.y - 60;
    e.hp = e.maxHp = 5000;
    run(b, 3);
    expect(r.comboPoints).toBeGreaterThan(0);
    expect(b.useAbility()).toBe('ok');
    expect(r.comboPoints).toBe(0);
  });

  it('Inner Focus: Renew costs half while the party is healthy', () => {
    const b = new Battle({ seed: 1, wave: one, playerClass: 'priest' });
    const p = b.player!;
    expect(b.abilityCost(p, 'renew')).toBe(20);
    p.traits = ['innerFocus'];
    expect(b.abilityCost(p, 'renew')).toBe(10);
    b.heroes.find((h) => h.kind === 'warrior')!.hp = 100;
    expect(b.abilityCost(p, 'renew')).toBe(20);
  });

  it('Arcane Surge sometimes makes Fireball free', () => {
    let free = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Battle({ seed, wave: one, playerClass: 'mage', heroes: ['mage'] });
      b.playerAuto = false;
      b.player!.traits = ['arcaneSurge'];
      b.step(STEP);
      b.enemies[0].y = 400;
      b.useAbility();
      if (b.player!.resource! >= 99) free++;
    }
    expect(free).toBeGreaterThan(3);
    expect(free).toBeLessThan(20);
  });

  it('Rage: the warrior hits harder with more rage', () => {
    const hit = (rage: number) => {
      const b = new Battle({ seed: 9, wave: one, playerClass: 'warrior', heroes: ['warrior'] });
      b.step(STEP);
      const w = b.player!;
      w.traits = ['rage'];
      const e = b.enemies[0];
      e.x = w.x;
      e.y = w.y - 45;
      w.resource = rage;
      w.cooldown = 0;
      b.drainEvents();
      b.step(STEP);
      const ev = b.drainEvents().find((x) => x.type === 'attack' && x.from === w.id);
      return ev && ev.type === 'attack' ? ev.amount : 0;
    };
    expect(hit(100)).toBeGreaterThan(hit(0));
  });
});

describe('Paladin and Warlock', () => {
  const lineup = (kinds: EnemyKind[]) => ({
    number: 1,
    spawns: kinds.map((kind, i) => ({ time: 0, kind, x: 200 + i * 50 })),
  });
  const run = (b: Battle, seconds: number) => {
    for (let i = 0; i < seconds / STEP; i++) b.step(STEP);
  };

  it('start with Judgement + Aegis Aura and Hex Bolt + Soul Harvest', () => {
    const b = new Battle({ seed: 1, wave: ROUND_1, team: ['paladin', 'warlock'] });
    const kit = Object.fromEntries(b.heroes.map((h) => [h.kind, [h.abilities!.map((a) => a.id), h.passive]]));
    expect(kit).toEqual({ paladin: [['judgement'], 'aegisAura'], warlock: [['hexBolt'], 'soulHarvest'] });
    expect(b.heroes.find((h) => h.kind === 'paladin')!.isTank).toBe(true);
  });

  it('Judgement hits at range and heals the most injured ally for half', () => {
    const b = new Battle({ seed: 2, wave: lineup(['grunt']), playerClass: 'paladin', heroes: ['paladin', 'mage'] });
    b.playerAuto = false;
    b.step(STEP);
    const p = b.player!;
    const mage = b.heroes.find((h) => h.kind === 'mage')!;
    const e = b.enemies[0];
    e.x = p.x;
    e.y = p.y - 150; // out of melee reach, inside Judgement's range
    mage.hp = 60;
    b.drainEvents();
    expect(b.useAbility(0)).toBe('ok');
    const events = b.drainEvents();
    const hit = events.find((x) => x.type === 'attack' && x.from === p.id && x.ability === 'judgement');
    const heal = events.find((x) => x.type === 'heal' && x.from === p.id && x.to === mage.id);
    expect(hit && hit.type === 'attack' && hit.amount).toBeGreaterThan(25);
    expect(heal && heal.type === 'heal' && hit && hit.type === 'attack' && Math.abs(heal.amount - hit.amount / 2)).toBeLessThanOrEqual(1);
  });

  it('Aegis Aura: the party takes 10% less damage while the Paladin stands', () => {
    const hitOnMage = (team: HeroClass[]) => {
      const b = new Battle({ seed: 5, wave: lineup(['grunt']), heroes: team });
      const mage = b.heroes.find((h) => h.kind === 'mage')!;
      const e = b.enemies[0];
      e.damage = 100;
      e.threat = { [mage.id]: 1000 };
      e.targetId = mage.id;
      e.x = mage.x;
      e.y = mage.y - mage.radius - e.radius - 2;
      e.cooldown = 0;
      b.drainEvents();
      for (let i = 0; i < 5; i++) b.step(STEP);
      const ev = b.drainEvents().find((x) => x.type === 'attack' && x.from === e.id && x.to === mage.id);
      return ev && ev.type === 'attack' ? ev.amount : 0;
    };
    const plain = hitOnMage(['mage']);
    const aura = hitOnMage(['mage', 'paladin']);
    expect(plain).toBeGreaterThan(80);
    expect(aura).toBeLessThan(plain);
    expect(aura).toBeGreaterThanOrEqual(Math.floor(plain * 0.85));
  });

  it('Wither eats away at an enemy over time', () => {
    const b = new Battle({ seed: 3, wave: lineup(['brute']), playerClass: 'warlock', heroes: ['warlock'] });
    b.playerAuto = false;
    b.step(STEP);
    const w = b.player!;
    b.learnAbility(w, 'wither');
    const e = b.enemies[0];
    e.speed = 0;
    e.x = w.x;
    e.y = w.y - 200;
    expect(b.useAbility(1)).toBe('ok');
    expect(e.effects!.some((x) => x.kind === 'dot' && x.ability === 'wither')).toBe(true);
    const before = e.hp;
    w.cooldown = 99; // no auto attacks: only the curse
    run(b, 6.05);
    expect(before - e.hp).toBeGreaterThanOrEqual(25);
  });

  it('Enfeeble makes the strongest enemy hit softer', () => {
    const b = new Battle({ seed: 4, wave: lineup(['brute', 'grunt']), playerClass: 'warlock', heroes: ['warlock'] });
    b.playerAuto = false;
    b.step(STEP);
    const w = b.player!;
    b.learnAbility(w, 'enfeeble');
    for (const e of b.enemies) {
      e.x = w.x;
      e.y = w.y - 200;
    }
    expect(b.useAbility(1)).toBe('ok');
    const brute = b.enemies.find((e) => e.kind === 'brute')!;
    expect(b.hasEffect(brute, 'weaken')).toBe(true);
  });

  it('Soul Harvest: a kill restores mana and heals the most injured ally', () => {
    const b = new Battle({ seed: 6, wave: lineup(['grunt', 'grunt']), heroes: ['warlock', 'mage'] });
    const w = b.heroes.find((h) => h.kind === 'warlock')!;
    const mage = b.heroes.find((h) => h.kind === 'mage')!;
    w.resource = 10;
    mage.hp = 50;
    const victim = b.enemies[0];
    victim.hp = 1;
    victim.x = w.x;
    victim.y = w.y - 150;
    run(b, 1);
    expect(victim.alive).toBe(false);
    expect(w.resource!).toBeGreaterThanOrEqual(30);
    expect(mage.hp).toBeGreaterThan(50);
  });

  it('a Paladin, Warlock and Priest party wins round 1', () => {
    for (const seed of [1, 2, 3]) {
      const b = new Battle({ seed, wave: ROUND_1, team: ['paladin', 'warlock', 'priest'] });
      run(b, 300);
      expect(b.outcome).toBe('victory');
    }
  });
});
