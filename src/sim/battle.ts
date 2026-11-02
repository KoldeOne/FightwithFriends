import {
  ABILITIES,
  ABILITY_TUNING,
  AGGRO,
  ENEMY_STATS,
  FORMATION,
  GATE_MAX_HP,
  HERO_KIT,
  HERO_STATS,
  MAX_ABILITY_SLOTS,
  PASSIVE_TUNING,
  RAGE,
  RESOURCES,
  SHAMAN_MEND,
  TRAIT_TUNING,
  WORLD,
} from './content';
import { createRng } from './rng';
import type { AbilityId, AggroLevel, BattleEvent, Effect, EnemyKind, HeroClass, Outcome, SpawnDef, TraitId, Unit, WaveDef } from './types';
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
  /** The class the player controls (can also be set later with setPlayer). */
  playerClass?: HeroClass;
}

export type AbilityResult = 'ok' | 'dead' | 'cooldown' | 'resource' | 'target';

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
  /** Id of the hero the player controls, if chosen. */
  playerId: number | null = null;
  /** AUTO: the AI also plays the player's hero (casts its ability). */
  playerAuto = true;
  /** Player's focus: an enemy (or, for healers, an ally). */
  focusId: number | null = null;

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
    if (opts.playerClass) this.setPlayer(opts.playerClass);
    // Priest passive: Power Word: Fortitude is up on the whole party all wave.
    const priest = this.units.find((u) => u.side === 'hero' && u.passive === 'fortitudeAura');
    if (priest) this.applyFortitude(priest, Infinity);
  }

  get player(): Unit | undefined {
    return this.playerId === null ? undefined : this.unit(this.playerId);
  }

  setPlayer(cls: HeroClass): void {
    this.playerId = this.units.find((u) => u.side === 'hero' && u.kind === cls)?.id ?? null;
  }

  /** Focus an enemy (or an ally, if the player is a healer). null clears. */
  setFocus(id: number | null): void {
    const u = id === null ? undefined : this.unit(id);
    this.focusId = u?.alive ? u.id : null;
  }

  /** Current resource cost of an ability for this hero (traits can change it). */
  abilityCost(h: Unit, id: AbilityId): number {
    const base = ABILITIES[id].cost;
    if (id === 'renew' && this.hasTrait(h, 'innerFocus')) {
      const healthy = this.units.filter((u) => u.side === 'hero' && u.alive).every((u) => u.hp >= u.maxHp * TRAIT_TUNING.innerFocusThreshold);
      if (healthy) return Math.ceil(base / 2);
    }
    return base;
  }

  /** Why the ability in `slot` can't be used right now, or 'ok'. */
  abilityState(slot = 0, h: Unit | undefined = this.player): AbilityResult {
    const a = h?.abilities?.[slot];
    if (!h?.alive || !a) return 'dead';
    if (a.cooldown > 0) return 'cooldown';
    if ((h.resource ?? 0) < this.abilityCost(h, a.id)) return 'resource';
    return 'ok';
  }

  /** The player taps the ability button in `slot`. */
  useAbility(slot = 0): AbilityResult {
    const h = this.player;
    const state = this.abilityState(slot, h);
    if (state !== 'ok' || !h) return state;
    return this.cast(h, slot, true) ? 'ok' : 'target';
  }

  /**
   * Would the ability in `slot` find a target right now? False when the focus
   * is out of range, or nothing is in range. Drives the red "out of range" outline.
   */
  abilityInRange(slot = 0, h: Unit | undefined = this.player): boolean {
    const a = h?.abilities?.[slot];
    if (!h?.alive || !a) return false;
    return this.abilityTarget(h, a.id, true) !== null;
  }

  /** Give a hero an ability in the next free slot (used by level-ups). */
  learnAbility(h: Unit, id: AbilityId): boolean {
    h.abilities ??= [];
    if (h.abilities.length >= MAX_ABILITY_SLOTS || h.abilities.some((a) => a.id === id)) return false;
    h.abilities.push({ id, cooldown: 0 });
    return true;
  }

  hasEffect(u: Unit, kind: Effect['kind']): boolean {
    return !!u.effects?.some((e) => e.kind === kind);
  }

  hasTrait(h: Unit, id: TraitId): boolean {
    return !!h.traits?.includes(id);
  }

  /** Polymorphed enemies are out of the fight until hit directly. */
  isSheep(u: Unit): boolean {
    return this.hasEffect(u, 'sheep');
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
      if (hero?.alive && !this.hasEffect(hero, 'stealth') && v > value) {
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
      if (u.tauntTime) u.tauntTime = Math.max(0, u.tauntTime - dt);
      for (const a of u.abilities ?? []) if (a.cooldown) a.cooldown = Math.max(0, a.cooldown - dt);
      if (u.castCooldown) u.castCooldown = Math.max(0, u.castCooldown - dt);
      if (u.resourceKind) u.resource = Math.min(u.maxResource!, u.resource! + RESOURCES[u.resourceKind].regen * dt);
      this.tickEffects(u, dt);
      if (!u.alive) continue;
      if (u.side === 'enemy') this.updateEnemy(u, dt);
      else {
        this.updatePassive(u, dt);
        if (u.id !== this.playerId || this.playerAuto) this.aiAbilities(u);
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
    const kit = HERO_KIT[cls];
    const res = RESOURCES[kit.resource];
    this.addUnit({
      ...s,
      id: 0,
      side: 'hero',
      kind: cls,
      x,
      y,
      hp: s.maxHp,
      cooldown: 0.3 * this.rng(),
      targetId: null,
      alive: true,
      resourceKind: kit.resource,
      resource: res.start,
      maxResource: res.max,
      abilities: [{ id: kit.starting, cooldown: 0 }],
      passive: kit.passive,
      passiveCooldown: 0,
      outOfCombat: 0,
      traits: [],
      comboPoints: 0,
      effects: kit.passive === 'stealth' ? [this.stealthEffect()] : [],
    });
  }

  private stealthEffect(): Effect {
    return { kind: 'stealth', remaining: Infinity, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: 0 };
  }

  private addEnemy(kind: EnemyKind, x: number): void {
    const s = ENEMY_STATS[kind];
    const clampedX = Math.min(WORLD.width - s.radius, Math.max(s.radius, x));
    this.addUnit({ ...s, id: 0, side: 'enemy', kind, x: clampedX, y: WORLD.spawnY, hp: s.maxHp, cooldown: 0.5, targetId: null, alive: true, threat: {}, effects: [] });
  }

  private addUnit(u: Unit): void {
    u.id = this.nextId++;
    this.units.push(u);
    this.events.push({ type: 'spawn', id: u.id });
  }

  // --- behaviour ----------------------------------------------------------

  private updateEnemy(e: Unit, dt: number): void {
    if (this.isSheep(e)) {
      e.targetId = null;
      return;
    }
    if (e.casting) {
      this.progressCast(e, dt);
      return;
    }
    if (e.kind === 'shaman' && this.shamanMend(e, dt)) return;

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
        e.cooldown = e.attackInterval * (this.hasEffect(e, 'slow') ? ABILITY_TUNING.slowFactor : 1);
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
    // Stealthed heroes can't be seen, so they can't be targeted.
    const livingHeroes = this.units.filter((u) => u.side === 'hero' && u.alive && !this.hasEffect(u, 'stealth'));
    if (!livingHeroes.length) return null;

    if (e.tauntTime && e.tauntedBy !== undefined) {
      const taunter = this.unit(e.tauntedBy);
      if (taunter?.alive) return taunter;
    }
    const isVisible = (id: number | null) => {
      const u = id !== null && id >= 0 ? this.unit(id) : undefined;
      return !!u && !this.hasEffect(u, 'stealth');
    };
    if (e.targetId !== null && e.targetId >= 0 && !isVisible(e.targetId)) e.targetId = null;

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

  /** Enemies attacking someone other than this tank, within taunt range. */
  private looseEnemies(tank: Unit): Unit[] {
    return this.units.filter(
      (u) =>
        u.side === 'enemy' &&
        u.alive &&
        !this.isSheep(u) &&
        u.targetId !== null &&
        u.targetId !== tank.id &&
        (u.targetId !== GATE_ID || this.topThreat(u).value > 0) &&
        dist(tank, u) <= AGGRO.tauntRange,
    );
  }

  private applyTaunt(tank: Unit, e: Unit): void {
    e.threat ??= {};
    const floor = e.goesForGate ? AGGRO.runnerThreshold : 0;
    e.threat[tank.id] = Math.max(this.threatOf(e, tank.id), this.topThreat(e).value, floor) + 1;
    e.tauntedBy = tank.id;
    e.tauntTime = AGGRO.tauntDuration;
    e.targetId = tank.id;
    this.events.push({ type: 'taunt', from: tank.id, to: e.id });
  }

  // --- shaman casting ------------------------------------------------------

  /**
   * Shaman: if a goblin is hurt and Mend is available, walk to within range of
   * it and start casting. Returns true if it spent this tick on that.
   */
  private shamanMend(e: Unit, dt: number): boolean {
    if (e.castCooldown || this.hasEffect(e, 'silence') || e.y < 0) return false;
    const hurt = this.units
      .filter((u) => u.side === 'enemy' && u.alive && u.id !== e.id && !this.isSheep(u) && u.maxHp - u.hp >= SHAMAN_MEND.minMissing)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!hurt) return false;
    const gap = dist(e, hurt) - e.radius - hurt.radius;
    if (gap > SHAMAN_MEND.range) {
      const len = dist(e, hurt) || 1;
      const move = Math.min(e.speed * dt, gap - SHAMAN_MEND.range + 0.5);
      e.x += ((hurt.x - e.x) / len) * move;
      e.y += ((hurt.y - e.y) / len) * move;
      e.targetId = null;
      return true;
    }
    e.casting = { spell: SHAMAN_MEND.name, remaining: SHAMAN_MEND.castTime, total: SHAMAN_MEND.castTime, targetId: hurt.id };
    this.events.push({ type: 'castStart', from: e.id, spell: SHAMAN_MEND.name, to: hurt.id, duration: SHAMAN_MEND.castTime });
    return true;
  }

  private progressCast(e: Unit, dt: number): void {
    const c = e.casting!;
    const target = this.unit(c.targetId);
    if (!target?.alive) {
      this.endCast(e, false);
      return;
    }
    c.remaining -= dt;
    if (c.remaining > 0) return;
    const amount = Math.min(target.maxHp - target.hp, SHAMAN_MEND.heal);
    target.hp += amount;
    this.events.push({ type: 'heal', from: e.id, to: target.id, amount });
    this.endCast(e, false);
  }

  private endCast(e: Unit, interrupted: boolean): void {
    if (!e.casting) return;
    e.casting = undefined;
    e.castCooldown = interrupted ? SHAMAN_MEND.cooldown : SHAMAN_MEND.cooldown;
    this.events.push({ type: 'castEnd', from: e.id, interrupted });
  }

  // --- ability helpers -----------------------------------------------------

  private canPolymorph(h: Unit, e: Unit): boolean {
    return e.side === 'enemy' && e.alive && !e.isBoss && !this.isSheep(e) && dist(h, e) - h.radius - e.radius <= ABILITY_TUNING.polymorph.range;
  }

  /**
   * Who Polymorph should sheep when there are several enemies: elites first,
   * then casters, then anything beating on a non-tank. Never the last enemy.
   */
  private polymorphCandidate(h: Unit): Unit | undefined {
    const active = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u));
    if (active.length < 2) return undefined;
    const valid = active.filter((e) => !e.goesForGate && this.canPolymorph(h, e));
    const onNonTank = (e: Unit) => {
      const victim = e.targetId !== null && e.targetId >= 0 ? this.unit(e.targetId) : undefined;
      return victim?.side === 'hero' && !victim.isTank;
    };
    return valid.find((e) => e.isElite) ?? valid.find((e) => e.isCaster) ?? valid.find(onNonTank);
  }

  private applyPolymorph(h: Unit, to: Unit): void {
    if (to.casting) this.endCast(to, true);
    to.targetId = null;
    to.tauntTime = 0;
    this.addEffect(to, { kind: 'sheep', remaining: ABILITY_TUNING.polymorph.duration, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id });
    for (const hero of this.units) if (hero.side === 'hero' && hero.targetId === to.id) hero.targetId = null;
    // Don't let your own auto attacks break the sheep you just made.
    if (this.focusId === to.id) this.focusId = null;
    this.events.push({ type: 'ability', from: h.id, ability: 'polymorph', to: to.id });
  }

  /** +20% max health for every living hero (refreshes rather than stacks). */
  private applyFortitude(source: Unit, duration: number): void {
    const bonusFrac = ABILITY_TUNING.fortitude.bonus;
    for (const ally of this.units) {
      if (ally.side !== 'hero' || !ally.alive) continue;
      const existing = ally.effects?.find((e) => e.kind === 'fortitude');
      if (existing) {
        existing.remaining = Math.max(existing.remaining, duration);
        continue;
      }
      const bonus = Math.round(ally.maxHp * bonusFrac);
      ally.maxHp += bonus;
      ally.hp += bonus;
      this.addEffect(ally, { kind: 'fortitude', remaining: duration, tickEvery: 0, tickTimer: 0, amount: bonus, sourceId: source.id });
    }
  }

  // --- passives ------------------------------------------------------------

  /** Each class's always-on passive. Runs even when the player has AUTO off. */
  private updatePassive(h: Unit, dt: number): void {
    if (h.passiveCooldown) h.passiveCooldown = Math.max(0, h.passiveCooldown - dt);
    switch (h.passive) {
      case 'autoTaunt': {
        if (h.passiveCooldown) return;
        const loose = this.looseEnemies(h);
        if (!loose.length) return;
        this.applyTaunt(h, nearest(h, loose));
        h.passiveCooldown = PASSIVE_TUNING.autoTaunt.cooldown;
        return;
      }
      case 'autoPolymorph': {
        if (h.passiveCooldown) return;
        const target = this.polymorphCandidate(h);
        if (!target) return;
        this.applyPolymorph(h, target);
        h.passiveCooldown = PASSIVE_TUNING.autoPolymorph.cooldown;
        return;
      }
      case 'stealth': {
        if (this.hasEffect(h, 'stealth')) return;
        h.outOfCombat = (h.outOfCombat ?? 0) + dt;
        const hunted = this.units.some((e) => e.side === 'enemy' && e.alive && e.targetId === h.id);
        if (h.outOfCombat >= PASSIVE_TUNING.stealth.restealthAfter && !hunted) {
          this.addEffect(h, this.stealthEffect());
          this.events.push({ type: 'notice', id: h.id, text: 'Stealth', tone: 'info' });
        }
        return;
      }
    }
  }

  /** Enemies within an interrupt's range. */
  private interruptTargets(h: Unit, range: number): Unit[] {
    return this.units.filter((u) => u.side === 'enemy' && u.alive && dist(h, u) - h.radius - u.radius <= range);
  }

  private interruptRange(id: AbilityId): number {
    return id === 'kick' ? ABILITY_TUNING.kick.range : ABILITY_TUNING.counterspell.range;
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
    const isPlayer = h.id === this.playerId;
    const focus = isPlayer && this.focusId !== null ? this.unit(this.focusId) : undefined;

    if (h.heal) {
      let hurt = this.units
        .filter((u) => u.side === 'hero' && u.alive && u.maxHp - u.hp >= h.heal! * 0.6)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      // A focused ally gets heals first whenever they're missing any health.
      if (focus?.side === 'hero' && focus.alive && focus.hp < focus.maxHp) hurt = focus;
      if (hurt) {
        const amount = Math.min(hurt.maxHp - hurt.hp, this.roll(h.heal));
        hurt.hp += amount;
        h.cooldown = h.attackInterval;
        this.events.push({ type: 'heal', from: h.id, to: hurt.id, amount });
        this.addHealThreat(h, amount);
        return;
      }
    }

    const target = this.pickEnemyTarget(h, h.damage * 1.1);
    if (!target) {
      h.targetId = null;
      return;
    }
    h.targetId = target.id;
    h.cooldown = h.attackInterval;
    this.damage(h, target, this.roll(h.damage));
    if (this.hasTrait(h, 'comboPoints')) h.comboPoints = Math.min(TRAIT_TUNING.maxComboPoints, (h.comboPoints ?? 0) + 1);
  }

  /** Is this hero controlled by careful AI right now? */
  private isCareful(h: Unit): boolean {
    if (h.isTank || !this.carefulAI) return false;
    return h.id !== this.playerId || this.playerAuto;
  }

  private inReach(h: Unit, e: Unit): boolean {
    return dist(h, e) - h.radius - e.radius <= h.range;
  }

  /**
   * Choose an enemy for a hero to hit: the player's focus if it's in range,
   * else the current target, else closest (melee) / most advanced (ranged).
   */
  private pickEnemyTarget(h: Unit, hitSize: number): Unit | null {
    if (h.id === this.playerId && this.focusId !== null) {
      const f = this.unit(this.focusId);
      if (f?.side === 'enemy' && f.alive && this.inReach(h, f)) return f;
    }
    // An ambush from stealth hits twice as hard — careful AI must account for that.
    if (this.hasEffect(h, 'stealth')) hitSize *= PASSIVE_TUNING.stealth.ambushMultiplier;
    let inRange = this.units.filter((u) => u.side === 'enemy' && u.alive && this.inReach(h, u));
    // Sheep are the lowest priority: only attacked when nothing else is left anywhere.
    const othersAlive = this.units.some((u) => u.side === 'enemy' && u.alive && !this.isSheep(u));
    inRange = inRange.filter((u) => !this.isSheep(u) || !othersAlive);
    if (this.isCareful(h)) inRange = inRange.filter((u) => !this.wouldPull(h, u, hitSize));
    if (!inRange.length) return null;
    const current = inRange.find((u) => u.id === h.targetId);
    if (current) return current;
    return h.attackStyle === 'melee' ? nearest(h, inRange) : inRange.reduce((a, b) => (b.y > a.y ? b : a));
  }

  // --- abilities ----------------------------------------------------------

  /** AI decides whether to use any of a hero's abilities this tick. */
  private aiAbilities(h: Unit): void {
    (h.abilities ?? []).forEach((a, slot) => {
      if (this.abilityState(slot, h) !== 'ok') return;
      if (this.aiWants(h, a.id)) this.cast(h, slot, false);
    });
  }

  private aiWants(h: Unit, id: AbilityId): boolean {
    const t = ABILITY_TUNING;
    switch (id) {
      case 'taunt':
        return this.looseEnemies(h).length > 0;
      case 'thunderclap':
        return this.enemiesNear(h, t.thunderclap.radius).length > 0;
      case 'heal':
        return this.units.some((u) => u.side === 'hero' && u.alive && u.hp < u.maxHp * 0.7);
      case 'renew':
        // Proactive: keep Renew rolling on anyone being attacked or hurt.
        return this.renewCandidates().length > 0;
      case 'fortitude':
        return this.units.some((u) => u.side === 'hero' && u.alive && !this.hasEffect(u, 'fortitude'));
      case 'fireball':
        return !!this.pickEnemyTarget(h, t.fireball.damage);
      case 'sinisterStrike':
        return !!this.pickEnemyTarget(h, t.sinisterStrike.damage);
      case 'heroicStrike':
        return !!this.pickEnemyTarget(h, t.heroicStrike.damage);
      case 'polymorph':
        return !!this.polymorphCandidate(h);
      case 'kick':
      case 'counterspell':
        return this.interruptTargets(h, this.interruptRange(id)).some((u) => u.casting);
    }
  }

  /**
   * Allies without Renew who are being attacked or are missing health,
   * most-attacked first, then lowest health.
   */
  private renewCandidates(): Unit[] {
    const attackers = (u: Unit) => this.units.filter((e) => e.side === 'enemy' && e.alive && e.targetId === u.id).length;
    return this.units
      .filter((u) => u.side === 'hero' && u.alive && !this.hasEffect(u, 'hot') && (attackers(u) > 0 || u.hp < u.maxHp * 0.95))
      .sort((a, b) => attackers(b) - attackers(a) || a.hp / a.maxHp - b.hp / b.maxHp);
  }

  private enemiesNear(h: Unit, radius: number): Unit[] {
    return this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && dist(h, u) <= radius);
  }

  private lowestAlly(): Unit | undefined {
    return this.units.filter((u) => u.side === 'hero' && u.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  /**
   * Who an ability would hit right now, without casting it. With a focus set,
   * the player's abilities only go to that focus (enemy or, for heals, ally).
   */
  private abilityTarget(h: Unit, id: AbilityId, byPlayer: boolean): Unit | null {
    const t = ABILITY_TUNING;
    const focus = byPlayer && this.focusId !== null ? this.unit(this.focusId) : undefined;
    const focusEnemy = focus?.side === 'enemy' && focus.alive ? focus : undefined;
    const focusAlly = focus?.side === 'hero' && focus.alive ? focus : undefined;
    switch (id) {
      case 'taunt': {
        const inRange = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && dist(h, u) <= AGGRO.tauntRange);
        if (focusEnemy) return inRange.includes(focusEnemy) ? focusEnemy : null;
        const loose = this.looseEnemies(h);
        return loose.length ? nearest(h, loose) : inRange.length ? nearest(h, inRange) : null;
      }
      case 'thunderclap':
        return this.enemiesNear(h, t.thunderclap.radius).length ? h : null;
      case 'heal':
        return focusAlly ?? this.lowestAlly() ?? null;
      case 'renew':
        return focusAlly ?? this.renewCandidates()[0] ?? this.lowestAlly() ?? null;
      case 'fortitude':
        return h; // party-wide; always has a target
      case 'fireball':
      case 'sinisterStrike':
      case 'heroicStrike': {
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        const size = id === 'fireball' ? t.fireball.damage : id === 'heroicStrike' ? t.heroicStrike.damage : t.sinisterStrike.damage;
        return this.pickEnemyTarget(h, byPlayer ? 0 : size);
      }
      case 'polymorph': {
        if (focusEnemy) return this.canPolymorph(h, focusEnemy) ? focusEnemy : null;
        if (!byPlayer) return this.polymorphCandidate(h) ?? null;
        return (
          this.polymorphCandidate(h) ??
          this.units.filter((u) => this.canPolymorph(h, u) && !u.goesForGate).sort((a, b) => b.y - a.y)[0] ??
          null
        );
      }
      case 'kick':
      case 'counterspell': {
        const targets = this.interruptTargets(h, this.interruptRange(id));
        if (focusEnemy) return targets.includes(focusEnemy) ? focusEnemy : null;
        return targets.find((u) => u.casting) ?? (targets.length ? nearest(h, targets) : null);
      }
    }
  }

  /** Perform the ability in `slot`. Returns false if there was no valid target. */
  private cast(h: Unit, slot: number, byPlayer: boolean): boolean {
    const slotState = h.abilities![slot];
    const id = slotState.id;
    const def = ABILITIES[id];
    const t = ABILITY_TUNING;
    const to = this.abilityTarget(h, id, byPlayer);
    if (!to) return false;

    switch (id) {
      case 'taunt':
        this.applyTaunt(h, to);
        break;
      case 'thunderclap': {
        const hit = this.enemiesNear(h, t.thunderclap.radius);
        this.events.push({ type: 'ability', from: h.id, ability: id });
        for (const e of hit) {
          this.damage(h, e, this.roll(t.thunderclap.damage), { threatScale: t.thunderclap.threatBonus, ability: id, aoe: true });
          this.addEffect(e, { kind: 'slow', remaining: t.thunderclap.slow, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id });
        }
        break;
      }
      case 'heal': {
        const amount = Math.min(to.maxHp - to.hp, this.roll(t.heal.amount));
        to.hp += amount;
        this.events.push({ type: 'ability', from: h.id, ability: id, to: to.id });
        this.events.push({ type: 'heal', from: h.id, to: to.id, amount });
        this.addHealThreat(h, amount);
        break;
      }
      case 'renew': {
        const ticks = t.renew.duration / t.renew.tick;
        to.effects = (to.effects ?? []).filter((e) => e.kind !== 'hot');
        this.addEffect(to, { kind: 'hot', remaining: t.renew.duration, tickEvery: t.renew.tick, tickTimer: t.renew.tick, amount: t.renew.total / ticks, sourceId: h.id });
        this.events.push({ type: 'ability', from: h.id, ability: id, to: to.id });
        break;
      }
      case 'fortitude':
        this.applyFortitude(h, t.fortitude.duration);
        this.events.push({ type: 'ability', from: h.id, ability: id });
        break;
      case 'heroicStrike':
        h.targetId = to.id;
        this.events.push({ type: 'ability', from: h.id, ability: id, to: to.id });
        this.damage(h, to, this.roll(t.heroicStrike.damage), { ability: id, threatScale: t.heroicStrike.threatBonus });
        break;
      case 'fireball':
      case 'sinisterStrike': {
        let size = id === 'fireball' ? t.fireball.damage : t.sinisterStrike.damage;
        if (id === 'sinisterStrike' && this.hasTrait(h, 'comboPoints') && h.comboPoints) {
          size *= 1 + h.comboPoints * TRAIT_TUNING.comboBonusPerPoint;
          h.comboPoints = 0;
        }
        h.targetId = to.id;
        this.events.push({ type: 'ability', from: h.id, ability: id, to: to.id });
        this.damage(h, to, this.roll(size), { ability: id });
        if (id === 'fireball' && to.alive) {
          const f = t.fireball;
          this.addEffect(to, { kind: 'dot', remaining: f.burnDuration, tickEvery: 1, tickTimer: 1, amount: f.burnPerSecond, sourceId: h.id });
        }
        break;
      }
      case 'polymorph':
        this.applyPolymorph(h, to);
        break;
      case 'kick':
      case 'counterspell': {
        this.events.push({ type: 'ability', from: h.id, ability: id, to: to.id });
        if (to.casting) {
          this.endCast(to, true);
          const silence = id === 'kick' ? t.kick.silence : t.counterspell.silence;
          this.addEffect(to, { kind: 'silence', remaining: silence, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id });
          this.events.push({ type: 'notice', id: to.id, text: id === 'kick' ? 'Interrupted!' : 'Countered!', tone: 'good' });
        }
        if (id === 'kick') this.damage(h, to, t.kick.damage);
        break;
      }
    }

    let cost = this.abilityCost(h, id);
    if (id === 'fireball' && this.hasTrait(h, 'arcaneSurge') && this.rng() < TRAIT_TUNING.arcaneSurgeChance) {
      cost = 0;
      this.events.push({ type: 'notice', id: h.id, text: 'Arcane Surge!', tone: 'info' });
    }
    h.resource = h.resource! - cost;
    slotState.cooldown = def.cooldown;
    return true;
  }

  private addEffect(u: Unit, effect: Effect): void {
    u.effects ??= [];
    const same = u.effects.find((e) => e.kind === effect.kind && e.sourceId === effect.sourceId);
    if (same) Object.assign(same, effect);
    else u.effects.push(effect);
  }

  private tickEffects(u: Unit, dt: number): void {
    if (!u.effects?.length) return;
    for (const e of u.effects) {
      e.remaining -= dt;
      if (e.kind !== 'hot' && e.kind !== 'dot') continue;
      e.tickTimer -= dt;
      if (e.tickTimer > 1e-6) continue;
      e.tickTimer += e.tickEvery;
      const amount = Math.round(e.amount);
      if (e.kind === 'hot') {
        const healed = Math.min(u.maxHp - u.hp, amount);
        u.hp += healed;
        if (healed > 0) {
          this.events.push({ type: 'tick', to: u.id, amount: healed, kind: 'hot' });
          const source = this.unit(e.sourceId);
          if (source) this.addHealThreat(source, healed);
        }
      } else {
        const source = this.unit(e.sourceId);
        if (source) this.damage(source, u, amount, { tick: true });
      }
      if (!u.alive) break;
    }
    for (const e of u.effects) if (e.remaining <= 1e-6 && e.kind === 'fortitude') this.removeFortitude(u, e);
    u.effects = u.effects.filter((e) => e.remaining > 1e-6);
  }

  private removeFortitude(u: Unit, e: Effect): void {
    u.maxHp -= e.amount;
    u.hp = Math.min(u.hp, u.maxHp);
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

  private damage(from: Unit, to: Unit, amount: number, opts: { threatScale?: number; ability?: AbilityId; tick?: boolean; aoe?: boolean } = {}): void {
    if (!to.alive) return;
    if (this.isSheep(to)) {
      if (opts.aoe) return; // sheep ignore AoE
      to.effects = to.effects!.filter((e) => e.kind !== 'sheep');
      this.events.push({ type: 'notice', id: to.id, text: 'Sheep broke!', tone: 'bad' });
    }
    // Stealth: the first hit out of stealth is an ambush.
    if (this.hasEffect(from, 'stealth')) {
      from.effects = from.effects!.filter((e) => e.kind !== 'stealth');
      if (!opts.tick) {
        amount = Math.round(amount * PASSIVE_TUNING.stealth.ambushMultiplier);
        this.events.push({ type: 'notice', id: from.id, text: 'Ambush!', tone: 'good' });
      }
    }
    if (from.side === 'hero') from.outOfCombat = 0;
    if (to.side === 'hero') {
      to.outOfCombat = 0;
      if (this.hasEffect(to, 'stealth')) to.effects = to.effects!.filter((e) => e.kind !== 'stealth');
    }
    // Rage trait: more rage, more damage.
    if (this.hasTrait(from, 'rage') && !opts.tick) {
      amount = Math.round(amount * (1 + TRAIT_TUNING.rageDamageAtMax * (from.resource! / from.maxResource!)));
    }
    to.hp -= amount;
    if (from.side === 'hero' && to.side === 'enemy') {
      to.threat ??= {};
      to.threat[from.id] = this.threatOf(to, from.id) + amount * (from.threatMultiplier ?? 1) * (opts.threatScale ?? 1);
    }
    if (from.resourceKind === 'rage') from.resource = Math.min(from.maxResource!, from.resource! + amount * RAGE.perDealt);
    if (to.resourceKind === 'rage') to.resource = Math.min(to.maxResource!, to.resource! + amount * RAGE.perTaken);
    if (opts.tick) this.events.push({ type: 'tick', to: to.id, amount, kind: 'dot' });
    else this.events.push({ type: 'attack', from: from.id, to: to.id, style: from.attackStyle, amount, ability: opts.ability });
    if (to.hp <= 0 && to.alive) {
      to.hp = 0;
      to.alive = false;
      for (const e of to.effects ?? []) if (e.kind === 'fortitude') this.removeFortitude(to, e);
      to.effects = [];
      if (this.focusId === to.id) this.focusId = null;
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
