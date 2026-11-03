/**
 * Chance encounters: what can happen at a "?" node on the map. The writing
 * (titles, text, choice labels and results) lives here as data, so it can be
 * edited without touching the game logic or the screens. Add new events to
 * EVENTS and give their choices an effect from EventEffect.
 */

/** What a choice does (the run applies it). */
export type EventEffect =
  /** Gain a wish: the next time the party falls, everyone rises again and the fight restarts. */
  | { kind: 'wish' }
  | { kind: 'gold'; amount: number }
  /** A curse: every hero starts the next fight with a debuff (takes CURSE_DAMAGE more damage). */
  | { kind: 'curse' }
  | { kind: 'nothing' };

export interface EventChoice {
  label: string;
  /** Shown after choosing. */
  result: string;
  effect: EventEffect;
  /** Only offered when this holds (e.g. no wish held yet). */
  when?: 'noWish' | 'hasWish';
}

export interface EventDef {
  title: string;
  text: string;
  choices: EventChoice[];
}

export type EventId = 'wishingWell' | 'cursedShrine';

export const EVENTS: Record<EventId, EventDef> = {
  cursedShrine: {
    title: 'A Cursed Shrine',
    text: 'A cracked altar wrapped in black thorns. As you pass, the candles flare green and a cold whisper follows your party down the path.',
    choices: [
      {
        label: 'Press on',
        result: 'The curse clings to you. In your next fight, every hero takes 25% more damage.',
        effect: { kind: 'curse' },
      },
    ],
  },
  wishingWell: {
    title: 'A Wishing Well',
    text: 'An old stone well in a quiet clearing. Coins glint far below, and the air hums with something hopeful.',
    choices: [
      {
        label: 'Make a wish',
        result: 'The water shimmers. You carry a wish: if your party falls, they rise again and the fight starts over.',
        effect: { kind: 'wish' },
        when: 'noWish',
      },
      {
        label: 'Fish out some coins',
        result: 'You already carry a wish, so you fish out a handful of coins instead.',
        effect: { kind: 'gold', amount: 25 },
        when: 'hasWish',
      },
      { label: 'Walk on', result: 'You leave the well in peace.', effect: { kind: 'nothing' } },
    ],
  },
};

/** A curse from the Cursed Shrine: every hero takes this much more damage in the next fight. */
export const CURSE_DAMAGE = 0.25;

/** A used wish: every hero deals this much more damage in the restarted fight. */
export const WISH_DAMAGE = 0.2;

/** The most wishes a party can hold at once. */
export const MAX_WISHES = 1;

/** Which event a "?" node holds (only one so far; more will be picked by seed). */
export function eventFor(_seed: number): EventId {
  const ids = Object.keys(EVENTS) as EventId[];
  return ids[Math.abs(_seed) % ids.length];
}
