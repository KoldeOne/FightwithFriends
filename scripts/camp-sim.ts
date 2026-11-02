/**
 * Camp Mode balance: plays one guild's runs back to back with the AI choosing
 * everything, spending all loot at the camp between runs. Prints how far each
 * run got and how many runs it took to unlock each camp and win.
 *
 *   npx vite-node scripts/camp-sim.ts -- [guilds=4] [maxRuns=60]
 */
import { Battle, STEP } from '../src/sim/battle';
import { CAMP, campRound } from '../src/sim/content';
import { bankRound, campRunOver, canAfford, drillsCost, GEAR_SLOTS, gearCost, lootFor, newCamp, newCampRun, upgradeDrills, upgradeGear, withGear, type CampState } from '../src/sim/camp';
import { completeWave, needsRecruit, recruit } from '../src/sim/run';
import type { HeroClass } from '../src/sim/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const GUILDS = Number(args[0] ?? 4);
const MAX_RUNS = Number(args[1] ?? 60);

/** Who the AI takes: a classic trio, then recruits in this order. */
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

function playRun(camp: CampState, seed: number): { start: number; reached: number; won: boolean } {
  const start = Math.max(...camp.unlocked);
  const size = start >= 21 ? 5 : start >= 11 ? 4 : 3;
  const run = newCampRun(ORDER.slice(0, size), start, camp, seed);
  camp.runs++;
  for (;;) {
    while (needsRecruit(run)) recruit(run, ORDER.find((c) => !run.team.includes(c))!);
    const battle = new Battle({ seed: run.seed * 100 + run.wave, wave: campRound(run.wave), team: run.team, builds: withGear(run, camp) });
    while (battle.outcome === 'running' && battle.time < 240) battle.step(STEP);
    const won = battle.outcome === 'victory';
    bankRound(camp, run, lootFor(battle.kills, run.wave, run.seed + run.wave), won);
    if (campRunOver(run, won)) return { start, reached: run.wave, won };
    completeWave(run);
  }
}

const totals: { unlock11: number[]; unlock21: number[]; win: number[]; first: number[] } = { unlock11: [], unlock21: [], win: [], first: [] };
for (let g = 0; g < GUILDS; g++) {
  const camp = newCamp();
  const line: string[] = [];
  for (let r = 1; r <= MAX_RUNS; r++) {
    const res = playRun(camp, 1000 * g + r);
    if (r === 1) totals.first.push(res.reached);
    line.push(`${res.start}->${res.reached}${res.won ? '!' : ''}`);
    if (camp.unlocked.includes(11) && totals.unlock11.length === g) totals.unlock11.push(r);
    if (camp.unlocked.includes(21) && totals.unlock21.length === g) totals.unlock21.push(r);
    spend(camp, ORDER.slice(0, 5));
    if (res.won) {
      totals.win.push(r);
      break;
    }
  }
  const gear = ORDER.slice(0, 3).map((c) => `${c[0]}:${GEAR_SLOTS.map((s) => camp.gear[c][s]).join('/')}`).join(' ');
  console.log(`guild ${g}: ${line.join(' ')}\n  gear ${gear} drills ${camp.drills} left ${JSON.stringify(camp.loot)}`);
}
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
console.log(`\nfirst run reached: ${totals.first.join(', ')} (avg ${avg(totals.first)})`);
console.log(`runs to unlock round 11: ${totals.unlock11.join(', ')} (avg ${avg(totals.unlock11)})`);
console.log(`runs to unlock round 21: ${totals.unlock21.join(', ')} (avg ${avg(totals.unlock21)})`);
console.log(`runs to beat round ${CAMP.finalRound}: ${totals.win.join(', ')} (avg ${avg(totals.win)}) of ${GUILDS} guilds`);
