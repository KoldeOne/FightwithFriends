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

describe('Player controls and abilities', () => {
  const grunts = (n: number) => ({
    number: 1,
    spawns: Array.from({ length: n }, (_, i) => ({ time: 0, kind: 'grunt' as const, x: 200 + i * 40 })),
  });
  const hero = (b: Battle, kind: string) => b.heroes.find((h) => h.kind === kind)!;

  it('the player can pick a hero', () => {
    const b = new Battle({ seed: 1, wave: WAVE_1, playerClass: 'mage' });
    expect(b.player?.kind).toBe('mage');
  });

  it('using an ability spends resource and starts a cooldown', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    const e = b.enemies[0];
    e.y = 400; // in mage range
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

  it('warrior starts with no rage and builds it in combat', () => {
    const b = new Battle({ seed: 1, wave: grunts(2), playerClass: 'warrior' });
    expect(b.player!.resource).toBe(0);
    for (let i = 0; i < 30 / STEP; i++) b.step(STEP);
    expect(b.player!.resource).toBeGreaterThan(0);
  });

  it('thunderclap hits every nearby enemy and slows them', () => {
    const b = new Battle({ seed: 1, wave: grunts(3), playerClass: 'warrior' });
    b.playerAuto = false;
    b.step(STEP);
    const w = b.player!;
    w.resource = 100;
    b.enemies.forEach((e, i) => {
      e.x = w.x - 40 + i * 40;
      e.y = w.y - 60;
    });
    expect(b.useAbility()).toBe('ok');
    for (const e of b.enemies) {
      expect(e.hp).toBeLessThan(e.maxHp);
      expect(b.hasEffect(e, 'slow')).toBe(true);
      expect(b.topThreat(e).id).toBe(w.id);
    }
  });

  it('renew heals the focused ally over time', () => {
    const b = new Battle({ seed: 1, wave: grunts(1), playerClass: 'priest' });
    b.playerAuto = false;
    b.step(STEP);
    const rogue = hero(b, 'rogue');
    rogue.hp = 100;
    b.setFocus(rogue.id);
    expect(b.useAbility()).toBe('ok');
    expect(b.hasEffect(rogue, 'hot')).toBe(true);
    for (let i = 0; i < 9.5 / STEP; i++) b.step(STEP);
    expect(rogue.hp).toBeGreaterThanOrEqual(160);
  });

  it('the player hero attacks its focus target', () => {
    const b = new Battle({ seed: 1, wave: grunts(2), playerClass: 'mage' });
    b.step(STEP);
    const [a, c] = b.enemies;
    a.y = 300;
    c.y = 420; // c is further advanced: the mage would normally pick it
    b.setFocus(a.id);
    for (let i = 0; i < 2 / STEP; i++) b.step(STEP);
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
});

describe('Signatures and traits', () => {
  const wave = (kinds: ('grunt' | 'shaman' | 'archer')[]) => ({
    number: 1,
    spawns: kinds.map((kind, i) => ({ time: 0, kind, x: 200 + i * 50 })),
  });
  const hero = (b: Battle, kind: string) => b.heroes.find((h) => h.kind === kind)!;
  const run = (b: Battle, seconds: number) => {
    for (let i = 0; i < seconds / STEP; i++) b.step(STEP);
  };

  it('Taunt (player) forces the focused enemy onto the warrior', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'warrior' });
    b.playerAuto = false;
    b.step(STEP);
    const e = b.enemies[0];
    const mage = hero(b, 'mage');
    e.y = 450;
    e.threat = { [mage.id]: 500 };
    b.setFocus(e.id);
    expect(b.useSignature()).toBe('ok');
    expect(e.targetId).toBe(b.player!.id);
    expect(b.useSignature()).toBe('cooldown');
  });

  it('Guardian Spirit prevents one death', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'priest' });
    b.playerAuto = false;
    b.step(STEP);
    const rogue = hero(b, 'rogue');
    b.setFocus(rogue.id);
    expect(b.useSignature()).toBe('ok');
    rogue.hp = 5;
    const e = b.enemies[0];
    e.damage = 500; // one hit is lethal
    e.x = rogue.x;
    e.y = rogue.y - 40;
    e.threat = { [rogue.id]: 999 };
    run(b, 3);
    expect(rogue.alive).toBe(true);
    expect(b.hasEffect(rogue, 'guardian')).toBe(false);
  });

  it('Polymorph: sheep do not attack, ignore AoE, and break on a direct hit', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt', 'grunt']), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    const [sheep, other] = b.enemies;
    sheep.y = 400;
    b.setFocus(sheep.id);
    expect(b.useSignature()).toBe('ok');
    expect(b.isSheep(sheep)).toBe(true);

    // Heroes leave the sheep alone while another enemy lives.
    const before = sheep.hp;
    run(b, 4);
    expect(sheep.hp).toBe(before);
    expect(sheep.targetId).toBeNull();

    // AoE (Thunderclap) doesn't hurt it.
    const w = hero(b, 'warrior');
    w.resource = 100;
    sheep.x = w.x;
    sheep.y = w.y - 50;
    other.x = w.x + 30;
    other.y = w.y - 50;
    w.abilityCooldown = 0;
    b.step(STEP);
    expect(sheep.hp).toBe(before);
    expect(b.isSheep(sheep)).toBe(true);
  });

  it('a direct hit breaks Polymorph', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt', 'grunt']), playerClass: 'mage' });
    b.playerAuto = false;
    b.step(STEP);
    const sheep = b.enemies[0];
    sheep.y = 400;
    b.setFocus(sheep.id);
    b.useSignature();
    expect(b.focusId).toBeNull(); // casting Polymorph clears your focus
    b.setFocus(sheep.id); // deliberately re-target the sheep
    expect(b.useAbility()).toBe('ok'); // Fireball it
    expect(b.isSheep(sheep)).toBe(false);
  });

  it('the shaman heals goblins unless kicked', () => {
    const setup = () => {
      const b = new Battle({ seed: 1, wave: wave(['shaman', 'grunt']), playerClass: 'rogue', heroes: ['rogue', 'priest'] });
      b.playerAuto = false;
      b.step(STEP);
      const [shaman, grunt] = b.enemies;
      grunt.hp = 100;
      shaman.y = 200;
      grunt.y = 150;
      b.step(STEP);
      return { b, shaman, grunt };
    };
    const healed = setup();
    expect(healed.shaman.casting).toBeDefined();
    run(healed.b, 3);
    expect(healed.grunt.hp).toBeGreaterThan(100);

    const kicked = setup();
    const rogue = kicked.b.player!;
    kicked.shaman.x = rogue.x;
    kicked.shaman.y = rogue.y - 60;
    expect(kicked.b.useSignature()).toBe('ok');
    expect(kicked.shaman.casting).toBeUndefined();
    expect(kicked.b.hasEffect(kicked.shaman, 'silence')).toBe(true);
    run(kicked.b, 2);
    expect(kicked.grunt.hp).toBe(100);
  });

  it('AI rogue kicks shaman casts on its own', () => {
    const b = new Battle({ seed: 1, wave: wave(['shaman', 'grunt']), heroes: ['rogue'] });
    b.step(STEP);
    const [shaman, grunt] = b.enemies;
    const rogue = hero(b, 'rogue');
    grunt.hp = 100;
    shaman.x = rogue.x;
    shaman.y = rogue.y - 200;
    grunt.x = rogue.x + 40;
    grunt.y = rogue.y - 200;
    let interrupted = false;
    for (let i = 0; i < 40 && !interrupted; i++) {
      b.step(STEP);
      interrupted = b.drainEvents().some((e) => e.type === 'castEnd' && e.interrupted);
    }
    expect(interrupted).toBe(true);
  });

  it('Rogue builds combo points and Sinister Strike spends them', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'rogue', heroes: ['rogue'] });
    b.playerAuto = false;
    b.step(STEP);
    const r = b.player!;
    const e = b.enemies[0];
    e.x = r.x;
    e.y = r.y - 60;
    e.hp = e.maxHp = 5000;
    run(b, 3);
    expect(r.comboPoints).toBeGreaterThan(0);
    expect(b.useAbility()).toBe('ok');
    expect(r.comboPoints).toBe(0);
  });

  it('Renew costs half while the party is healthy (Inner Focus)', () => {
    const b = new Battle({ seed: 1, wave: wave(['grunt']), playerClass: 'priest' });
    const p = b.player!;
    expect(b.abilityCost(p)).toBe(10);
    hero(b, 'warrior').hp = 100;
    expect(b.abilityCost(p)).toBe(20);
  });

  it('Arcane Surge sometimes makes Fireball free', () => {
    let free = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Battle({ seed, wave: wave(['grunt']), playerClass: 'mage', heroes: ['mage'] });
      b.playerAuto = false;
      b.step(STEP);
      b.enemies[0].y = 400;
      b.useAbility();
      if (b.player!.resource! >= 99) free++;
    }
    expect(free).toBeGreaterThan(3);
    expect(free).toBeLessThan(20);
  });

  it('Rage makes the warrior hit harder', () => {
    const hit = (rage: number) => {
      const b = new Battle({ seed: 9, wave: wave(['grunt']), playerClass: 'warrior', heroes: ['warrior'] });
      b.step(STEP);
      const w = b.player!;
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
