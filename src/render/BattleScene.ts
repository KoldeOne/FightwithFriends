import Phaser from 'phaser';
import { Battle, STEP, type AbilityResult } from '../sim/battle';
import { ABILITIES, ABILITY_TUNING, HERO_KIT, MAX_ABILITY_SLOTS, PASSIVES, RESOURCES, WAVE_1, WORLD } from '../sim/content';
import type { AbilityId, BattleEvent, Effect, HeroClass, ResourceKind, Unit } from '../sim/types';
import { GATE_ID } from '../sim/types';

const COLORS: Record<string, number> = {
  warrior: 0xc0392b,
  rogue: 0xf1c40f,
  mage: 0x3498db,
  priest: 0xecf0f1,
  grunt: 0x6b8e23,
  archer: 0x8fbc4f,
  runner: 0xb5d33d,
  shaman: 0x8e6bbf,
};

const LETTERS: Record<string, string> = {
  warrior: 'W',
  rogue: 'R',
  mage: 'M',
  priest: 'P',
  grunt: 'G',
  archer: 'A',
  runner: '»',
  shaman: 'S',
};

const DARK_LETTER = ['priest', 'rogue', 'archer', 'runner'];

const PROJECTILE_COLORS: Record<string, number> = {
  mage: 0xff8c1a,
  priest: 0xfff2a8,
  archer: 0xa0522d,
};

const RESOURCE_COLORS: Record<ResourceKind, number> = {
  rage: 0xc0392b,
  mana: 0x2e86de,
  energy: 0xf1c40f,
};

const GOLD = 0xffd166;
const OUT_OF_RANGE = 0xff3b3b;
const ENEMY_STROKE = 0x8b1a1a;
const SLOW_STROKE = 0x5dade2;

/** How each buff/debuff is shown in the HUD and its tooltip. */
const EFFECT_INFO: Record<Effect['kind'], { name: string; letter: string; color: number; debuff: boolean; text: (e: Effect) => string }> = {
  fortitude: { name: 'Power Word: Fortitude', letter: 'F', color: 0xfff3b0, debuff: false, text: (e) => `Maximum health increased by ${e.amount}.` },
  hot: { name: 'Renew', letter: 'R', color: 0x7dff9b, debuff: false, text: (e) => `Heals ${Math.round(e.amount)} health every ${e.tickEvery}s.` },
  dot: { name: 'Burning', letter: 'B', color: 0xff8c1a, debuff: true, text: (e) => `Takes ${Math.round(e.amount)} damage every second.` },
  slow: { name: 'Slowed', letter: 'S', color: 0x5dade2, debuff: true, text: () => 'Attacks 30% slower.' },
  sheep: { name: 'Polymorphed', letter: '~', color: 0xf4f1e8, debuff: true, text: () => 'Turned into a sheep. Breaks when hit directly.' },
  silence: { name: 'Silenced', letter: 'X', color: 0xb57bff, debuff: true, text: () => 'Cannot cast spells.' },
  stealth: { name: 'Stealth', letter: 'H', color: 0x9aa5b8, debuff: false, text: () => 'Hidden: enemies cannot target you. Your next hit deals double damage.' },
};
const MAX_BUFF_ICONS = 12;
const BUFF_ICON = 22;
const TARGET_BAR_X = 200;

interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Graphics;
  name?: Phaser.GameObjects.Text;
  letter: Phaser.GameObjects.Text;
  /** Cast bar label (enemies that cast). */
  castLabel?: Phaser.GameObjects.Text;
  /** Aggro warning badge (shown on the player's hero only). */
  aggroIcon?: { container: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc };
  dead: boolean;
}

type SceneState = 'choosing' | 'playing' | 'paused' | 'over';

const DPR = Math.min(window.devicePixelRatio || 1, 3);
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** Size and position of the ability button and AUTO button. */
/** HUD layout (offsets from WORLD.hudTop). */
const HUD = {
  // Big ability buttons first, right under the gate.
  slotY: 8,
  slotSize: 78,
  slotGap: 7,
  barX: 16,
  barW: 290,
  healthY: 92,
  resourceY: 111,
  barH: 16,
  buffX: 318,
  targetY: 132,
};
const AUTO_BTN = { w: 80 };

interface SlotView {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  plus: Phaser.GameObjects.Text;
  cdText: Phaser.GameObjects.Text;
}

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views = new Map<number, UnitView>();
  private acc = 0;
  private state: SceneState = 'choosing';

  // Settings that persist across "Play again".
  private speed = 1;
  private careful = true;
  private auto = false;

  // Scenery / HUD
  private gateWall!: Phaser.GameObjects.Rectangle;
  private gateBar!: Phaser.GameObjects.Graphics;
  private gateLabel!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private speedButton!: Phaser.GameObjects.Text;
  private carefulButton!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Text;
  private slotViews: SlotView[] = [];
  private slotCooldowns!: Phaser.GameObjects.Graphics;
  private resourceBar!: Phaser.GameObjects.Graphics;
  private resourceText!: Phaser.GameObjects.Text;
  private focusText!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private healthText!: Phaser.GameObjects.Text;
  private buffIcons: { bg: Phaser.GameObjects.Rectangle; letter: Phaser.GameObjects.Text; time: Phaser.GameObjects.Text }[] = [];
  /** Effects currently shown in the buff row (index matches buffIcons). */
  private shownEffects: Effect[] = [];
  private tooltip?: Phaser.GameObjects.Container;
  /** Target frame: focused unit's name, health bar and numbers. */
  private targetName!: Phaser.GameObjects.Text;
  private targetBar!: Phaser.GameObjects.Graphics;
  private targetHp!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private autoBg!: Phaser.GameObjects.Rectangle;
  private autoText!: Phaser.GameObjects.Text;
  private focusMarker!: Phaser.GameObjects.Graphics;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super('battle');
  }

  create(): void {
    this.views.clear();
    this.acc = 0;
    this.overlay = undefined;
    this.battle = new Battle({ seed: Date.now() % 1_000_000, wave: WAVE_1, carefulAI: this.careful });

    this.drawField();
    this.drawTopBar();
    this.drawHud();
    this.focusMarker = this.add.graphics().setDepth(25);
    this.handleEvents(this.battle.drainEvents());
    this.syncViews();

    this.input.on('pointerdown', this.onFieldTap, this);
    this.state = 'choosing';
    this.showHeroSelect();
  }

  update(time: number, deltaMs: number): void {
    if (this.state === 'playing' && this.battle.outcome === 'running') {
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
    this.drawFocus(time);
    if (this.battle.outcome !== 'running' && this.state === 'playing') this.showEnd();
  }

  // --- hero select ----------------------------------------------------------

  private showHeroSelect(): void {
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.75).setOrigin(0, 0).setInteractive(),
      this.text(cx, 160, 'Choose your hero', 34, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 202, 'The other three are played by AI.', 16, '#c9d1e0').setOrigin(0.5),
    ];
    const classes: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];
    const cardH = 128;
    classes.forEach((cls, i) => {
      const y = 236 + cardH / 2 + i * (cardH + 10);
      const left = cx - 225;
      const bg = this.add.rectangle(cx, y, 470, cardH, 0x1c2433).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
      const disc = this.add.circle(left + 34, y - 18, 24, COLORS[cls]).setStrokeStyle(2, 0x111111);
      const letter = this.text(left + 34, y - 18, LETTERS[cls], 22, DARK_LETTER.includes(cls) ? '#222' : '#fff')
        .setOrigin(0.5)
        .setFontStyle('bold');
      const kit = HERO_KIT[cls];
      const tx = left + 72;
      const top = y - cardH / 2 + 12;
      const name = this.text(tx, top, cls[0].toUpperCase() + cls.slice(1), 20, '#ffffff').setFontStyle('bold');
      const role = this.text(tx + 104, top + 4, kit.role, 13, '#c9d1e0');
      // Five ability slots: the starting ability, then four earned during the run.
      const slotNames: (string | null)[] = [ABILITIES[kit.starting].name, null, null, null, null];
      const slotW = 68;
      const slotH = 60;
      const slots: Phaser.GameObjects.GameObject[] = [];
      slotNames.forEach((label, j) => {
        const sx = tx + j * (slotW + 6) + slotW / 2;
        const sy = top + 34 + slotH / 2;
        if (label) {
          slots.push(
            this.add.rectangle(sx, sy, slotW, slotH, 0x2b3a55).setStrokeStyle(2, COLORS[cls]),
            this.text(sx, sy, label, 11, '#ffffff').setOrigin(0.5).setAlign('center').setFontStyle('bold').setWordWrapWidth(slotW - 6),
          );
        } else {
          slots.push(
            this.add.rectangle(sx, sy, slotW, slotH, 0x151b27).setStrokeStyle(2, 0x3a4660),
            this.text(sx, sy - 7, '+', 20, '#3f4b63').setOrigin(0.5).setFontStyle('bold'),
            this.text(sx, sy + 15, 'Earn in run', 9, '#5d6880').setOrigin(0.5),
          );
        }
      });
      bg.on('pointerover', () => bg.setFillStyle(0x26314a));
      bg.on('pointerout', () => bg.setFillStyle(0x1c2433));
      bg.on('pointerdown', () => this.startAs(cls));
      const passive = PASSIVES[kit.passive];
      const passiveText = this.text(tx, top + 99, `Passive: ${passive.name} — ${passive.short}`, 12, '#9ad1ff');
      items.push(bg, disc, letter, name, role, ...slots, passiveText);
    });
    this.overlay = this.add.container(0, 0, items).setDepth(100);
  }

  private startAs(cls: HeroClass): void {
    this.battle.setPlayer(cls);
    this.battle.playerAuto = this.auto;
    const player = this.battle.player!;
    const v = this.views.get(player.id);
    if (v) {
      v.body.setStrokeStyle(4, GOLD);
      v.name?.setText(`${player.label} (You)`).setColor('#ffd166').setFontStyle('bold');
    }
    this.overlay?.destroy();
    this.overlay = undefined;
    this.state = 'playing';
  }

  // --- input ------------------------------------------------------------------

  private onFieldTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.state !== 'playing' || over.length) return;
    if (pointer.y > WORLD.gateY) return;
    const player = this.battle.player;
    if (!player) return;

    const canFocusAllies = !!player.heal;
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of this.battle.units) {
      if (!u.alive) continue;
      if (u.side === 'hero' && !canFocusAllies) continue;
      const d = Math.hypot(u.x - pointer.x, u.y - pointer.y);
      if (d <= u.radius + 24 && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    if (!best || best.id === this.battle.focusId) this.battle.setFocus(null);
    else this.battle.setFocus(best.id);
  }

  private onSlotTap(slot: number): void {
    if (this.state !== 'playing') return;
    const p = this.battle.player;
    if (!p?.abilities?.[slot]) {
      this.showToast('Earn more abilities during the run');
      return;
    }
    const result = this.battle.useAbility(slot);
    if (result === 'ok') {
      this.tweens.add({ targets: this.slotViews[slot].bg, scale: 0.92, duration: 70, yoyo: true });
      this.handleEvents(this.battle.drainEvents());
    } else {
      this.showToast(this.abilityMessage(result));
    }
  }

  private abilityMessage(result: AbilityResult): string {
    const p = this.battle.player;
    switch (result) {
      case 'cooldown':
        return 'Not ready yet';
      case 'resource':
        return `Not enough ${p?.resourceKind ? RESOURCES[p.resourceKind].label.toLowerCase() : 'resource'}`;
      case 'target':
        return this.battle.focusId !== null ? 'Target out of range' : 'No target in range';
      case 'dead':
        return 'Your hero is down';
      default:
        return '';
    }
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.tweens.pauseAll();
      const cx = WORLD.width / 2;
      const resume = this.button(cx, 470, 'Resume', 22, '#2e86de', () => this.togglePause());
      this.overlay = this.add
        .container(0, 0, [
          this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.6).setOrigin(0, 0).setInteractive(),
          this.text(cx, 400, 'Paused', 40, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
          resume,
        ])
        .setDepth(100);
    } else if (this.state === 'paused') {
      this.overlay?.destroy();
      this.overlay = undefined;
      this.tweens.resumeAll();
      this.state = 'playing';
    }
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
    this.gateBar = this.add.graphics().setDepth(2);
    this.gateLabel = this.text(WORLD.width / 2, WORLD.gateY + WORLD.gateHeight / 2 - 2, 'GATE', 12, '#f5e6c8').setOrigin(0.5).setDepth(3).setFontStyle('bold');
  }

  /** Small testing/utility buttons along the top edge. */
  private drawTopBar(): void {
    const small = (x: number, onTap: () => void) =>
      this.text(x, 8, '', 13, '#ffffff')
        .setPadding(10, 6, 10, 6)
        .setBackgroundColor('#2b3445')
        .setDepth(50)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);

    this.speedButton = small(8, () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    });
    this.carefulButton = small(98, () => {
      this.careful = !this.careful;
      this.battle.carefulAI = this.careful;
    });
    this.pauseButton = small(WORLD.width - 8, () => this.togglePause()).setOrigin(1, 0);
  }

  private drawHud(): void {
    const top = WORLD.hudTop;
    this.add.rectangle(0, top, WORLD.width, WORLD.height - top, 0x0b0e14).setOrigin(0, 0);
    this.add.rectangle(0, top, WORLD.width, 2, 0x2b3445).setOrigin(0, 0);

    // Wave info lives in the top bar.
    this.hudText = this.text(342, 14, '', 13, '#ffffff').setOrigin(0.5, 0).setDepth(50);

    // Health and resource bars.
    this.healthBar = this.add.graphics();
    this.healthText = this.text(HUD.barX + 8, top + HUD.healthY, '', 12, '#ffffff').setFontStyle('bold');
    this.healthText.setStroke('#000000', 3);
    this.resourceBar = this.add.graphics();
    this.resourceText = this.text(HUD.barX + 8, top + HUD.resourceY, '', 12, '#ffffff').setFontStyle('bold');
    this.resourceText.setStroke('#000000', 3);

    // Buff icons: a grid to the right of the bars.
    this.buffIcons = [];
    const perRow = MAX_BUFF_ICONS / 2;
    for (let i = 0; i < MAX_BUFF_ICONS; i++) {
      const x = HUD.buffX + (i % perRow) * (BUFF_ICON + 4) + BUFF_ICON / 2;
      const y = top + HUD.healthY + Math.floor(i / perRow) * (BUFF_ICON - 3) + BUFF_ICON / 2 - 3;
      const bg = this.add
        .rectangle(x, y, BUFF_ICON, BUFF_ICON - 4, 0x2b3445)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.showEffectTooltip(i))
        .setVisible(false);
      const letter = this.text(x, y - 1, '', 12, '#111').setOrigin(0.5).setFontStyle('bold').setVisible(false);
      const time = this.text(x + BUFF_ICON / 2 - 1, y + BUFF_ICON / 2 - 3, '', 9, '#ffffff').setOrigin(1, 1).setFontStyle('bold').setVisible(false);
      time.setStroke('#000000', 3);
      this.buffIcons.push({ bg, letter, time });
    }

    // Five ability slots.
    this.slotViews = [];
    const s = HUD.slotSize;
    const sy = top + HUD.slotY;
    for (let i = 0; i < MAX_ABILITY_SLOTS; i++) {
      const cx = HUD.barX + i * (s + HUD.slotGap) + s / 2;
      const bg = this.add
        .rectangle(cx, sy + s / 2, s, s, 0x151b27)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.onSlotTap(i));
      const name = this.text(cx, sy + s / 2 - 8, '', 13, '#ffffff').setOrigin(0.5).setAlign('center').setFontStyle('bold').setWordWrapWidth(s - 6);
      const sub = this.text(cx, sy + s - 11, '', 10, '#c9d1e0').setOrigin(0.5);
      const plus = this.text(cx, sy + s / 2, '+', 26, '#3f4b63').setOrigin(0.5).setFontStyle('bold');
      const cdText = this.text(cx, sy + s / 2, '', 26, '#ffffff').setOrigin(0.5).setFontStyle('bold').setDepth(5);
      cdText.setStroke('#000000', 4);
      this.slotViews.push({ bg, name, sub, plus, cdText });
    }
    this.slotCooldowns = this.add.graphics().setDepth(4);

    // Bottom row (full width): target frame, or a hint.
    const ty = top + HUD.targetY;
    this.focusText = this.text(16, ty + 1, '', 12, '#8f9bb3');
    this.targetName = this.text(16, ty, '', 13, '#ffffff').setFontStyle('bold');
    this.targetBar = this.add.graphics();
    this.targetHp = this.text(TARGET_BAR_X + 8, ty + 2, '', 11, '#ffffff').setFontStyle('bold');
    this.targetHp.setStroke('#000000', 3);
    this.toast = this.text(WORLD.width / 2, WORLD.hudTop - 30, '', 16, '#ff9f1a').setOrigin(0.5).setFontStyle('bold').setDepth(60);
    this.toast.setStroke('#000000', 4);

    // AUTO toggle, next to the ability slots.
    const ax = WORLD.width - 16 - AUTO_BTN.w / 2;
    this.autoBg = this.add
      .rectangle(ax, sy + s / 2, AUTO_BTN.w, s, 0x2b3445)
      .setStrokeStyle(2, 0x3a4660)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.auto = !this.auto;
        this.battle.playerAuto = this.auto;
      });
    this.autoText = this.text(ax, sy + s / 2, '', 15, '#ffffff').setOrigin(0.5).setAlign('center').setFontStyle('bold');
  }

  private updateHud(): void {
    // Gate health, drawn on the gate itself.
    const { hp, maxHp } = this.battle.gate;
    const gw = 96;
    const gx = WORLD.width / 2 - gw / 2;
    const gy = WORLD.gateY + WORLD.gateHeight - 9;
    this.gateBar.clear();
    this.gateBar.fillStyle(0x000000, 0.6).fillRect(gx, gy, gw, 6);
    this.gateBar.fillStyle(hp / maxHp > 0.3 ? 0xd4a24c : 0xe74c3c).fillRect(gx, gy, (gw * hp) / maxHp, 6);
    this.gateLabel.setText(`GATE ${Math.ceil(hp)}`);

    const t = Math.floor(this.battle.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.hudText.setText(`Wave ${this.battle.wave.number} · ${this.battle.enemiesRemaining} left · ${clock}`);

    this.speedButton.setText(`Speed ${this.speed}x`);
    this.carefulButton.setText(`Careful AI: ${this.careful ? 'ON' : 'OFF'}`);
    this.carefulButton.setBackgroundColor(this.careful ? '#1e6f50' : '#7a2e2e');
    this.pauseButton.setText(this.state === 'paused' ? '▶ Resume' : '❚❚ Pause');

    this.autoText.setText(`AUTO\n${this.auto ? 'ON' : 'OFF'}`);
    this.autoBg.setFillStyle(this.auto ? 0x1e6f50 : 0x2b3445);

    this.updatePlayerHud();
  }

  private updatePlayerHud(): void {
    const p = this.battle.player;
    const top = WORLD.hudTop;
    this.healthBar.clear();
    this.resourceBar.clear();
    this.slotCooldowns.clear();

    // Ability slots (empty ones show a "+").
    const s = HUD.slotSize;
    const sy = top + HUD.slotY;
    this.slotViews.forEach((v, i) => {
      const a = p?.abilities?.[i];
      v.plus.setVisible(!!p && !a);
      if (!p || !a) {
        v.bg.setFillStyle(0x151b27).setStrokeStyle(2, 0x2b3445);
        v.name.setText('');
        v.sub.setText('');
        v.cdText.setText('');
        return;
      }
      const def = ABILITIES[a.id];
      const state = this.battle.abilityState(i, p);
      const ready = state === 'ok';
      const dark = ready && DARK_LETTER.includes(p.kind);
      const cost = this.battle.abilityCost(p, a.id);
      v.name.setText(def.name).setColor(dark ? '#111' : '#ffffff');
      v.sub.setText(cost ? `${cost} ${RESOURCES[p.resourceKind!].label.toLowerCase()}` : 'no cost').setColor(dark ? '#333' : '#c9d1e0');
      v.bg.setFillStyle(ready ? COLORS[p.kind] : 0x2b3445);
      // Red outline = nothing it could hit is in range right now.
      if (p.alive && !this.battle.abilityInRange(i, p)) v.bg.setStrokeStyle(3, OUT_OF_RANGE);
      else v.bg.setStrokeStyle(2, 0x3a4660);
      if (a.cooldown > 0) {
        const x = HUD.barX + i * (s + HUD.slotGap);
        this.slotCooldowns.fillStyle(0x000000, 0.55).fillRect(x, sy, s, s * (a.cooldown / def.cooldown));
        v.cdText.setText(a.cooldown >= 1 ? `${Math.ceil(a.cooldown)}` : a.cooldown.toFixed(1));
      } else {
        v.cdText.setText('');
      }
    });

    if (!p?.resourceKind) {
      this.resourceText.setText('');
      this.healthText.setText('');
      this.focusText.setText('');
      this.clearTargetFrame();
      this.updateBuffIcons(undefined);
      return;
    }

    // Health bar (red), with numbers.
    const hy = top + HUD.healthY;
    this.healthBar.fillStyle(0x2b3445).fillRect(HUD.barX, hy, HUD.barW, HUD.barH);
    this.healthBar.fillStyle(0xc0392b).fillRect(HUD.barX, hy, HUD.barW * Math.max(0, p.hp / p.maxHp), HUD.barH);
    this.healthText.setText(`Health ${Math.ceil(p.hp)} / ${p.maxHp}`);

    // Resource bar.
    const ry = top + HUD.resourceY;
    const res = RESOURCES[p.resourceKind];
    this.resourceBar.fillStyle(0x2b3445).fillRect(HUD.barX, ry, HUD.barW, HUD.barH);
    this.resourceBar.fillStyle(RESOURCE_COLORS[p.resourceKind]).fillRect(HUD.barX, ry, HUD.barW * ((p.resource ?? 0) / (p.maxResource ?? 1)), HUD.barH);
    const cp = p.comboPoints ?? 0;
    const combo = this.battle.hasTrait(p, 'comboPoints') ? `  ${'●'.repeat(cp)}${'○'.repeat(5 - cp)}` : '';
    this.resourceText.setText(`${res.label} ${Math.floor(p.resource ?? 0)} / ${p.maxResource}${combo}`);

    this.updateBuffIcons(p);

    // Bottom row: target frame or hint.
    const focus = this.battle.focusId !== null ? this.battle.unit(this.battle.focusId) : undefined;
    const ty = top + HUD.targetY;
    if (focus?.alive) {
      this.focusText.setText('');
      this.drawTargetFrame(focus, TARGET_BAR_X, ty, WORLD.width - 16 - TARGET_BAR_X);
    } else {
      this.clearTargetFrame();
      if (!p.alive) this.focusText.setText('Your hero is down.');
      else this.focusText.setText(p.heal ? 'Tap an enemy to focus it, or an ally to focus heals.' : 'Tap an enemy to focus it.');
    }
  }

  /** Your hero's buffs and debuffs as small tappable icons. */
  private updateBuffIcons(p: Unit | undefined): void {
    const effects = p?.alive ? (p.effects ?? []).filter((e) => e.remaining > 0).slice(0, MAX_BUFF_ICONS) : [];
    this.shownEffects = effects;
    this.buffIcons.forEach((icon, i) => {
      const e = effects[i];
      const visible = !!e;
      icon.bg.setVisible(visible);
      icon.letter.setVisible(visible);
      icon.time.setVisible(visible);
      if (!e) return;
      const info = EFFECT_INFO[e.kind];
      icon.bg.setFillStyle(info.color).setStrokeStyle(2, info.debuff ? 0xe74c3c : 0x111111);
      icon.letter.setText(info.letter);
      icon.time.setText(Number.isFinite(e.remaining) ? `${Math.ceil(e.remaining)}` : '');
    });
  }

  private showEffectTooltip(index: number): void {
    const e = this.shownEffects[index];
    if (!e) return;
    const info = EFFECT_INFO[e.kind];
    const source = this.battle.unit(e.sourceId);
    this.tooltip?.destroy();
    const w = 330;
    const x = 16;
    const y = WORLD.hudTop - 92;
    const title = this.text(x + 12, y + 10, info.name, 15, info.debuff ? '#ff8a8a' : '#ffd166').setFontStyle('bold');
    const body = this.text(x + 12, y + 32, info.text(e), 13, '#ffffff').setWordWrapWidth(w - 24);
    const timeLeft = Number.isFinite(e.remaining) ? `${Math.ceil(e.remaining)}s left` : 'Passive — always on';
    const meta = this.text(x + 12, y + 56, `${timeLeft}${source ? ` · from ${source.label}` : ''}`, 12, '#8f9bb3');
    const box = this.add.rectangle(x, y, w, 80, 0x111723, 0.95).setOrigin(0, 0).setStrokeStyle(2, info.color);
    this.tooltip = this.add.container(0, 0, [box, title, body, meta]).setDepth(90);
    const tip = this.tooltip;
    this.time.delayedCall(3000, () => {
      if (this.tooltip === tip) {
        tip.destroy();
        this.tooltip = undefined;
      }
    });
  }

  /** Name + health bar of the focused unit, like an MMO target frame. */
  private drawTargetFrame(u: Unit, x: number, y: number, w: number): void {
    const enemy = u.side === 'enemy';
    this.targetName.setText(`${enemy ? '◎' : '✚'} ${u.label}`).setColor(enemy ? '#ffd166' : '#7dff9b');
    const pct = Math.max(0, u.hp / u.maxHp);
    this.targetBar.clear();
    this.targetBar.fillStyle(0x2b3445).fillRect(x, y, w, 17);
    this.targetBar.fillStyle(enemy ? 0xe74c3c : 0x2ecc71).fillRect(x, y, w * pct, 17);
    this.targetBar.lineStyle(1, enemy ? 0xffd166 : 0x7dff9b, 0.8).strokeRect(x, y, w, 17);
    this.targetHp.setText(`${Math.ceil(u.hp)} / ${u.maxHp}`);
  }

  private clearTargetFrame(): void {
    this.targetName.setText('');
    this.targetBar.clear();
    this.targetHp.setText('');
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 400 });
  }

  // --- units --------------------------------------------------------------

  private createView(u: Unit): void {
    const body = this.add.circle(0, 0, u.radius, COLORS[u.kind] ?? 0xffffff);
    body.setStrokeStyle(u.side === 'enemy' ? 3 : 2, u.side === 'enemy' ? ENEMY_STROKE : 0x111111);
    const letter = this.text(0, 0, LETTERS[u.kind] ?? '?', u.radius, DARK_LETTER.includes(u.kind) ? '#222' : '#fff')
      .setOrigin(0.5)
      .setFontStyle('bold');
    const hpBar = this.add.graphics();
    const container = this.add.container(u.x, u.y, [body, letter, hpBar]);
    container.setDepth(u.side === 'hero' ? 10 : 20);
    let name: Phaser.GameObjects.Text | undefined;
    if (u.side === 'hero') {
      name = this.text(0, u.radius + 4, u.label, 12, '#c9d1e0').setOrigin(0.5, 0);
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
    let castLabel: Phaser.GameObjects.Text | undefined;
    if (u.kind === 'shaman') {
      castLabel = this.text(0, -u.radius - 34, '', 11, '#e0c3ff').setOrigin(0.5).setFontStyle('bold');
      castLabel.setStroke('#000000', 3);
      container.add(castLabel);
    }
    this.views.set(u.id, { container, body, hpBar, name, letter, aggroIcon, castLabel, dead: false });
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

      // Small effect pips next to the health bar: green = heal over time, orange = burning.
      let pip = 0;
      if (this.battle.hasEffect(u, 'hot')) v.hpBar.fillStyle(0x7dff9b).fillCircle(-w / 2 - 7 - pip++ * 9, y + 2, 3.5);
      if (this.battle.hasEffect(u, 'dot')) v.hpBar.fillStyle(0xff8c1a).fillCircle(-w / 2 - 7 - pip++ * 9, y + 2, 3.5);
      if (this.battle.hasEffect(u, 'fortitude')) v.hpBar.fillStyle(0xfff3b0).fillCircle(-w / 2 - 7 - pip++ * 9, y + 2, 3.5);
      if (u.side === 'hero') v.container.setAlpha(this.battle.hasEffect(u, 'stealth') ? 0.45 : 1);
      if (u.side === 'enemy') {
        const sheep = this.battle.isSheep(u);
        v.body.setFillStyle(sheep ? 0xf4f1e8 : COLORS[u.kind]);
        v.body.setStrokeStyle(3, sheep ? 0xbdb7a6 : this.battle.hasEffect(u, 'slow') ? SLOW_STROKE : ENEMY_STROKE);
        v.letter.setText(sheep ? 'baa' : LETTERS[u.kind]).setFontSize(sheep ? 11 : u.radius);
        if (sheep) v.letter.setColor('#555');
        else v.letter.setColor(DARK_LETTER.includes(u.kind) ? '#222' : '#fff');
      }
      // Cast bar above casting enemies.
      if (u.casting) {
        const cy = y - 9;
        const pct = 1 - u.casting.remaining / u.casting.total;
        v.hpBar.fillStyle(0x000000, 0.8).fillRect(-w / 2 - 1, cy - 1, w + 2, 7);
        v.hpBar.fillStyle(0xb57bff).fillRect(-w / 2, cy, w * pct, 5);
        v.castLabel?.setText(u.casting.spell).setY(cy - 10);
      } else {
        v.castLabel?.setText('');
      }

      if (v.aggroIcon) {
        const level = u.id === this.battle.playerId ? this.battle.aggroLevel(u.id) : 'none';
        v.aggroIcon.container.setVisible(level !== 'none');
        v.aggroIcon.disc.setFillStyle(level === 'aggro' ? 0xe74c3c : 0xf39c12);
      }
    }
  }

  private drawFocus(time: number): void {
    this.focusMarker.clear();
    const f = this.battle.focusId !== null ? this.battle.unit(this.battle.focusId) : undefined;
    if (!f?.alive) return;
    const color = f.side === 'enemy' ? GOLD : 0x7dff9b;
    const r = f.radius + 9 + Math.sin(time / 150) * 2;
    this.focusMarker.lineStyle(3, color, 0.95).strokeCircle(f.x, f.y, r);
    if (f.side === 'enemy') {
      // Crosshair ticks.
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        this.focusMarker.lineBetween(f.x + dx * (r - 4), f.y + dy * (r - 4), f.x + dx * (r + 7), f.y + dy * (r + 7));
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
          this.showAttack(e.from, e.to, e.style, e.amount, e.ability);
          break;
        case 'heal':
          this.showHeal(e.from, e.to, e.amount);
          break;
        case 'ability':
          this.showAbility(e.from, e.ability, e.to);
          break;
        case 'tick': {
          const u = this.battle.unit(e.to);
          if (u) this.floatText(u.x, u.y - 14, e.kind === 'hot' ? `+${e.amount}` : `${e.amount}`, e.kind === 'hot' ? '#7dff9b' : '#ff9f1a', 12);
          break;
        }
        case 'taunt':
          this.showTaunt(e.from, e.to);
          break;
        case 'castEnd':
          if (e.interrupted) {
            const u = this.battle.unit(e.from);
            if (u) this.views.get(u.id)?.castLabel?.setText('');
          }
          break;
        case 'notice': {
          const u = this.battle.unit(e.id);
          const color = e.tone === 'good' ? '#7dff9b' : e.tone === 'bad' ? '#ff6b6b' : '#9ad1ff';
          if (u) this.floatText(u.x, u.y - u.radius - 30, e.text, color, 16);
          break;
        }
        case 'death':
          this.showDeath(e.id);
          break;
      }
    }
  }

  private showAttack(fromId: number, toId: number, style: 'melee' | 'ranged', amount: number, ability?: AbilityId): void {
    const from = this.battle.unit(fromId);
    if (!from) return;
    const atGate = toId === GATE_ID;
    // A unit killed by this hit is already gone from the battle, so fall back
    // to where it was last drawn. (Bug fix: killing blows used to show at the gate.)
    const to = atGate ? undefined : this.battle.unit(toId);
    const lastSeen = atGate ? undefined : this.views.get(toId)?.container;
    if (!atGate && !to && !lastSeen) return;
    const tx = atGate ? from.x : (to?.x ?? lastSeen!.x);
    const ty = atGate ? WORLD.gateY + 4 : (to?.y ?? lastSeen!.y);
    const hitHero = to?.side === 'hero';
    const hitColor = atGate || hitHero ? '#ff6b6b' : ability ? '#ffd166' : '#ffffff';
    const size = ability ? 18 : 15;

    const land = () => {
      this.floatText(tx, ty - 18, `${amount}`, hitColor, size);
      if (atGate) this.flashGate();
    };

    if (ability === 'thunderclap') {
      land();
      return;
    }

    if (style === 'melee') {
      const v = this.views.get(fromId);
      if (v && from.side === 'enemy') {
        const dx = tx - from.x;
        const dy = ty - from.y;
        const len = Math.hypot(dx, dy) || 1;
        this.tweens.add({ targets: v.body, x: (dx / len) * 6, y: (dy / len) * 6, duration: 80, yoyo: true });
      }
      const slash = this.add.graphics().setDepth(30);
      if (ability === 'sinisterStrike') slash.lineStyle(7, 0xffe066, 1).lineBetween(from.x, from.y, tx, ty);
      else if (ability === 'heroicStrike') slash.lineStyle(8, 0xff7043, 1).lineBetween(from.x, from.y, tx, ty);
      else slash.lineStyle(3, 0xffffff, 0.9).lineBetween(from.x, from.y, tx, ty);
      this.tweens.add({ targets: slash, alpha: 0, duration: ability ? 260 : 160, onComplete: () => slash.destroy() });
      land();
    } else {
      const big = ability === 'fireball';
      const color = big ? 0xff5a1f : (PROJECTILE_COLORS[from.kind] ?? 0xffffff);
      const bolt = this.add.circle(from.x, from.y, big ? 12 : from.kind === 'mage' ? 7 : 4, color).setDepth(30);
      if (big) bolt.setStrokeStyle(3, 0xffd166);
      this.tweens.add({
        targets: bolt,
        x: tx,
        y: ty,
        duration: big ? 280 : 200,
        onComplete: () => {
          bolt.destroy();
          land();
        },
      });
    }
  }

  private showAbility(fromId: number, ability: AbilityId, toId?: number): void {
    const from = this.battle.unit(fromId);
    if (!from) return;
    const to = toId !== undefined ? this.battle.unit(toId) : undefined;
    const name = ABILITIES[ability].name;
    switch (ability) {
      case 'taunt':
        return; // the taunt event draws it
      case 'thunderclap': {
        const ring = this.add.circle(from.x, from.y, from.radius).setStrokeStyle(6, 0xd4a24c).setDepth(30);
        const scale = ABILITY_TUNING.thunderclap.radius / from.radius;
        this.tweens.add({ targets: ring, scale, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#f5c26b', 15);
        return;
      }
      case 'fortitude':
        for (const ally of this.battle.heroes) {
          if (!ally.alive) continue;
          const ring = this.add.circle(ally.x, ally.y, ally.radius + 4).setStrokeStyle(4, 0xfff3b0).setDepth(30);
          this.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, name, '#fff3b0', 14);
        return;
      case 'renew':
      case 'heal':
        if (to) {
          const ring = this.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(4, 0x7dff9b).setDepth(30);
          this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
          this.floatText(to.x, to.y - to.radius - 22, name, '#7dff9b', 15);
        }
        return;
      case 'polymorph':
      case 'kick':
      case 'counterspell':
        if (to) {
          const color = ability === 'polymorph' ? 0xf4f1e8 : ability === 'counterspell' ? 0x9ad1ff : 0xffe066;
          const line = this.add.graphics().setDepth(30);
          line.lineStyle(3, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
          this.tweens.add({ targets: line, alpha: 0, duration: 400, onComplete: () => line.destroy() });
          const ring = this.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(4, color).setDepth(30);
          this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#ffd166', 14);
        return;
      default:
        this.floatText(from.x, from.y - from.radius - 22, name, '#ffd166', 14);
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

  private floatText(x: number, y: number, str: string, color: string, size = 15): void {
    const t = this.text(x + Phaser.Math.Between(-6, 6), y, str, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold');
    t.setStroke('#000000', 3);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // --- end of wave --------------------------------------------------------

  private showEnd(): void {
    this.state = 'over';
    const win = this.battle.outcome === 'victory';
    const cx = WORLD.width / 2;
    const alive = this.battle.heroes.filter((h) => h.alive).length;
    this.overlay = this.add
      .container(0, 0, [
        this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.6).setOrigin(0, 0).setInteractive(),
        this.text(cx, 360, win ? 'Victory!' : 'The gate has fallen', 40, win ? '#ffd166' : '#ff6b6b')
          .setOrigin(0.5)
          .setFontStyle('bold'),
        this.text(cx, 420, `Time ${Math.round(this.battle.time)}s   Heroes standing ${alive}/4`, 18, '#c9d1e0').setOrigin(0.5),
        this.button(cx, 500, 'Play again', 22, '#2e86de', () => this.scene.restart()),
      ])
      .setDepth(100);
  }

  // --- helpers ------------------------------------------------------------

  private button(x: number, y: number, label: string, size: number, bg: string, onTap: () => void): Phaser.GameObjects.Text {
    return this.text(x, y, label, size, '#ffffff')
      .setOrigin(0.5)
      .setPadding(24, 12, 24, 12)
      .setBackgroundColor(bg)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onTap);
  }

  private text(x: number, y: number, str: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color }).setResolution(DPR);
  }
}
