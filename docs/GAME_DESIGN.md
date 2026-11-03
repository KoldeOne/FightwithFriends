# FightwithFriends — Game Design Document

> **Status:** Playable prototype, drafted from the code on 2026-11-02 (updated
> the same day for the Paladin, Warlock, sprites, balance pass, the ability and
> upgrade overhaul, boss moves and removing the grid; then Camp Mode, §2b).
> **2026-11-03:** rounds were replaced by a Slay the Spire-style **map run**
> (§2), and Camp Mode became the camp between runs (§2b).
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
chests, shops and campsites, where new heroes join until the party is five.
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
| Start | **One hero.** Pick any class and its **first ability** (any active from its pool; its usual opener is highlighted). |
| Acts | **3, always in this order:** The Goblin Woods (goblins), The Sunken Crypt (undead), The Burning Rift (demons). Each act has its own look, enemies, elite and boss. |
| Map | Each act is a new random map: **12 floors** of nodes on branching, non-crossing paths, then the act's **boss**. You pick one node per floor. |
| Losing | **A party wipe ends the run.** No lives, no retries. |
| Health | Everyone is back to full health after every fight. |
| Winning | Beat the Act 3 boss. Wins are counted on the title screen; a win will unlock something new later (not designed yet). |
| Best | Your furthest point (act and floor) is saved and shown on the title screen. |
| Saving | Autosaves to localStorage after every step (`RunState` v5, key `fightwithfriends.run.v5`). Pre-map saves are dropped. |

### Node types

| Node | What happens |
|---|---|
| **Fight** | The act's regulars. Gold and XP. |
| **Elite** | A tougher fight around the act's elite (×1.15 strength). More gold and XP, then an **upgrade pick**. |
| **Chest** | Gold (20, or 34 if golden) and an **upgrade pick**. |
| **Shop** | 3 abilities and 2 upgrades for specific heroes, bought with gold; reroll for 10 (rising). Prices rise each act. |
| **Campsite** | The **first 4 campsites you reach** are **recruits**: pick any class (repeats allowed) and its first ability, until the party is 5. Later campsites are **training**: one hero learns 1 of 3 new abilities or passives from their pool. |
| **Boss** | The act's boss; then an upgrade pick and the next act. |

Some fights, elites and chests are **golden**: their gold is ×1.6.

**Map rules** (so every route has a good mix): floors 1–2 are fights; no elite
or shop before floor 4; no two of the same special node in a row on a path;
every map has at least one shop and two chests. Act 1's campsite floors are
3, 6, 9 and 12 (all four recruits before the first boss); Acts 2 and 3 have
training campsites on floors 6 and 12. Each map also has a **flavor** that
tilts the odds: balanced, treasure (more chests and golden nodes), dangerous
(more elites) or merchant (more shops).

### Flow

1. **Map.** Nodes you can reach pulse; tap one to go there (tap others to see
   what they are). The way you came is a **dotted line**. The act's boss and
   its signature move are shown at the top.
2. **Fight nodes** start straight away with an intro banner ("Act 1, floor 4 —
   The Goblin Woods"). No ready or "round cleared" screens.
3. **Spoils.** After a win, a short flashy panel: gold counting up, XP and
   level-ups per hero, and the camp loot sent home. It closes on its own (or
   tap), then the map or the next choice.
4. **Choices** (recruit, training, upgrade, shop) open as overlays on the map.
5. **Auto** (top bar) also picks the route (balanced, not elite-chasing),
   recruits, training, upgrades and shopping.

### Encounters and leveling

- **Enemy count:** one per hero, plus one from floor 7 on (a lone hero always
  meets one enemy at a time), up to 5.
- **Strength** (enemy HP and damage): Act 1 1.25 + 0.09 a floor; Act 2 2.9 +
  0.14; Act 3 4.9 + 0.2. Smaller parties meet weaker enemies (×0.6 for 1 hero,
  then 0.75, 0.88, 0.95, and 1 for 5). Bosses ×1.2 / 1 / 0.95 by act.
- **Gold:** 3 per regular enemy, 14 per elite, 40 per boss, × 1 / 1.4 / 1.8 by
  act (raised minions pay nothing).
- **XP, per hero:** a fight gives 10, an elite 15, a boss 22; **10 XP = 1
  level** (+6% stats a level). Heroes who fell in that fight get none.
  **Recruits** join at the run's starting level and earn **double XP** while
  more than half a level below the party average, so they catch up without
  starting at the party's level.

---

## 2b. The camp (between runs)

Bailey's Camp Mode (2026-11-02), folded into the map run on 2026-11-03: there
is one game loop, and the camp is its meta-progression. Code:
`src/sim/camp.ts` and `src/render/screens/camp.ts`; open it from the title
screen or the end-of-run screen. Every number is a placeholder to tune.

| Rule | Value |
|---|---|
| Loot | Every fight's loot (**win or lose**) goes straight to the camp. Dying costs nothing you've banked. |
| What resets | Everything in the run (levels, abilities, upgrades, gold). Gear, Drills and loot are kept. |
| Gear | Per **class**: every hero of that class, in every later run, recruits too. |
| Saves | `fightwithfriends.camp.v1` (the camp; the round-based version's loot, gear and Drills carry over). |

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
| Blacksmith | Weapon (Ore) | +4% damage and healing |
| Armorer | Armor (Hide) | +4% maximum health |
| Jeweler | Trinket (Gems) | +4% mana/energy regen, 2% faster cooldowns |
| Training station (whole guild, placeholder) | Drills, 0–5 | Heroes start each run (and recruits join) +1 level; 60(n+1) Spoils and a Trophy |

**Changed from the round-based Camp Mode:** the 1.6× enemy toughness, start
rounds (1/11/21), the round-30 cap, party picking at camp and the separate
mode are gone; the map run's own difficulty and win apply. Gear gives half
its old bonus per level and drops are lower, because a map run has more
fights and is already tuned for an ungeared party (with the old numbers,
guilds won almost every run from their third on).

The Training station is a placeholder until Kolde and Bailey design progression
together. Real item drops are also still to be designed (see
[IDEAS.md](IDEAS.md)).

**Balance check** (`npm run camp-sim -- [guilds] [runs]`: the AI plays a
guild's map runs back to back, rotating the starting class, and spends all loot
on the cheapest upgrade). Win rate by run number, 12 guilds × 15 runs
(2026-11-03): run 1 42%, runs 2–3 58%, runs 4–6 78%, runs 7–10 94%, runs
11–15 97%. So the camp makes the game reliably winnable after about 7 runs;
something harder for geared guilds (a difficulty ladder unlocked by wins) is
an open question (§13).

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

Each hero has **5 slots**: the starting ability plus 4 earned during the run.
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
| Start | **Heroic Strike** | 15 | 3s | Deals 26 damage with extra threat. | *Cleave*: Also hits another enemy next to the target, just as hard. |
| Pool | **Shield Block** | 15 | 12s | Takes 40% less damage for 5s. | *Shield Wall*: Blocks 60% for 6s. |
| Pool | **Shield Bash** | 15 | 12s | Interrupts and stuns an enemy for 2s, dealing 15 damage. | *Concussive Bash*: Stuns for 3.5s. |
| Passive | **Rage** | | | Hits up to 20% harder at full rage. | |
| Pool | **Rallying Shout** | 30 | 20s | The party deals 15% more damage for 8s. | *Battle Cry*: Also heals every ally for 8% of their maximum health. |
| Pool | **Last Stand** | free | 40s | Below 30% health, recovers 30% of maximum health. | *Unbreakable*: Recovers 50% and blocks 40% of damage for 6s. |
| Pool | **Thunderclap** | 20 | 6s | Deals 12 damage to every nearby enemy (high threat) and slows their attacks for 6s. | *Aftershock*: Enemies hit also deal 15% less damage for 6s. |
| Pool | **Whirlwind** | 25 | 6s | Deals 30 damage to every nearby enemy, with high threat. | *Bladestorm*: Spins twice: a second hit for 60%. |

#### Paladin

Passive: **Aegis Aura**: While the Paladin stands, the whole party takes 10% less damage.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Judgement** | 15 | 4s | Deals 40 damage at range 220; the most injured ally is healed for half of it. | *Twin Judgement*: Also strikes a second enemy for 60%. |
| Pool | **Mercy** | free | 30s | Heals an ally below 35% health for 160. | *Grace*: They also take 50% less damage for 4s. |
| Passive | **Zeal** | | | Judgement heals for the full damage dealt, not half. | |
| Pool | **Radiant Light** | 25 | 4s | Heals one ally for 95. | *Beacon*: The Paladin is healed for half as much too. |
| Pool | **Hallowed Ground** | 25 | 10s | Deals 72 damage over 6s to enemies on the blessed ground, with high threat. | *Sanctified Ground*: Also heals allies standing in it. |
| Pool | **Exorcism** | 25 | 8s | Deals 50 damage (100 to undead and demons). | *Purify*: Also burns for 30 over 3s. |
| Pool | **Hammer of Justice** | 15 | 14s | Interrupts and stuns an enemy up to 220 away for 2.5s. | *Heavy Hammer*: Stuns for 4s. |

#### Priest

Passive: **Power Word: Fortitude**: The whole party has +20% maximum health.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Heal** | 25 | 3s | Heals one ally for 80. | *Greater Heal*: Heals 40% more. |
| Passive | **Blessed Hands** | | | Heals on an ally below 35% health are 25% stronger. | |
| Pool | **Guardian Spirit** | 20 | 40s | For 12s, a killing blow on the ally leaves them at 25% health instead. | *Second Wind*: They survive at 50% health. |
| Pool | **Power Shield** | 20 | 6s | Shields an ally from 60 damage for 15s. | *Reflective Shield*: Attackers take half the damage the shield absorbs. |
| Pool | **Renew** | 20 | 3s | Heals one ally for 84 over 9s. | *Twin Renew*: Also renews a second ally. |
| Pool | **Holy Nova** | 30 | 8s | Heals every ally for 25 and deals 25 damage to enemies within 130. | *Radiant Nova*: +50% healing and damage, and a wider burst. |
| Pool | **Chain of Light** | 30 | 5s | Heals 65, then 46, then 32 (most injured allies first). | *Bright Chain*: Jumps to one more ally, and loses less on each jump. |

#### Mage

Passive: **Polymorph**: Every 15s, turns an enemy into a sheep — elites and casters first.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Fireball** | 30 | 4s | Deals 45 damage, then 15 burn damage over 3s. | *Searing Fire*: The burn is twice as strong and spreads to a nearby enemy. |
| Pool | **Counterspell** | free | 12s | Interrupts a cast; locks casting for 4s. | *Mana Burn*: Also deals 40 damage and locks casting for 7s. |
| Passive | **Arcane Surge** | | | Fireball has a 25% chance to cost no mana. | |
| Pool | **Ice Lance** | 12 | 2s | Deals 28 damage. | *Shatter*: Each lance chills the target; chilled or stunned enemies take double damage. |
| Pool | **Blizzard** | 35 | 12s | Deals 78 damage over 6s to enemies in the storm and slows them. | *Glacial Storm*: A 40% wider storm that hits a third harder. |
| Pool | **Frost Nova** | 20 | 14s | Freezes every enemy within 110 for 2.5s and deals 10 damage. | *Ice Prison*: Freezes for 4s, in a wider ring. |
| Pool | **Arcane Barrage** | 25 | 6s | Fires 3 missiles of 18 damage at random enemies. | *Arcane Torrent*: Five missiles. |

#### Warlock

Passive: **Soul Harvest**: Whenever an enemy dies, the Warlock regains 20 mana and the most injured ally is healed for 30.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Hex Bolt** | 20 | 3s | Deals 46 damage. | *Hex of Rot*: Also rots the target for 24 over 6s. |
| Pool | **Doom** | 30 | 15s | After 8s, deals 200 damage to the toughest enemy. | *Inevitable*: Lands for 50% more, and comes back 3s sooner. |
| Pool | **Enfeeble** | 15 | 12s | The most dangerous enemy in range deals 30% less damage for 8s. | *Crippling Curse*: 40% less, and it attacks slower. |
| Pool | **Wither** | 15 | 2s | Deals 78 damage over 12s. | *Contagion*: When a withering enemy dies, the curse jumps to the nearest enemy. |
| Pool | **Soul Drain** | 25 | 6s | Deals 40 damage; the most injured ally is healed for the same amount. | *Soul Feast*: Heals for 150% of the damage. |
| Pool | **Curse of Ruin** | 20 | 10s | An enemy takes 25% more damage from everything for 10s. | *Deep Ruin*: +40% damage taken instead. |
| Passive | **Agony** | | | Wither deals 50% more damage. | |

#### Rogue

Passive: **Stealth**: Starts hidden; the first hit out of stealth deals double damage. Re-stealths after 5s out of combat.

| | Ability | Cost | Cooldown | Effect (level 1) | Named upgrade |
|---|---|--:|--:|---|---|
| Start | **Sinister Strike** | 40 | 1.5s | Deals 36 damage. | *Serrated Blade*: Also makes the target bleed for 18 over 3s. |
| Passive | **Poisoned Blades** | | | Auto attacks poison the target: 6 damage a second for 4s. | |
| Pool | **Gouge** | 15 | 8s | Stuns an enemy for 2s (breaks its cast). | *Blind*: Stuns for 3.5s. |
| Pool | **Evasion** | free | 20s | Dodges 75% of attacks for 6s. | *Riposte*: Every dodged attack is answered with a 20-damage counter. |
| Pool | **Eviscerate** | 35 | 6s | Deals 55 damage. | *Executioner*: Double damage to enemies below 35% health. |
| Pool | **Kick** | free | 10s | Interrupts a cast; locks casting for 4s; deals 8 damage. | *Crippling Kick*: Locks casting for 6s and stuns for 1.5s. |
| Passive | **Combo Points** | | | Auto attacks build combo points; Sinister Strike and Eviscerate spend them for +15% damage each. | |
| Pool | **Fan of Knives** | 35 | 5s | Deals 26 damage to every enemy within 100. | *Poison Fan*: The knives also poison: 20 damage over 4s. |

Retired on 2026-11-02: **Prayer of Healing** (replaced by Holy Nova and Chain of
Light), **Inner Focus** (replaced by Blessed Hands). Taunt, Fortitude and
Polymorph exist as ability definitions but are only used by the passives.

---

## 5. Hero progression (within a run)

- **Levels** come from XP (§2): +6% health, damage and healing per level.
- **New abilities and passives** come from **training campsites** (1 of 3 from
  the hero's class pool) and **shops**. A hero has up to 5 slots (abilities +
  passives); picked abilities stay for the run (no swapping).
- **Upgrade picks** (chests, elites, bosses): **1 of 3** upgrades, each for a
  named hero in the party. You can skip.
- **Upgrades:**
  - **Named upgrade** (one per ability, e.g. Fireball: *Searing Fire*). Offered
    first.
  - **Empowered X:** +25% effect per rank. Only offered for abilities with
    something to scale (not interrupts, stuns, Shield Block, Last Stand...).
  - **Quick X:** 20% shorter cooldown per rank (up to 2), for cooldowns of 4s+.
  - **Vitality:** +10% max health. **Might:** +10% damage and healing.
    **Focus:** +40% mana or energy regeneration (not offered for rage).
- **Cards show the numbers:** a new ability shows its real numbers; an upgrade
  shows **Now:** and **After:** lines.
- **Auto:** recruits fill a missing tank, then a healer, then damage; training
  takes abilities in the class's preference order; upgrades take named
  upgrades first, then Empowered, then Might.
- Offers are seeded by the run's seed and the node, so they're the same if you
  reload.
- **Camp gear and Drills** (§2b) apply on top, and carry between runs.

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
  - Blizzard on the biggest group
  - Shield Block when taking hits
  - Enfeeble on the most dangerous enemy; Wither spread across enemies
- **Mana discipline:** cheap filler spells (Renew, Power Shield, Ice Lance,
  Judgement, Hex Bolt) keep enough mana for the hero's big spells. Heal waits
  when a ready Prayer of Healing would do more.

### Enemy AI

| Behaviour | Who | What it does |
|---|---|---|
| Melee | Grunt, Skeleton, Ghoul, Hellhound, Fiend | Moves in. Melee enemies **surround** their target instead of stacking on top of each other. |
| Ranged | Archer, Bone Archer, Fire Imp | Keeps its distance and shoots. Projectile damage lands when the shot arrives. |
| Healer | Shaman (Mend), Death Cultist (Dark Mend), Shadow Caller (Shadow Mend) | Casts for **2.5s** to heal a hurt ally (missing at least 40 HP) for **70**. 7s cooldown. Can be interrupted. |
| Smasher | Brute (Smash), Abomination (Slam), Pit Brute (Crush), and all bosses | Telegraphed cast for **1.8s**, then a hit for **2.9×** its damage, plus **1.25×** splash within 70px. 8s cooldown. Can be interrupted. |

- **Elites** (Brute, Abomination, Pit Brute) are the Mage's first Polymorph
  targets. Casters are next.
- **Bosses** are immune to Polymorph, **shake off stuns twice as fast**, and
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

| Target | Result (2026-11-03, map run, 20 seeds × 6 classes) |
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
  Speed, Sound, **Auto** and Pause. **Auto** picks the route and every choice
  for you after a short pause.
- **Title screen:** continue a saved run, best and wins, **The Camp**, then
  choose a class and its first ability.
- **Map** (§2): node icons, golden rings for golden nodes, pulsing reachable
  nodes, the dotted path, a legend, and the boss's move at the top.
- **Spoils panel** after each win; **game over / victory** screens show the
  run's stats and the loot sent home, with buttons to the camp and a new run.
- **Camp screen** (§2b): loot, the six classes and their gear, the stations.
- **Hero panels** (bottom): one per hero: name and level, health and resource
  bars, a row of **buff/debuff icons** (tap one for what it does and how long
  is left; buffs first), then the **ability icons** with cooldown shading
  (passive picks have a purple frame, abilities with their named upgrade a
  gold one). Tap a panel to inspect that hero.
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
  - passive, abilities (with cost, cooldown and effect text), traits and active
    effects, each with its icon on the left
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
- `src/sim` holds the pure, deterministic simulation: a seeded RNG and no
  Phaser. `src/render` draws it.
- `src/render/BattleScene.ts` owns the battle and run state and the update
  loop, and hands the rest to one module per area:
  - `theme.ts`: colours and layout constants
  - `hud.ts`: top bar, party panels and tooltips
  - `inspect.ts`: the inspect window
  - `units.ts`: unit sprites and combat effects
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
| 4x3 placement grid for heroes | **Dropped** (2026-11-02) | Heroes line up by role; the pre-fight screen shows the line-up and boss info |
| Swapping abilities after round 20 | **Decided against** (2026-11-02) | Abilities stay once picked |
| Prayer of Healing, Inner Focus | **Replaced** (2026-11-02) | Holy Nova / Chain of Light; Blessed Hands |
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

- **Ability scarcity:** new abilities come only from training campsites (after
  the 4 recruit sites) and shops, so heroes often have 1–2 abilities in Act 2.
  Is that the pace we want?
- **Geared guilds:** with camp gear the AI wins ~95% of runs after about 7
  runs. What keeps it challenging (see the difficulty ladder in IDEAS.md)?
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
