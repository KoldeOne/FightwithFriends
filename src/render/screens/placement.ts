import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { BOARD, heroTileAt, WORLD } from '../../sim/content';
import { sound } from '../sound';
import { saveRun } from '../../sim/run';
import { GOLD } from '../theme';

/** The placement phase: arranging heroes on the board before a fight. */
export class Placement {
  constructor(readonly s: BattleScene) {}

  // Placement phase
  /** Team slot of the hero picked up to move, if any. */
  selectedSlot: number | null = null;
  /** Board tile outlines and highlights. */
  tileLayer!: Phaser.GameObjects.Graphics;
  placementUi?: Phaser.GameObjects.Container;

  // --- placement ------------------------------------------------------------

  /** Before each round: the enemy line-up is visible; move heroes between tiles, then Fight. */
  startPlacement(): void {
    this.s.state = 'placing';
    this.selectedSlot = null;
    const cx = WORLD.width / 2;
    const midY = (BOARD.enemyRowY[0] + BOARD.heroRowY[0]) / 2;
    const w = this.s.battle.wave;
    const fight = this.s.button(cx, midY + 4, 'Fight! ▶', 22, w.boss ? '#a83232' : '#2e86de', () => this.s.startFight());
    this.placementUi = this.s.add
      .container(0, 0, [this.s.text(cx, midY - 48, 'Tap a hero, then a tile to move them.', 14, '#ffffff').setOrigin(0.5).setStroke('#000000', 3), fight])
      .setDepth(60);
  }

  /** Tap during placement: pick up a hero, or drop the picked-up hero on a tile (swapping if taken). */
  placementTap(pointer: Phaser.Input.Pointer): void {
    const hero = this.s.battle.heroes.find((h) => Math.hypot(h.x - pointer.x, h.y - pointer.y) <= h.radius + 20);
    const tile = heroTileAt(pointer.x, pointer.y);
    if (this.selectedSlot !== null && tile) {
      sound.play('click');
      this.s.battle.placeHero(this.selectedSlot, tile);
      this.selectedSlot = null;
      if (this.s.run) {
        this.s.run.placement = this.s.battle.placement;
        saveRun(this.s.run);
      }
      return;
    }
    if (hero) {
      sound.play('click');
      this.selectedSlot = this.selectedSlot === hero.slot ? null : (hero.slot ?? null);
      this.s.battle.setFocus(hero.id);
      return;
    }
    // Tap an enemy to scout it.
    const enemy = this.s.battle.enemies.find((e) => e.alive && Math.hypot(e.x - pointer.x, e.y - pointer.y) <= e.radius + 20);
    this.s.battle.setFocus(enemy ? enemy.id : null);
    this.selectedSlot = null;
  }

  /** Board tiles: faint on both sides; during placement, your side is highlighted. */
  drawTiles(): void {
    const g = this.tileLayer;
    g.clear();
    const placing = this.s.state === 'placing';
    const tile = (x: number, y: number, fill: number, alpha: number, stroke: number, strokeAlpha: number, width = 1) => {
      const w = BOARD.tileW - 8;
      const h = BOARD.tileH - 8;
      g.fillStyle(fill, alpha).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      g.lineStyle(width, stroke, strokeAlpha).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    };
    for (const y of BOARD.enemyRowY) for (const x of BOARD.colX) tile(x, y, 0x000000, 0.06, 0x8b1a1a, placing ? 0.35 : 0.12);
    const selected = this.selectedSlot !== null ? this.s.battle.heroes.find((h) => h.slot === this.selectedSlot) : undefined;
    for (const y of BOARD.heroRowY) {
      for (const x of BOARD.colX) {
        if (!placing) {
          tile(x, y, 0x000000, 0.06, 0x2e86de, 0.12);
          continue;
        }
        const here = selected && selected.x === x && selected.y === y;
        tile(x, y, here ? GOLD : 0x2e86de, here ? 0.25 : selected ? 0.16 : 0.08, here ? GOLD : 0x5dade2, selected ? 0.8 : 0.4, here ? 3 : 1);
      }
    }
  }
}
