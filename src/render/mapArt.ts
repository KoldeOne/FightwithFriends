import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { WORLD } from '../sim/content';

type Look = 'forest' | 'crypt' | 'hellscape';
type Pt = { x: number; y: number };

/** Each act's map palette: ground, path lines, the trail you walked, and its scenery. */
export const MAP_LOOK: Record<Look, { bg: number; ground: number; patch: number; line: number; path: number; frame: number }> = {
  forest: { bg: 0x13201a, ground: 0x2b4a2c, patch: 0x335a33, line: 0x8fa874, path: 0xffd166, frame: 0x5a4028 },
  crypt: { bg: 0x11141c, ground: 0x2a2f3d, patch: 0x323848, line: 0x8792ad, path: 0xd9e3ff, frame: 0x4a5066 },
  hellscape: { bg: 0x1c0d0b, ground: 0x351a15, patch: 0x41211a, line: 0xa86a50, path: 0xffb347, frame: 0x5a2418 },
};

/** Node rims by type, so the map reads at a glance. */
export const NODE_RIM: Record<string, number> = {
  fight: 0xa9b2c4,
  elite: 0xe04a4a,
  chest: 0xe0a83a,
  campsite: 0xff8c1a,
  shop: 0x4ac27a,
  event: 0xa66de0,
  boss: 0xff4d4d,
};

/** A link's curve: a gentle bend, the same every time for the same two nodes. */
export function linkPoints(a: Pt, b: Pt, key: string, steps = 14): Pt[] {
  let h = 0;
  for (const ch of key) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const bend = ((h % 21) - 10) * 1.2;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cx = mx + (-(b.y - a.y) / len) * bend;
  const cy = my + ((b.x - a.x) / len) * bend;
  const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(a.x, a.y), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(b.x, b.y));
  return curve.getPoints(steps).map((p) => ({ x: p.x, y: p.y }));
}

/** Draw a curve as a dashed line (or solid). */
export function strokeCurve(g: Phaser.GameObjects.Graphics, pts: Pt[], width: number, color: number, alpha: number, dashed: boolean): void {
  g.lineStyle(width, color, alpha);
  for (let i = 1; i < pts.length; i++) if (!dashed || i % 2) g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
}

/**
 * The act's terrain under the map: mottled ground and scenery (trees and
 * ponds; tombstones, pillars and candles; lava seams, spikes and embers),
 * kept clear of the nodes and paths so nothing hides a choice.
 */
export function drawMapTerrain(s: BattleScene, look: Look, box: { x: number; y: number; w: number; h: number }, nodes: Pt[], links: Pt[][]): Phaser.GameObjects.GameObject[] {
  const c = MAP_LOOK[look];
  const g = s.add.graphics();
  let seed = 97;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const { x: bx, y: by, w: bw, h: bh } = box;
  g.fillStyle(c.ground).fillRoundedRect(bx, by, bw, bh, 12);
  for (let i = 0; i < 70; i++) g.fillStyle(rand() < 0.5 ? c.patch : c.bg, rand() < 0.5 ? 0.5 : 0.25).fillEllipse(bx + 10 + rand() * (bw - 20), by + 10 + rand() * (bh - 20), 30 + rand() * 80, 14 + rand() * 40);
  /** Somewhere open: not on a node or a path. */
  const clear = (px: number, py: number, r: number) => {
    // Not under the header text at the top or the legend at the bottom either.
    if (px < bx + r + 4 || px > bx + bw - r - 4 || py < by + r + 30 || py > by + bh - r - 44) return false;
    for (const n of nodes) if (Math.hypot(n.x - px, n.y - py) < 26 + r) return false;
    for (const l of links) for (const p of l) if (Math.hypot(p.x - px, p.y - py) < 9 + r) return false;
    return true;
  };
  const spots = (count: number, r: number, f: (x: number, y: number) => void) => {
    for (let placed = 0, tries = 0; placed < count && tries < count * 40; tries++) {
      const px = bx + rand() * bw;
      const py = by + rand() * bh;
      if (!clear(px, py, r)) continue;
      f(px, py);
      placed++;
    }
  };
  if (look === 'forest') {
    spots(3, 16, (x, y) => {
      g.fillStyle(0x1f4a5a).fillEllipse(x, y, 34, 18);
      g.fillStyle(0x3a7a8a, 0.8).fillEllipse(x - 4, y - 2, 18, 7);
    });
    spots(46, 11, (x, y) => {
      g.fillStyle(0x000000, 0.25).fillEllipse(x + 2, y + 9, 22, 7);
      g.fillStyle(0x4a2f1c).fillRect(x - 2, y + 2, 4, 7);
      g.fillStyle(rand() < 0.3 ? 0x24502a : 0x1d4224).fillCircle(x, y - 2, 10);
      g.fillStyle(0x2f6a34).fillCircle(x - 3, y - 5, 6);
      if (rand() < 0.15) g.fillStyle(0xc0392b).fillCircle(x + 3, y - 1, 1.5);
    });
    spots(30, 3, (x, y) => g.fillStyle(0x5a8a48).fillRect(x, y, 2, 4).fillRect(x + 3, y + 1, 2, 3));
  } else if (look === 'crypt') {
    g.lineStyle(1, 0x1e2230, 0.6);
    for (let y = by + 22; y < by + bh; y += 30) g.lineBetween(bx + 6, y, bx + bw - 6, y);
    spots(22, 9, (x, y) => {
      g.fillStyle(0x000000, 0.3).fillEllipse(x + 2, y + 9, 18, 5);
      g.fillStyle(0x6e758c).fillRoundedRect(x - 7, y - 9, 14, 18, { tl: 6, tr: 6, bl: 0, br: 0 });
      g.fillStyle(0x4a5066).fillRect(x - 1, y - 5, 2, 8).fillRect(x - 4, y - 3, 8, 2);
    });
    spots(8, 8, (x, y) => {
      g.fillStyle(0x5d6378).fillRect(x - 6, y - 14, 12, 22);
      g.fillStyle(0x4a5066).fillRect(x - 8, y + 6, 16, 4);
    });
    spots(10, 8, (x, y) => {
      g.fillStyle(0xffd166, 0.18).fillCircle(x, y - 6, 10);
      g.fillStyle(0xe8e0c8).fillRect(x - 2, y - 4, 4, 8);
      g.fillStyle(0xffb347).fillCircle(x, y - 6, 1.8);
    });
    spots(16, 4, (x, y) => g.fillStyle(0xd9d2c0, 0.8).fillCircle(x, y, 2.2).fillRect(x - 3, y + 1, 6, 1.5));
  } else {
    for (let i = 0; i < 7; i++) {
      let x = bx + 20 + rand() * (bw - 40);
      let y = by + 20 + rand() * (bh - 40);
      for (let k = 0; k < 7; k++) {
        const nx = Phaser.Math.Clamp(x + (rand() - 0.5) * 50, bx + 10, bx + bw - 10);
        const ny = Phaser.Math.Clamp(y + (rand() - 0.4) * 30, by + 10, by + bh - 10);
        if (clear(x, y, 4) && clear(nx, ny, 4) && clear((x + nx) / 2, (y + ny) / 2, 4)) {
          g.lineStyle(5, 0xff5a1f, 0.15).lineBetween(x, y, nx, ny);
          g.lineStyle(1.5, 0xffa23a, 0.7).lineBetween(x, y, nx, ny);
        }
        [x, y] = [nx, ny];
      }
    }
    spots(5, 14, (x, y) => {
      g.fillStyle(0xff5a1f, 0.25).fillEllipse(x, y, 40, 18);
      g.fillStyle(0xff8c1a, 0.85).fillEllipse(x, y, 26, 10);
      g.fillStyle(0xffd166, 0.85).fillEllipse(x - 3, y - 1, 10, 4);
    });
    spots(34, 9, (x, y) => {
      const h = 10 + rand() * 12;
      g.fillStyle(0x000000, 0.3).fillEllipse(x + 2, y + 6, 18, 5);
      g.fillStyle(0x140808).fillTriangle(x - 8, y + 6, x + 8, y + 6, x + (rand() - 0.5) * 4, y + 6 - h);
      g.fillStyle(0x2e1612).fillTriangle(x - 2, y + 6, x + 8, y + 6, x + 1, y + 6 - h * 0.7);
    });
    spots(12, 4, (x, y) => {
      g.fillStyle(0xc9a98a).fillCircle(x, y, 3).fillRect(x - 2, y + 1.5, 4, 2);
      g.fillStyle(0x1a0c0c).fillCircle(x - 1, y, 0.8).fillCircle(x + 1, y, 0.8);
    });
  }
  // A darker edge and a frame, like a map laid on a table.
  const vignette = vignetteTexture(s, look, bw, bh);
  const v = s.add.image(bx, by, vignette).setOrigin(0, 0);
  const frame = s.add.graphics();
  frame.lineStyle(4, c.frame, 1).strokeRoundedRect(bx, by, bw, bh, 12);
  frame.lineStyle(1, 0x000000, 0.6).strokeRoundedRect(bx + 3, by + 3, bw - 6, bh - 6, 10);
  // A darker strip behind the legend.
  frame.fillStyle(0x000000, 0.35).fillRect(bx + 4, by + bh - 40, bw - 8, 36);
  return [s.add.rectangle(0, 96, WORLD.width, WORLD.hudTop - 96, c.bg).setOrigin(0, 0).setInteractive(), g, v, frame];
}

function vignetteTexture(s: BattleScene, look: Look, w: number, h: number): string {
  const key = `map-vignette-${look}`;
  if (s.textures.exists(key)) return key;
  const tex = s.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.62);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
}
