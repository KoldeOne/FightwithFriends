import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { CAMP, CHOICE_EVERY, WORLD } from '../../sim/content';
import { sound } from '../sound';
import { autoChoose, bestRound, clearRun, completeWave, describeReward, isChoiceWave, loseRound, recordRound, rewardOptions, rewardPreview, saveRun, type Reward } from '../../sim/run';
import { bankRound, campRunOver, emptyLoot, loadCamp, lootFor, lootText, saveCamp } from '../../sim/camp';
import { COLORS, LETTERS, DARK_LETTER, GOLD, needsRecruitAfter, abilityIcon, traitIcon, ICON_PX } from '../theme';

/** The icon for a reward card: the ability it adds or upgrades, the passive, or a stat. */
function rewardIcon(r: Reward): string | undefined {
  switch (r.kind) {
    case 'ability':
    case 'mastery':
    case 'power':
    case 'haste':
      return abilityIcon(r.id);
    case 'trait':
      return traitIcon(r.id);
    case 'vitality':
      return 'icon-ef-fortitude';
    case 'might':
      return 'icon-ef-empower';
    case 'focus':
      return 'icon-tr-arcaneSurge';
  }
}

/** End-of-round screens: win/lose, rewards and level-ups. */
export class Results {
  constructor(readonly s: BattleScene) {}

  /** Bumped whenever the reward screen changes, to cancel stale timers. */
  rewardToken = 0;

  // --- end of round -------------------------------------------------------

  /** Camp Mode: this round's loot (already banked at the camp), shown on the next screens. */
  roundLoot = '';

  showEnd(): void {
    const run = this.s.run;
    const win = this.s.battle.outcome === 'victory';
    const cx = WORLD.width / 2;
    if (run?.mode === 'camp') {
      // Loot goes home straight away, win or lose.
      const camp = loadCamp();
      const loot = lootFor(this.s.battle.kills, run.wave, run.seed + run.wave);
      bankRound(camp, run, loot, win);
      saveCamp(camp);
      this.roundLoot = `Loot: ${lootText(loot)}`;
      if (campRunOver(run, win)) {
        this.showCampEnd(win);
        return;
      }
      saveRun(run);
    }
    if (run && win) {
      if (run.mode !== 'camp') recordRound(run.wave);
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
          this.s.text(cx, 426, 'Try the round again: rewards and levels are kept.', 15, '#c9d1e0').setOrigin(0.5),
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
        // Pass data — restart() with no data would reuse the finished run's data.
        this.s.button(cx, 500, 'New run', 22, '#2e86de', () => this.s.scene.restart({ screen: 'arena' })),
      ])
      .setDepth(100);
  }

  /** Camp Mode: the run is over (a defeat, or the final round beaten). Everything looted is already home. */
  showCampEnd(win: boolean): void {
    const run = this.s.run!;
    const cx = WORLD.width / 2;
    this.s.state = 'over';
    clearRun('camp');
    sound.play(win ? 'levelUp' : 'click');
    const title = win ? `Round ${CAMP.finalRound} beaten!` : 'Your party has fallen';
    this.s.overlay = this.s.add
      .container(0, 0, [
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.7).setOrigin(0, 0).setInteractive(),
        this.s.text(cx, 320, title, 34, win ? '#ffd166' : '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
        this.s.text(cx, 370, win ? 'Camp Mode cleared (for now).' : `The run ended at round ${run.wave} (started at round ${run.startRound ?? 1}).`, 16, '#ffffff').setOrigin(0.5),
        this.s.text(cx, 408, `Brought home: ${lootText(run.loot ?? emptyLoot())}`, 14, '#ffd166').setOrigin(0.5).setAlign('center').setWordWrapWidth(470),
        this.s.text(cx, 446, 'Spend it at the camp, then go again.', 13, '#c9d1e0').setOrigin(0.5),
        this.s.button(cx, 520, 'Return to camp', 22, '#2e86de', () => this.s.scene.restart({ screen: 'camp' })),
      ])
      .setDepth(100);
  }

  // --- between rounds -----------------------------------------------------

  /**
   * Reward screen: one pick for each hero in turn ("Choose for Warrior, 1 of 4").
   * "Choose for me" turns Auto on and picks the rest.
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
      const y = 290 + i * 148;
      const bg = this.s.add.rectangle(cx, y, 480, 142, 0x1c2433).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
      const tagColor = d.tag === 'UPGRADE' ? '#9ad1ff' : d.tag === 'NEW PASSIVE' ? '#b57bff' : '#7dff9b';
      bg.on('pointerover', () => bg.setFillStyle(0x26314a));
      bg.on('pointerout', () => bg.setFillStyle(0x1c2433));
      bg.on('pointerdown', () => {
        if (this.rewardToken !== token) return;
        sound.play('click');
        this.nextRewardPick(slot, [...picks, opt]);
      });
      cardBgs.push(bg);
      // Icon on the left; then what it is, what it does, and its numbers: "Now" and "After" for upgrades.
      const icon = rewardIcon(opt);
      const hasIcon = !!icon && this.s.textures.exists(icon);
      const left = cx - 225 + (hasIcon ? 40 : 0);
      const wrap = 450 - (hasIcon ? 40 : 0);
      const top = y - 64;
      const preview = rewardPreview(run, slot, opt);
      const tag = this.s.text(left, top, d.tag, 11, tagColor).setFontStyle('bold');
      const title = this.s.text(left, top + 14, d.title, 18, '#ffffff').setFontStyle('bold');
      // A new ability: its real numbers. Anything else: what it does.
      const desc = this.s.text(left, top + 38, opt.kind === 'ability' && preview ? preview.after : d.text, 13, '#c9d1e0').setWordWrapWidth(wrap);
      items.push(bg, tag, title, desc);
      // (After the card background, so it draws on top of it.)
      if (hasIcon) items.push(this.s.add.image(cx - 225, top + 6, icon!).setOrigin(0, 0).setScale(30 / ICON_PX));
      let ny = top + 38 + desc.height + 5;
      if (preview && opt.kind !== 'ability') {
        const now = this.s.text(left, ny, `Now: ${preview.now ?? '—'}`, 12, '#9aa5b8').setWordWrapWidth(wrap);
        ny += now.height + 2;
        const after = this.s.text(left, ny, `After: ${preview.after}`, 12, '#ffd166').setWordWrapWidth(wrap);
        items.push(now, after);
      }
    });
    items.push(
      this.s.button(cx, 712, this.s.auto ? 'Auto is choosing…' : 'Choose for me (turns Auto on)', 17, '#5a4a1c', () => {
        if (this.rewardToken !== token) return;
        this.s.setAuto(true);
        this.takeReward(picks);
      }),
      this.s.text(cx, 756, 'Turn Auto off in the top bar to choose yourself.', 12, '#8f9bb3').setOrigin(0.5),
    );
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
    if (this.s.auto) {
      // Auto: show the choice for a moment, then fill in every hero's pick.
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
      this.s.text(cx, 434, this.roundLoot, 14, '#ffd166').setOrigin(0.5),
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
    const rewards = chosen.length ? 'Rewards: ' + chosen.map((r, i) => `${names[i] ?? run.team[i]} → ${describeReward(r).title}`).join(' · ') : '';
    const teamPicks = [this.roundLoot, rewards].filter(Boolean).join('\n');
    this.s.scene.restart({ run, teamPicks });
  }
}
