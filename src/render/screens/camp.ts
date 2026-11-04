import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { CLASS_POOL, ENEMY_STATS, HERO_KIT, WORLD } from '../../sim/content';
import { actDef } from '../../sim/acts';
import { describeProgress } from '../../sim/run';
import { lockedPool, PERK_IDS, PERKS, TIERS, type Grave } from '../../sim/progress';
import { sound } from '../sound';
import { ALL_CLASSES } from '../../sim/run';
import {
  canAfford,
  costText,
  buyPerk,
  gearCost,
  gearLines,
  gearShort,
  resetUpgrades,
  loadCamp,
  LOOT_NAMES,
  saveCamp,
  STATIONS,
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
/** The trophy wall (top of the path) and the graveyard (bottom of it). */
const WALL = { x: WORLD.width / 2, y: 330 };
const YARD = { x: WORLD.width / 2, y: 728 };
const BOSSES = [1, 2, 3].map((a) => actDef(a).boss);

type Building = GearSlot | 'perks';

/** The four structures: where they stand and what they're called. */
const BUILDINGS: { id: Building; x: number; y: number; title: string }[] = [
  { id: 'weapon', x: 122, y: 360, title: 'Blacksmith' },
  { id: 'armor', x: WORLD.width - 122, y: 360, title: 'Armorer' },
  { id: 'trinket', x: 122, y: 690, title: 'Jeweler' },
  { id: 'perks', x: WORLD.width - 122, y: 690, title: 'Training Ground' },
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
    items.push(...this.drawMilestones());
    for (const b of BUILDINGS) items.push(...this.drawBuilding(b));
    items.push(...this.drawTrophyWall(), ...this.drawGraveyard());
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
      if (b.id === 'perks') {
        const left = PERK_IDS.filter((id) => !camp.records.perks.includes(id));
        l.level.setText(`Perks ${PERK_IDS.length - left.length} of ${PERK_IDS.length} (whole guild)`);
        const can = left.some((id) => canAfford(camp.loot, PERKS[id].cost));
        l.cost.setText(left.length ? (can ? 'Tap to learn a perk' : 'Tap to see the perks') : 'All learned').setColor(can ? '#7dff9b' : '#8f9bb3');
        continue;
      }
      const level = camp.gear[this.selected][b.id];
      const cost = gearCost(b.id, level);
      l.level.setText(`${name(this.selected)}'s ${STATIONS[b.id].item.toLowerCase()}: Lv ${level}`);
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

  /** Tap a building: buy its next level for the chosen hero (the Training Ground opens its perks). */
  private buy(b: (typeof BUILDINGS)[number]): void {
    if (b.id === 'perks') {
      sound.play('click');
      this.showPerks();
      return;
    }
    const ok = upgradeGear(this.camp, this.selected, b.id);
    const s = this.s;
    if (!ok) {
      sound.play('click');
      this.float(b.x, b.y - 40, 'Not enough loot', '#ff8a8a');
      return;
    }
    sound.play('levelUp');
    saveCamp(this.camp);
    this.float(b.x, b.y - 40, `${STATIONS[b.id].item} +1!`, '#7dff9b');
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

  /** A tap area over a structure, with its name and a short line underneath. */
  private structure(x: number, y: number, title: string, line: string, g: Phaser.GameObjects.Graphics, onTap: () => void, w: number, h: number, below: number): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const hit = s.add.rectangle(x, y - 10, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => g.setAlpha(0.85));
    hit.on('pointerout', () => g.setAlpha(1));
    hit.on('pointerdown', () => {
      sound.play('click');
      onTap();
    });
    const t = s.text(x, y + below, title, 13, '#ffffff').setOrigin(0.5, 0).setFontStyle('bold');
    t.setStroke('#000000', 4);
    const l = s.text(x, y + below + 16, line, 10, '#e6e9f0').setOrigin(0.5, 0);
    l.setStroke('#000000', 3);
    return [hit, t, l];
  }

  // --- panels --------------------------------------------------------------------

  private panel?: Phaser.GameObjects.Container;

  /** A modal list over the camp: a title, rows (optionally tappable), and Close. */
  private openPanel(title: string, sub: string, rows: { title: string; text: string; color?: string; onTap?: () => void }[]): void {
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
      const t1 = s.text(40, y + 8, r.title, 13, r.color ?? '#ffffff').setFontStyle('bold').setWordWrapWidth(WORLD.width - 90);
      const t2 = s.text(40, y + 10 + t1.height, r.text, 11, '#c9d1e0').setWordWrapWidth(WORLD.width - 90);
      const rh = t1.height + t2.height + 16;
      const bg = s.add.rectangle(30, y, WORLD.width - 60, rh, r.onTap ? 0x1c2433 : 0x141a26).setOrigin(0, 0).setStrokeStyle(1, r.onTap ? 0x4a5a7a : 0x2b3445);
      if (r.onTap) {
        const tap = r.onTap;
        bg.setInteractive({ useHandCursor: true }).on('pointerover', () => bg.setFillStyle(0x26314a)).on('pointerout', () => bg.setFillStyle(0x1c2433)).on('pointerdown', tap);
      }
      body.push(bg, t1, t2);
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
      'Perks for the whole guild, bought once each. Every later run starts with them (not the daily run).',
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
        onComplete: () => {
          s.time.delayedCall(rng(600, 2600), wander);
        },
      });
    };
    s.time.delayedCall(rng(0, 1500), wander);
    return w;
  }
}

function graveTitle(g: Grave): string {
  const where = g.won ? 'Won the run' : `Fell at ${describeProgress(g.reached)}`;
  return `${g.won ? '🏆' : '✝'} ${where}${g.tier ? ` · ${TIERS[g.tier].name}` : ''}${g.daily ? ` · Daily ${g.daily}` : ''}`;
}

function lootLine(loot: Loot): string {
  return (Object.keys(loot) as (keyof Loot)[]).map((k) => `${LOOT_NAMES[k]} ${loot[k]}`).join(' · ');
}
