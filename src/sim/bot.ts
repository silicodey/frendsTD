import { TOWER_BY_ID, approxDps, statsAt, upgradeCost, MAX_LEVEL } from '../data/towers';
import type { TowerDef } from '../data/types';
import { CELL_FREE, Sim, type Tower } from './sim';

/**
 * A simple greedy auto-player. Used for headless balance checks and for the
 * attract-mode battle behind the title screen.
 */
export class Bot {
  private samples: [number, number][] = [];
  private think = 0;
  skill: number;

  constructor(private sim: Sim, private loadout: string[], skill = 1) {
    this.skill = skill;
    for (const p of sim.paths) {
      for (let d = 0; d < p.length; d += 0.5) {
        let i = 0;
        while (i < p.cum.length - 2 && p.cum[i + 1] < d) i++;
        const l = p.cum[i + 1] - p.cum[i] || 1, t = (d - p.cum[i]) / l;
        this.samples.push([p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t, p.zs[i] + (p.zs[i + 1] - p.zs[i]) * t]);
      }
    }
  }

  private coverage(x: number, z: number, range: number): number {
    if (range >= 50) return 12;
    let n = 0;
    const rr = range * range;
    for (const [sx, sz] of this.samples) if ((sx - x) ** 2 + (sz - z) ** 2 <= rr) n++;
    return n * 0.5; // tiles of path covered
  }

  private towerValue(def: TowerDef, level: number, x: number, z: number, self: Tower | null): number {
    const sim = this.sim;
    const st = statsAt(def, level);
    const wavesLeft = sim.waves.length - 1 - sim.waveIdx;
    if (def.kind === 'income') {
      const have = sim.towers.filter((t) => t.def.kind === 'income').length;
      if (!self && have >= 2) return 0;
      return ((def.income ?? 0) * st.aux * Math.max(0, wavesLeft - 2)) * 0.11;
    }
    if (def.kind === 'support') {
      let sum = 0;
      for (const t of sim.towers) {
        if (t === self || t.def.kind === 'support' || t.def.kind === 'income') continue;
        if (Math.hypot(t.x - x, t.z - z) > st.range) continue;
        const cov = Math.min(6, this.coverage(t.x, t.z, t.stats.range));
        const b = def.buff!;
        const gain = (b.dmg ?? 0) + (b.rate ?? 0) + (b.range ?? 0) * 0.6 + (b.crit ?? 0);
        sum += approxDps(t.def, t.level) * cov * gain * st.aux;
      }
      // don't duplicate the same support in the same spot
      for (const t of sim.towers) if (t !== self && t.def.id === def.id && Math.hypot(t.x - x, t.z - z) < st.range) sum *= 0.2;
      return sum;
    }
    const cov = Math.min(def.kind === 'aura' || def.kind === 'nova' ? 9 : 6.5, this.coverage(x, z, st.range));
    let v = approxDps(def, level) * cov;
    if (def.kind === 'aura') {
      // control value: scales with nearby firepower
      let near = 0;
      for (const t of sim.towers) if (t !== self && Math.hypot(t.x - x, t.z - z) < st.range + 1.5) near += approxDps(t.def, t.level);
      v += near * cov * ((def.slow?.[0] ?? 0) * 0.9 + (def.vuln ?? 0));
      for (const t of sim.towers) if (t !== self && t.def.kind === 'aura' && Math.hypot(t.x - x, t.z - z) < st.range) v *= 0.35;
    }
    if (def.stun) v *= 1.25;
    if (def.pull) v *= 1.4;
    return v;
  }

  /** Called every sim step; makes at most one purchase per think interval. */
  update(dt: number) {
    const sim = this.sim;
    if (sim.state === 'won' || sim.state === 'lost') return;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = 0.4;

    for (let guard = 0; guard < 6; guard++) {
      let best: { v: number; cost: number; act: () => void } | null = null;
      let bestAny = 0, bestAnyCost = 0;
      const consider = (v: number, cost: number, act: () => void) => {
        const eff = v / cost;
        if (eff > bestAny) { bestAny = eff; bestAnyCost = cost; }
        if (cost <= sim.tokens && (!best || eff > best.v)) best = { v: eff, cost, act };
      };
      // new towers
      for (const id of this.loadout) {
        const def = TOWER_BY_ID[id];
        if (!def) continue;
        let bv = 0, bc = -1, br = -1;
        for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
          if (sim.grid[r * sim.cols + c] !== CELL_FREE || sim.towerAt(c, r)) continue;
          const v = this.towerValue(def, 1, sim.cellX(c), sim.cellZ(r), null) * (1 + sim.rng() * 0.05 * (2 - this.skill));
          if (v > bv) { bv = v; bc = c; br = r; }
        }
        if (bc >= 0) consider(bv, def.cost, () => sim.build(id, bc, br));
      }
      // upgrades
      for (const t of sim.towers) {
        if (t.level >= MAX_LEVEL) continue;
        const cost = upgradeCost(t.def, t.level);
        const v = this.towerValue(t.def, t.level + 1, t.x, t.z, t) - this.towerValue(t.def, t.level, t.x, t.z, t);
        consider(v * 1.05, cost, () => sim.upgrade(t));
      }
      const b = best as { v: number; cost: number; act: () => void } | null;
      if (!b) break;
      // save up for something clearly better that is nearly affordable
      if (bestAny > b.v * 1.35 && bestAnyCost <= sim.tokens * 1.6 && sim.state !== 'build') break;
      b.act();
    }
    if (sim.state === 'build') sim.startWave();
  }
}
