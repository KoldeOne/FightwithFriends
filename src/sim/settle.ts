import { ECONOMY } from './acts';
import { addLoot, bankLoot, emptyLoot, lootFor, scaleLoot, type CampState } from './camp';
import { currentNode, finishFight, fightSeed, type RunState, type Spoils } from './run';
import type { EnemyKind, Loot } from './types';

/** How a fight went, as the game or the simulator saw it. */
export interface FightResult {
  won: boolean;
  /** Team slots of the heroes who fell. */
  fallen: number[];
  kills: { kind: EnemyKind; summoned: boolean }[];
  /** Damage and healing this fight, by team slot and source (for the run's totals). */
  meter?: { slot: number; damage: Record<string, number>; healing: Record<string, number> }[];
}

/**
 * Settle a finished fight with the run (and the camp, if there is one): the
 * same steps for the game and the balance simulator. Camp loot is rolled from
 * the fight's own seed and sent home win or lose, except when a wish restarts
 * the fight (that fight's loot comes from the restarted attempt instead).
 */
export function settleFight(run: RunState, camp: CampState | undefined, result: FightResult): { spoils: Spoils; loot: Loot } {
  const node = currentNode(run)!;
  let loot = scaleLoot(lootFor(result.kills, run.act, fightSeed(run)), node.rich ? ECONOMY.richLoot : 1);
  // The run's damage and healing totals (every fight counts, the last one too).
  for (const m of result.meter ?? []) {
    run.meter ??= [];
    const t = (run.meter[m.slot] ??= { damage: {}, healing: {} });
    for (const kind of ['damage', 'healing'] as const) for (const [k, v] of Object.entries(m[kind])) t[kind][k] = (t[kind][k] ?? 0) + v;
  }
  const spoils = finishFight(run, result.won, result.fallen, result.kills);
  if (spoils.wished) loot = emptyLoot();
  else {
    if (camp) bankLoot(camp, loot);
    addLoot(run.loot, loot);
  }
  return { spoils, loot };
}
