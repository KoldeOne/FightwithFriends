import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { actDef, ECONOMY } from '../../sim/acts';
import { WORLD } from '../../sim/content';
import { bestProgress, clearRun, currentNode, describeProgress, finishFight, fightSeed, recordProgress, recordWin, saveRun, spoilsLine, type Spoils } from '../../sim/run';
import { addLoot, bankLoot, loadCamp, lootFor, lootText, saveCamp, scaleLoot } from '../../sim/camp';
import type { Loot } from '../../sim/types';
import { sound } from '../sound';
import { ICON_PX } from '../theme';

/** With Auto on: how long the spoils stay up before moving on. */
const SPOILS_MS = 2400;

/** After a fight: the spoils (gold, XP, level-ups), or the end of the run (game over or victory). */
export class Results {
  constructor(readonly s: BattleScene) {}

  /** The fight is over: settle it with the run, then show what happened. */
  finish(): void {
    const run = this.s.run!;
    const won = this.s.battle.outcome === 'victory';
    const fallen = this.s.battle.heroes.filter((h) => !h.alive).map((h) => h.slot ?? 0);
    const node = currentNode(run)!;
    // Camp loot goes home straight away, win or lose.
    const golden = !!node.rich;
    const loot = scaleLoot(lootFor(this.s.battle.kills, run.act, fightSeed(run)), golden ? ECONOMY.richLoot : 1);
    const camp = loadCamp();
    bankLoot(camp, loot);
    saveCamp(camp);
    addLoot(run.loot, loot);
    const spoils = finishFight(run, won, fallen, this.s.battle.kills);
    if (spoils.wished) {
      saveRun(run);
      this.showWish();
      return;
    }
    if (!won) {
      recordProgress(run);
      clearRun();
      this.showGameOver(node.floor + 1, node.type);
      return;
    }
    if (spoils.won) {
      recordProgress(run);
      const wins = recordWin();
      clearRun();
      this.showSpoils(spoils, loot, () => this.showVictory(wins));
      return;
    }
    if (spoils.pick) {
      // An elite or boss pick follows: the rewards go at the top of that screen instead.
      run.lastSpoils = `${spoils.actCleared ? `ACT ${run.act} CLEARED! ` : 'Victory: '}${spoilsLine(run, spoils, lootText(loot))}`;
      saveRun(run);
      this.s.scene.restart({ run });
      return;
    }
    saveRun(run);
    this.showSpoils(spoils, loot, () => this.s.scene.restart({ run }));
  }

  /** A short, flashy look at the loot: gold counting up, XP per hero, level-ups. */
  showSpoils(spoils: Spoils, loot: Loot, onDone: () => void): void {
    const run = this.s.run!;
    this.s.state = 'spoils';
    sound.play('levelUp');
    const cx = WORLD.width / 2;
    const cy = 380;
    const items: Phaser.GameObjects.GameObject[] = [];
    const veil = this.s.add.rectangle(0, 0, WORLD.width, WORLD.hudTop, 0x000000, 0.45).setOrigin(0, 0).setInteractive();
    const ups = spoils.heroes.filter((r) => r.to > r.from);
    const h = 190 + (ups.length ? 28 : 0) + (spoils.goldBonus ? 22 : 0);
    const panel = this.s.add.rectangle(cx, cy, 380, h, 0x111723, 0.94).setStrokeStyle(2, 0xffd166);
    const title = spoils.won ? 'THE RIFT IS CLOSED!' : spoils.actCleared ? `ACT ${run.act} CLEARED!` : 'VICTORY!';
    const t = this.s.text(cx, cy - h / 2 + 30, title, spoils.actCleared || spoils.won ? 28 : 32, '#ffd166').setOrigin(0.5).setFontStyle('bold');
    t.setStroke('#000000', 5);
    items.push(veil, panel, t);
    // Gold: an icon and a number that counts up, with a few coins bursting out.
    const gy = cy - h / 2 + 72;
    const coin = this.s.add.image(cx - 56, gy, 'icon-ui-gold').setScale(26 / ICON_PX);
    const gold = this.s.text(cx - 36, gy, '+0 gold', 22, '#ffe066').setOrigin(0, 0.5).setFontStyle('bold');
    gold.setStroke('#000000', 4);
    items.push(coin, gold);
    const counter = { v: 0 };
    this.s.tweens.add({
      targets: counter,
      v: spoils.gold,
      duration: 700,
      ease: 'Cubic.easeOut',
      onUpdate: () => gold.setText(`+${Math.round(counter.v)} gold`),
    });
    for (let i = 0; i < Math.min(12, 3 + Math.floor(spoils.gold / 8)); i++) {
      const c = this.s.add.image(cx - 56, gy, 'icon-ui-gold').setScale(14 / ICON_PX).setDepth(121);
      items.push(c);
      const a = Math.random() * Math.PI * 2;
      this.s.tweens.add({ targets: c, x: cx - 56 + Math.cos(a) * (50 + Math.random() * 60), y: gy + Math.sin(a) * (40 + Math.random() * 40) - 20, alpha: 0, duration: 650 + Math.random() * 300, ease: 'Cubic.easeOut' });
    }
    // XP once (everyone standing gets the same), then any level-ups, then the camp loot.
    let y = gy + (spoils.goldBonus ? 26 : 0);
    if (spoils.goldBonus) items.push(this.s.text(cx, gy + 22, `Golden bonus: +${spoils.goldBonus} gold`, 13, '#ffd166').setOrigin(0.5));
    y += 38;
    items.push(this.s.text(cx, y, `+${spoils.xp} XP`, 18, '#9ad1ff').setOrigin(0.5).setFontStyle('bold'));
    if (ups.length) {
      y += 30;
      const name = (slot: number) => run.team[slot][0].toUpperCase() + run.team[slot].slice(1);
      const up = this.s.text(cx, y, `Level up! ${ups.map((r) => `${name(r.slot)} ${r.to}`).join(', ')}`, 15, '#7dff9b').setOrigin(0.5).setFontStyle('bold');
      up.setStroke('#000000', 3).setScale(0.2);
      this.s.tweens.add({ targets: up, scale: 1, duration: 380, delay: 350, ease: 'Back.easeOut' });
      items.push(up);
    }
    // Camp loot (already sent home).
    const lt = this.s.text(cx, y + 32, `⛺ To the camp: ${lootText(loot)}`, 13, '#e0b878').setOrigin(0.5).setAlpha(0);
    this.s.tweens.add({ targets: lt, alpha: 1, duration: 300, delay: 500 });
    items.push(lt);
    if (spoils.pick) items.push(this.s.text(cx, cy + h / 2 - 18, 'An upgrade awaits…', 12, '#ffd166').setOrigin(0.5));
    const box = this.s.add.container(0, 0, items).setDepth(120);
    panel.setScale(0.6);
    this.s.tweens.add({ targets: panel, scale: 1, duration: 260, ease: 'Back.easeOut' });
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      timer.remove();
      box.destroy();
      button.destroy();
      onDone();
    };
    // The rewards stay up until you press Next Wave; with Auto on, they move on by themselves.
    const button = this.s.button(cx, cy + h / 2 + 46, spoils.won ? 'Continue ▶' : 'Next Wave ▶', 26, '#2e86de', end).setDepth(121);
    let autoAt = -1;
    const timer = this.s.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        if (!this.s.auto) {
          autoAt = -1;
          return;
        }
        if (autoAt < 0) autoAt = this.s.time.now + SPOILS_MS;
        if (this.s.time.now >= autoAt) end();
      },
    });
  }

  /** The party fell, but they held a wish: everyone rises again and the fight starts over. */
  showWish(): void {
    const run = this.s.run!;
    this.s.state = 'spoils';
    sound.play('levelUp');
    const cx = WORLD.width / 2;
    this.s.cameras.main.flash(500, 220, 200, 255);
    const box = this.s.add
      .container(0, 0, [
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.hudTop, 0x000000, 0.55).setOrigin(0, 0).setInteractive(),
        this.s.add.rectangle(cx, 380, 400, 170, 0x161c28, 0.95).setStrokeStyle(2, 0xb57bff),
        this.s.text(cx, 330, '✦ The wish is spent ✦', 26, '#e0c3ff').setOrigin(0.5).setFontStyle('bold'),
        this.s.text(cx, 380, 'Your party rises again.\nThe fight starts over.', 16, '#ffffff').setOrigin(0.5).setAlign('center'),
      ])
      .setDepth(120);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      box.destroy();
      this.s.scene.restart({ run });
    };
    box.list[0].on('pointerdown', go);
    this.s.time.delayedCall(2200, go);
  }

  /** The party fell: the run is over. */
  showGameOver(floor: number, type: string): void {
    const run = this.s.run!;
    this.s.state = 'over';
    sound.play('heroDown');
    const cx = WORLD.width / 2;
    const act = actDef(run.act);
    this.s.overlay = this.s.add
      .container(0, 0, [
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.75).setOrigin(0, 0).setInteractive(),
        this.s.text(cx, 300, 'Your party has fallen', 32, '#ff6b6b').setOrigin(0.5).setFontStyle('bold'),
        this.s.text(cx, 352, `Act ${run.act}, ${act.name} — floor ${floor} (${type})`, 16, '#ffffff').setOrigin(0.5),
        this.s.text(cx, 384, `${run.stats.fights} fights won · ${run.stats.elites} elites · ${run.stats.bosses} bosses · ${run.stats.gold} gold`, 14, '#c9d1e0').setOrigin(0.5),
        this.s.text(cx, 412, `Best: ${describeProgress(bestProgress())}`, 14, '#ffd166').setOrigin(0.5),
        this.s.text(cx, 440, `Sent home to the camp: ${lootText(run.loot)}`, 13, '#e0b878').setOrigin(0.5).setAlign('center').setWordWrapWidth(480),
        // Pass {} — restart() with no data would reuse the finished run's data.
        this.s.button(cx - 90, 510, '⛺ The Camp', 20, '#6b4f2a', () => this.s.campScreen.show()),
        this.s.button(cx + 90, 510, 'New run', 20, '#2e86de', () => this.s.scene.restart({})),
      ])
      .setDepth(100);
  }

  /** The last boss fell: the run is won. */
  showVictory(wins: number): void {
    const run = this.s.run!;
    this.s.state = 'over';
    const cx = WORLD.width / 2;
    this.s.cameras.main.flash(400, 255, 240, 200);
    this.s.overlay = this.s.add
      .container(0, 0, [
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.75).setOrigin(0, 0).setInteractive(),
        this.s.text(cx, 290, 'Victory!', 48, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
        this.s.text(cx, 344, 'The rift is closed. Your guild is legend.', 16, '#ffffff').setOrigin(0.5),
        this.s.text(cx, 376, `${run.stats.fights} fights · ${run.stats.elites} elites · ${run.stats.bosses} bosses · ${run.stats.gold} gold`, 14, '#c9d1e0').setOrigin(0.5),
        this.s.text(cx, 404, `Wins: ${wins}. Something new will unlock here soon.`, 14, '#7dff9b').setOrigin(0.5),
        this.s.text(cx, 432, `Sent home to the camp: ${lootText(run.loot)}`, 13, '#e0b878').setOrigin(0.5).setAlign('center').setWordWrapWidth(480),
        this.s.button(cx - 90, 500, '⛺ The Camp', 20, '#6b4f2a', () => this.s.campScreen.show()),
        this.s.button(cx + 90, 500, 'New run', 20, '#2e86de', () => this.s.scene.restart({})),
      ])
      .setDepth(100);
  }
}
