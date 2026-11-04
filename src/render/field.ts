import type { BattleScene } from './BattleScene';
import { WORLD } from '../sim/content';

type Look = 'forest' | 'crypt' | 'hellscape';

/**
 * Dressing for the battlefield, drawn once per fight under everything else:
 * props along the edges (so the middle stays clear for the fight) and the
 * act's light, a vignette that darkens the edges of the ground in the act's
 * colour. The same seed every time, so a fight's field doesn't jump around.
 */
export function decorateField(s: BattleScene, look: Look, area: { top: number; bottom: number }): void {
  const g = s.add.graphics().setDepth(1);
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const { top, bottom } = area;
  /** A spot near the left or right edge (or, now and then, anywhere). */
  const edge = (anywhere = 0.15) => {
    const x = rand() < anywhere ? 40 + rand() * (WORLD.width - 80) : rand() < 0.5 ? 20 + rand() * 50 : WORLD.width - 20 - rand() * 50;
    return { x, y: top + 16 + rand() * (bottom - top - 32) };
  };
  if (look === 'forest') forest(g, rand, edge, top, bottom);
  else if (look === 'crypt') crypt(g, rand, edge);
  else hellscape(g, rand, edge);
  light(s, look, top, bottom);
}

type G = Phaser.GameObjects.Graphics;
type Spot = (anywhere?: number) => { x: number; y: number };

function forest(g: G, rand: () => number, edge: Spot, top: number, bottom: number): void {
  // A worn dirt path winding down the middle.
  let x = WORLD.width / 2 + (rand() - 0.5) * 60;
  for (let y = top; y < bottom; y += 6) {
    x += (rand() - 0.5) * 5;
    g.fillStyle(0x7a6a3e, 0.2).fillEllipse(x, y, 46, 10);
    g.fillStyle(0x8a7a4a, 0.16).fillEllipse(x + 4, y, 28, 6);
  }
  // Bushes, stumps, rocks and mushrooms along the edges.
  for (let i = 0; i < 9; i++) {
    const p = edge(0);
    shadow(g, p.x, p.y + 8, 30, 8);
    g.fillStyle(0x2f6a2c).fillCircle(p.x - 8, p.y, 10).fillCircle(p.x + 8, p.y + 1, 9);
    g.fillStyle(0x3d8236).fillCircle(p.x, p.y - 5, 11);
    g.fillStyle(0x56a046).fillCircle(p.x - 3, p.y - 9, 4);
    if (rand() < 0.4) g.fillStyle(0xd94a4a).fillCircle(p.x + 5, p.y - 4, 1.8).fillCircle(p.x - 6, p.y + 1, 1.8);
  }
  for (let i = 0; i < 4; i++) {
    const p = edge(0);
    shadow(g, p.x, p.y + 6, 26, 7);
    g.fillStyle(0x5a3a22).fillRect(p.x - 10, p.y - 6, 20, 12);
    g.fillStyle(0xb08a5a).fillEllipse(p.x, p.y - 6, 20, 7);
    g.lineStyle(1, 0x7a5a3a).strokeEllipse(p.x, p.y - 6, 12, 4);
  }
  rocks(g, rand, edge, 8, 0x8a8f86, 0xa9ada3);
  for (let i = 0; i < 7; i++) {
    const p = edge(0.3);
    g.fillStyle(0xe8e0c8).fillRect(p.x - 1, p.y - 4, 2, 5);
    g.fillStyle(rand() < 0.5 ? 0xc0392b : 0xd9a441).fillEllipse(p.x, p.y - 5, 8, 4);
  }
}

function crypt(g: G, rand: () => number, edge: Spot): void {
  // Broken pillars, bone piles, cobwebs in the corners, rubble.
  for (let i = 0; i < 5; i++) {
    const p = edge(0);
    shadow(g, p.x, p.y + 10, 30, 8);
    g.fillStyle(0x5d6378).fillRect(p.x - 9, p.y - 18 - rand() * 10, 18, 28);
    g.fillStyle(0x6e758c).fillRect(p.x - 9, p.y - 22, 6, 32);
    g.fillStyle(0x4a5066).fillRect(p.x - 12, p.y + 6, 24, 6);
  }
  for (let i = 0; i < 6; i++) {
    const p = edge(0.25);
    shadow(g, p.x, p.y + 4, 24, 6);
    for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI;
      const dx = Math.cos(a) * 7;
      const dy = Math.sin(a) * 3;
      const bx = p.x + (rand() - 0.5) * 10;
      g.lineStyle(2, 0xd9d2c0).lineBetween(bx - dx, p.y - dy, bx + dx, p.y + dy);
    }
    g.fillStyle(0xe8e0cc).fillCircle(p.x, p.y - 3, 4);
    g.fillStyle(0x1a1410).fillCircle(p.x - 1.5, p.y - 3, 1).fillCircle(p.x + 1.5, p.y - 3, 1);
  }
  g.lineStyle(1, 0xc9ccd6, 0.35);
  for (const [cx, cy, from] of [
    [12, 112, 0],
    [WORLD.width - 12, 112, Math.PI / 2],
  ]) {
    // Spokes and a few quarter rings, into the field from the corner.
    for (let k = 0; k <= 4; k++) {
      const a = from + (k / 4) * (Math.PI / 2);
      g.lineBetween(cx, cy, cx + Math.cos(a) * 44, cy + Math.sin(a) * 44);
    }
    for (let r = 12; r < 44; r += 10) {
      g.beginPath();
      g.arc(cx, cy, r, from, from + Math.PI / 2);
      g.strokePath();
    }
  }
  rocks(g, rand, edge, 10, 0x4a5066, 0x5d6378);
}

function hellscape(g: G, rand: () => number, edge: Spot): void {
  // Jagged black rocks, glowing pools at the edges, skulls and spikes.
  for (let i = 0; i < 4; i++) {
    const p = edge(0);
    g.fillStyle(0xff5a1f, 0.25).fillEllipse(p.x, p.y, 54, 22);
    g.fillStyle(0xff8c1a, 0.9).fillEllipse(p.x, p.y, 38, 13);
    g.fillStyle(0xffd166, 0.9).fillEllipse(p.x - 4, p.y - 1, 16, 5);
  }
  for (let i = 0; i < 8; i++) {
    const p = edge(0.1);
    shadow(g, p.x, p.y + 6, 26, 7);
    const h = 12 + rand() * 16;
    g.fillStyle(0x140808).fillTriangle(p.x - 10, p.y + 6, p.x + 10, p.y + 6, p.x + (rand() - 0.5) * 6, p.y + 6 - h);
    g.fillStyle(0x2a1210).fillTriangle(p.x - 3, p.y + 6, p.x + 10, p.y + 6, p.x + 2, p.y + 6 - h * 0.7);
  }
  for (let i = 0; i < 5; i++) {
    const p = edge(0.3);
    g.fillStyle(0xc9a98a).fillCircle(p.x, p.y, 4).fillRect(p.x - 2.5, p.y + 2, 5, 3);
    g.fillStyle(0x1a0c0c).fillCircle(p.x - 1.5, p.y, 1).fillCircle(p.x + 1.5, p.y, 1);
  }
  rocks(g, rand, edge, 8, 0x2e1714, 0x45231d);
}

function rocks(g: G, rand: () => number, edge: Spot, n: number, dark: number, light: number): void {
  for (let i = 0; i < n; i++) {
    const p = edge(0.4);
    const r = 3 + rand() * 6;
    shadow(g, p.x, p.y + r * 0.6, r * 2.6, r);
    g.fillStyle(dark).fillEllipse(p.x, p.y, r * 2.2, r * 1.5);
    g.fillStyle(light).fillEllipse(p.x - r * 0.3, p.y - r * 0.3, r * 1.1, r * 0.7);
  }
}

function shadow(g: G, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x000000, 0.22).fillEllipse(x, y, w, h);
}

/** Each act's light: how dark the edges get, and in what colour. */
const LIGHT: Record<Look, { color: string; edge: number; inner: number }> = {
  forest: { color: '10, 30, 12', edge: 0.45, inner: 0.62 },
  crypt: { color: '4, 6, 18', edge: 0.75, inner: 0.42 },
  hellscape: { color: '60, 6, 0', edge: 0.6, inner: 0.5 },
};

/** A vignette over the ground (under the units, so they stay bright). */
function light(s: BattleScene, look: Look, top: number, bottom: number): void {
  const key = `vignette-${look}`;
  const w = WORLD.width;
  const h = bottom - top + 12;
  if (!s.textures.exists(key)) {
    const tex = s.textures.createCanvas(key, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const l = LIGHT[look];
    const grad = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.2, w / 2, h * 0.55, Math.max(w, h) * l.inner);
    grad.addColorStop(0, `rgba(${l.color}, 0)`);
    grad.addColorStop(1, `rgba(${l.color}, ${l.edge})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }
  s.add.image(0, top - 6, key).setOrigin(0, 0).setDepth(8);
}
