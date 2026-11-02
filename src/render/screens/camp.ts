import type { BattleScene } from '../BattleScene';
import Phaser from 'phaser';
import { CAMP, partySize, WORLD } from '../../sim/content';
import { sound } from '../sound';
import { ALL_CLASSES, clearRun, loadRun, saveRun } from '../../sim/run';
import {
  canAfford,
  costText,
  drillsCost,
  GEAR_SLOTS,
  gearCost,
  loadCamp,
  LOOT_NAMES,
  newCampRun,
  saveCamp,
  STATIONS,
  upgradeDrills,
  upgradeGear,
  type CampState,
} from '../../sim/camp';
import type { HeroClass, Loot } from '../../sim/types';
import { COLORS } from '../theme';

const name = (cls: HeroClass) => cls[0].toUpperCase() + cls.slice(1);

/** The last party and starting round (kept across scene restarts for this session). */
const lastChoice: { party: HeroClass[]; start: number } = { party: [], start: 1 };

/**
 * Camp Mode's home screen: the loot, every hero and their gear, the four
 * stations, where to start from and who goes. Enemies never reach it.
 */
export class CampScreen {
  constructor(readonly s: BattleScene) {}

  camp: CampState = loadCamp();
  /** The hero whose gear the stations show. */
  selected: HeroClass = 'warrior';
  /** Remembered from the last run, so heading out again is one tap. */
  party: HeroClass[] = [...lastChoice.party];
  start = lastChoice.start;

  show(): void {
    const s = this.s;
    s.state = 'camp';
    s.overlay?.destroy();
    this.camp = loadCamp();
    if (!this.camp.unlocked.includes(this.start)) this.start = 1;
    const size = partySize(this.start);
    this.party = this.party.slice(0, size);
    const cx = WORLD.width / 2;
    const camp = this.camp;
    const saved = loadRun('camp');
    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0b0e14, 0.94).setOrigin(0, 0).setInteractive(),
      s.text(cx, 22, 'The Camp', 28, '#ffd166').setOrigin(0.5, 0).setFontStyle('bold'),
      s.button(46, 38, '◀', 14, '#2b3445', () => {
        sound.play('click');
        s.scene.restart({});
      }),
      s.text(cx, 62, lootLine(camp.loot), 13, '#ffffff').setOrigin(0.5, 0),
      s.text(cx, 82, `Best: round ${camp.best} · Runs: ${camp.runs}${camp.wins ? ` · Round ${CAMP.finalRound} beaten ${camp.wins}x` : ''}`, 11, '#8f9bb3').setOrigin(0.5, 0),
    ];

    // The six heroes: tap a card to see its gear; "+ Party" to bring them.
    ALL_CLASSES.forEach((cls, i) => {
      const x = i % 2 ? 404 : 136;
      const y = 152 + Math.floor(i / 2) * 96;
      const inParty = this.party.includes(cls);
      const bg = s.add
        .rectangle(x, y, 258, 88, inParty ? 0x22314a : 0x161c28)
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
        ...s.teamScreens.portrait(cls, x - 100, y + 30, 1.5),
        s.text(x - 70, y - 36, name(cls), 16, '#ffffff').setFontStyle('bold'),
        s.text(x - 70, y - 14, `Weapon ${g.weapon} · Armor ${g.armor} · Trinket ${g.trinket}`, 11, '#c9d1e0'),
      );
      const full = !inParty && this.party.length >= size;
      items.push(
        s.text(x + 120, y + 30, inParty ? '✓ In party' : '+ Party', 12, '#ffffff')
          .setOrigin(1, 1)
          .setPadding(8, 4, 8, 4)
          .setBackgroundColor(inParty ? '#1e6f50' : full ? '#2b3445' : '#2e86de')
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            if (full) return;
            sound.play('click');
            this.party = inParty ? this.party.filter((c) => c !== cls) : [...this.party, cls];
            this.show();
          }),
      );
      if (inParty) items.push(s.add.circle(x - 118, y - 34, 5, COLORS[cls]));
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
        `Placeholder: heroes start each run ${camp.drills} level${camp.drills === 1 ? '' : 's'} higher (+1 per level).`,
        drillsCost(camp.drills),
        () => upgradeDrills(camp),
      ),
    );
    y += 66;

    // Where to start, who goes, and Set out.
    items.push(s.text(24, y, 'Start from:', 13, '#c9d1e0'));
    CAMP.starts.forEach((r, i) => {
      const open = camp.unlocked.includes(r);
      const on = r === this.start;
      items.push(
        s.text(150 + i * 126, y - 4, open ? `Round ${r}` : `Round ${r} 🔒`, 13, open ? '#ffffff' : '#5d6880')
          .setPadding(10, 5, 10, 5)
          .setBackgroundColor(on ? '#2e86de' : '#1c2433')
          .setInteractive({ useHandCursor: open })
          .on('pointerdown', () => {
            if (!open) return;
            sound.play('click');
            this.start = r;
            this.show();
          }),
      );
    });
    y += 36;
    const slots = Array.from({ length: size }, (_, i) => (this.party[i] ? name(this.party[i]) : '—'));
    items.push(s.text(24, y, `Party (${size}): ${slots.join(', ')}`, 13, '#ffffff'));
    y += 50;

    if (saved) {
      items.push(
        s.button(cx - 60, y, `▶ Continue run — round ${saved.wave}`, 18, '#1e6f50', () => {
          sound.unlock();
          sound.play('click');
          s.scene.restart({ run: saved });
        }),
        s.button(cx + 180, y, 'Abandon', 13, '#5a2a2a', () => {
          sound.play('click');
          clearRun('camp');
          this.show();
        }),
      );
    } else {
      const ready = this.party.length === size;
      items.push(
        s.button(cx, y, ready ? 'Set out ▶' : `Pick ${size - this.party.length} more for the party`, 20, ready ? '#2e86de' : '#2b3445', () => {
          if (!ready) return;
          sound.unlock();
          sound.play('click');
          lastChoice.party = [...this.party];
          lastChoice.start = this.start;
          const run = newCampRun(this.party, this.start, camp);
          camp.runs += 1;
          saveCamp(camp);
          saveRun(run);
          s.scene.restart({ run });
        }),
      );
    }
    items.push(s.text(cx, y + 44, 'Every fight’s loot comes home, win or lose. One defeat ends the run.', 11, '#8f9bb3').setOrigin(0.5));
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
