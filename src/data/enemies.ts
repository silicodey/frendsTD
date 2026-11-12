import type { EnemyDef } from './types';

export const ENEMIES: EnemyDef[] = [
  { id: 'bug', name: 'Bug', desc: 'Plain old defect. Comes in numbers.', hp: 30, speed: 1.2, armor: 0, bounty: 5, leak: 1, size: 1, color: 0x9be36b },
  { id: 'glitch', name: 'Glitch', desc: 'Fast and fragile. Outruns slow towers.', hp: 18, speed: 2.4, armor: 0, bounty: 5, leak: 1, size: 0.85, color: 0x47f5ff },
  { id: 'spam', name: 'Spam Bot', desc: 'Tiny, weak, and there are always more.', hp: 8, speed: 1.6, armor: 0, bounty: 2, leak: 1, size: 0.6, color: 0xffd166 },
  { id: 'trojan', name: 'Trojan', desc: 'Heavily armored. Shrugs off weak hits.', hp: 120, speed: 0.75, armor: 3, bounty: 14, leak: 2, size: 1.35, color: 0xc9a227 },
  { id: 'worm', name: 'Worm', desc: 'Splits into three wormlings when destroyed.', hp: 70, speed: 1.0, armor: 0, bounty: 8, leak: 2, size: 1.1, split: { into: 'wormling', n: 3 }, color: 0xff7ab8 },
  { id: 'wormling', name: 'Wormling', desc: 'Quick offspring of a worm.', hp: 18, speed: 1.7, armor: 0, bounty: 2, leak: 1, size: 0.6, color: 0xff9fd0 },
  { id: 'phantom', name: 'Hallucination', desc: 'Phases out of reality — untargetable while faded.', hp: 45, speed: 1.4, armor: 0, bounty: 9, leak: 1, size: 1, phase: { on: 1.2, off: 2.4 }, color: 0xb18cff },
  { id: 'encryptor', name: 'Encryptor', desc: 'Regenerating shield. Beams and breakpoints crack it.', hp: 60, speed: 1.0, armor: 0, shield: 60, bounty: 12, leak: 2, size: 1.1, color: 0x5ad1ff },
  { id: 'daemon', name: 'Patch Daemon', desc: 'Repairs nearby enemies. Kill it first.', hp: 80, speed: 1.0, armor: 0, bounty: 14, leak: 2, size: 1.1, heal: { range: 2.0, pct: 0.07, cd: 1.5 }, color: 0x4dff9a },
  { id: 'drone', name: 'Scraper Drone', desc: 'Flies straight for the Core, ignoring the path.', hp: 35, speed: 1.7, armor: 0, bounty: 8, leak: 1, size: 0.9, flying: true, color: 0xff9d47 },
  { id: 'injector', name: 'Prompt Injector', desc: 'Jams the nearest tower with malicious instructions.', hp: 90, speed: 1.1, armor: 1, bounty: 15, leak: 2, size: 1.1, jam: { range: 2.6, dur: 2.5, cd: 6 }, color: 0xd04dff },
  { id: 'ransom', name: 'Ransomware', desc: 'Armored brute that spawns bugs as it marches.', hp: 600, speed: 0.6, armor: 6, bounty: 60, leak: 5, size: 1.7, spawn: { type: 'bug', n: 2, cd: 5 }, color: 0xff4d4d },
  { id: 'hydra', name: 'Kernel Hydra', desc: 'BOSS — cut it down and it splits. Twice.', hp: 2600, speed: 0.5, armor: 3, bounty: 200, leak: 10, size: 2.3, boss: true, split: { into: 'hydraling', n: 2 }, color: 0xff5fa2 },
  { id: 'hydraling', name: 'Hydra Head', desc: 'A severed head of the Hydra. Still splits.', hp: 520, speed: 0.8, armor: 2, bounty: 40, leak: 4, size: 1.5, split: { into: 'worm', n: 2 }, color: 0xff7ab8 },
  { id: 'titan', name: 'Deepfake Titan', desc: 'BOSS — massive shield, phases out, jams towers.', hp: 4200, speed: 0.45, armor: 4, shield: 1600, bounty: 300, leak: 10, size: 2.4, boss: true, phase: { on: 1.0, off: 5 }, jam: { range: 3.2, dur: 2.5, cd: 7 }, color: 0x9d7bff },
  { id: 'clip', name: 'Paperclip', desc: 'A tiny paperclip. It only wants more paperclips.', hp: 16, speed: 1.9, armor: 0, bounty: 1, leak: 1, size: 0.55, color: 0xdfe6f0 },
  { id: 'maximizer', name: 'Paperclip Maximizer', desc: 'FINAL BOSS — converts everything into paperclips. Including you.', hp: 8200, speed: 0.4, armor: 7, bounty: 500, leak: 20, size: 2.7, boss: true, spawn: { type: 'clip', n: 4, cd: 3.2 }, jam: { range: 3.4, dur: 2.5, cd: 8 }, color: 0xe8eef7 },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
