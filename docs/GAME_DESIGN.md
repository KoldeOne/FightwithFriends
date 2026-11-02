# FightwithFriends — Game Design Document

> **Status:** Design phase — no code yet.
> **Working title:** FightwithFriends
> **Platform:** Mobile browser (tested on Android), portrait orientation

This document records every design decision made so far. Items marked
**(proposed)** were suggested but not explicitly confirmed. Open questions are
collected at the end.

---

## 1. Concept

A party of four fantasy heroes defends a castle gate against waves of enemies
marching down from the top of the screen. Combat is real-time and largely
automatic — the player steps in with a few key taps (focus a target, fire a big
spell, interrupt a boss). Each run is 30 waves; between runs, the player spends
tokens to permanently upgrade the castle's professions.

### Design pillars

1. **Easy, low-tap mobile play.** Tap a couple of times here and there to make
   key decisions — never constant tapping.
2. **Auto-battler with a manual override.** The whole game can play itself;
   manual play adds precision, especially on bosses.
3. **Team roles matter.** Tank, healer, and DPS each have a clear job, driven by
   an aggro system.
4. **Every run is different.** Ability and gear choices build a new hero each run.
5. **Start small, build up.** Singleplayer first, 5 classes first, simple art
   first — but structured so multiplayer and more classes can be added later.

### Guiding design rules

- **Every ability must earn its slot.** No abilities with cooldowns so long they
  barely matter; single-target effects must be strong or party-wide.
- **Slow, defensive play is valid.** It is never punished.
- **Any party composition can work.** A balanced team is the safe choice, but no
  single class lineup is required.

---

## 2. Party

- Always **4 heroes**. The player picks the **class** of all 4 at the start of a run.
- The player **controls 1 hero**; smart AI controls the other 3.
- **AI heroes get a direction:** when building the party, the player sets each AI
  hero's class *and* role (e.g. "Druid — healer", "Druid — tank"). The AI picks
  abilities and gear that build toward that role.
- **The player's own hero has no direction** — its role emerges from the
  player's ability choices during the run.
- Classes and directions are **locked for the run**.
- **Role composition:** 1 tank / 1 healer / 2 DPS should be the safest setup,
  but which *classes* fill those roles is flexible, and off-meta teams are viable.

### Multiplayer (future)

Not in the first version. The one rule to follow now: **an AI-controlled hero
and a player-controlled hero must be interchangeable**, so a friend can later
take over an AI slot.

---

## 3. Classes

Classes are based on classic fantasy MMO archetypes. **Each class has its own
identity and limits which roles it can fill.** All classes are available from
the start (no class unlocks); the first version ships with the 5 starter
classes and the rest are added in later updates.

| Class | Tank | Healer | DPS | Resource | Version |
|---|:-:|:-:|:-:|---|---|
| Warrior | ✅ | | ✅ | Rage | Starter |
| Paladin | ✅ | ✅ | ✅ | Mana | Starter |
| Priest | | ✅ | ✅ | Mana | Starter |
| Mage | | | ✅ | Mana | Starter |
| Rogue | | | ✅ | Energy | Starter |
| Druid | ✅ | ✅ | ✅ | Varies by form | Later |
| Shaman | | ✅ | ✅ | Mana | Later |
| Warlock | | | ✅ | Mana | Later |
| Hunter | | | ✅ | Mana / Focus | Later |

### Resources

- **Mana:** starts full, drains as you cast.
- **Rage:** starts empty, builds from dealing and taking damage.
- **Energy:** small pool that refills quickly — frequent small bursts.

### Naming and art

Ability names below are **working names**. Many match World of Warcraft and must
be **renamed before any public release**. Never use WoW icons or art — use
original or properly licensed assets (see §12).

---

## 4. Hero kit

Every hero has up to **5 ability slots**:

| Part | Count | Notes |
|---|---|---|
| **Auto attack** | 1 | Always on (the Priest's auto attack includes a small free heal) |
| **Starting ability** | 1 | Fixed per class: Warrior **Heroic Strike**, Priest **Heal**, Mage **Fireball**, Rogue **Sinister Strike** |
| **Starting passive** | 1 | Always on, no button: Warrior **Taunt** (auto-taunts enemies attacking allies), Priest **Power Word: Fortitude** (party +20% max health), Mage **Polymorph** (auto-sheeps an enemy every 15s — elites, then casters, first), Rogue **Stealth** (starts hidden; first hit out of stealth deals double; re-stealths after 5s out of combat) |
| **Earned abilities** | 4 | Empty at the start; filled from the class's pool through level-up rewards during the run |
| **Class traits** | 0 at start | Passive traits are reward options during a run, not part of the starting kit |

- Earned abilities can be **any mix of active and passive**.
- **Buttons on screen:** 5 large slots directly under the gate, shown even when empty (empty slots show "+"). Passives have no button; active passive effects (e.g. Stealth, Fortitude) show as buff icons.
- All actives can **autocast** (auto mode).
- Each class has a pool of **~8 earnable abilities** (may expand later).
- The class select screen shows all **5 slots** per class (the starting ability
  filled in, 4 empty "Earn in run" slots) with the starting passive listed below.
- **Interrupts are earned, not starting abilities.** Enemy casters (e.g. the
  Goblin Shaman) appear a few waves in, by which time Kick (Rogue) or
  Counterspell (Mage) can have been earned.

### Out-of-range indicator

An ability button gets a **red outline** when it has nothing in range to hit
(e.g. the focused target is too far away). The outline clears as soon as a
target is in range. With a focus target set, abilities only go to that target.

---

## 5. Class ability pools (draft)

Abilities below are the earnable pool (traits are listed as earnable passives). Pools are drafts and will be tuned in testing.

### Warrior — Tank / DPS
- **Starting ability:** Heroic Strike — a heavy rage-spending strike with extra threat.
- **Starting passive:** Taunt — automatically taunts an enemy attacking an ally (every 8s).
- **Trait:** Rage — builds from dealing and taking damage; up to +20% damage at full rage.

| Ability | Type | Leans | Effect |
|---|---|---|---|
| Thunderclap | Active | Tank | AoE damage + threat; slows enemy attacks |
| Shield Block | Active | Tank | Big damage reduction for a few seconds |
| Demoralizing Shout | Passive (aura) | Tank | Nearby enemies deal less damage |
| Whirlwind | Active | DPS | AoE damage to nearby enemies |
| Execute | Active | DPS | Big hit on low-health enemies |
| Heroic Strike | Active | DPS | Rage-spending heavy single-target hit |
| Battle Shout | Passive (aura) | Shared | Nearby heroes deal more damage |
| Sunder Armor | Passive (on hit) | Shared | Attacks reduce the target's armor |



### Paladin — Tank / Healer / DPS
- **Starting ability:** Hammer of Justice — stuns an enemy and interrupts its cast.
- **Trait:** Holy Power — each heal or attack gives a small heal/shield to a nearby ally.

| Ability | Type | Leans | Effect |
|---|---|---|---|
| ⭐ Holy Strike | Active | DPS / Shared | Melee hit that also heals the lowest-health ally a little |
| Consecration | Active | Tank | Holy ground: AoE damage + high threat |
| Devotion Aura | Passive (aura) | Tank / Shared | Party gains armor |
| Holy Light | Active | Healer | Big single-target heal |
| Blessing of Might | Passive | Shared | Party-wide damage boost |
| Divine Shield | Active | Tank / Healer | Brief immunity; drops threat |
| Judgment | Active | DPS | Ranged holy burst; weakens the target |
| Beacon of Light | Passive | Healer | Your heals also partly heal the tank |

### Priest — Healer / DPS
- **Starting ability:** Heal — a strong heal on one ally.
- **Starting passive:** Power Word: Fortitude — the whole party has +20% maximum health.
- **Trait:** Inner Focus — Renew costs half while the whole party is above 80% health.

| Ability | Type | Leans | Effect |
|---|---|---|---|
| Renew | Active | Healer | Heal over time on an ally |
| Power Shield | Active | Healer | Absorbs damage on an ally |
| Prayer of Healing | Active | Healer | Heals the whole party |
| Holy Nova | Active | Shared | Small AoE heal for allies + small AoE damage |
| Spirit Aura | Passive (aura) | Shared | Party regenerates resources faster |
| Shadow Word: Pain | Active | DPS | Damage over time |
| Mind Blast | Active | DPS | Big single-target shadow hit |
| Fade | Passive (proc) | Shared | Automatically drops threat when you pull aggro |

### Mage — DPS (ranged AoE and control)
- **Starting ability:** Fireball.
- **Starting passive:** Polymorph — every 15s, sheeps an enemy for 10s (not bosses); elites first, then casters.
- **Earnable:** Counterspell — interrupts an enemy cast and locks it out of casting.
- **Trait:** Arcane Surge — Fireball has a 25% chance to cost no mana.

| Ability | Type | Leans | Effect |
|---|---|---|---|
| Frostbolt | Active | DPS / Control | Single-target hit that slows |
| Blizzard | Active (ground) | DPS | AoE zone that damages and slows; high threat risk |
| Meteor | Active (ground) | DPS | Huge delayed AoE — the "big moment" tap |
| Frost Nova | Active | Control | Freezes nearby enemies in place |
| Ignite | Passive | DPS | Fire spells leave burning damage |
| Ice Barrier | Active | Defense | Shields yourself when you pull aggro |
| Arcane Intellect | Passive (aura) | Shared | Party gains resource capacity |

### Rogue — DPS (melee single-target burst, self threat management)
- **Starting ability:** Sinister Strike.
- **Starting passive:** Stealth — starts each wave hidden (enemies can't target him); the first hit
  out of stealth deals double damage; re-stealths after 5s out of combat.
- **Earnable:** Kick — interrupts an enemy cast and locks it out of casting. Kick has its
  own range (same as Taunt), separate from the Rogue's short melee reach.
- **Trait:** Combo Points — auto attacks build points (max 5); Sinister Strike spends them
  for +15% damage each.

| Ability | Type | Leans | Effect |
|---|---|---|---|
| Eviscerate | Active | DPS | Big finisher hit |
| Blade Flurry | Active | DPS | Also hits a second nearby enemy |
| Poisons | Passive | DPS | Attacks apply poison damage over time |
| Slice and Dice | Passive | DPS | Increased attack speed |
| Expose Weakness | Passive | Shared | Your target takes more damage from everyone |
| Feint | Active | Shared | Drops your threat on the target |
| Evasion | Active | Defense | Dodge most attacks for a few seconds |

### Later classes (notes only)
- **Druid:** Starting ability Rebirth (combat revive). Trait Shapeshift — role direction
  sets the form (bear = tank, cat = DPS, tree = healer). Pool includes Roots,
  Innervate, Faerie Fire.
- **Shaman:** Has an interrupt. Can self-revive once per wave.
- **Warlock:** Soulstone — pre-cast on an ally so they can revive.
- **Hunter:** Not yet designed.

---

## 6. Combat

### Screen layout (portrait)

```
┌─────────────────────┐
│   ☠  ☠    ☠   ☠     │  ← Enemies spawn at the top and march down
│     ☠      ☠        │
│   ~~ground spell~~  │  ← Battlefield: ground-targeted spells land here
│                     │
│      🛡 TANK        │  ← Front
│   ⚔ DPS   ⚔ DPS     │  ← Middle
│      ✚ HEALER       │  ← Back
│▓▓▓▓▓▓[ GATE ]▓▓▓▓▓▓▓│  ← The gate (fail state)
├─────────────────────┤
│ [Sig][A1][A2][A3]   │  ← Ability buttons + resource bar (thumb reach)
│ ████ Mana   [AUTO]  │
└─────────────────────┘
```

**Your hero stands in the center and stays there.** The three AI teammates
start front (most melee/tanky first), left and right, and **move on their own**:

- They stay **close to the party** — within ~130px of your hero — never off alone.
- **Speed 60** (goblin grunts 38, runners 75).
- **Heroes physically block enemies**; teammates don't overlap.
- **Tank:** steps out to meet whatever is going after the party or the gate.
- **Melee damage:** moves in on enemies already being fought, attacking from the
  side so it doesn't block the path to the tank.
- **Ranged / healer:** hold position, back away from enemies coming for them,
  and step forward if nothing is in range.
- Every wave starts back in formation.

### Basics

- **Real-time.** Pausing is allowed mid-wave; saving is not.
- **Auto attacks and auto-casting** handle most of the fighting.
- **Focus target:** tap an enemy to make your hero's automatic attacks hit only
  that enemy (e.g. finish off a boss).
- **Manual abilities** spend the class resource; some are **ground-targeted**
  (aim at a spot on the battlefield).

### Aggro (threat)

- Each enemy attacks whoever has the **most threat** on it.
- **Damage generates threat. Healing generates threat, but less than damage.**
- **No limit** on how many enemies one hero can hold.
- Tanks generate extra threat, use **AoE threat abilities** to grab groups, and
  **Taunt** to win enemies back.
- DPS who do too much damage **pull aggro** and get attacked; AoE damage can
  pull whole groups if the tank hasn't invested in AoE threat.
- **Aggro indicator on your hero:** no icon normally → **orange** icon when close
  to pulling aggro → **red** icon when you have aggro.

### The gate

- **Not a major mechanic.** Mainly the fail state: the **run ends when the gate falls**.
- Enemies that **no hero is holding** head for the gate.
- Some enemy types (fast **flyers**, **speedrunners**) can slip past to the gate
  if no one grabs aggro on them.
- If the **whole party dies**, every enemy goes for the gate.

### Control and interrupts

- **Polymorph:** bosses are immune; elites can be sheeped. A sheep is the
  **lowest-priority target** — only attacked when nothing else is left —
  and **ignores AoE damage**.
- **Bosses have cast bars** (spell name + filling bar, large and readable).
  Interrupting them helps the party a lot.
- **Several classes can interrupt** (Rogue Kick, Paladin Hammer of Justice,
  Shaman later). No class is required.
- **Unstopped boss casts are painful but survivable** — never an automatic wipe.

### Wave length and stalemates

- Waves last **~2 minutes** typically; faster with aggressive builds, slower with
  defensive/healing-heavy builds. Slow play is **not punished**.
- **Guaranteed baseline damage** (heroes always deal some damage) so every wave
  ends eventually.
- **No hard enrage timers** on bosses.

### Revives

- **Between waves:** dead heroes are revived **for free** by the castle.
- **During a wave:** only through specific class abilities (Druid Rebirth,
  Warlock Soulstone, Shaman self-revive). Revives in combat should be rare.

---

## 7. Enemies

### Counts and spawning

- **3–5 enemies per wave early, 6–8 late.** Small numbers so targeting matters.
- **Waves 1–5:** all enemies spawn at the start.
- **Waves 6+:** a starting group, then **reinforcements** after some time.
- Spawn patterns can mix as the run progresses.

### Tiers

**Normal → Elite → Boss.** Elites are tougher enemies that appear in later waves
and alongside bosses.

### Archetypes (draft)

| Enemy | Behavior | Why you'd focus it |
|---|---|---|
| Brute | Slow, tough, hits hard | Usually let the tank hold it |
| Runner | Fast, fragile, heads for the gate | Kill it before it slips past |
| Archer/Caster | Stays back, attacks the back row | Protects your healer |
| Shaman | Heals/shields other enemies | Kill or interrupt it first |
| Flyer | Ignores the line, goes for the gate or heroes | The tank can't easily hold it |

### Factions and bosses (proposed)

| Chapter | Waves | Faction | Bosses |
|---|---|---|---|
| 1 | 1–10 | Goblins | Mini-boss wave 5, faction leader wave 10 |
| 2 | 11–20 | Undead | Mini-boss wave 15, faction leader wave 20 |
| 3 | 21–30 | Demons | Mini-boss wave 25, faction leader wave 30 |

Bosses come with a few supporting enemies (e.g. "the boss is shielded while its
2 shamans live").

---

## 8. Run structure

- **30 waves** per run, with a **boss every 5 waves** (5, 10, 15, 20, 25, 30).
- **Beating wave 30 is a win.** The run then continues into **endless mode** (§8a).
- **No branching map** — waves come in a fixed sequence.
- **Run length:** ~60+ minutes of fighting, split across sessions via saving.

### 8a. Endless mode

- After wave 30, endless mode is **one single continuous wave**.
- Enemies arrive **automatically in groups at set intervals**, each group a
  little harder than the last (gradual, not steep).
- Tuned so the party is **overwhelmed within ~10 minutes** at most.
- No between-wave screen during endless mode — it ends when the gate falls.

### Between-wave screen

Appears after every wave:
1. **Level-up choice** (1 of 3)
2. **Loot choice** (1 of 3)
3. **Equip / swap gear**
4. **Autosave**
5. **Next wave**

A **"Choose for me"** button makes all choices automatically.

### Auto controls (as built)

- **AUTO** (top bar, next to Pause): the AI plays your hero.
- **Choose for me** (button on the reward screen): picks one of the three
  options shown and starts the next wave.

### Auto controls (original plan)

- **One Full Auto toggle** covers both combat and between-wave choices.
- In Full Auto, a **5-second countdown** ("Next wave in 5… tap to stop") runs on
  the between-wave screen.
- An **AUTO button** is always visible during waves to take over instantly.
- "Choose for me" is also available as a one-time option when auto is off.

### Saving

- **Only between waves** (autosave after every wave).
- Mid-wave: **pause, but no save**.

---

## 9. Hero progression (within a run)

Nothing about heroes carries over between runs.

### Leveling (as built)

- 1 level per cleared wave: +6% health, damage and healing for everyone.
- **New abilities only at milestones:** the reward after wave 4 is a choice of
  new abilities (used from wave 5), and again after wave 9 (used in wave 10).
- Other waves offer upgrades: Empowered (+25% effect) or Quick (−20% cooldown)
  versions of your abilities, the class's passive trait, Vitality (+10% max
  health) or Might (+10% damage & healing).
- Ability tooltips: hover an ability button with the mouse.

### Leveling (original plan)

- **Fixed:** 1 level per cleared wave.
- Each level gives **small automatic stat gains** plus a **choice of 1 of 3**:
  learn a new ability, or upgrade an existing one.
- **Safety net:** until all 4 ability slots are filled, at least 1 of the 3
  choices is always a new ability.
- Once all slots are full, level-ups offer upgrades only.
- **Upgrades:** mostly simple (+damage, +targets, −cooldown), with occasional
  **transforming upgrades** offered after boss waves (e.g. "Thunderclap also taunts").
- **Choices happen on the between-wave screen**, never mid-fight.

### AI heroes

- Choose their own abilities, upgrades, and gear.
- The reward pool is **weighted toward the hero's direction** (while still
  offering meaningful choices).

### Gear

- **3 slots:** weapon, armor, trinket.
- **Found only during a run** — no permanent gear.
- After each wave the player **picks 1 of 3** gear pieces for their hero; AI
  heroes handle their own loot.
- **Quality tiers.** Harder fights have better odds of rare loot; rare loot can
  still drop anywhere.
- **Stats on all gear; special effects on rare and better items** (e.g.
  "Whirlwind hits 1 extra target").

---

## 10. Castle and professions (permanent progression)

All permanent progression lives in the castle's **professions**. They are
upgraded **only between runs** and give **passive bonuses** during every run.
All professions can be owned; tokens decide which grow first.

| Profession | Passive effect in runs |
|---|---|
| **Blacksmithing** | Better gear stats and rarity odds; at high levels, each hero starts with a gear piece |
| **Enchanting** | Higher chance of special effects on gear |
| **Alchemy** | The party starts each wave with a small buff |
| **Engineering** | Builds and powers towers on the wall (~10–20% of one DPS hero's damage) |
| **Tailoring** | Makes banners; higher levels unlock more banner choices |
| **Inscription** | The castle provides a support effect borrowed from a class not in the party, plus unique castle effects |

### Banners

- **Choose 1 active banner per run**, locked at the start of the run.
- Banners are **buffs only** (never revives). Examples: Banner of War (+party
  damage), Banner of Stone (+party armor), Banner of Vigor (+resource regen).

---

## 11. Economy

### Currency

**Tokens are the only currency.** (Gold was removed.)

**Tokens buy:**
- Profession upgrades
- Starting-ability unlocks

### Earning tokens (first-pass numbers)

| Source | Amount |
|---|---|
| Each wave cleared | 1, more in later waves |
| Each boss defeated | +5 |
| First-time milestones (first clear of wave 10, 20, 30) | +25 each |
| Winning a run (wave 30) | +20 |
| Endless mode | Tokens per enemy group survived (amount TBD) |

- **Losing runs keep** all tokens earned up to that point.
- **Auto mode earns the same** tokens as manual play.
- Expected: ~25 tokens for an early loss, ~80 for a full win, ~60 average.

### Pacing

- **Medium:** ~40–50 runs to fully upgrade everything.
- Total spend: ~2,400 (6 professions × 10 levels, rising costs) + ~300
  (starting-ability unlocks) ≈ **2,700 tokens**.

### Difficulty tiers

- **Fixed ladder:** tiers come in a set order. Each tier adds **a stat increase
  plus one new rule**, and keeps every rule from the tiers below it.
- Winning a tier **unlocks the next**. ~5 tiers to start.

| Tier | Numbers | New rule |
|---|---|---|
| 1 | Base | None — the normal game |
| 2 | +10% enemy HP/damage | Elite Surge — more elites per wave |
| 3 | +20% | Swift Reinforcements — reinforcements arrive sooner |
| 4 | +30% | Empowered Bosses — each boss gains an extra spell |
| 5 | +40% | Hardened Casters — enemy casts finish faster |

- **5 tiers to start**; new tiers can be added in updates.
- **Rewards:** +25% tokens per tier, plus slightly better loot odds during the run.
- **Any unlocked tier can be chosen**, and replaying a lower tier pays that tier's
  **full** tokens — playing easier is never punished.
- **Rules apply from wave 1**, but the stat increase **ramps up over the first
  few waves** so early waves aren't brutal before a build exists.
- **Endless mode uses the tier's numbers and rules.**
- **Progress is tracked per account.** Optional cosmetic badges per class
  (e.g. "beat Tier 4 with a Mage") with no gameplay effect.
- **The AI never gets worse at higher tiers.**
- **Endless mode** provides a "best wave" high-score chase alongside tiers.

---

## 12. Theme and art

- **Setting:** classic high fantasy — a castle under siege.
- **Tone:** heroic and classic, with a light touch.
- **Enemies:** goblins → undead → demons across the three chapters.
- **First version art:** simple shapes and icons, to prove the game is fun.
- **Later art:** pixel art from free/licensed packs.
- **Asset sources:** Kenney.nl (free for any use), game-icons.net (credit
  required), itch.io asset packs.

---

## 13. Open questions

1. **Difficulty tiers:** exact stat ramp and later tiers beyond 5.
2. **Endless mode:** token rewards per group; whether bosses appear in it.
3. **Hero movement:** built — your hero stays put in the center; AI teammates
   move on their own within ~130px of your hero (speed 60), heroes body-block
   enemies. Revisit: the Rogue's damage buff and Kick's long range (both were
   workarounds for standing still), and whether careful-AI rules still fit.
4. **Bosses:** specific bosses, abilities, and cast-bar spells.
5. **Enemy abilities:** details per archetype and faction.
6. **Starting-ability options:** the 2 unlockable options for Paladin, Priest,
   Mage, and Rogue.
7. **Gate:** gate HP and whether any profession improves it.
8. **Banner list:** full list and which Tailoring levels unlock them.
9. **Inscription:** which borrowed effects are available and how they scale.
10. **Ability pool size:** 8 per class may need to grow.
11. **Later classes:** full design for Druid, Shaman, Warlock, Hunter.
12. **Exact numbers:** damage, HP, threat values, costs — set during testing.
13. **Final ability names and art** (rename WoW-derived working names).

---

## 14. Suggested first playable version (proposed)

The smallest version that tests whether a wave is fun on a phone:

- Portrait battlefield with simple shapes
- 4 heroes (1 player-controlled, 3 AI) from the 5 starter classes
- Aggro system with the orange/red indicator
- A handful of waves including one boss with a cast bar
- Between-wave screen with level-up and loot choices
- Full Auto toggle

Castle professions, tokens, difficulty tiers, and endless mode come after the
core combat feels good.
