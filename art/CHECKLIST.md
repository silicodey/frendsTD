# Artwork checklist

The live, tickable version is the **Art Tracker** page: https://claude.ai/artifact/V14WYU4FGeFj15PdzAHyKT
(ticks there are saved and shared). This file is a snapshot kept in the repository.

## The loop for every model

1. **Prompt:** Claude writes the class's brief pack in `art/briefs/<class>.md`, one copy-paste prompt per model.
2. **Concept (you):**
   - In ChatGPT, paste the prompt and attach:
     - the Core concept sheet
     - the class's first approved sheet, once there is one
   - Regenerate until you like it.
   - Upload the image to Claude and tick **Concept** on the tracker.
3. **Built (Claude):**
   - Rebuilds it in code: `src/render/towerModels.ts` for towers, `src/render/enemyModels.ts` for enemies.
   - Sends a side-by-side (concept vs close-up) and a phone duel screenshot.
4. **Approved (you):** OK it or ask for changes.
5. **Live:** after your "push", Claude pushes (Render redeploys) and updates the game artifact.

## Status

Each model goes **Prompt → Concept → Built → Approved → Live**; the column shows the next step.

| Batch | Model | Next step |
| --- | --- | --- |
| Core | Core | Live (next push) |
| 1 · Tokyo | Supernova (pilot), Arc Coil, Frenzy, Monolith, Juggernaut, Event Horizon | Concept |
| 2 · London | Flare, Photon Bloom, Halo, Spectra, Zenith, Binary Suns | Prompt |
| 3 · California | Ballad, Reverie, Nexus, Scribe, Pointer, Saga | Prompt |
| 4 · Prishtina | Script, Debugger, Sandbox, Refactor, Swarm, Kernel | Prompt |
| 5 · Bosses | Kernel Hydra (rename proposed: clashes with Kernel), Deepfake Titan, Paperclip Maximizer | Prompt |
| 6 · Duel monsters | Courier, Jammer, Leech, Mutator | Prompt |
| Campaign | 24 campaign-only towers; Bug, Glitch, Spam Bot, Trojan, Worm, Hallucination, Encryptor, Patch Daemon, Scraper Drone, Prompt Injector, Ransomware | Prompt |
