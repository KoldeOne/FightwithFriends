import { AGGRO, ENEMY_STATS, FORMATION, GATE_MAX_HP, HERO_STATS, WORLD } from './content';
import { createRng } from './rng';
import type { AggroLevel, BattleEvent, EnemyKind, HeroClass, Outcome, SpawnDef, Unit, WaveDef } from './types';
import { GATE_ID } from './types';

/** Fixed simulation step in seconds. The renderer calls step() with this. */
export const STEP = 0.05;

export interface BattleOptions {
  seed: number;
  wave: WaveDef;
  /** Defaults to the standard 4-hero formation. */
  heroes?: HeroClass[];
  /** AI DPS/healers hold back before pulling aggro (default true). */
  carefulAI?: boolean;
}

/**
 * Pure combat simulation for one wave. Knows nothing about rendering:
 * the renderer reads `units`, `gate` and drained events each frame.
 */
export class Battle {
  time = 0;
  units: Unit[] = [];
  gate = { hp: GATE_MAX_HP, maxHp: GATE_MAX_HP };
  outcome: Outcome = 'running';
  readonly wave: WaveDef;
  carefulAI: boolean;

  private nextId = 1;
  private pending: SpawnDef[];
  private events: BattleEvent[] = [];
  private rng: () => number;

  constructor(opts: BattleOptions) {
    this.rng = createRng(opts.seed);
    this.wave = opts.wave;
    this.carefulAI = opts.carefulAI ?? true;
    this.pending = [...opts.wave.spawns].sort((a, b) => a.time - b.time);
    const classes = opts.heroes ?? FORMATION.map((f) => f.cls);
    for (const slot of FORMATION) {
      if (classes.includes(slot.cls)) this.addHero(slot.cls, slot.x, slot.y);
    }
  }

  get heroes(): Unit[] {
    return this.units.filter((u) => u.side === 'hero');
  }

  get enemies(): Unit[] {
    return this.units.filter((u) => u.side === 'enemy');
  }

  /** Enemies still to come plus enemies alive. */
  get enemiesRemaining(): number {
    return this.pending.length + this.units.filter((u) => u.side === 'enemy' && u.alive).length;
  }

  unit(id: number): Unit | undefined {
    return this.units.find((u) => u.id === id);
  }

  /** Threat `hero` has on `enemy`. */
  threatOf(enemy: Unit, heroId: number): number {
    return enemy.threat?.[heroId] ?? 0;
  }

  /** Highest threat value on an enemy among living heroes, and who holds it. */
  topThreat(enemy: Unit): { id: number | null; value: number } {
    let id: number | null = null;
    let value = 0;
    for (const [key, v] of Object.entries(enemy.threat ?? {})) {
      const hero = this.unit(Number(key));
      if (hero?.alive && v > value) {
        id = hero.id;
        value = v;
      }
    }
    return { id, value };
  }

  /** Aggro icon state for a hero: being attacked, close to pulling, or fine. */
  aggroLevel(heroId: number): AggroLevel {
    let warning = false;
    for (const e of this.units) {
      if (e.side !== 'enemy' || !e.alive) continue;
      if (e.targetId === heroId) return 'aggro';
      const top = this.topThreat(e);
      const mine = this.threatOf(e, heroId);
      if (top.id !== heroId && top.value > 0 && mine >= top.value * AGGRO.warningAt) warning = true;
    }
    return warning ? 'warning' : 'none';
  }

  drainEvents(): BattleEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  step(dt: number = STEP): void {
    if (this.outcome !== 'running') return;
    this.time += dt;

    while (this.pending.length && this.pending[0].time <= this.time) {
      const s = this.pending.shift()!;
      this.addEnemy(s.kind, s.x + (this.rng() - 0.5) * 40);
    }

    for (const u of this.units) {
      if (!u.alive) continue;
      u.cooldown = Math.max(0, u.cooldown - dt);
      if (u.tauntCooldown) u.tauntCooldown = Math.max(0, u.tauntCooldown - dt);
      if (u.tauntTime) u.tauntTime = Math.max(0, u.tauntTime - dt);
      if (u.side === 'enemy') this.updateEnemy(u, dt);
      else {
        if (u.isTank) this.tryTaunt(u);
        this.updateHero(u);
      }
    }
    this.separate();
    this.units = this.units.filter((u) => u.alive || u.side === 'hero');

    if (this.gate.hp <= 0) {
      this.gate.hp = 0;
      this.outcome = 'defeat';
    } else if (this.enemiesRemaining === 0) {
      this.outcome = 'victory';
    }
  }

  // --- spawning -----------------------------------------------------------

  private addHero(cls: HeroClass, x: number, y: number): void {
    const s = HERO_STATS[cls];
    this.addUnit({ ...s, id: 0, side: 'hero', kind: cls, x, y, hp: s.maxHp, cooldown: 0.3 * this.rng(), targetId: null, alive: true });
  }

  private addEnemy(kind: EnemyKind, x: number): void {
    const s = ENEMY_STATS[kind];
    const clampedX = Math.min(WORLD.width - s.radius, Math.max(s.radius, x));
    this.addUnit({ ...s, id: 0, side: 'enemy', kind, x: clampedX, y: WORLD.spawnY, hp: s.maxHp, cooldown: 0.5, targetId: null, alive: true, threat: {} });
  }

  private addUnit(u: Unit): void {
    u.id = this.nextId++;
    this.units.push(u);
    this.events.push({ type: 'spawn', id: u.id });
  }

  // --- behaviour ----------------------------------------------------------

  private updateEnemy(e: Unit, dt: number): void {
    const target = this.chooseEnemyTarget(e);
    e.targetId = target ? target.id : GATE_ID;

    let gap: number;
    let tx: number;
    let ty: number;
    if (target) {
      gap = dist(e, target) - e.radius - target.radius;
      tx = target.x;
      ty = target.y;
    } else {
      gap = WORLD.gateY - (e.y + e.radius);
      tx = e.x;
      ty = WORLD.gateY - e.radius;
    }

    if (gap <= e.range) {
      if (e.cooldown <= 0) {
        e.cooldown = e.attackInterval;
        const amount = this.roll(e.damage);
        if (target) this.damage(e, target, amount);
        else {
          this.gate.hp -= amount;
          this.events.push({ type: 'attack', from: e.id, to: GATE_ID, style: e.attackStyle, amount });
        }
      }
      return;
    }

    // Move toward the target, without overshooting the attack range.
    const dx = tx - e.x;
    const dy = ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const move = Math.min(e.speed * dt, gap - e.range + 0.5);
    e.x += (dx / len) * move;
    e.y += (dy / len) * move;
  }

  /**
   * Aggro rules: a taunt forces the target; otherwise the hero with the most
   * threat, with a 110% margin needed to steal it from the current target.
   * Enemies with no threat yet go for the nearest hero; runners go for the gate.
   */
  private chooseEnemyTarget(e: Unit): Unit | null {
    const livingHeroes = this.units.filter((u) => u.side === 'hero' && u.alive);
    if (!livingHeroes.length) return null;

    if (e.tauntTime && e.tauntedBy !== undefined) {
      const taunter = this.unit(e.tauntedBy);
      if (taunter?.alive) return taunter;
    }

    const top = this.topThreat(e);
    if (e.goesForGate) {
      return top.id !== null && top.value >= AGGRO.runnerThreshold ? this.pickWithMargin(e, top) : null;
    }
    if (top.id === null) return nearest(e, livingHeroes);
    return this.pickWithMargin(e, top);
  }

  private pickWithMargin(e: Unit, top: { id: number | null; value: number }): Unit | null {
    const current = e.targetId !== null && e.targetId !== GATE_ID ? this.unit(e.targetId) : undefined;
    if (current?.alive && current.side === 'hero') {
      const held = this.threatOf(e, current.id);
      if (top.value <= held * AGGRO.pullFactor) return current;
    }
    return top.id !== null ? this.unit(top.id)! : null;
  }

  /** Tank AI: taunt the closest enemy that is attacking someone else. */
  private tryTaunt(tank: Unit): void {
    if (!tank.alive || tank.tauntCooldown) return;
    const loose = this.units.filter(
      (u) =>
        u.side === 'enemy' &&
        u.alive &&
        u.targetId !== null &&
        u.targetId !== tank.id &&
        (u.targetId !== GATE_ID || this.topThreat(u).value > 0) &&
        dist(tank, u) <= AGGRO.tauntRange,
    );
    if (!loose.length) return;
    const e = nearest(tank, loose);
    e.threat ??= {};
    const floor = e.goesForGate ? AGGRO.runnerThreshold : 0;
    e.threat[tank.id] = Math.max(this.threatOf(e, tank.id), this.topThreat(e).value, floor) + 1;
    e.tauntedBy = tank.id;
    e.tauntTime = AGGRO.tauntDuration;
    e.targetId = tank.id;
    tank.tauntCooldown = AGGRO.tauntCooldown;
    this.events.push({ type: 'taunt', from: tank.id, to: e.id });
  }

  /** Would hitting `e` for `amount` push a careful hero past the caution line? */
  private wouldPull(h: Unit, e: Unit, amount: number): boolean {
    // Only hold back on enemies the tank is currently holding. Anything loose —
    // hitting me, a friend, or the gate — is fair game.
    const target = e.targetId !== null && e.targetId !== GATE_ID ? this.unit(e.targetId) : undefined;
    if (!target?.isTank) return false;
    // An enemy already attacking the tank from somewhere the tank can't reach
    // (e.g. an archer) can't be held — holding back would stall the fight.
    const gap = dist(target, e) - target.radius - e.radius;
    if (gap <= e.range && gap > target.range) return false;
    const top = this.topThreat(e);
    if (top.id === h.id) return false;
    const after = this.threatOf(e, h.id) + amount * (h.threatMultiplier ?? 1);
    return after > top.value * AGGRO.cautionAt;
  }

  private updateHero(h: Unit): void {
    if (h.cooldown > 0) return;

    if (h.heal) {
      const hurt = this.units
        .filter((u) => u.side === 'hero' && u.alive && u.maxHp - u.hp >= h.heal! * 0.6)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) {
        const amount = Math.min(hurt.maxHp - hurt.hp, this.roll(h.heal));
        hurt.hp += amount;
        h.cooldown = h.attackInterval;
        this.events.push({ type: 'heal', from: h.id, to: hurt.id, amount });
        this.addHealThreat(h, amount);
        return;
      }
    }

    let inRange = this.units.filter((u) => u.side === 'enemy' && u.alive && dist(h, u) - h.radius - u.radius <= h.range);
    if (this.carefulAI && !h.isTank) {
      inRange = inRange.filter((u) => !this.wouldPull(h, u, h.damage * 1.1));
    }
    if (!inRange.length) {
      h.targetId = null;
      return;
    }
    // Keep the current target if still valid; otherwise pick one.
    let target = inRange.find((u) => u.id === h.targetId);
    if (!target) {
      // Melee hit what's closest; ranged hit whoever is furthest advanced.
      target = h.attackStyle === 'melee' ? nearest(h, inRange) : inRange.reduce((a, b) => (b.y > a.y ? b : a));
    }
    h.targetId = target.id;
    h.cooldown = h.attackInterval;
    this.damage(h, target, this.roll(h.damage));
  }

  private addHealThreat(healer: Unit, amount: number): void {
    // Only enemies already in the fight (someone has threat on them) notice healing.
    const engaged = this.units.filter((u) => u.side === 'enemy' && u.alive && !u.goesForGate && this.topThreat(u).value > 0);
    if (!engaged.length) return;
    const share = (amount * AGGRO.healThreat) / engaged.length;
    for (const e of engaged) {
      e.threat ??= {};
      e.threat[healer.id] = this.threatOf(e, healer.id) + share;
    }
  }

  private damage(from: Unit, to: Unit, amount: number): void {
    to.hp -= amount;
    if (from.side === 'hero' && to.side === 'enemy') {
      to.threat ??= {};
      to.threat[from.id] = this.threatOf(to, from.id) + amount * (from.threatMultiplier ?? 1);
    }
    this.events.push({ type: 'attack', from: from.id, to: to.id, style: from.attackStyle, amount });
    if (to.hp <= 0 && to.alive) {
      to.hp = 0;
      to.alive = false;
      this.events.push({ type: 'death', id: to.id });
    }
  }

  /** Keep enemies from overlapping each other or walking through heroes. */
  private separate(): void {
    const enemies = this.units.filter((u) => u.side === 'enemy' && u.alive);
    const heroes = this.units.filter((u) => u.side === 'hero' && u.alive);
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      for (let j = i + 1; j < enemies.length; j++) push(a, enemies[j], 0.5);
      for (const h of heroes) push(a, h, 1);
      a.x = Math.min(WORLD.width - a.radius, Math.max(a.radius, a.x));
      a.y = Math.min(WORLD.gateY - a.radius, a.y);
    }
  }

  /** ±10% damage variance. */
  private roll(base: number): number {
    return Math.max(1, Math.round(base * (0.9 + this.rng() * 0.2)));
  }
}

function dist(a: Unit, b: Unit): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearest(from: Unit, list: Unit[]): Unit {
  return list.reduce((best, u) => (dist(from, u) < dist(from, best) ? u : best));
}

/** Push `a` (and `b` by the remaining share) apart if they overlap. */
function push(a: Unit, b: Unit, aShare: number): void {
  const min = a.radius + b.radius + 2;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d >= min) return;
  const nx = d === 0 ? 1 : dx / d;
  const ny = d === 0 ? 0 : dy / d;
  const overlap = min - d;
  a.x += nx * overlap * aShare;
  a.y += ny * overlap * aShare;
  if (aShare < 1) {
    b.x -= nx * overlap * (1 - aShare);
    b.y -= ny * overlap * (1 - aShare);
  }
}
