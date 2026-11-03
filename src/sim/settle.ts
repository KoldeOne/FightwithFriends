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
  const spoils = finishFight(run, result.won, result.fallen, result.kills);
  if (spoils.wished) loot = emptyLoot();
  else {
    if (camp) bankLoot(camp, loot);
    addLoot(run.loot, loot);
  }
  return { spoils, loot };
}
