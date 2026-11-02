import Phaser from 'phaser';
import { Battle, STEP } from '../sim/battle';
import { ARENA, ENEMY_LAYOUT, HERO_LINES, DEFAULT_TEAM, makeRound, ROUND_1, SUDDEN_DEATH, WORLD } from '../sim/content';
import { sound } from './sound';
import { needsRecruit, recruit, type RunState } from '../sim/run';
import { type Unit } from '../sim/types';
import { ensurePixelTextures, HERO_SPRITES, partyLayout, type SceneState, DPR, FONT, HUD } from './theme';
import { Hud } from './hud';
import { Inspect } from './inspect';
import { UnitLayer } from './units';
import { TeamScreens } from './screens/team';
import { ReadyScreen } from './screens/ready';
import { Results } from './screens/results';

/** The game screen: owns the battle and run state, and wires the modules together. */
export class BattleScene extends Phaser.Scene {
  // Each part of the screen lives in its own module; they share this scene's state.
  hud!: Hud;
  inspect!: Inspect;
  units!: UnitLayer;
  teamScreens!: TeamScreens;
  ready!: ReadyScreen;
  results!: Results;

  battle!: Battle;
  acc = 0;
  state: SceneState = 'choosing';

  // Settings that persist across "Play again".
  speed = 1;
  careful = true;
  auto = false;

  /** The current run (null while choosing a hero). */
  run: RunState | null = null;
  /** What the AI teammates picked after the last wave (shown briefly). */
  teamPicks = '';
  /** Round intro banner time left; the fight starts when it ends. */
  introLeft = 0;
  /** Set when the wave ends: short slow-motion before the end screen. */
  endingLeft = -1;
  suddenDeathShown = false;

  // Scenery / HUD
  party = partyLayout(3);
  overlay?: Phaser.GameObjects.Container;

  constructor() {
    super('battle');
  }

  preload(): void {
    for (const [cls, url] of Object.entries(HERO_SPRITES)) this.load.image(`hero-${cls}`, url);
  }

  create(data?: { run?: RunState; teamPicks?: string }): void {
    this.hud = new Hud(this);
    this.inspect = new Inspect(this);
    this.units = new UnitLayer(this);
    this.teamScreens = new TeamScreens(this);
    this.ready = new ReadyScreen(this);
    this.results = new Results(this);
    // (Fresh modules each restart, so their own state starts clean.)
    this.acc = 0;
    this.overlay = undefined;
    this.pauseBanner = undefined;
    this.run = data?.run ?? null;
    this.teamPicks = data?.teamPicks ?? '';
    this.suddenDeathShown = false;
    const run = this.run;
    this.battle = run
      ? new Battle({
          // Retries (fewer lives) get a different seed, so a rematch isn't an exact replay.
          seed: run.seed * 100 + run.wave + run.lives * 7,
          wave: makeRound(run.wave),
          carefulAI: this.careful,
          team: run.team,
          builds: run.builds,
        })
      : new Battle({ seed: Date.now() % 1_000_000, wave: ROUND_1, carefulAI: this.careful, team: DEFAULT_TEAM });
    this.party = partyLayout(Math.max(3, this.battle.heroes.length));

    ensurePixelTextures(this);
    this.drawField();
    this.units.zoneLayer = this.add.graphics().setDepth(5);
    this.hud.drawTopBar();
    this.hud.drawHud();
    this.units.focusMarker = this.add.graphics().setDepth(25);
    this.units.handleEvents(this.battle.drainEvents());
    this.units.syncViews();

    this.input.on('pointerdown', this.onFieldTap, this);
    this.input.on('pointerdown', () => sound.unlock());
    this.endingLeft = -1;
    this.tweens.timeScale = 1;
    if (!run) {
      this.state = 'choosing';
      this.teamScreens.showTeamBuilder();
    } else if (needsRecruit(run)) {
      this.state = 'recruit';
      this.teamScreens.showRecruit();
    } else {
      if (this.teamPicks) this.showBanner(this.teamPicks);
      this.ready.show();
    }
  }

  update(time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    if (this.state === 'playing' && this.battle.outcome === 'running') {
      if (this.introLeft > 0) {
        this.introLeft -= dt;
      } else if (this.units.hitStop > 0) {
        this.units.hitStop -= dt;
      } else {
        // Fixed-step simulation; cap catch-up so a background tab doesn't explode.
        this.acc = Math.min(this.acc + dt * this.speed, 0.5);
        while (this.acc >= STEP && this.battle.outcome === 'running') {
          for (const u of this.battle.units) this.units.prevPos.set(u.id, { x: u.x, y: u.y });
          this.battle.step(STEP);
          this.acc -= STEP;
        }
      }
      this.units.handleEvents(this.battle.drainEvents());
    }
    this.units.syncViews();
    this.hud.updateHud();
    this.inspect.inspectRefresh -= deltaMs;
    if (this.inspect.inspectRefresh <= 0) {
      this.inspect.inspectRefresh = 200;
      this.inspect.refreshInspect();
    }
    this.units.drawFocus(time);
    this.units.drawZones(time);
    if (this.state === 'playing' && !this.suddenDeathShown && this.battle.time > SUDDEN_DEATH.after) {
      this.suddenDeathShown = true;
      this.showBanner('Sudden death! Every hit lands harder from now on.', true);
      sound.play('wave');
    }
    if (this.battle.outcome !== 'running' && this.state === 'playing') {
      // A beat of slow motion on the last kill (or the gate falling), then the end screen.
      if (this.endingLeft < 0) {
        this.units.handleEvents(this.battle.drainEvents());
        this.endingLeft = 1.1;
        this.tweens.timeScale = 0.35;
        if (this.battle.outcome === 'victory') this.cameras.main.flash(250, 255, 240, 200);
      }
      this.endingLeft -= dt;
      if (this.endingLeft <= 0) {
        this.tweens.timeScale = 1;
        this.results.showEnd();
      }
    }
  }

  /** Auto: rewards are chosen for your heroes, and each fight starts on its own. */
  setAuto(on: boolean): void {
    this.auto = on;
    if (on && this.state === 'ready') this.ready.scheduleAutoFight();
  }

  /** "Round 3 — The Shaman": a short banner as the fight begins. */
  showWaveIntro(): void {
    const w = this.battle.wave;
    this.introLeft = 1.4;
    sound.play('wave');
    const cx = WORLD.width / 2;
    const title = this.text(cx, 430, w.boss ? 'BOSS FIGHT' : 'FIGHT!', 44, w.boss ? '#ff6b6b' : '#ffd166').setOrigin(0.5).setFontStyle('bold').setDepth(80);
    const sub = this.text(cx, 482, `Round ${w.number} — ${w.name ?? ''}`, 20, '#ffffff').setOrigin(0.5).setDepth(80);
    for (const t of [title, sub]) {
      t.setStroke('#000000', 5);
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 200 });
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 20, delay: 1100, duration: 400, onComplete: () => t.destroy() });
    }
  }

  startFight(): void {
    if (this.state !== 'ready') return;
    sound.unlock();
    sound.play('click');
    this.ready.hide();
    this.inspect.closeInspect();
    this.battle.setFocus(null);
    this.state = 'playing';
    this.showWaveIntro();
  }

  /** A message across the top of the field for a few seconds. */
  showBanner(msg: string, alert = false): void {
    const t = this.text(WORLD.width / 2, alert ? 140 : 104, msg, alert ? 20 : 13, alert ? '#ff9f1a' : '#c9d1e0')
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setDepth(55)
      .setWordWrapWidth(500)
      .setFontStyle(alert ? 'bold' : 'normal');
    t.setStroke('#000000', 3);
    this.tweens.add({ targets: t, alpha: 0, delay: 5000, duration: 800, onComplete: () => t.destroy() });
  }

  // --- input ------------------------------------------------------------------

  /**
   * Tap any unit to inspect it (works while paused too). Tapping empty ground
   * closes the inspect window. It doesn't change what the AI does.
   */
  onFieldTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length || pointer.y > WORLD.hudTop) return;
    if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'ready') return;
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of this.battle.units) {
      if (!u.alive) continue;
      const v = this.units.views.get(u.id)?.container;
      const d = Math.hypot((v?.x ?? u.x) - pointer.x, (v?.y ?? u.y) - pointer.y);
      if (d <= u.radius + 24 && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    if (!best || best.id === this.inspect.inspectId) {
      this.inspect.closeInspect();
      this.battle.setFocus(null);
      return;
    }
    this.battle.setFocus(best.id);
    this.inspect.openInspect(best.id);
  }

  /** Pause stops the fight, but everything stays interactive (inspect, tooltips, panels). */
  togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.tweens.pauseAll();
      this.pauseBanner = this.text(WORLD.width / 2, 112, 'PAUSED — tap units or panels to inspect', 14, '#ffffff')
        .setOrigin(0.5)
        .setPadding(12, 6, 12, 6)
        .setBackgroundColor('#2e86de')
        .setDepth(96);
    } else if (this.state === 'paused') {
      this.pauseBanner?.destroy();
      this.pauseBanner = undefined;
      this.tweens.resumeAll();
      this.state = 'playing';
    }
  }

  pauseBanner?: Phaser.GameObjects.Text;

  // --- static scenery -----------------------------------------------------

  drawField(): void {
    const g = this.add.graphics();
    // A grassy field: a treeline along the top, mown stripes, tufts and a few flowers.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle(0x1d3a24).fillRect(0, 0, WORLD.width, WORLD.hudTop);
    // Treeline: overlapping round canopies in two shades.
    for (let x = -10; x < WORLD.width + 20; x += 26) {
      g.fillStyle(0x234a2b).fillCircle(x + rand() * 10, ARENA.top - 30 + rand() * 10, 26 + rand() * 8);
      g.fillStyle(0x2d5c34).fillCircle(x + 12 + rand() * 8, ARENA.top - 14 + rand() * 8, 18 + rand() * 6);
    }
    // The pitch, with a darker edge.
    g.fillStyle(0x3f7a3a).fillRoundedRect(6, ARENA.top, WORLD.width - 12, ARENA.bottom - ARENA.top + 14, 18);
    const top = ARENA.top + 6;
    const bottom = ARENA.bottom + 8;
    for (let y = top, k = 0; y < bottom; y += 38, k++) {
      g.fillStyle(k % 2 ? 0x4f8f45 : 0x5a9a4c).fillRect(12, y, WORLD.width - 24, Math.min(38, bottom - y));
    }
    // Grass tufts.
    for (let n = 0; n < 140; n++) {
      const x = 20 + rand() * (WORLD.width - 40);
      const y = top + 6 + rand() * (bottom - top - 12);
      g.lineStyle(1, rand() < 0.5 ? 0x3a7134 : 0x6db05c, 0.9);
      g.lineBetween(x, y, x - 2, y - 5);
      g.lineBetween(x + 2, y, x + 2, y - 6);
      g.lineBetween(x + 4, y, x + 6, y - 5);
    }
    // A few flowers.
    for (let n = 0; n < 26; n++) {
      const x = 22 + rand() * (WORLD.width - 44);
      const y = top + 10 + rand() * (bottom - top - 20);
      g.fillStyle(rand() < 0.5 ? 0xf6f1d8 : 0xffd166).fillCircle(x, y, 2);
      g.fillStyle(0xe8a93a).fillCircle(x, y, 0.8);
    }
    // Chalk lines across the middle.
    const midY = (ENEMY_LAYOUT.rowY[0] + HERO_LINES.front) / 2;
    g.lineStyle(2, 0xf2f4e8, 0.35).lineBetween(24, midY, WORLD.width - 24, midY);
    g.lineStyle(2, 0xf2f4e8, 0.35).strokeCircle(WORLD.width / 2, midY, 40);
  }

  // --- helpers ------------------------------------------------------------

  button(x: number, y: number, label: string, size: number, bg: string, onTap: () => void): Phaser.GameObjects.Text {
    return this.text(x, y, label, size, '#ffffff')
      .setOrigin(0.5)
      .setPadding(24, 12, 24, 12)
      .setBackgroundColor(bg)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onTap);
  }

  text(x: number, y: number, str: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color }).setResolution(DPR);
  }
}
