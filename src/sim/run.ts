import { abilityText } from './abilityText';
import { ABILITIES, CHOICE_EVERY, CLASS_POOL, DEFAULT_TEAM, HERO_KIT, HERO_STATS, MAX_ABILITY_SLOTS, partySize, RESOURCES, START_LIVES, TRAITS, UPGRADE, LEVEL_SCALING } from './content';
import { createRng } from './rng';
import type { AbilityId, HeroBuild, HeroClass, TraitId } from './types';

/** Everything that carries over between rounds in a run. */
export interface RunState {
  version: 4;
  seed: number;
  /** The party: one class per slot (duplicates allowed). Grows 3 -> 4 -> 5. */
  team: HeroClass[];
  /** The round about to be fought (1-based). Runs are endless. */
  wave: number;
  /** One build per team slot. */
  builds: HeroBuild[];
  /** Losing a round costs a life; the run ends at zero. */
  lives: number;
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

export const ALL_CLASSES: HeroClass[] = ['warrior', 'paladin', 'priest', 'mage', 'warlock', 'rogue'];

const isTrait = (id: AbilityId | TraitId): id is TraitId => id in TRAITS;

function freshBuild(cls: HeroClass, level = 1): HeroBuild {
  return { level, abilities: [{ id: HERO_KIT[cls].starting, power: 0, haste: 0, mastery: false }], traits: [], vitality: 0, might: 0, focus: 0 };
}

export function newRun(team: HeroClass[] = DEFAULT_TEAM, seed = Date.now() % 1_000_000): RunState {
  return { version: 4, seed, team: [...team], wave: 1, builds: team.map((cls) => freshBuild(cls)), lives: START_LIVES };
}

/** Does the party have an open slot to fill before this round (after the round 10 and 20 bosses)? */
export function needsRecruit(run: RunState): boolean {
  return run.team.length < partySize(run.wave);
}

/**
 * Add a hero to the party. They join at the party's level and with the
 * rewards they would have picked so far, so they aren't left behind.
 */
export function recruit(run: RunState, cls: HeroClass): void {
  const slot = run.team.length;
  const level = Math.max(...run.builds.map((b) => b.level));
  run.team.push(cls);
  run.builds.push(freshBuild(cls, level));
  const round = run.wave;
  for (let w = CHOICE_EVERY; w < round; w += CHOICE_EVERY) {
    run.wave = w;
    applyReward(run.builds[slot], autoChoose(cls, rewardOptions(run, slot)));
  }
  run.wave = round;
}

/** A lost round: costs a life. Returns true if the run goes on (retry the same round). */
export function loseRound(run: RunState): boolean {
  run.lives = Math.max(0, run.lives - 1);
  return run.lives > 0;
}

function slotsUsed(b: HeroBuild): number {
  return b.abilities.length + b.traits.length;
}

/** Does clearing the current round give a reward choice (vs. an automatic level-up)? */
export function isChoiceWave(run: RunState): boolean {
  return run.wave % CHOICE_EVERY === 0;
}

/** Abilities and passives from the class pool this hero hasn't taken yet (if a slot is free). */
function freshPicks(cls: HeroClass, b: HeroBuild): Reward[] {
  if (slotsUsed(b) >= MAX_ABILITY_SLOTS) return [];
  return CLASS_POOL[cls]
    .filter((id) => (isTrait(id) ? !b.traits.includes(id) : !b.abilities.some((a) => a.id === id)))
    .map((id) => (isTrait(id) ? { kind: 'trait' as const, id } : { kind: 'ability' as const, id }));
}

/** Named upgrades for abilities the hero has, then general ones. Only upgrades that do something are offered. */
function upgrades(cls: HeroClass, b: HeroBuild): { masteries: Reward[]; general: Reward[] } {
  const masteries: Reward[] = b.abilities.filter((a) => !a.mastery && ABILITIES[a.id].mastery.name).map((a) => ({ kind: 'mastery' as const, id: a.id }));
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

/**
 * Three options for a reward choice: while slots are free, two new abilities
 * or passives from the class pool plus one upgrade (so taking an upgrade early
 * is a real trade-off); once full, three upgrades. Seeded, so reloading shows
 * the same options.
 */
export function rewardOptions(run: RunState, slot: number): Reward[] {
  const cls = run.team[slot];
  const b = run.builds[slot];
  const rng = createRng(run.seed * 31 + run.wave * 977 + slot * 131 + ALL_CLASSES.indexOf(cls));
  const shuffle = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const picks = shuffle(freshPicks(cls, b)).slice(0, 2);
  const { masteries, general } = upgrades(cls, b);
  // Named upgrades first (they change how an ability plays), then the rest.
  const ups = [...shuffle(masteries), ...shuffle(general)];
  for (const u of ups) {
    if (picks.length >= 3) break;
    picks.push(u);
  }
  return picks;
}

/**
 * What the AI (or "Choose for me") picks: a new ability or passive in the
 * class's preference order; once slots are full, the starting ability's named
 * upgrade, then any named upgrade, then Empowered on the starting ability, then Might.
 */
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

/**
 * Finish a round: every hero levels up. On choice rounds each hero takes its
 * pick from `picks` (by team slot); missing picks are chosen automatically.
 */
export function completeWave(run: RunState, picks: (Reward | null | undefined)[] = []): Reward[] {
  const taken: Reward[] = [];
  const choice = isChoiceWave(run);
  run.team.forEach((cls, slot) => {
    const b = run.builds[slot];
    if (choice) {
      const pick = picks[slot] ?? autoChoose(cls, rewardOptions(run, slot));
      applyReward(b, pick);
      taken[slot] = pick;
    }
    b.level += 1;
  });
  run.wave += 1;
  return taken;
}

/** Human-readable text for a reward option. */
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

/**
 * The numbers a reward changes, as "now" and "after" lines, for the reward
 * cards. Uses the level the hero will fight at next round.
 */
export function rewardPreview(run: RunState, slot: number, r: Reward): { now?: string; after: string } | null {
  const b = run.builds[slot];
  const stats = { level: b.level + 1, might: 1 + UPGRADE.mightPerRank * (b.might ?? 0), traits: b.traits };
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

const SAVE_KEY = 'fightwithfriends.run.v4';
/** Runs saved before the grid was removed and the ability pools grew. */
const OLD_SAVE_KEY = 'fightwithfriends.run.v3';
const BEST_KEY = 'fightwithfriends.bestRound';

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable: the run just won't persist */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(OLD_SAVE_KEY);
    if (!raw) return null;
    const run = migrateRun(JSON.parse(raw));
    const ok = !!run && Array.isArray(run.team) && Array.isArray(run.builds) && run.team.length === run.builds.length && run.lives > 0;
    return ok ? run : null;
  } catch {
    return null;
  }
}

/** Bring an older saved run up to date (v3 had a board layout and a few abilities that were replaced). */
export function migrateRun(data: unknown): RunState | null {
  const run = data as { version?: number } & Partial<RunState> & { placement?: unknown };
  if (run?.version === 4) return run as RunState;
  if (run?.version !== 3 || !Array.isArray(run.builds) || !Array.isArray(run.team)) return null;
  const replaced: Record<string, AbilityId> = { prayerOfHealing: 'holyNova' };
  const replacedTraits: Record<string, TraitId> = { innerFocus: 'blessedHands' };
  const builds = run.builds.map((b) => ({
    ...b,
    abilities: b.abilities.map((a) => ({ ...a, id: replaced[a.id] ?? a.id, mastery: false })),
    traits: b.traits.map((t) => replacedTraits[t] ?? t),
    focus: 0,
  }));
  return { version: 4, seed: run.seed ?? 1, team: run.team, wave: run.wave ?? 1, builds, lives: run.lives ?? 1 };
}

export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(OLD_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Highest round ever reached (0 if none). */
export function bestRound(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Record a round reached; returns true if it's a new best. */
export function recordRound(round: number): boolean {
  if (round <= bestRound()) return false;
  try {
    localStorage.setItem(BEST_KEY, String(round));
  } catch {
    /* ignore */
  }
  return true;
}
