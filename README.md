# frendsTD

A 3D tower defense for phones. Four AI families — **Gemini, Claude, Codex and Grok** — field 48 towers
to defend the Core against bugs, glitches, prompt injectors and, eventually, the Paperclip Maximizer.

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

- **4 families × 12 towers.** Each family has its own playstyle and a tier-I-to-XII ladder that unlocks with campaign stars.
  - **Gemini** — light and prisms: ramping beams, multi-target volleys, long range.
  - **Claude** — thought and care: support auras, control fields, precision, an income tower.
  - **Codex** — code and automation: rapid fire, mortars, rocket volleys, a drone swarm.
  - **Grok** — chaos and lightning: chain arcs, crits, a gravity well, a map-wide storm.
- **12 attack mechanics**: homing bolts, bursts, ramping beams, lobbed shells, chain lightning, snipers, piercing
  rails, novas, slow/vulnerability fields, tower buffs, income, drones, and global strikes.
- **Loadouts.** Bring six towers into a level; every placed tower upgrades twice.
- **17 enemy types** with real counterplay: armor, regenerating shields, splitters, healers, phasing, flyers that
  ignore the path, jammers that disable towers, and three bosses.
- **15 levels in 3 worlds** — Server Farm, Latent Space, Singularity — including multi-lane and self-crossing maps.
- **Stars** (by Core integrity) unlock higher tiers. Losing a level grants reinforcements (+15% starting tokens per
  defeat) so nobody gets stuck.

## Ranked 1v1 (duels)

A Rush Royale-style mode. Each player gets a 5×3 board with its own lane around it; both lanes receive
identical waves.

- **Summon**: spend compute for a random unit from your 5-unit deck. Each summon costs a bit more.
- **Merge**: drag a unit onto an identical unit of the same rank. Both vanish and a *random* unit from your deck appears one rank higher (ranks 1–7).
- **Power up**: raise one unit type for the rest of the match (costs 100 / 200 / 400 / 700 compute).
- **Bosses** arrive every 4th wave on both lanes and use abilities on your board: Hydra swaps units around, Deepfake Titan steals a rank, the Paperclip Maximizer jams two units.
- Each leak costs a heart (bosses cost two). Lose 3 hearts and you lose. Matches run about 4–5 minutes.

Modes: **Ranked** (AI rivals matched to your Elo and deck strength; uses a Limit), **Practice** (free, no rewards) and
**Local duel** (two people on one phone: player 2's controls are rotated toward them).

### Which towers become duel units

Not all 48 towers are collectible. `src/pvp/roster.ts` scores every tower on raw power within its family,
tier, how well its attack type suits a merge board, mechanical depth, and how distinctive it is. Each
family keeps its best six, covering all four rarities without repeating attack types. Income towers are
left out. The top three per family become **Signature units**:

| Family | Signature units |
| --- | --- |
| Gemini | Ultra, Deep Think, Twin Suns |
| Claude | Claude Code, Computer Use, Fable |
| Codex | Refactor, Agent Swarm, Codex Max |
| Grok | Grok Heavy, Event Horizon, Supernova |

Each Signature unit has a **special capability** (for example Supernova's *Cascade*: every 5th strike hits
the whole lane) that grows 6% stronger per card level, and a **talent tree**: at levels 9, 11, 13 and 15
you pick one of two talents (`src/pvp/signatures.ts`).

### Rarity, levels and the economy

| Rarity | Tiers | Starts at level | Unlocks |
| --- | --- | --- | --- |
| Common | I–III | 1 | Sandbox |
| Rare | IV–VI | 3 | Sandbox |
| Epic | VII–IX | 5 | Staging (300 Elo) |
| Legendary | X–XII | 7 | Canary, Production, Frontier (700 / 1200 / 1800 Elo) |

Units level up to 15 with **Weights** (that unit's cards) plus **Tokens**. Rarer units need fewer Weights
but Weights for them are much rarer.

| Currency | What it is |
| --- | --- |
| Tokens | Main currency. Earned from battles, Checkpoints and campaign stars; spent on upgrades and the shop. |
| Weights | Per-unit cards from Checkpoints and the shop. The first one unlocks the unit. |
| Limits | Ranked battles use one each. One comes back every 8 minutes, up to 8. |
| Resets | Premium currency. Reset your Limits instantly, change a talent, or buy Tokens. Earned from Usage levels. |
| Usage | Account XP from upgrades and battles. Usage tiers: Free → Pro → Max → Team → Enterprise. Each level pays Tokens and 2 Resets and resets your Limits. |
| Elo | Rating. Climbing it moves you through six arenas, which unlock rarer units. |

Wins also pay a **Checkpoint** (reward chest; at least one Epic every 10 wins) full of Tokens and Weights
for units available in your arena.

Duels run entirely on the device: ranked opponents are AI rivals, not other people online (that would need a
game server). Local duel is the way to play another person.

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
| `src/audio/audio.ts` | Synthesized sound effects and generative music (WebAudio) |
| `src/pvp/` | Duels: roster logic, signatures and talents, economy, profile, match engine, AI rival, battle HUD and screens |
| `tests/` | Unit tests for the duel rules, economy, abilities and bosses (`npm test`) |

### Tests and balance tools

```bash
npm test                 # duel rules, economy, profile, abilities, bosses, AI-vs-AI fairness
npm run duel -- 30       # 30 headless duels between AI rivals
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

Enemies are GPU-instanced per type, towers are 2–5 draw calls each, and all effects are pooled. The renderer
lowers its internal resolution when the frame rate drops and, on the *Auto* graphics setting, falls back to
cheaper quality tiers (shadows off, fewer particles) if that is not enough. Graphics can also be set manually
in Settings.
