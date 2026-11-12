import type { LevelDef, Theme, Wave, WaveGroup } from './types';

export const THEMES: Theme[] = [
  {
    id: 'farm', name: 'Server Farm',
    sky: [0x030816, 0x0c3a5e, 0x1b6fa8],
    tile: 0x1a2634, tileAccent: 0x35e0ff, path: 0x07121c, pathGlow: 0x2bd9ff,
    fog: 0x071a2c, key: 0xcfe8ff, rim: 0x2bb8ff, prop: 'server',
  },
  {
    id: 'latent', name: 'Latent Space',
    sky: [0x08031a, 0x3a1466, 0xb23cff],
    tile: 0x231a36, tileAccent: 0xc86bff, path: 0x0d0718, pathGlow: 0xe052ff,
    fog: 0x150a2a, key: 0xe8d8ff, rim: 0xff4fd8, prop: 'crystal',
  },
  {
    id: 'singularity', name: 'Singularity',
    sky: [0x0a0402, 0x5a1a08, 0xff7a1a],
    tile: 0x2a1d17, tileAccent: 0xffa23a, path: 0x120805, pathGlow: 0xff7a2a,
    fog: 0x1c0c06, key: 0xffe2c4, rim: 0xff5a1f, prop: 'pylon',
  },
];

type P = [number, number][];
const L = (
  id: number, name: string, blurb: string, world: number, paths: P[], waves: number,
  hp: number, threat: number, pool: string[], boss?: string, cols = 9, rows = 14,
): LevelDef => ({
  id, name, blurb, world, cols, rows, paths, waves,
  startTokens: Math.round((70 + 170 * Math.pow(hp, 0.9)) / 10) * 10, lives: 20, hp, threat, pool, boss, seed: id * 7919,
});

export const LEVELS: LevelDef[] = [
  L(1, 'Hello World', 'Your first deployment. Bugs incoming.', 0,
    [[[1, 0], [1, 3], [7, 3], [7, 7], [1, 7], [1, 11], [7, 11], [7, 13]]], 8, 1.0, 1.0, ['bug', 'glitch']),
  L(2, 'Stack Overflow', 'The inbox is filling up with spam.', 0,
    [[[7, 0], [7, 2], [2, 2], [2, 5], [6, 5], [6, 8], [1, 8], [1, 11], [5, 11], [5, 13]]], 10, 1.15, 1.1, ['bug', 'glitch', 'spam']),
  L(3, 'Race Condition', 'Two threads, one Core. Armor appears.', 0,
    [
      [[1, 0], [1, 4], [4, 4], [4, 8], [1, 8], [1, 11], [4, 11], [4, 13]],
      [[7, 0], [7, 4], [4, 4], [4, 8], [1, 8], [1, 11], [4, 11], [4, 13]],
    ], 10, 1.3, 1.2, ['bug', 'glitch', 'spam', 'trojan']),
  L(4, 'Memory Leak', 'It spirals inward. Worms multiply.', 0,
    [[[0, 1], [7, 1], [7, 12], [1, 12], [1, 4], [5, 4], [5, 9], [3, 9], [3, 7]]], 12, 1.45, 1.3, ['bug', 'glitch', 'spam', 'trojan', 'worm']),
  L(5, 'Kernel Panic', 'Something large is in the kernel.', 0,
    [[[0, 1], [7, 1], [7, 4], [1, 4], [1, 7], [7, 7], [7, 10], [1, 10], [1, 12], [4, 12], [4, 13]]], 12, 1.65, 1.4, ['bug', 'glitch', 'spam', 'trojan', 'worm', 'ransom'], 'hydra'),

  L(6, 'Gradient Descent', 'Step by step, downhill. Things start to fly.', 1,
    [[[0, 1], [2, 1], [2, 3], [4, 3], [4, 5], [6, 5], [6, 9], [3, 9], [3, 11], [1, 11], [1, 13]]], 12, 1.9, 1.5, ['bug', 'glitch', 'trojan', 'worm', 'phantom', 'drone']),
  L(7, 'Attention Heads', 'Two lanes demand your attention. Shields up.', 1,
    [
      [[0, 2], [3, 2], [3, 6], [1, 6], [1, 10], [4, 10], [4, 13]],
      [[8, 2], [5, 2], [5, 6], [7, 6], [7, 10], [4, 10], [4, 13]],
    ], 14, 2.2, 1.6, ['glitch', 'spam', 'trojan', 'phantom', 'drone', 'encryptor']),
  L(8, 'Overfit', 'The path crosses itself. So do the healers.', 1,
    [[[1, 0], [1, 5], [7, 5], [7, 2], [4, 2], [4, 9], [1, 9], [1, 12], [7, 12], [7, 13]]], 14, 2.5, 1.7, ['bug', 'trojan', 'worm', 'phantom', 'encryptor', 'daemon', 'ransom']),
  L(9, 'Vanishing Gradient', 'A long way round. Injectors jam your towers.', 1,
    [[[1, 0], [1, 11], [3, 11], [3, 2], [5, 2], [5, 11], [7, 11], [7, 1]]], 15, 3.0, 1.9, ['glitch', 'spam', 'trojan', 'drone', 'encryptor', 'daemon', 'injector', 'ransom']),
  L(10, 'Mode Collapse', 'Every sample looks the same. One of them is enormous.', 1,
    [
      [[2, 0], [2, 4], [6, 4], [6, 8], [2, 8], [2, 11], [4, 11], [4, 13]],
      [[6, 0], [6, 8], [2, 8], [2, 11], [4, 11], [4, 13]],
    ], 15, 3.4, 2.0, ['bug', 'glitch', 'trojan', 'worm', 'phantom', 'drone', 'encryptor', 'daemon', 'injector', 'ransom'], 'titan'),

  L(11, 'Event Loop', 'Round and round toward the center.', 2,
    [[[4, 0], [4, 2], [7, 2], [7, 10], [1, 10], [1, 4], [4, 4], [4, 7]]], 16, 4.0, 2.1, ['glitch', 'spam', 'trojan', 'worm', 'phantom', 'drone', 'encryptor', 'daemon', 'injector', 'ransom']),
  L(12, 'Fork Bomb', 'Three entry points. Good luck.', 2,
    [
      [[1, 0], [1, 3], [4, 3], [4, 6], [1, 6], [1, 9], [7, 9], [7, 12], [4, 12], [4, 13]],
      [[7, 0], [7, 3], [4, 3], [4, 6], [1, 6], [1, 9], [7, 9], [7, 12], [4, 12], [4, 13]],
      [[8, 6], [6, 6], [6, 9], [7, 9], [7, 12], [4, 12], [4, 13]],
    ], 16, 4.6, 2.3, ['bug', 'glitch', 'spam', 'trojan', 'worm', 'phantom', 'drone', 'encryptor', 'daemon', 'injector', 'ransom']),
  L(13, 'Alignment Problem', 'A very short path. No room for error.', 2,
    [[[0, 3], [5, 3], [5, 7], [2, 7], [2, 10], [8, 10]]], 18, 4.4, 2.2, ['glitch', 'trojan', 'worm', 'phantom', 'drone', 'encryptor', 'daemon', 'injector', 'ransom']),
  L(14, 'Paperclip Factory', 'Two crossing lines. The clips are coming.', 2,
    [
      [[1, 0], [1, 6], [7, 6], [7, 12], [4, 12], [4, 13]],
      [[7, 0], [7, 3], [4, 3], [4, 9], [1, 9], [1, 12], [4, 12], [4, 13]],
    ], 18, 5.6, 2.5, ['glitch', 'spam', 'clip', 'trojan', 'worm', 'phantom', 'drone', 'encryptor', 'daemon', 'injector', 'ransom']),
  L(15, 'The Singularity', 'The Maximizer has arrived. Hold the Core.', 2,
    [[[0, 0], [8, 0], [8, 13], [0, 13], [0, 3], [6, 3], [6, 10], [2, 10], [2, 6], [4, 6], [4, 8]]], 20, 6.2, 2.7, ['glitch', 'spam', 'clip', 'trojan', 'worm', 'phantom', 'drone', 'encryptor', 'daemon', 'injector', 'ransom'], 'maximizer'),
];

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THREAT: Record<string, number> = {
  bug: 1, glitch: 1.05, spam: 0.36, clip: 0.5, trojan: 3.6, worm: 3.2, phantom: 2.2, encryptor: 3.2,
  daemon: 3.8, drone: 1.7, injector: 4.2, ransom: 16,
};
const GAP: Record<string, number> = {
  bug: 0.62, glitch: 0.48, spam: 0.26, clip: 0.22, trojan: 1.25, worm: 1.1, phantom: 0.85, encryptor: 1.1,
  daemon: 1.6, drone: 0.7, injector: 1.5, ransom: 3.5,
};

/** Deterministic wave list for a level (optionally extended for endless mode). */
export function buildWaves(level: LevelDef, endlessExtra = 0): Wave[] {
  const rng = mulberry32(level.seed);
  const W = level.waves + endlessExtra;
  const waves: Wave[] = [];
  const nPaths = level.paths.length;
  const pool = level.pool.filter((p) => p !== 'ransom');
  const hasRansom = level.pool.includes('ransom');

  for (let w = 0; w < W; w++) {
    const hpMult = level.hp * Math.pow(1.115, w);
    const budget = level.threat * (9 + 3.6 * w + 0.12 * w * w);
    // enemy types unlock gradually across the level
    const avail = pool.filter((_, k) => w >= Math.floor((k * level.waves * 0.62) / Math.max(1, pool.length)));
    const groups: WaveGroup[] = [];
    const isLast = w === level.waves - 1;
    const isBoss = isLast && !!level.boss;
    const pickType = (bias: number) => {
      // bias toward most recently introduced types
      const r = Math.pow(rng(), bias);
      return avail[Math.min(avail.length - 1, Math.floor((1 - r) * avail.length))];
    };
    const add = (type: string, share: number, delay: number, path: number) => {
      const n = Math.max(1, Math.min(42, Math.round((budget * share) / (THREAT[type] ?? 1))));
      groups.push({ type, count: n, gap: GAP[type] ?? 0.7, delay, path, hpMult });
      return delay + n * (GAP[type] ?? 0.7);
    };

    const nGroups = isLast ? 3 : w < 2 ? 1 : rng() < 0.55 ? 2 : rng() < 0.5 ? 3 : 1;
    const scale = isLast && !isBoss ? 1.5 : isBoss ? 0.9 : 1;
    const first = w === 0 ? avail[0] : pickType(1.7);
    let t = 0;
    const used = new Set<string>();
    for (let g = 0; g < nGroups; g++) {
      let type = g === 0 ? first : pickType(1.0);
      if (used.has(type)) type = avail[Math.floor(rng() * avail.length)];
      used.add(type);
      const share = (scale * (g === 0 ? (nGroups === 1 ? 1 : 0.6) : 0.4 / (nGroups - 1))) * (nGroups === 3 ? 1.1 : 1);
      const path = nPaths === 1 ? 0 : Math.floor(rng() * nPaths);
      if (nPaths > 1 && rng() < 0.5 && THREAT[type] < 3) {
        // split this group across two lanes
        const p2 = (path + 1 + Math.floor(rng() * (nPaths - 1))) % nPaths;
        const end1 = add(type, share * 0.5, t, path);
        add(type, share * 0.5, t + 0.3, p2);
        t = Math.max(t, end1 * 0.6) + 1.5;
      } else {
        t = add(type, share, t, path) * 0.6 + 1.5;
      }
    }
    if (hasRansom && (w + 1) % 5 === 0 && !isBoss && w >= 4) {
      const n = 1 + Math.floor(w / 9);
      groups.push({ type: 'ransom', count: n, gap: 4, delay: 2, path: Math.floor(rng() * nPaths), hpMult });
    }
    if (isBoss) {
      groups.push({ type: level.boss!, count: 1, gap: 1, delay: 4, path: 0, hpMult: hpMult / level.hp / Math.pow(1.115, w) * bossScale(level) });
    }
    if (endlessExtra && w >= level.waves && (w - level.waves) % 5 === 4 && level.boss) {
      groups.push({ type: level.boss, count: 1, gap: 1, delay: 3, path: 0, hpMult: bossScale(level) * Math.pow(1.5, (w - level.waves + 1) / 5) });
    }
    waves.push({ groups, bonus: Math.round((18 + w * 4) * Math.pow(level.hp, 0.8)), boss: isBoss });
  }
  return waves;
}

function bossScale(level: LevelDef): number {
  // boss hp is authored per boss; scale gently with level difficulty
  return level.id <= 5 ? 1 : level.id <= 10 ? 1.25 : 1.6;
}

export function levelUnlocked(levelId: number, stars: Record<number, number>): boolean {
  return levelId === 1 || (stars[levelId - 1] ?? 0) > 0;
}
