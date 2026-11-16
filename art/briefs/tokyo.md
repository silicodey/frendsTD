# Tokyo class: concept briefs (duel units)

Art-direction prompts for ChatGPT image generation. Paste one prompt per message, attaching the **Core concept sheet**
(the style reference) and, once it exists, the **approved Supernova sheet** (the class reference). Upload each result
back to Claude, who rebuilds it in code (`src/render/towerModels.ts`). The images are reference only: they are not
shipped with the game.

Every prompt repeats the shared rules on purpose, so each one works on its own.

| Unit | Rarity | Role in duels | Silhouette |
| --- | --- | --- | --- |
| Arc Coil | Common | chain lightning through 4 enemies | squat stacked coil, spark gap, discharge prongs |
| Frenzy | Rare | sprays 4 targets at once | compact rotary turret, ring of 4 short barrels |
| Monolith | Epic · Support | neighbours gain crit chance | tall plain faceted slab, hovering cap |
| Juggernaut | Legendary · Signature | railgun through the whole column | long heavy twin-rail cannon on a broad mount |
| Event Horizon | Legendary · Signature · Support | gravity well that drags enemies back | dark sphere in an open ring cradle, accretion disc |
| Supernova | Legendary · Signature | map-wide lightning storm | caged miniature star (the pilot; prompt sent separately) |

---

## Arc Coil

```text
Use the attached images as style references: the first sets materials, finish and level of detail; the second (if attached) is the approved class sheet, so share its plinth and trim language. Create a CONCEPT MODEL SHEET for a tower in a 3D mobile tower-defense game. Original design: it must not resemble any existing game, franchise or brand.

SUBJECT: "Arc Coil", the entry-level lightning tower of the Tokyo class (common rarity). A squat, sturdy stack of coils on a low octagonal gunmetal plinth, topped by an exposed spark gap between 2–3 short discharge prongs. Its lightning jumps from one enemy to the next through a crowd. Feeling: cheap, reliable, a little dangerous. Simpler and smaller than the class's legendary towers.

STYLE: premium stylized hard-surface sci-fi, clean bevels, satin gunmetal and polished chrome, small precise emissive details. Matte, readable, calm. NOT busy, NOT glowing everywhere.

PALETTE (stick to these): body gunmetal #2E3040; secondary panels #454858; light accents #D0D0DA; chrome trim #B8B8C4; emissive glow hot magenta-red #FF1F5A; soft glow pink #FF8FB4. Emissive areas no more than ~20% of the visible surface. No light rays, lens flares, bloom haze or lightning bolts in the image: show the object itself.

CONSTRUCTION (it will be rebuilt from simple 3D shapes): only simple solids — cylinders, spheres, rings/tori, octahedra, bevelled boxes, flat extruded plates, lathe (turned) profiles. No organic sculpting, faces, creatures, text, numbers, logos or loose cables. One strong, instantly recognisable silhouette, about as tall as the plinth is wide. Keep the very top clear (a small rank badge floats above it). Must stay readable when shown ~60 pixels tall on a phone, seen from above at 35°, among many other towers.

MOVING PARTS: 2 parts that animate (e.g. the coil rings slowly rotate in opposite directions, the spark gap prongs pulse up and down). Mark each one.

SHEET LAYOUT, flat neutral mid-grey background, even studio lighting, no environment: 1) large hero view, 3/4 from above (~35° down); 2) front orthographic view; 3) top orthographic view; 4) small callout of the moving parts with arrows; 5) palette swatches. Labels for the views only.
```

## Frenzy

```text
Use the attached images as style references: the first sets materials, finish and level of detail; the second (if attached) is the approved class sheet, so share its plinth and trim language. Create a CONCEPT MODEL SHEET for a tower in a 3D mobile tower-defense game. Original design: it must not resemble any existing game, franchise or brand.

SUBJECT: "Frenzy", the rapid-fire tower of the Tokyo class (rare rarity). A compact rotary turret on a low octagonal gunmetal plinth, with a ring of 4 short, stubby barrels around a central hub, so it can fire at four targets at once, constantly. Feeling: unhinged, twitchy energy held in a tight, well-engineered package. Wider than tall.

STYLE: premium stylized hard-surface sci-fi, clean bevels, satin gunmetal and polished chrome, small precise emissive details. Matte, readable, calm. NOT busy, NOT glowing everywhere.

PALETTE (stick to these): body gunmetal #2E3040; secondary panels #454858; light accents #D0D0DA; chrome trim #B8B8C4; emissive glow hot magenta-red #FF1F5A; soft glow pink #FF8FB4. Emissive areas no more than ~20% of the visible surface (e.g. only the barrel tips and a hub light). No light rays, lens flares, muzzle flashes, bloom haze or bullets in the image: show the object itself.

CONSTRUCTION (it will be rebuilt from simple 3D shapes): only simple solids — cylinders, spheres, rings/tori, octahedra, bevelled boxes, flat extruded plates, lathe (turned) profiles. No organic sculpting, faces, creatures, text, numbers, logos or loose cables. One strong, instantly recognisable silhouette, a little lower than the plinth is wide. Keep the very top clear (a small rank badge floats above it). Must stay readable when shown ~60 pixels tall on a phone, seen from above at 35°, among many other towers.

MOVING PARTS: 2 parts that animate (e.g. the barrel ring spins around its hub, the turret head turns to aim). Mark each one.

SHEET LAYOUT, flat neutral mid-grey background, even studio lighting, no environment: 1) large hero view, 3/4 from above (~35° down); 2) front orthographic view; 3) top orthographic view; 4) small callout of the moving parts with arrows; 5) palette swatches. Labels for the views only.
```

## Monolith

```text
Use the attached images as style references: the first sets materials, finish and level of detail; the second (if attached) is the approved class sheet, so share its plinth and trim language. Create a CONCEPT MODEL SHEET for a tower in a 3D mobile tower-defense game. Original design: it must not resemble any existing game, franchise or brand.

SUBJECT: "Monolith", the support tower of the Tokyo class (epic rarity). It never attacks: it stands silent and sharpens the towers around it, giving them a chance to land critical hits. A tall, plain, faceted dark slab on a low octagonal gunmetal plinth, with a separate cap piece hovering just above it and thin lines of light running along its edges. Feeling: calm, ancient, absolute; quiet authority among noisy weapons. Clearly NOT a weapon: no barrels, no prongs.

STYLE: premium stylized hard-surface sci-fi, clean bevels, satin gunmetal and polished chrome, small precise emissive details. Matte, readable, calm. NOT busy, NOT glowing everywhere.

PALETTE (stick to these): body gunmetal #2E3040; secondary panels #454858; light accents #D0D0DA; chrome trim #B8B8C4; emissive glow hot magenta-red #FF1F5A; soft glow pink #FF8FB4. Emissive areas no more than ~15% of the visible surface (thin edge lines only). No light rays, lens flares, bloom haze or aura effects in the image: show the object itself.

CONSTRUCTION (it will be rebuilt from simple 3D shapes): only simple solids — bevelled boxes, extruded faceted plates, cylinders, octahedra, rings. No organic sculpting, faces, creatures, text, numbers, runes that look like real alphabets, logos or cables. One strong, instantly recognisable silhouette: noticeably taller than wide (about 1.5× the plinth width) but slim, so it doesn't hide neighbouring towers. Keep the very top clear (a small rank badge floats above it). Must stay readable when shown ~60 pixels tall on a phone, seen from above at 35°, among many other towers.

MOVING PARTS: 2 parts that animate (e.g. the hovering cap slowly bobs and turns, a thin ring at the base slowly rotates). Mark each one.

SHEET LAYOUT, flat neutral mid-grey background, even studio lighting, no environment: 1) large hero view, 3/4 from above (~35° down); 2) front orthographic view; 3) top orthographic view; 4) small callout of the moving parts with arrows; 5) palette swatches. Labels for the views only.
```

## Juggernaut

```text
Use the attached images as style references: the first sets materials, finish and level of detail; the second (if attached) is the approved class sheet, so share its plinth and trim language. Create a CONCEPT MODEL SHEET for a tower in a 3D mobile tower-defense game. Original design: it must not resemble any existing game, franchise or brand.

SUBJECT: "Juggernaut", the heavy railgun of the Tokyo class (legendary rarity, a signature unit). It fires one enormous slug that tears through every enemy in a line, and it finishes off weakened enemies instantly. A long, heavy twin-rail cannon on a broad, armoured turret mount over a low octagonal gunmetal plinth; the two parallel rails have a visible gap between them with charging coils along their length. Feeling: overwhelming, deliberate force; slow to fire, devastating when it does. Legendary: the most imposing weapon in its class.

STYLE: premium stylized hard-surface sci-fi, clean bevels, satin gunmetal and polished chrome, small precise emissive details. Matte, readable, calm. NOT busy, NOT glowing everywhere.

PALETTE (stick to these): body gunmetal #2E3040; secondary panels #454858; light accents #D0D0DA; chrome trim #B8B8C4; emissive glow hot magenta-red #FF1F5A; soft glow pink #FF8FB4. Emissive areas no more than ~20% of the visible surface (e.g. the charging coils and a strip between the rails). No light rays, lens flares, muzzle flashes, bloom haze or projectiles in the image: show the object itself.

CONSTRUCTION (it will be rebuilt from simple 3D shapes): only simple solids — cylinders, spheres, rings/tori, octahedra, bevelled boxes, flat extruded plates, lathe (turned) profiles. No organic sculpting, faces, creatures, text, numbers, logos or loose cables. One strong, instantly recognisable silhouette: low and long; the barrel may overhang the plinth by about a third of the plinth width, but no more. Keep the very top clear (a small rank badge floats above it). Must stay readable when shown ~60 pixels tall on a phone, seen from above at 35°, among many other towers.

MOVING PARTS: 2–3 parts that animate (e.g. the turret yaws to aim, the charging coils slide along the rails, a counterweight drum at the back spins). Mark each one.

SHEET LAYOUT, flat neutral mid-grey background, even studio lighting, no environment: 1) large hero view, 3/4 from above (~35° down); 2) side orthographic view; 3) top orthographic view; 4) small callout of the moving parts with arrows; 5) palette swatches. Labels for the views only.
```

## Event Horizon

```text
Use the attached images as style references: the first sets materials, finish and level of detail; the second (if attached) is the approved class sheet, so share its plinth and trim language. Create a CONCEPT MODEL SHEET for a tower in a 3D mobile tower-defense game. Original design: it must not resemble any existing game, franchise or brand.

SUBJECT: "Event Horizon", the gravity tower of the Tokyo class (legendary rarity, a signature unit). Every few seconds it collapses space, dragging enemies back along their path and tearing at them. A perfectly dark, matte sphere held in an open cradle of 3 curved chrome arms rising from a low octagonal gunmetal plinth, with a thin, flat accretion disc (a ring of segmented plates) around the sphere's equator. Feeling: wrong, heavy, silent; the sphere looks like a hole in the world. Legendary: rare and unsettling.

STYLE: premium stylized hard-surface sci-fi, clean bevels, satin gunmetal and polished chrome, small precise emissive details. Matte, readable, calm. NOT busy, NOT glowing everywhere.

PALETTE (stick to these): body gunmetal #2E3040; secondary panels #454858; light accents #D0D0DA; chrome trim #B8B8C4; emissive glow hot magenta-red #FF1F5A; soft glow pink #FF8FB4; the sphere itself near-black #08080C. Emissive areas no more than ~20% of the visible surface (e.g. the inner edge of the accretion disc and the arm tips). No light rays, lens flares, warped-space effects, bloom haze or particles in the image: show the object itself.

CONSTRUCTION (it will be rebuilt from simple 3D shapes): only simple solids — cylinders, spheres, rings/tori, octahedra, bevelled boxes, flat extruded plates, lathe (turned) profiles, curved tube arms. No organic sculpting, faces, creatures, text, numbers, logos or loose cables. One strong, instantly recognisable silhouette, about as tall as the plinth is wide. Keep the very top clear (a small rank badge floats above it). Must stay readable when shown ~60 pixels tall on a phone, seen from above at 35°, among many other towers.

MOVING PARTS: 2–3 parts that animate (e.g. the accretion disc slowly rotates, the sphere bobs slightly, the cradle arms flex inward on each pulse). Mark each one.

SHEET LAYOUT, flat neutral mid-grey background, even studio lighting, no environment: 1) large hero view, 3/4 from above (~35° down); 2) front orthographic view; 3) top orthographic view; 4) small callout of the moving parts with arrows; 5) palette swatches. Labels for the views only.
```
