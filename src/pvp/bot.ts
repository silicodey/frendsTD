import { mulberry32 } from '../data/levels';
import type { Tower } from '../sim/sim';
import { MAX_POWER, type PvpMatch } from './match';

/**
 * An AI rival. It plays through the same actions a human has (summon, merge, power up) and only sees
 * its own side. `skill` (0..1) sets how quickly it reacts and how sensibly it spends.
 */
export class PvpBot {
  private t = 0;
  private rng: () => number;

  constructor(private match: PvpMatch, public side: number, public skill = 0.6, seed = 1) {
    this.rng = mulberry32(seed * 31 + side);
  }

  update(dt: number) {
    const m = this.match;
    if (m.ended) return;
    this.t -= dt;
    if (this.t > 0) return;
    // slower, jittery reactions at low skill
    this.t = (1.2 - 0.85 * this.skill) * (0.7 + this.rng() * 0.6);
    this.act();
  }

  /** One decision. Returns what it did (for tests). */
  act(): 'summon' | 'merge' | 'power' | null {
    const m = this.match, side = this.side, s = m.sides[side];
    const units = m.units(side);
    const full = m.freeSlots(side).length === 0;
    const summonCost = m.summonCost(side);

    // pairs of identical units, lowest rank first
    const pairs: [Tower, Tower][] = [];
    const seen = new Map<string, Tower>();
    for (const u of [...units].sort((a, b) => a.rank - b.rank)) {
      const k = `${u.ext.deck}:${u.rank}`;
      const o = seen.get(k);
      if (o && m.canMerge(o, u)) { pairs.push([o, u]); seen.delete(k); } else seen.set(k, u);
    }

    // the most valuable unit type on the board is the one worth powering up
    const weight = s.deck.map((_, i) => units.filter((u) => u.ext.deck === i).reduce((a, u) => a + Math.pow(1.85, u.rank - 1), 0));
    let bestType = 0;
    weight.forEach((w, i) => { if (w > weight[bestType] && s.power[i] < MAX_POWER) bestType = i; });
    const powerCost = s.power[bestType] < MAX_POWER ? m.powerCost(side, bestType) : Infinity;

    // 1. power up when it's the better deal (late game, or the board is full)
    const wantPower = s.compute >= powerCost && (full || powerCost <= summonCost * (1.6 + this.skill * 1.4)) && weight[bestType] >= 2;
    if (wantPower && this.rng() < 0.4 + this.skill * 0.6) { if (m.powerUp(side, bestType)) return 'power'; }

    // 2. summon while there is room
    if (!full && s.compute >= summonCost) { if (m.summon(side)) return 'summon'; }

    // 3. merge: always when the board is full, otherwise sometimes, to climb ranks
    const nearlyFull = m.freeSlots(side).length <= 1 && s.compute < summonCost;
    if (pairs.length && (full || (nearlyFull && this.rng() < this.skill))) {
      // a skilled bot avoids merging away its support units
      const pick = this.skill > 0.5 ? pairs.find(([a]) => a.def.kind !== 'support') ?? pairs[0] : pairs[Math.floor(this.rng() * pairs.length)];
      if (m.merge(pick[0], pick[1])) return 'merge';
    }

    // 4. full board, no pairs: power up anything affordable
    if (full && s.compute >= powerCost) { if (m.powerUp(side, bestType)) return 'power'; }
    return null;
  }
}
