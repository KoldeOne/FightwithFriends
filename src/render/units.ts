import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { STEP } from '../sim/battle';
import { ABILITIES, ABILITY_TUNING, BOSS_SPECIALS } from '../sim/content';
import { sound } from './sound';
import { type AbilityId, type BattleEvent, type Unit } from '../sim/types';
import { SCHOOL_COLORS, MAX_PARTICLES, schoolOf, type School } from './fx';
import { Remains } from './remains';
import type { EnemyKind } from '../sim/types';
import { spriteKey, spriteScale, spriteTopRow, spriteOriginY, COLORS, LETTERS, DARK_LETTER, PROJECTILE_COLORS, GOLD, ENEMY_STROKE, SLOW_STROKE, EFFECT_INFO, UNIT_ICONS, UNIT_ICON, type UnitView, effectIcon, ICON_PX, FONT_SCALE } from './theme';
/** Shadows at a unit's feet: the base disc squashed to an ellipse. */
const SHADOW_SQUASH = 0.38;

/** Unit sprites and combat effects: views, projectiles, hits, numbers, deaths. */
export class UnitLayer {
  constructor(readonly s: BattleScene) {}

  views = new Map<number, UnitView>();
  zoneLayer!: Phaser.GameObjects.Graphics;
  /** Positions before the latest simulation step, for smooth (interpolated) drawing. */
  prevPos = new Map<number, { x: number; y: number }>();
  /** Brief freeze on heavy hits (seconds of real time). */
  hitStop = 0;
  /** Merged floating numbers, per target and kind (damage / heal). */
  numbers = new Map<string, { text: Phaser.GameObjects.Text; total: number; at: number }>();
  /** Live floating numbers per target, oldest first: new ones fan out beside and above them. */
  numberStacks = new Map<number, Phaser.GameObjects.Text[]>();
  /** Which side the next number on a target goes (alternates). */
  numberSide = new Map<number, number>();
  /** The one ability-name callout shown over each unit. */
  callouts = new Map<number, Phaser.GameObjects.Text>();
  /** Sheep icons shown on polymorphed enemies. */
  sheepIcons = new Map<number, Phaser.GameObjects.Image>();
  /** Short-lived particles alive now (capped at MAX_PARTICLES). */
  particles = 0;
  lastReinforcementCall = -99;
  /** What fights leave on the ground: remains, spatter, scorch marks. */
  remains = new Remains(this.s);
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
    let baseScale = 1;
    let top = -u.radius;
    const key = spriteKey(u);
    if (this.s.textures.exists(key)) {
      // Keep pixels crisp when scaled up.
      this.s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      // The disc becomes a soft shadow at the feet, with a thin rim in the unit's colour.
      body.setPosition(0, u.radius * 0.6).setScale(1, SHADOW_SQUASH).setFillStyle(0x000000, 0.32);
      body.setStrokeStyle(2, u.side === 'enemy' ? ENEMY_STROKE : (COLORS[u.kind] ?? 0xffffff), 0.75);
      letter.setVisible(false);
      const scale = spriteScale(u);
      baseScale = scale;
      sprite = this.s.add.image(0, u.radius * 0.6, key).setScale(scale);
      sprite.setOrigin(0.5, spriteOriginY(key, sprite.height));
      container.addAt(sprite, 2);
      top = u.radius * 0.6 - (sprite.height - spriteTopRow(key)) * scale + 4;
    }
    container.setDepth(u.side === 'hero' ? 10 : 20);
    let name: Phaser.GameObjects.Text | undefined;
    if (u.side === 'hero') {
      // Not bold: the pixel font has no bold, and a fake one smudges at this size.
      name = this.s.text(0, u.radius + 4, u.label, 12, '#ffffff').setOrigin(0.5, 0);
      name.setStroke('#0b1020', 3);
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
    // Heroes show their buffs on their panel at the bottom; enemies show them here.
    for (let i = 0; i < (u.side === 'enemy' ? UNIT_ICONS : 0); i++) {
      const img = this.s.add.image(0, 0, 'icon-ef-stun').setScale(UNIT_ICON / ICON_PX).setVisible(false);
      container.add(img);
      effectIcons.push(img);
    }
    this.views.set(u.id, { container, body, hpBar, name, letter, flash, sprite, top, aggroIcon, castLabel, effectIcons, dead: false, baseScale, lastX: u.x, lastY: u.y, busyUntil: 0, side: u.side, kind: u.kind, radius: u.radius, boss: !!u.isBoss });
  }

  /**
   * Life in the figures: a very slight breath while standing, and facing the
   * way they move. Attack and cast animations take over the
   * tilt and scale for a moment (busyUntil).
   */
  private animate(v: UnitView, u: Unit): void {
    const sp = v.sprite;
    if (!sp) return;
    const x = v.container.x;
    const y = v.container.y;
    const dx = x - v.lastX;
    const dy = y - v.lastY;
    v.lastX = x;
    v.lastY = y;
    const moving = Math.hypot(dx, dy) > 0.15;
    if (Math.abs(dx) > 0.2 && !this.s.battle.isSheep(u)) sp.setFlipX(dx < 0);
    if (this.s.time.now < v.busyUntil) return;
    // No sway while walking (it looked wobbly): upright, with a very slight breath when standing.
    sp.setRotation(sp.rotation * 0.7);
    const breath = moving ? 0 : Math.sin(this.s.time.now / 520 + u.id) * 0.012;
    sp.setScale(v.baseScale, v.baseScale * (1 + breath));
  }

  /** Attack wind-up and follow-through: tilt toward the target, squash, then stretch back. */
  private swingPose(v: UnitView, dx: number, duration: number): void {
    const sp = v.sprite;
    if (!sp) return;
    v.busyUntil = this.s.time.now + duration * 2 + 20;
    const tilt = Math.sign(dx || 1) * 0.32;
    sp.setRotation(-tilt * 0.4).setScale(v.baseScale * 1.06, v.baseScale * 0.92);
    this.s.tweens.add({ targets: sp, rotation: tilt, scaleX: v.baseScale * 0.96, scaleY: v.baseScale * 1.06, duration, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** A caster's flourish: a little hop and a glow at their feet in the spell's colour. */
  castPose(id: number, color: number): void {
    const v = this.views.get(id);
    if (!v || v.dead) return;
    const sp = v.sprite;
    if (sp) {
      v.busyUntil = this.s.time.now + 260;
      sp.setScale(v.baseScale);
      this.s.tweens.add({ targets: sp, y: `-=6`, scaleY: v.baseScale * 1.08, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
    const glow = this.s.add.ellipse(v.container.x, v.container.y + 10, 30, 10, color, 0.45).setDepth(9);
    this.s.tweens.add({ targets: glow, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 380, onComplete: () => glow.destroy() });
  }

  /** Brief push of a unit's figure (lunges and knockback); returns to rest. */
  nudge(v: UnitView, dx: number, dy: number, duration: number): void {
    this.s.tweens.add({ targets: v.body, x: `+=${dx}`, y: `+=${dy}`, duration, yoyo: true });
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
      this.animate(v, u);
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
        icon.setVisible(!!e);
        if (!e) return;
        const key = effectIcon(e);
        if (icon.texture.key !== key) icon.setTexture(key);
        icon.setPosition(startX + i * (UNIT_ICON + 2), y + 6 + UNIT_ICON / 2 + 1);
      });
      if (u.side === 'hero') v.container.setAlpha(this.s.battle.hasEffect(u, 'stealth') ? 0.45 : 1);
      if (u.side === 'enemy') {
        const sheep = this.s.battle.isSheep(u);
        // With a sprite, the disc is just a faint base; a sheep hides the sprite and shows a sheep icon.
        const sheepIcon = sheep ? this.sheepIcon(u.id, u.radius) : this.sheepIcons.get(u.id);
        sheepIcon?.setVisible(sheep);
        v.sprite?.setVisible(!sheep);
        v.letter.setVisible(sheep ? !sheepIcon : !v.sprite);
        const stroke = sheep ? SCHOOL_COLORS.arcane.main : this.s.battle.hasEffect(u, 'slow') ? SLOW_STROKE : ENEMY_STROKE;
        if (v.sprite && !sheep) {
          // The shadow at its feet (slowed: a blue rim).
          if (v.body.scaleY !== SHADOW_SQUASH) v.body.setScale(1, SHADOW_SQUASH).setY(u.radius * 0.6);
          v.body.setFillStyle(0x000000, 0.32).setStrokeStyle(2, stroke, 0.75);
        } else {
          if (v.sprite && v.body.scaleY !== 1) v.body.setScale(1, 1).setY(0);
          v.body.setFillStyle(sheep ? 0xf4f1e8 : COLORS[u.kind], 1).setStrokeStyle(3, stroke);
        }
        v.letter.setText(sheep ? '~' : LETTERS[u.kind]).setFontSize(Math.round(u.radius * FONT_SCALE));
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

  /** Ground effects such as Ice Storm. */
  drawZones(time: number): void {
    this.zoneLayer.clear();
    for (const z of this.s.battle.zones) {
      // Tinted by school (Ice Storm: frost blue, Hallowed Ground: holy gold), with a pulsing edge.
      const c = SCHOOL_COLORS[schoolOf(z.ability)];
      const wave = Math.sin(time / 180);
      this.zoneLayer.fillStyle(c.main, 0.2 + wave * 0.04).fillCircle(z.x, z.y, z.radius);
      this.zoneLayer.fillStyle(c.light, 0.1).fillCircle(z.x, z.y, z.radius * (0.55 + wave * 0.08));
      this.zoneLayer.lineStyle(3, c.main, 0.65 + wave * 0.25).strokeCircle(z.x, z.y, z.radius);
      this.zoneLayer.lineStyle(1.5, c.light, 0.5).strokeCircle(z.x, z.y, z.radius * (0.82 + wave * 0.06));
      // A few drifting motes (snow, sparkles) so it reads as a spell, not a decal.
      const spin = time / 900;
      this.zoneLayer.fillStyle(c.light, 0.85);
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI * 2) / 6;
        const d = z.radius * (0.35 + 0.45 * (((time / 1400 + i * 0.37) % 1)));
        this.zoneLayer.fillCircle(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 2);
      }
    }
    // A boss's Rain of Fire: mark where it will land while it's being cast.
    for (const e of this.s.battle.enemies) {
      const c = e.casting;
      if (!e.alive || c?.kind !== 'rainOfFire' || c.x === undefined || c.y === undefined) continue;
      const pct = 1 - c.remaining / c.total;
      const r = BOSS_SPECIALS.rainOfFire.radius;
      this.zoneLayer.fillStyle(0xff5a1f, 0.12 + pct * 0.25).fillCircle(c.x, c.y, r);
      this.zoneLayer.lineStyle(3, 0xff8c1a, 0.9).strokeCircle(c.x, c.y, r);
      this.zoneLayer.fillStyle(0xff5a1f, 0.35).fillCircle(c.x, c.y, r * pct);
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
          // Mid-fight arrivals (only raised dead, now): the boss's own callout says it.
          if (u?.side === 'enemy' && !u.summoned && this.s.battle.time > 5 && this.s.battle.time - this.lastReinforcementCall > 4) {
            this.lastReinforcementCall = this.s.battle.time;
            this.s.showBanner('Reinforcements!', true);
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
            this.addNumber(e.to, e.amount, '#7dff9b', 11, 0.75, '+');
          } else {
            // Unnamed damage over time from a rogue is its poison.
            const src = e.from !== undefined ? this.s.battle.unit(e.from) : undefined;
            const school: School = !e.ability && src?.kind === 'rogue' ? 'nature' : schoolOf(e.ability, src?.kind);
            this.addNumber(e.to, e.amount, school === 'physical' ? '#ff9f1a' : SCHOOL_COLORS[school].css, 11, 0.8);
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
          if (u && smash) this.floatText(u.x, u.y - u.radius - 30, e.text, color, 22);
          else if (u) this.callout(u, e.text, color);
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
    const school = schoolOf(ability, shooter.kind);
    const sc = SCHOOL_COLORS[school];
    const color = big ? 0xff5a1f : (ability && PROJECTILE_COLORS[ability]) || (PROJECTILE_COLORS[shooter.kind] ?? sc.main);
    // 10-12px bolts (fireball bigger), with a light rim and a short fading trail.
    const bolt = this.s.add.circle(from.x, from.y, big ? 11 : ability ? 6 : 5, color).setDepth(30);
    bolt.setStrokeStyle(big ? 3 : 2, big ? 0xffd166 : school === 'physical' ? 0x222222 : sc.light, big ? 1 : 0.9);
    let lastTrail = 0;
    sound.play(big ? 'fire' : ability === 'iceLance' ? 'frost' : 'shoot');
    // The shooter: a small recoil and a flash at the hands (a spell also gets a cast flourish).
    const shooterView = this.views.get(fromId);
    if (shooterView) {
      const ddx = to.x - from.x;
      const ddy = to.y - from.y;
      const dl = Math.hypot(ddx, ddy) || 1;
      this.nudge(shooterView, (-ddx / dl) * 3, (-ddy / dl) * 3, 60);
      const flash = this.s.add.circle(from.x + (ddx / dl) * 12, from.y + (ddy / dl) * 12 - 6, big ? 9 : 6, sc.light, 0.9).setDepth(31);
      this.s.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 140, onComplete: () => flash.destroy() });
      if (ability) this.castPose(fromId, sc.main);
    }
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
        const now = this.s.time.now;
        if (now - lastTrail > 28) {
          lastTrail = now;
          this.trail(bolt.x, bolt.y, bolt.radius * 0.8, color);
        }
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
      if (lunger) {
        this.nudge(lunger, (dx / len) * 8, (dy / len) * 8, 75);
        this.swingPose(lunger, dx, 75);
      }
      // The swing: an arc sweeping across the target.
      const slash = this.s.add.graphics().setDepth(30);
      const w = ability === 'eviscerate' ? 6 : ability === 'heroicStrike' ? 5 : ability === 'sinisterStrike' ? 5 : 3;
      const c = ability === 'eviscerate' ? 0xe74c3c : ability === 'heroicStrike' ? 0xff7043 : ability === 'sinisterStrike' ? 0xffe066 : 0xffffff;
      const ang = Math.atan2(dy, dx);
      const reach = Math.min(len, 34) + 6;
      slash.lineStyle(w, c, 0.95).beginPath().arc(fx, fy, reach, ang - 0.9, ang + 0.9).strokePath();
      slash.lineStyle(Math.max(1, w - 2), 0xffffff, 0.7).beginPath().arc(fx, fy, reach - 3, ang - 0.6, ang + 0.6).strokePath();
      this.s.tweens.add({ targets: slash, alpha: 0, duration: ability ? 240 : 150, onComplete: () => slash.destroy() });
    }

    // Impact on the target: flash, knockback, sparks.
    if (toView && !toView.dead) {
      toView.flash.setAlpha(0.85);
      this.s.tweens.add({ targets: toView.flash, alpha: 0, duration: 130 });
      const hitSprite = toView.sprite;
      if (hitSprite) {
        // Spells flash the target in their school's light colour.
        hitSprite.setTintFill(ability ? SCHOOL_COLORS[schoolOf(ability, from?.kind)].light : 0xffffff);
        this.s.time.delayedCall(80, () => {
          if (!toView.dead) hitSprite.clearTint();
        });
      }
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const kb = heavy ? 7 : 3;
      this.nudge(toView, (dx / len) * kb, (dy / len) * kb, 60);
      const school = schoolOf(ability, from?.kind);
      if (ability || heavy) this.impact(tx, ty, school, heavy, to?.radius ?? 14);
      // The ground remembers: spatter behind heavy hits, scorch from fire, ice from frost.
      if (heavy && school === 'physical') this.remains.spatter(tx, ty, dx, dy, to?.side === 'enemy' ? (to.kind as EnemyKind) : undefined);
      if (ability && school === 'fire') this.remains.scorch(tx, ty, (to?.radius ?? 14) * (heavy ? 1.2 : 0.9));
      if (ability && school === 'frost') this.remains.frost(tx, ty, (to?.radius ?? 14) * 0.9);
      else this.spark(tx, ty, hitHero && school === 'physical' ? 0xff6b6b : SCHOOL_COLORS[school].light, 3, 16);
    }
    if (heavy) {
      this.s.cameras.main.shake(90, 0.004);
      this.hitStop = Math.max(this.hitStop, 0.05);
      sound.play('heavyHit');
    } else {
      sound.play('hit');
    }
  }

  /**
   * Merge rapid hits on the same target into one growing number. Separate numbers fan out
   * to alternating sides and start higher while older ones are still up, so they don't overlap.
   */
  addNumber(targetId: number, amount: number, color: string, size: number, alpha = 1, prefix = ''): void {
    const view = this.views.get(targetId);
    if (!view) return;
    const now = this.s.time.now;
    const key = `${targetId}${prefix}`;
    const existing = this.numbers.get(key);
    if (existing && existing.text.active && now - existing.at < 300) {
      existing.total += amount;
      existing.at = now;
      const current = parseInt(`${existing.text.style.fontSize}`, 10) / FONT_SCALE;
      existing.text.setText(`${prefix}${existing.total}`).setFontSize(Math.round(Math.min(size + 6, Math.max(current, size)) * FONT_SCALE));
      return;
    }
    const stack = (this.numberStacks.get(targetId) ?? []).filter((t) => t.active);
    if (stack.length >= 6) stack.shift()?.destroy();
    const side = this.numberSide.get(targetId) ?? 1;
    this.numberSide.set(targetId, -side);
    const x = view.container.x + side * (10 + Math.random() * 6);
    const y = view.container.y - 22 - Math.min(stack.length, 3) * 9;
    const t = this.s.text(x, y, `${prefix}${amount}`, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold').setAlpha(alpha);
    t.setStroke('#000000', 3);
    this.s.tweens.add({ targets: t, x: x + side * 6, y: y - 30, duration: 750, ease: 'Cubic.easeOut' });
    this.s.tweens.add({ targets: t, alpha: 0, delay: 450, duration: 300, onComplete: () => t.destroy() });
    stack.push(t);
    this.numberStacks.set(targetId, stack);
    this.numbers.set(key, { text: t, total: amount, at: now });
  }

  /** Reserve a particle slot; false when the budget is spent. */
  private takeParticle(): boolean {
    if (this.particles >= MAX_PARTICLES) return false;
    this.particles++;
    return true;
  }

  private freeParticle(o: Phaser.GameObjects.GameObject): void {
    this.particles--;
    o.destroy();
  }

  /** A few small particles flying out from a point. */
  spark(x: number, y: number, color: number, count: number, distance: number): void {
    for (let i = 0; i < count; i++) {
      if (!this.takeParticle()) return;
      const a = Math.random() * Math.PI * 2;
      const d = distance * (0.5 + Math.random() * 0.7);
      const p = this.s.add.circle(x, y, 2 + Math.random() * 2, color).setDepth(35);
      this.s.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 260 + Math.random() * 160, onComplete: () => this.freeParticle(p) });
    }
  }

  /** One fading dot behind a projectile. */
  trail(x: number, y: number, r: number, color: number): void {
    if (!this.takeParticle()) return;
    const p = this.s.add.circle(x, y, r, color, 0.6).setDepth(29);
    this.s.tweens.add({ targets: p, scale: 0.3, alpha: 0, duration: 160, onComplete: () => this.freeParticle(p) });
  }

  /** A spell landing: a quick expanding ring in the school's colour and a burst of its sparks. */
  impact(x: number, y: number, school: School, heavy = false, radius = 14): void {
    const c = SCHOOL_COLORS[school];
    const ring = this.s.add.circle(x, y, radius * 0.6).setStrokeStyle(heavy ? 5 : 4, c.main, 0.95).setDepth(34);
    this.s.tweens.add({ targets: ring, scale: heavy ? 2.6 : 2, alpha: 0, duration: heavy ? 220 : 170, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    const n = heavy ? 10 : 6;
    this.spark(x, y, c.main, Math.ceil(n / 2), heavy ? 28 : 20);
    this.spark(x, y, c.light, Math.floor(n / 2), heavy ? 22 : 16);
  }

  /** A soft coloured puff (Woolly Hex's poof). */
  puff(x: number, y: number, color: number, light: number): void {
    for (let i = 0; i < 8; i++) {
      if (!this.takeParticle()) return;
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const p = this.s.add.circle(x, y, 6 + Math.random() * 4, i % 2 ? color : light, 0.8).setDepth(35);
      this.s.tweens.add({ targets: p, x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 18 - 6, scale: 1.6, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => this.freeParticle(p) });
    }
  }

  /** The polymorphed enemy's sheep icon (made on first use). */
  sheepIcon(id: number, radius: number): Phaser.GameObjects.Image | undefined {
    const have = this.sheepIcons.get(id);
    if (have?.active) return have;
    const view = this.views.get(id);
    if (!view || !this.s.textures.exists('icon-ef-sheep')) return undefined;
    this.s.textures.get('icon-ef-sheep').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const img = this.s.add.image(0, 0, 'icon-ef-sheep').setScale((radius * 1.6) / ICON_PX);
    view.container.addAt(img, 3);
    this.sheepIcons.set(id, img);
    return img;
  }

  /** A unit's ability name, above its health bar; a new one replaces the last. */
  callout(unit: { id: number; x: number; y: number; radius: number }, str: string, color: string): void {
    this.callouts.get(unit.id)?.destroy();
    const view = this.views.get(unit.id);
    const top = view ? Math.min(-unit.radius - 40, view.top - 22) : -unit.radius - 40;
    const x0 = view?.container.x ?? unit.x;
    const y0 = view?.container.y ?? unit.y;
    const t = this.s.text(x0, y0 + top, str.replace(/!+$/, ''), 12, color).setOrigin(0.5).setDepth(41).setFontStyle('bold');
    t.setStroke('#000000', 3);
    this.callouts.set(unit.id, t);
    // Follows its unit while it drifts up and fades.
    this.s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 950,
      onUpdate: (tw) => {
        if (!t.active) return;
        const k = tw.getValue() ?? 0;
        const live = view && !view.dead && view.container.active;
        if (live) t.setPosition(view.container.x, view.container.y + top - 12 * k);
        t.setAlpha(1 - k * k);
      },
      onComplete: () => {
        if (this.callouts.get(unit.id) === t) this.callouts.delete(unit.id);
        t.destroy();
      },
    });
  }

  /** An expanding ring (novas, shields, buffs). */
  ring(x: number, y: number, radius: number, width: number, color: number, scale: number, duration: number): void {
    const ring = this.s.add.circle(x, y, radius).setStrokeStyle(width, color).setDepth(30);
    this.s.tweens.add({ targets: ring, scale, alpha: 0, duration, onComplete: () => ring.destroy() });
  }

  /** A quick fading line from caster to target. */
  beam(from: { x: number; y: number }, to: { x: number; y: number }, width: number, color: number, duration = 350): void {
    const line = this.s.add.graphics().setDepth(30);
    line.lineStyle(width + 4, color, 0.25).lineBetween(from.x, from.y, to.x, to.y);
    line.lineStyle(width, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
    this.s.tweens.add({ targets: line, alpha: 0, duration, onComplete: () => line.destroy() });
  }

  showAbility(fromId: number, ability: AbilityId, toId?: number): void {
    const from = this.s.battle.unit(fromId);
    if (!from) return;
    const to = toId !== undefined ? this.s.battle.unit(toId) : undefined;
    const name = ABILITIES[ability].name;
    const c = SCHOOL_COLORS[schoolOf(ability)];
    this.castPose(fromId, c.main);
    switch (ability) {
      case 'taunt':
        return; // the taunt event draws it
      case 'thunderclap': {
        this.ring(from.x, from.y, from.radius, 6, 0xd4a24c, ABILITY_TUNING.thunderclap.radius / from.radius, 380);
        this.callout(from, name, '#f5c26b');
        return;
      }
      case 'whirlwind': {
        this.ring(from.x, from.y, from.radius, 6, 0xffffff, ABILITY_TUNING.whirlwind.radius / from.radius, 300);
        this.callout(from, name, '#ffffff');
        return;
      }
      case 'shieldBlock':
      case 'evasion':
      case 'powerShield': {
        const target = to ?? from;
        const color = ability === 'evasion' ? 0xf1c40f : ability === 'powerShield' ? c.light : 0xd4a24c;
        this.ring(target.x, target.y, target.radius + 6, 4, color, 1.4, 500);
        this.callout(target, name, '#ffffff');
        return;
      }
      case 'holyNova':
      case 'frostNova':
      case 'fanOfKnives':
      case 'rallyingShout': {
        const color = ability === 'rallyingShout' ? 0xff9f43 : ability === 'fanOfKnives' ? 0xc8d6e5 : c.main;
        const radius = ability === 'holyNova' ? 140 : ability === 'frostNova' ? 110 : ability === 'rallyingShout' ? 60 : 100;
        this.ring(from.x, from.y, from.radius, 6, color, radius / from.radius, 380);
        if (ability === 'holyNova' || ability === 'frostNova') {
          // A soft inner wash behind the ring.
          const wash = this.s.add.circle(from.x, from.y, from.radius, c.light, 0.35).setDepth(29);
          this.s.tweens.add({ targets: wash, scale: (radius * 0.8) / from.radius, alpha: 0, duration: 420, onComplete: () => wash.destroy() });
        }
        if (ability === 'rallyingShout') {
          for (const ally of this.s.battle.heroes) {
            if (ally.alive) this.ring(ally.x, ally.y, ally.radius + 4, 4, color, 1.6, 600);
          }
        }
        this.callout(from, name, ability === 'frostNova' ? c.css : ability === 'holyNova' ? c.css : '#ffffff');
        return;
      }
      case 'chainOfLight':
        this.callout(from, name, c.css);
        return;
      case 'lastStand':
        this.callout(from, name, '#7dff9b');
        return;
      case 'guardianSpirit':
      case 'shieldBash':
      case 'gouge':
      case 'hammerOfJustice':
      case 'doom':
      case 'curseOfRuin':
      case 'exorcism':
        if (to) {
          const color = ability === 'shieldBash' || ability === 'gouge' ? 0xfff27a : c.main;
          this.beam(from, to, 3, color);
          this.ring(to.x, to.y, to.radius + 5, 4, color, 1.5, 450);
          if (ability !== 'guardianSpirit') this.impact(to.x, to.y, schoolOf(ability), false, to.radius);
        }
        this.callout(from, name, ability === 'shieldBash' || ability === 'gouge' ? '#ffd166' : c.css);
        return;
      case 'arcaneBarrage':
        return; // the missiles say it
      case 'blizzard':
        this.callout(from, name, c.css);
        return;
      case 'fortitude':
        for (const ally of this.s.battle.heroes) {
          if (ally.alive) this.ring(ally.x, ally.y, ally.radius + 4, 4, c.light, 1.7, 700);
        }
        this.callout(from, name, c.css);
        return;
      case 'renew':
      case 'heal':
        if (to) {
          this.ring(to.x, to.y, to.radius + 6, 4, c.main, 1.5, 600);
          this.spark(to.x, to.y, c.light, 6, 20);
          this.callout(from, name, c.css);
        }
        return;
      case 'judgement':
      case 'soulDrain':
      case 'enfeeble':
        if (to) {
          this.beam(from, to, ability === 'judgement' ? 5 : 3, c.main);
          this.ring(to.x, to.y, to.radius + 4, 4, c.main, 1.5, 450);
          if (ability === 'soulDrain') this.spark(from.x, from.y, c.light, 4, 14);
        }
        this.callout(from, name, c.css);
        return;
      case 'wither':
        return; // cast every few seconds: the purple debuff icon is enough
      case 'hallowedGround':
        this.callout(from, name, c.css);
        return;
      case 'radiantLight':
      case 'mercy':
        if (to) {
          this.ring(to.x, to.y, to.radius + 6, ability === 'mercy' ? 6 : 4, c.main, 1.6, 650);
          this.spark(to.x, to.y, c.light, 6, 20);
        }
        this.callout(from, name, c.css);
        return;
      case 'polymorph':
      case 'kick':
      case 'counterspell':
        if (to) {
          const color = ability === 'kick' ? 0xffe066 : c.main;
          this.beam(from, to, 3, color, 400);
          if (ability === 'polymorph') this.puff(to.x, to.y, c.main, c.light);
          else this.ring(to.x, to.y, to.radius + 6, 4, color, 1.6, 500);
        }
        this.callout(from, name, ability === 'kick' ? '#ffd166' : c.css);
        return;
      default:
        this.callout(from, name, ability === 'fireball' || ability === 'iceLance' || ability === 'hexBolt' ? c.css : '#ffd166');
    }
  }

  showHeal(fromId: number, toId: number, amount: number): void {
    const from = this.s.battle.unit(fromId);
    const to = this.s.battle.unit(toId);
    if (!from || !to) return;
    // Holy gold from priests and paladins; a warlock's drain stays shadow.
    const school = from.kind === 'warlock' ? 'shadow' : 'holy';
    const c = SCHOOL_COLORS[school];
    if (from !== to) this.beam(from, to, 3, c.main, 300);
    this.ring(to.x, to.y, to.radius + 4, 3, c.main, 1.4, 400);
    this.addNumber(to.id, amount, '#7dff9b', 15, 1, '+');
  }

  showTaunt(fromId: number, toId: number): void {
    const from = this.s.battle.unit(fromId);
    const to = this.s.battle.unit(toId);
    if (!from || !to) return;
    this.beam(from, to, 4, 0xff9f1a, 450);
    this.ring(to.x, to.y, to.radius + 5, 3, 0xff9f1a, 1.6, 500);
    this.callout(from, 'Taunt', '#ff9f1a');
  }

  showDeath(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.dead = true;
    v.hpBar.clear();
    this.sheepIcons.delete(id);
    v.aggroIcon?.container.setVisible(false);
    this.spark(v.container.x, v.container.y, v.side === 'hero' ? 0xff6b6b : 0x9fdc5a, 12, 34);
    if (v.side === 'hero') {
      sound.play('heroDown');
      this.s.cameras.main.shake(160, 0.006);
    } else {
      sound.play('death');
    }
    const x = v.container.x;
    const y = v.container.y;
    const radius = v.radius;
    if (v.side === 'hero') {
      // A downed hero falls over where they stood.
      v.body.setFillStyle(0x444444);
      v.sprite?.setTint(0x777777);
      v.container.setAlpha(0.7);
      this.remains.hero(x, y, radius);
      if (v.sprite) {
        v.busyUntil = Number.POSITIVE_INFINITY;
        this.s.tweens.add({ targets: v.sprite, rotation: (v.sprite.flipX ? -1 : 1) * Math.PI / 2, y: `+=6`, duration: 320, ease: 'Bounce.easeOut' });
      }
    } else {
      // An enemy collapses and leaves its remains: blood and bones, a bone heap, ichor or ash.
      this.remains.enemy(v.kind as EnemyKind, x, y, radius, v.boss);
      this.s.tweens.add({
        targets: v.container,
        alpha: 0,
        scaleY: 0.2,
        scaleX: 1.15,
        y: y + radius * 0.5,
        duration: 260,
        ease: 'Quad.easeIn',
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
