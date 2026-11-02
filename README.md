# FightwithFriends

A portrait-mode browser game: a party of four heroes defends a castle gate
against waves of enemies. Built to play on a phone.

- **Design:** [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- **Current plan:** [docs/FIRST_PLAYABLE.md](docs/FIRST_PLAYABLE.md)
- **Play:** https://koldeone.github.io/FightwithFriends/ (once GitHub Pages is enabled)

## Status

Steps 1–5 (part 1) of the first playable version are done:

1. **Battlefield** — heroes hold positions, goblins march down, auto attacks,
   gate HP, victory or the gate falling.
2. **Aggro** — enemies attack whoever has the most threat (110% needed to
   steal it), healing creates threat, the Warrior auto-taunts loose enemies,
   runners slip to the gate unless someone grabs them.
3. **Player controls** — choose your hero; tap an enemy to focus it (healers
   can also tap allies); one ability button per class (Thunderclap, Renew,
   Fireball, Sinister Strike) using rage / mana / energy; AUTO toggle; pause.
   Orange/red `!` aggro warnings show on your hero.

4. **Class kits (part 1)** — each class starts with one active ability and
   one always-on passive: Warrior Heroic Strike + Taunt, Priest Heal +
   Power Word: Fortitude, Mage Fireball + Polymorph (elites/casters first),
   Rogue Sinister Strike + Stealth. Five large ability slots sit right under
   the gate; four are earned in step 5. Earnable abilities already work in
   the simulation: Thunderclap, Renew, Counterspell, Kick.

5. **Between waves (part 1)** — a 10-wave run. After each wave everyone
   levels up and you pick 1 of 3 rewards. New abilities are offered only
   after waves 4 and 9; other waves offer upgrades (Empowered, Quick, the
   class trait, Vitality, Might). "Choose for me" on the reward screen picks
   one of the three for you. AI teammates pick their own. Autosave after
   each pick (Continue on the hero screen). Hover an ability for a tooltip.
   Your hero stands in the center; AI teammates start front, left, right.

Top bar: **AUTO** (the AI plays your hero) and **Pause**; **Choose for me**.
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
