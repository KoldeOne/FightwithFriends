import type { EnemyKind, HeroClass, Unit, WaveDef } from './types';

/** World is a fixed portrait canvas; the renderer scales it to the screen. */
export const WORLD = {
  width: 540,
  height: 960,
  /** Top edge of the gate wall. */
  gateY: 800,
  gateHeight: 26,
  /** Top edge of the HUD panel. */
  hudTop: 840,
  spawnY: -24,
};

export const GATE_MAX_HP = 600;

type UnitStats = Omit<Unit, 'id' | 'side' | 'kind' | 'x' | 'y' | 'hp' | 'cooldown' | 'targetId' | 'alive'>;

export const HERO_STATS: Record<HeroClass, UnitStats> = {
  warrior: { label: 'Warrior', radius: 22, maxHp: 340, damage: 9, attackInterval: 1.0, range: 14, attackStyle: 'melee', speed: 0 },
  rogue: { label: 'Rogue', radius: 18, maxHp: 210, damage: 7, attackInterval: 0.6, range: 120, attackStyle: 'melee', speed: 0 },
  mage: { label: 'Mage', radius: 18, maxHp: 170, damage: 20, attackInterval: 1.8, range: 380, attackStyle: 'ranged', speed: 0 },
  priest: { label: 'Priest', radius: 18, maxHp: 190, damage: 5, attackInterval: 1.5, range: 340, attackStyle: 'ranged', speed: 0, heal: 28 },
};

/** Fixed formation: tank front, DPS middle, healer back. Heroes never move. */
export const FORMATION: { cls: HeroClass; x: number; y: number }[] = [
  { cls: 'warrior', x: 270, y: 600 },
  { cls: 'rogue', x: 175, y: 660 },
  { cls: 'mage', x: 365, y: 660 },
  { cls: 'priest', x: 270, y: 735 },
];

export const ENEMY_STATS: Record<EnemyKind, UnitStats> = {
  grunt: { label: 'Goblin Grunt', radius: 17, maxHp: 220, damage: 17, attackInterval: 1.3, range: 8, attackStyle: 'melee', speed: 38 },
  archer: { label: 'Goblin Archer', radius: 15, maxHp: 130, damage: 12, attackInterval: 1.8, range: 260, attackStyle: 'ranged', speed: 32 },
  runner: { label: 'Goblin Runner', radius: 13, maxHp: 90, damage: 14, attackInterval: 1.0, range: 6, attackStyle: 'melee', speed: 75, goesForGate: true },
};

export const WAVE_1: WaveDef = {
  number: 1,
  spawns: [
    { time: 0, kind: 'grunt', x: 210 },
    { time: 0.6, kind: 'grunt', x: 330 },
    { time: 3, kind: 'archer', x: 270 },
    { time: 6, kind: 'runner', x: 110 },
    { time: 9, kind: 'grunt', x: 420 },
  ],
};
