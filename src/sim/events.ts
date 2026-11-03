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

export type EventId = 'wishingWell';

export const EVENTS: Record<EventId, EventDef> = {
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

/** A used wish: every hero deals this much more damage in the restarted fight. */
export const WISH_DAMAGE = 0.2;

/** The most wishes a party can hold at once. */
export const MAX_WISHES = 1;

/** Which event a "?" node holds (only one so far; more will be picked by seed). */
export function eventFor(_seed: number): EventId {
  const ids = Object.keys(EVENTS) as EventId[];
  return ids[Math.abs(_seed) % ids.length];
}
