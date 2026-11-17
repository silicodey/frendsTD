# Artwork pipeline

The game ships no image or model files: every tower, enemy and the Core is built in code. Upgraded artwork follows one loop
per model, tracked on the **Art Tracker** page (https://claude.ai/artifact/V14WYU4FGeFj15PdzAHyKT) and mirrored in
[`CHECKLIST.md`](CHECKLIST.md).

## The loop

1. **Prompt:** a brief pack per class in [`briefs/`](briefs) holds one ChatGPT image prompt per model.
   - Every prompt carries the same rules:
     - the class palette
     - glow on at most ~20% of the surface
     - simple solids only
     - the top kept clear for the rank badge
     - readable at ~60 px on a phone
     - 2–3 marked moving parts
     - a model-sheet layout (hero, front, top, moving parts, swatches)
   - The **Core concept sheet** is the style reference for every class. Within a class, the first approved sheet is attached to the rest so the class matches.
2. **Concept:** ChatGPT generates the sheet. The images are reference only and are not committed or shipped.
3. **Built:** the model is rebuilt to match the sheet, then compared side by side with it and checked on a phone-size duel board.
4. **Approved**, then **Live** after a push (a push redeploys the Render server).

## Two ways a model is built

### In-game code models (what the game runs today)

`src/render/towerModels.ts`:
- **`CUSTOM`** maps a unit id to a function that builds its whole model from the `Builder` kit (`src/render/builder.ts`: `add`, `ring`, `spin`, `extrude`, `tube`…). The class plinth and head are skipped for these units.
- **Class plinths:**
  - `tokyoPlinth()`: octagonal, gunmetal, magenta slots.
  - `londonPlinth()`: hexagonal, pale steel, blue and violet slots.
  - Palettes live in `TK` and `LK`.
- **Animated parts** are `spin` parts (spin and bob around a pivot). An aiming head is the `head` group with `aims: true`.
- **No rim light:** a material with **negative metalness** is a void surface. The tower shader gives it no rim light, which keeps the Event Horizon sphere pure black.
- **Done:** Core (`src/render/board.ts`), all six Tokyo duel units, and Flare, Photon Bloom, Halo and Spectra (London).

### Blender models (pilot: higher quality)

`art/blender/` builds models with Blender's Python module (`pip install bpy`, Blender 5.3):

```bash
python art/blender/supernova.py <out dir>
```

That writes `supernova.blend` and a Cycles studio render (`supernova.png`).

- **`kit.py`** is the shared toolkit:
  - bevelled prisms, extruded profiles, boxes, cylinders, spheres, tori
  - Principled materials
  - groups for animated parts
  - a studio set: grey floor, key/fill/rim area lights, 35°-ish camera, AgX Punchy
- **Conventions:**
  - Blender is Z-up, and units face −Y.
  - A part made in "outward = +X" space is stood at an angle with `place_radial()`.
- **Saved `.blend` files** are in `art/blender/models/` and open on any desktop Blender.

**Status:** Supernova is built and awaiting a design decision: four tall pylons (current) or two tall plus two short. The next step is exporting compressed glTF with baked ambient occlusion, then loading it in the game in place of its `CUSTOM` model, keeping the spin parts.

## Previews

The in-game previews come from Playwright scripts, run against the dev server (`npm run dev`). These scripts sit in the developer's scratch folder and are not committed yet. They:
- place a unit on an empty duel board
- render a 35° close-up with rank badges hidden
- render a 390 px phone board with the unit at ranks 1–5
- compose a side-by-side with the concept

Headless Chromium here uses a software renderer, so previews look rougher than a phone; judge final quality on a device.
