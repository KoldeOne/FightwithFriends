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
    const b = new Battle({ seed: 1, wave: WAVE_1 });
    const kit = Object.fromEntries(b.heroes.map((h) => [h.kind, h.abilities!.map((a) => a.id)]));
    expect(kit).toEqual({ warrior: ['taunt'], priest: ['heal'], mage: ['fireball'], rogue: ['sinisterStrike'] });
  });

  it('heroes start with no traits', () => {
    const b = new Battle({ seed: 1, wave: WAVE_1 });
    for (const h of b.heroes) expect(h.traits).toEqual([]);
  });

  it('learnAbility fills up to 5 slots, no duplicates', () => {
    const b = new Battle({ seed: 1, wave: WAVE_1 });
    const w = hero(b, 'warrior');
    expect(b.learnAbility(w, 'taunt')).toBe(false);
    for (const id of ['thunderclap', 'heal', 'renew', 'fireball'] as const) expect(b.learnAbility(w, id)).toBe(true);
    expect(w.abilities!.length).toBe(5);
    expect(b.learnAbility(w, 'kick')).toBe(false);
  });

  it('the player can pick a hero', () => {
    const b = new Battle({ seed: 1, wave: WAVE_1, playerClass: 'mage' });
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

  it('Taunt (player) forces the focused enemy onto the warrior', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'warrior' });
    b.playerAuto = false;
    b.step(STEP);
    const e = b.enemies[0];
    e.y = 450;
    e.threat = { [hero(b, 'mage').id]: 500 };
    b.setFocus(e.id);
    expect(b.useAbility()).toBe('ok');
    expect(e.targetId).toBe(b.player!.id);
    expect(b.useAbility()).toBe('cooldown');
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
    run(b, 2);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(c.hp).toBe(c.maxHp);
  });

  it('with AUTO off, the AI does not use the player ability', () => {
    const b = new Battle({ seed: 1, wave: WAVE_1, playerClass: 'mage' });
    b.playerAuto = false;
    while (b.outcome === 'running' && b.time < 600) b.step(STEP);
    expect(b.outcome).toBe('victory');
    expect(b.player!.resource).toBe(100);
  });

  it('a party with a player on AUTO still wins wave 1', () => {
    for (const cls of ['warrior', 'priest', 'mage', 'rogue'] as const) {
      const b = new Battle({ seed: 5, wave: WAVE_1, playerClass: cls });
      while (b.outcome === 'running' && b.time < 600) b.step(STEP);
      expect(b.outcome).toBe('victory');
    }
  });

  it('warrior starts with no rage and builds it in combat', () => {
    const b = new Battle({ seed: 1, wave: grunts(2), playerClass: 'warrior' });
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

  it("Power Word: Fortitude raises the whole party's max health, then wears off", () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'priest' });
    b.playerAuto = false;
    b.step(STEP);
    b.learnAbility(b.player!, 'fortitude');
    const before = b.heroes.map((h) => h.maxHp);
    expect(b.useAbility(1)).toBe('ok');
    b.heroes.forEach((h, i) => {
      expect(h.maxHp).toBe(before[i] + Math.round(before[i] * 0.2));
      expect(b.hasEffect(h, 'fortitude')).toBe(true);
    });
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
    expect(b.isSheep(sheep)).toBe(false);
  });

  const shamanSetup = (cls: 'rogue' | 'mage', interrupt: 'kick' | 'counterspell') => {
    const b = new Battle({ seed: 1, wave: wave(['shaman', 'grunt']), playerClass: cls, heroes: [cls, 'priest'] });
    b.playerAuto = false;
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
