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

5. **Between waves (part 1)** — a 10-wave run with named wave patterns
   (rushes, flanks, casters, an elite Goblin Brute with a telegraphed Smash).
   Everyone levels up each wave; a reward choice appears after waves 2, 4, 6
   and 8 (new abilities at 4 and 8), other waves continue automatically.
   "Choose for me" on the reward screen. Autosave between waves. Your hero
   stands in the center; AI teammates move, staying close to the party.
6. **Feel pass** — smooth interpolated motion and steering, projectiles that
   land on arrival, hit flashes/knockback/sparks/shake, merged damage
   numbers, wave intros and callouts, slow motion on the last kill, and
   synthesized sound effects.

Top bar: **AUTO** (the AI plays your hero), **Pause**, **Sound** on/off.
Testing aid: **Speed** (1x / 2x / 4x).

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
