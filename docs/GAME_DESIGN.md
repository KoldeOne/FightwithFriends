# FightwithFriends — Game Design Document

> **Status:** Playable prototype, drafted from the code on 2026-11-02.
> **Platform:** Mobile browser (tested on Android), portrait, 540x960 canvas.
> **Play it:** https://koldeone.github.io/FightwithFriends/

This document describes the game **as it is built today**. Numbers come from
`src/sim/content.ts` and `src/sim/run.ts`. When the code and this doc disagree,
the code wins; please update the doc.

- Items marked **(proposed)** are ideas we haven't built.
- Ideas from the original castle-gate design that we dropped or set aside are in
  §12. The full original doc is in
  [archive/GAME_DESIGN_v1.md](archive/GAME_DESIGN_v1.md).

---

## 1. Concept

**FightwithFriends** is an **arena auto-battler** for phones. You pick a party
of fantasy heroes, place them on a small board and watch them fight a matching
enemy team. Between rounds the heroes level up, and every 5 rounds you choose
one new ability or upgrade for each hero. The run is endless, and you have 3
lives.

It takes inspiration from guild-management arena games, but the names, art
and systems are our own.

### Design pillars

1. **Low-tap mobile play.** Your decisions are the team, where each hero stands
   and the rewards. You never tap during combat. All heroes are AI.
2. **Team roles matter.** Tanks, healers and damage dealers each have a clear
   job, driven by an aggro (threat) system.
3. **Every run is different.** Reward choices give each hero a different build
   every run.
4. **Readable at a glance.** Cast bars, aggro warnings, buff icons and an
   inspect window explain why things happen.
5. **Start small, build up.** Four classes and simple pixel art for now, with
   the structure in place for more classes, enemies and meta progression.

### Design rules

- **Every ability must earn its slot.** Cooldowns are short enough to matter.
  Single-target effects must be strong.
- **Any party can work.** A tank, a healer and damage dealers is the safe
  choice, but classes can repeat and no line-up is required.
- **Deterministic simulation.** The same seed and choices always play out the
  same way. This keeps tests and balance runs reliable.

---

## 2. Run structure

| Rule | Value |
|---|---|
| Lives | **3** per run. Losing a round costs one, and you **retry the same round**. At 0 lives the run ends. |
| Length | **Endless.** Your best round is saved and shown on the title screen. |
| Party size | **3** heroes for rounds 1–10, **4** for rounds 11–20, **5** from round 21. |
| Enemy count | Matches the party size (3, then 4, then 5). |
| Between rounds | All heroes return to full health and **level up** (+6% stats per level). |
| Rewards | Each hero gets one reward choice **every 5 rounds** (see §5). |
| Saving | The run autosaves to localStorage (`RunState` v3) after every round and change. |

### Flow of one round

1. **Placement.** The enemy line-up is shown on its tiles at the top. Tap a
   hero, then a tile, to move it. Tapping a tile that's already taken swaps the
   two heroes. The layout is kept between rounds. Press **Fight!**.
2. **Intro banner** with the round name (for example "Round 5 — Elite: Goblin
   Brute").
3. **Combat.** Everyone acts on their own. You can pause, inspect units and
   read tooltips (§9).
4. **Result.**
   - **Win:** a short slow-motion beat on the last kill, then level-ups. On
     every 5th round you also pick a reward.
   - **Loss:** you lose a life and can retry the round, after moving heroes if
     you like. A retry uses a different seed, so it isn't an exact replay.
   - **Out of lives:** the run ends and your best round is recorded.

### Recruits

After you beat the bosses on rounds **10** and **20**, a party slot opens. You
can pick **any class** for it, including one you already have.

- The recruit joins at the party's level.
- It also gets the rewards it would have auto-picked so far, so it isn't behind
  the rest of the party.
- It goes on a free tile: front row for Warriors and Rogues, back row for
  everyone else.

### Team builder

At the start of a run you fill **3 slots** from the 4 classes. Classes can
repeat, and duplicates are labeled "Mage", "Mage 2" and so on. The default
team is Warrior, Priest and Mage.

---

## 3. The board

- The arena sits between the top bar and the hero panels, from y 104 to y 790.
- **Each side has a 4 x 3 grid of tiles.** Row 0 is the front row, nearest the
  middle of the arena.
  - Columns are at x = 90, 210, 330 and 450.
  - Hero rows are at y = 560, 645 and 730.
  - Enemy rows are at y = 360, 275 and 190.
  - Each tile is 112 x 80.
- **Default placement:** Warriors and Rogues in the front row, everyone else in
  the back. Columns fill in the order 1, 2, 0, 3.
- Tiles only set where units **start**. Once the fight begins, everyone moves
  freely (§6).

---

## 4. Classes

| Class | Role | HP | Attack | Range | Resource | Notes |
|---|---|--:|---|--:|---|---|
| **Warrior** | Tank / melee | 340 | 9 every 1.0s | 14 | Rage | Threat ×1.5; the party's tank |
| **Rogue** | Melee DPS | 210 | 10 every 0.6s | 120 | Energy | Threat ×0.7 |
| **Mage** | Ranged DPS and control | 170 | 20 every 1.8s | 380 | Mana | |
| **Priest** | Healer | 190 | 5 every 1.5s | 340 | Mana | Each auto attack also heals an ally for 22 |

Hero movement speed is 60.

### Resources

| Resource | Start | Max | Regen |
|---|--:|--:|---|
| **Rage** | 0 | 100 | +0.6 per damage dealt, +0.5 per damage taken |
| **Mana** | 100 | 100 | 3 per second |
| **Energy** | 100 | 100 | 12 per second |

### Kit

Each hero has **5 ability slots**: the starting ability plus 4 more earned
during the run. Class traits also take a slot. Each hero also has an
always-on **starting passive**, which doesn't take a slot.

| Class | Starting ability | Starting passive | Earnable pool | Trait |
|---|---|---|---|---|
| Warrior | Heroic Strike | **Taunt:** automatically taunts an enemy attacking an ally (every 8s) | Thunderclap, Shield Block, Whirlwind | **Rage:** hits up to 20% harder at full rage |
| Priest | Heal | **Power Word: Fortitude:** the whole party has +20% max HP | Renew, Power Shield, Prayer of Healing | **Inner Focus:** Renew costs half while the whole party is above 80% HP |
| Mage | Fireball | **Polymorph:** every 15s, turns an enemy into a sheep (elites first, then casters; never bosses) | Ice Lance, Blizzard, Counterspell | **Arcane Surge:** 25% chance that Fireball costs no mana |
| Rogue | Sinister Strike | **Stealth:** starts hidden; the first hit deals double damage; re-stealths after 5s out of combat | Eviscerate, Kick, Evasion | **Combo Points:** auto attacks build up to 5 points; Sinister Strike spends them for +15% damage each |

### Ability numbers (base, before level and upgrades)

| Ability | Cost | Cooldown | Effect |
|---|--:|--:|---|
| Heroic Strike | 15 | 3s | 26 damage, extra threat |
| Thunderclap | 20 | 6s | 12 damage in a 120 radius; high threat; slows attacks (×1.3 attack time) |
| Whirlwind | 25 | 6s | 20 damage to every nearby enemy |
| Shield Block | 15 | 12s | 50% less damage taken for 5s |
| Heal | 25 | 3s | Heals 80 |
| Renew | 20 | 3s | Heals 60 over 9s |
| Power Shield | 20 | 6s | Absorbs 60 damage |
| Prayer of Healing | 40 | 10s | Heals the whole party for 35 |
| Fireball | 30 | 4s | 45 damage plus a 15 burn over 3s |
| Ice Lance | 12 | 2s | 28 damage |
| Blizzard | 35 | 12s | 9 damage per second for 6s on the biggest enemy group; slows |
| Counterspell | 0 | 12s | Interrupts a cast and locks the enemy out of casting |
| Sinister Strike | 40 | 1.5s | 32 damage |
| Eviscerate | 35 | 6s | 55 damage |
| Kick | 0 | 10s | 8 damage; interrupts a cast (range 420) |
| Evasion | 0 | 20s | Dodge 75% of attacks for 6s |

Taunt, Fortitude and Polymorph still exist as ability definitions, but they're
only used through the passives now.

---

## 5. Hero progression (within a run)

- **Level-ups.** Every hero gains a level after each round won. Each level adds
  **+6%** to health, damage and healing.
- **Reward choice every 5 rounds.** Each hero is offered **3 options**:
  - After rounds **5, 10, 15 and 20**, the options are **new abilities** from
    the class pool (until the slots are full).
  - Otherwise, the options are drawn from these upgrades:
    - **Class trait.** Takes an ability slot.
    - **Empowered X:** +25% effect per rank.
    - **Quick X:** 20% shorter cooldown per rank, up to 2 ranks.
    - **Vitality:** +10% max HP per rank.
    - **Might:** +10% damage and healing per rank.
- **Choose for me / Auto picks.** "Choose for me" turns Auto picks on and fills
  in every remaining choice. The AI pick order is:
  1. a new ability, in pool order
  2. the trait
  3. Empowered on the starting ability
  4. Might
  5. otherwise the first option
- The offers are seeded by the run's seed, round and slot, so they are the same
  if you reload.

---

## 6. Combat

### Basics

- The simulation runs at a fixed step of 0.05s, and the renderer interpolates
  between steps. A round is **won** when every enemy is down and **lost** when
  every hero is down.
- **Sudden death.** After **60 seconds**, all damage increases by 5% per
  second, so healer-heavy fights can't stall.

### Aggro (threat)

- Enemies attack whoever has the most threat on them. Damage creates threat,
  multiplied by the class's threat multiplier. Healing creates **0.3×** the
  amount healed as threat, split across the enemies already in combat.
- **Pulling aggro:** a hero has to pass **110%** of the current target's threat
  to take the enemy's attention. This stops targets from flip-flopping.
- **Warning icon** (orange) at **80%** of the top threat; red when the hero has
  aggro.
- **Careful AI:** non-tank heroes hold back attacks that would put them over
  **90%** of the tank's threat. This includes the Rogue's ×2 ambush hit.
- **Taunt** forces an enemy to attack the Warrior (range 420).

### Hero AI and movement

- Heroes steer with easing (they speed up and slow down on arrival) and stop
  just inside their attack range.
- **Melee heroes** close in and **flank** instead of blocking each other.
- **Ranged heroes** step up when nothing is in range.
- Heroes stay within **140px** of the party's anchor point (the leash). When
  it's quiet, they drift back toward their start tile.
- Heroes use abilities on their own when it makes sense:
  - heals on the most hurt ally
  - interrupts on enemy casts
  - Blizzard on the biggest group
  - Shield Block when taking hits

### Enemy AI

| Behaviour | Who | What it does |
|---|---|---|
| Melee | Grunt, Skeleton, Ghoul, Hellhound, Fiend | Moves in. Melee enemies **surround** their target instead of stacking on top of each other. |
| Ranged | Archer, Bone Archer, Fire Imp | Keeps its distance and shoots. Projectile damage lands when the shot arrives. |
| Healer | Shaman (Mend), Death Cultist (Dark Mend), Shadow Caller (Shadow Mend) | Casts for **2.5s** to heal a hurt ally (missing at least 40 HP) for **70**. 7s cooldown. Can be interrupted. |
| Smasher | Brute (Smash), Abomination (Slam), Pit Brute (Crush), and all bosses | Telegraphed cast for **1.8s**, then a hit for **2.9×** its damage, plus **1.25×** splash within 70px. 8s cooldown. Can be interrupted. |

- **Elites** (Brute, Abomination, Pit Brute) are the Mage's first Polymorph
  targets. Casters are next.
- **Bosses** are immune to Polymorph.

---

## 7. Enemies

### Factions

| Rounds | Faction | Melee | Ranged | Healer | Fast | Elite | Boss |
|---|---|---|---|---|---|---|---|
| 1–10 | **Goblins** | Grunt 220 HP / 22 | Archer 130 / 16 | Shaman 150 | — | Brute 620 / 24 | **Goblin Warchief** 1100, *Skull Crack* |
| 11–20 | **Undead** | Skeleton 260 / 24 | Bone Archer 150 / 18 | Death Cultist 170 | Ghoul 180 / 18 (speed 60) | Abomination 760 / 28 | **The Bone King** 1700, *Grave Cleave* |
| 21+ | **Demons** | Fiend 320 / 28 | Fire Imp 160 / 20 | Shadow Caller 200 | Hellhound 220 / 22 (speed 65) | Pit Brute 900 / 32 | **Demon Lord** 1800, *Hellfire Slam* (every 10th round) |

(These are base numbers. The round's strength multiplier scales enemy HP and
damage.)

### Line-ups

- **Rounds 1–20** have hand-made, named line-ups, for example:
  - Round 1, "Grunt Squad": three Grunts
  - Round 5, "Elite: Goblin Brute"
  - Round 10, "BOSS: Goblin Warchief"
  - Round 11, "The Risen"
  - Round 14, "Elite: Abomination"
  - Round 20, "BOSS: The Bone King"
- **Rounds 21+** cycle through **5 demon line-ups**, mirrored on alternate
  rounds. Every 10th round uses the Demon Lord line-up.

### Strength curve

| Rounds | Enemy strength (HP and damage multiplier) |
|---|---|
| 1–10 | 1.6 + 0.08 per round (about 1.7 → 2.4) |
| 11–20 | 3.2 + 0.14 per round (about 4.7 → 6.0) |
| 21+ | 4.9 + 0.25 per round, with no cap |

The bosses are the big difficulty spikes. In simulation, AI-only runs (with no
placement changes) usually end **between rounds 26 and 36**.

---

## 8. Game feel

- **Smooth motion.** Rendering is interpolated between simulation steps, units
  steer with easing, and units are softly pushed apart so they don't overlap.
- **Projectiles.** Ranged damage lands when the shot arrives.
- **Hit feedback.**
  - Every hit: a white flash, a small knockback and sparks.
  - Heavy hits: a small screen shake and a brief hit-pause.
  - Last kill: a slow-motion beat.
- **Numbers.** Rapid hits on the same target merge into one number.
- **Sound.** All sound effects are synthesized in the browser, with no audio
  files. You can mute in the top bar, and the setting is remembered.
- **Art.** Heroes use 32x32 pixel-art sprites drawn at 2x
  (`art/heroes/make-sprites.ps1`). Enemies are still coloured discs with
  letters.

---

## 9. UI

- **Top bar:** a big round number, with the line-up name, lives (♥), enemies
  left and the fight clock underneath; pause and sound buttons.
- **Hero panels** (bottom): one per hero, showing HP, resource and ability
  icons with cooldowns. Tap a panel to inspect that hero.
- **Ability tooltips:** hover over or tap an ability to see its damage or
  healing numbers (scaled by level and upgrades), cost, cooldown and upgrade
  ranks.
- **Buff icons:** up to 4 small lettered icons under each unit's health bar.
  Buffs come first; debuffs have a red outline. Examples: Evasion, Renew,
  Shield, Slowed.
- **Inspect window:** tap any unit, hero or enemy, to see:
  - HP, resource, attack, auto-heal and move speed
  - tank threat
  - passive, abilities (with cost, cooldown and effect text), traits and active
    effects
  - for enemies: whether it's an elite or caster, and its current cast

  The window updates live. Tap empty ground to close it.
- **Pause** doesn't block anything. While paused you can still inspect units
  and open tooltips.
- **Aggro icons:** orange "!" for a warning, red when the hero has aggro.
- **Cast bars:** shown above enemies that are casting.

---

## 10. Tech

- TypeScript, Phaser 3.90 (Scale.FIT), Vite and Vitest.
- `src/sim` holds the pure, deterministic simulation: a seeded RNG and no
  Phaser. `src/render` draws it.
- GitHub Actions deploys to GitHub Pages.
- A debug handle (`window.__game`) is used for automated browser checks.

---

## 11. Future directions (proposed)

Ideas that fit the arena game and haven't been built yet:

- **More classes and synergies**, for example a Paladin (tank/healer hybrid),
  Hunter or Warlock. Possibly party bonuses for class or role combinations.
- **Gear** found during a run: weapon, armor and trinket, picked from 1 of 3.
- **Meta progression between runs**, a lighter version of the old castle idea
  (§12).
- **Enemy and boss sprites.**
- **Unique boss abilities** beyond the heavy slam.
- **Balance tool:** batch-simulate runs and report where they end.
- **Multiplayer:** the sim still supports a player-controlled hero (tests use
  it), so a friend could take a hero later.

---

## 12. Dropped and parked ideas

These come from the original castle-gate design (see
[archive/GAME_DESIGN_v1.md](archive/GAME_DESIGN_v1.md)).

| Idea | Status | Why / note |
|---|---|---|
| Castle gate, enemies marching in waves, flank spawns | **Dropped** | Replaced by the arena board |
| Player-controlled hero, ability buttons, focus target, Full Auto toggle | **Dropped** | The game is fully AI. Only the sim's test path remains. |
| 30-wave runs with a win at wave 30 | **Dropped** | Runs are now endless, with 3 lives |
| Revives | **Dropped** | Lives and round retries cover this |
| Castle professions (Blacksmithing, Enchanting, Alchemy, Engineering, Tailoring, Inscription) | **Parked** | Possible base for meta progression |
| Tokens (the only currency) | **Parked** | Goes with meta progression |
| Banners (1 per run) | **Parked** | |
| Difficulty tiers (5-tier ladder with rules) | **Parked** | Endless rounds plus a best-round score cover this for now |
| Starting-ability unlocks (3 options per class) | **Parked** | |
| Gear and loot | **Parked** | See §11 |
| Paladin, Druid, Shaman, Warlock, Hunter | **Parked** | See §11 |
| ~8 abilities per class pool | **Reduced** | 3 earnable abilities per class, plus a trait |
| Out-of-range red outline on ability buttons | **Dropped** | There are no ability buttons |

---

## 13. Open questions

**Arena**

1. **Recruits:** keep free picks, or offer a choice of 1 from 3?
2. **Bench:** allow more than 5 heroes, with a bench?
3. **Bosses:** give bosses unique abilities beyond the heavy slam?
4. **Enemy and boss sprites.**
5. **Rogue reach:** the Rogue is "melee" but has a 120 range. Kick's 420 range
   is also long. Both were workarounds from when heroes stood still. Should we
   shorten them now that heroes move?
6. **Pool size:** 3 earnable abilities plus a trait fill the 5 slots by round
   20. After that, rewards are only upgrades. Should the pools grow, or should
   players be able to swap abilities?
7. **Placement depth:** the board sets only starting positions. Should tiles
   matter more, for example front-row damage reduction or adjacency bonuses?

**Carried over**

8. **Exact numbers:** damage, HP, threat and costs, to be tuned in playtests.
9. **Final ability names and art:** rename the working names taken from WoW
   before any public release. Use original or properly licensed art only.
10. **Later classes:** full designs.
11. **Race per class (parked for later):** let players change the race of each
    class. Set aside on 2026-11-01 to revisit later.
