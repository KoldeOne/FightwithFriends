import { ABILITIES, CLASS_POOL, HERO_KIT, MAX_ABILITY_SLOTS, RUN_WAVES, TRAITS, UPGRADE } from './content';
import { createRng } from './rng';
import type { AbilityId, HeroBuild, HeroClass, TraitId } from './types';

/** Everything that carries over between waves in a run. */
export interface RunState {
  version: 1;
  seed: number;
  playerClass: HeroClass;
  /** The wave about to be fought (1-based). */
  wave: number;
  builds: Record<HeroClass, HeroBuild>;
}

export type Reward =
  | { kind: 'ability'; id: AbilityId }
  | { kind: 'trait'; id: TraitId }
  | { kind: 'power'; id: AbilityId }
  | { kind: 'haste'; id: AbilityId };

export const ALL_CLASSES: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];

export function newRun(playerClass: HeroClass, seed = Date.now() % 1_000_000): RunState {
  const builds = {} as Record<HeroClass, HeroBuild>;
  for (const cls of ALL_CLASSES) {
    builds[cls] = { level: 1, abilities: [{ id: HERO_KIT[cls].starting, power: 0, haste: 0 }], traits: [] };
  }
  return { version: 1, seed, playerClass, wave: 1, builds };
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

/** Every reward this hero could be offered right now. */
export function allRewards(cls: HeroClass, b: HeroBuild): { newOnes: Reward[]; upgrades: Reward[] } {
  const newOnes: Reward[] = [];
  if (slotsUsed(b) < MAX_ABILITY_SLOTS) {
    for (const id of CLASS_POOL[cls]) if (!b.abilities.some((a) => a.id === id)) newOnes.push({ kind: 'ability', id });
    const trait = traitFor(cls);
    if (!b.traits.includes(trait)) newOnes.push({ kind: 'trait', id: trait });
  }
  const upgrades: Reward[] = [];
  for (const a of b.abilities) {
    upgrades.push({ kind: 'power', id: a.id });
    if (a.haste < 2) upgrades.push({ kind: 'haste', id: a.id });
  }
  return { newOnes, upgrades };
}

/**
 * Three reward options for a level-up. While slots are free, at least one
 * option is always something new (an ability or a trait).
 */
export function rewardOptions(run: RunState, cls: HeroClass): Reward[] {
  const b = run.builds[cls];
  const rng = createRng(run.seed * 31 + run.wave * 977 + ALL_CLASSES.indexOf(cls));
  const { newOnes, upgrades } = allRewards(cls, b);
  const shuffle = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const picks: Reward[] = [];
  const freshNew = shuffle(newOnes);
  if (freshNew.length) picks.push(freshNew.shift()!);
  for (const r of shuffle([...freshNew, ...upgrades])) {
    if (picks.length >= 3) break;
    picks.push(r);
  }
  return picks;
}

/** What the AI (or "Choose for me") picks: new things first, in pool order, else power on the starting ability. */
export function autoChoose(cls: HeroClass, options: Reward[]): Reward {
  const pool = CLASS_POOL[cls];
  const newAbility = options
    .filter((o) => o.kind === 'ability')
    .sort((a, b) => pool.indexOf(a.id as AbilityId) - pool.indexOf(b.id as AbilityId))[0];
  return newAbility ?? options.find((o) => o.kind === 'trait') ?? options.find((o) => o.kind === 'power') ?? options[0];
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
  }
}

/**
 * Finish a wave: every hero levels up, the player takes `playerPick`, and
 * the AI teammates choose their own rewards. Returns what each AI picked.
 */
export function completeWave(run: RunState, playerPick: Reward): Partial<Record<HeroClass, Reward>> {
  const aiPicks: Partial<Record<HeroClass, Reward>> = {};
  for (const cls of ALL_CLASSES) {
    const b = run.builds[cls];
    const pick = cls === run.playerClass ? playerPick : autoChoose(cls, rewardOptions(run, cls));
    if (cls !== run.playerClass) aiPicks[cls] = pick;
    applyReward(b, pick);
    b.level += 1;
  }
  run.wave += 1;
  return aiPicks;
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
  }
}

// --- saving -------------------------------------------------------------

const SAVE_KEY = 'fightwithfriends.run.v1';

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
    return run?.version === 1 && run.builds && run.playerClass ? run : null;
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
