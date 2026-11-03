/**
 * Camp balance: plays one guild's map runs back to back with the AI choosing
 * everything, spending all loot at the camp between runs. Prints how far each
 * run got and how many runs it took to win.
 *
 *   npx vite-node scripts/camp-sim.ts -- [guilds=4] [maxRuns=30]
 */
import { canAfford, drillsCost, GEAR_SLOTS, gearCost, newCamp, upgradeDrills, upgradeGear, type CampState } from '../src/sim/camp';
import { describeProgress } from '../src/sim/run';
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

const totals: { first: number[]; win: number[]; wins: number[] } = { first: [], win: [], wins: [] };
for (let g = 0; g < GUILDS; g++) {
  const camp = newCamp();
  const line: string[] = [];
  let wins = 0;
  for (let r = 1; r <= MAX_RUNS; r++) {
    camp.runs++;
    const rec = playRun(ORDER[(g + r) % ORDER.length], 1000 * g + r, 'ai', camp);
    const p = progress(rec);
    if (r === 1) totals.first.push(p);
    line.push(p === 999 ? 'WIN' : `${Math.floor(p / 100)}-${p % 100}`);
    if (rec.won && !wins) totals.win.push(r);
    if (rec.won) wins++;
    // Spend on every class: the next run may start or recruit any of them.
    spend(camp, ORDER);
  }
  totals.wins.push(wins);
  const gear = ORDER.map((c) => `${c[0]}:${GEAR_SLOTS.map((s) => camp.gear[c][s]).join('/')}`).join(' ');
  console.log(`guild ${g}: ${line.join(' ')}\n  gear ${gear} drills ${camp.drills} left ${JSON.stringify(camp.loot)}`);
}
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
console.log(`\nfirst run reached: ${totals.first.map(describeProgress).join('; ')}`);
console.log(`runs to the first win: ${totals.win.join(', ')} (avg ${avg(totals.win)}; ${totals.win.length} of ${GUILDS} guilds won within ${MAX_RUNS})`);
console.log(`wins per guild: ${totals.wins.join(', ')} of ${MAX_RUNS} runs`);
