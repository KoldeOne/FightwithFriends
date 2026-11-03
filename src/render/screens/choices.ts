import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { ABILITIES, TRAITS, WORLD } from '../../sim/content';
import { EVENTS } from '../../sim/events';
import {
  autoResolve,
  buy,
  chooseEvent,
  chooseUpgrade,
  eventChoices,
  describeReward,
  leaveShop,
  reroll,
  rerollPrice,
  rewardPreview,
  saveRun,
  train,
  trainOptions,
  type PartyReward,
  type Reward,
  type RunState,
} from '../../sim/run';
import { sound } from '../sound';
import { abilityIcon, COLORS, ICON_PX, traitIcon } from '../theme';

/** The icon for a reward: the ability it adds or upgrades, the passive, or a stat. */
export function rewardIcon(r: Reward): string {
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

const heroName = (run: RunState, slot: number) => {
  const cls = run.team[slot];
  const same = run.team.slice(0, slot).filter((c) => c === cls).length;
  return `${cls[0].toUpperCase() + cls.slice(1)}${same ? ` ${same + 1}` : ''}`;
};

/** Campsite training, upgrade picks (chests, elites, bosses) and shops. */
export class Choices {
  constructor(readonly s: BattleScene) {}

  /** Show whatever choice is waiting at the current node. */
  showPending(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (!p) return;
    this.s.state = 'choice';
    if (p.kind === 'recruit') this.s.heroPicker.showRecruit();
    else if (p.kind === 'train') this.showTrain();
    else if (p.kind === 'upgrade') this.showUpgrade();
    else if (p.kind === 'event') this.showEvent();
    else this.showShop();
    // Auto makes the choice after a moment (enough to see what it was).
    if (this.s.auto && p.kind !== 'recruit' && p.kind !== 'event') {
      const token = this.s.overlay;
      this.s.time.delayedCall(1100, () => {
        if (this.s.overlay !== token || !this.s.auto || run.pending !== p) return;
        autoResolve(run);
        this.done();
      });
    }
  }

  /** A choice was made: save and go back to the map (or on to the next act). */
  private done(): void {
    const run = this.s.run!;
    saveRun(run);
    this.s.scene.restart({ run });
  }

  private frame(title: string, sub: string): Phaser.GameObjects.GameObject[] {
    const cx = WORLD.width / 2;
    return [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.82).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 116, title, 26, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 148, sub, 13, '#c9d1e0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(480),
    ];
  }

  /** One card: icon, tag, title, what it does, and its numbers (Now / After for upgrades). */
  private card(run: RunState, slot: number, r: Reward, y: number, h: number, onTap: () => void, extra?: string): Phaser.GameObjects.GameObject[] {
    const cx = WORLD.width / 2;
    const d = describeReward(r);
    const bg = this.s.add.rectangle(cx, y + h / 2, 480, h, 0x1c2433).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x26314a));
    bg.on('pointerout', () => bg.setFillStyle(0x1c2433));
    bg.on('pointerdown', () => {
      sound.play('click');
      onTap();
    });
    const left = cx - 185;
    const wrap = 400;
    const tagColor = d.tag === 'UPGRADE' ? '#9ad1ff' : d.tag === 'NEW PASSIVE' ? '#b57bff' : '#7dff9b';
    const preview = rewardPreview(run, slot, r);
    const out: Phaser.GameObjects.GameObject[] = [bg, this.s.add.image(cx - 228, y + 10, rewardIcon(r)).setOrigin(0, 0).setScale(30 / ICON_PX)];
    const who = this.s.text(left, y + 8, `${d.tag} · ${heroName(run, slot)}${extra ? ` · ${extra}` : ''}`, 11, tagColor).setFontStyle('bold');
    const title = this.s.text(left, y + 22, d.title, 17, '#ffffff').setFontStyle('bold');
    const desc = this.s.text(left, y + 44, r.kind === 'ability' && preview ? preview.after : d.text, 12, '#c9d1e0').setWordWrapWidth(wrap);
    out.push(who, title, desc);
    if (preview && r.kind !== 'ability') {
      const now = this.s.text(left, y + 46 + desc.height, `Now: ${preview.now ?? '—'}`, 11, '#9aa5b8').setWordWrapWidth(wrap);
      const after = this.s.text(left, y + 48 + desc.height + now.height, `After: ${preview.after}`, 11, '#ffd166').setWordWrapWidth(wrap);
      out.push(now, after);
    }
    return out;
  }

  // --- chests and training: every hero picks ---------------------------------

  /** Chest or training campsite: each hero in turn picks one of three (new abilities, or upgrades once full). */
  showTrain(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'train') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const slot = p.left[0];
    const b = run.builds[slot];
    const n = run.team.length - p.left.length + 1;
    const title = p.source === 'chest' ? `Chest opened!${p.gold ? ` +${p.gold} gold` : ''}` : 'Campsite: training';
    const options = trainOptions(run, slot);
    const learns = options.some((o) => o.kind === 'ability' || o.kind === 'trait');
    const items = this.frame(title, `Every hero gets a pick. ${heroName(run, slot)} (${n} of ${run.team.length}): ${learns ? 'learn something new' : 'all slots full, choose an upgrade'}.`);
    // Who's picking, with what they have.
    items.push(...this.s.heroPicker.portrait(run.team[slot], cx - 215, 236, 1.4));
    items.push(this.s.text(cx - 185, 196, `${heroName(run, slot)} — level ${b.level}`, 15, '#' + COLORS[run.team[slot]].toString(16).padStart(6, '0')).setFontStyle('bold'));
    [...b.abilities.map((a) => abilityIcon(a.id)), ...b.traits.map((t) => traitIcon(t))].forEach((key, j) =>
      items.push(this.s.add.image(cx - 185 + j * 24, 216, key).setOrigin(0, 0).setScale(20 / ICON_PX)),
    );
    const names = [...b.abilities.map((a) => ABILITIES[a.id].name), ...b.traits.map((t) => TRAITS[t].name)].join(', ');
    items.push(this.s.text(cx - 185 + Math.max(1, b.abilities.length + b.traits.length) * 24 + 6, 220, names, 11, '#8f9bb3').setWordWrapWidth(260));
    options.forEach((r, k) => {
      items.push(
        ...this.card(run, slot, r, 252 + k * 140, 128, () => {
          train(run, slot, r);
          this.done();
        }),
      );
    });
    items.push(
      this.s.button(cx, 252 + options.length * 140 + 24, 'Skip', 14, '#2b3445', () => {
        train(run, slot, null);
        this.done();
      }),
    );
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  // --- chance encounters ------------------------------------------------------

  /** A "?" node: the event's text and choices, then what happened. (Art and more story come later.) */
  showEvent(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'event') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const def = EVENTS[p.id];
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.82).setOrigin(0, 0).setInteractive(),
      this.s.add.rectangle(cx, 380, 470, 420, 0x161c28).setStrokeStyle(2, 0xb57bff),
      this.s.add.image(cx, 214, 'icon-nd-event').setScale(40 / ICON_PX),
      this.s.text(cx, 252, def.title, 24, '#e0c3ff').setOrigin(0.5, 0).setFontStyle('bold'),
      this.s.text(cx, 292, def.text, 14, '#e6e9f0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(420),
    ];
    const choose = (i: number) => {
      const result = chooseEvent(run, i);
      saveRun(run);
      this.showEventResult(def.title, result);
    };
    eventChoices(run).forEach((c, i) => {
      items.push(
        this.s.button(cx, 400 + i * 58, c.label, 17, i === 0 ? '#6d3fb5' : '#2b3445', () => {
          sound.play('click');
          choose(i);
        }),
      );
    });
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
    if (this.s.auto) {
      const token = this.s.overlay;
      this.s.time.delayedCall(1400, () => {
        if (this.s.overlay === token && this.s.auto && run.pending === p) choose(0);
      });
    }
  }

  private showEventResult(title: string, result: string): void {
    const run = this.s.run!;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    sound.play('levelUp');
    const go = () => this.s.scene.restart({ run });
    this.s.overlay = this.s.add
      .container(0, 0, [
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x000000, 0.82).setOrigin(0, 0).setInteractive(),
        this.s.add.rectangle(cx, 380, 470, 300, 0x161c28).setStrokeStyle(2, 0xb57bff),
        this.s.text(cx, 262, title, 22, '#e0c3ff').setOrigin(0.5, 0).setFontStyle('bold'),
        this.s.text(cx, 306, result, 15, '#ffffff').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(420),
        this.s.button(cx, 470, 'Continue', 18, '#2e86de', go),
      ])
      .setDepth(100);
    if (this.s.auto) {
      const token = this.s.overlay;
      this.s.time.delayedCall(1600, () => this.s.overlay === token && go());
    }
  }

  // --- upgrade picks ------------------------------------------------------------

  showUpgrade(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'upgrade') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const titles = { elite: 'Elite spoils', boss: 'Boss spoils' };
    const sub = 'Choose a reward for one of your heroes.';
    const items = this.frame(titles[p.source], sub);
    // What the fight paid, at the top (instead of a separate pop-up).
    if (run.lastSpoils) {
      const strip = this.s.text(cx, 72, run.lastSpoils, 13, '#ffe066').setOrigin(0.5).setAlign('center').setWordWrapWidth(500).setFontStyle('bold');
      strip.setStroke('#000000', 3);
      items.push(this.s.add.rectangle(cx, 72, WORLD.width - 20, Math.max(30, strip.height + 10), 0x2a2210, 0.95).setStrokeStyle(1, 0xffd166), strip);
    }
    p.options.forEach((o: PartyReward, k) => {
      items.push(
        ...this.card(run, o.slot, o.reward, 196 + k * 150, 140, () => {
          chooseUpgrade(run, o);
          this.done();
        }),
      );
    });
    items.push(
      this.s.button(cx, 196 + p.options.length * 150 + 30, 'Skip', 14, '#2b3445', () => {
        chooseUpgrade(run, null);
        this.done();
      }),
    );
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  // --- shop -------------------------------------------------------------------

  showShop(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'shop') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const items = this.frame('Shop', `Gold: ${run.gold}. Abilities and upgrades for your heroes.`);
    p.stock.forEach((item, k) => {
      const y = 186 + k * 112;
      const label = item.sold ? 'Sold' : `${item.price} gold`;
      const can = !item.sold && run.gold >= item.price;
      const card = this.card(
        run,
        item.slot,
        item.reward,
        y,
        104,
        () => {
          if (!can) return;
          if (buy(run, k)) {
            sound.play('levelUp');
            saveRun(run);
            this.showShop();
          }
        },
        label,
      );
      // Sold out or too expensive: dimmed.
      if (!can) for (const o of card) (o as Phaser.GameObjects.Image).setAlpha(item.sold ? 0.35 : 0.6);
      items.push(...card);
    });
    const y = 186 + p.stock.length * 112 + 22;
    items.push(
      this.s.button(cx - 110, y, `Reroll (${rerollPrice(run)} gold)`, 14, run.gold >= rerollPrice(run) ? '#5a4a1c' : '#2b3445', () => {
        if (reroll(run)) {
          sound.play('click');
          saveRun(run);
          this.showShop();
        }
      }),
      this.s.button(cx + 120, y, 'Leave ▶', 15, '#2e86de', () => {
        leaveShop(run);
        this.done();
      }),
    );
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }
}
