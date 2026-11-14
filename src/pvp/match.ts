import { TOWER_BY_ID, approxDps } from '../data/towers';
import type { LevelDef, TowerDef } from '../data/types';
import { mulberry32 } from '../data/levels';
import { CELL_BLOCKED, CELL_FREE, CELL_VOID, Sim, type Enemy, type SimEvent, type Tower } from '../sim/sim';
import type { TowerStats } from '../data/towers';
import { RARITY_INFO, rarityOf } from './roster';
import { SIGNATURE_BY_ID, abilityPower, talentMods, type Signature, type UnitMods } from './signatures';
import { CAL } from './calibration';

/**
 * A Rush Royale-style duel. Each player has a 5×3 board with its own lane around it; both lanes get
 * identical waves. Spend compute to summon a random unit from your deck, merge two identical units of
 * the same rank into a random unit one rank higher, and power up unit types. Leaks cost hearts;
 * whoever runs out of hearts first loses.
 */

export const COLS = 7, ROWS = 9;
export const BOARD_COLS = [1, 2, 3, 4, 5];
export const SIDE_ROWS = [[6, 7, 8], [0, 1, 2]]; // side 0 (bottom, you), side 1 (top, rival)
export const MAX_RANK = 7;
export const HEARTS = 3;
export const START_COMPUTE = 100;
export const SUMMON_BASE = 10, SUMMON_STEP = 5;
export const POWER_COSTS = [100, 200, 400, 700]; // cost to reach power level 2, 3, 4, 5
export const MAX_POWER = 5;
export const WAVE_LEN = 20;
export const FIRST_WAVE_AT = 4;
export const RANK_DMG = 1.85;
export const LANE_SPEED = 0.65;

const LEVEL: LevelDef = {
  id: 100, name: 'Duel', blurb: '', world: 0, cols: COLS, rows: ROWS,
  paths: [
    [[0, 8], [0, 5], [6, 5], [6, 8]],
    [[0, 0], [0, 3], [6, 3], [6, 0]],
  ],
  waves: 1, startTokens: 0, lives: 99, hp: 1, threat: 1, pool: ['bug'], seed: 1,
};

/** Base damage per second a rank-1 unit is normalised to, before rarity, level and talents. */
const BASE_DPS = 11;
const KILL_COMPUTE: Record<string, number> = { bug: 8, glitch: 7, trojan: 18, spam: 3, worm: 6, wormling: 2, hydraling: 30, clip: 2, hydra: 120, titan: 150, maximizer: 180 };
const BOSSES = ['hydra', 'titan', 'maximizer'];
const BOSS_HP = (wave: number) => 0.2 * Math.pow(1.27, wave - 4);

export interface DeckCard { id: string; level: number; talents: number[] }
export interface PlayerSetup { name: string; deck: DeckCard[]; elo?: number }

export interface UnitSpec {
  card: DeckCard; base: TowerDef; def: TowerDef; mods: UnitMods; flags: Set<string>; sig?: Signature; ap: number; levelMult: number;
}

export interface SideState {
  name: string; elo: number; deck: UnitSpec[]; power: number[]; compute: number; summons: number; hearts: number;
  kills: number; leaks: number; refund: number; computeEarned: number; merges: number; maxRank: number;
}

export interface MatchEvent { t: 'summon' | 'merge' | 'power' | 'heart' | 'wave' | 'boss' | 'bossCast' | 'ability' | 'end'; side: number; x?: number; z?: number; n?: number; text?: string; tower?: Tower; kind?: string }

const isArea = (d: TowerDef) => d.kind === 'nova' || d.kind === 'aura' || d.kind === 'support';

/** Build the battle version of a unit from its card: normalised damage, battle range, talents. */
export function buildSpec(card: DeckCard, opts: { noRarity?: boolean; cal?: number } = {}): UnitSpec {
  const base = TOWER_BY_ID[card.id];
  const rarity = rarityOf(base);
  const sig = SIGNATURE_BY_ID[card.id];
  const mods = talentMods(card.id, card.talents, card.level);
  const flags = new Set(mods.flags ?? []);
  const d: TowerDef = { ...base };
  const cal = opts.cal ?? CAL[card.id] ?? 1;
  const rp = opts.noRarity ? 1 : RARITY_INFO[rarity].power;
  if (base.dmg > 0) d.dmg = base.dmg * ((BASE_DPS * rp) / approxDps(base, 1)) * cal * (1 + (mods.dmg ?? 0));
  d.rate = base.rate * (1 + (mods.rate ?? 0)) * (flags.has('doubleChain') ? 1.9 : 1);
  d.range = isArea(base) ? (base.kind === 'support' ? 1.55 : base.range * 0.85) * (1 + (mods.radius ?? 0)) : 99;
  if (mods.targets) d.targets = (base.targets ?? 1) + mods.targets;
  if (base.chain) d.chain = [base.chain[0] + (mods.chain ?? 0), mods.chainKeep ?? base.chain[1], base.chain[2]];
  if (mods.splash) d.splash = (base.splash ?? 0.3) + mods.splash;
  if (mods.slow) d.slow = [(base.slow?.[0] ?? 0) + mods.slow[0], (base.slow?.[1] ?? 0) + mods.slow[1]];
  if (mods.stun) d.stun = (base.stun ?? 0) + mods.stun;
  if (base.kind === 'nova' && base.stun) d.stun = base.stun * 0.5 + (mods.stun ?? 0); // area stuns are halved in duels
  if (mods.crit || mods.critMult) d.crit = [(base.crit?.[0] ?? 0) + (mods.crit ?? 0), (base.crit?.[1] ?? 2) + (mods.critMult ?? 0)];
  if (base.ramp && mods.rampSpeed) d.ramp = [base.ramp[0], base.ramp[1] / (1 + mods.rampSpeed)];
  if (mods.burst) d.burst = (base.burst ?? 1) + mods.burst;
  if (mods.railWidth) d.railWidth = (base.railWidth ?? 0.4) * (1 + mods.railWidth);
  if (base.dot) d.dot = [base.dot[0] * (d.dmg / base.dmg) * (1 + (mods.dot?.[0] ?? 0)), base.dot[1] + (mods.dot?.[1] ?? 0)];
  else if (mods.dot) d.dot = [d.dmg * mods.dot[0], mods.dot[1]];
  if (mods.drones) d.drones = (base.drones ?? 0) + mods.drones;
  if (flags.has('admin')) { d.pierce = 1; d.shieldMult = 3; }
  if (base.buff || mods.buffDmg || mods.buffRate || mods.buffCrit) {
    d.buff = { ...base.buff };
    if (mods.buffDmg) d.buff.dmg = (d.buff.dmg ?? 0) + mods.buffDmg;
    if (mods.buffRate) d.buff.rate = (d.buff.rate ?? 0) + mods.buffRate;
    if (mods.buffCrit) d.buff.crit = (d.buff.crit ?? 0) + mods.buffCrit;
    if (base.dmg <= 0) for (const k of ['dmg', 'rate', 'crit'] as const) if (d.buff[k]) d.buff[k] = d.buff[k]! * cal * rp;
  }
  if (base.pull) {
    // the duel lane is short: gentler, slower pulls and a lighter slow
    d.pull = base.pull * 0.2 * (1 + (mods.pull ?? 0));
    d.rate = d.rate * 0.65;
    if (d.slow) d.slow = [d.slow[0] * 0.5, d.slow[1]];
  }
  d.noAir = false; // there are no flyers in duels
  const start = RARITY_INFO[rarity].startLevel;
  return { card, base, def: d, mods, flags, sig, ap: abilityPower(card.level, start) * (1 + (mods.abilityPower ?? 0)), levelMult: Math.pow(1.09, card.level - 1) };
}

export class PvpMatch {
  sim: Sim;
  sides: SideState[];
  time = 0;
  wave = 0;
  ended = false;
  winner = -1; // -1 = draw (when ended)
  events: MatchEvent[] = [];
  rng: () => number;
  private spawnQ: { t: number; type: string; hp: number }[] = [];
  private bossT = [0, 0];

  constructor(a: PlayerSetup, b: PlayerSetup, seed = 1) {
    this.rng = mulberry32(seed * 7919 + 13);
    const sim = (this.sim = new Sim({ ...LEVEL, seed }));
    sim.sided = true;
    sim.demo = true;
    sim.tokens = 0;
    sim.statFn = (t) => this.stats(t);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const slot = BOARD_COLS.includes(c) && (SIDE_ROWS[0].includes(r) || SIDE_ROWS[1].includes(r));
      if (r === 4) sim.grid[i] = CELL_VOID;
      else if (sim.grid[i] === CELL_FREE || sim.grid[i] === CELL_BLOCKED) sim.grid[i] = slot ? CELL_FREE : CELL_BLOCKED;
    }
    this.sides = [a, b].map((p) => ({
      name: p.name, elo: p.elo ?? 0, deck: p.deck.map((c) => buildSpec(c)), power: p.deck.map(() => 1), compute: START_COMPUTE, summons: 0, hearts: HEARTS,
      kills: 0, leaks: 0, refund: 0, computeEarned: 0, merges: 0, maxRank: 1,
    }));
  }

  /** Kill rewards grow with the wave, so the economy keeps pace with summon costs. */
  killReward(type: string) { return Math.round((KILL_COMPUTE[type] ?? 3) * (1 + 0.25 * Math.max(0, this.wave - 1))); }

  // ------------------------------------------------------------------ queries
  slots(side: number): [number, number][] { return SIDE_ROWS[side].flatMap((r) => BOARD_COLS.map((c) => [c, r] as [number, number])); }
  units(side: number) { return this.sim.towers.filter((t) => t.side === side); }
  freeSlots(side: number) { return this.slots(side).filter(([c, r]) => !this.sim.towerAt(c, r)); }
  summonCost(side: number) { const s = this.sides[side]; return Math.max(0, Math.round((SUMMON_BASE + SUMMON_STEP * s.summons) * (1 - s.refund))); }
  powerCost(side: number, i: number) { const p = this.sides[side].power[i]; return p >= MAX_POWER ? Infinity : POWER_COSTS[p - 1]; }
  canMerge(a: Tower, b: Tower) { return a !== b && a.side === b.side && a.ext.deck === b.ext.deck && a.rank === b.rank && a.rank < MAX_RANK && !this.ended; }
  sideOfCell(r: number) { return SIDE_ROWS[0].includes(r) ? 0 : SIDE_ROWS[1].includes(r) ? 1 : -1; }
  waveTime() { return this.time < FIRST_WAVE_AT ? FIRST_WAVE_AT - this.time : WAVE_LEN - ((this.time - FIRST_WAVE_AT) % WAVE_LEN); }
  bossAlive(side: number) { return this.sim.enemies.some((e) => e.def.boss && e.pathIdx === side && e.alive); }

  stats(t: Tower): TowerStats {
    const side = this.sides[t.side];
    const spec = side.deck[t.ext.deck];
    const pl = side.power[t.ext.deck];
    const tmpD = t.ext.tmpDmg ?? 1, tmpR = t.ext.tmpRate ?? 1;
    return {
      dmg: spec.def.dmg * Math.pow(RANK_DMG, t.rank - 1) * (1 + 0.25 * (pl - 1)) * spec.levelMult * tmpD,
      rate: spec.def.rate * (1 + 0.07 * (t.rank - 1)) * tmpR,
      range: spec.def.range,
      aux: (1 + 0.2 * (t.rank - 1) + 0.1 * (pl - 1)) * Math.sqrt(spec.levelMult),
    };
  }

  // ------------------------------------------------------------------ actions
  private put(side: number, deck: number, rank: number, c: number, r: number, silent = false) {
    const spec = this.sides[side].deck[deck];
    const t = this.sim.placeTower(spec.def, c, r, side, rank, true, { deck });
    if (spec.base.id === 'cx_swarm') {
      for (let i = 0; i < Math.floor((rank - 1) / 2); i++) t.drones.push({ x: t.x, z: t.z, ang: i * 1.3, cd: i * 0.1, target: null });
    }
    if (spec.flags.has('hotfix')) t.mode = 'strong';
    this.sides[side].maxRank = Math.max(this.sides[side].maxRank, rank);
    if (!silent) this.sim.events.push({ t: 'build', tower: t, x: t.x, z: t.z });
    return t;
  }

  summon(side: number): Tower | null {
    const s = this.sides[side];
    const cost = this.summonCost(side);
    const free = this.freeSlots(side);
    if (this.ended || !free.length || s.compute < cost) return null;
    s.compute -= cost;
    s.summons++;
    s.refund = 0;
    const [c, r] = free[Math.floor(this.rng() * free.length)];
    const deck = Math.floor(this.rng() * s.deck.length);
    const t = this.put(side, deck, 1, c, r);
    this.events.push({ t: 'summon', side, x: t.x, z: t.z, n: cost, tower: t });
    return t;
  }

  /** Drop `a` onto `b`: both vanish, a random deck unit one rank higher appears where `b` was. */
  merge(a: Tower, b: Tower): Tower | null {
    if (!this.canMerge(a, b)) return null;
    const side = a.side, s = this.sides[side];
    const usedFable = [a, b].some((t) => s.deck[t.ext.deck].flags.has('epilogue'));
    const { c, r } = b;
    this.sim.removeTower(a); this.sim.removeTower(b);
    const deck = Math.floor(this.rng() * s.deck.length);
    let rank = a.rank + 1;
    const spec = s.deck[deck];
    let agentic = false;
    if (spec.base.id === 'cl_code' && rank < MAX_RANK && this.rng() < Math.min(0.6, 0.25 * spec.ap)) { rank++; agentic = true; }
    const t = this.put(side, deck, rank, c, r, true);
    if (usedFable) s.refund = 0.25;
    s.merges++;
    this.sim.events.push({ t: 'upgrade', tower: t, x: t.x, z: t.z });
    this.events.push({ t: 'merge', side, x: t.x, z: t.z, n: rank, tower: t, text: agentic ? 'Agentic Merge' : undefined });
    if (agentic) this.ability(t, 'Agentic Merge');
    this.sim.recomputeBuffs();
    return t;
  }

  powerUp(side: number, i: number): boolean {
    const s = this.sides[side];
    const cost = this.powerCost(side, i);
    if (this.ended || s.compute < cost) return false;
    s.compute -= cost;
    s.power[i]++;
    this.sim.recomputeBuffs();
    this.events.push({ t: 'power', side, n: s.power[i], kind: s.deck[i].base.id });
    return true;
  }

  // ------------------------------------------------------------------ waves
  private scheduleWave(w: number) {
    const n = Math.min(24, 8 + Math.round(1.2 * (w - 1)));
    const hp = Math.pow(1.17, w - 1) * (w > 14 ? Math.pow(1.3, w - 14) : 1);
    const t0 = this.time;
    for (let i = 0; i < n; i++) {
      const type = w >= 3 && i % 6 === 5 ? 'trojan' : w >= 2 && i % 4 === 3 ? 'glitch' : 'bug';
      this.spawnQ.push({ t: t0 + (i * 15) / n, type, hp });
    }
    if (w % 4 === 0) {
      const boss = BOSSES[(w / 4 - 1) % BOSSES.length];
      this.spawnQ.push({ t: t0 + 2, type: boss, hp: BOSS_HP(w) });
      this.events.push({ t: 'boss', side: -1, kind: boss, n: w });
    }
    this.spawnQ.sort((x, y) => x.t - y.t);
    this.events.push({ t: 'wave', side: -1, n: w });
  }

  // ------------------------------------------------------------------ main step
  step(dt: number) {
    if (this.ended) return;
    this.time += dt;
    const w = this.time < FIRST_WAVE_AT ? 0 : 1 + Math.floor((this.time - FIRST_WAVE_AT) / WAVE_LEN);
    while (this.wave < w) { this.wave++; this.scheduleWave(this.wave); }
    while (this.spawnQ.length && this.spawnQ[0].t <= this.time) {
      const s = this.spawnQ.shift()!;
      for (let side = 0; side < 2; side++) {
        const e = this.sim.spawnEnemy(s.type, side, s.hp);
        e.spd = LANE_SPEED;
        e.bounty = this.killReward(s.type);
      }
    }
    this.tickAbilities(dt);
    this.tickBosses(dt);
    const before = this.sim.events.length;
    this.sim.step(dt);
    this.handleSimEvents(before);
    this.checkEnd();
  }

  private handleSimEvents(from: number) {
    const ev = this.sim.events;
    for (let i = from; i < ev.length && i < from + 600; i++) this.onSimEvent(ev[i]);
  }

  private onSimEvent(ev: SimEvent) {
    switch (ev.t) {
      case 'spawn': {
        const e = ev.enemy!;
        e.bounty = this.killReward(e.def.id);
        break;
      }
      case 'death': {
        const e = ev.enemy!;
        const s = this.sides[e.pathIdx];
        if (!s) break;
        let gain = this.killReward(e.def.id);
        const src = ev.tower;
        if (src && src.side === e.pathIdx) {
          const spec = s.deck[src.ext.deck];
          if (spec?.base.id === 'cl_fable') {
            let extra = Math.round(1 * spec.ap) + (spec.flags.has('morePerKill') ? 1 : 0);
            if (spec.flags.has('plotTwist') && this.rng() < 0.15) extra *= 2;
            gain += extra;
          }
        }
        // Solar Flare: burning enemies explode
        const ds = e.dotSrc;
        if (e.dotT > 0 && ds && ds.side === e.pathIdx && this.sim.towers.includes(ds)) {
          const spec = s.deck[ds.ext.deck];
          if (spec?.base.id === 'gem_twinsuns') {
            const r = 1.1 * (1 + (spec.mods.abilityRadius ?? 0));
            this.sim.explode(e.x, 0.2, e.z, r, ds.stats.dmg * 0.8 * spec.ap, ds, false, false);
          }
        }
        // Contagion: marked enemies spread the mark
        if (e.vulnT > 0 && (e as Enemy & { markBy?: number }).markBy !== undefined) {
          const m = e as Enemy & { markBy?: number; markV?: number };
          const src2 = this.sim.towers.find((t) => t.id === m.markBy);
          if (src2 && s.deck[src2.ext.deck]?.flags.has('contagion')) for (const o of this.laneEnemies(e.pathIdx)) if (Math.hypot(o.x - e.x, o.z - e.z) < 1.4) this.mark(o, src2, m.markV ?? 0.12, 4);
        }
        ev.n = gain;
        s.compute += gain; s.computeEarned += gain; s.kills++;
        break;
      }
      case 'leak': {
        const e = ev.enemy!;
        const s = this.sides[e.pathIdx];
        if (!s) break;
        const n = e.def.boss ? 2 : 1;
        s.hearts = Math.max(0, s.hearts - n); s.leaks += n;
        this.events.push({ t: 'heart', side: e.pathIdx, n: s.hearts, x: e.x, z: e.z });
        break;
      }
      case 'rail': this.onRail(ev); break;
      case 'strike': this.onStrike(ev); break;
      case 'nova': this.onNova(ev); break;
      case 'sniper': this.onSniper(ev); break;
      default: break;
    }
  }

  private onSniper(ev: SimEvent) {
    if (ev.kind === 'auto') return;
    const t = ev.tower!;
    const s = this.sides[t.side];
    const spec = s?.deck[t.ext.deck];
    if (spec?.base.id !== 'cl_computer') return;
    if (spec.flags.has('screenshot') && ev.enemy) this.mark(ev.enemy, t, 0.15, 3);
    const n = (t.ext.clicks = (t.ext.clicks ?? 0) + 1);
    if (n % (spec.flags.has('click4') ? 4 : 5) !== 0) return;
    const extra = spec.flags.has('click5') ? 4 : 2;
    const others = this.laneEnemies(t.side).filter((o) => o !== ev.enemy).sort((a, b) => b.hp + b.shield - (a.hp + a.shield)).slice(0, extra);
    const admin = spec.flags.has('admin');
    for (const o of others) {
      this.sim.damage(o, t.stats.dmg * spec.ap, t, admin ? 1 : 0, admin ? 3 : 1);
      if (o.alive) this.sim.stun(o, (spec.def.stun ?? 0.8) * (o.def.boss ? 0.35 : 1));
      if (spec.flags.has('screenshot')) this.mark(o, t, 0.15, 3);
      this.sim.events.push({ t: 'sniper', tower: t, x: o.x, y: o.y + o.def.size * 0.35, z: o.z, family: t.def.family, kind: 'auto', enemy: o });
    }
    if (others.length) this.ability(t, 'Automation', others.length + 1);
  }

  private laneEnemies(side: number) { return this.sim.enemies.filter((e) => e.alive && e.pathIdx === side && !e.phased); }

  private onRail(ev: SimEvent) {
    const t = ev.tower!;
    const s = this.sides[t.side];
    const spec = s?.deck[t.ext.deck];
    if (!spec?.sig) return;
    const n = (t.ext.rails = (t.ext.rails ?? 0) + 1);
    const ax = ev.x!, az = ev.z!, bx = ev.x2!, bz = ev.z2!;
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
    const w = (spec.def.railWidth ?? 0.4) + 0.25;
    const onLine = this.laneEnemies(t.side).filter((o) => {
      const rx = o.x - ax, rz = o.z - az, along = rx * ux + rz * uz;
      return along >= 0 && along <= L && Math.abs(rx * uz - rz * ux) <= w + o.def.size * 0.2;
    });
    const id = spec.base.id;
    if (id === 'gem_deepthink') {
      for (const o of onLine) this.mark(o, t, 0.12 * spec.ap, spec.flags.has('longMark') ? 7 : 4);
      if (spec.flags.has('epiphany')) this.everyNth(t, n, 4);
    } else if (id === 'cx_refactor') {
      const every = spec.flags.has('sweep4') ? 4 : 5;
      if (n % every === 0) {
        for (const o of this.laneEnemies(t.side)) {
          this.sim.damage(o, t.stats.dmg * 0.5 * spec.ap, t, 1, 1);
          if (spec.flags.has('techDebt')) this.mark(o, t, 0.15, 3);
        }
        this.ability(t, 'Clean Code');
      }
    } else if (id === 'gk_heavy') {
      const th = Math.min(0.35, 0.12 * spec.ap);
      let execs = 0;
      for (const o of onLine) if (o.alive && !o.def.boss && o.hp / o.maxHp < th) { this.sim.damage(o, o.hp + o.shield + 1, t, 1, 1, true); execs++; }
      if (execs) {
        this.ability(t, 'Overkill', execs);
        if (spec.flags.has('bounty')) { s.compute += 5 * execs; s.computeEarned += 5 * execs; }
      }
      if (spec.flags.has('every3')) this.everyNth(t, n, 3);
    }
  }

  /** Arm a triple-damage shot on every n-th attack. */
  private everyNth(t: Tower, count: number, n: number) {
    const want = (count + 1) % n === 0 ? 3 : 1;
    if ((t.ext.armMult ?? 1) === want) return;
    t.ext.tmpDmg = (t.ext.tmpDmg ?? 1) / (t.ext.armMult ?? 1) * want;
    t.ext.armMult = want;
    this.sim.recomputeBuffs();
  }

  private mark(o: Enemy, t: Tower, v: number, dur: number) {
    o.vuln = Math.max(o.vuln, v); o.vulnT = Math.max(o.vulnT, dur);
    const m = o as Enemy & { markBy?: number; markV?: number };
    m.markBy = t.id; m.markV = v;
  }

  private onStrike(ev: SimEvent) {
    if (ev.kind === 'cascade') return;
    const t = ev.tower!;
    const s = this.sides[t.side];
    const spec = s?.deck[t.ext.deck];
    if (spec?.base.id !== 'gk_supernova') return;
    if (spec.flags.has('ionized')) for (const o of this.laneEnemies(t.side)) if (Math.hypot(o.x - ev.x!, o.z - ev.z!) < (spec.def.splash ?? 1) + 0.3) this.mark(o, t, 0.1, 3);
    const n = (t.ext.strikes = (t.ext.strikes ?? 0) + 1);
    if (n % (spec.flags.has('cascade4') ? 4 : 5) !== 0) return;
    let k = 0;
    for (const o of this.laneEnemies(t.side)) {
      this.sim.damage(o, t.stats.dmg * 1.5 * spec.ap, t, 0, 1);
      if (k++ < 10) this.sim.events.push({ t: 'strike', tower: t, x: o.x, y: o.y, z: o.z, r: 0.6, family: t.def.family, kind: 'cascade' });
    }
    this.ability(t, 'Cascade');
  }

  private onNova(ev: SimEvent) {
    const t = ev.tower!;
    const s = this.sides[t.side];
    const spec = s?.deck[t.ext.deck];
    if (spec?.base.id !== 'gk_blackhole') return;
    for (const o of this.laneEnemies(t.side)) {
      if (Math.hypot(o.x - t.x, o.z - t.z) > t.stats.range + 0.2) continue;
      if (!o.def.boss) this.sim.damage(o, o.maxHp * 0.01 * spec.ap, t, 0, 1, true);
      else if (spec.flags.has('pullBoss')) { o.dist = Math.max(0, o.dist - (spec.def.pull ?? 2) * 0.8); this.sim.place(o); }
    }
  }

  private ability(t: Tower, name: string, n?: number) {
    this.sim.events.push({ t: 'nova', tower: t, x: t.x, z: t.z, r: 0.9, family: t.def.family, kind: 'cast' } as SimEvent);
    this.events.push({ t: 'ability', side: t.side, x: t.x, z: t.z, text: name, tower: t, n });
  }

  /** Timed abilities and per-frame multipliers. */
  private tickAbilities(dt: number) {
    for (let side = 0; side < 2; side++) {
      let changed = false;
      for (const t of this.units(side)) {
        const s = this.sides[side];
        const spec = s.deck[t.ext.deck];
        if (!spec) continue;
        const cd = (spec.sig?.ability.cd ?? 0) * (1 - (spec.mods.abilityCd ?? 0));
        const busy = this.laneEnemies(side).length > 0 && t.jamT <= 0;
        if (cd > 0 && busy) {
          t.ext.abT = (t.ext.abT ?? cd * (0.4 + this.rng() * 0.6)) - dt;
          if (t.ext.abT <= 0) { t.ext.abT = cd; this.cast(t, spec); }
        }
        // multipliers from overclocks, eclipses and per-board talents
        let rate = 1, dmg = 1;
        if ((t.ext.ocUntil ?? 0) > this.time) rate *= 1 + (t.ext.ocPow ?? 1);
        if (spec.flags.has('eclipse')) { const ph = (this.time + t.id) % 10; if (ph < 2) dmg *= 3; }
        if (spec.flags.has('selfImprove')) dmg *= 1 + 0.06 * this.units(side).filter((u) => s.deck[u.ext.deck]?.base.id === 'cl_code').length;
        if (spec.flags.has('swarmIntel')) dmg *= 1 + 0.08 * (this.units(side).filter((u) => s.deck[u.ext.deck]?.base.id === 'cx_swarm').length - 1);
        dmg *= t.ext.armMult ?? 1; // set by everyNth for the next shot
        if (Math.abs((t.ext.tmpDmg ?? 1) - dmg) > 1e-6) { t.ext.tmpDmg = dmg; changed = true; }
        if (Math.abs((t.ext.tmpRate ?? 1) - rate) > 1e-6) { t.ext.tmpRate = rate; changed = true; }
      }
      if (changed) this.sim.recomputeBuffs();
    }
  }

  private cast(t: Tower, spec: UnitSpec) {
    const side = t.side;
    switch (spec.base.id) {
      case 'gem_ultra': {
        const r = 1.0 * (1 + (spec.mods.abilityRadius ?? 0));
        const hits = t.targets.filter((e) => e.alive);
        if (!hits.length) return;
        for (const e of hits) {
          this.sim.explode(e.x, 0.3, e.z, r, t.stats.dmg * 1.5 * spec.ap, t, false, false);
          for (const o of this.laneEnemies(side)) {
            if (Math.hypot(o.x - e.x, o.z - e.z) > r + 0.2) continue;
            if (spec.flags.has('burstSlow')) { o.slowPct = Math.max(o.slowPct, 0.3); o.slowT = Math.max(o.slowT, 2); }
            if (spec.flags.has('burstBurn')) { o.dotDps = Math.max(o.dotDps, t.stats.dmg * 0.4); o.dotT = Math.max(o.dotT, 3); o.dotSrc = t; }
          }
        }
        this.ability(t, 'Prism Burst');
        break;
      }
      case 'cl_mcp': {
        const adj = this.units(side).filter((u) => u !== t && Math.hypot(u.x - t.x, u.z - t.z) < 1.6 && u.def.kind !== 'support');
        if (!adj.length) return;
        const n = spec.flags.has('fanOut') ? adj.length : spec.flags.has('twoCalls') ? 2 : 1;
        const pick = [...adj].sort(() => this.rng() - 0.5).slice(0, n);
        for (const u of pick) { u.ext.ocUntil = this.time + 2.5 + (spec.flags.has('longCall') ? 1.5 : 0); u.ext.ocPow = 1.0 * spec.ap; }
        this.ability(t, 'Tool Call', pick.length);
        break;
      }
      case 'cx_swarm':
        t.ext.ocUntil = this.time + 2 + (spec.flags.has('longParallel') ? 1.5 : 0);
        t.ext.ocPow = 2 * spec.ap;
        this.ability(t, 'Parallelize');
        break;
      case 'cx_max': {
        const n = Math.round((spec.def.burst ?? 6) * spec.ap) * (spec.flags.has('releaseTrain') ? 2 : 1);
        t.burstLeft += n; t.burstCd = 0;
        this.ability(t, 'Ship It', n);
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ bosses
  private tickBosses(dt: number) {
    for (let side = 0; side < 2; side++) {
      const boss = this.sim.enemies.find((e) => e.alive && e.def.boss && e.pathIdx === side);
      if (!boss) { this.bossT[side] = 5; continue; }
      this.bossT[side] -= dt;
      if (this.bossT[side] > 0 || boss.stunT > 0) continue;
      this.bossT[side] = 6;
      const units = this.units(side);
      if (!units.length) continue;
      const pick = () => units[Math.floor(this.rng() * units.length)];
      if (boss.def.id === 'hydra' && units.length >= 2) {
        // Fork: two random units swap places
        const a = pick(); let b = pick(); let guard = 0;
        while (b === a && guard++ < 8) b = pick();
        if (a !== b) {
          [a.c, b.c] = [b.c, a.c]; [a.r, b.r] = [b.r, a.r]; [a.x, b.x] = [b.x, a.x]; [a.z, b.z] = [b.z, a.z];
          for (const t of [a, b]) for (const d of t.drones) { d.x = t.x; d.z = t.z; }
          this.sim.recomputeBuffs();
          this.events.push({ t: 'bossCast', side, kind: 'swap', text: 'Fork: units swapped', x: a.x, z: a.z });
        }
      } else if (boss.def.id === 'titan') {
        // Deepfake: a random unit loses a rank
        const ranked = units.filter((u) => u.rank > 1);
        if (ranked.length) {
          const u = ranked[Math.floor(this.rng() * ranked.length)];
          u.rank--; this.sim.recomputeBuffs();
          this.events.push({ t: 'bossCast', side, kind: 'drain', text: 'Deepfake: rank stolen', x: u.x, z: u.z, tower: u });
        }
      } else if (boss.def.id === 'maximizer') {
        // Encrypt: two random units are jammed
        const set = [...units].sort(() => this.rng() - 0.5).slice(0, 2);
        for (const u of set) { u.jamT = Math.max(u.jamT, 3); u.targets.length = 0; this.sim.events.push({ t: 'jam', tower: u, enemy: boss, x: u.x, z: u.z, x2: boss.x, y2: boss.y, z2: boss.z }); }
        this.events.push({ t: 'bossCast', side, kind: 'encrypt', text: 'Encrypt: units jammed', x: set[0].x, z: set[0].z });
      }
    }
  }

  private checkEnd() {
    const [a, b] = this.sides;
    if (a.hearts > 0 && b.hearts > 0) return;
    this.ended = true;
    if (a.hearts <= 0 && b.hearts <= 0) {
      // both fell on the same frame: whoever dealt more damage takes it
      const dmg = (side: number) => this.units(side).reduce((x, t) => x + t.dmgDone, 0) + this.sides[side].kills * 1e-3;
      const da = dmg(0), db = dmg(1);
      this.winner = Math.abs(da - db) < 1e-6 ? -1 : da > db ? 0 : 1;
    } else this.winner = a.hearts <= 0 ? 1 : 0;
    this.events.push({ t: 'end', side: this.winner });
  }
}
