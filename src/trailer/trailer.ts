import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import { LEVELS, THEMES } from '../data/levels';
import { TOWERS, TOWER_BY_ID, approxDps, traits } from '../data/towers';
import { FAMILIES, FAMILY_INFO, type Family, type LevelDef, type Theme, type TowerDef } from '../data/types';
import type { Engine } from '../render/engine';
import type { GameView } from '../render/view';
import { CELL_BLOCKED, CELL_FREE, Sim, type Enemy, type SimEvent, type Tower } from '../sim/sim';

/**
 * The frendsTD trailer: a ~60 second cinematic directed entirely inside the game engine.
 * Every model, effect and battle is the real thing; only the camera, the staging and the
 * text overlays are scripted. Everything runs off a virtual clock so it can be captured
 * frame by frame (tools/trailer.cjs) or simply watched live with `?trailer`.
 */

type Cam = [number, number, number, number, number, number, number]; // pos xyz, look xyz, fov
/** `chain`: the shot continues the previous shot's scene state, so the two must be captured together. */
interface Shot { name: string; dur: number; chain?: boolean; enter?: () => void; update: (t: number, dt: number) => void }
interface Bolt { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t: number; dur: number; arc: number; color: number; size: number; rocket: boolean; hit: () => void }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const c01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => c01((t - a) / (b - a));
const eio = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const eo = (k: number) => 1 - Math.pow(1 - k, 3);
const ei = (k: number) => k * k * k;
const back = (k: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const mix = (a: Cam, b: Cam, k: number): Cam => a.map((v, i) => lerp(v, b[i], k)) as Cam;
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));

const STAGE: Theme = {
  id: 'stage', name: 'Showroom', sky: [0x02030a, 0x0e1a3a, 0x3a5cc0], tile: 0x1a2130, tileAccent: 0x8fb4ff,
  path: 0x060a12, pathGlow: 0x9fc0ff, fog: 0x060b18, key: 0xffffff, rim: 0x6f8cff, prop: 'server',
};
const mk = (id: number, cols: number, rows: number, paths: [number, number][][]): LevelDef => ({
  id, name: 'Trailer', blurb: '', world: 0, cols, rows, paths, waves: 1, startTokens: 0, lives: 20, hp: 1, threat: 1, pool: ['bug'], seed: 4242 + id,
});
const SHOWROOM = mk(90, 9, 12, [[[4, 0], [4, 11]]]);
const RANGE = mk(91, 7, 12, [[[3, 0], [3, 11]]]);
const ARENA = mk(92, 7, 9, [[[0, 0], [6, 0]]]);

const BLOCK: Record<Family, [number, number]> = { gemini: [1, 1], claude: [5, 1], codex: [1, 7], grok: [5, 7] };
const BLOCK_ORDER = [[12, 10, 11], [9, 7, 8], [6, 4, 5], [3, 1, 2]].map((r) => [r[1], r[0], r[2]]); // hero (XII) back-centre

type Build = [string, number, number, number?];
const CARDS: [string, number, number][] = [['gem_veo', 2, 2], ['gk_bigbrain', 4, 5], ['cl_opus', 2, 8], ['cx_swarm', 4, 10]];
const B_FARM: Build[] = [['gem_flash', 2, 2, 2], ['cl_sonnet', 4, 2, 2], ['gk_tesla', 6, 3, 3], ['cx_mini', 2, 5, 2], ['gem_twin', 4, 6, 2], ['cl_opus', 6, 7, 2], ['gk_raptor', 2, 10, 2], ['cx_linter', 0, 3, 1], ['gk_fun', 4, 10, 2], ['cx_ci', 2, 7, 2], ['gem_banana', 6, 10, 2], ['cl_code', 4, 8, 1], ['gk_meme', 0, 9, 1], ['cx_pr', 6, 5, 1]];
const B_LATENT: Build[] = [['gem_pro', 2, 5, 2], ['cl_code', 4, 5, 2], ['gk_bigbrain', 6, 4, 2], ['cx_pr', 2, 3, 2], ['gem_veo', 4, 7, 1], ['cl_thinking', 2, 8, 2], ['gk_meme', 6, 8, 2], ['cx_ci', 0, 4, 3], ['cl_mcp', 3, 4, 1], ['gem_vision', 8, 5, 2], ['gk_tesla', 0, 8, 3], ['cx_compiler', 5, 11, 2], ['cl_opus', 3, 12, 2], ['gk_vision', 8, 9, 1]];
const B_SING: Build[] = [['cl_code', 2, 2, 1], ['gem_deepthink', 5, 4, 1], ['cl_mythos', 2, 7, 1], ['gk_supernova', 8, 2, 1], ['gk_blackhole', 3, 10, 1], ['cx_max', 5, 7, 1], ['cx_swarm', 0, 7, 1], ['gem_twinsuns', 5, 10, 1], ['gk_bigbrain', 2, 4, 1], ['cl_fable', 6, 13, 1], ['gem_constellation', 0, 10, 1], ['gk_heavy', 8, 10, 1]];
const B_FINAL: Build[] = [['gem_twinsuns', 1, 2, 2], ['cl_fable', 3, 5, 2], ['cx_max', 5, 5, 2], ['gk_supernova', 7, 2, 1], ['gk_blackhole', 3, 8, 2], ['cl_mythos', 5, 8, 2], ['gem_deepthink', 1, 8, 2], ['cx_swarm', 7, 8, 2], ['gk_heavy', 3, 12, 2], ['cl_computer', 5, 12, 2], ['gem_constellation', 7, 11, 2], ['cx_refactor', 1, 11, 2], ['cl_mcp', 4, 4, 1], ['gk_colossus', 4, 9, 1], ['gem_ultra', 2, 1, 2], ['cl_thinking', 4, 1, 2], ['gk_bigbrain', 6, 1, 2]];

const STYLE = `
#tr { position: fixed; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; color: #fff; font-family: 'Chakra Petch', system-ui, sans-serif; text-transform: uppercase; }
#tr .e { position: absolute; left: 0; right: 0; text-align: center; will-change: transform, opacity; }
#tr .sh { text-shadow: 0 0.4vw 2.4vw rgba(0,0,0,0.9), 0 0 1vw rgba(0,0,0,0.9); }
#tr .logo { animation: none; justify-content: center; font-size: 19vw; text-transform: none; }
#tr .card { position: absolute; left: 6vw; right: 6vw; bottom: 7vh; padding: 4vw 4.4vw 4.4vw; border-radius: 4vw; text-align: left; background: linear-gradient(180deg, rgba(10,14,26,0.86), rgba(6,9,18,0.94)); border: 1px solid var(--fc); box-shadow: 0 0 8vw color-mix(in srgb, var(--fc) 30%, transparent), 0 3vw 10vw rgba(0,0,0,0.6); }
#tr .card .eb { font: 600 2.9vw/1 'Chakra Petch'; letter-spacing: 0.2em; color: var(--fc); }
#tr .card h2 { margin: 1.6vw 0 0.8vw; font: 700 10vw/0.95 'Chakra Petch'; letter-spacing: 0.01em; }
#tr .card .role { font: 600 3.3vw/1 'Chakra Petch'; letter-spacing: 0.14em; color: var(--fc2); margin-bottom: 3vw; }
#tr .row { display: grid; grid-template-columns: 17vw 1fr 15vw; align-items: center; gap: 2.4vw; font: 600 2.9vw/1 'Chakra Petch'; letter-spacing: 0.08em; color: #9fb0d0; margin-top: 1.9vw; }
#tr .row b { color: #fff; text-align: right; }
#tr .tk { height: 1.5vw; border-radius: 1vw; background: rgba(255,255,255,0.1); overflow: hidden; }
#tr .tk i { display: block; height: 100%; border-radius: 1vw; background: linear-gradient(90deg, var(--fc), var(--fc2)); box-shadow: 0 0 2vw var(--fc); }
#tr .chips { display: flex; flex-wrap: wrap; gap: 1.4vw; margin-top: 3.2vw; }
#tr .chip { font: 600 2.7vw/1 'Chakra Petch'; letter-spacing: 0.04em; text-transform: none; padding: 1.5vw 2.2vw; border-radius: 1.8vw; color: var(--fc2); background: color-mix(in srgb, var(--fc) 16%, transparent); border: 1px solid color-mix(in srgb, var(--fc) 40%, transparent); }
#tr .cap { display: inline-block; padding: 2.6vw 4vw; border-radius: 2.4vw; background: rgba(6,9,18,0.9); border: 0.5vw solid #fff; font: 700 4.3vw/1.25 'Chakra Petch'; letter-spacing: 0.04em; text-align: left; box-shadow: 0 2vw 8vw rgba(0,0,0,0.7); }
#tr .hp { position: absolute; width: 22vw; height: 2.2vw; margin-left: -11vw; border-radius: 1.2vw; background: rgba(5,6,10,0.9); border: 0.4vw solid #fff; overflow: hidden; }
#tr .hp i { display: block; height: 100%; }
#tr .sellp { position: absolute; display: flex; gap: 1.6vw; padding: 1.8vw; border-radius: 3vw; background: rgba(10,14,26,0.95); border: 1px solid #2fe8a8; box-shadow: 0 0 6vw rgba(47,232,168,0.4); transform-origin: 50% 100%; }
#tr .sellp span { padding: 2.2vw 3.2vw; border-radius: 2vw; font: 700 3.4vw/1 'Chakra Petch'; letter-spacing: 0.06em; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.25); }
#tr .sellp span.s { background: linear-gradient(180deg, #ffe08a, #ffcf5c 50%, #f08a24); color: #2a1400; border-color: #fff0b8; }
#tr .agi { font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif; text-transform: none; font-weight: 500; font-size: 11.6vw; line-height: 1; white-space: nowrap; }
#tr .agi span { display: inline-block; background: linear-gradient(180deg, #ffffff 10%, #cfe6ff 45%, #8fb8ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
#trflash, #trfade { position: fixed; inset: 0; z-index: 59; pointer-events: none; opacity: 0; }
#trfade { z-index: 58; background: #000; }
`;

export class Trailer {
  time = 0;
  done = false;
  duration = 0;
  /** Sound cues gathered while the trailer runs: [time, kind, a, b] */
  cues: [number, string, number, string][] = [];
  private shots: Shot[] = [];
  private idx = -1;
  private st = 0;
  private sim!: Sim;
  private simSpeed = 1;
  private root: HTMLElement;
  private els = new Map<string, HTMLElement>();
  private flashEl: HTMLElement;
  private fadeEl: HTMLElement;
  private flashA = 0;
  private fade = 1;
  private cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 32, roll: 0 };
  private bolts: Bolt[] = [];
  private v = new THREE.Vector3();
  private wrap = false; // lane enemies loop instead of reaching the Core
  private ready = false;
  private last = 0;
  // actors
  private hero: Partial<Record<Family, Tower>> = {};
  private props: Tower[] = [];
  private opus!: Tower; private cmax: Tower | null = null; private cuse!: Tower;
  private hpA = 1; private hpB = 1;
  private boss: Enemy | null = null;
  private bossFrac = 1;
  private flags = new Set<string>();
  private scene = '';

  constructor(private engine: Engine, private view: GameView, private manual: boolean, from: string) {
    document.getElementById('ui')!.style.display = 'none';
    document.getElementById('boot')?.remove();
    const st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    const font = document.createElement('link'); font.rel = 'stylesheet'; font.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&display=swap'; document.head.appendChild(font);
    this.root = document.createElement('div'); this.root.id = 'tr';
    this.flashEl = document.createElement('div'); this.flashEl.id = 'trflash';
    this.fadeEl = document.createElement('div'); this.fadeEl.id = 'trfade';
    document.body.append(this.fadeEl, this.flashEl, this.root);
    engine.autoDpr = false;
    engine.maxDpr = 3;
    engine.setQuality('high');
    engine.resize(window.innerWidth, window.innerHeight);
    engine.cine = this.cam;
    // the film is watched as video, where bloom smears detail: keep glows tight
    engine.bloom.strength = 0.2; engine.bloom.radius = 0.38; engine.bloom.threshold = 0.96;
    engine.grade.uniforms.uAberration.value = 0.0008;
    view.onEvent = (ev) => this.onEvent(ev);
    this.build();
    this.duration = this.shots.reduce((a, s) => a + s.dur, 0);
    if (from) {
      const i = this.shots.findIndex((s) => s.name === from);
      if (i > 0) { this.idx = i - 1; this.time = this.shots.slice(0, i).reduce((a, s) => a + s.dur, 0); this.st = 1e9; this.fade = 0; }
    }
    const fonts = (document as Document & { fonts?: { load(f: string): Promise<unknown>; ready: Promise<unknown> } }).fonts;
    const go = () => { this.ready = true; if (!this.manual) { this.last = performance.now(); requestAnimationFrame((t) => this.loop(t)); } };
    if (fonts) Promise.all([fonts.load("500 40px 'Cinzel'"), fonts.load("700 40px 'Chakra Petch'"), fonts.ready]).then(go, go); else go();
    setTimeout(() => { if (!this.ready) go(); }, 4000);
  }

  isReady() { return this.ready; }

  private loop(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.advance(dt);
    if (!this.done) requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------------ plumbing
  /** Advance the film by dt seconds and render one frame. */
  advance(dt = 1 / 30, render = true): boolean {
    if (this.done) return true;
    let shot = this.shots[this.idx];
    if (!shot || this.st >= shot.dur - 1e-6) {
      this.st = shot && this.st < 1e8 ? Math.max(0, this.st - shot.dur) : 0;
      this.idx++;
      shot = this.shots[this.idx];
      if (!shot) { this.done = true; return true; }
      this.clear();
      this.flags.clear();
      shot.enter?.();
    }
    shot.update(this.st, dt);
    this.stepBolts(dt);
    const sdt = dt * this.simSpeed;
    if (sdt > 0) {
      const n = Math.max(1, Math.ceil(sdt / (1 / 30)));
      for (let i = 0; i < n; i++) {
        this.sim.step(sdt / n);
        if (this.wrap) for (const e of this.sim.enemies) if (e.dist > e.path.length - 0.8) { e.dist = 0.15; e.seg = 0; }
        if (this.boss && this.boss.alive) this.boss.hp = this.boss.maxHp * this.bossFrac;
      }
    }
    this.view.update(dt, sdt);
    this.engine.damage = 0; // no red "Core hit" vignette in the film
    if (render) this.engine.render(dt); else this.engine.tick(dt);
    this.flashA *= Math.exp(-dt * 14);
    this.flashEl.style.opacity = this.flashA < 0.01 ? '0' : this.flashA.toFixed(3);
    this.fadeEl.style.opacity = this.fade.toFixed(3);
    this.time += dt; this.st += dt;
    return false;
  }

  private once(key: string, t: number, at: number, fn: () => void) { if (t >= at && !this.flags.has(key)) { this.flags.add(key); fn(); } }
  private cue(kind: string, a = 0, b = '') { this.cues.push([this.time, kind, a, b]); }

  private flash(color = '#fff', a = 0.9) { this.flashEl.style.background = color; this.flashA = a * 0.55; this.cue('cut'); }

  private put(key: string, html: string, style: string, cls = 'e') {
    let el = this.els.get(key);
    if (!el) { el = document.createElement('div'); this.root.appendChild(el); this.els.set(key, el); }
    if (el.className !== cls) el.className = cls;
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    el.style.cssText = style;
  }
  private drop(key: string) { this.els.get(key)?.remove(); this.els.delete(key); }
  private clear() { for (const el of this.els.values()) el.remove(); this.els.clear(); }

  private setCam(c: Cam, roll = 0) { this.cam.pos.set(c[0], c[1], c[2]); this.cam.look.set(c[3], c[4], c[5]); this.cam.fov = c[6]; this.cam.roll = roll; this.engine.applyCine(); }
  private px(x: number, y: number, z: number) { return this.engine.project(x, y, z, this.v); }

  private load(level: LevelDef, theme: Theme, free: 'all' | ((c: number, r: number) => boolean) | null = null): Sim {
    const sim = new Sim(level);
    sim.demo = true; sim.tokens = 1e9; sim.autoDelay = 0.6;
    if (free) for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
      const i = r * sim.cols + c;
      if (sim.grid[i] === CELL_BLOCKED && (free === 'all' || free(c, r))) sim.grid[i] = CELL_FREE;
    }
    this.view.load(sim, theme);
    this.sim = sim; this.wrap = false; this.boss = null; this.simSpeed = 1; this.bolts.length = 0; this.scene = '';
    return sim;
  }

  /** The stage with all 48 towers; shared by the intro, the family shots and the pull-out. */
  private showroom() {
    if (this.scene === 'showroom') return;
    const sim = this.load(SHOWROOM, STAGE, 'all');
    for (const f of FAMILIES) {
      const [c0, r0] = BLOCK[f];
      const list = TOWERS.filter((t) => t.family === f);
      BLOCK_ORDER.forEach((row, ri) => row.forEach((tier, ci) => {
        const t = sim.build(list[tier - 1].id, c0 + ci, r0 + ri);
        if (t) { t.born = -9; if (tier === 12) this.hero[f] = t; }
      }));
    }
    sim.events.length = 0;
    this.lane(['trojan', 'bug', 'encryptor', 'bug', 'trojan', 'phantom', 'bug', 'encryptor', 'bug'], 13, 0.85, 4e5);
    this.warm(3);
    this.scene = 'showroom';
  }

  /** A straight lane with the four towers featured on the property cards. */
  private range() {
    if (this.scene === 'range') return;
    this.load(RANGE, THEMES[1], (cc) => cc >= 1 && cc <= 5);
    this.props = this.place(CARDS.map(([a, b, d]) => [a, b, d, 1] as Build));
    this.lane(['bug', 'glitch', 'bug', 'spam', 'bug', 'trojan'], 16, 0.7, 260);
    this.warm(2.5);
    this.scene = 'range';
  }

  shotList() { return this.shots.map((s) => ({ name: s.name, dur: s.dur, chain: !!s.chain })); }

  private place(list: Build[]) {
    const out: Tower[] = [];
    for (const [id, c, r, lv] of list) {
      const t = this.sim.build(id, c, r);
      if (!t) continue;
      for (let i = 1; i < (lv ?? 1); i++) this.sim.upgrade(t);
      t.born = -9; // no build pop
      out.push(t);
    }
    this.sim.events.length = 0;
    return out;
  }

  /** Run the battle ahead of time so a shot opens mid-fight. */
  private warm(seconds: number) {
    for (let i = 0; i < seconds * 30; i++) { this.sim.step(1 / 30); this.sim.events.length = 0; }
  }

  private battle(levelId: number, builds: Build[], wave: number, hpBoost: number, warm: number) {
    const level = LEVELS[levelId - 1];
    const sim = this.load(level, THEMES[level.world]);
    this.place(builds);
    for (const w of sim.waves) for (const g of w.groups) g.hpMult *= hpBoost;
    sim.waveIdx = wave - 2;
    sim.startWave();
    this.warm(warm);
    return sim;
  }

  private lane(types: string[], n: number, gap: number, hp: number) {
    for (let i = 0; i < n; i++) { const e = this.sim.spawnEnemy(types[i % types.length], 0, hp, 0.4 + i * gap); e.born = -9; }
    this.sim.events.length = 0;
    this.wrap = true;
  }

  private onEvent(ev: SimEvent) {
    switch (ev.t) {
      case 'shot': this.cue('shot', ev.tower!.def.splash || ev.tower!.def.tier >= 9 ? 1 : 0, ev.tower!.def.family); break;
      case 'chain': case 'strike': this.cue('zap'); break;
      case 'sniper': this.cue('sniper'); break;
      case 'rail': this.cue('rail'); break;
      case 'nova': this.cue('nova'); break;
      case 'explode': this.cue('explode', ev.r ?? 1); break;
      case 'death': this.cue('pop', ev.enemy!.def.size); break;
      case 'upgrade': this.cue('upgrade'); break;
      case 'sell': this.cue('sell'); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ scripted projectiles (the 1v1)
  private shoot(from: [number, number, number], to: [number, number, number], dur: number, arc: number, color: number, size: number, rocket: boolean, hit: () => void) {
    this.bolts.push({ fx: from[0], fy: from[1], fz: from[2], tx: to[0], ty: to[1], tz: to[2], t: 0, dur, arc, color, size, rocket, hit });
  }

  private stepBolts(dt: number) {
    const fx = this.view.fx;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const k = c01(b.t / b.dur);
      const x = lerp(b.fx, b.tx, k), z = lerp(b.fz, b.tz, k), y = lerp(b.fy, b.ty, k) + 4 * b.arc * k * (1 - k);
      fx.flash(x, y, z, b.color, b.size * 5, 0.07, 1.6);
      fx.flash(x, y, z, 0xffffff, b.size * 2.2, 0.07, 1.6);
      for (let j = 0; j < 3; j++) fx.trail(x, y, z, b.color, b.size, 0.32, 1.5);
      if (b.rocket) fx.trail(x, y, z, 0xffb060, b.size * 0.8, 0.22, 1.8);
      if (k >= 1) { b.hit(); this.bolts.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ overlays
  private title(key: string, text: string, top: string, size: number, color: string, a: number, extra = '', track = 0.06) {
    this.put(key, text, `top:${top};font:700 ${size}vw/1 'Chakra Petch';letter-spacing:${track}em;color:${color};opacity:${a.toFixed(3)};${extra}`, 'e sh');
  }

  private statCard(def: TowerDef, t: number) {
    const info = FAMILY_INFO[def.family];
    const k = eo(seg(t, 0.05, 0.4));
    const fill = eo(seg(t, 0.2, 0.9));
    const beam = def.kind === 'beam' || def.kind === 'aura';
    const dps = approxDps(def);
    const rows: [string, number, string][] = [
      ['Power', Math.log10(1 + dps) / Math.log10(2600), fmt(dps) + ' dps'],
      [beam ? 'Damage/s' : 'Damage', Math.log10(1 + def.dmg) / Math.log10(601), fmt(def.dmg)],
      ['Range', def.range >= 50 ? 1 : def.range / 6, def.range >= 50 ? 'Global' : fmt(def.range)],
    ];
    const chips = traits(def).slice(0, 4);
    const html = `<div class="eb">${info.name} · Tier ${ROMAN[def.tier - 1]}</div><h2>${def.name}</h2><div class="role">${def.role}</div>` +
      rows.map(([l, v, s]) => `<div class="row"><span>${l}</span><div class="tk"><i style="width:${(c01(v) * fill * 100).toFixed(1)}%"></i></div><b>${s}</b></div>`).join('') +
      `<div class="chips">${chips.map((c, i) => `<span class="chip" style="opacity:${seg(t, 0.45 + i * 0.1, 0.6 + i * 0.1).toFixed(2)};transform:scale(${(0.6 + 0.4 * back(seg(t, 0.45 + i * 0.1, 0.7 + i * 0.1))).toFixed(3)})">${c}</span>`).join('')}</div>`;
    this.put('card', html, `--fc:${info.css};--fc2:${info.css2};opacity:${k.toFixed(3)};transform:translateY(${((1 - k) * 12).toFixed(2)}vh)`, 'card');
  }

  private caption(text: string, t: number, at: number, bottom = '9vh') {
    const k = back(seg(t, at, at + 0.22));
    this.put('cap', `<span class="cap">${text}</span>`, `bottom:${bottom};opacity:${seg(t, at, at + 0.1).toFixed(2)};transform:scale(${(0.7 + 0.3 * k).toFixed(3)})`);
  }

  private hpBar(key: string, x: number, y: number, z: number, frac: number, color: string) {
    const p = this.px(x, y, z);
    this.put(key, `<i style="width:${(c01(frac) * 100).toFixed(1)}%;background:${frac < 0.3 ? '#ff4d6a' : color}"></i>`, `left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px`, 'hp');
  }

  // ------------------------------------------------------------------ the film
  private build() {
    const S = this.shots;
    const fx = () => this.view.fx;

    // ---------- 1. cold open + logo ----------
    S.push({
      name: 'intro', dur: 3.0,
      enter: () => {
        this.showroom();
        this.fade = 1;
      },
      update: (t) => {
        this.fade = 1 - eo(seg(t, 0.05, 0.9)) + 0.42 * seg(t, 1.15, 1.45); // dim the stage a little behind the logo
        const k = eio(seg(t, 0, 3.0));
        // glide down the lane between the four families
        this.setCam(mix([1.6, 8.2, -13.5, 0, 0.2, -1.5, 40], [-0.3, 5.0, -6.2, 0, 0.4, 2.0, 40], k), (1 - k) * 0.06);
        this.once('logo', t, 1.15, () => { this.flash('#cfe2ff', 0.85); this.engine.quake(0.5); this.cue('slam'); });
        if (t >= 1.15) {
          const a = back(seg(t, 1.15, 1.6));
          this.put('logo', '<div class="logo"><span class="logo-a">frends</span><span class="logo-b">TD</span></div>', `top:38vh;opacity:${seg(t, 1.15, 1.25).toFixed(2)};transform:scale(${(2.2 - 1.2 * a + seg(t, 1.6, 3) * 0.05).toFixed(3)})`);
          this.title('tag', 'Four AI families · One Core', '51.5vh', 3.6, '#cfd9f3', seg(t, 1.7, 2.1), '', lerp(0.5, 0.22, eo(seg(t, 1.7, 2.4))));
        }
      },
    });

    // ---------- 2. the four families ----------
    for (const f of FAMILIES) {
      const info = FAMILY_INFO[f];
      const [c0, r0] = BLOCK[f];
      const bx = c0 + 1 - 4, bz = r0 + 1.5 - 5.5, hx = bx, hz = r0 - 5.5;
      const side = bx < 0 ? -1 : 1;
      const wideA: Cam = [bx + side * 1.4, 9.4, bz + 8.6, bx, 0.3, bz - 0.5, 36];
      const wideB: Cam = [bx + side * 0.5, 7.2, bz + 7.0, bx, 0.4, bz - 0.4, 36];
      const orbit = (a: number, r: number, h: number): Cam => [hx + Math.sin(a) * r, h, hz - Math.cos(a) * r, hx, 0.8, hz + 0.25, 35];
      S.push({
        name: 'fam-' + f, dur: 3.2,
        enter: () => { this.showroom(); this.flash(info.css, 0.8); this.fade = 0; },
        update: (t) => {
          let cam: Cam;
          const a0 = -0.95 * side, a1 = 0.55 * side;
          if (t < 1.15) cam = mix(wideA, wideB, eo(seg(t, 0, 1.15)));
          else if (t < 1.7) cam = mix(wideB, orbit(a0, 4.9, 3.0), eio(seg(t, 1.15, 1.7)));
          else { const k = seg(t, 1.7, 3.2); cam = orbit(lerp(a0, a1, k * (0.75 + 0.25 * k)), lerp(4.9, 4.2, k) + ei(seg(t, 2.95, 3.2)) * 3, lerp(3.0, 2.4, k) + ei(seg(t, 2.95, 3.2)) * 2.5); }
          this.setCam(cam);
          const out = 1 - seg(t, 1.1, 1.35);
          this.title('fam', info.name, '9vh', 17, info.css, eo(seg(t, 0, 0.25)) * out, `transform:scale(${(1.5 - 0.5 * eo(seg(t, 0, 0.35))).toFixed(3)})`, lerp(0.3, 0.04, eo(seg(t, 0, 0.5))));
          this.title('tagl', info.tagline.split(' — ')[0], '19.5vh', 3.6, '#fff', seg(t, 0.25, 0.5) * out, '', 0.2);
          this.title('cnt', '12 towers · tiers I–XII', '23.5vh', 2.8, info.css2, seg(t, 0.4, 0.65) * out, '', 0.24);
          const hero = this.hero[f];
          if (hero && t > 1.75) {
            const k = eo(seg(t, 1.75, 2.1));
            this.title('heb', `${info.name} · Tier XII`, '77vh', 3.1, info.css, k, `transform:translateY(${((1 - k) * 3).toFixed(2)}vh)`, 0.26);
            this.title('hen', hero.def.name, '80.5vh', 11, '#fff', k, `transform:translateY(${((1 - k) * 3).toFixed(2)}vh)`, 0.02);
            this.title('her', hero.def.role, '87.5vh', 3.4, info.css2, seg(t, 2.0, 2.3), '', 0.2);
          }
        },
      });
    }

    // ---------- 3. pull out: all 48 ----------
    S.push({
      name: 'all48', dur: 2.2,
      enter: () => { this.showroom(); this.fade = 0; this.flash('#ffffff', 0.9); this.cue('slam'); },
      update: (t) => {
        const k = eo(seg(t, 0, 2.0));
        this.setCam(mix([1.2, 5.5, 5.5, 0, 0.6, -1.5, 40], [0, 22.5, 12.5, 0, 0, 0.2, 40], k), (1 - k) * 0.12);
        const a = seg(t, 0.35, 0.6) * (1 - seg(t, 2.0, 2.2));
        this.title('n48', '48 towers', '40vh', 15, '#fff', a, `transform:scale(${(1.6 - 0.6 * back(seg(t, 0.35, 0.75))).toFixed(3)})`, 0.02);
        this.title('n4', 'Four families. One loadout of six.', '50vh', 3.3, '#ffcf5c', seg(t, 0.8, 1.05) * (1 - seg(t, 2.0, 2.2)), '', 0.18);
      },
    });

    // ---------- 4. tower properties ----------
    CARDS.forEach(([id, c, r], i) => {
      const def = TOWER_BY_ID[id];
      const tx = c - 3, tz = r - 5.5, s = tx < 0 ? -1 : 1;
      S.push({
        name: 'prop-' + i, dur: 59 / 30,
        enter: () => {
          this.range();
          this.flash(FAMILY_INFO[def.family].css, 0.75);
          this.view.select(this.props[i] ?? null);
        },
        update: (t) => {
          const k = seg(t, 0, 59 / 30);
          const a = lerp(0.55, 0.2, eo(k)) * s;
          const rr = lerp(5.6, 4.9, eo(k));
          this.setCam([tx + Math.sin(a) * rr, lerp(3.6, 3.0, eo(k)), tz + Math.cos(a) * rr, tx - s * 0.1, -0.45, tz + 0.2, 36]);
          this.statCard(def, t);
          if (id === 'cl_opus' && this.props[i]) {
            this.once('u1', t, 0.85, () => this.sim.upgrade(this.props[i]));
            this.once('u2', t, 1.35, () => this.sim.upgrade(this.props[i]));
          }
        },
      });
    });

    // ---------- 5. battle montage ----------
    S.push({
      name: 'battle-farm', dur: 4.2,
      enter: () => { this.battle(4, B_FARM, 9, 3.5, 15); this.flash('#bfe8ff', 0.9); this.cue('slam'); },
      update: (t) => {
        const k = eio(seg(t, 0, 4.2));
        this.setCam(mix([-2.5, 21, 15, 0, 0, 0.6, 40], [3.2, 3.4, 7.4, -1.0, 0.4, 0.2, 36], k), (1 - k) * -0.1);
        this.title('w', 'World 1 — Server Farm', '86vh', 3.4, '#35e0ff', seg(t, 0.3, 0.6) * (1 - seg(t, 3.8, 4.2)), '', 0.24);
        this.title('w2', 'Hold the line', '89.5vh', 7.5, '#fff', seg(t, 0.45, 0.75) * (1 - seg(t, 3.8, 4.2)), '', 0.04);
      },
    });
    S.push({
      name: 'battle-latent', dur: 3.8,
      enter: () => { this.battle(7, B_LATENT, 9, 6, 17); this.flash('#f0c8ff', 0.9); this.cue('slam'); },
      update: (t) => {
        const k = seg(t, 0, 3.8), a = lerp(-0.9, 0.5, eio(k));
        this.setCam([Math.sin(a) * 9.5, lerp(3.0, 4.6, k), 1.5 + Math.cos(a) * 9.5, 0, 0.5, 1.2, 38], Math.sin(t * 1.3) * 0.02);
        this.title('w', 'World 2 — Latent Space', '86vh', 3.4, '#e052ff', seg(t, 0.3, 0.6) * (1 - seg(t, 3.4, 3.8)), '', 0.24);
        this.title('w2', '17 kinds of trouble', '89.5vh', 7.5, '#fff', seg(t, 0.45, 0.75) * (1 - seg(t, 3.4, 3.8)), '', 0.04);
      },
    });
    S.push({
      name: 'battle-sing', dur: 3.8,
      enter: () => { this.battle(12, B_SING, 12, 5, 17); this.flash('#ffd9a8', 0.9); this.cue('slam'); },
      update: (t) => {
        const k = seg(t, 0, 3.8), a = lerp(0.85, -0.35, eio(k));
        const r = lerp(12.5, 7.2, eio(k));
        this.setCam([Math.sin(a) * r, lerp(7.5, 3.0, eio(k)), 0.5 + Math.cos(a) * r, 0, 0.5, -0.5, 38]);
        this.title('w', 'World 3 — Singularity', '86vh', 3.4, '#ffa23a', seg(t, 0.3, 0.6) * (1 - seg(t, 3.4, 3.8)), '', 0.24);
        this.title('w2', 'Everything. At once.', '89.5vh', 7.5, '#fff', seg(t, 0.45, 0.75) * (1 - seg(t, 3.4, 3.8)), '', 0.04);
      },
    });

    // ---------- 6. the 1v1: Opus vs Codex Max ----------
    const A: [number, number, number] = [0, 0, 2], B: [number, number, number] = [0, 0, -2], C: [number, number, number] = [2, 0, 2];
    const aim = () => {
      this.opus.aimX = 0; this.opus.aimZ = -4;
      if (this.cmax) { this.cmax.aimX = 0; this.cmax.aimZ = 4; }
    };
    const bars = (showB = true) => {
      this.hpBar('hpa', A[0], 2.35, A[2], this.hpA, '#ff8f63');
      if (showB && this.cmax) this.hpBar('hpb', B[0], 2.5, B[2], this.hpB, '#2fe8a8'); else this.drop('hpb');
    };
    const rock = (t: Tower | null, amt: number) => {
      const v = t && this.view.towers.get(t.id);
      if (v) { v.group.rotation.z = Math.sin(this.time * 38) * amt; v.group.rotation.x = Math.cos(this.time * 31) * amt * 0.6; }
    };
    let wobA = 0, wobB = 0;
    const decay = (dt: number) => { wobA *= Math.exp(-dt * 4); wobB *= Math.exp(-dt * 4); rock(this.opus, wobA); rock(this.cmax, wobB); };

    S.push({
      name: 'vs-a', dur: 20 / 30,
      enter: () => {
        this.load(ARENA, THEMES[0], 'all');
        const [o, m, u] = this.place([['cl_opus', 3, 6, 3], ['cx_max', 3, 2, 3], ['cl_computer', 5, 6, 2]]);
        this.opus = o; this.cmax = m; this.cuse = u;
        this.hpA = 1; this.hpB = 1; wobA = 0; wobB = 0;
        aim(); this.warm(0.5);
        this.flash('#ff8f63', 0.9); this.cue('slam');
      },
      update: (t, dt) => {
        aim(); decay(dt);
        const k = eo(seg(t, 0, 0.65));
        this.setCam([lerp(2.6, 1.9, k), 1.5, lerp(5.2, 4.6, k), 0, 0.95, 2, 30]);
        this.title('p1', 'Claude', '70vh', 4, '#ff8f63', 1, `transform:translateX(${((1 - eo(seg(t, 0, 0.2))) * -60).toFixed(1)}vw)`, 0.3);
        this.title('p1n', 'Opus', '74vh', 20, '#fff', 1, `transform:translateX(${((1 - eo(seg(t, 0.03, 0.25))) * -80).toFixed(1)}vw)`, 0.02);
      },
    });
    S.push({
      name: 'vs-b', dur: 20 / 30, chain: true,
      enter: () => { this.flash('#2fe8a8', 0.9); this.cue('slam'); },
      update: (t, dt) => {
        aim(); decay(dt);
        const k = eo(seg(t, 0, 0.65));
        this.setCam([lerp(-2.8, -2.1, k), 1.7, lerp(0.9, 0.3, k), 0, 1.05, -2, 30]);
        this.title('p2', 'Codex', '70vh', 4, '#2fe8a8', 1, `transform:translateX(${((1 - eo(seg(t, 0, 0.2))) * 60).toFixed(1)}vw)`, 0.3);
        this.title('p2n', 'Codex Max', '74vh', 14.5, '#fff', 1, `transform:translateX(${((1 - eo(seg(t, 0.03, 0.25))) * 80).toFixed(1)}vw)`, 0.01);
      },
    });
    S.push({
      name: 'vs-c', dur: 0.9, chain: true,
      enter: () => { this.flash('#ffffff', 1); this.engine.quake(0.9); this.cue('slam'); },
      update: (t, dt) => {
        aim(); decay(dt);
        this.setCam([lerp(5.6, 5.0, seg(t, 0, 0.9)), 4.6, 7.6, 0.1, 0.7, 0, 36]);
        this.title('vs', 'VS', '39vh', 34, '#ffcf5c', 1, `transform:scale(${(3 - 2 * back(seg(t, 0, 0.3))).toFixed(3)}) rotate(-6deg);text-shadow:0 0 6vw rgba(255,190,60,0.9),0 1vw 0 #7a3a00`, 0);
        this.title('vt', 'Friendly fire. Mostly.', '60vh', 3.4, '#fff', seg(t, 0.35, 0.55), '', 0.24);
        bars();
      },
    });
    S.push({
      name: 'vs-opus', dur: 2.3, chain: true,
      enter: () => { this.flash('#ff8f63', 0.5); },
      update: (t, dt) => {
        aim(); decay(dt);
        const k = seg(t, 0, 2.3);
        this.setCam([lerp(1.25, 0.9, k), lerp(2.2, 1.95, k), lerp(5.3, 4.9, k), 0, 0.85, -1.6, 34]);
        [0.25, 0.85, 1.45].forEach((at, i) => this.once('o' + i, t, at, () => {
          const v = this.view.towers.get(this.opus.id);
          if (v) { v.recoil = 1.8; v.flash = 1; v.activity = 1.5; }
          fx().flash(A[0], 1.25, A[2] - 0.6, 0xff8a4c, 1.3, 0.12, 1.6);
          this.cue('shot', 1, 'claude');
          this.shoot([A[0], 1.25, A[2] - 0.55], [B[0], 1.0, B[2] + 0.3], 0.42, 0.25, 0xff8a4c, 0.2, false, () => {
            fx().explosion(B[0], 0.9, B[2] + 0.2, 0xff8a4c, 1.3, true);
            this.hpB -= 0.21; wobB = 0.16; this.engine.quake(0.3); this.cue('explode', 1.4);
            fx().text(B[0], 2.2, B[2], '-62', 'dmg');
          });
        }));
        bars();
        this.caption('<b style="color:#ff8f63">OPUS</b> used Deliberate Orb', t, 0.15);
      },
    });
    S.push({
      name: 'vs-codex', dur: 2.5, chain: true,
      enter: () => { this.flash('#2fe8a8', 0.6); },
      update: (t, dt) => {
        aim(); decay(dt);
        const k = seg(t, 0, 2.5);
        // start behind Codex Max, then whip round to watch the missiles land
        const cam = k < 0.42 ? mix([-1.3, 2.5, -5.4, 0, 0.9, 1.4, 34], [-1.0, 2.3, -5.0, 0, 0.9, 1.6, 34], k / 0.42)
          : mix([-1.0, 2.3, -5.0, 0, 0.9, 1.6, 34], [3.4, 2.4, 5.2, 0, 0.9, 1.6, 34], eio(seg(k, 0.42, 0.7)));
        this.setCam(cam, Math.sin(t * 30) * wobA * 0.3);
        for (let i = 0; i < 6; i++) this.once('m' + i, t, 0.3 + i * 0.13, () => {
          const v = this.cmax && this.view.towers.get(this.cmax.id);
          if (v) { v.recoil = 1.6; v.flash = 1; v.activity = 1.5; }
          const sx = ((i % 3) - 1) * 0.18;
          fx().flash(B[0] + sx, 1.6, B[2] + 0.4, 0x2ee6a6, 1.0, 0.1, 1.6);
          this.cue('shot', 1, 'codex');
          const ox = Math.sin(i * 2.4) * 0.75, oz = Math.cos(i * 1.7) * 0.6;
          this.shoot([B[0] + sx, 1.6, B[2] + 0.4], [A[0] + ox, 0.5, A[2] + oz], 0.78 + i * 0.03, 2.2 + (i % 2) * 0.7, 0x2ee6a6, 0.17, true, () => {
            fx().explosion(A[0] + ox, 0.5, A[2] + oz, 0x2ee6a6, 1.2, true);
            this.hpA = Math.max(0.09, this.hpA - 0.155); wobA = 0.22; this.engine.quake(0.55); this.cue('explode', 1.6);
            fx().text(A[0] + ox * 0.5, 2.1, A[2], '-110', 'dmg');
          });
        });
        bars();
        this.caption('<b style="color:#2fe8a8">CODEX MAX</b> used Ship To Prod ×6', t, 0.15);
      },
    });
    S.push({
      name: 'vs-think', dur: 1.3, chain: true,
      enter: () => { this.cue('whoosh'); },
      update: (t, dt) => {
        aim(); decay(dt); wobA = Math.max(wobA, 0.035);
        const k = eo(seg(t, 0, 1.3));
        this.setCam([lerp(2.4, 1.7, k), lerp(1.9, 1.6, k), lerp(4.9, 4.2, k), 0, 1.0, 2, 30]);
        if (Math.random() < dt * 30) fx().burst(A[0] + (Math.random() - 0.5) * 0.5, 0.6 + Math.random(), A[2] + (Math.random() - 0.5) * 0.5, 0xff8a4c, 1, 0.8, 0.07, 0.5, -1, 0.5);
        bars(false);
        this.caption(`<b style="color:#ff8f63">OPUS</b> is thinking${'.'.repeat(1 + Math.floor(t * 4) % 3)}`, t, 0.1);
      },
    });
    S.push({
      name: 'vs-cursor', dur: 2.6, chain: true,
      enter: () => { this.flash('#ffffff', 0.5); },
      update: (t, dt) => {
        aim(); decay(dt);
        const k = seg(t, 0, 2.6);
        this.setCam([lerp(4.7, 4.2, k), lerp(4.2, 3.9, k), lerp(7.4, 7.0, k), 0.5, 1.25, 0.1, 37]);
        bars(!this.flags.has('sold'));
        const from = this.px(C[0] - 0.1, 1.9, C[2]).clone();
        const btn = this.px(B[0], 2.95, B[2]).clone();
        const pk = eio(seg(t, 0.55, 1.25));
        const cx = lerp(from.x, btn.x + this.engine.width * 0.07, pk), cy = lerp(from.y, btn.y + this.engine.width * 0.03, pk) - Math.sin(pk * Math.PI) * this.engine.height * 0.06;
        if (!this.flags.has('sold')) {
          const a = back(seg(t, 0.35, 0.6));
          this.put('panel', '<span>Upgrade</span><span class="s">Sell +1855</span>', `left:${btn.x.toFixed(1)}px;top:${btn.y.toFixed(1)}px;transform:translate(-50%,-50%) scale(${(a * (1 + (t > 1.3 ? 0.06 : 0))).toFixed(3)});opacity:${seg(t, 0.35, 0.45).toFixed(2)}`, 'sellp');
        } else this.drop('panel');
        const press = t > 1.3 && t < 1.42 ? 0.82 : 1;
        this.put('cursor', '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 2l15 9-7 1.6L9.200 20z" fill="#fff" stroke="#10182a" stroke-width="1.6" stroke-linejoin="round"/></svg>',
          `left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;width:11vw;height:11vw;right:auto;opacity:${seg(t, 0.3, 0.45).toFixed(2)};transform:scale(${press});filter:drop-shadow(0 1vw 2vw rgba(0,0,0,0.8))`);
        this.once('sold', t, 1.36, () => {
          if (this.cmax) { this.sim.sell(this.cmax); fx().explosion(B[0], 0.8, B[2], 0xffd166, 1.6, true); fx().text(B[0], 2.4, B[2], '+1855', 'gold big'); }
          this.cmax = null; this.engine.quake(0.5); this.flashA = 0.5; this.flashEl.style.background = '#ffe9a8'; this.cue('click');
        });
        this.caption(t < 1.5 ? '<b style="color:#ff8f63">CLAUDE</b> used Computer Use' : "It's super effective.", t, t < 1.5 ? 0.1 : 1.5);
      },
    });
    S.push({
      name: 'vs-gg', dur: 0.7, chain: true,
      enter: () => { fx().fountain(A[0], 0.2, A[2], 0xffd166, 40, 4, 0.12, 1.1); this.cue('upgrade'); },
      update: (t, dt) => {
        aim(); wobA = 0; decay(dt);
        const v = this.view.towers.get(this.opus.id);
        if (v) v.group.position.y = Math.abs(Math.sin(t * 9)) * 0.35 * (1 - t / 0.7);
        this.setCam([lerp(2.0, 1.6, eo(seg(t, 0, 0.7))), 1.5, 4.6, 0, 1.0, 2, 30]);
        this.title('gg', 'GG', '14vh', 30, '#ffcf5c', 1, `transform:scale(${(2 - back(seg(t, 0, 0.3))).toFixed(3)});text-shadow:0 0 6vw rgba(255,190,60,0.9)`, 0.02);
      },
    });

    // ---------- 7. finale: the Maximizer falls ----------
    S.push({
      name: 'final-boss', dur: 3.3,
      enter: () => {
        const sim = this.battle(15, B_FINAL, 20, 1.5, 0);
        // run the opening of the wave, keeping the boss alive until the script says otherwise
        let boss: Enemy | null = null;
        for (let i = 0; i < 9.5 * 30; i++) {
          sim.step(1 / 30); sim.events.length = 0;
          boss = boss ?? sim.enemies.find((e) => e.def.id === 'maximizer') ?? null;
          if (boss) boss.hp = boss.maxHp;
        }
        this.boss = boss;
        if (this.boss) { this.boss.maxHp = 1e13; this.boss.hp = 1e13; this.boss.armor = 0; }
        this.bossFrac = 1;
        this.flash('#ffb0a0', 0.9); this.cue('slam'); this.cue('riser', 3.2);
      },
      update: (t) => {
        const b = this.boss;
        const bx = b ? b.x : 0, bz = b ? b.z : -6.5;
        const k = seg(t, 0, 3.3);
        this.bossFrac = lerp(1, 0.06, eo(k));
        const a = lerp(0.9, 0.2, eio(k));
        const r = lerp(9.5, 6.6, eio(k));
        this.setCam([bx + Math.sin(a) * r, lerp(3.6, 2.0, eio(k)), bz + Math.cos(a) * r, bx, lerp(1.5, 1.9, k), bz, 40], Math.sin(t * 2.2) * 0.03);
        this.engine.quake(0.05 + k * 0.12);
        this.title('fb', 'Final boss', '80vh', 3.4, '#ff4d6a', seg(t, 0.2, 0.5), '', 0.3);
        this.title('fb2', 'The Paperclip Maximizer', '83.5vh', 6.6, '#fff', seg(t, 0.3, 0.6), '', 0.02);
        this.put('bb', `<div style="margin:0 12vw;height:2.4vw;border-radius:1.4vw;background:rgba(10,4,8,0.85);border:1px solid rgba(255,77,106,0.7);overflow:hidden"><i style="display:block;height:100%;width:${(this.bossFrac * 100).toFixed(1)}%;background:linear-gradient(180deg,#ff8fa3,#ff2d55 55%,#b3123a)"></i></div>`, `top:91vh;opacity:${seg(t, 0.3, 0.6).toFixed(2)}`);
      },
    });
    let ex = 0, ez = 0;
    S.push({
      name: 'final-boom', dur: 2.2, chain: true,
      enter: () => {
        const b = this.boss;
        ex = b ? b.x : 0; ez = b ? b.z : -6.5;
        if (b && b.alive) { this.boss = null; b.hp = 1; this.sim.damage(b, 1e9, null, 1, 1, true); }
        this.flash('#ffffff', 1.0); this.engine.quake(3.2); this.cue('boom');
        const f = fx();
        f.explosion(ex, 1.2, ez, 0xffffff, 3.2, true);
        f.ring(ex, 0.05, ez, 0xff7a2a, 0.5, 13, 1.3, 0.05, 0.25, 2.2);
        f.ring(ex, 0.05, ez, 0xffffff, 0.3, 8, 0.8, 0.08, 0.3, 2);
        f.burst(ex, 1.4, ez, 0xdfe6f0, 90, 9, 0.14, 1.4, 5, 0.5, 2.6);
      },
      update: (t, dt) => {
        const f = fx();
        if (t < 1.5 && Math.random() < dt * 16) {
          const a = Math.random() * 6.28, d = Math.random() * (1 + t * 5);
          const x = ex + Math.cos(a) * d, z = ez + Math.sin(a) * d * 0.9 + t * 2.5;
          f.explosion(x, 0.4 + Math.random() * 1.2, z, [0xff7a2a, 0xffd166, 0xff2d55, 0xffffff][Math.floor(Math.random() * 4)], 1.2 + Math.random() * 1.4, true);
          this.cue('explode', 2);
          this.engine.quake(1.2 + Math.random() * 0.9);
        }
        if (t < 1.6) this.engine.quake(lerp(2.2, 0.9, t / 1.6));
        const k = eo(seg(t, 0, 2.0));
        this.setCam(mix([ex + 1.8, 2.0, ez + 6.4, ex, 1.6, ez, 42], [0.5, 20, 15.5, 0, 0, 0, 42], k), Math.sin(t * 23) * 0.05 * (1 - k));
        const a = seg(t, 0.95, 1.1);
        this.title('vic', 'Victory', '41vh', 19, '#ffcf5c', a * (1 - seg(t, 2.0, 2.2)), `transform:scale(${(2.4 - 1.4 * back(seg(t, 0.95, 1.3))).toFixed(3)});text-shadow:0 0 7vw rgba(255,190,60,0.95),0 1vw 0 #7a3a00`, 0.04);
        this.once('vs', t, 0.95, () => { this.cue('slam'); this.cue('win'); });
        this.fade = ei(seg(t, 1.75, 2.2));
        this.flashEl.style.background = '#fff';
        if (t > 1.6 && t < 1.8) this.flashA = Math.max(this.flashA, 0.5);
      },
    });

    // ---------- 8. "AGI is here" ----------
    const word = 'AGI is here';
    S.push({
      name: 'agi', dur: 6.4,
      enter: () => {
        const sim = this.load(SHOWROOM, STAGE, 'all');
        sim.events.length = 0;
        this.fade = 1; this.flashA = 0;
        this.cue('agi');
      },
      update: (t) => {
        this.fade = 1 - eio(seg(t, 0.7, 2.6)) * 0.93;
        const k = seg(t, 0, 6.4);
        // slow push toward the Core, alone in the dark
        this.setCam([lerp(0.5, 0.15, k), lerp(1.9, 1.5, k), lerp(11.6, 10.2, k), 0, lerp(0.15, 0.3, k), 5.5, 26], Math.sin(t * 0.4) * 0.012);
        this.put('veil', '', `top:0;bottom:0;background:radial-gradient(ellipse 62% 30% at 50% 37%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.97) 100%);opacity:${seg(t, 0.6, 1.4).toFixed(2)}`);
        const glow = 0.55 + 0.45 * Math.sin(t * 1.7);
        const letters = [...word].map((ch, i) => {
          const a = eo(seg(t, 2.3 + i * 0.16, 3.3 + i * 0.16));
          return `<span style="opacity:${a.toFixed(3)};filter:blur(${((1 - a) * 1.6).toFixed(2)}vw);transform:translateY(${((1 - a) * 2.2).toFixed(2)}vw) scale(${(1.25 - 0.25 * a).toFixed(3)});min-width:${ch === ' ' ? '0.34em' : '0'}">${ch === ' ' ? '&nbsp;' : ch}</span>`;
        }).join('');
        this.put('agi', letters, `top:57vh;letter-spacing:${lerp(0.42, 0.2, eo(seg(t, 2.3, 5.6))).toFixed(3)}em;padding-left:0.2em;filter:drop-shadow(0 0 ${(1.2 + glow * 1.6).toFixed(2)}vw rgba(140,190,255,${(0.55 + glow * 0.3).toFixed(2)})) drop-shadow(0 0 6vw rgba(90,140,255,0.35))`, 'e agi');
        const line = eo(seg(t, 4.2, 5.4));
        this.put('rule', '', `top:66.2vh;left:${(50 - line * 21).toFixed(2)}vw;right:${(50 - line * 21).toFixed(2)}vw;height:1px;background:linear-gradient(90deg,transparent,rgba(190,215,255,0.9),transparent);opacity:${line.toFixed(2)}`);
        this.title('sub', 'frendsTD', '68.4vh', 2.9, '#9fb8e8', seg(t, 4.6, 5.6) * 0.85, 'text-transform:none', 0.5);
      },
    });
  }

  // ------------------------------------------------------------------ soundtrack
  /** Render the score and every recorded cue into a WAV (base64). Call after the film has run. */
  async renderAudio(cues: [number, string, number, string][] = this.cues): Promise<string> {
    const rate = 44100;
    const total = this.duration + 0.5;
    const ctx = new OfflineAudioContext(2, Math.ceil(rate * total), rate);
    const au = new AudioEngine();
    au.attachOffline(ctx);
    au.bpmOverride = 124;
    const marks: [number, string][] = [];
    let acc = 0;
    for (const s of this.shots) { marks.push([acc, s.name]); acc += s.dur; }
    const at = (name: string) => marks.find((m) => m[1] === name)?.[0] ?? 0;
    const tBattle = at('battle-farm'), tVs = at('vs-a'), tFinal = at('final-boss'), tBoom = at('final-boom'), tAgi = at('agi');
    au.renderMusic(tBoom + 1.9, (t) => (t < at('fam-gemini') ? 0.3 : t < at('prop-0') ? 0.62 : t < tBattle ? 0.5 : t < tVs ? 1 : t < tFinal ? 0.42 : 1), 1.2);
    for (const [t, kind, a, b] of [...cues].sort((x, y) => x[0] - y[0])) {
      au.clock = t;
      switch (kind) {
        case 'shot': au.shot(b, a > 0); break;
        case 'zap': au.zap(); break;
        case 'sniper': au.sniper(); break;
        case 'rail': au.rail(); break;
        case 'nova': au.nova(); break;
        case 'explode': au.explode(a); break;
        case 'pop': au.pop(a); break;
        case 'upgrade': au.upgrade(); break;
        case 'sell': au.sell(); break;
        case 'click': au.click(); au.coin(); break;
        case 'win': au.win(); break;
        case 'cut': au.noise(0.22, 0.1, 7000, 500, 0.7); au.tone('sine', 150, 50, 0.25, 0.22); break;
        case 'whoosh': au.noise(0.5, 0.08, 400, 4000, 1.2); break;
        case 'slam': au.tone('sine', 110, 32, 0.7, 0.5); au.noise(0.5, 0.2, 1400, 60, 0.6, 0, 'lowpass'); au.tone('sawtooth', 220, 55, 0.35, 0.08); break;
        case 'riser': au.noise(a, 0.11, 300, 9000, 1.5); au.tone('sawtooth', 80, 640, a, 0.05, 0, au.sfxBus, a * 0.8); break;
        case 'boom':
          au.tone('sine', 90, 24, 2.4, 0.9); au.tone('sine', 55, 20, 2.8, 0.7);
          au.noise(2.6, 0.5, 2400, 40, 0.5, 0, 'lowpass'); au.noise(0.5, 0.3, 9000, 800, 0.6);
          break;
        case 'agi': {
          // a low drone, a slow chord and bells as the letters arrive
          au.tone('sine', 55, 55, 6.2, 0.22, 0.4, au.musicBus, 2.2);
          au.tone('sine', 82.4, 82.4, 6.0, 0.12, 0.6, au.musicBus, 2.4);
          for (const [f, d] of [[220, 0], [277.2, 0.05], [329.6, 0.1], [440, 0.15]] as [number, number][]) {
            au.tone('sawtooth', f, f, 5.4, 0.016, 1.0 + d, au.musicBus, 2.4);
            au.tone('sawtooth', f * 1.004, f * 1.004, 5.4, 0.016, 1.0 + d, au.musicBus, 2.4);
          }
          const bells = [659.3, 880, 987.8, 1318.5, 880, 1108.7, 1318.5, 1760, 1318.5, 1760, 2217.5];
          bells.forEach((f, i) => { au.tone('sine', f, f, 2.6, 0.06, 2.3 + i * 0.16, au.musicBus, 0.01); au.tone('triangle', f * 2, f * 2, 1.4, 0.014, 2.3 + i * 0.16, au.musicBus, 0.01); });
          au.tone('sine', 1760, 1760, 3.2, 0.05, 4.4, au.musicBus, 0.02);
          au.noise(3.0, 0.02, 6000, 9000, 2, 2.2, 'bandpass', au.musicBus);
          break;
        }
        default: break;
      }
    }
    void tAgi;
    const buf = await ctx.startRendering();
    // 16-bit stereo WAV
    const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const g = peak > 0 ? Math.min(2.2, 0.92 / peak) : 1;
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * g)) * 32767, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * g)) * 32767, true);
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
}
