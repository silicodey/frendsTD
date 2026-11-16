import { TOWER_BY_ID } from '../data/towers';
import {
  FRIEND_SHARDS, FRIEND_SHARDS_DAILY_CAP, LIMIT_MAX, MAX_CARD_LEVEL, TALENT_RESPEC_RESETS, WEEKLY_CORE_WINS, addMaterials, arenaFor,
  dailyOffers, dayNumber, eloDelta, matchMaterials, matchTokens, matchUsage, noMaterials, openCheckpoint, rollCheckpoint, startLevel,
  tickLimits, upgradeCost, upgradeUsage, usageLevel, usageReward, unitsUpTo, weekNumber,
  type CheckpointLoot, type LimitState, type Materials, type Offer,
} from './economy';
import { PVP_IDS } from './roster';
import { TOWER_BY_ID as TOWERS_ALL } from '../data/towers';
import type { Family } from '../data/types';
import { TALENT_LEVELS } from './signatures';
import { hasSpecialities } from './specialities';
import { CRIT_DMG_MAX, CRIT_DMG_START, type DeckCard } from './match';

export const DECK_SIZE = 5;
export const STARTER_DECK = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'cl_thinking'];

export interface CardState { level: number; weights: number }

export interface PvpProfile {
  v: 2;
  tokens: number;
  resets: number;
  usage: number; // lifetime Usage XP
  usageLevelPaid: number; // highest Usage level already rewarded
  limits: LimitState;
  elo: number;
  bestElo: number;
  cards: Record<string, CardState>;
  talents: Record<string, number[]>; // per signature unit: chosen option per tier (-1 = not chosen)
  deck: string[];
  wins: number; losses: number; draws: number; streak: number; winsSinceEpic: number;
  bought: Record<string, number>; // shop offer key → day bought
  matches: number;
  seenArena: number;
  coached?: boolean; // the first-duel coach has been shown
  name?: string; // shown to friends in online duels
  mats: Materials; // Data Shards, Class Sigils, Neural Cores
  week: number; weekWins: number; // first WEEKLY_CORE_WINS wins each week pay a Neural Core
  friendDay: number; friendShards: number; // friend duels pay a few Shards a day
  /** Set once when an old save was converted to the 1–10 level scale (the game says so once). */
  migrated?: boolean;
}

/** Old (1–15) card level → new (1–10) scale, never below the rarity's new start. */
export const migrateLevel = (id: string, old: number) => Math.min(MAX_CARD_LEVEL, Math.max(startLevel(id), Math.round(1 + (old - 1) * 9 / 14)));

export function newProfile(now: number): PvpProfile {
  const cards: Record<string, CardState> = {};
  for (const id of STARTER_DECK) cards[id] = { level: startLevel(id), weights: 0 };
  return {
    v: 2, tokens: 300, resets: 5, usage: 0, usageLevelPaid: 1, limits: { n: LIMIT_MAX, t: now }, elo: 0, bestElo: 0,
    cards, talents: {}, deck: [...STARTER_DECK], wins: 0, losses: 0, draws: 0, streak: 0, winsSinceEpic: 0, bought: {}, matches: 0, seenArena: 0,
    mats: { ...noMaterials(), shards: 20 }, week: weekNumber(now), weekWins: 0, friendDay: 0, friendShards: 0,
  };
}

/** Repair anything a stale or hand-edited save could break. */
export function sanitize(p: PvpProfile, now: number): PvpProfile {
  const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  p.tokens = Math.max(0, n(p.tokens, 300)); p.resets = Math.max(0, n(p.resets, 5)); p.usage = Math.max(0, n(p.usage, 0));
  p.usageLevelPaid = Math.max(1, n(p.usageLevelPaid, 1)); p.elo = Math.max(0, n(p.elo, 0)); p.bestElo = Math.max(p.elo, n(p.bestElo, 0));
  p.limits = { n: Math.min(LIMIT_MAX, Math.max(0, n(p.limits?.n, LIMIT_MAX))), t: Math.min(now, n(p.limits?.t, now)) };
  p.cards ??= {}; p.talents ??= {}; p.bought ??= {};
  // v1 → v2: card levels 1–15 become 1–10, talents become specialities (re-picked for free), a welcome kit of materials
  if ((p as { v: number }).v !== 2) {
    for (const [id, c] of Object.entries(p.cards)) if (PVP_IDS.has(id) && typeof c?.level === 'number') c.level = migrateLevel(id, c.level);
    p.talents = {};
    p.mats = { shards: 50, cores: 1, sigils: { gemini: 10, claude: 10, codex: 10, grok: 10 } };
    p.v = 2;
    p.migrated = true;
  }
  const m = p.mats ?? noMaterials();
  p.mats = { shards: Math.max(0, n(m.shards, 0)), cores: Math.max(0, n(m.cores, 0)), sigils: { gemini: 0, claude: 0, codex: 0, grok: 0 } };
  for (const f of Object.keys(p.mats.sigils) as Family[]) p.mats.sigils[f] = Math.max(0, n(m.sigils?.[f], 0));
  p.week = n(p.week, weekNumber(now)); p.weekWins = Math.max(0, n(p.weekWins, 0));
  p.friendDay = n(p.friendDay, 0); p.friendShards = Math.max(0, n(p.friendShards, 0));
  for (const id of Object.keys(p.cards)) {
    if (!PVP_IDS.has(id)) {
      // a unit that left the duel roster: pay its value back in Tokens
      const c = p.cards[id];
      if (TOWERS_ALL[id]) p.tokens += 150 * Math.max(0, n(c?.level, 1) - 1) + 8 * Math.max(0, n(c?.weights, 0)) + 100;
      delete p.cards[id];
      continue;
    }
    const c = p.cards[id];
    c.level = Math.min(MAX_CARD_LEVEL, Math.max(startLevel(id), Math.round(n(c.level, startLevel(id)))));
    c.weights = Math.max(0, Math.round(n(c.weights, 0)));
  }
  for (const id of STARTER_DECK) p.cards[id] ??= { level: startLevel(id), weights: 0 };
  const deck = (Array.isArray(p.deck) ? p.deck : []).filter((id, i, a) => p.cards[id] && a.indexOf(id) === i).slice(0, DECK_SIZE);
  for (const id of [...STARTER_DECK, ...Object.keys(p.cards)]) if (deck.length < DECK_SIZE && !deck.includes(id)) deck.push(id);
  p.deck = deck;
  for (const k of ['wins', 'losses', 'draws', 'streak', 'winsSinceEpic', 'matches', 'seenArena'] as const) p[k] = Math.max(0, n(p[k], 0));
  if (typeof p.name !== 'string' || !p.name.trim()) delete p.name; else p.name = p.name.trim().slice(0, 16);
  return p;
}

// ------------------------------------------------------------------ queries
export const owned = (p: PvpProfile, id: string) => !!p.cards[id];
export function deckCards(p: PvpProfile): DeckCard[] {
  return p.deck.map((id) => ({ id, level: p.cards[id]?.level ?? startLevel(id), talents: p.talents[id] ?? [-1, -1, -1] }));
}
export const arenaOf = (p: PvpProfile) => arenaFor(p.elo);
/** Account crit damage (Rush Royale style): 150% to start, +2% for every card level-up you have made. */
export function critDamageOf(p: PvpProfile): number {
  let ups = 0;
  for (const [id, c] of Object.entries(p.cards)) ups += Math.max(0, c.level - startLevel(id));
  return Math.min(CRIT_DMG_MAX, CRIT_DMG_START + 0.02 * ups);
}
export function limits(p: PvpProfile, now: number) { p.limits = tickLimits(p.limits, now); return p.limits; }

export type UpgradeBlock = 'ok' | 'max' | 'weights' | 'tokens' | 'shards' | 'sigils' | 'cores' | 'locked';
export function canUpgrade(p: PvpProfile, id: string): UpgradeBlock {
  const c = p.cards[id];
  if (!c) return 'locked';
  const cost = upgradeCost(id, c.level);
  if (!cost) return 'max';
  if (c.weights < cost.weights) return 'weights';
  if (p.tokens < cost.tokens) return 'tokens';
  if (p.mats.shards < cost.shards) return 'shards';
  if (p.mats.sigils[cost.family] < cost.sigils) return 'sigils';
  if (p.mats.cores < cost.cores) return 'cores';
  return 'ok';
}

// ------------------------------------------------------------------ actions
/** Add Usage XP; returns the Usage levels newly reached (rewards already paid into the profile). */
export function addUsage(p: PvpProfile, xp: number, now: number): number[] {
  p.usage += xp;
  const reached: number[] = [];
  const lvl = usageLevel(p.usage).level;
  while (p.usageLevelPaid < lvl) {
    p.usageLevelPaid++;
    const r = usageReward(p.usageLevelPaid);
    p.tokens += r.tokens; p.resets += r.resets;
    p.limits = { n: Math.max(p.limits.n, LIMIT_MAX), t: now }; // a new Usage tier resets your limits
    reached.push(p.usageLevelPaid);
  }
  return reached;
}

export function upgrade(p: PvpProfile, id: string, now: number): { level: number; usage: number; reached: number[] } | null {
  if (canUpgrade(p, id) !== 'ok') return null;
  const c = p.cards[id];
  const cost = upgradeCost(id, c.level)!;
  c.weights -= cost.weights; p.tokens -= cost.tokens; c.level++;
  p.mats.shards -= cost.shards; p.mats.sigils[cost.family] -= cost.sigils; p.mats.cores -= cost.cores;
  const xp = upgradeUsage(id, c.level);
  return { level: c.level, usage: xp, reached: addUsage(p, xp, now) };
}

/** Pick (or change) a talent. The first choice in a tier is free; changing it costs Resets. */
export function chooseTalent(p: PvpProfile, id: string, tier: number, option: number): 'ok' | 'locked' | 'resets' | 'same' {
  if (!hasSpecialities(id) || !p.cards[id] || tier < 0 || tier >= TALENT_LEVELS.length) return 'locked';
  if (p.cards[id].level < TALENT_LEVELS[tier]) return 'locked';
  const picks = (p.talents[id] ??= [-1, -1, -1]);
  if (picks[tier] === option) return 'same';
  if (picks[tier] !== -1) {
    if (p.resets < TALENT_RESPEC_RESETS) return 'resets';
    p.resets -= TALENT_RESPEC_RESETS;
  }
  picks[tier] = option;
  return 'ok';
}

export function setDeckSlot(p: PvpProfile, slot: number, id: string): boolean {
  if (!p.cards[id] || slot < 0 || slot >= DECK_SIZE) return false;
  const at = p.deck.indexOf(id);
  if (at >= 0) [p.deck[at], p.deck[slot]] = [p.deck[slot], p.deck[at]];
  else p.deck[slot] = id;
  return true;
}

export function spendLimit(p: PvpProfile, now: number): boolean {
  const l = limits(p, now);
  if (l.n <= 0) return false;
  p.limits = { n: l.n - 1, t: l.n >= LIMIT_MAX ? now : l.t };
  return true;
}

export function resetLimits(p: PvpProfile, now: number): boolean {
  if (p.resets < 1 || limits(p, now).n >= LIMIT_MAX) return false;
  p.resets -= 1;
  p.limits = { n: LIMIT_MAX, t: now };
  return true;
}

export function grantWeights(p: PvpProfile, id: string, n: number): boolean {
  if (!PVP_IDS.has(id) || n <= 0) return false;
  const isNew = !p.cards[id];
  if (isNew) { p.cards[id] = { level: startLevel(id), weights: Math.max(0, n - 1) }; return true; } // the first Weight unlocks the unit
  p.cards[id].weights += n;
  return false;
}

export interface MatchResult {
  score: number; elo: number; tokens: number; usage: number; reached: number[];
  checkpoint: CheckpointLoot | null; unlocked: string[]; arenaUp: boolean;
  mats: Materials; // earned from the match itself (Checkpoint materials are in checkpoint.mats)
}

/** Settle a ranked match: rating, Tokens, Usage and (on a win) a Checkpoint. */
export function settleMatch(p: PvpProfile, score: number, rivalElo: number, rng: () => number, now: number, featured: Family | null = null): MatchResult {
  const arenaBefore = arenaOf(p).id;
  const elo = eloDelta(p.elo, rivalElo, score);
  p.elo = Math.max(0, p.elo + elo);
  p.bestElo = Math.max(p.bestElo, p.elo);
  const tokens = matchTokens(arenaBefore, score);
  p.tokens += tokens;
  p.matches++;
  if (score === 1) { p.wins++; p.streak++; } else if (score === 0) { p.losses++; p.streak = 0; } else p.draws++;
  const usage = matchUsage(score);
  const reached = addUsage(p, usage, now);
  const mats = matchMaterials(score, p.deck.map((id) => TOWERS_ALL[id].family), featured);
  const wk = weekNumber(now);
  if (p.week !== wk) { p.week = wk; p.weekWins = 0; }
  if (score === 1 && p.weekWins < WEEKLY_CORE_WINS) { p.weekWins++; if (p.weekWins === WEEKLY_CORE_WINS) mats.cores += 1; }
  if (arenaOf(p).id > arenaBefore) mats.cores += 1;
  addMaterials(p.mats, mats);
  let checkpoint: CheckpointLoot | null = null;
  const unlocked: string[] = [];
  if (score === 1) {
    const kind = rollCheckpoint(rng, p.winsSinceEpic);
    p.winsSinceEpic = kind === 'epic' || kind === 'legendary' ? 0 : p.winsSinceEpic + 1;
    checkpoint = openCheckpoint(kind, arenaOf(p).id, rng);
    p.tokens += checkpoint.tokens;
    if (checkpoint.mats) addMaterials(p.mats, checkpoint.mats);
    for (const w of checkpoint.weights) if (grantWeights(p, w.id, w.n)) unlocked.push(w.id);
  }
  return { score, elo, tokens, usage, reached, checkpoint, unlocked, arenaUp: arenaOf(p).id > arenaBefore, mats };
}

/** A finished friend duel pays a few Data Shards (capped per day, so it can't be farmed). */
export function friendDuelReward(p: PvpProfile, now: number): number {
  const d = dayNumber(now);
  if (p.friendDay !== d) { p.friendDay = d; p.friendShards = 0; }
  const n = Math.min(FRIEND_SHARDS, FRIEND_SHARDS_DAILY_CAP - p.friendShards);
  if (n <= 0) return 0;
  p.friendShards += n; p.mats.shards += n;
  return n;
}

export function shopOffers(p: PvpProfile, now: number): (Offer & { sold: boolean })[] {
  const day = dayNumber(now);
  return dailyOffers(day, arenaOf(p).id).map((o) => ({ ...o, sold: o.key !== 'limits' && p.bought[o.key] === day }));
}

export function buyOffer(p: PvpProfile, key: string, now: number): 'ok' | 'tokens' | 'resets' | 'sold' | 'full' | 'gone' {
  const o = shopOffers(p, now).find((x) => x.key === key);
  if (!o) return 'gone';
  if (o.sold) return 'sold';
  if (o.key === 'limits') return resetLimits(p, now) ? 'ok' : p.resets < 1 ? 'resets' : 'full';
  if (o.costTokens && p.tokens < o.costTokens) return 'tokens';
  if (o.costResets && p.resets < o.costResets) return 'resets';
  p.tokens -= o.costTokens ?? 0; p.resets -= o.costResets ?? 0;
  if (o.id && o.weights) grantWeights(p, o.id, o.weights);
  if (o.tokens) p.tokens += o.tokens;
  p.bought[o.key] = dayNumber(now);
  return 'ok';
}

/** Units the player could own at their arena but doesn't yet. */
export const lockedInArena = (p: PvpProfile) => unitsUpTo(arenaOf(p).id).filter((id) => !p.cards[id]);
export const unitName = (id: string) => TOWER_BY_ID[id]?.name ?? id;
