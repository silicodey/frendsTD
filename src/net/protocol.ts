import { MAX_CARD_LEVEL, startLevel } from '../pvp/economy';
import type { DeckCard, PlayerSetup, PvpMatch } from '../pvp/match';
import { PVP_IDS } from '../pvp/roster';
import { TALENT_LEVELS, isSignatureId } from '../pvp/signatures';

/**
 * Online duels: deterministic lockstep with the server as clock, relay and referee.
 *
 * Both phones and the server build the same PvpMatch from the same seed and decks, then advance it in
 * fixed 1/60 s ticks. A player's tap becomes a command; the server stamps it with the tick it takes effect
 * (a few ticks ahead, to cover network latency) and relays it to both players, along with "everything up
 * to tick N is final". Each side may only simulate up to that tick, so both sides always see the same
 * inputs at the same moments and stay identical. The server runs its own copy to decide the winner and
 * compares state hashes to catch any divergence.
 */

/** Bump whenever game rules, balance or this protocol change: mismatched clients are turned away. */
export const PROTO = 1;
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const DT = 1 / TICK_HZ;
/** Commands take effect this many ticks after the server receives them (150 ms). */
export const INPUT_DELAY = 9;
/** Lobby → match: the shared countdown once both players are ready. */
export const COUNTDOWN_MS = 5000;
/** Players send a state hash this often (ticks) so the server can spot a divergence. */
export const HASH_EVERY = 120;
/** How long a dropped player's seat is held mid-match before they forfeit. */
export const RECONNECT_GRACE_MS = 30000;
export const NAME_MAX = 16;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_LEN = 4;

export type Cmd =
  | { k: 's' } // summon
  | { k: 'p'; i: number } // power up deck slot i
  | { k: 'm'; a: number; b: number } // merge tower a onto tower b
  | { k: 'f' }; // forfeit

export interface TimedCmd { tick: number; side: number; c: Cmd }

export interface LobbyPlayer { name: string; ready: boolean; connected: boolean; deck: DeckCard[] }
export interface StartInfo { startAt: number; seed: number; theme: number; setups: [PlayerSetup, PlayerSetup] }

/** Server → client messages. */
export type ServerMsg =
  | { t: 'welcome'; proto: number; now: number }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; code: string; msg: string }
  | { t: 'room'; code: string; you: number; token: string }
  | { t: 'lobby'; code: string; state: 'lobby' | 'countdown' | 'playing' | 'ended'; players: (LobbyPlayer | null)[] }
  | { t: 'start'; info: StartInfo }
  | { t: 'turn'; upto: number; cmds: TimedCmd[] }
  | { t: 'sync'; info: StartInfo; upto: number; cmds: TimedCmd[] }
  | { t: 'peer'; side: number; connected: boolean; graceMs?: number }
  | { t: 'desync'; tick: number }
  | { t: 'end'; winner: number; tick: number; reason: string };

/** Client → server messages. */
export type ClientMsg =
  | { t: 'hello'; proto: number; name: string; deck: DeckCard[] }
  | { t: 'ping'; c: number }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'resume'; code: string; token: string }
  | { t: 'ready'; on: boolean }
  | { t: 'leave' }
  | { t: 'cmd'; c: Cmd }
  | { t: 'hash'; tick: number; h: number };

// ------------------------------------------------------------------ validation (the server trusts nothing)
const int = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi ? x : null);

export function cleanCmd(x: unknown): Cmd | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  switch (o.k) {
    case 's': return { k: 's' };
    case 'f': return { k: 'f' };
    case 'p': { const i = int(o.i, 0, 4); return i === null ? null : { k: 'p', i }; }
    case 'm': {
      const a = int(o.a, 1, 1e9), b = int(o.b, 1, 1e9);
      return a === null || b === null || a === b ? null : { k: 'm', a, b };
    }
    default: return null;
  }
}

export function cleanName(x: unknown): string {
  const s = typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f<>&"]/g, '').trim().slice(0, NAME_MAX) : '';
  return s || 'Player';
}

/** A deck of 5 distinct duel units at legal levels with talents only where unlocked. */
export function cleanDeck(x: unknown): DeckCard[] | null {
  if (!Array.isArray(x) || x.length !== 5) return null;
  const out: DeckCard[] = [];
  for (const c of x) {
    if (!c || typeof c !== 'object') return null;
    const o = c as Record<string, unknown>;
    if (typeof o.id !== 'string' || !PVP_IDS.has(o.id) || out.some((d) => d.id === o.id)) return null;
    const level = int(o.level, startLevel(o.id), MAX_CARD_LEVEL);
    if (level === null) return null;
    const raw = Array.isArray(o.talents) ? o.talents : [];
    const talents = TALENT_LEVELS.map((L, i) => (isSignatureId(o.id as string) && level >= L && (raw[i] === 0 || raw[i] === 1) ? (raw[i] as number) : -1));
    out.push({ id: o.id, level, talents });
  }
  return out;
}

export function cleanCode(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = x.trim().toUpperCase();
  return s.length === ROOM_LEN && [...s].every((ch) => ROOM_ALPHABET.includes(ch)) ? s : null;
}

// ------------------------------------------------------------------ applying commands
/** Apply one command for a side. Invalid ones (not enough compute, a unit already merged) do nothing, identically everywhere. */
export function applyCmd(m: PvpMatch, side: number, c: Cmd): boolean {
  if (m.ended) return false;
  switch (c.k) {
    case 's': return !!m.summon(side);
    case 'p': return m.powerUp(side, c.i);
    case 'f': m.forfeit(side); return true;
    case 'm': {
      const a = m.sim.towers.find((t) => t.id === c.a), b = m.sim.towers.find((t) => t.id === c.b);
      if (!a || !b || a.side !== side || b.side !== side) return false;
      return !!m.merge(a, b);
    }
  }
}

/** Advances a match tick by tick, applying the commands stamped for each tick first. */
export class Lockstep {
  tick = 0;
  constructor(public match: PvpMatch, private source: (tick: number) => TimedCmd[] | undefined) {}

  step() {
    const cs = this.source(this.tick);
    if (cs) for (const tc of cs) applyCmd(this.match, tc.side, tc.c);
    this.match.step(DT);
    this.tick++;
  }
}

// ------------------------------------------------------------------ state hash
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);

/** FNV-1a over the exact bits of the state that matters, so any divergence shows up. */
export function matchHash(m: PvpMatch): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => { h ^= n >>> 0; h = Math.imul(h, 0x01000193); };
  const num = (x: number) => { f64[0] = x; mix(u32[0]); mix(u32[1]); };
  num(m.time); mix(m.wave);
  for (const s of m.sides) { num(s.compute); mix(s.hearts); mix(s.summons); for (const p of s.power) mix(p); }
  for (const t of m.sim.towers) { mix(t.id); mix(t.rank); mix(t.c); mix(t.r); num(t.cd); }
  for (const e of m.sim.enemies) { if (!e.alive) continue; mix(e.id); num(e.hp); num(e.dist); }
  return h >>> 0;
}

export function randomCode(rng: () => number = Math.random) {
  let s = '';
  for (let i = 0; i < ROOM_LEN; i++) s += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)];
  return s;
}
