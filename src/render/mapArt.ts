import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { WORLD } from '../sim/content';

type Look = 'forest' | 'crypt' | 'hellscape';
type Pt = { x: number; y: number };

/** Each act's map palette: ground, the road, the trail you walked, and its frame. */
export const MAP_LOOK: Record<
  Look,
  { bg: number; ground: number; patch: number; line: number; path: number; frame: number; road: { edge: number; fill: number; inner: number } }
> = {
  forest: { bg: 0x13201a, ground: 0x2b4a2c, patch: 0x335a33, line: 0x8fa874, path: 0xffd166, frame: 0x5a4028, road: { edge: 0x3e2a18, fill: 0x7a5a36, inner: 0x8f6c42 } },
  crypt: { bg: 0x11141c, ground: 0x2a2f3d, patch: 0x323848, line: 0x8792ad, path: 0xd9e3ff, frame: 0x4a5066, road: { edge: 0x171a24, fill: 0x4f5568, inner: 0x60677d } },
  hellscape: { bg: 0x1c0d0b, ground: 0x351a15, patch: 0x41211a, line: 0xa86a50, path: 0xffb347, frame: 0x5a2418, road: { edge: 0x0e0504, fill: 0x2a120e, inner: 0x46201a } },
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
export function linkPoints(a: Pt, b: Pt, key: string, steps = 16): Pt[] {
  let h = 0;
  for (const ch of key) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const bend = ((h % 21) - 10) * 1.6;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cx = mx + (-(b.y - a.y) / len) * bend;
  const cy = my + ((b.x - a.x) / len) * bend;
  const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(a.x, a.y), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(b.x, b.y));
  return curve.getPoints(steps).map((p) => ({ x: p.x, y: p.y }));
}

/** A point part-way along a polyline (t from 0 to 1). */
export function along(pts: Pt[], t: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += lens[i - 1] = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let d = Phaser.Math.Clamp(t, 0, 1) * total;
  for (let i = 1; i < pts.length; i++) {
    if (d <= lens[i - 1] || i === pts.length - 1) {
      const k = lens[i - 1] ? Math.min(1, d / lens[i - 1]) : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    }
    d -= lens[i - 1];
  }
  return pts[pts.length - 1];
}

/**
 * A road along a curve, in the act's style (a dirt track, worn flagstones,
 * charred rock). `ahead` roads are dimmer; `open` ones (from where you stand)
 * have gold dashes down the middle; the `taken` road has a solid gold trail.
 * Points below `maxY` are left out (the frame's bottom edge).
 */
export function drawRoad(g: Phaser.GameObjects.Graphics, look: Look, pts: Pt[], state: 'ahead' | 'open' | 'taken', maxY: number): void {
  const r = MAP_LOOK[look].road;
  const shown = pts.filter((p) => p.y <= maxY);
  if (shown.length < 2) return;
  const a = state === 'ahead' ? 0.6 : 1;
  const layer = (w: number, color: number, alpha: number) => {
    g.lineStyle(w, color, alpha);
    for (let i = 1; i < shown.length; i++) g.lineBetween(shown[i - 1].x, shown[i - 1].y, shown[i].x, shown[i].y);
    g.fillStyle(color, alpha);
    for (const p of shown) g.fillCircle(p.x, p.y, w / 2);
  };
  layer(state === 'ahead' ? 11 : 13, r.edge, a);
  layer(state === 'ahead' ? 7 : 9, r.fill, a);
  layer(3, r.inner, a * 0.8);
  // Texture: flagstone joints in the crypt, embers in the hellscape, pebbles on the dirt.
  for (let i = 2; i < shown.length - 1; i += 2) {
    const p = shown[i];
    const q = shown[i + 1];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    if (look === 'crypt') g.lineStyle(1, r.edge, a).lineBetween(p.x - (dy / len) * 4, p.y + (dx / len) * 4, p.x + (dy / len) * 4, p.y - (dx / len) * 4);
    else if (look === 'hellscape') g.fillStyle(0xff8c1a, a * 0.7).fillCircle(p.x + (dy / len) * 2, p.y - (dx / len) * 2, 1);
    else g.fillStyle(0x5a4028, a).fillCircle(p.x - (dy / len) * 2.5, p.y + (dx / len) * 2.5, 1);
  }
  const path = MAP_LOOK[look].path;
  if (state === 'taken') layer(2.5, path, 0.95);
  if (state === 'open') {
    g.lineStyle(2.5, path, 0.95);
    for (let i = 1; i < shown.length; i++) if (i % 2) g.lineBetween(shown[i - 1].x, shown[i - 1].y, shown[i].x, shown[i].y);
  }
}

/**
 * The act's terrain under the map: mottled ground and scenery (trees and
 * ponds; tombstones, pillars and candles; lava seams, spikes and embers),
 * kept clear of the nodes and roads so nothing hides a choice. Scenery
 * belongs to a floor (its own seed), so it scrolls down with the floors as
 * you climb instead of jumping around.
 */
export function drawMapTerrain(
  s: BattleScene,
  look: Look,
  box: { x: number; y: number; w: number; h: number },
  nodes: Pt[],
  links: Pt[][],
  floors: { from: number; to: number; rowY: (f: number) => number; row: number },
): Phaser.GameObjects.GameObject[] {
  const c = MAP_LOOK[look];
  const g = s.add.graphics();
  const { x: bx, y: by, w: bw, h: bh } = box;
  g.fillStyle(c.ground).fillRoundedRect(bx, by, bw, bh, 12);
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  /** Run f once per floor band, with that band's own random numbers. */
  const perBand = (salt: number, f: (y0: number, y1: number) => void) => {
    for (let fl = floors.from; fl <= floors.to; fl++) {
      seed = 1 + ((fl + 3) * 7919 + salt * 104729) % 2147483646;
      const mid = floors.rowY(fl);
      f(mid - floors.row / 2, mid + floors.row / 2);
    }
  };
  perBand(1, (y0, y1) => {
    for (let i = 0; i < 9; i++) g.fillStyle(rand() < 0.5 ? c.patch : c.bg, rand() < 0.5 ? 0.5 : 0.25).fillEllipse(bx + 10 + rand() * (bw - 20), y0 + rand() * (y1 - y0), 30 + rand() * 80, 14 + rand() * 40);
  });
  /** Somewhere open: inside the frame and off every node and road. */
  const clear = (px: number, py: number, r: number) => {
    if (px < bx + r + 4 || px > bx + bw - r - 4 || py < by + r + 4 || py > by + bh - r - 44) return false;
    for (const n of nodes) if (Math.hypot(n.x - px, n.y - py) < 28 + r) return false;
    for (const l of links) for (const p of l) if (Math.hypot(p.x - px, p.y - py) < 12 + r) return false;
    return true;
  };
  const spots = (salt: number, perFloor: number, r: number, f: (x: number, y: number) => void) =>
    perBand(salt, (y0, y1) => {
      const count = Math.floor(perFloor) + (rand() < perFloor % 1 ? 1 : 0);
      for (let placed = 0, tries = 0; placed < count && tries < count * 30; tries++) {
        const px = bx + rand() * bw;
        const py = y0 + rand() * (y1 - y0);
        if (!clear(px, py, r)) continue;
        f(px, py);
        placed++;
      }
    });
  if (look === 'forest') {
    spots(2, 0.4, 18, (x, y) => {
      g.fillStyle(0x1f4a5a).fillEllipse(x, y, 40, 20);
      g.fillStyle(0x3a7a8a, 0.8).fillEllipse(x - 5, y - 2, 20, 8);
    });
    spots(3, 7, 13, (x, y) => {
      g.fillStyle(0x000000, 0.25).fillEllipse(x + 2, y + 11, 26, 8);
      g.fillStyle(0x4a2f1c).fillRect(x - 2.5, y + 2, 5, 9);
      g.fillStyle(rand() < 0.3 ? 0x24502a : 0x1d4224).fillCircle(x, y - 3, 12);
      g.fillStyle(0x2f6a34).fillCircle(x - 4, y - 7, 7);
      if (rand() < 0.15) g.fillStyle(0xc0392b).fillCircle(x + 4, y - 1, 1.8);
    });
    spots(4, 5, 3, (x, y) => g.fillStyle(0x5a8a48).fillRect(x, y, 2, 4).fillRect(x + 3, y + 1, 2, 3));
  } else if (look === 'crypt') {
    perBand(5, (y0) => {
      g.lineStyle(1, 0x1e2230, 0.6).lineBetween(bx + 6, y0 + 20, bx + bw - 6, y0 + 20).lineBetween(bx + 6, y0 + 80, bx + bw - 6, y0 + 80);
    });
    spots(6, 3, 10, (x, y) => {
      g.fillStyle(0x000000, 0.3).fillEllipse(x + 2, y + 10, 20, 5);
      g.fillStyle(0x6e758c).fillRoundedRect(x - 8, y - 10, 16, 20, { tl: 7, tr: 7, bl: 0, br: 0 });
      g.fillStyle(0x4a5066).fillRect(x - 1, y - 6, 2, 9).fillRect(x - 4, y - 4, 8, 2);
    });
    spots(7, 1, 9, (x, y) => {
      g.fillStyle(0x5d6378).fillRect(x - 7, y - 16, 14, 25);
      g.fillStyle(0x4a5066).fillRect(x - 9, y + 7, 18, 4);
    });
    spots(8, 1.5, 9, (x, y) => {
      g.fillStyle(0xffd166, 0.18).fillCircle(x, y - 6, 11);
      g.fillStyle(0xe8e0c8).fillRect(x - 2, y - 4, 4, 9);
      g.fillStyle(0xffb347).fillCircle(x, y - 6, 2);
    });
    spots(9, 2, 4, (x, y) => g.fillStyle(0xd9d2c0, 0.8).fillCircle(x, y, 2.4).fillRect(x - 3, y + 1, 6, 1.5));
  } else {
    perBand(10, (y0, y1) => {
      if (rand() < 0.4) return;
      let x = bx + 20 + rand() * (bw - 40);
      let y = y0 + rand() * (y1 - y0);
      for (let k = 0; k < 6; k++) {
        const nx = Phaser.Math.Clamp(x + (rand() - 0.5) * 50, bx + 10, bx + bw - 10);
        const ny = y + (rand() - 0.5) * 30;
        if (clear(x, y, 4) && clear(nx, ny, 4) && clear((x + nx) / 2, (y + ny) / 2, 4)) {
          g.lineStyle(5, 0xff5a1f, 0.15).lineBetween(x, y, nx, ny);
          g.lineStyle(1.5, 0xffa23a, 0.7).lineBetween(x, y, nx, ny);
        }
        [x, y] = [nx, ny];
      }
    });
    spots(11, 0.7, 16, (x, y) => {
      g.fillStyle(0xff5a1f, 0.25).fillEllipse(x, y, 44, 20);
      g.fillStyle(0xff8c1a, 0.85).fillEllipse(x, y, 30, 11);
      g.fillStyle(0xffd166, 0.85).fillEllipse(x - 3, y - 1, 12, 4);
    });
    spots(12, 5, 10, (x, y) => {
      const h = 12 + rand() * 14;
      g.fillStyle(0x000000, 0.3).fillEllipse(x + 2, y + 7, 20, 5);
      g.fillStyle(0x140808).fillTriangle(x - 9, y + 7, x + 9, y + 7, x + (rand() - 0.5) * 4, y + 7 - h);
      g.fillStyle(0x2e1612).fillTriangle(x - 2, y + 7, x + 9, y + 7, x + 1, y + 7 - h * 0.7);
    });
    spots(13, 2, 4, (x, y) => {
      g.fillStyle(0xc9a98a).fillCircle(x, y, 3.2).fillRect(x - 2, y + 1.5, 4, 2);
      g.fillStyle(0x1a0c0c).fillCircle(x - 1, y, 0.9).fillCircle(x + 1, y, 0.9);
    });
  }
  // A darker edge and a frame, like a map laid on a table.
  const v = s.add.image(bx, by, vignetteTexture(s, look, bw, bh)).setOrigin(0, 0);
  const frame = s.add.graphics();
  frame.lineStyle(4, c.frame, 1).strokeRoundedRect(bx, by, bw, bh, 12);
  frame.lineStyle(1, 0x000000, 0.6).strokeRoundedRect(bx + 3, by + 3, bw - 6, bh - 6, 10);
  return [s.add.rectangle(0, 96, WORLD.width, WORLD.hudTop - 96, c.bg).setOrigin(0, 0).setInteractive(), g, v, frame];
}

/** Fog over the top of the map: the floors further up are hidden until you get closer. */
export function drawFog(s: BattleScene, look: Look, box: { x: number; y: number; w: number }, height: number): Phaser.GameObjects.GameObject[] {
  const key = `map-fog-${look}-${height}`;
  if (!s.textures.exists(key)) {
    const tex = s.textures.createCanvas(key, box.w, height)!;
    const ctx = tex.getContext();
    const col = Phaser.Display.Color.IntegerToColor(MAP_LOOK[look].bg);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `rgba(${col.red},${col.green},${col.blue},1)`);
    grad.addColorStop(0.55, `rgba(${col.red},${col.green},${col.blue},0.85)`);
    grad.addColorStop(1, `rgba(${col.red},${col.green},${col.blue},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, box.w, height);
    // Soft wisps.
    let seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(200,210,220,${0.03 + rand() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(rand() * box.w, height * (0.2 + rand() * 0.6), 30 + rand() * 60, 8 + rand() * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
  }
  const img = s.add.image(box.x, box.y, key).setOrigin(0, 0);
  const t = s.text(WORLD.width / 2, box.y + height * 0.42, '· · ·  the way ahead is hidden  · · ·', 12, '#8f9bb3').setOrigin(0.5);
  return [img, t];
}

/** The act's starting camp at the bottom of the map: a tent and a little fire. */
export function drawStartCamp(s: BattleScene, x: number, y: number): Phaser.GameObjects.GameObject[] {
  const g = s.add.graphics();
  g.fillStyle(0x000000, 0.3).fillEllipse(x, y + 12, 90, 16);
  g.fillStyle(0x7a5c3a, 0.9).fillEllipse(x, y + 6, 84, 22);
  // Tent.
  g.fillStyle(0x3f6fb0).fillTriangle(x - 40, y + 8, x - 8, y + 8, x - 24, y - 20);
  g.fillStyle(0x000000, 0.35).fillTriangle(x - 28, y + 8, x - 20, y + 8, x - 24, y - 4);
  // Fire.
  g.fillStyle(0x5a3a22).fillRect(x + 14, y + 4, 20, 4);
  g.fillStyle(0x6b6b6b).fillCircle(x + 24, y + 6, 7);
  const flame = s.add.triangle(x + 24, y - 2, 0, 12, 6, -6, 12, 12, 0xff8c1a);
  const core = s.add.triangle(x + 24, y + 1, 0, 8, 4, -3, 8, 8, 0xffe066);
  s.tweens.add({ targets: [flame, core], scaleY: 1.25, scaleX: 0.9, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  const label = s.text(x, y + 18, 'Camp', 11, '#e0b878').setOrigin(0.5, 0);
  label.setStroke('#000000', 3);
  return [g, flame, core, label];
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
