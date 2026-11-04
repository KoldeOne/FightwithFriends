import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { CLASS_POOL, ENEMY_STATS, HERO_KIT, WORLD } from '../../sim/content';
import { actDef } from '../../sim/acts';
import { describeProgress } from '../../sim/run';
import { lockedPool, PERK_IDS, PERKS, TIERS, type Grave } from '../../sim/progress';
import { sound } from '../sound';
import { ALL_CLASSES } from '../../sim/run';
import { buyPerk, canAfford, costText, gearCost, GEAR_SLOTS, resetUpgrades, loadCamp, LOOT_NAMES, saveCamp, STATIONS, upgradeGear, type CampState, type GearSlot } from '../../sim/camp';
import type { HeroClass, Loot } from '../../sim/types';
import { COLORS, cssColor, spriteKey, spriteOriginY } from '../theme';
import { PixelButton } from '../button';

const name = (cls: HeroClass) => cls[0].toUpperCase() + cls.slice(1);

/** The hero cards at the top (3 x 2), then the campground below them. */
const CARDS = { top: 126, w: 168, h: 76, gap: 6 };
const GROUND = { top: 292, bottom: 826 };
const FIRE = { x: WORLD.width / 2, y: 562 };
/** Where heroes wander: the clearing around the fire. */
const WALK = { left: 70, right: WORLD.width - 70, top: 492, bottom: 636 };
/** The trophy wall (top of the path) and the graveyard (bottom of it). */
const WALL = { x: WORLD.width / 2, y: 352 };
const YARD = { x: WORLD.width / 2, y: 752 };
const BOSSES = [1, 2, 3].map((a) => actDef(a).boss);
const LOOT_KINDS: (keyof Loot)[] = ['spoils', 'ore', 'hide', 'gems', 'trophies'];

/** Where each kind of loot comes from, and what it buys. */
const LOOT_INFO: Record<keyof Loot, string> = {
  spoils: 'Dropped by every enemy (more in later acts). Pays for every gear level and perk.',
  ore: 'A chance from any enemy; elites and bosses always drop some. For weapons.',
  hide: 'A chance from any enemy; elites and bosses always drop some. For armor.',
  gems: 'A chance from any enemy; elites and bosses always drop some. For trinkets.',
  trophies: 'One from every boss. Every 5th gear level needs one, and so do Training Ground perks.',
};

type Building = GearSlot | 'perks';

/** The structures around the camp. The gear buildings are scenery (upgrades are bought from a hero's card); the Training Ground sells perks. */
const BUILDINGS: { id: Building; x: number; y: number; title: string; tip: string }[] = [
  { id: 'weapon', x: 112, y: 388, title: 'Blacksmith', tip: 'The Blacksmith forges weapons. Tap a hero above to upgrade theirs.' },
  { id: 'armor', x: WORLD.width - 112, y: 388, title: 'Armorer', tip: 'The Armorer fits armor. Tap a hero above to upgrade theirs.' },
  { id: 'trinket', x: 112, y: 722, title: 'Jeweler', tip: 'The Jeweler cuts trinkets. Tap a hero above to upgrade theirs.' },
  { id: 'perks', x: WORLD.width - 112, y: 722, title: 'Training Ground', tip: '' },
];

/**
 * The camp, between map runs. At the top, the loot you've brought home and a
 * card per hero (their gear at a glance; a gold ! when something is
 * affordable). Tap a hero, on their card or walking around the fire, to open
 * their gear: weapon, armor and trinket, each with what the next level does,
 * what it costs and an Upgrade button. Below is the campground: the
 * Blacksmith, Armorer and Jeweler are scenery that lights up when you buy
 * their gear; the Training Ground sells guild perks; the Trophy Wall and the
 * Graveyard keep your records.
 */
export class CampScreen {
  constructor(readonly s: BattleScene) {}

  camp: CampState = loadCamp();

  private lootTexts = new Map<keyof Loot, Phaser.GameObjects.Text>();
  private cards = new Map<HeroClass, { bg: Phaser.GameObjects.Rectangle; pips: Phaser.GameObjects.Text[]; badge: Phaser.GameObjects.Container }>();
  private buildingArt = new Map<Building, Phaser.GameObjects.Graphics>();
  private perkBadge?: Phaser.GameObjects.Container;
  private walkers = new Map<HeroClass, Phaser.GameObjects.Container>();
  private root?: Phaser.GameObjects.Container;
  private heroPanel?: Phaser.GameObjects.Container;

  show(): void {
    const s = this.s;
    s.state = 'camp';
    s.overlay?.destroy();
    this.camp = loadCamp();
    this.lootTexts.clear();
    this.cards.clear();
    this.buildingArt.clear();
    this.walkers.clear();
    ensureIcons(s);
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14).setOrigin(0, 0).setInteractive()];
    items.push(s.text(cx, 48, 'The Camp', 24, '#ffd166').setOrigin(0.5, 0).setFontStyle('bold'));
    items.push(
      s.text(14, 54, '◀ Back', 13, '#ffffff')
        .setPadding(8, 4, 8, 4)
        .setBackgroundColor('#2b3445')
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sound.play('click');
          s.scene.restart({});
        }),
    );
    items.push(...this.lootBar(84));
    items.push(s.text(cx, 108, 'Loot from your runs comes home here. Tap a hero to upgrade their gear.', 11, '#8f9bb3').setOrigin(0.5, 0));

    // Hero cards: portrait, name, gear levels; tap to open their gear.
    ALL_CLASSES.forEach((cls, i) => {
      const x = 12 + (i % 3) * (CARDS.w + CARDS.gap);
      const y = CARDS.top + Math.floor(i / 3) * (CARDS.h + CARDS.gap);
      const bg = s.add
        .rectangle(x, y, CARDS.w, CARDS.h, 0x161c28)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x222b3d))
        .on('pointerout', () => bg.setFillStyle(0x161c28))
        .on('pointerdown', () => this.openHero(cls));
      const title = s.text(x + 50, y + 8, name(cls), 15, cssColor(COLORS[cls])).setFontStyle('bold');
      const pips: Phaser.GameObjects.Text[] = [];
      const pipItems: Phaser.GameObjects.GameObject[] = [];
      GEAR_SLOTS.forEach((slot, k) => {
        const px = x + 50 + k * 38;
        pipItems.push(s.add.image(px + 7, y + 44, `camp-gear-${slot}`).setScale(0.5));
        const t = s.text(px + 17, y + 36, '0', 13, '#e6e9f0');
        pips.push(t);
        pipItems.push(t);
      });
      const badge = this.badge(x + CARDS.w - 10, y + 10);
      this.cards.set(cls, { bg, pips, badge });
      items.push(bg, ...s.heroPicker.portrait(cls, x + 24, y + 64, 1.35), title, ...pipItems, s.text(x + 50, y + 58, 'Tap to upgrade', 10, '#6f7a90'), badge);
    });

    items.push(...this.drawGround());
    items.push(...this.drawMilestones());
    for (const b of BUILDINGS) items.push(...this.drawBuilding(b));
    items.push(...this.drawTrophyWall(), ...this.drawGraveyard());
    for (const cls of ALL_CLASSES) items.push(this.makeWalker(cls));
    items.push(...this.drawLights());

    // Bottom: New run, and a small menu (the testing reset lives there).
    items.push(
      s.button(cx, WORLD.height - 62, 'New run ▶', 22, '#2e86de', () => {
        sound.unlock();
        sound.play('click');
        s.scene.restart({});
      }),
      s.button(WORLD.width - 40, WORLD.height - 62, '⚙', 18, '#3a4660', () => this.showMenu()),
    );
    this.root = s.add.container(0, 0, items).setDepth(100);
    s.overlay = this.root;
    this.refresh();
  }

  /** Update every number on the screen (after a purchase). */
  private refresh(): void {
    const camp = this.camp;
    for (const [k, t] of this.lootTexts) t.setText(String(camp.loot[k]));
    for (const [cls, c] of this.cards) {
      GEAR_SLOTS.forEach((slot, k) => c.pips[k].setText(String(camp.gear[cls][slot])).setColor(camp.gear[cls][slot] ? '#ffffff' : '#6f7a90'));
      c.badge.setVisible(this.canUpgrade(cls));
    }
    this.perkBadge?.setVisible(PERK_IDS.some((id) => !camp.records.perks.includes(id) && canAfford(camp.loot, PERKS[id].cost)));
    if (this.heroPanel && this.heroFor) this.openHero(this.heroFor, true);
  }

  private canUpgrade(cls: HeroClass): boolean {
    return GEAR_SLOTS.some((slot) => {
      const cost = gearCost(slot, this.camp.gear[cls][slot]);
      return !!cost && canAfford(this.camp.loot, cost);
    });
  }

  /** A gold "!" badge: something here is affordable. */
  private badge(x: number, y: number): Phaser.GameObjects.Container {
    const s = this.s;
    const c = s.add.container(x, y, [s.add.circle(0, 0, 9, 0xffd166).setStrokeStyle(2, 0x5a3a10), s.text(0, 0, '!', 14, '#3a2208').setOrigin(0.5).setFontStyle('bold')]);
    s.tweens.add({ targets: c, scale: 1.15, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c.setVisible(false);
  }

  /** The loot you've brought home: an icon and a count each; tap for where it comes from. */
  private lootBar(y: number): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const out: Phaser.GameObjects.GameObject[] = [];
    const w = 92;
    const left = WORLD.width / 2 - (LOOT_KINDS.length * w) / 2;
    LOOT_KINDS.forEach((k, i) => {
      const x = left + i * w;
      const bg = s.add.rectangle(x + 3, y - 2, w - 6, 22, 0x161c28).setOrigin(0, 0).setStrokeStyle(1, 0x2b3445).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        sound.play('click');
        this.showLootInfo();
      });
      const t = s.text(x + 30, y, '0', 13, '#ffffff').setFontStyle('bold');
      this.lootTexts.set(k, t);
      out.push(bg, s.add.image(x + 17, y + 9, `camp-loot-${k}`).setScale(0.5), t, s.text(x + w - 8, y + 3, LOOT_NAMES[k], 10, '#8f9bb3').setOrigin(1, 0));
    });
    return out;
  }

  private showLootInfo(): void {
    this.openPanel(
      'Camp loot',
      'Everything your fights drop comes home, win or lose.',
      LOOT_KINDS.map((k) => ({ title: `${LOOT_NAMES[k]}: ${this.camp.loot[k]}`, text: LOOT_INFO[k], icon: `camp-loot-${k}` })),
    );
  }

  // --- the hero's gear ------------------------------------------------------------

  private heroFor?: HeroClass;

  /** A hero's gear: weapon, armor and trinket, each with its next level, cost and an Upgrade button. */
  private openHero(cls: HeroClass, keep = false): void {
    const s = this.s;
    if (!keep) sound.play('click');
    this.heroPanel?.destroy();
    this.heroFor = cls;
    const camp = this.camp;
    const cx = WORLD.width / 2;
    const top = 150;
    const h = 560;
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.6).setOrigin(0, 0).setInteractive().on('pointerdown', () => this.closeHero()),
      s.add.rectangle(20, top, WORLD.width - 40, h, 0x0f141e, 0.98).setOrigin(0, 0).setStrokeStyle(2, COLORS[cls]).setInteractive(),
      ...s.heroPicker.portrait(cls, cx, top + 70, 2.4),
      s.text(cx, top + 78, name(cls), 22, cssColor(COLORS[cls])).setOrigin(0.5, 0).setFontStyle('bold'),
      s.text(cx, top + 104, `${HERO_KIT[cls].role}. Gear goes with every ${name(cls)} on every run.`, 11, '#c9d1e0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(440),
    ];
    // Step through the heroes without closing.
    const step = (d: number) => {
      const i = ALL_CLASSES.indexOf(cls);
      this.openHero(ALL_CLASSES[(i + d + ALL_CLASSES.length) % ALL_CLASSES.length]);
    };
    items.push(s.button(56, top + 50, '◀', 18, '#2b3445', () => step(-1)), s.button(WORLD.width - 56, top + 50, '▶', 18, '#2b3445', () => step(1)));
    GEAR_SLOTS.forEach((slot, k) => {
      const y = top + 136 + k * 126;
      const lv = camp.gear[cls][slot];
      const cost = gearCost(slot, lv);
      const st = STATIONS[slot];
      const afford = !!cost && canAfford(camp.loot, cost);
      items.push(
        s.add.rectangle(36, y, WORLD.width - 72, 116, 0x161c28).setOrigin(0, 0).setStrokeStyle(1, afford ? 0x6a8a4a : 0x2b3445),
        s.add.image(62, y + 30, `camp-gear-${slot}`).setScale(0.9),
        s.text(90, y + 10, `${st.item}  ·  Lv ${lv} of 10`, 15, '#ffffff').setFontStyle('bold'),
        s.text(WORLD.width - 48, y + 13, `from the ${st.station}`, 10, '#6f7a90').setOrigin(1, 0),
        s.text(90, y + 32, lv ? `Now: ${st.effect(lv)}` : 'Now: nothing yet', 12, '#c9d1e0').setWordWrapWidth(380),
        s.text(90, y + 50, cost ? `Next: ${st.effect(lv + 1)}` : 'Fully upgraded', 12, cost ? '#ffd166' : '#7dff9b').setWordWrapWidth(380),
      );
      if (!cost) return;
      // The cost, one chip per kind of loot (red where you're short).
      let x = 90;
      for (const k of LOOT_KINDS) {
        const need = cost[k] ?? 0;
        if (!need) continue;
        const short = camp.loot[k] < need;
        items.push(s.add.image(x + 8, y + 88, `camp-loot-${k}`).setScale(0.5), s.text(x + 18, y + 80, String(need), 13, short ? '#ff8a8a' : '#e6e9f0').setFontStyle('bold'));
        x += 50;
      }
      const missing = LOOT_KINDS.filter((kk) => camp.loot[kk] < (cost[kk] ?? 0)).map((kk) => `${(cost[kk] ?? 0) - camp.loot[kk]} ${LOOT_NAMES[kk]}`);
      const btn = new PixelButton(s, WORLD.width - 104, y + 88, afford ? 'Upgrade' : `Need ${missing[0]}`, afford ? 15 : 11, afford ? '#2e8a4e' : '#3a4050', () => {
        if (!afford) {
          sound.play('click');
          return;
        }
        this.buy(cls, slot);
      });
      items.push(btn);
    });
    items.push(s.button(cx, top + h - 26, 'Close', 16, '#2b3445', () => this.closeHero()));
    this.heroPanel = s.add.container(0, 0, items).setDepth(140);
  }

  private closeHero(): void {
    sound.play('click');
    this.heroPanel?.destroy();
    this.heroPanel = undefined;
    this.heroFor = undefined;
  }

  /** Buy the next level of a hero's gear; its building lights up. */
  private buy(cls: HeroClass, slot: GearSlot): void {
    if (!upgradeGear(this.camp, cls, slot)) return;
    sound.play('levelUp');
    saveCamp(this.camp);
    this.s.cameras.main.flash(120, 255, 230, 160);
    const b = BUILDINGS.find((x) => x.id === slot)!;
    this.sparks(b.x, b.y - 10);
    this.float(WORLD.width / 2, 140, `${name(cls)}'s ${STATIONS[slot].item.toLowerCase()} +1!`, '#7dff9b');
    this.refresh();
  }

  /** A shower of sparks over a building (when its gear is bought). */
  private sparks(x: number, y: number): void {
    for (let i = 0; i < 14; i++) {
      const p = this.s.add.circle(x, y, 2, i % 2 ? 0xffd166 : 0xff8c1a).setDepth(130);
      const a = Math.random() * Math.PI * 2;
      this.s.tweens.add({ targets: p, x: x + Math.cos(a) * (20 + Math.random() * 30), y: y + Math.sin(a) * 20 - 20, alpha: 0, duration: 600 + Math.random() * 300, onComplete: () => p.destroy() });
    }
  }

  /** The ⚙ menu: testing aids. */
  private showMenu(): void {
    sound.play('click');
    this.openPanel('Camp menu', 'Testing aids.', [
      {
        title: '↺ Reset upgrades',
        text: 'Give back everything spent on gear and perks (for testing).',
        onTap: () => {
          this.reset();
          this.closePanel();
        },
      },
    ]);
  }

  /** Testing aid: give back everything spent at the camp. */
  private reset(): void {
    sound.play('click');
    const refund = resetUpgrades(this.camp);
    saveCamp(this.camp);
    this.float(WORLD.width / 2, GROUND.top + 30, refund.spoils ? `Refunded ${refund.spoils} Spoils and materials` : 'Nothing to refund', '#ffd166');
    this.refresh();
  }

  private float(x: number, y: number, text: string, color: string): void {
    const t = this.s.text(x, y, text, 15, color).setOrigin(0.5).setFontStyle('bold').setDepth(150).setAlign('center').setWordWrapWidth(480);
    t.setStroke('#000000', 4);
    this.s.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  // --- drawing -------------------------------------------------------------------

  /** Evening in the woods: patchy grass, a worn clearing and paths, layered trees, tents and the fire. */
  private drawGround(): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const g = s.add.graphics();
    const { top, bottom } = GROUND;
    g.fillStyle(0x23402a).fillRoundedRect(10, top, WORLD.width - 20, bottom - top, 14);
    const rng = new Phaser.Math.RandomDataGenerator(['camp']);
    for (let i = 0; i < 60; i++) g.fillStyle(rng.frac() < 0.5 ? 0x2a4a2f : 0x1d3824, 0.7).fillEllipse(rng.between(20, WORLD.width - 20), rng.between(top + 10, bottom - 10), rng.between(40, 110), rng.between(18, 46));
    for (let i = 0; i < 110; i++) {
      const x = rng.between(16, WORLD.width - 16);
      const y = rng.between(top + 6, bottom - 6);
      g.fillStyle(0x3f6e3a).fillRect(x, y, 2, 4).fillRect(x + 3, y + 1, 2, 3);
    }
    // Paths from the trophy wall to the graveyard, and the clearing.
    for (let y = top + 20; y < bottom - 10; y += 6) {
      const x = FIRE.x + Math.sin(y / 40) * 6;
      g.fillStyle(0x5e4a30, 0.55).fillEllipse(x, y, 40, 10);
    }
    g.fillStyle(0x5e4a30, 0.9).fillEllipse(FIRE.x, FIRE.y, 440, 196);
    g.fillStyle(0x6e5636, 0.9).fillEllipse(FIRE.x, FIRE.y, 392, 158);
    for (let i = 0; i < 40; i++) g.fillStyle(0x4f3e28, 0.6).fillCircle(FIRE.x + rng.between(-180, 180), FIRE.y + rng.between(-66, 66), rng.between(1, 2));
    // Trees around the edge, back row darker; each with a shadow.
    const tree = (x: number, y: number, r: number, dark: boolean) => {
      g.fillStyle(0x000000, 0.25).fillEllipse(x + 3, y + r * 0.9, r * 2, r * 0.6);
      g.fillStyle(0x3a2616).fillRect(x - 3, y + r * 0.2, 6, r * 0.7);
      g.fillStyle(dark ? 0x173520 : 0x1f4628).fillCircle(x, y - r * 0.1, r);
      g.fillStyle(dark ? 0x1f4628 : 0x2a5e34).fillCircle(x - r * 0.3, y - r * 0.4, r * 0.62);
      g.fillStyle(0x3a7a44, 0.6).fillCircle(x - r * 0.45, y - r * 0.6, r * 0.25);
    };
    for (let x = 22; x < WORLD.width; x += 40) {
      if (Math.abs(x - FIRE.x) < 34) continue;
      tree(x, top + 10, 17, true);
      tree(x + 20, bottom - 8, 17, true);
    }
    for (const y of [460, 520, 610, 660]) {
      tree(24, y, 15, false);
      tree(WORLD.width - 24, y + 10, 15, false);
    }
    // Two tents by the fire.
    const tent = (x: number, y: number, color: number, shade: number) => {
      g.fillStyle(0x000000, 0.3).fillEllipse(x + 4, y + 18, 60, 10);
      g.fillStyle(color).fillTriangle(x - 27, y + 18, x + 27, y + 18, x, y - 22);
      g.fillStyle(shade).fillTriangle(x, y + 18, x + 27, y + 18, x, y - 22);
      g.fillStyle(0x120c08, 0.8).fillTriangle(x - 7, y + 18, x + 7, y + 18, x, y);
      g.lineStyle(2, 0x3a2a1a).lineBetween(x, y - 22, x, y - 30);
    };
    tent(FIRE.x - 122, FIRE.y - 66, 0x3f6fb0, 0x335a90);
    tent(FIRE.x + 122, FIRE.y - 66, 0xb0863f, 0x8f6c32);
    // Logs to sit on, and the fire ring.
    g.fillStyle(0x4a2f1c).fillRoundedRect(FIRE.x - 50, FIRE.y + 24, 32, 10, 4).fillRoundedRect(FIRE.x + 18, FIRE.y + 24, 32, 10, 4).fillRoundedRect(FIRE.x - 16, FIRE.y - 38, 32, 10, 4);
    g.fillStyle(0x6b4a2a).fillCircle(FIRE.x - 50, FIRE.y + 29, 5).fillCircle(FIRE.x + 50, FIRE.y + 29, 5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.fillStyle(i % 2 ? 0x6b6b6b : 0x585858).fillCircle(FIRE.x + Math.cos(a) * 16, FIRE.y + 8 + Math.sin(a) * 8, 5);
    }
    g.fillStyle(0x2a1a10).fillEllipse(FIRE.x, FIRE.y + 8, 22, 10);
    // The fire flickers.
    const outer = s.add.triangle(FIRE.x, FIRE.y - 6, 0, 26, 14, -10, 28, 26, 0xff6a1a);
    const mid = s.add.triangle(FIRE.x, FIRE.y - 3, 0, 20, 10, -6, 20, 20, 0xff9c2a);
    const inner = s.add.triangle(FIRE.x, FIRE.y, 0, 14, 7, -4, 14, 14, 0xffe066);
    s.tweens.add({ targets: [outer, inner], scaleY: 1.25, scaleX: 0.9, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: mid, scaleY: 1.15, scaleX: 1.05, duration: 340, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Sparks rising off the fire.
    s.time.addEvent({
      delay: 220,
      loop: true,
      callback: () => {
        if (!this.root?.active) return;
        const p = s.add.circle(FIRE.x + (Math.random() - 0.5) * 12, FIRE.y - 8, 1.3, 0xffd166).setDepth(101);
        s.tweens.add({ targets: p, y: FIRE.y - 50 - Math.random() * 30, x: p.x + (Math.random() - 0.5) * 20, alpha: 0, duration: 900, onComplete: () => p.destroy() });
      },
    });
    return [g, outer, mid, inner];
  }

  /** Warm firelight, a string of lanterns over the clearing, fireflies, and dark edges. */
  private drawLights(): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const out: Phaser.GameObjects.GameObject[] = [];
    const vig = canvasTexture(s, 'camp-vignette', WORLD.width - 20, GROUND.bottom - GROUND.top, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.6);
      grad.addColorStop(0, 'rgba(5,10,20,0)');
      grad.addColorStop(1, 'rgba(5,10,20,0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
    out.push(s.add.image(10, GROUND.top, vig).setOrigin(0, 0));
    const glowKey = canvasTexture(s, 'camp-firelight', 360, 240, (ctx, w, h) => {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,190,100,0.55)');
      grad.addColorStop(0.5, 'rgba(255,150,60,0.18)');
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
    const glow = s.add.image(FIRE.x, FIRE.y, glowKey).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: glow, alpha: 0.75, scale: 0.96, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    out.push(glow);
    // A string of lanterns between two poles over the clearing.
    const g = s.add.graphics();
    const a = { x: 88, y: 468 };
    const b = { x: WORLD.width - 88, y: 468 };
    g.fillStyle(0x3a2616).fillRect(a.x - 2, a.y, 4, 46).fillRect(b.x - 2, b.y, 4, 46);
    const sag = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + Math.sin(t * Math.PI) * 26 });
    g.lineStyle(1, 0x2a1a10, 0.9);
    for (let i = 1; i <= 20; i++) {
      const p = sag((i - 1) / 20);
      const q = sag(i / 20);
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
    out.push(g);
    for (let i = 1; i < 10; i++) {
      const p = sag(i / 10);
      const c = [0xffd166, 0xff8c6a, 0x9ad1ff][i % 3];
      const halo = s.add.circle(p.x, p.y + 4, 7, c, 0.22).setBlendMode(Phaser.BlendModes.ADD);
      s.tweens.add({ targets: halo, alpha: 0.1, duration: 700 + i * 90, yoyo: true, repeat: -1 });
      out.push(halo, s.add.circle(p.x, p.y + 4, 2.5, c));
    }
    // Fireflies drifting over the grass.
    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(30, WORLD.width - 30);
      const y = Phaser.Math.Between(GROUND.top + 30, GROUND.bottom - 30);
      const f = s.add.circle(x, y, 1.6, 0xd8ff8a, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      s.tweens.add({ targets: f, x: x + Phaser.Math.Between(-40, 40), y: y + Phaser.Math.Between(-30, 30), alpha: 0.1, duration: Phaser.Math.Between(1800, 3200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      out.push(f);
    }
    return out;
  }

  /** A wooden plaque with a name (for buildings and records). */
  private plaque(x: number, y: number, title: string, sub?: string): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const t = s.text(x, y + 4, title, 13, '#f3e3c3').setOrigin(0.5, 0).setFontStyle('bold');
    const w = Math.max(t.width, 60) + 18;
    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(x - w / 2 + 2, y + 2, w, 22, 5);
    bg.fillStyle(0x5a3e24).fillRoundedRect(x - w / 2, y, w, 22, 5);
    bg.lineStyle(1, 0x2a1a10).strokeRoundedRect(x - w / 2, y, w, 22, 5);
    bg.fillStyle(0xc9a15a).fillCircle(x - w / 2 + 5, y + 11, 1.5).fillCircle(x + w / 2 - 5, y + 11, 1.5);
    const out: Phaser.GameObjects.GameObject[] = [bg, t];
    if (sub) {
      const l = s.text(x, y + 25, sub, 10, '#e6e9f0').setOrigin(0.5, 0);
      l.setStroke('#000000', 3);
      out.push(l);
    }
    return out;
  }

  /** One structure in simple shapes, with a name plaque. The gear buildings are scenery (a tip on tap); the Training Ground opens its perks. */
  private drawBuilding(b: (typeof BUILDINGS)[number]): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const { x, y } = b;
    const g = s.add.graphics();
    this.buildingArt.set(b.id, g);
    const out: Phaser.GameObjects.GameObject[] = [g];
    g.fillStyle(0x000000, 0.3).fillEllipse(x + 4, y + 36, 118, 18);
    if (b.id === 'weapon') {
      // A stone forge with a chimney, glowing coals and an anvil.
      g.fillStyle(0x4a2f1c).fillTriangle(x - 52, y - 14, x + 52, y - 14, x, y - 50);
      g.fillStyle(0x3a2414).fillTriangle(x, y - 14, x + 52, y - 14, x, y - 50);
      g.fillStyle(0x7d7d84).fillRect(x - 44, y - 14, 88, 50);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) g.fillStyle((r + c) % 2 ? 0x6f6f76 : 0x86868d).fillRect(x - 44 + c * 18 + (r % 2) * 9, y - 12 + r * 12, 16, 10);
      g.fillStyle(0x5f5f66).fillRect(x + 22, y - 62, 14, 30);
      g.fillStyle(0x1a1a1a).fillRect(x - 30, y + 2, 32, 34);
      g.fillStyle(0xff7a1a).fillRect(x - 26, y + 18, 24, 12);
      g.fillStyle(0xffd166).fillRect(x - 20, y + 22, 10, 6);
      g.fillStyle(0x2b2b30).fillRect(x + 12, y + 22, 26, 7).fillRect(x + 20, y + 29, 10, 7);
      const smoke = s.add.circle(x + 29, y - 66, 7, 0xbbbbbb, 0.45);
      s.tweens.add({ targets: smoke, y: y - 100, alpha: 0, scale: 2.2, duration: 2000, repeat: -1 });
      out.push(smoke);
    } else if (b.id === 'armor') {
      // A striped tent with a suit of armor on a stand.
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xe8e0d0 : 0xa83232).fillTriangle(x - 50 + i * 16, y + 34, x - 34 + i * 16, y + 34, x - 10, y - 44);
      g.fillStyle(0x000000, 0.25).fillTriangle(x - 10, y - 44, x + 46, y + 34, x - 10, y + 34);
      g.fillStyle(0x120c08, 0.8).fillTriangle(x - 26, y + 34, x + 2, y + 34, x - 12, y - 2);
      g.fillStyle(0x5a3a22).fillRect(x + 34, y - 6, 4, 40);
      g.fillStyle(0xb8bcc6).fillRect(x + 26, y - 4, 20, 22).fillCircle(x + 36, y - 10, 7);
      g.fillStyle(0xe0e4ec).fillRect(x + 28, y - 2, 4, 16);
      g.fillStyle(0x8a8f99).fillRect(x + 22, y - 2, 6, 10).fillRect(x + 44, y - 2, 6, 10);
    } else if (b.id === 'trinket') {
      // A market stall with a striped awning and gems on the counter.
      g.fillStyle(0x5a3a22).fillRect(x - 46, y - 30, 6, 64).fillRect(x + 40, y - 30, 6, 64);
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xf0e6ff : 0x7a3fb5).fillRect(x - 50 + i * 16.7, y - 42, 17, 16);
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xf0e6ff : 0x7a3fb5).fillTriangle(x - 50 + i * 16.7, y - 26, x - 33 + i * 16.7, y - 26, x - 41.5 + i * 16.7, y - 20);
      g.fillStyle(0x8a6a44).fillRect(x - 44, y + 6, 88, 16);
      g.fillStyle(0x6b4a2a).fillRect(x - 44, y + 22, 88, 12);
      const gems = [0xff4d6d, 0x4dc3ff, 0x7dff9b, 0xffd166, 0xb57bff];
      gems.forEach((c, i) => g.fillStyle(c).fillTriangle(x - 34 + i * 17, y + 6, x - 26 + i * 17, y + 6, x - 30 + i * 17, y - 4));
    } else {
      // A training yard: a fence, a straw dummy and a target.
      g.fillStyle(0x8a6a44).fillRect(x - 56, y + 10, 112, 5).fillRect(x - 56, y + 24, 112, 5);
      for (let i = 0; i < 5; i++) g.fillStyle(0x6b4a2a).fillRect(x - 54 + i * 26, y + 2, 6, 34);
      g.fillStyle(0x5a3a22).fillRect(x - 22, y - 30, 5, 44).fillRect(x - 36, y - 18, 33, 5);
      g.fillStyle(0xd9b45a).fillCircle(x - 20, y - 36, 9).fillRect(x - 28, y - 26, 16, 22);
      g.fillStyle(0xf0f0f0).fillCircle(x + 26, y - 18, 18);
      g.fillStyle(0xd63c3c).fillCircle(x + 26, y - 18, 13);
      g.fillStyle(0xf0f0f0).fillCircle(x + 26, y - 18, 8);
      g.fillStyle(0xd63c3c).fillCircle(x + 26, y - 18, 3);
    }
    const hit = s.add.rectangle(x, y - 6, 120, 100, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => g.setAlpha(0.85));
    hit.on('pointerout', () => g.setAlpha(1));
    hit.on('pointerdown', () => {
      sound.play('click');
      if (b.id === 'perks') this.showPerks();
      else this.float(WORLD.width / 2, b.y - 60, b.tip, '#ffe7a8');
    });
    out.push(hit, ...this.plaque(x, y + 44, b.title, b.id === 'perks' ? 'Guild perks' : undefined));
    if (b.id === 'perks') {
      this.perkBadge = this.badge(x + 52, y - 40);
      out.push(this.perkBadge);
    }
    return out;
  }

  // --- the camp's records ------------------------------------------------------------

  /** The trophy wall: a board with a mount per boss, filled once you've killed it. Tap for the records. */
  private drawTrophyWall(): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const { x, y } = WALL;
    const r = this.camp.records;
    const g = s.add.graphics();
    // Two posts, a plank board and a little roof.
    g.fillStyle(0x4a2f1c).fillRect(x - 62, y - 30, 6, 56).fillRect(x + 56, y - 30, 6, 56);
    g.fillStyle(0x7a5232).fillRect(x - 60, y - 28, 120, 40);
    g.fillStyle(0x6b4527).fillRect(x - 60, y - 16, 120, 3).fillRect(x - 60, y - 2, 120, 3);
    g.fillStyle(0x3a2a1a).fillTriangle(x - 70, y - 28, x + 70, y - 28, x, y - 44);
    const out: Phaser.GameObjects.GameObject[] = [g];
    BOSSES.forEach((boss, i) => {
      const bx = x - 38 + i * 38;
      const by = y - 8;
      const kills = r.bossKills[boss] ?? 0;
      g.fillStyle(0x3a2a1a).fillCircle(bx, by, 14);
      if (!kills) {
        g.fillStyle(0x2a1e14).fillCircle(bx, by, 10);
        return;
      }
      // A skull, with the boss's mark: the Warchief's tusks, the Bone King's crown, the Demon Lord's horns.
      const bone = boss === 'demonLord' ? 0xc9a98a : 0xe8e0cc;
      g.fillStyle(bone).fillCircle(bx, by, 8).fillRect(bx - 5, by + 4, 10, 5);
      g.fillStyle(0x1a1410).fillCircle(bx - 3, by, 2.2).fillCircle(bx + 3, by, 2.2);
      if (boss === 'warchief') g.fillStyle(0xf5f0e0).fillTriangle(bx - 6, by + 8, bx - 3, by + 8, bx - 6, by + 2).fillTriangle(bx + 6, by + 8, bx + 3, by + 8, bx + 6, by + 2);
      if (boss === 'boneKing') g.fillStyle(0xffd166).fillRect(bx - 7, by - 10, 14, 3).fillTriangle(bx - 7, by - 10, bx - 3, by - 10, bx - 5, by - 15).fillTriangle(bx - 2, by - 10, bx + 2, by - 10, bx, by - 16).fillTriangle(bx + 3, by - 10, bx + 7, by - 10, bx + 5, by - 15);
      if (boss === 'demonLord') g.fillStyle(0x7a1010).fillTriangle(bx - 7, by - 4, bx - 3, by - 6, bx - 10, by - 14).fillTriangle(bx + 7, by - 4, bx + 3, by - 6, bx + 10, by - 14);
      if (kills > 1) {
        const t = s.text(bx + 9, by + 4, `×${kills}`, 10, '#ffd166').setFontStyle('bold');
        t.setStroke('#000000', 3);
        out.push(t);
      }
    });
    const total = BOSSES.reduce((a, b) => a + (r.bossKills[b] ?? 0), 0);
    out.push(...this.structure(x, y, 'Trophy Wall', total ? `${total} boss${total === 1 ? '' : 'es'} slain` : 'No bosses slain yet', g, () => this.showTrophies(), 140, 90, 30));
    return out;
  }

  /** The graveyard: a headstone per run that ended (the newest few). Tap for the list. */
  private drawGraveyard(): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const { x, y } = YARD;
    const graves = this.camp.records.graves;
    const g = s.add.graphics();
    // A low picket fence.
    g.fillStyle(0x8a7a66).fillRect(x - 56, y + 10, 112, 3);
    for (let i = 0; i < 8; i++) g.fillStyle(0x9a8a76).fillRect(x - 56 + i * 15.5, y + 2, 4, 16);
    // Up to 8 headstones, newest first; won runs get a golden laurel.
    graves.slice(0, 8).forEach((gr, i) => {
      const gx = x - 42 + (i % 4) * 28;
      const gy = y - 26 + Math.floor(i / 4) * 22;
      g.fillStyle(0x8f949e).fillRoundedRect(gx - 7, gy - 10, 14, 18, { tl: 6, tr: 6, bl: 0, br: 0 });
      g.fillStyle(0x5f646e).fillRect(gx - 1, gy - 6, 2, 8).fillRect(gx - 4, gy - 4, 8, 2);
      g.fillStyle(gr.won ? 0xffd166 : 0x3d5a1a).fillRect(gx - 8, gy + 7, 16, 3);
    });
    if (!graves.length) g.fillStyle(0x3d5a1a, 0.6).fillEllipse(x, y - 10, 70, 20);
    return [g, ...this.structure(x, y, 'Graveyard', graves.length ? `${graves.length} run${graves.length === 1 ? '' : 's'} remembered` : 'Empty, for now', g, () => this.showGraves(), 130, 80, 24)];
  }

  /** The camp grows: a pennant for every win, and more tents as the runs add up. */
  private drawMilestones(): Phaser.GameObjects.GameObject[] {
    const r = this.camp.records;
    const wins = r.tierWins.reduce((a, n) => a + (n ?? 0), 0);
    const g = this.s.add.graphics();
    const tent = (tx: number, ty: number, color: number) => {
      g.fillStyle(color).fillTriangle(tx - 22, ty + 15, tx + 22, ty + 15, tx, ty - 17);
      g.fillStyle(0x000000, 0.35).fillTriangle(tx - 6, ty + 15, tx + 6, ty + 15, tx, ty - 2);
    };
    if (this.camp.runs >= 5) tent(FIRE.x - 170, FIRE.y + 40, 0x6b8f3f);
    if (this.camp.runs >= 15) tent(FIRE.x + 170, FIRE.y + 40, 0x8f3f6b);
    if (this.camp.runs >= 30) tent(FIRE.x - 60, FIRE.y + 82, 0x3f8f8a);
    // Pennants on poles around the clearing, one per win (tier colours), up to 8.
    const colors = [0xffd166, 0x4dc3ff, 0x7dff9b, 0xff8c1a, 0xb57bff, 0xff4d6d];
    const flags: number[] = r.tierWins.flatMap((n, t) => Array(n ?? 0).fill(colors[t % colors.length]));
    flags.slice(0, 8).forEach((c, i) => {
      const a = Math.PI * (0.15 + (0.7 * i) / 7) + Math.PI;
      const px = FIRE.x + Math.cos(a) * 200;
      const py = FIRE.y + Math.sin(a) * 82 + 4;
      g.fillStyle(0x4a2f1c).fillRect(px - 1.5, py - 34, 3, 36);
      g.fillStyle(c).fillTriangle(px + 1, py - 34, px + 1, py - 22, px + 16, py - 28);
    });
    if (wins > 8) {
      const t = this.s.text(FIRE.x, FIRE.y - 108, `${wins} wins`, 10, '#ffd166').setOrigin(0.5);
      t.setStroke('#000000', 3);
      return [g, t];
    }
    return [g];
  }

  /** A tap area over a record (Trophy Wall, Graveyard), with a name plaque and a short line under it. */
  private structure(x: number, y: number, title: string, line: string, g: Phaser.GameObjects.Graphics, onTap: () => void, w: number, h: number, below: number): Phaser.GameObjects.GameObject[] {
    const hit = this.s.add.rectangle(x, y - 10, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => g.setAlpha(0.85));
    hit.on('pointerout', () => g.setAlpha(1));
    hit.on('pointerdown', () => {
      sound.play('click');
      onTap();
    });
    return [hit, ...this.plaque(x, y + below, title, line)];
  }

  // --- panels --------------------------------------------------------------------

  private panel?: Phaser.GameObjects.Container;

  /** A modal list over the camp: a title, rows (optionally tappable), and Close. */
  private openPanel(title: string, sub: string, rows: { title: string; text: string; color?: string; icon?: string; onTap?: () => void }[]): void {
    this.panel?.destroy();
    const s = this.s;
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.6).setOrigin(0, 0).setInteractive().on('pointerdown', () => this.closePanel()),
    ];
    const body: Phaser.GameObjects.GameObject[] = [];
    let y = 0;
    const head = s.text(cx, y, title, 20, '#ffd166').setOrigin(0.5, 0).setFontStyle('bold');
    const subT = s.text(cx, y + 28, sub, 12, '#c9d1e0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(440);
    body.push(head, subT);
    y += 34 + subT.height + 10;
    for (const r of rows) {
      const left = r.icon ? 66 : 40;
      const t1 = s.text(left, y + 8, r.title, 13, r.color ?? '#ffffff').setFontStyle('bold').setWordWrapWidth(WORLD.width - left - 50);
      const t2 = s.text(left, y + 10 + t1.height, r.text, 11, '#c9d1e0').setWordWrapWidth(WORLD.width - left - 50);
      const rh = t1.height + t2.height + 16;
      const bg = s.add.rectangle(30, y, WORLD.width - 60, rh, r.onTap ? 0x1c2433 : 0x141a26).setOrigin(0, 0).setStrokeStyle(1, r.onTap ? 0x4a5a7a : 0x2b3445);
      if (r.onTap) {
        const tap = r.onTap;
        bg.setInteractive({ useHandCursor: true }).on('pointerover', () => bg.setFillStyle(0x26314a)).on('pointerout', () => bg.setFillStyle(0x1c2433)).on('pointerdown', tap);
      }
      body.push(bg, t1, t2);
      if (r.icon) body.push(s.add.image(48, y + rh / 2, r.icon).setScale(0.6));
      y += rh + 6;
    }
    const height = y + 60;
    const top = Math.max(40, (WORLD.height - height) / 2);
    for (const o of body) (o as Phaser.GameObjects.Text).y += top + 16;
    const box = s.add.rectangle(20, top, WORLD.width - 40, height + 10, 0x0f141e, 0.98).setOrigin(0, 0).setStrokeStyle(2, 0xffd166).setInteractive();
    items.push(box, ...body, s.button(cx, top + height - 18, 'Close', 16, '#2b3445', () => this.closePanel()));
    this.panel = s.add.container(0, 0, items).setDepth(140);
  }

  private closePanel(): void {
    sound.play('click');
    this.panel?.destroy();
    this.panel = undefined;
  }

  /** The Training Ground: perks for the whole guild, bought once each. */
  private showPerks(): void {
    const camp = this.camp;
    this.openPanel(
      'Training Ground',
      'Perks for the whole guild, bought once each. Every later run starts with them (not a Random Challenge).',
      PERK_IDS.map((id) => {
        const p = PERKS[id];
        const owned = camp.records.perks.includes(id);
        const can = !owned && canAfford(camp.loot, p.cost);
        return {
          title: `${p.name}${owned ? '  ✓ Learned' : `  ·  ${costText(p.cost)}`}`,
          text: p.text,
          color: owned ? '#7dff9b' : can ? '#ffffff' : '#8f9bb3',
          onTap: owned
            ? undefined
            : () => {
                if (!buyPerk(camp, id)) {
                  sound.play('click');
                  this.float(WORLD.width / 2, 200, 'Not enough loot', '#ff8a8a');
                  return;
                }
                sound.play('levelUp');
                saveCamp(camp);
                this.s.cameras.main.flash(120, 255, 230, 160);
                this.refresh();
                this.showPerks();
              },
        };
      }),
    );
  }

  /** The trophy wall's records: bosses slain, tiers won, and abilities each class has unlocked. */
  private showTrophies(): void {
    const r = this.camp.records;
    const bosses = BOSSES.map((b) => `${ENEMY_STATS[b].label}: ${r.bossKills[b] ?? 0}`).join(' · ');
    const tiers = TIERS.map((t, i) => (i <= r.tier ? `${t.name}: ${r.tierWins[i] ?? 0} won` : '')).filter(Boolean).join(' · ');
    const classes = ALL_CLASSES.map((cls) => {
      const pool = CLASS_POOL[cls].filter((id) => id !== HERO_KIT[cls].starting).length;
      const open = pool - lockedPool(cls, r.classBosses[cls] ?? 0).length;
      return { title: `${name(cls)}: ${open} of ${pool} abilities`, text: open < pool ? `Beat a boss with a ${name(cls)} in the party to unlock another (${r.classBosses[cls] ?? 0} so far).` : 'Every ability unlocked.' };
    });
    this.openPanel('Trophy Wall', 'Every boss you kill is mounted here, and helps the classes that fought it.', [
      { title: 'Bosses slain', text: bosses, color: '#ffd166' },
      { title: 'Difficulty', text: `${tiers}${r.tier < TIERS.length - 1 ? `\nWin on ${TIERS[r.tier].name} to unlock ${TIERS[r.tier + 1].name}.` : ''}`, color: '#ffd166' },
      ...classes,
    ]);
  }

  /** The graveyard's list: one line per run, newest first. */
  private showGraves(): void {
    const graves = this.camp.records.graves;
    this.openPanel(
      'Graveyard',
      graves.length ? 'Here lie your past runs (the newest 12).' : 'No runs have ended yet.',
      graves.map((g) => ({ title: graveTitle(g), text: `${g.team.map((c, i) => `${name(c)} ${g.levels[i] ?? 1}`).join(', ')} · ${new Date(g.at).toLocaleDateString()}`, color: g.won ? '#ffd166' : '#e6e9f0' })),
    );
  }

  /** A hero who wanders around the clearing; tap to open their gear. */
  private makeWalker(cls: HeroClass): Phaser.GameObjects.Container {
    const s = this.s;
    const key = spriteKey({ side: 'hero', kind: cls });
    const body: Phaser.GameObjects.GameObject[] = [s.add.ellipse(0, 0, 24, 8, 0x000000, 0.35)];
    let sprite: Phaser.GameObjects.Image | undefined;
    if (s.textures.exists(key)) {
      s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      sprite = s.add.image(0, 0, key).setScale(1.3);
      sprite.setOrigin(0.5, spriteOriginY(key, sprite.height));
      body.push(sprite);
    } else body.push(s.add.circle(0, -12, 10, COLORS[cls]).setStrokeStyle(2, 0x111111));
    const label = s.text(0, 5, name(cls), 11, '#ffffff').setOrigin(0.5, 0);
    label.setStroke('#000000', 3);
    body.push(label);
    const rng = Phaser.Math.Between;
    const w = s.add.container(rng(WALK.left, WALK.right), rng(WALK.top, WALK.bottom), body);
    w.setSize(40, 56).setInteractive(new Phaser.Geom.Rectangle(-20, -46, 40, 56), Phaser.Geom.Rectangle.Contains);
    w.on('pointerdown', () => this.openHero(cls));
    this.walkers.set(cls, w);
    const wander = () => {
      if (!w.active) return;
      let tx = 0;
      let ty = 0;
      // Somewhere in the clearing, not in the fire.
      do {
        tx = rng(WALK.left, WALK.right);
        ty = rng(WALK.top, WALK.bottom);
      } while (Math.hypot(tx - FIRE.x, ty - FIRE.y) < 54);
      const dist = Math.hypot(tx - w.x, ty - w.y);
      sprite?.setFlipX(tx < w.x);
      s.tweens.add({
        targets: w,
        x: tx,
        y: ty,
        duration: (dist / 28) * 1000,
        ease: 'Linear',
        onComplete: () => s.time.delayedCall(rng(600, 2600), wander),
      });
    };
    s.time.delayedCall(rng(0, 1500), wander);
    return w;
  }
}

function graveTitle(g: Grave): string {
  const where = g.won ? 'Won the run' : `Fell at ${describeProgress(g.reached)}`;
  return `${g.won ? '🏆' : '✝'} ${where}${g.tier ? ` · ${TIERS[g.tier].name}` : ''}${g.challenge ? ' · Challenge' : ''}`;
}

/** A canvas texture made once (gradients and glows). */
function canvasTexture(s: BattleScene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): string {
  if (s.textures.exists(key)) return key;
  const tex = s.textures.createCanvas(key, w, h)!;
  draw(tex.getContext(), w, h);
  tex.refresh();
  return key;
}

/**
 * Small icons for the camp, drawn once at 2x (shown at half size, so they stay
 * sharp): a coin pouch, ore, a hide, a gem and a trophy for the loot; a sword,
 * a breastplate and an amulet for the gear.
 */
function ensureIcons(s: BattleScene): void {
  const icon = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (s.textures.exists(key)) return;
    const g = s.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, 32, 32);
    g.destroy();
  };
  icon('camp-loot-spoils', (g) => {
    g.fillStyle(0x8a5a2a).fillEllipse(16, 20, 24, 20).fillTriangle(10, 10, 22, 10, 16, 16);
    g.fillStyle(0x5a3a1a).fillRect(10, 11, 12, 3);
    g.fillStyle(0xffd166).fillCircle(22, 22, 6);
    g.fillStyle(0xe0a83a).fillCircle(22, 22, 3.5);
  });
  icon('camp-loot-ore', (g) => {
    g.fillStyle(0x5f646e).fillTriangle(4, 26, 16, 6, 28, 26).fillRect(4, 22, 24, 6);
    g.fillStyle(0x8a8f99).fillTriangle(10, 22, 16, 10, 20, 22);
    g.fillStyle(0xd9e3ff).fillCircle(12, 20, 2).fillCircle(20, 16, 1.6).fillCircle(22, 23, 1.6);
  });
  icon('camp-loot-hide', (g) => {
    g.fillStyle(0xb0804a).fillEllipse(16, 16, 22, 26).fillCircle(6, 8, 4).fillCircle(26, 8, 4).fillCircle(6, 25, 4).fillCircle(26, 25, 4);
    g.fillStyle(0x8a5e30).fillEllipse(16, 16, 10, 14);
  });
  icon('camp-loot-gems', (g) => {
    g.fillStyle(0x2f9fd6).fillTriangle(6, 12, 26, 12, 16, 28);
    g.fillStyle(0x79e2ff).fillTriangle(10, 6, 22, 6, 26, 12).fillTriangle(10, 6, 6, 12, 26, 12);
    g.fillStyle(0xffffff, 0.8).fillTriangle(12, 9, 16, 9, 13, 12);
  });
  icon('camp-loot-trophies', (g) => {
    g.fillStyle(0xe0a83a).fillRect(10, 4, 12, 4).fillEllipse(16, 12, 16, 14).fillRect(14, 18, 4, 6).fillRect(9, 24, 14, 4);
    g.lineStyle(2.5, 0xe0a83a).strokeCircle(7, 11, 4).strokeCircle(25, 11, 4);
    g.fillStyle(0xffe066).fillEllipse(13, 10, 4, 6);
  });
  icon('camp-gear-weapon', (g) => {
    g.lineStyle(4, 0xd9e3ff).lineBetween(8, 24, 25, 7);
    g.lineStyle(2, 0xffffff).lineBetween(10, 22, 25, 7);
    g.lineStyle(4, 0x8a5a2a).lineBetween(5, 27, 9, 23);
    g.lineStyle(3, 0xe0a83a).lineBetween(6, 19, 13, 26);
  });
  icon('camp-gear-armor', (g) => {
    g.fillStyle(0x8a8f99).fillRoundedRect(6, 6, 20, 22, 5).fillRect(2, 7, 6, 8).fillRect(24, 7, 6, 8);
    g.fillStyle(0xb8bcc6).fillRect(10, 9, 5, 15);
    g.fillStyle(0x5f646e).fillRect(11, 6, 10, 3);
  });
  icon('camp-gear-trinket', (g) => {
    g.lineStyle(2, 0xe0a83a).strokeCircle(16, 11, 8);
    g.fillStyle(0xe0a83a).fillCircle(16, 21, 7);
    g.fillStyle(0xb57bff).fillCircle(16, 21, 4.5);
    g.fillStyle(0xffffff, 0.8).fillCircle(14.5, 19.5, 1.4);
  });
}
