import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { CHOICE_EVERY, WORLD } from '../../sim/content';
import { sound } from '../sound';
import { autoChoose, bestRound, clearRun, completeWave, describeReward, isChoiceWave, loseRound, recordRound, rewardOptions, saveRun, type Reward } from '../../sim/run';
import { COLORS, LETTERS, DARK_LETTER, GOLD, needsRecruitAfter } from '../theme';

/** End-of-round screens: win/lose, rewards and level-ups. */
export class Results {
  constructor(readonly s: BattleScene) {}

  /** Bumped whenever the reward screen changes, to cancel stale timers. */
  rewardToken = 0;

  // --- end of round -------------------------------------------------------

  showEnd(): void {
    const run = this.s.run;
    const win = this.s.battle.outcome === 'victory';
    const cx = WORLD.width / 2;
    if (run && win) {
      recordRound(run.wave);
      sound.play('levelUp');
      if (isChoiceWave(run)) this.showRewards();
      else this.showLevelUp();
      return;
    }
    this.s.state = 'over';
    if (run && loseRound(run)) {
      // A life lost: rearrange and try the same round again.
      saveRun(run);
      this.s.overlay = this.s.add
        .container(0, 0, [
          this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.65).setOrigin(0, 0).setInteractive(),
          this.s.text(cx, 340, 'Defeated', 40, '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
          this.s.text(cx, 392, `Lives left: ${'♥'.repeat(run.lives)}`, 20, '#ffffff').setOrigin(0.5),
          this.s.text(cx, 426, 'Rearrange your heroes and try again.', 15, '#c9d1e0').setOrigin(0.5),
          this.s.button(cx, 500, `Retry round ${run.wave}`, 22, '#2e86de', () => this.s.scene.restart({ run })),
        ])
        .setDepth(100);
      return;
    }
    let title = win ? 'Victory!' : 'Defeated';
    let sub = `Time ${Math.round(this.s.battle.time)}s`;
    if (run) {
      clearRun();
      recordRound(run.wave);
      title = 'Your guild has fallen';
      sub = `You reached round ${run.wave}. Best: round ${bestRound()}.`;
    }
    this.s.overlay = this.s.add
      .container(0, 0, [
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.65).setOrigin(0, 0).setInteractive(),
        this.s.text(cx, 360, title, 36, win ? '#ffd166' : '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
        this.s.text(cx, 418, sub, 18, '#c9d1e0').setOrigin(0.5),
        this.s.button(cx, 500, 'New run', 22, '#2e86de', () => this.s.scene.restart()),
      ])
      .setDepth(100);
  }

  // --- between rounds -----------------------------------------------------

  /**
   * Reward screen: one pick for each hero in turn ("Choose for Warrior, 1 of 4").
   * "Choose for me" turns Auto picks on and picks the rest.
   */
  showRewards(slot = 0, picks: Reward[] = []): void {
    const run = this.s.run!;
    this.s.state = 'reward';
    const token = ++this.rewardToken;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const cls = run.team[slot];
    const hero = this.s.hud.heroInSlot(slot);
    const heroName = hero?.label ?? cls[0].toUpperCase() + cls.slice(1);
    const options = rewardOptions(run, slot);
    const level = run.builds[slot].level;
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.82).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 124, `Round ${run.wave} cleared!`, 32, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 164, `Level up — everyone is now level ${level + 1}`, 15, '#c9d1e0').setOrigin(0.5),
    ];
    // Which hero we're choosing for, with a row of four dots for progress.
    items.push(
      this.s.add.circle(cx - 120, 206, 16, COLORS[cls]).setStrokeStyle(2, 0x111111),
      this.s.text(cx - 120, 206, LETTERS[cls], 14, DARK_LETTER.includes(cls) ? '#222' : '#fff').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx - 96, 196, `Choose for ${heroName}`, 18, '#ffffff').setFontStyle('bold'),
      this.s.text(cx + 150, 198, `${slot + 1} of ${run.team.length}`, 14, '#8f9bb3'),
    );
    const cardBgs: Phaser.GameObjects.Rectangle[] = [];
    options.forEach((opt, i) => {
      const d = describeReward(opt);
      const y = 300 + i * 124;
      const bg = this.s.add.rectangle(cx, y, 470, 108, 0x1c2433).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
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
        this.s.text(cx - 215, y - 40, d.tag, 12, tagColor).setFontStyle('bold'),
        this.s.text(cx - 215, y - 20, d.title, 21, '#ffffff').setFontStyle('bold'),
        this.s.text(cx - 215, y + 10, d.text, 14, '#c9d1e0').setWordWrapWidth(430),
      );
    });
    items.push(
      this.s.button(cx, 686, this.s.auto ? 'Auto picks is choosing…' : 'Choose for me (turns Auto picks on)', 17, '#5a4a1c', () => {
        if (this.rewardToken !== token) return;
        this.s.setAuto(true);
        this.takeReward(picks);
      }),
      this.s.text(cx, 736, 'Turn Auto picks off in the top bar to choose yourself.', 12, '#8f9bb3').setOrigin(0.5),
    );
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
    if (this.s.auto) {
      // Auto picks: show the choice for a moment, then fill in every hero's pick.
      const pick = autoChoose(cls, options);
      this.s.time.delayedCall(250, () => {
        if (this.rewardToken === token) cardBgs[options.indexOf(pick)]?.setStrokeStyle(4, GOLD);
      });
      this.s.time.delayedCall(1500, () => {
        if (this.rewardToken === token && this.s.auto) this.takeReward(picks);
      });
    }
  }

  nextRewardPick(slot: number, picks: Reward[]): void {
    if (slot + 1 < this.s.run!.team.length) this.showRewards(slot + 1, picks);
    else this.takeReward(picks);
  }

  /** Waves without a reward choice: a quick level-up, then on to the next wave. */
  showLevelUp(): void {
    const run = this.s.run!;
    this.s.state = 'reward';
    const token = ++this.rewardToken;
    const cx = WORLD.width / 2;
    const level = run.builds[0].level + 1;
    const next = Math.ceil((run.wave + 1) / CHOICE_EVERY) * CHOICE_EVERY;
    const countdown = this.s.text(cx, 470, '', 15, '#8f9bb3').setOrigin(0.5);
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.55).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 330, `Round ${run.wave} cleared!`, 34, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 378, `Level up! Everyone is now level ${level}.`, 18, '#ffffff').setOrigin(0.5),
      this.s.text(cx, 408, needsRecruitAfter(run) ? 'A new hero joins your guild next!' : `Next reward choice after round ${next}`, 13, '#9ad1ff').setOrigin(0.5),
      countdown,
      this.s.button(cx, 530, 'Continue', 20, '#2e86de', () => {
        if (this.rewardToken === token) this.takeReward(null);
      }),
    ];
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
    let left = 3;
    const tick = () => {
      if (this.rewardToken !== token) return;
      if (left === 0) {
        this.takeReward(null);
        return;
      }
      countdown.setText(`Next wave in ${left}…`);
      left--;
      this.s.time.delayedCall(1000, tick);
    };
    tick();
  }

  /** Apply the picks (missing ones are chosen automatically) and start the next wave. */
  takeReward(picks: Reward[] | null): void {
    const run = this.s.run!;
    this.rewardToken++;
    sound.play('click');
    const chosen = completeWave(run, picks ?? []);
    saveRun(run);
    const names = this.s.battle.heroes.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map((h) => h.label);
    const teamPicks = chosen.length ? 'Rewards: ' + chosen.map((r, i) => `${names[i] ?? run.team[i]} → ${describeReward(r).title}`).join(' · ') : '';
    this.s.scene.restart({ run, teamPicks });
  }
}
