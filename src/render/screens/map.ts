import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { actDef } from '../../sim/acts';
import { BOSS_INFO, ENEMY_STATS, WORLD } from '../../sim/content';
import { MAP_COLS, MAP_FLOORS, type MapNode, type NodeType } from '../../sim/map';
import { autoPath, availableNodes, clearRun, eliteTwist, enterNode, isRecruitCampsite, recordProgress, saveRun, TWISTS } from '../../sim/run';
import { sound } from '../sound';
import { ICON_PX, spriteKey, spriteOriginY } from '../theme';
import { drawMapTerrain, linkPoints, MAP_LOOK, NODE_RIM, strokeCurve } from '../mapArt';
import { loadCamp, saveCamp } from '../../sim/camp';
import { addGrave } from '../../sim/settle';

/** Where the map is drawn (between the top bar and the hero panels). */
const TOP = 180;
const BOTTOM = 742;
const LEFT = 58;
const RIGHT = WORLD.width - 58;

const NODE_NAMES: Record<NodeType, string> = { fight: 'Fight', elite: 'Elite', chest: 'Chest', campsite: 'Campsite', shop: 'Shop', event: 'Event', boss: 'Boss' };


/**
 * The act's map: climb from the bottom to the boss at the top. The nodes you
 * can move to pulse; tap one to go there (fights start straight away). The way
 * you came is a dotted line.
 */
export class MapScreen {
  constructor(readonly s: BattleScene) {}

  private ui?: Phaser.GameObjects.Container;
  private tip?: Phaser.GameObjects.Text;

  /** Screen position of a node (a little jitter so the map doesn't look like graph paper). */
  pos(n: MapNode): { x: number; y: number } {
    let h = 0;
    for (const ch of n.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const jx = ((h % 17) - 8) * (n.type === 'boss' ? 0 : 1);
    const jy = (((h >> 5) % 11) - 5) * (n.type === 'boss' ? 0 : 1);
    return {
      x: LEFT + (n.col / (MAP_COLS - 1)) * (RIGHT - LEFT) + jx,
      // (The boss sits a little higher, clear of the last row.)
      y: BOTTOM - (n.floor / MAP_FLOORS) * (BOTTOM - TOP) + jy - (n.type === 'boss' ? 8 : 0),
    };
  }

  show(): void {
    const run = this.s.run!;
    const map = run.map;
    const act = actDef(run.act);
    const look = MAP_LOOK[act.look];
    this.ui?.destroy();
    const items: Phaser.GameObjects.GameObject[] = [];
    // The terrain first, kept clear of every node and path.
    const links: { from: MapNode; to: MapNode; pts: { x: number; y: number }[] }[] = [];
    for (const n of Object.values(map.nodes)) for (const id of n.next) links.push({ from: n, to: map.nodes[id], pts: linkPoints(this.pos(n), this.pos(map.nodes[id]), `${n.id}>${id}`) });
    items.push(
      ...drawMapTerrain(
        this.s,
        act.look,
        { x: 10, y: 104, w: WORLD.width - 20, h: WORLD.hudTop - 118 },
        Object.values(map.nodes).map((n) => this.pos(n)),
        links.map((l) => l.pts),
      ),
    );
    // The act's boss, so you know what's coming.
    const bossKind = act.boss;
    const boss = BOSS_INFO[bossKind];
    const special = boss?.moves[1];
    items.push(
      this.s.text(WORLD.width / 2, 112, `${act.theme}  Boss: ${ENEMY_STATS[bossKind].label}`, 12, '#e6e9f0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500),
    );
    // The boss's move is only revealed on the last floor before the boss.
    const lastFloor = !!run.at && map.nodes[run.at].floor === MAP_FLOORS - 1;
    if (special && lastFloor) items.push(this.s.text(WORLD.width / 2, 130, `${special.name}: ${special.text}`, 11, '#ffd9c2').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500));

    // Trails between nodes: faint dashes ahead, brighter from where you stand,
    // and the way you came as a solid trail with footprints.
    const g = this.s.add.graphics();
    items.push(g);
    const visited = new Set(run.visited);
    const steps = new Set<string>();
    for (let i = 1; i < run.visited.length; i++) steps.add(`${run.visited[i - 1]}>${run.visited[i]}`);
    const floorNow = run.at ? map.nodes[run.at].floor : -1;
    for (const l of links) {
      if (steps.has(`${l.from.id}>${l.to.id}`)) continue;
      const fromHere = l.from.id === run.at;
      const behind = l.to.floor <= floorNow;
      strokeCurve(g, l.pts, fromHere ? 3 : 2, fromHere ? look.path : look.line, fromHere ? 0.85 : behind ? 0.15 : 0.45, true);
    }
    for (const l of links) {
      if (!steps.has(`${l.from.id}>${l.to.id}`)) continue;
      strokeCurve(g, l.pts, 6, 0x000000, 0.35, false);
      strokeCurve(g, l.pts, 3, look.path, 0.95, false);
    }

    // Nodes.
    const open = new Set(availableNodes(run).map((n) => n.id));
    for (const n of Object.values(map.nodes)) {
      const p = this.pos(n);
      const isOpen = open.has(n.id);
      const here = run.at === n.id;
      const boss = n.type === 'boss';
      const size = boss ? 40 : 24;
      const r = size / 2 + (boss ? 8 : 5);
      const done = visited.has(n.id) && !here;
      const missed = !visited.has(n.id) && n.floor <= floorNow;
      const alpha = isOpen || here ? 1 : done ? 0.8 : missed ? 0.35 : 0.9;
      // A round badge: shadow, dark disc, a rim in the node type's colour.
      const badge = this.s.add.graphics({ x: p.x, y: p.y }).setAlpha(alpha);
      if (boss) {
        const glow = this.s.add.circle(p.x, p.y, r + 14, 0xff3a2a, 0.18);
        this.s.tweens.add({ targets: glow, scale: 1.15, alpha: 0.08, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        items.push(glow);
      }
      if (n.rich && !boss) badge.fillStyle(0xffd166, 0.28).fillCircle(0, 0, r + 6).lineStyle(2, 0xffd166, 0.9).strokeCircle(0, 0, r + 5);
      badge.fillStyle(0x000000, 0.35).fillEllipse(2, r * 0.75, r * 2.1, r * 0.8);
      badge.fillStyle(done ? 0x2a2622 : 0x15120f).fillCircle(0, 0, r);
      badge.lineStyle(boss ? 4 : 2.5, done ? 0x8a8478 : NODE_RIM[n.type], 1).strokeCircle(0, 0, r);
      if (boss) badge.lineStyle(1.5, 0xffd166, 0.8).strokeCircle(0, 0, r - 4);
      badge.fillStyle(0xffffff, 0.08).fillCircle(-r * 0.25, -r * 0.3, r * 0.55);
      items.push(badge);
      // The boss shows itself; everything else its node icon.
      const bossKey = spriteKey({ side: 'enemy', kind: act.boss });
      let icon: Phaser.GameObjects.Image;
      if (boss && this.s.textures.exists(bossKey)) {
        this.s.textures.get(bossKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
        icon = this.s.add.image(p.x, p.y + r - 6, bossKey).setScale(1.4);
        icon.setOrigin(0.5, spriteOriginY(bossKey, icon.height));
      } else icon = this.s.add.image(p.x, p.y, `icon-nd-${n.type}`).setScale(size / ICON_PX);
      icon.setAlpha(alpha);
      if (done) icon.setTint(0x9a9a9a);
      // A generous tap area: the whole badge.
      const hit = this.s.add.circle(p.x, p.y, r + 4, 0xffffff, 0.001).setInteractive({ useHandCursor: isOpen }).on('pointerdown', () => (isOpen ? this.go(n) : this.describe(n)));
      if (isOpen) {
        const ring = this.s.add.circle(p.x, p.y, r + 2).setStrokeStyle(2, 0xffffff, 0.9);
        items.push(ring);
        this.s.tweens.add({ targets: ring, scale: 1.3, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
      }
      items.push(icon, hit);
      // Your party stands on the node you're at (in place of its icon).
      if (here) {
        icon.setVisible(false);
        items.push(...this.partyMarker(p.x, p.y + r - 4));
      }
      // Fights you've won leave a little skull and crossbones beside the node.
      if (done && (n.type === 'fight' || n.type === 'elite')) {
        const m = this.s.add.graphics({ x: p.x + r - 3, y: p.y + r - 5 });
        m.lineStyle(2, 0xe8e0cc, 0.9).lineBetween(-5, -3, 5, 5).lineBetween(-5, 5, 5, -3);
        m.fillStyle(0xe8e0cc, 0.95).fillCircle(0, -2, 4);
        m.fillStyle(0x1a1410, 1).fillCircle(-1.5, -2.5, 1).fillCircle(1.5, -2.5, 1);
        items.push(m);
      }
      // An elite with a twist says what it is.
      const twist = eliteTwist(run, n);
      if (twist) {
        const tw = this.s.text(p.x, p.y + r + 1, TWISTS[twist].name, 10, '#ff9f9f').setOrigin(0.5, 0);
        tw.setStroke('#000000', 3);
        items.push(tw);
      }
    }

    // Legend.
    const types: NodeType[] = ['fight', 'elite', 'chest', 'campsite', 'shop', 'event'];
    types.forEach((t, i) => {
      const x = 26 + (i % 4) * 116;
      const y = 774 + Math.floor(i / 4) * 18;
      const dot = this.s.add.graphics({ x, y }).fillStyle(0x15120f).fillCircle(0, 0, 9).lineStyle(1.5, NODE_RIM[t], 1).strokeCircle(0, 0, 9);
      items.push(dot, this.s.add.image(x, y, `icon-nd-${t}`).setScale(13 / ICON_PX), this.s.text(x + 14, y - 8, NODE_NAMES[t], 12, '#c9d1e0'));
    });
    items.push(this.s.add.circle(WORLD.width - 30, 770, 9, 0xffd166, 0.25).setStrokeStyle(2, 0xffd166, 0.9), this.s.text(WORLD.width - 44, 784, 'golden', 9, '#ffd166').setOrigin(0.5, 0));
    this.tip = this.s.text(WORLD.width / 2, 152, '', 12, '#7dff9b').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500);
    items.push(this.tip);
    // Give up on this run (with a check first).
    items.push(
      this.s.text(14, WORLD.height - 20, '✕ Abandon run', 12, '#ffffff')
        .setOrigin(0, 0.5)
        .setPadding(8, 3, 8, 3)
        .setBackgroundColor('#5a2a2a')
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () =>
          this.s.confirm('Abandon this run?', 'The run ends here. Your best progress is kept, and its camp loot is already at the camp.', 'Abandon', () => {
            recordProgress(run);
            // The graveyard keeps abandoned runs too.
            const camp = loadCamp();
            addGrave(run, camp);
            saveCamp(camp);
            clearRun();
            this.hide();
            this.s.results.showAbandoned();
          }),
        ),
    );
    this.ui = this.s.add.container(0, 0, items).setDepth(40);

    // Auto chooses the route too.
    if (this.s.auto && open.size) {
      const token = this.ui;
      this.s.time.delayedCall(900, () => {
        if (this.ui !== token || !this.s.auto || this.s.state !== 'map') return;
        this.go(run.map.nodes[autoPath(run)]);
      });
    }
  }

  hide(): void {
    this.ui?.destroy();
    this.ui = undefined;
  }

  /** Move to a node: fights start right away; anything else opens its screen. */
  private go(n: MapNode): void {
    const run = this.s.run!;
    if (this.s.state !== 'map') return;
    sound.unlock();
    sound.play('click');
    enterNode(run, n.id);
    saveRun(run);
    this.s.scene.restart({ run });
  }

  /** What a node is (tapping one you can't reach yet). */
  private describe(n: MapNode): void {
    const run = this.s.run!;
    const act = actDef(run.act);
    const text: Record<NodeType, string> = {
      fight: `Fight: ${act.name} regulars. Gold and XP.`,
      elite: (() => {
        const t = eliteTwist(run, n);
        return `Elite${t ? ` (${TWISTS[t].name})` : ''}: a tougher fight with a ${ENEMY_STATS[act.elite].label}.${t ? ` ${TWISTS[t].text}` : ''} More gold, more XP and a reward from ${t ? 'four' : 'three'} (usually a new ability).`;
      })(),
      chest: 'Chest: gold, and a reward for one hero.',
      campsite: isRecruitCampsite(run, n) ? 'Campsite: a new hero joins your party.' : 'Campsite: every hero trains (a new ability, or an upgrade once full).',
      shop: 'Shop: buy abilities and upgrades with gold.',
      event: 'Chance encounter: something unexpected. Who knows?',
      boss: `Boss: ${ENEMY_STATS[act.boss].label}. Beat it to finish the act.`,
    };
    this.tip?.setText(`${text[n.type]}${n.rich ? ' Golden: better loot.' : ''}`).setColor('#ffffff');
  }

  /** The party's leader inside the current node's badge, with a little pennant. */
  private partyMarker(x: number, feet: number): Phaser.GameObjects.GameObject[] {
    const run = this.s.run!;
    const key = spriteKey({ side: 'hero', kind: run.team[0] });
    const out: Phaser.GameObjects.GameObject[] = [];
    if (this.s.textures.exists(key)) {
      this.s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const img = this.s.add.image(x, feet, key).setScale(0.95);
      img.setOrigin(0.5, spriteOriginY(key, img.height));
      out.push(img);
    } else out.push(this.s.add.image(x, feet - 12, 'icon-nd-fight').setScale(24 / ICON_PX));
    // A little gold pennant on the badge's edge: you are here.
    const flag = this.s.add.graphics({ x: x + 14, y: feet - 6 });
    flag.fillStyle(0x4a2f1c).fillRect(0, -22, 2, 22);
    flag.fillStyle(0xffd166).fillTriangle(2, -22, 2, -14, 12, -18);
    out.push(flag);
    return out;
  }
}
