import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { BOSS_INFO, ENEMY_STATS, makeRound, WORLD } from '../../sim/content';
import type { EnemyKind } from '../../sim/types';

/** How long Auto waits on the ready screen before pressing Fight (longer when there's boss info to read). */
const AUTO_FIGHT_DELAY_MS = 1500;
const AUTO_FIGHT_BOSS_DELAY_MS = 3000;

/**
 * Before each round (no grid any more: heroes line up by role on their own):
 * the enemy line-up is on the field to scout, with a short summary, what the
 * boss does (on a boss round), a warning the round before a boss, and Fight.
 */
export class ReadyScreen {
  constructor(readonly s: BattleScene) {}

  ui?: Phaser.GameObjects.Container;
  /** Auto's pause before Fight for the round on show. */
  private autoDelay = AUTO_FIGHT_DELAY_MS;

  show(): void {
    this.s.state = 'ready';
    this.ui?.destroy();
    const cx = WORLD.width / 2;
    const w = this.s.battle.wave;
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = 392;
    const line = (str: string, size: number, color: string, bold = false) => {
      const t = this.s.text(cx, y, str, size, color).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(470);
      if (bold) t.setFontStyle('bold');
      t.setStroke('#000000', 3);
      items.push(t);
      y += t.height + 4;
      return t;
    };

    line(`Facing: ${lineupText(w.spawns.map((sp) => sp.kind))}`, 13, '#e6e9f0');
    // On a boss round: what the boss does. The round before: a warning.
    const boss = w.spawns.map((sp) => sp.kind).find((k) => BOSS_INFO[k]);
    const nextBoss = !boss ? makeRound(w.number + 1).spawns.map((sp) => sp.kind).find((k) => BOSS_INFO[k]) : undefined;
    const shown = boss ?? nextBoss;
    this.autoDelay = shown ? AUTO_FIGHT_BOSS_DELAY_MS : AUTO_FIGHT_DELAY_MS;
    if (shown) {
      y += 2;
      line(boss ? `BOSS: ${ENEMY_STATS[shown].label}` : `Next round, a boss: ${ENEMY_STATS[shown].label}`, 14, boss ? '#ff6b6b' : '#ffb347', true);
      for (const move of BOSS_INFO[shown]!.moves) line(`${move.name}: ${move.text}`, 11, '#ffd9c2');
    }
    if (this.s.auto) line('Auto is on: the fight starts in a moment.', 11, '#7dff9b');
    y += 6;
    const fight = this.s.button(cx, y + 22, 'Fight! ▶', 22, w.boss ? '#a83232' : '#2e86de', () => this.s.startFight());
    items.push(fight);
    const top = 382;
    const bottom = y + 50;
    const bg = this.s.add.rectangle(cx, (top + bottom) / 2, 500, bottom - top, 0x10131b, 0.72).setStrokeStyle(1, 0x3a4660);
    this.ui = this.s.add.container(0, 0, [bg, ...items]).setDepth(60);
    if (this.s.auto) this.scheduleAutoFight();
  }

  /** Auto: press Fight after a short pause (time to read the line-up and any boss warning). */
  scheduleAutoFight(): void {
    this.s.time.delayedCall(this.autoDelay, () => {
      if (this.s.auto && this.s.state === 'ready') this.s.startFight();
    });
  }

  hide(): void {
    this.ui?.destroy();
    this.ui = undefined;
  }
}

/** "2 Goblin Grunts, Goblin Shaman" — counted, in line-up order. */
export function lineupText(kinds: EnemyKind[]): string {
  const counts = new Map<EnemyKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => (n > 1 ? `${n} ${plural(ENEMY_STATS[k].label)}` : ENEMY_STATS[k].label)).join(', ');
}

function plural(label: string): string {
  if (label.startsWith('The ')) return label;
  return label.endsWith('s') ? label : `${label}s`;
}
