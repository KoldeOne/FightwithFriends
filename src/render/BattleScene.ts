import Phaser from 'phaser';
import { Battle, STEP } from '../sim/battle';
import { WAVE_1, WORLD } from '../sim/content';
import type { BattleEvent, Unit } from '../sim/types';
import { GATE_ID } from '../sim/types';

const COLORS: Record<string, number> = {
  warrior: 0xc0392b,
  rogue: 0xf1c40f,
  mage: 0x3498db,
  priest: 0xecf0f1,
  grunt: 0x6b8e23,
  archer: 0x8fbc4f,
  runner: 0xb5d33d,
};

const LETTERS: Record<string, string> = {
  warrior: 'W',
  rogue: 'R',
  mage: 'M',
  priest: 'P',
  grunt: 'G',
  archer: 'A',
  runner: '»',
};

const PROJECTILE_COLORS: Record<string, number> = {
  mage: 0xff8c1a,
  priest: 0xfff2a8,
  archer: 0xa0522d,
};

interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Graphics;
  /** Aggro warning badge (non-tank heroes only). */
  aggroIcon?: { container: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc };
  dead: boolean;
}

const DPR = Math.min(window.devicePixelRatio || 1, 3);
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views = new Map<number, UnitView>();
  private acc = 0;
  private speed = 1;
  /** Testing aid: AI DPS hold back before pulling aggro. Persists across restarts. */
  private careful = true;
  private carefulButton!: Phaser.GameObjects.Text;
  private gateBar!: Phaser.GameObjects.Graphics;
  private gateWall!: Phaser.GameObjects.Rectangle;
  private hudText!: Phaser.GameObjects.Text;
  private speedButton!: Phaser.GameObjects.Text;
  private overlayShown = false;

  constructor() {
    super('battle');
  }

  create(): void {
    this.views.clear();
    this.acc = 0;
    this.overlayShown = false;
    this.battle = new Battle({ seed: Date.now() % 1_000_000, wave: WAVE_1, carefulAI: this.careful });

    this.drawField();
    this.drawHud();
    this.handleEvents(this.battle.drainEvents());
    this.syncViews();
  }

  update(_time: number, deltaMs: number): void {
    if (this.battle.outcome === 'running') {
      // Fixed-step simulation; cap catch-up so a background tab doesn't explode.
      this.acc = Math.min(this.acc + (deltaMs / 1000) * this.speed, 0.5);
      while (this.acc >= STEP && this.battle.outcome === 'running') {
        this.battle.step(STEP);
        this.acc -= STEP;
      }
      this.handleEvents(this.battle.drainEvents());
    }
    this.syncViews();
    this.updateHud();
    if (this.battle.outcome !== 'running' && !this.overlayShown) this.showOverlay();
  }

  // --- static scenery -----------------------------------------------------

  private drawField(): void {
    const g = this.add.graphics();
    // Grass field with a darker spawn zone at the top.
    g.fillStyle(0x1d2b1f).fillRect(0, 0, WORLD.width, WORLD.gateY);
    g.fillStyle(0x16211a).fillRect(0, 0, WORLD.width, 90);
    g.lineStyle(1, 0x2a3d2c, 1);
    for (let y = 120; y < WORLD.gateY; y += 80) g.lineBetween(0, y, WORLD.width, y);

    // Castle wall with the gate in the middle.
    g.fillStyle(0x4a4038).fillRect(0, WORLD.gateY, WORLD.width, WORLD.gateHeight);
    g.fillStyle(0x5c5047);
    for (let x = 0; x < WORLD.width; x += 30) g.fillRect(x + 4, WORLD.gateY - 8, 18, 8);
    this.gateWall = this.add.rectangle(WORLD.width / 2, WORLD.gateY + WORLD.gateHeight / 2, 110, WORLD.gateHeight + 6, 0x7a5230);
    this.gateWall.setStrokeStyle(2, 0x3b2716);
    this.text(WORLD.width / 2, WORLD.gateY + WORLD.gateHeight / 2, 'GATE', 13, '#f5e6c8').setOrigin(0.5);
  }

  private drawHud(): void {
    const top = WORLD.hudTop;
    this.add.rectangle(0, top, WORLD.width, WORLD.height - top, 0x0b0e14).setOrigin(0, 0);
    this.add.rectangle(0, top, WORLD.width, 2, 0x2b3445).setOrigin(0, 0);

    this.text(20, top + 16, 'Gate', 16, '#c9d1e0');
    this.gateBar = this.add.graphics();

    this.hudText = this.text(20, top + 48, '', 18, '#ffffff');

    this.speedButton = this.text(WORLD.width - 20, top + 78, '', 16, '#ffffff')
      .setOrigin(1, 0)
      .setPadding(14, 8, 14, 8)
      .setBackgroundColor('#2b3445')
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
      });

    this.carefulButton = this.text(20, top + 78, '', 16, '#ffffff')
      .setPadding(14, 8, 14, 8)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.careful = !this.careful;
        this.battle.carefulAI = this.careful;
      });

    this.text(WORLD.width / 2, 8, 'Step 2 prototype: aggro.   ! orange = close to pulling aggro · ! red = being attacked', 12, '#7f8aa3')
      .setOrigin(0.5, 0)
      .setDepth(50);
  }

  private updateHud(): void {
    const top = WORLD.hudTop;
    const { hp, maxHp } = this.battle.gate;
    const w = WORLD.width - 110;
    this.gateBar.clear();
    this.gateBar.fillStyle(0x2b3445).fillRect(80, top + 16, w, 18);
    this.gateBar.fillStyle(hp / maxHp > 0.3 ? 0xd4a24c : 0xe74c3c).fillRect(80, top + 16, (w * hp) / maxHp, 18);

    const t = Math.floor(this.battle.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.hudText.setText(`Wave ${this.battle.wave.number}   Enemies ${this.battle.enemiesRemaining}   ${clock}`);
    this.speedButton.setText(`Speed ${this.speed}x`);
    this.carefulButton.setText(`Careful DPS: ${this.careful ? 'ON' : 'OFF'}`);
    this.carefulButton.setBackgroundColor(this.careful ? '#1e6f50' : '#7a2e2e');
  }

  // --- units --------------------------------------------------------------

  private createView(u: Unit): void {
    const body = this.add.circle(0, 0, u.radius, COLORS[u.kind] ?? 0xffffff);
    body.setStrokeStyle(u.side === 'enemy' ? 3 : 2, u.side === 'enemy' ? 0x8b1a1a : 0x111111);
    const letter = this.text(0, 0, LETTERS[u.kind] ?? '?', u.radius, ['priest', 'rogue', 'archer', 'runner'].includes(u.kind) ? '#222' : '#fff')
      .setOrigin(0.5)
      .setFontStyle('bold');
    const hpBar = this.add.graphics();
    const container = this.add.container(u.x, u.y, [body, letter, hpBar]);
    container.setDepth(u.side === 'hero' ? 10 : 20);
    if (u.side === 'hero') {
      const name = this.text(0, u.radius + 4, u.label, 12, '#c9d1e0').setOrigin(0.5, 0);
      container.add(name);
    }
    if (u.side === 'enemy') {
      container.setAlpha(0);
      this.tweens.add({ targets: container, alpha: 1, duration: 300 });
    }
    let aggroIcon: UnitView['aggroIcon'];
    if (u.side === 'hero' && !u.isTank) {
      const disc = this.add.circle(0, 0, 10, 0xf39c12).setStrokeStyle(2, 0x000000);
      const mark = this.text(0, 0, '!', 15, '#000').setOrigin(0.5).setFontStyle('bold');
      const iconContainer = this.add.container(u.radius + 12, -u.radius - 6, [disc, mark]).setVisible(false);
      container.add(iconContainer);
      aggroIcon = { container: iconContainer, disc };
    }
    this.views.set(u.id, { container, body, hpBar, aggroIcon, dead: false });
  }

  private syncViews(): void {
    for (const u of this.battle.units) {
      const v = this.views.get(u.id);
      if (!v || v.dead) continue;
      v.container.setPosition(u.x, u.y);
      const w = u.radius * 2 + 6;
      const y = -u.radius - 10;
      v.hpBar.clear();
      v.hpBar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, 7);
      const pct = u.hp / u.maxHp;
      const color = u.side === 'enemy' ? 0xe74c3c : pct > 0.5 ? 0x2ecc71 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
      v.hpBar.fillStyle(color).fillRect(-w / 2, y, w * pct, 5);
      if (v.aggroIcon) {
        const level = this.battle.aggroLevel(u.id);
        v.aggroIcon.container.setVisible(level !== 'none');
        v.aggroIcon.disc.setFillStyle(level === 'aggro' ? 0xe74c3c : 0xf39c12);
      }
    }
  }

  // --- events -------------------------------------------------------------

  private handleEvents(events: BattleEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          const u = this.battle.unit(e.id);
          if (u) this.createView(u);
          break;
        }
        case 'attack':
          this.showAttack(e.from, e.to, e.style, e.amount);
          break;
        case 'heal':
          this.showHeal(e.from, e.to, e.amount);
          break;
        case 'taunt':
          this.showTaunt(e.from, e.to);
          break;
        case 'death':
          this.showDeath(e.id);
          break;
      }
    }
  }

  private showAttack(fromId: number, toId: number, style: 'melee' | 'ranged', amount: number): void {
    const from = this.battle.unit(fromId);
    if (!from) return;
    const to = toId === GATE_ID ? null : this.battle.unit(toId);
    const tx = to ? to.x : from.x;
    const ty = to ? to.y : WORLD.gateY + 4;
    const hitColor = to?.side === 'hero' || !to ? '#ff6b6b' : '#ffffff';

    const land = () => {
      this.floatText(tx, ty - 18, `${amount}`, hitColor);
      if (!to) this.flashGate();
    };

    if (style === 'melee') {
      const v = this.views.get(fromId);
      if (v && from.side === 'enemy') {
        const dx = tx - from.x;
        const dy = ty - from.y;
        const len = Math.hypot(dx, dy) || 1;
        this.tweens.add({ targets: v.body, x: (dx / len) * 6, y: (dy / len) * 6, duration: 80, yoyo: true });
      }
      const slash = this.add.graphics().setDepth(30);
      slash.lineStyle(3, 0xffffff, 0.9).lineBetween(from.x, from.y, tx, ty);
      this.tweens.add({ targets: slash, alpha: 0, duration: 160, onComplete: () => slash.destroy() });
      land();
    } else {
      const color = PROJECTILE_COLORS[from.kind] ?? 0xffffff;
      const bolt = this.add.circle(from.x, from.y, from.kind === 'mage' ? 7 : 4, color).setDepth(30);
      this.tweens.add({
        targets: bolt,
        x: tx,
        y: ty,
        duration: 200,
        onComplete: () => {
          bolt.destroy();
          land();
        },
      });
    }
  }

  private showHeal(fromId: number, toId: number, amount: number): void {
    const from = this.battle.unit(fromId);
    const to = this.battle.unit(toId);
    if (!from || !to) return;
    const beam = this.add.graphics().setDepth(30);
    beam.lineStyle(3, 0x7dff9b, 0.8).lineBetween(from.x, from.y, to.x, to.y);
    this.tweens.add({ targets: beam, alpha: 0, duration: 300, onComplete: () => beam.destroy() });
    const ring = this.add.circle(to.x, to.y, to.radius + 4).setStrokeStyle(3, 0x7dff9b).setDepth(30);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    this.floatText(to.x, to.y - 18, `+${amount}`, '#7dff9b');
  }

  private showTaunt(fromId: number, toId: number): void {
    const from = this.battle.unit(fromId);
    const to = this.battle.unit(toId);
    if (!from || !to) return;
    const line = this.add.graphics().setDepth(30);
    line.lineStyle(4, 0xff9f1a, 0.9).lineBetween(from.x, from.y, to.x, to.y);
    this.tweens.add({ targets: line, alpha: 0, duration: 450, onComplete: () => line.destroy() });
    const ring = this.add.circle(to.x, to.y, to.radius + 5).setStrokeStyle(3, 0xff9f1a).setDepth(30);
    this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    this.floatText(from.x, from.y - from.radius - 22, 'Taunt!', '#ff9f1a');
  }

  private showDeath(id: number): void {
    const v = this.views.get(id);
    const u = this.battle.unit(id);
    if (!v) return;
    v.dead = true;
    v.hpBar.clear();
    v.aggroIcon?.container.setVisible(false);
    if (u?.side === 'hero') {
      v.body.setFillStyle(0x444444);
      v.container.setAlpha(0.5);
    } else {
      this.tweens.add({
        targets: v.container,
        alpha: 0,
        scale: 0.4,
        duration: 350,
        onComplete: () => {
          v.container.destroy();
          this.views.delete(id);
        },
      });
    }
  }

  private flashGate(): void {
    this.gateWall.setFillStyle(0xc0392b);
    this.time.delayedCall(90, () => this.gateWall.setFillStyle(0x7a5230));
  }

  private floatText(x: number, y: number, str: string, color: string): void {
    const t = this.text(x + Phaser.Math.Between(-6, 6), y, str, 15, color).setOrigin(0.5).setDepth(40).setFontStyle('bold');
    t.setStroke('#000000', 3);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // --- end of wave --------------------------------------------------------

  private showOverlay(): void {
    this.overlayShown = true;
    const win = this.battle.outcome === 'victory';
    const cx = WORLD.width / 2;
    this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.6).setOrigin(0, 0).setDepth(100);
    this.text(cx, 360, win ? 'Victory!' : 'The gate has fallen', 40, win ? '#ffd166' : '#ff6b6b')
      .setOrigin(0.5)
      .setFontStyle('bold')
      .setDepth(101);
    const alive = this.battle.heroes.filter((h) => h.alive).length;
    this.text(cx, 420, `Time ${Math.round(this.battle.time)}s   Heroes standing ${alive}/4`, 18, '#c9d1e0')
      .setOrigin(0.5)
      .setDepth(101);
    this.text(cx, 500, 'Play again', 22, '#ffffff')
      .setOrigin(0.5)
      .setPadding(24, 12, 24, 12)
      .setBackgroundColor('#2e86de')
      .setDepth(101)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());
  }

  private text(x: number, y: number, str: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color }).setResolution(DPR);
  }
}
