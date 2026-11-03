import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { abilityText } from '../../sim/abilityText';
import { ABILITIES, HERO_KIT, PASSIVES, WORLD } from '../../sim/content';
import { sound } from '../sound';
import {
  ALL_CLASSES,
  autoRecruit,
  bestProgress,
  describeProgress,
  firstAbilityOptions,
  loadRun,
  MAX_PARTY,
  newRun,
  RECRUIT_CAMPSITES,
  recruit,
  saveRun,
  winsSoFar,
} from '../../sim/run';
import type { AbilityId, HeroClass } from '../../sim/types';
import { loadCamp, saveCamp, startLevel } from '../../sim/camp';
import { abilityIcon, COLORS, DARK_LETTER, ICON_PX, LETTERS, spriteKey, spriteOriginY } from '../theme';

/** Choosing a hero: the starting hero of a run, and recruits at the first campsites. Both pick a class, then its first ability. */
export class HeroPicker {
  constructor(readonly s: BattleScene) {}

  /** Start of a run: continue a saved run, or choose your first hero. */
  showStart(): void {
    this.s.state = 'title';
    this.chooseClass('Choose your hero', 'You start alone. The first three campsites you reach each bring a new hero to your party (up to 4).', (cls) =>
      this.chooseAbility(cls, 'start', (first) => {
        sound.unlock();
        const camp = loadCamp();
        const run = newRun(cls, first, undefined, startLevel(camp));
        camp.runs += 1;
        saveCamp(camp);
        saveRun(run);
        this.s.scene.restart({ run });
      }),
    );
  }

  /** A recruit campsite: someone wants to join. */
  showRecruit(): void {
    const run = this.s.run!;
    this.s.state = 'choice';
    const n = run.team.length;
    this.chooseClass(
      'Campsite: a new hero joins',
      `Recruit ${n} of ${RECRUIT_CAMPSITES} (party ${n} → ${n + 1} of ${MAX_PARTY}). They start at level ${run.baseLevel} and earn double XP until they catch up.`,
      (cls) =>
        this.chooseAbility(cls, 'recruit', (first) => {
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
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.85).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 128, title, 28, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 168, sub, 13, '#c9d1e0').setOrigin(0.5).setAlign('center').setWordWrapWidth(470),
    ];
    if (this.s.state === 'title') {
      const saved = loadRun();
      if (saved) {
        const names = saved.team.map((c) => LETTERS[c]).join(' ');
        items.push(this.s.button(cx + 50, 68, `▶ Continue: ${names} — Act ${saved.act}`, 16, '#1e6f50', () => this.s.scene.restart({ run: saved })));
      }
      items.push(
        this.s.button(saved ? 62 : cx, saved ? 68 : 70, '⛺ The Camp', 15, '#6b4f2a', () => {
          sound.unlock();
          sound.play('click');
          this.s.campScreen.show();
        }),
      );
      const wins = winsSoFar();
      items.push(this.s.text(cx, 206, `Best: ${describeProgress(bestProgress())}${wins ? ` · Wins: ${wins}` : ''}`, 12, '#ffd166').setOrigin(0.5));
    } else {
      const party = this.s.run!.team.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ');
      items.push(this.s.text(cx, 206, `Your party: ${party}`, 12, '#ffd166').setOrigin(0.5));
    }
    items.push(...this.classCards(270, (cls) => {
      sound.play('click');
      onPick(cls);
    }));
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  /** Step two: the hero's first ability (its usual opener, or any active from its pool). */
  private chooseAbility(cls: HeroClass, mode: 'start' | 'recruit', onPick: (id: AbilityId) => void): void {
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const name = cls[0].toUpperCase() + cls.slice(1);
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.88).setOrigin(0, 0).setInteractive(),
      ...this.portrait(cls, cx, 150, 2),
      this.s.text(cx, 168, `${name}'s first ability`, 24, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 198, `${PASSIVES[HERO_KIT[cls].passive].name} (always on): ${PASSIVES[HERO_KIT[cls].passive].short} More abilities come from training and shops.`, 12, '#9ad1ff')
        .setOrigin(0.5, 0)
        .setAlign('center')
        .setWordWrapWidth(470),
    ];
    const options = firstAbilityOptions(cls);
    const cardH = 66;
    options.forEach((id, i) => {
      const def = ABILITIES[id];
      const y = 262 + i * (cardH + 6);
      const usual = id === HERO_KIT[cls].starting;
      const bg = this.s.add
        .rectangle(cx, y, 480, cardH, usual ? 0x22304a : 0x1c2433)
        .setStrokeStyle(2, usual ? 0xffd166 : 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x26314a))
        .on('pointerout', () => bg.setFillStyle(usual ? 0x22304a : 0x1c2433))
        .on('pointerdown', () => {
          sound.play('click');
          onPick(id);
        });
      const left = cx - 228;
      items.push(
        bg,
        this.s.add.image(left, y - 13, abilityIcon(id)).setOrigin(0, 0.5).setScale(28 / ICON_PX),
        this.s.text(left + 38, y - 26, `${def.name}${usual ? '  (usual)' : ''}`, 16, '#ffffff').setFontStyle('bold'),
        this.s.text(left + 38, y - 6, abilityText({ level: 1 }, { id }), 12, '#c9d1e0').setWordWrapWidth(400),
        this.s.text(left + 230, y - 24, `${def.cost ? `${def.cost} ${HERO_KIT[cls].resource}` : 'free'} · ${def.cooldown}s`, 11, '#8f9bb3'),
      );
    });
    items.push(this.s.button(cx, 262 + options.length * (cardH + 6) + 14, '← Back', 15, '#2b3445', () => (mode === 'start' ? this.showStart() : this.showRecruit())));
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
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

  classCards(top: number, onPick: (cls: HeroClass) => void): Phaser.GameObjects.GameObject[] {
    const cx = WORLD.width / 2;
    const cardH = 68;
    const items: Phaser.GameObjects.GameObject[] = [];
    ALL_CLASSES.forEach((cls, i) => {
      const y = top + i * (cardH + 6);
      const kit = HERO_KIT[cls];
      const bg = this.s.add
        .rectangle(cx, y, 470, cardH, 0x1c2433)
        .setStrokeStyle(2, 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x26314a))
        .on('pointerout', () => bg.setFillStyle(0x1c2433))
        .on('pointerdown', () => onPick(cls));
      const left = cx - 225;
      items.push(
        bg,
        ...this.portrait(cls, left + 30, y + 30, 1.65),
        this.s.text(left + 64, y - 29, cls[0].toUpperCase() + cls.slice(1), 17, '#ffffff').setFontStyle('bold'),
        this.s.text(left + 150, y - 26, kit.role, 11, '#c9d1e0'),
        this.s.text(left + 64, y - 6, `Usually starts with: ${ABILITIES[kit.starting].name}`, 12, '#ffd166'),
        this.s.text(left + 64, y + 12, `Passive: ${PASSIVES[kit.passive].name} — ${PASSIVES[kit.passive].short}`, 11, '#9ad1ff'),
      );
    });
    return items;
  }
}
