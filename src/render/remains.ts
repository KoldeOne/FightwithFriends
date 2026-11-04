import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import type { EnemyKind } from '../sim/types';

/** What a fallen enemy leaves on the ground, by what it was made of. */
type RemainsKind = 'blood' | 'bones' | 'ichor' | 'cultist' | 'ash';

const KIND: Record<EnemyKind, RemainsKind> = {
  grunt: 'blood',
  archer: 'blood',
  shaman: 'blood',
  brute: 'blood',
  warchief: 'blood',
  skeleton: 'bones',
  boneArcher: 'bones',
  boneKing: 'bones',
  ghoul: 'ichor',
  abomination: 'ichor',
  cultist: 'cultist',
  fiend: 'ash',
  imp: 'ash',
  shadowCaller: 'ash',
  hellhound: 'ash',
  pitBrute: 'ash',
  demonLord: 'ash',
};

/** Pool colours per kind (dark, mid). Bones are always bone-white (charred for demons). */
const POOL: Record<RemainsKind, [number, number] | null> = {
  blood: [0x4a0808, 0x7a1010],
  bones: null,
  ichor: [0x1f2e0c, 0x3d5a1a],
  cultist: [0x3a0a10, 0x6b1420],
  ash: [0x1e1e1e, 0x3a3a3a],
};

/** At most this many ground marks at once; the oldest fade away. */
const MAX_MARKS = 50;

/**
 * Ground marks for the length of a fight: what fallen enemies leave behind
 * (a pile of blood and bones, a crumbled skeleton, green ichor, smouldering
 * ash), blood spatter from heavy hits, scorch marks from fire and frost
 * patches from ice. Everything sits on the ground under the units and goes
 * when the fight ends.
 */
export class Remains {
  constructor(readonly s: BattleScene) {}

  private marks: Phaser.GameObjects.GameObject[] = [];

  private add(o: Phaser.GameObjects.Graphics | Phaser.GameObjects.Container): void {
    o.setDepth(4);
    this.marks.push(o);
    while (this.marks.length > MAX_MARKS) {
      const old = this.marks.shift()!;
      this.s.tweens.add({ targets: old, alpha: 0, duration: 400, onComplete: () => old.destroy() });
    }
  }

  /** A fallen enemy's remains: a pool or ash heap with bones on top; bosses leave more. */
  enemy(kind: EnemyKind, x: number, y: number, radius: number, boss: boolean): void {
    const k = KIND[kind] ?? 'blood';
    const g = this.s.add.graphics({ x, y });
    const size = radius * (boss ? 1.5 : 1);
    const pool = POOL[k];
    if (pool) {
      // An irregular splat: a few overlapping blobs, plus droplets around it.
      const [dark, mid] = pool;
      g.fillStyle(dark, 0.85).fillEllipse(0, 4, size * 2.2, size * 1.1);
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = size * (0.4 + Math.random() * 0.5);
        g.fillStyle(i % 2 ? mid : dark, 0.8).fillEllipse(Math.cos(a) * d, 4 + Math.sin(a) * d * 0.5, size * (0.5 + Math.random() * 0.5), size * (0.3 + Math.random() * 0.3));
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = size * (1.1 + Math.random() * 0.7);
        g.fillStyle(mid, 0.75).fillCircle(Math.cos(a) * d, 4 + Math.sin(a) * d * 0.5, 1 + Math.random() * 2);
      }
    }
    if (k === 'cultist') {
      // A torn scrap of purple robe.
      g.fillStyle(0x4a2a6a, 0.9).fillTriangle(-size * 0.6, 2, size * 0.2, -2, -size * 0.1, size * 0.5);
    }
    // Bones: a few crossed sticks with knobbed ends, and a skull.
    const bone = k === 'ash' ? 0x8a7a6a : 0xe8e0cc;
    const count = k === 'bones' ? 5 : 3;
    for (let i = 0; i < count + (boss ? 3 : 0); i++) this.bone(g, (Math.random() - 0.5) * size * 1.4, 2 + (Math.random() - 0.5) * size * 0.6, size * (0.5 + Math.random() * 0.4), Math.random() * Math.PI, bone);
    this.skull(g, (Math.random() - 0.5) * size * 0.6, -1, Math.max(4, size * 0.32), bone);
    if (boss) this.skull(g, size * 0.7, 4, Math.max(4, size * 0.25), bone);
    this.add(g);
    // Settling in: a quick drop, and for some a puff or embers.
    g.setScale(0.6).setAlpha(0);
    this.s.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    if (k === 'bones') this.dust(x, y, size, 0xd9d2c0);
    if (k === 'ash') this.embers(x, y, size);
    if (boss) this.drop(kind, x, y, radius);
  }

  /** A boss's dropped item, landing on its pile with a glint. */
  private drop(kind: EnemyKind, x: number, y: number, radius: number): void {
    const r = Math.max(10, radius);
    const tx = x + r * 0.85;
    const ty = y + r * 0.15;
    const g = this.s.add.graphics({ x: tx, y: ty - r * 1.6 });
    if (kind === 'warchief') this.axe(g, r);
    else if (kind === 'boneKing') this.crown(g, r);
    else if (kind === 'demonLord') this.demonSpoils(g, r);
    else return void g.destroy();
    this.add(g);
    g.setAlpha(0);
    this.s.tweens.add({
      targets: g,
      y: ty,
      alpha: 1,
      delay: 180,
      duration: 380,
      ease: 'Bounce.easeOut',
      onComplete: () => this.glint(tx + r * 0.25, ty - r * 0.45),
    });
  }

  /** The Warchief's crude axe: a rough wooden haft and a chipped iron head. */
  private axe(g: Phaser.GameObjects.Graphics, r: number): void {
    g.rotation = -0.5;
    g.lineStyle(3.5, 0x5a3a1e, 1).lineBetween(0, r * 0.75, 0, -r * 0.75);
    g.lineStyle(1.5, 0x8a5a2e, 1).lineBetween(-1, r * 0.4, -1, -r * 0.6);
    // Leather wrap near the grip.
    g.lineStyle(2, 0x2e1e10, 1).lineBetween(-2.5, r * 0.45, 2.5, r * 0.35).lineBetween(-2.5, r * 0.6, 2.5, r * 0.5);
    // A lopsided head, one notch out of the edge.
    const head = [
      { x: 1, y: -r * 0.7 },
      { x: r * 0.55, y: -r * 0.95 },
      { x: r * 0.7, y: -r * 0.55 },
      { x: r * 0.5, y: -r * 0.45 },
      { x: r * 0.62, y: -r * 0.25 },
      { x: 1, y: -r * 0.3 },
    ];
    g.fillStyle(0x7e7a74, 1).fillPoints(head, true);
    g.lineStyle(1.5, 0x1a1410, 0.9).strokePoints(head, true);
    g.lineStyle(1.5, 0xb8b4ae, 1).lineBetween(r * 0.55, -r * 0.93, r * 0.68, -r * 0.57);
    g.fillStyle(0x7a1010, 0.9).fillCircle(r * 0.6, -r * 0.35, 1.5);
  }

  /** The Bone King's crown: tarnished gold with five points and gems. */
  private crown(g: Phaser.GameObjects.Graphics, r: number): void {
    g.rotation = 0.25;
    const w = r * 1.1;
    const h = r * 0.55;
    const pts: { x: number; y: number }[] = [{ x: -w / 2, y: h / 2 }];
    for (let i = 0; i <= 4; i++) {
      const px = -w / 2 + (i * w) / 4;
      pts.push({ x: px, y: -h / 2 });
      if (i < 4) pts.push({ x: px + w / 8, y: 0 });
    }
    pts.push({ x: w / 2, y: h / 2 });
    g.fillStyle(0x8a6a1a, 1).fillPoints(pts, true);
    g.fillStyle(0xd4a62a, 1).fillRect(-w / 2, h * 0.1, w, h * 0.4);
    g.lineStyle(1, 0xffe08a, 0.9).lineBetween(-w / 2, h * 0.1, w / 2, h * 0.1);
    for (let i = 0; i <= 4; i++) g.fillStyle(0xffe08a, 1).fillCircle(-w / 2 + (i * w) / 4, -h / 2, 1.6);
    g.fillStyle(0x8a1a2a, 1).fillCircle(0, h * 0.3, 2.2);
    g.fillStyle(0x2a5a9a, 1).fillCircle(-w * 0.28, h * 0.3, 1.6).fillCircle(w * 0.28, h * 0.3, 1.6);
  }

  /** The Demon Lord's spoils: a burning sword across a horned skull. */
  private demonSpoils(g: Phaser.GameObjects.Graphics, r: number): void {
    // The horned skull, charred.
    const s = r * 0.32;
    g.lineStyle(3, 0x9a7a62, 1);
    g.beginPath().arc(-s * 1.6, -s * 1.2, s * 1.1, 0.2, 1.6).strokePath();
    g.beginPath().arc(s * 1.6, -s * 1.2, s * 1.1, Math.PI - 1.6, Math.PI - 0.2).strokePath();
    g.fillStyle(0x7a5a48, 1).fillTriangle(-s * 0.7, -s * 0.6, -s * 1.5, -s * 1.9, -s * 0.2, -s * 0.9);
    g.fillTriangle(s * 0.7, -s * 0.6, s * 1.5, -s * 1.9, s * 0.2, -s * 0.9);
    this.skull(g, 0, 0, s, 0x8a7a6a);
    g.fillStyle(0xff8c1a, 0.9).fillCircle(-s * 0.38, -s * 0.05, s * 0.14).fillCircle(s * 0.38, -s * 0.05, s * 0.14);
    // The sword, lying across it: a black blade with a glowing edge and flames.
    const L = r * 1.3;
    const a = -0.35;
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    const P = (t: number, o: number) => ({ x: cx * t - sy * o, y: s * 0.9 + sy * t + cx * o });
    g.fillStyle(0x1a1010, 1).fillPoints([P(-L * 0.25, -2.5), P(L * 0.7, -2), P(L * 0.8, 0), P(L * 0.7, 2), P(-L * 0.25, 2.5)], true);
    const e0 = P(-L * 0.25, -2.5);
    const e1 = P(L * 0.75, -1);
    g.lineStyle(1.2, 0xff6a1a, 1).lineBetween(e0.x, e0.y, e1.x, e1.y);
    const q0 = P(-L * 0.25, -6);
    const q1 = P(-L * 0.25, 6);
    g.lineStyle(3, 0x5a1a14, 1).lineBetween(q0.x, q0.y, q1.x, q1.y);
    const h0 = P(-L * 0.25, 0);
    const h1 = P(-L * 0.5, 0);
    g.lineStyle(3, 0x2a1a14, 1).lineBetween(h0.x, h0.y, h1.x, h1.y);
    for (let i = 0; i < 4; i++) {
      const b = P(L * (0.05 + i * 0.18), -2);
      g.fillStyle(i % 2 ? 0xffd166 : 0xff8c1a, 0.85).fillTriangle(b.x - 2, b.y, b.x + 2, b.y, b.x + 0.5, b.y - 4 - Math.random() * 3);
    }
  }

  /** A tiny four-point sparkle that flares and fades. */
  private glint(x: number, y: number): void {
    const g = this.s.add.graphics({ x, y }).setDepth(6);
    g.fillStyle(0xffffff, 1).fillTriangle(-1.2, 0, 1.2, 0, 0, -6).fillTriangle(-1.2, 0, 1.2, 0, 0, 6);
    g.fillTriangle(0, -1.2, 0, 1.2, -6, 0).fillTriangle(0, -1.2, 0, 1.2, 6, 0);
    g.fillCircle(0, 0, 1.5);
    g.setScale(0).setAlpha(0.95);
    this.s.tweens.add({ targets: g, scale: 1.1, angle: 45, duration: 180, yoyo: true, hold: 120, onComplete: () => g.destroy() });
  }

  /** A downed hero leaves a little blood under them. */
  hero(x: number, y: number, radius: number): void {
    const g = this.s.add.graphics({ x, y });
    g.fillStyle(0x4a0808, 0.7).fillEllipse(0, 6, radius * 2, radius * 0.9);
    g.fillStyle(0x7a1010, 0.7).fillEllipse(radius * 0.4, 8, radius * 0.8, radius * 0.4);
    this.add(g);
  }

  /** Spatter on the ground behind a heavy hit (direction: away from the attacker). */
  spatter(x: number, y: number, dx: number, dy: number, kind?: EnemyKind): void {
    const k = kind ? (KIND[kind] ?? 'blood') : 'blood';
    const pool = POOL[k] ?? [0x8a8070, 0xb0a890];
    const len = Math.hypot(dx, dy) || 1;
    const g = this.s.add.graphics({ x, y: y + 6 });
    for (let i = 0; i < 6; i++) {
      const d = 6 + Math.random() * 18;
      const spread = (Math.random() - 0.5) * 12;
      g.fillStyle(pool[i % 2], 0.7).fillCircle((dx / len) * d - (dy / len) * spread, ((dy / len) * d + (dx / len) * spread) * 0.5, 1 + Math.random() * 2);
    }
    this.add(g);
  }

  /** A fire spell's scorch mark: dark and smoky, fading out over a few seconds. */
  scorch(x: number, y: number, radius: number): void {
    const g = this.s.add.graphics({ x, y: y + 4 });
    g.fillStyle(0x1a1410, 0.55).fillEllipse(0, 0, radius * 2.4, radius * 1.2);
    g.fillStyle(0x2a1a10, 0.5).fillEllipse(radius * 0.2, 1, radius * 1.4, radius * 0.7);
    for (let i = 0; i < 4; i++) g.fillStyle(0xff8c1a, 0.6).fillCircle((Math.random() - 0.5) * radius * 1.6, (Math.random() - 0.5) * radius * 0.6, 1.5);
    this.add(g);
    this.s.tweens.add({ targets: g, alpha: 0, delay: 4000, duration: 2500, onComplete: () => this.remove(g) });
  }

  /** A frost patch: pale blue ice with a glint, melting away. */
  frost(x: number, y: number, radius: number): void {
    const g = this.s.add.graphics({ x, y: y + 4 });
    g.fillStyle(0xbfe6ff, 0.35).fillEllipse(0, 0, radius * 2.6, radius * 1.3);
    g.lineStyle(1, 0xffffff, 0.6);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(a) * radius * 1.1, Math.sin(a) * radius * 0.55);
    }
    this.add(g);
    this.s.tweens.add({ targets: g, alpha: 0, delay: 3000, duration: 2500, onComplete: () => this.remove(g) });
  }

  /** A holy light's glow on the ground, fading quickly. */
  glow(x: number, y: number, radius: number): void {
    const g = this.s.add.graphics({ x, y: y + 4 });
    g.fillStyle(0xfff3b0, 0.25).fillEllipse(0, 0, radius * 2.4, radius * 1.2);
    this.add(g);
    this.s.tweens.add({ targets: g, alpha: 0, delay: 600, duration: 1200, onComplete: () => this.remove(g) });
  }

  private remove(g: Phaser.GameObjects.GameObject): void {
    this.marks = this.marks.filter((m) => m !== g);
    g.destroy();
  }

  private bone(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, angle: number, color: number): void {
    const dx = (Math.cos(angle) * len) / 2;
    const dy = (Math.sin(angle) * len) / 4;
    g.lineStyle(2.5, color, 1).lineBetween(x - dx, y - dy, x + dx, y + dy);
    g.fillStyle(color, 1).fillCircle(x - dx, y - dy, 2).fillCircle(x + dx, y + dy, 2);
  }

  private skull(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    g.fillStyle(color, 1).fillCircle(x, y, r).fillRect(x - r * 0.55, y + r * 0.5, r * 1.1, r * 0.6);
    g.fillStyle(0x1a1410, 1).fillCircle(x - r * 0.38, y - r * 0.05, r * 0.28).fillCircle(x + r * 0.38, y - r * 0.05, r * 0.28);
  }

  /** A small cloud of dust as a skeleton crumbles. */
  private dust(x: number, y: number, size: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this.s.add.circle(x + (Math.random() - 0.5) * size, y, 3 + Math.random() * 3, color, 0.5).setDepth(6);
      this.s.tweens.add({ targets: p, y: y - 14 - Math.random() * 10, x: p.x + (Math.random() - 0.5) * 16, alpha: 0, scale: 1.8, duration: 600 + Math.random() * 300, onComplete: () => p.destroy() });
    }
  }

  /** Embers rising off a demon's ash, for a few seconds. */
  private embers(x: number, y: number, size: number): void {
    this.s.time.addEvent({
      delay: 160,
      repeat: 18,
      callback: () => {
        const p = this.s.add.circle(x + (Math.random() - 0.5) * size * 1.4, y + 2, 1.5, Math.random() < 0.5 ? 0xff8c1a : 0xffd166, 0.9).setDepth(6);
        this.s.tweens.add({ targets: p, y: y - 14 - Math.random() * 14, alpha: 0, duration: 700, onComplete: () => p.destroy() });
      },
    });
  }
}
