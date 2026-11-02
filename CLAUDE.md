# FightwithFriends — notes for Claude

A portrait mobile-browser arena auto-battler (TypeScript, Phaser 3, Vite,
Vitest). Design doc: `docs/GAME_DESIGN.md` (keep it in sync with the code).

## Layout

- `src/sim/` — pure, deterministic simulation (no Phaser). `content.ts` holds
  all numbers; `battle.ts` the fight; `run.ts` the run state and rewards.
- `src/render/BattleScene.ts` — scene state, update loop, input; delegates to
  `hud.ts`, `inspect.ts`, `units.ts`, `theme.ts` and `screens/*`.
- `scripts/balance.ts` — batch-simulates runs (`npm run balance`).
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
