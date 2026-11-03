import { abilityText } from './abilityText';
import { ECONOMY, goldFor, makeEncounter, STRENGTH } from './acts';
import { ABILITIES, CLASS_POOL, HERO_KIT, HERO_STATS, LEVEL_SCALING, MAX_ABILITY_SLOTS, RESOURCES, TRAITS, UPGRADE } from './content';
import { generateActMap, nextNodes, type ActMap, type MapNode } from './map';
import { createRng } from './rng';
import { ALTAR_WOUND, CURSE_DAMAGE, EVENTS, eventFor, FEAST, MAX_WISHES, type EventChoice, type EventId } from './events';
import type { AbilityId, EnemyKind, HeroBuild, HeroClass, Loot, TraitId, WaveDef } from './types';

/** The last act; beating its boss wins the run. */
export const FINAL_ACT = 3;
/**
 * Where new heroes join (a party of 4 by the middle of the run): the campsite
 * floor in the middle of Act 1, right after the Act 1 boss, and the campsite
 * floor in the middle of Act 2. Floors are 0-based (5 = the sixth floor).
 */
export const RECRUIT_FLOORS: Record<number, number> = { 1: 5, 2: 5 };
export const RECRUITS = 3;
export const MAX_PARTY = 4;

/** Is this campsite a recruit site (rather than training)? */
export function isRecruitCampsite(run: RunState, node: MapNode): boolean {
  return node.type === 'campsite' && RECRUIT_FLOORS[run.act] === node.floor && run.team.length < MAX_PARTY;
}

export type Reward =
  | { kind: 'ability'; id: AbilityId }
  | { kind: 'trait'; id: TraitId }
  | { kind: 'mastery'; id: AbilityId }
  | { kind: 'power'; id: AbilityId }
  | { kind: 'haste'; id: AbilityId }
  | { kind: 'vitality' }
  | { kind: 'might' }
  | { kind: 'focus' };

/** A reward for one hero in the party (chests, elites, bosses and shops offer these). */
export interface PartyReward {
  slot: number;
  reward: Reward;
}

export interface ShopItem extends PartyReward {
  price: number;
  sold?: boolean;
}

/** A choice waiting at the current node (saved, so a reload comes back to it). */
export type Pending =
  | { kind: 'recruit' }
  /** Training campsite, boss or Blood Altar: every hero in `left` still gets their own pick (a new ability, or an upgrade once full). */
  | { kind: 'train'; source: 'campsite' | 'boss' | 'altar'; left: number[] }
  /** A chest's or elite's pick: one reward for one hero. */
  | { kind: 'upgrade'; source: 'chest' | 'elite'; options: PartyReward[]; gold?: number }
  | { kind: 'shop'; stock: ShopItem[]; rerolls: number }
  | { kind: 'event'; id: EventId };

/** Everything about a run in progress. */
export interface RunState {
  version: 5;
  seed: number;
  act: number;
  /** The current act's map. */
  map: ActMap;
  /** The node you're on (null before the first move of an act). */
  at: string | null;
  /** Nodes visited this act, in order (the dotted line on the map). */
  visited: string[];
  /** The party: one class per slot (duplicates allowed), up to MAX_PARTY. */
  team: HeroClass[];
  builds: HeroBuild[];
  /** Experience per hero (ECONOMY.xpPerLevel per level). */
  xp: number[];
  /** The level heroes start (and recruits join) at: 1 plus the camp's Drills. XP adds to it. */
  baseLevel: number;
  gold: number;
  /** Wishes held (from a Wishing Well): a wipe uses one, and the fight starts over. */
  wishes: number;
  /** Fights restarted by a wish so far (changes the next fight's seed). */
  attempt: number;
  /** Damage and healing per hero (by team slot) over the whole run, by source: the end-of-run meter. */
  meter?: { damage: Record<string, number>; healing: Record<string, number> }[];
  /** A Cursed Shrine: every hero starts the next fight with a debuff. */
  cursed?: boolean;
  /** A Feast: fights left with the extra max health. */
  feast?: number;
  /** Helped the Wounded Traveller: they come back with a gift next act. */
  traveller?: boolean;
  /** An event waiting to happen once the current choice is done (the traveller's return). */
  queued?: EventId;
  /** Camp loot found this run (already banked at the camp as each fight ends). */
  loot: Loot;
  /** Campsites reached so far. */
  campsites: number;
  status: 'map' | 'fight' | 'won' | 'lost';
  pending?: Pending;
  /** What the last fight paid, shown at the top of the pick that follows it (elites and bosses). */
  lastSpoils?: string;
  stats: { fights: number; elites: number; bosses: number; gold: number };
}

/** What a won fight gave: gold, XP per hero (and level-ups), and whether a pick follows. */
export interface Spoils {
  gold: number;
  heroes: { slot: number; xp: number; from: number; to: number; fell: boolean }[];
  /** XP each standing hero earned (the same for everyone). */
  xp: number;
  /** Extra gold from a golden node (included in `gold`). */
  goldBonus: number;
  pick: boolean;
  actCleared: boolean;
  won: boolean;
  /** The party fell but a wish brought them back: the fight starts over. */
  wished?: boolean;
}

export const ALL_CLASSES: HeroClass[] = ['warrior', 'paladin', 'priest', 'mage', 'warlock', 'rogue'];

const isTrait = (id: AbilityId | TraitId): id is TraitId => id in TRAITS;

/** Abilities a class can start with (its usual opener plus any active from its pool). */
export function firstAbilityOptions(cls: HeroClass): AbilityId[] {
  return [HERO_KIT[cls].starting, ...CLASS_POOL[cls].filter((id): id is AbilityId => !isTrait(id))];
}

function freshBuild(first: AbilityId, level = 1): HeroBuild {
  return { level, abilities: [{ id: first, power: 0, haste: 0, mastery: false }], traits: [], vitality: 0, might: 0, focus: 0 };
}

function nodeRng(run: RunState, salt: number): () => number {
  let h = 0;
  for (const ch of run.at ?? 'start') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return createRng(run.seed * 31 + run.act * 7741 + h + salt * 104729);
}

function shuffle<T>(rng: () => number, list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Start a run with one hero and the first ability you picked for it. */
export function newRun(cls: HeroClass, first: AbilityId = HERO_KIT[cls].starting, seed = Date.now() % 1_000_000, baseLevel = 1): RunState {
  const build = freshBuild(first);
  build.level = baseLevel;
  return {
    version: 5,
    seed,
    act: 1,
    map: generateActMap(seed, 1),
    at: null,
    visited: [],
    team: [cls],
    builds: [build],
    xp: [0],
    baseLevel,
    gold: 0,
    wishes: 0,
    attempt: 0,
    loot: { spoils: 0, ore: 0, hide: 0, gems: 0, trophies: 0 },
    campsites: 0,
    status: 'map',
    stats: { fights: 0, elites: 0, bosses: 0, gold: 0 },
  };
}

export function currentNode(run: RunState): MapNode | undefined {
  return run.at ? run.map.nodes[run.at] : undefined;
}

/** Where you can go next (nothing while a choice is waiting). */
export function availableNodes(run: RunState): MapNode[] {
  if (run.status !== 'map' || run.pending) return [];
  return nextNodes(run.map, run.at);
}

function slotsUsed(b: HeroBuild): number {
  return b.abilities.length + b.traits.length;
}

/** Abilities and passives from the class pool this hero hasn't taken yet (if a slot is free). */
export function freshPicks(cls: HeroClass, b: HeroBuild): Reward[] {
  if (slotsUsed(b) >= MAX_ABILITY_SLOTS) return [];
  return CLASS_POOL[cls]
    .filter((id) => (isTrait(id) ? !b.traits.includes(id) : !b.abilities.some((a) => a.id === id)))
    .map((id) => (isTrait(id) ? { kind: 'trait' as const, id } : { kind: 'ability' as const, id }));
}

/** Named upgrades for abilities the hero has, then general ones. Only upgrades that do something are offered. */
function upgrades(cls: HeroClass, b: HeroBuild): { masteries: Reward[]; general: Reward[] } {
  // Named upgrades only once a hero has a few abilities to choose between.
  const masteries: Reward[] =
    b.abilities.length >= 3 ? b.abilities.filter((a) => !a.mastery && ABILITIES[a.id].mastery.name).map((a) => ({ kind: 'mastery' as const, id: a.id })) : [];
  const general: Reward[] = [];
  for (const a of b.abilities) {
    if (ABILITIES[a.id].scales) general.push({ kind: 'power', id: a.id });
    if (ABILITIES[a.id].cooldown >= 4 && a.haste < UPGRADE.maxHaste) general.push({ kind: 'haste', id: a.id });
  }
  general.push({ kind: 'vitality' }, { kind: 'might' });
  // Focus speeds up mana/energy; rage doesn't regenerate on its own.
  if (RESOURCES[HERO_KIT[cls].resource].regen > 0) general.push({ kind: 'focus' });
  return { masteries, general };
}

/** Levels gained from this much XP: the first costs xpPerLevel, each after xpGrowth more. */
export function levelsFor(xp: number): number {
  let levels = 0;
  let cost = ECONOMY.xpPerLevel;
  while (xp >= cost) {
    xp -= cost;
    levels += 1;
    cost += ECONOMY.xpGrowth;
  }
  return levels;
}

/** XP into the current level and what the next level costs (for the XP bar). */
export function xpProgress(xp: number): { into: number; need: number } {
  let cost = ECONOMY.xpPerLevel;
  while (xp >= cost) {
    xp -= cost;
    cost += ECONOMY.xpGrowth;
  }
  return { into: xp, need: cost };
}

/**
 * One pick for the party (chests, elites): while any hero has a
 * free slot, all but one are new abilities or passives (for different heroes,
 * those with the fewest first) and one is an upgrade; once everyone is full,
 * all upgrades.
 */
export function partyPickOptions(run: RunState, salt: number, count = 3): PartyReward[] {
  const rng = nodeRng(run, salt);
  const open = shuffle(rng, run.team.map((_, i) => i)).filter((i) => freshPicks(run.team[i], run.builds[i]).length);
  if (!open.length) return partyUpgradeOptions(run, salt, count);
  open.sort((a, b) => slotsUsed(run.builds[a]) - slotsUsed(run.builds[b]));
  const fresh: PartyReward[] = [];
  const want = count - 1;
  for (let k = 0; fresh.length < want && k < 4; k++)
    for (const slot of open) {
      if (fresh.length >= want) break;
      const options = shuffle(rng, freshPicks(run.team[slot], run.builds[slot])).filter((r) => !fresh.some((f) => f.slot === slot && JSON.stringify(f.reward) === JSON.stringify(r)));
      if (options.length && (k > 0 || !fresh.some((f) => f.slot === slot))) fresh.push({ slot, reward: options[0] });
    }
  return [...fresh, ...partyUpgradeOptions(run, salt + 1, count - fresh.length)];
}

/**
 * Upgrades for the party (shops, and elites and bosses once everyone is full): named upgrades first,
 * spread across different heroes where possible.
 */
export function partyUpgradeOptions(run: RunState, salt: number, count = 3): PartyReward[] {
  const rng = nodeRng(run, salt);
  const masteries: PartyReward[] = [];
  const general: PartyReward[] = [];
  run.team.forEach((cls, slot) => {
    const u = upgrades(cls, run.builds[slot]);
    masteries.push(...u.masteries.map((reward) => ({ slot, reward })));
    general.push(...u.general.map((reward) => ({ slot, reward })));
  });
  const out: PartyReward[] = [];
  const usedHeroes = new Set<number>();
  const take = (list: PartyReward[], max: number) => {
    for (const r of shuffle(rng, list)) {
      if (out.length >= count || out.filter((o) => list.includes(o)).length >= max) break;
      if (usedHeroes.has(r.slot) && run.team.length > out.length) continue;
      out.push(r);
      usedHeroes.add(r.slot);
    }
  };
  take(masteries, 2);
  take(general, count);
  // Small parties: allow repeats of a hero to fill the three.
  for (const r of shuffle(rng, [...masteries, ...general])) {
    if (out.length >= count) break;
    if (!out.some((o) => o.slot === r.slot && JSON.stringify(o.reward) === JSON.stringify(r.reward))) out.push(r);
  }
  return out;
}

/**
 * One hero's pick at a chest or training campsite: three new abilities or
 * passives from their pool, or, once their slots are full, three upgrades
 * (named upgrades first).
 */
export function trainOptions(run: RunState, slot: number): Reward[] {
  const rng = nodeRng(run, 11 + slot);
  // A boss offers four.
  const p = run.pending;
  const count = p?.kind === 'train' && p.source === 'boss' ? 4 : 3;
  const fresh = freshPicks(run.team[slot], run.builds[slot]);
  if (fresh.length) return shuffle(rng, fresh).slice(0, count);
  const u = upgrades(run.team[slot], run.builds[slot]);
  const masteries = shuffle(rng, u.masteries).slice(0, 2);
  return [...masteries, ...shuffle(rng, u.general)].slice(0, count);
}

/** Heroes with a free slot (who can learn something new). */
export function trainableSlots(run: RunState): number[] {
  return run.team.map((_, i) => i).filter((i) => freshPicks(run.team[i], run.builds[i]).length > 0);
}

function shopStock(run: RunState, rerolls: number): ShopItem[] {
  const rng = nodeRng(run, 50 + rerolls);
  const price = (p: number) => Math.round(p * ECONOMY.actPrice[run.act - 1]);
  const abilities: ShopItem[] = shuffle(
    rng,
    trainableSlots(run).flatMap((slot) => freshPicks(run.team[slot], run.builds[slot]).map((reward) => ({ slot, reward, price: price(ECONOMY.prices.ability) }))),
  );
  const items: ShopItem[] = [];
  const heroes = new Set<number>();
  // Act 1 shops lean toward new abilities.
  const abilityCount = run.act === 1 ? 4 : 3;
  for (const a of abilities) {
    if (items.length >= abilityCount) break;
    if (heroes.has(a.slot) && abilities.some((b) => !heroes.has(b.slot))) continue;
    items.push(a);
    heroes.add(a.slot);
  }
  const ups = partyUpgradeOptions(run, 70 + rerolls, 5 - items.length).map((u) => ({ ...u, price: price(ECONOMY.prices.upgrade) }));
  return [...items, ...ups];
}

export function rerollPrice(run: RunState): number {
  return Math.round(ECONOMY.prices.reroll * ECONOMY.actPrice[run.act - 1]);
}

/**
 * Step onto a node. Fights set the run to 'fight' (the scene then plays it);
 * other nodes open their choice: recruit or train at a campsite, gold and an
 * upgrade at a chest, the stock at a shop.
 */
export function enterNode(run: RunState, id: string): MapNode {
  const node = availableNodes(run).find((n) => n.id === id);
  if (!node) throw new Error(`can't move to ${id}`);
  run.at = id;
  run.visited.push(id);
  switch (node.type) {
    case 'fight':
    case 'elite':
    case 'boss':
      run.status = 'fight';
      break;
    case 'campsite':
      run.campsites += 1;
      if (isRecruitCampsite(run, node)) run.pending = { kind: 'recruit' };
      else run.pending = { kind: 'train', source: 'campsite', left: run.team.map((_, i) => i) };
      break;
    case 'chest': {
      const rng = nodeRng(run, 1);
      const [lo, hi] = ECONOMY.chestGold;
      const gold = Math.round((lo + rng() * (hi - lo)) * ECONOMY.actGold[run.act - 1] * (node.rich ? ECONOMY.richBonus : 1));
      run.gold += gold;
      run.stats.gold += gold;
      // One pick for one hero (four options if golden).
      run.pending = { kind: 'upgrade', source: 'chest', options: partyPickOptions(run, 2, node.rich ? 4 : 3), gold };
      break;
    }
    case 'shop':
      run.pending = { kind: 'shop', stock: shopStock(run, 0), rerolls: 0 };
      break;
    case 'event':
      run.pending = { kind: 'event', id: eventFor(Math.floor(nodeRng(run, 90)() * 1e6)) };
      break;
  }
  return node;
}

/** The fight's random seed (the same for the game and the simulator). */
export function fightSeed(run: RunState): number {
  const node = currentNode(run);
  return run.seed * 100 + run.act * 10007 + (node ? node.floor * 131 + node.col : 0) + run.attempt * 7919;
}

/** The enemies at the current fight node. */
export function encounterFor(run: RunState): WaveDef {
  const node = currentNode(run)!;
  const twist = eliteTwist(run, node);
  const wave = makeEncounter(run.seed, run.act, node.floor, node.type, run.team.length, node.id, twist === 'swarm' ? 2 : 0);
  return twist ? { ...wave, name: `${wave.name} (${TWISTS[twist].name})`, strength: (wave.strength ?? 1) * STRENGTH.twist } : wave;
}

/** An elite's twist: what makes it harder (and its reward bigger). */
export type Twist = 'enraged' | 'frail' | 'swarm';
export const TWISTS: Record<Twist, { name: string; text: string }> = {
  enraged: { name: 'Enraged', text: 'Enemies deal 30% more damage.' },
  frail: { name: 'No Rest', text: 'Your heroes heal 50% less.' },
  swarm: { name: 'Swarm', text: 'Two extra enemies join the fight.' },
};

/** Some elites (about 40%) carry a twist; it's shown on the map, and their reward offers four options. */
export function eliteTwist(run: RunState, node: MapNode): Twist | undefined {
  if (node.type !== 'elite') return undefined;
  const list = Object.keys(TWISTS) as Twist[];
  let h = 0;
  for (const ch of node.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  h = (h + run.seed * 7 + run.act * 13) >>> 0;
  return h % 5 < 2 ? list[(h >>> 3) % list.length] : undefined;
}

/** Everything about the current fight beyond its enemies: curse, feast, an elite's twist. */
export function fightMods(run: RunState): { curse?: number; feast?: number; enemyDamage?: number; healingScale?: number } {
  const node = currentNode(run);
  const twist = node ? eliteTwist(run, node) : undefined;
  return {
    curse: run.cursed ? CURSE_DAMAGE : undefined,
    feast: run.feast ? FEAST.health : undefined,
    enemyDamage: twist === 'enraged' ? 1.3 : undefined,
    healingScale: twist === 'frail' ? 0.5 : undefined,
  };
}

/** One line for a fight's rewards: "Victory: +14 gold (golden +7) · +4 XP · Level up: Mage 3 · Camp: 3 Spoils". */
/** "Mage", or "Mage 2" for a second Mage. */
export function heroLabel(run: RunState, slot: number): string {
  const cls = run.team[slot];
  const same = run.team.slice(0, slot).filter((c) => c === cls).length;
  return `${cls[0].toUpperCase() + cls.slice(1)}${same ? ` ${same + 1}` : ''}`;
}

export function spoilsLine(run: RunState, spoils: Spoils, campLoot?: string): string {
  const ups = spoils.heroes.filter((h) => h.to > h.from).map((h) => `${heroLabel(run, h.slot)} ${h.to}`);
  return [
    `+${spoils.gold} gold${spoils.goldBonus ? ` (golden +${spoils.goldBonus})` : ''}`,
    `+${spoils.xp} XP`,
    ups.length ? `Level up: ${ups.join(', ')}` : '',
    campLoot ? `Camp: ${campLoot}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A fight is over. Lost: the run ends (unless a wish restarts the fight). Won:
 * gold for every enemy killed, the same XP for every hero still standing, and a
 * pick after an elite or a boss. Beating an act's boss moves on to the next
 * act; beating the last one wins the run.
 */
export function finishFight(run: RunState, won: boolean, fallen: number[], kills: { kind: EnemyKind; summoned?: boolean }[]): Spoils {
  const node = currentNode(run)!;
  const spoils: Spoils = { gold: 0, heroes: [], xp: 0, goldBonus: 0, pick: false, actCleared: false, won: false };
  // A curse lasts one fight.
  run.cursed = undefined;
  if (!won) {
    if (run.wishes > 0) {
      // A wish: everyone rises again and the fight starts over (with a new seed).
      run.wishes -= 1;
      run.attempt += 1;
      spoils.wished = true;
      return spoils;
    }
    run.status = 'lost';
    return spoils;
  }
  run.status = 'map';
  if (run.feast) run.feast -= 1;
  run.stats.fights += 1;
  if (node.type === 'elite') run.stats.elites += 1;
  if (node.type === 'boss') run.stats.bosses += 1;
  const plain = Math.round(kills.reduce((a, k) => a + (k.summoned ? 0 : goldFor(k.kind)), 0) * ECONOMY.actGold[run.act - 1]);
  const gold = Math.round(plain * (node.rich ? ECONOMY.richBonus : 1));
  run.gold += gold;
  run.stats.gold += gold;
  spoils.gold = gold;
  spoils.goldBonus = gold - plain;
  const gained = Math.round(((ECONOMY.xp[node.type] ?? 0) + (eliteTwist(run, node) ? 2 : 0)) * (node.rich ? ECONOMY.richXp : 1));
  spoils.xp = gained;
  run.team.forEach((_, slot) => {
    const b = run.builds[slot];
    const fell = fallen.includes(slot);
    const from = b.level;
    if (!fell) run.xp[slot] += gained;
    b.level = run.baseLevel + levelsFor(run.xp[slot]);
    spoils.heroes.push({ slot, xp: fell ? 0 : gained, from, to: b.level, fell });
  });
  if (node.type === 'boss' && run.act >= FINAL_ACT) {
    run.status = 'won';
    spoils.won = true;
    return spoils;
  }
  // An elite: one reward for one hero (four options if it had a twist).
  if (node.type === 'elite') {
    run.pending = { kind: 'upgrade', source: 'elite', options: partyPickOptions(run, 5, eliteTwist(run, node) ? 4 : 3) };
    spoils.pick = true;
  }
  // A boss: every hero gets their own pick (1 of 4).
  if (node.type === 'boss') {
    run.pending = { kind: 'train', source: 'boss', left: run.team.map((_, i) => i) };
    spoils.pick = true;
  }
  spoils.actCleared = node.type === 'boss';
  return spoils;
}

/** After the current choice: if it was the act's boss, move on to the next act. */
function finishPending(run: RunState): void {
  run.lastSpoils = undefined;
  const wasBoss = run.pending?.kind === 'train' && run.pending.source === 'boss';
  run.pending = undefined;
  if (wasBoss) {
    nextAct(run);
    // A new hero joins right after the Act 1 boss.
    if (run.act === 2 && run.team.length < MAX_PARTY) run.pending = { kind: 'recruit' };
  }
  // Something waiting its turn (the traveller's return) comes next.
  if (!run.pending && run.queued) {
    run.pending = { kind: 'event', id: run.queued };
    run.queued = undefined;
  }
}

export function nextAct(run: RunState): void {
  run.act += 1;
  run.map = generateActMap(run.seed, run.act);
  run.at = null;
  run.visited = [];
  run.status = 'map';
  // Blood Altar wounds heal; a traveller you helped catches up.
  for (const b of run.builds) b.wound = undefined;
  if (run.traveller) {
    run.traveller = undefined;
    run.queued = 'travellerGift';
  }
}

/** Recruit site: a new hero joins at the run's starting level with the first ability you chose. */
export function recruit(run: RunState, cls: HeroClass, first: AbilityId = HERO_KIT[cls].starting): void {
  if (run.pending?.kind !== 'recruit' || run.team.length >= MAX_PARTY) throw new Error('no recruit here');
  run.team.push(cls);
  const build = freshBuild(first);
  build.level = run.baseLevel;
  run.builds.push(build);
  run.xp.push(0);
  finishPending(run);
}

/** Chest or training campsite: one hero takes their pick (null = skip); done when every hero has picked. */
export function train(run: RunState, slot: number, reward: Reward | null): void {
  const p = run.pending;
  if (p?.kind !== 'train' || !p.left.includes(slot)) throw new Error('no pick for this hero here');
  if (reward) applyReward(run.builds[slot], reward);
  p.left = p.left.filter((s) => s !== slot);
  if (!p.left.length) finishPending(run);
}

/** Take one of the offered upgrades (elite, boss). */
export function chooseUpgrade(run: RunState, pick: PartyReward | null): void {
  if (run.pending?.kind !== 'upgrade') throw new Error('no upgrade here');
  if (pick) applyReward(run.builds[pick.slot], pick.reward);
  finishPending(run);
}

export function buy(run: RunState, index: number): boolean {
  const p = run.pending;
  if (p?.kind !== 'shop') return false;
  const item = p.stock[index];
  if (!item || item.sold || run.gold < item.price) return false;
  run.gold -= item.price;
  applyReward(run.builds[item.slot], item.reward);
  item.sold = true;
  // Anything no longer possible (a full hero, an upgrade already taken) leaves the shelf.
  for (const other of p.stock) {
    if (other.sold) continue;
    if (other.reward.kind === 'ability' || other.reward.kind === 'trait') {
      if (!freshPicks(run.team[other.slot], run.builds[other.slot]).some((r) => JSON.stringify(r) === JSON.stringify(other.reward))) other.sold = true;
    }
    if (other.reward.kind === 'mastery') {
      const a = run.builds[other.slot].abilities.find((x) => x.id === (other.reward as { id: AbilityId }).id);
      if (a?.mastery) other.sold = true;
    }
  }
  return true;
}

export function reroll(run: RunState): boolean {
  const p = run.pending;
  if (p?.kind !== 'shop' || run.gold < rerollPrice(run)) return false;
  run.gold -= rerollPrice(run);
  p.rerolls += 1;
  p.stock = shopStock(run, p.rerolls);
  return true;
}

export function leaveShop(run: RunState): void {
  if (run.pending?.kind === 'shop') finishPending(run);
}

/** The choices on offer at the current chance encounter. */
export function eventChoices(run: RunState): EventChoice[] {
  const p = run.pending;
  if (p?.kind !== 'event') return [];
  return EVENTS[p.id].choices.filter(
    (c) => (!c.when || (c.when === 'noWish' ? run.wishes < MAX_WISHES : run.wishes >= MAX_WISHES)) && run.gold >= (c.minGold ?? 0),
  );
}

/** Take a choice at a chance encounter; returns the result text. */
export function chooseEvent(run: RunState, index: number): string {
  const choice = eventChoices(run)[index];
  if (!choice) throw new Error('no such choice');
  const e = choice.effect;
  let result = choice.result;
  let next: Pending | undefined;
  if (e.kind === 'wish') run.wishes = Math.min(MAX_WISHES, run.wishes + 1);
  else if (e.kind === 'curse') {
    run.cursed = true;
    run.gold += e.gold;
    run.stats.gold += e.gold;
  }
  else if (e.kind === 'gold') {
    run.gold += e.amount;
    run.stats.gold += e.amount;
  } else if (e.kind === 'help') {
    run.gold -= e.cost;
    run.traveller = true;
  } else if (e.kind === 'feast') run.feast = FEAST.fights;
  else if (e.kind === 'altar') {
    // The hero with the fewest abilities bleeds, and gets an extra pick.
    const slot = run.team.map((_, i) => i).sort((a, b) => slotsUsed(run.builds[a]) - slotsUsed(run.builds[b]) || b - a)[0];
    run.builds[slot].wound = ALTAR_WOUND;
    result = result.replace('Your least experienced hero', heroLabel(run, slot));
    next = { kind: 'train', source: 'altar', left: [slot] };
  }
  finishPending(run);
  if (next) run.pending = next;
  return result;
}

// --- the AI (Auto, and the balance simulator) ----------------------------

const ROLE_ORDER: HeroClass[][] = [['warrior', 'paladin'], ['priest'], ['mage', 'warlock', 'rogue']];

/** Auto's route: steady fights, campsites, chests and shops; elites only with a full party. */
export function autoPath(run: RunState): string {
  const options = availableNodes(run);
  const score = (n: MapNode) => {
    const base: Record<string, number> = { fight: 3, campsite: 5, chest: 4, event: 4, shop: run.gold >= 45 ? 4 : 1, elite: run.team.length >= MAX_PARTY ? 2 : -2, boss: 9 };
    return (base[n.type] ?? 0) + (n.rich ? 1 : 0);
  };
  return options.reduce((best, n) => (score(n) > score(best) ? n : best)).id;
}

/** Auto's recruit: fill a missing tank, then a healer, then a damage class not in the party yet. */
export function autoRecruit(run: RunState): { cls: HeroClass; first: AbilityId } {
  const [tanks, healers, dps] = ROLE_ORDER;
  const cls =
    tanks.find(() => !run.team.some((c) => tanks.includes(c))) ??
    healers.find(() => !run.team.some((c) => healers.includes(c))) ??
    dps.find((c) => !run.team.includes(c)) ??
    dps[run.team.length % dps.length];
  return { cls, first: HERO_KIT[cls].starting };
}

/** Auto's pick for the next hero waiting at a chest or training campsite: their class's preferred pick. */
export function autoTrain(run: RunState): { slot: number; reward: Reward | null } {
  const p = run.pending;
  if (p?.kind !== 'train') throw new Error('no training here');
  const slot = p.left[0];
  const options = trainOptions(run, slot);
  return { slot, reward: options.length ? autoChoose(run.team[slot], options) : null };
}

/** Auto's upgrade pick: a named upgrade on a hero's first ability, then any named upgrade, then the first offered. */
export function autoUpgrade(run: RunState, options: PartyReward[]): PartyReward | null {
  if (!options.length) return null;
  return (
    options.find((o) => o.reward.kind === 'mastery' && run.builds[o.slot].abilities[0]?.id === o.reward.id) ??
    options.find((o) => o.reward.kind === 'mastery') ??
    options[0]
  );
}

/** Auto at a shop: buy abilities for heroes with the fewest, then upgrades, while gold lasts. */
export function autoShop(run: RunState): void {
  const p = run.pending;
  if (p?.kind !== 'shop') return;
  for (;;) {
    const options = p.stock
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !item.sold && item.price <= run.gold)
      .sort((a, b) => Number(b.item.reward.kind === 'ability' || b.item.reward.kind === 'trait') - Number(a.item.reward.kind === 'ability' || a.item.reward.kind === 'trait'));
    if (!options.length) break;
    buy(run, options[0].i);
  }
  leaveShop(run);
}

/** Make whatever choice is waiting, the way Auto would. */
export function autoResolve(run: RunState): void {
  const p = run.pending;
  if (!p) return;
  if (p.kind === 'recruit') {
    const r = autoRecruit(run);
    recruit(run, r.cls, r.first);
  } else if (p.kind === 'train') {
    const t = autoTrain(run);
    train(run, t.slot, t.reward);
  } else if (p.kind === 'upgrade') chooseUpgrade(run, autoUpgrade(run, p.options));
  else if (p.kind === 'event') chooseEvent(run, 0);
  else autoShop(run);
}

export function autoChoose(cls: HeroClass, options: Reward[]): Reward {
  const pool = CLASS_POOL[cls];
  const rank = (r: Reward) => pool.indexOf((r as { id: AbilityId | TraitId }).id);
  const fresh = options.filter((o) => o.kind === 'ability' || o.kind === 'trait').sort((a, b) => rank(a) - rank(b))[0];
  const starting = HERO_KIT[cls].starting;
  return (
    fresh ??
    options.find((o) => o.kind === 'mastery' && o.id === starting) ??
    options.find((o) => o.kind === 'mastery') ??
    options.find((o) => o.kind === 'power' && o.id === starting) ??
    options.find((o) => o.kind === 'might') ??
    options[0]
  );
}
export function applyReward(b: HeroBuild, r: Reward): void {
  switch (r.kind) {
    case 'ability':
      if (slotsUsed(b) < MAX_ABILITY_SLOTS && !b.abilities.some((a) => a.id === r.id)) b.abilities.push({ id: r.id, power: 0, haste: 0, mastery: false });
      break;
    case 'trait':
      if (slotsUsed(b) < MAX_ABILITY_SLOTS && !b.traits.includes(r.id)) b.traits.push(r.id);
      break;
    case 'mastery': {
      const a = b.abilities.find((x) => x.id === r.id);
      if (a) a.mastery = true;
      break;
    }
    case 'power':
    case 'haste': {
      const a = b.abilities.find((x) => x.id === r.id);
      if (a) a[r.kind] += 1;
      break;
    }
    case 'vitality':
      b.vitality = (b.vitality ?? 0) + 1;
      break;
    case 'might':
      b.might = (b.might ?? 0) + 1;
      break;
    case 'focus':
      b.focus = (b.focus ?? 0) + 1;
      break;
  }
}
export function describeReward(r: Reward): { tag: string; title: string; text: string } {
  switch (r.kind) {
    case 'ability':
      return { tag: 'NEW ABILITY', title: ABILITIES[r.id].name, text: ABILITIES[r.id].description };
    case 'trait':
      return { tag: 'NEW PASSIVE', title: TRAITS[r.id].name, text: TRAITS[r.id].description };
    case 'mastery':
      return { tag: 'UPGRADE', title: `${ABILITIES[r.id].name}: ${ABILITIES[r.id].mastery.name}`, text: ABILITIES[r.id].mastery.text };
    case 'power':
      return { tag: 'UPGRADE', title: `Empowered ${ABILITIES[r.id].name}`, text: `+${UPGRADE.powerPerRank * 100}% damage / healing / effect.` };
    case 'haste':
      return { tag: 'UPGRADE', title: `Quick ${ABILITIES[r.id].name}`, text: `${Math.round((1 - UPGRADE.hastePerRank) * 100)}% shorter cooldown.` };
    case 'vitality':
      return { tag: 'UPGRADE', title: 'Vitality', text: `+${UPGRADE.vitalityPerRank * 100}% maximum health.` };
    case 'might':
      return { tag: 'UPGRADE', title: 'Might', text: `+${UPGRADE.mightPerRank * 100}% damage and healing.` };
    case 'focus':
      return { tag: 'UPGRADE', title: 'Focus', text: `+${UPGRADE.focusPerRank * 100}% mana / energy regeneration.` };
  }
}
export function rewardPreview(run: RunState, slot: number, r: Reward): { now?: string; after: string } | null {
  const b = run.builds[slot];
  const stats = { level: b.level, might: 1 + UPGRADE.mightPerRank * (b.might ?? 0), traits: b.traits };
  const current = (id: AbilityId) => b.abilities.find((a) => a.id === id);
  switch (r.kind) {
    case 'ability':
      return { after: abilityText(stats, { id: r.id }) };
    case 'mastery':
    case 'power': {
      const a = current(r.id);
      if (!a) return null;
      const upgraded = r.kind === 'mastery' ? { ...a, mastery: true } : { ...a, power: a.power + 1 };
      return { now: abilityText(stats, a), after: abilityText(stats, upgraded) };
    }
    case 'haste': {
      const a = current(r.id);
      if (!a) return null;
      const cd = (h: number) => (ABILITIES[r.id].cooldown * Math.pow(UPGRADE.hastePerRank, h)).toFixed(1);
      return { now: `Cooldown ${cd(a.haste)}s.`, after: `Cooldown ${cd(a.haste + 1)}s.` };
    }
    case 'vitality': {
      const hp = (v: number) => Math.round(HERO_STATS[run.team[slot]].maxHp * (1 + LEVEL_SCALING * (stats.level - 1)) * (1 + UPGRADE.vitalityPerRank * v));
      return { now: `${hp(b.vitality ?? 0)} max health.`, after: `${hp((b.vitality ?? 0) + 1)} max health.` };
    }
    case 'might':
      return { now: `+${(b.might ?? 0) * UPGRADE.mightPerRank * 100}% damage and healing.`, after: `+${((b.might ?? 0) + 1) * UPGRADE.mightPerRank * 100}% damage and healing.` };
    case 'focus': {
      const regen = (f: number) => (RESOURCES[HERO_KIT[run.team[slot]].resource].regen * (1 + UPGRADE.focusPerRank * f)).toFixed(1);
      return { now: `${regen(b.focus ?? 0)} per second.`, after: `${regen((b.focus ?? 0) + 1)} per second.` };
    }
    case 'trait':
      return null;
  }
}

// --- saving -------------------------------------------------------------

const SAVE_KEY = 'fightwithfriends.run.v5';
/** Saves from before the map run (and the round-based Camp Mode's run in progress). */
const OLD_KEYS = ['fightwithfriends.run.v4', 'fightwithfriends.run.v3', 'fightwithfriends.campRun.v1'];
const BEST_KEY = 'fightwithfriends.best';
const WINS_KEY = 'fightwithfriends.wins';

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable: the run just won't persist */
  }
}

export function loadRun(): RunState | null {
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    const ok = run?.version === 5 && Array.isArray(run.team) && run.team.length === run.builds.length && run.team.length <= MAX_PARTY && (run.status === 'map' || run.status === 'fight');
    if (!ok) return null;
    run.baseLevel ??= 1;
    run.wishes ??= 0;
    run.attempt ??= 0;
    // Saves from before challenges and feasts were folded into elites and events, and the Gambler left.
    for (const n of Object.values(run.map.nodes) as { type: string }[]) {
      if (n.type === 'challenge') n.type = 'elite';
      if (n.type === 'feast') n.type = 'event';
    }
    const old = run.pending as { kind: string; source?: string; id?: string } | undefined;
    if (old?.kind === 'upgrade' && old.source === 'challenge') old.source = 'elite';
    if (old?.kind === 'event' && old.id === 'gambler') old.id = 'helper';
    run.loot ??= { spoils: 0, ore: 0, hide: 0, gems: 0, trophies: 0 };
    return run;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Furthest progress ever: act * 100 + floor (0 if none). */
export function bestProgress(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Record how far a run got; returns true if it's a new best. */
export function recordProgress(run: RunState): boolean {
  const node = currentNode(run);
  const value = run.status === 'won' ? 999 : run.act * 100 + (node ? node.floor + 1 : 0);
  if (value <= bestProgress()) return false;
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* ignore */
  }
  return true;
}

export function recordWin(): number {
  try {
    const n = (Number(localStorage.getItem(WINS_KEY)) || 0) + 1;
    localStorage.setItem(WINS_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
}

export function winsSoFar(): number {
  try {
    return Number(localStorage.getItem(WINS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** "Act 2, floor 7" for a best-progress value. */
export function describeProgress(value: number): string {
  if (value >= 999) return 'a win';
  if (!value) return 'none yet';
  return value % 100 ? `Act ${Math.floor(value / 100)}, floor ${value % 100}` : `the start of Act ${Math.floor(value / 100)}`;
}
