# Roster: heroes and monsters

Everything currently in the game, from `src/sim/content.ts`. If the numbers
there change, update this page too.

**Reading the numbers**

- **Hits every** = seconds between attacks (lower is faster).
- **Range** is in pixels: melee is about 6-30, ranged is 220+.
- **Armor** = share of incoming damage ignored.
- **Hero stats** are level 1; heroes get +6% health, damage and healing per level.
- **Enemy stats** are base values, multiplied by the fight's strength (by act
  and floor, smaller for small parties; see §2 of the design doc).

## Heroes

Start with 1; more join mid-Act 1, after the Act 1 boss and mid-Act 2
(classes can repeat), for a party of 4. Heroes line up by role on their own: tanks and melee in
front, ranged behind, the Priest at the back.

| Hero | Role | Health | Damage | Hits every | Range | Armor | Resource |
|---|---|---|---|---|---|---|---|
| **Warrior** (human) | Tank | 420 | 12 | 1.0s | 14 (melee) | 25% | Rage (from dealing and taking damage) |
| **Paladin** | Tank who also heals | 380 | 13 | 1.2s | 14 (melee) | 20% | Mana |
| **Priest** (dwarf) | Healer | 190 | 5 (heals 22) | 1.5s | 340 | - | Mana (starts full, slow regen) |
| **Mage** (gnome) | Ranged damage and control | 170 | 20 | 1.8s | 380 | - | Mana |
| **Warlock** | Ranged damage: curses and life drain | 180 | 14 | 1.6s | 360 | - | Mana |
| **Rogue** (human) | Melee damage | 235 | 11 | 0.6s | 30 | - | Energy (fast regen) |

All heroes move at 60. Threat: Warrior 1.5x, Paladin 1.3x, Rogue 0.7x.

Each hero starts with 1 ability (you choose it) and 1 passive. More come from
training campsites (1 of 3 from the class pool) and shops; chests, elites and
bosses give upgrades. A hero
holds 4 slots (the starting ability + 3 earned), and each pool has more than 4,
so builds differ run to run. Every ability has its own named upgrade, shown
after the arrow.

### Warrior
- **Starts with:** Heroic Strike: 26 damage, extra threat. -> *Cleave:* also hits a second enemy next to the target.
- **Passive:** Taunt: every 8s, pulls an enemy that is attacking an ally.
- **Can earn:**
  - Shield Block: take 40% less damage for 5s. -> *Shield Wall:* 60% for 6s.
  - Shield Bash: interrupts and stuns for 2s. -> *Concussive Bash:* 3.5s stun.
  - Rage (passive): hits up to 20% harder at full rage.
  - Rallying Shout: party deals 15% more damage for 8s. -> *Battle Cry:* also heals every ally 8% of max health.
  - Last Stand: below 30% health, recovers 30% of max health. -> *Unbreakable:* 50%, plus blocks 40% for 6s.
  - Thunderclap: 12 damage nearby, high threat, slows attacks. -> *Aftershock:* enemies hit deal 15% less damage for 6s.
  - Whirlwind: 30 damage to every enemy nearby, high threat. -> *Bladestorm:* a second spin for 60%.

### Paladin
- **Starts with:** Judgement: 40 holy damage at range 220; the most injured ally is healed for half. -> *Twin Judgement:* also hits a second enemy for 60%.
- **Passive:** Aegis Aura: while the Paladin stands, the party takes 10% less damage.
- **Can earn:**
  - Mercy: a 160 heal on an ally below 35% health. -> *Grace:* they also take 50% less damage for 4s.
  - Zeal (passive): Judgement heals for the full damage, not half.
  - Radiant Light: a 95 heal on one ally. -> *Beacon:* the Paladin is healed for half as much too.
  - Hallowed Ground: holy ground that damages enemies standing in it, with high threat. -> *Sanctified Ground:* also heals allies in it.
  - Exorcism: 50 holy damage at range; double vs undead and demons. -> *Purify:* also burns for 30 over 3s.
  - Hammer of Justice: interrupts and stuns for 2.5s. -> *Heavy Hammer:* 4s stun.

### Priest
- **Starts with:** Heal: 80 health to one ally. -> *Greater Heal:* heals 40% more.
- **Passive:** Fortitude: the whole party has +20% max health.
- **Can earn:**
  - Blessed Hands (passive): heals on an ally below 35% health are 25% stronger.
  - Guardian Spirit: for 12s, a killing blow leaves the ally at 25% health instead. -> *Second Wind:* 50%.
  - Power Shield: absorbs 60 damage. -> *Reflective Shield:* attackers take half what it absorbs.
  - Renew: heals 84 over 9s. -> *Twin Renew:* also renews a second ally.
  - Holy Nova: heals every ally 25 and damages nearby enemies 25. -> *Radiant Nova:* +50% and wider.
  - Chain of Light: 65 heal on the most injured ally, then jumps to two more for less. -> *Bright Chain:* one more jump, less falloff.

### Mage
- **Starts with:** Fireball: 45 damage plus a burn. -> *Searing Fire:* burn twice as strong and spreads.
- **Passive:** Polymorph: every 15s, turns an enemy into a sheep for 10s (elites and casters first; bosses are immune).
- **Can earn:**
  - Counterspell: interrupts a cast and silences for 4s. -> *Mana Burn:* also 40 damage, 7s silence.
  - Arcane Surge (passive): Fireball has a 25% chance to cost no mana.
  - Ice Lance: quick, cheap 28-damage hit. -> *Shatter:* chills; chilled or stunned enemies take double.
  - Blizzard: area ice storm, damage over time and slow. -> *Glacial Storm:* 40% wider, a third harder.
  - Frost Nova: freezes nearby enemies for 2.5s. -> *Ice Prison:* 4s, wider.
  - Arcane Barrage: three 18-damage missiles at random enemies. -> *Arcane Torrent:* five missiles.

### Warlock
- **Starts with:** Hex Bolt: 46 damage. -> *Hex of Rot:* also rots for 24 over 6s.
- **Passive:** Soul Harvest: whenever an enemy dies, the Warlock regains 20 mana and the most injured ally is healed for 30.
- **Can earn:**
  - Doom: 200 damage lands on the toughest enemy after 8s. -> *Inevitable:* 50% more, 3s shorter cooldown.
  - Enfeeble: the most dangerous enemy deals 30% less damage for 8s. -> *Crippling Curse:* 40% less and attacks slower.
  - Wither: 78 damage over 12s. -> *Contagion:* jumps to the nearest enemy when the target dies.
  - Soul Drain: 40 damage; the most injured ally is healed for that much. -> *Soul Feast:* heals 150%.
  - Curse of Ruin: the party's focus target takes 25% more damage for 10s. -> *Deep Ruin:* 40%.
  - Agony (passive): Wither deals 50% more.

### Rogue
- **Starts with:** Sinister Strike: fast 36-damage hit. -> *Serrated Blade:* also bleeds 18 over 3s.
- **Passive:** Stealth: starts hidden; the first hit deals double damage.
- **Can earn:**
  - Poisoned Blades (passive): auto attacks poison for 6 a second for 4s.
  - Gouge: stuns for 2s and breaks a cast. -> *Blind:* 3.5s.
  - Evasion: dodge 75% of attacks for 6s. -> *Riposte:* each dodge counters for 20.
  - Eviscerate: 55-damage finisher. -> *Executioner:* double damage below 35% health.
  - Kick: interrupts a cast and silences for 4s. -> *Crippling Kick:* 6s silence, 1.5s stun.
  - Combo Points (passive): auto attacks build points; Sinister Strike and Eviscerate spend them for +15% each.
  - Fan of Knives: 26 damage to every enemy nearby. -> *Poison Fan:* also poisons for 20 over 4s.

## Monsters

Each faction has the same five roles: basic melee, ranged, healer, elite and boss.

- **Healers** walk up to a hurt ally and cast a 2.5s heal. It can be interrupted.
- **Elites and bosses** wind up a telegraphed slam: about 2.9x their normal damage
  to the target, plus splash nearby. It can be interrupted.
- **Bosses** also have a signature move, shown before the fight. They can't be
  polymorphed, shake off stuns twice as fast, and after an interrupt their
  next cast can't be stopped.

### Goblins (Act 1, The Goblin Woods)

| Monster | Type | Health | Damage | Hits every | Range | Speed | Notes |
|---|---|---|---|---|---|---|---|
| Goblin Grunt | Melee | 220 | 22 | 1.3s | Melee | 38 | Basic fighter |
| Goblin Archer | Ranged | 130 | 16 | 1.8s | 260 | 32 | Fragile |
| Goblin Shaman | Healer | 150 | 8 | 2.0s | 240 | 30 | Casts **Mend** |
| Goblin Brute | Elite | 570 | 24 | 1.6s | Melee | 30 | Casts **Smash**; the Act 1 elite |
| **Goblin Warchief** | **Boss (Act 1)** | 1100 | 22 | 1.4s | Melee | 34 | **Skull Crack** (slam); **War Cry**: every 14s, all goblins attack 40% faster for 6s |

### Undead (Act 2, The Sunken Crypt)

| Monster | Type | Health | Damage | Hits every | Range | Speed | Notes |
|---|---|---|---|---|---|---|---|
| Skeleton | Melee | 260 | 24 | 1.2s | Melee | 36 | Sturdier than a Grunt |
| Bone Archer | Ranged | 150 | 18 | 1.7s | 270 | 32 | |
| Death Cultist | Healer | 170 | 9 | 2.0s | 240 | 30 | Casts **Dark Mend** |
| Ghoul | Fast melee | 180 | 18 | 0.8s | Melee | 60 | Rushes in, attacks quickly |
| Abomination | Elite | 680 | 25 | 1.7s | Melee | 28 | Casts **Slam** |
| **The Bone King** | **Boss (Act 2)** | 1700 | 28 | 1.4s | Melee | 32 | **Grave Cleave** (slam); **Raise Dead**: every 20s, raises a weakened Skeleton (up to 2 at once) |

### Demons (Act 3, The Burning Rift)

| Monster | Type | Health | Damage | Hits every | Range | Speed | Notes |
|---|---|---|---|---|---|---|---|
| Fire Imp | Ranged | 160 | 13 | 1.6s | 280 | 40 | Longest enemy range |
| Hellhound | Fast melee | 220 | 22 | 0.9s | Melee | 65 | Fastest unit in the game |
| Fiend | Melee | 320 | 28 | 1.2s | Melee | 38 | Heavy basic fighter |
| Shadow Caller | Healer | 200 | 10 | 2.0s | 240 | 30 | Casts **Shadow Mend** |
| Pit Brute | Elite | 900 | 32 | 1.6s | Melee | 30 | Casts **Crush** |
| **Demon Lord** | **Boss (Act 3)** | 1800 | 28 | 1.4s | Melee | 34 | **Hellfire Slam** (slam); **Rain of Fire**: every 14s, fire falls on your back line |

## Round line-ups (test fixtures only)

The map run generates its fights per node (see §7 of the design doc). These
hand-made line-ups from the old round system are kept for tests.

| Round | Line-up | Enemies |
|---|---|---|
| 1 | Grunt Squad | 3 Grunts |
| 2 | Archer Support | 2 Grunts, Archer |
| 3 | The Shaman | Grunt, Archer, Shaman |
| 4 | Twin Archers | Grunt, 2 Archers |
| 5 | Elite: Goblin Brute | Brute, Grunt, Shaman |
| 6 | Skirmishers | 2 Grunts, Archer |
| 7 | Healer Line | Grunt, 2 Shamans |
| 8 | Brute and Bows | Brute, 2 Archers |
| 9 | Double Brute | 2 Brutes, Shaman |
| 10 | **BOSS: Goblin Warchief** | Warchief, Grunt, Shaman |
| 11 | The Risen | 3 Skeletons, Bone Archer |
| 12 | Ghoul Pack | 2 Ghouls, Skeleton, Cultist |
| 13 | Bone Volley | Skeleton, 3 Bone Archers |
| 14 | Elite: Abomination | Abomination, Skeleton, Cultist, Bone Archer |
| 15 | Dark Rites | 2 Skeletons, 2 Cultists |
| 16 | Hunting Ghouls | 3 Ghouls, Bone Archer |
| 17 | Flesh Wall | 2 Abominations, Bone Archer, Cultist |
| 18 | Siege Line | 2 Skeletons, 2 Bone Archers |
| 19 | Graveyard Shift | Abomination, 2 Ghouls, Cultist |
| 20 | **BOSS: The Bone King** | Bone King, 2 Skeletons, Cultist |
| 21+ | Demon rotation | One of: Imp Swarm, Hellhounds, Elite: Pit Brute, Fire and Shadow, Twin Pit Brutes (mirrored every other round) |
| 30, 40, 50... | **BOSS: Demon Lord** | Demon Lord, 2 Fiends, Imp, Shadow Caller |
