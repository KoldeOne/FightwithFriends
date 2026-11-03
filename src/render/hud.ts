import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { ABILITIES, MAX_ABILITY_SLOTS, PASSIVES, RESOURCES, TRAITS, WORLD } from '../sim/content';
import { sound } from './sound';
import { actDef } from '../sim/acts';
import { type Effect, type Unit } from '../sim/types';
import { COLORS, DARK_LETTER, RESOURCE_COLORS, TARGET_BAR_X, HUD_TARGET_Y, type PartyFrame, initials, HUD, effectInfo, effectIcon, abilityIcon, traitIcon, ICON_PX } from './theme';

/** Hero panel rows: buff icons just under the bars, abilities under them. */
const BUFF_TOP = 51;
const BUFF_SIZE = 12;
const BOX_TOP = 66;

/** Top bar, party panels, target frame, tooltips and toasts. */
export class Hud {
  constructor(readonly s: BattleScene) {}

  autoButton!: Phaser.GameObjects.Text;
  soundButton!: Phaser.GameObjects.Text;
  hudText!: Phaser.GameObjects.Text;
  waveText!: Phaser.GameObjects.Text;
  speedButton!: Phaser.GameObjects.Text;
  pauseButton!: Phaser.GameObjects.Text;
  partyFrames: PartyFrame[] = [];
  partyBars!: Phaser.GameObjects.Graphics;
  partyCooldowns!: Phaser.GameObjects.Graphics;
  focusText!: Phaser.GameObjects.Text;
  tooltip?: Phaser.GameObjects.Container;
  /** Target frame: focused unit's name, health bar and numbers. */
  targetName!: Phaser.GameObjects.Text;
  targetBar!: Phaser.GameObjects.Graphics;
  targetHp!: Phaser.GameObjects.Text;
  toast!: Phaser.GameObjects.Text;

  /** Small testing/utility buttons along the top edge. */
  drawTopBar(): void {
    const small = (x: number, y: number, onTap: () => void) =>
      this.s.text(x, y, '', 13, '#ffffff')
        .setPadding(10, 6, 10, 6)
        .setBackgroundColor('#2b3445')
        .setDepth(50)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);

    // Row 1: testing aids on the left; AUTO and Pause on the right.
    this.speedButton = small(8, 8, () => {
      this.s.speed = this.s.speed === 1 ? 2 : this.s.speed === 2 ? 4 : 1;
    });
    this.soundButton = small(98, 8, () => {
      sound.unlock();
      sound.toggleMute();
    });
    this.pauseButton = small(WORLD.width - 8, 8, () => this.s.togglePause()).setOrigin(1, 0);
    this.autoButton = small(WORLD.width - 104, 8, () => this.s.setAuto(!this.s.auto)).setOrigin(1, 0);

  }

  drawHud(): void {
    const top = WORLD.hudTop;
    this.s.add.rectangle(0, top, WORLD.width, WORLD.height - top, 0x0b0e14).setOrigin(0, 0);
    this.s.add.rectangle(0, top, WORLD.width, 2, 0x2b3445).setOrigin(0, 0);

    // Big round number at the top center, with the line-up name, lives and time underneath.
    this.waveText = this.s.text(WORLD.width / 2, 44, '', 30, '#ffd166').setOrigin(0.5, 0).setDepth(50).setFontStyle('bold');
    this.waveText.setStroke('#000000', 5);
    this.hudText = this.s.text(WORLD.width / 2, 80, '', 13, '#c9d1e0').setOrigin(0.5, 0).setDepth(50);
    this.hudText.setStroke('#000000', 3);

    // Party panel: one frame per hero.
    this.partyFrames = [];
    this.partyBars = this.s.add.graphics().setDepth(1);
    this.partyCooldowns = this.s.add.graphics().setDepth(4);
    const w = this.s.party.frameW;
    const frames = Math.max(3, this.s.battle.heroes.length);
    for (let i = 0; i < frames; i++) {
      const x = this.s.party.x + i * (w + this.s.party.gap);
      const y = top + 6;
      const bg = this.s.add
        .rectangle(x, y, w, this.s.party.frameH, 0x111723)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x2b3445)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const h = this.heroInSlot(i);
          if (!h) return;
          if (!h.alive) {
            this.showHeroTooltip(i);
            return;
          }
          this.s.battle.setFocus(h.id);
          this.s.inspect.openInspect(h.id);
        });
      const name = this.s.text(x + 6, y + 4, '', frames > 4 ? 10 : 12, '#ffffff').setFontStyle('bold');
      const hpText = this.s.text(x + 6, y + 22, '', 10, '#ffffff').setFontStyle('bold').setDepth(2);
      hpText.setStroke('#000000', 3);
      const boxes: PartyFrame['boxes'] = [];
      for (let j = 0; j < MAX_ABILITY_SLOTS; j++) {
        const bx = x + 5 + j * (this.s.party.box + 2) + this.s.party.box / 2;
        const by = y + BOX_TOP + this.s.party.box / 2;
        const box = this.s.add
          .rectangle(bx, by, this.s.party.box, this.s.party.box, 0x151b27)
          .setStrokeStyle(1, 0x2b3445)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', (pointer: Phaser.Input.Pointer) => {
            if (!pointer.wasTouch) this.showAbilityTooltip(i, j);
          })
          .on('pointerout', (pointer: Phaser.Input.Pointer) => {
            if (!pointer.wasTouch) this.hideTooltip();
          })
          .on('pointerdown', () => this.showAbilityTooltip(i, j));
        const label = this.s.text(bx, by, '', 9, '#ffffff').setOrigin(0.5).setFontStyle('bold').setDepth(5);
        // Ability icon (the box underneath shows the cooldown sweep on top of it).
        const icon = this.s.add.image(bx, by, 'icon-ab-fireball').setScale((this.s.party.box - 2) / ICON_PX).setDepth(3).setVisible(false);
        boxes.push({ bg: box, label, icon });
      }
      // Buffs and debuffs: a row of small icons between the bars and the abilities. Tap one for details.
      const buffs: Phaser.GameObjects.Image[] = [];
      const perRow = Math.max(1, Math.floor((w - 10) / (BUFF_SIZE + 2)));
      for (let j = 0; j < perRow; j++) {
        const img = this.s.add
          .image(x + 5 + j * (BUFF_SIZE + 2) + BUFF_SIZE / 2, y + BUFF_TOP + BUFF_SIZE / 2, 'icon-ef-stun')
          .setScale(BUFF_SIZE / ICON_PX)
          .setDepth(3)
          .setVisible(false)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.showEffectTooltip(img.getData('effect') as Effect | undefined));
        buffs.push(img);
      }
      this.partyFrames.push({ bg, name, hpText, boxes, buffs });
    }

    // Bottom row: inspected unit, or a hint.
    const ty = top + HUD_TARGET_Y;
    this.focusText = this.s.text(16, ty + 1, '', 12, '#8f9bb3');
    this.targetName = this.s.text(16, ty, '', 13, '#ffffff').setFontStyle('bold');
    this.targetBar = this.s.add.graphics();
    this.targetHp = this.s.text(TARGET_BAR_X + 8, ty + 2, '', 11, '#ffffff').setFontStyle('bold');
    this.targetHp.setStroke('#000000', 3);
    this.toast = this.s.text(WORLD.width / 2, WORLD.hudTop - 30, '', 16, '#ff9f1a').setOrigin(0.5).setFontStyle('bold').setDepth(60);
    this.toast.setStroke('#000000', 4);
  }

  updateHud(): void {
    const t = Math.floor(this.s.battle.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const w = this.s.battle.wave;
    const run = this.s.run;
    if (!run) {
      this.waveText.setText('');
      this.hudText.setText('');
    } else if (this.s.state === 'map' || this.s.state === 'choice') {
      this.waveText.setText(`ACT ${run.act}`).setColor('#ffd166');
      this.hudText.setText(`${actDef(run.act).name} · ${run.gold} gold${run.wishes ? " · ✦ wish" : ""}`);
    } else {
      this.waveText.setText(`ACT ${run.act} · FLOOR ${w.number}`).setColor(w.boss ? '#ff6b6b' : '#ffd166');
      const ramp = this.s.battle.damageRamp;
      const sudden = ramp > 1 ? ` · SUDDEN DEATH x${ramp.toFixed(1)}` : '';
      this.hudText.setText(`${w.name ?? ''} · ${this.s.battle.enemiesRemaining} left · ${clock} · ${run.gold} gold${run.wishes ? " · ✦ wish" : ""}${sudden}`);
    }

    this.speedButton.setText(`Speed ${this.s.speed}x`);
    this.soundButton.setText(`Sound: ${sound.muted ? 'OFF' : 'ON'}`);
    this.pauseButton.setText(this.s.state === 'paused' ? '▶ Resume' : '❚❚ Pause');
    this.autoButton.setText(`Auto: ${this.s.auto ? 'ON' : 'OFF'}`).setBackgroundColor(this.s.auto ? '#1e6f50' : '#2b3445');

    this.updatePartyHud();
  }

  heroInSlot(slot: number): Unit | undefined {
    return this.s.battle.heroes.find((h) => h.slot === slot);
  }

  /** Each hero's health, resource, abilities (with cooldowns) and buffs. */
  updatePartyHud(): void {
    const g = this.partyBars;
    g.clear();
    this.partyCooldowns.clear();
    const w = this.s.party.frameW;
    this.partyFrames.forEach((f, i) => {
      const h = this.heroInSlot(i);
      const x = this.s.party.x + i * (w + this.s.party.gap);
      const y = WORLD.hudTop + 6;
      if (!h) {
        f.bg.setVisible(false);
        f.name.setText('');
        f.hpText.setText('');
        for (const img of f.buffs) img.setVisible(false);
        for (const b of f.boxes) b.bg.setVisible(false), b.label.setText(''), b.icon.setVisible(false);
        return;
      }
      f.bg.setVisible(true).setStrokeStyle(h.id === this.s.battle.focusId ? 2 : 1, h.id === this.s.battle.focusId ? 0x7dff9b : 0x2b3445);
      f.name.setText(`${h.label}  Lv ${h.level ?? 1}`).setColor(h.alive ? '#' + COLORS[h.kind].toString(16).padStart(6, '0') : '#666');
      // Health and resource.
      const bw = w - 10;
      g.fillStyle(0x2b3445).fillRect(x + 5, y + 21, bw, 14);
      g.fillStyle(h.alive ? 0xc0392b : 0x444444).fillRect(x + 5, y + 21, bw * Math.max(0, h.hp / h.maxHp), 14);
      f.hpText.setText(h.alive ? `${Math.ceil(h.hp)} / ${h.maxHp}` : 'Down');
      if (h.resourceKind) {
        g.fillStyle(0x2b3445).fillRect(x + 5, y + 39, bw, 8);
        g.fillStyle(RESOURCE_COLORS[h.resourceKind]).fillRect(x + 5, y + 39, bw * ((h.resource ?? 0) / (h.maxResource ?? 1)), 8);
      }
      // Ability boxes (traits in purple), with cooldown shading.
      f.boxes.forEach((b, j) => {
        const a = h.abilities?.[j];
        const trait = !a ? h.traits?.[j - (h.abilities?.length ?? 0)] : undefined;
        b.bg.setVisible(true);
        const iconKey = a ? abilityIcon(a.id) : trait ? traitIcon(trait) : '';
        const hasIcon = !!iconKey && this.s.textures.exists(iconKey);
        b.icon.setVisible(hasIcon);
        if (hasIcon && b.icon.texture.key !== iconKey) b.icon.setTexture(iconKey);
        if (a) {
          const def = ABILITIES[a.id];
          b.bg.setFillStyle(COLORS[h.kind]).setStrokeStyle(1, a.mastery ? 0xffd166 : 0x111111);
          b.label.setText(hasIcon ? '' : initials(def.name)).setColor(DARK_LETTER.includes(h.kind) ? '#111' : '#fff');
          if (a.cooldown > 0) {
            const bx = b.bg.x - this.s.party.box / 2;
            const by = b.bg.y - this.s.party.box / 2;
            this.partyCooldowns.fillStyle(0x000000, 0.6).fillRect(bx, by, this.s.party.box, this.s.party.box * Math.min(1, a.cooldown / this.s.battle.abilityCooldown(a)));
          }
        } else if (trait) {
          b.bg.setFillStyle(0x24203a).setStrokeStyle(1, 0xb57bff);
          b.label.setText(hasIcon ? '' : initials(TRAITS[trait].name)).setColor('#e0c3ff');
        } else {
          b.bg.setFillStyle(0x151b27).setStrokeStyle(1, 0x2b3445);
          b.label.setText('');
        }
      });
      // Active buffs/debuffs as icons: buffs first, then debuffs; one per kind.
      const effects = (h.effects ?? [])
        .filter((e) => e.remaining > 0)
        .sort((p, q) => Number(effectInfo(p).debuff) - Number(effectInfo(q).debuff))
        .filter((e, k, list) => list.findIndex((o) => effectIcon(o) === effectIcon(e)) === k);
      f.buffs.forEach((img, k) => {
        const e = h.alive ? effects[k] : undefined;
        img.setVisible(!!e).setData('effect', e);
        if (!e) return;
        const key = effectIcon(e);
        if (img.texture.key !== key) img.setTexture(key);
        // Fade out in the last two seconds.
        img.setAlpha(Number.isFinite(e.remaining) && e.remaining < 2 ? 0.5 + 0.5 * Math.abs(Math.sin(this.s.battle.time * 6)) : 1);
      });
    });

    // Bottom row: the inspected unit, or a hint.
    const focus = this.s.battle.focusId !== null ? this.s.battle.unit(this.s.battle.focusId) : undefined;
    const ty = WORLD.hudTop + HUD_TARGET_Y;
    if (focus?.alive) {
      this.focusText.setText('');
      this.drawTargetFrame(focus, TARGET_BAR_X, ty, WORLD.width - 16 - TARGET_BAR_X);
    } else {
      this.clearTargetFrame();
      this.focusText.setText('Tap a hero or enemy to inspect it. Tap a hero panel for its abilities.');
    }
  }

  /** Tooltip for one ability box in a hero's panel. */
  showAbilityTooltip(slot: number, j: number): void {
    const h = this.heroInSlot(slot);
    if (!h) return;
    const a = h.abilities?.[j];
    const trait = !a ? h.traits?.[j - (h.abilities?.length ?? 0)] : undefined;
    if (a) {
      const def = ABILITIES[a.id];
      const cost = this.s.battle.abilityCost(h, a.id);
      const costText = cost ? `${cost} ${RESOURCES[h.resourceKind!].label.toLowerCase()}` : 'free';
      const ups = [a.mastery ? ABILITIES[a.id].mastery.name : '', a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(' · ');
      const cd = this.s.battle.abilityCooldown(a);
      this.showTooltip(
        `${h.label}: ${def.name}`,
        this.s.battle.abilityEffectText(h, a),
        `Cost: ${costText} · Cooldown: ${cd % 1 ? cd.toFixed(1) : cd}s${ups ? ` · ${ups}` : ''}`,
        COLORS[h.kind],
        true,
      );
    } else if (trait) {
      this.showTooltip(`${h.label}: ${TRAITS[trait].name}`, TRAITS[trait].description, 'Passive — always on', 0xb57bff, true);
    } else {
      this.showTooltip('Empty slot', 'Earn new abilities from rewards every 5 rounds.', '', 0x3a4660, true);
    }
  }

  /** Tooltip for one buff/debuff icon on a hero panel. */
  showEffectTooltip(e: Effect | undefined): void {
    if (!e) return;
    const info = effectInfo(e);
    const left = Number.isFinite(e.remaining) ? `${Math.ceil(e.remaining)}s left` : 'Lasts all fight';
    this.showTooltip(info.name, info.text(e), `${info.debuff ? 'Debuff' : 'Buff'} · ${left}`, info.color, true, info.debuff);
  }

  /** Tap a hero's panel: its passive and abilities. */
  showHeroTooltip(slot: number): void {
    const h = this.heroInSlot(slot);
    if (!h) return;
    const names = [...(h.abilities ?? []).map((a) => ABILITIES[a.id].name + (a.power ? ` +${a.power}` : '')), ...(h.traits ?? []).map((t) => TRAITS[t].name)];
    const passive = h.passive ? PASSIVES[h.passive] : undefined;
    this.showTooltip(
      `${h.label} — level ${h.level ?? 1}`,
      `Abilities: ${names.join(', ')}`,
      passive ? `Passive: ${passive.name} — ${passive.short}` : '',
      COLORS[h.kind],
      true,
    );
  }

  /** A small box just above the HUD, sized to fit its text. */
  showTooltip(titleText: string, bodyText: string, metaText: string, color: number, autoHide: boolean, bad = false): void {
    this.tooltip?.destroy();
    const w = 420;
    const x = 16;
    const title = this.s.text(x + 12, 0, titleText, 15, bad ? '#ff8a8a' : '#ffd166').setFontStyle('bold');
    const body = this.s.text(x + 12, 0, bodyText, 13, '#ffffff').setWordWrapWidth(w - 24);
    const meta = this.s.text(x + 12, 0, metaText, 12, '#9ad1ff').setWordWrapWidth(w - 24);
    const h = 18 + title.height + 6 + body.height + (metaText ? 6 + meta.height : 0) + 10;
    const y = WORLD.hudTop - h - 8;
    title.setY(y + 10);
    body.setY(title.y + title.height + 6);
    meta.setY(body.y + body.height + 6);
    const box = this.s.add.rectangle(x, y, w, h, 0x111723, 0.96).setOrigin(0, 0).setStrokeStyle(2, color);
    this.tooltip = this.s.add.container(0, 0, [box, title, body, meta]).setDepth(90);
    const tip = this.tooltip;
    if (autoHide) {
      this.s.time.delayedCall(4000, () => {
        if (this.tooltip === tip) this.hideTooltip();
      });
    }
  }

  hideTooltip(): void {
    this.tooltip?.destroy();
    this.tooltip = undefined;
  }

  /** Name + health bar of the focused unit, like an MMO target frame. */
  drawTargetFrame(u: Unit, x: number, y: number, w: number): void {
    const enemy = u.side === 'enemy';
    this.targetName.setText(`${enemy ? '◎' : '✚'} ${u.label}`).setColor(enemy ? '#ffd166' : '#7dff9b');
    const pct = Math.max(0, u.hp / u.maxHp);
    this.targetBar.clear();
    this.targetBar.fillStyle(0x2b3445).fillRect(x, y, w, 17);
    this.targetBar.fillStyle(enemy ? 0xe74c3c : 0x2ecc71).fillRect(x, y, w * pct, 17);
    this.targetBar.lineStyle(1, enemy ? 0xffd166 : 0x7dff9b, 0.8).strokeRect(x, y, w, 17);
    this.targetHp.setText(`${Math.ceil(u.hp)} / ${u.maxHp}`);
  }

  clearTargetFrame(): void {
    this.targetName.setText('');
    this.targetBar.clear();
    this.targetHp.setText('');
  }

  showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.s.tweens.killTweensOf(this.toast);
    this.s.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 400 });
  }
}
