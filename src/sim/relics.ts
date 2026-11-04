import type { AbilityId, HeroBuild } from './types';

/**
 * Builds that click: spell schools and attunement, and relics.
 *
 * - Every ability has a school (physical, fire, frost, holy, shadow, arcane).
 *   The party is **attuned** to a school by how many of its abilities belong
 *   to it, across every hero: 2 give +8% damage and healing with that school,
 *   4 give +18%, 6 give +30%. Charm relics count as two more.
 * - **Relics** are run-wide modifiers for the whole party, offered at elites,
 *   golden chests and shops. Some start in the pool; the rest are discovered
 *   at the camp's Training Ground.
 *
 * All numbers are first placeholders.
 */

export type School = 'physical' | 'frost' | 'fire' | 'holy' | 'shadow' | 'nature' | 'arcane';

/** Each ability's school (anything not listed is physical). */
export const ABILITY_SCHOOL: Partial<Record<AbilityId, School>> = {
  frostNova: 'frost',
  blizzard: 'frost',
  iceLance: 'frost',
  counterspell: 'frost',
  fireball: 'fire',
  heal: 'holy',
  renew: 'holy',
  fortitude: 'holy',
  powerShield: 'holy',
  guardianSpirit: 'holy',
  holyNova: 'holy',
  chainOfLight: 'holy',
  judgement: 'holy',
  radiantLight: 'holy',
  hallowedGround: 'holy',
  mercy: 'holy',
  hammerOfJustice: 'holy',
  exorcism: 'holy',
  hexBolt: 'shadow',
  wither: 'shadow',
  soulDrain: 'shadow',
  enfeeble: 'shadow',
  doom: 'shadow',
  curseOfRuin: 'shadow',
  arcaneBarrage: 'arcane',
  polymorph: 'arcane',
};

export function abilitySchool(id: AbilityId): School {
  return ABILITY_SCHOOL[id] ?? 'physical';
}

export const SCHOOL_NAMES: Record<School, string> = { physical: 'Steel', frost: 'Frost', fire: 'Fire', holy: 'Light', shadow: 'Shadow', nature: 'Nature', arcane: 'Arcane' };

/** Attunement steps: this many abilities of a school give this much more damage and healing with it. */
export const ATTUNEMENT: { at: number; bonus: number }[] = [
  { at: 2, bonus: 0.08 },
  { at: 4, bonus: 0.18 },
  { at: 6, bonus: 0.3 },
];

export function attuneBonus(count: number): number {
  let bonus = 0;
  for (const step of ATTUNEMENT) if (count >= step.at) bonus = step.bonus;
  return bonus;
}

// --- relics ---------------------------------------------------------------------

export type RelicId =
  | 'whetstone'
  | 'ironSkin'
  | 'glassCannon'
  | 'thornMail'
  | 'luckyCoin'
  | 'scholarsTome'
  | 'steelCharm'
  | 'emberCharm'
  | 'bloodstone'
  | 'healingSpring'
  | 'hourglass'
  | 'manaSpring'
  | 'frostCharm'
  | 'sunCharm'
  | 'hexCharm';

export interface RelicDef {
  name: string;
  text: string;
  /** Icon colour. */
  color: number;
  /** A charm: counts as two more abilities of this school for attunement. */
  charm?: School;
}

export const RELIC_TUNING = {
  whetstone: 0.25,
  ironSkin: 0.15,
  glassCannon: { dealt: 0.3, taken: 0.2 },
  thornMail: 0.25,
  luckyCoin: 0.3,
  scholarsTome: 0.25,
  charm: 2,
  bloodstone: 0.08,
  healingSpring: 0.015,
  hourglass: 0.15,
  manaSpring: 0.3,
};

export const RELICS: Record<RelicId, RelicDef> = {
  whetstone: { name: 'Whetstone', text: 'Auto-attacks deal 25% more damage.', color: 0xb8bcc6 },
  ironSkin: { name: 'Iron Skin', text: 'Every hero has 15% more maximum health.', color: 0x8a8f99 },
  glassCannon: { name: 'Glass Cannon', text: 'Heroes deal 30% more damage, but take 20% more.', color: 0x9ad1ff },
  thornMail: { name: 'Thorn Mail', text: 'Enemies that hit a hero in melee take 25% of the damage back.', color: 0x5e8a3a },
  luckyCoin: { name: 'Lucky Coin', text: 'Fights pay 30% more gold.', color: 0xffd166 },
  scholarsTome: { name: "Scholar's Tome", text: 'Fights give 25% more XP.', color: 0x7a5232 },
  steelCharm: { name: 'Steel Charm', text: 'Counts as two more Steel (physical) abilities for attunement.', color: 0xdfe4ea, charm: 'physical' },
  emberCharm: { name: 'Ember Charm', text: 'Counts as two more Fire abilities for attunement.', color: 0xff6a1a, charm: 'fire' },
  bloodstone: { name: 'Bloodstone', text: 'A hero who lands a killing blow heals 8% of their maximum health.', color: 0xa83232 },
  healingSpring: { name: 'Healing Spring', text: 'Every hero recovers 1.5% of their maximum health each second.', color: 0x4ac27a },
  hourglass: { name: 'Hourglass', text: 'Cooldowns recover 15% faster.', color: 0xe0a83a },
  manaSpring: { name: 'Mana Spring', text: 'Mana and energy regenerate 30% faster.', color: 0x4dc3ff },
  frostCharm: { name: 'Frost Charm', text: 'Counts as two more Frost abilities for attunement.', color: 0x4fb3ff, charm: 'frost' },
  sunCharm: { name: 'Sun Charm', text: 'Counts as two more Light abilities for attunement.', color: 0xffcf3a, charm: 'holy' },
  hexCharm: { name: 'Hex Charm', text: 'Counts as two more Shadow abilities for attunement.', color: 0x9b4dff, charm: 'shadow' },
};

export const RELIC_IDS = Object.keys(RELICS) as RelicId[];

/** In the pool from the start. */
export const STARTING_RELICS: RelicId[] = ['whetstone', 'ironSkin', 'glassCannon', 'thornMail', 'luckyCoin', 'scholarsTome', 'steelCharm', 'emberCharm'];

/** The rest are discovered at the camp's Training Ground, for this. */
export const RELIC_DISCOVERY_COST = { spoils: 90, trophies: 1 };

/** The party's attunement count per school (abilities across every hero, plus charms). */
export function attunementCounts(builds: { abilities: { id: AbilityId }[] }[], relics: RelicId[] = []): Partial<Record<School, number>> {
  const counts: Partial<Record<School, number>> = {};
  for (const b of builds) for (const a of b.abilities) counts[abilitySchool(a.id)] = (counts[abilitySchool(a.id)] ?? 0) + 1;
  for (const r of relics) {
    const s = RELICS[r].charm;
    if (s) counts[s] = (counts[s] ?? 0) + RELIC_TUNING.charm;
  }
  return counts;
}

/** "Fire 3 (+8%) · Light 4 (+18%)": the schools that give a bonus. */
export function attunementLine(builds: HeroBuild[], relics: RelicId[] = []): string {
  const counts = attunementCounts(builds, relics);
  return (Object.entries(counts) as [School, number][])
    .filter(([, n]) => attuneBonus(n) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${SCHOOL_NAMES[s]} ${n} (+${Math.round(attuneBonus(n) * 100)}%)`)
    .join(' · ');
}
