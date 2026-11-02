# FightwithFriends

A portrait-mode browser game: a party of four heroes defends a castle gate
against waves of enemies. Built to play on a phone.

- **Design:** [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- **Current plan:** [docs/FIRST_PLAYABLE.md](docs/FIRST_PLAYABLE.md)
- **Play:** https://koldeone.github.io/FightwithFriends/ (once GitHub Pages is enabled)

## Status

A playable 15-wave auto-battler prototype:

- **Build a team of four** (classes can repeat): Warrior, Priest, Mage, Rogue.
- **The heroes fight on their own** — they move, hold aggro, heal, interrupt
  and use their abilities. Tap a unit to inspect it; tap a hero panel for its
  abilities.
- **Waves** have named patterns (rushes, flanks, casters, elite Goblin Brutes
  with a telegraphed Smash). Everyone levels up each wave.
- **Rewards every 5 waves:** pick one new ability or upgrade for each hero,
  or use "Choose for me" / Auto picks. Autosave between waves.
- **Feel:** smooth motion, projectiles, hit feedback, merged numbers, wave
  intros, slow-mo finish, synthesized sound.

Top bar: **Speed** (testing aid), **Sound**, **Auto picks**, **Pause**.

## Running locally

Requires [Node.js](https://nodejs.org/) 20+.

```sh
npm install
npm run dev      # opens a local server; also reachable from a phone on the same Wi-Fi
npm test         # simulation tests
npm run build    # production build into dist/
```

## Code layout

- `src/sim/` — the combat simulation. Plain TypeScript, no rendering, seeded
  and deterministic (keeps it testable and multiplayer-ready).
- `src/render/` — Phaser scene that draws the simulation and handles input.
- `tests/` — simulation tests (Vitest).
