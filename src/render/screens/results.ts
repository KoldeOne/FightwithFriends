import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { actDef } from '../../sim/acts';
import { WORLD } from '../../sim/content';
import { bestProgress, clearRun, currentNode, describeProgress, heroLabel, recordProgress, recordWin, saveRun, spoilsLine, type Spoils } from '../../sim/run';
import { loadCamp, lootText, saveCamp } from '../../sim/camp';
import { dailyBest, recordDaily } from '../../sim/progress';
import { addGrave, settleFight } from '../../sim/settle';
import type { Loot } from '../../sim/types';
import { sound } from '../sound';
import { abilityIcon, COLORS, cssColor, ICON_PX, traitIcon } from '../theme';
import { meterSource } from '../meter';

/** With Auto on: how long the spoils stay up before moving on. */
const SPOILS_MS = 2400;

/** After a fight: the spoils (gold, XP, level-ups), or the end of the run (game over or victory). */
export class Results {
  constructor(readonly s: BattleScene) {}

  /** Unlocks earned by the fight just settled (a new ability, tier or class), shown with its rewards. */
  private notices: string[] = [];

  /** The fight is over: settle it with the run, then show what happened. */
  finish(): void {
    const run = this.s.run!;
    const won = this.s.battle.outcome === 'victory';
    const fallen = this.s.battle.heroes.filter((h) => !h.alive).map((h) => h.slot ?? 0);
    const node = currentNode(run)!;
    // Camp loot goes home straight away, win or lose.
    const camp = loadCamp();
    const meter = this.s.battle.heroes.map((h) => ({ slot: h.slot ?? 0, damage: this.s.battle.meter.get(h.id)?.damage ?? {}, healing: this.s.battle.meter.get(h.id)?.healing ?? {} }));
    const { spoils, loot, notices } = settleFight(run, camp, { won, fallen, kills: this.s.battle.kills, meter });
    saveCamp(camp);
    this.notices = notices;
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
      run.lastSpoils = `${spoils.actCleared ? `ACT ${run.act} CLEARED! ` : 'Victory: '}${spoilsLine(run, spoils, lootText(loot))}${notices.map((n) => `\n🔓 ${n}`).join('')}`;
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
    const h = 190 + (ups.length ? 28 : 0) + (spoils.goldBonus ? 22 : 0) + this.notices.length * 22;
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
      const up = this.s.text(cx, y, `Level up! ${ups.map((r) => `${heroLabel(run, r.slot)} ${r.to}`).join(', ')}`, 15, '#7dff9b').setOrigin(0.5).setFontStyle('bold');
      up.setStroke('#000000', 3).setScale(0.2);
      this.s.tweens.add({ targets: up, scale: 1, duration: 380, delay: 350, ease: 'Back.easeOut' });
      items.push(up);
    }
    // Camp loot (already sent home).
    const lt = this.s.text(cx, y + 32, `⛺ To the camp: ${lootText(loot)}`, 13, '#e0b878').setOrigin(0.5).setAlpha(0);
    this.s.tweens.add({ targets: lt, alpha: 1, duration: 300, delay: 500 });
    items.push(lt);
    // Unlocks (abilities, a tier, a class).
    this.notices.forEach((n, i) =>
      items.push(this.s.text(cx, y + 58 + i * 22, `🔓 ${n}`, 13, '#ffd166').setOrigin(0.5).setFontStyle('bold').setWordWrapWidth(360)),
    );
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
    const button = this.s.button(cx, cy + h / 2 + 46, 'Continue ▶', 26, '#2e86de', end).setDepth(121);
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
    sound.play('heroDown');
    const act = actDef(run.act);
    // What killed you: the toughest enemy still standing.
    const killer = this.s.battle.units
      .filter((u) => u.side === 'enemy' && u.alive)
      .sort((a, b) => Number(!!b.isBoss) - Number(!!a.isBoss) || Number(!!b.isElite) - Number(!!a.isElite) || b.maxHp - a.maxHp)[0];
    this.showEnd({
      title: 'Your party has fallen',
      color: '#ff6b6b',
      lines: [`Act ${run.act}, ${act.name}: floor ${floor} (${type})${killer ? `, beaten by a ${killer.label}` : ''}`, `Best: ${describeProgress(bestProgress())}`],
    });
  }

  /** The last boss fell: the run is won. */
  showVictory(wins: number): void {
    this.s.cameras.main.flash(400, 255, 240, 200);
    this.showEnd({
      title: 'Victory!',
      color: '#ffd166',
      lines: ['The rift is closed. Your guild is legend.', `Wins: ${wins}.`],
    });
  }

  /** Give up on the run (from the top bar, with a check first). */
  abandon(): void {
    const run = this.s.run;
    if (!run) return;
    this.s.confirm('Abandon this run?', 'The run ends here. Your best progress is kept, and its camp loot is already at the camp.', 'Abandon', () => {
      recordProgress(run);
      // The graveyard keeps abandoned runs too.
      const camp = loadCamp();
      addGrave(run, camp);
      saveCamp(camp);
      clearRun();
      this.s.map.hide();
      this.s.inspect.closeInspect();
      this.s.overlay?.destroy();
      this.showAbandoned();
    });
  }

  /** You gave up on the run. */
  showAbandoned(): void {
    this.showEnd({ title: 'Run abandoned', color: '#c9d1e0', lines: [`Best: ${describeProgress(bestProgress())}`] });
  }

  /**
   * The end of a run: what happened, the party, and a big damage and healing
   * chart for the whole run (tap a hero for what their numbers were made of).
   */
  private showEnd(o: { title: string; color: string; lines: string[] }): void {
    const run = this.s.run!;
    this.s.state = 'over';
    const cx = WORLD.width / 2;
    if (run.daily) {
      const node = currentNode(run);
      const reached = run.status === 'won' ? 999 : run.act * 100 + (node ? node.floor + 1 : 0);
      const best = recordDaily(run.daily, reached, run.team);
      o.lines = [...o.lines.filter((l) => !l.startsWith('Best:')), `Daily run ${run.daily}: ${describeProgress(reached)}${best ? ' (your best today!)' : ` (best today: ${describeProgress(dailyBest(run.daily)?.reached ?? 0)})`}`];
    }
    o.lines = [...o.lines, ...this.notices.map((n) => `🔓 ${n}`)];
    this.notices = [];
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.97).setOrigin(0, 0).setInteractive(),
      this.s.add.rectangle(12, 56, WORLD.width - 24, 800, 0x111723).setOrigin(0, 0).setStrokeStyle(2, 0x3a4660),
      this.s.text(cx, 78, o.title, 30, o.color).setOrigin(0.5, 0).setFontStyle('bold'),
      this.s.text(cx, 122, o.lines.join('\n'), 14, '#ffffff').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(490).setLineSpacing(4),
      this.s.text(cx, 172, `${plural(run.stats.fights, 'fight')} won · ${plural(run.stats.elites, 'elite')} · ${plural(run.stats.bosses, 'boss', 'bosses')} · ${run.stats.gold} gold`, 13, '#c9d1e0').setOrigin(0.5, 0),
      this.s.text(30, 206, 'The party, over the whole run', 15, '#ffd166').setFontStyle('bold'),
      this.s.text(WORLD.width - 30, 210, 'damage / healing', 11, '#8f9bb3').setOrigin(1, 0),
    ];
    // One row per hero: portrait, name and level, abilities, then a damage bar and a healing bar.
    const totals = run.team.map((_, slot) => {
      const m = run.meter?.[slot] ?? { damage: {}, healing: {} };
      const sum = (r: Record<string, number>) => Object.values(r).reduce((a, v) => a + v, 0);
      return { slot, damage: sum(m.damage), healing: sum(m.healing), m };
    });
    const maxDamage = Math.max(1, ...totals.map((t) => t.damage));
    const maxHealing = Math.max(1, ...totals.map((t) => t.healing));
    const rowH = 66;
    const top = 236;
    const barX = 250;
    const barW = WORLD.width - 30 - barX - 56;
    const rows: Phaser.GameObjects.Rectangle[] = [];
    const detail = this.s.text(30, top + run.team.length * rowH + 18, '', 12, '#c9d1e0').setLineSpacing(3);
    const showDetail = (slot: number) => {
      rows.forEach((r, i) => r.setStrokeStyle(2, i === slot ? 0xffd166 : 0x2b3445));
      const t = totals[slot];
      const line = (r: Record<string, number>, total: number) =>
        Object.entries(r)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([k, v]) => `${meterSource(k).name} ${formatTotal(v)} (${Math.round((100 * v) / Math.max(1, total))}%)`)
          .join(' · ') || 'none';
      detail.setText(`${heroLabel(run, slot)}\nDamage: ${line(t.m.damage, t.damage)}\nHealing: ${line(t.m.healing, t.healing)}`).setWordWrapWidth(WORLD.width - 60);
    };
    totals.forEach((t, i) => {
      const y = top + i * rowH;
      const cls = run.team[t.slot];
      const b = run.builds[t.slot];
      const bg = this.s.add.rectangle(24, y, WORLD.width - 48, rowH - 6, 0x161c28).setOrigin(0, 0).setStrokeStyle(2, 0x2b3445).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => showDetail(i));
      rows.push(bg);
      items.push(bg, ...this.s.heroPicker.portrait(cls, 50, y + rowH - 12, 1.1));
      items.push(this.s.text(76, y + 6, `${heroLabel(run, t.slot)}  Lv ${b.level}`, 13, cssColor(COLORS[cls])).setFontStyle('bold'));
      [...b.abilities.map((a) => abilityIcon(a.id)), ...b.traits.map((tr) => traitIcon(tr))].forEach((key, j) =>
        items.push(this.s.add.image(76 + j * 22, y + 28, key).setOrigin(0, 0).setScale(20 / ICON_PX)),
      );
      const dw = Math.max(2, (barW * t.damage) / maxDamage);
      const hw = Math.max(2, (barW * t.healing) / maxHealing);
      items.push(
        this.s.add.rectangle(barX, y + 10, barW, 16, 0x0b0e14).setOrigin(0, 0),
        this.s.add.rectangle(barX, y + 10, dw, 16, 0xe0644a).setOrigin(0, 0),
        this.s.text(barX + barW + 6, y + 10, formatTotal(t.damage), 12, '#ffb3a3').setFontStyle('bold'),
        this.s.add.rectangle(barX, y + 32, barW, 16, 0x0b0e14).setOrigin(0, 0),
        this.s.add.rectangle(barX, y + 32, t.healing ? hw : 0, 16, 0x4ac27a).setOrigin(0, 0),
        this.s.text(barX + barW + 6, y + 32, formatTotal(t.healing), 12, '#a8f0c2').setFontStyle('bold'),
      );
    });
    items.push(detail);
    const lootY = top + run.team.length * rowH + 100;
    items.push(
      this.s.text(cx, lootY, `Sent home to the camp: ${lootText(run.loot)}`, 13, '#e0b878').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(480),
      // Pass {} — restart() with no data would reuse the finished run's data.
      this.s.button(cx - 100, WORLD.height - 150, '⛺ The Camp', 20, '#6b4f2a', () => this.s.campScreen.show()),
      this.s.button(cx + 100, WORLD.height - 150, 'New run', 20, '#2e86de', () => this.s.scene.restart({})),
    );
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
    // The top damage dealer's breakdown to start with.
    const best = totals.reduce((a, t) => (t.damage > a.damage ? t : a), totals[0]);
    if (best) showDetail(totals.indexOf(best));
  }
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatTotal(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}
