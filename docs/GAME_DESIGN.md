# FightwithFriends — Game Design Document

> **Status:** Playable prototype, drafted from the code on 2026-11-02 (updated
> the same day for the Paladin, Warlock, sprites, balance pass, the ability and
> upgrade overhaul, boss moves and removing the grid; then Camp Mode, §2b).
> **2026-11-03:** rounds were replaced by a Slay the Spire-style **map run**
> (§2), and Camp Mode became the camp between runs (§2b). Later the same day:
> a party of 4, a pick for every hero at chests and training, chance
> encounters (the Wishing Well), and a harder start with slower XP. Then:
> recruits spread across the run, richer golden nodes, new spells before
> upgrades, a damage meter, and a damage boost from a used wish.
> **Platform:** Mobile browser (tested on Android), portrait, 540x960 canvas.
> **Play it:** https://koldeone.github.io/FightwithFriends/

This document describes the game **as it is built today**. Numbers come from
`src/sim/content.ts` and `src/sim/run.ts`. When the code and this doc disagree,
the code wins; please update the doc.

- Ideas we haven't built are in [IDEAS.md](IDEAS.md).
- Ideas from the original castle-gate design that we dropped or set aside are in
  §12. The full original doc is in
  [archive/GAME_DESIGN_v1.md](archive/GAME_DESIGN_v1.md).

---

## 1. Concept

**FightwithFriends** is an **arena auto-battler** for phones. You start a run
with one hero and climb a branching map through three acts: fights, elites,
chests, shops and campsites, where new heroes join until the party is four.
Heroes fight on their own; your decisions are the route, the party, and the
abilities and upgrades each hero takes. A party wipe ends the run, but every
fight's loot goes home to **the camp**, whose gear makes later runs stronger.

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
5. **Start small, build up.** Six classes and simple pixel art for now, with
   the structure in place for more classes, enemies and meta progression.

### Design rules

- **Every ability must earn its slot.** Cooldowns are short enough to matter.
  Single-target effects must be strong.
- **Any party can work.** A tank, a healer and damage dealers is the safe
  choice, but classes can repeat and no line-up is required.
- **Deterministic simulation.** The same seed and choices always play out the
  same way. This keeps tests and balance runs reliable.

---

## 2. Run structure (the map run)

Code: `src/sim/map.ts` (map generation), `src/sim/acts.ts` (acts, encounters,
economy), `src/sim/run.ts` (run state, rewards, Auto).

| Rule | Value |
|---|---|
| Start | **One hero.** Pick any class and its **first ability** (any active from its pool). |
| Acts | **3, always in this order:** The Goblin Woods (goblins), The Sunken Crypt (undead), The Burning Rift (demons). Each act has its own look, enemies, elite and boss. |
| Map | Each act is a new random map: **12 floors** of nodes on branching, non-crossing paths, then the act's **boss**. You pick one node per floor. |
| Losing | **A party wipe ends the run**, unless you carry a **wish** from a Wishing Well (then everyone rises and the fight starts over). |
| Party | Up to **4** heroes. |
| Health | Everyone is back to full health after every fight. |
| Winning | Beat the Act 3 boss. Wins are counted on the title screen; a win will unlock something new later (not designed yet). |
| Best | Your furthest point (act and floor) is saved and shown on the title screen. |
| Saving | Autosaves to localStorage after every step (`RunState` v5, key `fightwithfriends.run.v5`). Pre-map saves are dropped. |

### Node types

| Node | What happens |
|---|---|
| **Fight** | The act's regulars. Gold and XP. |
| **Elite** | A tougher fight around the act's elite (×1.15 strength). More gold and XP, then **one reward for one hero** (1 of 3, mostly new abilities). About 40% of elites carry a **twist**, shown under the node: *Enraged* (enemies deal 30% more damage), *No Rest* (heroes heal 50% less) or *Swarm* (two extra enemies); those are a little tougher, give 2 more XP and offer **4** rewards. |
| **Chest** | Gold (20–34, ×2 if golden), then **one reward for one hero**: 1 of 3 (4 if golden), mostly new abilities while anyone has a free slot. |
| **Shop** | 3 abilities and 2 upgrades for specific heroes, bought with gold; reroll for 10 (rising). Prices rise each act. |
| **Campsite** | Two campsite floors are **recruits** (pick any class, repeats allowed, and its first ability): **mid-Act 1 (floor 6)** and **mid-Act 2 (floor 6)**. A third hero joins **right after the Act 1 boss**, so the party is 4 by the middle of the run. Every other campsite is **training**: **every hero picks 1 of 3** (new abilities or passives, or upgrades once full). |
| **? (chance encounter)** | A random event (`src/sim/events.ts`; text kept as data). Picked at random from: the **Wishing Well** (make a wish, holding at most one, or fish out 25 gold if you already hold one; a used wish brings the party back and the fight starts over); the **Cursed Shrine** (take 40 gold and every hero takes **25% more damage** in the next fight, "☠ cursed" in the top bar, or walk on); **A Feast** (every hero has **15% more max health** for the next two fights, "fed (n)"); **A Wounded Traveller** (pay 15 gold; they catch up at the start of the next act with 60, "a traveller owes you" meanwhile); **The Blood Altar** (the hero with the fewest abilities loses 20% max health until the end of the act, shown as a "Blood price" debuff, and gets an extra pick); and **A Visit from Camp** (the camp's helper drops by with 25 gold; placeholder writing for Bailey). |
| **Boss** | The act's boss; then **every hero picks 1 of 4** (new abilities, or upgrades once full), all on one screen, and the next act. |

Some fights, elites and chests are **golden** (a gold ring): **2× gold, 1.5× XP
and 2× camp loot**, and a golden chest offers **4** options instead of 3. The rewards say how much the golden bonus was.

**Map shape** (2026-11-04): a diamond lattice wrapped around a ring of 8
columns, 4 nodes a floor. **Every node forks in two** (up-left and up-right),
and neighbouring forks share a node, so routes split and rejoin. The two
nodes a fork leads to are **different kinds** (fight or something special;
never the same special twice), except into a fixed campsite floor and into
the boss; on a few early floors where only fights, a chest or an event fit,
it can rarely happen. The act starts at a camp leading to two first-floor
fights. The screen only shows a few floors around you, so the wrap is never
seen.

**Map rules** (so every route has a good mix): floor 1 is fights, floor 2
fights, a chest or an event; no elite or shop before floor 4; no two of the same special node in a
row on a path; every map has at least one shop, two chests and one chance
encounter. Act 1's
campsite floors are 3, 6, 9 and 12 (floor 6 recruits, the others train);
Acts 2 and 3 have
training campsites on floors 6 and 12. Every map uses the same odds for the
other floors (2026-11-03: the hidden "flavours" were removed).

### Flow

1. **Map.** Nodes you can reach pulse; tap one to go there (tap others to see
   what they are). The way you came is a **dotted line**. The act's boss is
   named at the top; its signature move is only revealed once you're on the
   last floor before it.
2. **Fight nodes** start straight away with an intro banner ("Act 1, floor 4 —
   The Goblin Woods"). No ready or "round cleared" screens.
3. **Spoils.** After an ordinary win, a short flashy panel: gold counting up
   (and any golden bonus), the XP everyone standing earned (shown once), any
   level-ups in one line, and the camp loot sent home. It stays up until you
   press the big **Continue** button; with
   **Auto** on it moves on by itself. After an **elite or boss** there's no
   panel: the same rewards line sits at the top of the pick screen instead.
4. **Choices** (recruit, training, upgrade, shop, events) open as overlays on
   the map. At training campsites and after bosses, **one screen** shows a
   row of options per hero: tap one per row (tap again to skip that hero),
   read its details below, then **Confirm**; **Choose for me** fills in the
   rest.
   A wish in hand shows as "✦ wish" in the top bar.
5. **Auto** (top bar) also picks the route (balanced, not elite-chasing),
   recruits, training, upgrades and shopping.

### Encounters and leveling

- **Enemy count:** one per hero, plus one from floor 7 on (a lone hero always
  meets one enemy at a time), up to 5.
- **Strength** (enemy HP and damage): Act 1 1.3 + 0.085 a floor; Act 2 2.52 +
  0.11; Act 3 3.88 + 0.17 (each act starts above the last one's end; raised
  about 8% on 2026-11-04 because forking maps give more good choices). Camp
  balance check: median first win over Act 1 / Act 2 / the run at runs 2 / 5 / 8. Smaller parties meet weaker enemies (×0.6 for 1 hero,
  then 0.62, 0.8, and 1 for 4). Bosses ×1.05 / 1 / 0.95 by act.
- **Gold:** 3 per regular enemy, 14 per elite, 40 per boss, × 1 / 1.4 / 1.8 by
  act (raised minions pay nothing).
- **XP, per hero (slow on purpose):** a fight gives 4, an elite 7, a boss 12
  (×1.5 golden), the same for everyone standing; heroes who fell in that fight
  get none. Each level costs a little more than the last (10 XP, then 13, 16,
  ...; +6% stats a level), so a hero who is ahead slows down and the party
  levels out over time, while the starting hero stays ahead. **Recruits** join
  at the run's starting level; there is no catch-up bonus.

---

## 2b. The camp (between runs)

Bailey's Camp Mode (2026-11-02), folded into the map run on 2026-11-03: there
is one game loop, and the camp is its meta-progression. Code:
`src/sim/camp.ts` and `src/render/screens/camp.ts`; open it from the title
screen or the end-of-run screen. Every number is a placeholder to tune.

| Rule | Value |
|---|---|
| Loot | Every fight's loot (**win or lose**) goes straight to the camp. Dying costs nothing you've banked. |
| What resets | Everything in the run (levels, abilities, upgrades, gold). Gear, perks, loot and the camp's records are kept. |
| Gear | Per **class**: every hero of that class, in every later run, recruits too. |
| Saves | `fightwithfriends.camp.v1` (the camp, now version 3 with its records and perks; older saves keep their loot and gear, and Drills already bought are refunded). |

Gold (spent in the run's shops) and camp loot are separate.

**Loot** (`lootFor`; numbers in `LOOT` in `content.ts`): Spoils (currency),
three placeholder materials (Ore, Hide, Gems) and boss Trophies. Spoils are
× the act (Act 2 pays double, Act 3 triple).

| Enemy | Drop |
|---|---|
| Basic | 1 Spoils × act; 5% × act chance of a random material |
| Elite | 4 Spoils × act, 1 random material |
| Boss | 15 Spoils × act, 1 of each material, 1 Trophy |
| Raised minion | Nothing |

**Stations** (gear per class, levels 0–10; next level costs 10n + 3n² Spoils
and n of the station's material, and every 5th level also a Trophy):

| Station | Gear | Per level |
|---|---|---|
| Blacksmith | Weapon (Ore) | +8% damage and healing |
| Armorer | Armor (Hide) | +8% maximum health |
| Jeweler | Trinket (Gems) | +8% mana/energy regen, 4% faster cooldowns |

**Changed from the round-based Camp Mode:** the 1.6× enemy toughness, start
rounds (1/11/21), the round-30 cap, party picking at camp and the separate
mode are gone; the map run's own difficulty and win apply. Drops are lower,
because a map run has more fights. Gear keeps Bailey's +8% a level: the map
run is now tuned so an ungeared party usually falls, and the camp is what
gets you through (2026-11-03).

Tap a hero in a fight to see its **Upgrades**: this run's Might / Vitality /
Focus, and the camp gear in numbers (no gear on a Random Challenge). The camp's hero cards show the
gear bonuses too.

Real item drops are still to be designed (see [IDEAS.md](IDEAS.md)).

### Progression (2026-11-04)

Code: `src/sim/progress.ts` (rules and numbers), `settle.ts` (`keepRecords`),
the title screen (`screens/hero.ts`) and the camp (`screens/camp.ts`). All
numbers are first placeholders.

- **Difficulty tiers.** Normal, then Tiers 1–5, chosen on the title screen
  (◀ ▶, remembered). Winning a run on a tier opens the next one. (Class unlocks are not in the game yet: every class is always playable.) Each tier
  adds one rule to those below it and pays +25% camp loot per tier:
  1. Elites are 15% tougher.
  2. Enemies drop 20% less gold.
  3. Every enemy is 10% tougher.
  4. Your heroes heal 15% less.
  5. One more enemy in every fight from floor 4 (not bosses).
- **Ability unlocks.** Each class starts with 4 of its pool (plus its
  starting ability). Every boss beaten with that class in the party unlocks
  one more, with a notice on the rewards. Locked abilities are never
  offered (first ability, training, chests, shops).
- **Training Ground perks** (replaced Drills). Bought once each, for the
  whole guild, from every later run on (not a Random Challenge):
  | Perk | Effect | Cost |
  |---|---|---|
  | Coin Purse | Start with 50 gold | 60 Spoils, 1 Trophy |
  | Haggler | First reroll in every shop is free | 80 Spoils, 1 Trophy |
  | Mentor | Training campsites offer 4 choices | 140 Spoils, 2 Trophies |
  | Lucky Charm | Start holding a wish | 180 Spoils, 2 Trophies |
- **The camp grows.** The Trophy Wall mounts a skull for each boss you've
  killed (with a count); tap it for bosses slain, tier wins and each class's
  unlocked abilities. The Graveyard has a headstone per finished or abandoned
  run (the newest 12; tap for the list). A pennant goes up around the fire
  for every win, and more tents appear at 5, 15 and 30 runs.
- **Random Challenge** (`🎲 Challenge` on the title screen): a random hero
  (drawn like a slot machine; Back and try again to draw another) and a fresh
  random map, at Normal, with **every ability open** but **no camp gear or
  perks**. Camp loot still comes home. It doesn't count toward boss kills,
  tiers, ability unlocks, or your normal best and wins; it keeps its own best
  (`fightwithfriends.challenge`), shown on the draw and at the end. Its runs
  get a grave marked "Challenge". (Replaced the daily run, 2026-11-04.)

**Balance check** (`npm run camp-sim -- [guilds] [runs]`: the AI plays a
guild's map runs back to back, rotating the starting class, and spends all loot
on the cheapest upgrade).

Target (decided 2026-11-03): you have to earn the win. Beat Act 1 after about
1–2 failed runs, Act 2 by about run 4–6, the whole run around run 8–12.

Result (20 guilds × 15 runs, 2026-11-03, after one-pick chests, the new
encounters, 4 slots and the steeper XP curve): the first run that beat Act 1
was run 2 (median), Act 2 run 5, the whole run run 8. A winning run now has
about 40 picks (was ~53), and the party picks share one screen.

| Runs | Beat Act 1 | Beat Act 2 | Won |
|---|---|---|---|
| 1 | 40% | 5% | 0% |
| 2–3 | 60% | 13% | 5% |
| 4–6 | 75% | 38% | 7% |
| 7–10 | 86% | 53% | 28% |
| 11–15 | 91% | 81% | 61% |

---

## 3. The arena (no grid)

- The arena sits between the top bar and the hero panels, from y 104 to y 790.
- **Heroes line up by role** (the 4x3 placement grid was removed on
  2026-11-02; placing heroes by hand didn't add enough to be worth a screen):
  - front line (y 565): tanks and melee (Warrior, Paladin, Rogue)
  - ranged line (y 660): Mage, Warlock
  - back line (y 752): Priest
  - each line is centred, 120 apart; the ranged line is nudged 48 right and the
    back line 48 left so heroes don't hide each other.
- **Enemies** start in their line-up positions on 4 columns x 3 rows at the top
  (x 90/210/330/450, y 360/275/190; row 0 is the front).
- Positions only set where units **start**. Once the fight begins, everyone
  moves freely (§6).

---

## 4. Classes

| Class | Role | HP | Attack | Range | Resource | Notes |
|---|---|--:|---|--:|---|---|
| **Warrior** | Tank / melee | 420 | 12 every 1.0s | 14 | Rage | Threat ×1.5; **armor 25%** |
| **Paladin** | Tank / support | 380 | 13 every 1.2s | 14 | Mana | Threat ×1.3; **armor 20%** |
| **Rogue** | Melee DPS | 210 | 10 every 0.6s | 30 | Energy | Threat ×0.7 |
| **Mage** | Ranged DPS and control | 170 | 20 every 1.8s | 380 | Mana | |
| **Warlock** | Ranged DPS, curses | 180 | 14 every 1.6s | 360 | Mana | |
| **Priest** | Healer | 190 | 5 every 1.5s | 340 | Mana | Each auto attack also heals an ally for 22 |

Hero movement speed is 60. **Armor** stops that fraction of every hit; it's
what lets a tank survive holding several enemies.

### Resources

| Resource | Start | Max | Regen |
|---|--:|--:|---|
| **Rage** | 0 | 100 | +0.6 per damage dealt, +0.5 per damage taken |
| **Mana** | 100 | 100 | 3 per second |
| **Energy** | 100 | 100 | 12 per second |

### Kit

Each hero has **4 slots**: the starting ability plus 3 earned during the run.
Passives picked from the pool take a slot too. Each hero also has an always-on
**starting passive** that doesn't take a slot.

Every class has **6–7 abilities and passives** to earn but only 4 slots, so no
run sees them all and builds differ. Every ability has **one named upgrade**
that changes how it plays. Numbers below are at level 1 with no upgrades; they
grow 6% a level. The pool is listed in the AI's preference order (measured, see
§7).

#### Warrior

Passive: **Taunt**: Automatically taunts an enemy attacking an ally (every 8s).

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Brave Strike** | 15 | 3s | Deals 26 damage with extra threat. | *Cleave*: Also hits another enemy next to the target, just as hard. |
| Pool | **Brace** | 15 | 12s | Takes 40% less damage for 5s. | *Bulwark*: Blocks 60% for 6s. |
| Pool | **Shield Bash** | 15 | 12s | Interrupts and stuns an enemy for 2s, dealing 15 damage. | *Concussive Bash*: Stuns for 3.5s. |
| Passive | **Rage** | | | Hits up to 20% harder at full rage. | |
| Pool | **Rallying Call** | 30 | 20s | The party deals 15% more damage for 8s. | *Battle Cry*: Also heals every ally for 8% of their maximum health. |
| Pool | **Hold the Line** | free | 40s | Below 30% health, recovers 30% of maximum health. | *Unbreakable*: Recovers 50% and blocks 40% of damage for 6s. |
| Pool | **Ground Slam** | 20 | 6s | Deals 12 damage to every nearby enemy (high threat) and slows their attacks for 6s. | *Aftershock*: Enemies hit also deal 15% less damage for 6s. |
| Pool | **Spinning Slash** | 25 | 6s | Deals 30 damage to every nearby enemy, with high threat. | *Blade Cyclone*: Spins twice: a second hit for 60%. |

#### Paladin

Passive: **Aegis Aura**: While the Paladin stands, the whole party takes 10% less damage.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Verdict** | 15 | 4s | Deals 40 damage at range 220; the most injured ally is healed for half of it. | *Twin Verdict*: Also strikes a second enemy for 60%. |
| Pool | **Mercy** | free | 30s | Heals an ally below 35% health for 160. | *Shelter*: They also take 50% less damage for 4s. |
| Passive | **Zeal** | | | Verdict heals for the full damage dealt, not half. | |
| Pool | **Radiant Light** | 25 | 4s | Heals one ally for 95. | *Shared Light*: The Paladin is healed for half as much too. |
| Pool | **Hallowed Ground** | 25 | 10s | Deals 72 damage over 6s to enemies on the blessed ground, with high threat. | *Sanctified Ground*: Also heals allies standing in it. |
| Pool | **Banishing Light** | 25 | 8s | Deals 50 damage (100 to undead and demons). | *Purify*: Also burns for 30 over 3s. |
| Pool | **Gavel Strike** | 15 | 14s | Interrupts and stuns an enemy up to 220 away for 2.5s. | *Heavy Hammer*: Stuns for 4s. |

#### Priest

Passive: **Steadfast Prayer**: The whole party has +20% maximum health.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Mend** | 25 | 3s | Heals one ally for 80. | *Deep Mend*: Heals 40% more. |
| Passive | **Blessed Hands** | | | Heals on an ally below 35% health are 25% stronger. | |
| Pool | **Saving Grace** | 20 | 40s | For 12s, a killing blow on the ally leaves them at 25% health instead. | *Second Wind*: They survive at 50% health. |
| Pool | **Ward** | 20 | 6s | Shields an ally from 60 damage for 15s. | *Mirror Ward*: Attackers take half the damage the shield absorbs. |
| Pool | **Soothing Glow** | 20 | 3s | Heals one ally for 84 over 9s. | *Twin Glow*: Also renews a second ally. |
| Pool | **Radiance** | 30 | 8s | Heals every ally for 25 and deals 25 damage to enemies within 130. | *Blinding Radiance*: +50% healing and damage, and a wider burst. |
| Pool | **Chain of Light** | 30 | 5s | Heals 65, then 46, then 32 (most injured allies first). | *Bright Chain*: Jumps to one more ally, and loses less on each jump. |

#### Mage

Passive: **Woolly Hex**: Every 15s, turns an enemy into a sheep — elites and casters first.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Fireball** | 30 | 4s | Deals 45 damage, then 15 burn damage over 3s. | *Searing Fire*: The burn is twice as strong and spreads to a nearby enemy. |
| Pool | **Counterspell** | free | 12s | Interrupts a cast; locks casting for 4s. | *Spell Burn*: Also deals 40 damage and locks casting for 7s. |
| Passive | **Kindling** | | | Fireball has a 25% chance to cost no mana. | |
| Pool | **Frost Shard** | 12 | 2s | Deals 28 damage. | *Brittle*: Each lance chills the target; chilled or stunned enemies take double damage. |
| Pool | **Ice Storm** | 35 | 12s | Deals 78 damage over 6s to enemies in the storm and slows them. | *Glacial Storm*: A 40% wider storm that hits a third harder. |
| Pool | **Frost Ring** | 20 | 14s | Freezes every enemy within 110 for 2.5s and deals 10 damage. | *Ice Prison*: Freezes for 4s, in a wider ring. |
| Pool | **Star Missiles** | 25 | 6s | Fires 3 missiles of 18 damage at random enemies. | *Star Shower*: Five missiles. |

#### Warlock

Passive: **Reaping**: Whenever an enemy dies, the Warlock regains 20 mana and the most injured ally is healed for 30.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Hex Bolt** | 20 | 3s | Deals 46 damage. | *Hex of Rot*: Also rots the target for 24 over 6s. |
| Pool | **Doom** | 30 | 15s | After 8s, deals 200 damage to the toughest enemy. | *Inevitable*: Lands for 50% more, and comes back 3s sooner. |
| Pool | **Enfeeble** | 15 | 12s | The most dangerous enemy in range deals 30% less damage for 8s. | *Crippling Curse*: 40% less, and it attacks slower. |
| Pool | **Wither** | 15 | 2s | Deals 78 damage over 12s. | *Spreading Blight*: When a withering enemy dies, the curse jumps to the nearest enemy. |
| Pool | **Life Siphon** | 25 | 6s | Deals 40 damage; the most injured ally is healed for the same amount. | *Soul Feast*: Heals for 150% of the damage. |
| Pool | **Curse of Ruin** | 20 | 10s | An enemy takes 25% more damage from everything for 10s. | *Deep Ruin*: +40% damage taken instead. |
| Passive | **Deep Wither** | | | Wither deals 50% more damage. | |

#### Rogue

Passive: **Stealth**: Starts hidden; the first hit out of stealth deals double damage. Re-stealths after 5s out of combat.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Quick Stab** | 40 | 1.5s | Deals 36 damage. | *Serrated Blade*: Also makes the target bleed for 18 over 3s. |
| Passive | **Poisoned Blades** | | | Auto attacks poison the target: 6 damage a second for 4s. | |
| Pool | **Dirty Trick** | 15 | 8s | Stuns an enemy for 2s (breaks its cast). | *Pocket Sand*: Stuns for 3.5s. |
| Pool | **Evasion** | free | 20s | Dodges 75% of attacks for 6s. | *Riposte*: Every dodged attack is answered with a 20-damage counter. |
| Pool | **Finishing Cut** | 35 | 6s | Deals 55 damage. | *Executioner*: Double damage to enemies below 35% health. |
| Pool | **Kick** | free | 10s | Interrupts a cast; locks casting for 4s; deals 8 damage. | *Crippling Kick*: Locks casting for 6s and stuns for 1.5s. |
| Passive | **Momentum** | | | Auto attacks build combo points; Quick Stab and Finishing Cut spend them for +15% damage each. | |
| Pool | **Knife Storm** | 35 | 5s | Deals 26 damage to every enemy within 100. | *Poison Fan*: The knives also poison: 20 damage over 4s. |

Retired on 2026-11-02: **Prayer of Healing** (replaced by Radiance and Chain of
Light), **Inner Focus** (replaced by Blessed Hands). Taunt, Fortitude and
Woolly Hex exist as ability definitions but are only used by the passives.

---

## 5. Hero progression (within a run)

- **Levels** come from XP (§2): +6% health, damage and healing per level.
- **New abilities and passives** come mainly from **training campsites**,
  where **every hero** picks 1 of 3 from their class pool (or 1 of 3 upgrades
  once all 4 slots are full), and from **shops**. Picked abilities stay for the
  run (no swapping).
- **Boss picks:** every hero picks 1 of 4, on one screen.
- **Chest and elite picks:** one reward for one named hero (1 of 3; 4 for a
  golden chest or an elite with a twist). While anyone has a free
  slot, two are **new abilities or passives** (for the heroes with the fewest)
  and one is an upgrade; once everyone is full, three upgrades. You can skip.
- **New spells first:** named upgrades are only offered to a hero with at
  least 3 abilities, and Act 1 shops stock 4 abilities and 1 upgrade.
- **Upgrades:**
  - **Named upgrade** (one per ability, e.g. Fireball: *Searing Fire*). Offered
    first.
  - **Empowered X:** +25% effect per rank. Only offered for abilities with
    something to scale (not interrupts, stuns, Brace, Hold the Line...).
  - **Quick X:** 20% shorter cooldown per rank (up to 2), for cooldowns of 4s+.
  - **Vitality:** +10% max health. **Might:** +10% damage and healing.
    **Focus:** +40% mana or energy regeneration (not offered for rage).
- **Cards show the numbers:** a new ability shows its real numbers; an upgrade
  shows **Now:** and **After:** lines.
- **Auto:** recruits fill a missing tank, then a healer, then damage; training
  takes abilities in the class's preference order; upgrades take named
  upgrades first (one on a hero's first ability, then any), otherwise the
  first offered.
- Offers are seeded by the run's seed and the node, so they're the same if you
  reload.
- **Camp gear and perks** (§2b) apply on top, and carry between runs.

---

## 6. Combat

### Basics

- The simulation runs at a fixed step of 0.05s, and the renderer interpolates
  between steps. A fight is **won** when every enemy is down and **lost** when
  every hero is down.
- **Effects:** slow, stun (can't act; breaks a cast), silence (can't cast),
  weaken (deals less), vulnerable (takes more), empower (deals more),
  block, shield, evasion, guardian (death save), doom (delayed hit),
  heal-over-time and damage-over-time (burn, bleed, poison, rot, wither, holy
  fire), sheep, stealth, fortitude, frenzy (enemy attacks faster).
- **Sudden death.** After **60 seconds**, all damage increases by 5% per
  second, and enemies speed up (up to double speed), so neither healer-heavy
  fights nor a hero who outruns the enemies can stall a fight.

### Aggro (threat)

- Enemies attack whoever has the most threat on them. Damage creates threat,
  multiplied by the class's threat multiplier. Healing creates **0.3×** the
  amount healed as threat, split across the enemies already in combat.
- **Pulling aggro:** a hero has to pass **110%** of the current target's threat
  to take the enemy's attention. This stops targets from flip-flopping.
- **Warning icon** (orange) at **80%** of the top threat; red when the hero has
  aggro.
- **Careful AI:** non-tank heroes hold back attacks that would put them over
  **95%** of the tank's threat. This includes the Rogue's ×2 ambush hit.
  (It used to be 90%; the balance sweep showed holding back cost more than an
  occasional pull.)
- **Taunt** forces an enemy to attack the Warrior (range 420).

### Hero AI and movement

- Heroes steer with easing (they speed up and slow down on arrival) and stop
  just inside their attack range.
- **Melee heroes** close in and **flank** instead of blocking each other.
- **Ranged heroes** step up when nothing is in range, and shoot the **back
  line first** (archers, imps and casters, which the tank can't hold).
- Heroes stay within **140px** of the party's anchor point (the leash). When
  it's quiet, they drift back toward their starting spot.
- Heroes use abilities on their own when it makes sense:
  - heals on the most hurt ally
  - interrupts on enemy casts
  - Ice Storm on the biggest group
  - Brace when taking hits
  - Enfeeble on the most dangerous enemy; Wither spread across enemies
- **Mana discipline:** cheap filler spells (Soothing Glow, Ward, Frost Shard,
  Verdict, Hex Bolt) keep enough mana for the hero's big spells.

### Enemy AI

| Behaviour | Who | What it does |
|---|---|---|
| Melee | Grunt, Skeleton, Ghoul, Hellhound, Fiend | Moves in. Melee enemies **surround** their target instead of stacking on top of each other. |
| Ranged | Archer, Bone Archer, Fire Imp | Keeps its distance and shoots. Projectile damage lands when the shot arrives. |
| Healer | Shaman (Mend), Death Cultist (Dark Mend), Shadow Caller (Shadow Mend) | Casts for **2.5s** to heal a hurt ally (missing at least 40 HP) for **70**. 7s cooldown. Can be interrupted. |
| Smasher | Brute (Smash), Abomination (Slam), Pit Brute (Crush), and all bosses | Telegraphed cast for **1.8s**, then a hit for **2.9×** its damage, plus **1.25×** splash within 70px. 8s cooldown. Can be interrupted. |

- **Elites** (Brute, Abomination, Pit Brute) are the Mage's first Woolly Hex
  targets. Casters are next.
- **Bosses** are immune to Woolly Hex, **shake off stuns twice as fast**, and
  **resist interrupts**: after one is interrupted, its next cast is
  **unstoppable** (orange cast bar). Two interrupters used to cancel every
  boss slam.
- **Boss signature moves** (on top of the slam; all can be interrupted):

| Boss | Move | What it does |
|---|---|---|
| Goblin Warchief (Act 1) | **War Cry** | 1.5s cast every 14s (first at 6s): every goblin attacks 40% faster for 6s. |
| The Bone King (Act 2) | **Raise Dead** | 2.5s cast every 20s (first at 12s): raises a Skeleton with 40% health and 45% damage, up to two at once. |
| Demon Lord (Act 3) | **Rain of Fire** | 2.2s cast every 14s (first at 8s): marks the hero furthest away (usually the back line) with a circle; every hero within 75 of it takes 1.2x the boss's damage. |

---

## 7. Enemies

### Factions

| Act | Faction | Melee | Ranged | Healer | Fast | Elite | Boss |
|---|---|---|---|---|---|---|---|
| 1 | **Goblins** | Grunt 220 HP / 22 | Archer 130 / 16 | Shaman 150 | — | Brute 570 / 24 | **Goblin Warchief** 1100, *Skull Crack* |
| 2 | **Undead** | Skeleton 260 / 24 | Bone Archer 150 / 18 | Death Cultist 170 | Ghoul 180 / 18 (speed 60) | Abomination 680 / 25 | **The Bone King** 1700, *Grave Cleave* |
| 3 | **Demons** | Fiend 320 / 28 | Fire Imp 160 / 13 (every 1.6s) | Shadow Caller 200 | Hellhound 220 / 22 (speed 65) | Pit Brute 900 / 32 | **Demon Lord** 1800, *Hellfire Slam* |

(These are base numbers. The fight's strength multiplier scales enemy HP and
damage; see §2.)

### Line-ups and strength

Map fights are generated per node (`makeEncounter` in `src/sim/acts.ts`,
seeded by the node so a reload meets the same enemies): mostly the act's
melee, then shooters, a healer from floor 4 (never two) and a fast hunter now
and then; elites and bosses lead their fight. Melee stand in front, the rest
behind. The strength curve is in §2. The old hand-made round line-ups
(`makeRound`, listed in `docs/ROSTER.md`) are kept only as test fixtures.

### Balance targets and results

Measured with `scripts/balance-parallel.sh [seeds] [dir] [ai|random]` (every
starting class, AI picks everything, no camp gear).

| Target | Result (2026-11-03, before the harder start; see §2b for the current numbers) |
|---|---|
| An ungeared run is winnable but not certain | 43% win; 88% reach Act 2, 63% reach Act 3 |
| The solo start is forgiving | 1% of runs lost in Act 1 before the first boss |
| Bosses are the spikes | Boss losses: Act 1 10%, Act 2 28%, Act 3 24% |
| Runs are a sensible length | About 18 fights and 10 fight-minutes |

The start-class spread needs more seeds to read (20 runs each is noisy).

---

## 8. Game feel

- **Smooth motion.** Rendering is interpolated between simulation steps, units
  steer with easing, and units are softly pushed apart so they don't overlap.
- **Animations** (drawn in code over the pixel sprites):
  - Units stay upright as they walk (no sway), breathe slightly when standing
    and face the way they move.
  - Melee attacks have a wind-up tilt and squash, a lunge, and an arc swing.
  - Shots recoil with a flash at the hands.
  - Spellcasters hop with a glow at their feet in the spell's colour.
  - Downed heroes fall over and stay down.
- **Shadows:** every unit stands on a soft shadow with a thin rim in its
  colour (enemies red; a slowed enemy's rim turns blue).
- **The field** (`src/render/field.ts`): no pitch markings. The forest has
  uneven grass, a worn dirt path, bushes, stumps, rocks and mushrooms; the
  crypt broken pillars, bone piles and cobwebs; the hellscape glowing pools,
  jagged rocks and skulls. Props stay near the edges. Each act has its own
  light: the ground darkens toward the edges (green in the forest, deep blue
  and darkest in the crypt, red in the hellscape), under the units so they
  stay bright.
- **Remains** (`src/render/remains.ts`; they last for the fight, at most 50):
  - Fallen enemies collapse and leave what they were made of:
    - goblins: a pool of blood and bones with a skull
    - skeletons: a bone heap and a puff of dust
    - ghouls and abominations: green ichor and bones
    - cultists: blood, bones and a scrap of robe
    - demons: smouldering ash with charred bones and rising embers
  - Bosses leave a bigger pile, with their item on top and a glint: the
    Warchief an axe, the Bone King a crown, the Demon Lord a burning sword
    across a horned skull.
  - Heavy hits spatter the ground behind the target.
  - Fire spells leave scorch marks and frost spells leave ice patches; both
    fade after a few seconds.
  - Downed heroes leave blood.
  - On the map, fights you've won get a small skull and crossbones.
- **Weather** (`src/render/weather.ts`, per act, at most about 19 particles,
  in fights and on the map): falling autumn leaves in the forest, drips with
  splash rings and dust motes in the crypt, rising embers and ash in the
  hellscape.
- **Projectiles.** Ranged damage lands when the shot arrives.
- **Hit feedback.**
  - Every hit: a white flash, a small knockback and sparks.
  - Heavy hits: a small screen shake and a brief hit-pause.
  - Last kill: a slow-motion beat.
- **Numbers.** Rapid hits on the same target merge into one number.
- **Sound.** All sound effects are synthesized in the browser, with no audio
  files. You can mute in the top bar, and the setting is remembered.
- **Field.** A grassy pitch: mown stripes, grass tufts, a few flowers, a
  treeline along the top and faint chalk lines across the middle.
- **Art.** 32x32 pixel-art sprites drawn at 2x. Bailey's four heroes
  (`art/heroes/make-sprites.ps1`); temporary sprites for every enemy and the
  Paladin and Warlock, in the same style and palette (`art/sprites.py` writes
  `src/render/pixelArt.ts` and a preview sheet). Elites are drawn 25% larger,
  bosses 45%.

---

## 9. UI

- **Top bar:** "ACT n · FLOOR f" (just "ACT n" on the map), with the act or
  fight name, gold, enemies left and the fight clock underneath. Buttons:
  Speed, Sound, **Auto** and Pause (square pixel-bevel buttons: a light
  top-left edge and a dark bottom-right that swap when pressed; every big
  screen button uses the same style), always visible (on top of reward, pick and
  camp screens too). Speed and Pause only appear in fights. **Auto** picks the route and every choice for you after a
  short pause.
- **Damage meter** (bottom-right of the field during a fight): each hero's
  damage this fight, highest first; the **DMG ⇄ / HEAL ⇄** button switches to
  healing (healing that landed, plus shield absorbs). Hover or tap a bar for
  that hero's breakdown: one line per source with its icon, amount and share,
  auto-attacks and damage over time included.
  It stays up on the spoils and end-of-run screens; on the map and pick
  screens a **📊 Last fight** button (bottom-right) opens the last fight's
  numbers.
- **Hero select** (start and recruits): a 3 x 4 grid of 12 hero slots, ready
  for 12 classes: the 6 playable ones (portrait, name, role, passive; tap to
  pick), then silhouettes with a "?" marked Coming soon. Recruits also see
  **Your party (n of 4)** under the grid (hover or tap a hero for their
  details); the title screen doesn't show it.
- **Title screen:** continue a saved run, best and wins, the hero grid, the
  difficulty picker, and **The Camp** and **🎲 Challenge** side by side at the
  bottom (the same size). The Random Challenge draws its starting hero like a
  slot machine: the heroes flick past fast, slow down and stop on a random
  hero, then Play or Back.
- **Map** (§2; drawing in `src/render/mapArt.ts`):
  - **Around you:** your node sits at the bottom centre; above it, your two
    choices are spread across the full width, then the floor after, and a
    third row fades into the fog ("the way ahead is hidden"). Only nodes you
    can still reach are shown; finished floors and roads you can no longer
    take are gone. Each row is laid out across the width in order, so roads
    never cross; the boss sits in the middle once it's in view. A "Floor N of
    12" counter sits top right.
  - **Moving:** tap a node and your leader walks the road to it, then the
    board slides it to the bottom centre (the scenery scrolls down a floor)
    and the next choices appear.
  - **Roads:** every link is a road in the act's style (a dirt track, worn
    flagstones, charred rock). Roads from where you stand have gold dashes;
    the road you came in on has a solid gold trail. 
  - **Terrain** per act in a framed panel: forest trees and ponds; crypt
    tombstones, pillars, candles and bones; hellscape spikes, lava pools and
    seams. Scenery belongs to a floor, so it scrolls down as you climb, and it
    is kept clear of nodes, roads and the legend.
  - **Nodes** are round badges with a rim in their type's colour (fight steel,
    elite red, chest gold, campsite orange, shop green, event purple). Golden
    nodes have a gold halo. The whole badge is the tap area.
  - **The party:** your leader stands on your node with a gold pennant (at the
    start of an act, at a little camp with a tent and a fire at the bottom).
    Tapping a node makes them walk the road to it (0.65 s) before it opens.
  - The boss's badge shows the boss itself, with a slow red glow.
  - Weather is faint over the map (35%).
  - A legend, and the boss's move at the top on the floor before it.
- **Spoils panel** after each win; **game over / victory** screens show the
  run's stats and the loot sent home, with buttons to the camp and a new run.
- **Camp screen** (§2b; 2026-11-04 rework), an evening campground:
  - **Loot bar** at the top: an icon and count per kind (tap for where each
    comes from and what it buys), and one line of guidance.
  - **Hero cards** (3 x 2): portrait, name, and weapon / armor / trinket levels
    as icons with numbers; a pulsing gold **!** when that hero has an
    affordable upgrade. Tap a card, or the hero walking around the fire, to
    open their **gear panel**: one row per slot with its level (of 10), what
    it does now and at the next level, the cost as loot chips (red where
    you're short), and an **Upgrade** button (greyed, saying what's missing,
    when you can't afford it). ◀ ▶ step through the heroes.
  - **The campground**: patchy grass, layered trees, a lit clearing with
    firelight, sparks, a string of lanterns, fireflies and darker edges. The
    Blacksmith, Armorer and Jeweler are scenery (a tap says what they make;
    buying their gear throws sparks over them). The **Training Ground** sells
    guild perks (with a ! when one is affordable). The **Trophy Wall** and
    **Graveyard** are records, with wooden name plaques.
  - **New run** bottom centre; a **⚙** menu bottom right holds the testing
    reset.
- **Hero panels** (bottom): one per hero: name and level, health and resource
  bars, a row of **buff/debuff icons** (tap one for what it does and how long
  is left; buffs first), then the **ability icons** with cooldown shading
  (passive picks have a purple frame, abilities with their named upgrade a
  gold one), and a thin purple **XP bar** along the bottom. Tap a panel to
  inspect that hero.
- **End of a run** (game over, victory or abandoned): what happened (and what
  beat you), the run's stats, and the party over the **whole run**: each hero
  with level and abilities, and a **damage bar and a healing bar** for the run
  (tap a hero for what their numbers were made of). Then the camp loot sent
  home, The Camp and New run.
- **Top bar:** **✕ Abandon run** (top centre, whenever a run is under way: map, fights, choice screens; with a check first) ends only that run and goes straight back to Choose your hero; everything
  at the camp (loot, gear, perks, unlocks, records) is kept, and the run gets a
  grave. The end screens (party fallen, victory) show only the whole-run
  damage and healing chart (the last fight's meter is hidden there). Starting a new run from the title screen while one is saved
  asks first.
- **Fights:** cast names sit above units, one at a time, and damage numbers
  fan out; spells are coloured by school (frost, fire, holy, shadow, nature,
  arcane, physical) with an impact ring and sparks; zones are tinted with a
  pulsing edge; projectiles have a short trail.
- **Reward cards** show the icon, and the numbers: a new ability shows its
  numbers; an upgrade shows **Now:** and **After:** lines (see §5).
- **Ability tooltips:** hover over or tap an ability to see its damage or
  healing numbers (scaled by level and upgrades), cost, cooldown and upgrades
  (named upgrade, Empowered and Quick ranks).
- **Icons:** 14x14 pixel icons for every ability, passive and effect
  (`art/sprites.py` → `src/render/pixelArt.ts`, preview in
  `art/icons-preview.png`). Ability icons use a class-coloured background;
  buffs are teal, debuffs dark red. Heroes show their buffs on their panel;
  enemies show up to 4 under their health bar.
- **Inspect window:** tap any unit, hero or enemy, to see:
  - HP, resource, attack, auto-heal and move speed
  - tank threat
  - for heroes, labelled sections: Passive, Abilities (cost, cooldown, effect
    text), Upgrades (run upgrades, camp gear) and Effects, each with
    its icon on the left
  - for enemies: whether it's an elite or caster, and its current cast
  - for bosses: their moves and the boss rules

  The window updates live. Tap empty ground to close it.
- **Pause** doesn't block anything. While paused you can still inspect units
  and open tooltips.
- **Aggro icons:** orange "!" for a warning, red when the hero has aggro.
- **Cast bars:** shown above enemies that are casting, with the spell name; an
  unstoppable boss cast is orange and says "(unstoppable)". Rain of Fire draws
  a filling orange circle where it will land.

---

## 10. Tech

- TypeScript, Phaser 3.90 (Scale.FIT), Vite and Vitest.
- **Sharp on phones:** the canvas is `ZOOM` (the screen's pixel density,
  1 or 2) times the 540 x 960 world, and the camera zooms in to match, so
  shapes and text are drawn at the screen's real resolution. Game code works
  in world units; taps use `pointer.worldX/worldY`. Text is drawn at least
  2x (`TEXT_RES`).
- **Font:** VT323 (SIL Open Font License, `@fontsource/vt323`), a pixel
  font for all text. It has no bold; small outlined labels (unit names) stay
  regular so they don't smudge. It runs small, so `s.text()` and buttons scale
  every size by `FONT_SCALE` (1.25). The game waits for it to load (up to
  2.5 s) before starting.
- `src/sim` holds the pure, deterministic simulation: a seeded RNG and no
  Phaser. `src/render` draws it.
- `src/render/BattleScene.ts` owns the battle and run state and the update
  loop, and hands the rest to one module per area:
  - `theme.ts`: colours and layout constants
  - `hud.ts`: top bar, party panels and tooltips
  - `inspect.ts`: the inspect window
  - `units.ts`: unit sprites and combat effects
  - `field.ts`: each act's props along the field edges and its light (a vignette over the ground)
  - `remains.ts` and `weather.ts`: ground marks, and each act's weather
  - `screens/`: hero picker (title, recruits), map, choices (training, upgrades, shop), results (spoils, game over, victory) and the camp

  New screens (for example story scenes) go in `screens/`.
- **Balance tool:** `scripts/simlib.ts` plays whole runs headlessly with the
  game's rules and checks invariants every step (health range, arena bounds,
  NaN, fights that never end). `npm run balance` or
  `scripts/balance-parallel.sh [seeds] [outdir] [ai|random]` summarises reach
  per starting class, losses by act and node type, ability use, enemy damage and (with
  random picks) each pick's value.
- `src/sim/abilityText.ts`: the plain-language numbers for every ability (used
  by tooltips, the inspect window and reward cards).
  `tests/sweep.test.ts` runs a few full runs on every test run.
- GitHub Actions deploys to GitHub Pages.
- A debug handle (`window.__game`) is used for automated browser checks.

---

## 11. Future directions

All ideas that haven't been built yet now live in **[IDEAS.md](IDEAS.md)**.

---

## 12. Dropped and parked ideas

These come from the original castle-gate design (see
[archive/GAME_DESIGN_v1.md](archive/GAME_DESIGN_v1.md)).

| Idea | Status | Why / note |
|---|---|---|
| Castle gate, enemies marching in waves, flank spawns | **Dropped** | Replaced by the arena |
| 4x3 placement grid for heroes | **Dropped** (2026-11-02) | Heroes line up by role on their own |
| Swapping abilities after round 20 | **Decided against** (2026-11-02) | Abilities stay once picked |
| Prayer of Healing, Inner Focus | **Replaced** (2026-11-02) | Radiance / Chain of Light; Blessed Hands |
| Player-controlled hero, ability buttons, focus target, Full Auto toggle | **Dropped** | The game is fully AI. Only the sim's test path remains. |
| 30-wave runs with a win at wave 30 | **Dropped** | Replaced by the 3-act map run (2026-11-03) |
| Endless rounds, 3 lives, team builder, ready screen | **Dropped** (2026-11-03) | The map run: one hero, recruits at campsites, one life |
| Camp Mode as a separate mode | **Merged** (2026-11-03) | The camp is the map run's meta-progression (§2b) |
| Revives | **Dropped** | |
| Professions, Banners, Difficulty tiers, Starting-ability unlocks, Druid, Shaman, Hunter | **Parked** | Moved to [IDEAS.md](IDEAS.md) |
| Tokens (the only currency) | **Replaced** | Gold in runs, camp loot between runs |
| Gear and loot | **Built (the camp)** | 2026-11-02, gear upgrades at camp; real items are in [IDEAS.md](IDEAS.md) |
| Paladin, Warlock | **Built** | 2026-11-02, new designs for the arena |
| ~8 abilities per class pool | **Built (smaller)** | 6–7 per class, of which 4 can be picked |
| Out-of-range red outline on ability buttons | **Dropped** | There are no ability buttons |

---

## 13. Open questions

Ideas (recruit choices, a bench, race per class, later classes, boss moves,
art and more) are in [IDEAS.md](IDEAS.md).

**Map run and camp**

- **Ability scarcity (addressed 2026-11-03):** chests and training now give
  every hero a pick.
- **Geared guilds:** once the camp is built up, runs get easy again. The
  difficulty tiers (§2b) are the answer; their numbers are untested.
- **First run:** the AI beats Act 1 on about a third of first runs (aim ~25%).
  Worth checking in real play.
- **Late recruits:** the hero joining mid-Act 2 starts at the run's starting
  level (1) with one
  ability, well behind the rest (to revisit, as decided 2026-11-03).
- **Camp numbers:** loot rates, gear bonuses and costs are placeholders.

**Arena**

1. **Rogue reach (decided, 2026-11-02):** shortened to a real melee range (30)
   and Kick to 300, now that heroes move. Revisit if the Rogue feels bad.
2. **Pool size (decided 2026-11-02):** 6–7 per class, 4 picks, no swapping.
   Upgrades fill the late game. More abilities can be added to pools later.
3. **Placement (decided 2026-11-02):** the grid was removed; heroes line up by
   role.
4. **Tankless teams (largely resolved):** after the ability overhaul, every
   top starting team includes a tank. Priest + Priest + Rogue is still fine.

**Carried over**

5. **Exact numbers:** damage, HP, threat and costs, to be tuned in playtests.
6. **Final ability names and art:** use original or properly licensed art only.
