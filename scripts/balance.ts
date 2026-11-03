/**
 * Balance runner for map runs.
 *
 *   npm run balance                       # every starting class, 20 seeds each, Auto's choices
 *   npm run balance -- --seeds 60 --policy random
 *   npm run balance -- --shard 0/4 --out a.json   # part of the work (for running in parallel)
 *   npm run balance -- --merge a.json b.json ... --summary s.json
 *
 * scripts/balance-parallel.sh [seeds] [outdir] [ai|random] runs it on every core.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_CLASSES } from '../src/sim/run';
import type { HeroClass } from '../src/sim/types';
import { playRun, WIN_POSITION, type PickPolicy, type RunRecord } from './simlib';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};

function runAll(seeds: number, shard: number, shards: number, policy: PickPolicy): RunRecord[] {
  const jobs: { cls: HeroClass; seed: number }[] = [];
  for (const cls of ALL_CLASSES) for (let s = 0; s < seeds; s++) jobs.push({ cls, seed: 1000 + s * 7919 });
  const mine = jobs.filter((_, i) => i % shards === shard);
  const out: RunRecord[] = [];
  const t0 = Date.now();
  for (const [i, j] of mine.entries()) {
    out.push(playRun(j.cls, j.seed, policy));
    if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${mine.length} runs (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface Summary {
  runs: number;
  kpi: { winRate: number; reachAct2: number; reachAct3: number; act1EarlyLoss: number; classSpread: number; meanFights: number; meanMinutes: number };
  starts: { cls: string; runs: number; winRate: number; reachAct2: number; reachAct3: number }[];
  /** Where runs end: loss rate per act and node type. */
  losses: { act: number; type: string; fights: number; lossRate: number; meanSeconds: number }[];
  /** Losses by floor in Act 1 (the solo and small-party stretch). */
  act1Floors: { floor: number; fights: number; lossRate: number }[];
  classes: { cls: string; dmgShare: number; healShare: number; takenShare: number; deathsPerFight: number }[];
  abilities: { id: string; owners: number; usesPerOwnerFight: number; damagePerUse: number }[];
  picks: { cls: string; pick: string; n: number; value: number }[];
  nodeMix: Record<string, number>;
  violations: string[];
}

export function summarise(runs: RunRecord[]): Summary {
  const share = (xs: RunRecord[], f: (r: RunRecord) => boolean) => xs.filter(f).length / Math.max(1, xs.length);
  const starts = ALL_CLASSES.map((cls) => {
    const xs = runs.filter((r) => r.team[0] === cls);
    return { cls, runs: xs.length, winRate: share(xs, (r) => r.won), reachAct2: share(xs, (r) => r.act >= 2), reachAct3: share(xs, (r) => r.act >= 3) };
  });
  const fights = runs.flatMap((r) => r.rounds);
  const losses: Summary['losses'] = [];
  for (const act of [1, 2, 3])
    for (const type of ['fight', 'elite', 'boss']) {
      const xs = fights.filter((f) => f.act === act && f.type === type);
      if (xs.length) losses.push({ act, type, fights: xs.length, lossRate: xs.filter((x) => !x.won).length / xs.length, meanSeconds: mean(xs.map((x) => x.seconds)) });
    }
  const act1Floors: Summary['act1Floors'] = [];
  for (let floor = 0; floor < 13; floor++) {
    const xs = fights.filter((f) => f.act === 1 && f.floor === floor);
    if (xs.length) act1Floors.push({ floor: floor + 1, fights: xs.length, lossRate: xs.filter((x) => !x.won).length / xs.length });
  }
  // Class shares of the party's damage, healing and damage taken (1.0 = an equal share).
  const cls = new Map<string, { dmg: number[]; heal: number[]; taken: number[]; deaths: number; n: number }>();
  for (const rd of fights) {
    const tot = (f: (h: (typeof rd.heroes)[number]) => number) => rd.heroes.reduce((a, h) => a + f(h), 0) || 1;
    const n = rd.heroes.length;
    for (const h of rd.heroes) {
      const c = cls.get(h.cls) ?? { dmg: [], heal: [], taken: [], deaths: 0, n: 0 };
      c.dmg.push((h.damage / tot((x) => x.damage)) * n);
      c.heal.push((h.healing / tot((x) => x.healing)) * n);
      c.taken.push((h.taken / tot((x) => x.taken)) * n);
      c.deaths += h.deaths;
      c.n++;
      cls.set(h.cls, c);
    }
  }
  const classes = [...cls.entries()].map(([k, c]) => ({ cls: k, dmgShare: mean(c.dmg), healShare: mean(c.heal), takenShare: mean(c.taken), deathsPerFight: c.deaths / c.n }));
  const owned: Record<string, number> = {};
  const uses: Record<string, number> = {};
  const dmg: Record<string, number> = {};
  for (const rd of fights) {
    for (const [k, v] of Object.entries(rd.owned ?? {})) owned[k] = (owned[k] ?? 0) + v;
    for (const [k, v] of Object.entries(rd.abilities)) uses[k] = (uses[k] ?? 0) + v;
    for (const [k, v] of Object.entries(rd.abilityDamage ?? {})) dmg[k] = (dmg[k] ?? 0) + v;
  }
  const abilities = Object.keys(owned)
    .map((id) => ({ id, owners: owned[id], usesPerOwnerFight: (uses[id] ?? 0) / owned[id], damagePerUse: uses[id] ? (dmg[id] ?? 0) / uses[id] : 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  // Pick value, controlled for survivorship: compare picks made at the same position.
  const events = runs.flatMap((r) => r.picks.map((p) => ({ ...p, score: r.reached - p.round })));
  const base = new Map<string, number[]>();
  for (const e of events) base.set(`${e.cls}@${e.round}`, [...(base.get(`${e.cls}@${e.round}`) ?? []), e.score]);
  const baseMean = new Map([...base.entries()].map(([k, v]) => [k, mean(v)]));
  const byPick = new Map<string, number[]>();
  for (const e of events) byPick.set(`${e.cls}|${e.pick}`, [...(byPick.get(`${e.cls}|${e.pick}`) ?? []), e.score - (baseMean.get(`${e.cls}@${e.round}`) ?? 0)]);
  const picks = [...byPick.entries()]
    .map(([k, v]) => ({ cls: k.split('|')[0], pick: k.split('|')[1], n: v.length, value: mean(v) }))
    .sort((a, b) => a.cls.localeCompare(b.cls) || b.value - a.value);
  const nodeMix: Record<string, number> = {};
  for (const r of runs) for (const t of r.path) nodeMix[t] = (nodeMix[t] ?? 0) + 1;
  const early = fights.filter((f) => f.act === 1 && f.floor < 6);
  const winRates = starts.map((s) => s.winRate);
  return {
    runs: runs.length,
    kpi: {
      winRate: share(runs, (r) => r.won),
      reachAct2: share(runs, (r) => r.act >= 2),
      reachAct3: share(runs, (r) => r.act >= 3),
      act1EarlyLoss: early.filter((f) => !f.won).length / Math.max(1, early.length),
      classSpread: Math.max(...winRates) - Math.min(...winRates),
      meanFights: mean(runs.map((r) => r.rounds.length)),
      meanMinutes: mean(runs.map((r) => r.rounds.reduce((a, x) => a + x.seconds, 0) / 60)),
    },
    starts,
    losses,
    act1Floors,
    classes,
    abilities,
    picks,
    nodeMix,
    violations: [...new Set(runs.flatMap((r) => r.violations))].slice(0, 100),
  };
}

function print(s: Summary): void {
  const f = (n: number, d = 1) => n.toFixed(d);
  const pc = (n: number) => `${f(n * 100, 0)}%`;
  const k = s.kpi;
  console.log(`\n${s.runs} runs. Win ${pc(k.winRate)} · reach Act 2 ${pc(k.reachAct2)} · reach Act 3 ${pc(k.reachAct3)} · Act 1 floors 1-6 fights lost ${pc(k.act1EarlyLoss)} · start-class spread ${pc(k.classSpread)} · ${f(k.meanFights)} fights, ${f(k.meanMinutes)} fight-minutes a run\n`);
  console.log('Starting class: win / reach Act 2 / reach Act 3');
  for (const x of s.starts) console.log(`  ${x.cls.padEnd(9)} ${pc(x.winRate).padStart(4)}  ${pc(x.reachAct2).padStart(4)}  ${pc(x.reachAct3).padStart(4)}   (${x.runs} runs)`);
  console.log('\nFights lost, by act and node:');
  for (const x of s.losses) console.log(`  Act ${x.act} ${x.type.padEnd(6)} ${pc(x.lossRate).padStart(4)} of ${x.fights}  (${f(x.meanSeconds, 0)}s)`);
  console.log('\nAct 1 by floor (fights lost):');
  console.log('  ' + s.act1Floors.map((x) => `${x.floor}:${pc(x.lossRate)}`).join('  '));
  console.log('\nClasses (shares: 1.0 = an equal share of the party total):');
  for (const c of s.classes) console.log(`  ${c.cls.padEnd(9)} dmg ${f(c.dmgShare, 2)}  heal ${f(c.healShare, 2)}  taken ${f(c.takenShare, 2)}  deaths/fight ${f(c.deathsPerFight, 3)}`);
  console.log('\nNode mix (visits): ' + Object.entries(s.nodeMix).map(([t, n]) => `${t} ${n}`).join(', '));
  if (s.picks.length) {
    console.log('\nPick value (positions gained vs other picks at the same spot; n = times taken):');
    let cls = '';
    for (const p of s.picks) {
      if (p.n < 15) continue;
      if (p.cls !== cls) console.log(`  ${(cls = p.cls)}`);
      console.log(`    ${p.pick.padEnd(26)} ${(p.value >= 0 ? '+' : '') + f(p.value, 1)}   n=${p.n}`);
    }
  }
  console.log(`\nInvariant violations: ${s.violations.length}`);
  for (const v of s.violations.slice(0, 20)) console.log('  ' + v);
  void WIN_POSITION;
}

if (args.includes('--merge')) {
  const rest = args.slice(args.indexOf('--merge') + 1);
  const end = rest.findIndex((a) => a.startsWith('--'));
  const files = end < 0 ? rest : rest.slice(0, end);
  const runs = files.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as RunRecord[]);
  const s = summarise(runs);
  print(s);
  const out = opt('summary', '');
  if (out) writeFileSync(out, JSON.stringify(s, null, 1));
} else {
  const [shard, shards] = opt('shard', '0/1').split('/').map(Number);
  const runs = runAll(Number(opt('seeds', '20')), shard, shards, opt('policy', 'ai') as PickPolicy);
  const out = opt('out', '');
  if (out) writeFileSync(out, JSON.stringify(runs));
  else print(summarise(runs));
}
