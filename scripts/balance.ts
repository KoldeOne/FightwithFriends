/**
 * Balance runner.
 *
 *   npm run balance                      # all starting teams, 6 seeds each, summary to the console
 *   npm run balance -- --seeds 12        # more seeds
 *   npm run balance -- --shard 0/4 --out a.json   # part of the work (for running in parallel)
 *   npm run balance -- --merge a.json b.json ...  # combine shard files and summarise
 *
 * Every run uses the game's own rules: AI picks rewards, 3 lives, endless
 * rounds. Recruits (rounds 11 and 21) fill a missing tank, then a missing
 * healer, then the least-picked damage class.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { HERO_KIT } from '../src/sim/content';
import { ALL_CLASSES } from '../src/sim/run';
import type { HeroClass } from '../src/sim/types';
import { playRun, sensibleRecruit, type RunRecord } from './simlib';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};

/** Every multiset of 3 classes (order doesn't matter, repeats allowed). */
export function startingTeams(classes: HeroClass[]): HeroClass[][] {
  const out: HeroClass[][] = [];
  for (let a = 0; a < classes.length; a++)
    for (let b = a; b < classes.length; b++) for (let c = b; c < classes.length; c++) out.push([classes[a], classes[b], classes[c]]);
  return out;
}

const role = (c: HeroClass) => HERO_KIT[c].role.toLowerCase();
const TANK = ALL_CLASSES.find((c) => role(c).startsWith('tank'))!;
const HEALER = ALL_CLASSES.find((c) => role(c).startsWith('heal'))!;
const DPS = ALL_CLASSES.filter((c) => !role(c).startsWith('tank') && !role(c).startsWith('heal'));

function runAll(seeds: number, shard: number, shards: number): RunRecord[] {
  const jobs: { team: HeroClass[]; seed: number }[] = [];
  for (const team of startingTeams(ALL_CLASSES)) for (let s = 0; s < seeds; s++) jobs.push({ team, seed: 1000 + s * 7919 });
  const mine = jobs.filter((_, i) => i % shards === shard);
  const out: RunRecord[] = [];
  const t0 = Date.now();
  for (const [i, j] of mine.entries()) {
    out.push(playRun(j.team, j.seed, sensibleRecruit(TANK, HEALER, DPS), 80));
    if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${mine.length} runs (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  return out;
}

// --- summary --------------------------------------------------------------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface Summary {
  runs: number;
  /** Headline numbers for comparing tuning passes. */
  kpi: { classicMean: number; classicMin: number; classSpread: number; earlyLoss: number; lateSudden: number };
  overall: { meanReached: number; medianReached: number; p10: number; p90: number };
  teams: { team: string; runs: number; mean: number; median: number; min: number; max: number }[];
  classes: { cls: string; runsWith: number; meanReached: number; dmgShare: number; healShare: number; takenShare: number; deathsPerRound: number; dmgPerSecond: number }[];
  rounds: { round: number; attempts: number; lossRate: number; meanSeconds: number; suddenDeathRate: number; stalls: number }[];
  abilities: { id: string; owners: number; usesPerOwnerRound: number; damagePerUse: number }[];
  enemies: { kind: string; damage: number; fielded: number; perEnemy: number }[];
  violations: string[];
}

export function summarise(runs: RunRecord[]): Summary {
  const reached = runs.map((r) => r.reached);
  const sorted = [...reached].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;

  const byTeam = new Map<string, number[]>();
  for (const r of runs) {
    const key = r.team.slice(0, 3).join('+');
    byTeam.set(key, [...(byTeam.get(key) ?? []), r.reached]);
  }
  const teams = [...byTeam.entries()]
    .map(([team, xs]) => ({ team, runs: xs.length, mean: mean(xs), median: median(xs), min: Math.min(...xs), max: Math.max(...xs) }))
    .sort((a, b) => b.mean - a.mean);

  // Per class: share of the party's damage/healing/damage taken, per hero.
  const cls = new Map<string, { dmg: number[]; heal: number[]; taken: number[]; deaths: number; heroRounds: number; dps: number[] }>();
  for (const r of runs) {
    for (const rd of r.rounds) {
      const tot = (f: (h: (typeof rd.heroes)[number]) => number) => rd.heroes.reduce((a, h) => a + f(h), 0) || 1;
      const td = tot((h) => h.damage);
      const th = tot((h) => h.healing);
      const tt = tot((h) => h.taken);
      const n = rd.heroes.length;
      for (const h of rd.heroes) {
        const c = cls.get(h.cls) ?? { dmg: [], heal: [], taken: [], deaths: 0, heroRounds: 0, dps: [] };
        // Shares are normalised to party size: 1.0 = an equal share.
        c.dmg.push((h.damage / td) * n);
        c.heal.push((h.healing / th) * n);
        c.taken.push((h.taken / tt) * n);
        c.dps.push(h.damage / Math.max(1, rd.seconds));
        c.deaths += h.deaths;
        c.heroRounds++;
        cls.set(h.cls, c);
      }
    }
  }
  const classes = [...cls.entries()].map(([k, c]) => {
    const withIt = runs.filter((r) => r.team.slice(0, 3).includes(k as HeroClass)).map((r) => r.reached);
    return {
      cls: k,
      runsWith: withIt.length,
      meanReached: mean(withIt),
      dmgShare: mean(c.dmg),
      healShare: mean(c.heal),
      takenShare: mean(c.taken),
      deathsPerRound: c.deaths / c.heroRounds,
      dmgPerSecond: mean(c.dps),
    };
  });

  const rounds: Summary['rounds'] = [];
  const maxRound = Math.max(...runs.flatMap((r) => r.rounds.map((x) => x.round)));
  for (let n = 1; n <= maxRound; n++) {
    const rs = runs.flatMap((r) => r.rounds.filter((x) => x.round === n));
    if (!rs.length) continue;
    rounds.push({
      round: n,
      attempts: rs.length,
      lossRate: rs.filter((x) => !x.won).length / rs.length,
      meanSeconds: mean(rs.map((x) => x.seconds)),
      suddenDeathRate: rs.filter((x) => x.suddenDeath).length / rs.length,
      stalls: rs.filter((x) => x.stalled).length,
    });
  }

  const owned: Record<string, number> = {};
  const uses: Record<string, number> = {};
  const dmg: Record<string, number> = {};
  const enemyDmg: Record<string, number> = {};
  const fielded: Record<string, number> = {};
  for (const r of runs)
    for (const rd of r.rounds) {
      for (const [k, v] of Object.entries(rd.owned)) owned[k] = (owned[k] ?? 0) + v;
      for (const [k, v] of Object.entries(rd.abilities)) uses[k] = (uses[k] ?? 0) + v;
      for (const [k, v] of Object.entries(rd.abilityDamage)) dmg[k] = (dmg[k] ?? 0) + v;
      for (const [k, v] of Object.entries(rd.enemyDamage)) enemyDmg[k] = (enemyDmg[k] ?? 0) + v;
      for (const [k, v] of Object.entries(rd.enemyCount ?? {})) fielded[k] = (fielded[k] ?? 0) + v;
    }
  const abilities = Object.keys({ ...owned, ...uses })
    .map((id) => ({ id, owners: owned[id] ?? 0, usesPerOwnerRound: owned[id] ? (uses[id] ?? 0) / owned[id] : uses[id] ?? 0, damagePerUse: uses[id] ? (dmg[id] ?? 0) / uses[id] : 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const enemies = Object.entries(enemyDmg)
    .filter(([kind]) => kind !== '?')
    .map(([kind, damage]) => ({ kind, damage, fielded: fielded[kind] ?? 0, perEnemy: damage / Math.max(1, fielded[kind] ?? 0) }))
    .sort((a, b) => b.perEnemy - a.perEnemy);

  const isRole = (c: HeroClass, r: string) => role(c).startsWith(r);
  const classic = runs.filter((r) => {
    const t = r.team.slice(0, 3);
    return t.filter((c) => isRole(c, 'tank')).length === 1 && t.filter((c) => isRole(c, 'heal')).length === 1;
  });
  const reachByClass = classes.map((c) => c.meanReached);
  const early = runs.flatMap((r) => r.rounds.filter((x) => x.round <= 10));
  const late = runs.flatMap((r) => r.rounds.filter((x) => x.round > 20));
  const kpi = {
    classicMean: mean(classic.map((r) => r.reached)),
    classicMin: classic.length ? Math.min(...classic.map((r) => r.reached)) : 0,
    classSpread: Math.max(...reachByClass) - Math.min(...reachByClass),
    earlyLoss: early.filter((x) => !x.won).length / Math.max(1, early.length),
    lateSudden: late.filter((x) => x.suddenDeath).length / Math.max(1, late.length),
  };

  return {
    runs: runs.length,
    kpi,
    overall: { meanReached: mean(reached), medianReached: median(reached), p10: pct(0.1), p90: pct(0.9) },
    teams,
    classes,
    rounds,
    abilities,
    enemies,
    violations: [...new Set(runs.flatMap((r) => r.violations))].slice(0, 100),
  };
}

function print(s: Summary): void {
  const f = (n: number, d = 1) => n.toFixed(d);
  console.log(`\n${s.runs} runs. Round reached: mean ${f(s.overall.meanReached)}, median ${s.overall.medianReached}, 10th-90th pct ${s.overall.p10}-${s.overall.p90}\n`);
  console.log(
    `KPI: classic teams (1 tank + 1 healer + 1 dps) mean ${f(s.kpi.classicMean)} (worst ${s.kpi.classicMin}); class spread ${f(s.kpi.classSpread)} rounds; ` +
      `loss rate in rounds 1-10 ${f(s.kpi.earlyLoss * 100)}%; sudden death after round 20 ${f(s.kpi.lateSudden * 100)}%\n`,
  );
  console.log('Starting teams (best first):');
  for (const t of s.teams) console.log(`  ${t.team.padEnd(24)} mean ${f(t.mean).padStart(5)}  median ${String(t.median).padStart(4)}  range ${t.min}-${t.max}`);
  console.log('\nClasses (shares: 1.0 = an equal share of the party total):');
  for (const c of s.classes)
    console.log(
      `  ${c.cls.padEnd(9)} runs-with ${String(c.runsWith).padStart(4)}  reach ${f(c.meanReached)}  dmg ${f(c.dmgShare, 2)}  heal ${f(c.healShare, 2)}  taken ${f(c.takenShare, 2)}  deaths/rd ${f(c.deathsPerRound, 3)}  dps ${f(c.dmgPerSecond)}`,
    );
  console.log('\nRounds (loss rate, mean length, sudden death):');
  for (const r of s.rounds)
    if (r.lossRate > 0.05 || r.suddenDeathRate > 0.2 || r.stalls)
      console.log(`  ${String(r.round).padStart(3)}  attempts ${String(r.attempts).padStart(4)}  loss ${f(r.lossRate * 100, 0).padStart(3)}%  ${f(r.meanSeconds, 0)}s  sudden ${f(r.suddenDeathRate * 100, 0)}%${r.stalls ? `  STALLS ${r.stalls}` : ''}`);
  console.log('\nAbilities (uses per owner per round; damage per use):');
  for (const a of s.abilities) console.log(`  ${a.id.padEnd(16)} owners ${String(a.owners).padStart(6)}  uses ${f(a.usesPerOwnerRound, 2).padStart(6)}  dmg/use ${f(a.damagePerUse, 0)}`);
  console.log('\nDamage to heroes per enemy fielded (all rounds):');
  for (const e of s.enemies) console.log(`  ${e.kind.padEnd(14)} ${String(Math.round(e.perEnemy)).padStart(6)} per enemy  (${e.fielded} fielded)`);
  console.log(`\nInvariant violations: ${s.violations.length}`);
  for (const v of s.violations.slice(0, 20)) console.log('  ' + v);
}

if (args.includes('--merge')) {
  const rest = args.slice(args.indexOf('--merge') + 1);
  const end = rest.findIndex((a) => a.startsWith('--'));
  const files = end < 0 ? rest : rest.slice(0, end);
  const runs = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as RunRecord[]);
  const s = summarise(runs);
  print(s);
  const out = opt('summary', '');
  if (out) writeFileSync(out, JSON.stringify(s, null, 1));
} else {
  const [shard, shards] = opt('shard', '0/1').split('/').map(Number);
  const runs = runAll(Number(opt('seeds', '6')), shard, shards);
  const out = opt('out', '');
  if (out) writeFileSync(out, JSON.stringify(runs));
  else print(summarise(runs));
}
