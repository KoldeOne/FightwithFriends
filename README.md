# FightwithFriends

A portrait-mode browser game: build a party of heroes across a branching map
of arena fights. Built to play on a phone.

- **Design:** [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- **Heroes and monsters:** [docs/ROSTER.md](docs/ROSTER.md)
- **Old castle-gate design and plan:** [docs/archive/](docs/archive/)
- **Play:** https://koldeone.github.io/FightwithFriends/ (once GitHub Pages is enabled)

## Status

A playable arena auto-battler with a Slay the Spire-style map:

- **Start with one hero** — Warrior, Paladin, Priest, Mage, Warlock or Rogue —
  and pick its first ability.
- **Climb a branching map** through three acts (The Goblin Woods, The Sunken
  Crypt, The Burning Rift), 12 floors and a boss each: fights, elites, chests,
  shops and campsites. Golden nodes pay more. The way you came is dotted.
- **Campsites:** the first four you reach each bring a new hero (any class,
  you choose its first ability) for a party of 5; later ones train a hero in a
  new ability.
- **Gold** from enemies buys abilities and upgrades in shops; chests, elites
  and bosses give an upgrade pick. Heroes earn XP per fight (recruits catch up
  at double rate). Everyone heals fully between fights.
- **One life:** a party wipe ends the run. Beat the Act 3 boss to win.
- **The camp** (from Bailey's Camp Mode): every fight's loot goes home, win or
  lose. Spend it at the Blacksmith, Armorer, Jeweler and Training station for
  gear that every later run starts with. See §2b of the design doc.
- **The heroes fight on their own** — they move, hold aggro, heal, interrupt
  and use their abilities. Tap a unit to inspect it; tap a hero panel for its
  abilities. Bosses have signature moves (War Cry, Raise Dead, Rain of Fire).
- **Feel:** smooth motion, projectiles, hit feedback, merged numbers, a flashy
  spoils panel after each win, slow-mo finish, synthesized sound, pixel-art
  sprites and icons (the enemy sprites are temporary).

Top bar: **Speed** (testing aid), **Sound**, **Auto** (picks the route and
every choice), **Pause**.

## Running locally

Requires [Node.js](https://nodejs.org/) 20+.

```sh
npm install
npm run dev      # opens a local server; also reachable from a phone on the same Wi-Fi
npm test         # simulation tests
npm run balance  # batch-simulate runs and print a balance summary (scripts/balance-parallel.sh uses every core)
npm run camp-sim # simulate the camp: guilds' map runs back to back with camp upgrades
npm run build    # production build into dist/
```

## Code layout

- `src/sim/` — the combat simulation. Plain TypeScript, no rendering, seeded
  and deterministic (keeps it testable and multiplayer-ready).
- `src/render/` — Phaser scene that draws the simulation and handles input.
- `tests/` — simulation tests (Vitest).
