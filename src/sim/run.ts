import { ABILITIES, CHOICE_EVERY, CLASS_POOL, DEFAULT_TEAM, defaultPlacement, freeTile, HERO_KIT, MAX_ABILITY_SLOTS, NEW_ABILITY_AFTER_WAVES, partySize, START_LIVES, TRAITS, UPGRADE } from './content';
import { createRng } from './rng';
import type { AbilityId, HeroBuild, HeroClass, Tile, TraitId } from './types';

/** Everything that carries over between rounds in a run. */
export interface RunState {
  version: 3;
  seed: number;
  /** The party: one class per slot (duplicates allowed). Grows 3 -> 4 -> 5. */
  team: HeroClass[];
  /** The round about to be fought (1-based). Runs are endless. */
  wave: number;
  /** One build per team slot. */
  builds: HeroBuild[];
  /** Board tile per team slot; kept between rounds. */
  placement: Tile[];
  /** Losing a round costs a life; the run ends at zero. */
  lives: number;
}

export type Reward =
  | { kind: 'ability'; id: AbilityId }
  | { kind: 'trait'; id: TraitId }
  | { kind: 'power'; id: AbilityId }
  | { kind: 'haste'; id: AbilityId }
  | { kind: 'vitality' }
  | { kind: 'might' };

export const ALL_CLASSES: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];

function freshBuild(cls: HeroClass, level = 1): HeroBuild {
  return { level, abilities: [{ id: HERO_KIT[cls].starting, power: 0, haste: 0 }], traits: [], vitality: 0, might: 0 };
}

export function newRun(team: HeroClass[] = DEFAULT_TEAM, seed = Date.now() % 1_000_000): RunState {
  return { version: 3, seed, team: [...team], wave: 1, builds: team.map((cls) => freshBuild(cls)), placement: defaultPlacement(team), lives: START_LIVES };
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
  const used = new Set(run.placement.map((t) => `${t.col},${t.row}`));
  run.placement.push(freeTile(used, ['warrior', 'rogue'].includes(cls) ? [0, 1, 2] : [2, 1, 0]));
}

/** A lost round: costs a life. Returns true if the run goes on (retry the same round). */
export function loseRound(run: RunState): boolean {
  run.lives = Math.max(0, run.lives - 1);
  return run.lives > 0;
}

function slotsUsed(b: HeroBuild): number {
  return b.abilities.length + b.traits.length;
}

function traitFor(cls: HeroClass): TraitId {
  return (Object.values(TRAITS).find((t) => t.cls === cls) ?? TRAITS.rage).id;
}

/** Does clearing the current round give a reward choice (vs. an automatic level-up)? */
export function isChoiceWave(run: RunState): boolean {
  return run.wave % CHOICE_EVERY === 0;
}

/** Is the reward after the current round a "new ability" milestone? */
export function isAbilityMilestone(run: RunState): boolean {
  return NEW_ABILITY_AFTER_WAVES.includes(run.wave);
}

/** The next round after which a new ability will be offered (or null). */
export function nextAbilityMilestone(run: RunState): number | null {
  return NEW_ABILITY_AFTER_WAVES.find((w) => w > run.wave) ?? null;
}

function newAbilities(cls: HeroClass, b: HeroBuild): Reward[] {
  if (slotsUsed(b) >= MAX_ABILITY_SLOTS) return [];
  return CLASS_POOL[cls].filter((id) => !b.abilities.some((a) => a.id === id)).map((id) => ({ kind: 'ability' as const, id }));
}

function upgradeRewards(cls: HeroClass, b: HeroBuild): Reward[] {
  const out: Reward[] = [];
  const trait = traitFor(cls);
  if (!b.traits.includes(trait) && slotsUsed(b) < MAX_ABILITY_SLOTS) out.push({ kind: 'trait', id: trait });
  for (const a of b.abilities) {
    out.push({ kind: 'power', id: a.id });
    if (a.haste < 2) out.push({ kind: 'haste', id: a.id });
  }
  out.push({ kind: 'vitality' }, { kind: 'might' });
  return out;
}

/**
 * Three reward options for a level-up. After milestone rounds they are new
 * abilities; otherwise upgrades, the class trait and general boosts.
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
  const fresh = isAbilityMilestone(run) ? shuffle(newAbilities(cls, b)) : [];
  const picks = fresh.slice(0, 3);
  for (const r of shuffle(upgradeRewards(cls, b))) {
    if (picks.length >= 3) break;
    picks.push(r);
  }
  return picks;
}

/** What the AI (or "Choose for me") picks: a new ability in pool order, the trait, else power on the starting ability. */
export function autoChoose(cls: HeroClass, options: Reward[]): Reward {
  const pool = CLASS_POOL[cls];
  const newAbility = options
    .filter((o) => o.kind === 'ability')
    .sort((a, b) => pool.indexOf((a as { id: AbilityId }).id) - pool.indexOf((b as { id: AbilityId }).id))[0];
  return (
    newAbility ??
    options.find((o) => o.kind === 'trait') ??
    options.find((o) => o.kind === 'power' && o.id === HERO_KIT[cls].starting) ??
    options.find((o) => o.kind === 'might') ??
    options[0]
  );
}

export function applyReward(b: HeroBuild, r: Reward): void {
  switch (r.kind) {
    case 'ability':
      if (slotsUsed(b) < MAX_ABILITY_SLOTS && !b.abilities.some((a) => a.id === r.id)) b.abilities.push({ id: r.id, power: 0, haste: 0 });
      break;
    case 'trait':
      if (slotsUsed(b) < MAX_ABILITY_SLOTS && !b.traits.includes(r.id)) b.traits.push(r.id);
      break;
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
    case 'power':
      return { tag: 'UPGRADE', title: `Empowered ${ABILITIES[r.id].name}`, text: `+${UPGRADE.powerPerRank * 100}% damage / healing / effect.` };
    case 'haste':
      return {
        tag: 'UPGRADE',
        title: `Quick ${ABILITIES[r.id].name}`,
        text: `${Math.round((1 - UPGRADE.hastePerRank) * 100)}% shorter cooldown.`,
      };
    case 'vitality':
      return { tag: 'UPGRADE', title: 'Vitality', text: `+${UPGRADE.vitalityPerRank * 100}% maximum health.` };
    case 'might':
      return { tag: 'UPGRADE', title: 'Might', text: `+${UPGRADE.mightPerRank * 100}% damage and healing.` };
  }
}

// --- saving -------------------------------------------------------------

const SAVE_KEY = 'fightwithfriends.run.v3';
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
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    const ok =
      run?.version === 3 &&
      Array.isArray(run.team) &&
      Array.isArray(run.builds) &&
      Array.isArray(run.placement) &&
      run.team.length === run.builds.length &&
      run.team.length === run.placement.length &&
      run.lives > 0;
    return ok ? run : null;
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
