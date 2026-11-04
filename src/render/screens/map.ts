import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { actDef } from '../../sim/acts';
import { BOSS_INFO, ENEMY_STATS, WORLD } from '../../sim/content';
import { MAP_COLS, MAP_FLOORS, type MapNode, type NodeType } from '../../sim/map';
import { autoPath, availableNodes, eliteTwist, enterNode, isRecruitCampsite, saveRun, TWISTS } from '../../sim/run';
import { sound } from '../sound';
import { relicIcon } from '../relicIcons';
import { attunementLine, RELICS } from '../../sim/relics';
import { ICON_PX, spriteKey, spriteOriginY } from '../theme';
import { along, drawFog, drawMapTerrain, drawRoad, drawStartCamp, linkPoints, NODE_RIM } from '../mapArt';

/** Where the map is drawn (between the top bar and the hero panels). */
const BOTTOM = 700;
/** The map shows where you stand, your choices, the floor after, and one more faded into the fog. */
const VIEW = 3;
/** Height of one floor. */
const ROW = 150;
/** How far from the centre the outermost nodes of a row sit. */
const SPREAD = 190;
/** The map panel. */
const BOX = { x: 10, y: 104, w: WORLD.width - 20, h: WORLD.hudTop - 118 };
/** Roads stop at the legend strip. */
const ROAD_BOTTOM = 752;
/** How long the party takes to walk to the next node, and the board to slide it to the centre. */
const WALK_MS = 600;
const SLIDE_MS = 380;

const NODE_NAMES: Record<NodeType, string> = { fight: 'Fight', elite: 'Elite', chest: 'Chest', campsite: 'Campsite', shop: 'Shop', event: 'Event', boss: 'Boss' };

/**
 * The act's map, around where you stand: your node at the bottom centre, the
 * two places you can go next spread across the width, the floor after that,
 * and one more fading into fog. Roads you can no longer take aren't shown.
 * Tap a node to go there: your party walks the road, the board slides it to
 * the centre, and the next choices appear. Fights start straight away.
 */
export class MapScreen {
  constructor(readonly s: BattleScene) {}

  private ui?: Phaser.GameObjects.Container;
  private board?: Phaser.GameObjects.Container;
  private scenery?: Phaser.GameObjects.Graphics;
  private tip?: Phaser.GameObjects.Text;

  /** The floor at the bottom of the view: where you stand (-1 = the starting camp). */
  private base = -1;
  private leader?: Phaser.GameObjects.Container;
  private moving = false;
  /** Where each node in view is drawn. */
  private spots = new Map<string, { x: number; y: number }>();

  private rowY(floor: number): number {
    return BOTTOM - (floor - this.base) * ROW;
  }

  /** Where the starting camp sits (below the first floor). */
  private camp(): { x: number; y: number } {
    return { x: WORLD.width / 2, y: this.rowY(-1) };
  }

  /** Screen position of a node in view (off to the side if it isn't). */
  pos(n: MapNode): { x: number; y: number } {
    return this.spots.get(n.id) ?? { x: WORLD.width / 2, y: this.rowY(n.floor) };
  }

  /**
   * Lay out what's reachable from where you stand, floor by floor: each node
   * gets a sideways offset from its parent (one column left or right around
   * the ring), and each row is spread across the full width in that order,
   * so roads never cross. The boss always sits in the middle.
   */
  private layout(): MapNode[] {
    const run = this.s.run!;
    const map = run.map;
    this.spots.clear();
    const offset = new Map<string, number>();
    const step = (from: number | undefined, to: MapNode, parentOffset: number) => {
      if (offset.has(to.id)) return;
      let d = from === undefined ? 0 : to.col - from;
      if (map.ring) d = ((((d + MAP_COLS / 2) % MAP_COLS) + MAP_COLS) % MAP_COLS) - MAP_COLS / 2;
      offset.set(to.id, parentOffset + d);
    };
    const first = run.at ? [map.nodes[run.at]] : (map.start ?? map.floors[0]).map((id) => map.nodes[id]);
    if (run.at) offset.set(run.at, 0);
    else {
      // From the camp: its roads spread out like any other fork.
      const mid = first.reduce((a, n) => a + n.col, 0) / first.length;
      for (const n of first) step(undefined, n, map.ring ? Math.sign(n.col - mid) : n.col - mid);
    }
    const inView: MapNode[] = [];
    let frontier = first;
    for (let f = this.base + (run.at ? 0 : 1); frontier.length && f <= this.base + VIEW; f++) {
      inView.push(...frontier);
      const next: MapNode[] = [];
      for (const n of frontier)
        for (const id of n.next) {
          const k = map.nodes[id];
          step(n.col, k, offset.get(n.id)!);
          if (!next.includes(k)) next.push(k);
        }
      frontier = next;
    }
    // Spread each row across the width, in offset order.
    for (let f = this.base; f <= this.base + VIEW; f++) {
      const row = inView.filter((n) => n.floor === f).sort((a, b) => offset.get(a.id)! - offset.get(b.id)!);
      const max = Math.max(...row.map((n) => Math.abs(offset.get(n.id)!)), 0);
      for (const n of row) {
        const o = offset.get(n.id)!;
        const x = n.type === 'boss' || !max ? WORLD.width / 2 : WORLD.width / 2 + (o / max) * SPREAD;
        this.spots.set(n.id, { x, y: this.rowY(f) });
      }
    }
    return inView;
  }

  show(): void {
    const run = this.s.run!;
    const map = run.map;
    const act = actDef(run.act);
    this.ui?.destroy();
    this.moving = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    this.base = run.at ? map.nodes[run.at].floor : -1;
    const top = this.base + VIEW;
    const nodes = this.layout();
    const links: { from: MapNode | undefined; to: MapNode; pts: { x: number; y: number }[] }[] = [];
    for (const n of nodes) for (const id of n.next) if (this.spots.has(id)) links.push({ from: n, to: map.nodes[id], pts: linkPoints(this.pos(n), this.pos(map.nodes[id]), `${n.id}>${id}`) });
    if (!run.at) for (const id of map.start ?? map.floors[0]) links.push({ from: undefined, to: map.nodes[id], pts: linkPoints(this.camp(), this.pos(map.nodes[id]), `start>${id}`) });
    // Roads off the top of the view, into the fog.
    const fogRoads: { x: number; y: number }[][] = [];
    for (const n of nodes) if (n.floor === top) for (const id of n.next) fogRoads.push(linkPoints(this.pos(n), { x: this.pos(n).x + (map.nodes[id].col > n.col ? 40 : -40), y: this.rowY(top + 1) }, `${n.id}>${id}`));
    // The road you came in on, from below the view.
    const cameFrom = run.at ? linkPoints({ x: WORLD.width / 2, y: this.rowY(this.base - 1) }, this.pos(map.nodes[run.at]), `in>${run.at}`) : undefined;

    // Static layers (background, ground, frame), then the board that slides (scenery, roads, nodes, party).
    const terrain = drawMapTerrain(
      this.s,
      act.look,
      BOX,
      [...nodes.map((n) => this.pos(n)), ...(run.at ? [] : [this.camp()])],
      [...links.map((l) => l.pts), ...fogRoads, ...(cameFrom ? [cameFrom] : [])],
      { from: this.base - 2, to: top + 2, rowY: (f) => this.rowY(f), row: ROW },
    );
    items.push(...terrain.under);
    const board: Phaser.GameObjects.GameObject[] = [];
    const g = this.s.add.graphics();
    board.push(g);
    const open = new Set(availableNodes(run).map((n) => n.id));
    for (const pts of fogRoads) drawRoad(g, act.look, pts, 'ahead', ROAD_BOTTOM);
    for (const l of links) if (run.at ? l.from?.id !== run.at : !!l.from) drawRoad(g, act.look, l.pts, 'ahead', ROAD_BOTTOM);
    for (const l of links) if (run.at ? l.from?.id === run.at : !l.from) drawRoad(g, act.look, l.pts, 'open', ROAD_BOTTOM);
    if (cameFrom) drawRoad(g, act.look, cameFrom, 'taken', ROAD_BOTTOM);
    if (!run.at) board.push(...drawStartCamp(this.s, this.camp().x, this.camp().y));

    for (const n of nodes) {
      const p = this.pos(n);
      const isOpen = open.has(n.id);
      const here = run.at === n.id;
      const boss = n.type === 'boss';
      const size = boss ? 40 : 28;
      const r = size / 2 + (boss ? 8 : 7);
      // The furthest row fades into the fog.
      const alpha = n.floor === top && !boss ? 0.55 : 1;
      const badge = this.s.add.graphics({ x: p.x, y: p.y }).setAlpha(alpha);
      if (boss) {
        const glow = this.s.add.circle(p.x, p.y, r + 14, 0xff3a2a, 0.18);
        this.s.tweens.add({ targets: glow, scale: 1.15, alpha: 0.08, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        board.push(glow);
      }
      if (n.rich && !boss) badge.fillStyle(0xffd166, 0.28).fillCircle(0, 0, r + 6).lineStyle(2, 0xffd166, 0.9).strokeCircle(0, 0, r + 5);
      badge.fillStyle(0x000000, 0.35).fillEllipse(2, r * 0.75, r * 2.1, r * 0.8);
      badge.fillStyle(0x15120f).fillCircle(0, 0, r);
      badge.lineStyle(boss ? 4 : 3, NODE_RIM[n.type], 1).strokeCircle(0, 0, r);
      if (boss) badge.lineStyle(1.5, 0xffd166, 0.8).strokeCircle(0, 0, r - 4);
      badge.fillStyle(0xffffff, 0.08).fillCircle(-r * 0.25, -r * 0.3, r * 0.55);
      board.push(badge);
      const bossKey = spriteKey({ side: 'enemy', kind: act.boss });
      let icon: Phaser.GameObjects.Image;
      if (boss && this.s.textures.exists(bossKey)) {
        this.s.textures.get(bossKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
        icon = this.s.add.image(p.x, p.y + r - 6, bossKey).setScale(1.4);
        icon.setOrigin(0.5, spriteOriginY(bossKey, icon.height));
      } else icon = this.s.add.image(p.x, p.y, `icon-nd-${n.type}`).setScale(size / ICON_PX);
      icon.setAlpha(alpha);
      const hit = this.s.add.circle(p.x, p.y, r + 6, 0xffffff, 0.001).setInteractive({ useHandCursor: isOpen }).on('pointerdown', () => (isOpen ? this.go(n) : this.describe(n)));
      if (isOpen) {
        const ring = this.s.add.circle(p.x, p.y, r + 2).setStrokeStyle(2, 0xffffff, 0.9);
        board.push(ring);
        this.s.tweens.add({ targets: ring, scale: 1.3, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
      }
      board.push(icon, hit);
      if (here) icon.setVisible(false);
      const twist = eliteTwist(run, n);
      if (twist) {
        const tw = this.s.text(p.x, p.y + r + 1, TWISTS[twist].name, 11, '#ff9f9f').setOrigin(0.5, 0).setAlpha(alpha);
        tw.setStroke('#000000', 3);
        board.push(tw);
      }
    }
    const at = run.at ? this.pos(map.nodes[run.at]) : this.camp();
    this.leader = this.partyMarker(at.x, at.y + (run.at ? 16 : 6));
    board.push(this.leader);

    // The board (and the scenery) are clipped to the map panel, so they can slide.
    const mask = this.s.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12).createGeometryMask();
    this.scenery = terrain.ground.setMask(mask);
    this.board = this.s.add.container(0, 0, board).setMask(mask);
    items.push(this.scenery, this.board, ...terrain.over);

    // Fog over the floors further up (until the boss is in view).
    if (top < MAP_FLOORS) items.push(...drawFog(this.s, act.look, BOX, 170));
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
    items.push(...this.relicStrip());
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
        // Slide the board so the chosen node comes to the bottom centre (the scenery only scrolls down).
        const dx = WORLD.width / 2 - to.x;
        const dy = BOTTOM - to.y;
        if (this.board) this.s.tweens.add({ targets: this.board, x: dx, y: dy, duration: SLIDE_MS, ease: 'Sine.easeInOut' });
        if (this.scenery) this.s.tweens.add({ targets: this.scenery, y: dy, duration: SLIDE_MS, ease: 'Sine.easeInOut' });
        this.s.time.delayedCall(SLIDE_MS + 20, () => {
          enterNode(run, n.id);
          saveRun(run);
          this.s.scene.restart({ run });
        });
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

  /** Under the party panel: the relics you carry (tap one for what it does) and the party's attunement. */
  private relicStrip(): Phaser.GameObjects.GameObject[] {
    const run = this.s.run!;
    const y = WORLD.height - 26;
    const out: Phaser.GameObjects.GameObject[] = [];
    let x = 14;
    if (run.relics.length) out.push(this.s.text(x, y - 8, 'Relics', 11, '#ffd166').setFontStyle('bold'));
    x += run.relics.length ? 48 : 0;
    for (const id of run.relics) {
      const img = this.s.add.image(x + 10, y, relicIcon(id)).setScale(20 / 14).setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.tip?.setText(`${RELICS[id].name}: ${RELICS[id].text}`).setColor('#ffd166'));
      out.push(img);
      x += 24;
    }
    const line = attunementLine(run.builds, run.relics);
    if (line) out.push(this.s.text(x + 8, y - 8, `Attuned: ${line}`, 11, '#c9d1e0'));
    return out;
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
