import { FAMILY_INFO, type Family } from '../data/types';
import { dayNumber, weekNumber, weekStart } from './economy';

/**
 * Weekly class perks: each week (Monday 00:00 UTC → Monday) one class gets a boost in every duel.
 * Effects are data, so new perks can be scheduled without new code: pick a class and one effect kind.
 * The online server decides the perk for each match and sends the whole perk with it, so both players
 * always play the same rules even if one phone's schedule is out of date.
 */
export type PerkEffect =
  | { kind: 'critDmg'; amount: number } // crit damage ×(1 + amount) for the class's units
  | { kind: 'dmg'; amount: number } // +amount damage
  | { kind: 'rate'; amount: number } // +amount attack speed
  | { kind: 'mergeSpawn'; r1: number; r2: number } // merging class units may also summon a random rank-1 (r1) or rank-2 (r2) unit
  | { kind: 'startRank'; chance: number } // summoned class units may arrive at rank 2
  | { kind: 'powerDiscount'; amount: number } // power-ups for the class cost less
  | { kind: 'shieldStart' } // class units arrive with a Shield charge
  | { kind: 'supportAura'; amount: number }; // the class's Support auras are stronger

export interface WeeklyPerk { id: string; family: Family; effect: PerkEffect }

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Player-facing line, e.g. "London · +3% crit damage". */
export function perkText(p: WeeklyPerk): { title: string; desc: string } {
  const f = FAMILY_INFO[p.family].name, e = p.effect;
  switch (e.kind) {
    case 'critDmg': return { title: `+${pct(e.amount)} crit damage`, desc: `${f} units deal ${pct(e.amount)} more damage when they crit.` };
    case 'dmg': return { title: `+${pct(e.amount)} damage`, desc: `${f} units deal ${pct(e.amount)} more damage.` };
    case 'rate': return { title: `+${pct(e.amount)} attack speed`, desc: `${f} units attack ${pct(e.amount)} faster.` };
    case 'mergeSpawn': return { title: 'Merge bonus', desc: `Merging ${f} units has a ${pct(e.r1)} chance to also summon a random rank-1 unit, and ${pct(e.r2)} for a rank-2 unit.` };
    case 'startRank': return { title: 'Strong arrivals', desc: `Summoned ${f} units have a ${pct(e.chance)} chance to arrive at rank 2.` };
    case 'powerDiscount': return { title: `Power-ups −${pct(e.amount)}`, desc: `Power-ups for ${f} units cost ${pct(e.amount)} less.` };
    case 'shieldStart': return { title: 'Arrive shielded', desc: `${f} units arrive with a Shield charge that blocks one disruption.` };
    case 'supportAura': return { title: `Support auras +${pct(e.amount)}`, desc: `${f} Support units' auras are ${pct(e.amount)} stronger.` };
  }
}

const weekOf = (iso: string) => weekNumber(Date.parse(`${iso}T12:00:00Z`));

/** Weeks scheduled by hand (keys are week numbers; use weekOf('YYYY-MM-DD') with that week's Monday). */
const SCHEDULE: Record<number, WeeklyPerk> = {
  [weekOf('2026-11-16')]: { id: 'w2026-11-16', family: 'gemini', effect: { kind: 'critDmg', amount: 0.03 } },
  [weekOf('2026-11-23')]: { id: 'w2026-11-23', family: 'claude', effect: { kind: 'mergeSpawn', r1: 0.15, r2: 0.05 } },
};

/** Every other week rotates through classes and effects. */
const ROTATION: Omit<WeeklyPerk, 'id'>[] = [
  { family: 'codex', effect: { kind: 'startRank', chance: 0.12 } },
  { family: 'grok', effect: { kind: 'critDmg', amount: 0.05 } },
  { family: 'gemini', effect: { kind: 'rate', amount: 0.06 } },
  { family: 'claude', effect: { kind: 'supportAura', amount: 0.15 } },
  { family: 'codex', effect: { kind: 'powerDiscount', amount: 0.15 } },
  { family: 'grok', effect: { kind: 'shieldStart' } },
  { family: 'gemini', effect: { kind: 'mergeSpawn', r1: 0.12, r2: 0.04 } },
  { family: 'claude', effect: { kind: 'dmg', amount: 0.05 } },
];

let overrides: Record<number, WeeklyPerk> = {};

/** Perks from the server's /config, keyed by "YYYY-MM-DD" (the Monday). Invalid entries are ignored. */
export function setPerkOverrides(raw: unknown) {
  const out: Record<number, WeeklyPerk> = {};
  if (raw && typeof raw === 'object') {
    for (const [date, v] of Object.entries(raw as Record<string, unknown>)) {
      const p = cleanPerk(v);
      if (p && /^\d{4}-\d{2}-\d{2}$/.test(date)) out[weekOf(date)] = { ...p, id: p.id || `w${date}` };
    }
  }
  overrides = out;
}

export function perkForWeek(week: number): WeeklyPerk {
  const p = overrides[week] ?? SCHEDULE[week];
  if (p) return p;
  const r = ROTATION[((week % ROTATION.length) + ROTATION.length) % ROTATION.length];
  return { id: `w${week}`, ...r };
}

export const currentPerk = (now: number) => perkForWeek(weekNumber(now));
/** Seconds until this week's perk ends. */
export const perkEndsIn = (now: number) => Math.max(0, (weekStart(weekNumber(now) + 1) - now) / 1000);
export const perkDay = dayNumber;

const FAMS: Family[] = ['gemini', 'claude', 'codex', 'grok'];
const num = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null);

/** Validate a perk (from the network or a config file): known class and effect, amounts within sane bounds. */
export function cleanPerk(x: unknown): WeeklyPerk | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  // a class can be named by its internal key or its display name ("grok" or "Tokyo")
  const fam = typeof o.family === 'string' ? o.family.toLowerCase() : '';
  const family = FAMS.find((f) => f === fam || FAMILY_INFO[f].name.toLowerCase() === fam);
  const e = o.effect as Record<string, unknown> | undefined;
  if (!family || !e || typeof e !== 'object') return null;
  const id = typeof o.id === 'string' ? o.id.slice(0, 40) : '';
  let effect: PerkEffect | null = null;
  switch (e.kind) {
    case 'critDmg': case 'dmg': case 'rate': case 'powerDiscount': case 'supportAura': {
      const a = num(e.amount, 0, e.kind === 'powerDiscount' ? 0.5 : 0.5);
      if (a !== null) effect = { kind: e.kind, amount: a };
      break;
    }
    case 'mergeSpawn': { const r1 = num(e.r1, 0, 0.5), r2 = num(e.r2, 0, 0.25); if (r1 !== null && r2 !== null) effect = { kind: 'mergeSpawn', r1, r2 }; break; }
    case 'startRank': { const c = num(e.chance, 0, 0.5); if (c !== null) effect = { kind: 'startRank', chance: c }; break; }
    case 'shieldStart': effect = { kind: 'shieldStart' }; break;
  }
  return effect ? { id, family, effect } : null;
}
