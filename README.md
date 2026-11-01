# FightwithFriends

A portrait-mode browser game: a party of four heroes defends a castle gate
against waves of enemies. Built to play on a phone.

- **Design:** [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- **Current plan:** [docs/FIRST_PLAYABLE.md](docs/FIRST_PLAYABLE.md)
- **Play:** https://koldeone.github.io/FightwithFriends/ (once GitHub Pages is enabled)

## Status

Step 1 of the first playable version: heroes hold their positions, goblins
march down, everyone auto-attacks, and the wave ends in victory or the gate
falling. The **Speed** button (1x / 2x / 4x) is a testing aid.

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
