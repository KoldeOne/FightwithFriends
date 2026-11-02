import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../src/sim/battle';
import { BOSS_SPECIALS } from '../src/sim/content';
import type { AbilityId, EnemyKind, HeroClass, TraitId, Unit } from '../src/sim/types';

const lineup = (kinds: EnemyKind[], strength = 1) => ({ number: 1, strength, spawns: kinds.map((kind, i) => ({ time: 0, kind, x: 200 + i * 60, y: 300 })) });
const run = (b: Battle, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) b.step(STEP);
};

/** A player-controlled hero (AUTO off) with one extra ability (slot 1), full resource. */
function setup(cls: HeroClass, id: AbilityId | null, kinds: EnemyKind[] = ['grunt'], team?: HeroClass[], mastery = false) {
  const b = new Battle({ seed: 3, wave: lineup(kinds), playerClass: cls, heroes: team ?? [cls] });
  b.playerAuto = false;
  b.step(STEP);
  const h = b.player!;
  if (id) {
    b.learnAbility(h, id);
    h.abilities![1].mastery = mastery;
  }
  h.resource = h.maxResource;
  h.passiveCooldown = 999;
  return { b, h };
}

/** Put an enemy right next to a hero. */
function adjacent(e: Unit, h: Unit) {
  e.x = h.x;
  e.y = h.y - h.radius - e.radius - 2;
}

function lastAttack(b: Battle, from: number, to: number, ability?: AbilityId): number {
  const ev = b.drainEvents().filter((x) => x.type === 'attack' && x.from === from && x.to === to && (!ability || x.ability === ability));
  const last = ev[ev.length - 1];
  return last && last.type === 'attack' ? last.amount : 0;
}

describe('Stuns', () => {
  it('a stunned enemy neither moves nor attacks', () => {
    const { b, h } = setup('warrior', 'shieldBash');
    const e = b.enemies[0];
    adjacent(e, h);
    expect(b.useAbility(1)).toBe('ok');
    expect(b.hasEffect(e, 'stun')).toBe(true);
    const hp = h.hp;
    const pos = [e.x, e.y];
    run(b, 1.5);
    expect(h.hp).toBe(hp);
    expect([e.x, e.y]).toEqual(pos);
  });

  it('a stun breaks a cast (Shield Bash on a Brute winding up Smash)', () => {
    const { b, h } = setup('warrior', 'shieldBash', ['brute']);
    const brute = b.enemies[0];
    adjacent(brute, h);
    for (let i = 0; i < 40 && !brute.casting; i++) b.step(STEP);
    expect(brute.casting).toBeDefined();
    expect(b.useAbility(1)).toBe('ok');
    expect(brute.casting).toBeUndefined();
  });

  it('bosses shake off stuns twice as fast', () => {
    const { b, h } = setup('paladin', 'hammerOfJustice', ['warchief']);
    const boss = b.enemies[0];
    boss.y = h.y - 150;
    expect(b.useAbility(1)).toBe('ok');
    expect(boss.effects!.find((e) => e.kind === 'stun')!.remaining).toBeCloseTo(1.25);
  });

  it('Frost Nova freezes every enemy near the Mage', () => {
    const { b, h } = setup('mage', 'frostNova', ['grunt', 'grunt', 'grunt']);
    for (const e of b.enemies) adjacent(e, h);
    expect(b.useAbility(1)).toBe('ok');
    for (const e of b.enemies) expect(b.hasEffect(e, 'stun')).toBe(true);
  });
});

describe('Buffs and curses', () => {
  it('Curse of Ruin makes the target take more damage', () => {
    const hit = (cursed: boolean) => {
      const { b, h } = setup('warlock', 'curseOfRuin', ['brute']);
      const e = b.enemies[0];
      e.y = h.y - 200;
      if (cursed) b.useAbility(1);
      h.cooldown = 0;
      b.drainEvents();
      for (let i = 0; i < 20; i++) b.step(STEP);
      return b.drainEvents().filter((x) => x.type === 'attack' && x.from === h.id).reduce((a, x) => a + (x.type === 'attack' ? x.amount : 0), 0);
    };
    expect(hit(true)).toBeGreaterThan(hit(false) * 1.1);
  });

  it('Rallying Shout: the party deals more damage', () => {
    const { b, h } = setup('warrior', 'rallyingShout', ['grunt'], ['warrior', 'mage']);
    expect(b.useAbility(1)).toBe('ok');
    for (const ally of b.heroes) expect(b.hasEffect(ally, 'empower')).toBe(true);
    void h;
  });

  it('Guardian Spirit: a killing blow leaves the ally at 25% health instead', () => {
    const { b } = setup('priest', 'guardianSpirit', ['brute'], ['priest', 'mage']);
    const mage = b.heroes.find((x) => x.kind === 'mage')!;
    b.setFocus(mage.id);
    expect(b.useAbility(1)).toBe('ok');
    mage.hp = 5;
    const brute = b.enemies[0];
    brute.damage = 500;
    brute.threat = { [mage.id]: 9999 };
    adjacent(brute, mage);
    for (let i = 0; i < 60 && !b.drainEvents().some((x) => x.type === 'notice' && x.text === 'Saved!'); i++) b.step(STEP);
    expect(mage.alive).toBe(true);
    expect(b.hasEffect(mage, 'guardian')).toBe(false); // used up
  });

  it('Doom lands its damage after 8 seconds', () => {
    const { b, h } = setup('warlock', 'doom', ['abomination']);
    const e = b.enemies[0];
    e.y = h.y - 200;
    e.speed = 0;
    expect(b.useAbility(1)).toBe('ok');
    h.cooldown = 999;
    const before = e.hp;
    run(b, 7.5);
    expect(e.hp).toBe(before);
    run(b, 1);
    expect(before - e.hp).toBeGreaterThan(100);
  });

  it('Contagion: Wither jumps to the next enemy when its target dies', () => {
    const { b, h } = setup('warlock', 'wither', ['grunt', 'grunt'], undefined, true);
    const [a, c] = b.enemies;
    a.y = c.y = h.y - 200;
    b.setFocus(a.id);
    expect(b.useAbility(1)).toBe('ok');
    a.hp = 1;
    h.cooldown = 999;
    run(b, 1.5);
    expect(a.alive).toBe(false);
    expect(c.effects!.some((e) => e.kind === 'dot' && e.ability === 'wither')).toBe(true);
  });
});

describe('Healing spells', () => {
  it('Chain of Light heals three allies, most injured first', () => {
    const { b } = setup('priest', 'chainOfLight', ['grunt'], ['priest', 'mage', 'warrior', 'rogue']);
    const hurt = b.heroes.filter((x) => x.kind !== 'priest');
    hurt.forEach((x, i) => (x.hp = Math.round(x.maxHp * (0.3 + i * 0.1))));
    const before = hurt.map((x) => x.hp);
    expect(b.useAbility(1)).toBe('ok');
    expect(hurt.filter((x, i) => x.hp > before[i])).toHaveLength(3);
  });

  it('Holy Nova also hurts enemies near the Priest', () => {
    const { b, h } = setup('priest', 'holyNova');
    const e = b.enemies[0];
    adjacent(e, h);
    expect(b.useAbility(1)).toBe('ok');
    expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe('Named upgrades', () => {
  it('Cleave: Heroic Strike also hits a second enemy', () => {
    const { b, h } = setup('warrior', null, ['grunt', 'grunt']);
    h.abilities![0].mastery = true;
    for (const e of b.enemies) adjacent(e, h);
    b.enemies[1].x += 30;
    expect(b.useAbility(0)).toBe('ok');
    expect(b.enemies.filter((e) => e.hp < e.maxHp)).toHaveLength(2);
  });

  it('Shield Wall blocks 60%', () => {
    const { b, h } = setup('warrior', 'shieldBlock', ['grunt'], undefined, true);
    expect(b.useAbility(1)).toBe('ok');
    expect(h.effects!.find((e) => e.kind === 'block')!.amount).toBe(0.6);
  });

  it('Executioner: Eviscerate hits twice as hard on a wounded enemy', () => {
    const dmg = (mastery: boolean) => {
      const { b, h } = setup('rogue', 'eviscerate', ['abomination'], undefined, mastery);
      h.effects = [];
      const e = b.enemies[0];
      adjacent(e, h);
      e.hp = Math.round(e.maxHp * 0.3);
      b.drainEvents();
      b.useAbility(1);
      return lastAttack(b, h.id, e.id);
    };
    expect(dmg(true)).toBeGreaterThan(dmg(false) * 1.7);
  });

  it('Shatter: Ice Lance hits twice as hard on a frozen enemy', () => {
    const { b, h } = setup('mage', 'iceLance', ['abomination'], undefined, true);
    const e = b.enemies[0];
    e.y = h.y - 200;
    e.effects!.push({ kind: 'stun', remaining: 5, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: 0 });
    b.drainEvents();
    expect(b.useAbility(1)).toBe('ok');
    run(b, 0.7);
    expect(lastAttack(b, h.id, e.id, 'iceLance')).toBeGreaterThan(48);
  });

  it('Reflective Shield hurts whoever hits it', () => {
    const { b } = setup('priest', 'powerShield', ['grunt'], ['priest', 'warrior'], true);
    const w = b.heroes.find((x) => x.kind === 'warrior')!;
    b.setFocus(w.id);
    expect(b.useAbility(1)).toBe('ok');
    const e = b.enemies[0];
    e.threat = { [w.id]: 999 };
    adjacent(e, w);
    const before = e.hp;
    run(b, 2);
    expect(e.hp).toBeLessThan(before);
  });

  it('Poisoned Blades: auto attacks poison', () => {
    const { b, h } = setup('rogue', null);
    h.traits = ['poisonedBlades' as TraitId];
    h.effects = [];
    const e = b.enemies[0];
    adjacent(e, h);
    h.cooldown = 0;
    run(b, 0.1);
    expect(e.effects!.some((x) => x.kind === 'dot')).toBe(true);
  });
});

describe('Boss signature moves', () => {
  const bossFight = (boss: EnemyKind, extra: EnemyKind[] = []) => {
    const b = new Battle({ seed: 5, wave: lineup([boss, ...extra]), heroes: ['warrior', 'priest', 'mage'] });
    return b;
  };

  it('Goblin Warchief: War Cry makes every goblin attack faster', () => {
    const b = bossFight('warchief', ['grunt']);
    let cried = false;
    for (let i = 0; i < 20 / STEP && !cried; i++) {
      b.step(STEP);
      cried = b.enemies.some((e) => e.alive && b.hasEffect(e, 'frenzy'));
    }
    expect(cried).toBe(true);
    expect(b.enemies.filter((e) => e.alive).every((e) => b.hasEffect(e, 'frenzy'))).toBe(true);
  });

  it('The Bone King: Raise Dead summons weakened Skeletons (at most two at once)', () => {
    const b = bossFight('boneKing');
    const king = b.enemies[0];
    king.maxHp = king.hp = 1e6; // keep him up
    run(b, 60);
    const raised = b.enemies.filter((e) => e.alive && e.summoned);
    expect(raised.length).toBeGreaterThan(0);
    expect(raised.length).toBeLessThanOrEqual(BOSS_SPECIALS.raiseDead.maxAlive);
  });

  it('Demon Lord: Rain of Fire falls on the hero furthest away', () => {
    const b = bossFight('demonLord');
    const lord = b.enemies[0];
    lord.speed = 0;
    let mark: { x?: number; y?: number } | undefined;
    for (let i = 0; i < 15 / STEP && !mark; i++) {
      b.step(STEP);
      if (lord.casting?.kind === 'rainOfFire') mark = { x: lord.casting.x, y: lord.casting.y };
    }
    expect(mark).toBeDefined();
    const furthest = b.heroes.filter((h) => h.alive).reduce((a, h) => (Math.hypot(h.x - lord.x, h.y - lord.y) > Math.hypot(a.x - lord.x, a.y - lord.y) ? h : a));
    expect(Math.hypot(furthest.x - mark!.x!, furthest.y - mark!.y!)).toBeLessThan(120);
  });

  it('after an interrupt, a boss’s next cast is unstoppable', () => {
    const { b, h } = setup('mage', 'counterspell', ['warchief']);
    const boss = b.enemies[0];
    boss.y = h.y - 200;
    boss.specialCooldown = 0;
    for (let i = 0; i < 40 && !boss.casting; i++) b.step(STEP);
    expect(boss.casting).toBeDefined();
    expect(b.useAbility(1)).toBe('ok');
    expect(boss.casting).toBeUndefined();
    boss.specialCooldown = 0;
    boss.castCooldown = 0;
    boss.effects = [];
    for (let i = 0; i < 40 && !boss.casting; i++) b.step(STEP);
    expect(boss.casting?.unstoppable).toBe(true);
  });
});
