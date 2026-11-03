import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import type { Battle } from '../sim/battle';
import { WORLD } from '../sim/content';
import { ABILITIES, PASSIVES, TRAITS } from '../sim/content';
import { PIXEL_ICONS } from './pixelArt';
import { COLORS, ICON_PX } from './theme';

const W = 168;
const ROW = 17;
const RIGHT = WORLD.width - 12;
const MODE_KEY = 'fightwithfriends.meterMode';
/** The "Last fight" button on the map and pick screens (bottom-right, by the hint line). */
const BUTTON_Y = WORLD.height - 20;

type Mode = 'damage' | 'healing';
type Hero = { id: number; label: string; kind: string };

/** The last fight's numbers, kept across scene restarts so the map and pick screens can show them. */
let lastFight: { heroes: Hero[]; meter: Battle['meter'] } | undefined;
/** Whether the last-fight panel is open on the map and pick screens. */
let openAfter = false;

/**
 * The damage meter: a small panel in the bottom-right of the field with each
 * hero's damage (or healing, with the toggle) this fight. Hover or tap a bar
 * for what it was made of, auto-attacks included.
 */
export class Meter {
  constructor(readonly s: BattleScene) {}

  private mode: Mode = loadMode();
  private ui?: Phaser.GameObjects.Container;
  private tip?: Phaser.GameObjects.Container;
  /** The hero whose breakdown is open (kept while the numbers update). */
  private tipFor?: number;
  private refresh = 0;

  /** Where the panel is: over the field during and right after a fight, or behind a button on the map. */
  private placement: 'field' | 'after' | 'none' = 'none';
  private button?: Phaser.GameObjects.Text;
  private bottom = WORLD.hudTop - 10;
  private depth = 60;

  update(deltaMs: number): void {
    const state = this.s.state;
    const b = this.s.battle;
    const fought = b.heroes.length > 0 && b.time > 0;
    // During a fight and on the screens straight after it (spoils, game over), the live numbers.
    if (fought && (state === 'playing' || state === 'paused' || state === 'spoils' || state === 'over')) {
      lastFight = { heroes: b.heroes.map((h) => ({ id: h.id, label: h.label, kind: h.kind })), meter: b.meter };
      if (state === 'playing') openAfter = false;
      this.place('field', state === 'playing' || state === 'paused' ? 60 : 130, WORLD.hudTop - 10);
    } else if (lastFight && (state === 'map' || state === 'choice')) {
      this.place('after', 130, BUTTON_Y - 16);
    } else {
      this.place('none', 0, 0);
      return;
    }
    this.refresh -= deltaMs;
    if (this.ui && this.refresh > 0) return;
    this.refresh = 250;
    const show = this.placement === 'field' || openAfter;
    if (!show) {
      this.ui?.destroy();
      this.ui = undefined;
      this.rows.clear();
      this.hideTip();
      return;
    }
    if (!this.ui || this.rows.size !== this.heroes().length) this.build();
    this.fill();
  }

  /** Move the panel (and the "Last fight" button) when the screen changes. */
  private place(placement: 'field' | 'after' | 'none', depth: number, bottom: number): void {
    if (placement === this.placement && depth === this.depth) return;
    this.placement = placement;
    this.depth = depth;
    this.bottom = bottom;
    this.ui?.destroy();
    this.ui = undefined;
    this.rows.clear();
    this.hideTip();
    this.button?.destroy();
    this.button = undefined;
    this.refresh = 0;
    if (placement !== 'after') return;
    this.button = this.s
      .text(RIGHT, BUTTON_Y, '📊 Last fight', 12, '#ffffff')
      .setOrigin(1, 0.5)
      .setPadding(8, 3, 8, 3)
      .setBackgroundColor('#2b3445')
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    this.button.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      openAfter = !openAfter;
      this.refresh = 0;
    });
  }

  private heroes(): Hero[] {
    return this.placement === 'after' ? (lastFight?.heroes ?? []) : this.s.battle.heroes.map((h) => ({ id: h.id, label: h.label, kind: h.kind }));
  }

  private data(): Battle['meter'] {
    return this.placement === 'after' ? (lastFight?.meter ?? new Map()) : this.s.battle.meter;
  }

  private totals(): { id: number; name: string; color: number; total: number; parts: [string, number][] }[] {
    const heroes = this.heroes();
    const meter = this.data();
    return heroes
      .map((h) => {
        const parts = Object.entries(meter.get(h.id)?.[this.mode] ?? {}).sort((a, b) => b[1] - a[1]);
        return { id: h.id, name: h.label, color: COLORS[h.kind] ?? 0xffffff, total: parts.reduce((a, [, v]) => a + v, 0), parts };
      })
      .sort((a, b) => b.total - a.total);
  }

  /** One row per hero, made once and updated in place (so taps never land on a half-rebuilt panel). */
  private rows = new Map<number, { bg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; name: Phaser.GameObjects.Text; num: Phaser.GameObjects.Text }>();
  private title?: Phaser.GameObjects.Text;
  private toggle?: Phaser.GameObjects.Text;
  private top = 0;

  private build(): void {
    const heroes = this.heroes();
    const h = 24 + heroes.length * ROW + 4;
    const left = RIGHT - W;
    this.top = this.bottom - h;
    this.ui?.destroy();
    this.rows.clear();
    const items: Phaser.GameObjects.GameObject[] = [this.s.add.rectangle(left, this.top, W, h, 0x0b0e14, 0.72).setOrigin(0, 0).setStrokeStyle(1, 0x3a4660)];
    this.title = this.s.text(left + 6, this.top + 5, '', 12, '#e6e9f0').setFontStyle('bold');
    // The toggle.
    this.toggle = this.s.text(RIGHT - 6, this.top + 4, '', 11, '#ffffff').setOrigin(1, 0).setPadding(5, 1, 5, 1).setInteractive({ useHandCursor: true });
    this.toggle.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.mode = this.mode === 'damage' ? 'healing' : 'damage';
      saveMode(this.mode);
      this.fill();
    });
    items.push(this.title, this.toggle);
    for (const hero of heroes) {
      const bg = this.s.add.rectangle(left + 4, 0, W - 8, ROW - 2, 0x1c2433, 0.9).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const bar = this.s.add.rectangle(left + 4, 0, 2, ROW - 2, COLORS[hero.kind] ?? 0xffffff, 0.75).setOrigin(0, 0);
      const name = this.s.text(left + 8, 0, hero.label, 11, '#ffffff');
      name.setStroke('#000000', 3);
      const num = this.s.text(RIGHT - 8, 0, '0', 11, '#ffffff').setOrigin(1, 0);
      num.setStroke('#000000', 3);
      bg.on('pointerover', () => this.showTip(hero.id));
      bg.on('pointerout', () => this.hideTip());
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        // Tap (phones): open, or close if it's already open.
        ev.stopPropagation();
        if (this.tipFor === hero.id) this.hideTip();
        else this.showTip(hero.id);
      });
      this.rows.set(hero.id, { bg, bar, name, num });
      items.push(bg, bar, name, num);
    }
    this.ui = this.s.add.container(0, 0, items).setDepth(this.depth);
  }

  /** Update the numbers, bar lengths and order. */
  private fill(): void {
    if (!this.title || !this.toggle) return;
    this.title.setText(this.placement === 'after' ? 'Last fight' : this.mode === 'damage' ? 'Damage' : 'Healing');
    this.toggle.setText(this.mode === 'damage' ? 'DMG ⇄' : 'HEAL ⇄').setBackgroundColor(this.mode === 'damage' ? '#7a2e2e' : '#1e6f50');
    const totals = this.totals();
    const max = Math.max(1, ...totals.map((r) => r.total));
    totals.forEach((r, i) => {
      const row = this.rows.get(r.id);
      if (!row) return;
      const y = this.top + 24 + i * ROW;
      row.bg.setY(y);
      row.bar.setY(y).setSize(Math.max(2, ((W - 8) * r.total) / max), ROW - 2);
      row.name.setY(y + 1);
      row.num.setY(y + 1).setText(formatNumber(r.total));
    });
    if (this.tipFor !== undefined) this.showTip(this.tipFor);
  }

  /** The breakdown for one hero: each source, its total and share. */
  private showTip(id: number): void {
    const row = this.totals().find((r) => r.id === id);
    this.tip?.destroy();
    this.tipFor = id;
    if (!row) return;
    // One line per source: its icon, name, amount and share. (No header: the bar says whose it is.)
    const LINE = 16;
    const items: Phaser.GameObjects.GameObject[] = [];
    const texts: Phaser.GameObjects.Text[] = [];
    if (!row.parts.length) texts.push(this.s.text(0, 0, this.mode === 'damage' ? 'No damage yet' : 'No healing yet', 11, '#e6e9f0'));
    for (const [key, v] of row.parts) {
      const src = meterSource(key);
      texts.push(this.s.text(0, 0, `${src.name}  ${formatNumber(v)}  (${Math.round((100 * v) / Math.max(1, row.total))}%)`, 11, '#e6e9f0'));
    }
    const w = Math.max(...texts.map((t) => t.width)) + (row.parts.length ? 34 : 14);
    const h = texts.length * LINE + 8;
    const x = RIGHT - W - 8 - w;
    const y = Math.max(110, this.bottom - h);
    items.push(this.s.add.rectangle(x, y, w, h, 0x0b0e14, 0.92).setOrigin(0, 0).setStrokeStyle(1, row.color));
    texts.forEach((t, i) => {
      const ly = y + 4 + i * LINE;
      if (row.parts.length) {
        items.push(this.s.add.image(x + 7, ly + 1, meterSource(row.parts[i][0]).icon).setOrigin(0, 0).setScale(14 / ICON_PX));
        t.setPosition(x + 27, ly + 1);
      } else t.setPosition(x + 7, ly + 1);
      items.push(t);
    });
    this.tip = this.s.add.container(0, 0, items).setDepth(this.depth + 1);
  }

  private hideTip(): void {
    this.tip?.destroy();
    this.tip = undefined;
    this.tipFor = undefined;
  }
}

function formatNumber(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'healing' ? 'healing' : 'damage';
  } catch {
    return 'damage';
  }
}

function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* fine: the mode just won't be remembered */
  }
}

/** What a meter source id is called, and its icon. */
export function meterSource(key: string): { name: string; icon: string } {
  const fixed: Record<string, { name: string; icon: string }> = {
    auto: { name: 'Auto-attack', icon: 'icon-nd-fight' },
    autoHeal: { name: 'Auto-heal', icon: 'icon-ef-hot' },
    dot: { name: 'Damage over time', icon: 'icon-ef-dot' },
    other: { name: 'Other', icon: 'icon-ef-hot' },
  };
  if (fixed[key]) return fixed[key];
  const [id, part] = key.split(':');
  const ability = (ABILITIES as Record<string, { name: string } | undefined>)[id];
  const passive = (PASSIVES as Record<string, { name: string } | undefined>)[id];
  const trait = (TRAITS as Record<string, { name: string } | undefined>)[id];
  const base = ability?.name ?? passive?.name ?? trait?.name ?? id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const name = part === 'dot' ? `${base} (over time)` : part === 'absorb' ? `${base} (absorbed)` : base;
  const candidates = [part === 'dot' ? `icon-ef-dot-${id}` : '', `icon-ab-${id}`, `icon-pa-${id}`, `icon-tr-${id}`, part === 'dot' ? 'icon-ef-dot' : '', part === 'absorb' ? 'icon-ef-shield' : ''];
  const icon = candidates.find((k) => k && PIXEL_ICONS[k]) ?? 'icon-ef-empower';
  return { name, icon };
}
