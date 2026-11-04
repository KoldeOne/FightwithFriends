import { actDef, ECONOMY } from './acts';
import { addLoot, bankLoot, emptyLoot, lootFor, scaleLoot, type CampState } from './camp';
import { currentNode, finishFight, fightSeed, type RunState, type Spoils } from './run';
import { ABILITIES, TRAITS } from './content';
import { CLASS_UNLOCKS, lockedPool, MAX_GRAVES, MAX_TIER, TIER_LOOT, TIERS } from './progress';
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
export function settleFight(run: RunState, camp: CampState | undefined, result: FightResult): { spoils: Spoils; loot: Loot; notices: string[] } {
  const node = currentNode(run)!;
  // Golden nodes pay double; each difficulty tier pays 25% more.
  let loot = scaleLoot(lootFor(result.kills, run.act, fightSeed(run)), (node.rich ? ECONOMY.richLoot : 1) * (1 + TIER_LOOT * (run.tier ?? 0)));
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
  const notices = camp && !run.daily ? keepRecords(run, camp, node.type === 'boss' && result.won) : [];
  if (camp && run.daily && run.status !== 'map' && run.status !== 'fight') addGrave(run, camp);
  return { spoils, loot, notices };
}

/** Boss kills (trophy wall), abilities unlocked by them, and at the end of a run its grave, tier and class unlocks. */
function keepRecords(run: RunState, camp: CampState, bossDown: boolean): string[] {
  const r = camp.records;
  const notices: string[] = [];
  if (bossDown) {
    const boss = actDef(run.act).boss;
    r.bossKills[boss] = (r.bossKills[boss] ?? 0) + 1;
    // Every class in the party gets one more of its pool unlocked.
    for (const cls of new Set(run.team)) {
      const before = lockedPool(cls, r.classBosses[cls] ?? 0);
      r.classBosses[cls] = (r.classBosses[cls] ?? 0) + 1;
      const after = lockedPool(cls, r.classBosses[cls] ?? 0);
      for (const id of before.filter((x) => !after.includes(x))) {
        const name = (ABILITIES as Record<string, { name: string }>)[id]?.name ?? (TRAITS as Record<string, { name: string }>)[id]?.name ?? id;
        notices.push(`New ${cls[0].toUpperCase() + cls.slice(1)} ability unlocked: ${name}`);
      }
    }
  }
  if (run.status === 'won') {
    const t = run.tier ?? 0;
    r.tierWins[t] = (r.tierWins[t] ?? 0) + 1;
    if (r.tierWins[t] === 1) {
      if (t + 1 <= MAX_TIER && r.tier < t + 1) {
        r.tier = t + 1;
        notices.push(`${TIERS[t + 1].name} unlocked: ${TIERS[t + 1].rule}`);
      }
      const cls = CLASS_UNLOCKS[t];
      if (cls) notices.push(`New class unlocked: ${cls[0].toUpperCase() + cls.slice(1)}`);
    }
  }
  if (run.status === 'won' || run.status === 'lost') addGrave(run, camp);
  return notices;
}

/** The graveyard: one marker per finished run (newest first). */
export function addGrave(run: RunState, camp: CampState): void {
  const node = currentNode(run);
  camp.records.graves.unshift({
    at: Date.now(),
    team: [...run.team],
    levels: run.builds.map((b) => b.level),
    reached: run.status === 'won' ? 999 : run.act * 100 + (node ? node.floor + 1 : 0),
    tier: run.tier ?? 0,
    won: run.status === 'won',
    daily: run.daily,
  });
  camp.records.graves.length = Math.min(camp.records.graves.length, MAX_GRAVES);
}
