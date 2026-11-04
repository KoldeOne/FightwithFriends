import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { actDef } from '../../sim/acts';
import { BOSS_INFO, ENEMY_STATS, WORLD } from '../../sim/content';
import { MAP_COLS, MAP_FLOORS, type MapNode, type NodeType } from '../../sim/map';
import { autoPath, availableNodes, eliteTwist, enterNode, isRecruitCampsite, saveRun, TWISTS } from '../../sim/run';
import { sound } from '../sound';
import { ICON_PX, spriteKey, spriteOriginY } from '../theme';
import { along, drawFog, drawMapTerrain, drawRoad, drawStartCamp, linkPoints, NODE_RIM } from '../mapArt';

/** Where the map is drawn (between the top bar and the hero panels). */
const BOTTOM = 708;
const LEFT = 58;
const RIGHT = WORLD.width - 58;
/** The map is zoomed in: the floor you're on at the bottom, then this many floors above it; the rest is in fog. */
const VIEW = 4;
/** Height of one floor. */
const ROW = 116;
/** The map panel. */
const BOX = { x: 10, y: 104, w: WORLD.width - 20, h: WORLD.hudTop - 118 };
/** Roads stop at the legend strip. */
const ROAD_BOTTOM = 752;
/** How long the party takes to walk to the next node. */
const WALK_MS = 650;

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

  /** The floor at the bottom of the view: where you stand (-1 = the starting camp). */
  private base = -1;
  private leader?: Phaser.GameObjects.Container;
  private moving = false;

  private rowY(floor: number): number {
    return BOTTOM - (floor - this.base) * ROW;
  }

  /** Where the starting camp sits (below the first floor). */
  private camp(): { x: number; y: number } {
    return { x: WORLD.width / 2, y: this.rowY(-1) };
  }

  /** Screen position of a node (a little jitter so the map doesn't look like graph paper). */
  pos(n: MapNode): { x: number; y: number } {
    let h = 0;
    for (const ch of n.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const jx = ((h % 17) - 8) * (n.type === 'boss' ? 0 : 1);
    const jy = (((h >> 5) % 11) - 5) * (n.type === 'boss' ? 0 : 1);
    return {
      x: LEFT + (n.col / (MAP_COLS - 1)) * (RIGHT - LEFT) + jx,
      y: this.rowY(n.floor) + jy * 2,
    };
  }

  show(): void {
    const run = this.s.run!;
    const map = run.map;
    const act = actDef(run.act);
    this.ui?.destroy();
    this.moving = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    const visited = new Set(run.visited);
    this.base = run.at ? map.nodes[run.at].floor : -1;
    const top = this.base + VIEW;
    // Only where you can still go: the nodes reachable from where you stand, on the next few floors
    // (what's behind you is done, the roads you can no longer take are gone, and what's beyond is in fog).
    const reach = new Set<string>(run.at ? [run.at] : []);
    const queue = run.at ? [run.at] : [...map.floors[0]];
    for (const id of queue) {
      reach.add(id);
      for (const nx of map.nodes[id].next) if (!reach.has(nx)) queue.push(nx);
    }
    const inView = (n: MapNode) => reach.has(n.id) && n.floor >= this.base && n.floor <= top;
    const nodes = Object.values(map.nodes).filter(inView);
    const links: { from: MapNode | undefined; to: MapNode; pts: { x: number; y: number }[] }[] = [];
    for (const n of nodes) {
      for (const id of n.next) links.push({ from: n, to: map.nodes[id], pts: linkPoints(this.pos(n), this.pos(map.nodes[id]), `${n.id}>${id}`) });
    }
    // At the start, roads lead from the camp to every first-floor node.
    if (!run.at) for (const id of map.floors[0]) links.push({ from: undefined, to: map.nodes[id], pts: linkPoints(this.camp(), this.pos(map.nodes[id]), `start>${id}`) });
    // The road you came in on, from below the view.
    const prev = run.visited.length > 1 ? map.nodes[run.visited[run.visited.length - 2]] : undefined;
    const cameFrom = run.at ? linkPoints(prev ? this.pos(prev) : this.camp(), this.pos(map.nodes[run.at]), `${prev?.id ?? 'start'}>${run.at}`) : undefined;

    items.push(
      ...drawMapTerrain(
        this.s,
        act.look,
        BOX,
        [...nodes.map((n) => this.pos(n)), ...(run.at ? [] : [this.camp()])],
        [...links.map((l) => l.pts), ...(cameFrom ? [cameFrom] : [])],
        { from: this.base - 1, to: top + 2, rowY: (f) => this.rowY(f), row: ROW },
      ),
    );

    // Roads: dimmer ahead, gold dashes from where you stand, a gold trail behind you.
    const g = this.s.add.graphics();
    items.push(g);
    const open = new Set(availableNodes(run).map((n) => n.id));
    for (const l of links) if (l.from?.id !== run.at || !run.at) drawRoad(g, act.look, l.pts, 'ahead', ROAD_BOTTOM);
    for (const l of links) if (run.at ? l.from?.id === run.at : !l.from) drawRoad(g, act.look, l.pts, 'open', ROAD_BOTTOM);
    if (cameFrom) drawRoad(g, act.look, cameFrom, 'taken', ROAD_BOTTOM);
    if (!run.at) items.push(...drawStartCamp(this.s, this.camp().x, this.camp().y));

    // Nodes.
    for (const n of nodes) {
      const p = this.pos(n);
      const isOpen = open.has(n.id);
      const here = run.at === n.id;
      const boss = n.type === 'boss';
      const size = boss ? 40 : 26;
      const r = size / 2 + (boss ? 8 : 6);
      const alpha = isOpen || here ? 1 : 0.9;
      // A round badge: shadow, dark disc, a rim in the node type's colour.
      const badge = this.s.add.graphics({ x: p.x, y: p.y }).setAlpha(alpha);
      if (boss) {
        const glow = this.s.add.circle(p.x, p.y, r + 14, 0xff3a2a, 0.18);
        this.s.tweens.add({ targets: glow, scale: 1.15, alpha: 0.08, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        items.push(glow);
      }
      if (n.rich && !boss) badge.fillStyle(0xffd166, 0.28).fillCircle(0, 0, r + 6).lineStyle(2, 0xffd166, 0.9).strokeCircle(0, 0, r + 5);
      badge.fillStyle(0x000000, 0.35).fillEllipse(2, r * 0.75, r * 2.1, r * 0.8);
      badge.fillStyle(0x15120f).fillCircle(0, 0, r);
      badge.lineStyle(boss ? 4 : 3, NODE_RIM[n.type], 1).strokeCircle(0, 0, r);
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
      // A generous tap area: the whole badge.
      const hit = this.s.add.circle(p.x, p.y, r + 4, 0xffffff, 0.001).setInteractive({ useHandCursor: isOpen }).on('pointerdown', () => (isOpen ? this.go(n) : this.describe(n)));
      if (isOpen) {
        const ring = this.s.add.circle(p.x, p.y, r + 2).setStrokeStyle(2, 0xffffff, 0.9);
        items.push(ring);
        this.s.tweens.add({ targets: ring, scale: 1.3, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
      }
      items.push(icon, hit);
      // Your party stands on the node you're at (in place of its icon).
      if (here) icon.setVisible(false);
      // An elite with a twist says what it is.
      const twist = eliteTwist(run, n);
      if (twist) {
        const tw = this.s.text(p.x, p.y + r + 1, TWISTS[twist].name, 11, '#ff9f9f').setOrigin(0.5, 0);
        tw.setStroke('#000000', 3);
        items.push(tw);
      }
    }
    // The party leader, on your node or at the camp.
    const at = run.at ? this.pos(map.nodes[run.at]) : this.camp();
    this.leader = this.partyMarker(at.x, at.y + (run.at ? 14 : 6));
    items.push(this.leader);

    // Fog over the floors further up (until the boss is in view).
    if (top < MAP_FLOORS) items.push(...drawFog(this.s, act.look, BOX, 150));
    // The act and its boss, on top of the fog; the boss's move only on the floor before it.
    const bossKind = act.boss;
    const special = BOSS_INFO[bossKind]?.moves[1];
    items.push(
      this.s.text(WORLD.width / 2, 112, `${act.theme}  Boss: ${ENEMY_STATS[bossKind].label}`, 12, '#e6e9f0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500),
      this.s.text(WORLD.width - 22, 112 + 18, run.at ? `Floor ${this.base + 1} of ${MAP_FLOORS}` : 'The start', 11, '#8f9bb3').setOrigin(1, 0),
    );
    if (special && this.base === MAP_FLOORS - 1) items.push(this.s.text(WORLD.width / 2, 130, `${special.name}: ${special.text}`, 11, '#ffd9c2').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500));

    // Legend, on a darker strip.
    items.push(this.s.add.rectangle(BOX.x + 4, BOX.y + BOX.h - 40, BOX.w - 8, 36, 0x000000, 0.45).setOrigin(0, 0));
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
    if (this.s.state !== 'map' || this.moving) return;
    this.moving = true;
    sound.unlock();
    sound.play('click');
    // The party walks the road to it first.
    const from = run.at ? this.pos(run.map.nodes[run.at]) : this.camp();
    const to = this.pos(n);
    const pts = linkPoints(from, to, `${run.at ?? 'start'}>${n.id}`);
    const leader = this.leader;
    const lift = leader ? leader.y - from.y : 0;
    const step = { t: 0 };
    this.s.tweens.add({
      targets: step,
      t: 1,
      duration: WALK_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const p = along(pts, step.t);
        leader?.setPosition(p.x, p.y + lift);
        const sprite = leader?.list.find((o) => o instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
        sprite?.setFlipX(to.x < from.x);
      },
      onComplete: () => {
        enterNode(run, n.id);
        saveRun(run);
        this.s.scene.restart({ run });
      },
    });
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

  /** The party's leader with a little gold pennant: you are here. */
  private partyMarker(x: number, feet: number): Phaser.GameObjects.Container {
    const run = this.s.run!;
    const key = spriteKey({ side: 'hero', kind: run.team[0] });
    const parts: Phaser.GameObjects.GameObject[] = [this.s.add.ellipse(0, 0, 22, 7, 0x000000, 0.4)];
    if (this.s.textures.exists(key)) {
      this.s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const img = this.s.add.image(0, 0, key).setScale(1.05);
      img.setOrigin(0.5, spriteOriginY(key, img.height));
      parts.push(img);
    } else parts.push(this.s.add.image(0, -12, 'icon-nd-fight').setScale(24 / ICON_PX));
    const flag = this.s.add.graphics({ x: 14, y: -4 });
    flag.fillStyle(0x4a2f1c).fillRect(0, -24, 2, 24);
    flag.fillStyle(0xffd166).fillTriangle(2, -24, 2, -15, 13, -19.5);
    parts.push(flag);
    return this.s.add.container(x, feet, parts);
  }

}
