/**
 * Headless run simulator for balance work and bug sweeps. Plays whole runs
 * with the same rules as the game (AI-only choices, auto picks, 3 lives) and
 * records what happened. Pure: no Phaser, no DOM.
 */
import { Battle, STEP } from '../src/sim/battle';
import { ARENA, HERO_KIT, makeRound, WORLD } from '../src/sim/content';
import { completeWave, loseRound, needsRecruit, newRun, recruit, type RunState } from '../src/sim/run';
import type { HeroClass, Unit } from '../src/sim/types';

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
  round: number;
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
}

export interface RunRecord {
  team: HeroClass[];
  seed: number;
  /** Highest round reached (the round that ended the run, or maxRound + 1). */
  reached: number;
  losses: number[];
  rounds: RoundRecord[];
  violations: string[];
}

export type RecruitPolicy = (run: RunState) => HeroClass;

const isTank = (c: HeroClass) => HERO_KIT[c].role.toLowerCase().startsWith('tank');
const isHealer = (c: HeroClass) => HERO_KIT[c].role.toLowerCase().includes('heal');

/** Default recruit choice: a missing tank, then a missing healer, then the least-picked damage class. */
export function sensibleRecruit(tank: HeroClass, healer: HeroClass, dps: HeroClass[]): RecruitPolicy {
  return (run) => {
    if (!run.team.some(isTank)) return tank;
    if (!run.team.some(isHealer)) return healer;
    const counts = dps.map((c) => run.team.filter((t) => t === c).length);
    return dps[counts.indexOf(Math.min(...counts))];
  };
}

/** Play one fight to the end, collecting stats and checking invariants every step. */
export function playRound(run: RunState, violations: string[]): RoundRecord {
  const battle = new Battle({
    seed: run.seed * 100 + run.wave + run.lives * 7,
    wave: makeRound(run.wave),
    carefulAI: process.env.CAREFUL !== '0',
    team: run.team,
    builds: run.builds,
    placement: run.placement,
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
    violations.push(`round ${run.wave} t=${battle.time.toFixed(2)} [${run.team.join(',')}]: ${msg}`);
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
  return {
    round: run.wave,
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

/** Play a whole run: endless rounds until lives run out (or `maxRound` is cleared). */
export function playRun(start: HeroClass[], seed: number, recruitPolicy: RecruitPolicy, maxRound = 60): RunRecord {
  const run = newRun(start, seed);
  const rec: RunRecord = { team: [...start], seed, reached: 0, losses: [], rounds: [], violations: [] };
  while (run.lives > 0 && run.wave <= maxRound) {
    while (needsRecruit(run)) {
      const cls = recruitPolicy(run);
      recruit(run, cls);
      rec.team.push(cls);
    }
    const r = playRound(run, rec.violations);
    rec.rounds.push(r);
    if (r.won) completeWave(run);
    else {
      rec.losses.push(run.wave);
      loseRound(run);
    }
  }
  rec.reached = run.wave;
  return rec;
}
