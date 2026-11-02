import type { AbilityId, EnemyKind, HeroClass, PassiveId, ResourceKind, SpawnDef, Tile, TraitId, Unit, WaveDef } from './types';

/** World is a fixed portrait canvas; the renderer scales it to the screen. */
export const WORLD = {
  width: 540,
  height: 960,
  /** Top edge of the HUD panel. */
  hudTop: 810,
  spawnY: -24,
};

/** The arena floor: units stay between these heights. */
export const ARENA = { top: 104, bottom: 790 };

/**
 * The board: each side has 4 columns x 3 rows of tiles. Row 0 is the front row
 * (closest to the middle). Enemies stand at the top, heroes at the bottom.
 */
export const BOARD = {
  cols: 4,
  rows: 3,
  colX: [90, 210, 330, 450],
  heroRowY: [560, 645, 730],
  enemyRowY: [360, 275, 190],
  tileW: 112,
  tileH: 80,
};

export function heroTilePos(t: Tile): { x: number; y: number } {
  return { x: BOARD.colX[t.col], y: BOARD.heroRowY[t.row] };
}

export function enemyTilePos(t: Tile): { x: number; y: number } {
  return { x: BOARD.colX[t.col], y: BOARD.enemyRowY[t.row] };
}

/** The hero tile under a point, or null. */
export function heroTileAt(x: number, y: number): Tile | null {
  const col = BOARD.colX.findIndex((cx) => Math.abs(x - cx) <= BOARD.tileW / 2);
  const row = BOARD.heroRowY.findIndex((cy) => Math.abs(y - cy) <= BOARD.tileH / 2);
  return col >= 0 && row >= 0 ? { col, row } : null;
}

/**
 * Party size by round: 3 heroes to start, a 4th after beating the round 10
 * boss, a 5th after the round 20 boss. Enemies field the same number.
 */
export function partySize(round: number): number {
  return round <= 10 ? 3 : round <= 20 ? 4 : 5;
}

/** Lives per run: losing a round costs one; the run ends at zero. */
export const START_LIVES = 3;

/** After this many seconds, sudden death: all damage ramps up so fights can't stall. */
export const SUDDEN_DEATH = { after: 60, perSecond: 0.05 };

type UnitStats = Pick<
  Unit,
  'label' | 'radius' | 'maxHp' | 'damage' | 'attackInterval' | 'range' | 'attackStyle' | 'speed' | 'heal' | 'threatMultiplier' | 'isTank' | 'isCaster' | 'isElite' | 'isBoss' | 'ai' | 'spell'
>;

export const HERO_STATS: Record<HeroClass, UnitStats> = {
  warrior: { label: 'Warrior', radius: 22, maxHp: 340, damage: 9, attackInterval: 1.0, range: 14, attackStyle: 'melee', speed: 0, threatMultiplier: 1.5, isTank: true },
  rogue: { label: 'Rogue', radius: 18, maxHp: 210, damage: 10, attackInterval: 0.6, range: 120, attackStyle: 'melee', speed: 0, threatMultiplier: 0.7 },
  mage: { label: 'Mage', radius: 18, maxHp: 170, damage: 20, attackInterval: 1.8, range: 380, attackStyle: 'ranged', speed: 0 },
  priest: { label: 'Priest', radius: 18, maxHp: 190, damage: 5, attackInterval: 1.5, range: 340, attackStyle: 'ranged', speed: 0, heal: 22 },
  paladin: { label: 'Paladin', radius: 21, maxHp: 300, damage: 11, attackInterval: 1.2, range: 14, attackStyle: 'melee', speed: 0, threatMultiplier: 1.3, isTank: true },
  warlock: { label: 'Warlock', radius: 18, maxHp: 180, damage: 14, attackInterval: 1.6, range: 360, attackStyle: 'ranged', speed: 0 },
};

/** Starting spots for a team with a player-controlled hero (tests only). */
export const SPOTS = {
  center: { x: 270, y: 630 },
  front: { x: 270, y: 560 },
  left: { x: 196, y: 628 },
  right: { x: 344, y: 628 },
  back: { x: 270, y: 694 },
};

/**
 * Hero movement. Heroes stay within `leash` of the party's anchor and move at
 * `speed` px/s (goblin grunts: 38, ghouls: 60).
 */
export const HERO_MOVE = { speed: 60, leash: 140 };

/** Who goes up front first: tanks, then melee, then ranged, healers at the back. */
const ROLE_ORDER: HeroClass[] = ['warrior', 'paladin', 'rogue', 'mage', 'warlock', 'priest'];

/** The default starting team for a run (tank, healer, damage). */
export const DEFAULT_TEAM: HeroClass[] = ['warrior', 'priest', 'mage'];

/** One of each class: a battle's team when none is given. */
export const ONE_OF_EACH: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];

/** Front-liners fill the front row; everyone else starts in the back row. */
export const FRONT_LINE: HeroClass[] = ['warrior', 'paladin', 'rogue'];
/** Columns filled first: the middle, then the edges. */
const COL_ORDER = [1, 2, 0, 3];

/** A sensible starting layout: tanks and melee up front, ranged and healers behind. */
export function defaultPlacement(team: HeroClass[]): Tile[] {
  const out: Tile[] = [];
  const used = new Set<string>();
  const order = team.map((cls, slot) => ({ cls, slot })).sort((a, b) => ROLE_ORDER.indexOf(a.cls) - ROLE_ORDER.indexOf(b.cls) || a.slot - b.slot);
  for (const { cls, slot } of order) out[slot] = freeTile(used, FRONT_LINE.includes(cls) ? [0, 1, 2] : [2, 1, 0]);
  return out;
}

/** First free tile, trying rows in the given order. Marks it used. */
export function freeTile(used: Set<string>, rows: number[]): Tile {
  for (const row of rows) {
    for (const col of COL_ORDER) {
      const key = `${col},${row}`;
      if (!used.has(key)) {
        used.add(key);
        return { col, row };
      }
    }
  }
  return { col: 0, row: 0 };
}

/**
 * Where each team member starts. `slot` is the index in `team`. With a
 * player-controlled hero (tests only), that hero stands in the center;
 * otherwise each hero stands on its board tile.
 */
export function formationFor(team: HeroClass[], player?: HeroClass, placement?: Tile[]): { slot: number; cls: HeroClass; x: number; y: number; tile?: Tile }[] {
  const slots = team.map((cls, slot) => ({ slot, cls }));
  const playerSlot = player ? slots.find((s) => s.cls === player) : undefined;
  if (playerSlot) {
    const rest = slots.filter((s) => s !== playerSlot).sort((a, b) => ROLE_ORDER.indexOf(a.cls) - ROLE_ORDER.indexOf(b.cls) || a.slot - b.slot);
    const spots = [SPOTS.front, SPOTS.left, SPOTS.right, SPOTS.back];
    return [{ ...playerSlot, ...SPOTS.center }, ...rest.map((s, i) => ({ ...s, ...spots[i % spots.length] }))];
  }
  const tiles = placement && placement.length === team.length ? placement : defaultPlacement(team);
  return slots.map((s) => ({ ...s, ...heroTilePos(tiles[s.slot]), tile: { ...tiles[s.slot] } }));
}

/**
 * Enemy base stats; each round's `strength` multiplies health and damage.
 * Three factions: goblins, undead, demons. Each has a basic melee, a ranged
 * attacker, a healer, an elite smasher and a boss.
 */
export const ENEMY_STATS: Record<EnemyKind, UnitStats> = {
  // Goblins
  grunt: { label: 'Goblin Grunt', radius: 17, maxHp: 220, damage: 22, attackInterval: 1.3, range: 8, attackStyle: 'melee', speed: 38 },
  archer: { label: 'Goblin Archer', radius: 15, maxHp: 130, damage: 16, attackInterval: 1.8, range: 260, attackStyle: 'ranged', speed: 32 },
  shaman: { label: 'Goblin Shaman', radius: 16, maxHp: 150, damage: 8, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30, isCaster: true, ai: 'healer', spell: 'Mend' },
  brute: { label: 'Goblin Brute', radius: 24, maxHp: 620, damage: 24, attackInterval: 1.6, range: 10, attackStyle: 'melee', speed: 30, isElite: true, ai: 'smasher', spell: 'Smash' },
  warchief: { label: 'Goblin Warchief', radius: 28, maxHp: 1100, damage: 22, attackInterval: 1.4, range: 10, attackStyle: 'melee', speed: 34, isElite: true, isBoss: true, ai: 'smasher', spell: 'Skull Crack' },
  // Undead
  skeleton: { label: 'Skeleton', radius: 17, maxHp: 260, damage: 24, attackInterval: 1.2, range: 8, attackStyle: 'melee', speed: 36 },
  boneArcher: { label: 'Bone Archer', radius: 15, maxHp: 150, damage: 18, attackInterval: 1.7, range: 270, attackStyle: 'ranged', speed: 32 },
  cultist: { label: 'Death Cultist', radius: 16, maxHp: 170, damage: 9, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30, isCaster: true, ai: 'healer', spell: 'Dark Mend' },
  ghoul: { label: 'Ghoul', radius: 15, maxHp: 180, damage: 18, attackInterval: 0.8, range: 6, attackStyle: 'melee', speed: 60 },
  abomination: { label: 'Abomination', radius: 26, maxHp: 760, damage: 28, attackInterval: 1.7, range: 10, attackStyle: 'melee', speed: 28, isElite: true, ai: 'smasher', spell: 'Slam' },
  boneKing: { label: 'The Bone King', radius: 30, maxHp: 1700, damage: 28, attackInterval: 1.4, range: 10, attackStyle: 'melee', speed: 32, isElite: true, isBoss: true, ai: 'smasher', spell: 'Grave Cleave' },
  // Demons
  imp: { label: 'Fire Imp', radius: 14, maxHp: 160, damage: 20, attackInterval: 1.5, range: 280, attackStyle: 'ranged', speed: 40 },
  hellhound: { label: 'Hellhound', radius: 16, maxHp: 220, damage: 22, attackInterval: 0.9, range: 6, attackStyle: 'melee', speed: 65 },
  fiend: { label: 'Fiend', radius: 19, maxHp: 320, damage: 28, attackInterval: 1.2, range: 8, attackStyle: 'melee', speed: 38 },
  shadowCaller: { label: 'Shadow Caller', radius: 16, maxHp: 200, damage: 10, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30, isCaster: true, ai: 'healer', spell: 'Shadow Mend' },
  pitBrute: { label: 'Pit Brute', radius: 27, maxHp: 900, damage: 32, attackInterval: 1.6, range: 10, attackStyle: 'melee', speed: 30, isElite: true, ai: 'smasher', spell: 'Crush' },
  demonLord: { label: 'Demon Lord', radius: 32, maxHp: 1800, damage: 28, attackInterval: 1.4, range: 10, attackStyle: 'melee', speed: 34, isElite: true, isBoss: true, ai: 'smasher', spell: 'Hellfire Slam' },
};

export const RESOURCES: Record<ResourceKind, { label: string; max: number; start: number; regen: number }> = {
  rage: { label: 'Rage', max: 100, start: 0, regen: 0 },
  mana: { label: 'Mana', max: 100, start: 100, regen: 3 },
  energy: { label: 'Energy', max: 100, start: 100, regen: 12 },
};

/** Rage gained per point of damage dealt / taken. */
export const RAGE = { perDealt: 0.6, perTaken: 0.5 };

export interface AbilityDef {
  id: AbilityId;
  name: string;
  cls: HeroClass;
  /** Resource cost (0 = free). */
  cost: number;
  cooldown: number;
  description: string;
}

/** Every ability in the game. Each class starts with one; the rest are earned. */
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  taunt: { id: 'taunt', name: 'Taunt', cls: 'warrior', cost: 0, cooldown: 8, description: 'Forces an enemy to attack you.' },
  heroicStrike: { id: 'heroicStrike', name: 'Heroic Strike', cls: 'warrior', cost: 15, cooldown: 3, description: 'A heavy strike that generates extra threat.' },
  thunderclap: { id: 'thunderclap', name: 'Thunderclap', cls: 'warrior', cost: 20, cooldown: 6, description: 'Damage and high threat to nearby enemies; slows their attacks.' },
  heal: { id: 'heal', name: 'Heal', cls: 'priest', cost: 25, cooldown: 3, description: 'A strong heal on one ally.' },
  renew: { id: 'renew', name: 'Renew', cls: 'priest', cost: 20, cooldown: 3, description: 'Heals an ally over 9 seconds.' },
  fortitude: { id: 'fortitude', name: 'Power Word: Fortitude', cls: 'priest', cost: 0, cooldown: 30, description: "Raises the whole party's maximum health by 20% for 30s." },
  fireball: { id: 'fireball', name: 'Fireball', cls: 'mage', cost: 30, cooldown: 4, description: 'Big hit that leaves a burn.' },
  polymorph: { id: 'polymorph', name: 'Polymorph', cls: 'mage', cost: 0, cooldown: 15, description: 'Turns an enemy (not a boss) into a sheep for 10s.' },
  counterspell: { id: 'counterspell', name: 'Counterspell', cls: 'mage', cost: 0, cooldown: 12, description: 'Interrupts an enemy cast and locks it out of casting.' },
  sinisterStrike: { id: 'sinisterStrike', name: 'Sinister Strike', cls: 'rogue', cost: 40, cooldown: 1.5, description: 'A fast, heavy strike.' },
  kick: { id: 'kick', name: 'Kick', cls: 'rogue', cost: 0, cooldown: 10, description: 'Interrupts an enemy cast and locks it out of casting.' },
  whirlwind: { id: 'whirlwind', name: 'Whirlwind', cls: 'warrior', cost: 25, cooldown: 6, description: 'Hits every nearby enemy.' },
  shieldBlock: { id: 'shieldBlock', name: 'Shield Block', cls: 'warrior', cost: 15, cooldown: 12, description: 'Take 50% less damage for 5s.' },
  powerShield: { id: 'powerShield', name: 'Power Shield', cls: 'priest', cost: 20, cooldown: 6, description: 'Shields an ally from 60 damage.' },
  prayerOfHealing: { id: 'prayerOfHealing', name: 'Prayer of Healing', cls: 'priest', cost: 40, cooldown: 10, description: 'Heals the whole party.' },
  iceLance: { id: 'iceLance', name: 'Ice Lance', cls: 'mage', cost: 12, cooldown: 2, description: 'A quick, cheap ranged hit.' },
  blizzard: { id: 'blizzard', name: 'Blizzard', cls: 'mage', cost: 35, cooldown: 12, description: 'Ice storm on the biggest group of enemies: damage over time and slow.' },
  eviscerate: { id: 'eviscerate', name: 'Eviscerate', cls: 'rogue', cost: 35, cooldown: 6, description: 'A big finishing strike.' },
  evasion: { id: 'evasion', name: 'Evasion', cls: 'rogue', cost: 0, cooldown: 20, description: 'Dodge 75% of attacks for 6s.' },
  judgement: { id: 'judgement', name: 'Judgement', cls: 'paladin', cost: 20, cooldown: 5, description: 'Holy strike at range; the most injured ally is healed for half the damage.' },
  radiantLight: { id: 'radiantLight', name: 'Radiant Light', cls: 'paladin', cost: 30, cooldown: 4, description: 'A solid heal on one ally.' },
  hallowedGround: { id: 'hallowedGround', name: 'Hallowed Ground', cls: 'paladin', cost: 25, cooldown: 10, description: 'Blesses the ground underfoot: damage and high threat to enemies standing in it.' },
  mercy: { id: 'mercy', name: 'Mercy', cls: 'paladin', cost: 0, cooldown: 30, description: 'A huge heal on an ally about to fall.' },
  hexBolt: { id: 'hexBolt', name: 'Hex Bolt', cls: 'warlock', cost: 25, cooldown: 3, description: 'A bolt of dark magic.' },
  wither: { id: 'wither', name: 'Wither', cls: 'warlock', cost: 15, cooldown: 2, description: 'A curse that eats away at an enemy over 12 seconds.' },
  soulDrain: { id: 'soulDrain', name: 'Soul Drain', cls: 'warlock', cost: 25, cooldown: 6, description: "Tears at an enemy's soul; the most injured ally is healed for the damage." },
  enfeeble: { id: 'enfeeble', name: 'Enfeeble', cls: 'warlock', cost: 15, cooldown: 12, description: 'The strongest enemy deals 30% less damage for 8s.' },
};

/** Abilities each class can earn from level-up rewards (in AI preference order). */
export const CLASS_POOL: Record<HeroClass, AbilityId[]> = {
  warrior: ['thunderclap', 'shieldBlock', 'whirlwind'],
  priest: ['renew', 'powerShield', 'prayerOfHealing'],
  mage: ['iceLance', 'blizzard', 'counterspell'],
  rogue: ['eviscerate', 'kick', 'evasion'],
  paladin: ['radiantLight', 'hallowedGround', 'mercy'],
  warlock: ['wither', 'soulDrain', 'enfeeble'],
};

/**
 * AI mana discipline: a cheap "filler" ability is only cast if it leaves enough
 * resource for the hero's bigger abilities listed here (if the hero has them).
 * Without this, Renew and Power Shield spam starves Prayer of Healing.
 */
export const AI_RESERVE: Partial<Record<AbilityId, AbilityId[]>> = {
  renew: ['heal', 'prayerOfHealing'],
  powerShield: ['heal', 'prayerOfHealing'],
  iceLance: ['fireball'],
  judgement: ['radiantLight', 'mercy'],
  hexBolt: ['soulDrain', 'enfeeble'],
};

/** Max ability slots per hero: the starting ability + 4 earned during a run. */
export const MAX_ABILITY_SLOTS = 5;

/** Ability tuning numbers. */
export const ABILITY_TUNING = {
  thunderclap: { radius: 120, damage: 12, threatBonus: 2, slow: 6 },
  heroicStrike: { damage: 26, threatBonus: 1.5 },
  heal: { amount: 80 },
  renew: { total: 60, duration: 9, tick: 1.5 },
  fortitude: { duration: 30, bonus: 0.2 },
  fireball: { damage: 45, burnPerSecond: 5, burnDuration: 3 },
  polymorph: { duration: 10, range: 380 },
  counterspell: { silence: 4, range: 380 },
  sinisterStrike: { damage: 32 },
  /** Kick has its own range, separate from the Rogue's melee reach. */
  kick: { damage: 8, silence: 4, range: 420 },
  whirlwind: { radius: 110, damage: 20 },
  shieldBlock: { duration: 5, reduction: 0.5 },
  powerShield: { absorb: 60, duration: 15 },
  prayerOfHealing: { amount: 35 },
  iceLance: { damage: 28 },
  blizzard: { radius: 85, duration: 6, damagePerSecond: 9 },
  eviscerate: { damage: 55 },
  evasion: { duration: 6, dodge: 0.75 },
  /** Paladin: Judgement reaches further than the Paladin's melee swing. */
  judgement: { damage: 34, range: 220, healShare: 0.5 },
  radiantLight: { amount: 70 },
  hallowedGround: { radius: 95, duration: 6, damagePerSecond: 8, threatBonus: 2 },
  /** Mercy: only for an ally below `below` of their health. */
  mercy: { amount: 160, below: 0.35 },
  hexBolt: { damage: 38 },
  wither: { total: 60, duration: 12, tick: 1 },
  soulDrain: { damage: 32 },
  enfeeble: { reduction: 0.3, duration: 8 },
  /** Slowed units attack this much slower. */
  slowFactor: 1.3,
};

/** Per-rank upgrade effects. */
export const UPGRADE = { powerPerRank: 0.25, hastePerRank: 0.8, vitalityPerRank: 0.1, mightPerRank: 0.1 };

/** Reward choices that offer new abilities (others offer upgrades). */
export const NEW_ABILITY_AFTER_WAVES = [5, 10, 15, 20];

/**
 * A reward choice screen appears after every 5th round; other rounds just
 * level everyone up automatically.
 */
export const CHOICE_EVERY = 5;

/** Per level after 1: +6% max health, damage and healing. */
export const LEVEL_SCALING = 0.06;

export interface TraitDef {
  id: TraitId;
  cls: HeroClass;
  name: string;
  description: string;
}

/**
 * Passive traits. Heroes start without any — these are saved as future
 * reward options for the level-up choices (step 5).
 */
export const TRAITS: Record<TraitId, TraitDef> = {
  rage: { id: 'rage', cls: 'warrior', name: 'Rage', description: 'Hits up to 20% harder at full rage.' },
  innerFocus: { id: 'innerFocus', cls: 'priest', name: 'Inner Focus', description: 'Renew costs half while the whole party is above 80% health.' },
  arcaneSurge: { id: 'arcaneSurge', cls: 'mage', name: 'Arcane Surge', description: 'Fireball has a 25% chance to cost no mana.' },
  comboPoints: { id: 'comboPoints', cls: 'rogue', name: 'Combo Points', description: 'Auto attacks build combo points; Sinister Strike spends them for bonus damage.' },
  zeal: { id: 'zeal', cls: 'paladin', name: 'Zeal', description: 'Judgement heals for the full damage dealt, not half.' },
  agony: { id: 'agony', cls: 'warlock', name: 'Agony', description: 'Wither deals 50% more damage.' },
};

export const TRAIT_TUNING = {
  /** Warrior: +20% damage at full rage. */
  rageDamageAtMax: 0.2,
  innerFocusThreshold: 0.8,
  arcaneSurgeChance: 0.25,
  maxComboPoints: 5,
  /** Sinister Strike: +15% damage per combo point. */
  comboBonusPerPoint: 0.15,
  agonyBonus: 0.5,
};

/**
 * Smashers' telegraphed hit (Brute's Smash, bosses' slams): a cast bar, then a
 * heavy hit with splash. Interruptible. Damage scales with the unit's own
 * damage (a base Goblin Brute: 70 to the target, 30 splash).
 */
export const BRUTE_SMASH = { castTime: 1.8, damageFactor: 2.9, splashFactor: 1.25, splashRadius: 70, cooldown: 8 };

/** Healers' heal spell (scaled by round strength). It must walk within `range` of the ally it heals. */
export const SHAMAN_MEND = { castTime: 2.5, heal: 70, cooldown: 7, minMissing: 40, range: 90 };

export interface PassiveDef {
  id: PassiveId;
  name: string;
  /** One line for the class select card. */
  short: string;
  description: string;
}

/** Each class's always-on starting passive (no button). */
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  autoTaunt: { id: 'autoTaunt', name: 'Taunt', short: 'Auto-taunts enemies attacking allies.', description: 'Automatically taunts an enemy attacking an ally (every 8s).' },
  fortitudeAura: { id: 'fortitudeAura', name: 'Power Word: Fortitude', short: 'Party has +20% max health.', description: "The whole party has +20% maximum health." },
  autoPolymorph: { id: 'autoPolymorph', name: 'Polymorph', short: 'Auto-sheeps an enemy (elites, casters first).', description: 'Every 15s, turns an enemy into a sheep — elites and casters first.' },
  aegisAura: { id: 'aegisAura', name: 'Aegis Aura', short: 'Party takes 10% less damage.', description: 'While the Paladin stands, the whole party takes 10% less damage.' },
  soulHarvest: { id: 'soulHarvest', name: 'Soul Harvest', short: 'Kills restore mana and heal an ally.', description: 'Whenever an enemy dies, the Warlock regains 20 mana and the most injured ally is healed for 30.' },
  stealth: { id: 'stealth', name: 'Stealth', short: 'Starts hidden; first hit deals double.', description: 'Starts hidden; the first hit out of stealth deals double damage. Re-stealths after 5s out of combat.' },
};

export const PASSIVE_TUNING = {
  autoTaunt: { cooldown: 8 },
  autoPolymorph: { cooldown: 15 },
  stealth: { ambushMultiplier: 2, restealthAfter: 5 },
  aegisAura: { reduction: 0.1 },
  /** Healing scales with the Warlock's level. */
  soulHarvest: { mana: 20, heal: 30 },
};

/** Each class starts a run with one active ability + one passive; 4 more slots are earned. */
export const HERO_KIT: Record<HeroClass, { resource: ResourceKind; starting: AbilityId; passive: PassiveId; role: string }> = {
  warrior: { resource: 'rage', starting: 'heroicStrike', passive: 'autoTaunt', role: 'Tank — holds enemies with threat' },
  priest: { resource: 'mana', starting: 'heal', passive: 'fortitudeAura', role: 'Healer — keeps the party alive' },
  mage: { resource: 'mana', starting: 'fireball', passive: 'autoPolymorph', role: 'Ranged damage and control' },
  rogue: { resource: 'energy', starting: 'sinisterStrike', passive: 'stealth', role: 'Melee damage' },
  paladin: { resource: 'mana', starting: 'judgement', passive: 'aegisAura', role: 'Tank — holy protector who also heals' },
  warlock: { resource: 'mana', starting: 'hexBolt', passive: 'soulHarvest', role: 'Ranged damage — curses and life drain' },
};



/** Aggro tuning. */
export const AGGRO = {
  /** A new hero must exceed the current target's threat by this factor to pull aggro. */
  pullFactor: 1.1,
  /** Healing creates this much threat per point healed, split across all enemies. */
  healThreat: 0.3,
  /** Hero icon turns orange at this fraction of the top threat on any enemy. */
  warningAt: 0.8,
  /** Careful AI DPS won't attack if it would push them past this fraction. */
  cautionAt: 0.9,
  tauntCooldown: 8,
  tauntDuration: 3,
  tauntRange: 420,
};

/** A line-up entry: enemy kind on board column, row (row 0 = front). */
type Slot = [EnemyKind, number, number];

/**
 * Hand-made line-ups. Rounds 1-10: goblins (3 enemies, the Warchief on 10).
 * Rounds 11-20: undead (4 enemies, the Bone King on 20).
 */
const LINEUPS: Record<number, { name: string; slots: Slot[] }> = {
  1: { name: 'Grunt Squad', slots: [['grunt', 0, 0], ['grunt', 1, 0], ['grunt', 2, 0]] },
  2: { name: 'Archer Support', slots: [['grunt', 1, 0], ['grunt', 2, 0], ['archer', 1, 2]] },
  3: { name: 'The Shaman', slots: [['grunt', 1, 0], ['archer', 2, 1], ['shaman', 1, 2]] },
  4: { name: 'Twin Archers', slots: [['grunt', 2, 0], ['archer', 0, 2], ['archer', 3, 2]] },
  5: { name: 'Elite: Goblin Brute', slots: [['brute', 1, 0], ['grunt', 2, 0], ['shaman', 2, 2]] },
  6: { name: 'Skirmishers', slots: [['grunt', 0, 0], ['grunt', 3, 0], ['archer', 1, 1]] },
  7: { name: 'Healer Line', slots: [['grunt', 1, 0], ['shaman', 0, 2], ['shaman', 3, 2]] },
  8: { name: 'Brute and Bows', slots: [['brute', 2, 0], ['archer', 0, 1], ['archer', 3, 1]] },
  9: { name: 'Double Brute', slots: [['brute', 1, 0], ['brute', 2, 0], ['shaman', 1, 2]] },
  10: { name: 'BOSS: Goblin Warchief', slots: [['warchief', 1, 1], ['grunt', 0, 0], ['shaman', 3, 2]] },
  11: { name: 'The Risen', slots: [['skeleton', 0, 0], ['skeleton', 1, 0], ['skeleton', 2, 0], ['boneArcher', 1, 2]] },
  12: { name: 'Ghoul Pack', slots: [['ghoul', 0, 0], ['ghoul', 3, 0], ['skeleton', 1, 0], ['cultist', 2, 2]] },
  13: { name: 'Bone Volley', slots: [['skeleton', 1, 0], ['boneArcher', 0, 2], ['boneArcher', 2, 2], ['boneArcher', 3, 1]] },
  14: { name: 'Elite: Abomination', slots: [['abomination', 1, 0], ['skeleton', 2, 0], ['cultist', 0, 2], ['boneArcher', 3, 2]] },
  15: { name: 'Dark Rites', slots: [['skeleton', 1, 0], ['skeleton', 2, 0], ['cultist', 0, 2], ['cultist', 3, 2]] },
  16: { name: 'Hunting Ghouls', slots: [['ghoul', 0, 0], ['ghoul', 1, 0], ['ghoul', 3, 0], ['boneArcher', 2, 2]] },
  17: { name: 'Flesh Wall', slots: [['abomination', 1, 0], ['abomination', 2, 0], ['boneArcher', 0, 2], ['cultist', 3, 2]] },
  18: { name: 'Siege Line', slots: [['skeleton', 0, 0], ['skeleton', 3, 0], ['boneArcher', 1, 2], ['boneArcher', 2, 2]] },
  19: { name: 'Graveyard Shift', slots: [['abomination', 1, 0], ['ghoul', 0, 0], ['ghoul', 3, 0], ['cultist', 2, 2]] },
  20: { name: 'BOSS: The Bone King', slots: [['boneKing', 1, 1], ['skeleton', 0, 0], ['skeleton', 3, 0], ['cultist', 2, 2]] },
};

/** Rounds 21+: demons, 5 enemies. One of these each round (never the same twice in a row). */
const DEMON_LINEUPS: { name: string; slots: Slot[] }[] = [
  { name: 'Imp Swarm', slots: [['fiend', 1, 0], ['fiend', 2, 0], ['imp', 0, 2], ['imp', 2, 2], ['imp', 3, 2]] },
  { name: 'Hellhounds', slots: [['hellhound', 0, 0], ['hellhound', 1, 0], ['hellhound', 3, 0], ['fiend', 2, 0], ['shadowCaller', 1, 2]] },
  { name: 'Elite: Pit Brute', slots: [['pitBrute', 1, 0], ['fiend', 2, 0], ['imp', 0, 2], ['imp', 3, 2], ['shadowCaller', 2, 2]] },
  { name: 'Fire and Shadow', slots: [['fiend', 1, 0], ['hellhound', 2, 0], ['imp', 0, 1], ['shadowCaller', 1, 2], ['shadowCaller', 3, 2]] },
  { name: 'Twin Pit Brutes', slots: [['pitBrute', 1, 0], ['pitBrute', 2, 0], ['hellhound', 3, 0], ['imp', 0, 2], ['shadowCaller', 2, 2]] },
];

const DEMON_BOSS: Slot[] = [['demonLord', 1, 1], ['fiend', 0, 0], ['fiend', 3, 0], ['imp', 1, 2], ['shadowCaller', 2, 2]];

/**
 * Enemy health and damage multiplier for a round. It steps up when a new
 * faction arrives (your new hero is the answer to that), and after round 20
 * it keeps climbing faster than your heroes level, so every run ends somewhere.
 */
export function roundStrength(n: number): number {
  if (n <= 10) return 1.6 + (n - 1) * 0.08;
  if (n <= 20) return 3.2 + (n - 11) * 0.14;
  return 4.9 + (n - 21) * 0.25;
}

/**
 * Round N: every enemy starts on its tile. A boss every 10th round; the enemy
 * side grows 3 -> 4 -> 5 alongside the party.
 */
export function makeRound(n: number): WaveDef {
  let lineup: { name: string; slots: Slot[] };
  if (LINEUPS[n]) lineup = LINEUPS[n];
  else if (n % 10 === 0) lineup = { name: 'BOSS: Demon Lord', slots: DEMON_BOSS };
  else {
    const base = DEMON_LINEUPS[(n * 7) % DEMON_LINEUPS.length];
    // Mirror every other round so repeats don't look identical.
    lineup = n % 2 ? { name: base.name, slots: base.slots.map(([k, c, r]) => [k, BOARD.cols - 1 - c, r] as Slot) } : base;
  }
  const spawns: SpawnDef[] = lineup.slots.map(([kind, col, row]) => ({ time: 0, kind, ...enemyTilePos({ col, row }) }));
  return { number: n, name: lineup.name, spawns, strength: roundStrength(n), boss: n % 10 === 0 };
}

export const ROUND_1: WaveDef = makeRound(1);
