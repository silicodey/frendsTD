import { TOWERS, approxDps, traits } from '../data/towers';
import { FAMILIES, type Family, type TowerDef, type TowerKind } from '../data/types';

/**
 * Which towers "deserve" permanent upgrades?
 *
 * Not every one of the 48 campaign towers becomes a collectible PvP unit. Each tower is scored on
 * five things, and every family keeps the six best, chosen so the set covers all four rarity bands
 * and doesn't repeat the same attack type. The three highest-scoring units in each family become
 * Signature units: they get a special capability and a talent tree.
 *
 *   power      how hard it hits at base level, relative to its own family (log scale)
 *   tier       how far up the family's ladder it sits (rarer units are long-term investments)
 *   mergeFit   how well its attack type works on a 5×3 merge board where every unit can reach the lane
 *   depth      how many distinct mechanics it has (slow, stun, crit, chain…): more hooks for talents
 *   identity   how unusual its attack type is within its family
 *
 * Income towers are excluded: in a merge duel compute comes from kills, so they have nothing to do.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_INFO: Record<Rarity, { name: string; css: string; color: number; startLevel: number; power: number }> = {
  common: { name: 'Common', css: '#b8c4d8', color: 0xb8c4d8, startLevel: 1, power: 1.0 },
  rare: { name: 'Rare', css: '#4fa8ff', color: 0x4fa8ff, startLevel: 3, power: 1.12 },
  epic: { name: 'Epic', css: '#c56bff', color: 0xc56bff, startLevel: 5, power: 1.25 },
  legendary: { name: 'Legendary', css: '#ffb83d', color: 0xffb83d, startLevel: 7, power: 1.4 },
};

export function rarityOfTier(tier: number): Rarity {
  return tier <= 3 ? 'common' : tier <= 6 ? 'rare' : tier <= 9 ? 'epic' : 'legendary';
}

const MERGE_FIT: Record<TowerKind, number> = {
  bullet: 0.85, beam: 1.0, lob: 0.8, chain: 1.0, sniper: 0.85, rail: 0.95, nova: 0.75,
  aura: 0.6, support: 0.7, income: 0, drone: 0.9, strike: 1.0,
};

export interface Merit { power: number; tier: number; mergeFit: number; depth: number; identity: number; total: number }

const W = { power: 0.3, tier: 0.25, mergeFit: 0.2, depth: 0.15, identity: 0.1 };

export function merit(def: TowerDef): Merit {
  const fam = TOWERS.filter((t) => t.family === def.family && t.kind !== 'income');
  const maxDps = Math.max(...fam.map((t) => approxDps(t)));
  const dps = def.kind === 'support' ? maxDps * 0.35 : approxDps(def); // supports are valued by what they enable
  const power = Math.log(1 + dps) / Math.log(1 + maxDps);
  const tier = def.tier / 12;
  const mergeFit = MERGE_FIT[def.kind];
  const depth = Math.min(1, traits(def).filter((x) => x !== 'Ground only').length / 4);
  const sameKind = fam.filter((t) => t.kind === def.kind).length;
  const identity = 1 - (sameKind - 1) / (fam.length - 1);
  const total = W.power * power + W.tier * tier + W.mergeFit * mergeFit + W.depth * depth + W.identity * identity;
  return { power, tier, mergeFit, depth, identity, total };
}

export const PER_FAMILY = 6;
export const SIGNATURES_PER_FAMILY = 3;
const KIND_REPEAT_PENALTY = 0.12;

/** Picks each family's PvP units: the best of each rarity band first, then the best of the rest. */
export function selectRoster(): { family: Family; units: TowerDef[]; signatures: TowerDef[] }[] {
  return FAMILIES.map((family) => {
    const pool = TOWERS.filter((t) => t.family === family && t.kind !== 'income');
    const picked: TowerDef[] = [];
    const score = (t: TowerDef) => merit(t).total - KIND_REPEAT_PENALTY * picked.filter((p) => p.kind === t.kind).length;
    const best = (list: TowerDef[]) => list.reduce((a, b) => (score(b) > score(a) ? b : a));
    for (const r of RARITIES) {
      const band = pool.filter((t) => rarityOfTier(t.tier) === r && !picked.includes(t));
      if (band.length) picked.push(best(band));
    }
    while (picked.length < PER_FAMILY) picked.push(best(pool.filter((t) => !picked.includes(t))));
    picked.sort((a, b) => a.tier - b.tier);
    const signatures = [...picked].sort((a, b) => merit(b).total - merit(a).total).slice(0, SIGNATURES_PER_FAMILY);
    return { family, units: picked, signatures };
  });
}

const SELECTED = selectRoster();
export const PVP_UNITS: TowerDef[] = SELECTED.flatMap((f) => f.units);
export const PVP_IDS = new Set(PVP_UNITS.map((t) => t.id));
export const SIGNATURE_IDS = new Set(SELECTED.flatMap((f) => f.signatures.map((t) => t.id)));
export const isSignature = (id: string) => SIGNATURE_IDS.has(id);
export const rarityOf = (def: TowerDef): Rarity => rarityOfTier(def.tier);
