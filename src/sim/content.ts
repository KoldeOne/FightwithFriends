import type { AbilityId, EnemyKind, HeroClass, PassiveId, ResourceKind, SpawnDef, TraitId, Unit, WaveDef } from './types';

/** World is a fixed portrait canvas; the renderer scales it to the screen. */
export const WORLD = {
  width: 540,
  height: 960,
  /** Top edge of the gate wall. */
  gateY: 770,
  gateHeight: 26,
  /** Top edge of the HUD panel. */
  hudTop: 810,
  spawnY: -24,
};

export const GATE_MAX_HP = 600;

type UnitStats = Pick<
  Unit,
  'label' | 'radius' | 'maxHp' | 'damage' | 'attackInterval' | 'range' | 'attackStyle' | 'speed' | 'heal' | 'goesForGate' | 'threatMultiplier' | 'isTank' | 'isCaster' | 'isElite'
>;

export const HERO_STATS: Record<HeroClass, UnitStats> = {
  warrior: { label: 'Warrior', radius: 22, maxHp: 340, damage: 9, attackInterval: 1.0, range: 14, attackStyle: 'melee', speed: 0, threatMultiplier: 1.5, isTank: true },
  rogue: { label: 'Rogue', radius: 18, maxHp: 210, damage: 10, attackInterval: 0.6, range: 120, attackStyle: 'melee', speed: 0, threatMultiplier: 0.7 },
  mage: { label: 'Mage', radius: 18, maxHp: 170, damage: 20, attackInterval: 1.8, range: 380, attackStyle: 'ranged', speed: 0 },
  priest: { label: 'Priest', radius: 18, maxHp: 190, damage: 5, attackInterval: 1.5, range: 340, attackStyle: 'ranged', speed: 0, heal: 28 },
};

/** Fixed formation: tank front, DPS middle, healer back. Heroes never move. */
export const FORMATION: { cls: HeroClass; x: number; y: number }[] = [
  { cls: 'warrior', x: 270, y: 580 },
  { cls: 'rogue', x: 205, y: 628 },
  { cls: 'mage', x: 335, y: 628 },
  { cls: 'priest', x: 270, y: 680 },
];

export const ENEMY_STATS: Record<EnemyKind, UnitStats> = {
  grunt: { label: 'Goblin Grunt', radius: 17, maxHp: 220, damage: 17, attackInterval: 1.3, range: 8, attackStyle: 'melee', speed: 38 },
  archer: { label: 'Goblin Archer', radius: 15, maxHp: 130, damage: 12, attackInterval: 1.8, range: 260, attackStyle: 'ranged', speed: 32 },
  shaman: { label: 'Goblin Shaman', radius: 16, maxHp: 150, damage: 8, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30, isCaster: true },
  runner: { label: 'Goblin Runner', radius: 13, maxHp: 90, damage: 14, attackInterval: 1.0, range: 6, attackStyle: 'melee', speed: 75, goesForGate: true },
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
};

/** Abilities each class can earn from level-up rewards (in AI preference order). */
export const CLASS_POOL: Record<HeroClass, AbilityId[]> = {
  warrior: ['thunderclap', 'shieldBlock', 'whirlwind'],
  priest: ['renew', 'powerShield', 'prayerOfHealing'],
  mage: ['iceLance', 'blizzard', 'counterspell'],
  rogue: ['eviscerate', 'kick', 'evasion'],
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
  /** Slowed units attack this much slower. */
  slowFactor: 1.3,
};

/** Per-rank upgrade effects. */
export const UPGRADE = { powerPerRank: 0.25, hastePerRank: 0.8 };

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
};

export const TRAIT_TUNING = {
  /** Warrior: +20% damage at full rage. */
  rageDamageAtMax: 0.2,
  innerFocusThreshold: 0.8,
  arcaneSurgeChance: 0.25,
  maxComboPoints: 5,
  /** Sinister Strike: +15% damage per combo point. */
  comboBonusPerPoint: 0.15,
};

/** Goblin Shaman's heal spell. It must walk within `range` of the goblin it heals. */
export const SHAMAN_MEND = { name: 'Mend', castTime: 2.5, heal: 70, cooldown: 7, minMissing: 40, range: 90 };

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
  stealth: { id: 'stealth', name: 'Stealth', short: 'Starts hidden; first hit deals double.', description: 'Starts hidden; the first hit out of stealth deals double damage. Re-stealths after 5s out of combat.' },
};

export const PASSIVE_TUNING = {
  autoTaunt: { cooldown: 8 },
  autoPolymorph: { cooldown: 15 },
  stealth: { ambushMultiplier: 2, restealthAfter: 5 },
};

/** Each class starts a run with one active ability + one passive; 4 more slots are earned. */
export const HERO_KIT: Record<HeroClass, { resource: ResourceKind; starting: AbilityId; passive: PassiveId; role: string }> = {
  warrior: { resource: 'rage', starting: 'heroicStrike', passive: 'autoTaunt', role: 'Tank — holds enemies with threat' },
  priest: { resource: 'mana', starting: 'heal', passive: 'fortitudeAura', role: 'Healer — keeps the party alive' },
  mage: { resource: 'mana', starting: 'fireball', passive: 'autoPolymorph', role: 'Ranged damage and control' },
  rogue: { resource: 'energy', starting: 'sinisterStrike', passive: 'stealth', role: 'Melee damage' },
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
  /** Runners ignore heroes until someone has at least this much threat on them. */
  runnerThreshold: 40,
  tauntCooldown: 8,
  tauntDuration: 3,
  tauntRange: 420,
};

/** Waves in a run (the first playable is chapter 1: 10 waves). */
export const RUN_WAVES = 10;

/**
 * Wave N: enemies arrive in tight groups. Counts and stats grow each wave;
 * shamans (casters) appear from wave 3; reinforcements from wave 6.
 */
export function makeWave(n: number): WaveDef {
  // Small deterministic generator so a wave is the same every time.
  let seed = n * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const group = (time: number, kinds: EnemyKind[]): SpawnDef[] => {
    const cx = 170 + rand() * 200;
    return kinds.map((kind, i) => ({ time: time + i * 0.35, kind, x: cx + (rand() - 0.5) * 110 }));
  };
  const mainCount = [3, 4, 4, 5, 5, 4, 5, 5, 6, 6][n - 1] ?? 6;
  const main: EnemyKind[] = [];
  for (let i = 0; i < mainCount; i++) main.push('grunt');
  main[1 % mainCount] = 'archer';
  if (n >= 2) main[2 % mainCount] = 'runner';
  if (n >= 3) main[mainCount - 1] = 'shaman';
  if (n >= 7) main[0] = 'archer';
  const spawns = group(0, main);
  const reinforcements = [0, 0, 0, 0, 0, 2, 2, 3, 3, 3][n - 1] ?? 3;
  if (reinforcements) {
    const extra: EnemyKind[] = [];
    for (let i = 0; i < reinforcements; i++) extra.push(i === 1 ? 'runner' : 'grunt');
    if (n >= 9) extra[extra.length - 1] = 'shaman';
    spawns.push(...group(22, extra));
  }
  return { number: n, spawns, strength: 1 + (n - 1) * 0.18 };
}

export const WAVE_1: WaveDef = makeWave(1);
