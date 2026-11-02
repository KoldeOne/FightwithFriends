import type { BattleScene } from './BattleScene';
import Phaser from 'phaser';
import { ABILITIES, HERO_MOVE, PASSIVES, RESOURCES, TRAITS, WORLD } from '../sim/content';
import { type Unit } from '../sim/types';
import { COLORS, effectInfo } from './theme';

/** The inspect window: stats, abilities and effects of one unit. */
export class Inspect {
  constructor(readonly s: BattleScene) {}

  // --- inspect window -------------------------------------------------------

  /** Unit shown in the inspect window, if open. */
  inspectId: number | null = null;
  inspectUi?: { box: Phaser.GameObjects.Rectangle; body: Phaser.GameObjects.Text; title: Phaser.GameObjects.Text; container: Phaser.GameObjects.Container };
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
    const body = this.s.text(x + 14, y + 42, '', 13, '#ffffff').setWordWrapWidth(w - 28).setLineSpacing(3);
    const close = this.s.text(x + w - 10, y + 8, '✕', 20, '#c9d1e0')
      .setOrigin(1, 0)
      .setPadding(8, 2, 8, 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.closeInspect();
        this.s.battle.setFocus(null);
      });
    const container = this.s.add.container(0, 0, [box, title, body, close]).setDepth(95);
    this.inspectUi = { box, body, title, container };
    this.refreshInspect();
  }

  closeInspect(): void {
    this.inspectUi?.container.destroy();
    this.inspectUi = undefined;
    this.inspectId = null;
  }

  /** Rebuild the inspect text (a few times a second, so health stays live). */
  refreshInspect(): void {
    const ui = this.inspectUi;
    if (!ui || this.inspectId === null) return;
    const u = this.s.battle.unit(this.inspectId);
    if (!u?.alive) {
      this.closeInspect();
      return;
    }
    const lines: string[] = [];
    lines.push(`Health: ${Math.ceil(u.hp)} / ${u.maxHp}`);
    if (u.side === 'hero' && u.resourceKind) lines.push(`${RESOURCES[u.resourceKind].label}: ${Math.floor(u.resource ?? 0)} / ${u.maxResource}`);
    lines.push(`Attack: ${Math.round(u.damage)} damage every ${u.attackInterval}s (${u.attackStyle}, range ${u.range})`);
    if (u.heal) lines.push(`Auto-heal: ${Math.round(u.heal)} on the most hurt ally`);
    lines.push(`Move speed: ${u.side === 'hero' ? HERO_MOVE.speed : u.speed}`);
    if (u.side === 'hero') {
      if (u.isTank) lines.push(`Role: tank (threat x${u.threatMultiplier ?? 1})`);
      const passive = u.passive ? PASSIVES[u.passive] : undefined;
      if (passive) lines.push('', `Passive — ${passive.name}: ${passive.description}`);
      lines.push('', 'Abilities:');
      for (const a of u.abilities ?? []) {
        const def = ABILITIES[a.id];
        const cost = this.s.battle.abilityCost(u, a.id);
        const costText = cost ? `${cost} ${RESOURCES[u.resourceKind!].label.toLowerCase()}` : 'free';
        const cd = this.s.battle.abilityCooldown(a);
        const ups = [a.power ? `Empowered +${a.power}` : '', a.haste ? `Quick +${a.haste}` : ''].filter(Boolean).join(', ');
        lines.push(`• ${def.name}${ups ? ` (${ups})` : ''} — cost ${costText}, ${cd % 1 ? cd.toFixed(1) : cd}s cooldown`);
        lines.push(`   ${this.s.battle.abilityEffectText(u, a)}`);
      }
      for (const t of u.traits ?? []) lines.push(`• ${TRAITS[t].name} (passive) — ${TRAITS[t].description}`);
    } else {
      const notes = [u.isElite ? 'Elite' : '', u.isCaster ? 'Caster (can be interrupted)' : ''].filter(Boolean);
      if (notes.length) lines.push(notes.join(' · '));
      if (u.casting) lines.push(`Casting: ${u.casting.spell} (${u.casting.remaining.toFixed(1)}s)${u.casting.unstoppable ? ' — unstoppable' : ''}`);
      if (u.isBoss) lines.push('Boss: after an interrupt, its next heavy cast is unstoppable.');
    }
    const effects = (u.effects ?? []).filter((e) => e.remaining > 0);
    if (effects.length) {
      lines.push('', 'Effects:');
      for (const e of effects) {
        const info = effectInfo(e);
        lines.push(`• ${info.name}${Number.isFinite(e.remaining) ? ` (${Math.ceil(e.remaining)}s)` : ''} — ${info.text(e)}`);
      }
    }
    ui.title
      .setText(`${u.label}${u.side === 'hero' ? ` — level ${u.level ?? 1}` : ''}`)
      .setColor(u.side === 'hero' ? '#' + COLORS[u.kind].toString(16).padStart(6, '0') : '#ff8a8a');
    ui.body.setText(lines.join('\n'));
    ui.box.setSize(ui.box.width, 42 + ui.body.height + 14);
  }
}
