import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { makeRound } from '../src/sim/content';
import { attuneBonus, attunementCounts, RELICS, STARTING_RELICS } from '../src/sim/relics';
import { chooseUpgrade, currentNode, encounterFor, finishFight, grant, newRun, type RunState } from '../src/sim/run';
import type { HeroClass } from '../src/sim/types';

const TRIO: HeroClass[] = ['warrior', 'priest', 'mage'];
const builds = (ids: string[][]) => ids.map((list) => ({ level: 3, abilities: list.map((id) => ({ id: id as never, power: 0, haste: 0, mastery: false })), traits: [] }));

describe('Attunement and relics', () => {
  it('attunement counts abilities by school across the party, and charms add two', () => {
    const b = builds([['heroicStrike'], ['heal', 'renew'], ['fireball']]);
    expect(attunementCounts(b)).toMatchObject({ physical: 1, holy: 2, fire: 1 });
    expect(attunementCounts(b, ['emberCharm']).fire).toBe(3);
    expect(attuneBonus(1)).toBe(0);
    expect(attuneBonus(2)).toBeGreaterThan(0);
    expect(attuneBonus(4)).toBeGreaterThan(attuneBonus(2));
  });

  it('an attuned school hits harder in battle', () => {
    const b = builds([['heroicStrike'], ['heal'], ['fireball']]);
    const plain = new Battle({ seed: 1, wave: makeRound(1), team: TRIO, builds: b });
    const charmed = new Battle({ seed: 1, wave: makeRound(1), team: TRIO, builds: b, relics: ['emberCharm'] });
    expect(plain.attune.fire).toBeUndefined();
    expect(charmed.attune.fire).toBeGreaterThan(0);
  });

  it('Iron Skin, Hourglass and Mana Spring change the heroes from the start', () => {
    const b = builds([['heroicStrike'], ['heal'], ['fireball']]);
    const plain = new Battle({ seed: 1, wave: makeRound(1), team: TRIO, builds: b }).heroes;
    const boosted = new Battle({ seed: 1, wave: makeRound(1), team: TRIO, builds: b, relics: ['ironSkin', 'hourglass', 'manaSpring'] }).heroes;
    boosted.forEach((h, i) => {
      expect(h.maxHp).toBeGreaterThan(plain[i].maxHp);
      expect(h.cooldownRate!).toBeGreaterThan(plain[i].cooldownRate ?? 1);
    });
  });

  it('elites offer a relic; taking it gives it to the party (and it stops being offered)', () => {
    const run = newRun('warrior', undefined, 11);
    const elite = Object.values(run.map.nodes).find((n) => n.type === 'elite')!;
    run.at = elite.id;
    run.status = 'fight';
    const kills = encounterFor(run).spawns.map((s) => ({ kind: s.kind }));
    finishFight(run, true, [], kills);
    const p = run.pending;
    expect(p?.kind).toBe('upgrade');
    const relic = p?.kind === 'upgrade' ? p.options.find((o) => o.reward.kind === 'relic') : undefined;
    expect(relic).toBeDefined();
    chooseUpgrade(run, relic!);
    expect(run.relics).toHaveLength(1);
    expect(STARTING_RELICS).toContain(run.relics[0]);
  });

  it('Lucky Coin pays more gold for the same fight', () => {
    const run = newRun('mage', undefined, 41);
    run.at = run.map.start![0];
    run.status = 'fight';
    currentNode(run)!.rich = false;
    const kills = encounterFor(run).spawns.map((s) => ({ kind: s.kind }));
    const plain = finishFight(structuredClone(run) as RunState, true, [], kills);
    grant(run, -1, { kind: 'relic', id: 'luckyCoin' });
    const lucky = finishFight(run, true, [], kills);
    expect(lucky.gold).toBeGreaterThan(plain.gold);
    expect(RELICS.luckyCoin.text).toMatch(/gold/);
  });
});
