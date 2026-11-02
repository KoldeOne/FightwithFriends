# FightwithFriends — Game Design Document

> **Status:** Playable prototype, drafted from the code on 2026-11-02 (updated
> the same day for the Paladin, Warlock, sprites, balance pass, the ability and
> upgrade overhaul, boss moves and removing the grid; then Camp Mode, §2b).
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

## 2. Run structure

| Rule | Value |
|---|---|
| Lives | **3** per run. Losing a round costs one, and you **retry the same round**. At 0 lives the run ends. |
| Length | **Endless.** Your best round is saved and shown on the title screen. |
| Party size | **3** heroes for rounds 1–10, **4** for rounds 11–20, **5** from round 21. |
| Enemy count | Matches the party size (3, then 4, then 5). |
| Between rounds | All heroes return to full health and **level up** (+6% stats per level). |
| Rewards | Each hero gets one reward choice **every 5 rounds** (see §5). |
| Saving | The run autosaves to localStorage (`RunState` v4) after every round. Older v3 saves are migrated. |

### Flow of one round

1. **Ready screen.** The enemy line-up stands on the field (tap any unit to
   inspect it), with a short summary ("Facing: 2 Goblin Brutes, Goblin
   Shaman"). On a boss round it lists the boss's moves; **the round before a
   boss it warns you** and lists them too. Press **Fight!**.
2. **Intro banner** with the round name (for example "Round 5 — Elite: Goblin
   Brute").
3. **Combat.** Everyone acts on their own. You can pause, inspect units and
   read tooltips (§9).
4. **Result.**
   - **Win:** a short slow-motion beat on the last kill, then level-ups. On
     every 5th round you also pick a reward.
   - **Loss:** you lose a life and can retry the round. A retry uses a
     different seed, so it isn't an exact replay.
   - **Out of lives:** the run ends and your best round is recorded.

### Recruits

After you beat the bosses on rounds **10** and **20**, a party slot opens. You
can pick **any class** for it, including one you already have.

- The recruit joins at the party's level.
- It also gets the rewards it would have auto-picked so far, so it isn't behind
  the rest of the party.

### Team builder

At the start of a run you fill **3 slots** from the 6 classes. Classes can
repeat, and duplicates are labeled "Mage", "Mage 2" and so on. The default
team is Warrior, Priest and Mage.

---

## 2b. Camp Mode (new, for testing)

A second mode on the title screen, built 2026-11-02 from Bailey's proposal so
Kolde can compare it with the Arena. Combat, classes and enemies are shared;
its code is `src/sim/camp.ts` and `src/render/screens/camp.ts`. Every number
below is a first placeholder.

| Rule | Value |
|---|---|
| Losing | **One defeat ends the run.** No lives, no retries. |
| Loot | Every fight's loot (win or lose) goes straight to the camp. Dying costs nothing. |
| What resets | In-run levels and reward picks. Gear, Drills and loot are kept. |
| Heroes | The 6 classes, **once each** (no duplicates). Pick 3 at camp; a 4th and 5th join after the round 10 and 20 bosses, from the heroes still at camp. |
| Difficulty | Arena line-ups and strength curve, **×1.6** (`CAMP.difficulty`). Strength follows the round, not the heroes. |
| Camps | Start from round 1; beating the round 10 boss unlocks a round 11 start, round 20 unlocks round 21. A later start begins at that round's level with auto-picked rewards. |
| Cap | Beating round **30** ends the run as a win. |
| Saves | `fightwithfriends.camp.v1` (the camp) and `fightwithfriends.campRun.v1` (a run in progress), separate from the Arena. |

**Loot** (`lootFor`): Spoils (currency), three placeholder materials (Ore, Hide,
Gems) and boss Trophies. Rounds 11–20 pay 2× Spoils and 21–30 pay 3×.

| Enemy | Drop |
|---|---|
| Basic | 2 Spoils × tier; 12% × tier chance of a random material |
| Elite | 6 Spoils × tier, 1 random material |
| Boss | 25 Spoils × tier, 1 of each material, 1 Trophy |
| Raised minion | Nothing |

**Stations** (per hero, levels 0–10; next level costs 10n + 3n² Spoils and n of
the station's material, and every 5th level also a Trophy):

| Station | Gear | Per level |
|---|---|---|
| Blacksmith | Weapon (Ore) | +8% damage and healing |
| Armorer | Armor (Hide) | +8% maximum health |
| Jeweler | Trinket (Gems) | +8% mana/energy regen, 4% faster cooldowns |
| Training station (whole guild, placeholder) | Drills, 0–5 | Heroes start each run +1 level; 60(n+1) Spoils and a Trophy |

The Training station is a placeholder until Kolde and Bailey design progression
together. Real item drops are also still to be designed.

**Balance check** (`npm run camp-sim`: the AI plays one guild's runs back to back
with a tank/healer/mage trio and spends all loot on the cheapest upgrade):
the first run ends around round 5–9 (often at the round 5 Brute), the round 11
camp opens after about 5 runs, round 21 after about 10, and round 30 falls
after about 14 runs (6 guilds, 2026-11-02).

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

- **Level-ups.** Every hero gains a level after each round won (+6% health,
  damage and healing).
- **A reward choice every 5 rounds.** Each hero picks **1 of 3**:
  - **While a slot is free:** two new abilities or passives from the class
    pool, plus one upgrade. Taking the upgrade leaves the slot open for later,
    so it's a real trade-off.
  - **Once all 5 slots are full:** three upgrades.
  - Picked abilities stay for the run (no swapping).
- **Upgrades:**
  - **Named upgrade** (one per ability, e.g. Fireball: *Searing Fire*). Offered
    first.
  - **Empowered X:** +25% effect per rank. Only offered for abilities with
    something to scale (not interrupts, stuns, Shield Block, Last Stand...).
  - **Quick X:** 20% shorter cooldown per rank (up to 2), for cooldowns of 4s+.
  - **Vitality:** +10% max health. **Might:** +10% damage and healing.
    **Focus:** +40% mana or energy regeneration (not offered for rage).
- **Reward cards show the numbers:** a new ability shows its real numbers; an
  upgrade shows "After: ..." (or "now → after" for stat upgrades).
- **Choose for me / Auto picks:** the AI takes a new ability or passive in the
  class's preference order; once full, the starting ability's named upgrade,
  then any named upgrade, then Empowered on the starting ability, then Might.
- The offers are seeded by the run's seed, round and slot, so they are the same
  if you reload.

---

## 6. Combat

### Basics

- The simulation runs at a fixed step of 0.05s, and the renderer interpolates
  between steps. A round is **won** when every enemy is down and **lost** when
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
| Goblin Warchief (round 10) | **War Cry** | 1.5s cast every 14s (first at 6s): every goblin attacks 40% faster for 6s. |
| The Bone King (round 20) | **Raise Dead** | 2.5s cast every 20s (first at 12s): raises a Skeleton with 40% health and 45% damage, up to two at once. |
| Demon Lord (every 10th round from 30) | **Rain of Fire** | 2.2s cast every 14s (first at 8s): marks the hero furthest away (usually the back line) with a circle; every hero within 75 of it takes 1.2x the boss's damage. |

---

## 7. Enemies

### Factions

| Rounds | Faction | Melee | Ranged | Healer | Fast | Elite | Boss |
|---|---|---|---|---|---|---|---|
| 1–10 | **Goblins** | Grunt 220 HP / 22 | Archer 130 / 16 | Shaman 150 | — | Brute 570 / 24 | **Goblin Warchief** 1100, *Skull Crack* |
| 11–20 | **Undead** | Skeleton 260 / 24 | Bone Archer 150 / 18 | Death Cultist 170 | Ghoul 180 / 18 (speed 60) | Abomination 680 / 25 | **The Bone King** 1700, *Grave Cleave* |
| 21+ | **Demons** | Fiend 320 / 28 | Fire Imp 160 / 13 (every 1.6s) | Shadow Caller 200 | Hellhound 220 / 22 (speed 65) | Pit Brute 900 / 32 | **Demon Lord** 1800, *Hellfire Slam* (every 10th round) |

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
| 21–30 | 5.2 + 0.3 per round (about 5.2 → 7.9) |
| 31+ | Round 30's strength, then **+8% a round, compounding**, so every run ends |

The bosses are the big difficulty spikes.

### Balance targets and results

Measured with the balance tool (`scripts/balance-parallel.sh [seeds] [dir]
[ai|random]`: every starting team of 3, 12 seeds each, no manual changes;
recruits fill a missing tank, then a missing healer, then the least-picked
damage class). "AI" uses Choose for me; "random" picks every reward at random,
which is how pick values are measured.

| Target | Result (2026-11-02, after the ability overhaul) |
|---|---|
| Classic teams (1 tank + 1 healer + 1 damage) are a safe choice: average 30+, worst 15+ | AI 36.0 (worst 20); random 35.9 |
| No class is a trap: each class's average within ~5 rounds of the others | AI 2.4 rounds; random 3.1 |
| The first act is forgiving: at most ~8% of rounds 1–10 lost | 4.0% |
| No pick is a trap or a must-pick | 76 of 80 picks within ±1.5 rounds of the average pick at the same round (noise is about ±1) |
| Every run ends | Median run ends at round 35 (AI) / 32 (random); 90% by round 40 |

Boss rounds (AI picks, share of attempts lost): round 10 6%, round 20 26%,
round 30 54%, round 40 100% (the compounding curve). The best starting teams
all include a tank.

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

- **Top bar:** a big round number, with the line-up name, lives (♥), enemies
  left and the fight clock underneath; pause and sound buttons.
- **Top bar:** Speed, Sound, **Auto** and Pause. **Auto** picks rewards for you
  and presses Fight on the ready screen after a short pause (1.5s, or 3s when
  there's boss info to read).
- **Hero panels** (bottom): one per hero: name and level, health and resource
  bars, a row of **buff/debuff icons** (tap one for what it does and how long
  is left; buffs first), then the **ability icons** with cooldown shading
  (passive picks have a purple frame, abilities with their named upgrade a
  gold one). Tap a panel to inspect that hero.
- **Ready screen** (before each round): line-up summary, the boss's moves on
  a boss round, a warning (with the moves) the round before a boss, and Fight.
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
  - `screens/`: team builder, recruit, ready screen, results and rewards

  New screens (for example story scenes) go in `screens/`.
- **Balance tool:** `scripts/simlib.ts` plays whole runs headlessly with the
  game's rules and checks invariants every step (health range, arena bounds,
  NaN, fights that never end). `npm run balance` or
  `scripts/balance-parallel.sh [seeds] [outdir] [ai|random]` summarises reach
  per team, class shares, round loss rates, ability use, enemy damage and (with
  random picks) each pick's value.
- `src/sim/abilityText.ts`: the plain-language numbers for every ability (used
  by tooltips, the inspect window and reward cards).
  `tests/sweep.test.ts` runs a few full runs on every test run.
- GitHub Actions deploys to GitHub Pages.
- A debug handle (`window.__game`) is used for automated browser checks.

---

## 11. Future directions (proposed)

Ideas that fit the arena game and haven't been built yet:

- **More classes and synergies**, for example a Hunter, Druid or Shaman.
  Possibly party bonuses for class or role combinations.
- **Gear** found during a run: weapon, armor and trinket, picked from 1 of 3.
- **Meta progression between runs**, a lighter version of the old castle idea
  (§12).
- **Final enemy and boss art** (the current sprites are temporary).
- **Unique boss abilities** beyond the heavy slam.
- **Multiplayer:** the sim still supports a player-controlled hero (tests use
  it), so a friend could take a hero later.

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
| 30-wave runs with a win at wave 30 | **Dropped** | Runs are now endless, with 3 lives |
| Revives | **Dropped** | Lives and round retries cover this |
| Castle professions (Blacksmithing, Enchanting, Alchemy, Engineering, Tailoring, Inscription) | **Parked** | Possible base for meta progression |
| Tokens (the only currency) | **Parked** | Goes with meta progression |
| Banners (1 per run) | **Parked** | |
| Difficulty tiers (5-tier ladder with rules) | **Parked** | Endless rounds plus a best-round score cover this for now |
| Starting-ability unlocks (3 options per class) | **Parked** | |
| Gear and loot | **Parked** | See §11 |
| Paladin, Warlock | **Built** | 2026-11-02, new designs for the arena |
| Druid, Shaman, Hunter | **Parked** | See §11 |
| ~8 abilities per class pool | **Built (smaller)** | 6–7 per class, of which 4 can be picked |
| Out-of-range red outline on ability buttons | **Dropped** | There are no ability buttons |

---

## 13. Open questions

**Arena**

1. **Recruits:** keep free picks, or offer a choice of 1 from 3?
2. **Bench:** allow more than 5 heroes, with a bench?
3. **Bosses (built 2026-11-02):** each boss has a signature move (War Cry,
   Raise Dead, Rain of Fire). Later bosses could get more.
4. **Enemy and boss art:** replace the temporary sprites? Bailey's setting
   work may change how enemies should look.
5. **Rogue reach (decided, 2026-11-02):** shortened to a real melee range (30)
   and Kick to 300, now that heroes move. Revisit if the Rogue feels bad.
6. **Pool size (decided 2026-11-02):** 6–7 per class, 4 picks, no swapping.
   Upgrades fill the late game. More abilities can be added to pools later.
7. **Placement (decided 2026-11-02):** the grid was removed; heroes line up by
   role. A formation choice (e.g. "spread out" vs "huddle") could come back
   later if it would add something.
8. **Tankless teams (largely resolved):** after the ability overhaul, every
   top starting team includes a tank. Priest + Priest + Rogue is still fine.
9. **Names and lore:** the new abilities and upgrades (2026-11-02) have
   generic working names. Bailey may want to rename them to fit the setting.

**Carried over**

10. **Exact numbers:** damage, HP, threat and costs, to be tuned in playtests.
11. **Final ability names and art:** rename the working names taken from WoW
   before any public release. Use original or properly licensed art only.
12. **Later classes:** full designs.
13. **Race per class (parked for later):** let players change the race of each
    class. Set aside on 2026-11-01 to revisit later.
