/**
 * Headless run simulator for balance work and bug sweeps. Plays whole map
 * runs with the same rules as the game (Auto's choices, or random ones) and
 * records what happened. Pure: no Phaser, no DOM.
 */
import { withGear, type CampState } from '../src/sim/camp';
import { lockedAbilities } from '../src/sim/progress';
import { settleFight } from '../src/sim/settle';
import { Battle, STEP } from '../src/sim/battle';
import { ARENA, HERO_KIT, WORLD } from '../src/sim/content';
import {
  ALL_CLASSES,
  autoPath,
  autoRecruit,
  autoShop,
  autoTrain,
  fightMods,
  chooseEvent,
  eventChoices,
  autoUpgrade,
  availableNodes,
  buy,
  chooseUpgrade,
  currentNode,
  encounterFor,
  enterNode,
  fightSeed,
  firstAbilityOptions,
  leaveShop,
  newRun,
  recruit,
  train,
  trainOptions,
  type Reward,
  type RunState,
} from '../src/sim/run';
import { createRng } from '../src/sim/rng';
import type { EnemyKind, HeroClass, Unit } from '../src/sim/types';

/** A fight that hasn't ended after this long is reported as a stall. */
export const STALL_SECONDS = 240;

export interface HeroStats {
  cls: HeroClass;
  damage: number;
  healing: number;
  taken: number;
  deaths: number;
}

export interface RoundRecord {
  /** Overall position: (act - 1) * 13 + floor + 1. */
  round: number;
  act: number;
  floor: number;
  type: string;
  won: boolean;
  seconds: number;
  suddenDeath: boolean;
  stalled: boolean;
  heroes: HeroStats[];
  /** Ability (or passive effect) name -> uses. */
  abilities: Record<string, number>;
  /** Enemy kinds that dealt damage -> amount (to find what kills parties). */
  enemyDamage: Record<string, number>;
  /** Ability -> number of heroes that had it this round. */
  owned: Record<string, number>;
  /** Ability -> damage it dealt. */
  abilityDamage: Record<string, number>;
  /** Enemy kind -> how many were fielded this round. */
  enemyCount: Record<string, number>;
  /** For the run: enemies killed and heroes (by slot) who fell. */
  kills: { kind: EnemyKind; summoned: boolean }[];
  fallen: number[];
}

export interface RunRecord {
  /** The starting class, then recruits in order. */
  team: HeroClass[];
  seed: number;
  /** Overall position reached (see RoundRecord.round); 40 = won. */
  reached: number;
  act: number;
  won: boolean;
  gold: number;
  losses: number[];
  rounds: RoundRecord[];
  violations: string[];
  /** Every reward or purchase: class, overall position and what it was. */
  picks: { cls: HeroClass; round: number; pick: string }[];
  /** Node types visited, in order. */
  path: string[];
}

/** How choices are made: the game's AI (Auto), or uniformly at random (to test every option). */
export type PickPolicy = 'ai' | 'random';

export function rewardKey(r: Reward): string {
  return 'id' in r ? `${r.kind}:${r.id}` : r.kind;
}

export const WIN_POSITION = 40;

function position(run: RunState): number {
  const node = currentNode(run);
  return (run.act - 1) * 13 + (node ? node.floor + 1 : 0);
}

/** Play one fight to the end, collecting stats and checking invariants every step. */
export function playRound(run: RunState, violations: string[], camp?: CampState): RoundRecord {
  const node = currentNode(run)!;
  const battle = new Battle({
    seed: fightSeed(run),
    wave: encounterFor(run),
    carefulAI: process.env.CAREFUL !== '0',
    team: run.team,
    builds: camp ? withGear(run.team, run.builds, camp) : run.builds,
    ...fightMods(run),
  });
  const heroes = battle.heroes;
  const bySlot = new Map<number, HeroStats>();
  for (const h of heroes) bySlot.set(h.id, { cls: h.kind as HeroClass, damage: 0, healing: 0, taken: 0, deaths: 0 });
  const abilities: Record<string, number> = {};
  const owned: Record<string, number> = {};
  const abilityDamage: Record<string, number> = {};
  for (const h of heroes) for (const a of h.abilities ?? []) owned[a.id] = (owned[a.id] ?? 0) + 1;
  const enemyCount: Record<string, number> = {};
  for (const e of battle.enemies) enemyCount[e.kind] = (enemyCount[e.kind] ?? 0) + 1;
  const enemyDamage: Record<string, number> = {};
  const kindOf = new Map<number, string>();
  for (const u of battle.units) kindOf.set(u.id, u.kind);
  // Report each kind of problem once per round (with its first occurrence).
  const seen = new Set<string>();
  const note = (msg: string) => {
    const key = msg.replace(/[-\d.]+/g, '#');
    if (seen.has(key) || violations.length >= 200) return;
    seen.add(key);
    violations.push(`act ${run.act} floor ${node.floor + 1} (${node.type}) t=${battle.time.toFixed(2)} [${run.team.join(',')}]: ${msg}`);
  };

  let steps = 0;
  const maxSteps = Math.round(STALL_SECONDS / STEP);
  while (battle.outcome === 'running' && steps < maxSteps) {
    battle.step(STEP);
    steps++;
    for (const ev of battle.drainEvents()) {
      switch (ev.type) {
        case 'spawn':
          kindOf.set(ev.id, battle.unit(ev.id)?.kind ?? '?');
          break;
        case 'attack':
        case 'tick': {
          if (ev.type === 'tick' && ev.kind === 'hot') {
            const s = ev.from !== undefined ? bySlot.get(ev.from) : undefined;
            if (s) s.healing += ev.amount;
            break;
          }
          const from = ev.from;
          const src = from !== undefined ? bySlot.get(from) : undefined;
          const dst = bySlot.get(ev.to);
          if (src && !dst) {
            src.damage += ev.amount;
            if (ev.ability) abilityDamage[ev.ability] = (abilityDamage[ev.ability] ?? 0) + ev.amount;
          }
          if (dst) {
            dst.taken += ev.amount;
            const k = from !== undefined ? kindOf.get(from) ?? '?' : '?';
            enemyDamage[k] = (enemyDamage[k] ?? 0) + ev.amount;
          }
          if (ev.amount < 0 || !Number.isFinite(ev.amount)) note(`bad damage amount ${ev.amount}`);
          break;
        }
        case 'heal': {
          const s = bySlot.get(ev.from);
          if (s) s.healing += ev.amount;
          if (ev.amount < 0 || !Number.isFinite(ev.amount)) note(`bad heal amount ${ev.amount}`);
          break;
        }
        case 'ability':
          abilities[ev.ability] = (abilities[ev.ability] ?? 0) + 1;
          break;
        case 'taunt':
          abilities['(taunt)'] = (abilities['(taunt)'] ?? 0) + 1;
          break;
        case 'notice':
          if (ev.text === 'Ambush!' || ev.text === 'Dodge' || ev.text === 'Absorbed' || ev.text === 'Interrupted!' || ev.text === 'Countered!')
            abilities[`(${ev.text.replace('!', '')})`] = (abilities[`(${ev.text.replace('!', '')})`] ?? 0) + 1;
          break;
        case 'death': {
          const s = bySlot.get(ev.id);
          if (s) s.deaths++;
          break;
        }
      }
    }
    checkInvariants(battle.units, note);
  }
  const stalled = battle.outcome === 'running';
  if (stalled) note(`fight did not end within ${STALL_SECONDS}s`);
  const kills = [...battle.kills];
  const fallen = heroes.filter((h) => !h.alive).map((h) => h.slot ?? 0);
  return {
    round: position(run),
    act: run.act,
    floor: node.floor,
    type: node.type,
    kills,
    fallen,
    won: battle.outcome === 'victory',
    seconds: battle.time,
    suddenDeath: battle.time > 60,
    stalled,
    heroes: [...bySlot.values()],
    abilities,
    enemyDamage,
    owned,
    abilityDamage,
    enemyCount,
  };
}

function checkInvariants(units: Unit[], note: (m: string) => void): void {
  for (const u of units) {
    const name = `${u.side}:${u.kind}#${u.id}`;
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) note(`${name} position is not a number`);
    if (!Number.isFinite(u.hp)) note(`${name} hp is not a number`);
    if (u.hp > u.maxHp + 0.5) note(`${name} hp ${u.hp} above max ${u.maxHp}`);
    if (u.hp < 0) note(`${name} hp below zero`);
    if (u.alive && u.hp <= 0) note(`${name} alive with ${u.hp} hp`);
    if (!u.alive) continue;
    if (u.x < -1 || u.x > WORLD.width + 1) note(`${name} left the arena sideways (x=${u.x.toFixed(0)})`);
    if (u.y > ARENA.bottom + 1 || u.y < ARENA.top - 120) note(`${name} out of the arena (y=${u.y.toFixed(0)})`);
    if (u.resource !== undefined && (u.resource < -0.01 || u.resource > (u.maxResource ?? 100) + 0.01)) note(`${name} resource ${u.resource} out of range`);
    for (const a of u.abilities ?? []) if (a.cooldown < 0 || !Number.isFinite(a.cooldown)) note(`${name} ${a.id} cooldown ${a.cooldown}`);
  }
}

/**
 * Play a whole run on the map: path, fights, campsites, chests and shops, until
 * the party falls or the last boss does. With a camp, its gear, perks and
 * ability unlocks apply and every fight's loot (and record) is kept there.
 */
export function playRun(start: HeroClass, seed: number, policy: PickPolicy = 'ai', camp?: CampState, tier = 0): RunRecord {
  const rng = createRng(seed * 7 + 3);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const locked = camp ? lockedAbilities(camp.records) : [];
  const options = firstAbilityOptions(start, locked);
  const run = newRun(start, policy === 'random' ? pick(options) : HERO_KIT[start].starting, seed, { tier, perks: camp?.records.perks, locked });
  const rec: RunRecord = { team: [start], seed, reached: 0, act: 1, won: false, gold: 0, losses: [], rounds: [], violations: [], picks: [], path: [] };
  const log = (slot: number, r: Reward | string) => rec.picks.push({ cls: run.team[slot], round: position(run), pick: typeof r === 'string' ? r : rewardKey(r) });
  for (let guard = 0; guard < 2000 && (run.status === 'map' || run.status === 'fight'); guard++) {
    const p = run.pending;
    if (p?.kind === 'event') {
      const n = eventChoices(run).length;
      chooseEvent(run, policy === 'ai' ? 0 : Math.floor(rng() * n));
      continue;
    }
    if (p) {
      if (policy === 'ai') {
        // Log what the AI takes, then let it choose.
        if (p.kind === 'recruit') {
          const r = autoRecruit(run);
          recruit(run, r.cls, r.first);
          rec.team.push(r.cls);
        } else if (p.kind === 'train') {
          const t = autoTrain(run);
          if (t.reward) log(t.slot, t.reward);
          train(run, t.slot, t.reward);
        } else if (p.kind === 'upgrade') {
          const u = autoUpgrade(run, p.options);
          if (u) log(u.slot, u.reward);
          chooseUpgrade(run, u);
        } else if (p.kind === 'shop') {
          const before = run.builds.map((b) => JSON.stringify(b));
          autoShop(run);
          run.builds.forEach((b, i) => JSON.stringify(b) !== before[i] && log(i, 'shop'));
        }
      } else if (p.kind === 'recruit') {
        const cls = pick(ALL_CLASSES);
        recruit(run, cls, pick(firstAbilityOptions(cls, run.locked)));
        rec.team.push(cls);
      } else if (p.kind === 'train') {
        const slot = p.left[0];
        const options = trainOptions(run, slot);
        const r = options.length ? pick(options) : null;
        if (r) log(slot, r);
        train(run, slot, r);
      } else if (p.kind === 'upgrade') {
        const u = p.options.length ? pick(p.options) : null;
        if (u) log(u.slot, u.reward);
        chooseUpgrade(run, u);
      } else if (p.kind === 'shop') {
        // Random shopper: buys one random affordable thing, then leaves.
        const affordable = p.stock.map((item, i) => ({ item, i })).filter(({ item }) => !item.sold && item.price <= run.gold);
        if (affordable.length) {
          const { item, i } = pick(affordable);
          log(item.slot, item.reward);
          buy(run, i);
        }
        leaveShop(run);
      }
      continue;
    }
    if (run.status === 'map') {
      const id = policy === 'ai' ? autoPath(run) : pick(availableNodes(run)).id;
      const node = enterNode(run, id);
      rec.path.push(node.type);
      continue;
    }
    // A fight.
    const r = playRound(run, rec.violations, camp);
    rec.rounds.push(r);
    settleFight(run, camp, r);
    if (!r.won) rec.losses.push(r.round);
  }
  rec.won = run.status === 'won';
  rec.reached = rec.won ? WIN_POSITION : position(run);
  rec.act = run.act;
  rec.gold = run.stats.gold;
  return rec;
}
