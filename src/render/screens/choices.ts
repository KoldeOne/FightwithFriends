import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { WORLD } from '../../sim/content';
import { EVENTS } from '../../sim/events';
import {
  autoChoose,
  autoResolve,
  buy,
  chooseEvent,
  chooseUpgrade,
  eventChoices,
  attunementNote,
  describeReward,
  heroLabel,
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
import { abilityIcon, COLORS, cssColor, ICON_PX, traitIcon } from '../theme';
import { relicIcon } from '../relicIcons';

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
    case 'relic':
      return relicIcon(r.id);
  }
}

const heroName = heroLabel;

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
        // A party pick: everyone at once.
        while (p.kind === 'train' && run.pending === p) autoResolve(run);
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
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.96).setOrigin(0, 0).setInteractive(),
      this.s.text(cx, 116, title, 26, '#ffd166').setOrigin(0.5).setFontStyle('bold'),
      this.s.text(cx, 148, sub, 13, '#c9d1e0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(480),
    ];
  }

  /** One card, sized to its text: icon, tag, title, what it does, and its numbers (Now / After for upgrades). */
  private card(run: RunState, slot: number, r: Reward, y: number, onTap: () => void, extra?: string): { items: Phaser.GameObjects.GameObject[]; h: number } {
    const cx = WORLD.width / 2;
    const d = describeReward(r);
    const left = cx - 185;
    const wrap = 400;
    const tagColor = d.tag === 'UPGRADE' ? '#9ad1ff' : d.tag === 'NEW PASSIVE' ? '#b57bff' : d.tag === 'RELIC' ? '#ffd166' : '#7dff9b';
    const preview = rewardPreview(run, slot, r);
    // A relic is for the whole party.
    const who = this.s.text(left, y + 8, `${d.tag} · ${r.kind === 'relic' ? 'Whole party' : heroName(run, slot)}${extra ? ` · ${extra}` : ''}`, 11, tagColor).setFontStyle('bold');
    const title = this.s.text(left, y + 22, d.title, 17, '#ffffff').setFontStyle('bold');
    const desc = this.s.text(left, y + 44, r.kind === 'ability' && preview ? preview.after : d.text, 12, '#c9d1e0').setWordWrapWidth(wrap);
    const texts: Phaser.GameObjects.Text[] = [who, title, desc];
    // A new ability: what it does to the party's attunement.
    const note = r.kind === 'ability' ? attunementNote(run, r.id) : '';
    if (note) texts.push(this.s.text(left, y + 46 + desc.height, note, 11, '#ffd166').setWordWrapWidth(wrap));
    if (preview && r.kind !== 'ability') {
      const now = this.s.text(left, y + 46 + desc.height, `Now: ${preview.now ?? '—'}`, 11, '#9aa5b8').setWordWrapWidth(wrap);
      const after = this.s.text(left, y + 48 + desc.height + now.height, `After: ${preview.after}`, 11, '#ffd166').setWordWrapWidth(wrap);
      texts.push(now, after);
    }
    const last = texts[texts.length - 1];
    const h = Math.max(72, Math.ceil(last.y + last.height - y + 10));
    const bg = this.s.add.rectangle(cx, y + h / 2, 480, h, 0x1c2433).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x26314a));
    bg.on('pointerout', () => bg.setFillStyle(0x1c2433));
    bg.on('pointerdown', () => {
      sound.play('click');
      onTap();
    });
    return { items: [bg, this.s.add.image(cx - 228, y + 10, rewardIcon(r)).setOrigin(0, 0).setScale(30 / ICON_PX), ...texts], h };
  }

  // --- training and bosses: every hero picks, on one screen ----------------------

  /**
   * Training campsite, boss (or Blood Altar): a row per hero with their options.
   * Tap one per row (tap again to skip that hero), see its details below, then
   * Confirm. "Choose for me" fills in any hero you haven't picked for.
   */
  showTrain(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'train') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const title = p.source === 'boss' ? 'Boss spoils' : p.source === 'altar' ? 'The Blood Altar' : 'Campsite: training';
    const items = this.frame(title, 'Every hero picks one: tap to choose (again to skip), then Confirm.');
    items.push(...this.spoilsStrip());
    const chosen = new Map<number, Reward>();
    const slots = [...p.left];
    const top = 176;
    const detailTop = 760;
    const rowH = Math.min(150, Math.floor((detailTop - 12 - top) / slots.length));
    const tiles = new Map<number, { r: Reward; bg: Phaser.GameObjects.Rectangle }[]>();
    // The details panel for the last reward tapped.
    const detail = this.s.text(24, detailTop + 8, 'Tap a reward to see what it does.', 12, '#c9d1e0').setWordWrapWidth(WORLD.width - 48).setLineSpacing(2);
    items.push(this.s.add.rectangle(12, detailTop, WORLD.width - 24, 96, 0x111723).setOrigin(0, 0).setStrokeStyle(1, 0x2b3445), detail);
    const confirm = this.s.button(cx + 110, WORLD.height - 62, '', 20, '#2e86de', () => {
      for (const slot of slots) if (run.pending === p) train(run, slot, chosen.get(slot) ?? null);
      this.done();
    });
    const update = () => {
      confirm.setText(`Confirm (${chosen.size}/${slots.length}) ▶`);
      for (const [slot, list] of tiles)
        for (const t of list) {
          const on = chosen.get(slot) === t.r;
          t.bg.setFillStyle(on ? 0x2a3550 : 0x1c2433).setStrokeStyle(2, on ? 0xffd166 : 0x3a4660);
        }
    };
    slots.forEach((slot, k) => {
      const y = top + k * rowH;
      const b = run.builds[slot];
      const options = trainOptions(run, slot);
      const learns = options.some((o) => o.kind === 'ability' || o.kind === 'trait');
      items.push(...this.s.heroPicker.portrait(run.team[slot], 34, y + rowH - 22, 1.2));
      items.push(this.s.text(64, y, `${heroName(run, slot)} — level ${b.level} · ${learns ? 'learn something new' : 'all slots full: an upgrade'}`, 12, cssColor(COLORS[run.team[slot]])).setFontStyle('bold'));
      const left = 64;
      const gap = 6;
      const w = Math.floor((WORLD.width - 12 - left - gap * (options.length - 1)) / options.length);
      const h = rowH - 26;
      const list: { r: Reward; bg: Phaser.GameObjects.Rectangle }[] = [];
      options.forEach((r, i) => {
        const x = left + i * (w + gap);
        const d = describeReward(r);
        const bg = this.s.add.rectangle(x, y + 18, w, h, 0x1c2433).setOrigin(0, 0).setStrokeStyle(2, 0x3a4660).setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => {
          sound.play('click');
          if (chosen.get(slot) === r) chosen.delete(slot);
          else chosen.set(slot, r);
          const pv = rewardPreview(run, slot, r);
          const body = r.kind === 'ability' && pv ? pv.after : d.text;
          const nums = pv && r.kind !== 'ability' ? `\nNow: ${pv.now ?? '—'}\nAfter: ${pv.after}` : '';
          const att = r.kind === 'ability' ? attunementNote(run, r.id) : '';
          detail.setText(`${heroName(run, slot)}: ${d.title} (${d.tag.toLowerCase()})\n${body}${nums}${att ? `\n${att}` : ''}`);
          update();
        });
        const tagColor = d.tag === 'UPGRADE' ? '#9ad1ff' : d.tag === 'NEW PASSIVE' ? '#b57bff' : '#7dff9b';
        items.push(
          bg,
          this.s.add.image(x + 6, y + 24, rewardIcon(r)).setOrigin(0, 0).setScale(24 / ICON_PX),
          this.s.text(x + 34, y + 24, d.tag === 'UPGRADE' ? 'UPGRADE' : 'NEW', 10, tagColor).setFontStyle('bold'),
        );
        // The name, and what it does in a few words, so you can compare without tapping.
        const name = this.s.text(x + 6, y + 50, d.title, 12, '#ffffff').setFontStyle('bold').setWordWrapWidth(w - 12);
        const pv = rewardPreview(run, slot, r);
        const full = r.kind === 'ability' && pv ? pv.after : d.text;
        const short = full.length > 64 ? `${full.slice(0, 62).replace(/[ ,.;:]+\S*$/, '')}…` : full;
        const effect = this.s.text(x + 6, y + 52 + name.height, short, 10, '#9aa5b8').setWordWrapWidth(w - 12).setLineSpacing(1);
        // Keep it inside the tile.
        const room = y + 18 + h - 4 - effect.y;
        if (effect.height > room) effect.setText(short.slice(0, Math.max(10, Math.floor(short.length * (room / effect.height)) - 2)) + '…');
        items.push(name, effect);
        list.push({ r, bg });
      });
      tiles.set(slot, list);
    });
    items.push(
      this.s.button(cx - 130, WORLD.height - 62, 'Choose for me', 15, '#2b3445', () => {
        for (const slot of slots) {
          if (chosen.has(slot)) continue;
          const options = trainOptions(run, slot);
          if (options.length) chosen.set(slot, autoChoose(run.team[slot], options));
        }
        update();
      }),
      confirm,
    );
    update();
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
    // The panel fits its text and buttons.
    const top = 180;
    const body = this.s.text(cx, top + 112, def.text, 14, '#e6e9f0').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(420);
    const choices = eventChoices(run);
    const firstButton = body.y + body.height + 44;
    const bottom = firstButton + (choices.length - 1) * 58 + 40;
    const items: Phaser.GameObjects.GameObject[] = [
      this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.96).setOrigin(0, 0).setInteractive(),
      this.s.add.rectangle(cx, (top + bottom) / 2, 470, bottom - top, 0x161c28).setStrokeStyle(2, 0xb57bff),
      this.s.add.image(cx, top + 34, 'icon-nd-event').setScale(40 / ICON_PX),
      this.s.text(cx, top + 72, def.title, 24, '#e0c3ff').setOrigin(0.5, 0).setFontStyle('bold'),
      body,
    ];
    const choose = (i: number) => {
      const result = chooseEvent(run, i);
      saveRun(run);
      this.showEventResult(def.title, result);
    };
    choices.forEach((c, i) => {
      items.push(
        this.s.button(cx, firstButton + i * 58, c.label, 17, i === 0 ? '#6d3fb5' : '#2b3445', () => {
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
        this.s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.96).setOrigin(0, 0).setInteractive(),
        ...(() => {
          // Fit the panel to the result text.
          const top = 230;
          const text = this.s.text(cx, top + 76, result, 15, '#ffffff').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(420);
          const buttonY = text.y + text.height + 46;
          const bottom = buttonY + 40;
          return [
            this.s.add.rectangle(cx, (top + bottom) / 2, 470, bottom - top, 0x161c28).setStrokeStyle(2, 0xb57bff),
            this.s.text(cx, top + 32, title, 22, '#e0c3ff').setOrigin(0.5, 0).setFontStyle('bold'),
            text,
            this.s.button(cx, buttonY, 'Continue', 18, '#2e86de', go),
          ];
        })(),
      ])
      .setDepth(100);
    if (this.s.auto) {
      const token = this.s.overlay;
      this.s.time.delayedCall(1600, () => this.s.overlay === token && go());
    }
  }

  /** What the last fight paid, at the top of the pick after an elite or boss (instead of a separate pop-up). */
  private spoilsStrip(): Phaser.GameObjects.GameObject[] {
    const run = this.s.run!;
    if (!run.lastSpoils) return [];
    const cx = WORLD.width / 2;
    const strip = this.s.text(cx, 72, run.lastSpoils, 13, '#ffe066').setOrigin(0.5).setAlign('center').setWordWrapWidth(500).setFontStyle('bold');
    strip.setStroke('#000000', 3);
    return [this.s.add.rectangle(cx, 72, WORLD.width - 20, Math.max(30, strip.height + 10), 0x2a2210, 0.95).setStrokeStyle(1, 0xffd166), strip];
  }

  // --- upgrade picks ------------------------------------------------------------

  showUpgrade(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'upgrade') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const title = p.source === 'chest' ? `Chest opened!${p.gold ? ` +${p.gold} gold` : ''}` : 'Elite spoils';
    const items = this.frame(title, 'Choose a reward for one of your heroes.');
    items.push(...this.spoilsStrip());
    let y = 196;
    p.options.forEach((o: PartyReward) => {
      const c = this.card(run, o.slot, o.reward, y, () => {
        chooseUpgrade(run, o);
        this.done();
      });
      items.push(...c.items);
      y += c.h + 10;
    });
    items.push(
      this.s.button(cx, y + 26, 'Skip', 14, '#2b3445', () => {
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
    let y = 186;
    p.stock.forEach((item, k) => {
      const label = item.sold ? 'Sold' : `${item.price} gold`;
      const can = !item.sold && run.gold >= item.price;
      const card = this.card(
        run,
        item.slot,
        item.reward,
        y,
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
      if (!can) for (const o of card.items) (o as Phaser.GameObjects.Image).setAlpha(item.sold ? 0.35 : 0.6);
      items.push(...card.items);
      y += card.h + 8;
    });
    y += 30;
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
