import { enemyPos, ENEMY_STATS } from './content';
import type { NodeType } from './map';
import { createRng } from './rng';
import type { EnemyKind, SpawnDef, WaveDef } from './types';

export interface ActDef {
  act: number;
  name: string;
  /** One line under the act name. */
  theme: string;
  /** The act's look: ground and trees/walls (renderer). */
  look: 'forest' | 'crypt' | 'hellscape';
  melee: EnemyKind[];
  ranged: EnemyKind[];
  healer: EnemyKind;
  fast?: EnemyKind;
  elite: EnemyKind;
  boss: EnemyKind;
}

/** Three acts in a fixed order, each with its own theme and enemies. */
export const ACTS: ActDef[] = [
  {
    act: 1,
    name: 'The Goblin Woods',
    theme: 'Goblin warbands have overrun the forest road.',
    look: 'forest',
    melee: ['grunt'],
    ranged: ['archer'],
    healer: 'shaman',
    elite: 'brute',
    boss: 'warchief',
  },
  {
    act: 2,
    name: 'The Sunken Crypt',
    theme: 'Something stirs beneath the old graveyard.',
    look: 'crypt',
    melee: ['skeleton'],
    ranged: ['boneArcher'],
    healer: 'cultist',
    fast: 'ghoul',
    elite: 'abomination',
    boss: 'boneKing',
  },
  {
    act: 3,
    name: 'The Burning Rift',
    theme: 'A rift to the hells has opened. Close it.',
    look: 'hellscape',
    melee: ['fiend'],
    ranged: ['imp'],
    healer: 'shadowCaller',
    fast: 'hellhound',
    elite: 'pitBrute',
    boss: 'demonLord',
  },
];

export function actDef(act: number): ActDef {
  return ACTS[Math.min(ACTS.length, Math.max(1, act)) - 1];
}

/**
 * Enemy strength (health and damage multiplier) by act and floor. It climbs
 * through each act and steps up at each new act; elites and bosses are their
 * own, tougher units on top.
 */
export const STRENGTH = {
  base: [1.2, 2.35, 3.6],
  perFloor: [0.08, 0.1, 0.16],
  /** Elites are a real risk (for a better reward); bosses stand out. */
  elite: 1.15,
  /** A challenge: like an elite, a bit tougher, plus its twist. */
  challenge: 1.2,
  boss: [1.05, 1, 0.95],
};

export function strengthAt(act: number, floor: number): number {
  const i = Math.min(2, act - 1);
  return STRENGTH.base[i] + STRENGTH.perFloor[i] * floor;
}

/** Smaller parties meet weaker enemies (a lone starting hero, 60%), so every class can start solo. */
export const PARTY_SCALE = [0.6, 0.62, 0.8, 1];

/**
 * How many enemies a fight has: one per hero, plus one from the middle of the
 * act on (a lone starting hero meets one at a time). Capped at 5.
 */
export function enemyCount(partySize: number, floor: number, type: NodeType): number {
  const extra = floor >= 6 ? 1 : 0;
  const n = partySize + (partySize > 1 ? extra : 0);
  return Math.max(1, Math.min(5, n));
}

/**
 * The enemy line-up for a fight node, seeded by the node so a retry or reload
 * meets the same enemies. Melee in the front row, shooters and healers behind.
 */
export function makeEncounter(seed: number, act: number, floor: number, type: NodeType, partySize: number, nodeId: string, extraEnemies = 0): WaveDef {
  const a = actDef(act);
  let h = 0;
  for (const ch of nodeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = createRng(seed * 13 + act * 1009 + h);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const count = Math.min(6, enemyCount(partySize, floor, type) + extraEnemies);
  const kinds: EnemyKind[] = [];
  if (type === 'boss') kinds.push(a.boss);
  if (type === 'elite' || type === 'challenge') kinds.push(a.elite);
  // Fill the rest from the act's regulars: mostly melee, then shooters; a healer
  // from floor 3 (never two); a fast hunter now and then.
  while (kinds.length < count) {
    const r = rng();
    const healers = kinds.filter((k) => k === a.healer).length;
    if (r < 0.15 && floor >= 3 && healers === 0 && kinds.length > 0) kinds.push(a.healer);
    else if (r < 0.4 && kinds.length > 0) kinds.push(pick(a.ranged));
    else if (r < 0.55 && a.fast) kinds.push(a.fast);
    else kinds.push(pick(a.melee));
  }
  // Lay them out: front row melee, back rows the rest; bosses and elites in the middle front.
  const front: EnemyKind[] = [];
  const back: EnemyKind[] = [];
  for (const k of kinds) (ENEMY_STATS[k].attackStyle === 'melee' ? front : back).push(k);
  const spawns: SpawnDef[] = [];
  const cols = [1, 2, 0, 3];
  front.forEach((k, i) => spawns.push({ time: 0, kind: k, ...enemyPos(cols[i % 4], i < 4 ? (ENEMY_STATS[k].isBoss ? 1 : 0) : 1) }));
  back.forEach((k, i) => spawns.push({ time: 0, kind: k, ...enemyPos(cols[(i + 1) % 4], 2) }));
  const label = type === 'boss' ? `BOSS: ${ENEMY_STATS[a.boss].label}` : type === 'elite' ? `Elite: ${ENEMY_STATS[a.elite].label}` : a.name;
  const scale =
    PARTY_SCALE[Math.min(PARTY_SCALE.length, Math.max(1, partySize)) - 1] * (type === 'elite' ? STRENGTH.elite : type === 'challenge' ? STRENGTH.challenge : type === 'boss' ? STRENGTH.boss[act - 1] : 1);
  return { number: floor + 1, name: label, spawns, strength: strengthAt(act, floor) * scale, boss: type === 'boss' };
}

/** Gold dropped by an enemy kind (before the act multiplier). */
export function goldFor(kind: EnemyKind): number {
  const s = ENEMY_STATS[kind];
  return s.isBoss ? 40 : s.isElite ? 14 : 3;
}

/** Gold, XP and costs. Gold and prices rise a little each act. */
export const ECONOMY = {
  actGold: [1, 1.4, 1.8],
  /** A golden (rich) node pays this much more gold, XP and camp loot (a golden chest also offers 4 options per hero). */
  richBonus: 2,
  richXp: 1.5,
  richLoot: 2,
  chestGold: [20, 34],
  /** XP for a won fight, by node type (10 XP = a level): slow, so the camp's gear is what carries you further. */
  xp: { fight: 4, elite: 7, challenge: 9, boss: 12 } as Partial<Record<NodeType, number>>,
  /** XP for the first level-up; each level after costs xpGrowth more, so a hero who's ahead slows down and the party levels out over time. */
  xpPerLevel: 10,
  xpGrowth: 3,
  prices: { ability: 45, upgrade: 30, reroll: 10 },
  actPrice: [1, 1.3, 1.6],
};
