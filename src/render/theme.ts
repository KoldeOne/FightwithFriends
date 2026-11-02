import Phaser from 'phaser';
import warriorSprite from '../../art/heroes/hero_warrior.png';
import priestSprite from '../../art/heroes/hero_priest.png';
import mageSprite from '../../art/heroes/hero_mage.png';
import rogueSprite from '../../art/heroes/hero_rogue.png';
import { MAX_ABILITY_SLOTS, partySize, WORLD } from '../sim/content';
import { recruit, type RunState } from '../sim/run';
import { type Effect, type ResourceKind } from '../sim/types';

/** 32x32 pixel-art hero sprites (source: art/heroes/make-sprites.ps1). */
export const HERO_SPRITES: Record<string, string> = {
  warrior: warriorSprite,
  priest: priestSprite,
  mage: mageSprite,
  rogue: rogueSprite,
};
/** Hero sprites are drawn at 2x, standing on their unit disc. */
export const SPRITE_SCALE = 2;

export const COLORS: Record<string, number> = {
  warrior: 0xc0392b,
  rogue: 0xf1c40f,
  mage: 0x3498db,
  priest: 0xecf0f1,
  // Goblins: greens
  grunt: 0x6b8e23,
  archer: 0x8fbc4f,
  shaman: 0x8e6bbf,
  brute: 0x4e6b1f,
  warchief: 0x2f4f1a,
  // Undead: bone and grey-violet
  skeleton: 0xd8d2bf,
  boneArcher: 0xb9b29a,
  cultist: 0x5b4a7a,
  ghoul: 0x7f8f6a,
  abomination: 0x8a6f7d,
  boneKing: 0xe8e0c8,
  // Demons: reds and black
  imp: 0xe8642c,
  hellhound: 0x9b2d1f,
  fiend: 0xb5332b,
  shadowCaller: 0x3d2a4f,
  pitBrute: 0x7a1d1d,
  demonLord: 0x2a0f12,
};

export const LETTERS: Record<string, string> = {
  warrior: 'W',
  rogue: 'R',
  mage: 'M',
  priest: 'P',
  grunt: 'G',
  archer: 'A',
  shaman: 'S',
  brute: 'B',
  warchief: 'W',
  skeleton: 'Sk',
  boneArcher: 'A',
  cultist: 'C',
  ghoul: 'G',
  abomination: 'Ab',
  boneKing: 'K',
  imp: 'I',
  hellhound: 'H',
  fiend: 'F',
  shadowCaller: 'SC',
  pitBrute: 'PB',
  demonLord: 'DL',
};

export const DARK_LETTER = ['priest', 'rogue', 'archer', 'skeleton', 'boneArcher', 'boneKing'];

export const PROJECTILE_COLORS: Record<string, number> = {
  mage: 0xff8c1a,
  priest: 0xfff2a8,
  archer: 0xa0522d,
  boneArcher: 0xe8e0c8,
  imp: 0xff5a1f,
  shaman: 0xb57bff,
  cultist: 0x9b7bd1,
  shadowCaller: 0x7a3db8,
};

export const RESOURCE_COLORS: Record<ResourceKind, number> = {
  rage: 0xc0392b,
  mana: 0x2e86de,
  energy: 0xf1c40f,
};

export const GOLD = 0xffd166;
export const OUT_OF_RANGE = 0xff3b3b;
export const ENEMY_STROKE = 0x8b1a1a;
export const SLOW_STROKE = 0x5dade2;

/** How each buff/debuff is shown in the HUD and its tooltip. */
export const EFFECT_INFO: Record<Effect['kind'], { name: string; letter: string; color: number; debuff: boolean; text: (e: Effect) => string }> = {
  fortitude: { name: 'Power Word: Fortitude', letter: 'F', color: 0xfff3b0, debuff: false, text: (e) => `Maximum health increased by ${e.amount}.` },
  hot: { name: 'Renew', letter: 'R', color: 0x7dff9b, debuff: false, text: (e) => `Heals ${Math.round(e.amount)} health every ${e.tickEvery}s.` },
  dot: { name: 'Burning', letter: 'B', color: 0xff8c1a, debuff: true, text: (e) => `Takes ${Math.round(e.amount)} damage every second.` },
  slow: { name: 'Slowed', letter: 'S', color: 0x5dade2, debuff: true, text: () => 'Attacks 30% slower.' },
  sheep: { name: 'Polymorphed', letter: '~', color: 0xf4f1e8, debuff: true, text: () => 'Turned into a sheep. Breaks when hit directly.' },
  silence: { name: 'Silenced', letter: 'X', color: 0xb57bff, debuff: true, text: () => 'Cannot cast spells.' },
  stealth: { name: 'Stealth', letter: 'H', color: 0x9aa5b8, debuff: false, text: () => 'Hidden: enemies cannot target you. Your next hit deals double damage.' },
  block: { name: 'Shield Block', letter: 'B', color: 0xd4a24c, debuff: false, text: (e) => `Taking ${Math.round(e.amount * 100)}% less damage.` },
  shield: { name: 'Power Shield', letter: 'P', color: 0xfff7d6, debuff: false, text: (e) => `Absorbs the next ${Math.round(e.amount)} damage.` },
  evasion: { name: 'Evasion', letter: 'E', color: 0xf1c40f, debuff: false, text: (e) => `Dodging ${Math.round(e.amount * 100)}% of attacks.` },
};
export const MAX_BUFF_ICONS = 12;
/** Buff icons on units: up to this many, this size (px). */
export const UNIT_ICONS = 4;
export const UNIT_ICON = 10;
export const BUFF_ICON = 22;
export const TARGET_BAR_X = 200;
/** Party panel layout (bottom of the screen): one frame per hero, sized to fit 3-5 heroes. */
export function partyLayout(n: number): { x: number; frameW: number; gap: number; frameH: number; box: number } {
  const x = 6;
  const gap = 4;
  const frameW = Math.floor((WORLD.width - 2 * x - (n - 1) * gap) / n);
  return { x, frameW, gap, frameH: 104, box: Math.min(22, Math.floor((frameW - 10) / MAX_ABILITY_SLOTS) - 2) };
}
export const HUD_TARGET_Y = 122;

export interface PartyFrame {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  hpText: Phaser.GameObjects.Text;
  boxes: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[];
  buffs: Phaser.GameObjects.Text;
}

/** "Heroic Strike" -> "HS", "Fireball" -> "Fi". */
export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2);
}

/** Will clearing the current round open a party slot (after the round 10 and 20 bosses)? */
export function needsRecruitAfter(run: RunState): boolean {
  return partySize(run.wave + 1) > run.team.length;
}

export interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Graphics;
  name?: Phaser.GameObjects.Text;
  letter: Phaser.GameObjects.Text;
  /** White overlay for hit flashes. */
  flash: Phaser.GameObjects.Arc;
  /** Pixel-art figure (heroes); the circle under it becomes its base. */
  sprite?: Phaser.GameObjects.Image;
  /** Top of the drawn unit, relative to its centre; bars sit above this. */
  top: number;
  /** Cast bar label (enemies that cast). */
  castLabel?: Phaser.GameObjects.Text;
  /** Aggro warning badge. */
  aggroIcon?: { container: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc };
  /** Tiny buff/debuff icons just under the health bar. */
  effectIcons: { bg: Phaser.GameObjects.Rectangle; letter: Phaser.GameObjects.Text }[];
  dead: boolean;
}

/** choosing: team builder. recruit: picking a new hero. placing: arranging heroes before the fight. */
export type SceneState = 'choosing' | 'recruit' | 'placing' | 'playing' | 'paused' | 'reward' | 'over';

export const DPR = Math.min(window.devicePixelRatio || 1, 3);
export const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** Size and position of the ability button and AUTO button. */
/** HUD layout (offsets from WORLD.hudTop). */
export const HUD = {
  // Big ability buttons first, right under the gate, using the full width.
  slotY: 8,
  slotSize: 88,
  slotGap: 8,
  slotX: 34,
  barX: 16,
  barW: 290,
  healthY: 102,
  resourceY: 121,
  barH: 16,
  buffX: 318,
  targetY: 142,
};

export interface SlotView {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  plus: Phaser.GameObjects.Text;
  cdText: Phaser.GameObjects.Text;
}
