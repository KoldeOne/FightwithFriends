import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { STEP } from '../sim/battle';
import { ABILITIES, ABILITY_TUNING } from '../sim/content';
import { sound } from './sound';
import { type AbilityId, type BattleEvent, type Unit } from '../sim/types';
import { spriteKey, spriteScale, spriteTopRow, spriteOriginY, COLORS, LETTERS, DARK_LETTER, PROJECTILE_COLORS, GOLD, ENEMY_STROKE, SLOW_STROKE, EFFECT_INFO, UNIT_ICONS, UNIT_ICON, type UnitView, effectInfo } from './theme';

/** Unit sprites and combat effects: views, projectiles, hits, numbers, deaths. */
export class UnitLayer {
  constructor(readonly s: BattleScene) {}

  views = new Map<number, UnitView>();
  zoneLayer!: Phaser.GameObjects.Graphics;
  /** Positions before the latest simulation step, for smooth (interpolated) drawing. */
  prevPos = new Map<number, { x: number; y: number }>();
  /** Brief freeze on heavy hits (seconds of real time). */
  hitStop = 0;
  /** Merged floating damage numbers, per target. */
  numbers = new Map<number, { text: Phaser.GameObjects.Text; total: number; at: number }>();
  lastReinforcementCall = -99;
  focusMarker!: Phaser.GameObjects.Graphics;

  // --- units --------------------------------------------------------------

  createView(u: Unit): void {
    const body = this.s.add.circle(0, 0, u.radius, COLORS[u.kind] ?? 0xffffff);
    body.setStrokeStyle(u.side === 'enemy' ? 3 : 2, u.side === 'enemy' ? ENEMY_STROKE : 0x111111);
    const letter = this.s.text(0, 0, LETTERS[u.kind] ?? '?', u.radius, DARK_LETTER.includes(u.kind) ? '#222' : '#fff')
      .setOrigin(0.5)
      .setFontStyle('bold');
    const hpBar = this.s.add.graphics();
    const flash = this.s.add.circle(0, 0, u.radius, 0xffffff).setAlpha(0);
    const container = this.s.add.container(u.x, u.y, [body, flash, letter, hpBar]);
    let sprite: Phaser.GameObjects.Image | undefined;
    let top = -u.radius;
    const key = spriteKey(u);
    if (this.s.textures.exists(key)) {
      // Keep pixels crisp when scaled up.
      this.s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      body.setFillStyle(COLORS[u.kind] ?? 0xffffff, 0.35);
      letter.setVisible(false);
      const scale = spriteScale(u);
      sprite = this.s.add.image(0, u.radius * 0.6, key).setScale(scale);
      sprite.setOrigin(0.5, spriteOriginY(key, sprite.height));
      container.addAt(sprite, 2);
      top = u.radius * 0.6 - (sprite.height - spriteTopRow(key)) * scale + 4;
    }
    container.setDepth(u.side === 'hero' ? 10 : 20);
    let name: Phaser.GameObjects.Text | undefined;
    if (u.side === 'hero') {
      name = this.s.text(0, u.radius + 4, u.label, 12, '#c9d1e0').setOrigin(0.5, 0);
      container.add(name);
    }
    if (u.side === 'enemy') {
      container.setAlpha(0);
      this.s.tweens.add({ targets: container, alpha: 1, duration: 300 });
    }
    let aggroIcon: UnitView['aggroIcon'];
    if (u.side === 'hero' && !u.isTank) {
      const disc = this.s.add.circle(0, 0, 10, 0xf39c12).setStrokeStyle(2, 0x000000);
      const mark = this.s.text(0, 0, '!', 15, '#000').setOrigin(0.5).setFontStyle('bold');
      const iconContainer = this.s.add.container(u.radius + 12, top - 6, [disc, mark]).setVisible(false);
      container.add(iconContainer);
      aggroIcon = { container: iconContainer, disc };
    }
    let castLabel: Phaser.GameObjects.Text | undefined;
    if (u.ai) {
      castLabel = this.s.text(0, -u.radius - 34, '', 11, '#e0c3ff').setOrigin(0.5).setFontStyle('bold');
      castLabel.setStroke('#000000', 3);
      container.add(castLabel);
    }
    const effectIcons: UnitView['effectIcons'] = [];
    for (let i = 0; i < UNIT_ICONS; i++) {
      const bg = this.s.add.rectangle(0, 0, UNIT_ICON, UNIT_ICON, 0xffffff).setStrokeStyle(1, 0x000000).setVisible(false);
      const l = this.s.text(0, 0, '', 8, '#111').setOrigin(0.5).setFontStyle('bold').setVisible(false);
      container.add([bg, l]);
      effectIcons.push({ bg, letter: l });
    }
    this.views.set(u.id, { container, body, hpBar, name, letter, flash, sprite, top, aggroIcon, castLabel, effectIcons, dead: false });
  }

  /** Brief push of a unit's figure (lunges and knockback); returns to rest. */
  nudge(v: UnitView, dx: number, dy: number, duration: number): void {
    this.s.tweens.add({ targets: v.body, x: dx, y: dy, duration, yoyo: true });
    if (v.sprite) this.s.tweens.add({ targets: v.sprite, x: `+=${dx}`, y: `+=${dy}`, duration, yoyo: true });
  }

  syncViews(): void {
    for (const u of this.s.battle.units) {
      const v = this.views.get(u.id);
      if (!v || v.dead) continue;
      // Draw between the last two simulation steps so motion is smooth at any frame rate.
      const prev = this.prevPos.get(u.id);
      const a = Math.min(1, this.s.acc / STEP);
      if (prev && this.s.battle.outcome === 'running') v.container.setPosition(prev.x + (u.x - prev.x) * a, prev.y + (u.y - prev.y) * a);
      else v.container.setPosition(u.x, u.y);
      const w = u.radius * 2 + 6;
      const y = v.top - 10;
      v.hpBar.clear();
      v.hpBar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, 7);
      const pct = u.hp / u.maxHp;
      const color = u.side === 'enemy' ? 0xe74c3c : pct > 0.5 ? 0x2ecc71 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
      v.hpBar.fillStyle(color).fillRect(-w / 2, y, w * pct, 5);

      // Tiny buff/debuff icons just under the health bar (buffs first; debuffs have a red edge).
      const shown = (u.effects ?? [])
        .filter((e) => e.remaining > 0 && e.kind !== 'sheep')
        .sort((a, b) => Number(EFFECT_INFO[a.kind].debuff) - Number(EFFECT_INFO[b.kind].debuff))
        .filter((e, i, list) => list.findIndex((o) => o.kind === e.kind) === i)
        .slice(0, UNIT_ICONS);
      const startX = -((shown.length - 1) * (UNIT_ICON + 2)) / 2;
      v.effectIcons.forEach((icon, i) => {
        const e = shown[i];
        icon.bg.setVisible(!!e);
        icon.letter.setVisible(!!e);
        if (!e) return;
        const info = effectInfo(e);
        const ix = startX + i * (UNIT_ICON + 2);
        const iy = y + 6 + UNIT_ICON / 2 + 1;
        icon.bg.setPosition(ix, iy).setFillStyle(info.color).setStrokeStyle(1, info.debuff ? 0xe74c3c : 0x000000);
        icon.letter.setPosition(ix, iy).setText(info.letter);
      });
      if (u.side === 'hero') v.container.setAlpha(this.s.battle.hasEffect(u, 'stealth') ? 0.45 : 1);
      if (u.side === 'enemy') {
        const sheep = this.s.battle.isSheep(u);
        // With a sprite, the disc is just a faint base; a sheep hides the sprite and shows "baa".
        v.sprite?.setVisible(!sheep);
        v.letter.setVisible(sheep || !v.sprite);
        v.body.setFillStyle(sheep ? 0xf4f1e8 : COLORS[u.kind], v.sprite && !sheep ? 0.35 : 1);
        v.body.setStrokeStyle(3, sheep ? 0xbdb7a6 : this.s.battle.hasEffect(u, 'slow') ? SLOW_STROKE : ENEMY_STROKE);
        v.letter.setText(sheep ? 'baa' : LETTERS[u.kind]).setFontSize(sheep ? 11 : u.radius);
        if (sheep) v.letter.setColor('#555');
        else v.letter.setColor(DARK_LETTER.includes(u.kind) ? '#222' : '#fff');
      }
      // Cast bar above casting enemies.
      if (u.casting) {
        const cy = y - 9;
        const pct = 1 - u.casting.remaining / u.casting.total;
        v.hpBar.fillStyle(0x000000, 0.8).fillRect(-w / 2 - 1, cy - 1, w + 2, 7);
        // Unstoppable casts (an enraged boss) show in orange: interrupts won't work.
        v.hpBar.fillStyle(u.casting.unstoppable ? 0xff8c1a : 0xb57bff).fillRect(-w / 2, cy, w * pct, 5);
        v.castLabel?.setText(u.casting.unstoppable ? `${u.casting.spell} (unstoppable)` : u.casting.spell).setY(cy - 10);
      } else {
        v.castLabel?.setText('');
      }

      if (v.aggroIcon) {
        const level = this.s.battle.aggroLevel(u.id);
        v.aggroIcon.container.setVisible(level !== 'none');
        v.aggroIcon.disc.setFillStyle(level === 'aggro' ? 0xe74c3c : 0xf39c12);
      }
    }
  }

  /** Ground effects such as Blizzard. */
  drawZones(time: number): void {
    this.zoneLayer.clear();
    for (const z of this.s.battle.zones) {
      const pulse = 0.18 + Math.sin(time / 200) * 0.04;
      // Blizzard: icy blue. Hallowed Ground: gold.
      const holy = z.ability === 'hallowedGround';
      this.zoneLayer.fillStyle(holy ? 0xffe28a : 0x9ad1ff, pulse).fillCircle(z.x, z.y, z.radius);
      this.zoneLayer.lineStyle(2, holy ? 0xfff3c4 : 0xd6ecff, 0.7).strokeCircle(z.x, z.y, z.radius);
    }
  }

  drawFocus(time: number): void {
    this.focusMarker.clear();
    const unit = this.s.battle.focusId !== null ? this.s.battle.unit(this.s.battle.focusId) : undefined;
    if (!unit?.alive) return;
    const drawn = this.views.get(unit.id)?.container;
    const f = { ...unit, x: drawn?.x ?? unit.x, y: drawn?.y ?? unit.y };
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

  handleEvents(events: BattleEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          const u = this.s.battle.unit(e.id);
          if (u) this.createView(u);
          if (u?.side === 'enemy' && this.s.battle.time > 5 && this.s.battle.time - this.lastReinforcementCall > 4) {
            this.lastReinforcementCall = this.s.battle.time;
            this.s.showBanner(u.y > 0 ? 'Flankers incoming!' : 'Reinforcements!', true);
            sound.play('wave');
          }
          break;
        }
        case 'shoot':
          this.showProjectile(e.from, e.to, e.duration, e.ability);
          break;
        case 'attack':
          this.showAttack(e.from, e.to, e.style, e.amount, e.ability, e.big);
          break;
        case 'heal':
          this.showHeal(e.from, e.to, e.amount);
          sound.play('heal');
          break;
        case 'castStart': {
          sound.play('cast');
          const u = this.s.battle.unit(e.from);
          if (u?.ai === 'smasher') {
            const ring = this.s.add.circle(u.x, u.y, u.radius + 6).setStrokeStyle(4, 0xff4d4d).setDepth(30);
            this.s.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: e.duration * 1000, onComplete: () => ring.destroy() });
          }
          break;
        }
        case 'ability':
          this.showAbility(e.from, e.ability, e.to);
          break;
        case 'tick': {
          if (e.kind === 'hot') {
            const u = this.s.battle.unit(e.to);
            if (u) this.floatText(u.x, u.y - 14, `+${e.amount}`, '#7dff9b', 11, 0.75);
          } else {
            this.addNumber(e.to, e.amount, '#ff9f1a', 11, 0.8);
          }
          break;
        }
        case 'taunt':
          this.showTaunt(e.from, e.to);
          break;
        case 'castEnd':
          if (e.interrupted) {
            const u = this.s.battle.unit(e.from);
            if (u) this.views.get(u.id)?.castLabel?.setText('');
            sound.play('interrupt');
          }
          break;
        case 'notice': {
          const u = this.s.battle.unit(e.id);
          const color = e.tone === 'good' ? '#7dff9b' : e.tone === 'bad' ? '#ff6b6b' : '#9ad1ff';
          // A smasher's heavy hit landing (its spell name, shouted).
          const smash = u?.ai === 'smasher' && e.tone === 'bad';
          if (u) this.floatText(u.x, u.y - u.radius - 30, e.text, color, smash ? 22 : 16);
          if (smash) {
            sound.play('smash');
            this.s.cameras.main.shake(220, 0.01);
          }
          break;
        }
        case 'death':
          this.showDeath(e.id);
          break;
      }
    }
  }

  /** A projectile flying to its target; the hit itself arrives as an 'attack' event. */
  showProjectile(fromId: number, toId: number, duration: number, ability?: AbilityId): void {
    const from = this.views.get(fromId)?.container;
    const to = this.views.get(toId)?.container;
    const shooter = this.s.battle.unit(fromId);
    if (!from || !to || !shooter) return;
    const big = ability === 'fireball';
    const color = big ? 0xff5a1f : ability === 'iceLance' ? 0x9ad1ff : (PROJECTILE_COLORS[shooter.kind] ?? 0xffffff);
    const bolt = this.s.add.circle(from.x, from.y, big ? 11 : shooter.kind === 'mage' ? 6 : 4, color).setDepth(30);
    if (big) bolt.setStrokeStyle(3, 0xffd166);
    sound.play(big ? 'fire' : ability === 'iceLance' ? 'frost' : 'shoot');
    const sx = from.x;
    const sy = from.y;
    // Home in on where the target is drawn, so the shot always lands on it.
    this.s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: duration * 1000,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const tx = to.active ? to.x : bolt.x;
        const ty = to.active ? to.y : bolt.y;
        bolt.setPosition(sx + (tx - sx) * t, sy + (ty - sy) * t);
        if (big && Math.random() < 0.5) this.spark(bolt.x, bolt.y, 0xffb347, 1, 10);
      },
      onComplete: () => bolt.destroy(),
    });
  }

  showAttack(fromId: number, toId: number, style: 'melee' | 'ranged', amount: number, ability?: AbilityId, big?: boolean): void {
    const from = this.s.battle.unit(fromId);
    const fromView = this.views.get(fromId)?.container;
    // A unit killed by this hit is already gone from the battle, so use where it was last drawn.
    const toView = this.views.get(toId);
    const to = this.s.battle.unit(toId);
    if (!toView) return;
    const fx = fromView?.x ?? from?.x ?? 0;
    const fy = fromView?.y ?? from?.y ?? 0;
    const tx = toView.container.x;
    const ty = toView.container.y;
    const hitHero = to?.side === 'hero';
    const mine = fromId === this.s.battle.playerId;
    const heavy = big || (ability !== undefined && amount >= 40);

    // Numbers: yours and damage to heroes are prominent; teammates' hits are smaller.
    const color = hitHero ? '#ff6b6b' : ability ? '#ffd166' : '#ffffff';
    const size = heavy ? 20 : ability || mine || hitHero ? 15 : 12;
    this.addNumber(toId, amount, color, size, mine || hitHero || ability ? 1 : 0.7);

    // Melee: a lunge and a slash.
    if (style === 'melee' && ability !== 'thunderclap' && ability !== 'whirlwind' && fromView) {
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const lunger = this.views.get(fromId);
      if (lunger) this.nudge(lunger, (dx / len) * 7, (dy / len) * 7, 70);
      const slash = this.s.add.graphics().setDepth(30);
      const w = ability === 'eviscerate' ? 9 : ability === 'heroicStrike' ? 8 : ability === 'sinisterStrike' ? 7 : 3;
      const c = ability === 'eviscerate' ? 0xe74c3c : ability === 'heroicStrike' ? 0xff7043 : ability === 'sinisterStrike' ? 0xffe066 : 0xffffff;
      slash.lineStyle(w, c, 0.95).lineBetween(fx + (dx / len) * 10, fy + (dy / len) * 10, tx, ty);
      this.s.tweens.add({ targets: slash, alpha: 0, duration: ability ? 240 : 140, onComplete: () => slash.destroy() });
    }

    // Impact on the target: flash, knockback, sparks.
    if (toView && !toView.dead) {
      toView.flash.setAlpha(0.85);
      this.s.tweens.add({ targets: toView.flash, alpha: 0, duration: 130 });
      const hitSprite = toView.sprite;
      if (hitSprite) {
        hitSprite.setTintFill(0xffffff);
        this.s.time.delayedCall(80, () => {
          if (!toView.dead) hitSprite.clearTint();
        });
      }
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const kb = heavy ? 7 : 3;
      this.nudge(toView, (dx / len) * kb, (dy / len) * kb, 60);
      this.spark(tx, ty, hitHero ? 0xff6b6b : 0xfff2c4, heavy ? 8 : 3, heavy ? 26 : 16);
    }
    if (heavy) {
      this.s.cameras.main.shake(90, 0.004);
      this.hitStop = Math.max(this.hitStop, 0.05);
      sound.play('heavyHit');
    } else {
      sound.play('hit');
    }
  }

  /** Merge rapid hits on the same target into one growing number. */
  addNumber(targetId: number, amount: number, color: string, size: number, alpha = 1): void {
    const view = this.views.get(targetId);
    if (!view) return;
    const now = this.s.time.now;
    const existing = this.numbers.get(targetId);
    if (existing && existing.text.active && now - existing.at < 300) {
      existing.total += amount;
      existing.at = now;
      existing.text.setText(`${existing.total}`).setFontSize(Math.min(size + 6, Math.max(parseInt(`${existing.text.style.fontSize}`, 10), size)));
      return;
    }
    const x = view.container.x + Phaser.Math.Between(-6, 6);
    const y = view.container.y - 22;
    const t = this.s.text(x, y, `${amount}`, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold').setAlpha(alpha);
    t.setStroke('#000000', 3);
    this.s.tweens.add({ targets: t, y: y - 30, duration: 750, ease: 'Cubic.easeOut' });
    this.s.tweens.add({ targets: t, alpha: 0, delay: 450, duration: 300, onComplete: () => t.destroy() });
    this.numbers.set(targetId, { text: t, total: amount, at: now });
  }

  /** A few small particles flying out from a point. */
  spark(x: number, y: number, color: number, count: number, distance: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = distance * (0.5 + Math.random() * 0.7);
      const p = this.s.add.circle(x, y, 2 + Math.random() * 2, color).setDepth(35);
      this.s.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 260 + Math.random() * 160, onComplete: () => p.destroy() });
    }
  }

  showAbility(fromId: number, ability: AbilityId, toId?: number): void {
    const from = this.s.battle.unit(fromId);
    if (!from) return;
    const to = toId !== undefined ? this.s.battle.unit(toId) : undefined;
    const name = ABILITIES[ability].name;
    switch (ability) {
      case 'taunt':
        return; // the taunt event draws it
      case 'thunderclap': {
        const ring = this.s.add.circle(from.x, from.y, from.radius).setStrokeStyle(6, 0xd4a24c).setDepth(30);
        const scale = ABILITY_TUNING.thunderclap.radius / from.radius;
        this.s.tweens.add({ targets: ring, scale, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#f5c26b', 15);
        return;
      }
      case 'whirlwind': {
        const ring = this.s.add.circle(from.x, from.y, from.radius).setStrokeStyle(6, 0xffffff).setDepth(30);
        this.s.tweens.add({ targets: ring, scale: ABILITY_TUNING.whirlwind.radius / from.radius, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#ffffff', 15);
        return;
      }
      case 'shieldBlock':
      case 'evasion':
      case 'powerShield': {
        const target = to ?? from;
        const color = ability === 'evasion' ? 0xf1c40f : ability === 'powerShield' ? 0xfff7d6 : 0xd4a24c;
        const ring = this.s.add.circle(target.x, target.y, target.radius + 6).setStrokeStyle(4, color).setDepth(30);
        this.s.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        this.floatText(target.x, target.y - target.radius - 22, name, '#ffffff', 14);
        return;
      }
      case 'prayerOfHealing':
        this.floatText(from.x, from.y - from.radius - 22, name, '#7dff9b', 14);
        return;
      case 'blizzard':
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#9ad1ff', 14);
        return;
      case 'fortitude':
        for (const ally of this.s.battle.heroes) {
          if (!ally.alive) continue;
          const ring = this.s.add.circle(ally.x, ally.y, ally.radius + 4).setStrokeStyle(4, 0xfff3b0).setDepth(30);
          this.s.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, name, '#fff3b0', 14);
        return;
      case 'renew':
      case 'heal':
        if (to) {
          const ring = this.s.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(4, 0x7dff9b).setDepth(30);
          this.s.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
          this.floatText(to.x, to.y - to.radius - 22, name, '#7dff9b', 15);
        }
        return;
      case 'judgement':
      case 'soulDrain':
      case 'enfeeble':
        if (to) {
          const color = ability === 'judgement' ? 0xffe28a : 0x9b59ff;
          const line = this.s.add.graphics().setDepth(30);
          line.lineStyle(ability === 'judgement' ? 5 : 3, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
          this.s.tweens.add({ targets: line, alpha: 0, duration: 350, onComplete: () => line.destroy() });
          const ring = this.s.add.circle(to.x, to.y, to.radius + 4).setStrokeStyle(4, color).setDepth(30);
          this.s.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, ability === 'judgement' ? '#ffe28a' : '#c39bff', 14);
        return;
      case 'wither':
        return; // cast every few seconds: the purple debuff icon is enough
      case 'hallowedGround':
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#ffe28a', 14);
        return;
      case 'radiantLight':
      case 'mercy':
        if (to) {
          const ring = this.s.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(ability === 'mercy' ? 6 : 4, 0xffe28a).setDepth(30);
          this.s.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 650, onComplete: () => ring.destroy() });
          this.floatText(to.x, to.y - to.radius - 22, name, '#ffe28a', 15);
        }
        return;
      case 'polymorph':
      case 'kick':
      case 'counterspell':
        if (to) {
          const color = ability === 'polymorph' ? 0xf4f1e8 : ability === 'counterspell' ? 0x9ad1ff : 0xffe066;
          const line = this.s.add.graphics().setDepth(30);
          line.lineStyle(3, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
          this.s.tweens.add({ targets: line, alpha: 0, duration: 400, onComplete: () => line.destroy() });
          const ring = this.s.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(4, color).setDepth(30);
          this.s.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#ffd166', 14);
        return;
      default:
        this.floatText(from.x, from.y - from.radius - 22, name, '#ffd166', 14);
    }
  }

  showHeal(fromId: number, toId: number, amount: number): void {
    const from = this.s.battle.unit(fromId);
    const to = this.s.battle.unit(toId);
    if (!from || !to) return;
    const beam = this.s.add.graphics().setDepth(30);
    beam.lineStyle(3, 0x7dff9b, 0.8).lineBetween(from.x, from.y, to.x, to.y);
    this.s.tweens.add({ targets: beam, alpha: 0, duration: 300, onComplete: () => beam.destroy() });
    const ring = this.s.add.circle(to.x, to.y, to.radius + 4).setStrokeStyle(3, 0x7dff9b).setDepth(30);
    this.s.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    this.floatText(to.x, to.y - 18, `+${amount}`, '#7dff9b');
  }

  showTaunt(fromId: number, toId: number): void {
    const from = this.s.battle.unit(fromId);
    const to = this.s.battle.unit(toId);
    if (!from || !to) return;
    const line = this.s.add.graphics().setDepth(30);
    line.lineStyle(4, 0xff9f1a, 0.9).lineBetween(from.x, from.y, to.x, to.y);
    this.s.tweens.add({ targets: line, alpha: 0, duration: 450, onComplete: () => line.destroy() });
    const ring = this.s.add.circle(to.x, to.y, to.radius + 5).setStrokeStyle(3, 0xff9f1a).setDepth(30);
    this.s.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    this.floatText(from.x, from.y - from.radius - 22, 'Taunt!', '#ff9f1a');
  }

  showDeath(id: number): void {
    const v = this.views.get(id);
    const u = this.s.battle.unit(id);
    if (!v) return;
    v.dead = true;
    v.hpBar.clear();
    v.aggroIcon?.container.setVisible(false);
    this.spark(v.container.x, v.container.y, u?.side === 'hero' ? 0xff6b6b : 0x9fdc5a, 12, 34);
    if (u?.side === 'hero') {
      sound.play('heroDown');
      this.s.cameras.main.shake(160, 0.006);
    } else {
      sound.play('death');
    }
    if (u?.side === 'hero') {
      v.body.setFillStyle(0x444444);
      v.sprite?.setTint(0x555555);
      v.container.setAlpha(0.5);
    } else {
      this.s.tweens.add({
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

  floatText(x: number, y: number, str: string, color: string, size = 15, alpha = 1): void {
    const t = this.s.text(x + Phaser.Math.Between(-6, 6), y, str, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold').setAlpha(alpha);
    t.setStroke('#000000', 3);
    this.s.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }
}
