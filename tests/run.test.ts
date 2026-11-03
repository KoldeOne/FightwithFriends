import { describe, expect, it } from 'vitest';
import { enemyCount, makeEncounter, PARTY_SCALE, strengthAt } from '../src/sim/acts';
import { Battle, STEP } from '../src/sim/battle';
import { ENEMY_LAYOUT, enemyPos, HERO_LINES, makeRound, SPOTS, TRAITS } from '../src/sim/content';
import { CAMPSITE_FLOORS, generateActMap, MAP_FLOORS, nextNodes } from '../src/sim/map';
import {
  applyReward,
  autoPath,
  autoResolve,
  availableNodes,
  buy,
  chooseUpgrade,
  encounterFor,
  enterNode,
  finishFight,
  firstAbilityOptions,
  loadRun,
  newRun,
  recruit,
  reroll,
  rewardPreview,
  saveRun,
  train,
  trainOptions,
  type RunState,
} from '../src/sim/run';

/** Walk to the next node of a given type (or any node), on the run's own map. */
function step(run: RunState, type?: string): void {
  const options = availableNodes(run);
  const node = (type && options.find((n) => n.type === type)) || options[0];
  enterNode(run, node.id);
}

/** Win the current fight without simulating it. */
function win(run: RunState, fallen: number[] = []): ReturnType<typeof finishFight> {
  return finishFight(run, true, fallen, encounterFor(run).spawns.map((s) => ({ kind: s.kind })));
}

/** Resolve whatever is waiting the way Auto would, then keep going. */
function advance(run: RunState): void {
  if (run.pending) autoResolve(run);
  else if (run.status === 'fight') win(run);
  else step(run);
}

describe('Act maps', () => {
  for (const seed of [1, 2, 3, 42, 777]) {
    for (const act of [1, 2, 3]) {
      it(`seed ${seed}, act ${act}: a climbable map with a good mix`, () => {
        const m = generateActMap(seed, act);
        expect(m.floors).toHaveLength(MAP_FLOORS + 1);
        expect(m.floors[MAP_FLOORS]).toHaveLength(1);
        expect(m.nodes[m.floors[MAP_FLOORS][0]].type).toBe('boss');
        for (const f of m.floors.slice(0, MAP_FLOORS)) expect(f.length).toBeGreaterThanOrEqual(2);
        // Every node can be reached from the start, and leads to the boss.
        const reach = new Set(m.floors[0]);
        for (let f = 0; f < MAP_FLOORS; f++) for (const id of m.floors[f]) if (reach.has(id)) m.nodes[id].next.forEach((n) => reach.add(n));
        expect(reach.size).toBe(Object.keys(m.nodes).length);
        for (const n of Object.values(m.nodes)) if (n.type !== 'boss') expect(n.next.length).toBeGreaterThan(0);
        // Links never cross.
        for (let f = 0; f < MAP_FLOORS - 1; f++) {
          const edges = m.floors[f].flatMap((id) => m.nodes[id].next.map((to) => [m.nodes[id].col, m.nodes[to].col]));
          for (const [a, b] of edges) for (const [c, d] of edges) expect((a - c) * (b - d) >= 0).toBe(true);
        }
        // Fights first; fixed campsite floors; no early elites or shops; a shop and two chests somewhere.
        for (const id of [...m.floors[0], ...m.floors[1]]) expect(m.nodes[id].type).toBe('fight');
        for (const f of CAMPSITE_FLOORS[act]) for (const id of m.floors[f]) expect(m.nodes[id].type).toBe('campsite');
        for (const f of [0, 1, 2]) for (const id of m.floors[f]) expect(['elite', 'shop']).not.toContain(m.nodes[id].type);
        const types = Object.values(m.nodes).map((n) => n.type);
        expect(types.filter((t) => t === 'shop').length).toBeGreaterThanOrEqual(1);
        expect(types.filter((t) => t === 'chest').length).toBeGreaterThanOrEqual(2);
      });
    }
  }

  it('maps differ from run to run', () => {
    const a = generateActMap(1, 1);
    const b = generateActMap(2, 1);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    expect(JSON.stringify(generateActMap(1, 1))).toEqual(JSON.stringify(a));
  });
});

describe('A map run', () => {
  it('starts with one hero and the first ability you chose', () => {
    expect(firstAbilityOptions('mage')).toContain('fireball');
    expect(firstAbilityOptions('mage')).toContain('frostNova');
    for (const id of firstAbilityOptions('rogue')) expect(id in TRAITS).toBe(false);
    const run = newRun('mage', 'frostNova', 5);
    expect(run.team).toEqual(['mage']);
    expect(run.builds[0].abilities.map((a) => a.id)).toEqual(['frostNova']);
    expect(run.act).toBe(1);
    expect(availableNodes(run).map((n) => n.id)).toEqual(run.map.floors[0]);
  });

  it('you can only move along the links; fights start right away', () => {
    const run = newRun('warrior', undefined, 6);
    const far = run.map.floors[3][0];
    expect(() => enterNode(run, far)).toThrow();
    step(run);
    expect(run.status).toBe('fight');
    expect(availableNodes(run)).toEqual([]);
    expect(encounterFor(run).spawns).toHaveLength(1); // a lone hero meets one enemy
  });

  it('a won fight pays gold for each enemy and XP to everyone standing; fallen heroes get no XP', () => {
    const run = newRun('warrior', undefined, 7);
    step(run);
    const spoils = win(run);
    expect(spoils.gold).toBeGreaterThan(0);
    expect(run.gold).toBe(spoils.gold);
    expect(spoils.heroes[0].xp).toBeGreaterThan(0);
    expect(run.builds[0].level).toBe(2);
    expect(run.status).toBe('map');
    step(run);
    const again = win(run, [0]);
    expect(again.heroes[0]).toMatchObject({ xp: 0, fell: true });
  });

  it('the first four campsites you reach recruit (class and first ability); the next ones train', () => {
    const run = newRun('warrior', undefined, 8);
    let guard = 0;
    while ((run.campsites < 4 || run.pending?.kind === 'recruit') && guard++ < 200) {
      if (run.pending?.kind === 'recruit') {
        const before = run.team.length;
        recruit(run, 'priest', 'renew');
        expect(run.team).toHaveLength(before + 1);
        expect(run.builds[before]).toMatchObject({ level: 1, abilities: [{ id: 'renew' }] });
      } else advance(run);
    }
    expect(run.team).toHaveLength(5);
    // On to the next campsite: training.
    while (run.pending?.kind !== 'train' && guard++ < 400) advance(run);
    expect(run.pending?.kind).toBe('train');
    const opts = trainOptions(run, 0);
    expect(opts.length).toBeGreaterThan(0);
    train(run, 0, opts[0]);
    expect(run.builds[0].abilities.length + run.builds[0].traits.length).toBe(2);
  });

  it('recruits start at level 1 and earn double XP until they catch up', () => {
    const run = newRun('warrior', undefined, 9);
    while (run.pending?.kind !== 'recruit') advance(run);
    recruit(run, 'mage');
    while (run.status !== 'fight') advance(run);
    const spoils = win(run);
    const [veteran, rookie] = spoils.heroes;
    expect(rookie.xp).toBe(veteran.xp * 2);
  });

  it('chests give gold and an upgrade; shops sell for gold', () => {
    for (const seed of [10, 11, 12, 13]) {
      const run = newRun('mage', undefined, seed);
      let guard = 0;
      while (!(run.pending?.kind === 'upgrade' && run.pending.source === 'chest') && guard++ < 300) {
        if (availableNodes(run).some((n) => n.type === 'chest')) step(run, 'chest');
        else advance(run);
      }
      if (run.pending?.kind !== 'upgrade') continue;
      expect(run.pending.gold).toBeGreaterThan(0);
      const pick = run.pending.options[0];
      chooseUpgrade(run, pick);
      expect(run.pending).toBeUndefined();
      return;
    }
    throw new Error('no chest reached');
  });

  it('shop: buy what you can afford, reroll for gold', () => {
    const run = newRun('rogue', undefined, 14);
    let guard = 0;
    while (run.pending?.kind !== 'shop' && guard++ < 400) {
      if (availableNodes(run).some((n) => n.type === 'shop')) step(run, 'shop');
      else advance(run);
    }
    expect(run.pending?.kind).toBe('shop');
    if (run.pending?.kind !== 'shop') return;
    run.gold = 1000;
    const item = run.pending.stock[0];
    expect(buy(run, 0)).toBe(true);
    expect(run.gold).toBe(1000 - item.price);
    expect(buy(run, 0)).toBe(false); // sold
    const before = JSON.stringify(run.pending.stock);
    expect(reroll(run)).toBe(true);
    expect(JSON.stringify(run.pending.stock)).not.toEqual(before);
    run.gold = 0;
    expect(buy(run, 1)).toBe(false);
  });

  it('elites and bosses give an upgrade; the boss moves you to the next act; the last boss wins the run', () => {
    const run = newRun('paladin', undefined, 15);
    let guard = 0;
    while (run.act === 1 && guard++ < 400) advance(run);
    expect(run.act).toBe(2);
    expect(run.at).toBeNull();
    expect(run.visited).toEqual([]);
    while (run.status !== 'won' && guard++ < 1200) advance(run);
    expect(run.status).toBe('won');
    expect(run.stats.bosses).toBe(3);
  });

  it('a party wipe ends the run', () => {
    const run = newRun('priest', undefined, 16);
    step(run);
    finishFight(run, false, [0], []);
    expect(run.status).toBe('lost');
    expect(availableNodes(run)).toEqual([]);
  });

  it('Auto can play a whole run of choices on its own', () => {
    const run = newRun('warlock', undefined, 17);
    let guard = 0;
    while (run.status !== 'won' && guard++ < 1500) {
      if (run.pending) autoResolve(run);
      else if (run.status === 'fight') win(run);
      else enterNode(run, autoPath(run));
    }
    expect(run.status).toBe('won');
    expect(run.team).toHaveLength(5);
  });

  it('saves and loads (and drops old round-based saves)', () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    store.set('fightwithfriends.run.v4', '{"version":4}');
    expect(loadRun()).toBeNull();
    expect(store.has('fightwithfriends.run.v4')).toBe(false);
    const run = newRun('rogue', undefined, 18);
    step(run);
    saveRun(run);
    expect(loadRun()).toEqual(run);
  });
});

describe('Encounters', () => {
  it('scale with the party: one enemy for a lone hero, up to five; weaker for small parties', () => {
    expect(enemyCount(1, 0, 'fight')).toBe(1);
    expect(enemyCount(1, 8, 'fight')).toBe(1);
    expect(enemyCount(3, 2, 'fight')).toBe(3);
    expect(enemyCount(3, 7, 'fight')).toBe(4);
    expect(enemyCount(5, 10, 'boss')).toBe(5);
    const solo = makeEncounter(1, 1, 0, 'fight', 1, 'a');
    const full = makeEncounter(1, 1, 0, 'fight', 5, 'a');
    expect(solo.strength! / full.strength!).toBeCloseTo(PARTY_SCALE[0]);
    expect(strengthAt(2, 0)).toBeGreaterThan(strengthAt(1, 12));
  });

  it('elites and bosses lead their fights; the line-up is the same on a reload', () => {
    const elite = makeEncounter(3, 2, 6, 'elite', 4, 'x');
    expect(elite.spawns.map((s) => s.kind)).toContain('abomination');
    const boss = makeEncounter(3, 3, 12, 'boss', 5, 'y');
    expect(boss.spawns.map((s) => s.kind)).toContain('demonLord');
    expect(boss.boss).toBe(true);
    expect(makeEncounter(3, 2, 6, 'elite', 4, 'x')).toEqual(elite);
  });

  it('reward previews show the numbers before and after', () => {
    const run = newRun('mage', 'fireball', 1);
    const p = rewardPreview(run, 0, { kind: 'mastery', id: 'fireball' })!;
    expect(p.now).toMatch(/Deals \d+ damage/);
    expect(p.after).toMatch(/spreads/);
  });
});

describe('General rules', () => {
  it('Vitality and Might raise health and damage in battle', () => {
    const run = newRun('mage', undefined, 1);
    applyReward(run.builds[0], { kind: 'vitality' });
    applyReward(run.builds[0], { kind: 'might' });
    const b = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage', heroes: ['mage'], builds: run.builds });
    const fresh = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage', heroes: ['mage'] });
    expect(b.player!.maxHp).toBe(Math.round(fresh.player!.maxHp * 1.1));
    expect(b.player!.damage).toBeCloseTo(fresh.player!.damage * 1.1);
  });

  it('upgrades raise power and shorten cooldowns', () => {
    const run = newRun('mage', undefined, 1);
    applyReward(run.builds[0], { kind: 'power', id: 'fireball' });
    applyReward(run.builds[0], { kind: 'haste', id: 'fireball' });
    const b = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage', heroes: ['mage'], builds: run.builds });
    const slot = b.player!.abilities![0];
    expect(b.abilityScale(b.player!, slot)).toBeCloseTo(1.25);
    expect(b.abilityCooldown(slot)).toBeCloseTo(4 * 0.8);
  });

  it('enemies start in their line-up positions', () => {
    const r = makeRound(4);
    const b = new Battle({ seed: 1, wave: r, team: ['warrior', 'priest', 'mage'] });
    expect(b.enemies).toHaveLength(r.spawns.length);
    for (const e of b.enemies) expect(ENEMY_LAYOUT.rowY).toContain(e.y);
    expect(b.enemies[1]).toMatchObject(enemyPos(0, 2));
  });

  it('heroes line up by role: tanks and melee in front, ranged behind, healers at the back', () => {
    const b = new Battle({ seed: 1, wave: makeRound(1), team: ['priest', 'mage', 'warrior', 'rogue', 'warlock'] });
    const y = (cls: string) => b.heroes.find((h) => h.kind === cls)!.y;
    expect(y('warrior')).toBe(HERO_LINES.front);
    expect(y('rogue')).toBe(HERO_LINES.front);
    expect(y('mage')).toBe(HERO_LINES.ranged);
    expect(y('priest')).toBe(HERO_LINES.healer);
  });

  it('teams can repeat classes', () => {
    const b = new Battle({ seed: 1, wave: makeRound(1), team: ['mage', 'mage', 'priest'] });
    expect(b.heroes.map((h) => h.label).sort()).toEqual(['Mage', 'Mage 2', 'Priest']);
  });

  it("the player's hero starts in the center (tests)", () => {
    const b = new Battle({ seed: 1, wave: makeRound(1), playerClass: 'mage' });
    expect([b.player!.x, b.player!.y]).toEqual([SPOTS.center.x, SPOTS.center.y]);
    void STEP;
    void nextNodes;
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

  it('Holy Nova heals every hurt ally', () => {
    const b = setup('priest', 'holyNova');
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

