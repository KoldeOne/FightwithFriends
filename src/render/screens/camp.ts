import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { WORLD } from '../../sim/content';
import { sound } from '../sound';
import { ALL_CLASSES } from '../../sim/run';
import {
  canAfford,
  costText,
  drillsCost,
  GEAR_SLOTS,
  gearCost,
  loadCamp,
  gearShort,
  LOOT_NAMES,
  saveCamp,
  STATIONS,
  upgradeDrills,
  upgradeGear,
  type CampState,
} from '../../sim/camp';
import type { HeroClass, Loot } from '../../sim/types';

const name = (cls: HeroClass) => cls[0].toUpperCase() + cls.slice(1);

/**
 * The camp, between map runs: the loot every fight has sent home, each hero's
 * gear, and the four stations. Whatever is bought here goes with every hero of
 * that class on every later run.
 */
export class CampScreen {
  constructor(readonly s: BattleScene) {}

  camp: CampState = loadCamp();
  /** The hero whose gear the stations show. */
  selected: HeroClass = 'warrior';

  show(): void {
    const s = this.s;
    s.state = 'camp';
    s.overlay?.destroy();
    this.camp = loadCamp();
    const cx = WORLD.width / 2;
    const camp = this.camp;
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.94).setOrigin(0, 0).setInteractive(),
      s.text(cx, 22, 'The Camp', 28, '#ffd166').setOrigin(0.5, 0).setFontStyle('bold'),
      s.button(46, 38, '◀', 14, '#2b3445', () => {
        sound.play('click');
        s.scene.restart({});
      }),
      s.text(cx, 62, lootLine(camp.loot), 13, '#ffffff').setOrigin(0.5, 0),
      s.text(cx, 82, `Runs: ${camp.runs} · Every fight's loot comes home, win or lose.`, 11, '#8f9bb3').setOrigin(0.5, 0),
    ];

    // The six heroes: tap a card to see (and upgrade) its gear.
    ALL_CLASSES.forEach((cls, i) => {
      const x = i % 2 ? 404 : 136;
      const y = 152 + Math.floor(i / 2) * 96;
      const bg = s.add
        .rectangle(x, y, 258, 88, cls === this.selected ? 0x22314a : 0x161c28)
        .setStrokeStyle(2, cls === this.selected ? 0xffd166 : 0x3a4660)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sound.play('click');
          this.selected = cls;
          this.show();
        });
      const g = camp.gear[cls];
      items.push(
        bg,
        ...s.heroPicker.portrait(cls, x - 100, y + 30, 1.5),
        s.text(x - 70, y - 36, name(cls), 16, '#ffffff').setFontStyle('bold'),
        s.text(x - 70, y - 14, `Weapon ${g.weapon} · Armor ${g.armor} · Trinket ${g.trinket}`, 11, '#c9d1e0'),
        s.text(x - 70, y + 2, gearShort(g), 10, '#9ad1ff').setWordWrapWidth(185),
      );
    });

    // The stations for the selected hero, then the Training station.
    let y = 440;
    items.push(s.text(24, y, `${name(this.selected)}'s gear`, 16, '#ffd166').setFontStyle('bold'));
    y += 30;
    for (const slot of GEAR_SLOTS) {
      const st = STATIONS[slot];
      const lv = camp.gear[this.selected][slot];
      const cost = gearCost(slot, lv);
      items.push(...this.stationRow(y, `${st.station} — ${st.item} level ${lv}`, lv ? st.effect(lv) : `Next level: ${st.effect(1)}`, cost, () => upgradeGear(camp, this.selected, slot)));
      y += 58;
    }
    items.push(
      ...this.stationRow(
        y,
        `Training station — Drills ${camp.drills}`,
        `Placeholder: heroes start runs (and recruits join) +${camp.drills} level${camp.drills === 1 ? '' : 's'}.`,
        drillsCost(camp.drills),
        () => upgradeDrills(camp),
      ),
    );
    y += 66;

    items.push(
      s.button(cx, y + 30, 'New run ▶', 20, '#2e86de', () => {
        sound.unlock();
        sound.play('click');
        s.scene.restart({});
      }),
    );
    s.overlay = s.add.container(0, 0, items).setDepth(100);
  }

  /** One station: what it does now, what the next level costs, and Upgrade. */
  private stationRow(y: number, title: string, effect: string, cost: Partial<Loot> | null, buy: () => boolean): Phaser.GameObjects.GameObject[] {
    const s = this.s;
    const ok = canAfford(this.camp.loot, cost);
    return [
      s.text(24, y, title, 14, '#ffffff').setFontStyle('bold'),
      s.text(24, y + 18, effect, 11, '#9ad1ff').setWordWrapWidth(380),
      s.text(24, y + 34, cost ? `Next level: ${costText(cost)}` : 'Max level', 11, ok ? '#7dff9b' : '#8f9bb3'),
      s.text(WORLD.width - 20, y + 10, cost ? 'Upgrade' : 'Max', 13, '#ffffff')
        .setOrigin(1, 0)
        .setPadding(12, 6, 12, 6)
        .setBackgroundColor(ok ? '#2e86de' : '#2b3445')
        .setInteractive({ useHandCursor: ok })
        .on('pointerdown', () => {
          if (!ok || !buy()) return;
          sound.play('levelUp');
          saveCamp(this.camp);
          this.show();
        }),
    ];
  }
}

function lootLine(loot: Loot): string {
  return (Object.keys(loot) as (keyof Loot)[]).map((k) => `${LOOT_NAMES[k]} ${loot[k]}`).join(' · ');
}
