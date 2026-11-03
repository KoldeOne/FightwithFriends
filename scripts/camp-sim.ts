/**
 * Camp balance: plays one guild's map runs back to back with the AI choosing
 * everything, spending all loot at the camp between runs. Prints how far each
 * run got and how many runs it took to win.
 *
 *   npx vite-node scripts/camp-sim.ts -- [guilds=4] [maxRuns=30]
 */
import { canAfford, drillsCost, GEAR_SLOTS, gearCost, newCamp, upgradeDrills, upgradeGear, type CampState } from '../src/sim/camp';
import type { HeroClass } from '../src/sim/types';
import { playRun } from './simlib';

const args = process.argv.slice(2).filter((a) => a !== '--');
const GUILDS = Number(args[0] ?? 4);
const MAX_RUNS = Number(args[1] ?? 30);

/** Starting heroes, in turn (recruits are the AI's choice). */
const ORDER: HeroClass[] = ['warrior', 'priest', 'mage', 'warlock', 'rogue', 'paladin'];

/** Spend everything: always buy the cheapest affordable upgrade (by Spoils) for the heroes the AI uses. */
function spend(camp: CampState, heroes: HeroClass[]): number {
  let bought = 0;
  for (;;) {
    const options: { spoils: number; buy: () => boolean }[] = [];
    for (const cls of heroes)
      for (const slot of GEAR_SLOTS) {
        const cost = gearCost(slot, camp.gear[cls][slot]);
        if (canAfford(camp.loot, cost)) options.push({ spoils: cost!.spoils ?? 0, buy: () => upgradeGear(camp, cls, slot) });
      }
    const d = drillsCost(camp.drills);
    if (canAfford(camp.loot, d)) options.push({ spoils: d!.spoils ?? 0, buy: () => upgradeDrills(camp) });
    if (!options.length) return bought;
    options.sort((a, b) => a.spoils - b.spoils);
    options[0].buy();
    bought++;
  }
}

/** Position as act*100 + floor (999 = won), as in the best-progress record. */
function progress(rec: ReturnType<typeof playRun>): number {
  if (rec.won) return 999;
  const last = rec.rounds[rec.rounds.length - 1];
  return last ? last.act * 100 + last.floor + 1 : 100;
}

/** Per guild: the run number that first cleared Act 1, Act 2, and won (Infinity if never). */
const firsts: { act1: number; act2: number; win: number }[] = [];
const QUIET = process.env.QUIET === '1';
const byRun: number[][] = []; // progress per run number, across guilds
for (let g = 0; g < GUILDS; g++) {
  const camp = newCamp();
  const line: string[] = [];
  const first = { act1: Infinity, act2: Infinity, win: Infinity };
  for (let r = 1; r <= MAX_RUNS; r++) {
    camp.runs++;
    const rec = playRun(ORDER[(g + r) % ORDER.length], 1000 * g + r, 'ai', camp);
    const p = progress(rec);
    (byRun[r - 1] ??= []).push(p);
    line.push(p === 999 ? 'WIN' : `${Math.floor(p / 100)}-${p % 100}`);
    if (p >= 200) first.act1 = Math.min(first.act1, r);
    if (p >= 300) first.act2 = Math.min(first.act2, r);
    if (p === 999) first.win = Math.min(first.win, r);
    // Spend on every class: the next run may start or recruit any of them.
    spend(camp, ORDER);
  }
  firsts.push(first);
  if (!QUIET) {
    const gear = ORDER.map((c) => `${c[0]}:${GEAR_SLOTS.map((s) => camp.gear[c][s]).join('/')}`).join(' ');
    console.log(`guild ${g}: ${line.join(' ')}\n  gear ${gear} drills ${camp.drills} left ${JSON.stringify(camp.loot)}`);
  }
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s[Math.floor(s.length / 2)];
  return Number.isFinite(m) ? String(m) : `>${MAX_RUNS}`;
};
const pctOf = (xs: number[], f: (x: number) => boolean) => `${Math.round((100 * xs.filter(f).length) / xs.length)}%`;
console.log(`\nfirst run that beat Act 1: median ${median(firsts.map((f) => f.act1))}; Act 2: median ${median(firsts.map((f) => f.act2))}; the whole run: median ${median(firsts.map((f) => f.win))} (${GUILDS} guilds, ${MAX_RUNS} runs)`);
const windows: [number, number][] = [[1, 1], [2, 3], [4, 6], [7, 10], [11, 15], [16, 20], [21, 30]];
for (const [a, b] of windows) {
  if (a > MAX_RUNS) break;
  const xs = byRun.slice(a - 1, Math.min(b, MAX_RUNS)).flat();
  console.log(`runs ${a}-${Math.min(b, MAX_RUNS)}: beat Act 1 ${pctOf(xs, (x) => x >= 200)}, beat Act 2 ${pctOf(xs, (x) => x >= 300)}, win ${pctOf(xs, (x) => x === 999)}`);
}
