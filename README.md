# FightwithFriends

A portrait-mode browser game: a party of four heroes defends a castle gate
against waves of enemies. Built to play on a phone.

- **Design:** [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- **Current plan:** [docs/FIRST_PLAYABLE.md](docs/FIRST_PLAYABLE.md)
- **Play:** https://koldeone.github.io/FightwithFriends/ (once GitHub Pages is enabled)

## Status

Steps 1–4 of the first playable version are done:

1. **Battlefield** — heroes hold positions, goblins march down, auto attacks,
   gate HP, victory or the gate falling.
2. **Aggro** — enemies attack whoever has the most threat (110% needed to
   steal it), healing creates threat, the Warrior auto-taunts loose enemies,
   runners slip to the gate unless someone grabs them.
3. **Player controls** — choose your hero; tap an enemy to focus it (healers
   can also tap allies); one ability button per class (Thunderclap, Renew,
   Fireball, Sinister Strike) using rage / mana / energy; AUTO toggle; pause.
   Orange/red `!` aggro warnings show on your hero.

4. **Class kits (part 1)** — each class has a starting-ability button
   (★ Taunt, Power Word: Fortitude, Polymorph, Kick) next to its regular
   ability. The Goblin Shaman casts Mend (with a cast bar) for Kick to
   interrupt. Buttons get a red outline when nothing is in range. Class
   traits exist in code but start switched off — they become reward
   options in step 5.

Testing aids (not design): **Speed** (1x / 2x / 4x) and **Careful AI**
(ON = AI damage dealers hold back before pulling aggro; OFF = they don't).

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
