import Phaser from 'phaser';
import { Battle, STEP, type AbilityResult } from '../sim/battle';
import { ABILITIES, ABILITY_TUNING, CHOICE_AFTER_WAVES, DEFAULT_TEAM, HERO_KIT, makeWave, MAX_ABILITY_SLOTS, PASSIVES, RESOURCES, RUN_WAVES, TRAITS, WAVE_1, WORLD } from '../sim/content';
import { sound } from './sound';
import {
  autoChoose,
  clearRun,
  completeWave,
  describeReward,
  isAbilityMilestone,
  isChoiceWave,
  loadRun,
  nextAbilityMilestone,
  newRun,
  rewardOptions,
  saveRun,
  type Reward,
  type RunState,
} from '../sim/run';
import type { AbilityId, BattleEvent, Effect, HeroClass, ResourceKind, Unit } from '../sim/types';
import { GATE_ID } from '../sim/types';

const COLORS: Record<string, number> = {
  warrior: 0xc0392b,
  rogue: 0xf1c40f,
  mage: 0x3498db,
  priest: 0xecf0f1,
  grunt: 0x6b8e23,
  archer: 0x8fbc4f,
  runner: 0xb5d33d,
  shaman: 0x8e6bbf,
};

const LETTERS: Record<string, string> = {
  warrior: 'W',
  rogue: 'R',
  mage: 'M',
  priest: 'P',
  grunt: 'G',
  archer: 'A',
  runner: '»',
  shaman: 'S',
};

const DARK_LETTER = ['priest', 'rogue', 'archer', 'runner'];

const PROJECTILE_COLORS: Record<string, number> = {
  mage: 0xff8c1a,
  priest: 0xfff2a8,
  archer: 0xa0522d,
};

const RESOURCE_COLORS: Record<ResourceKind, number> = {
  rage: 0xc0392b,
  mana: 0x2e86de,
  energy: 0xf1c40f,
};

const GOLD = 0xffd166;
const OUT_OF_RANGE = 0xff3b3b;
const ENEMY_STROKE = 0x8b1a1a;
const SLOW_STROKE = 0x5dade2;

/** How each buff/debuff is shown in the HUD and its tooltip. */
const EFFECT_INFO: Record<Effect['kind'], { name: string; letter: string; color: number; debuff: boolean; text: (e: Effect) => string }> = {
  fortitude: { name: 'Power Word: Fortitude', letter: 'F', color: 0xfff3b0, debuff: false, text: (e) => `Maximum health increased by ${e.amount}.` },
  hot: { name: 'Renew', letter: 'R', color: 0x7dff9b, debuff: false, text: (e) => `Heals ${Math.round(e.amount)} health every ${e.tickEvery}s.` },
  dot: { name: 'Burning', letter: 'B', color: 0xff8c1a, debuff: true, text: (e) => `Takes ${Math.round(e.amount)} damage every second.` },
  slow: { name: 'Slowed', letter: 'S', color: 0x5dade2, debuff: true, text: () => 'Attacks 30% slower.' },
  sheep: { name: 'Polymorphed', letter: '~', color: 0xf4f1e8, debuff: true, text: () => 'Turned into a sheep. Breaks when hit directly.' },
  silence: { name: 'Silenced', letter: 'X', color: 0xb57bff, debuff: true, text: () => 'Cannot cast spells.' },
  stealth: { name: 'Stealth', letter: 'H', color: 0x9aa5b8, debuff: false, text: () => 'Hidden: enemies cannot target you. Your next hit deals double damage.' },
  block: { name: 'Shield Block', letter: 'B', color: 0xd4a24c, debuff: false, text: (e) => `Taking ${Math.round(e.amount * 100)}% less damage.` },
  shield: { name: 'Power Shield', letter: 'P', color: 0xfff7d6, debuff: false, text: (e) => `Absorbs the next ${Math.round(e.amount)} damage.` },
  evasion: { name: 'Evasion', letter: 'E', color: 0xf1c40f, debuff: false, text: (e) => `Dodging ${Math.round(e.amount * 100)}% of attacks.` },
};
const MAX_BUFF_ICONS = 12;
const BUFF_ICON = 22;
const TARGET_BAR_X = 200;
/** Party panel layout (bottom of the screen). */
const PARTY = { x: 6, frameW: 128, gap: 4, frameH: 104, box: 22 };
const HUD_TARGET_Y = 122;

interface PartyFrame {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  hpText: Phaser.GameObjects.Text;
  boxes: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[];
  buffs: Phaser.GameObjects.Text;
}

/** "Heroic Strike" -> "HS", "Fireball" -> "Fi". */
function initials(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2);
}

interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Graphics;
  name?: Phaser.GameObjects.Text;
  letter: Phaser.GameObjects.Text;
  /** White overlay for hit flashes. */
  flash: Phaser.GameObjects.Arc;
  /** Cast bar label (enemies that cast). */
  castLabel?: Phaser.GameObjects.Text;
  /** Aggro warning badge (shown on the player's hero only). */
  aggroIcon?: { container: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc };
  dead: boolean;
}

type SceneState = 'choosing' | 'playing' | 'paused' | 'reward' | 'over';

const DPR = Math.min(window.devicePixelRatio || 1, 3);
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** Size and position of the ability button and AUTO button. */
/** HUD layout (offsets from WORLD.hudTop). */
const HUD = {
  // Big ability buttons first, right under the gate, using the full width.
  slotY: 8,
  slotSize: 88,
  slotGap: 8,
  slotX: 34,
  barX: 16,
  barW: 290,
  healthY: 102,
  resourceY: 121,
  barH: 16,
  buffX: 318,
  targetY: 142,
};

interface SlotView {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  plus: Phaser.GameObjects.Text;
  cdText: Phaser.GameObjects.Text;
}

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views = new Map<number, UnitView>();
  private acc = 0;
  private state: SceneState = 'choosing';

  // Settings that persist across "Play again".
  private speed = 1;
  private careful = true;
  private auto = false;

  /** The current run (null while choosing a hero). */
  private run: RunState | null = null;
  /** What the AI teammates picked after the last wave (shown briefly). */
  private teamPicks = '';
  private autoButton!: Phaser.GameObjects.Text;
  private zoneLayer!: Phaser.GameObjects.Graphics;
  /** Bumped whenever the reward screen changes, to cancel stale timers. */
  private rewardToken = 0;
  private soundButton!: Phaser.GameObjects.Text;
  /** Positions before the latest simulation step, for smooth (interpolated) drawing. */
  private prevPos = new Map<number, { x: number; y: number }>();
  /** Brief freeze on heavy hits (seconds of real time). */
  private hitStop = 0;
  /** Wave intro banner time left; the fight starts when it ends. */
  private introLeft = 0;
  /** Set when the wave ends: short slow-motion before the end screen. */
  private endingLeft = -1;
  /** Merged floating damage numbers, per target. */
  private numbers = new Map<number, { text: Phaser.GameObjects.Text; total: number; at: number }>();
  private lastReinforcementCall = -99;

  // Scenery / HUD
  private gateWall!: Phaser.GameObjects.Rectangle;
  private gateBar!: Phaser.GameObjects.Graphics;
  private gateLabel!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private speedButton!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Text;
  private partyFrames: PartyFrame[] = [];
  private partyBars!: Phaser.GameObjects.Graphics;
  private partyCooldowns!: Phaser.GameObjects.Graphics;
  private focusText!: Phaser.GameObjects.Text;
  private tooltip?: Phaser.GameObjects.Container;
  /** Target frame: focused unit's name, health bar and numbers. */
  private targetName!: Phaser.GameObjects.Text;
  private targetBar!: Phaser.GameObjects.Graphics;
  private targetHp!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private focusMarker!: Phaser.GameObjects.Graphics;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super('battle');
  }

  create(data?: { run?: RunState; teamPicks?: string }): void {
    this.views.clear();
    this.acc = 0;
    this.overlay = undefined;
    this.tooltip = undefined;
    this.run = data?.run ?? null;
    this.teamPicks = data?.teamPicks ?? '';
    const run = this.run;
    this.battle = run
      ? new Battle({ seed: run.seed * 100 + run.wave, wave: makeWave(run.wave), carefulAI: this.careful, team: run.team, builds: run.builds })
      : new Battle({ seed: Date.now() % 1_000_000, wave: WAVE_1, carefulAI: this.careful, team: DEFAULT_TEAM });

    this.drawField();
    this.zoneLayer = this.add.graphics().setDepth(5);
    this.drawTopBar();
    this.drawHud();
    this.focusMarker = this.add.graphics().setDepth(25);
    this.handleEvents(this.battle.drainEvents());
    this.syncViews();

    this.input.on('pointerdown', this.onFieldTap, this);
    this.input.on('pointerdown', () => sound.unlock());
    this.prevPos.clear();
    this.numbers.clear();
    this.hitStop = 0;
    this.endingLeft = -1;
    this.lastReinforcementCall = -99;
    this.tweens.timeScale = 1;
    if (run) {
      this.state = 'playing';
      if (this.teamPicks) this.showBanner(this.teamPicks);
      this.showWaveIntro();
    } else {
      this.state = 'choosing';
      this.showTeamBuilder();
    }
  }

  update(time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    if (this.state === 'playing' && this.battle.outcome === 'running') {
      if (this.introLeft > 0) {
        this.introLeft -= dt;
      } else if (this.hitStop > 0) {
        this.hitStop -= dt;
      } else {
        // Fixed-step simulation; cap catch-up so a background tab doesn't explode.
        this.acc = Math.min(this.acc + dt * this.speed, 0.5);
        while (this.acc >= STEP && this.battle.outcome === 'running') {
          for (const u of this.battle.units) this.prevPos.set(u.id, { x: u.x, y: u.y });
          this.battle.step(STEP);
          this.acc -= STEP;
        }
      }
      this.handleEvents(this.battle.drainEvents());
    }
    this.syncViews();
    this.updateHud();
    this.drawFocus(time);
    this.drawZones(time);
    if (this.battle.outcome !== 'running' && this.state === 'playing') {
      // A beat of slow motion on the last kill (or the gate falling), then the end screen.
      if (this.endingLeft < 0) {
        this.handleEvents(this.battle.drainEvents());
        this.endingLeft = 1.1;
        this.tweens.timeScale = 0.35;
        if (this.battle.outcome === 'victory') this.cameras.main.flash(250, 255, 240, 200);
      }
      this.endingLeft -= dt;
      if (this.endingLeft <= 0) {
        this.tweens.timeScale = 1;
        this.showEnd();
      }
    }
  }

  /** Auto picks: rewards are chosen for your heroes automatically. */
  private setAuto(on: boolean): void {
    this.auto = on;
  }

  /** "Wave 3 — Shamans": a short banner before the fight begins. */
  private showWaveIntro(): void {
    const w = this.battle.wave;
    this.introLeft = 1.4;
    sound.play('wave');
    const cx = WORLD.width / 2;
    const title = this.text(cx, 330, `Wave ${w.number}`, 44, '#ffd166').setOrigin(0.5).setFontStyle('bold').setDepth(80);
    const sub = this.text(cx, 382, w.name ?? '', 20, '#ffffff').setOrigin(0.5).setDepth(80);
    for (const t of [title, sub]) {
      t.setStroke('#000000', 5);
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 200 });
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 20, delay: 1100, duration: 400, onComplete: () => t.destroy() });
    }
  }

  // --- hero select ----------------------------------------------------------

  /** Pick a team of four: tap classes to fill the slots, tap a slot to empty it. */
  private showTeamBuilder(team: HeroClass[] = []): void {
    this.overlay?.destroy();
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.8).setOrigin(0, 0).setInteractive(),
      this.text(cx, 128, 'Build your team', 32, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 164, 'Pick four heroes. They fight on their own — you choose the team and their rewards.', 13, '#c9d1e0')
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(480),
    ];
    const saved = loadRun();
    if (saved && saved.wave <= RUN_WAVES) {
      const names = saved.team.map((c) => LETTERS[c]).join(' ');
      items.push(this.button(cx, 68, `▶ Continue run: ${names} — wave ${saved.wave}`, 16, '#1e6f50', () => this.scene.restart({ run: saved })));
    }

    // The four team slots.
    const slotW = 108;
    const slotY = 232;
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * (slotW + 8);
      const cls = team[i];
      const bg = this.add
        .rectangle(x, slotY, slotW, 70, cls ? 0x2b3a55 : 0x151b27)
        .setStrokeStyle(2, cls ? COLORS[cls] : 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (!cls) return;
          sound.play('click');
          this.showTeamBuilder(team.filter((_, j) => j !== i));
        });
      items.push(bg);
      if (cls) {
        items.push(
          this.add.circle(x, slotY - 10, 16, COLORS[cls]).setStrokeStyle(2, 0x111111),
          this.text(x, slotY - 10, LETTERS[cls], 15, DARK_LETTER.includes(cls) ? '#222' : '#fff').setOrigin(0.5).setFontStyle('bold'),
          this.text(x, slotY + 18, cls[0].toUpperCase() + cls.slice(1), 12, '#ffffff').setOrigin(0.5),
        );
      } else {
        items.push(this.text(x, slotY, `Slot ${i + 1}`, 13, '#5d6880').setOrigin(0.5));
      }
    }
    items.push(this.text(cx, slotY + 48, 'Tap a filled slot to remove it. Classes can repeat.', 11, '#8f9bb3').setOrigin(0.5));

    // Class cards: tap to add.
    const classes: HeroClass[] = ['warrior', 'priest', 'mage', 'rogue'];
    const cardH = 92;
    classes.forEach((cls, i) => {
      const y = 342 + i * (cardH + 8);
      const kit = HERO_KIT[cls];
      const bg = this.add
        .rectangle(cx, y, 470, cardH, 0x1c2433)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x26314a))
        .on('pointerout', () => bg.setFillStyle(0x1c2433))
        .on('pointerdown', () => {
          if (team.length >= 4) return;
          sound.play('click');
          this.showTeamBuilder([...team, cls]);
        });
      const left = cx - 225;
      items.push(
        bg,
        this.add.circle(left + 30, y, 22, COLORS[cls]).setStrokeStyle(2, 0x111111),
        this.text(left + 30, y, LETTERS[cls], 20, DARK_LETTER.includes(cls) ? '#222' : '#fff').setOrigin(0.5).setFontStyle('bold'),
        this.text(left + 64, y - 34, cls[0].toUpperCase() + cls.slice(1), 18, '#ffffff').setFontStyle('bold'),
        this.text(left + 170, y - 31, kit.role, 12, '#c9d1e0'),
        this.text(left + 64, y - 8, `Starts with: ${ABILITIES[kit.starting].name}`, 12, '#ffd166'),
        this.text(left + 64, y + 12, `Passive: ${PASSIVES[kit.passive].name} — ${PASSIVES[kit.passive].short}`, 11, '#9ad1ff'),
      );
    });

    // Classic team shortcut and Start.
    items.push(
      this.text(cx, 732, 'Tip: a classic team is 1 tank, 1 healer and 2 damage.', 12, '#8f9bb3').setOrigin(0.5),
      this.button(cx - 120, 790, 'Classic team', 16, '#2b3445', () => {
        sound.play('click');
        this.showTeamBuilder([...DEFAULT_TEAM]);
      }),
    );
    const ready = team.length === 4;
    const start = this.button(cx + 110, 790, ready ? 'Start run ▶' : `Pick ${4 - team.length} more`, 18, ready ? '#2e86de' : '#2b3445', () => {
      if (!ready) return;
      sound.unlock();
      sound.play('click');
      const run = newRun(team);
      saveRun(run);
      this.scene.restart({ run });
    });
    items.push(start);
    this.overlay = this.add.container(0, 0, items).setDepth(100);
  }

  /** A message across the top of the field for a few seconds. */
  private showBanner(msg: string, alert = false): void {
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

  /** Tap any unit to inspect it (name and health along the bottom). It doesn't change what the AI does. */
  private onFieldTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.state !== 'playing' || over.length) return;
    if (pointer.y > WORLD.gateY) return;
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const u of this.battle.units) {
      if (!u.alive) continue;
      const v = this.views.get(u.id)?.container;
      const d = Math.hypot((v?.x ?? u.x) - pointer.x, (v?.y ?? u.y) - pointer.y);
      if (d <= u.radius + 24 && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    this.battle.setFocus(!best || best.id === this.battle.focusId ? null : best.id);
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.tweens.pauseAll();
      const cx = WORLD.width / 2;
      const resume = this.button(cx, 470, 'Resume', 22, '#2e86de', () => this.togglePause());
      this.overlay = this.add
        .container(0, 0, [
          this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.6).setOrigin(0, 0).setInteractive(),
          this.text(cx, 400, 'Paused', 40, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
          resume,
        ])
        .setDepth(100);
    } else if (this.state === 'paused') {
      this.overlay?.destroy();
      this.overlay = undefined;
      this.tweens.resumeAll();
      this.state = 'playing';
    }
  }

  // --- static scenery -----------------------------------------------------

  private drawField(): void {
    const g = this.add.graphics();
    // Grass field with a darker spawn zone at the top.
    g.fillStyle(0x1d2b1f).fillRect(0, 0, WORLD.width, WORLD.gateY);
    g.fillStyle(0x16211a).fillRect(0, 0, WORLD.width, 90);
    g.lineStyle(1, 0x2a3d2c, 1);
    for (let y = 120; y < WORLD.gateY; y += 80) g.lineBetween(0, y, WORLD.width, y);

    // Castle wall with the gate in the middle.
    g.fillStyle(0x4a4038).fillRect(0, WORLD.gateY, WORLD.width, WORLD.gateHeight);
    g.fillStyle(0x5c5047);
    for (let x = 0; x < WORLD.width; x += 30) g.fillRect(x + 4, WORLD.gateY - 8, 18, 8);
    this.gateWall = this.add.rectangle(WORLD.width / 2, WORLD.gateY + WORLD.gateHeight / 2, 110, WORLD.gateHeight + 6, 0x7a5230);
    this.gateWall.setStrokeStyle(2, 0x3b2716);
    this.gateBar = this.add.graphics().setDepth(2);
    this.gateLabel = this.text(WORLD.width / 2, WORLD.gateY + WORLD.gateHeight / 2 - 2, 'GATE', 12, '#f5e6c8').setOrigin(0.5).setDepth(3).setFontStyle('bold');
  }

  /** Small testing/utility buttons along the top edge. */
  private drawTopBar(): void {
    const small = (x: number, y: number, onTap: () => void) =>
      this.text(x, y, '', 13, '#ffffff')
        .setPadding(10, 6, 10, 6)
        .setBackgroundColor('#2b3445')
        .setDepth(50)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', onTap);

    // Row 1: testing aids on the left; AUTO and Pause on the right.
    this.speedButton = small(8, 8, () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    });
    this.soundButton = small(98, 8, () => {
      sound.unlock();
      sound.toggleMute();
    });
    this.pauseButton = small(WORLD.width - 8, 8, () => this.togglePause()).setOrigin(1, 0);
    this.autoButton = small(WORLD.width - 104, 8, () => this.setAuto(!this.auto)).setOrigin(1, 0);

  }

  private drawHud(): void {
    const top = WORLD.hudTop;
    this.add.rectangle(0, top, WORLD.width, WORLD.height - top, 0x0b0e14).setOrigin(0, 0);
    this.add.rectangle(0, top, WORLD.width, 2, 0x2b3445).setOrigin(0, 0);

    // Big wave number at the top center, with enemies left and time underneath.
    this.waveText = this.text(WORLD.width / 2, 44, '', 30, '#ffd166').setOrigin(0.5, 0).setDepth(50).setFontStyle('bold');
    this.waveText.setStroke('#000000', 5);
    this.hudText = this.text(WORLD.width / 2, 80, '', 13, '#c9d1e0').setOrigin(0.5, 0).setDepth(50);
    this.hudText.setStroke('#000000', 3);

    // Party panel: one frame per hero.
    this.partyFrames = [];
    this.partyBars = this.add.graphics().setDepth(1);
    this.partyCooldowns = this.add.graphics().setDepth(4);
    const w = PARTY.frameW;
    for (let i = 0; i < 4; i++) {
      const x = PARTY.x + i * (w + PARTY.gap);
      const y = top + 6;
      const bg = this.add
        .rectangle(x, y, w, PARTY.frameH, 0x111723)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x2b3445)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.showHeroTooltip(i));
      const name = this.text(x + 6, y + 4, '', 12, '#ffffff').setFontStyle('bold');
      const hpText = this.text(x + 6, y + 22, '', 10, '#ffffff').setFontStyle('bold').setDepth(2);
      hpText.setStroke('#000000', 3);
      const boxes: PartyFrame['boxes'] = [];
      for (let j = 0; j < MAX_ABILITY_SLOTS; j++) {
        const bx = x + 5 + j * (PARTY.box + 2) + PARTY.box / 2;
        const by = y + 58 + PARTY.box / 2;
        const box = this.add
          .rectangle(bx, by, PARTY.box, PARTY.box, 0x151b27)
          .setStrokeStyle(1, 0x2b3445)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', (pointer: Phaser.Input.Pointer) => {
            if (!pointer.wasTouch) this.showAbilityTooltip(i, j);
          })
          .on('pointerout', (pointer: Phaser.Input.Pointer) => {
            if (!pointer.wasTouch) this.hideTooltip();
          })
          .on('pointerdown', () => this.showAbilityTooltip(i, j));
        const label = this.text(bx, by, '', 9, '#ffffff').setOrigin(0.5).setFontStyle('bold').setDepth(5);
        boxes.push({ bg: box, label });
      }
      const buffs = this.text(x + 6, y + 86, '', 10, '#c9d1e0');
      this.partyFrames.push({ bg, name, hpText, boxes, buffs });
    }

    // Bottom row: inspected unit, or a hint.
    const ty = top + HUD_TARGET_Y;
    this.focusText = this.text(16, ty + 1, '', 12, '#8f9bb3');
    this.targetName = this.text(16, ty, '', 13, '#ffffff').setFontStyle('bold');
    this.targetBar = this.add.graphics();
    this.targetHp = this.text(TARGET_BAR_X + 8, ty + 2, '', 11, '#ffffff').setFontStyle('bold');
    this.targetHp.setStroke('#000000', 3);
    this.toast = this.text(WORLD.width / 2, WORLD.hudTop - 30, '', 16, '#ff9f1a').setOrigin(0.5).setFontStyle('bold').setDepth(60);
    this.toast.setStroke('#000000', 4);
  }

  private updateHud(): void {
    // Gate health, drawn on the gate itself.
    const { hp, maxHp } = this.battle.gate;
    const gw = 96;
    const gx = WORLD.width / 2 - gw / 2;
    const gy = WORLD.gateY + WORLD.gateHeight - 9;
    this.gateBar.clear();
    this.gateBar.fillStyle(0x000000, 0.6).fillRect(gx, gy, gw, 6);
    this.gateBar.fillStyle(hp / maxHp > 0.3 ? 0xd4a24c : 0xe74c3c).fillRect(gx, gy, (gw * hp) / maxHp, 6);
    this.gateLabel.setText(`GATE ${Math.ceil(hp)}`);

    const t = Math.floor(this.battle.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.waveText.setText(`WAVE ${this.battle.wave.number}`);
    this.hudText.setText(`of ${RUN_WAVES} · ${this.battle.enemiesRemaining} enemies left · ${clock}`);

    this.speedButton.setText(`Speed ${this.speed}x`);
    this.soundButton.setText(`Sound: ${sound.muted ? 'OFF' : 'ON'}`);
    this.pauseButton.setText(this.state === 'paused' ? '▶ Resume' : '❚❚ Pause');
    this.autoButton.setText(`Auto picks: ${this.auto ? 'ON' : 'OFF'}`).setBackgroundColor(this.auto ? '#1e6f50' : '#2b3445');

    this.updatePartyHud();
  }

  private heroInSlot(slot: number): Unit | undefined {
    return this.battle.heroes.find((h) => h.slot === slot);
  }

  /** Each hero's health, resource, abilities (with cooldowns) and buffs. */
  private updatePartyHud(): void {
    const g = this.partyBars;
    g.clear();
    this.partyCooldowns.clear();
    const w = PARTY.frameW;
    this.partyFrames.forEach((f, i) => {
      const h = this.heroInSlot(i);
      const x = PARTY.x + i * (w + PARTY.gap);
      const y = WORLD.hudTop + 6;
      if (!h) {
        f.bg.setVisible(false);
        f.name.setText('');
        f.hpText.setText('');
        f.buffs.setText('');
        for (const b of f.boxes) b.bg.setVisible(false), b.label.setText('');
        return;
      }
      f.bg.setVisible(true).setStrokeStyle(h.id === this.battle.focusId ? 2 : 1, h.id === this.battle.focusId ? 0x7dff9b : 0x2b3445);
      f.name.setText(`${h.label}  Lv ${h.level ?? 1}`).setColor(h.alive ? '#' + COLORS[h.kind].toString(16).padStart(6, '0') : '#666');
      // Health and resource.
      const bw = w - 10;
      g.fillStyle(0x2b3445).fillRect(x + 5, y + 21, bw, 14);
      g.fillStyle(h.alive ? 0xc0392b : 0x444444).fillRect(x + 5, y + 21, bw * Math.max(0, h.hp / h.maxHp), 14);
      f.hpText.setText(h.alive ? `${Math.ceil(h.hp)} / ${h.maxHp}` : 'Down');
      if (h.resourceKind) {
        g.fillStyle(0x2b3445).fillRect(x + 5, y + 39, bw, 8);
        g.fillStyle(RESOURCE_COLORS[h.resourceKind]).fillRect(x + 5, y + 39, bw * ((h.resource ?? 0) / (h.maxResource ?? 1)), 8);
      }
      // Ability boxes (traits in purple), with cooldown shading.
      f.boxes.forEach((b, j) => {
        const a = h.abilities?.[j];
        const trait = !a ? h.traits?.[j - (h.abilities?.length ?? 0)] : undefined;
        b.bg.setVisible(true);
        if (a) {
          const def = ABILITIES[a.id];
          b.bg.setFillStyle(COLORS[h.kind]).setStrokeStyle(1, 0x111111);
          b.label.setText(initials(def.name)).setColor(DARK_LETTER.includes(h.kind) ? '#111' : '#fff');
          if (a.cooldown > 0) {
            const bx = b.bg.x - PARTY.box / 2;
            const by = b.bg.y - PARTY.box / 2;
            this.partyCooldowns.fillStyle(0x000000, 0.6).fillRect(bx, by, PARTY.box, PARTY.box * Math.min(1, a.cooldown / this.battle.abilityCooldown(a)));
          }
        } else if (trait) {
          b.bg.setFillStyle(0x24203a).setStrokeStyle(1, 0xb57bff);
          b.label.setText(initials(TRAITS[trait].name)).setColor('#e0c3ff');
        } else {
          b.bg.setFillStyle(0x151b27).setStrokeStyle(1, 0x2b3445);
          b.label.setText('');
        }
      });
      // Active buffs/debuffs as short names.
      const effects = (h.effects ?? []).filter((e) => e.remaining > 0 && e.kind !== 'fortitude').map((e) => EFFECT_INFO[e.kind].name);
      f.buffs.setText(effects.slice(0, 2).join(', '));
    });

    // Bottom row: the inspected unit, or a hint.
    const focus = this.battle.focusId !== null ? this.battle.unit(this.battle.focusId) : undefined;
    const ty = WORLD.hudTop + HUD_TARGET_Y;
    if (focus?.alive) {
      this.focusText.setText('');
      this.drawTargetFrame(focus, TARGET_BAR_X, ty, WORLD.width - 16 - TARGET_BAR_X);
    } else {
      this.clearTargetFrame();
      this.focusText.setText('Tap a hero or goblin to inspect it. Tap a hero panel for its abilities.');
    }
  }

  /** Tooltip for one ability box in a hero's panel. */
  private showAbilityTooltip(slot: number, j: number): void {
    const h = this.heroInSlot(slot);
    if (!h) return;
    const a = h.abilities?.[j];
    const trait = !a ? h.traits?.[j - (h.abilities?.length ?? 0)] : undefined;
    if (a) {
      const def = ABILITIES[a.id];
      const cost = this.battle.abilityCost(h, a.id);
      const costText = cost ? `${cost} ${RESOURCES[h.resourceKind!].label.toLowerCase()}` : 'No cost';
      const ups = [a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(' · ');
      const cd = this.battle.abilityCooldown(a);
      this.showTooltip(`${h.label}: ${def.name}`, def.description, `${costText} · ${cd % 1 ? cd.toFixed(1) : cd}s cooldown${ups ? ` · ${ups}` : ''}`, COLORS[h.kind], true);
    } else if (trait) {
      this.showTooltip(`${h.label}: ${TRAITS[trait].name}`, TRAITS[trait].description, 'Passive — always on', 0xb57bff, true);
    } else {
      this.showTooltip('Empty slot', 'Earn new abilities from rewards every 5 waves.', '', 0x3a4660, true);
    }
  }

  /** Tap a hero's panel: its passive and abilities. */
  private showHeroTooltip(slot: number): void {
    const h = this.heroInSlot(slot);
    if (!h) return;
    const names = [...(h.abilities ?? []).map((a) => ABILITIES[a.id].name + (a.power ? ` +${a.power}` : '')), ...(h.traits ?? []).map((t) => TRAITS[t].name)];
    const passive = h.passive ? PASSIVES[h.passive] : undefined;
    this.showTooltip(
      `${h.label} — level ${h.level ?? 1}`,
      `Abilities: ${names.join(', ')}`,
      passive ? `Passive: ${passive.name} — ${passive.short}` : '',
      COLORS[h.kind],
      true,
    );
  }

  /** A small box just above the HUD. */
  private showTooltip(titleText: string, bodyText: string, metaText: string, color: number, autoHide: boolean, bad = false): void {
    this.tooltip?.destroy();
    const w = 380;
    const x = 16;
    const y = WORLD.hudTop - 96;
    const title = this.text(x + 12, y + 10, titleText, 15, bad ? '#ff8a8a' : '#ffd166').setFontStyle('bold');
    const body = this.text(x + 12, y + 32, bodyText, 13, '#ffffff').setWordWrapWidth(w - 24);
    const meta = this.text(x + 12, y + 62, metaText, 12, '#8f9bb3').setWordWrapWidth(w - 24);
    const box = this.add.rectangle(x, y, w, 86, 0x111723, 0.95).setOrigin(0, 0).setStrokeStyle(2, color);
    this.tooltip = this.add.container(0, 0, [box, title, body, meta]).setDepth(90);
    const tip = this.tooltip;
    if (autoHide) {
      this.time.delayedCall(3000, () => {
        if (this.tooltip === tip) this.hideTooltip();
      });
    }
  }

  private hideTooltip(): void {
    this.tooltip?.destroy();
    this.tooltip = undefined;
  }

  /** Name + health bar of the focused unit, like an MMO target frame. */
  private drawTargetFrame(u: Unit, x: number, y: number, w: number): void {
    const enemy = u.side === 'enemy';
    this.targetName.setText(`${enemy ? '◎' : '✚'} ${u.label}`).setColor(enemy ? '#ffd166' : '#7dff9b');
    const pct = Math.max(0, u.hp / u.maxHp);
    this.targetBar.clear();
    this.targetBar.fillStyle(0x2b3445).fillRect(x, y, w, 17);
    this.targetBar.fillStyle(enemy ? 0xe74c3c : 0x2ecc71).fillRect(x, y, w * pct, 17);
    this.targetBar.lineStyle(1, enemy ? 0xffd166 : 0x7dff9b, 0.8).strokeRect(x, y, w, 17);
    this.targetHp.setText(`${Math.ceil(u.hp)} / ${u.maxHp}`);
  }

  private clearTargetFrame(): void {
    this.targetName.setText('');
    this.targetBar.clear();
    this.targetHp.setText('');
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 400 });
  }

  // --- units --------------------------------------------------------------

  private createView(u: Unit): void {
    const body = this.add.circle(0, 0, u.radius, COLORS[u.kind] ?? 0xffffff);
    body.setStrokeStyle(u.side === 'enemy' ? 3 : 2, u.side === 'enemy' ? ENEMY_STROKE : 0x111111);
    const letter = this.text(0, 0, LETTERS[u.kind] ?? '?', u.radius, DARK_LETTER.includes(u.kind) ? '#222' : '#fff')
      .setOrigin(0.5)
      .setFontStyle('bold');
    const hpBar = this.add.graphics();
    const flash = this.add.circle(0, 0, u.radius, 0xffffff).setAlpha(0);
    const container = this.add.container(u.x, u.y, [body, flash, letter, hpBar]);
    container.setDepth(u.side === 'hero' ? 10 : 20);
    let name: Phaser.GameObjects.Text | undefined;
    if (u.side === 'hero') {
      name = this.text(0, u.radius + 4, u.label, 12, '#c9d1e0').setOrigin(0.5, 0);
      container.add(name);
    }
    if (u.side === 'enemy') {
      container.setAlpha(0);
      this.tweens.add({ targets: container, alpha: 1, duration: 300 });
    }
    let aggroIcon: UnitView['aggroIcon'];
    if (u.side === 'hero' && !u.isTank) {
      const disc = this.add.circle(0, 0, 10, 0xf39c12).setStrokeStyle(2, 0x000000);
      const mark = this.text(0, 0, '!', 15, '#000').setOrigin(0.5).setFontStyle('bold');
      const iconContainer = this.add.container(u.radius + 12, -u.radius - 6, [disc, mark]).setVisible(false);
      container.add(iconContainer);
      aggroIcon = { container: iconContainer, disc };
    }
    let castLabel: Phaser.GameObjects.Text | undefined;
    if (u.kind === 'shaman') {
      castLabel = this.text(0, -u.radius - 34, '', 11, '#e0c3ff').setOrigin(0.5).setFontStyle('bold');
      castLabel.setStroke('#000000', 3);
      container.add(castLabel);
    }
    this.views.set(u.id, { container, body, hpBar, name, letter, flash, aggroIcon, castLabel, dead: false });
  }

  private syncViews(): void {
    for (const u of this.battle.units) {
      const v = this.views.get(u.id);
      if (!v || v.dead) continue;
      // Draw between the last two simulation steps so motion is smooth at any frame rate.
      const prev = this.prevPos.get(u.id);
      const a = Math.min(1, this.acc / STEP);
      if (prev && this.battle.outcome === 'running') v.container.setPosition(prev.x + (u.x - prev.x) * a, prev.y + (u.y - prev.y) * a);
      else v.container.setPosition(u.x, u.y);
      const w = u.radius * 2 + 6;
      const y = -u.radius - 10;
      v.hpBar.clear();
      v.hpBar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, 7);
      const pct = u.hp / u.maxHp;
      const color = u.side === 'enemy' ? 0xe74c3c : pct > 0.5 ? 0x2ecc71 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
      v.hpBar.fillStyle(color).fillRect(-w / 2, y, w * pct, 5);

      // Small effect pips next to the health bar: green = heal over time, orange = burning.
      let pip = 0;
      if (this.battle.hasEffect(u, 'hot')) v.hpBar.fillStyle(0x7dff9b).fillCircle(-w / 2 - 7 - pip++ * 9, y + 2, 3.5);
      if (this.battle.hasEffect(u, 'dot')) v.hpBar.fillStyle(0xff8c1a).fillCircle(-w / 2 - 7 - pip++ * 9, y + 2, 3.5);
      if (this.battle.hasEffect(u, 'fortitude')) v.hpBar.fillStyle(0xfff3b0).fillCircle(-w / 2 - 7 - pip++ * 9, y + 2, 3.5);
      if (u.side === 'hero') v.container.setAlpha(this.battle.hasEffect(u, 'stealth') ? 0.45 : 1);
      if (u.side === 'enemy') {
        const sheep = this.battle.isSheep(u);
        v.body.setFillStyle(sheep ? 0xf4f1e8 : COLORS[u.kind]);
        v.body.setStrokeStyle(3, sheep ? 0xbdb7a6 : this.battle.hasEffect(u, 'slow') ? SLOW_STROKE : ENEMY_STROKE);
        v.letter.setText(sheep ? 'baa' : LETTERS[u.kind]).setFontSize(sheep ? 11 : u.radius);
        if (sheep) v.letter.setColor('#555');
        else v.letter.setColor(DARK_LETTER.includes(u.kind) ? '#222' : '#fff');
      }
      // Cast bar above casting enemies.
      if (u.casting) {
        const cy = y - 9;
        const pct = 1 - u.casting.remaining / u.casting.total;
        v.hpBar.fillStyle(0x000000, 0.8).fillRect(-w / 2 - 1, cy - 1, w + 2, 7);
        v.hpBar.fillStyle(0xb57bff).fillRect(-w / 2, cy, w * pct, 5);
        v.castLabel?.setText(u.casting.spell).setY(cy - 10);
      } else {
        v.castLabel?.setText('');
      }

      if (v.aggroIcon) {
        const level = this.battle.aggroLevel(u.id);
        v.aggroIcon.container.setVisible(level !== 'none');
        v.aggroIcon.disc.setFillStyle(level === 'aggro' ? 0xe74c3c : 0xf39c12);
      }
    }
  }

  /** Ground effects such as Blizzard. */
  private drawZones(time: number): void {
    this.zoneLayer.clear();
    for (const z of this.battle.zones) {
      const pulse = 0.18 + Math.sin(time / 200) * 0.04;
      this.zoneLayer.fillStyle(0x9ad1ff, pulse).fillCircle(z.x, z.y, z.radius);
      this.zoneLayer.lineStyle(2, 0xd6ecff, 0.7).strokeCircle(z.x, z.y, z.radius);
    }
  }

  private drawFocus(time: number): void {
    this.focusMarker.clear();
    const unit = this.battle.focusId !== null ? this.battle.unit(this.battle.focusId) : undefined;
    if (!unit?.alive) return;
    const drawn = this.views.get(unit.id)?.container;
    const f = { ...unit, x: drawn?.x ?? unit.x, y: drawn?.y ?? unit.y };
    const color = f.side === 'enemy' ? GOLD : 0x7dff9b;
    const r = f.radius + 9 + Math.sin(time / 150) * 2;
    this.focusMarker.lineStyle(3, color, 0.95).strokeCircle(f.x, f.y, r);
    if (f.side === 'enemy') {
      // Crosshair ticks.
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        this.focusMarker.lineBetween(f.x + dx * (r - 4), f.y + dy * (r - 4), f.x + dx * (r + 7), f.y + dy * (r + 7));
      }
    }
  }

  // --- events -------------------------------------------------------------

  private handleEvents(events: BattleEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          const u = this.battle.unit(e.id);
          if (u) this.createView(u);
          if (u?.side === 'enemy' && this.battle.time > 5 && this.battle.time - this.lastReinforcementCall > 4) {
            this.lastReinforcementCall = this.battle.time;
            this.showBanner(u.y > 0 ? 'Flankers incoming!' : 'Reinforcements!', true);
            sound.play('wave');
          }
          break;
        }
        case 'shoot':
          this.showProjectile(e.from, e.to, e.duration, e.ability);
          break;
        case 'attack':
          this.showAttack(e.from, e.to, e.style, e.amount, e.ability, e.big);
          break;
        case 'heal':
          this.showHeal(e.from, e.to, e.amount);
          sound.play('heal');
          break;
        case 'castStart': {
          sound.play('cast');
          const u = this.battle.unit(e.from);
          if (u && e.spell === 'Smash') {
            const ring = this.add.circle(u.x, u.y, u.radius + 6).setStrokeStyle(4, 0xff4d4d).setDepth(30);
            this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: e.duration * 1000, onComplete: () => ring.destroy() });
          }
          break;
        }
        case 'ability':
          this.showAbility(e.from, e.ability, e.to);
          break;
        case 'tick': {
          if (e.kind === 'hot') {
            const u = this.battle.unit(e.to);
            if (u) this.floatText(u.x, u.y - 14, `+${e.amount}`, '#7dff9b', 11, 0.75);
          } else {
            this.addNumber(e.to, e.amount, '#ff9f1a', 11, 0.8);
          }
          break;
        }
        case 'taunt':
          this.showTaunt(e.from, e.to);
          break;
        case 'castEnd':
          if (e.interrupted) {
            const u = this.battle.unit(e.from);
            if (u) this.views.get(u.id)?.castLabel?.setText('');
            sound.play('interrupt');
          }
          break;
        case 'notice': {
          const u = this.battle.unit(e.id);
          const color = e.tone === 'good' ? '#7dff9b' : e.tone === 'bad' ? '#ff6b6b' : '#9ad1ff';
          if (u) this.floatText(u.x, u.y - u.radius - 30, e.text, color, e.text === 'SMASH!' ? 22 : 16);
          if (e.text === 'SMASH!') {
            sound.play('smash');
            this.cameras.main.shake(220, 0.01);
          }
          break;
        }
        case 'death':
          this.showDeath(e.id);
          break;
      }
    }
  }

  /** A projectile flying to its target; the hit itself arrives as an 'attack' event. */
  private showProjectile(fromId: number, toId: number, duration: number, ability?: AbilityId): void {
    const from = this.views.get(fromId)?.container;
    const to = this.views.get(toId)?.container;
    const shooter = this.battle.unit(fromId);
    if (!from || !to || !shooter) return;
    const big = ability === 'fireball';
    const color = big ? 0xff5a1f : ability === 'iceLance' ? 0x9ad1ff : (PROJECTILE_COLORS[shooter.kind] ?? 0xffffff);
    const bolt = this.add.circle(from.x, from.y, big ? 11 : shooter.kind === 'mage' ? 6 : 4, color).setDepth(30);
    if (big) bolt.setStrokeStyle(3, 0xffd166);
    sound.play(big ? 'fire' : ability === 'iceLance' ? 'frost' : 'shoot');
    const sx = from.x;
    const sy = from.y;
    // Home in on where the target is drawn, so the shot always lands on it.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: duration * 1000,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const tx = to.active ? to.x : bolt.x;
        const ty = to.active ? to.y : bolt.y;
        bolt.setPosition(sx + (tx - sx) * t, sy + (ty - sy) * t);
        if (big && Math.random() < 0.5) this.spark(bolt.x, bolt.y, 0xffb347, 1, 10);
      },
      onComplete: () => bolt.destroy(),
    });
  }

  private showAttack(fromId: number, toId: number, style: 'melee' | 'ranged', amount: number, ability?: AbilityId, big?: boolean): void {
    const from = this.battle.unit(fromId);
    const fromView = this.views.get(fromId)?.container;
    const atGate = toId === GATE_ID;
    // A unit killed by this hit is already gone from the battle, so use where it was last drawn.
    const toView = atGate ? undefined : this.views.get(toId);
    const to = atGate ? undefined : this.battle.unit(toId);
    if (!atGate && !toView) return;
    const fx = fromView?.x ?? from?.x ?? 0;
    const fy = fromView?.y ?? from?.y ?? 0;
    const tx = atGate ? fx : toView!.container.x;
    const ty = atGate ? WORLD.gateY + 4 : toView!.container.y;
    const hitHero = to?.side === 'hero';
    const mine = fromId === this.battle.playerId;
    const heavy = big || (ability !== undefined && amount >= 40);

    // Numbers: yours and damage to heroes are prominent; teammates' hits are smaller.
    const color = atGate || hitHero ? '#ff6b6b' : ability ? '#ffd166' : '#ffffff';
    const size = heavy ? 20 : ability || mine || hitHero ? 15 : 12;
    if (atGate) {
      this.floatText(tx, ty - 18, `${amount}`, color, 16);
      this.flashGate();
      sound.play('gate');
    } else {
      this.addNumber(toId, amount, color, size, mine || hitHero || ability ? 1 : 0.7);
    }

    // Melee: a lunge and a slash.
    if (style === 'melee' && ability !== 'thunderclap' && ability !== 'whirlwind' && fromView) {
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const body = this.views.get(fromId)?.body;
      if (body) this.tweens.add({ targets: body, x: (dx / len) * 7, y: (dy / len) * 7, duration: 70, yoyo: true });
      const slash = this.add.graphics().setDepth(30);
      const w = ability === 'eviscerate' ? 9 : ability === 'heroicStrike' ? 8 : ability === 'sinisterStrike' ? 7 : 3;
      const c = ability === 'eviscerate' ? 0xe74c3c : ability === 'heroicStrike' ? 0xff7043 : ability === 'sinisterStrike' ? 0xffe066 : 0xffffff;
      slash.lineStyle(w, c, 0.95).lineBetween(fx + (dx / len) * 10, fy + (dy / len) * 10, tx, ty);
      this.tweens.add({ targets: slash, alpha: 0, duration: ability ? 240 : 140, onComplete: () => slash.destroy() });
    }

    // Impact on the target: flash, knockback, sparks.
    if (toView && !toView.dead) {
      toView.flash.setAlpha(0.85);
      this.tweens.add({ targets: toView.flash, alpha: 0, duration: 130 });
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const kb = heavy ? 7 : 3;
      this.tweens.add({ targets: toView.body, x: (dx / len) * kb, y: (dy / len) * kb, duration: 60, yoyo: true });
      this.spark(tx, ty, hitHero ? 0xff6b6b : 0xfff2c4, heavy ? 8 : 3, heavy ? 26 : 16);
    }
    if (heavy) {
      this.cameras.main.shake(90, 0.004);
      this.hitStop = Math.max(this.hitStop, 0.05);
      sound.play('heavyHit');
    } else if (!atGate) {
      sound.play('hit');
    }
  }

  /** Merge rapid hits on the same target into one growing number. */
  private addNumber(targetId: number, amount: number, color: string, size: number, alpha = 1): void {
    const view = this.views.get(targetId);
    if (!view) return;
    const now = this.time.now;
    const existing = this.numbers.get(targetId);
    if (existing && existing.text.active && now - existing.at < 300) {
      existing.total += amount;
      existing.at = now;
      existing.text.setText(`${existing.total}`).setFontSize(Math.min(size + 6, Math.max(parseInt(`${existing.text.style.fontSize}`, 10), size)));
      return;
    }
    const x = view.container.x + Phaser.Math.Between(-6, 6);
    const y = view.container.y - 22;
    const t = this.text(x, y, `${amount}`, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold').setAlpha(alpha);
    t.setStroke('#000000', 3);
    this.tweens.add({ targets: t, y: y - 30, duration: 750, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 450, duration: 300, onComplete: () => t.destroy() });
    this.numbers.set(targetId, { text: t, total: amount, at: now });
  }

  /** A few small particles flying out from a point. */
  private spark(x: number, y: number, color: number, count: number, distance: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = distance * (0.5 + Math.random() * 0.7);
      const p = this.add.circle(x, y, 2 + Math.random() * 2, color).setDepth(35);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 260 + Math.random() * 160, onComplete: () => p.destroy() });
    }
  }

  private showAbility(fromId: number, ability: AbilityId, toId?: number): void {
    const from = this.battle.unit(fromId);
    if (!from) return;
    const to = toId !== undefined ? this.battle.unit(toId) : undefined;
    const name = ABILITIES[ability].name;
    switch (ability) {
      case 'taunt':
        return; // the taunt event draws it
      case 'thunderclap': {
        const ring = this.add.circle(from.x, from.y, from.radius).setStrokeStyle(6, 0xd4a24c).setDepth(30);
        const scale = ABILITY_TUNING.thunderclap.radius / from.radius;
        this.tweens.add({ targets: ring, scale, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#f5c26b', 15);
        return;
      }
      case 'whirlwind': {
        const ring = this.add.circle(from.x, from.y, from.radius).setStrokeStyle(6, 0xffffff).setDepth(30);
        this.tweens.add({ targets: ring, scale: ABILITY_TUNING.whirlwind.radius / from.radius, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#ffffff', 15);
        return;
      }
      case 'shieldBlock':
      case 'evasion':
      case 'powerShield': {
        const target = to ?? from;
        const color = ability === 'evasion' ? 0xf1c40f : ability === 'powerShield' ? 0xfff7d6 : 0xd4a24c;
        const ring = this.add.circle(target.x, target.y, target.radius + 6).setStrokeStyle(4, color).setDepth(30);
        this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        this.floatText(target.x, target.y - target.radius - 22, name, '#ffffff', 14);
        return;
      }
      case 'prayerOfHealing':
        this.floatText(from.x, from.y - from.radius - 22, name, '#7dff9b', 14);
        return;
      case 'blizzard':
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#9ad1ff', 14);
        return;
      case 'fortitude':
        for (const ally of this.battle.heroes) {
          if (!ally.alive) continue;
          const ring = this.add.circle(ally.x, ally.y, ally.radius + 4).setStrokeStyle(4, 0xfff3b0).setDepth(30);
          this.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, name, '#fff3b0', 14);
        return;
      case 'renew':
      case 'heal':
        if (to) {
          const ring = this.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(4, 0x7dff9b).setDepth(30);
          this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
          this.floatText(to.x, to.y - to.radius - 22, name, '#7dff9b', 15);
        }
        return;
      case 'polymorph':
      case 'kick':
      case 'counterspell':
        if (to) {
          const color = ability === 'polymorph' ? 0xf4f1e8 : ability === 'counterspell' ? 0x9ad1ff : 0xffe066;
          const line = this.add.graphics().setDepth(30);
          line.lineStyle(3, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
          this.tweens.add({ targets: line, alpha: 0, duration: 400, onComplete: () => line.destroy() });
          const ring = this.add.circle(to.x, to.y, to.radius + 6).setStrokeStyle(4, color).setDepth(30);
          this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        }
        this.floatText(from.x, from.y - from.radius - 22, `${name}!`, '#ffd166', 14);
        return;
      default:
        this.floatText(from.x, from.y - from.radius - 22, name, '#ffd166', 14);
    }
  }

  private showHeal(fromId: number, toId: number, amount: number): void {
    const from = this.battle.unit(fromId);
    const to = this.battle.unit(toId);
    if (!from || !to) return;
    const beam = this.add.graphics().setDepth(30);
    beam.lineStyle(3, 0x7dff9b, 0.8).lineBetween(from.x, from.y, to.x, to.y);
    this.tweens.add({ targets: beam, alpha: 0, duration: 300, onComplete: () => beam.destroy() });
    const ring = this.add.circle(to.x, to.y, to.radius + 4).setStrokeStyle(3, 0x7dff9b).setDepth(30);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    this.floatText(to.x, to.y - 18, `+${amount}`, '#7dff9b');
  }

  private showTaunt(fromId: number, toId: number): void {
    const from = this.battle.unit(fromId);
    const to = this.battle.unit(toId);
    if (!from || !to) return;
    const line = this.add.graphics().setDepth(30);
    line.lineStyle(4, 0xff9f1a, 0.9).lineBetween(from.x, from.y, to.x, to.y);
    this.tweens.add({ targets: line, alpha: 0, duration: 450, onComplete: () => line.destroy() });
    const ring = this.add.circle(to.x, to.y, to.radius + 5).setStrokeStyle(3, 0xff9f1a).setDepth(30);
    this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    this.floatText(from.x, from.y - from.radius - 22, 'Taunt!', '#ff9f1a');
  }

  private showDeath(id: number): void {
    const v = this.views.get(id);
    const u = this.battle.unit(id);
    if (!v) return;
    v.dead = true;
    v.hpBar.clear();
    v.aggroIcon?.container.setVisible(false);
    this.spark(v.container.x, v.container.y, u?.side === 'hero' ? 0xff6b6b : 0x9fdc5a, 12, 34);
    if (u?.side === 'hero') {
      sound.play('heroDown');
      this.cameras.main.shake(160, 0.006);
    } else {
      sound.play('death');
    }
    if (u?.side === 'hero') {
      v.body.setFillStyle(0x444444);
      v.container.setAlpha(0.5);
    } else {
      this.tweens.add({
        targets: v.container,
        alpha: 0,
        scale: 0.4,
        duration: 350,
        onComplete: () => {
          v.container.destroy();
          this.views.delete(id);
        },
      });
    }
  }

  private flashGate(): void {
    this.gateWall.setFillStyle(0xc0392b);
    this.time.delayedCall(90, () => this.gateWall.setFillStyle(0x7a5230));
  }

  private floatText(x: number, y: number, str: string, color: string, size = 15, alpha = 1): void {
    const t = this.text(x + Phaser.Math.Between(-6, 6), y, str, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold').setAlpha(alpha);
    t.setStroke('#000000', 3);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // --- end of wave --------------------------------------------------------

  private showEnd(): void {
    const run = this.run;
    const win = this.battle.outcome === 'victory';
    if (run && win && run.wave < RUN_WAVES) {
      sound.play('levelUp');
      if (isChoiceWave(run)) this.showRewards();
      else this.showLevelUp();
      return;
    }
    this.state = 'over';
    const cx = WORLD.width / 2;
    let title = win ? 'Victory!' : 'The gate has fallen';
    let sub = `Time ${Math.round(this.battle.time)}s`;
    if (run) {
      clearRun();
      title = win ? 'Chapter 1 complete!' : 'The gate has fallen';
      sub = win ? `All ${RUN_WAVES} waves survived.` : `You reached wave ${run.wave} of ${RUN_WAVES}.`;
    }
    this.overlay = this.add
      .container(0, 0, [
        this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.65).setOrigin(0, 0).setInteractive(),
        this.text(cx, 360, title, 38, win ? '#ffd166' : '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
        this.text(cx, 418, sub, 18, '#c9d1e0').setOrigin(0.5),
        this.button(cx, 500, 'New run', 22, '#2e86de', () => this.scene.restart()),
      ])
      .setDepth(100);
  }

  // --- between waves ------------------------------------------------------

  /**
   * Reward screen: one pick for each hero in turn ("Choose for Warrior, 1 of 4").
   * "Choose for me" turns Auto picks on and picks the rest.
   */
  private showRewards(slot = 0, picks: Reward[] = []): void {
    const run = this.run!;
    this.state = 'reward';
    const token = ++this.rewardToken;
    this.overlay?.destroy();
    const cx = WORLD.width / 2;
    const cls = run.team[slot];
    const hero = this.heroInSlot(slot);
    const heroName = hero?.label ?? cls[0].toUpperCase() + cls.slice(1);
    const options = rewardOptions(run, slot);
    const level = run.builds[slot].level;
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.82).setOrigin(0, 0).setInteractive(),
      this.text(cx, 124, `Wave ${run.wave} cleared!`, 32, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 164, `Level up — everyone is now level ${level + 1}`, 15, '#c9d1e0').setOrigin(0.5),
    ];
    // Which hero we're choosing for, with a row of four dots for progress.
    items.push(
      this.add.circle(cx - 120, 206, 16, COLORS[cls]).setStrokeStyle(2, 0x111111),
      this.text(cx - 120, 206, LETTERS[cls], 14, DARK_LETTER.includes(cls) ? '#222' : '#fff').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx - 96, 196, `Choose for ${heroName}`, 18, '#ffffff').setFontStyle('bold'),
      this.text(cx + 150, 198, `${slot + 1} of ${run.team.length}`, 14, '#8f9bb3'),
    );
    const cardBgs: Phaser.GameObjects.Rectangle[] = [];
    options.forEach((opt, i) => {
      const d = describeReward(opt);
      const y = 300 + i * 124;
      const bg = this.add.rectangle(cx, y, 470, 108, 0x1c2433).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
      const tagColor = d.tag === 'UPGRADE' ? '#9ad1ff' : d.tag === 'NEW PASSIVE' ? '#b57bff' : '#7dff9b';
      bg.on('pointerover', () => bg.setFillStyle(0x26314a));
      bg.on('pointerout', () => bg.setFillStyle(0x1c2433));
      bg.on('pointerdown', () => {
        if (this.rewardToken !== token) return;
        sound.play('click');
        this.nextRewardPick(slot, [...picks, opt]);
      });
      cardBgs.push(bg);
      items.push(
        bg,
        this.text(cx - 215, y - 40, d.tag, 12, tagColor).setFontStyle('bold'),
        this.text(cx - 215, y - 20, d.title, 21, '#ffffff').setFontStyle('bold'),
        this.text(cx - 215, y + 10, d.text, 14, '#c9d1e0').setWordWrapWidth(430),
      );
    });
    items.push(
      this.button(cx, 686, this.auto ? 'Auto picks is choosing…' : 'Choose for me (turns Auto picks on)', 17, '#5a4a1c', () => {
        if (this.rewardToken !== token) return;
        this.setAuto(true);
        this.takeReward(picks);
      }),
      this.text(cx, 736, 'Turn Auto picks off in the top bar to choose yourself.', 12, '#8f9bb3').setOrigin(0.5),
    );
    this.overlay = this.add.container(0, 0, items).setDepth(100);
    if (this.auto) {
      // Auto picks: show the choice for a moment, then fill in every hero's pick.
      const pick = autoChoose(cls, options);
      this.time.delayedCall(250, () => {
        if (this.rewardToken === token) cardBgs[options.indexOf(pick)]?.setStrokeStyle(4, GOLD);
      });
      this.time.delayedCall(1500, () => {
        if (this.rewardToken === token && this.auto) this.takeReward(picks);
      });
    }
  }

  private nextRewardPick(slot: number, picks: Reward[]): void {
    if (slot + 1 < this.run!.team.length) this.showRewards(slot + 1, picks);
    else this.takeReward(picks);
  }

  /** Waves without a reward choice: a quick level-up, then on to the next wave. */
  private showLevelUp(): void {
    const run = this.run!;
    this.state = 'reward';
    const token = ++this.rewardToken;
    const cx = WORLD.width / 2;
    const level = run.builds[0].level + 1;
    const next = CHOICE_AFTER_WAVES.find((w) => w > run.wave);
    const countdown = this.text(cx, 470, '', 15, '#8f9bb3').setOrigin(0.5);
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.55).setOrigin(0, 0).setInteractive(),
      this.text(cx, 330, `Wave ${run.wave} cleared!`, 34, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 378, `Level up! Everyone is now level ${level}.`, 18, '#ffffff').setOrigin(0.5),
      this.text(cx, 408, next && next <= RUN_WAVES ? `Next reward choice after wave ${next}` : '', 13, '#9ad1ff').setOrigin(0.5),
      countdown,
      this.button(cx, 530, 'Continue', 20, '#2e86de', () => {
        if (this.rewardToken === token) this.takeReward(null);
      }),
    ];
    this.overlay = this.add.container(0, 0, items).setDepth(100);
    let left = 3;
    const tick = () => {
      if (this.rewardToken !== token) return;
      if (left === 0) {
        this.takeReward(null);
        return;
      }
      countdown.setText(`Next wave in ${left}…`);
      left--;
      this.time.delayedCall(1000, tick);
    };
    tick();
  }

  /** Apply the picks (missing ones are chosen automatically) and start the next wave. */
  private takeReward(picks: Reward[] | null): void {
    const run = this.run!;
    this.rewardToken++;
    sound.play('click');
    const chosen = completeWave(run, picks ?? []);
    saveRun(run);
    const names = this.battle.heroes.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map((h) => h.label);
    const teamPicks = chosen.length ? 'Rewards: ' + chosen.map((r, i) => `${names[i] ?? run.team[i]} → ${describeReward(r).title}`).join(' · ') : '';
    this.scene.restart({ run, teamPicks });
  }

  // --- helpers ------------------------------------------------------------

  private button(x: number, y: number, label: string, size: number, bg: string, onTap: () => void): Phaser.GameObjects.Text {
    return this.text(x, y, label, size, '#ffffff')
      .setOrigin(0.5)
      .setPadding(24, 12, 24, 12)
      .setBackgroundColor(bg)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onTap);
  }

  private text(x: number, y: number, str: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color }).setResolution(DPR);
  }
}
