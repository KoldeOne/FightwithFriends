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
  /** Bet gold on a coin flip: win and get it back doubled, lose and it's gone. */
  | { kind: 'gamble'; stake: number; win: string; lose: string }
  /** Pay gold to a traveller; they come back with a gift at the start of the next act. */
  | { kind: 'help'; cost: number }
  /** Blood Altar: the hero with the fewest abilities loses some max health this act and gets an extra pick. */
  | { kind: 'altar' }
  /** Feast: every hero has more max health for the next FEAST.fights fights. */
  | { kind: 'feast' }
  | { kind: 'nothing' };

export interface EventChoice {
  label: string;
  /** Shown after choosing. */
  result: string;
  effect: EventEffect;
  /** Only offered when this holds (e.g. no wish held yet). */
  when?: 'noWish' | 'hasWish';
  /** Only offered with at least this much gold. */
  minGold?: number;
}

export interface EventDef {
  title: string;
  text: string;
  choices: EventChoice[];
  /** Not a random "?" event: it only happens on its own (a Feast node, a traveller's return). */
  special?: boolean;
}

export type EventId = 'wishingWell' | 'cursedShrine' | 'gambler' | 'traveller' | 'bloodAltar' | 'helper' | 'feast' | 'travellerGift';

export const EVENTS: Record<EventId, EventDef> = {
  gambler: {
    title: 'The Gambler',
    text: 'A grinning goblin in a far-too-nice hat sits on a barrel, flipping a gold coin. "Heads you win, tails I win. Fancy a go?"',
    choices: [
      {
        label: 'Bet 20 gold',
        result: '',
        effect: { kind: 'gamble', stake: 20, win: 'Heads! The goblin grumbles and pays you 40 gold.', lose: 'Tails. The goblin bites your coin, cackles and vanishes.' },
        minGold: 20,
      },
      { label: 'Walk away', result: 'You keep your gold. The goblin looks very disappointed.', effect: { kind: 'nothing' } },
    ],
  },
  traveller: {
    title: 'A Wounded Traveller',
    text: 'A merchant sits by the road with a twisted ankle and an empty purse. "Help me get home, friends, and I won\'t forget it."',
    choices: [
      {
        label: 'Help them (15 gold)',
        result: 'You pay for a cart home. The traveller swears to repay you, and you believe them.',
        effect: { kind: 'help', cost: 15 },
        minGold: 15,
      },
      { label: 'Walk on', result: 'You leave them to the road.', effect: { kind: 'nothing' } },
    ],
  },
  travellerGift: {
    title: 'The Traveller Returns',
    text: 'The merchant you helped catches up with your party, walking just fine now, with a heavy purse.',
    choices: [{ label: 'Thank them', result: 'They press 60 gold into your hands. "Told you I wouldn\'t forget."', effect: { kind: 'gold', amount: 60 } }],
    special: true,
  },
  bloodAltar: {
    title: 'The Blood Altar',
    text: 'A black stone altar, warm to the touch. Words are carved around its edge: power, for a price paid in blood.',
    choices: [
      {
        label: 'Offer blood',
        result: 'Your least experienced hero cuts their palm on the altar. They lose 20% of their maximum health until the end of the act, and gain an extra pick.',
        effect: { kind: 'altar' },
      },
      { label: 'Walk on', result: 'You leave the altar alone. Probably wise.', effect: { kind: 'nothing' } },
    ],
  },
  // Placeholder writing for the camp's helper (Bailey's character): name and lines to come.
  helper: {
    title: 'A Visit from Camp',
    text: 'The camp\'s helper pops out from behind a tree, counting coins. "Just checking my investment is still alive! Here, a little something to keep you going."',
    choices: [{ label: 'Take the coins', result: 'She hands over 25 gold, then makes a note of it in a little book.', effect: { kind: 'gold', amount: 25 } }],
  },
  feast: {
    title: 'A Feast',
    text: 'A clearing with a roaring fire and a spit of something that smells wonderful. The party sits down to eat together.',
    choices: [{ label: 'Dig in', result: 'Full and happy, every hero has 15% more maximum health for the next two fights.', effect: { kind: 'feast' } }],
    special: true,
  },
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

/** Feast: every hero has this much more max health, for this many fights. */
export const FEAST = { health: 0.15, fights: 2 };

/** Blood Altar: the share of max health lost until the end of the act. */
export const ALTAR_WOUND = 0.2;

/** Which event a "?" node holds: any of the random ones, by seed. */
export function eventFor(seed: number): EventId {
  const ids = (Object.keys(EVENTS) as EventId[]).filter((id) => !EVENTS[id].special);
  return ids[Math.abs(seed) % ids.length];
}
