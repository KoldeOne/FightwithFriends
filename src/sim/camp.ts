import { CAMP, ENEMY_STATS, GEAR_BONUS, LOOT } from './content';
import { createRng } from './rng';
import { ALL_CLASSES } from './run';
import type { EnemyKind, HeroBuild, HeroClass, Loot } from './types';

/**
 * The camp: the guild's lasting progress between map runs. Every fight's loot
 * (win or lose) is banked here, and the stations turn it into gear and
 * training that every later run starts with. Numbers are first placeholders.
 */
export interface CampState {
  version: 2;
  loot: Loot;
  gear: Record<HeroClass, Gear>;
  /** Training station rank: heroes start each run (and join it) this many levels higher. */
  drills: number;
  runs: number;
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
  return { version: 2, loot: emptyLoot(), gear, drills: 0, runs: 0 };
}

// --- loot -------------------------------------------------------------------

/** Later acts pay more: Act 2 drops twice the Spoils, Act 3 three times. */
export function lootTier(act: number): number {
  return Math.max(1, Math.min(3, act));
}

/**
 * What a fight's kills drop (win or lose). Basic enemies drop Spoils and
 * sometimes a material; elites always drop a material; bosses drop a lot,
 * every material and a Trophy. Raised minions drop nothing. Seeded.
 */
export function lootFor(kills: { kind: EnemyKind; summoned: boolean }[], act: number, seed: number): Loot {
  const rng = createRng(seed);
  const tier = lootTier(act);
  const loot = emptyLoot();
  const material = () => MATERIALS[Math.floor(rng() * MATERIALS.length)];
  for (const k of kills) {
    if (k.summoned) continue;
    const s = ENEMY_STATS[k.kind];
    if (s.isBoss) {
      loot.spoils += LOOT.boss.spoils * tier;
      for (const m of MATERIALS) loot[m] += LOOT.boss.materials;
      loot.trophies += LOOT.boss.trophies;
    } else if (s.isElite) {
      loot.spoils += LOOT.elite.spoils * tier;
      for (let i = 0; i < LOOT.elite.materials; i++) loot[material()] += 1;
    } else {
      loot.spoils += LOOT.basic.spoils * tier;
      if (rng() < LOOT.basic.materialChance * tier) loot[material()] += 1;
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

/** A class's camp gear in numbers, e.g. "Weapon 3 (+12% damage and healing)" (levels above 0 only). */
export function gearLines(gear: Gear): string[] {
  return GEAR_SLOTS.filter((slot) => gear[slot] > 0).map((slot) => `${STATIONS[slot].item} ${gear[slot]} (${STATIONS[slot].effect(gear[slot])})`);
}

/** Short form for small cards: "+12% dmg · +8% HP · +4% regen". */
export function gearShort(gear: Gear): string {
  const parts = [
    gear.weapon ? `+${pct(GEAR_BONUS.weapon * gear.weapon)} dmg` : '',
    gear.armor ? `+${pct(GEAR_BONUS.armor * gear.armor)} HP` : '',
    gear.trinket ? `+${pct(GEAR_BONUS.trinketRegen * gear.trinket)} regen, ${pct(GEAR_BONUS.trinketCooldown * gear.trinket)} CDR` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No upgrades yet';
}

// --- runs -------------------------------------------------------------------

/** The run's builds with each hero's camp gear on (read fresh, so a recruit gets theirs too). */
export function withGear(team: HeroClass[], builds: HeroBuild[], camp: CampState): HeroBuild[] {
  return builds.map((b, i) => ({ ...b, gear: { ...camp.gear[team[i]] } }));
}

/** The level heroes start a run at (and recruits join at): 1 plus the camp's Drills. */
export function startLevel(camp: CampState): number {
  return 1 + camp.drills;
}

/** Multiply a loot bundle (a golden node's camp loot is doubled). */
export function scaleLoot(loot: Loot, k: number): Loot {
  return { spoils: Math.round(loot.spoils * k), ore: Math.round(loot.ore * k), hide: Math.round(loot.hide * k), gems: Math.round(loot.gems * k), trophies: loot.trophies };
}

/** A fight is over (won or lost): its loot goes straight home. */
export function bankLoot(camp: CampState, loot: Loot): void {
  addLoot(camp.loot, loot);
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
    const data = JSON.parse(raw) as Omit<Partial<CampState>, 'version'> & { version?: number };
    // Version 1 was the round-based Camp Mode: its loot, gear and Drills carry over.
    if (data?.version !== 2 && data?.version !== 1) return newCamp();
    // Fill in anything missing (e.g. a class added later).
    const fresh = newCamp();
    return {
      version: 2,
      loot: { ...fresh.loot, ...data.loot },
      gear: { ...fresh.gear, ...data.gear },
      drills: data.drills ?? 0,
      runs: data.runs ?? 0,
    };
  } catch {
    return newCamp();
  }
}
