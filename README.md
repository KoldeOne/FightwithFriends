# FightwithFriends

A portrait-mode browser game: manage a guild of heroes fighting round after
round in an arena. Built to play on a phone.

- **Design:** [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- **Old castle-gate design and plan:** [docs/archive/](docs/archive/)
- **Play:** https://koldeone.github.io/FightwithFriends/ (once GitHub Pages is enabled)

## Status

A playable arena auto-battler:

- **Start with 3 heroes** (classes can repeat): Warrior, Paladin, Priest, Mage,
  Warlock, Rogue.
  A 4th joins after the round 10 boss, a 5th after the round 20 boss.
- **Before every round:** the enemy line-up is on the field, with the boss's
  moves on a boss round (and a warning the round before). Heroes line up by
  role on their own. Then press Fight.
- **The heroes fight on their own** — they move, hold aggro, heal, interrupt
  and use their abilities. Tap a unit to inspect it; tap a hero panel for its
  abilities.
- **Rounds:** goblins (1-10, Goblin Warchief boss), undead (11-20, The Bone
  King), then demons (21+, a Demon Lord every 10th round) that get stronger
  every round. The enemy fields as many fighters as you do (3 → 4 → 5).
- **3 lives:** losing a round costs one; retry the round. Runs are
  endless; your best round is remembered. Sudden death after 60s.
- **Rewards every 5 rounds:** each hero picks 1 of 3 — new abilities from a
  6–7 ability class pool (only 4 fit) or upgrades, each ability with its own
  named upgrade. Cards show the numbers. Or use "Choose for me" / Auto picks.
  Autosave between rounds.
- **Bosses** have signature moves: War Cry, Raise Dead, Rain of Fire.
- **Feel:** smooth motion, projectiles, hit feedback, merged numbers, round
  intros, slow-mo finish, synthesized sound, pixel-art sprites for heroes and
  enemies (the enemy ones are temporary).

Top bar: **Speed** (testing aid), **Sound**, **Auto picks**, **Pause**.

## Running locally

Requires [Node.js](https://nodejs.org/) 20+.

```sh
npm install
npm run dev      # opens a local server; also reachable from a phone on the same Wi-Fi
npm test         # simulation tests
npm run balance  # batch-simulate runs and print a balance summary (scripts/balance-parallel.sh uses every core)
npm run build    # production build into dist/
```

## Code layout

- `src/sim/` — the combat simulation. Plain TypeScript, no rendering, seeded
  and deterministic (keeps it testable and multiplayer-ready).
- `src/render/` — Phaser scene that draws the simulation and handles input.
- `tests/` — simulation tests (Vitest).
