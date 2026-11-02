import { CAMP, ENEMY_STATS, GEAR_BONUS } from './content';
import { createRng } from './rng';
import { completeWave, newRun, ALL_CLASSES, type RunState } from './run';
import type { EnemyKind, HeroBuild, HeroClass, Loot } from './types';

/**
 * Camp Mode's lasting progress: loot, each hero's gear and the guild's
 * training. A run ends at the first defeat; everything it looted is kept.
 * All numbers here are first placeholders to tune.
 */
export interface CampState {
  version: 1;
  loot: Loot;
  gear: Record<HeroClass, Gear>;
  /** Training station rank: heroes start each run this many levels higher. */
  drills: number;
  /** Rounds a run can start from (1, then 11 and 21 once their bosses are beaten). */
  unlocked: number[];
  /** Highest round reached in Camp Mode. */
  best: number;
  runs: number;
  /** Times round 30 was beaten. */
  wins: number;
}

export type GearSlot = 'weapon' | 'armor' | 'trinket';
export type Gear = Record<GearSlot, number>;
export type Material = 'ore' | 'hide' | 'gems';

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'trinket'];
export const MATERIALS: Material[] = ['ore', 'hide', 'gems'];

/** The three hero stations: who works on what, and which material it takes. */
export const STATIONS: Record<GearSlot, { station: string; item: string; material: Material; effect: (lv: number) => string }> = {
  weapon: { station: 'Blacksmith', item: 'Weapon', material: 'ore', effect: (lv) => `+${pct(GEAR_BONUS.weapon * lv)} damage and healing` },
  armor: { station: 'Armorer', item: 'Armor', material: 'hide', effect: (lv) => `+${pct(GEAR_BONUS.armor * lv)} maximum health` },
  trinket: {
    station: 'Jeweler',
    item: 'Trinket',
    material: 'gems',
    effect: (lv) => `+${pct(GEAR_BONUS.trinketRegen * lv)} mana/energy regen, ${pct(GEAR_BONUS.trinketCooldown * lv)} faster cooldowns`,
  },
};

export const LOOT_NAMES: Record<keyof Loot, string> = { spoils: 'Spoils', ore: 'Ore', hide: 'Hide', gems: 'Gems', trophies: 'Trophies' };

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function emptyLoot(): Loot {
  return { spoils: 0, ore: 0, hide: 0, gems: 0, trophies: 0 };
}

export function newCamp(): CampState {
  const gear = {} as Record<HeroClass, Gear>;
  for (const cls of ALL_CLASSES) gear[cls] = { weapon: 0, armor: 0, trinket: 0 };
  return { version: 1, loot: emptyLoot(), gear, drills: 0, unlocked: [1], best: 0, runs: 0, wins: 0 };
}

// --- loot -------------------------------------------------------------------

/** Later camps pay more: rounds 11-20 drop twice the Spoils, rounds 21+ three times. */
export function lootTier(round: number): number {
  return round <= 10 ? 1 : round <= 20 ? 2 : 3;
}

/**
 * What a round's kills drop (win or lose). Basic enemies drop Spoils and
 * sometimes a material; elites always drop a material; bosses drop a lot,
 * every material and a Trophy. Raised minions drop nothing. Seeded.
 */
export function lootFor(kills: { kind: EnemyKind; summoned: boolean }[], round: number, seed: number): Loot {
  const rng = createRng(seed);
  const tier = lootTier(round);
  const loot = emptyLoot();
  const material = () => MATERIALS[Math.floor(rng() * MATERIALS.length)];
  for (const k of kills) {
    if (k.summoned) continue;
    const s = ENEMY_STATS[k.kind];
    if (s.isBoss) {
      loot.spoils += 25 * tier;
      for (const m of MATERIALS) loot[m] += 1;
      loot.trophies += 1;
    } else if (s.isElite) {
      loot.spoils += 6 * tier;
      loot[material()] += 1;
    } else {
      loot.spoils += 2 * tier;
      if (rng() < 0.12 * tier) loot[material()] += 1;
    }
  }
  return loot;
}

export function addLoot(into: Loot, more: Loot): void {
  for (const k of Object.keys(into) as (keyof Loot)[]) into[k] += more[k];
}

export function lootText(loot: Loot): string {
  const parts = (Object.keys(loot) as (keyof Loot)[]).filter((k) => loot[k] > 0).map((k) => `${loot[k]} ${LOOT_NAMES[k]}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

// --- stations ---------------------------------------------------------------

/** The cost of the next gear level: Spoils plus the station's material; every 5th level also takes a Trophy. */
export function gearCost(slot: GearSlot, level: number): Partial<Loot> | null {
  if (level >= CAMP.maxGearLevel) return null;
  const next = level + 1;
  return { spoils: 10 * next + 3 * next * next, [STATIONS[slot].material]: next, trophies: next % 5 === 0 ? 1 : 0 };
}

/** Training station (placeholder): each rank of Drills starts heroes 1 level higher. Takes a Trophy. */
export function drillsCost(rank: number): Partial<Loot> | null {
  if (rank >= CAMP.maxDrills) return null;
  return { spoils: 60 * (rank + 1), trophies: 1 };
}

export function canAfford(loot: Loot, cost: Partial<Loot> | null): boolean {
  if (!cost) return false;
  return (Object.keys(cost) as (keyof Loot)[]).every((k) => loot[k] >= (cost[k] ?? 0));
}

function pay(loot: Loot, cost: Partial<Loot>): void {
  for (const k of Object.keys(cost) as (keyof Loot)[]) loot[k] -= cost[k] ?? 0;
}

export function costText(cost: Partial<Loot> | null): string {
  if (!cost) return 'Max level';
  return (Object.keys(cost) as (keyof Loot)[])
    .filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${cost[k]} ${LOOT_NAMES[k]}`)
    .join(', ');
}

/** Buy the next level of a hero's gear. False if it can't be afforded (or is maxed). */
export function upgradeGear(camp: CampState, cls: HeroClass, slot: GearSlot): boolean {
  const cost = gearCost(slot, camp.gear[cls][slot]);
  if (!cost || !canAfford(camp.loot, cost)) return false;
  pay(camp.loot, cost);
  camp.gear[cls][slot] += 1;
  return true;
}

export function upgradeDrills(camp: CampState): boolean {
  const cost = drillsCost(camp.drills);
  if (!cost || !canAfford(camp.loot, cost)) return false;
  pay(camp.loot, cost);
  camp.drills += 1;
  return true;
}

// --- runs -------------------------------------------------------------------

/**
 * A Camp Mode run from one of the camp's starting rounds. Starting further in,
 * the heroes begin at the level (and with the auto-picked rewards) they would
 * have had getting there, plus the camp's Drills.
 */
export function newCampRun(team: HeroClass[], start: number, camp: CampState, seed = Date.now() % 1_000_000): RunState {
  const run = newRun(team, seed);
  while (run.wave < start) completeWave(run);
  for (const b of run.builds) b.level += camp.drills;
  run.mode = 'camp';
  run.lives = 1;
  run.startRound = start;
  run.loot = emptyLoot();
  return run;
}

/** The run's builds with each hero's camp gear on (gear is read fresh, so a recruit gets theirs too). */
export function withGear(run: RunState, camp: CampState): HeroBuild[] {
  return run.builds.map((b, i) => ({ ...b, gear: { ...camp.gear[run.team[i]] } }));
}

/** A round is over (won or lost): its loot goes straight home, and beating a boss opens the next camp. */
export function bankRound(camp: CampState, run: RunState, loot: Loot, won: boolean): void {
  addLoot(camp.loot, loot);
  run.loot ??= emptyLoot();
  addLoot(run.loot, loot);
  const reached = won ? run.wave : run.wave - 1;
  camp.best = Math.max(camp.best, reached);
  if (won) {
    const next = run.wave + 1;
    if (CAMP.starts.includes(next) && !camp.unlocked.includes(next)) camp.unlocked.push(next);
    if (run.wave === CAMP.finalRound) camp.wins += 1;
  }
}

/** Does the run end after this round? (Any defeat, or beating the final round.) */
export function campRunOver(run: RunState, won: boolean): boolean {
  return !won || run.wave >= CAMP.finalRound;
}

// --- saving -------------------------------------------------------------------

const CAMP_KEY = 'fightwithfriends.camp.v1';

export function saveCamp(camp: CampState): void {
  try {
    localStorage.setItem(CAMP_KEY, JSON.stringify(camp));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

export function loadCamp(): CampState {
  try {
    const raw = localStorage.getItem(CAMP_KEY);
    if (!raw) return newCamp();
    const data = JSON.parse(raw) as CampState;
    if (data?.version !== 1) return newCamp();
    // Fill in anything missing (e.g. a class added later).
    const fresh = newCamp();
    return { ...fresh, ...data, loot: { ...fresh.loot, ...data.loot }, gear: { ...fresh.gear, ...data.gear } };
  } catch {
    return newCamp();
  }
}
