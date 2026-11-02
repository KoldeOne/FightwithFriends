import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { ABILITIES, DEFAULT_TEAM, HERO_KIT, partySize, PASSIVES, WORLD } from '../../sim/content';
import { sound } from '../sound';
import { ALL_CLASSES, bestRound, loadRun, newRun, recruit, saveRun } from '../../sim/run';
import { type HeroClass } from '../../sim/types';
import { COLORS, LETTERS, DARK_LETTER, spriteKey, spriteOriginY } from '../theme';

/** Team builder and recruit screens. */
export class TeamScreens {
  constructor(readonly s: BattleScene) {}

  // --- hero select ----------------------------------------------------------

  /** Pick the starting three: tap classes to fill the slots, tap a slot to empty it. */
  showTeamBuilder(team: HeroClass[] = []): void {
    this.s.overlay?.destroy();
    const size = partySize(1);
    const cx = WORLD.width / 2;
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.8).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 128, 'Build your guild', 32, '#ffffff').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 164, `Pick ${size} heroes. A 4th joins after the round 10 boss, a 5th after round 20.`, 13, '#c9d1e0')
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(480),
    ];
    const saved = loadRun();
    if (saved) {
      const names = saved.team.map((c) => LETTERS[c]).join(' ');
      items.push(
        this.s.button(cx, 68, `▶ Continue: ${names} — round ${saved.wave}, ${'♥'.repeat(saved.lives)}`, 16, '#1e6f50', () => this.s.scene.restart({ run: saved })),
      );
    }
    const best = bestRound();
    if (best) items.push(this.s.text(cx, 186, `Best: round ${best}`, 12, '#ffd166').setOrigin(0.5));

    // The team slots.
    const slotW = 120;
    const slotY = 226;
    for (let i = 0; i < size; i++) {
      const x = cx + (i - (size - 1) / 2) * (slotW + 10);
      const cls = team[i];
      const bg = this.s.add
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
          ...this.portrait(cls, x, slotY + 8, 1.2),
          this.s.text(x, slotY + 22, cls[0].toUpperCase() + cls.slice(1), 12, '#ffffff').setOrigin(0.5),
        );
      } else {
        items.push(this.s.text(x, slotY, `Slot ${i + 1}`, 13, '#5d6880').setOrigin(0.5));
      }
    }
    items.push(this.s.text(cx, slotY + 44, 'Tap a filled slot to remove it. Classes can repeat.', 11, '#8f9bb3').setOrigin(0.5));

    items.push(
      ...this.classCards(314, (cls) => {
        if (team.length >= size) return;
        this.showTeamBuilder([...team, cls]);
      }),
    );

    // Classic team shortcut and Start.
    items.push(
      this.s.text(cx, 748, 'Tip: a classic start is a tank, a healer and a damage dealer.', 12, '#8f9bb3').setOrigin(0.5),
      this.s.button(cx - 120, 790, 'Classic team', 16, '#2b3445', () => {
        sound.play('click');
        this.showTeamBuilder([...DEFAULT_TEAM]);
      }),
    );
    const ready = team.length === size;
    const start = this.s.button(cx + 110, 790, ready ? 'Start run ▶' : `Pick ${size - team.length} more`, 18, ready ? '#2e86de' : '#2b3445', () => {
      if (!ready) return;
      sound.unlock();
      sound.play('click');
      const run = newRun(team);
      saveRun(run);
      this.s.scene.restart({ run });
    });
    items.push(start);
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  /** One card per class, stacked from `top`; tapping a card calls `onPick`. */
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
    // Six classes have to fit between the slots and the buttons.
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
        .on('pointerdown', () => {
          sound.play('click');
          onPick(cls);
        });
      const left = cx - 225;
      items.push(
        bg,
        ...this.portrait(cls, left + 30, y + 30, 1.65),
        this.s.text(left + 64, y - 29, cls[0].toUpperCase() + cls.slice(1), 17, '#ffffff').setFontStyle('bold'),
        this.s.text(left + 150, y - 26, kit.role, 11, '#c9d1e0'),
        this.s.text(left + 64, y - 6, `Starts with: ${ABILITIES[kit.starting].name}`, 12, '#ffd166'),
        this.s.text(left + 64, y + 12, `Passive: ${PASSIVES[kit.passive].name} — ${PASSIVES[kit.passive].short}`, 11, '#9ad1ff'),
      );
    });
    return items;
  }

  /** After a boss: pick a class to join the party. */
  showRecruit(): void {
    const run = this.s.run!;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const level = Math.max(...run.builds.map((b) => b.level));
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.85).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 130, 'Your guild grows!', 32, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 172, `Choose hero ${run.team.length + 1}. From now on the enemy fields ${partySize(run.wave)} fighters too.`, 14, '#ffffff')
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(480),
      this.s.text(cx, 204, `They join at level ${level}, with rewards picked for them so far.`, 12, '#8f9bb3').setOrigin(0.5),
      this.s.text(cx, 236, `Your party: ${run.team.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ')}`, 13, '#c9d1e0').setOrigin(0.5),
      ...this.classCards(320, (cls) => {
        recruit(run, cls);
        saveRun(run);
        this.s.scene.restart({ run, teamPicks: `${cls[0].toUpperCase() + cls.slice(1)} joins the guild!` });
      }),
    ];
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }
}
