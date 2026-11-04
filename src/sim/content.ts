import type { AbilityId, CastKind, EnemyKind, HeroClass, PassiveId, ResourceKind, SpawnDef, TraitId, Unit, WaveDef } from './types';

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
 * Enemy line-ups are laid out on 4 columns x 3 rows at the top of the arena
 * (row 0 is the front). Heroes have no grid: they line up by role (see
 * formationFor).
 */
export const ENEMY_LAYOUT = {
  colX: [90, 210, 330, 450],
  rowY: [360, 275, 190],
};

export function enemyPos(col: number, row: number): { x: number; y: number } {
  return { x: ENEMY_LAYOUT.colX[col], y: ENEMY_LAYOUT.rowY[row] };
}

/** After this many seconds, sudden death: all damage ramps up so fights can't stall. */
export const SUDDEN_DEATH = { after: 60, perSecond: 0.05 };

type UnitStats = Pick<
  Unit,
  'label' | 'radius' | 'maxHp' | 'damage' | 'attackInterval' | 'range' | 'attackStyle' | 'speed' | 'heal' | 'threatMultiplier' | 'isTank' | 'armor' | 'isCaster' | 'isElite' | 'isBoss' | 'ai' | 'spell'
>;

export const HERO_STATS: Record<HeroClass, UnitStats> = {
  warrior: { label: 'Warrior', radius: 22, maxHp: 420, damage: 12, attackInterval: 1.0, range: 14, attackStyle: 'melee', speed: 0, threatMultiplier: 1.5, isTank: true, armor: 0.25 },
  rogue: { label: 'Rogue', radius: 18, maxHp: 235, damage: 11, attackInterval: 0.6, range: 30, attackStyle: 'melee', speed: 0, threatMultiplier: 0.7 },
  mage: { label: 'Mage', radius: 18, maxHp: 170, damage: 20, attackInterval: 1.8, range: 380, attackStyle: 'ranged', speed: 0 },
  priest: { label: 'Priest', radius: 18, maxHp: 190, damage: 9, attackInterval: 1.5, range: 340, attackStyle: 'ranged', speed: 0, heal: 22 },
  paladin: { label: 'Paladin', radius: 21, maxHp: 380, damage: 13, attackInterval: 1.2, range: 14, attackStyle: 'melee', speed: 0, threatMultiplier: 1.3, isTank: true, armor: 0.2 },
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

/** One of each class: a battle's team when none is given. */
export const ONE_OF_EACH: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];

/** Classes that fight up front. */
export const FRONT_LINE: HeroClass[] = ['warrior', 'paladin', 'rogue'];

/**
 * The party's lines (no grid): tanks and melee in front, ranged behind them,
 * healers at the back. Each line is centred and spaced evenly.
 */
export const HERO_LINES = { front: 565, ranged: 660, healer: 752, spacing: 120 };
/** The back lines are nudged sideways so a hero in each line doesn't hide the one behind. */
const LINE_SHIFT = { front: 0, ranged: 48, healer: -48 };

function lineOf(cls: HeroClass): keyof typeof HERO_LINES {
  if (FRONT_LINE.includes(cls)) return 'front';
  return cls === 'priest' ? 'healer' : 'ranged';
}

/**
 * Where each team member starts. `slot` is the index in `team`. With a
 * player-controlled hero (tests only), that hero stands in the center.
 */
export function formationFor(team: HeroClass[], player?: HeroClass): { slot: number; cls: HeroClass; x: number; y: number }[] {
  const slots = team.map((cls, slot) => ({ slot, cls }));
  const playerSlot = player ? slots.find((s) => s.cls === player) : undefined;
  if (playerSlot) {
    const rest = slots.filter((s) => s !== playerSlot).sort((a, b) => ROLE_ORDER.indexOf(a.cls) - ROLE_ORDER.indexOf(b.cls) || a.slot - b.slot);
    const spots = [SPOTS.front, SPOTS.left, SPOTS.right, SPOTS.back];
    return [{ ...playerSlot, ...SPOTS.center }, ...rest.map((s, i) => ({ ...s, ...spots[i % spots.length] }))];
  }
  const out: { slot: number; cls: HeroClass; x: number; y: number }[] = [];
  for (const line of ['front', 'ranged', 'healer'] as const) {
    const members = slots.filter((s) => lineOf(s.cls) === line).sort((a, b) => ROLE_ORDER.indexOf(a.cls) - ROLE_ORDER.indexOf(b.cls) || a.slot - b.slot);
    members.forEach((m, i) => out.push({ ...m, x: WORLD.width / 2 + LINE_SHIFT[line] + (i - (members.length - 1) / 2) * HERO_LINES.spacing, y: HERO_LINES[line] }));
  }
  return out.sort((a, b) => a.slot - b.slot);
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
  brute: { label: 'Goblin Brute', radius: 24, maxHp: 570, damage: 24, attackInterval: 1.6, range: 10, attackStyle: 'melee', speed: 30, isElite: true, ai: 'smasher', spell: 'Smash' },
  warchief: { label: 'Goblin Warchief', radius: 28, maxHp: 1100, damage: 22, attackInterval: 1.4, range: 10, attackStyle: 'melee', speed: 34, isElite: true, isBoss: true, ai: 'smasher', spell: 'Skull Crack' },
  // Undead
  skeleton: { label: 'Skeleton', radius: 17, maxHp: 260, damage: 24, attackInterval: 1.2, range: 8, attackStyle: 'melee', speed: 36 },
  boneArcher: { label: 'Bone Archer', radius: 15, maxHp: 150, damage: 18, attackInterval: 1.7, range: 270, attackStyle: 'ranged', speed: 32 },
  cultist: { label: 'Death Cultist', radius: 16, maxHp: 170, damage: 9, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30, isCaster: true, ai: 'healer', spell: 'Dark Mend' },
  ghoul: { label: 'Ghoul', radius: 15, maxHp: 180, damage: 18, attackInterval: 0.8, range: 6, attackStyle: 'melee', speed: 60 },
  abomination: { label: 'Abomination', radius: 26, maxHp: 680, damage: 25, attackInterval: 1.7, range: 10, attackStyle: 'melee', speed: 28, isElite: true, ai: 'smasher', spell: 'Slam' },
  boneKing: { label: 'The Bone King', radius: 30, maxHp: 1700, damage: 28, attackInterval: 1.4, range: 10, attackStyle: 'melee', speed: 32, isElite: true, isBoss: true, ai: 'smasher', spell: 'Grave Cleave' },
  // Demons
  imp: { label: 'Fire Imp', radius: 14, maxHp: 160, damage: 13, attackInterval: 1.6, range: 280, attackStyle: 'ranged', speed: 40 },
  hellhound: { label: 'Hellhound', radius: 16, maxHp: 220, damage: 22, attackInterval: 0.9, range: 6, attackStyle: 'melee', speed: 65 },
  fiend: { label: 'Fiend', radius: 19, maxHp: 320, damage: 28, attackInterval: 1.2, range: 8, attackStyle: 'melee', speed: 38 },
  shadowCaller: { label: 'Shadow Caller', radius: 16, maxHp: 200, damage: 10, attackInterval: 2.0, range: 240, attackStyle: 'ranged', speed: 30, isCaster: true, ai: 'healer', spell: 'Shadow Mend' },
  pitBrute: { label: 'Pit Brute', radius: 27, maxHp: 900, damage: 32, attackInterval: 1.6, range: 10, attackStyle: 'melee', speed: 30, isElite: true, ai: 'smasher', spell: 'Crush' },
  demonLord: { label: 'Demon Lord', radius: 32, maxHp: 1800, damage: 28, attackInterval: 1.4, range: 10, attackStyle: 'melee', speed: 34, isElite: true, isBoss: true, ai: 'smasher', spell: 'Hellfire Slam' },
};

export const RESOURCES: Record<ResourceKind, { label: string; max: number; start: number; regen: number }> = {
  rage: { label: 'Rage', max: 100, start: 0, regen: 0 },
  mana: { label: 'Mana', max: 100, start: 100, regen: 3 },
  energy: { label: 'Energy', max: 100, start: 100, regen: 15 },
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
  /** Does "Empowered" (+25% effect) do anything for it? (Not for pure utility like interrupts.) */
  scales: boolean;
  /** The ability's own named upgrade (one rank). */
  mastery: { name: string; text: string };
}

/**
 * Every ability in the game. Each class starts with one; the rest are earned
 * from the class pool at training campsites, bosses, chests and shops (there
 * are more than you can take, so builds differ run to run). Names are working names.
 */
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  // --- Warrior ---------------------------------------------------------------
  taunt: { id: 'taunt', name: 'Taunt', cls: 'warrior', cost: 0, cooldown: 8, description: 'Forces an enemy to attack you.', scales: false, mastery: { name: 'Taunt', text: '' } },
  heroicStrike: {
    id: 'heroicStrike', name: 'Brave Strike', cls: 'warrior', cost: 15, cooldown: 3, scales: true,
    description: 'A heavy strike that generates extra threat.',
    mastery: { name: 'Cleave', text: 'Also hits another enemy next to the target, just as hard.' },
  },
  thunderclap: {
    id: 'thunderclap', name: 'Ground Slam', cls: 'warrior', cost: 20, cooldown: 6, scales: true,
    description: 'Damage and high threat to nearby enemies; slows their attacks.',
    mastery: { name: 'Aftershock', text: 'Enemies hit also deal 15% less damage for 6s.' },
  },
  whirlwind: {
    id: 'whirlwind', name: 'Spinning Slash', cls: 'warrior', cost: 25, cooldown: 6, scales: true,
    description: 'Hits every nearby enemy, with high threat.',
    mastery: { name: 'Blade Cyclone', text: 'Spins twice: a second hit for 60%.' },
  },
  shieldBlock: {
    id: 'shieldBlock', name: 'Brace', cls: 'warrior', cost: 15, cooldown: 12, scales: false,
    description: 'Take 40% less damage for 5s.',
    mastery: { name: 'Bulwark', text: 'Blocks 60% for 6s.' },
  },
  shieldBash: {
    id: 'shieldBash', name: 'Shield Bash', cls: 'warrior', cost: 15, cooldown: 12, scales: false,
    description: 'Bashes an enemy: interrupts its cast and stuns it for 2s.',
    mastery: { name: 'Concussive Bash', text: 'Stuns for 3.5s.' },
  },
  lastStand: {
    id: 'lastStand', name: 'Hold the Line', cls: 'warrior', cost: 0, cooldown: 40, scales: false,
    description: 'Below 30% health: instantly recovers 30% of maximum health.',
    mastery: { name: 'Unbreakable', text: 'Recovers 50% and blocks 40% of damage for 6s.' },
  },
  rallyingShout: {
    id: 'rallyingShout', name: 'Rallying Call', cls: 'warrior', cost: 30, cooldown: 20, scales: false,
    description: 'The whole party deals 15% more damage for 8s.',
    mastery: { name: 'Battle Cry', text: 'Also heals every ally for 8% of their maximum health.' },
  },
  // --- Priest ----------------------------------------------------------------
  heal: {
    id: 'heal', name: 'Mend', cls: 'priest', cost: 25, cooldown: 3, scales: true,
    description: 'A strong heal on one ally.',
    mastery: { name: 'Deep Mend', text: 'Heals 40% more.' },
  },
  renew: {
    id: 'renew', name: 'Soothing Glow', cls: 'priest', cost: 20, cooldown: 3, scales: true,
    description: 'Heals an ally over 9 seconds.',
    mastery: { name: 'Twin Glow', text: 'Also renews a second ally.' },
  },
  fortitude: { id: 'fortitude', name: 'Steadfast Prayer', cls: 'priest', cost: 0, cooldown: 30, description: "Raises the whole party's maximum health by 20% for 30s.", scales: false, mastery: { name: '', text: '' } },
  powerShield: {
    id: 'powerShield', name: 'Ward', cls: 'priest', cost: 20, cooldown: 6, scales: true,
    description: 'Shields an ally from 60 damage.',
    mastery: { name: 'Mirror Ward', text: 'Attackers take half the damage the shield absorbs.' },
  },
  guardianSpirit: {
    id: 'guardianSpirit', name: 'Saving Grace', cls: 'priest', cost: 20, cooldown: 40, scales: false,
    description: 'Watches over an ally in danger for 12s: a killing blow leaves them at 25% health instead.',
    mastery: { name: 'Second Wind', text: 'They survive at 50% health.' },
  },
  holyNova: {
    id: 'holyNova', name: 'Radiance', cls: 'priest', cost: 30, cooldown: 8, scales: true,
    description: 'A burst of light: heals every ally and damages enemies near the Priest.',
    mastery: { name: 'Blinding Radiance', text: '+50% healing and damage, and a wider burst.' },
  },
  chainOfLight: {
    id: 'chainOfLight', name: 'Chain of Light', cls: 'priest', cost: 30, cooldown: 5, scales: true,
    description: 'Heals the most injured ally, then jumps to two more for less.',
    mastery: { name: 'Bright Chain', text: 'Jumps to one more ally, and loses less on each jump.' },
  },
  // --- Mage ------------------------------------------------------------------
  fireball: {
    id: 'fireball', name: 'Fireball', cls: 'mage', cost: 30, cooldown: 4, scales: true,
    description: 'Big hit that leaves a burn.',
    mastery: { name: 'Searing Fire', text: 'The burn is twice as strong and spreads to a nearby enemy.' },
  },
  polymorph: { id: 'polymorph', name: 'Woolly Hex', cls: 'mage', cost: 0, cooldown: 15, description: 'Turns an enemy (not a boss) into a sheep for 10s.', scales: false, mastery: { name: '', text: '' } },
  counterspell: {
    id: 'counterspell', name: 'Counterspell', cls: 'mage', cost: 0, cooldown: 12, scales: false,
    description: 'Interrupts an enemy cast and locks it out of casting.',
    mastery: { name: 'Spell Burn', text: 'Also deals 40 damage and locks casting for 7s.' },
  },
  iceLance: {
    id: 'iceLance', name: 'Frost Shard', cls: 'mage', cost: 12, cooldown: 2, scales: true,
    description: 'A quick, cheap ranged hit.',
    mastery: { name: 'Brittle', text: 'Each lance chills the target; chilled or stunned enemies take double damage.' },
  },
  blizzard: {
    id: 'blizzard', name: 'Ice Storm', cls: 'mage', cost: 35, cooldown: 12, scales: true,
    description: 'Ice storm on the biggest group of enemies: damage over time and slow.',
    mastery: { name: 'Glacial Storm', text: 'A 40% wider storm that hits a third harder.' },
  },
  frostNova: {
    id: 'frostNova', name: 'Frost Ring', cls: 'mage', cost: 20, cooldown: 14, scales: false,
    description: 'Freezes every enemy near the Mage in place for 2.5s.',
    mastery: { name: 'Ice Prison', text: 'Freezes for 4s, in a wider ring.' },
  },
  arcaneBarrage: {
    id: 'arcaneBarrage', name: 'Star Missiles', cls: 'mage', cost: 25, cooldown: 6, scales: true,
    description: 'Three arcane missiles at random enemies.',
    mastery: { name: 'Star Shower', text: 'Five missiles.' },
  },
  // --- Rogue -----------------------------------------------------------------
  sinisterStrike: {
    id: 'sinisterStrike', name: 'Quick Stab', cls: 'rogue', cost: 40, cooldown: 1.5, scales: true,
    description: 'A fast, heavy strike.',
    mastery: { name: 'Serrated Blade', text: 'Also makes the target bleed for 18 over 3s.' },
  },
  kick: {
    id: 'kick', name: 'Kick', cls: 'rogue', cost: 0, cooldown: 10, scales: false,
    description: 'Interrupts an enemy cast and locks it out of casting.',
    mastery: { name: 'Crippling Kick', text: 'Locks casting for 6s and stuns for 1.5s.' },
  },
  eviscerate: {
    id: 'eviscerate', name: 'Finishing Cut', cls: 'rogue', cost: 35, cooldown: 6, scales: true,
    description: 'A big finishing strike.',
    mastery: { name: 'Executioner', text: 'Double damage to enemies below 35% health.' },
  },
  evasion: {
    id: 'evasion', name: 'Evasion', cls: 'rogue', cost: 0, cooldown: 20, scales: false,
    description: 'Dodge 75% of attacks for 6s.',
    mastery: { name: 'Riposte', text: 'Every dodged attack is answered with a 20-damage counter.' },
  },
  gouge: {
    id: 'gouge', name: 'Dirty Trick', cls: 'rogue', cost: 15, cooldown: 8, scales: false,
    description: 'A dirty strike that stuns an enemy for 2s (and breaks its cast).',
    mastery: { name: 'Pocket Sand', text: 'Stuns for 3.5s.' },
  },
  fanOfKnives: {
    id: 'fanOfKnives', name: 'Knife Storm', cls: 'rogue', cost: 35, cooldown: 5, scales: true,
    description: 'Throws knives at every enemy near the Rogue.',
    mastery: { name: 'Poison Fan', text: 'The knives also poison: 20 damage over 4s.' },
  },
  // --- Paladin ---------------------------------------------------------------
  judgement: {
    id: 'judgement', name: 'Verdict', cls: 'paladin', cost: 15, cooldown: 4, scales: true,
    description: 'Holy strike at range; the most injured ally is healed for half the damage.',
    mastery: { name: 'Twin Verdict', text: 'Also strikes a second enemy for 60%.' },
  },
  radiantLight: {
    id: 'radiantLight', name: 'Radiant Light', cls: 'paladin', cost: 25, cooldown: 4, scales: true,
    description: 'A solid heal on one ally.',
    mastery: { name: 'Shared Light', text: 'The Paladin is healed for half as much too.' },
  },
  hallowedGround: {
    id: 'hallowedGround', name: 'Hallowed Ground', cls: 'paladin', cost: 25, cooldown: 10, scales: true,
    description: 'Blesses the ground underfoot: damage and high threat to enemies standing in it.',
    mastery: { name: 'Sanctified Ground', text: 'Also heals allies standing in it.' },
  },
  mercy: {
    id: 'mercy', name: 'Mercy', cls: 'paladin', cost: 0, cooldown: 30, scales: true,
    description: 'A huge heal on an ally about to fall.',
    mastery: { name: 'Shelter', text: 'They also take 50% less damage for 4s.' },
  },
  hammerOfJustice: {
    id: 'hammerOfJustice', name: 'Gavel Strike', cls: 'paladin', cost: 15, cooldown: 14, scales: false,
    description: 'A thrown hammer: interrupts and stuns an enemy for 2.5s.',
    mastery: { name: 'Heavy Hammer', text: 'Stuns for 4s.' },
  },
  exorcism: {
    id: 'exorcism', name: 'Banishing Light', cls: 'paladin', cost: 25, cooldown: 8, scales: true,
    description: 'Holy fire at range; double damage to undead and demons.',
    mastery: { name: 'Purify', text: 'Also burns for 30 over 3s.' },
  },
  // --- Warlock ---------------------------------------------------------------
  hexBolt: {
    id: 'hexBolt', name: 'Hex Bolt', cls: 'warlock', cost: 20, cooldown: 3, scales: true,
    description: 'A bolt of dark magic.',
    mastery: { name: 'Hex of Rot', text: 'Also rots the target for 24 over 6s.' },
  },
  wither: {
    id: 'wither', name: 'Wither', cls: 'warlock', cost: 15, cooldown: 2, scales: true,
    description: 'A curse that eats away at an enemy over 12 seconds.',
    mastery: { name: 'Spreading Blight', text: 'When a withering enemy dies, the curse jumps to the nearest enemy.' },
  },
  soulDrain: {
    id: 'soulDrain', name: 'Life Siphon', cls: 'warlock', cost: 25, cooldown: 6, scales: true,
    description: "Tears at an enemy's soul; the most injured ally is healed for the damage.",
    mastery: { name: 'Soul Feast', text: 'Heals for 150% of the damage.' },
  },
  enfeeble: {
    id: 'enfeeble', name: 'Enfeeble', cls: 'warlock', cost: 15, cooldown: 12, scales: false,
    description: 'The most dangerous enemy deals 30% less damage for 8s.',
    mastery: { name: 'Crippling Curse', text: '40% less, and it attacks slower.' },
  },
  doom: {
    id: 'doom', name: 'Doom', cls: 'warlock', cost: 30, cooldown: 15, scales: true,
    description: 'Dooms the toughest enemy: 200 damage lands after 8s.',
    mastery: { name: 'Inevitable', text: 'Lands for 50% more, and comes back 3s sooner.' },
  },
  curseOfRuin: {
    id: 'curseOfRuin', name: 'Curse of Ruin', cls: 'warlock', cost: 20, cooldown: 10, scales: false,
    description: 'The party focus takes 25% more damage from everything for 10s.',
    mastery: { name: 'Deep Ruin', text: '+40% damage taken instead.' },
  },
};

/**
 * Abilities and passives each class can earn (more than the 4 earned slots,
 * so not every run sees every one). Order is the AI's preference when it picks.
 */
export const CLASS_POOL: Record<HeroClass, (AbilityId | TraitId)[]> = {
  // Ordered by measured value with random picks (scripts/balance.ts, pick value); the spread is small.
  warrior: ['shieldBlock', 'shieldBash', 'rage', 'rallyingShout', 'lastStand', 'thunderclap', 'whirlwind'],
  paladin: ['mercy', 'zeal', 'radiantLight', 'hallowedGround', 'exorcism', 'hammerOfJustice'],
  priest: ['blessedHands', 'guardianSpirit', 'powerShield', 'renew', 'holyNova', 'chainOfLight'],
  mage: ['counterspell', 'arcaneSurge', 'iceLance', 'blizzard', 'frostNova', 'arcaneBarrage'],
  warlock: ['doom', 'enfeeble', 'wither', 'soulDrain', 'curseOfRuin', 'agony'],
  rogue: ['poisonedBlades', 'gouge', 'evasion', 'eviscerate', 'kick', 'comboPoints', 'fanOfKnives'],
};

/** Max ability slots per hero: the starting ability + 3 earned during a run (passives take slots too). */
export const MAX_ABILITY_SLOTS = 4;

/**
 * AI mana discipline: a cheap "filler" ability is only cast if it leaves enough
 * resource for the hero's bigger abilities listed here (if the hero has them).
 */
export const AI_RESERVE: Partial<Record<AbilityId, AbilityId[]>> = {
  renew: ['heal', 'chainOfLight', 'holyNova', 'guardianSpirit'],
  powerShield: ['heal', 'chainOfLight', 'guardianSpirit'],
  iceLance: ['fireball', 'frostNova'],
  arcaneBarrage: ['fireball', 'frostNova'],
  judgement: ['radiantLight', 'hammerOfJustice'],
  exorcism: ['radiantLight', 'hammerOfJustice'],
  hexBolt: ['soulDrain', 'enfeeble', 'curseOfRuin', 'doom'],
  wither: ['curseOfRuin', 'doom'],
  sinisterStrike: ['gouge'],
  fanOfKnives: ['gouge'],
};

/** Ability tuning numbers. */
export const ABILITY_TUNING = {
  thunderclap: { radius: 120, damage: 12, threatBonus: 2, slow: 6, aftershock: 0.15 },
  heroicStrike: { damage: 26, threatBonus: 1.5, cleave: 1, cleaveRadius: 80 },
  whirlwind: { radius: 110, damage: 30, secondHit: 0.6, threatBonus: 2 },
  shieldBlock: { duration: 5, reduction: 0.4, masteryDuration: 6, masteryReduction: 0.6 },
  shieldBash: { damage: 15, stun: 2, masteryStun: 3.5, range: 30 },
  lastStand: { below: 0.3, heal: 0.3, masteryHeal: 0.5, masteryBlock: 0.4, masteryBlockTime: 6 },
  rallyingShout: { bonus: 0.15, duration: 8, masteryHeal: 0.08 },
  heal: { amount: 80, mastery: 1.4 },
  renew: { total: 84, duration: 9, tick: 1.5 },
  fortitude: { duration: 30, bonus: 0.2 },
  powerShield: { absorb: 60, duration: 15, reflect: 0.5 },
  guardianSpirit: { duration: 12, saveAt: 0.25, masterySaveAt: 0.5 },
  holyNova: { heal: 25, damage: 25, radius: 130, mastery: 1.5, masteryRadius: 180 },
  chainOfLight: { amount: 65, jumps: 2, falloff: 0.7, masteryJumps: 3, masteryFalloff: 0.85 },
  fireball: { damage: 45, burnPerSecond: 5, burnDuration: 3, spreadRadius: 110 },
  polymorph: { duration: 10, range: 380 },
  counterspell: { silence: 4, range: 380, masteryDamage: 40, masterySilence: 7 },
  /** Brittle: each lance chills (slows) the target; chilled or stunned targets take double. */
  iceLance: { damage: 28, shatter: 2, chill: 3 },
  blizzard: { radius: 85, duration: 6, damagePerSecond: 13, masteryRadius: 1.4, masteryDamage: 1.33 },
  frostNova: { radius: 110, freeze: 2.5, masteryFreeze: 4, masteryRadius: 150, damage: 10 },
  arcaneBarrage: { missiles: 3, masteryMissiles: 5, damage: 18 },
  sinisterStrike: { damage: 36, bleed: 18, bleedDuration: 3 },
  /** Kick has its own range, separate from the Rogue's melee reach. */
  kick: { damage: 8, silence: 4, range: 300, masterySilence: 6, masteryStun: 1.5 },
  eviscerate: { damage: 55, executeBelow: 0.35 },
  evasion: { duration: 6, dodge: 0.75, riposte: 20 },
  gouge: { stun: 2, masteryStun: 3.5 },
  fanOfKnives: { radius: 100, damage: 26, poison: 20, poisonDuration: 4 },
  /** Paladin: Verdict reaches further than the Paladin's melee swing. */
  judgement: { damage: 40, range: 220, healShare: 0.5, second: 0.6 },
  radiantLight: { amount: 95, beacon: 0.5 },
  hallowedGround: { radius: 95, duration: 6, damagePerSecond: 12, threatBonus: 2, healPerSecond: 6 },
  /** Mercy: only for an ally below `below` of their health. */
  mercy: { amount: 160, below: 0.35, graceTime: 4 },
  hammerOfJustice: { range: 220, damage: 12, stun: 2.5, masteryStun: 4 },
  exorcism: { damage: 50, range: 300, holyBonus: 2, burn: 30, burnDuration: 3 },
  hexBolt: { damage: 46, rot: 24, rotDuration: 6 },
  wither: { total: 78, duration: 12, tick: 1 },
  soulDrain: { damage: 40, mastery: 1.5 },
  enfeeble: { reduction: 0.3, duration: 8, masteryReduction: 0.4 },
  doom: { damage: 200, delay: 8, mastery: 1.5, masteryCooldown: 3 },
  curseOfRuin: { bonus: 0.25, masteryBonus: 0.4, duration: 10 },
  /** Slowed units attack this much slower. */
  slowFactor: 1.3,
  /** Bosses shrug off stuns twice as fast. */
  bossStunFactor: 0.5,
};

/** Per-rank upgrade effects. Focus: resource regeneration. */
export const UPGRADE = { powerPerRank: 0.25, hastePerRank: 0.8, vitalityPerRank: 0.1, mightPerRank: 0.1, focusPerRank: 0.4, maxHaste: 2 };

/** Per level after 1: +6% max health, damage and healing. */
export const LEVEL_SCALING = 0.06;

export interface TraitDef {
  id: TraitId;
  cls: HeroClass;
  name: string;
  description: string;
}

/** Class passives that can be picked like abilities (they take a slot). */
export const TRAITS: Record<TraitId, TraitDef> = {
  rage: { id: 'rage', cls: 'warrior', name: 'Rage', description: 'Hits up to 20% harder at full rage.' },
  blessedHands: { id: 'blessedHands', cls: 'priest', name: 'Blessed Hands', description: 'Heals on an ally below 35% health are 25% stronger.' },
  arcaneSurge: { id: 'arcaneSurge', cls: 'mage', name: 'Kindling', description: 'Fireball has a 25% chance to cost no mana.' },
  comboPoints: { id: 'comboPoints', cls: 'rogue', name: 'Momentum', description: 'Auto attacks build combo points; Quick Stab and Finishing Cut spend them for +15% damage each.' },
  poisonedBlades: { id: 'poisonedBlades', cls: 'rogue', name: 'Poisoned Blades', description: 'Auto attacks poison the target: 6 damage a second for 4s.' },
  zeal: { id: 'zeal', cls: 'paladin', name: 'Zeal', description: 'Verdict heals for the full damage dealt, not half.' },
  agony: { id: 'agony', cls: 'warlock', name: 'Deep Wither', description: 'Wither deals 50% more damage.' },
};

export const TRAIT_TUNING = {
  /** Warrior: +20% damage at full rage. */
  rageDamageAtMax: 0.2,
  blessedHandsBelow: 0.35,
  blessedHandsBonus: 0.25,
  arcaneSurgeChance: 0.25,
  maxComboPoints: 5,
  /** Quick Stab: +15% damage per combo point. */
  comboBonusPerPoint: 0.15,
  poisonPerSecond: 6,
  poisonDuration: 4,
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

/**
 * Each boss's signature move (on top of its slam). Shown on the pre-fight
 * screen the round before, and in the boss's inspect window.
 */
export const BOSS_SPECIALS = {
  warCry: { castTime: 1.5, cooldown: 14, first: 6, frenzy: 0.4, duration: 6 },
  /** Raised Skeletons are weaker than the real thing: less health, half the damage. */
  raiseDead: { castTime: 2.5, cooldown: 20, first: 12, count: 1, maxAlive: 2, hpFactor: 0.4, damageFactor: 0.45 },
  rainOfFire: { castTime: 2.2, cooldown: 14, first: 8, damageFactor: 1.2, radius: 75 },
};

export const BOSS_INFO: Partial<Record<EnemyKind, { special: CastKind; moves: { name: string; text: string }[] }>> = {
  warchief: {
    special: 'warCry',
    moves: [
      { name: 'Skull Crack', text: 'Winds up a crushing blow on his target (splashes nearby heroes).' },
      { name: 'War Cry', text: 'Every 14s: every goblin attacks 40% faster for 6s. Interrupt it!' },
    ],
  },
  boneKing: {
    special: 'raiseDead',
    moves: [
      { name: 'Grave Cleave', text: 'Winds up a crushing blow on his target (splashes nearby heroes).' },
      { name: 'Raise Dead', text: 'Every 20s: raises a weakened Skeleton (up to two at once). Interrupt it!' },
    ],
  },
  demonLord: {
    special: 'rainOfFire',
    moves: [
      { name: 'Hellfire Slam', text: 'Winds up a crushing blow on his target (splashes nearby heroes).' },
      { name: 'Rain of Fire', text: 'Every 14s: fire falls on your back line, hitting every hero near the mark.' },
    ],
  },
};

/** Bosses resist interrupts: after one, the next heavy cast can't be stopped. */
export const BOSS_RULES = 'Bosses can’t be polymorphed, shake off stuns twice as fast, and after an interrupt their next cast is unstoppable.';

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
  fortitudeAura: { id: 'fortitudeAura', name: 'Steadfast Prayer', short: 'Party has +20% max health.', description: 'The whole party has +20% maximum health.' },
  autoPolymorph: { id: 'autoPolymorph', name: 'Woolly Hex', short: 'Auto-sheeps an enemy (elites, casters first).', description: 'Every 15s, turns an enemy into a sheep — elites and casters first.' },
  aegisAura: { id: 'aegisAura', name: 'Aegis Aura', short: 'Party takes 10% less damage.', description: 'While the Paladin stands, the whole party takes 10% less damage.' },
  soulHarvest: { id: 'soulHarvest', name: 'Reaping', short: 'Kills restore mana and heal an ally.', description: 'Whenever an enemy dies, the Warlock regains 20 mana and the most injured ally is healed for 30.' },
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

/** Which faction each enemy belongs to (Banishing Light hits undead and demons twice as hard). */
export const FACTION: Record<EnemyKind, 'goblin' | 'undead' | 'demon'> = {
  grunt: 'goblin', archer: 'goblin', shaman: 'goblin', brute: 'goblin', warchief: 'goblin',
  skeleton: 'undead', boneArcher: 'undead', cultist: 'undead', ghoul: 'undead', abomination: 'undead', boneKing: 'undead',
  imp: 'demon', hellhound: 'demon', fiend: 'demon', shadowCaller: 'demon', pitBrute: 'demon', demonLord: 'demon',
};

/** Aggro tuning. */
export const AGGRO = {
  /** A new hero must exceed the current target's threat by this factor to pull aggro. */
  pullFactor: 1.1,
  /** Healing creates this much threat per point healed, split across all enemies. */
  healThreat: 0.3,
  /** Hero icon turns orange at this fraction of the top threat on any enemy. */
  warningAt: 0.8,
  /**
   * Careful AI DPS won't attack if it would push them past this fraction of
   * the tank's threat (pulling takes 110%; this leaves room for shots in flight).
   */
  cautionAt: 0.95,
  tauntCooldown: 8,
  tauntDuration: 3,
  tauntRange: 420,
};

/** A line-up entry: enemy kind on board column, row (row 0 = front). */
type Slot = [EnemyKind, number, number];

/**
 * The old fixed round line-ups (before the map). The game builds its fights in
 * acts.ts now; these stay as handy fixtures for tests.
 *
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
  if (n <= 30) return 5.2 + (n - 21) * 0.3;
  // Past round 30 it compounds (+8% a round), so even the sturdiest team's run ends.
  return roundStrength(30) * Math.pow(1.08, n - 30);
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
    lineup = n % 2 ? { name: base.name, slots: base.slots.map(([k, c, r]) => [k, ENEMY_LAYOUT.colX.length - 1 - c, r] as Slot) } : base;
  }
  const spawns: SpawnDef[] = lineup.slots.map(([kind, col, row]) => ({ time: 0, kind, ...enemyPos(col, row) }));
  return { number: n, name: lineup.name, spawns, strength: roundStrength(n), boss: n % 10 === 0 };
}

export const ROUND_1: WaveDef = makeRound(1);

// --- The camp ---------------------------------------------------------------

/** The camp (meta-progression between map runs): station caps. Placeholders to tune. */
export const CAMP = {
  maxGearLevel: 10,
};

/**
 * Camp loot per kill (Spoils are × the act: Act 2 pays double, Act 3 triple).
 * A map run has many fights, so these are lower than the first round-based
 * Camp Mode numbers (2 / 6 / 25 Spoils, 12% material chance).
 */
export const LOOT = {
  basic: { spoils: 1, materialChance: 0.05 },
  elite: { spoils: 4, materials: 1 },
  boss: { spoils: 15, materials: 1, trophies: 1 },
};

/** Per gear level: Blacksmith (weapon), Armorer (armor), Jeweler (trinket). */
export const GEAR_BONUS = { weapon: 0.08, armor: 0.08, trinketRegen: 0.08, trinketCooldown: 0.04 };
