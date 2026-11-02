import { ABILITIES, CHOICE_AFTER_WAVES, CLASS_POOL, DEFAULT_TEAM, HERO_KIT, MAX_ABILITY_SLOTS, NEW_ABILITY_AFTER_WAVES, RUN_WAVES, TRAITS, UPGRADE } from './content';
import { createRng } from './rng';
import type { AbilityId, HeroBuild, HeroClass, TraitId } from './types';

/** Everything that carries over between waves in a run. */
export interface RunState {
  version: 2;
  seed: number;
  /** The chosen team: one class per slot (duplicates allowed). */
  team: HeroClass[];
  /** The wave about to be fought (1-based). */
  wave: number;
  /** One build per team slot. */
  builds: HeroBuild[];
}

export type Reward =
  | { kind: 'ability'; id: AbilityId }
  | { kind: 'trait'; id: TraitId }
  | { kind: 'power'; id: AbilityId }
  | { kind: 'haste'; id: AbilityId }
  | { kind: 'vitality' }
  | { kind: 'might' };

export const ALL_CLASSES: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];

export function newRun(team: HeroClass[] = DEFAULT_TEAM, seed = Date.now() % 1_000_000): RunState {
  const builds = team.map((cls) => ({ level: 1, abilities: [{ id: HERO_KIT[cls].starting, power: 0, haste: 0 }], traits: [], vitality: 0, might: 0 }));
  return { version: 2, seed, team: [...team], wave: 1, builds };
}

export function isRunComplete(run: RunState): boolean {
  return run.wave > RUN_WAVES;
}

function slotsUsed(b: HeroBuild): number {
  return b.abilities.length + b.traits.length;
}

function traitFor(cls: HeroClass): TraitId {
  return (Object.values(TRAITS).find((t) => t.cls === cls) ?? TRAITS.rage).id;
}

/** Does clearing the current wave give a reward choice (vs. an automatic level-up)? */
export function isChoiceWave(run: RunState): boolean {
  return CHOICE_AFTER_WAVES.includes(run.wave);
}

/** Is the reward after the current wave a "new ability" milestone? */
export function isAbilityMilestone(run: RunState): boolean {
  return NEW_ABILITY_AFTER_WAVES.includes(run.wave);
}

/** The next wave after which a new ability will be offered (or null). */
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
 * Three reward options for a level-up. After milestone waves (4 and 9) they
 * are new abilities; otherwise upgrades, the class trait and general boosts.
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
 * Finish a wave: every hero levels up. On choice waves each hero takes its
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

const SAVE_KEY = 'fightwithfriends.run.v2';

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
    return run?.version === 2 && Array.isArray(run.team) && Array.isArray(run.builds) && run.team.length === run.builds.length ? run : null;
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
