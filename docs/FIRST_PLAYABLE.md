# First Playable Version — Plan

> Companion to [GAME_DESIGN.md](GAME_DESIGN.md). Status: **steps 1–4 done** (the rest of each class's ability pool arrives with step 5's level-up choices).

## Goal

Answer one question: **is a wave fun?** Specifically:

- Is the fight **readable** on a small portrait screen (who's attacking whom,
  aggro icons, cast bars)?
- Does "a few taps here and there" feel right — not too passive, not too busy?
- Does the **aggro system** create good moments (mage pulls aggro → tank taunts)?
- Is **auto vs. manual** a meaningful difference?
- Do **level-up and loot choices** make the next wave feel different?

## Scope

| In | Out (later) |
|---|---|
| Portrait battlefield, simple shapes | Pixel art |
| 4 heroes — player controls 1, AI controls 3 | Multiplayer |
| **4 classes:** Warrior, Priest, Mage, Rogue | Paladin + Druid, Shaman, Warlock, Hunter |
| ~4 abilities per class + starting ability + traits as rewards | Full 8-ability pools |
| Aggro with orange/red icons, Taunt | |
| Focus target, ability buttons, AUTO toggle, pause | |
| Goblins: brute, runner, archer, shaman, flyer | Undead and demon factions |
| **Chapter 1: 10 waves**, bosses at 5 and 10 with cast bars | Waves 11–30, endless mode |
| Interrupts (Rogue Kick), Polymorph | |
| Between-wave screen: level-up, loot, "Choose for me", Full Auto countdown | |
| Simple gear (stats only) | Rare special effects |
| Autosave between waves | |
| | Tokens, professions, difficulty tiers |

## Milestones

Each milestone ends with something playable.

1. **Battlefield** — heroes hold positions, enemies march down, auto attacks,
   gate HP, win/lose a wave.
2. **Aggro** — threat, target switching, Taunt, orange/red icons.
3. **Player controls** — tap to focus, ability buttons, resource bar, AUTO, pause.
4. **Class kits** — 4 classes with starting abilities, default abilities, traits;
   healing, buffs, debuffs. (Step 3 already added each class's default
   starting ability, its resource, and simple effects: heal/damage over time
   and slows.)
5. **Between waves** — level-up choices, loot choices, "Choose for me",
   Full Auto countdown, autosave.
6. **Chapter 1** — 10 waves, reinforcements, 5 goblin archetypes, 2 bosses with
   cast bars, Kick and Polymorph.

## Technology

- **TypeScript** — JavaScript with type checking.
- **Phaser 3** — 2D browser game framework (rendering, touch/mouse input, scaling).
- **Vite** — build tool and local dev server.
- **Game logic separate from rendering** — the combat simulation is plain code
  independent of the screen. Keeps it testable, makes the art swap easy, and
  keeps multiplayer possible later.

## Testing

- **Computer first, phone at each milestone.** The game runs in any browser;
  on a computer the portrait layout shows as a tall column and mouse clicks act
  as taps. Browser developer tools can also simulate a phone screen.
- **Hosting:** GitHub Pages, deployed automatically from the repo by a GitHub
  Actions workflow (added when the first code lands). The same link works on
  computer and phone.
- **Running locally (optional):** install Node.js, clone the repo, run
  `npm install` then `npm run dev`.
