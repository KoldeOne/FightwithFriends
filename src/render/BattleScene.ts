import Phaser from 'phaser';
import { Battle, STEP, type AbilityResult } from '../sim/battle';
import {
  ABILITIES,
  ABILITY_TUNING,
  ARENA,
  BOARD,
  CHOICE_EVERY,
  DEFAULT_TEAM,
  HERO_KIT,
  HERO_MOVE,
  heroTileAt,
  makeRound,
  MAX_ABILITY_SLOTS,
  partySize,
  PASSIVES,
  RESOURCES,
  ROUND_1,
  SUDDEN_DEATH,
  TRAITS,
  WORLD,
} from '../sim/content';
import { sound } from './sound';
import {
  ALL_CLASSES,
  autoChoose,
  bestRound,
  clearRun,
  completeWave,
  describeReward,
  isAbilityMilestone,
  isChoiceWave,
  loadRun,
  loseRound,
  needsRecruit,
  nextAbilityMilestone,
  newRun,
  recordRound,
  recruit,
  rewardOptions,
  saveRun,
  type Reward,
  type RunState,
} from '../sim/run';
import type { AbilityId, BattleEvent, Effect, HeroClass, ResourceKind, Unit } from '../sim/types';
import warriorSprite from '../../art/heroes/hero_warrior.png';
import priestSprite from '../../art/heroes/hero_priest.png';
import mageSprite from '../../art/heroes/hero_mage.png';
import rogueSprite from '../../art/heroes/hero_rogue.png';

/** 32x32 pixel-art hero sprites (source: art/heroes/make-sprites.ps1). */
const HERO_SPRITES: Record<string, string> = {
  warrior: warriorSprite,
  priest: priestSprite,
  mage: mageSprite,
  rogue: rogueSprite,
};
/** Hero sprites are drawn at 2x, standing on their unit disc. */
const SPRITE_SCALE = 2;

const COLORS: Record<string, number> = {
  warrior: 0xc0392b,
  rogue: 0xf1c40f,
  mage: 0x3498db,
  priest: 0xecf0f1,
  // Goblins: greens
  grunt: 0x6b8e23,
  archer: 0x8fbc4f,
  shaman: 0x8e6bbf,
  brute: 0x4e6b1f,
  warchief: 0x2f4f1a,
  // Undead: bone and grey-violet
  skeleton: 0xd8d2bf,
  boneArcher: 0xb9b29a,
  cultist: 0x5b4a7a,
  ghoul: 0x7f8f6a,
  abomination: 0x8a6f7d,
  boneKing: 0xe8e0c8,
  // Demons: reds and black
  imp: 0xe8642c,
  hellhound: 0x9b2d1f,
  fiend: 0xb5332b,
  shadowCaller: 0x3d2a4f,
  pitBrute: 0x7a1d1d,
  demonLord: 0x2a0f12,
};

const LETTERS: Record<string, string> = {
  warrior: 'W',
  rogue: 'R',
  mage: 'M',
  priest: 'P',
  grunt: 'G',
  archer: 'A',
  shaman: 'S',
  brute: 'B',
  warchief: 'W',
  skeleton: 'Sk',
  boneArcher: 'A',
  cultist: 'C',
  ghoul: 'G',
  abomination: 'Ab',
  boneKing: 'K',
  imp: 'I',
  hellhound: 'H',
  fiend: 'F',
  shadowCaller: 'SC',
  pitBrute: 'PB',
  demonLord: 'DL',
};

const DARK_LETTER = ['priest', 'rogue', 'archer', 'skeleton', 'boneArcher', 'boneKing'];

const PROJECTILE_COLORS: Record<string, number> = {
  mage: 0xff8c1a,
  priest: 0xfff2a8,
  archer: 0xa0522d,
  boneArcher: 0xe8e0c8,
  imp: 0xff5a1f,
  shaman: 0xb57bff,
  cultist: 0x9b7bd1,
  shadowCaller: 0x7a3db8,
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
/** Buff icons on units: up to this many, this size (px). */
const UNIT_ICONS = 4;
const UNIT_ICON = 10;
const BUFF_ICON = 22;
const TARGET_BAR_X = 200;
/** Party panel layout (bottom of the screen): one frame per hero, sized to fit 3-5 heroes. */
function partyLayout(n: number): { x: number; frameW: number; gap: number; frameH: number; box: number } {
  const x = 6;
  const gap = 4;
  const frameW = Math.floor((WORLD.width - 2 * x - (n - 1) * gap) / n);
  return { x, frameW, gap, frameH: 104, box: Math.min(22, Math.floor((frameW - 10) / MAX_ABILITY_SLOTS) - 2) };
}
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

/** Will clearing the current round open a party slot (after the round 10 and 20 bosses)? */
function needsRecruitAfter(run: RunState): boolean {
  return partySize(run.wave + 1) > run.team.length;
}

interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Graphics;
  name?: Phaser.GameObjects.Text;
  letter: Phaser.GameObjects.Text;
  /** White overlay for hit flashes. */
  flash: Phaser.GameObjects.Arc;
  /** Pixel-art figure (heroes); the circle under it becomes its base. */
  sprite?: Phaser.GameObjects.Image;
  /** Top of the drawn unit, relative to its centre; bars sit above this. */
  top: number;
  /** Cast bar label (enemies that cast). */
  castLabel?: Phaser.GameObjects.Text;
  /** Aggro warning badge. */
  aggroIcon?: { container: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Arc };
  /** Tiny buff/debuff icons just under the health bar. */
  effectIcons: { bg: Phaser.GameObjects.Rectangle; letter: Phaser.GameObjects.Text }[];
  dead: boolean;
}

/** choosing: team builder. recruit: picking a new hero. placing: arranging heroes before the fight. */
type SceneState = 'choosing' | 'recruit' | 'placing' | 'playing' | 'paused' | 'reward' | 'over';

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
  /** Round intro banner time left; the fight starts when it ends. */
  private introLeft = 0;
  /** Set when the wave ends: short slow-motion before the end screen. */
  private endingLeft = -1;
  /** Merged floating damage numbers, per target. */
  private numbers = new Map<number, { text: Phaser.GameObjects.Text; total: number; at: number }>();
  private lastReinforcementCall = -99;

  // Placement phase
  /** Team slot of the hero picked up to move, if any. */
  private selectedSlot: number | null = null;
  /** Board tile outlines and highlights. */
  private tileLayer!: Phaser.GameObjects.Graphics;
  private placementUi?: Phaser.GameObjects.Container;
  private suddenDeathShown = false;

  // Scenery / HUD
  private party = partyLayout(3);
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

  preload(): void {
    for (const [cls, url] of Object.entries(HERO_SPRITES)) this.load.image(`hero-${cls}`, url);
  }

  create(data?: { run?: RunState; teamPicks?: string }): void {
    this.views.clear();
    this.acc = 0;
    this.overlay = undefined;
    this.tooltip = undefined;
    this.inspectUi = undefined;
    this.inspectId = null;
    this.pauseBanner = undefined;
    this.run = data?.run ?? null;
    this.teamPicks = data?.teamPicks ?? '';
    this.selectedSlot = null;
    this.placementUi = undefined;
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
          placement: run.placement,
        })
      : new Battle({ seed: Date.now() % 1_000_000, wave: ROUND_1, carefulAI: this.careful, team: DEFAULT_TEAM });
    this.party = partyLayout(Math.max(3, this.battle.heroes.length));

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
    if (!run) {
      this.state = 'choosing';
      this.showTeamBuilder();
    } else if (needsRecruit(run)) {
      this.state = 'recruit';
      this.showRecruit();
    } else {
      if (this.teamPicks) this.showBanner(this.teamPicks);
      this.startPlacement();
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
    this.inspectRefresh -= deltaMs;
    if (this.inspectRefresh <= 0) {
      this.inspectRefresh = 200;
      this.refreshInspect();
    }
    this.drawFocus(time);
    this.drawZones(time);
    this.drawTiles();
    if (this.state === 'playing' && !this.suddenDeathShown && this.battle.time > SUDDEN_DEATH.after) {
      this.suddenDeathShown = true;
      this.showBanner('Sudden death! Every hit lands harder from now on.', true);
      sound.play('wave');
    }
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

  /** "Round 3 — The Shaman": a short banner as the fight begins. */
  private showWaveIntro(): void {
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

  // --- hero select ----------------------------------------------------------

  /** Pick the starting three: tap classes to fill the slots, tap a slot to empty it. */
  private showTeamBuilder(team: HeroClass[] = []): void {
    this.overlay?.destroy();
    const size = partySize(1);
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.8).setOrigin(0, 0).setInteractive(),
      this.text(cx, 128, 'Build your guild', 32, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 164, `Pick ${size} heroes. A 4th joins after the round 10 boss, a 5th after round 20.`, 13, '#c9d1e0')
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(480),
    ];
    const saved = loadRun();
    if (saved) {
      const names = saved.team.map((c) => LETTERS[c]).join(' ');
      items.push(
        this.button(cx, 68, `▶ Continue: ${names} — round ${saved.wave}, ${'♥'.repeat(saved.lives)}`, 16, '#1e6f50', () => this.scene.restart({ run: saved })),
      );
    }
    const best = bestRound();
    if (best) items.push(this.text(cx, 186, `Best: round ${best}`, 12, '#ffd166').setOrigin(0.5));

    // The team slots.
    const slotW = 120;
    const slotY = 236;
    for (let i = 0; i < size; i++) {
      const x = cx + (i - (size - 1) / 2) * (slotW + 10);
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

    items.push(
      ...this.classCards(342, (cls) => {
        if (team.length >= size) return;
        this.showTeamBuilder([...team, cls]);
      }),
    );

    // Classic team shortcut and Start.
    items.push(
      this.text(cx, 732, 'Tip: a classic start is a tank, a healer and a damage dealer.', 12, '#8f9bb3').setOrigin(0.5),
      this.button(cx - 120, 790, 'Classic team', 16, '#2b3445', () => {
        sound.play('click');
        this.showTeamBuilder([...DEFAULT_TEAM]);
      }),
    );
    const ready = team.length === size;
    const start = this.button(cx + 110, 790, ready ? 'Start run ▶' : `Pick ${size - team.length} more`, 18, ready ? '#2e86de' : '#2b3445', () => {
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

  /** One card per class, stacked from `top`; tapping a card calls `onPick`. */
  private classCards(top: number, onPick: (cls: HeroClass) => void): Phaser.GameObjects.GameObject[] {
    const cx = WORLD.width / 2;
    const cardH = 92;
    const items: Phaser.GameObjects.GameObject[] = [];
    ALL_CLASSES.forEach((cls, i) => {
      const y = top + i * (cardH + 8);
      const kit = HERO_KIT[cls];
      const bg = this.add
        .rectangle(cx, y, 470, cardH, 0x1c2433)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x26314a))
        .on('pointerout', () => bg.setFillStyle(0x1c2433))
        .on('pointerdown', () => {
          sound.play('click');
          onPick(cls);
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
    return items;
  }

  /** After a boss: pick a class to join the party. */
  private showRecruit(): void {
    const run = this.run!;
    this.overlay?.destroy();
    const cx = WORLD.width / 2;
    const level = Math.max(...run.builds.map((b) => b.level));
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.85).setOrigin(0, 0).setInteractive(),
      this.text(cx, 130, 'Your guild grows!', 32, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 172, `Choose hero ${run.team.length + 1}. From now on the enemy fields ${partySize(run.wave)} fighters too.`, 14, '#ffffff')
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(480),
      this.text(cx, 204, `They join at level ${level}, with rewards picked for them so far.`, 12, '#8f9bb3').setOrigin(0.5),
      this.text(cx, 236, `Your party: ${run.team.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ')}`, 13, '#c9d1e0').setOrigin(0.5),
      ...this.classCards(320, (cls) => {
        recruit(run, cls);
        saveRun(run);
        this.scene.restart({ run, teamPicks: `${cls[0].toUpperCase() + cls.slice(1)} joins the guild!` });
      }),
    ];
    this.overlay = this.add.container(0, 0, items).setDepth(100);
  }

  // --- placement ------------------------------------------------------------

  /** Before each round: the enemy line-up is visible; move heroes between tiles, then Fight. */
  private startPlacement(): void {
    this.state = 'placing';
    this.selectedSlot = null;
    const cx = WORLD.width / 2;
    const midY = (BOARD.enemyRowY[0] + BOARD.heroRowY[0]) / 2;
    const w = this.battle.wave;
    const fight = this.button(cx, midY + 4, 'Fight! ▶', 22, w.boss ? '#a83232' : '#2e86de', () => this.startFight());
    this.placementUi = this.add
      .container(0, 0, [this.text(cx, midY - 48, 'Tap a hero, then a tile to move them.', 14, '#ffffff').setOrigin(0.5).setStroke('#000000', 3), fight])
      .setDepth(60);
  }

  private startFight(): void {
    if (this.state !== 'placing') return;
    sound.unlock();
    sound.play('click');
    this.placementUi?.destroy();
    this.placementUi = undefined;
    this.selectedSlot = null;
    this.battle.setFocus(null);
    this.state = 'playing';
    this.showWaveIntro();
  }

  /** Tap during placement: pick up a hero, or drop the picked-up hero on a tile (swapping if taken). */
  private placementTap(pointer: Phaser.Input.Pointer): void {
    const hero = this.battle.heroes.find((h) => Math.hypot(h.x - pointer.x, h.y - pointer.y) <= h.radius + 20);
    const tile = heroTileAt(pointer.x, pointer.y);
    if (this.selectedSlot !== null && tile) {
      sound.play('click');
      this.battle.placeHero(this.selectedSlot, tile);
      this.selectedSlot = null;
      if (this.run) {
        this.run.placement = this.battle.placement;
        saveRun(this.run);
      }
      return;
    }
    if (hero) {
      sound.play('click');
      this.selectedSlot = this.selectedSlot === hero.slot ? null : (hero.slot ?? null);
      this.battle.setFocus(hero.id);
      return;
    }
    // Tap an enemy to scout it.
    const enemy = this.battle.enemies.find((e) => e.alive && Math.hypot(e.x - pointer.x, e.y - pointer.y) <= e.radius + 20);
    this.battle.setFocus(enemy ? enemy.id : null);
    this.selectedSlot = null;
  }

  /** Board tiles: faint on both sides; during placement, your side is highlighted. */
  private drawTiles(): void {
    const g = this.tileLayer;
    g.clear();
    const placing = this.state === 'placing';
    const tile = (x: number, y: number, fill: number, alpha: number, stroke: number, strokeAlpha: number, width = 1) => {
      const w = BOARD.tileW - 8;
      const h = BOARD.tileH - 8;
      g.fillStyle(fill, alpha).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      g.lineStyle(width, stroke, strokeAlpha).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    };
    for (const y of BOARD.enemyRowY) for (const x of BOARD.colX) tile(x, y, 0x000000, 0.06, 0x8b1a1a, placing ? 0.35 : 0.12);
    const selected = this.selectedSlot !== null ? this.battle.heroes.find((h) => h.slot === this.selectedSlot) : undefined;
    for (const y of BOARD.heroRowY) {
      for (const x of BOARD.colX) {
        if (!placing) {
          tile(x, y, 0x000000, 0.06, 0x2e86de, 0.12);
          continue;
        }
        const here = selected && selected.x === x && selected.y === y;
        tile(x, y, here ? GOLD : 0x2e86de, here ? 0.25 : selected ? 0.16 : 0.08, here ? GOLD : 0x5dade2, selected ? 0.8 : 0.4, here ? 3 : 1);
      }
    }
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

  /**
   * Tap any unit to inspect it (works while paused too). Tapping empty ground
   * closes the inspect window. It doesn't change what the AI does.
   */
  private onFieldTap(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length || pointer.y > WORLD.hudTop) return;
    if (this.state === 'placing') {
      this.placementTap(pointer);
      return;
    }
    if (this.state !== 'playing' && this.state !== 'paused') return;
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
    if (!best || best.id === this.inspectId) {
      this.closeInspect();
      this.battle.setFocus(null);
      return;
    }
    this.battle.setFocus(best.id);
    this.openInspect(best.id);
  }

  // --- inspect window -------------------------------------------------------

  /** Unit shown in the inspect window, if open. */
  private inspectId: number | null = null;
  private inspectUi?: { box: Phaser.GameObjects.Rectangle; body: Phaser.GameObjects.Text; title: Phaser.GameObjects.Text; container: Phaser.GameObjects.Container };
  private inspectRefresh = 0;

  private openInspect(id: number): void {
    this.closeInspect();
    const u = this.battle.unit(id);
    if (!u) return;
    this.inspectId = id;
    const x = 16;
    const y = 134;
    const w = WORLD.width - 32;
    const box = this.add.rectangle(x, y, w, 100, 0x0e131d, 0.96).setOrigin(0, 0).setStrokeStyle(2, u.side === 'hero' ? COLORS[u.kind] : 0xe74c3c).setInteractive();
    const title = this.text(x + 14, y + 12, '', 18, '#ffd166').setFontStyle('bold');
    const body = this.text(x + 14, y + 42, '', 13, '#ffffff').setWordWrapWidth(w - 28).setLineSpacing(3);
    const close = this.text(x + w - 10, y + 8, '✕', 20, '#c9d1e0')
      .setOrigin(1, 0)
      .setPadding(8, 2, 8, 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.closeInspect();
        this.battle.setFocus(null);
      });
    const container = this.add.container(0, 0, [box, title, body, close]).setDepth(95);
    this.inspectUi = { box, body, title, container };
    this.refreshInspect();
  }

  private closeInspect(): void {
    this.inspectUi?.container.destroy();
    this.inspectUi = undefined;
    this.inspectId = null;
  }

  /** Rebuild the inspect text (a few times a second, so health stays live). */
  private refreshInspect(): void {
    const ui = this.inspectUi;
    if (!ui || this.inspectId === null) return;
    const u = this.battle.unit(this.inspectId);
    if (!u?.alive) {
      this.closeInspect();
      return;
    }
    const lines: string[] = [];
    lines.push(`Health: ${Math.ceil(u.hp)} / ${u.maxHp}`);
    if (u.side === 'hero' && u.resourceKind) lines.push(`${RESOURCES[u.resourceKind].label}: ${Math.floor(u.resource ?? 0)} / ${u.maxResource}`);
    lines.push(`Attack: ${Math.round(u.damage)} damage every ${u.attackInterval}s (${u.attackStyle}, range ${u.range})`);
    if (u.heal) lines.push(`Auto-heal: ${Math.round(u.heal)} on the most hurt ally`);
    lines.push(`Move speed: ${u.side === 'hero' ? HERO_MOVE.speed : u.speed}`);
    if (u.side === 'hero') {
      if (u.isTank) lines.push(`Role: tank (threat x${u.threatMultiplier ?? 1})`);
      const passive = u.passive ? PASSIVES[u.passive] : undefined;
      if (passive) lines.push('', `Passive — ${passive.name}: ${passive.description}`);
      lines.push('', 'Abilities:');
      for (const a of u.abilities ?? []) {
        const def = ABILITIES[a.id];
        const cost = this.battle.abilityCost(u, a.id);
        const costText = cost ? `${cost} ${RESOURCES[u.resourceKind!].label.toLowerCase()}` : 'free';
        const cd = this.battle.abilityCooldown(a);
        const ups = [a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(', ');
        lines.push(`• ${def.name}${ups ? ` (${ups})` : ''} — cost ${costText}, ${cd % 1 ? cd.toFixed(1) : cd}s cooldown`);
        lines.push(`   ${this.battle.abilityEffectText(u, a)}`);
      }
      for (const t of u.traits ?? []) lines.push(`• ${TRAITS[t].name} (passive) — ${TRAITS[t].description}`);
    } else {
      const notes = [u.isElite ? 'Elite' : '', u.isCaster ? 'Caster (can be interrupted)' : ''].filter(Boolean);
      if (notes.length) lines.push(notes.join(' · '));
      if (u.casting) lines.push(`Casting: ${u.casting.spell} (${u.casting.remaining.toFixed(1)}s)`);
    }
    const effects = (u.effects ?? []).filter((e) => e.remaining > 0);
    if (effects.length) {
      lines.push('', 'Effects:');
      for (const e of effects) {
        const info = EFFECT_INFO[e.kind];
        lines.push(`• ${info.name}${Number.isFinite(e.remaining) ? ` (${Math.ceil(e.remaining)}s)` : ''} — ${info.text(e)}`);
      }
    }
    ui.title
      .setText(`${u.label}${u.side === 'hero' ? ` — level ${u.level ?? 1}` : ''}`)
      .setColor(u.side === 'hero' ? '#' + COLORS[u.kind].toString(16).padStart(6, '0') : '#ff8a8a');
    ui.body.setText(lines.join('\n'));
    ui.box.setSize(ui.box.width, 42 + ui.body.height + 14);
  }

  /** Pause stops the fight, but everything stays interactive (inspect, tooltips, panels). */
  private togglePause(): void {
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

  private pauseBanner?: Phaser.GameObjects.Text;

  // --- static scenery -----------------------------------------------------

  private drawField(): void {
    const g = this.add.graphics();
    // Arena: stone stands around a sand floor, with a line across the middle.
    g.fillStyle(0x2a2420).fillRect(0, 0, WORLD.width, WORLD.hudTop);
    g.fillStyle(0x3b322b);
    for (let y = 8; y < ARENA.top - 4; y += 14) g.fillRect(0, y, WORLD.width, 6);
    g.fillStyle(0x6b5a43).fillRoundedRect(6, ARENA.top, WORLD.width - 12, ARENA.bottom - ARENA.top + 14, 18);
    g.fillStyle(0x7a6850).fillRoundedRect(14, ARENA.top + 8, WORLD.width - 28, ARENA.bottom - ARENA.top - 2, 14);
    // A few darker patches so the sand isn't flat.
    g.fillStyle(0x705f48, 0.6);
    for (const [x, y, r] of [[120, 230, 40], [400, 300, 55], [180, 520, 50], [430, 680, 45], [90, 700, 35], [300, 420, 60]]) g.fillCircle(x, y, r);
    const midY = (BOARD.enemyRowY[0] + BOARD.heroRowY[0]) / 2;
    g.lineStyle(2, 0x5a4a37, 0.8).lineBetween(24, midY, WORLD.width - 24, midY);
    g.lineStyle(2, 0x5a4a37, 0.8).strokeCircle(WORLD.width / 2, midY, 40);
    this.tileLayer = this.add.graphics().setDepth(1);
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

    // Big round number at the top center, with the line-up name, lives and time underneath.
    this.waveText = this.text(WORLD.width / 2, 44, '', 30, '#ffd166').setOrigin(0.5, 0).setDepth(50).setFontStyle('bold');
    this.waveText.setStroke('#000000', 5);
    this.hudText = this.text(WORLD.width / 2, 80, '', 13, '#c9d1e0').setOrigin(0.5, 0).setDepth(50);
    this.hudText.setStroke('#000000', 3);

    // Party panel: one frame per hero.
    this.partyFrames = [];
    this.partyBars = this.add.graphics().setDepth(1);
    this.partyCooldowns = this.add.graphics().setDepth(4);
    const w = this.party.frameW;
    const frames = Math.max(3, this.battle.heroes.length);
    for (let i = 0; i < frames; i++) {
      const x = this.party.x + i * (w + this.party.gap);
      const y = top + 6;
      const bg = this.add
        .rectangle(x, y, w, this.party.frameH, 0x111723)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x2b3445)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const h = this.heroInSlot(i);
          if (!h) return;
          if (!h.alive) {
            this.showHeroTooltip(i);
            return;
          }
          this.battle.setFocus(h.id);
          this.openInspect(h.id);
        });
      const name = this.text(x + 6, y + 4, '', frames > 4 ? 10 : 12, '#ffffff').setFontStyle('bold');
      const hpText = this.text(x + 6, y + 22, '', 10, '#ffffff').setFontStyle('bold').setDepth(2);
      hpText.setStroke('#000000', 3);
      const boxes: PartyFrame['boxes'] = [];
      for (let j = 0; j < MAX_ABILITY_SLOTS; j++) {
        const bx = x + 5 + j * (this.party.box + 2) + this.party.box / 2;
        const by = y + 58 + this.party.box / 2;
        const box = this.add
          .rectangle(bx, by, this.party.box, this.party.box, 0x151b27)
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
    const t = Math.floor(this.battle.time);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const w = this.battle.wave;
    this.waveText.setText(`ROUND ${w.number}`).setColor(w.boss ? '#ff6b6b' : '#ffd166');
    const lives = this.run ? ` · ${'♥'.repeat(this.run.lives)}` : '';
    if (this.state === 'placing' || this.state === 'recruit' || this.state === 'choosing') {
      this.hudText.setText(`${w.name ?? ''}${lives}`);
    } else {
      const ramp = this.battle.damageRamp;
      const sudden = ramp > 1 ? ` · SUDDEN DEATH x${ramp.toFixed(1)}` : '';
      this.hudText.setText(`${w.name ?? ''} · ${this.battle.enemiesRemaining} left · ${clock}${lives}${sudden}`);
    }

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
    const w = this.party.frameW;
    this.partyFrames.forEach((f, i) => {
      const h = this.heroInSlot(i);
      const x = this.party.x + i * (w + this.party.gap);
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
            const bx = b.bg.x - this.party.box / 2;
            const by = b.bg.y - this.party.box / 2;
            this.partyCooldowns.fillStyle(0x000000, 0.6).fillRect(bx, by, this.party.box, this.party.box * Math.min(1, a.cooldown / this.battle.abilityCooldown(a)));
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
      this.focusText.setText('Tap a hero or enemy to inspect it. Tap a hero panel for its abilities.');
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
      const costText = cost ? `${cost} ${RESOURCES[h.resourceKind!].label.toLowerCase()}` : 'free';
      const ups = [a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(' · ');
      const cd = this.battle.abilityCooldown(a);
      this.showTooltip(
        `${h.label}: ${def.name}`,
        this.battle.abilityEffectText(h, a),
        `Cost: ${costText} · Cooldown: ${cd % 1 ? cd.toFixed(1) : cd}s${ups ? ` · ${ups}` : ''}`,
        COLORS[h.kind],
        true,
      );
    } else if (trait) {
      this.showTooltip(`${h.label}: ${TRAITS[trait].name}`, TRAITS[trait].description, 'Passive — always on', 0xb57bff, true);
    } else {
      this.showTooltip('Empty slot', 'Earn new abilities from rewards every 5 rounds.', '', 0x3a4660, true);
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

  /** A small box just above the HUD, sized to fit its text. */
  private showTooltip(titleText: string, bodyText: string, metaText: string, color: number, autoHide: boolean, bad = false): void {
    this.tooltip?.destroy();
    const w = 420;
    const x = 16;
    const title = this.text(x + 12, 0, titleText, 15, bad ? '#ff8a8a' : '#ffd166').setFontStyle('bold');
    const body = this.text(x + 12, 0, bodyText, 13, '#ffffff').setWordWrapWidth(w - 24);
    const meta = this.text(x + 12, 0, metaText, 12, '#9ad1ff').setWordWrapWidth(w - 24);
    const h = 18 + title.height + 6 + body.height + (metaText ? 6 + meta.height : 0) + 10;
    const y = WORLD.hudTop - h - 8;
    title.setY(y + 10);
    body.setY(title.y + title.height + 6);
    meta.setY(body.y + body.height + 6);
    const box = this.add.rectangle(x, y, w, h, 0x111723, 0.96).setOrigin(0, 0).setStrokeStyle(2, color);
    this.tooltip = this.add.container(0, 0, [box, title, body, meta]).setDepth(90);
    const tip = this.tooltip;
    if (autoHide) {
      this.time.delayedCall(4000, () => {
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
    let sprite: Phaser.GameObjects.Image | undefined;
    let top = -u.radius;
    const key = `hero-${u.kind}`;
    if (u.side === 'hero' && this.textures.exists(key)) {
      // Keep pixels crisp when scaled up.
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      body.setFillStyle(COLORS[u.kind] ?? 0xffffff, 0.35);
      letter.setVisible(false);
      sprite = this.add.image(0, u.radius * 0.6, key).setOrigin(0.5, 1).setScale(SPRITE_SCALE);
      container.addAt(sprite, 2);
      top = u.radius * 0.6 - sprite.displayHeight + 8;
    }
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
      const iconContainer = this.add.container(u.radius + 12, top - 6, [disc, mark]).setVisible(false);
      container.add(iconContainer);
      aggroIcon = { container: iconContainer, disc };
    }
    let castLabel: Phaser.GameObjects.Text | undefined;
    if (u.kind === 'shaman') {
      castLabel = this.text(0, -u.radius - 34, '', 11, '#e0c3ff').setOrigin(0.5).setFontStyle('bold');
      castLabel.setStroke('#000000', 3);
      container.add(castLabel);
    }
    const effectIcons: UnitView['effectIcons'] = [];
    for (let i = 0; i < UNIT_ICONS; i++) {
      const bg = this.add.rectangle(0, 0, UNIT_ICON, UNIT_ICON, 0xffffff).setStrokeStyle(1, 0x000000).setVisible(false);
      const l = this.text(0, 0, '', 8, '#111').setOrigin(0.5).setFontStyle('bold').setVisible(false);
      container.add([bg, l]);
      effectIcons.push({ bg, letter: l });
    }
    this.views.set(u.id, { container, body, hpBar, name, letter, flash, sprite, top, aggroIcon, castLabel, effectIcons, dead: false });
  }

  /** Brief push of a unit's figure (lunges and knockback); returns to rest. */
  private nudge(v: UnitView, dx: number, dy: number, duration: number): void {
    this.tweens.add({ targets: v.body, x: dx, y: dy, duration, yoyo: true });
    if (v.sprite) this.tweens.add({ targets: v.sprite, x: `+=${dx}`, y: `+=${dy}`, duration, yoyo: true });
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
      const y = v.top - 10;
      v.hpBar.clear();
      v.hpBar.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, 7);
      const pct = u.hp / u.maxHp;
      const color = u.side === 'enemy' ? 0xe74c3c : pct > 0.5 ? 0x2ecc71 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
      v.hpBar.fillStyle(color).fillRect(-w / 2, y, w * pct, 5);

      // Tiny buff/debuff icons just under the health bar (buffs first; debuffs have a red edge).
      const shown = (u.effects ?? [])
        .filter((e) => e.remaining > 0 && e.kind !== 'sheep')
        .sort((a, b) => Number(EFFECT_INFO[a.kind].debuff) - Number(EFFECT_INFO[b.kind].debuff))
        .filter((e, i, list) => list.findIndex((o) => o.kind === e.kind) === i)
        .slice(0, UNIT_ICONS);
      const startX = -((shown.length - 1) * (UNIT_ICON + 2)) / 2;
      v.effectIcons.forEach((icon, i) => {
        const e = shown[i];
        icon.bg.setVisible(!!e);
        icon.letter.setVisible(!!e);
        if (!e) return;
        const info = EFFECT_INFO[e.kind];
        const ix = startX + i * (UNIT_ICON + 2);
        const iy = y + 6 + UNIT_ICON / 2 + 1;
        icon.bg.setPosition(ix, iy).setFillStyle(info.color).setStrokeStyle(1, info.debuff ? 0xe74c3c : 0x000000);
        icon.letter.setPosition(ix, iy).setText(info.letter);
      });
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
          if (u?.ai === 'smasher') {
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
          // A smasher's heavy hit landing (its spell name, shouted).
          const smash = u?.ai === 'smasher' && e.tone === 'bad';
          if (u) this.floatText(u.x, u.y - u.radius - 30, e.text, color, smash ? 22 : 16);
          if (smash) {
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
    // A unit killed by this hit is already gone from the battle, so use where it was last drawn.
    const toView = this.views.get(toId);
    const to = this.battle.unit(toId);
    if (!toView) return;
    const fx = fromView?.x ?? from?.x ?? 0;
    const fy = fromView?.y ?? from?.y ?? 0;
    const tx = toView.container.x;
    const ty = toView.container.y;
    const hitHero = to?.side === 'hero';
    const mine = fromId === this.battle.playerId;
    const heavy = big || (ability !== undefined && amount >= 40);

    // Numbers: yours and damage to heroes are prominent; teammates' hits are smaller.
    const color = hitHero ? '#ff6b6b' : ability ? '#ffd166' : '#ffffff';
    const size = heavy ? 20 : ability || mine || hitHero ? 15 : 12;
    this.addNumber(toId, amount, color, size, mine || hitHero || ability ? 1 : 0.7);

    // Melee: a lunge and a slash.
    if (style === 'melee' && ability !== 'thunderclap' && ability !== 'whirlwind' && fromView) {
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const lunger = this.views.get(fromId);
      if (lunger) this.nudge(lunger, (dx / len) * 7, (dy / len) * 7, 70);
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
      const hitSprite = toView.sprite;
      if (hitSprite) {
        hitSprite.setTintFill(0xffffff);
        this.time.delayedCall(80, () => {
          if (!toView.dead) hitSprite.clearTint();
        });
      }
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const kb = heavy ? 7 : 3;
      this.nudge(toView, (dx / len) * kb, (dy / len) * kb, 60);
      this.spark(tx, ty, hitHero ? 0xff6b6b : 0xfff2c4, heavy ? 8 : 3, heavy ? 26 : 16);
    }
    if (heavy) {
      this.cameras.main.shake(90, 0.004);
      this.hitStop = Math.max(this.hitStop, 0.05);
      sound.play('heavyHit');
    } else {
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
      v.sprite?.setTint(0x555555);
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

  private floatText(x: number, y: number, str: string, color: string, size = 15, alpha = 1): void {
    const t = this.text(x + Phaser.Math.Between(-6, 6), y, str, size, color).setOrigin(0.5).setDepth(40).setFontStyle('bold').setAlpha(alpha);
    t.setStroke('#000000', 3);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // --- end of round -------------------------------------------------------

  private showEnd(): void {
    const run = this.run;
    const win = this.battle.outcome === 'victory';
    const cx = WORLD.width / 2;
    if (run && win) {
      recordRound(run.wave);
      sound.play('levelUp');
      if (isChoiceWave(run)) this.showRewards();
      else this.showLevelUp();
      return;
    }
    this.state = 'over';
    if (run && loseRound(run)) {
      // A life lost: rearrange and try the same round again.
      saveRun(run);
      this.overlay = this.add
        .container(0, 0, [
          this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.65).setOrigin(0, 0).setInteractive(),
          this.text(cx, 340, 'Defeated', 40, '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
          this.text(cx, 392, `Lives left: ${'♥'.repeat(run.lives)}`, 20, '#ffffff').setOrigin(0.5),
          this.text(cx, 426, 'Rearrange your heroes and try again.', 15, '#c9d1e0').setOrigin(0.5),
          this.button(cx, 500, `Retry round ${run.wave}`, 22, '#2e86de', () => this.scene.restart({ run })),
        ])
        .setDepth(100);
      return;
    }
    let title = win ? 'Victory!' : 'Defeated';
    let sub = `Time ${Math.round(this.battle.time)}s`;
    if (run) {
      clearRun();
      recordRound(run.wave);
      title = 'Your guild has fallen';
      sub = `You reached round ${run.wave}. Best: round ${bestRound()}.`;
    }
    this.overlay = this.add
      .container(0, 0, [
        this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.65).setOrigin(0, 0).setInteractive(),
        this.text(cx, 360, title, 36, win ? '#ffd166' : '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
        this.text(cx, 418, sub, 18, '#c9d1e0').setOrigin(0.5),
        this.button(cx, 500, 'New run', 22, '#2e86de', () => this.scene.restart()),
      ])
      .setDepth(100);
  }

  // --- between rounds -----------------------------------------------------

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
      this.text(cx, 124, `Round ${run.wave} cleared!`, 32, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
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
    const next = Math.ceil((run.wave + 1) / CHOICE_EVERY) * CHOICE_EVERY;
    const countdown = this.text(cx, 470, '', 15, '#8f9bb3').setOrigin(0.5);
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.55).setOrigin(0, 0).setInteractive(),
      this.text(cx, 330, `Round ${run.wave} cleared!`, 34, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.text(cx, 378, `Level up! Everyone is now level ${level}.`, 18, '#ffffff').setOrigin(0.5),
      this.text(cx, 408, needsRecruitAfter(run) ? 'A new hero joins your guild next!' : `Next reward choice after round ${next}`, 13, '#9ad1ff').setOrigin(0.5),
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
