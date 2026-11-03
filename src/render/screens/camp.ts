import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { WORLD } from '../../sim/content';
import { sound } from '../sound';
import { ALL_CLASSES } from '../../sim/run';
import {
  canAfford,
  costText,
  drillsCost,
  gearCost,
  gearLines,
  gearShort,
  resetUpgrades,
  loadCamp,
  LOOT_NAMES,
  saveCamp,
  STATIONS,
  upgradeDrills,
  upgradeGear,
  type CampState,
  type GearSlot,
} from '../../sim/camp';
import type { HeroClass, Loot } from '../../sim/types';
import { COLORS, cssColor, spriteKey, spriteOriginY } from '../theme';

const name = (cls: HeroClass) => cls[0].toUpperCase() + cls.slice(1);

/** The hero profiles at the top (3 x 2 cards), then the campground below them. */
const CARDS = { top: 100, w: 168, h: 78, gap: 6 };
const GROUND = { top: 272, bottom: 810 };
const FIRE = { x: WORLD.width / 2, y: 550 };
/** Where heroes wander: the clearing between the buildings. */
const WALK = { left: 60, right: WORLD.width - 60, top: 478, bottom: 628 };

type Building = GearSlot | 'drills';

/** The four structures: where they stand and what they're called. */
const BUILDINGS: { id: Building; x: number; y: number; title: string }[] = [
  { id: 'weapon', x: 122, y: 360, title: 'Blacksmith' },
  { id: 'armor', x: WORLD.width - 122, y: 360, title: 'Armorer' },
  { id: 'trinket', x: 122, y: 690, title: 'Jeweler' },
  { id: 'drills', x: WORLD.width - 122, y: 690, title: 'Training Ground' },
];

/**
 * The camp, between map runs. At the top, a profile card per hero (their gear
 * at a glance); below, the campground, where the heroes wander around the
 * fire. Tap a card or a hero to choose whose gear to work on, then tap a
 * building to upgrade it; each building shows what its next level costs. Whatever is
 * bought here goes with every hero of that class on every later run.
 */
export class CampScreen {
  constructor(readonly s: BattleScene) {}

  camp: CampState = loadCamp();
  /** The hero whose gear the buildings work on. */
  selected: HeroClass = 'warrior';

  private loot?: Phaser.GameObjects.Text;
  private labels = new Map<Building, { level: Phaser.GameObjects.Text; cost: Phaser.GameObjects.Text }>();
  private walkers = new Map<HeroClass, Phaser.GameObjects.Container>();
  private ring?: Phaser.GameObjects.Ellipse;
  private profiles = new Map<HeroClass, { bg: Phaser.GameObjects.Rectangle; gear: Phaser.GameObjects.Text }>();
  private root?: Phaser.GameObjects.Container;

  show(): void {
    const s = this.s;
    s.state = 'camp';
    s.overlay?.destroy();
    this.camp = loadCamp();
    this.labels.clear();
    this.walkers.clear();
    this.profiles.clear();
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14).setOrigin(0, 0).setInteractive()];
    items.push(s.text(cx, 50, 'The Camp', 24, '#ffd166').setOrigin(0.5, 0).setFontStyle('bold'));
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
    this.loot = s.text(cx, 82, '', 12, '#ffffff').setOrigin(0.5, 0);
    items.push(this.loot);

    items.push(...this.drawGround());
    for (const b of BUILDINGS) items.push(...this.drawBuilding(b));
    this.ring = s.add.ellipse(0, 0, 34, 12).setStrokeStyle(2, 0xffd166).setFillStyle(0xffd166, 0.2);
    items.push(this.ring);
    for (const cls of ALL_CLASSES) items.push(this.makeWalker(cls));

    // Hero profiles at the top: portrait, name and gear; tap to choose.
    ALL_CLASSES.forEach((cls, i) => {
      const x = 12 + (i % 3) * (CARDS.w + CARDS.gap);
      const y = CARDS.top + Math.floor(i / 3) * (CARDS.h + CARDS.gap);
      const bg = s.add
        .rectangle(x, y, CARDS.w, CARDS.h, 0x161c28)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.select(cls));
      const title = s.text(x + 50, y + 8, name(cls), 14, cssColor(COLORS[cls])).setFontStyle('bold');
      const gear = s.text(x + 50, y + 28, '', 10, '#c9d1e0').setLineSpacing(1);
      this.profiles.set(cls, { bg, gear });
      items.push(bg, ...s.heroPicker.portrait(cls, x + 24, y + 62, 1.35), title, gear);
    });

    // Bottom: New run, and a reset for testing.
    items.push(
      s.button(cx, WORLD.height - 62, 'New run ▶', 22, '#2e86de', () => {
        sound.unlock();
        sound.play('click');
        s.scene.restart({});
      }),
      s.text(WORLD.width - 14, WORLD.height - 62, '↺ Reset upgrades\n(testing)', 11, '#ffffff')
        .setOrigin(1, 0.5)
        .setAlign('center')
        .setPadding(8, 4, 8, 4)
        .setBackgroundColor('#5a2a2a')
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.reset()),
    );
    this.root = s.add.container(0, 0, items).setDepth(100);
    // The ring follows the chosen hero around.
    s.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        const w = this.walkers.get(this.selected);
        if (w && this.ring) this.ring.setPosition(w.x, w.y);
      },
    });
    s.overlay = this.root;
    this.refresh();
  }

  /** Update every number on the screen (after a purchase or a new hero is chosen). */
  private refresh(): void {
    const camp = this.camp;
    this.loot?.setText(`${lootLine(camp.loot)}   ·   Runs: ${camp.runs}`);
    for (const b of BUILDINGS) {
      const l = this.labels.get(b.id);
      if (!l) continue;
      const level = b.id === 'drills' ? camp.drills : camp.gear[this.selected][b.id];
      const cost = b.id === 'drills' ? drillsCost(camp.drills) : gearCost(b.id, level);
      l.level.setText(b.id === 'drills' ? `Drills ${level} (whole guild)` : `${name(this.selected)}'s ${STATIONS[b.id].item.toLowerCase()}: Lv ${level}`);
      l.cost.setText(cost ? costText(cost) : 'Max level').setColor(cost && canAfford(camp.loot, cost) ? '#7dff9b' : '#8f9bb3');
    }
    // The profiles: gear at a glance, the chosen hero highlighted.
    for (const [cls, p] of this.profiles) {
      const g = camp.gear[cls];
      const lines = gearLines(g).map((l) => l.replace(/ \(.*\)$/, ''));
      p.gear.setText(lines.length ? `${lines.join(' · ')}\n${gearShort(g)}` : 'No upgrades yet');
      p.gear.setWordWrapWidth(CARDS.w - 56);
      const on = cls === this.selected;
      p.bg.setFillStyle(on ? 0x2a3550 : 0x161c28).setStrokeStyle(2, on ? 0xffd166 : 0x3a4660);
    }
  }

  /** Testing aid: give back everything spent at the camp. */
  private reset(): void {
    sound.play('click');
    const refund = resetUpgrades(this.camp);
    saveCamp(this.camp);
    this.float(WORLD.width / 2, GROUND.top + 30, refund.spoils ? `Refunded ${refund.spoils} Spoils and materials` : 'Nothing to refund', '#ffd166');
    this.refresh();
  }

  private select(cls: HeroClass): void {
    sound.play('click');
    this.selected = cls;
    // A little hop from the chosen hero.
    const w = this.walkers.get(cls);
    const sprite = w?.list[0] as Phaser.GameObjects.Image | undefined;
    if (sprite) this.s.tweens.add({ targets: sprite, scale: sprite.scale * 1.25, duration: 120, yoyo: true });
    this.refresh();
  }

  /** Tap a building: buy its next level for the chosen hero (Drills: for everyone). */
  private buy(b: (typeof BUILDINGS)[number]): void {
    const ok = b.id === 'drills' ? upgradeDrills(this.camp) : upgradeGear(this.camp, this.selected, b.id);
    const s = this.s;
    if (!ok) {
      sound.play('click');
      this.float(b.x, b.y - 40, 'Not enough loot', '#ff8a8a');
      return;
    }
    sound.play('levelUp');
    saveCamp(this.camp);
    this.float(b.x, b.y - 40, b.id === 'drills' ? 'Drills +1!' : `${STATIONS[b.id].item} +1!`, '#7dff9b');
    s.cameras.main.flash(120, 255, 230, 160);
    this.refresh();
  }

  private float(x: number, y: number, text: string, color: string): void {
    const t = this.s.text(x, y, text, 15, color).setOrigin(0.5).setFontStyle('bold').setDepth(130);
    t.setStroke('#000000', 4);
    this.s.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // --- drawing -------------------------------------------------------------------

  /** Grass, a dirt clearing, trees around the edge, a couple of tents and the campfire. */
  private drawGround(): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const g = s.add.graphics();
    g.fillStyle(0x2f5a2c).fillRect(10, GROUND.top, WORLD.width - 20, GROUND.bottom - GROUND.top);
    // Mown stripes and grass tufts.
    for (let y = GROUND.top; y < GROUND.bottom; y += 36) g.fillStyle(0x33622f, 0.6).fillRect(10, y, WORLD.width - 20, 18);
    const rng = new Phaser.Math.RandomDataGenerator(['camp']);
    for (let i = 0; i < 90; i++) {
      const x = rng.between(16, WORLD.width - 16);
      const y = rng.between(GROUND.top + 6, GROUND.bottom - 6);
      g.fillStyle(0x4f8a3c).fillRect(x, y, 2, 4).fillRect(x + 3, y + 1, 2, 3);
    }
    // The clearing and paths.
    g.fillStyle(0x7a5c3a, 0.9).fillEllipse(FIRE.x, FIRE.y, 430, 190);
    g.fillStyle(0x8a6a44, 0.9).fillEllipse(FIRE.x, FIRE.y, 380, 150);
    g.fillStyle(0x7a5c3a, 0.8).fillRect(FIRE.x - 18, GROUND.top, 36, 120).fillRect(FIRE.x - 18, FIRE.y + 60, 36, GROUND.bottom - FIRE.y - 60);
    // Trees along the top and bottom edges.
    for (let x = 30; x < WORLD.width; x += 56) {
      for (const y of [GROUND.top + 14, GROUND.bottom - 14]) {
        if (Math.abs(x - FIRE.x) < 40) continue;
        g.fillStyle(0x4a2f1c).fillRect(x - 3, y, 6, 10);
        g.fillStyle(0x1f4a24).fillCircle(x, y - 4, 15);
        g.fillStyle(0x2a6130).fillCircle(x - 4, y - 8, 9);
      }
    }
    // Two tents by the fire.
    const tent = (x: number, y: number, color: number) => {
      g.fillStyle(color).fillTriangle(x - 26, y + 18, x + 26, y + 18, x, y - 20);
      g.fillStyle(0x000000, 0.35).fillTriangle(x - 7, y + 18, x + 7, y + 18, x, y - 2);
      g.lineStyle(2, 0x3a2a1a).lineBetween(x, y - 20, x, y - 28);
    };
    tent(FIRE.x - 120, FIRE.y - 66, 0x3f6fb0);
    tent(FIRE.x + 120, FIRE.y - 66, 0xb0863f);
    // Logs around the fire.
    g.fillStyle(0x5a3a22).fillRect(FIRE.x - 46, FIRE.y + 22, 28, 9).fillRect(FIRE.x + 18, FIRE.y + 22, 28, 9).fillRect(FIRE.x - 14, FIRE.y - 34, 28, 9);
    g.fillStyle(0x6b6b6b).fillCircle(FIRE.x, FIRE.y + 6, 18);
    g.fillStyle(0x3a3a3a).fillCircle(FIRE.x, FIRE.y + 6, 13);
    // The fire itself flickers.
    const outer = s.add.triangle(FIRE.x, FIRE.y - 6, 0, 24, 14, -8, 28, 24, 0xff8c1a);
    const inner = s.add.triangle(FIRE.x, FIRE.y - 2, 0, 16, 9, -6, 18, 16, 0xffe066);
    s.tweens.add({ targets: [outer, inner], scaleY: 1.25, scaleX: 0.9, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const glow = s.add.circle(FIRE.x, FIRE.y, 46, 0xffb347, 0.12);
    s.tweens.add({ targets: glow, alpha: 0.05, duration: 500, yoyo: true, repeat: -1 });
    return [g, glow, outer, inner];
  }

  /** One structure, drawn in simple shapes, with its name, level and next cost underneath. Tap to upgrade. */
  private drawBuilding(b: (typeof BUILDINGS)[number]): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const { x, y } = b;
    const g = s.add.graphics();
    const out: Phaser.GameObjects.GameObject[] = [g];
    if (b.id === 'weapon') {
      // A stone forge with a chimney, glowing coals and an anvil.
      g.fillStyle(0x5a3a22).fillTriangle(x - 52, y - 14, x + 52, y - 14, x, y - 50);
      g.fillStyle(0x7d7d84).fillRect(x - 44, y - 14, 88, 50);
      g.fillStyle(0x5f5f66).fillRect(x - 44, y + 4, 88, 4).fillRect(x - 44, y + 20, 88, 4);
      g.fillStyle(0x5f5f66).fillRect(x + 22, y - 62, 14, 30);
      g.fillStyle(0x1a1a1a).fillRect(x - 30, y + 2, 32, 34);
      g.fillStyle(0xff7a1a).fillRect(x - 26, y + 18, 24, 12);
      g.fillStyle(0xffd166).fillRect(x - 20, y + 22, 10, 6);
      g.fillStyle(0x2b2b30).fillRect(x + 12, y + 22, 26, 7).fillRect(x + 20, y + 29, 10, 7);
      const smoke = s.add.circle(x + 29, y - 66, 7, 0xbbbbbb, 0.5);
      s.tweens.add({ targets: smoke, y: y - 96, alpha: 0, scale: 2, duration: 1800, repeat: -1 });
      out.push(smoke);
    } else if (b.id === 'armor') {
      // A striped tent with a suit of armor on a stand.
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xe8e0d0 : 0xa83232).fillTriangle(x - 50 + i * 16, y + 34, x - 34 + i * 16, y + 34, x - 10, y - 44);
      g.fillStyle(0x000000, 0.4).fillTriangle(x - 26, y + 34, x + 2, y + 34, x - 12, y - 2);
      g.fillStyle(0x5a3a22).fillRect(x + 34, y - 6, 4, 40);
      g.fillStyle(0xb8bcc6).fillRect(x + 26, y - 4, 20, 22).fillCircle(x + 36, y - 10, 7);
      g.fillStyle(0x8a8f99).fillRect(x + 22, y - 2, 6, 10).fillRect(x + 44, y - 2, 6, 10);
    } else if (b.id === 'trinket') {
      // A market stall with a striped awning and gems on the counter.
      g.fillStyle(0x5a3a22).fillRect(x - 46, y - 30, 6, 64).fillRect(x + 40, y - 30, 6, 64);
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xf0e6ff : 0x7a3fb5).fillRect(x - 50 + i * 16.7, y - 42, 17, 16);
      g.fillStyle(0x8a6a44).fillRect(x - 44, y + 6, 88, 16);
      g.fillStyle(0x6b4a2a).fillRect(x - 44, y + 22, 88, 10);
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
    // The tap area, and the labels underneath.
    const hit = s.add.rectangle(x, y - 6, 120, 100, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => g.setAlpha(0.85));
    hit.on('pointerout', () => g.setAlpha(1));
    hit.on('pointerdown', () => this.buy(b));
    const title = s.text(x, y + 42, b.title, 14, '#ffffff').setOrigin(0.5, 0).setFontStyle('bold');
    title.setStroke('#000000', 4);
    const level = s.text(x, y + 60, '', 11, '#e6e9f0').setOrigin(0.5, 0);
    level.setStroke('#000000', 3);
    const cost = s.text(x, y + 75, '', 11, '#7dff9b').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(200);
    cost.setStroke('#000000', 3);
    this.labels.set(b.id, { level, cost });
    out.push(hit, title, level, cost);
    return out;
  }

  /** A hero who wanders around the clearing; tap to choose them. */
  private makeWalker(cls: HeroClass): Phaser.GameObjects.Container {
    const s = this.s;
    const key = spriteKey({ side: 'hero', kind: cls });
    const body: Phaser.GameObjects.GameObject[] = [];
    let sprite: Phaser.GameObjects.Image | undefined;
    if (s.textures.exists(key)) {
      s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      sprite = s.add.image(0, 0, key).setScale(1.3);
      sprite.setOrigin(0.5, spriteOriginY(key, sprite.height));
      body.push(sprite);
    } else body.push(s.add.circle(0, -12, 10, COLORS[cls]).setStrokeStyle(2, 0x111111));
    const label = s.text(0, 4, name(cls), 10, '#ffffff').setOrigin(0.5, 0);
    label.setStroke('#000000', 3);
    body.push(label);
    const rng = Phaser.Math.Between;
    const w = s.add.container(rng(WALK.left, WALK.right), rng(WALK.top, WALK.bottom), body);
    w.setSize(40, 56).setInteractive(new Phaser.Geom.Rectangle(-20, -46, 40, 56), Phaser.Geom.Rectangle.Contains);
    w.on('pointerdown', () => this.select(cls));
    this.walkers.set(cls, w);
    const wander = () => {
      if (!w.active) return;
      let tx = 0;
      let ty = 0;
      // Somewhere in the clearing, not in the fire.
      do {
        tx = rng(WALK.left, WALK.right);
        ty = rng(WALK.top, WALK.bottom);
      } while (Math.hypot(tx - FIRE.x, ty - FIRE.y) < 50);
      const dist = Math.hypot(tx - w.x, ty - w.y);
      sprite?.setFlipX(tx < w.x);
      s.tweens.add({
        targets: w,
        x: tx,
        y: ty,
        duration: (dist / 28) * 1000,
        ease: 'Linear',
        onUpdate: () => sprite?.setY(Math.sin(s.time.now / 90) * 1.5),
        onComplete: () => {
          sprite?.setY(0);
          s.time.delayedCall(rng(600, 2600), wander);
        },
      });
    };
    s.time.delayedCall(rng(0, 1500), wander);
    return w;
  }
}

function lootLine(loot: Loot): string {
  return (Object.keys(loot) as (keyof Loot)[]).map((k) => `${LOOT_NAMES[k]} ${loot[k]}`).join(' · ');
}
