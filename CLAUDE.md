# FightwithFriends — notes for Claude

A portrait mobile-browser arena auto-battler (TypeScript, Phaser 3, Vite,
Vitest). Design doc: `docs/GAME_DESIGN.md` (keep it in sync with the code).

## Layout

- `src/sim/` — pure, deterministic simulation (no Phaser). `content.ts` holds
  all numbers; `battle.ts` the fight; `run.ts` the run state and rewards.
- `src/render/BattleScene.ts` — scene state, update loop, input; delegates to
  `hud.ts`, `inspect.ts`, `units.ts`, `theme.ts` and `screens/*`.
- `scripts/balance.ts` — batch-simulates runs (`npm run balance`; `scripts/balance-parallel.sh [seeds] [dir] [ai|random]` uses every core; random picks measure each pick's value).
- Camp Mode (the second mode): `src/sim/camp.ts` (loot, stations, camp save),
  `src/render/screens/camp.ts` (camp screen), `scripts/camp-sim.ts` (`npm run camp-sim`).
- Ability numbers live in `content.ts` (ABILITY_TUNING); their player-facing text in `src/sim/abilityText.ts` — change both together.
- Collaborators: the repo owner and Bailey (GitHub: bweeks).

## Checks before pushing

`npm run typecheck && npm test && npm run build`

## Standing suggestions

- **Story text as data.** When Bailey (bweeks) asks for story, character or
  setting changes, suggest keeping the writing (faction intros, character
  bios, boss lines, dialogue) in a data file such as `src/content/story.ts`,
  so it can be edited without touching game logic or screen code. She may
  prefer to create it herself — offer, don't insist.
- Ability names are working names; many are WoW-derived and must be renamed
  before any public release. Don't add new WoW-specific names.
