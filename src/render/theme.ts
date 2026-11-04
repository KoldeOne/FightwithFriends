import Phaser from 'phaser';
import warriorSprite from '../../art/heroes/hero_warrior.png';
import priestSprite from '../../art/heroes/hero_priest.png';
import mageSprite from '../../art/heroes/hero_mage.png';
import rogueSprite from '../../art/heroes/hero_rogue.png';
import { MAX_ABILITY_SLOTS, WORLD } from '../sim/content';
import { PIXEL_ICONS, PIXEL_PALETTE, PIXEL_SPRITES } from './pixelArt';
import { type AbilityId, type Effect, type PassiveId, type ResourceKind, type TraitId } from '../sim/types';

/** 32x32 pixel-art hero sprites (source: art/heroes/make-sprites.ps1). */
export const HERO_SPRITES: Record<string, string> = {
  warrior: warriorSprite,
  priest: priestSprite,
  mage: mageSprite,
  rogue: rogueSprite,
};
/** Hero sprites are drawn at 2x, standing on their unit disc. */
export const SPRITE_SCALE = 2;

/** Texture key for a unit's sprite (PNG heroes, or generated pixel art). */
export function spriteKey(u: { side: string; kind: string }): string {
  return `${u.side === 'hero' ? 'hero' : 'enemy'}-${u.kind}`;
}

/** Elites and bosses are drawn bigger. */
export function spriteScale(u: { isBoss?: boolean; isElite?: boolean }): number {
  return SPRITE_SCALE * (u.isBoss ? 1.45 : u.isElite ? 1.25 : 1);
}

/** First row of a sprite with any pixels (so the health bar sits just above the head). */
export function spriteTopRow(key: string): number {
  const rows = PIXEL_SPRITES[key];
  if (!rows) return 3; // the hand-made hero PNGs start about 3 rows down
  const i = rows.findIndex((r) => /[^.]/.test(r));
  return (i < 0 ? 0 : i) + SPRITE_PAD;
}

/**
 * Generated textures get a transparent border: without it the bottom row (feet)
 * bleeds onto the top edge when drawn scaled up.
 */
const SPRITE_PAD = 2;

/** Origin that puts a sprite's feet (not its padding) on the ground. */
export function spriteOriginY(key: string, height: number): number {
  return PIXEL_SPRITES[key] ? (height - SPRITE_PAD) / height : 1;
}

/** Turn the pixel grids (art/sprites.py) into textures, once per game. */
export function ensurePixelTextures(scene: Phaser.Scene): void {
  for (const [key, rows] of Object.entries(PIXEL_SPRITES)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, rows[0].length + SPRITE_PAD * 2, rows.length + SPRITE_PAD * 2);
    if (!tex) continue;
    const ctx = tex.getContext();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = PIXEL_PALETTE[row[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x + SPRITE_PAD, y + SPRITE_PAD, 1, 1);
      }
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  // Icons have their own dark border, so they need no padding.
  for (const [key, rows] of Object.entries(PIXEL_ICONS)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, rows[0].length, rows.length);
    if (!tex) continue;
    const ctx = tex.getContext();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = PIXEL_PALETTE[row[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/** Icon sizes: the generated icons are 14x14 pixels. */
export const ICON_PX = 14;

/** Texture keys for the pixel icons (see art/sprites.py). */
export const abilityIcon = (id: AbilityId) => `icon-ab-${id}`;
export const traitIcon = (id: TraitId) => `icon-tr-${id}`;
export const passiveIcon = (id: PassiveId) => `icon-pa-${id}`;
export function effectIcon(e: Effect): string {
  if (e.kind === 'dot') {
    const named = `icon-ef-dot-${e.ability ?? 'poison'}`;
    return PIXEL_ICONS[named] ? named : 'icon-ef-dot';
  }
  return `icon-ef-${e.kind}`;
}

export const COLORS: Record<string, number> = {
  warrior: 0xc0392b,
  rogue: 0xf1c40f,
  mage: 0x3498db,
  priest: 0xecf0f1,
  paladin: 0xf5d76e,
  warlock: 0x7d3c98,
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
  paladin: 'Pa',
  warlock: 'Wl',
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
  warlock: 0x9b59ff,
  arcaneBarrage: 0xd18cff,
  iceLance: 0x9ad1ff,
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

/** A colour number as a CSS string ("#c0392b"), for text. */
export function cssColor(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export const GOLD = 0xffd166;
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
  weaken: { name: 'Enfeebled', letter: 'W', color: 0x8e44ad, debuff: true, text: (e) => `Deals ${Math.round(e.amount * 100)}% less damage.` },
  stun: { name: 'Stunned', letter: 'Z', color: 0xfff27a, debuff: true, text: () => "Can't move, attack or cast." },
  vulnerable: { name: 'Ruined', letter: 'V', color: 0xc0392b, debuff: true, text: (e) => `Takes ${Math.round(e.amount * 100)}% more damage from everything.` },
  wounded: { name: 'Blood price', letter: 'w', color: 0xc0392b, debuff: true, text: (e) => `Bled on the Blood Altar: ${Math.round(e.amount * 100)}% less maximum health until the end of the act.` },
  fed: { name: 'Well fed', letter: '+', color: 0xffb347, debuff: false, text: (e) => `A hearty feast: ${Math.round(e.amount * 100)}% more maximum health.` },
  cursed: { name: 'Cursed', letter: '!', color: 0x7dff9b, debuff: true, text: (e) => `A shrine's curse: takes ${Math.round(e.amount * 100)}% more damage this fight.` },
  empower: { name: 'Rallied', letter: 'A', color: 0xff9f43, debuff: false, text: (e) => `Deals ${Math.round(e.amount * 100)}% more damage.` },
  frenzy: { name: 'War Cry', letter: '!', color: 0xe74c3c, debuff: false, text: (e) => `Attacks ${Math.round(e.amount * 100)}% faster.` },
  guardian: { name: 'Guardian Spirit', letter: 'G', color: 0xfffbe0, debuff: false, text: (e) => `A killing blow leaves them at ${Math.round(e.amount * 100)}% health instead.` },
  doom: { name: 'Doomed', letter: 'D', color: 0x5b2c6f, debuff: true, text: (e) => `${Math.round(e.amount)} damage lands in ${e.remaining.toFixed(1)}s.` },
};

/** Damage-over-time effects are named for what caused them. */
const DOT_NAMES: Partial<Record<string, { name: string; letter: string; color: number }>> = {
  wither: { name: 'Withering', letter: 'W', color: 0x9b59ff },
  sinisterStrike: { name: 'Bleeding', letter: 'B', color: 0xc0392b },
  fanOfKnives: { name: 'Poisoned', letter: 'P', color: 0x7dcf4a },
  poison: { name: 'Poisoned', letter: 'P', color: 0x7dcf4a },
  hexBolt: { name: 'Rotting', letter: 'R', color: 0x6b8e23 },
  exorcism: { name: 'Holy fire', letter: 'H', color: 0xffe28a },
};

/** How to show a particular effect: like EFFECT_INFO, but some abilities name their own (Wither vs. a Fireball burn). */
export function effectInfo(e: Effect): (typeof EFFECT_INFO)[Effect['kind']] {
  const base = EFFECT_INFO[e.kind];
  if (e.kind === 'dot') {
    const named = DOT_NAMES[e.ability ?? 'poison'];
    if (named) return { ...base, ...named, text: (x) => `Takes ${Math.round(x.amount)} damage every ${x.tickEvery}s.` };
  }
  return base;
}
/** Buff icons on units: up to this many, this size (px). */
export const UNIT_ICONS = 4;
export const UNIT_ICON = 12;
export const TARGET_BAR_X = 200;
/** Party panel layout (bottom of the screen): one frame per hero, sized to fit 3-5 heroes. */
export function partyLayout(n: number): { x: number; frameW: number; gap: number; frameH: number; box: number } {
  const x = 6;
  const gap = 4;
  const frameW = Math.floor((WORLD.width - 2 * x - (n - 1) * gap) / n);
  return { x, frameW, gap, frameH: 104, box: Math.min(30, Math.floor((frameW - 10) / MAX_ABILITY_SLOTS) - 3) };
}
export const HUD_TARGET_Y = 122;

export interface PartyFrame {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  hpText: Phaser.GameObjects.Text;
  boxes: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; icon: Phaser.GameObjects.Image; bevel: Phaser.GameObjects.Graphics }[];
  /** Buff/debuff icons between the bars and the abilities. */
  buffs: Phaser.GameObjects.Image[];
}

/** "Heroic Strike" -> "HS", "Fireball" -> "Fi". */
/** Icon letters that would otherwise clash within a class (Shield Block / Shield Bash). */
const ICON_LETTERS: Record<string, string> = { 'Shield Bash': 'Ba', Eviscerate: 'Vi', 'Fan of Knives': 'FK', 'Curse of Ruin': 'CR', 'Hammer of Justice': 'HJ', 'Chain of Light': 'CL' };

export function initials(name: string): string {
  if (ICON_LETTERS[name]) return ICON_LETTERS[name];
  const words = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2);
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
  /** Buff/debuff icons under an enemy's health bar (heroes show theirs on their panel). */
  effectIcons: Phaser.GameObjects.Image[];
  dead: boolean;
  /** The sprite's resting scale (animations squash and stretch around it). */
  baseScale: number;
  /** Where the unit was last frame (to face the way it moves). */
  lastX: number;
  lastY: number;
  /** An attack or cast animation owns the sprite's tilt and scale until this time (ms). */
  busyUntil: number;
  /** Kept for the death animation and remains (the unit may be gone from the battle by then). */
  side: 'hero' | 'enemy';
  kind: string;
  radius: number;
  boss: boolean;
}

/** choosing: team builder. recruit: picking a new hero. placing: arranging heroes before the fight. */
/** title: choosing a hero. map: the act map. choice: a campsite, chest, shop or upgrade pick. spoils: the loot after a fight. */
export type SceneState = 'title' | 'camp' | 'map' | 'choice' | 'playing' | 'paused' | 'spoils' | 'over';

export const DPR = Math.min(window.devicePixelRatio || 1, 3);
/** How many canvas pixels per world unit (the screen's density, at most 2, for speed). */
export const ZOOM = Math.max(1, Math.min(2, Math.round(DPR)));
/** Text is drawn at least 2x, so the pixel font stays smooth on 1x screens too. */
export const TEXT_RES = Math.max(2, DPR);
/** One pixel font everywhere (VT323, SIL Open Font License), with fallbacks. */
export const FONT = '"VT323", system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
/** VT323 is small for its size: every font size is scaled by this so layouts keep their look. */
export const FONT_SCALE = 1.25;

