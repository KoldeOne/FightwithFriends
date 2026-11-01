import type { AbilityId, EnemyKind, HeroClass, ResourceKind, SignatureId, Unit, WaveDef } from './types';

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
  'label' | 'radius' | 'maxHp' | 'damage' | 'attackInterval' | 'range' | 'attackStyle' | 'speed' | 'heal' | 'goesForGate' | 'threatMultiplier' | 'isTank'
>;

export const HERO_STATS: Record<HeroClass, UnitStats> = {
  warrior: { label: 'Warrior', radius: 22, maxHp: 340, damage: 9, attackInterval: 1.0, range: 14, attackStyle: 'melee', speed: 0, threatMultiplier: 1.5, isTank: true },
  rogue: { label: 'Rogue', radius: 18, maxHp: 210, damage: 10, attackInterval: 0.6, range: 120, attackStyle: 'melee', speed: 0, threatMultiplier: 0.7 },
  mage: { label: 'Mage', radius: 18, maxHp: 170, damage: 20, attackInterval: 1.8, range: 380, attackStyle: 'ranged', speed: 0 },
  priest: { label: 'Priest', radius: 18, maxHp: 190, damage: 5, attackInterval: 1.5, range: 340, attackStyle: 'ranged', speed: 0, heal: 28 },
};

/** Fixed formation: tank front, DPS middle, healer back. Heroes never move. */
export const FORMATION: { cls: HeroClass; x: number; y: number }[] = [
  { cls: 'warrior', x: 270, y: 570 },
  { cls: 'rogue', x: 175, y: 630 },
  { cls: 'mage', x: 365, y: 630 },
  { cls: 'priest', x: 270, y: 705 },
];

export const ENEMY_STATS: Record<EnemyKind, UnitStats> = {
  grunt: { label: 'Goblin Grunt', radius: 17, maxHp: 220, damage: 17, attackInterval: 1.3, range: 8, attackStyle: 'melee', speed: 38 },
  archer: { label: 'Goblin Archer', radius: 15, maxHp: 130, damage: 12, attackInterval: 1.8, range: 260, attackStyle: 'ranged', speed: 32 },
  shaman: { label: 'Goblin Shaman', radius: 16, maxHp: 150, damage: 8, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30 },
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
  cost: number;
  cooldown: number;
  description: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  thunderclap: { id: 'thunderclap', name: 'Thunderclap', cost: 20, cooldown: 6, description: 'Damage and high threat to nearby enemies; slows their attacks.' },
  renew: { id: 'renew', name: 'Renew', cost: 20, cooldown: 3, description: 'Heals an ally over 9 seconds.' },
  fireball: { id: 'fireball', name: 'Fireball', cost: 30, cooldown: 4, description: 'Big hit that leaves a burn.' },
  sinisterStrike: { id: 'sinisterStrike', name: 'Sinister Strike', cost: 40, cooldown: 1.5, description: 'A fast, heavy strike.' },
};

/** Ability tuning numbers. */
export const ABILITY_TUNING = {
  thunderclap: { radius: 120, damage: 12, threatBonus: 2, slow: 6 },
  renew: { total: 60, duration: 9, tick: 1.5 },
  fireball: { damage: 45, burnPerSecond: 5, burnDuration: 3 },
  sinisterStrike: { damage: 32 },
  /** Slowed units attack this much slower. */
  slowFactor: 1.3,
};

export interface SignatureDef {
  id: SignatureId;
  name: string;
  cooldown: number;
  description: string;
}

export const SIGNATURES: Record<SignatureId, SignatureDef> = {
  taunt: { id: 'taunt', name: 'Taunt', cooldown: 8, description: 'Forces an enemy to attack you.' },
  guardianSpirit: { id: 'guardianSpirit', name: 'Guardian Spirit', cooldown: 30, description: 'The next killing blow on an ally leaves them at 30% instead.' },
  polymorph: { id: 'polymorph', name: 'Polymorph', cooldown: 15, description: 'Turns an enemy (not a boss) into a sheep for 10s.' },
  kick: { id: 'kick', name: 'Kick', cooldown: 10, description: 'Interrupts an enemy cast from range and locks it out of casting.' },
};

export const SIGNATURE_TUNING = {
  guardianSpirit: { duration: 12, saveTo: 0.3 },
  polymorph: { duration: 10, range: 380 },
  /** Kick has its own range, separate from the Rogue's melee reach. */
  kick: { damage: 8, silence: 4, range: 420 },
};

export interface TraitDef {
  name: string;
  description: string;
}

export const TRAITS: Record<HeroClass, TraitDef> = {
  warrior: { name: 'Rage', description: 'Builds rage from dealing and taking damage, and hits harder the more rage he has.' },
  priest: { name: 'Inner Focus', description: 'Renew costs half while the whole party is above 80% health.' },
  mage: { name: 'Arcane Surge', description: 'Fireball has a 25% chance to cost no mana.' },
  rogue: { name: 'Combo Points', description: 'Auto attacks build combo points; Sinister Strike spends them for bonus damage.' },
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

export const HERO_KIT: Record<HeroClass, { resource: ResourceKind; ability: AbilityId; signature: SignatureId; role: string }> = {
  warrior: { resource: 'rage', ability: 'thunderclap', signature: 'taunt', role: 'Tank — holds enemies with threat' },
  priest: { resource: 'mana', ability: 'renew', signature: 'guardianSpirit', role: 'Healer — keeps the party alive' },
  mage: { resource: 'mana', ability: 'fireball', signature: 'polymorph', role: 'Ranged damage and control' },
  rogue: { resource: 'energy', ability: 'sinisterStrike', signature: 'kick', role: 'Melee damage and interrupts' },
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

export const WAVE_1: WaveDef = {
  number: 1,
  spawns: [
    { time: 0, kind: 'grunt', x: 210 },
    { time: 0.6, kind: 'grunt', x: 330 },
    { time: 3, kind: 'archer', x: 270 },
    { time: 6, kind: 'runner', x: 110 },
    { time: 9, kind: 'shaman', x: 420 },
  ],
};
