import { TOWER_BY_ID } from '../data/towers';
import { mulberry32 } from '../data/levels';
import { PVP_UNITS, RARITY_INFO, rarityOf, type Rarity } from './roster';
import type { Family } from '../data/types';

/**
 * The account economy. Rush Royale's structure, renamed for this world:
 *
 *   Tokens   main currency: earned from battles, Checkpoints and the campaign; spent on card upgrades and the shop
 *   Weights  copies of a unit's card; each unit has its own Weights, needed (with Tokens) to level it up
 *   Limits   match energy: every ranked battle uses one; they refill over time ("your limit resets in 7:12")
 *   Resets   premium currency: instantly reset your Limits, change a talent, or buy Tokens
 *   Usage    account XP from upgrades and battles; levels up your Usage tier (Hobby → Builder → Studio → Scale → Hyperscale)
 *   Elo      rating; climbing it moves you through arenas, which unlock rarer units
 *
 * Materials (for Breakthroughs, the level-ups to 6, 8 and 10 that each teach a unit a speciality):
 *   Data Shards   common: every match, the campaign, Checkpoints, the Shop
 *   Class Sigils  one kind per class: earned by playing that class's units; doubled for the featured class
 *   Neural Cores  rare: Legendary/Epic Checkpoints, weekly wins, arena promotions, one a week in the Shop
 */

export const MAX_CARD_LEVEL = 10;

/** Cards (Weights) needed for each level-up, counted from the rarity's starting level (C1, R2, E4, L5). */
export const WEIGHTS_TABLE: Record<Rarity, number[]> = {
  common: [5, 10, 20, 40, 80, 150, 300, 500, 800], // → L2 … L10
  rare: [4, 8, 16, 30, 60, 120, 200, 350], // → L3 … L10
  epic: [3, 6, 12, 25, 50, 90], // → L5 … L10
  legendary: [3, 3, 4, 4, 5], // → L6, L7 (3 each), L8, L9 (4 each), L10 (5)
};

/** Tokens to reach each level (index = target level). */
export const TOKENS_TABLE = [0, 0, 50, 120, 250, 500, 1000, 2000, 4000, 8000, 15000];

/** Levels that are Breakthroughs: they also cost materials, and each teaches a speciality. */
export const BREAKTHROUGHS = [6, 8, 10];

export interface Materials { shards: number; cores: number; sigils: Record<Family, number> }
export const noMaterials = (): Materials => ({ shards: 0, cores: 0, sigils: { gemini: 0, claude: 0, codex: 0, grok: 0 } });

/** Extra materials for a Breakthrough, by rarity. */
export const BREAKTHROUGH_COST: Record<Rarity, Record<number, { shards: number; sigils: number; cores: number }>> = {
  common: { 6: { shards: 40, sigils: 0, cores: 0 }, 8: { shards: 120, sigils: 20, cores: 0 }, 10: { shards: 300, sigils: 60, cores: 3 } },
  rare: { 6: { shards: 50, sigils: 0, cores: 0 }, 8: { shards: 140, sigils: 24, cores: 0 }, 10: { shards: 340, sigils: 70, cores: 4 } },
  epic: { 6: { shards: 60, sigils: 0, cores: 0 }, 8: { shards: 160, sigils: 30, cores: 1 }, 10: { shards: 400, sigils: 80, cores: 5 } },
  legendary: { 6: { shards: 80, sigils: 0, cores: 0 }, 8: { shards: 200, sigils: 40, cores: 1 }, 10: { shards: 500, sigils: 100, cores: 6 } },
};

export function startLevel(id: string) { return RARITY_INFO[rarityOf(TOWER_BY_ID[id])].startLevel; }

export interface UpgradeCost { weights: number; tokens: number; shards: number; sigils: number; cores: number; family: Family; breakthrough: boolean }

export function upgradeCost(id: string, level: number): UpgradeCost | null {
  if (level >= MAX_CARD_LEVEL) return null;
  const def = TOWER_BY_ID[id], r = rarityOf(def);
  const step = level - RARITY_INFO[r].startLevel;
  const bt = BREAKTHROUGH_COST[r][level + 1];
  return { weights: WEIGHTS_TABLE[r][step], tokens: TOKENS_TABLE[level + 1], shards: bt?.shards ?? 0, sigils: bt?.sigils ?? 0, cores: bt?.cores ?? 0, family: def.family, breakthrough: !!bt };
}

/** Usage XP for reaching a card level (rarer and higher pays more). */
export function upgradeUsage(id: string, newLevel: number) {
  const r = rarityOf(TOWER_BY_ID[id]);
  return Math.round(newLevel * newLevel * 3 * ({ common: 1, rare: 1.3, epic: 1.7, legendary: 2.2 } as const)[r]);
}

// ------------------------------------------------------------------ Usage tiers
export const usageToNext = (level: number) => 40 + 30 * level;
export function usageLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (xp >= usageToNext(level)) { xp -= usageToNext(level); level++; }
  return { level, into: xp, need: usageToNext(level) };
}
export function usageTier(level: number) {
  return level < 5 ? 'Hobby' : level < 10 ? 'Builder' : level < 15 ? 'Studio' : level < 20 ? 'Scale' : 'Hyperscale';
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
  { id: 3, name: 'Production', elo: 1200, theme: 1, unlocks: ['cx_swarm', 'gk_blackhole'], blurb: 'More legendaries, tougher rivals.' },
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

export interface CheckpointLoot { kind: CheckpointKind; tokens: number; weights: { id: string; n: number }[]; mats?: Materials }

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
  return { kind, tokens, weights: [...out].filter(([, n]) => n > 0).map(([id, n]) => ({ id, n })), mats: checkpointMaterials(kind, rng) };
}

// ------------------------------------------------------------------ Shop
export type ShopSection = 'week' | 'daily' | 'materials' | 'checkpoints' | 'wallet';
export interface Offer {
  key: string; section: ShopSection; label: string;
  id?: string; weights?: number; tokens?: number; mats?: Partial<Omit<Materials, 'sigils'>> & { sigils?: Partial<Record<Family, number>> };
  checkpoint?: CheckpointKind; costTokens?: number; costResets?: number;
}

/**
 * The shop: daily unit deals (seeded by date), materials, Checkpoints, and this week's featured-class
 * Sigils. Keys carry the day or week, so each deal can be bought once in its period. No real money:
 * Resets are only earned (real-money packs come later, through the app store).
 */
export function dailyOffers(day: number, arena: number, featured: Family = 'gemini'): Offer[] {
  const rng = mulberry32(day * 2654435761);
  const week = Math.floor((day + 3) / 7);
  const pool = unitsUpTo(arena);
  const pick = (r: Rarity) => { const l = pool.filter((id) => rarityOf(TOWER_BY_ID[id]) === r); return l.length ? l[Math.floor(rng() * l.length)] : null; };
  const out: Offer[] = [];
  out.push({ key: `w${week}-sig`, section: 'week', mats: { sigils: { [featured]: 15 } }, costTokens: 600, label: '15 Sigils' });
  out.push({ key: `w${week}-sig2`, section: 'week', mats: { sigils: { [featured]: 40 } }, costResets: 2, label: '40 Sigils' });
  const c = pick('common'), r = pick('rare'), e = pick('epic') ?? pick('rare'), l = pick('legendary');
  if (c) out.push({ key: `d${day}-c`, section: 'daily', id: c, weights: 40, costTokens: 200, label: '40 cards' });
  if (r) out.push({ key: `d${day}-r`, section: 'daily', id: r, weights: 12, costTokens: 400, label: '12 cards' });
  if (e) out.push({ key: `d${day}-e`, section: 'daily', id: e, weights: rarityOf(TOWER_BY_ID[e]) === 'epic' ? 3 : 20, costTokens: 1000, label: rarityOf(TOWER_BY_ID[e]) === 'epic' ? '3 cards' : '20 cards' });
  if (l) out.push({ key: `d${day}-l`, section: 'daily', id: l, weights: 1, costTokens: 5000, label: '1 card' });
  out.push({ key: `d${day}-sh1`, section: 'materials', mats: { shards: 30 }, costTokens: 300, label: '30 Data Shards' });
  out.push({ key: `d${day}-sh2`, section: 'materials', mats: { shards: 100 }, costTokens: 900, label: '100 Data Shards' });
  out.push({ key: `w${week}-core`, section: 'materials', mats: { cores: 1 }, costResets: 3, label: '1 Neural Core' });
  out.push({ key: `d${day}-cp`, section: 'checkpoints', checkpoint: 'rare', costTokens: 800, label: 'Rare Checkpoint' });
  out.push({ key: `w${week}-cpe`, section: 'checkpoints', checkpoint: 'epic', costResets: 6, label: 'Epic Checkpoint' });
  out.push({ key: 'limits', section: 'wallet', costResets: 1, label: 'Reset your Limits' });
  out.push({ key: `d${day}-tok`, section: 'wallet', tokens: 600, costResets: 3, label: '600 Tokens' });
  return out;
}

export const TALENT_RESPEC_RESETS = 1;
export const dayNumber = (now: number) => Math.floor(now / 86400000);
/** Weeks run Monday 00:00 UTC to Monday (1 Jan 1970 was a Thursday). */
export const weekNumber = (now: number) => Math.floor((dayNumber(now) + 3) / 7);
export const weekStart = (week: number) => (week * 7 - 3) * 86400000;

// ------------------------------------------------------------------ material rewards
export const FAMILY_KEYS: Family[] = ['gemini', 'claude', 'codex', 'grok'];
/** Materials from one ranked match: a few Data Shards, and on a win a Sigil of one of your deck's classes (×2 for the featured class). */
export function matchMaterials(score: number, deckFamilies: Family[], featured: Family | null, roll = 0.5): Materials {
  const m = noMaterials();
  m.shards = score === 1 ? 2 : 1;
  if (score === 1 && deckFamilies.length) {
    // the featured class is picked whenever it's in the deck; otherwise a random deck class
    const f = featured && deckFamilies.includes(featured) ? featured : deckFamilies[Math.floor(roll * deckFamilies.length) % deckFamilies.length];
    m.sigils[f] += f === featured ? 2 : 1;
  }
  return m;
}
export const WEEKLY_CORE_WINS = 10;
export const FRIEND_SHARDS = 2, FRIEND_SHARDS_DAILY_CAP = 20;

/** Materials inside a Checkpoint. */
export function checkpointMaterials(kind: CheckpointKind, rng: () => number): Materials {
  const m = noMaterials();
  const fam = () => FAMILY_KEYS[Math.floor(rng() * FAMILY_KEYS.length)];
  if (kind === 'common') m.shards = 2;
  else if (kind === 'rare') { m.shards = 4; m.sigils[fam()] += 1; }
  else if (kind === 'epic') { m.shards = 10; m.sigils[fam()] += 3; if (rng() < 0.08) m.cores = 1; }
  else { m.shards = 25; m.sigils[fam()] += 6; m.cores = 1; }
  return m;
}
export function addMaterials(into: Materials, add: Materials) {
  into.shards += add.shards; into.cores += add.cores;
  for (const f of FAMILY_KEYS) into.sigils[f] += add.sigils[f];
}
