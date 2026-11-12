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

### Balance tools

```bash
npm run balance          # the bot plays every level with five different loadouts
npm run trace -- 7 gem_pro,cl_opus,cx_pr,gk_tesla   # wave-by-wave trace of one run
```

## Performance notes

Enemies are GPU-instanced per type, towers are 2–5 draw calls each, and all effects are pooled. The renderer
lowers its internal resolution when the frame rate drops and, on the *Auto* graphics setting, falls back to
cheaper quality tiers (shadows off, fewer particles) if that is not enough. Graphics can also be set manually
in Settings.
