import { TOWER_BY_ID } from '../data/towers';
import { mulberry32 } from '../data/levels';
import { PVP_UNITS, RARITY_INFO, rarityOf, type Rarity } from './roster';

/**
 * The account economy. Rush Royale's structure, renamed for this world:
 *
 *   Tokens   main currency: earned from battles, Checkpoints and the campaign; spent on card upgrades and the shop
 *   Weights  copies of a unit's card; each unit has its own Weights, needed (with Tokens) to level it up
 *   Limits   match energy: every ranked battle uses one; they refill over time ("your limit resets in 7:12")
 *   Resets   premium currency: instantly reset your Limits, change a talent, or buy Tokens
 *   Usage    account XP from upgrades and battles; levels up your Usage tier (Free → Pro → Max → Team → Enterprise)
 *   Elo      rating; climbing it moves you through arenas, which unlock rarer units
 */

export const MAX_CARD_LEVEL = 15;

/** Weights needed for each level-up, counted from the rarity's starting level. */
export const WEIGHTS_TABLE: Record<Rarity, number[]> = {
  common: [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000, 2000, 3000, 5000, 8000],
  rare: [2, 4, 10, 20, 50, 100, 200, 400, 600, 800, 1200, 1600],
  epic: [2, 4, 10, 20, 40, 80, 150, 250, 400, 600],
  legendary: [1, 2, 4, 8, 15, 25, 40, 60],
};

/** Tokens to reach each level (index = target level). */
export const TOKENS_TABLE = [0, 0, 10, 25, 50, 100, 200, 400, 800, 1600, 3200, 5000, 8000, 12000, 18000, 25000];

export function startLevel(id: string) { return RARITY_INFO[rarityOf(TOWER_BY_ID[id])].startLevel; }

export function upgradeCost(id: string, level: number): { weights: number; tokens: number } | null {
  if (level >= MAX_CARD_LEVEL) return null;
  const r = rarityOf(TOWER_BY_ID[id]);
  const step = level - RARITY_INFO[r].startLevel;
  return { weights: WEIGHTS_TABLE[r][step], tokens: TOKENS_TABLE[level + 1] };
}

/** Usage XP for reaching a card level (rarer and higher pays more). */
export function upgradeUsage(id: string, newLevel: number) {
  const r = rarityOf(TOWER_BY_ID[id]);
  return Math.round(newLevel * newLevel * 1.5 * ({ common: 1, rare: 1.3, epic: 1.7, legendary: 2.2 } as const)[r]);
}

// ------------------------------------------------------------------ Usage tiers
export const usageToNext = (level: number) => 40 + 30 * level;
export function usageLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (xp >= usageToNext(level)) { xp -= usageToNext(level); level++; }
  return { level, into: xp, need: usageToNext(level) };
}
export function usageTier(level: number) {
  return level < 5 ? 'Free' : level < 10 ? 'Pro' : level < 15 ? 'Max' : level < 20 ? 'Team' : 'Enterprise';
}
/** Reward for reaching a Usage level. */
export const usageReward = (level: number) => ({ tokens: 100 * level, resets: 2 });

// ------------------------------------------------------------------ Limits
export const LIMIT_MAX = 8;
export const LIMIT_REGEN_S = 8 * 60;

export interface LimitState { n: number; t: number } // count, epoch-ms when the last one was counted
/** Bring a limit state up to `now`. */
export function tickLimits(s: LimitState, now: number): LimitState {
  if (s.n >= LIMIT_MAX) return { n: LIMIT_MAX, t: now };
  const gained = Math.floor((now - s.t) / (LIMIT_REGEN_S * 1000));
  if (gained <= 0) return s;
  const n = Math.min(LIMIT_MAX, s.n + gained);
  return { n, t: n >= LIMIT_MAX ? now : s.t + gained * LIMIT_REGEN_S * 1000 };
}
export function nextLimitIn(s: LimitState, now: number) {
  if (s.n >= LIMIT_MAX) return 0;
  return Math.max(0, LIMIT_REGEN_S - (now - s.t) / 1000);
}

// ------------------------------------------------------------------ Elo & arenas
export interface Arena { id: number; name: string; elo: number; theme: number; unlocks: string[]; blurb: string }
export const ARENAS: Arena[] = [
  { id: 0, name: 'Sandbox', elo: 0, theme: 0, unlocks: PVP_UNITS.filter((t) => ['common', 'rare'].includes(rarityOf(t))).map((t) => t.id), blurb: 'Where every model starts. Commons and rares.' },
  { id: 1, name: 'Staging', elo: 300, theme: 0, unlocks: PVP_UNITS.filter((t) => rarityOf(t) === 'epic').map((t) => t.id), blurb: 'Epic units join the Checkpoints.' },
  { id: 2, name: 'Canary', elo: 700, theme: 1, unlocks: ['gem_deepthink', 'cl_computer', 'cx_refactor', 'gk_heavy'], blurb: 'The first legendaries appear.' },
  { id: 3, name: 'Production', elo: 1200, theme: 1, unlocks: ['gem_constellation', 'cl_mythos', 'cx_swarm', 'gk_blackhole'], blurb: 'More legendaries, tougher rivals.' },
  { id: 4, name: 'Frontier', elo: 1800, theme: 2, unlocks: ['gem_twinsuns', 'cl_fable', 'cx_max', 'gk_supernova'], blurb: 'Every unit is in play.' },
  { id: 5, name: 'Singularity', elo: 2500, theme: 2, unlocks: [], blurb: 'The top of the ladder.' },
];
export const arenaFor = (elo: number) => [...ARENAS].reverse().find((a) => elo >= a.elo)!;
export const unitsUpTo = (arena: number) => ARENAS.filter((a) => a.id <= arena).flatMap((a) => a.unlocks);
export const arenaOfUnit = (id: string) => ARENAS.find((a) => a.unlocks.includes(id))?.id ?? 0;

/** Elo change for a result (1 win, 0.5 draw, 0 loss). */
export function eloDelta(mine: number, theirs: number, score: number) {
  const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  const d = Math.round(40 * (score - expected));
  if (score === 1) return Math.max(8, d);
  if (score === 0) return Math.min(-6, d);
  return d;
}
export const matchTokens = (arena: number, score: number) => (score === 1 ? 40 + 12 * arena : score === 0.5 ? 20 + 5 * arena : 12 + 3 * arena);
export const matchUsage = (score: number) => (score === 1 ? 14 : 6);

// ------------------------------------------------------------------ Checkpoints (reward chests)
export type CheckpointKind = 'common' | 'rare' | 'epic' | 'legendary';
export const CHECKPOINT_INFO: Record<CheckpointKind, { name: string; css: string; tokens: number; weights: [number, number, number, number]; stacks: number }> = {
  // weights: how many common / rare / epic / legendary Weights it holds
  common: { name: 'Checkpoint', css: '#9fb0cc', tokens: 30, weights: [14, 4, 0, 0], stacks: 3 },
  rare: { name: 'Rare Checkpoint', css: '#4fa8ff', tokens: 90, weights: [36, 12, 2, 0], stacks: 4 },
  epic: { name: 'Epic Checkpoint', css: '#c56bff', tokens: 260, weights: [90, 32, 6, 1], stacks: 5 },
  legendary: { name: 'Legendary Checkpoint', css: '#ffb83d', tokens: 800, weights: [200, 80, 16, 3], stacks: 6 },
};

export function rollCheckpoint(rng: () => number, winsSinceEpic: number): CheckpointKind {
  if (winsSinceEpic >= 9) return 'epic'; // pity: at least one Epic Checkpoint every 10 wins
  const r = rng();
  return r < 0.01 ? 'legendary' : r < 0.08 ? 'epic' : r < 0.3 ? 'rare' : 'common';
}

export interface CheckpointLoot { kind: CheckpointKind; tokens: number; weights: { id: string; n: number }[] }

/** Fill a Checkpoint from the units available in your arena. Arenas multiply the contents. */
export function openCheckpoint(kind: CheckpointKind, arena: number, rng: () => number): CheckpointLoot {
  const info = CHECKPOINT_INFO[kind];
  const scale = 1 + arena * 0.35;
  const pool = unitsUpTo(arena);
  const byR: Record<Rarity, string[]> = { common: [], rare: [], epic: [], legendary: [] };
  for (const id of pool) byR[rarityOf(TOWER_BY_ID[id])].push(id);
  const out = new Map<string, number>();
  const rs: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  rs.forEach((r, i) => {
    let n = Math.round(info.weights[i] * (i < 2 ? scale : 1));
    if (!n || !byR[r].length) {
      // nothing of this rarity unlocked yet: pay the value out one rarity down
      if (n && i > 0) out.set('__down' + i, n);
      return;
    }
    const stacks = Math.max(1, Math.min(byR[r].length, Math.round(info.stacks * (i === 0 ? 0.5 : i === 1 ? 0.35 : 0.15)) || 1));
    const ids = [...byR[r]].sort(() => rng() - 0.5).slice(0, stacks);
    ids.forEach((id, k) => {
      const share = k === ids.length - 1 ? n : Math.max(1, Math.round(n / (ids.length - k) * (0.6 + rng() * 0.8)));
      out.set(id, (out.get(id) ?? 0) + share); n -= share;
    });
  });
  // convert "down" payouts (locked rarities) into extra Tokens
  let tokens = Math.round(info.tokens * scale);
  for (const [k, n] of [...out]) if (k.startsWith('__down')) { tokens += n * 25 * Number(k.slice(6)); out.delete(k); }
  return { kind, tokens, weights: [...out].filter(([, n]) => n > 0).map(([id, n]) => ({ id, n })) };
}

// ------------------------------------------------------------------ Shop
export interface Offer { key: string; id?: string; weights?: number; tokens?: number; costTokens?: number; costResets?: number; label: string }

/** Today's shop: three Weights offers rotate daily (seeded by date), plus fixed Reset deals. */
export function dailyOffers(day: number, arena: number): Offer[] {
  const rng = mulberry32(day * 2654435761);
  const pool = unitsUpTo(arena);
  const pick = (r: Rarity) => { const l = pool.filter((id) => rarityOf(TOWER_BY_ID[id]) === r); return l.length ? l[Math.floor(rng() * l.length)] : null; };
  const out: Offer[] = [];
  const c = pick('common'), r = pick('rare'), e = pick('epic') ?? pick('rare'), l = pick('legendary');
  if (c) out.push({ key: `d${day}-c`, id: c, weights: 40, costTokens: 200, label: '40 Weights' });
  if (r) out.push({ key: `d${day}-r`, id: r, weights: 12, costTokens: 400, label: '12 Weights' });
  if (e) out.push({ key: `d${day}-e`, id: e, weights: rarityOf(TOWER_BY_ID[e]) === 'epic' ? 3 : 20, costTokens: 1000, label: rarityOf(TOWER_BY_ID[e]) === 'epic' ? '3 Weights' : '20 Weights' });
  if (l) out.push({ key: `d${day}-l`, id: l, weights: 1, costTokens: 5000, label: '1 Weight' });
  out.push({ key: 'limits', costResets: 1, label: 'Reset your Limits' });
  out.push({ key: `d${day}-tok`, tokens: 600, costResets: 3, label: '600 Tokens' });
  return out;
}

export const TALENT_RESPEC_RESETS = 1;
export const dayNumber = (now: number) => Math.floor(now / 86400000);
