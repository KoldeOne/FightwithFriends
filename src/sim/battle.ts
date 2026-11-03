import {
  ABILITIES,
  ABILITY_TUNING,
  AGGRO,
  AI_RESERVE,
  ARENA,
  ENEMY_STATS,
  ONE_OF_EACH,
  formationFor,
  FACTION,
  GEAR_BONUS,
  BOSS_INFO,
  BOSS_SPECIALS,
  HERO_KIT,
  HERO_MOVE,
  HERO_STATS,
  LEVEL_SCALING,
  MAX_ABILITY_SLOTS,
  PASSIVE_TUNING,
  RAGE,
  RESOURCES,
  BRUTE_SMASH,
  SHAMAN_MEND,
  SUDDEN_DEATH,
  TRAIT_TUNING,
  UPGRADE,
  WORLD,
} from './content';
import { createRng } from './rng';
import { abilityScaleFor, abilityText } from './abilityText';
import type { AbilityId, AbilitySlot, AggroLevel, BattleEvent, CastKind, Effect, EnemyKind, HeroBuild, HeroClass, Outcome, SpawnDef, TraitId, Unit, WaveDef, Zone } from './types';

interface DamageOpts {
  threatScale?: number;
  ability?: AbilityId;
  tick?: boolean;
  aoe?: boolean;
  /** A heavy hit worth extra feedback (screen shake, hit-stop). */
  big?: boolean;
  /** Fireball: burn damage per second applied on impact. */
  burn?: number;
  /** Searing Fire: the burn also spreads to a nearby enemy. */
  spread?: boolean;
  /** Hex of Rot: total rot damage applied on impact. */
  rot?: number;
}

interface Projectile {
  from: Unit;
  to: Unit;
  amount: number;
  opts: DamageOpts;
  remaining: number;
}

/** Projectile speed (px/s): ranged damage lands when the shot arrives. */
const PROJECTILE_SPEED = 520;

/** Fixed simulation step in seconds. The renderer calls step() with this. */
export const STEP = 0.05;

export interface BattleOptions {
  seed: number;
  wave: WaveDef;
  /** The team, one class per slot (duplicates allowed). Defaults to one of each. */
  team?: HeroClass[];
  /** Same as `team` (kept for tests). */
  heroes?: HeroClass[];
  /** AI DPS/healers hold back before pulling aggro (default true). */
  carefulAI?: boolean;
  /** The class the player controls (can also be set later with setPlayer). */
  playerClass?: HeroClass;
  /** Levels, abilities and traits carried over from earlier waves, per team slot. */
  builds?: HeroBuild[];
  /** A curse: every hero takes this much more damage this fight (e.g. 0.25). */
  curse?: number;
  /** A Feast: every hero has this much more max health this fight (e.g. 0.15). */
  feast?: number;
  /** Challenge twists: enemies deal this times their damage; heroes heal this times as much. */
  enemyDamage?: number;
  healingScale?: number;
}

export type AbilityResult = 'ok' | 'dead' | 'cooldown' | 'resource' | 'target';

/**
 * Pure combat simulation for one fight. Knows nothing about rendering:
 * the renderer reads `units` and drained events each frame. The fight is won
 * when every enemy is down and lost when every hero is.
 */
export class Battle {
  time = 0;
  units: Unit[] = [];
  outcome: Outcome = 'running';
  readonly wave: WaveDef;
  carefulAI: boolean;
  /** Id of the hero the player controls, if chosen. */
  playerId: number | null = null;
  /** AUTO: the AI also plays the player's hero (casts its ability). */
  playerAuto = true;
  /** Player's focus: an enemy (or, for healers, an ally). */
  focusId: number | null = null;
  /** Ground effects such as Blizzard. */
  zones: Zone[] = [];
  /** Shots in flight. */
  private projectiles: Projectile[] = [];
  /**
   * Damage and healing per hero (by unit id) this fight, split by source: the
   * damage meter. Sources are ids: an ability id, "id:dot" (its damage over
   * time), "id:absorb" (a shield), or auto, autoHeal, dot, soulHarvest, other.
   */
  readonly meter = new Map<number, { damage: Record<string, number>; healing: Record<string, number> }>();
  /** What healing done right now counts as (the ability being cast). */
  private healSource?: string;
  /** Every enemy killed this fight (gold and camp loot). */
  readonly kills: { kind: EnemyKind; summoned: boolean }[] = [];

  /** Challenge twists (1 = normal). */
  private enemyDamage = 1;
  private healingScale = 1;

  private nextId = 1;
  private pending: SpawnDef[];
  private events: BattleEvent[] = [];
  private rng: () => number;

  constructor(opts: BattleOptions) {
    this.rng = createRng(opts.seed);
    this.wave = opts.wave;
    this.enemyDamage = opts.enemyDamage ?? 1;
    this.healingScale = opts.healingScale ?? 1;
    this.carefulAI = opts.carefulAI ?? true;
    this.pending = [...opts.wave.spawns].sort((a, b) => a.time - b.time);
    const team = opts.team ?? opts.heroes ?? ONE_OF_EACH;
    for (const spot of formationFor(team, opts.playerClass)) {
      this.addHero(spot.cls, spot.x, spot.y, opts.builds?.[spot.slot], spot.slot);
    }
    if (opts.playerClass) this.setPlayer(opts.playerClass);
    // Priest passive: Power Word: Fortitude is up on the whole party all wave.
    const priest = this.units.find((u) => u.side === 'hero' && u.passive === 'fortitudeAura');
    if (priest) this.applyFortitude(priest, Infinity);
    if (opts.curse)
      for (const h of this.units.filter((u) => u.side === 'hero'))
        this.addEffect(h, { kind: 'cursed', remaining: Infinity, tickEvery: 0, tickTimer: 0, amount: opts.curse, sourceId: h.id });
    if (opts.feast)
      for (const h of this.units.filter((u) => u.side === 'hero')) {
        h.maxHp = Math.round(h.maxHp * (1 + opts.feast));
        h.hp = h.maxHp;
        this.addEffect(h, { kind: 'fed', remaining: Infinity, tickEvery: 0, tickTimer: 0, amount: opts.feast, sourceId: h.id });
      }
    // Arena enemies are on the field from the start, so you can scout them before the fight.
    this.spawnDue();
  }

  /** Sudden death: after a while every hit lands harder, so no fight can stall forever. */
  get damageRamp(): number {
    return 1 + Math.max(0, this.time - SUDDEN_DEATH.after) * SUDDEN_DEATH.perSecond;
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
    void h;
    return ABILITIES[id].cost;
  }

  /** Why the ability in `slot` can't be used right now, or 'ok'. */
  abilityState(slot = 0, h: Unit | undefined = this.player): AbilityResult {
    const a = h?.abilities?.[slot];
    if (!h?.alive || !a) return 'dead';
    if (this.hasEffect(h, 'stun')) return 'cooldown';
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
    return this.abilityTarget(h, a, true) !== null;
  }

  /** Give a hero an ability in the next free slot (used by level-ups). */
  learnAbility(h: Unit, id: AbilityId): boolean {
    h.abilities ??= [];
    if (this.slotsUsed(h) >= MAX_ABILITY_SLOTS || h.abilities.some((a) => a.id === id)) return false;
    h.abilities.push({ id, cooldown: 0, power: 0, haste: 0, mastery: false });
    return true;
  }

  /** Abilities and traits both take a slot. */
  slotsUsed(h: Unit): number {
    return (h.abilities?.length ?? 0) + (h.traits?.length ?? 0);
  }

  /** Effect multiplier for an ability: hero level x Might x Empowered ranks. */
  abilityScale(h: Unit, slot: AbilitySlot): number {
    return abilityScaleFor(h, slot);
  }

  /** Plain-language numbers for an ability on this hero (includes level and upgrades). */
  abilityEffectText(h: Unit, slot: AbilitySlot): string {
    return abilityText(h, slot);
  }

  abilityCooldown(slot: AbilitySlot): number {
    const base = ABILITIES[slot.id].cooldown - (slot.id === 'doom' && slot.mastery ? ABILITY_TUNING.doom.masteryCooldown : 0);
    return base * Math.pow(UPGRADE.hastePerRank, slot.haste ?? 0);
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
    this.spawnDue();

    for (const u of this.units) {
      if (!u.alive) continue;
      u.cooldown = Math.max(0, u.cooldown - dt);
      if (u.tauntTime) u.tauntTime = Math.max(0, u.tauntTime - dt);
      for (const a of u.abilities ?? []) if (a.cooldown) a.cooldown = Math.max(0, a.cooldown - dt * (u.cooldownRate ?? 1));
      if (u.castCooldown) u.castCooldown = Math.max(0, u.castCooldown - dt);
      if (u.specialCooldown) u.specialCooldown = Math.max(0, u.specialCooldown - dt);
      if (u.resourceKind) u.resource = Math.min(u.maxResource!, u.resource! + RESOURCES[u.resourceKind].regen * (u.focus ?? 1) * dt);
      this.tickEffects(u, dt);
      if (!u.alive) continue;
      // Stunned (or frozen): does nothing at all this step.
      if (this.hasEffect(u, 'stun')) {
        u.vx = 0;
        u.vy = 0;
        continue;
      }
      if (u.side === 'enemy') this.updateEnemy(u, dt);
      else {
        if (u.id !== this.playerId) this.moveHero(u, dt);
        this.updatePassive(u, dt);
        if (u.id !== this.playerId || this.playerAuto) this.aiAbilities(u);
        this.updateHero(u);
      }
    }
    this.updateZones(dt);
    this.updateProjectiles(dt);
    this.separate();
    this.units = this.units.filter((u) => u.alive || u.side === 'hero');

    if (!this.units.some((u) => u.side === 'hero' && u.alive)) {
      this.outcome = 'defeat';
    } else if (this.enemiesRemaining === 0) {
      this.outcome = 'victory';
    }
  }

  // --- spawning -----------------------------------------------------------

  private spawnDue(): void {
    while (this.pending.length && this.pending[0].time <= this.time) {
      const s = this.pending.shift()!;
      // Arena enemies stand exactly on their tile; anything else gets a little jitter.
      const jitter = s.y === undefined ? (this.rng() - 0.5) * 16 : 0;
      this.addEnemy(s.kind, s.x + jitter, s.y);
    }
  }

  private addHero(cls: HeroClass, x: number, y: number, build?: HeroBuild, slot = 0): void {
    const s = HERO_STATS[cls];
    const kit = HERO_KIT[cls];
    const res = RESOURCES[kit.resource];
    const level = build?.level ?? 1;
    // Camp Mode gear: weapon -> damage and healing, armor -> health, trinket -> regen and cooldowns.
    const gear = build?.gear;
    const might = (1 + UPGRADE.mightPerRank * (build?.might ?? 0)) * (1 + GEAR_BONUS.weapon * (gear?.weapon ?? 0));
    // A Blood Altar wound lowers max health until the end of the act.
    const vitality = (1 + UPGRADE.vitalityPerRank * (build?.vitality ?? 0)) * (1 + GEAR_BONUS.armor * (gear?.armor ?? 0)) * (1 - (build?.wound ?? 0));
    const focus = (1 + UPGRADE.focusPerRank * (build?.focus ?? 0)) * (1 + GEAR_BONUS.trinketRegen * (gear?.trinket ?? 0));
    const scale = 1 + LEVEL_SCALING * (level - 1);
    const abilities: AbilitySlot[] = build
      ? build.abilities.map((a) => ({ id: a.id, cooldown: 0, power: a.power, haste: a.haste, mastery: !!a.mastery }))
      : [{ id: kit.starting, cooldown: 0, power: 0, haste: 0, mastery: false }];
    // Duplicate classes get a number: "Mage", "Mage 2".
    const same = this.units.filter((u) => u.side === 'hero' && u.kind === cls).length;
    this.addUnit({
      ...s,
      label: same ? `${s.label} ${same + 1}` : s.label,
      maxHp: Math.round(s.maxHp * scale * vitality),
      damage: s.damage * scale * might,
      heal: s.heal ? s.heal * scale * might : undefined,
      level,
      might,
      focus,
      cooldownRate: 1 + GEAR_BONUS.trinketCooldown * (gear?.trinket ?? 0),
      id: 0,
      side: 'hero',
      kind: cls,
      x,
      y,
      homeX: x,
      homeY: y,
      slot,
      idleOffX: (this.rng() - 0.5) * 36,
      idleOffY: (this.rng() - 0.5) * 24,
      hp: Math.round(s.maxHp * scale * vitality),
      cooldown: 0.3 * this.rng(),
      targetId: null,
      alive: true,
      resourceKind: kit.resource,
      resource: res.start,
      maxResource: res.max,
      abilities,
      passive: kit.passive,
      passiveCooldown: 0,
      outOfCombat: 0,
      traits: [...(build?.traits ?? [])],
      comboPoints: 0,
      effects: [
        ...(kit.passive === 'stealth' ? [this.stealthEffect()] : []),
        // A Blood Altar wound shows as a debuff (it already lowered max health above).
        ...(build?.wound ? [{ kind: 'wounded' as const, remaining: Infinity, tickEvery: 0, tickTimer: 0, amount: build.wound, sourceId: 0 }] : []),
      ],
    });
  }

  private stealthEffect(): Effect {
    return { kind: 'stealth', remaining: Infinity, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: 0 };
  }

  private addEnemy(kind: EnemyKind, x: number, y = WORLD.spawnY, hpFactor = 1, summoned = false, damageFactor = 1): void {
    const s = ENEMY_STATS[kind];
    const strength = this.wave.strength ?? 1;
    // Flankers start just off the side edges; everyone else just above the top.
    const clampedX = y === WORLD.spawnY ? Math.min(WORLD.width - s.radius, Math.max(s.radius, x)) : x;
    const maxHp = Math.round(s.maxHp * strength * hpFactor);
    const special = BOSS_INFO[kind]?.special;
    const specialCooldown = special ? BOSS_SPECIALS[special as keyof typeof BOSS_SPECIALS].first : undefined;
    this.addUnit({ ...s, maxHp, damage: s.damage * strength * damageFactor * this.enemyDamage, id: 0, side: 'enemy', kind, x: clampedX, y, hp: maxHp, cooldown: 0.5, targetId: null, alive: true, threat: {}, effects: [], specialCooldown, summoned });
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
    if (e.isBoss && this.bossSpecial(e)) return;
    if (e.ai === 'healer' && this.shamanMend(e, dt)) return;
    if (e.ai === 'smasher' && this.bruteSmash(e)) return;

    const target = this.chooseEnemyTarget(e);
    e.targetId = target ? target.id : null;
    if (!target) {
      // Nobody visible (e.g. a stealthed rogue): hold still.
      e.vx = (e.vx ?? 0) * 0.5;
      e.vy = (e.vy ?? 0) * 0.5;
      return;
    }

    const gap = dist(e, target) - e.radius - target.radius;
    const tx = target.x;
    const ty = target.y;

    if (gap <= e.range) {
      e.vx = (e.vx ?? 0) * 0.5;
      e.vy = (e.vy ?? 0) * 0.5;
      if (e.cooldown <= 0) {
        // Slowed: attacks slower. War Cry (frenzy): attacks faster.
        const frenzy = e.effects?.find((x) => x.kind === 'frenzy')?.amount ?? 0;
        e.cooldown = (e.attackInterval * (this.hasEffect(e, 'slow') ? ABILITY_TUNING.slowFactor : 1)) / (1 + frenzy);
        const amount = this.roll(e.damage);
        if (e.attackStyle === 'ranged') this.shoot(e, target, amount);
        else this.damage(e, target, amount);
      }
      return;
    }

    // Melee enemies spread around their target instead of stacking up.
    if (e.attackStyle === 'melee') {
      const spot = this.surroundSpot(e, target);
      steer(e, spot.x, spot.y, this.enemySpeed(e), 0, dt);
      return;
    }
    // Otherwise walk straight in, easing to a stop at attack range.
    const len = Math.hypot(tx - e.x, ty - e.y) || 1;
    // Aim a little inside attack range so easing can't leave it just short.
    const stopAt = Math.max(0, len - (gap - e.range) - 3);
    steer(e, tx, ty, this.enemySpeed(e), stopAt, dt);
  }

  /**
   * Sudden death also speeds enemies up (to double), so a hero who outruns
   * melee enemies (a lone healer backing away) can't stall a fight forever.
   */
  private enemySpeed(e: Unit): number {
    return e.speed * Math.min(2, this.damageRamp);
  }

  /** A free spot around `target` for a melee enemy, so attackers form a ring. */
  private surroundSpot(e: Unit, target: Unit): { x: number; y: number } {
    const r = target.radius + e.radius + Math.min(e.range, 8) * 0.5;
    const base = Math.atan2(e.y - target.y, e.x - target.x);
    const others = this.units.filter((o) => o !== e && o.side === 'enemy' && o.alive && o.targetId === target.id && o.attackStyle === 'melee');
    for (let i = 0; i < 9; i++) {
      const offset = i === 0 ? 0 : Math.ceil(i / 2) * 0.5 * (i % 2 ? 1 : -1);
      const a = base + offset;
      const x = target.x + Math.cos(a) * r;
      const y = target.y + Math.sin(a) * r;
      if (!others.some((o) => Math.hypot(o.x - x, o.y - y) < o.radius + e.radius)) return { x, y };
    }
    return { x: target.x + Math.cos(base) * r, y: target.y + Math.sin(base) * r };
  }

  /** Fire a projectile; its damage lands when it arrives. */
  private shoot(from: Unit, to: Unit, amount: number, opts: DamageOpts = {}): void {
    const duration = Math.min(0.6, Math.max(0.08, dist(from, to) / PROJECTILE_SPEED));
    this.projectiles.push({ from, to, amount, opts, remaining: duration });
    this.events.push({ type: 'shoot', from: from.id, to: to.id, duration, ability: opts.ability });
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      p.remaining -= dt;
      if (p.remaining > 1e-6) continue;
      if (!p.to.alive) continue;
      this.damage(p.from, p.to, p.amount, p.opts);
      if (p.opts.burn) {
        const f = ABILITY_TUNING.fireball;
        if (p.to.alive) this.addEffect(p.to, { kind: 'dot', remaining: f.burnDuration, tickEvery: 1, tickTimer: 1, amount: p.opts.burn, sourceId: p.from.id, ability: p.opts.ability });
        // Searing Fire: the flames leap to the nearest other enemy.
        const next = p.opts.spread ? this.nextEnemy(p.to, f.spreadRadius) : undefined;
        if (next) this.addEffect(next, { kind: 'dot', remaining: f.burnDuration, tickEvery: 1, tickTimer: 1, amount: p.opts.burn, sourceId: p.from.id, ability: p.opts.ability });
      }
      if (p.opts.rot && p.to.alive) this.addDot(p.from, p.to, p.opts.rot, ABILITY_TUNING.hexBolt.rotDuration, 'hexBolt');
    }
    this.projectiles = this.projectiles.filter((p) => p.remaining > 1e-6 && p.to.alive);
  }

  /**
   * Aggro rules: a taunt forces the target; otherwise the hero with the most
   * threat, with a 110% margin needed to steal it from the current target.
   * Enemies with no threat yet go for the nearest hero.
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
    if (top.id === null) {
      // Nobody has hit it yet: keep walking at whoever it picked first.
      const current = e.targetId !== null && e.targetId >= 0 ? this.unit(e.targetId) : undefined;
      if (current?.alive && livingHeroes.includes(current)) return current;
      return nearest(e, livingHeroes);
    }
    return this.pickWithMargin(e, top);
  }

  private pickWithMargin(e: Unit, top: { id: number | null; value: number }): Unit | null {
    const current = e.targetId !== null ? this.unit(e.targetId) : undefined;
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
        dist(tank, u) <= AGGRO.tauntRange,
    );
  }

  private applyTaunt(tank: Unit, e: Unit): void {
    e.threat ??= {};
    e.threat[tank.id] = Math.max(this.threatOf(e, tank.id), this.topThreat(e).value) + 1;
    e.tauntedBy = tank.id;
    e.tauntTime = AGGRO.tauntDuration;
    e.targetId = tank.id;
    this.events.push({ type: 'taunt', from: tank.id, to: e.id });
  }

  // --- enemy casting -------------------------------------------------------

  /**
   * Healers (shaman, cultist, shadow caller): if an ally is hurt and the heal
   * is ready, walk to within range of it and start casting. Returns true if it
   * spent this tick on that.
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
      const move = Math.min(this.enemySpeed(e) * dt, gap - SHAMAN_MEND.range + 0.5);
      e.x += ((hurt.x - e.x) / len) * move;
      e.y += ((hurt.y - e.y) / len) * move;
      e.targetId = null;
      return true;
    }
    const spell = e.spell ?? 'Mend';
    e.casting = { spell, kind: 'healer', remaining: SHAMAN_MEND.castTime, total: SHAMAN_MEND.castTime, targetId: hurt.id };
    this.events.push({ type: 'castStart', from: e.id, spell, to: hurt.id, duration: SHAMAN_MEND.castTime });
    return true;
  }

  /** Smashers (elites, bosses): when in reach of their target, wind up a telegraphed heavy hit. */
  /** Start a cast (with the boss's enrage rule: after an interrupt, the next cast can't be stopped). */
  private startCast(e: Unit, kind: CastKind, spell: string, duration: number, target: Unit, at?: { x: number; y: number }): void {
    const unstoppable = !!e.isBoss && !!e.enraged;
    e.enraged = false;
    e.casting = { spell, kind, remaining: duration, total: duration, targetId: target.id, unstoppable, x: at?.x, y: at?.y };
    if (unstoppable) this.events.push({ type: 'notice', id: e.id, text: 'Unstoppable!', tone: 'bad' });
    this.events.push({ type: 'castStart', from: e.id, spell, to: target.id, duration });
  }

  /** Smashers (elites, bosses): when in reach of their target, wind up a telegraphed heavy hit. */
  private bruteSmash(e: Unit): boolean {
    if (e.castCooldown || this.hasEffect(e, 'silence')) return false;
    const target = this.chooseEnemyTarget(e);
    if (!target || dist(e, target) - e.radius - target.radius > e.range + 4) return false;
    e.targetId = target.id;
    this.startCast(e, 'smasher', e.spell ?? 'Smash', BRUTE_SMASH.castTime, target);
    return true;
  }

  /** A boss's signature move, when it's ready (see BOSS_INFO / BOSS_SPECIALS). */
  private bossSpecial(e: Unit): boolean {
    const info = BOSS_INFO[e.kind as EnemyKind];
    if (!info || e.specialCooldown || this.hasEffect(e, 'silence')) return false;
    const name = info.moves[1]?.name ?? 'Special';
    switch (info.special) {
      case 'warCry':
        this.startCast(e, 'warCry', name, BOSS_SPECIALS.warCry.castTime, e);
        return true;
      case 'raiseDead': {
        const raised = this.units.filter((u) => u.side === 'enemy' && u.alive && u.summoned).length;
        if (raised >= BOSS_SPECIALS.raiseDead.maxAlive) return false;
        this.startCast(e, 'raiseDead', name, BOSS_SPECIALS.raiseDead.castTime, e);
        return true;
      }
      case 'rainOfFire': {
        // The hero furthest from the boss: usually the back line (healers and casters).
        const heroes = this.units.filter((u) => u.side === 'hero' && u.alive && !this.hasEffect(u, 'stealth'));
        if (!heroes.length) return false;
        const mark = heroes.reduce((a, b) => (dist(b, e) > dist(a, e) ? b : a));
        this.startCast(e, 'rainOfFire', name, BOSS_SPECIALS.rainOfFire.castTime, mark, { x: mark.x, y: mark.y });
        return true;
      }
    }
    return false;
  }

  private progressCast(e: Unit, dt: number): void {
    const c = e.casting!;
    const target = this.unit(c.targetId);
    // Rain of Fire falls on the marked spot even if the hero moved or died.
    if (!target?.alive && c.kind !== 'rainOfFire') {
      this.endCast(e, false);
      return;
    }
    c.remaining -= dt;
    if (c.remaining > 0) return;
    switch (c.kind) {
      case 'healer': {
        const amount = Math.min(target!.maxHp - target!.hp, Math.round(SHAMAN_MEND.heal * (this.wave.strength ?? 1)));
        target!.hp += amount;
        this.events.push({ type: 'heal', from: e.id, to: target!.id, amount });
        break;
      }
      case 'smasher':
        this.events.push({ type: 'notice', id: e.id, text: `${c.spell.toUpperCase()}!`, tone: 'bad' });
        // e.damage already includes the round's strength.
        this.damage(e, target!, Math.round(e.damage * BRUTE_SMASH.damageFactor), { big: true });
        for (const h of this.units) {
          if (h.side !== 'hero' || !h.alive || h.id === target!.id) continue;
          if (dist(h, target!) <= BRUTE_SMASH.splashRadius) this.damage(e, h, Math.round(e.damage * BRUTE_SMASH.splashFactor), { aoe: true });
        }
        break;
      case 'warCry': {
        const w = BOSS_SPECIALS.warCry;
        this.events.push({ type: 'notice', id: e.id, text: 'WAR CRY!', tone: 'bad' });
        for (const ally of this.units) {
          if (ally.side !== 'enemy' || !ally.alive) continue;
          this.addEffect(ally, { kind: 'frenzy', remaining: w.duration, tickEvery: 0, tickTimer: 0, amount: w.frenzy, sourceId: e.id });
        }
        break;
      }
      case 'raiseDead': {
        const r = BOSS_SPECIALS.raiseDead;
        this.events.push({ type: 'notice', id: e.id, text: 'RAISE DEAD!', tone: 'bad' });
        for (let i = 0; i < r.count; i++) {
          const side = i % 2 ? 1 : -1;
          this.addEnemy('skeleton', Math.min(WORLD.width - 20, Math.max(20, e.x + side * (e.radius + 30))), e.y + 20, r.hpFactor, true, r.damageFactor);
        }
        break;
      }
      case 'rainOfFire': {
        const r = BOSS_SPECIALS.rainOfFire;
        this.events.push({ type: 'notice', id: e.id, text: 'RAIN OF FIRE!', tone: 'bad' });
        const x = c.x ?? target?.x ?? e.x;
        const y = c.y ?? target?.y ?? e.y;
        for (const h of this.units) {
          if (h.side !== 'hero' || !h.alive || Math.hypot(h.x - x, h.y - y) > r.radius) continue;
          this.damage(e, h, Math.round(e.damage * r.damageFactor), { aoe: true, big: true });
        }
        break;
      }
    }
    this.endCast(e, false);
  }

  private endCast(e: Unit, interrupted: boolean): void {
    if (!e.casting) return;
    const kind = e.casting.kind;
    if (interrupted && e.isBoss) e.enraged = true;
    e.casting = undefined;
    if (kind === 'smasher') e.castCooldown = BRUTE_SMASH.cooldown;
    else if (kind === 'healer') e.castCooldown = SHAMAN_MEND.cooldown;
    else {
      // A boss's signature move: its own cooldown, and a short breather before the next slam.
      e.specialCooldown = BOSS_SPECIALS[kind].cooldown;
      e.castCooldown = Math.max(e.castCooldown ?? 0, 2);
    }
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
    const valid = active.filter((e) => this.canPolymorph(h, e));
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

  /** Casting something that an interrupt can stop (not an enraged boss's slam). */
  private interruptible(u: Unit): boolean {
    return !!u.casting && !u.casting.unstoppable;
  }

  private interruptRange(id: AbilityId): number {
    return id === 'kick' ? ABILITY_TUNING.kick.range : ABILITY_TUNING.counterspell.range;
  }

  // --- AI teammate movement -------------------------------------------------

  /** The point teammates stay close to: your hero, or the formation's middle. */
  private anchor(): { x: number; y: number } {
    const p = this.player;
    if (p) return { x: p.homeX ?? p.x, y: p.homeY ?? p.y };
    const heroes = this.units.filter((u) => u.side === 'hero');
    const n = heroes.length || 1;
    return { x: heroes.reduce((a, h) => a + (h.homeX ?? h.x), 0) / n, y: heroes.reduce((a, h) => a + (h.homeY ?? h.y), 0) / n };
  }

  /** Where an AI teammate wants to stand right now. */
  private desiredSpot(h: Unit): { x: number; y: number } {
    const center = this.anchor();
    const enemies = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && u.y > 0);
    // In the arena everyone engages; a player-led party (tests) only reacts to enemies close by.
    const close = this.player ? enemies.filter((e) => Math.hypot(e.x - center.x, e.y - center.y) < 320) : enemies;
    // Relaxed formation: lean toward where the enemies are (or are coming from),
    // with a little personal variation and drift so it never looks rigid.
    const watch = enemies.length ? enemies : this.units.filter((u) => u.side === 'enemy' && u.alive);
    const threatX = watch.length ? watch.reduce((a, e) => a + e.x, 0) / watch.length : this.pending[0]?.x ?? center.x;
    const lean = Math.max(-55, Math.min(55, (threatX - center.x) * 0.35)) * (h.isTank ? 1 : 0.7);
    const drift = Math.sin(this.time * 0.35 + h.id) * 8;
    const home = {
      x: (h.homeX ?? h.x) + lean + (h.idleOffX ?? 0) + drift,
      y: (h.homeY ?? h.y) + (h.idleOffY ?? 0) + Math.cos(this.time * 0.27 + h.id * 2) * 5,
    };
    if (!close.length) return home;
    /** A spot just in reach of `e`, on the party's side of it. */
    const besides = (e: Unit, reach: number) => {
      const dx = center.x - e.x;
      const dy = center.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const d = e.radius + h.radius + reach;
      return { x: e.x + (dx / len) * d, y: e.y + (dy / len) * d };
    };

    if (h.isTank) {
      // Step out to meet whatever is going after the party, closest to the party first.
      const threats = enemies.filter((e) => e.targetId !== h.id);
      const pool = threats.length ? threats : enemies;
      const e = pool.reduce((a, b) => (Math.hypot(b.x - center.x, b.y - center.y) < Math.hypot(a.x - center.x, a.y - center.y) ? b : a));
      return besides(e, Math.min(h.range, 10));
    }
    if (h.attackStyle === 'melee') {
      // Join the fight next to the current target, or whatever the tank is fighting.
      const tank = this.units.find((u) => u.side === 'hero' && u.alive && u.isTank);
      // Only move in on enemies already being fought (ours or the tank's) —
      // walking up to a fresh enemy would just draw it onto us.
      const target = (h.targetId !== null && this.unit(h.targetId)?.alive ? this.unit(h.targetId) : undefined) ??
        (tank?.targetId !== null && tank?.targetId !== undefined ? this.unit(tank.targetId) : undefined) ??
        (tank?.alive ? undefined : nearest(h, enemies));
      if (target?.alive && target.side === 'enemy') {
        // Flank: attack from the side so we don't block the path to the tank.
        const side = (h.homeX ?? h.x) < center.x ? -1 : 1;
        const toCenter = Math.atan2(center.y - target.y, center.x - target.x);
        const angle = toCenter + side * 1.2;
        const d = target.radius + h.radius + Math.min(h.range * 0.5, 30);
        return { x: target.x + Math.cos(angle) * d, y: target.y + Math.sin(angle) * d };
      }
      return home;
    }
    // Ranged and healers: back away from anything coming for them...
    const chasers = enemies.filter((e) => e.targetId === h.id && dist(e, h) < 130);
    if (chasers.length) {
      const e = nearest(h, chasers);
      const dx = h.x - e.x;
      const dy = h.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: h.x + (dx / len) * 60, y: h.y + (dy / len) * 60 };
    }
    // ...and step up (within the leash) when nothing is in range.
    if (!enemies.some((e) => this.inReach(h, e))) return besides(nearest(h, enemies), h.range - 20);
    return home;
  }

  private moveHero(h: Unit, dt: number): void {
    const want = this.desiredSpot(h);
    let wx = want.x;
    let wy = want.y;
    // A player-led party (tests) stays close to the player. In the arena,
    // heroes go wherever the fight is.
    if (this.player) {
      const a = this.anchor();
      const fromAnchor = Math.hypot(wx - a.x, wy - a.y);
      if (fromAnchor > HERO_MOVE.leash) {
        wx = a.x + ((wx - a.x) / fromAnchor) * HERO_MOVE.leash;
        wy = a.y + ((wy - a.y) / fromAnchor) * HERO_MOVE.leash;
      }
    }
    wx = Math.min(WORLD.width - h.radius, Math.max(h.radius, wx));
    wy = Math.min(ARENA.bottom - h.radius, Math.max(ARENA.top + h.radius, wy));
    steer(h, wx, wy, HERO_MOVE.speed, 0, dt);
  }

  /** Would hitting `e` for `amount` push a careful hero past the caution line? */
  private wouldPull(h: Unit, e: Unit, amount: number): boolean {
    // Only hold back on enemies the tank is currently holding. Anything loose —
    // hitting me or a friend — is fair game. An enemy that hasn't picked anyone
    // yet (the opening moment of a round) will go for the nearest hero.
    const visible = this.units.filter((u) => u.side === 'hero' && u.alive && !this.hasEffect(u, 'stealth'));
    const target = e.targetId !== null ? this.unit(e.targetId) : visible.length ? nearest(e, visible) : undefined;
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
        this.healSource = 'autoHeal';
        this.healUnit(h, hurt, this.roll(h.heal));
        this.healSource = undefined;
        h.cooldown = h.attackInterval;
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
    if (h.attackStyle === 'ranged') this.shoot(h, target, this.roll(h.damage));
    else this.damage(h, target, this.roll(h.damage));
    if (this.hasTrait(h, 'comboPoints')) h.comboPoints = Math.min(TRAIT_TUNING.maxComboPoints, (h.comboPoints ?? 0) + 1);
    // Poisoned Blades: every auto attack (re)applies a poison.
    if (this.hasTrait(h, 'poisonedBlades') && target.alive) {
      const k = 1 + LEVEL_SCALING * ((h.level ?? 1) - 1);
      this.addEffect(target, {
        kind: 'dot',
        remaining: TRAIT_TUNING.poisonDuration,
        tickEvery: 1,
        tickTimer: 1,
        amount: TRAIT_TUNING.poisonPerSecond * k * (h.might ?? 1),
        sourceId: h.id,
        ability: undefined,
      });
    }
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
    const inRange = this.enemyCandidates(h, hitSize);
    if (!inRange.length) return null;
    const current = inRange.find((u) => u.id === h.targetId);
    if (current) return current;
    if (h.attackStyle === 'melee') return nearest(h, inRange);
    // Ranged heroes deal with the back line first: shooters and casters can't
    // be held by the tank. Otherwise, the most advanced enemy.
    const backLine = inRange.filter((u) => u.attackStyle === 'ranged');
    const pool = backLine.length ? backLine : inRange;
    return pool.reduce((a, b) => (b.y > a.y ? b : a));
  }

  /** Enemies this hero may hit for `hitSize` right now (in reach, not a sheep, won't pull aggro). */
  private enemyCandidates(h: Unit, hitSize: number): Unit[] {
    // An ambush from stealth hits twice as hard — careful AI must account for that.
    if (this.hasEffect(h, 'stealth')) hitSize *= PASSIVE_TUNING.stealth.ambushMultiplier;
    let inRange = this.units.filter((u) => u.side === 'enemy' && u.alive && this.inReach(h, u));
    // Sheep are the lowest priority: only attacked when nothing else is left anywhere.
    const othersAlive = this.units.some((u) => u.side === 'enemy' && u.alive && !this.isSheep(u));
    inRange = inRange.filter((u) => !this.isSheep(u) || !othersAlive);
    if (this.isCareful(h)) inRange = inRange.filter((u) => !this.wouldPull(h, u, hitSize));
    return inRange;
  }

  // --- abilities ----------------------------------------------------------

  /** AI decides whether to use any of a hero's abilities this tick. */
  private aiAbilities(h: Unit): void {
    (h.abilities ?? []).forEach((a, slot) => {
      if (this.abilityState(slot, h) !== 'ok') return;
      if (!this.leavesReserve(h, a.id)) return;
      if (this.aiWants(h, a)) this.cast(h, slot, false);
    });
  }

  /** Would casting this filler ability still leave enough for the hero's big spells? */
  private leavesReserve(h: Unit, id: AbilityId): boolean {
    const big = AI_RESERVE[id];
    if (!big) return true;
    const reserve = Math.max(0, ...big.filter((b) => h.abilities?.some((a) => a.id === b)).map((b) => this.abilityCost(h, b)));
    return (h.resource ?? 0) - this.abilityCost(h, id) >= reserve;
  }

  /** Living heroes. */
  private allies(): Unit[] {
    return this.units.filter((u) => u.side === 'hero' && u.alive);
  }

  /** Allies below this fraction of their health. */
  private hurtAllies(below: number): Unit[] {
    return this.allies().filter((u) => u.hp < u.maxHp * below);
  }

  private aiWants(h: Unit, a: AbilitySlot): boolean {
    const t = ABILITY_TUNING;
    const id = a.id;
    switch (id) {
      case 'taunt':
        return this.looseEnemies(h).length > 0;
      case 'thunderclap':
        return this.enemiesNear(h, t.thunderclap.radius).length > 0;
      case 'whirlwind':
        return this.enemiesNear(h, t.whirlwind.radius).length >= 2 || (this.enemiesNear(h, t.whirlwind.radius).length >= 1 && h.isTank === true);
      case 'shieldBlock':
        if (this.hasEffect(h, 'block')) return false;
        // Block an incoming Smash, or when taking a beating.
        if (this.units.some((e) => e.side === 'enemy' && e.alive && e.casting?.kind === 'smasher' && e.casting.targetId === h.id)) return true;
        return this.attackersOf(h) >= 1 && h.hp < h.maxHp * 0.85;
      case 'lastStand':
        return h.hp < h.maxHp * t.lastStand.below;
      case 'rallyingShout':
        return !this.hasEffect(h, 'empower') && this.engagedEnemies().length >= 2;
      case 'heal':
      case 'radiantLight':
        return this.hurtAllies(0.7).length > 0;
      case 'renew':
        return this.renewCandidates().length > 0;
      case 'fortitude':
        return this.allies().some((u) => !this.hasEffect(u, 'fortitude'));
      case 'powerShield':
        return this.allies().some((u) => !this.hasEffect(u, 'shield') && this.attackersOf(u) > 0);
      case 'guardianSpirit':
        return !!this.guardianCandidate();
      case 'holyNova':
        return this.hurtAllies(0.85).length >= 2 || (this.hurtAllies(0.85).length >= 1 && this.enemiesNear(h, this.novaRadius(a)).length > 0);
      case 'chainOfLight':
        return this.hurtAllies(0.8).length >= 2 || this.hurtAllies(0.6).length >= 1;
      case 'mercy':
        return this.hurtAllies(t.mercy.below).length > 0;
      case 'fireball':
      case 'iceLance':
      case 'arcaneBarrage':
      case 'sinisterStrike':
      case 'eviscerate':
      case 'heroicStrike':
      case 'hexBolt':
        return !!this.pickEnemyTarget(h, this.aiHitSize(h, a));
      case 'soulDrain':
        return !!this.pickEnemyTarget(h, this.aiHitSize(h, a)) && !!this.mostInjuredAlly(0.9);
      case 'polymorph':
        return !!this.polymorphCandidate(h);
      case 'kick':
      case 'counterspell':
        return this.interruptTargets(h, this.interruptRange(id)).some((u) => this.interruptible(u));
      case 'shieldBash':
      case 'gouge':
      case 'hammerOfJustice':
        return !!this.stunTarget(h, a);
      case 'blizzard': {
        const spot = this.blizzardSpot(h, a);
        return spot.count >= 2 || (spot.count >= 1 && !!spot.unit && (spot.unit.isElite === true || this.enemiesAlive() === 1));
      }
      case 'frostNova': {
        const near = this.enemiesNear(h, t.frostNova.radius).filter((e) => !this.hasEffect(e, 'stun'));
        return near.length >= 2 || near.some((e) => e.targetId === h.id || (e.targetId !== null && !this.unit(e.targetId)?.isTank));
      }
      case 'evasion':
        return !this.hasEffect(h, 'evasion') && this.attackersOf(h) >= 1;
      case 'fanOfKnives':
        return this.enemiesNear(h, t.fanOfKnives.radius).length >= 2;
      case 'judgement':
        return !!this.rangedTarget(h, t.judgement.range, this.aiHitSize(h, a));
      case 'exorcism':
        return !!this.rangedTarget(h, t.exorcism.range, this.aiHitSize(h, a));
      case 'hallowedGround':
        return this.enemiesNear(h, t.hallowedGround.radius).length >= (h.isTank ? 1 : 2);
      case 'wither':
        return !!this.witherTarget(h);
      case 'enfeeble':
        return !!this.enfeebleTarget(h);
      case 'doom':
        return !!this.doomTarget(h, a);
      case 'curseOfRuin':
        return !!this.ruinTarget(h);
    }
  }

  /** Expected size of a damaging ability's hit (for careful AI). */
  private aiHitSize(h: Unit, a: AbilitySlot): number {
    const t = ABILITY_TUNING;
    const base: Partial<Record<AbilityId, number>> = {
      fireball: t.fireball.damage,
      iceLance: t.iceLance.damage,
      arcaneBarrage: t.arcaneBarrage.damage,
      sinisterStrike: t.sinisterStrike.damage,
      eviscerate: t.eviscerate.damage,
      heroicStrike: t.heroicStrike.damage,
      hexBolt: t.hexBolt.damage,
      soulDrain: t.soulDrain.damage,
      judgement: t.judgement.damage,
      exorcism: t.exorcism.damage * t.exorcism.holyBonus,
    };
    return (base[a.id] ?? 0) * this.abilityScale(h, a);
  }

  /** Enemies that are in the fight (someone has threat on them, or they have a target). */
  private engagedEnemies(): Unit[] {
    return this.units.filter((u) => u.side === 'enemy' && u.alive && (u.targetId !== null || this.topThreat(u).value > 0));
  }

  private enemiesAlive(): number {
    return this.units.filter((u) => u.side === 'enemy' && u.alive).length;
  }

  /** An enemy within `range` (edge to edge) that careful AI may hit: the current target if possible, else the nearest. */
  private rangedTarget(h: Unit, range: number, hitSize: number): Unit | null {
    let inRange = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && dist(h, u) - h.radius - u.radius <= range);
    if (this.isCareful(h)) inRange = inRange.filter((u) => !this.wouldPull(h, u, hitSize));
    if (!inRange.length) return null;
    return inRange.find((u) => u.id === h.targetId) ?? nearest(h, inRange);
  }

  /** An enemy in reach that isn't already withering from this hero. */
  private witherTarget(h: Unit): Unit | null {
    const total = ABILITY_TUNING.wither.total;
    const fresh = this.enemyCandidates(h, total * 0.5).filter((u) => !u.effects?.some((e) => e.kind === 'dot' && e.ability === 'wither' && e.sourceId === h.id));
    if (!fresh.length) return null;
    return fresh.find((u) => u.id === h.targetId) ?? fresh.reduce((a, b) => (b.maxHp > a.maxHp ? b : a));
  }

  /** The most dangerous enemy in range not already enfeebled: a winding-up smasher, a boss, an elite, then the hardest hitter. */
  private enfeebleTarget(h: Unit): Unit | null {
    const valid = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && !this.hasEffect(u, 'weaken') && this.inReach(h, u));
    if (!valid.length) return null;
    return (
      valid.find((u) => u.casting?.kind === 'smasher') ??
      valid.find((u) => u.isBoss) ??
      valid.find((u) => u.isElite) ??
      // Only worth it on something actually hitting the party.
      valid.filter((u) => u.targetId !== null).sort((a, b) => b.damage / b.attackInterval - a.damage / a.attackInterval)[0] ??
      null
    );
  }

  /** Doom: the toughest enemy in reach that isn't doomed and will still be standing when it lands. */
  private doomTarget(h: Unit, a: AbilitySlot): Unit | null {
    const dmg = ABILITY_TUNING.doom.damage * this.abilityScale(h, a);
    const valid = this.enemyCandidates(h, dmg * 0.5).filter((u) => !this.hasEffect(u, 'doom') && u.hp > dmg * 0.6);
    if (!valid.length) return null;
    return valid.reduce((x, y) => (y.hp > x.hp ? y : x));
  }

  /** Curse of Ruin: what the party is hitting — the tank's target, a boss or an elite — if not already cursed. */
  private ruinTarget(h: Unit): Unit | null {
    const valid = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && !this.hasEffect(u, 'vulnerable') && this.inReach(h, u));
    if (!valid.length) return null;
    const tank = this.allies().find((u) => u.isTank);
    const tankTarget = tank?.targetId !== null && tank?.targetId !== undefined ? valid.find((u) => u.id === tank.targetId) : undefined;
    return valid.find((u) => u.isBoss) ?? valid.find((u) => u.isElite) ?? tankTarget ?? valid.find((u) => u.id === h.targetId) ?? null;
  }

  /** Who a stun (Shield Bash, Gouge, Hammer of Justice) should hit: a caster first, then a boss or elite hitting someone. */
  private stunTarget(h: Unit, a: AbilitySlot): Unit | null {
    const t = ABILITY_TUNING;
    const range = a.id === 'hammerOfJustice' ? t.hammerOfJustice.range : Math.max(h.range, t.shieldBash.range);
    const valid = this.units.filter(
      (u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && !this.hasEffect(u, 'stun') && dist(h, u) - h.radius - u.radius <= range,
    );
    return valid.find((u) => this.interruptible(u)) ?? valid.find((u) => (u.isBoss || u.isElite) && u.targetId !== null && !u.casting) ?? null;
  }

  /** Guardian Spirit: an ally in real danger who isn't already watched over. */
  private guardianCandidate(): Unit | undefined {
    const allies = this.allies().filter((u) => !this.hasEffect(u, 'guardian'));
    const smashed = allies.find((u) => this.units.some((e) => e.side === 'enemy' && e.alive && e.casting?.kind === 'smasher' && e.casting.targetId === u.id && e.isBoss));
    return smashed ?? allies.filter((u) => u.hp < u.maxHp * 0.45 && this.attackersOf(u) > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  private novaRadius(a: AbilitySlot): number {
    return a.mastery ? ABILITY_TUNING.holyNova.masteryRadius : ABILITY_TUNING.holyNova.radius;
  }

  /** Lowest-health ally (by fraction) below `under` of their max health. */
  private mostInjuredAlly(under = 1): Unit | undefined {
    const a = this.lowestAlly();
    return a && a.hp < a.maxHp * under ? a : undefined;
  }

  /** Healing after passives (Blessed Hands: +50% on an ally in trouble). */
  private healAmount(from: Unit, to: Unit, raw: number): number {
    if (this.hasTrait(from, 'blessedHands') && to.hp < to.maxHp * TRAIT_TUNING.blessedHandsBelow) raw *= 1 + TRAIT_TUNING.blessedHandsBonus;
    return raw;
  }

  /** Heal an ally (capped at missing health); emits events and heal threat. Returns the amount. */
  private healUnit(from: Unit, to: Unit, raw: number): number {
    if (!to.alive) return 0;
    const amount = Math.max(0, Math.min(to.maxHp - to.hp, Math.round(this.healAmount(from, to, raw) * (from.side === 'hero' ? this.healingScale : 1))));
    if (amount <= 0) return 0;
    to.hp += amount;
    this.events.push({ type: 'heal', from: from.id, to: to.id, amount });
    this.addHealThreat(from, amount);
    this.record(from, 'healing', this.healSource ?? 'other', amount);
    return amount;
  }

  private attackersOf(u: Unit): number {
    return this.units.filter((e) => e.side === 'enemy' && e.alive && e.targetId === u.id).length;
  }

  /** Best place for a Blizzard: the enemy with the most other enemies around it, in range. */
  private blizzardSpot(h: Unit, a?: AbilitySlot): { x: number; y: number; count: number; unit?: Unit } {
    const r = ABILITY_TUNING.blizzard.radius * (a?.mastery ? ABILITY_TUNING.blizzard.masteryRadius : 1);
    let best: { x: number; y: number; count: number; unit?: Unit } = { x: 0, y: 0, count: 0 };
    for (const e of this.units) {
      if (e.side !== 'enemy' || !e.alive || this.isSheep(e) || !this.inReach(h, e)) continue;
      const count = this.units.filter((o) => o.side === 'enemy' && o.alive && !this.isSheep(o) && dist(o, e) <= r).length;
      if (count > best.count) best = { x: e.x, y: e.y, count, unit: e };
    }
    return best;
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.remaining -= dt;
      z.tickTimer -= dt;
      if (z.tickTimer > 1e-6) continue;
      z.tickTimer += 1;
      const source = this.unit(z.sourceId);
      if (!source) continue;
      for (const e of this.units) {
        if (e.side !== 'enemy' || !e.alive || Math.hypot(e.x - z.x, e.y - z.y) > z.radius) continue;
        const threatScale = z.ability === 'hallowedGround' ? ABILITY_TUNING.hallowedGround.threatBonus : 1;
        this.damage(source, e, Math.round(z.damage), { aoe: true, tick: true, ability: z.ability, threatScale });
        if (z.ability === 'blizzard') this.addEffect(e, { kind: 'slow', remaining: 1.5, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: source.id });
      }
      // Sanctified Ground: allies standing in it are healed.
      if (z.heal && source.alive) {
        this.healSource = z.ability ?? 'other';
        for (const ally of this.allies()) if (Math.hypot(ally.x - z.x, ally.y - z.y) <= z.radius) this.healUnit(source, ally, z.heal);
        this.healSource = undefined;
      }
    }
    this.zones = this.zones.filter((z) => z.remaining > 1e-6);
  }

  /**
   * Allies without Renew who are being attacked or are missing health,
   * most-attacked first, then lowest health.
   */
  private renewCandidates(): Unit[] {
    return this.allies()
      .filter((u) => !this.hasEffect(u, 'hot') && (this.attackersOf(u) > 0 || u.hp < u.maxHp * 0.95))
      .sort((a, b) => this.attackersOf(b) - this.attackersOf(a) || a.hp / a.maxHp - b.hp / b.maxHp);
  }

  private enemiesNear(h: Unit, radius: number): Unit[] {
    return this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && dist(h, u) <= radius);
  }

  private lowestAlly(): Unit | undefined {
    return this.allies().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  /**
   * Who an ability would hit right now, without casting it. With a focus set,
   * the player's abilities only go to that focus (enemy or, for heals, ally).
   */
  private abilityTarget(h: Unit, a: AbilitySlot, byPlayer: boolean): Unit | null {
    const t = ABILITY_TUNING;
    const id = a.id;
    const focus = byPlayer && this.focusId !== null ? this.unit(this.focusId) : undefined;
    const focusEnemy = focus?.side === 'enemy' && focus.alive ? focus : undefined;
    const focusAlly = focus?.side === 'hero' && focus.alive ? focus : undefined;
    const inRangeOf = (range: number, u: Unit) => dist(h, u) - h.radius - u.radius <= range;
    switch (id) {
      case 'taunt': {
        const inRange = this.units.filter((u) => u.side === 'enemy' && u.alive && !this.isSheep(u) && dist(h, u) <= AGGRO.tauntRange);
        if (focusEnemy) return inRange.includes(focusEnemy) ? focusEnemy : null;
        const loose = this.looseEnemies(h);
        return loose.length ? nearest(h, loose) : inRange.length ? nearest(h, inRange) : null;
      }
      // Self-centred or party-wide: the hero is the "target".
      case 'thunderclap':
        return this.enemiesNear(h, t.thunderclap.radius).length ? h : null;
      case 'whirlwind':
        return this.enemiesNear(h, t.whirlwind.radius).length ? h : null;
      case 'fanOfKnives':
        return this.enemiesNear(h, t.fanOfKnives.radius).length ? h : null;
      case 'frostNova':
        return this.enemiesNear(h, t.frostNova.radius).length ? h : null;
      case 'hallowedGround':
        return this.enemiesNear(h, t.hallowedGround.radius).length ? h : null;
      case 'shieldBlock':
      case 'evasion':
      case 'lastStand':
      case 'rallyingShout':
      case 'fortitude':
      case 'holyNova':
      case 'chainOfLight':
        return h;
      case 'arcaneBarrage':
        return this.enemyCandidates(h, 0).length ? h : null;
      // Heals.
      case 'heal':
      case 'radiantLight':
        return focusAlly ?? this.lowestAlly() ?? null;
      case 'renew':
        return focusAlly ?? this.renewCandidates()[0] ?? this.lowestAlly() ?? null;
      case 'mercy':
        return focusAlly ?? this.mostInjuredAlly(t.mercy.below) ?? null;
      case 'powerShield': {
        if (focusAlly) return focusAlly;
        const allies = this.allies().filter((u) => !this.hasEffect(u, 'shield'));
        return allies.sort((x, y) => this.attackersOf(y) - this.attackersOf(x) || x.hp / x.maxHp - y.hp / y.maxHp)[0] ?? this.lowestAlly() ?? null;
      }
      case 'guardianSpirit':
        return focusAlly ?? this.guardianCandidate() ?? (byPlayer ? this.lowestAlly() ?? null : null);
      // Single-target damage.
      case 'fireball':
      case 'sinisterStrike':
      case 'heroicStrike':
      case 'iceLance':
      case 'eviscerate':
      case 'hexBolt':
      case 'soulDrain':
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        return this.pickEnemyTarget(h, byPlayer ? 0 : this.aiHitSize(h, a));
      case 'judgement':
        if (focusEnemy) return inRangeOf(t.judgement.range, focusEnemy) ? focusEnemy : null;
        return this.rangedTarget(h, t.judgement.range, byPlayer ? 0 : this.aiHitSize(h, a));
      case 'exorcism':
        if (focusEnemy) return inRangeOf(t.exorcism.range, focusEnemy) ? focusEnemy : null;
        return this.rangedTarget(h, t.exorcism.range, byPlayer ? 0 : this.aiHitSize(h, a));
      case 'polymorph': {
        if (focusEnemy) return this.canPolymorph(h, focusEnemy) ? focusEnemy : null;
        if (!byPlayer) return this.polymorphCandidate(h) ?? null;
        return this.polymorphCandidate(h) ?? this.units.filter((u) => this.canPolymorph(h, u)).sort((x, y) => y.y - x.y)[0] ?? null;
      }
      case 'kick':
      case 'counterspell': {
        const targets = this.interruptTargets(h, this.interruptRange(id));
        if (focusEnemy) return targets.includes(focusEnemy) ? focusEnemy : null;
        return targets.find((u) => this.interruptible(u)) ?? (targets.length ? nearest(h, targets) : null);
      }
      case 'shieldBash':
      case 'gouge':
      case 'hammerOfJustice': {
        const range = id === 'hammerOfJustice' ? t.hammerOfJustice.range : Math.max(h.range, t.shieldBash.range);
        if (focusEnemy) return inRangeOf(range, focusEnemy) ? focusEnemy : null;
        const best = this.stunTarget(h, a);
        if (best || !byPlayer) return best;
        const near = this.units.filter((u) => u.side === 'enemy' && u.alive && inRangeOf(range, u));
        return near.length ? nearest(h, near) : null;
      }
      case 'blizzard': {
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        return this.blizzardSpot(h, a).unit ?? null;
      }
      case 'wither':
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        return this.witherTarget(h);
      case 'enfeeble':
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        return this.enfeebleTarget(h);
      case 'doom':
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        return this.doomTarget(h, a) ?? (byPlayer ? this.pickEnemyTarget(h, 0) : null);
      case 'curseOfRuin':
        if (focusEnemy) return this.inReach(h, focusEnemy) ? focusEnemy : null;
        return this.ruinTarget(h) ?? (byPlayer ? this.pickEnemyTarget(h, 0) : null);
    }
  }

  /** Stun an enemy (bosses shake it off twice as fast). Breaks a cast unless it's unstoppable. */
  private applyStun(from: Unit, to: Unit, seconds: number): void {
    if (!to.alive) return;
    const duration = seconds * (to.isBoss ? ABILITY_TUNING.bossStunFactor : 1);
    if (this.interruptible(to)) {
      this.endCast(to, true);
      this.events.push({ type: 'notice', id: to.id, text: 'Interrupted!', tone: 'good' });
    }
    this.addEffect(to, { kind: 'stun', remaining: duration, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: from.id });
    to.vx = 0;
    to.vy = 0;
  }

  /** A damage-over-time effect from a hero's ability. */
  private addDot(from: Unit, to: Unit, total: number, duration: number, ability: AbilityId, tick = 1): void {
    if (!to.alive || total <= 0) return;
    this.addEffect(to, { kind: 'dot', remaining: duration, tickEvery: tick, tickTimer: tick, amount: (total * tick) / duration, sourceId: from.id, ability });
  }

  /** The other enemy nearest to `u` (within `radius`), if any. */
  private nextEnemy(u: Unit, radius: number, exclude: Unit[] = []): Unit | undefined {
    const others = this.units.filter((o) => o.side === 'enemy' && o.alive && o !== u && !exclude.includes(o) && !this.isSheep(o) && dist(o, u) <= radius);
    return others.length ? nearest(u, others) : undefined;
  }

  /** Perform the ability in `slot`. Returns false if there was no valid target. */
  /** Add to a hero's damage or healing total for the meter. */
  private record(u: Unit | undefined, kind: 'damage' | 'healing', source: string, amount: number): void {
    if (!u || u.side !== 'hero' || amount <= 0) return;
    let m = this.meter.get(u.id);
    if (!m) this.meter.set(u.id, (m = { damage: {}, healing: {} }));
    m[kind][source] = (m[kind][source] ?? 0) + amount;
  }

  private cast(h: Unit, slot: number, byPlayer: boolean): boolean {
    const before = this.healSource;
    this.healSource = h.abilities![slot].id;
    try {
      return this.castAbility(h, slot, byPlayer);
    } finally {
      this.healSource = before;
    }
  }

  private castAbility(h: Unit, slot: number, byPlayer: boolean): boolean {
    const a = h.abilities![slot];
    const id = a.id;
    const t = ABILITY_TUNING;
    const to = this.abilityTarget(h, a, byPlayer);
    if (!to) return false;
    const k = this.abilityScale(h, a);
    const m = !!a.mastery;
    const ev = (target?: Unit) => this.events.push({ type: 'ability', from: h.id, ability: id, to: target?.id });

    switch (id) {
      // --- Warrior
      case 'taunt':
        this.applyTaunt(h, to);
        break;
      case 'heroicStrike': {
        h.targetId = to.id;
        ev(to);
        this.damage(h, to, this.roll(t.heroicStrike.damage * k), { ability: id, threatScale: t.heroicStrike.threatBonus });
        const other = m ? this.nextEnemy(to, t.heroicStrike.cleaveRadius) : undefined;
        if (other) this.damage(h, other, this.roll(t.heroicStrike.damage * k * t.heroicStrike.cleave), { ability: id, threatScale: t.heroicStrike.threatBonus });
        break;
      }
      case 'thunderclap':
        ev();
        for (const e of this.enemiesNear(h, t.thunderclap.radius)) {
          this.damage(h, e, this.roll(t.thunderclap.damage * k), { threatScale: t.thunderclap.threatBonus, ability: id, aoe: true });
          this.addEffect(e, { kind: 'slow', remaining: t.thunderclap.slow, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id });
          if (m) this.addEffect(e, { kind: 'weaken', remaining: 6, tickEvery: 0, tickTimer: 0, amount: t.thunderclap.aftershock, sourceId: h.id, ability: id });
        }
        break;
      case 'whirlwind':
        ev();
        for (const e of this.enemiesNear(h, t.whirlwind.radius)) {
          this.damage(h, e, this.roll(t.whirlwind.damage * k), { ability: id, aoe: true, threatScale: t.whirlwind.threatBonus });
          if (m) this.damage(h, e, this.roll(t.whirlwind.damage * k * t.whirlwind.secondHit), { ability: id, aoe: true, threatScale: t.whirlwind.threatBonus });
        }
        break;
      case 'shieldBlock':
        this.addEffect(h, {
          kind: 'block',
          remaining: m ? t.shieldBlock.masteryDuration : t.shieldBlock.duration,
          tickEvery: 0,
          tickTimer: 0,
          amount: m ? t.shieldBlock.masteryReduction : t.shieldBlock.reduction,
          sourceId: h.id,
        });
        ev(h);
        break;
      case 'shieldBash':
      case 'gouge':
      case 'hammerOfJustice': {
        ev(to);
        const stun =
          id === 'shieldBash' ? (m ? t.shieldBash.masteryStun : t.shieldBash.stun) : id === 'gouge' ? (m ? t.gouge.masteryStun : t.gouge.stun) : m ? t.hammerOfJustice.masteryStun : t.hammerOfJustice.stun;
        this.applyStun(h, to, stun);
        const dmg = id === 'shieldBash' ? t.shieldBash.damage : id === 'hammerOfJustice' ? t.hammerOfJustice.damage : 0;
        if (dmg) this.damage(h, to, this.roll(dmg * k), { ability: id });
        break;
      }
      case 'lastStand':
        ev(h);
        this.healUnit(h, h, h.maxHp * (m ? t.lastStand.masteryHeal : t.lastStand.heal));
        if (m) this.addEffect(h, { kind: 'block', remaining: t.lastStand.masteryBlockTime, tickEvery: 0, tickTimer: 0, amount: t.lastStand.masteryBlock, sourceId: h.id + 100000 });
        break;
      case 'rallyingShout':
        ev();
        for (const ally of this.allies()) {
          this.addEffect(ally, { kind: 'empower', remaining: t.rallyingShout.duration, tickEvery: 0, tickTimer: 0, amount: t.rallyingShout.bonus, sourceId: h.id });
          if (m) this.healUnit(h, ally, ally.maxHp * t.rallyingShout.masteryHeal);
        }
        break;
      // --- Priest
      case 'heal':
        ev(to);
        this.healUnit(h, to, this.roll(t.heal.amount * k * (m ? t.heal.mastery : 1)));
        break;
      case 'renew': {
        const apply = (u: Unit) => {
          const ticks = t.renew.duration / t.renew.tick;
          u.effects = (u.effects ?? []).filter((e) => !(e.kind === 'hot' && e.ability === 'renew'));
          this.addEffect(u, { kind: 'hot', remaining: t.renew.duration, tickEvery: t.renew.tick, tickTimer: t.renew.tick, amount: (t.renew.total * k) / ticks, sourceId: h.id, ability: id });
          this.events.push({ type: 'ability', from: h.id, ability: id, to: u.id });
        };
        apply(to);
        const second = m ? this.renewCandidates().find((u) => u !== to) : undefined;
        if (second) apply(second);
        break;
      }
      case 'fortitude':
        this.applyFortitude(h, t.fortitude.duration);
        ev();
        break;
      case 'powerShield':
        this.addEffect(to, { kind: 'shield', remaining: t.powerShield.duration, tickEvery: 0, tickTimer: 0, amount: Math.round(t.powerShield.absorb * k), sourceId: h.id, ability: m ? 'powerShield' : undefined });
        ev(to);
        break;
      case 'guardianSpirit':
        this.addEffect(to, { kind: 'guardian', remaining: t.guardianSpirit.duration, tickEvery: 0, tickTimer: 0, amount: m ? t.guardianSpirit.masterySaveAt : t.guardianSpirit.saveAt, sourceId: h.id });
        ev(to);
        break;
      case 'holyNova': {
        const x = m ? t.holyNova.mastery : 1;
        ev();
        for (const ally of this.allies()) this.healUnit(h, ally, this.roll(t.holyNova.heal * k * x));
        for (const e of this.enemiesNear(h, this.novaRadius(a))) this.damage(h, e, this.roll(t.holyNova.damage * k * x), { ability: id, aoe: true });
        break;
      }
      case 'chainOfLight': {
        ev();
        const jumps = m ? t.chainOfLight.masteryJumps : t.chainOfLight.jumps;
        const falloff = m ? t.chainOfLight.masteryFalloff : t.chainOfLight.falloff;
        const order = this.allies().sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
        order.slice(0, jumps + 1).forEach((ally, i) => this.healUnit(h, ally, this.roll(t.chainOfLight.amount * k * Math.pow(falloff, i))));
        break;
      }
      // --- Mage
      case 'fireball': {
        h.targetId = to.id;
        ev(to);
        const burn = t.fireball.burnPerSecond * k * (m ? 2 : 1);
        this.shoot(h, to, this.roll(t.fireball.damage * k), { ability: id, burn, big: true, spread: m });
        break;
      }
      case 'iceLance': {
        h.targetId = to.id;
        ev(to);
        const shatter = m && (this.hasEffect(to, 'slow') || this.hasEffect(to, 'stun')) ? t.iceLance.shatter : 1;
        this.shoot(h, to, this.roll(t.iceLance.damage * k * shatter), { ability: id, big: shatter > 1 });
        if (m) this.addEffect(to, { kind: 'slow', remaining: t.iceLance.chill, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id, ability: id });
        break;
      }
      case 'arcaneBarrage': {
        ev();
        const pool = this.enemyCandidates(h, 0);
        const n = m ? t.arcaneBarrage.masteryMissiles : t.arcaneBarrage.missiles;
        for (let i = 0; i < n && pool.length; i++) {
          const target = pool[Math.floor(this.rng() * pool.length)];
          this.shoot(h, target, this.roll(t.arcaneBarrage.damage * k), { ability: id });
        }
        break;
      }
      case 'blizzard': {
        const b = t.blizzard;
        this.zones.push({
          id: this.nextId++,
          x: to.x,
          y: to.y,
          radius: b.radius * (m ? b.masteryRadius : 1),
          remaining: b.duration,
          tickTimer: 0.5,
          damage: b.damagePerSecond * k * (m ? b.masteryDamage : 1),
          sourceId: h.id,
          ability: id,
        });
        ev(to);
        break;
      }
      case 'frostNova':
        ev();
        for (const e of this.enemiesNear(h, m ? t.frostNova.masteryRadius : t.frostNova.radius)) {
          this.damage(h, e, this.roll(t.frostNova.damage * k), { ability: id, aoe: true });
          this.applyStun(h, e, m ? t.frostNova.masteryFreeze : t.frostNova.freeze);
        }
        break;
      case 'polymorph':
        this.applyPolymorph(h, to);
        break;
      case 'kick':
      case 'counterspell': {
        ev(to);
        if (this.interruptible(to)) {
          this.endCast(to, true);
          const silence = id === 'kick' ? (m ? t.kick.masterySilence : t.kick.silence) : m ? t.counterspell.masterySilence : t.counterspell.silence;
          this.addEffect(to, { kind: 'silence', remaining: silence, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id });
          this.events.push({ type: 'notice', id: to.id, text: id === 'kick' ? 'Interrupted!' : 'Countered!', tone: 'good' });
          if (m && id === 'kick') this.applyStun(h, to, t.kick.masteryStun);
          if (m && id === 'counterspell') this.damage(h, to, this.roll(t.counterspell.masteryDamage * k), { ability: id });
        }
        if (id === 'kick') this.damage(h, to, t.kick.damage);
        break;
      }
      // --- Rogue
      case 'sinisterStrike':
      case 'eviscerate': {
        let size = (id === 'sinisterStrike' ? t.sinisterStrike.damage : t.eviscerate.damage) * k;
        if (this.hasTrait(h, 'comboPoints') && h.comboPoints) {
          size *= 1 + h.comboPoints * TRAIT_TUNING.comboBonusPerPoint;
          h.comboPoints = 0;
        }
        if (id === 'eviscerate' && m && to.hp < to.maxHp * t.eviscerate.executeBelow) size *= 2;
        h.targetId = to.id;
        ev(to);
        this.damage(h, to, this.roll(size), { ability: id, big: id === 'eviscerate' });
        if (id === 'sinisterStrike' && m) this.addDot(h, to, t.sinisterStrike.bleed * k, t.sinisterStrike.bleedDuration, id);
        break;
      }
      case 'evasion':
        this.addEffect(h, { kind: 'evasion', remaining: t.evasion.duration, tickEvery: 0, tickTimer: 0, amount: t.evasion.dodge, sourceId: h.id, ability: m ? 'evasion' : undefined });
        ev(h);
        break;
      case 'fanOfKnives':
        ev();
        for (const e of this.enemiesNear(h, t.fanOfKnives.radius)) {
          this.damage(h, e, this.roll(t.fanOfKnives.damage * k), { ability: id, aoe: true });
          if (m) this.addDot(h, e, t.fanOfKnives.poison * k, t.fanOfKnives.poisonDuration, id);
        }
        break;
      // --- Paladin
      case 'judgement': {
        h.targetId = to.id;
        ev(to);
        const strike = (target: Unit, factor: number) => {
          const before = target.hp;
          this.damage(h, target, this.roll(t.judgement.damage * k * factor), { ability: id });
          const dealt = Math.max(0, before - Math.max(0, target.hp));
          const ally = this.mostInjuredAlly();
          if (ally && dealt > 0) this.healUnit(h, ally, dealt * (this.hasTrait(h, 'zeal') ? 1 : t.judgement.healShare));
        };
        strike(to, 1);
        if (m) {
          const others = this.units.filter((u) => u.side === 'enemy' && u.alive && u !== to && !this.isSheep(u) && dist(h, u) - h.radius - u.radius <= t.judgement.range);
          if (others.length) strike(nearest(h, others), t.judgement.second);
        }
        break;
      }
      case 'radiantLight':
      case 'mercy': {
        ev(to);
        const amount = this.roll((id === 'mercy' ? t.mercy.amount : t.radiantLight.amount) * k);
        this.healUnit(h, to, amount);
        if (id === 'radiantLight' && m && to !== h) this.healUnit(h, h, amount * t.radiantLight.beacon);
        if (id === 'mercy' && m) this.addEffect(to, { kind: 'block', remaining: t.mercy.graceTime, tickEvery: 0, tickTimer: 0, amount: 0.5, sourceId: h.id + 200000 });
        break;
      }
      case 'hallowedGround': {
        const g = t.hallowedGround;
        this.zones.push({
          id: this.nextId++,
          x: h.x,
          y: h.y,
          radius: g.radius,
          remaining: g.duration,
          tickTimer: 0.5,
          damage: g.damagePerSecond * k,
          sourceId: h.id,
          ability: id,
          heal: m ? g.healPerSecond * k : undefined,
        });
        ev();
        break;
      }
      case 'exorcism': {
        h.targetId = to.id;
        ev(to);
        const holy = to.side === 'enemy' && FACTION[to.kind as EnemyKind] !== 'goblin' ? t.exorcism.holyBonus : 1;
        this.damage(h, to, this.roll(t.exorcism.damage * k * holy), { ability: id, big: holy > 1 });
        if (m) this.addDot(h, to, t.exorcism.burn * k, t.exorcism.burnDuration, id);
        break;
      }
      // --- Warlock
      case 'hexBolt':
        h.targetId = to.id;
        ev(to);
        this.shoot(h, to, this.roll(t.hexBolt.damage * k), { ability: id, rot: m ? t.hexBolt.rot * k : undefined });
        break;
      case 'wither': {
        const w = t.wither;
        const bonus = this.hasTrait(h, 'agony') ? 1 + TRAIT_TUNING.agonyBonus : 1;
        this.addDot(h, to, w.total * k * bonus, w.duration, id, w.tick);
        const eff = to.effects?.find((e) => e.kind === 'dot' && e.ability === 'wither' && e.sourceId === h.id);
        if (eff && m) eff.contagion = true;
        ev(to);
        break;
      }
      case 'soulDrain': {
        h.targetId = to.id;
        ev(to);
        const before = to.hp;
        this.damage(h, to, this.roll(t.soulDrain.damage * k), { ability: id });
        const dealt = Math.max(0, before - Math.max(0, to.hp));
        const ally = this.mostInjuredAlly();
        if (ally && dealt > 0) this.healUnit(h, ally, dealt * (m ? t.soulDrain.mastery : 1));
        break;
      }
      case 'enfeeble':
        this.addEffect(to, { kind: 'weaken', remaining: t.enfeeble.duration, tickEvery: 0, tickTimer: 0, amount: m ? t.enfeeble.masteryReduction : t.enfeeble.reduction, sourceId: h.id, ability: id });
        if (m) this.addEffect(to, { kind: 'slow', remaining: t.enfeeble.duration, tickEvery: 0, tickTimer: 0, amount: 0, sourceId: h.id });
        ev(to);
        break;
      case 'doom':
        this.addEffect(to, { kind: 'doom', remaining: t.doom.delay, tickEvery: 0, tickTimer: 0, amount: Math.round(t.doom.damage * k * (m ? t.doom.mastery : 1)), sourceId: h.id, ability: id });
        ev(to);
        break;
      case 'curseOfRuin':
        this.addEffect(to, { kind: 'vulnerable', remaining: t.curseOfRuin.duration, tickEvery: 0, tickTimer: 0, amount: m ? t.curseOfRuin.masteryBonus : t.curseOfRuin.bonus, sourceId: h.id, ability: id });
        ev(to);
        break;
    }

    let cost = this.abilityCost(h, id);
    if (id === 'fireball' && this.hasTrait(h, 'arcaneSurge') && this.rng() < TRAIT_TUNING.arcaneSurgeChance) {
      cost = 0;
      this.events.push({ type: 'notice', id: h.id, text: 'Arcane Surge!', tone: 'info' });
    }
    h.resource = h.resource! - cost;
    a.cooldown = this.abilityCooldown(a);
    return true;
  }


  private addEffect(u: Unit, effect: Effect): void {
    u.effects ??= [];
    // One of each kind per source (and per ability, so a Rogue's bleed and poison stack).
    const same = u.effects.find((e) => e.kind === effect.kind && e.sourceId === effect.sourceId && e.ability === effect.ability);
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
        const source = this.unit(e.sourceId);
        const healed = Math.min(u.maxHp - u.hp, Math.round((source ? this.healAmount(source, u, amount) : amount) * (u.side === 'hero' ? this.healingScale : 1)));
        u.hp += healed;
        if (healed > 0) {
          this.events.push({ type: 'tick', to: u.id, amount: healed, kind: 'hot', from: e.sourceId });
          if (source) this.addHealThreat(source, healed);
          this.record(source, 'healing', e.ability ?? 'other', healed);
        }
      } else {
        const source = this.unit(e.sourceId);
        if (source) this.damage(source, u, amount, { tick: true, ability: e.ability });
      }
      if (!u.alive) break;
    }
    if (!u.alive) return;
    // Doom lands when it runs out.
    for (const e of u.effects) {
      if (e.kind !== 'doom' || e.remaining > 1e-6) continue;
      const source = this.unit(e.sourceId);
      if (source && u.alive) {
        this.events.push({ type: 'notice', id: u.id, text: 'DOOM!', tone: 'good' });
        this.damage(source, u, e.amount, { ability: 'doom', big: true });
      }
    }
    if (!u.alive) return;
    for (const e of u.effects) if (e.remaining <= 1e-6 && e.kind === 'fortitude') this.removeFortitude(u, e);
    u.effects = u.effects.filter((e) => e.remaining > 1e-6);
  }

  private removeFortitude(u: Unit, e: Effect): void {
    u.maxHp -= e.amount;
    u.hp = Math.min(u.hp, u.maxHp);
  }

  private addHealThreat(healer: Unit, amount: number): void {
    // Only enemies already in the fight (someone has threat on them) notice healing.
    const engaged = this.units.filter((u) => u.side === 'enemy' && u.alive && this.topThreat(u).value > 0);
    if (!engaged.length) return;
    const share = (amount * AGGRO.healThreat) / engaged.length;
    for (const e of engaged) {
      e.threat ??= {};
      e.threat[healer.id] = this.threatOf(e, healer.id) + share;
    }
  }

  private damage(from: Unit, to: Unit, amount: number, opts: DamageOpts = {}): void {
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
    // Defensive effects on the target.
    // Party buffs on the attacker (Rallying Shout) and curses on the target (Curse of Ruin).
    if (from.side === 'hero') {
      const empower = Math.max(0, ...(from.effects ?? []).filter((e) => e.kind === 'empower').map((e) => e.amount));
      if (empower) amount = Math.round(amount * (1 + empower));
    }
    const ruin = Math.max(0, ...(to.effects ?? []).filter((e) => e.kind === 'vulnerable').map((e) => e.amount));
    if (ruin) amount = Math.round(amount * (1 + ruin));
    const cursed = to.effects?.find((e) => e.kind === 'cursed');
    if (cursed) amount = Math.round(amount * (1 + cursed.amount));
    if (to.side === 'hero') {
      const evasion = to.effects?.find((e) => e.kind === 'evasion');
      if (evasion && !opts.tick && this.rng() < evasion.amount) {
        this.events.push({ type: 'notice', id: to.id, text: 'Dodge', tone: 'info' });
        // Riposte: answer every dodge.
        if (evasion.ability === 'evasion' && from.alive && from.side === 'enemy') {
          const k = 1 + LEVEL_SCALING * ((to.level ?? 1) - 1);
          this.damage(to, from, Math.round(ABILITY_TUNING.evasion.riposte * k * (to.might ?? 1)), { ability: 'evasion' });
        }
        return;
      }
      // Several blocks (Shield Block, Last Stand, Grace) don't stack: the strongest counts.
      const block = Math.max(0, ...(to.effects ?? []).filter((e) => e.kind === 'block').map((e) => e.amount));
      if (block) amount = Math.round(amount * (1 - block));
      const shield = to.effects?.find((e) => e.kind === 'shield');
      if (shield) {
        const absorbed = Math.min(shield.amount, amount);
        shield.amount -= absorbed;
        amount -= absorbed;
        this.record(this.unit(shield.sourceId), 'healing', `${shield.ability ?? 'shield'}:absorb`, absorbed);
        if (shield.amount <= 0) shield.remaining = 0;
        // Reflective Shield: the attacker takes half of what was absorbed.
        if (shield.ability === 'powerShield' && absorbed > 0 && from.alive && from.side === 'enemy') {
          const caster = this.unit(shield.sourceId);
          if (caster) this.damage(caster, from, Math.round(absorbed * ABILITY_TUNING.powerShield.reflect), { ability: 'powerShield', tick: true });
        }
        if (absorbed > 0 && amount === 0) {
          this.events.push({ type: 'notice', id: to.id, text: 'Absorbed', tone: 'info' });
          return;
        }
      }
    }
    // Armor (tanks' plate) stops part of every hit.
    if (to.armor) amount = Math.round(amount * (1 - to.armor));
    // Enfeeble: a weakened attacker hits softer.
    const weak = from.effects?.find((e) => e.kind === 'weaken');
    if (weak) amount = Math.round(amount * (1 - weak.amount));
    // Aegis Aura: while a Paladin with it stands, the party takes less damage.
    if (to.side === 'hero' && this.units.some((u) => u.side === 'hero' && u.alive && u.passive === 'aegisAura')) {
      amount = Math.round(amount * (1 - PASSIVE_TUNING.aegisAura.reduction));
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
    if (this.time > SUDDEN_DEATH.after) amount = Math.round(amount * this.damageRamp);
    // Guardian Spirit: a killing blow leaves the hero standing instead.
    const guardian = to.side === 'hero' && amount >= to.hp ? to.effects?.find((e) => e.kind === 'guardian') : undefined;
    if (guardian) {
      to.effects = to.effects!.filter((e) => e !== guardian);
      to.hp = Math.round(to.maxHp * guardian.amount);
      amount = 0;
      this.events.push({ type: 'notice', id: to.id, text: 'Saved!', tone: 'good' });
    }
    this.record(from, 'damage', opts.tick && opts.ability ? `${opts.ability}:dot` : opts.tick ? 'dot' : (opts.ability ?? 'auto'), Math.min(amount, Math.max(0, to.hp)));
    to.hp -= amount;
    if (from.side === 'hero' && to.side === 'enemy') {
      to.threat ??= {};
      to.threat[from.id] = this.threatOf(to, from.id) + amount * (from.threatMultiplier ?? 1) * (opts.threatScale ?? 1);
    }
    if (from.resourceKind === 'rage') from.resource = Math.min(from.maxResource!, from.resource! + amount * RAGE.perDealt);
    if (to.resourceKind === 'rage') to.resource = Math.min(to.maxResource!, to.resource! + amount * RAGE.perTaken);
    if (opts.tick) this.events.push({ type: 'tick', to: to.id, amount, kind: 'dot', from: from.id, ability: opts.ability });
    else this.events.push({ type: 'attack', from: from.id, to: to.id, style: from.attackStyle, amount, ability: opts.ability, big: opts.big });
    if (to.hp <= 0 && to.alive) {
      to.hp = 0;
      to.alive = false;
      for (const e of to.effects ?? []) if (e.kind === 'fortitude') this.removeFortitude(to, e);
      // Contagion: a withering enemy passes the curse on as it dies.
      const contagion = to.effects?.find((e) => e.kind === 'dot' && e.ability === 'wither' && e.contagion);
      to.effects = [];
      if (this.focusId === to.id) this.focusId = null;
      this.events.push({ type: 'death', id: to.id });
      if (to.side === 'enemy') {
        this.kills.push({ kind: to.kind as EnemyKind, summoned: !!to.summoned });
        this.soulHarvest();
        const caster = contagion ? this.unit(contagion.sourceId) : undefined;
        const next = contagion ? this.nextEnemy(to, 400) : undefined;
        if (caster && next) {
          const w = ABILITY_TUNING.wither;
          this.addEffect(next, { ...contagion!, remaining: w.duration, tickTimer: w.tick });
          this.events.push({ type: 'notice', id: next.id, text: 'Contagion', tone: 'good' });
        }
      }
    }
  }

  /** Warlock passive: every enemy death restores mana and heals the most injured ally. */
  private soulHarvest(): void {
    const p = PASSIVE_TUNING.soulHarvest;
    for (const w of this.units) {
      if (w.side !== 'hero' || !w.alive || w.passive !== 'soulHarvest') continue;
      w.resource = Math.min(w.maxResource!, (w.resource ?? 0) + p.mana);
      const ally = this.mostInjuredAlly();
      this.healSource = 'soulHarvest';
      if (ally) this.healUnit(w, ally, p.heal * (1 + LEVEL_SCALING * ((w.level ?? 1) - 1)) * (w.might ?? 1));
      this.healSource = undefined;
    }
  }

  /**
   * Keep units from overlapping. Heroes physically block enemies (the enemy
   * is pushed aside); teammates don't overlap each other; your hero never moves.
   */
  private separate(): void {
    const enemies = this.units.filter((u) => u.side === 'enemy' && u.alive);
    const heroes = this.units.filter((u) => u.side === 'hero' && u.alive);
    for (let i = 0; i < heroes.length; i++) {
      for (let j = i + 1; j < heroes.length; j++) {
        const [a, b] = [heroes[i], heroes[j]];
        if (a.id === this.playerId) push(b, a, 1, 0.5);
        else if (b.id === this.playerId) push(a, b, 1, 0.5);
        else push(a, b, 0.5, 0.5);
      }
    }
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      for (let j = i + 1; j < enemies.length; j++) push(a, enemies[j], 0.5, 0.5);
      // Heroes physically block enemies: the enemy is pushed aside.
      for (const h of heroes) push(a, h, 1, 0.7);
      a.x = Math.min(WORLD.width - a.radius, Math.max(a.radius, a.x));
      a.y = Math.min(ARENA.bottom - a.radius, a.y);
    }
    // Pushes must not shove heroes off the arena either.
    for (const h of heroes) {
      h.x = Math.min(WORLD.width - h.radius, Math.max(h.radius, h.x));
      h.y = Math.min(ARENA.bottom - h.radius, Math.max(ARENA.top + h.radius, h.y));
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

/**
 * Ease a unit toward (tx, ty) at up to maxSpeed, slowing as it arrives and
 * stopping `stopDist` short. Velocity changes gradually so motion is smooth.
 */
function steer(u: Unit, tx: number, ty: number, maxSpeed: number, stopDist: number, dt: number): void {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const len = Math.hypot(dx, dy);
  const remaining = len - stopDist;
  let wantVx = 0;
  let wantVy = 0;
  if (remaining > 1) {
    const speed = maxSpeed * Math.min(1, remaining / 28);
    wantVx = (dx / len) * speed;
    wantVy = (dy / len) * speed;
  }
  const k = Math.min(1, dt * 8);
  u.vx = (u.vx ?? 0) + (wantVx - (u.vx ?? 0)) * k;
  u.vy = (u.vy ?? 0) + (wantVy - (u.vy ?? 0)) * k;
  // Never overshoot the stopping point.
  const step = Math.hypot(u.vx, u.vy) * dt;
  if (step > Math.max(0, remaining)) {
    const f = Math.max(0, remaining) / (step || 1);
    u.x += u.vx * dt * f;
    u.y += u.vy * dt * f;
  } else {
    u.x += u.vx * dt;
    u.y += u.vy * dt;
  }
}

/** Push `a` (and `b` by the remaining share) apart if they overlap; `k` softens the push. */
function push(a: Unit, b: Unit, aShare: number, k = 1): void {
  const min = a.radius + b.radius + 2;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d >= min) return;
  const nx = d === 0 ? 1 : dx / d;
  const ny = d === 0 ? 0 : dy / d;
  const overlap = (min - d) * k;
  a.x += nx * overlap * aShare;
  a.y += ny * overlap * aShare;
  if (aShare < 1) {
    b.x -= nx * overlap * (1 - aShare);
    b.y -= ny * overlap * (1 - aShare);
  }
}
