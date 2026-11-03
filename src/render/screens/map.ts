import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { actDef } from '../../sim/acts';
import { BOSS_INFO, ENEMY_STATS, WORLD } from '../../sim/content';
import { MAP_COLS, MAP_FLOORS, type MapNode, type NodeType } from '../../sim/map';
import { autoPath, availableNodes, enterNode, MAX_PARTY, RECRUIT_CAMPSITES, saveRun } from '../../sim/run';
import { sound } from '../sound';
import { ICON_PX } from '../theme';

/** Where the map is drawn (between the top bar and the hero panels). */
const TOP = 180;
const BOTTOM = 742;
const LEFT = 58;
const RIGHT = WORLD.width - 58;

const NODE_NAMES: Record<NodeType, string> = { fight: 'Fight', elite: 'Elite', chest: 'Chest', campsite: 'Campsite', shop: 'Shop', event: 'Event', boss: 'Boss' };

/** Map colours per act. */
const LOOK = {
  forest: { bg: 0x16261a, panel: 0x1d3322, line: 0x5d7a5a, path: 0xffd166 },
  crypt: { bg: 0x161a24, panel: 0x1e2433, line: 0x5b6680, path: 0xd9e3ff },
  hellscape: { bg: 0x241414, panel: 0x331b1b, line: 0x7a4a40, path: 0xffb347 },
};

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
      y: BOTTOM - (n.floor / MAP_FLOORS) * (BOTTOM - TOP) + jy,
    };
  }

  show(): void {
    const run = this.s.run!;
    const map = run.map;
    const act = actDef(run.act);
    const look = LOOK[act.look];
    this.ui?.destroy();
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.s.add.rectangle(0, 96, WORLD.width, WORLD.hudTop - 96, look.bg).setOrigin(0, 0).setInteractive());
    items.push(this.s.add.rectangle(10, 104, WORLD.width - 20, WORLD.hudTop - 118, look.panel).setOrigin(0, 0).setStrokeStyle(1, look.line));
    // The act's boss, so you know what's coming.
    const bossKind = act.boss;
    const boss = BOSS_INFO[bossKind];
    const special = boss?.moves[1];
    items.push(
      this.s.text(WORLD.width / 2, 112, `${act.theme}  Boss: ${ENEMY_STATS[bossKind].label}`, 12, '#e6e9f0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500),
    );
    if (special) items.push(this.s.text(WORLD.width / 2, 130, `${special.name}: ${special.text}`, 11, '#ffd9c2').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500));

    // Links between nodes; the way you came as a dotted line.
    const g = this.s.add.graphics();
    items.push(g);
    const visited = new Set(run.visited);
    const steps = new Set<string>();
    for (let i = 1; i < run.visited.length; i++) steps.add(`${run.visited[i - 1]}>${run.visited[i]}`);
    for (const n of Object.values(map.nodes)) {
      const a = this.pos(n);
      for (const id of n.next) {
        const b = this.pos(map.nodes[id]);
        if (steps.has(`${n.id}>${id}`)) continue;
        g.lineStyle(2, look.line, 0.55).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    for (let i = 1; i < run.visited.length; i++) this.dotted(g, this.pos(map.nodes[run.visited[i - 1]]), this.pos(map.nodes[run.visited[i]]), look.path);

    // Nodes.
    const open = new Set(availableNodes(run).map((n) => n.id));
    for (const n of Object.values(map.nodes)) {
      const p = this.pos(n);
      const isOpen = open.has(n.id);
      const here = run.at === n.id;
      const size = n.type === 'boss' ? 46 : 28;
      if (n.rich && n.type !== 'boss') items.push(this.s.add.circle(p.x, p.y, size / 2 + 6, 0xffd166, 0.25).setStrokeStyle(2, 0xffd166, 0.9));
      if (here) items.push(this.s.add.circle(p.x, p.y, size / 2 + 7).setStrokeStyle(3, look.path));
      const icon = this.s.add.image(p.x, p.y, `icon-nd-${n.type}`).setScale(size / ICON_PX);
      icon.setAlpha(isOpen || here ? 1 : visited.has(n.id) ? 0.55 : n.floor < (run.at ? map.nodes[run.at].floor : 0) ? 0.3 : 0.8);
      icon.setInteractive({ useHandCursor: isOpen }).on('pointerdown', () => (isOpen ? this.go(n) : this.describe(n)));
      if (isOpen) {
        const ring = this.s.add.circle(p.x, p.y, size / 2 + 5).setStrokeStyle(2, 0xffffff, 0.9);
        items.push(ring);
        this.s.tweens.add({ targets: ring, scale: 1.25, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
      }
      items.push(icon);
    }

    // Legend.
    const types: NodeType[] = ['fight', 'elite', 'chest', 'campsite', 'shop', 'event'];
    types.forEach((t, i) => {
      const x = 30 + i * 80;
      items.push(this.s.add.image(x, 770, `icon-nd-${t}`).setScale(18 / ICON_PX), this.s.text(x + 13, 763, NODE_NAMES[t], 11, '#c9d1e0'));
    });
    items.push(this.s.add.circle(WORLD.width - 30, 770, 9, 0xffd166, 0.25).setStrokeStyle(2, 0xffd166, 0.9), this.s.text(WORLD.width - 44, 784, 'golden', 9, '#ffd166').setOrigin(0.5, 0));
    this.tip = this.s.text(WORLD.width / 2, 152, open.size ? 'Choose where to go next.' : '', 12, '#7dff9b').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(500);
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
    const recruitsLeft = Math.max(0, Math.min(RECRUIT_CAMPSITES - run.campsites, MAX_PARTY - run.team.length));
    const text: Record<NodeType, string> = {
      fight: `Fight: ${act.name} regulars. Gold and XP.`,
      elite: `Elite: a tougher fight with a ${ENEMY_STATS[act.elite].label}. More gold, more XP and an upgrade.`,
      chest: 'Chest: gold, and a pick for every hero.',
      campsite: recruitsLeft ? 'Campsite: a new hero joins your party.' : 'Campsite: every hero trains (a new ability, or an upgrade once full).',
      shop: 'Shop: buy abilities and upgrades with gold.',
      event: 'Chance encounter: something unexpected. Who knows?',
      boss: `Boss: ${ENEMY_STATS[act.boss].label}. Beat it to finish the act.`,
    };
    this.tip?.setText(`${text[n.type]}${n.rich ? ' Golden: better loot.' : ''}`).setColor('#ffffff');
  }

  /** A dotted line between two points. */
  private dotted(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, color: number): void {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.floor(len / 9));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      g.fillStyle(color, 0.95).fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 2.2);
    }
  }
}
