import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { BOSS_INFO, BOSS_RULES, ABILITIES, HERO_MOVE, PASSIVES, RESOURCES, TRAITS, UPGRADE, WORLD } from '../sim/content';
import { type EnemyKind, type HeroClass } from '../sim/types';
import { gearLines } from '../sim/camp';
import { COLORS, cssColor, effectInfo, effectIcon, abilityIcon, traitIcon, passiveIcon, ICON_PX } from './theme';

/** The inspect window: stats, abilities and effects of one unit. */
export class Inspect {
  constructor(readonly s: BattleScene) {}

  // --- inspect window -------------------------------------------------------

  /** Unit shown in the inspect window, if open. */
  inspectId: number | null = null;
  inspectUi?: { box: Phaser.GameObjects.Rectangle; rows: Phaser.GameObjects.Container; title: Phaser.GameObjects.Text; container: Phaser.GameObjects.Container };
  inspectRefresh = 0;

  openInspect(id: number): void {
    this.closeInspect();
    const u = this.s.battle.unit(id);
    if (!u) return;
    this.inspectId = id;
    const x = 16;
    const y = 134;
    const w = WORLD.width - 32;
    const box = this.s.add.rectangle(x, y, w, 100, 0x0e131d, 0.96).setOrigin(0, 0).setStrokeStyle(2, u.side === 'hero' ? COLORS[u.kind] : 0xe74c3c).setInteractive();
    const title = this.s.text(x + 14, y + 12, '', 18, '#ffd166').setFontStyle('bold');
    const rows = this.s.add.container(0, 0);
    const close = this.s.text(x + w - 10, y + 8, '✕', 20, '#c9d1e0')
      .setOrigin(1, 0)
      .setPadding(8, 2, 8, 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.closeInspect();
        this.s.battle.setFocus(null);
      });
    const container = this.s.add.container(0, 0, [box, title, rows, close]).setDepth(95);
    this.inspectUi = { box, rows, title, container };
    this.refreshInspect();
  }

  closeInspect(): void {
    this.inspectUi?.container.destroy();
    this.inspectUi = undefined;
    this.inspectId = null;
  }

  /** Rebuild the inspect rows (a few times a second, so health stays live). Icons sit to the left of abilities, passives and effects. */
  refreshInspect(): void {
    const ui = this.inspectUi;
    if (!ui || this.inspectId === null) return;
    const u = this.s.battle.unit(this.inspectId);
    if (!u?.alive) {
      this.closeInspect();
      return;
    }
    type Row = { text: string; icon?: string; header?: boolean; muted?: boolean; gap?: boolean };
    const rows: Row[] = [];
    const stats: string[] = [`Health: ${Math.ceil(u.hp)} / ${u.maxHp}`];
    if (u.side === 'hero' && u.resourceKind) stats.push(`${RESOURCES[u.resourceKind].label}: ${Math.floor(u.resource ?? 0)} / ${u.maxResource}`);
    stats.push(`Attack: ${Math.round(u.damage)} damage every ${u.attackInterval}s (${u.attackStyle}, range ${u.range})`);
    if (u.heal) stats.push(`Auto-heal: ${Math.round(u.heal)} on the most hurt ally`);
    stats.push(`Move speed: ${u.side === 'hero' ? HERO_MOVE.speed : u.speed}`);
    if (u.side === 'hero' && u.isTank) stats.push(`Role: tank (threat x${u.threatMultiplier ?? 1}${u.armor ? `, armor ${Math.round(u.armor * 100)}%` : ''})`);
    rows.push({ text: stats.join('\n') });
    if (u.side === 'hero') {
      const passive = u.passive ? PASSIVES[u.passive] : undefined;
      if (passive) {
        rows.push({ text: 'Passive', header: true, gap: true });
        rows.push({ text: `${passive.name} — ${passive.description}`, icon: passiveIcon(passive.id) });
      }
      rows.push({ text: 'Abilities', header: true, gap: true });
      for (const a of u.abilities ?? []) {
        const def = ABILITIES[a.id];
        const cost = this.s.battle.abilityCost(u, a.id);
        const costText = cost ? `${cost} ${RESOURCES[u.resourceKind!].label.toLowerCase()}` : 'free';
        const cd = this.s.battle.abilityCooldown(a);
        const ups = [a.mastery ? ABILITIES[a.id].mastery.name : '', a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(', ');
        rows.push({
          text: `${def.name}${ups ? ` (${ups})` : ''} — ${costText}, ${cd % 1 ? cd.toFixed(1) : cd}s\n${this.s.battle.abilityEffectText(u, a)}`,
          icon: abilityIcon(a.id),
        });
      }
      for (const t of u.traits ?? []) rows.push({ text: `${TRAITS[t].name} (passive) — ${TRAITS[t].description}`, icon: traitIcon(t) });
      // Upgrades: this run's stat upgrades, then the camp's gear.
      const build = this.s.run?.builds[u.slot ?? 0];
      const ups: string[] = [];
      if (build?.might) ups.push(`Might ${build.might} (+${Math.round(UPGRADE.mightPerRank * build.might * 100)}% damage and healing)`);
      if (build?.vitality) ups.push(`Vitality ${build.vitality} (+${Math.round(UPGRADE.vitalityPerRank * build.vitality * 100)}% max health)`);
      if (build?.focus) ups.push(`Focus ${build.focus} (+${Math.round(UPGRADE.focusPerRank * build.focus * 100)}% regen)`);
      const gear = gearLines(this.s.camp.gear[u.kind as HeroClass]);
      const daily = this.s.run?.daily ? ['Daily run: no camp gear'] : [];
      rows.push({ text: 'Upgrades', header: true, gap: true });
      rows.push({ text: [...ups, ...(daily.length ? daily : gear.map((g) => `Camp: ${g}`))].join('\n') || 'None yet', muted: !ups.length && (!gear.length || !!daily.length) });
    } else {
      const notes = [u.isElite ? 'Elite' : '', u.isCaster ? 'Caster (can be interrupted)' : ''].filter(Boolean);
      if (notes.length) rows.push({ text: notes.join(' · ') });
      if (u.casting) rows.push({ text: `Casting: ${u.casting.spell} (${u.casting.remaining.toFixed(1)}s)${u.casting.unstoppable ? ' — unstoppable' : ''}` });
      const boss = BOSS_INFO[u.kind as EnemyKind];
      if (boss) {
        rows.push({ text: 'Boss moves', header: true, gap: true });
        for (const move of boss.moves) rows.push({ text: `• ${move.name}: ${move.text}` });
        rows.push({ text: BOSS_RULES, muted: true });
      }
    }
    const effects = (u.effects ?? []).filter((e) => e.remaining > 0);
    if (effects.length) {
      rows.push({ text: 'Effects', header: true, gap: true });
      for (const e of effects) {
        const info = effectInfo(e);
        rows.push({ text: `${info.name}${Number.isFinite(e.remaining) ? ` (${Math.ceil(e.remaining)}s)` : ''} — ${info.text(e)}`, icon: effectIcon(e) });
      }
    }
    ui.title
      .setText(`${u.label}${u.side === 'hero' ? ` — level ${u.level ?? 1}` : ''}`)
      .setColor(u.side === 'hero' ? cssColor(COLORS[u.kind]) : '#ff8a8a');

    // Lay the rows out top to bottom.
    ui.rows.removeAll(true);
    const left = ui.box.x + 14;
    const width = ui.box.width - 28;
    const iconSize = 20;
    let y = ui.box.y + 42;
    for (const r of rows) {
      if (r.gap) y += 6;
      const hasIcon = !!r.icon && this.s.textures.exists(r.icon);
      const tx = hasIcon ? left + iconSize + 8 : left;
      const t = this.s.text(tx, y, r.text, r.header ? 14 : 13, r.header ? '#ffd166' : r.muted ? '#8f9bb3' : '#ffffff')
        .setWordWrapWidth(width - (tx - left))
        .setLineSpacing(2);
      if (r.header) t.setFontStyle('bold');
      ui.rows.add(t);
      if (hasIcon) ui.rows.add(this.s.add.image(left, y + 1, r.icon!).setOrigin(0, 0).setScale(iconSize / ICON_PX));
      y += Math.max(t.height, hasIcon ? iconSize : 0) + 4;
    }
    ui.box.setSize(ui.box.width, y - ui.box.y + 10);
  }
}
