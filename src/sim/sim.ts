import type { EnemyDef, Family, LevelDef, TowerDef, Wave } from '../data/types';
import { ENEMY_BY_ID } from '../data/enemies';
import { buildWaves, mulberry32 } from '../data/levels';
import { MAX_LEVEL, SELL_REFUND, TOWER_BY_ID, investedAt, statsAt, upgradeCost, type TowerStats } from '../data/towers';

export const CELL_FREE = 0, CELL_PATH = 1, CELL_BLOCKED = 2, CELL_PORTAL = 3, CELL_CORE = 4, CELL_VOID = 5;
export type TargetMode = 'first' | 'strong' | 'near' | 'last';
export const TARGET_MODES: TargetMode[] = ['first', 'strong', 'near', 'last'];
const BEAM_TICK = 0.2;
const AURA_TICK = 0.25;
export const AIR_HEIGHT = 1.5;
export const BOUNTY_EXP = 0.66;

export interface PathData {
  xs: number[]; zs: number[]; cum: number[]; length: number; air: boolean;
}

export interface Enemy {
  id: number; def: EnemyDef; hp: number; maxHp: number; shield: number; maxShield: number; shieldCd: number;
  armor: number; path: PathData; pathIdx: number; dist: number; off: number; x: number; y: number; z: number; dx: number; dz: number;
  slowPct: number; slowT: number; stunT: number; dotDps: number; dotT: number; dotSrc: Tower | null; vuln: number; vulnT: number;
  phaseT: number; phased: boolean; healT: number; jamT: number; spawnT: number; alive: boolean; bounty: number;
  hpMult: number; air: boolean; born: number; hitT: number; seg: number;
  /** Speed multiplier (duels walk a short lane, so they slow everyone down). */
  spd?: number;
  /** Duels: crowd-control immunity timers (after a stun / pull the enemy shrugs off the next one for a moment). */
  stunRes?: number; pullRes?: number;
}

export interface Drone { x: number; z: number; ang: number; cd: number; target: Enemy | null }

export interface Tower {
  id: number; def: TowerDef; c: number; r: number; x: number; z: number; level: number;
  cd: number; burstLeft: number; burstCd: number; mode: TargetMode; yaw: number; aimX: number; aimZ: number;
  targets: Enemy[]; rampTs: number[]; tickT: number; spin: number; jamT: number;
  buffDmg: number; buffRate: number; buffRange: number; buffCrit: number;
  stats: TowerStats; drones: Drone[]; kills: number; dmgDone: number; shotT: number; born: number;
  /** PvP: which player owns it, its merge rank (1–7) and free-form per-match state. */
  side: number; rank: number; ext: Record<string, number>;
}

export interface Projectile {
  id: number; lob: boolean; tower: Tower; def: TowerDef; x: number; y: number; z: number;
  sx: number; sy: number; sz: number; tx: number; ty: number; tz: number; target: Enemy | null;
  speed: number; dmg: number; crit: boolean; t: number; dur: number; alive: boolean; dmgMult: number;
}

export type EventType =
  | 'spawn' | 'shot' | 'hit' | 'death' | 'leak' | 'explode' | 'chain' | 'rail' | 'nova' | 'sniper' | 'strike'
  | 'build' | 'upgrade' | 'sell' | 'income' | 'jam' | 'heal' | 'waveStart' | 'waveEnd' | 'win' | 'lose' | 'split' | 'bounty';

export interface SimEvent {
  t: EventType; x?: number; y?: number; z?: number; x2?: number; y2?: number; z2?: number; r?: number;
  tower?: Tower; enemy?: Enemy; proj?: Projectile; pts?: number[]; family?: Family; n?: number; crit?: boolean; kind?: string;
}

interface SpawnItem { time: number; type: string; path: number; hpMult: number }

export class Sim {
  level: LevelDef;
  waves: Wave[];
  cols: number; rows: number;
  grid: Uint8Array;
  paths: PathData[] = [];
  airPaths: PathData[] = [];
  towers: Tower[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  tokens: number;
  lives: number;
  maxLives: number;
  waveIdx = -1;
  state: 'build' | 'wave' | 'won' | 'lost' = 'build';
  time = 0;
  waveClock = 0;
  nextWaveT = -1; // countdown to auto-start, -1 = wait for player
  autoDelay = 14;
  kills = 0;
  earned = 0;
  demo = false; // attract mode: never lose
  private queue: SpawnItem[] = [];
  private nextId = 1;
  rng: () => number;
  portal: { c: number; r: number; x: number; z: number; dx: number; dz: number }[] = [];
  core = { c: 0, r: 0, x: 0, z: 0 };
  cores: { c: number; r: number; x: number; z: number }[] = [];
  /** PvP: each tower only sees enemies on its own lane (enemy.pathIdx === tower.side). */
  sided = false;
  /** PvP: replaces the campaign stat table (rank, power-ups, card level, talents). */
  statFn: ((t: Tower) => TowerStats) | null = null;

  constructor(level: LevelDef) {
    this.level = level;
    this.cols = level.cols; this.rows = level.rows;
    this.waves = buildWaves(level);
    this.tokens = level.startTokens;
    this.lives = this.maxLives = level.lives;
    this.rng = mulberry32(level.seed ^ 0x5eed);
    this.grid = new Uint8Array(this.cols * this.rows);
    this.buildMap();
  }

  cellX(c: number) { return c - (this.cols - 1) / 2; }
  cellZ(r: number) { return r - (this.rows - 1) / 2; }
  cellAt(c: number, r: number) { return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? CELL_BLOCKED : this.grid[r * this.cols + c]; }
  worldToCell(x: number, z: number): [number, number] {
    return [Math.round(x + (this.cols - 1) / 2), Math.round(z + (this.rows - 1) / 2)];
  }

  private buildMap() {
    const { cols, rows, grid } = this;
    for (const wp of this.level.paths) {
      for (let i = 0; i < wp.length - 1; i++) {
        const [c0, r0] = wp[i], [c1, r1] = wp[i + 1];
        if (c0 !== c1 && r0 !== r1) throw new Error(`Level ${this.level.id}: path segment not axis aligned`);
        const n = Math.abs(c1 - c0) + Math.abs(r1 - r0);
        for (let k = 0; k <= n; k++) {
          const c = c0 + Math.sign(c1 - c0) * k, r = r0 + Math.sign(r1 - r0) * k;
          if (c < 0 || r < 0 || c >= cols || r >= rows) throw new Error(`Level ${this.level.id}: path out of bounds`);
          grid[r * cols + c] = CELL_PATH;
        }
      }
      const [pc, pr] = wp[0];
      const [nc, nr] = wp[1];
      grid[pr * cols + pc] = CELL_PORTAL;
      if (!this.portal.some((p) => p.c === pc && p.r === pr))
        this.portal.push({ c: pc, r: pr, x: this.cellX(pc), z: this.cellZ(pr), dx: Math.sign(nc - pc), dz: Math.sign(nr - pr) });
      const [cc, cr] = wp[wp.length - 1];
      grid[cr * cols + cc] = CELL_CORE;
      this.core = { c: cc, r: cr, x: this.cellX(cc), z: this.cellZ(cr) };
      this.cores.push(this.core);
      this.paths.push(this.makePath(wp.map(([c, r]) => [this.cellX(c), this.cellZ(r)] as [number, number]), false));
      this.airPaths.push(this.makePath([[this.cellX(pc), this.cellZ(pr)], [this.cellX(cc), this.cellZ(cr)]], true));
    }
    // decorative blocked tiles
    const rng = mulberry32(this.level.seed + 17);
    const nearPath = (c: number, r: number) => {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const v = this.cellAt(c + dc, r + dr);
        if ((dc || dr) && c + dc >= 0 && r + dr >= 0 && c + dc < cols && r + dr < rows && v !== CELL_FREE && v !== CELL_BLOCKED) return true;
      }
      return false;
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] !== CELL_FREE) continue;
      const p = nearPath(c, r) ? 0.05 : 0.3;
      if (rng() < p) grid[r * cols + c] = CELL_BLOCKED;
    }
  }

  private makePath(wp: [number, number][], air: boolean): PathData {
    const xs: number[] = [], zs: number[] = [];
    const R = 0.5; // true quarter-circle corners keep the lane a constant width
    for (let i = 0; i < wp.length; i++) {
      const [x, z] = wp[i];
      if (i === 0 || i === wp.length - 1) { xs.push(x); zs.push(z); continue; }
      const [px, pz] = wp[i - 1], [nx, nz] = wp[i + 1];
      const l0 = Math.hypot(x - px, z - pz), l1 = Math.hypot(nx - x, nz - z);
      const d0x = (x - px) / l0, d0z = (z - pz) / l0, d1x = (nx - x) / l1, d1z = (nz - z) / l1;
      const r = Math.min(R, l0 / 2, l1 / 2);
      const cx = x - d0x * r + d1x * r, cz = z - d0z * r + d1z * r;
      for (let k = 0; k <= 8; k++) {
        const th = (k / 8) * Math.PI * 0.5, co = Math.cos(th), si = Math.sin(th);
        xs.push(cx + (-d1x * co + d0x * si) * r);
        zs.push(cz + (-d1z * co + d0z * si) * r);
      }
    }
    const cum = [0];
    for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
    return { xs, zs, cum, length: cum[cum.length - 1], air };
  }

  place(e: Enemy) {
    const p = e.path;
    let d = e.dist;
    if (d < 0) d = 0;
    if (d > p.length) d = p.length;
    let i = e.seg;
    if (i >= p.cum.length - 1) i = p.cum.length - 2;
    while (i < p.cum.length - 2 && p.cum[i + 1] < d) i++;
    while (i > 0 && p.cum[i] > d) i--;
    e.seg = i;
    const l = p.cum[i + 1] - p.cum[i] || 1;
    const t = (d - p.cum[i]) / l;
    const dx = (p.xs[i + 1] - p.xs[i]) / l, dz = (p.zs[i + 1] - p.zs[i]) / l;
    // smooth heading
    e.dx += (dx - e.dx) * 0.35; e.dz += (dz - e.dz) * 0.35;
    e.x = p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t - dz * e.off;
    e.z = p.zs[i] + (p.zs[i + 1] - p.zs[i]) * t + dx * e.off;
  }

  spawnEnemy(type: string, pathIdx: number, hpMult: number, dist = 0): Enemy {
    const def = ENEMY_BY_ID[type];
    const air = !!def.flying;
    const path = (air ? this.airPaths : this.paths)[pathIdx] ?? this.paths[0];
    const hp = def.hp * hpMult;
    const base = this.level.hp;
    const e: Enemy = {
      id: this.nextId++, def, hp, maxHp: hp, shield: (def.shield ?? 0) * hpMult, maxShield: (def.shield ?? 0) * hpMult, shieldCd: 0,
      armor: def.armor * (1 + Math.max(0, Math.log2(hpMult / Math.max(1, base))) * 0.25), path, pathIdx, dist, off: (this.rng() - 0.5) * (def.boss ? 0.05 : 0.44),
      x: 0, y: air ? AIR_HEIGHT : 0, z: 0, dx: 0, dz: 0,
      slowPct: 0, slowT: 0, stunT: 0, dotDps: 0, dotT: 0, dotSrc: null, vuln: 0, vulnT: 0,
      phaseT: this.rng() * 2, phased: false, healT: 1, jamT: 2.5, spawnT: 3, alive: true,
      bounty: Math.max(1, Math.round(def.bounty * Math.pow(hpMult, BOUNTY_EXP))),
      hpMult, air, born: this.time, hitT: -9, seg: 0,
    };
    const p = e.path;
    const l = p.cum[1] - p.cum[0] || 1;
    e.dx = (p.xs[1] - p.xs[0]) / l; e.dz = (p.zs[1] - p.zs[0]) / l;
    this.place(e);
    this.enemies.push(e);
    this.events.push({ t: 'spawn', enemy: e, x: e.x, z: e.z });
    return e;
  }

  // ---------- player actions ----------
  canBuild(c: number, r: number) { return this.cellAt(c, r) === CELL_FREE && !this.towerAt(c, r); }
  towerAt(c: number, r: number) { return this.towers.find((t) => t.c === c && t.r === r) ?? null; }

  build(defId: string, c: number, r: number): Tower | null {
    const def = TOWER_BY_ID[defId];
    if (!def || !this.canBuild(c, r) || this.tokens < def.cost || this.state === 'won' || this.state === 'lost') return null;
    this.tokens -= def.cost;
    return this.placeTower(def, c, r);
  }

  /** Put a tower on the board without paying for it (PvP summons and merges). */
  placeTower(def: TowerDef, c: number, r: number, side = 0, rank = 1, silent = false, ext: Record<string, number> = {}): Tower {
    const t: Tower = {
      id: this.nextId++, def, c, r, x: this.cellX(c), z: this.cellZ(r), level: 1, cd: 0.25, burstLeft: 0, burstCd: 0,
      mode: def.id === 'cl_computer' ? 'strong' : 'first', yaw: 0, aimX: 0, aimZ: 1, targets: [], rampTs: [], tickT: 0, spin: 0, jamT: 0,
      buffDmg: 0, buffRate: 0, buffRange: 0, buffCrit: 0, stats: statsAt(def, 1), drones: [], kills: 0, dmgDone: 0, shotT: -9, born: this.time,
      side, rank, ext,
    };
    if (def.drones) for (let i = 0; i < def.drones; i++) t.drones.push({ x: t.x, z: t.z, ang: (i / def.drones) * Math.PI * 2, cd: i * 0.1, target: null });
    this.towers.push(t);
    this.recomputeBuffs();
    if (!silent) this.events.push({ t: 'build', tower: t, x: t.x, z: t.z });
    return t;
  }

  /** Take a tower off the board with no refund (PvP merges). */
  removeTower(t: Tower) {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    this.towers.splice(i, 1);
    t.targets.length = 0;
    for (const p of this.projectiles) if (p.tower === t) p.alive = false;
  }

  upgrade(t: Tower): boolean {
    const cost = upgradeCost(t.def, t.level);
    if (t.level >= MAX_LEVEL || this.tokens < cost) return false;
    this.tokens -= cost;
    t.level++;
    this.recomputeBuffs();
    this.events.push({ t: 'upgrade', tower: t, x: t.x, z: t.z });
    return true;
  }

  sellValue(t: Tower) { return Math.round(investedAt(t.def, t.level) * SELL_REFUND); }

  sell(t: Tower) {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    this.towers.splice(i, 1);
    this.tokens += this.sellValue(t);
    this.recomputeBuffs();
    this.events.push({ t: 'sell', tower: t, x: t.x, z: t.z });
  }

  recomputeBuffs() {
    for (const t of this.towers) { t.buffDmg = 0; t.buffRate = 0; t.buffRange = 0; t.buffCrit = 0; }
    for (const s of this.towers) {
      const b = s.def.buff;
      if (!b) continue;
      const ss = this.statFn ? this.statFn(s) : statsAt(s.def, s.level);
      // in duels only true supports have a radius; other units' auras (e.g. Fable) reach adjacent units
      const aux = ss.aux, range = this.sided && s.def.kind !== 'support' ? 1.55 : ss.range;
      for (const t of this.towers) {
        if (t === s || t.def.kind === 'support' || t.def.kind === 'income' || t.side !== s.side) continue;
        if (Math.hypot(t.x - s.x, t.z - s.z) > range + 0.01) continue;
        // strongest buff of each kind wins (no stacking of the same stat)
        if (b.dmg) t.buffDmg = Math.max(t.buffDmg, b.dmg * aux);
        if (b.rate) t.buffRate = Math.max(t.buffRate, b.rate * aux);
        if (b.range) t.buffRange = Math.max(t.buffRange, b.range * aux);
        if (b.crit) t.buffCrit = Math.max(t.buffCrit, b.crit * aux);
      }
    }
    for (const t of this.towers) {
      const s = this.statFn ? this.statFn(t) : statsAt(t.def, t.level);
      s.dmg *= 1 + t.buffDmg; s.rate *= 1 + t.buffRate;
      if (s.range < 50) s.range *= 1 + t.buffRange;
      t.stats = s;
    }
  }

  canStartWave() { return (this.state === 'build' || (this.state === 'wave' && this.queue.length === 0)) && this.waveIdx < this.waves.length - 1; }

  startWave(): boolean {
    if (!this.canStartWave()) return false;
    if (this.state === 'wave') this.tokens += 10 + this.waveIdx * 2; // early-call bonus
    else if (this.nextWaveT > 0) this.tokens += Math.round(this.nextWaveT);
    this.waveIdx++;
    this.state = 'wave';
    this.nextWaveT = -1;
    const wave = this.waves[this.waveIdx];
    const base = this.waveClock;
    for (const g of wave.groups) for (let i = 0; i < g.count; i++)
      this.queue.push({ time: base + g.delay + i * g.gap, type: g.type, path: g.path, hpMult: g.hpMult });
    this.queue.sort((a, b) => a.time - b.time);
    this.events.push({ t: 'waveStart', n: this.waveIdx });
    return true;
  }

  // ---------- combat helpers ----------
  private inRange(t: Tower, e: Enemy, range: number) {
    const dx = e.x - t.x, dz = e.z - t.z;
    const rr = range + e.def.size * 0.15;
    return dx * dx + dz * dz <= rr * rr;
  }

  private targetable(t: Tower | null, e: Enemy) {
    return e.alive && !e.phased && !(t && t.def.noAir && e.air) && !(this.sided && t && e.pathIdx !== t.side);
  }

  pickTargets(t: Tower, n: number, range = t.stats.range, exclude?: Enemy[]): Enemy[] {
    const out: Enemy[] = [];
    const sc: number[] = [];
    const preferNoDot = !!t.def.dot && t.def.kind === 'bullet';
    for (const e of this.enemies) {
      if (!this.targetable(t, e) || !this.inRange(t, e, range)) continue;
      if (exclude && exclude.indexOf(e) >= 0) continue;
      let s: number;
      switch (t.mode) {
        case 'strong': s = e.hp + e.shield; break;
        case 'near': s = -Math.hypot(e.x - t.x, e.z - t.z); break;
        case 'last': s = e.path.length - e.dist; break;
        default: s = -(e.path.length - e.dist);
      }
      if (preferNoDot && e.dotT > 0.4) s -= 1e6;
      // insertion into top-n
      let i = out.length;
      while (i > 0 && sc[i - 1] < s) i--;
      if (i < n) { out.splice(i, 0, e); sc.splice(i, 0, s); if (out.length > n) { out.pop(); sc.pop(); } }
    }
    return out;
  }

  damage(e: Enemy, amount: number, src: Tower | null, pierce = 0, shieldMult = 1, noArmor = false): number {
    if (!e.alive) return 0;
    if (e.vulnT > 0) amount *= 1 + e.vuln;
    let dealt = 0;
    if (e.shield > 0) {
      const sd = amount * shieldMult;
      const absorbed = Math.min(e.shield, sd);
      e.shield -= absorbed;
      amount -= absorbed / shieldMult;
      dealt += absorbed;
      e.shieldCd = 2.5;
      if (amount <= 0.001) { e.hitT = this.time; if (src) src.dmgDone += dealt; return dealt; }
    }
    e.shieldCd = 2.5;
    if (!noArmor && e.armor > 0) amount = Math.max(amount * 0.2, amount - e.armor * (1 - pierce));
    const d = Math.min(e.hp, amount);
    e.hp -= amount;
    dealt += d;
    e.hitT = this.time;
    if (src) src.dmgDone += dealt;
    if (e.hp <= 0) this.kill(e, src);
    return dealt;
  }

  private kill(e: Enemy, src: Tower | null) {
    if (!e.alive) return;
    e.alive = false;
    this.kills++;
    if (src) src.kills++;
    this.tokens += e.bounty; this.earned += e.bounty;
    this.events.push({ t: 'death', enemy: e, tower: src ?? undefined, x: e.x, y: e.y, z: e.z, n: e.bounty });
    if (e.def.split) {
      for (let i = 0; i < e.def.split.n; i++) {
        const c = this.spawnEnemy(e.def.split.into, e.pathIdx, e.hpMult, Math.max(0, e.dist - i * 0.28));
        c.spd = e.spd;
        c.born = this.time - 1; // no spawn-in animation
      }
      this.events.push({ t: 'split', enemy: e, x: e.x, z: e.z });
    }
  }

  private effects(e: Enemy, t: Tower) {
    const def = t.def;
    if (!e.alive) return;
    const boss = !!e.def.boss;
    if (def.slow) {
      const pct = Math.min(0.8, def.slow[0] + (t.level - 1) * 0.05) * (boss ? 0.5 : 1);
      if (pct >= e.slowPct || e.slowT <= 0) e.slowPct = pct;
      e.slowT = Math.max(e.slowT, def.slow[1]);
    }
    if (def.stun) this.stun(e, def.stun * (boss ? 0.35 : 1) * (1 + (t.level - 1) * 0.15));
    if (def.dot) {
      const dps = def.dot[0] * (t.stats.dmg / def.dmg);
      if (dps >= e.dotDps || e.dotT <= 0) { e.dotDps = dps; e.dotSrc = t; }
      e.dotT = Math.max(e.dotT, def.dot[1]);
    }
    if (def.shred) e.armor = Math.max(Math.max(0, e.def.armor - def.shred * 3), e.armor - def.shred);
    if (def.vuln) { e.vuln = Math.max(e.vuln, def.vuln * t.stats.aux); e.vulnT = 0.6; }
  }

  /** Stun an enemy. In duels a stunned enemy is immune to further stuns for a second afterwards. */
  stun(e: Enemy, dur: number) {
    if (this.sided) {
      if ((e.stunRes ?? 0) > 0) return;
      e.stunRes = dur + 1.0;
    }
    e.stunT = Math.max(e.stunT, dur);
  }

  private rollDmg(t: Tower): [number, boolean] {
    let d = t.stats.dmg;
    let crit = false;
    if (t.def.wild) {
      const r = this.rng();
      d *= t.def.wild[0] + (t.def.wild[1] - t.def.wild[0]) * r * r * 1.5;
      crit = r > 0.85;
    }
    const cc = (t.def.crit?.[0] ?? 0) + t.buffCrit;
    if (cc > 0 && this.rng() < cc) { d *= t.def.crit?.[1] ?? 2; crit = true; }
    return [d, crit];
  }

  hit(e: Enemy, dmg: number, t: Tower, crit: boolean) {
    const def = t.def;
    const was = e.alive;
    this.damage(e, dmg, t, def.pierce ?? 0, def.shieldMult ?? 1);
    if (was) this.effects(e, t);
    this.events.push({ t: 'hit', x: e.x, y: e.y + e.def.size * 0.35, z: e.z, n: dmg, crit, family: def.family, enemy: e });
  }

  explode(x: number, y: number, z: number, radius: number, dmg: number, t: Tower, crit: boolean, airOnlyGround: boolean) {
    for (const e of this.enemies) {
      if (!e.alive || e.phased) continue;
      if (airOnlyGround && e.air) continue;
      if (this.sided && e.pathIdx !== t.side) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      const rr = radius + e.def.size * 0.2;
      if (d > rr) continue;
      const f = d < radius * 0.5 ? 1 : 1 - 0.5 * ((d - radius * 0.5) / (rr - radius * 0.5));
      this.damage(e, dmg * f, t, t.def.pierce ?? 0, t.def.shieldMult ?? 1);
      this.effects(e, t);
    }
    this.events.push({ t: 'explode', x, y, z, r: radius, family: t.def.family, tower: t, crit });
  }

  private fire(t: Tower, target: Enemy, ox = t.x, oz = t.z, oy = 1.0) {
    const def = t.def;
    const [dmg, crit] = this.rollDmg(t);
    const lob = def.kind === 'lob';
    const speed = def.projSpeed ?? (lob ? 6 : 11);
    const p: Projectile = {
      id: this.nextId++, lob, tower: t, def, x: ox, y: oy, z: oz, sx: ox, sy: oy, sz: oz,
      tx: target.x, ty: target.y + target.def.size * 0.3, tz: target.z, target, speed, dmg, crit, t: 0, dur: 0, alive: true, dmgMult: 1,
    };
    if (lob) {
      const d = Math.hypot(target.x - ox, target.z - oz);
      p.dur = Math.max(0.45, d / speed);
      // lead the target
      const lead = target.stunT > 0 ? 0 : target.def.speed * (1 - (target.slowT > 0 ? target.slowPct : 0)) * p.dur;
      const save = target.dist, sseg = target.seg, sx = target.x, sz = target.z, sdx = target.dx, sdz = target.dz;
      target.dist = Math.min(target.path.length, target.dist + lead);
      this.place(target);
      p.tx = target.x; p.tz = target.z;
      target.dist = save; target.seg = sseg; target.x = sx; target.z = sz; target.dx = sdx; target.dz = sdz;
      p.target = null;
    }
    this.projectiles.push(p);
    t.shotT = this.time;
    t.aimX = target.x - t.x; t.aimZ = target.z - t.z;
    this.events.push({ t: 'shot', tower: t, proj: p, x: ox, y: oy, z: oz, family: def.family });
  }

  private chainFrom(t: Tower, first: Enemy, dmg: number, crit: boolean, pts: number[]) {
    const [jumps, falloff, jr] = t.def.chain!;
    const hitSet: Enemy[] = [first];
    let cur = first;
    let d = dmg;
    pts.push(cur.x, cur.y + cur.def.size * 0.35, cur.z);
    this.hit(cur, d, t, crit);
    for (let j = 1; j < jumps; j++) {
      let best: Enemy | null = null, bd = jr * jr;
      for (const e of this.enemies) {
        if (!this.targetable(t, e) || hitSet.indexOf(e) >= 0) continue;
        const dd = (e.x - cur.x) ** 2 + (e.z - cur.z) ** 2;
        if (dd < bd) { bd = dd; best = e; }
      }
      if (!best) break;
      d *= falloff;
      cur = best;
      hitSet.push(cur);
      pts.push(cur.x, cur.y + cur.def.size * 0.35, cur.z);
      this.hit(cur, d, t, false);
    }
  }

  // ---------- main step ----------
  step(dt: number) {
    if (this.state === 'won' || this.state === 'lost') return;
    this.time += dt;
    if (this.state === 'wave') {
      this.waveClock += dt;
      while (this.queue.length && this.queue[0].time <= this.waveClock) {
        const s = this.queue.shift()!;
        this.spawnEnemy(s.type, s.path, s.hpMult);
      }
    } else if (this.nextWaveT > 0) {
      this.nextWaveT -= dt;
      if (this.nextWaveT <= 0) { this.nextWaveT = -1; this.startWave(); }
    }
    this.stepEnemies(dt);
    this.stepTowers(dt);
    this.stepProjectiles(dt);
    // cleanup
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);

    if (this.state === 'wave' && this.queue.length === 0 && this.enemies.length === 0) {
      const wave = this.waves[this.waveIdx];
      this.tokens += wave.bonus; this.earned += wave.bonus;
      this.events.push({ t: 'waveEnd', n: this.waveIdx });
      for (const t of this.towers) if (t.def.income) {
        const amt = Math.round(t.def.income * t.stats.aux);
        this.tokens += amt; this.earned += amt;
        this.events.push({ t: 'income', tower: t, x: t.x, z: t.z, n: amt });
      }
      if (this.waveIdx >= this.waves.length - 1) {
        this.state = 'won';
        this.events.push({ t: 'win' });
      } else {
        this.state = 'build';
        this.nextWaveT = this.autoDelay;
      }
    }
  }

  private stepEnemies(dt: number) {
    const list = this.enemies;
    for (let i = 0, n = list.length; i < n; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const def = e.def;
      if (def.phase) {
        e.phaseT += dt;
        const cyc = def.phase.on + def.phase.off;
        e.phased = e.phaseT % cyc > def.phase.off;
      }
      if (e.dotT > 0) {
        e.dotT -= dt;
        this.damage(e, e.dotDps * dt, e.dotSrc, 0, 1, true);
        if (!e.alive) continue;
      }
      if (e.vulnT > 0) { e.vulnT -= dt; if (e.vulnT <= 0) e.vuln = 0; }
      if (e.stunRes) e.stunRes = Math.max(0, e.stunRes - dt);
      if (e.pullRes) e.pullRes = Math.max(0, e.pullRes - dt);
      if (e.maxShield > 0 && e.shield < e.maxShield) {
        e.shieldCd -= dt;
        if (e.shieldCd <= 0) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.15 * dt);
      }
      let sp = def.speed * (e.spd ?? 1);
      if (e.slowT > 0) { e.slowT -= dt; sp *= 1 - e.slowPct; if (e.slowT <= 0) e.slowPct = 0; }
      if (e.stunT > 0) { e.stunT -= dt; sp = 0; }
      e.dist += sp * dt;
      if (e.dist >= e.path.length) {
        e.alive = false;
        if (!this.demo) this.lives -= def.leak;
        this.events.push({ t: 'leak', enemy: e, x: e.x, z: e.z, n: def.leak });
        if (this.lives <= 0 && !this.demo) { this.lives = 0; this.state = 'lost'; this.events.push({ t: 'lose' }); return; }
        continue;
      }
      this.place(e);
      if (def.heal) {
        e.healT -= dt;
        if (e.healT <= 0) {
          e.healT = def.heal.cd;
          let any = false;
          for (const o of list) {
            if (o === e || !o.alive || o.hp >= o.maxHp) continue;
            if (Math.hypot(o.x - e.x, o.z - e.z) > def.heal.range) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.pct * (o.def.boss ? 0.25 : 1));
            any = true;
          }
          if (any) this.events.push({ t: 'heal', enemy: e, x: e.x, y: e.y, z: e.z, r: def.heal.range });
        }
      }
      if (def.jam && e.stunT <= 0) {
        e.jamT -= dt;
        if (e.jamT <= 0) {
          let best: Tower | null = null, bd = def.jam.range;
          for (const t of this.towers) {
            if (t.jamT > 0 || t.def.kind === 'income' || (this.sided && t.side !== e.pathIdx)) continue;
            const d = Math.hypot(t.x - e.x, t.z - e.z);
            if (d < bd) { bd = d; best = t; }
          }
          if (best) {
            best.jamT = def.jam.dur; best.targets.length = 0;
            e.jamT = def.jam.cd;
            this.events.push({ t: 'jam', tower: best, enemy: e, x: best.x, z: best.z, x2: e.x, y2: e.y, z2: e.z });
          } else e.jamT = 0.5;
        }
      }
      if (def.spawn) {
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.spawnT = def.spawn.cd;
          for (let k = 0; k < def.spawn.n; k++) {
            const c = this.spawnEnemy(def.spawn.type, e.pathIdx, Math.max(1, e.hpMult * 0.8), Math.min(e.path.length - 0.1, e.dist + 0.3 + k * 0.22));
            c.spd = e.spd;
            c.born = this.time - 0.2;
          }
        }
      }
    }
  }

  private stepTowers(dt: number) {
    const active = this.enemies.length > 0;
    for (const t of this.towers) {
      const def = t.def;
      if (t.jamT > 0) { t.jamT -= dt; continue; }
      const st = t.stats;
      switch (def.kind) {
        case 'bullet':
        case 'lob': {
          let rate = st.rate;
          if (def.spinup) {
            rate *= 1 + (def.spinup[0] - 1) * Math.min(1, t.spin / def.spinup[1]);
          }
          t.cd -= dt;
          if (t.burstLeft > 0) {
            t.burstCd -= dt;
            if (t.burstCd <= 0) {
              const pool = this.pickTargets(t, 6);
              if (pool.length) {
                const e = pool[def.burst! > 3 ? Math.floor(this.rng() * pool.length) : 0];
                this.fire(t, e);
              }
              t.burstLeft--;
              t.burstCd = def.splash ? 0.16 : 0.085;
            }
          }
          if (!active) { if (def.spinup) t.spin = Math.max(0, t.spin - dt * 1.5); break; }
          if (t.cd <= 0) {
            const tg = this.pickTargets(t, def.targets ?? 1);
            if (tg.length) {
              for (const e of tg) this.fire(t, e);
              if (def.burst) { t.burstLeft = def.burst - 1; t.burstCd = def.splash ? 0.16 : 0.085; }
              t.cd = 1 / rate;
              if (def.spinup) t.spin = Math.min(def.spinup[1], t.spin + 1 / rate + dt);
            } else {
              t.cd = 0.06;
              if (def.spinup) t.spin = Math.max(0, t.spin - 0.06 * 1.5);
            }
          }
          break;
        }
        case 'beam': {
          const n = def.targets ?? 1;
          // validate locks
          for (let i = t.targets.length - 1; i >= 0; i--) {
            const e = t.targets[i];
            if (!this.targetable(t, e) || !this.inRange(t, e, st.range)) { t.targets.splice(i, 1); t.rampTs.splice(i, 1); }
          }
          if (t.targets.length < n && active) {
            const add = this.pickTargets(t, n - t.targets.length, st.range, t.targets);
            for (const e of add) { t.targets.push(e); t.rampTs.push(0); }
          }
          if (t.targets.length) {
            t.aimX = t.targets[0].x - t.x; t.aimZ = t.targets[0].z - t.z;
            t.shotT = this.time;
            for (let i = 0; i < t.rampTs.length; i++) t.rampTs[i] += dt;
            t.tickT += dt;
            while (t.tickT >= BEAM_TICK) {
              t.tickT -= BEAM_TICK;
              for (let i = 0; i < t.targets.length; i++) {
                const e = t.targets[i];
                if (!e.alive) continue;
                const ramp = def.ramp ? 1 + (def.ramp[0] - 1) * Math.min(1, t.rampTs[i] / def.ramp[1]) : 1;
                // beams can't roll crits, so a crit aura adds its average value instead
                const critAvg = t.buffCrit ? 1 + Math.min(1, t.buffCrit) * ((def.crit?.[1] ?? 2) - 1) : 1;
                this.damage(e, st.dmg * BEAM_TICK * ramp * critAvg, t, def.pierce ?? 0, def.shieldMult ?? 1);
                this.effects(e, t);
              }
            }
          } else t.tickT = 0;
          break;
        }
        case 'chain':
        case 'sniper':
        case 'rail':
        case 'strike': {
          t.cd -= dt;
          if (t.cd > 0 || !active) break;
          const tg = this.pickTargets(t, 1);
          if (!tg.length) { t.cd = 0.06; break; }
          const e = tg[0];
          t.cd = 1 / st.rate;
          t.shotT = this.time;
          t.aimX = e.x - t.x; t.aimZ = e.z - t.z;
          const [dmg, crit] = this.rollDmg(t);
          if (def.kind === 'chain') {
            const pts: number[] = [t.x, 1.25, t.z];
            this.chainFrom(t, e, dmg, crit, pts);
            this.events.push({ t: 'chain', tower: t, pts, family: def.family, crit });
          } else if (def.kind === 'sniper') {
            const ex = e.x, ey = e.y + e.def.size * 0.35, ez = e.z;
            this.hit(e, dmg, t, crit);
            this.events.push({ t: 'sniper', tower: t, x: ex, y: ey, z: ez, family: def.family, crit, enemy: e });
          } else if (def.kind === 'rail') {
            const len = Math.hypot(t.aimX, t.aimZ) || 1;
            const ux = t.aimX / len, uz = t.aimZ / len;
            const L = Math.min(st.range, 9) + 1.2, w = def.railWidth ?? 0.4; // global-range rails (duels) stop at the board edge
            for (const o of this.enemies) {
              if (!o.alive || o.phased || (this.sided && o.pathIdx !== t.side)) continue;
              const rx = o.x - t.x, rz = o.z - t.z;
              const along = rx * ux + rz * uz;
              if (along < 0 || along > L) continue;
              if (Math.abs(rx * uz - rz * ux) > w + o.def.size * 0.2) continue;
              this.hit(o, dmg, t, crit);
            }
            this.events.push({ t: 'rail', tower: t, x: t.x, y: 1.1, z: t.z, x2: t.x + ux * L, y2: 0.45, z2: t.z + uz * L, family: def.family, crit });
          } else {
            const ex = e.x, ey = e.y, ez = e.z;
            this.events.push({ t: 'strike', tower: t, x: ex, y: ey, z: ez, r: def.splash ?? 1, family: def.family });
            this.explode(ex, ey, ez, def.splash ?? 1, dmg, t, crit, false);
            if (def.chain) {
              // fork from the strike point to nearby survivors
              let first: Enemy | null = null, bd = def.chain[2] ** 2;
              for (const o of this.enemies) {
                if (!this.targetable(t, o)) continue;
                const dd = (o.x - ex) ** 2 + (o.z - ez) ** 2;
                if (dd < bd && dd > 0.0001) { bd = dd; first = o; }
              }
              if (first) {
                const pts: number[] = [ex, ey + 0.4, ez];
                this.chainFrom(t, first, dmg * def.chain[1], false, pts);
                this.events.push({ t: 'chain', tower: t, pts, family: def.family });
              }
            }
          }
          break;
        }
        case 'nova': {
          t.cd -= dt;
          if (t.cd > 0 || !active) break;
          let any = false;
          for (const e of this.enemies) if (this.targetable(t, e) && this.inRange(t, e, st.range)) { any = true; break; }
          if (!any) { t.cd = 0.1; break; }
          t.cd = 1 / st.rate;
          t.shotT = this.time;
          const [dmg, crit] = this.rollDmg(t);
          for (const e of this.enemies) {
            if (!this.targetable(t, e) || !this.inRange(t, e, st.range)) continue;
            if (def.pull && !(this.sided && (e.pullRes ?? 0) > 0)) {
              if (this.sided) e.pullRes = 5;
              e.dist = Math.max(0, e.dist - def.pull * (e.def.boss ? 0.2 : 1) * (1 + (t.level - 1) * 0.15));
              this.place(e);
            }
            this.hit(e, dmg, t, crit);
          }
          this.events.push({ t: 'nova', tower: t, x: t.x, z: t.z, r: st.range, family: def.family, kind: def.pull ? 'pull' : def.id === 'cx_sandbox' ? 'box' : 'wave' });
          break;
        }
        case 'aura': {
          if (!active) break;
          t.tickT += dt;
          if (t.tickT < AURA_TICK) break;
          t.tickT -= AURA_TICK;
          let any = false;
          for (const e of this.enemies) {
            if (!e.alive || e.phased || !this.inRange(t, e, st.range) || (this.sided && e.pathIdx !== t.side)) continue;
            any = true;
            if (st.dmg > 0) this.damage(e, st.dmg * AURA_TICK, t, 0, 1, true);
            this.effects(e, t);
          }
          if (any) t.shotT = this.time;
          break;
        }
        case 'drone': {
          const tg = active ? this.pickTargets(t, t.drones.length) : [];
          for (let i = 0; i < t.drones.length; i++) {
            const d = t.drones[i];
            d.ang += dt * 1.6;
            const e = tg.length ? tg[i % tg.length] : null;
            d.target = e;
            let gx: number, gz: number;
            if (e) {
              gx = e.x + Math.cos(d.ang * 1.7 + i * 1.57) * 0.7; gz = e.z + Math.sin(d.ang * 1.7 + i * 1.57) * 0.7;
            } else {
              gx = t.x + Math.cos(d.ang) * 0.75; gz = t.z + Math.sin(d.ang) * 0.75;
            }
            const dx = gx - d.x, dz = gz - d.z, dl = Math.hypot(dx, dz);
            const sp = Math.min(dl, 6.5 * dt);
            if (dl > 0.001) { d.x += (dx / dl) * sp; d.z += (dz / dl) * sp; }
            d.cd -= dt;
            if (e && d.cd <= 0 && Math.hypot(e.x - d.x, e.z - d.z) < 1.6) {
              d.cd = 1 / st.rate;
              this.fire(t, e, d.x, d.z, 1.5);
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private stepProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.t += dt;
      const def = p.def;
      if (p.lob) {
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.z = p.sz + (p.tz - p.sz) * k;
        const h = 1.2 + p.dur * 1.6;
        p.y = p.sy + (0.1 - p.sy) * k + 4 * h * k * (1 - k);
        if (k >= 1) {
          p.alive = false;
          this.explode(p.tx, 0.1, p.tz, def.splash ?? 1, p.dmg, p.tower, p.crit, !!def.noAir);
        }
        continue;
      }
      const e = p.target;
      if (e && e.alive) { p.tx = e.x; p.ty = e.y + e.def.size * 0.3; p.tz = e.z; }
      else if (e) p.target = null;
      const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
      const d = Math.hypot(dx, dy, dz);
      const stepLen = (p.speed + p.t * 6) * dt; // slight acceleration
      if (d <= stepLen + 0.12) {
        p.alive = false;
        p.x = p.tx; p.y = p.ty; p.z = p.tz;
        if (def.splash) this.explode(p.tx, p.ty, p.tz, def.splash, p.dmg, p.tower, p.crit, false);
        else if (p.target && p.target.alive && !p.target.phased) this.hit(p.target, p.dmg, p.tower, p.crit);
        else this.events.push({ t: 'hit', x: p.x, y: p.y, z: p.z, n: 0, family: def.family });
      } else {
        p.x += (dx / d) * stepLen; p.y += (dy / d) * stepLen; p.z += (dz / d) * stepLen;
      }
    }
  }

  /** Enemy counts by type for the upcoming wave (UI preview). */
  wavePreview(idx: number): { type: string; count: number }[] {
    const w = this.waves[idx];
    if (!w) return [];
    const m = new Map<string, number>();
    for (const g of w.groups) m.set(g.type, (m.get(g.type) ?? 0) + g.count);
    return [...m.entries()].map(([type, count]) => ({ type, count }));
  }

  stars(): number {
    if (this.state !== 'won') return 0;
    const lost = this.maxLives - this.lives;
    return lost <= 2 ? 3 : lost <= 9 ? 2 : 1;
  }
}
