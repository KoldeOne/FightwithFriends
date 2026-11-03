import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { ABILITIES, TRAITS, WORLD } from '../../sim/content';
import {
  autoResolve,
  buy,
  chooseUpgrade,
  describeReward,
  leaveShop,
  reroll,
  rerollPrice,
  rewardPreview,
  saveRun,
  train,
  trainableSlots,
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
    else this.showShop();
    // Auto makes the choice after a moment (enough to see what it was).
    if (this.s.auto && p.kind !== 'recruit') {
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

  // --- campsite training ------------------------------------------------------

  /** Training: choose a hero, then one of three new abilities for them. */
  showTrain(slot?: number): void {
    const run = this.s.run!;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const items = this.frame('Campsite: training', slot === undefined ? 'Choose a hero to train. They learn one new ability.' : `Choose what ${heroName(run, slot)} learns.`);
    if (slot === undefined) {
      trainableSlots(run).forEach((i, k) => {
        const y = 200 + k * 92;
        const b = run.builds[i];
        const bg = this.s.add.rectangle(cx, y + 40, 480, 82, 0x1c2433).setStrokeStyle(2, COLORS[run.team[i]]).setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => {
          sound.play('click');
          this.showTrain(i);
        });
        items.push(bg, ...this.s.heroPicker.portrait(run.team[i], cx - 205, y + 72, 1.6));
        items.push(this.s.text(cx - 170, y + 10, `${heroName(run, i)} — level ${b.level}`, 16, '#ffffff').setFontStyle('bold'));
        [...b.abilities.map((a) => abilityIcon(a.id)), ...b.traits.map((t) => traitIcon(t))].forEach((key, j) =>
          items.push(this.s.add.image(cx - 170 + j * 26, y + 38, key).setOrigin(0, 0).setScale(22 / ICON_PX)),
        );
        const names = [...b.abilities.map((a) => ABILITIES[a.id].name), ...b.traits.map((t) => TRAITS[t].name)].join(', ');
        items.push(this.s.text(cx - 30, y + 42, names, 11, '#8f9bb3').setWordWrapWidth(250));
      });
    } else {
      trainOptions(run, slot).forEach((r, k) => {
        items.push(
          ...this.card(run, slot, r, 200 + k * 140, 128, () => {
            train(run, slot, r);
            this.done();
          }),
        );
      });
      items.push(this.s.button(cx, 640, '← Another hero', 15, '#2b3445', () => this.showTrain()));
    }
    this.s.overlay = this.s.add.container(0, 0, items).setDepth(100);
  }

  // --- upgrade picks ------------------------------------------------------------

  showUpgrade(): void {
    const run = this.s.run!;
    const p = run.pending;
    if (p?.kind !== 'upgrade') return;
    this.s.overlay?.destroy();
    const cx = WORLD.width / 2;
    const titles = { chest: 'Chest opened!', elite: 'Elite spoils', boss: 'Boss spoils', campsite: 'Campsite' };
    const sub = p.source === 'chest' ? `+${p.gold ?? 0} gold. Choose an upgrade.` : 'Choose an upgrade for one of your heroes.';
    const items = this.frame(titles[p.source], sub);
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
