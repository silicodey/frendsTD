# frendsTD

A 3D tower defense for phones. Four rival classes — **London, California, Prishtina and Tokyo** — field
48 towers to defend the Core against bugs, glitches, prompt injectors and, eventually, the Paperclip Maximizer.

Everything is generated in code: models, textures, shaders, effects, music and sound. There are no
asset files, and the whole game ships as a single HTML file.

## Play

```bash
npm install
npm run dev
```

Open the printed URL on a phone (same network) or in a desktop browser.

```bash
npm run build
```

produces `dist/index.html` — the complete game in one file. Host it anywhere, or just open it.
(`dist/frendsTD.html` is the same game as a body-only page for hosts that supply their own HTML shell.)

### Controls

| Action | Touch | Mouse / keyboard |
| --- | --- | --- |
| Build | Tap a card, then tap a glowing tile — or drag the card onto the board | Same; keys `1`–`6` pick a card |
| Aim before placing | With a card selected, press and slide on the board; release to place | Hover |
| Tower menu | Tap a tower: upgrade, sell, change targeting | `U` upgrades the selected tower |
| Start / call next wave | Wave button | `Space` |
| Speed 1×/2×/3× | Speed button | `F` |
| Camera | Pinch to zoom, drag to pan when zoomed | Mouse wheel |

## The game

- **4 classes × 12 towers.** Each class has its own playstyle and a tier-I-to-XII ladder that unlocks with campaign stars.
  - **London**: light and prisms. Ramping beams, multi-target volleys, long range.
  - **California**: verse and reason. Support auras, control fields, precision, an income tower.
  - **Prishtina**: code and automation. Rapid fire, mortars, rocket volleys, a drone swarm.
  - **Tokyo**: chaos and lightning. Chain arcs, big crits, a gravity well, a map-wide storm.
- **12 attack mechanics**: homing bolts, bursts, ramping beams, lobbed shells, chain lightning, snipers, piercing
  rails, novas, slow/vulnerability fields, tower buffs, income, drones, and global strikes.
- **Loadouts.** Bring six towers into a level; every placed tower upgrades twice.
- **17 enemy types** with real counterplay: armor, regenerating shields, splitters, healers, phasing, flyers that
  ignore the path, jammers that disable towers, and three bosses.
- **15 levels in 3 worlds** — Server Farm, Latent Space, Singularity — including multi-lane and self-crossing maps.
- **Stars** (by Core integrity) unlock higher tiers. Losing a level grants reinforcements (+15% starting tokens per
  defeat) so nobody gets stuck.

## Ranked 1v1 (duels)

A merge-board duel mode. Each player gets a 5×3 board with its own lane around it; both lanes receive
identical waves.

- **Summon**: spend compute for a random unit from your 5-unit deck. Each summon costs a bit more.
- **Merge**: drag a unit onto an identical unit of the same rank. Both vanish and a *random* unit from your deck appears one rank higher (ranks 1–7).
- **Power up**: raise one unit type for the rest of the match (100 / 200 / 400 / 700 compute). A power-up is available only once that unit is on your board.
- Each leak costs a heart (bosses cost two). Lose 3 hearts and you lose. Matches run about 4–5 minutes.
- **Damage numbers** float over enemies: white for normal hits, orange for critical hits.
- **Long-press a card** in a match to see that unit's role, stats, crit, specialities and this week's perk.

Modes: **Ranked** (AI rivals matched to your Elo and deck strength; uses a Limit), **Practice** (free, no rewards),
**Local duel** (two people on one phone) and **Play a friend online** (below).

### Duel units, roles and crits

Not all 48 towers are collectible. `src/pvp/roster.ts` scores every tower on raw power within its class,
tier, how well its attack type suits a merge board, mechanical depth, and how distinctive it is. Each
class keeps six units across all four rarities, including at least one **Support** unit:

| Class | Damage | Support | Signature units |
| --- | --- | --- | --- |
| London | Flare, Photon Bloom, Spectra, Zenith, Binary Suns | Halo | Spectra, Zenith, Binary Suns |
| California | Ballad, Reverie, Scribe, Pointer, Saga | Nexus | Scribe, Pointer, Saga |
| Prishtina | Script, Debugger, Refactor, Swarm, Kernel | Sandbox | Refactor, Swarm, Kernel |
| Tokyo | Arc Coil, Frenzy, Juggernaut, Supernova | Monolith, Event Horizon | Juggernaut, Event Horizon, Supernova |

- **Damage** units kill things. Every one of them can land **critical hits**: 8% chance by default, more for precision
  units such as Pointer and Juggernaut. Crit damage is an account stat: it starts at ×1.5 and grows by 0.02 with
  every card level-up you make (up to ×3.5).
- **Support** units buff, control or debuff (auras, stuns, slows, pulls) and don't crit.
- **Signature units** have a special capability (for example Supernova's *Cascade*: every 5th strike hits the whole
  lane) that grows stronger with card level (`src/pvp/signatures.ts`).

### Levels, Breakthroughs and specialities

Cards level from 1 to 10. Each level-up costs that unit's cards (**Weights**) plus **Tokens**; each level is ×1.14 power.

| Rarity | Starts at | Cards for each level-up | Unlocks |
| --- | --- | --- | --- |
| Common | L1 | 5, 10, 20, 40, 80, 150, 300, 500, 800 | Sandbox |
| Rare | L2 | 4, 8, 16, 30, 60, 120, 200, 350 | Sandbox |
| Epic | L4 | 3, 6, 12, 25, 50, 90 | Staging (300 Elo) |
| Legendary | L5 | 3, 3, 4, 4, 5 | Canary, Production, Frontier (700 / 1200 / 1800 Elo) |

Levels **6, 8 and 10 are Breakthroughs**. They also cost materials, and each one opens a **speciality** row: pick one of
two (the first pick is free; changing it later costs a Reset). `src/pvp/specialities.ts` has them all:

- **Damage units:** L6 is a core pair (a signature unit keeps its signature talents); L8 is *Keen Edge* (+14% crit chance,
  +0.5 crit damage) or *Overclock* (+18% damage), balanced to be equal on an average account, so crit pulls ahead in
  crit-built decks; L10 is a capstone pair.
- **Support units:** stronger or wider auras, *Ward* (neighbours gain Shield charges) and *Sanctuary* (neighbours ignore
  the first disruption each wave).
- **Resilience options** counter disruptions: *Firewall* (ignores the first disruption each wave), *Hardened* (jams
  last half as long), *Anchored* (immune to rank drain), *Stable* (immune to Mutate and paperclipping).

### Disruptions and Shields

Bosses (every 4th wave) and some monsters act on your board. Every disruption is telegraphed one second ahead with a
warning mark on the target, hits at most two units, and has a cooldown, so it dents a board without wrecking it.

| Source | Ability |
| --- | --- |
| Kernel Hydra (boss) | **Fork** swaps two units; **Regrow** spawns two heads when it drops below half health |
| Deepfake Titan (boss) | **Deepfake** drains a unit's rank; **Mirror Shield** absorbs damage for a few seconds |
| Paperclip Maximizer (boss) | **Encrypt** jams two units; **Clip** turns a unit into a paperclip for a while |
| Courier (wave 5+) | Fast. Killing it pays bonus compute (a good one) |
| Jammer (wave 6+) | Jams the nearest unit when it reaches mid-lane |
| Leech (wave 8+) | Drains 1 compute per second while it lives |
| Mutator (wave 10+) | On death, turns one unit into another deck unit of the same rank (a gamble) |

A **Shield** charge blocks one disruption ("BLOCKED") and is spent. Shields come from Ward specialities, power-up
level 5 on Support units and some weekly perks.

### Weekly class perks

Each week (Monday 00:00 UTC to Monday) one class gets a boost in every duel, shown on Ranked home with a countdown and
as a glow on that class's cards. For example London +3% crit damage (16–23 Nov 2026), then California merges with a 15%
chance to also summon a random rank-1 unit and 5% for rank-2 (23–30 Nov). Other weeks rotate through attack speed,
damage, strong arrivals, power-up discounts, shielded arrivals and stronger auras (`src/pvp/perks.ts`).

The online server decides the perk for each match and sends it to both phones. Its `/config` endpoint publishes the
schedule, and the `PERKS_JSON` environment variable overrides weeks without an app update, for example
`{"2026-12-07": {"family": "Tokyo", "effect": {"kind": "dmg", "amount": 0.05}}}`.

### Currencies, materials and the shop

| Currency | What it is |
| --- | --- |
| Tokens | Main currency. Earned from battles, Checkpoints and campaign stars; spent on upgrades and the shop. |
| Weights | Per-unit cards from Checkpoints and the shop. The first one unlocks the unit. |
| Data Shards | Every Breakthrough. A few per ranked match (more on a win), Checkpoints, campaign stars, friend duels (daily cap), the shop. |
| Class Sigils | One kind per class, for L8 and L10 Breakthroughs of that class. Ranked wins (double for the featured class), Checkpoints, the shop. |
| Neural Cores | The rare one: every L10 Breakthrough, and Epic/Legendary L8. 10 wins in a week, arena promotions, Legendary Checkpoints, one a week in the shop. |
| Limits | Ranked battles use one each. One comes back every 8 minutes, up to 8. |
| Resets | Premium currency, earned only. Reset Limits, change a speciality, buy shop specials. Earned from Usage levels. |
| Usage | Account XP from upgrades and battles. Tiers: Hobby → Builder → Studio → Scale → Hyperscale. Each level pays Tokens and 2 Resets. |
| Elo | Rating. Climbing it moves you through six arenas, which unlock rarer units. |

Wins also pay a **Checkpoint** (reward chest; at least one Epic every 10 wins) with Tokens, Weights and materials.

The **Shop** has five sections that refresh daily or weekly (UTC): *This week* (featured-class Sigils), *Daily deals*
(unit cards), *Materials* (Data Shard bundles, a weekly Neural Core), *Checkpoints* (buy a chest) and *Wallet*. All
prices are in-game currencies.

`npx tsx tools/economy.ts 15 0.55 150` simulates a player (matches per day, win rate, days) and reports when units
reach each Breakthrough. At 15 matches a day a common unit reaches L6 on day 2 and a legendary reaches L10 in
about four months.

Saves from before levels 1–10 migrate automatically: levels are rescaled, specialities are free to re-pick, and a
welcome pack of materials is added.

## Play a friend online

One player creates a room and gets a 4-letter code (or an invite link); the friend joins with it. Both press
**Ready**, a shared 5-second countdown starts, and the duel begins on both phones at the same moment. Friend
duels use your own deck and levels; they cost no Limits and don't change your rating.

### Deploy the server (once, by the developer)

Players never deal with servers: the game has its server address built in (`src/net/config.ts`), and invite
links open the game straight into the room. The developer hosts one server:

1. On [Render](https://render.com): **New → Blueprint**, pick this repository and branch. Render reads
   `render.yaml` and builds the `Dockerfile`: one web service that serves the game and runs the duel rooms.
2. When the deploy is live, its address (e.g. `https://frendstd.onrender.com`) is the game's home: share it,
   or put it in `GAME_SERVER` in `src/net/config.ts` so copies hosted elsewhere (the single-file build,
   a phone app) use it too.
3. Every push to the branch redeploys automatically.

On Render's free plan the server sleeps after about 15 idle minutes; the first player after that sees
"Waking up the game server…" for up to a minute. The Starter plan stays awake.

Running it yourself instead: `npm run build && npm run server` (game + server on port 8787, `PORT=…` to
change), or `docker build -t frendstd . && docker run -p 8787:8787 frendstd`. During development,
`npm run dev` forwards `/ws` to a server on port 8787. Developers can point any copy at another server with
`?server=wss://host`.

### How it stays fair and in sync

Duels use deterministic lockstep (`src/net/protocol.ts`, `server/index.ts`):

- Both phones and the server build the same match from the same seed and decks, and advance it in fixed
  1/60 s ticks. Game logic only uses arithmetic that every JavaScript engine rounds identically
  (`src/sim/dmath.ts` replaces `Math.sin`, `pow`, `hypot`… whose last bit can differ between Chrome and Safari).
- A tap becomes a command. The server stamps it with the tick it takes effect (150 ms ahead, to cover the
  network) and relays it to both players together with "everything up to tick N is final". Nobody simulates
  past N, so both phones always apply the same inputs at the same moment.
- The server runs its own copy of every match: it decides the winner, rejects invalid or spoofed commands,
  and compares state hashes the phones send every 2 seconds.
- A dropped player keeps their seat for 30 seconds. Reconnecting (even after a full reload) replays the
  match's input log and fast-forwards to the present; after 30 seconds away, they forfeit. Commands are numbered, so
  a command resent after a reconnect is never applied twice.
- If a phone's state ever disagrees with the server's, it rebuilds the match from the server's log and carries on.

## How it's built

| Path | What |
| --- | --- |
| `src/sim/` | Deterministic game simulation with no rendering dependencies (`sim.ts`), plus an auto-player (`bot.ts`) used for balance checks and the battle behind the title screen |
| `src/data/` | Towers, enemies, levels, wave generation |
| `src/render/engine.ts` | Three.js renderer: HDR pipeline, MSAA, bloom, colour grade, adaptive resolution, camera rig |
| `src/render/builder.ts`, `towerModels.ts`, `enemyModels.ts` | Procedural modelling kit; every tower and enemy is merged into a handful of draw calls with per-vertex PBR attributes |
| `src/render/board.ts` | The level: floating platform, animated lanes, portals, the Core, sky, backdrop |
| `src/render/fx.ts`, `view.ts` | Particles, beams, lightning, shockwaves; instanced enemies, health bars, shields |
| `src/render/thumbs.ts` | Tower and enemy portraits rendered by the game renderer for the UI |
| `src/ui/`, `src/style.css` | Menus and HUD (plain DOM) |
| `src/audio/audio.ts`, `score.ts` | Synthesized sound effects; three cinematic soundtracks (Siege, Shadow Protocol, Ascension) composed in code for strings, brass, choir, war drums and ostinato, rendered once per session into seamless two-stem loops (calm + action) that crossfade with the fight |
| `src/pvp/` | Duels: roster and roles, signatures, specialities, weekly perks, economy and materials, profile, match engine with disruptions, AI rival, battle HUD and screens |
| `src/net/`, `server/` | Online duels: lockstep protocol, client connection with clock sync and resume, the room/relay/referee server |
| `tests/` | Unit tests for the duel rules, economy, abilities and bosses (`npm test`) |

### Tests and balance tools

```bash
npm test                 # duel rules, economy, profile, abilities, bosses, AI-vs-AI fairness, online lockstep + server
npm run duel -- 30       # 30 headless duels between AI rivals
npx tsx tools/bosses.ts 16 0 0.2 0.35   # boss kill rates: 16 matches, starter decks, casual pace
npx tsx tools/calibrate.ts              # re-derive per-unit balance (rewrites src/pvp/calibration.ts)
npx tsx tools/economy.ts 15 0.55 150    # progression pacing: matches/day, win rate, days
npx tsx tools/specpairs.ts 1.5          # L8 crit-vs-damage speciality pairs at a given crit damage
npx tsx tools/crossengine.ts            # replays duels and prints hashes to compare across JS engines
```


```bash
npm run balance          # the bot plays every level with five different loadouts
npm run trace -- 7 gem_pro,cl_opus,cx_pr,gk_tesla   # wave-by-wave trace of one run
```

## Trailer

The trailer is directed inside the game engine (`src/trailer/trailer.ts`): real models, real battles and
real effects, with a scripted camera, staged scenes and text overlays. Open `/?trailer` to watch it live
in the browser.

```bash
npm run dev
```

```bash
node tools/trailer.cjs
```

films it to `trailer-out/frendsTD-trailer.mp4` (1080×1920, 30 fps, with a soundtrack synthesized by the
game's own audio engine). The film runs on a virtual clock, so every frame is rendered and captured
exactly once regardless of how fast the machine is; scenes are captured as resumable chunks and
assembled with ffmpeg. `--stills 4.5,12` renders single moments, `--from <shot> --every 6` makes quick drafts.

The trailer is scored with two tracks from [Coverr's free stock music](https://coverr.co/free-stock-music)
(free for videos, attribution appreciated): **"When All Hope Is Gone"**, time-stretched from 144 to
150 BPM so the cuts land on its beats, and **"Disturbing Night"** for the ending. They are downloaded
at render time and not committed; without network access the tool falls back to a synthesized score
(`src/trailer/score.ts`). `--audio-only` re-renders just the soundtrack from already-filmed scenes.

## Performance notes

Enemies are GPU-instanced per type, towers are 2–5 draw calls each, and all effects are pooled.

Phones heat up when a game redraws everything as fast as the screen allows, so frendsTD doesn't:

- **Frame cap.** 60 fps in play (a 120 Hz phone would otherwise draw twice as often), 30 fps behind menus.
- **Graphics levels.** *High* (2× pixels, 4× MSAA); *Balanced*, the phone default (1.5× pixels, 2× MSAA,
  smaller shadow map); *Battery saver* (30 fps, 1× pixels, no glow, no shadows). Shadows are redrawn every
  2nd–3rd frame rather than every frame.
- **Auto** adapts: it lowers resolution when frames drop, falls back a level if that's not enough, and after
  10 minutes of continuous play on a phone it eases off a level before the device gets hot.
- **Music** is rendered once into a loop (see below), so playing it costs almost nothing.
