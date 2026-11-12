import './style.css';
import { AudioEngine } from './audio/audio';
import { ENEMIES } from './data/enemies';
import { LEVELS, THEMES } from './data/levels';
import { TOWERS, TOWER_BY_ID } from './data/towers';
import { Engine } from './render/engine';
import { Thumbs } from './render/thumbs';
import { GameView } from './render/view';
import { Save } from './save';
import { Bot } from './sim/bot';
import { Sim, TARGET_MODES, type SimEvent, type Tower } from './sim/sim';
import { UI, type AppApi } from './ui/ui';

const TAP_SLOP = 10;

class App implements AppApi {
  engine: Engine;
  view: GameView;
  thumbs: Thumbs;
  audio = new AudioEngine();
  save = new Save();
  ui: UI;
  sim: Sim | null = null;
  private bot: Bot | null = null;
  mode: 'menu' | 'game' = 'menu';
  paused = false;
  speed = 1;
  selCard: string | null = null;
  selTower: Tower | null = null;
  private levelId = 1;
  private last = performance.now();
  private ended = false;
  private endTimer = 0;
  // input
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean }>();
  private pinch: { d: number; zoom: number } | null = null;
  private aiming = false;
  private drag: { id: string; sx: number; sy: number; active: boolean; pid: number } | null = null;
  private ghostCell: { c: number; r: number; on: boolean } = { c: 0, r: 0, on: false };
  private slowT = 0;
  private autoQ: 'high' | 'medium' | 'low' = 'high';
  private tutStep = 0;
  private tutT = 0;
  private camEl = 0.96;
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.engine = new Engine(this.canvas);
    this.engine.resize(window.innerWidth, window.innerHeight);
    this.view = new GameView(this.engine, document.getElementById('fx-text'));
    this.view.onEvent = (ev) => this.onSimEvent(ev);
    this.thumbs = new Thumbs(this.engine);
    this.ui = new UI(document.getElementById('ui')!, this);
    this.applySettings();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.audio.suspend(document.hidden);
      if (document.hidden && this.mode === 'game' && !this.paused && !this.ended && !this.ui.modalOpen()) { this.setPaused(true); this.ui.pause(); }
    });
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    this.attract();
    this.ui.title();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ AppApi
  click() { this.audio.click(); }
  deny() { this.audio.deny(); }
  renderNow() { this.engine.render(0); }

  applySettings() {
    const d = this.save.data;
    this.audio.setMusic(d.music);
    this.audio.setSfx(d.sfx);
    this.engine.autoDpr = true;
    this.engine.setQuality(d.quality === 'auto' ? this.autoQ : d.quality);
    this.view.fx.lowFx = this.engine.quality === 'low';
    if (this.view.board) this.view.board.key.castShadow = this.engine.quality !== 'low';
  }

  /** A self-playing battle behind the menus. */
  private attract() {
    const level = LEVELS[[3, 7, 10][Math.floor(Math.random() * 3)]];
    const sim = new Sim(level);
    sim.demo = true; sim.tokens = 2600; sim.autoDelay = 1.5;
    const tiers = level.world === 0 ? [2, 4, 5, 6, 8] : level.world === 1 ? [3, 5, 7, 9, 10] : [5, 8, 9, 11, 12];
    this.bot = new Bot(sim, TOWERS.filter((t) => tiers.includes(t.tier) && t.kind !== 'income').map((t) => t.id));
    this.sim = sim;
    this.mode = 'menu';
    this.selCard = null; this.selTower = null;
    this.view.load(sim, THEMES[level.world]);
    this.applySettings();
    this.engine.zoom = 1; this.engine.pan.set(0, 0, 0);
    this.resize();
    // warm up so the title opens on a battle already in progress
    for (let i = 0; i < 30 * 16; i++) { this.bot.update(1 / 30); sim.step(1 / 30); sim.events.length = 0; }
  }

  startLevel(id: number) {
    this.levelId = id;
    const level = LEVELS[id - 1];
    const sim = new Sim(level);
    sim.tokens = Math.round((sim.tokens * (1 + this.save.reinforcement(id))) / 10) * 10;
    this.sim = sim; this.bot = null;
    this.mode = 'game'; this.paused = false; this.speed = 1; this.ended = false;
    this.selCard = null; this.selTower = null;
    clearTimeout(this.endTimer);
    this.view.load(sim, THEMES[level.world]);
    this.applySettings();
    this.engine.zoom = 1; this.engine.pan.set(0, 0, 0); this.engine.azimuth = 0;
    this.ui.hudShow(sim);
    this.resize();
    this.tutStep = id === 1 && !this.save.data.tutorial ? 1 : 0;
    this.tutT = 0;
    this.ui.banner(level.name, `Level ${id} · ${THEMES[level.world].name}`);
  }

  restart() { this.startLevel(this.levelId); }

  quitToMenu() {
    clearTimeout(this.endTimer);
    this.ui.hudHide();
    this.attract();
  }

  setPaused(p: boolean) { this.paused = p; }
  cycleSpeed() { this.speed = this.speed >= 3 ? 1 : this.speed + 1; }

  startWave() {
    const sim = this.sim;
    if (!sim || this.mode !== 'game') return;
    if (sim.startWave()) { if (this.tutStep === 3) { this.tutStep = 4; this.tutT = 0; } } else this.audio.deny();
  }

  selectCard(id: string | null) {
    this.selCard = id;
    this.selTower = null;
    this.view.select(null);
    this.ghostCell.on = false;
    this.view.setGhost(id, 0, 0, false, false);
    if (id && this.tutStep === 1) this.tutStep = 2;
  }

  cardDown(id: string, ev: PointerEvent) {
    if (this.mode !== 'game' || this.paused) return;
    this.drag = { id, sx: ev.clientX, sy: ev.clientY, active: false, pid: ev.pointerId };
  }

  private selectTower(t: Tower | null) {
    this.selTower = t;
    this.selCard = null;
    this.view.setGhost(null, 0, 0, false);
    this.view.select(t);
    if (t) this.audio.click();
  }

  deselect() { this.selectTower(null); }

  upgradeSelected() {
    const t = this.selTower;
    if (!t || !this.sim) return;
    if (!this.sim.upgrade(t)) this.audio.deny();
  }

  sellSelected() {
    const t = this.selTower;
    if (!t || !this.sim) return;
    this.sim.sell(t);
    this.selectTower(null);
  }

  cycleTarget() {
    const t = this.selTower;
    if (!t) return;
    t.mode = TARGET_MODES[(TARGET_MODES.indexOf(t.mode) + 1) % TARGET_MODES.length];
  }

  // ------------------------------------------------------------ layout
  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.engine.resize(w, h);
    const sim = this.sim;
    if (!sim) return;
    if (this.mode === 'game') {
      const top = document.querySelector('.hud-top')?.getBoundingClientRect().height ?? 70;
      const bot = document.querySelector('.hud-bot')?.getBoundingClientRect().height ?? 170;
      this.engine.setBounds(sim.cols, sim.rows, Math.max(40, top - 14), Math.max(80, bot - 30));
    } else {
      this.engine.setBounds(sim.cols, sim.rows, h * 0.33, h * 0.2);
    }
  }

  // ------------------------------------------------------------ input
  private cellAt(x: number, y: number) {
    const sim = this.sim!;
    const p = this.engine.pick(x, y);
    if (!p) return { c: -1, r: -1, on: false };
    const [c, r] = sim.worldToCell(p.x, p.z);
    return { c, r, on: c >= 0 && r >= 0 && c < sim.cols && r < sim.rows };
  }

  private canPlace(c: number, r: number) {
    const sim = this.sim!;
    return !!this.selCard && sim.canBuild(c, r) && sim.tokens >= TOWER_BY_ID[this.selCard].cost;
  }

  private showGhost(x: number, y: number) {
    if (!this.selCard) return;
    const cell = this.cellAt(x, y);
    this.ghostCell = cell;
    this.view.setGhost(this.selCard, cell.c, cell.r, cell.on && this.canPlace(cell.c, cell.r), cell.on);
  }

  private tryBuild(c: number, r: number): boolean {
    const sim = this.sim!;
    if (!this.selCard) return false;
    const t = sim.build(this.selCard, c, r);
    if (!t) { this.audio.deny(); return false; }
    if (this.tutStep === 2) this.tutStep = 3;
    if (sim.tokens < t.def.cost) this.selectCard(null);
    else { this.ghostCell.on = false; this.view.setGhost(this.selCard, c, r, false, false); }
    return true;
  }

  private tap(x: number, y: number) {
    const sim = this.sim;
    if (!sim || this.mode !== 'game' || this.paused || this.ended) return;
    const cell = this.cellAt(x, y);
    const tower = cell.on ? sim.towerAt(cell.c, cell.r) : null;
    if (this.selCard) {
      if (tower) { this.selectTower(tower); return; }
      if (cell.on && this.canPlace(cell.c, cell.r)) { this.tryBuild(cell.c, cell.r); return; }
      if (cell.on) { this.audio.deny(); this.showGhost(x, y); if (sim.canBuild(cell.c, cell.r)) this.ui.say('Not enough tokens'); }
      else this.selectCard(null);
      return;
    }
    this.selectTower(tower);
  }

  private bindInput() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'game') return;
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.engine.zoom };
        this.aiming = false;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.mode !== 'game') return;
      const p = this.pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse' && this.selCard && !this.paused) this.showGhost(e.clientX, e.clientY); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) p.moved = true;
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.engine.zoom = Math.min(1, Math.max(0.5, this.pinch.zoom * (this.pinch.d / Math.max(20, d))));
        return;
      }
      if (!p.moved) return;
      if (this.selCard && !this.paused) {
        this.aiming = true;
        this.showGhost(e.clientX, e.clientY - (e.pointerType === 'mouse' ? 0 : 44));
      } else if (this.engine.zoom < 0.99) {
        const k = (this.engine.fitDist * this.engine.zoom) / this.engine.height * 0.62;
        this.engine.pan.x -= dx * k; this.engine.pan.z -= dy * k * 1.25;
      }
    });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!p || this.mode !== 'game') return;
      if (this.aiming) {
        this.aiming = false;
        const g = this.ghostCell;
        if (g.on && this.canPlace(g.c, g.r)) this.tryBuild(g.c, g.r);
        else if (this.selCard) { this.ghostCell.on = false; this.view.setGhost(this.selCard, 0, 0, false, false); }
        return;
      }
      if (!p.moved && e.type === 'pointerup') this.tap(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (this.mode !== 'game') return;
      e.preventDefault();
      this.engine.zoom = Math.min(1, Math.max(0.5, this.engine.zoom * (1 + Math.sign(e.deltaY) * 0.08)));
    }, { passive: false });

    // dragging a card from the build bar onto the board
    window.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pid) return;
      if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 14) {
        d.active = true;
        if (this.selCard !== d.id) this.selectCard(d.id);
      }
      if (d.active) this.showGhost(e.clientX, e.clientY - (e.pointerType === 'mouse' ? 0 : 44));
    });
    const dragEnd = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pid) return;
      this.drag = null;
      if (!d.active) {
        if (e.type === 'pointerup') { this.audio.click(); this.selectCard(this.selCard === d.id ? null : d.id); }
        return;
      }
      const g = this.ghostCell;
      if (g.on && this.canPlace(g.c, g.r)) { this.tryBuild(g.c, g.r); this.selectCard(null); }
      else this.selectCard(null);
    };
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('pointercancel', dragEnd);

    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'game' || this.ui.modalOpen()) return;
      const lo = this.save.data.loadout;
      if (e.key >= '1' && e.key <= '6' && lo[Number(e.key) - 1]) this.selectCard(this.selCard === lo[Number(e.key) - 1] ? null : lo[Number(e.key) - 1]);
      else if (e.key === ' ') { e.preventDefault(); this.startWave(); }
      else if (e.key === 'Escape') { if (this.selCard || this.selTower) { this.selectCard(null); } else { this.setPaused(true); this.ui.pause(); } }
      else if (e.key === 'f') this.cycleSpeed();
      else if (e.key === 'u') this.upgradeSelected();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------ sim events → sound + UI
  private onSimEvent(ev: SimEvent) {
    const a = this.audio;
    const game = this.mode === 'game';
    if (!game) return; // the attract battle is silent
    switch (ev.t) {
      case 'shot': { const d = ev.tower!.def; a.shot(d.family, !!d.splash || d.tier >= 9); break; }
      case 'chain': a.zap(); break;
      case 'sniper': a.sniper(); break;
      case 'rail': a.rail(); break;
      case 'strike': a.zap(); break;
      case 'nova': a.nova(); break;
      case 'explode': a.explode(ev.r ?? 1); break;
      case 'death': a.pop(ev.enemy!.def.size); if (ev.enemy!.def.boss) a.explode(3); this.ui.pulse('h-tokens'); break;
      case 'leak': a.leak(); this.ui.pulse('h-lives'); break;
      case 'build': a.build(); break;
      case 'upgrade': a.upgrade(); break;
      case 'sell': a.sell(); break;
      case 'income': a.coin(); break;
      case 'jam': a.jam(); break;
      case 'waveStart': {
        const sim = this.sim!;
        const w = sim.waves[ev.n!];
        const boss = w.groups.find((g) => ENEMIES.find((e) => e.id === g.type)?.boss);
        a.wave(!!boss);
        if (boss) this.ui.banner(ENEMIES.find((e) => e.id === boss.type)!.name, 'Boss incoming', 'boss');
        else this.ui.banner(`Wave ${ev.n! + 1}`, ev.n === sim.waves.length - 1 ? 'Final wave' : `of ${sim.waves.length}`);
        break;
      }
      case 'waveEnd': a.coin(); this.ui.pulse('h-tokens'); break;
      case 'win': this.finish(true); break;
      case 'lose': this.finish(false); break;
      default: break;
    }
  }

  private finish(won: boolean) {
    if (this.ended) return;
    this.ended = true;
    const sim = this.sim!;
    this.selectCard(null);
    if (won) this.save.data.tutorial = true;
    const n = sim.stars();
    const unlocked = won ? this.save.complete(this.levelId, n) : [];
    if (!won) this.save.data.fails[this.levelId] = (this.save.data.fails[this.levelId] ?? 0) + 1;
    this.save.write();
    this.endTimer = window.setTimeout(() => {
      if (won) this.audio.win(); else this.audio.lose();
      this.ui.result(won, this.levelId, n, sim, unlocked, (i) => this.audio.star(i));
    }, won ? 1300 : 900);
  }

  private tutorial(dt: number) {
    if (!this.tutStep) return;
    const tips = ['', 'Pick a tower from the bar below.', 'Now tap a glowing tile next to the path.', 'Build a few more, then press Start wave.', 'Tap a placed tower to upgrade or sell it. Hold the Core!'];
    if (this.tutStep === 4) { this.tutT += dt; if (this.tutT > 7) { this.tutStep = 0; this.save.data.tutorial = true; this.save.write(); this.ui.tip(null); return; } }
    this.ui.tip(this.selTower ? null : tips[this.tutStep]);
  }

  /** Dev aid (not linked from the UI): `__td.gallery('enemies' | 'all' | family)` shows every portrait. */
  gallery(kind: string, cols = 6) {
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;inset:0;overflow:auto;background:#05070d;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px;z-index:99;align-content:start`;
    const list = kind === 'enemies' ? ENEMIES.map((e) => [this.thumbs.enemy(e.id, 256), e.name]) : TOWERS.filter((t) => kind === 'all' || t.family === kind).map((t) => [this.thumbs.tower(t, 384), `${t.tier} ${t.name}`]);
    for (const [url, name] of list) { const c = document.createElement('div'); c.innerHTML = `<img src="${url}" style="width:100%;border-radius:10px;display:block"><div style="color:#fff;font:12px system-ui;text-align:center">${name}</div>`; div.appendChild(c); }
    document.body.appendChild(div);
    this.paused = true; this.mode = 'game';
  }

  // ------------------------------------------------------------ main loop
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    const sim = this.sim;
    const e = this.engine;
    let simDt = 0;
    if (sim) {
      if (this.mode === 'menu') {
        this.bot?.update(dt); sim.step(dt); simDt = dt;
        if (sim.state === 'won' || sim.state === 'lost') { this.attract(); }
        e.azimuth = Math.sin(e.time * 0.11) * 0.5;
        this.camEl += (0.74 - this.camEl) * Math.min(1, dt * 2);
        this.audio.intensity = 0;
      } else {
        if (!this.paused && !this.ui.modalOpen()) {
          for (let i = 0; i < this.speed; i++) sim.step(dt);
          simDt = dt * this.speed;
        }
        this.camEl += (0.96 - this.camEl) * Math.min(1, dt * 3);
        this.audio.intensity = this.ended ? 0.1 : sim.state === 'wave' ? (sim.enemies.some((x) => x.def.boss) ? 1 : 0.8) : 0.3;
        if (simDt > 0) for (const t of sim.towers) if (t.def.kind === 'beam' && t.targets.length) { this.audio.beam(t.def.family); break; }
        this.tutorial(dt);
        if (this.selTower && sim.towers.indexOf(this.selTower) < 0) this.selectTower(null);
        this.ui.hudUpdate(sim, this.selCard, this.selTower, this.speed);
      }
      e.elevation = this.camEl;
      this.view.update(dt, simDt);
    }
    e.render(dt);

    // automatic quality fallback when the adaptive resolution is not enough
    if (this.save.data.quality === 'auto' && e.time > 4 && raw < 0.5) {
      if (e.getFps() < 30 && e.dpr <= 0.8) this.slowT += dt; else this.slowT = Math.max(0, this.slowT - dt * 0.5);
      if (this.slowT > 3 && this.autoQ !== 'low') {
        this.autoQ = this.autoQ === 'high' ? 'medium' : 'low';
        this.slowT = 0;
        this.applySettings();
      }
    }
  }
}

const app = new App();
(window as unknown as { __td: App }).__td = app;
