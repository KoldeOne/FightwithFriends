# Ideas

Every idea for FightwithFriends that hasn't been built yet, in one place.
Add new ones here. When an idea is built, move it into
[GAME_DESIGN.md](GAME_DESIGN.md); when it's dropped, note it in §12 there.

Who raised it: **Bailey**, **Kolde**, or **Design** (came up while writing the
design doc).

---

## Story and world

| Idea | From | Notes |
|---|---|---|
| **The helper: a greedy, funny, playful girl** | Bailey | She runs the camp and helps you summon heroes there. She's in it for the money, and all the gold you earn goes to her. |
| **Opening story** | Bailey | The game starts with her realizing there's a lot of money in sending heroes into dungeons. She summons a hero (you pick 1 of 3 options), then transports them to the dungeon and the run begins. The map run already starts with one hero (picked from all 6 today), so this is mostly the story scene around it. |
| **Victory animation** | Bailey | When you win the game, she throws all the gold she's earned from you into the air and rolls around in it. |
| **Themed areas of 100 levels** | Bailey | Each 100 levels is one theme. The first area is **Hell**: levels 1–10 are one section of Hell with its own boss, 11–20 a different section with a new boss, and so on. Within each 10-level section the scenery starts plain and gets more detailed each level until the boss. Today the map has three acts of 12 floors (The Goblin Woods, The Sunken Crypt, The Burning Rift), so the acts, enemies and length would need to change to fit. |

## Modes

| Idea | From | Notes |
|---|---|---|
| **Combine the Arena and Camp Mode for now, split them later** | Bailey | Kolde already combined them on 2026-11-03: the camp is now the progression between map runs. Still to do: plan the separate modes for later. |

## Gear

| Idea | From | Notes |
|---|---|---|
| **Split gear from gear upgrades** | Bailey | Two separate things: **gear drops on its own** (actual weapons, armor and trinkets), and **upgrade items** improve the gear you have. Today the camp only has upgrade levels per slot, paid with Spoils and materials. |
| **See your gear and upgrades** | Bailey | **Partly built (2026-11-03):** tap a hero to see its upgrade numbers (run upgrades, camp gear, Drills); the camp cards show the gear bonuses. Still to come with real gear: equipped and spare gear, and upgrade items. |
| **Real loot items** | Bailey + Kolde | Today there are only Spoils, Ore, Hide, Gems and Trophies. Bailey wants to design actual items with Kolde first. **Decided 2026-11-03: a future phase**; for now the camp upgrades stay as they are. |
| **Professions upgrade gear?** | Kolde | Open. Suggestion: upgrades stay on the gear *slot* (e.g. the Warrior's weapon slot), so finding better gear never wastes upgrades; the stations are the professions. |
| **Gear found during a run** | Design | Item drops in the run (weapon, armor, trinket, picked 1 of 3), alongside the camp's gear. Could be how gear drops on its own. |

## Map run and camp

(Camp Mode became the camp between map runs on 2026-11-03; its 1-hero-start
idea is now built, and the round 30 cap is gone. Also built on 2026-11-03 and
moved to the design doc: chance encounters with the Wishing Well, a pick for
every hero at chests and training, much slower XP with a harder start, and a
party of at most 4.)

| Idea | From | Notes |
|---|---|---|
| **Training station / progression system** | Bailey + Kolde | Today it's a placeholder (Drills: +1 starting level). Kolde wants to work out the progression vision together before it's built. |
| **Jeweler's real effect** | Kolde | Still undecided; the placeholder (+4% regen, 2% faster cooldowns a level) is there to get a feel for it. |
| **Harder levels pay more, in more detail** | Kolde | Act 2 and 3 already pay 2× and 3× Spoils. He thinks progression needs a more detailed design. |
| **Cloud saves** | Design | Saves are per device today. Kolde didn't answer this one yet. |
| **Difficulty ladder (what a win unlocks)** | Kolde | **Decided 2026-11-03, for a later design phase:** winning a full run on a difficulty unlocks a specific character (all characters stay unlocked during testing). Suggestion: tiers 1–5, each adding one rule (stronger enemies, more elites, less gold, a second boss move) and +25% camp loot. Open: which classes start locked, or new classes to unlock. |
| **Chance encounter content** | Bailey + Kolde | The ? nodes are built (2026-11-03) with one event, the **Wishing Well** (an extra life). Still to do: more events (good, bad, or a choice), their story, art on the pop-up window, and the helper's lines. The text lives in `src/sim/events.ts`. |
| **Progression design (Training station, Jeweler, harder pays more)** | Kolde | Suggestions waiting on a decision: the Training station sells perks for Trophies (start with gold, an extra reroll, more first-ability choices) instead of +1 level; the Jeweler gives faster cooldowns only; harder difficulty tiers pay more loot. |

## Heroes

| Idea | From | Notes |
|---|---|---|
| **Race per class** | Bailey | Let players change the race of each class. Parked on 2026-11-01. |
| **More classes** | Design | Hunter, Druid, Shaman (from the old castle design). Need full designs. |
| **Party synergies** | Design | Bonuses for class or role combinations. |
| **Recruit as 1 of 3** | Design | Instead of a free pick of any class, a recruit campsite offers 3 random classes. Coming back to this later. |
| **Bench** | Design | Allow more than 5 heroes, with a bench. |
| **Formation choice** | Design | E.g. "spread out" vs "huddle", if it would add something now that the grid is gone. |
| **Rename abilities to fit the setting** | Design | The new abilities have working names; the WoW-derived names must change before any public release. |

## Arena

| Idea | From | Notes |
|---|---|---|
| **Tappable ultimates** (coming back to this later) | Bailey | Each hero gets an ultimate ability with a button on screen you tap to fire it. Today the heroes fight entirely on their own and the old ability buttons were dropped, so this would be the one thing the player controls during a fight. |
| **More boss moves** (coming back to this later; could be a difficulty-tier rule) | Design | Each boss has one signature move (War Cry, Raise Dead, Rain of Fire); later bosses could get more. |
| **Final enemy and boss art** | Design | The current enemy sprites are temporary. Bailey's setting work may change how enemies look. |
| **Multiplayer** | Design | The sim still supports a player-controlled hero, so a friend could take a hero later. |

## Parked from the old castle-gate design

From [archive/GAME_DESIGN_v1.md](archive/GAME_DESIGN_v1.md). Some may fit the
camp now.

| Idea | Notes |
|---|---|
| Castle professions (Blacksmithing, Enchanting, Alchemy, Engineering, Tailoring, Inscription) | The camp's Blacksmith, Armorer and Jeweler cover part of this |
| Banners (1 per run) | |
| Difficulty tiers (5-tier ladder with rules) | See the difficulty ladder above |
| Starting-ability unlocks (3 options per class) | Could be a Training station reward |
