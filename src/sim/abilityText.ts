import { ABILITY_TUNING as t, LEVEL_SCALING, TRAIT_TUNING, UPGRADE } from './content';
import type { AbilityId, TraitId } from './types';

/** What an ability's numbers depend on: the hero's level, Might and passives. */
export interface HeroStatsForText {
  level?: number;
  /** Might multiplier (1 = none). */
  might?: number;
  traits?: TraitId[];
}

export interface SlotForText {
  id: AbilityId;
  power?: number;
  mastery?: boolean;
}

/** Effect multiplier for an ability: hero level x Might x Empowered ranks. */
export function abilityScaleFor(h: HeroStatsForText, slot: SlotForText): number {
  return (1 + LEVEL_SCALING * ((h.level ?? 1) - 1)) * (h.might ?? 1) * (1 + UPGRADE.powerPerRank * (slot.power ?? 0));
}

/**
 * Plain-language numbers for an ability on a hero (level, upgrades and its
 * named upgrade included). Used by tooltips, the inspect window and the
 * reward cards ("now" vs "after").
 */
export function abilityText(h: HeroStatsForText, slot: SlotForText): string {
  const k = abilityScaleFor(h, slot);
  const r = (n: number) => Math.round(n * k);
  const m = !!slot.mastery;
  const has = (id: TraitId) => !!h.traits?.includes(id);
  switch (slot.id) {
    case 'taunt':
      return 'Forces an enemy to attack this hero.';
    case 'heroicStrike':
      return `Deals ${r(t.heroicStrike.damage)} damage with extra threat.${m ? ` Cleaves a second enemy for ${r(t.heroicStrike.damage * t.heroicStrike.cleave)}.` : ''}`;
    case 'thunderclap':
      return `Deals ${r(t.thunderclap.damage)} damage to every nearby enemy (high threat) and slows their attacks for ${t.thunderclap.slow}s.${m ? ` They deal ${t.thunderclap.aftershock * 100}% less damage for 6s.` : ''}`;
    case 'whirlwind':
      return `Deals ${r(t.whirlwind.damage)} damage to every nearby enemy${m ? `, then ${r(t.whirlwind.damage * t.whirlwind.secondHit)} more` : ''}.`;
    case 'shieldBlock':
      return `Takes ${(m ? t.shieldBlock.masteryReduction : t.shieldBlock.reduction) * 100}% less damage for ${m ? t.shieldBlock.masteryDuration : t.shieldBlock.duration}s.`;
    case 'shieldBash':
      return `Interrupts and stuns an enemy for ${m ? t.shieldBash.masteryStun : t.shieldBash.stun}s, dealing ${r(t.shieldBash.damage)} damage.`;
    case 'lastStand':
      return `Below ${t.lastStand.below * 100}% health, recovers ${(m ? t.lastStand.masteryHeal : t.lastStand.heal) * 100}% of maximum health${m ? ` and blocks ${t.lastStand.masteryBlock * 100}% of damage for ${t.lastStand.masteryBlockTime}s` : ''}.`;
    case 'rallyingShout':
      return `The party deals ${t.rallyingShout.bonus * 100}% more damage for ${t.rallyingShout.duration}s.${m ? ` Heals everyone for ${t.rallyingShout.masteryHeal * 100}% of their maximum health.` : ''}`;
    case 'heal':
      return `Heals one ally for ${r(t.heal.amount * (m ? t.heal.mastery : 1))}.`;
    case 'renew':
      return `Heals ${m ? 'two allies' : 'one ally'} for ${r(t.renew.total)} over ${t.renew.duration}s.`;
    case 'fortitude':
      return `Party gains +${t.fortitude.bonus * 100}% max health for ${t.fortitude.duration}s.`;
    case 'powerShield':
      return `Shields an ally from ${r(t.powerShield.absorb)} damage for ${t.powerShield.duration}s.${m ? ' Attackers take half of what it absorbs.' : ''}`;
    case 'guardianSpirit':
      return `For ${t.guardianSpirit.duration}s, a killing blow on the ally leaves them at ${(m ? t.guardianSpirit.masterySaveAt : t.guardianSpirit.saveAt) * 100}% health instead.`;
    case 'holyNova': {
      const x = m ? t.holyNova.mastery : 1;
      return `Heals every ally for ${r(t.holyNova.heal * x)} and deals ${r(t.holyNova.damage * x)} damage to enemies within ${m ? t.holyNova.masteryRadius : t.holyNova.radius}.`;
    }
    case 'chainOfLight': {
      const jumps = m ? t.chainOfLight.masteryJumps : t.chainOfLight.jumps;
      const f = m ? t.chainOfLight.masteryFalloff : t.chainOfLight.falloff;
      const amounts = Array.from({ length: jumps + 1 }, (_, i) => r(t.chainOfLight.amount * Math.pow(f, i)));
      return `Heals ${amounts.join(', then ')} (most injured allies first).`;
    }
    case 'fireball':
      return `Deals ${r(t.fireball.damage)} damage, then ${r(t.fireball.burnPerSecond * t.fireball.burnDuration * (m ? 2 : 1))} burn damage over ${t.fireball.burnDuration}s${m ? ' (the burn also spreads to a nearby enemy)' : ''}.`;
    case 'iceLance':
      return `Deals ${r(t.iceLance.damage)} damage${m ? ` (${r(t.iceLance.damage * t.iceLance.shatter)} to slowed or stunned enemies)` : ''}.`;
    case 'blizzard': {
      const dmg = t.blizzard.damagePerSecond * t.blizzard.duration * (m ? t.blizzard.masteryDamage : 1);
      return `Deals ${r(dmg)} damage over ${t.blizzard.duration}s to enemies in the storm and slows them${m ? ' (a 40% wider storm)' : ''}.`;
    }
    case 'frostNova':
      return `Freezes every enemy within ${t.frostNova.radius} for ${m ? t.frostNova.masteryFreeze : t.frostNova.freeze}s and deals ${r(t.frostNova.damage)} damage.`;
    case 'arcaneBarrage':
      return `Fires ${m ? t.arcaneBarrage.masteryMissiles : t.arcaneBarrage.missiles} missiles of ${r(t.arcaneBarrage.damage)} damage at random enemies.`;
    case 'polymorph':
      return `Turns an enemy into a sheep for ${t.polymorph.duration}s.`;
    case 'counterspell':
      return `Interrupts a cast; locks casting for ${m ? t.counterspell.masterySilence : t.counterspell.silence}s${m ? ` and deals ${r(t.counterspell.masteryDamage)} damage` : ''}.`;
    case 'kick':
      return `Interrupts a cast; locks casting for ${m ? t.kick.masterySilence : t.kick.silence}s${m ? ` and stuns for ${t.kick.masteryStun}s` : ''}; deals ${t.kick.damage} damage.`;
    case 'sinisterStrike':
      return `Deals ${r(t.sinisterStrike.damage)} damage${m ? ` and ${r(t.sinisterStrike.bleed)} bleed over ${t.sinisterStrike.bleedDuration}s` : ''}.`;
    case 'eviscerate':
      return `Deals ${r(t.eviscerate.damage)} damage${m ? ` (${r(t.eviscerate.damage * 2)} to enemies below ${t.eviscerate.executeBelow * 100}% health)` : ''}.`;
    case 'evasion':
      return `Dodges ${t.evasion.dodge * 100}% of attacks for ${t.evasion.duration}s${m ? `; each dodge strikes back for ${r(t.evasion.riposte)}` : ''}.`;
    case 'gouge':
      return `Stuns an enemy for ${m ? t.gouge.masteryStun : t.gouge.stun}s (breaks its cast).`;
    case 'fanOfKnives':
      return `Deals ${r(t.fanOfKnives.damage)} damage to every enemy within ${t.fanOfKnives.radius}${m ? `, poisoning them for ${r(t.fanOfKnives.poison)} over ${t.fanOfKnives.poisonDuration}s` : ''}.`;
    case 'judgement': {
      const share = has('zeal') ? 'all' : 'half';
      return `Deals ${r(t.judgement.damage)} damage at range ${t.judgement.range}${m ? ` (and ${r(t.judgement.damage * t.judgement.second)} to a second enemy)` : ''}; the most injured ally is healed for ${share} of it.`;
    }
    case 'radiantLight':
      return `Heals one ally for ${r(t.radiantLight.amount)}${m ? ` and the Paladin for ${r(t.radiantLight.amount * t.radiantLight.beacon)}` : ''}.`;
    case 'hallowedGround':
      return `Deals ${r(t.hallowedGround.damagePerSecond * t.hallowedGround.duration)} damage over ${t.hallowedGround.duration}s to enemies on the blessed ground, with high threat${m ? `; allies on it heal ${r(t.hallowedGround.healPerSecond * t.hallowedGround.duration)}` : ''}.`;
    case 'mercy':
      return `Heals an ally below ${t.mercy.below * 100}% health for ${r(t.mercy.amount)}${m ? `; they take 50% less damage for ${t.mercy.graceTime}s` : ''}.`;
    case 'hammerOfJustice':
      return `Interrupts and stuns an enemy up to ${t.hammerOfJustice.range} away for ${m ? t.hammerOfJustice.masteryStun : t.hammerOfJustice.stun}s.`;
    case 'exorcism':
      return `Deals ${r(t.exorcism.damage)} damage (${r(t.exorcism.damage * t.exorcism.holyBonus)} to undead and demons)${m ? ` plus ${r(t.exorcism.burn)} burn over ${t.exorcism.burnDuration}s` : ''}.`;
    case 'hexBolt':
      return `Deals ${r(t.hexBolt.damage)} damage${m ? ` and rots the target for ${r(t.hexBolt.rot)} over ${t.hexBolt.rotDuration}s` : ''}.`;
    case 'wither': {
      const bonus = has('agony') ? 1 + TRAIT_TUNING.agonyBonus : 1;
      return `Deals ${r(t.wither.total * bonus)} damage over ${t.wither.duration}s${m ? '; jumps to the nearest enemy if the target dies' : ''}.`;
    }
    case 'soulDrain':
      return `Deals ${r(t.soulDrain.damage)} damage; the most injured ally is healed for ${m ? '150% of' : ''} the same amount.`.replace('for  the', 'for the');
    case 'enfeeble':
      return `The most dangerous enemy in range deals ${(m ? t.enfeeble.masteryReduction : t.enfeeble.reduction) * 100}% less damage for ${t.enfeeble.duration}s${m ? ' and attacks slower' : ''}.`;
    case 'doom':
      return `After ${t.doom.delay}s, deals ${r(t.doom.damage * (m ? t.doom.mastery : 1))} damage to the toughest enemy.`;
    case 'curseOfRuin':
      return `An enemy takes ${(m ? t.curseOfRuin.masteryBonus : t.curseOfRuin.bonus) * 100}% more damage from everything for ${t.curseOfRuin.duration}s.`;
  }
}
