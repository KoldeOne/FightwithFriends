import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { abilityText } from '../../sim/abilityText';
import { ABILITIES, HERO_KIT, PASSIVES, TRAITS, UPGRADE, WORLD } from '../../sim/content';
import { sound } from '../sound';
import {
  ALL_CLASSES,
  autoRecruit,
  bestProgress,
  describeProgress,
  firstAbilityOptions,
  heroLabel,
  loadRun,
  MAX_PARTY,
  newRun,
  RECRUITS,
  recruit,
  saveRun,
  winsSoFar,
  type RunState,
} from '../../sim/run';
import type { AbilityId, HeroClass } from '../../sim/types';
import { loadCamp, saveCamp } from '../../sim/camp';
import { challengeBest, lockedAbilities, relicPool, TIER_LOOT, TIERS } from '../../sim/progress';
import { RELIC_IDS } from '../../sim/relics';

/** Hero slots on the select screen: the playable classes, then silhouettes for heroes still to come. */
const ROSTER = 12;
const GRID = { top: 226, cols: 3, w: 160, h: 100, gap: 6 };

/** The difficulty tier you last chose (kept between visits). */
const TIER_KEY = 'fightwithfriends.tier';
function chosenTier(max: number): number {
  try {
    return Math.min(max, Math.max(0, Number(localStorage.getItem(TIER_KEY)) || 0));
  } catch {
    return 0;
  }
}
function keepTier(t: number): void {
  try {
    localStorage.setItem(TIER_KEY, String(t));
  } catch {
    /* ignore */
  }
}
import { abilityIcon, COLORS, cssColor, DARK_LETTER, ICON_PX, LETTERS, passiveIcon, spriteKey, spriteOriginY, traitIcon } from '../theme';

/** Choosing a hero: the starting hero of a run, and recruits at the first campsites. Both pick a class, then its first ability. */
export class HeroPicker {
  constructor(readonly s: BattleScene) {}

  /** Start of a run: continue a saved run, or choose your first hero. */
  showStart(): void {
    this.s.state = 'title';
    const records = loadCamp().records;
    this.chooseClass('Choose your hero', 'You start alone. More heroes join mid-Act 1, after the Act 1 boss and mid-Act 2 (a party of 4).', (cls) =>
      this.chooseAbility(cls, 'start', lockedAbilities(records), (first) => {
        const camp = loadCamp();
        this.begin(newRun(cls, first, undefined, { tier: chosenTier(camp.records.tier), perks: camp.records.perks, locked: lockedAbilities(camp.records), relicPool: relicPool(camp.records) }));
      }),
    );
  }

  /**
   * A Random Challenge: a random hero (drawn like a slot machine: the heroes
   * flick past fast, slow down and stop) on a fresh map. Every ability is
   * open, but there's no camp gear or perks, and it doesn't count toward tiers,
   * unlocks or your normal best. Loot still comes home. Back and try again to
   * draw another hero.
   */
  showChallenge(): void {
    const s = this.s;
    const cls = ALL_CLASSES[Math.floor(Math.random() * ALL_CLASSES.length)];
    const best = challengeBest();
    const cx = WORLD.width / 2;
    const cy = 420;
    const box = s.add.container(0, 0).setDepth(170);
    box.add([
      s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.75).setOrigin(0, 0).setInteractive(),
      s.add.rectangle(cx, cy, 440, 420, 0x111723).setStrokeStyle(2, 0x9a7ad6),
      s.text(cx, cy - 186, '🎲 Random Challenge', 22, '#d7c2ff').setOrigin(0.5).setFontStyle('bold'),
      s.add.rectangle(cx, cy - 50, 150, 150, 0x0b0e14).setStrokeStyle(3, 0x5a3f8a),
    ]);
    const status = s.text(cx, cy - 158, 'Drawing your starting hero…', 12, '#c9d1e0').setOrigin(0.5);
    box.add(status);
    const nameText = s.text(cx, cy + 40, '', 20, '#ffffff').setOrigin(0.5).setFontStyle('bold');
    box.add(nameText);
    let shown: Phaser.GameObjects.GameObject[] = [];
    const showHero = (c: HeroClass) => {
      for (const o of shown) o.destroy();
      shown = this.portrait(c, cx, cy + 10, 3.2);
      box.add(shown);
      nameText.setText(c[0].toUpperCase() + c.slice(1)).setColor(cssColor(COLORS[c]));
    };
    // The delays grow until the draw stops; start where it will land on the drawn class.
    const delays: number[] = [];
    for (let d = 45; d < 420; d *= 1.12) delays.push(d);
    const pool = ALL_CLASSES;
    let i = (pool.indexOf(cls) - delays.length + pool.length * 10) % pool.length;
    showHero(pool[i]);
    let step = 0;
    const next = () => {
      if (!box.active) return;
      if (step >= delays.length) return reveal();
      s.time.delayedCall(delays[step++], () => {
        if (!box.active) return;
        i = (i + 1) % pool.length;
        showHero(pool[i]);
        sound.play('click');
        next();
      });
    };
    const reveal = () => {
      sound.play('levelUp');
      status.setText('Your hero').setColor('#ffd166');
      s.cameras.main.flash(160, 220, 200, 255);
      for (const o of shown) s.tweens.add({ targets: o, scale: (o as Phaser.GameObjects.Image).scale * 1.15, duration: 160, yoyo: true });
      box.add([
        s.text(cx, cy + 74, `A random hero and a fresh map. Every ability is open, but no camp gear or perks, and it doesn't count toward tiers or unlocks. Loot still comes home.${best ? `\nBest challenge: ${describeProgress(best.reached)}.` : ''}`, 12, '#c9d1e0')
          .setOrigin(0.5, 0)
          .setAlign('center')
          .setWordWrapWidth(400),
        s.button(cx - 90, cy + 170, 'Back', 16, '#3a4660', () => box.destroy()),
        s.button(cx + 90, cy + 170, 'Play ▶', 16, '#5a3f8a', () => {
          box.destroy();
          this.chooseAbility(cls, 'challenge', [], (first) => this.begin(newRun(cls, first, undefined, { challenge: true, relicPool: [...RELIC_IDS] })));
        }),
      ]);
    };
    next();
  }

  /** Start a fresh run (asking first if it would replace a saved one). */
  private begin(run: RunState): void {
    const go = () => {
      sound.unlock();
      const camp = loadCamp();
      camp.runs += 1;
      saveCamp(camp);
      saveRun(run);
      this.s.scene.restart({ run });
    };
    const saved = loadRun();
    if (saved) this.s.confirm('Start a new run?', `Your saved run (Act ${saved.act}) will be lost. Its camp loot is already safe at the camp.`, 'Start new', go);
    else go();
  }

  /** A recruit campsite: someone wants to join. */
  showRecruit(): void {
    const run = this.s.run!;
    this.s.state = 'choice';
    const n = run.team.length;
    this.chooseClass(
      'A new hero joins',
      `Recruit ${n} of ${RECRUITS} (party ${n} → ${n + 1} of ${MAX_PARTY}). They start at level ${run.baseLevel}; leveling gets slower the higher you are, so they close the gap over time.`,
      (cls) =>
        this.chooseAbility(cls, 'recruit', run.locked, (first) => {
          recruit(run, cls, first);
          saveRun(run);
          this.s.scene.restart({ run });
        }),
    );
    if (this.s.auto) {
      const token = this.s.overlay;
      this.s.time.delayedCall(900, () => {
        if (this.s.overlay !== token || run.pending?.kind !== 'recruit') return;
        const r = autoRecruit(run);
        recruit(run, r.cls, r.first);
        saveRun(run);
        this.s.scene.restart({ run });
      });
    }
  }

  private chooseClass(title: string, sub: string, onPick: (cls: HeroClass) => void): void {
    this.hideHeroDetails();
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.96).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 128, title, 28, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 168, sub, 13, '#c9d1e0').setOrigin(0.5).setAlign('center').setWordWrapWidth(470),
    ];
    if (this.s.state === 'title') {
      const saved = loadRun();
      if (saved) {
        const names = saved.team.map((c) => LETTERS[c]).join(' ');
        items.push(this.s.button(cx, 68, `▶ Continue: ${names} — Act ${saved.act}`, 16, '#1e6f50', () => this.s.scene.restart({ run: saved })));
      }
      // The Camp and the Random Challenge, side by side and the same size.
      items.push(
        this.s.button(cx - 104, WORLD.height - 62, '⛺ The Camp', 18, '#6b4f2a', () => {
          sound.unlock();
          sound.play('click');
          this.s.campScreen.show();
        }).setMinWidth(190),
        this.s.button(cx + 104, WORLD.height - 62, '🎲 Challenge', 18, '#5a3f8a', () => {
          sound.unlock();
          sound.play('click');
          this.showChallenge();
        }).setMinWidth(190),
        ...this.tierPicker(),
      );
      const wins = winsSoFar();
      items.push(this.s.text(cx, 206, `Best: ${describeProgress(bestProgress())}${wins ? ` · Wins: ${wins}` : ''}`, 12, '#ffd166').setOrigin(0.5));
    }
    items.push(
      ...this.classCards(
        GRID.top,
        (cls) => {
          sound.play('click');
          onPick(cls);
        },
      ),
    );
    // Recruits see the party they're joining; the title screen doesn't need it.
    if (this.s.state !== 'title') items.push(...this.partyStrip(this.s.run!));
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  /** Step two: the hero's first ability (any active from its pool). */
  private chooseAbility(cls: HeroClass, mode: 'start' | 'recruit' | 'challenge', locked: string[], onPick: (id: AbilityId) => void): void {
    this.hideHeroDetails();
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const name = cls[0].toUpperCase() + cls.slice(1);
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.96).setOrigin(0, 0).setInteractive(),
      ...this.portrait(cls, cx, 150, 2),
      this.s.text(cx, 168, `${name}'s first ability`, 24, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 198, `${PASSIVES[HERO_KIT[cls].passive].name} (always on): ${PASSIVES[HERO_KIT[cls].passive].short} More abilities come from training and shops.`, 12, '#9ad1ff')
        .setOrigin(0.5, 0)
        .setAlign('center')
        .setWordWrapWidth(470),
    ];
    const options = firstAbilityOptions(cls, locked);
    const cardH = 66;
    options.forEach((id, i) => {
      const def = ABILITIES[id];
      const y = 262 + i * (cardH + 6);
      const bg = this.s.add
        .rectangle(cx, y, 480, cardH, 0x1c2433)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x26314a))
        .on('pointerout', () => bg.setFillStyle(0x1c2433))
        .on('pointerdown', () => {
          sound.play('click');
          onPick(id);
        });
      const left = cx - 228;
      items.push(
        bg,
        this.s.add.image(left, y - 13, abilityIcon(id)).setOrigin(0, 0.5).setScale(28 / ICON_PX),
        this.s.text(left + 38, y - 26, def.name, 16, '#ffffff').setFontStyle('bold'),
        this.s.text(left + 38, y - 6, abilityText({ level: 1 }, { id }), 12, '#c9d1e0').setWordWrapWidth(400),
        this.s.text(left + 230, y - 24, `${def.cost ? `${def.cost} ${HERO_KIT[cls].resource}` : 'free'} · ${def.cooldown}s`, 11, '#8f9bb3'),
      );
    });
    items.push(this.s.button(cx, 262 + options.length * (cardH + 6) + 14, '← Back', 15, '#2b3445', () => (mode === 'recruit' ? this.showRecruit() : this.showStart())));
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  /**
   * The party at the bottom of the hero select: the heroes you have, then the
   * empty slots up to the party size (the next one marked). Hover or tap a hero
   * for their details and abilities.
   */
  private partyStrip(run?: RunState): Phaser.GameObjects.GameObject[] {
    const team = run?.team ?? [];
    const top = 700;
    const w = 120;
    const h = 74;
    const gap = (WORLD.width - 24 - MAX_PARTY * w) / (MAX_PARTY - 1);
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.text(12, top - 24, `Your party (${team.length} of ${MAX_PARTY})`, 13, '#ffd166').setFontStyle('bold'),
    ];
    for (let slot = 0; slot < MAX_PARTY; slot++) {
      const x = 12 + slot * (w + gap);
      const cls = team[slot];
      const next = slot === team.length;
      const bg = this.s.add.rectangle(x, top, w, h, cls ? 0x1c2433 : 0x10141d).setOrigin(0, 0).setStrokeStyle(2, next ? 0xffd166 : cls ? 0x3a4660 : 0x232b3a);
      items.push(bg);
      if (!cls || !run) {
        items.push(this.s.text(x + w / 2, top + h / 2, next ? (team.length ? 'Joins here' : 'Your hero') : 'Empty', 12, next ? '#ffd166' : '#4a5570').setOrigin(0.5));
        continue;
      }
      const b = run.builds[slot];
      items.push(...this.portrait(cls, x + 22, top + h - 8, 1.25));
      items.push(this.s.text(x + 44, top + 6, heroLabel(run, slot), 12, cssColor(COLORS[cls])).setFontStyle('bold'));
      items.push(this.s.text(x + 44, top + 22, `Lv ${b.level}`, 11, '#c9d1e0'));
      [...b.abilities.map((a) => abilityIcon(a.id)), ...b.traits.map((t) => traitIcon(t))].forEach((key, j) =>
        items.push(this.s.add.image(x + 44 + (j % 4) * 18, top + 40 + Math.floor(j / 4) * 18, key).setOrigin(0, 0).setScale(16 / ICON_PX)),
      );
      // Details on hover (mouse) or tap (touch: tap again to close).
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', (p: Phaser.Input.Pointer) => !p.wasTouch && this.showHeroDetails(run, slot));
      bg.on('pointerout', (p: Phaser.Input.Pointer) => !p.wasTouch && this.hideHeroDetails());
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch && this.detailsFor === slot) this.hideHeroDetails();
        else if (this.detailsFor !== slot) this.showHeroDetails(run, slot);
      });
    }
    return items;
  }

  private details?: Phaser.GameObjects.Container;
  private detailsFor?: number;

  /** A party member's details: level, health, passive, abilities (with their numbers) and passive picks. */
  private showHeroDetails(run: RunState, slot: number): void {
    this.hideHeroDetails();
    this.detailsFor = slot;
    const cls = run.team[slot];
    const b = run.builds[slot];
    const kit = HERO_KIT[cls];
    const stats = { level: b.level, might: 1 + UPGRADE.mightPerRank * (b.might ?? 0) };
    const rows: { icon: string; title: string; text: string }[] = [
      { icon: passiveIcon(kit.passive), title: `${PASSIVES[kit.passive].name} (always on)`, text: PASSIVES[kit.passive].description },
      ...b.abilities.map((a) => {
        const def = ABILITIES[a.id];
        const ups = [a.mastery ? def.mastery.name : '', a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(', ');
        return {
          icon: abilityIcon(a.id),
          title: `${def.name}${ups ? ` (${ups})` : ''} · ${def.cost ? `${def.cost} ${kit.resource}` : 'free'} · ${def.cooldown}s`,
          text: abilityText(stats, a),
        };
      }),
      ...b.traits.map((t) => ({ icon: traitIcon(t), title: `${TRAITS[t].name} (passive)`, text: TRAITS[t].description })),
    ];
    const left = 22;
    const width = WORLD.width - 44;
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = 44;
    const head = this.s.text(left + 12, 0, `${heroLabel(run, slot)} · level ${b.level} · ${kit.role}`, 15, cssColor(COLORS[cls])).setFontStyle('bold');
    const texts: Phaser.GameObjects.GameObject[] = [head];
    for (const r of rows) {
      const t1 = this.s.text(left + 40, y, r.title, 12, '#ffffff').setFontStyle('bold').setWordWrapWidth(width - 52);
      const t2 = this.s.text(left + 40, y + t1.height + 2, r.text, 11, '#c9d1e0').setWordWrapWidth(width - 52);
      texts.push(this.s.add.image(left + 12, y, r.icon).setOrigin(0, 0).setScale(20 / ICON_PX), t1, t2);
      y += t1.height + t2.height + 12;
    }
    // Sit just above the party strip.
    const height = y + 4;
    const top = 690 - height;
    for (const o of texts) (o as Phaser.GameObjects.Image).y += top + 12;
    head.y = top + 12;
    items.push(this.s.add.rectangle(left, top, width, height, 0x0b0e14, 0.97).setOrigin(0, 0).setStrokeStyle(2, COLORS[cls]), ...texts);
    this.details = this.s.add.container(0, 0, items).setDepth(110);
  }

  private hideHeroDetails(): void {
    this.details?.destroy();
    this.details = undefined;
    this.detailsFor = undefined;
  }

  /** A class's sprite (or its coloured letter disc if there's no sprite), feet at y. */
  portrait(cls: HeroClass, x: number, y: number, scale: number): Phaser.GameObjects.GameObject[] {
    const key = spriteKey({ side: 'hero', kind: cls });
    if (this.s.textures.exists(key)) {
      this.s.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const img = this.s.add.image(x, y, key).setScale(scale);
      return [img.setOrigin(0.5, spriteOriginY(key, img.height))];
    }
    return [
      this.s.add.circle(x, y - 16, 16, COLORS[cls]).setStrokeStyle(2, 0x111111),
      this.s.text(x, y - 16, LETTERS[cls], 15, DARK_LETTER.includes(cls) ? '#222' : '#fff').setOrigin(0.5).setFontStyle('bold'),
    ];
  }

  /** The difficulty tier for the next run: ◀ Tier ▶, with what it adds. Tiers open by winning on the one below. */
  private tierPicker(): Phaser.GameObjects.GameObject[] {
    const max = loadCamp().records.tier;
    const cx = WORLD.width / 2;
    const y = 690;
    let tier = chosenTier(max);
    const label = this.s.text(cx, y, '', 16, '#ffffff').setOrigin(0.5).setFontStyle('bold');
    const rule = this.s.text(cx, y + 22, '', 11, '#c9d1e0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(460);
    const show = () => {
      label.setText(`Difficulty: ${TIERS[tier].name}`).setColor(tier ? '#ff9f6b' : '#ffffff');
      rule.setText(
        tier
          ? `${TIERS[tier].rule}${tier > 1 ? ' (and every tier below)' : ''} · +${Math.round(TIER_LOOT * tier * 100)}% camp loot`
          : max
            ? 'The standard run. Use the arrows for harder tiers.'
            : `The standard run. Win a run to unlock ${TIERS[1].name}.`,
      );
    };
    const arrow = (dx: number, text: string) =>
      this.s.text(cx + dx, y, text, 18, '#ffd166')
        .setOrigin(0.5)
        .setPadding(10, 2, 10, 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sound.play('click');
          tier = Math.min(max, Math.max(0, tier + Math.sign(dx)));
          keepTier(tier);
          show();
        });
    show();
    return max ? [arrow(-150, '◀'), arrow(150, '▶'), label, rule] : [label, rule];
  }

  /**
   * Every hero slot in a grid: the playable classes, then silhouettes with a
   * question mark for the heroes still to come (ROSTER in total). Tap a hero to
   * pick it.
   */
  classCards(top: number, onPick: (cls: HeroClass) => void): Phaser.GameObjects.GameObject[] {
    const items: Phaser.GameObjects.GameObject[] = [];
    const left = (WORLD.width - (GRID.cols * GRID.w + (GRID.cols - 1) * GRID.gap)) / 2;
    for (let i = 0; i < ROSTER; i++) {
      const x = left + (i % GRID.cols) * (GRID.w + GRID.gap);
      const y = top + Math.floor(i / GRID.cols) * (GRID.h + GRID.gap);
      const cls = ALL_CLASSES[i];
      const bg = this.s.add.rectangle(x, y, GRID.w, GRID.h, cls ? 0x1c2433 : 0x121722).setOrigin(0, 0).setStrokeStyle(2, cls ? 0x3a4660 : 0x232b3a);
      items.push(bg);
      if (!cls) {
        // A hero still to come.
        const g = this.s.add.graphics({ x: x + GRID.w / 2, y: y + 46 });
        g.fillStyle(0x2a3142).fillCircle(0, -20, 11).fillRoundedRect(-14, -8, 28, 30, 6).fillRect(-20, -4, 6, 18).fillRect(14, -4, 6, 18);
        items.push(
          g,
          this.s.text(x + GRID.w / 2, y + 30, '?', 26, '#5a6680').setOrigin(0.5).setFontStyle('bold'),
          this.s.text(x + GRID.w / 2, y + GRID.h - 18, 'Coming soon', 11, '#4a5570').setOrigin(0.5),
        );
        continue;
      }
      const kit = HERO_KIT[cls];
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x26314a).setStrokeStyle(2, COLORS[cls]))
        .on('pointerout', () => bg.setFillStyle(0x1c2433).setStrokeStyle(2, 0x3a4660))
        .on('pointerdown', () => onPick(cls));
      items.push(
        ...this.portrait(cls, x + 32, y + 62, 1.6),
        this.s.text(x + 60, y + 10, cls[0].toUpperCase() + cls.slice(1), 16, cssColor(COLORS[cls])).setFontStyle('bold'),
      );
      const role = this.s.text(x + 60, y + 30, kit.role.split(' — ')[0], 11, '#c9d1e0').setWordWrapWidth(GRID.w - 66);
      items.push(role, this.s.text(x + 60, y + 34 + role.height, PASSIVES[kit.passive].name, 11, '#9ad1ff').setWordWrapWidth(GRID.w - 66));
    }
    return items;
  }
}
