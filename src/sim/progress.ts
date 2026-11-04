import { CLASS_POOL, HERO_KIT } from './content';
import type { EnemyKind, HeroClass, Loot } from './types';

/**
 * Long-term progression between runs: difficulty tiers, ability unlocks, Training Ground perks, the camp's records (trophy wall and
 * graveyard) and the Random Challenge. All numbers are first placeholders.
 */

// --- difficulty tiers -----------------------------------------------------------

/** Each tier adds one rule on top of the ones below it, and pays more camp loot. */
export const TIERS: { name: string; rule: string }[] = [
  { name: 'Normal', rule: 'The standard run.' },
  { name: 'Tier 1', rule: 'Elites are 15% tougher.' },
  { name: 'Tier 2', rule: 'Enemies drop 20% less gold.' },
  { name: 'Tier 3', rule: 'Every enemy is 10% tougher.' },
  { name: 'Tier 4', rule: 'Your heroes heal 15% less.' },
  { name: 'Tier 5', rule: 'One more enemy in every fight from floor 4.' },
];
export const MAX_TIER = TIERS.length - 1;

/** Extra camp loot per tier (+25% each). */
export const TIER_LOOT = 0.25;

/** What a tier changes, all its rules together. */
export function tierRules(tier: number): { eliteStrength: number; strength: number; gold: number; healing: number; extraEnemies: number } {
  return {
    eliteStrength: tier >= 1 ? 1.15 : 1,
    gold: tier >= 2 ? 0.8 : 1,
    strength: tier >= 3 ? 1.1 : 1,
    healing: tier >= 4 ? 0.85 : 1,
    extraEnemies: tier >= 5 ? 1 : 0,
  };
}

// --- ability unlocks --------------------------------------------------------------

/** Each class starts with this many of its pool (its first ability choices included); every boss beaten with it in the party unlocks one more. */
export const STARTING_POOL = 4;

/** A class's pool entries still locked, given how many bosses it has helped beat. */
export function lockedPool(cls: HeroClass, bossesBeaten: number): string[] {
  const pool = CLASS_POOL[cls].filter((id) => id !== HERO_KIT[cls].starting);
  return pool.slice(STARTING_POOL + bossesBeaten);
}

// --- Training Ground perks ---------------------------------------------------------

export type PerkId = 'purse' | 'haggler' | 'mentor' | 'charm';

/** Bought once each with Spoils and Trophies; every later run starts with them (not a Random Challenge). */
export const PERKS: Record<PerkId, { name: string; text: string; cost: Partial<Loot> }> = {
  purse: { name: 'Coin Purse', text: 'Start every run with 50 gold.', cost: { spoils: 60, trophies: 1 } },
  haggler: { name: 'Haggler', text: 'The first reroll in every shop is free.', cost: { spoils: 80, trophies: 1 } },
  mentor: { name: 'Mentor', text: 'Training campsites offer 4 choices instead of 3.', cost: { spoils: 140, trophies: 2 } },
  charm: { name: 'Lucky Charm', text: 'Start every run holding a wish.', cost: { spoils: 180, trophies: 2 } },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

// --- the camp's records -----------------------------------------------------------

/** One fallen (or finished) run, for the graveyard. */
export interface Grave {
  /** When it ended (ms since 1970). */
  at: number;
  team: HeroClass[];
  levels: number[];
  /** act * 100 + floor; 999 = won. */
  reached: number;
  tier: number;
  won: boolean;
  challenge?: boolean;
}

/** How many graves the graveyard keeps (newest first). */
export const MAX_GRAVES = 12;

/** Records the camp keeps between runs (part of the camp save). */
export interface Records {
  /** Highest tier you can choose (one above the highest you've won on). */
  tier: number;
  /** Runs won, per tier. */
  tierWins: number[];
  perks: PerkId[];
  /** Bosses killed, by kind: the trophy wall. */
  bossKills: Partial<Record<EnemyKind, number>>;
  /** Bosses beaten with each class in the party: unlocks its abilities. */
  classBosses: Partial<Record<HeroClass, number>>;
  graves: Grave[];
}

export function newRecords(): Records {
  return { tier: 0, tierWins: [], perks: [], bossKills: {}, classBosses: {}, graves: [] };
}

/** Locked pool entries for every class (the run keeps this list). */
export function lockedAbilities(r: Records): string[] {
  return (Object.keys(CLASS_POOL) as HeroClass[]).flatMap((cls) => lockedPool(cls, r.classBosses[cls] ?? 0));
}

// --- the Random Challenge ---------------------------------------------------------

const CHALLENGE_KEY = 'fightwithfriends.challenge';

/** Your best Random Challenge result (act * 100 + floor; 999 = won), if you've played one. */
export function challengeBest(): { reached: number; team: HeroClass[] } | undefined {
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY);
    return raw ? (JSON.parse(raw) as { reached: number; team: HeroClass[] }) : undefined;
  } catch {
    return undefined;
  }
}

/** Keep a challenge result if it's your best. Returns true if it is. */
export function recordChallenge(reached: number, team: HeroClass[]): boolean {
  try {
    if ((challengeBest()?.reached ?? -1) >= reached) return false;
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify({ reached, team }));
    return true;
  } catch {
    return false;
  }
}
