import Phaser from 'phaser';
import { WORLD } from '../sim/content';

export type Look = 'forest' | 'crypt' | 'hellscape';

/** Under the units (10/20), over the field and the ground marks (4/5). */
const FIELD_DEPTH = 7;
/** On the map the field sits under an opaque panel (depth 40), so the weather goes just above it. */
const MAP_DEPTH = 41;
/** The weather stays between the top bar and the HUD. */
const TOP = 96;
const BOTTOM = WORLD.hudTop;

type Kind = 'leaf' | 'drip' | 'splash' | 'mote' | 'ember' | 'ash';

interface Particle {
  kind: Kind;
  obj: Phaser.GameObjects.Shape | Phaser.GameObjects.Graphics;
  vx: number;
  vy: number;
  spin: number;
  age: number;
  life: number;
  /** Peak alpha. */
  alpha: number;
  /** Phase for sway or flicker. */
  phase: number;
  /** A drip's floor: it splashes when it gets there. */
  floor?: number;
}

/** How many of each kind may be alive at once, and roughly how often one appears (per second). */
const SPAWN: Record<Look, Partial<Record<Kind, { max: number; rate: number }>>> = {
  forest: { leaf: { max: 12, rate: 1.4 } },
  crypt: { drip: { max: 3, rate: 0.7 }, mote: { max: 12, rate: 1.6 } },
  hellscape: { ember: { max: 14, rate: 3 }, ash: { max: 5, rate: 0.6 } },
};

const LEAF_COLORS = [0xa8b040, 0x8a6a2e, 0xc8742a, 0xa4532a, 0xd9a03a];

/**
 * Light ambient weather for each act's look: falling leaves in the forest,
 * drips and dust in the crypt, embers and ash in the hellscape. Plain game
 * objects moved by hand each frame (no timers or tweens), all inside one
 * container, so a scene restart destroys everything with nothing left behind.
 */
export class Weather {
  private layer: Phaser.GameObjects.Container;
  private parts: Particle[] = [];
  private due: Partial<Record<Kind, number>> = {};

  constructor(readonly s: Phaser.Scene, readonly look: Look) {
    this.layer = s.add.container(0, 0).setDepth(FIELD_DEPTH);
    // Start with a few already in the air so the first frame isn't empty.
    for (const [kind, spec] of Object.entries(SPAWN[look]) as [Kind, { max: number; rate: number }][]) {
      for (let i = 0; i < Math.floor(spec.max / 2); i++) this.spawn(kind, true);
      this.due[kind] = Math.random() / spec.rate;
    }
  }

  /** Call every frame; `onMap` lifts the weather above the map panel. */
  update(deltaMs: number, onMap: boolean): void {
    if (!this.layer.active) return;
    // Over the map it's kept faint, so it doesn't get in the way of the nodes.
    this.layer.setDepth(onMap ? MAP_DEPTH : FIELD_DEPTH).setAlpha(onMap ? 0.35 : 1);
    const dt = Math.min(deltaMs / 1000, 0.1);
    for (const [kind, spec] of Object.entries(SPAWN[this.look]) as [Kind, { max: number; rate: number }][]) {
      this.due[kind] = (this.due[kind] ?? 0) - dt;
      if (this.due[kind]! <= 0) {
        this.due[kind] = (0.5 + Math.random()) / spec.rate;
        if (this.parts.filter((p) => p.kind === kind).length < spec.max) this.spawn(kind, false);
      }
    }
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.age += dt;
      if (this.step(p, dt)) keep.push(p);
      else p.obj.destroy();
    }
    this.parts = keep;
  }

  destroy(): void {
    this.parts = [];
    this.layer.destroy();
  }

  /** Moves one particle; false when it's done. */
  private step(p: Particle, dt: number): boolean {
    const o = p.obj;
    const t = p.age / p.life;
    // Fade in over the first tenth and out over the last fifth.
    const fade = Math.min(1, t * 10, (1 - t) * 5);
    switch (p.kind) {
      case 'leaf':
        o.x += (p.vx + Math.sin(p.age * 1.6 + p.phase) * 18) * dt;
        o.y += p.vy * dt;
        o.rotation += p.spin * dt;
        // A tumbling leaf shows its edge now and then.
        o.scaleX = 0.4 + 0.6 * Math.abs(Math.cos(p.age * 1.3 + p.phase));
        o.alpha = p.alpha * fade;
        return p.age < p.life && o.y < BOTTOM + 10 && o.x < WORLD.width + 20;
      case 'drip':
        p.vy += 520 * dt;
        o.y += p.vy * dt;
        if (o.y >= p.floor!) {
          this.splash(o.x, p.floor!);
          return false;
        }
        return true;
      case 'splash':
        o.setScale(0.4 + t * 1.4);
        o.alpha = p.alpha * (1 - t);
        return p.age < p.life;
      case 'mote':
        o.x += (p.vx + Math.sin(p.age * 0.7 + p.phase) * 4) * dt;
        o.y += (p.vy + Math.cos(p.age * 0.5 + p.phase) * 3) * dt;
        o.alpha = p.alpha * fade;
        return p.age < p.life;
      case 'ember':
        o.x += (p.vx + Math.sin(p.age * 3 + p.phase) * 10) * dt;
        o.y += p.vy * dt;
        // A flicker, dimming as it cools.
        o.alpha = p.alpha * fade * (0.65 + 0.35 * Math.sin(p.age * 14 + p.phase));
        o.setScale(1 - t * 0.5);
        return p.age < p.life && o.y > TOP;
      case 'ash':
        o.x += (p.vx + Math.sin(p.age * 1.1 + p.phase) * 8) * dt;
        o.y += p.vy * dt;
        o.rotation += p.spin * dt;
        o.alpha = p.alpha * fade;
        return p.age < p.life && o.y < BOTTOM;
    }
  }

  private push(p: Omit<Particle, 'age' | 'phase'> & { age?: number }): void {
    const part: Particle = { age: 0, phase: Math.random() * Math.PI * 2, ...p };
    part.obj.setAlpha(0);
    this.layer.add(part.obj);
    this.parts.push(part);
  }

  /** A new particle of a kind; `midAir` scatters it anywhere instead of at its starting edge. */
  private spawn(kind: Kind, midAir: boolean): void {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const anyY = rnd(TOP + 10, BOTTOM - 20);
    switch (kind) {
      case 'leaf': {
        const g = this.s.add.graphics();
        const c = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
        const sz = rnd(5, 7.5);
        g.fillStyle(c, 1).fillEllipse(0, 0, sz * 2, sz);
        g.lineStyle(1, 0x2a2414, 0.5).lineBetween(-sz, 0, sz, 0);
        g.setPosition(midAir ? rnd(-20, WORLD.width) : rnd(-60, WORLD.width - 60), midAir ? anyY : TOP - 6);
        g.rotation = rnd(0, Math.PI);
        const life = 16;
        this.push({ kind, obj: g, vx: rnd(14, 30), vy: rnd(28, 46), spin: rnd(-1.6, 1.6), life, alpha: rnd(0.6, 0.85), age: midAir ? rnd(1, 4) : 0 });
        break;
      }
      case 'drip': {
        const r = this.s.add.rectangle(rnd(30, WORLD.width - 30), TOP + 4, 1.6, 6, 0x9ad1ff);
        this.push({ kind, obj: r, vx: 0, vy: 30, spin: 0, life: 10, alpha: 0.6, floor: rnd(TOP + 160, BOTTOM - 30) });
        r.setAlpha(0.6);
        break;
      }
      case 'mote': {
        const c = this.s.add.circle(rnd(20, WORLD.width - 20), anyY, rnd(1.2, 2.2), 0xd9d2c0);
        this.push({ kind, obj: c, vx: rnd(-5, 5), vy: rnd(-4, 2), spin: 0, life: rnd(7, 12), alpha: rnd(0.25, 0.45), age: midAir ? rnd(0, 4) : 0 });
        break;
      }
      case 'ember': {
        const c = this.s.add.circle(rnd(10, WORLD.width - 10), midAir ? anyY : BOTTOM - rnd(0, 120), rnd(1.5, 2.6), Math.random() < 0.6 ? 0xff8c1a : 0xffd166);
        c.setBlendMode(Phaser.BlendModes.ADD);
        this.push({ kind, obj: c, vx: rnd(-8, 8), vy: rnd(-55, -28), spin: 0, life: rnd(4, 8), alpha: rnd(0.45, 0.8) });
        break;
      }
      case 'ash': {
        const r = this.s.add.rectangle(rnd(0, WORLD.width), midAir ? anyY : TOP - 4, rnd(2, 3.5), rnd(1.5, 2.5), Math.random() < 0.5 ? 0x6a6260 : 0x8a827e);
        r.rotation = rnd(0, Math.PI);
        this.push({ kind, obj: r, vx: rnd(-6, 10), vy: rnd(14, 26), spin: rnd(-2, 2), life: 30, alpha: rnd(0.35, 0.55) });
        break;
      }
      case 'splash':
        break;
    }
  }

  /** A drip lands: a tiny ring spreading on the floor. */
  private splash(x: number, y: number): void {
    const e = this.s.add.ellipse(x, y, 10, 4).setStrokeStyle(1, 0xbfe6ff, 1);
    e.isFilled = false;
    this.push({ kind: 'splash', obj: e, vx: 0, vy: 0, spin: 0, life: 0.55, alpha: 0.55 });
  }
}
