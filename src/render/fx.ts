import type { AbilityId } from '../sim/types';

/** Spell schools: the colour family a combat effect is drawn in. */
export type School = 'physical' | 'frost' | 'fire' | 'holy' | 'shadow' | 'nature' | 'arcane';

/** Main colour, a lighter accent (sparks, edges) and the CSS colour for its numbers. */
export const SCHOOL_COLORS: Record<School, { main: number; light: number; css: string }> = {
  physical: { main: 0xdfe4ea, light: 0xffffff, css: '#ffffff' },
  frost: { main: 0x4fb3ff, light: 0xbfe6ff, css: '#8fd3ff' },
  fire: { main: 0xff6a1a, light: 0xffc14d, css: '#ff9f1a' },
  holy: { main: 0xffcf3a, light: 0xfff1a8, css: '#ffe28a' },
  shadow: { main: 0x9b4dff, light: 0x8cff5a, css: '#c39bff' },
  nature: { main: 0x5ed13a, light: 0xc6ff7a, css: '#9cff6a' },
  arcane: { main: 0xe07bff, light: 0xffc8f4, css: '#f0a8ff' },
};

const ABILITY_SCHOOL: Partial<Record<AbilityId, School>> = {
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

/** Unit kinds whose plain attacks are magic of a school. */
const KIND_SCHOOL: Record<string, School> = {
  mage: 'fire',
  imp: 'fire',
  hellhound: 'fire',
  demonLord: 'fire',
  priest: 'holy',
  paladin: 'holy',
  warlock: 'shadow',
  cultist: 'shadow',
  shadowCaller: 'shadow',
  shaman: 'shadow',
};

/** The school of an ability, else of the attacker's plain attacks. */
export function schoolOf(ability?: AbilityId, kind?: string): School {
  if (ability) return ABILITY_SCHOOL[ability] ?? 'physical';
  return (kind && KIND_SCHOOL[kind]) || 'physical';
}

/** Most short-lived particles alive at once (mobile budget). */
export const MAX_PARTICLES = 90;
