import { TOWER_BY_ID } from '../data/towers';
import {
  LIMIT_MAX, MAX_CARD_LEVEL, TALENT_RESPEC_RESETS, arenaFor, dailyOffers, dayNumber, eloDelta, matchTokens, matchUsage,
  openCheckpoint, rollCheckpoint, startLevel, tickLimits, upgradeCost, upgradeUsage, usageLevel, usageReward, unitsUpTo,
  type CheckpointLoot, type LimitState, type Offer,
} from './economy';
import { PVP_IDS } from './roster';
import { TALENT_LEVELS, isSignatureId } from './signatures';
import type { DeckCard } from './match';

export const DECK_SIZE = 5;
export const STARTER_DECK = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'cl_thinking'];

export interface CardState { level: number; weights: number }

export interface PvpProfile {
  v: 1;
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
}

export function newProfile(now: number): PvpProfile {
  const cards: Record<string, CardState> = {};
  for (const id of STARTER_DECK) cards[id] = { level: startLevel(id), weights: 0 };
  return {
    v: 1, tokens: 300, resets: 5, usage: 0, usageLevelPaid: 1, limits: { n: LIMIT_MAX, t: now }, elo: 0, bestElo: 0,
    cards, talents: {}, deck: [...STARTER_DECK], wins: 0, losses: 0, draws: 0, streak: 0, winsSinceEpic: 0, bought: {}, matches: 0, seenArena: 0,
  };
}

/** Repair anything a stale or hand-edited save could break. */
export function sanitize(p: PvpProfile, now: number): PvpProfile {
  const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  p.tokens = Math.max(0, n(p.tokens, 300)); p.resets = Math.max(0, n(p.resets, 5)); p.usage = Math.max(0, n(p.usage, 0));
  p.usageLevelPaid = Math.max(1, n(p.usageLevelPaid, 1)); p.elo = Math.max(0, n(p.elo, 0)); p.bestElo = Math.max(p.elo, n(p.bestElo, 0));
  p.limits = { n: Math.min(LIMIT_MAX, Math.max(0, n(p.limits?.n, LIMIT_MAX))), t: Math.min(now, n(p.limits?.t, now)) };
  p.cards ??= {}; p.talents ??= {}; p.bought ??= {};
  for (const id of Object.keys(p.cards)) {
    if (!PVP_IDS.has(id)) { delete p.cards[id]; continue; }
    const c = p.cards[id];
    c.level = Math.min(MAX_CARD_LEVEL, Math.max(startLevel(id), Math.round(n(c.level, startLevel(id)))));
    c.weights = Math.max(0, Math.round(n(c.weights, 0)));
  }
  for (const id of STARTER_DECK) p.cards[id] ??= { level: startLevel(id), weights: 0 };
  const deck = (Array.isArray(p.deck) ? p.deck : []).filter((id, i, a) => p.cards[id] && a.indexOf(id) === i).slice(0, DECK_SIZE);
  for (const id of [...STARTER_DECK, ...Object.keys(p.cards)]) if (deck.length < DECK_SIZE && !deck.includes(id)) deck.push(id);
  p.deck = deck;
  for (const k of ['wins', 'losses', 'draws', 'streak', 'winsSinceEpic', 'matches', 'seenArena'] as const) p[k] = Math.max(0, n(p[k], 0));
  return p;
}

// ------------------------------------------------------------------ queries
export const owned = (p: PvpProfile, id: string) => !!p.cards[id];
export function deckCards(p: PvpProfile): DeckCard[] {
  return p.deck.map((id) => ({ id, level: p.cards[id]?.level ?? startLevel(id), talents: p.talents[id] ?? [-1, -1, -1, -1] }));
}
export const arenaOf = (p: PvpProfile) => arenaFor(p.elo);
export function limits(p: PvpProfile, now: number) { p.limits = tickLimits(p.limits, now); return p.limits; }

export function canUpgrade(p: PvpProfile, id: string): 'ok' | 'max' | 'weights' | 'tokens' | 'locked' {
  const c = p.cards[id];
  if (!c) return 'locked';
  const cost = upgradeCost(id, c.level);
  if (!cost) return 'max';
  if (c.weights < cost.weights) return 'weights';
  if (p.tokens < cost.tokens) return 'tokens';
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
  const xp = upgradeUsage(id, c.level);
  return { level: c.level, usage: xp, reached: addUsage(p, xp, now) };
}

/** Pick (or change) a talent. The first choice in a tier is free; changing it costs Resets. */
export function chooseTalent(p: PvpProfile, id: string, tier: number, option: number): 'ok' | 'locked' | 'resets' | 'same' {
  if (!isSignatureId(id) || !p.cards[id]) return 'locked';
  if (p.cards[id].level < TALENT_LEVELS[tier]) return 'locked';
  const picks = (p.talents[id] ??= [-1, -1, -1, -1]);
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
}

/** Settle a ranked match: rating, Tokens, Usage and (on a win) a Checkpoint. */
export function settleMatch(p: PvpProfile, score: number, rivalElo: number, rng: () => number, now: number): MatchResult {
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
  let checkpoint: CheckpointLoot | null = null;
  const unlocked: string[] = [];
  if (score === 1) {
    const kind = rollCheckpoint(rng, p.winsSinceEpic);
    p.winsSinceEpic = kind === 'epic' || kind === 'legendary' ? 0 : p.winsSinceEpic + 1;
    checkpoint = openCheckpoint(kind, arenaOf(p).id, rng);
    p.tokens += checkpoint.tokens;
    for (const w of checkpoint.weights) if (grantWeights(p, w.id, w.n)) unlocked.push(w.id);
  }
  return { score, elo, tokens, usage, reached, checkpoint, unlocked, arenaUp: arenaOf(p).id > arenaBefore };
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
