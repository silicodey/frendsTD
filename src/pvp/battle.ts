import { ENEMY_BY_ID } from '../data/enemies';
import { THEMES } from '../data/levels';
import { FAMILY_INFO } from '../data/types';
import type { AudioEngine } from '../audio/audio';
import type { Engine } from '../render/engine';
import type { GameView } from '../render/view';
import type { Tower } from '../sim/sim';
import type { UI } from '../ui/ui';
import { ICON } from '../ui/icons';
import { PvpBot } from './bot';
import { HEARTS, MAX_POWER, PvpMatch, type MatchEvent, type PlayerSetup } from './match';
import { RARITY_INFO, rarityOf } from './roster';

export type DuelMode = 'ranked' | 'local' | 'practice';

export interface DuelOptions {
  mode: DuelMode;
  me: PlayerSetup;
  rival: PlayerSetup;
  rivalSkill: number;
  theme: number;
  seed: number;
  /** First duel: coach the player through summon, merge and power-up. */
  tutorial?: boolean;
}

export interface DuelHost {
  engine: Engine; view: GameView; audio: AudioEngine; ui: UI;
  canvas: HTMLCanvasElement;
  setSim(sim: PvpMatch['sim'] | null): void;
  onEnd(match: PvpMatch, opts: DuelOptions): void;
  leave(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Grab { pid: number; tower: Tower; sx: number; sy: number; moved: boolean }

/** Runs one duel: the match, the rival AI, touch input and the battle HUD. */
export class Duel {
  match: PvpMatch;
  private bot: PvpBot | null = null;
  autopilot: PvpBot | null = null; // dev/test: let the AI play your side
  paused = false;
  speed = 1;
  private root: HTMLElement;
  private grabs = new Map<number, Grab>();
  private cache: Record<string, string | number | boolean> = {};
  private endT = -1;
  private cleanup: (() => void)[] = [];
  private bannerT = 0;
  private tip = 0; // tutorial step (0 = off)
  private tipT = 0;

  constructor(private host: DuelHost, public opts: DuelOptions) {
    this.match = new PvpMatch(opts.me, opts.rival, opts.seed);
    if (opts.mode !== 'local') this.bot = new PvpBot(this.match, 1, opts.rivalSkill, opts.seed);
    host.setSim(this.match.sim);
    host.view.load(this.match.sim, THEMES[opts.theme]);
    host.view.dimOthers = true;
    host.view.showAllGains = opts.mode === 'local';
    this.root = document.createElement('div');
    this.root.id = 'pvp';
    this.root.className = `pvp ${opts.mode === 'local' ? 'local' : ''}`;
    document.getElementById('ui')!.appendChild(this.root);
    this.buildHud();
    this.bindInput();
    this.layout();
    this.banner('Duel', opts.mode === 'local' ? 'Local · first to lose 3 hearts loses' : `vs ${opts.rival.name}`);
    if (opts.tutorial) this.tip = 1;
  }

  // ------------------------------------------------------------------ HUD
  private controls(side: number) {
    const s = this.match.sides[side];
    return `
      <div class="pv-power">${s.deck.map((u, i) => {
        const r = RARITY_INFO[rarityOf(u.base)];
        return `<button class="pv-card" data-pact="power" data-side="${side}" data-i="${i}" style="--fc:${FAMILY_INFO[u.base.family].css};--rc:${r.css}" aria-label="Power up ${esc(u.base.name)}">
          <img src="${this.host.ui.thumb(u.base)}" alt="" draggable="false"><span class="pv-lv" id="pv-lv-${side}-${i}">1</span><span class="pv-cost" id="pv-pc-${side}-${i}"></span></button>`;
      }).join('')}</div>
      <div class="pv-act">
        <div class="pv-hearts" id="pv-hearts-${side}"></div>
        <button class="pv-summon" data-pact="summon" data-side="${side}" id="pv-sum-${side}"><span class="pv-sum-t">Summon</span><span class="pv-sum-c">${ICON.compute}<b id="pv-sc-${side}">10</b></span></button>
        <div class="pv-compute" id="pv-cp-${side}">${ICON.compute}<b>100</b></div>
      </div>`;
  }

  private buildHud() {
    const m = this.match, local = this.opts.mode === 'local';
    const rival = m.sides[1];
    this.root.innerHTML = `
      <div class="pv-top ${local ? 'flip' : ''}">
        ${local ? this.controls(1) : `
        <div class="pv-rival">
          <div class="pv-who"><span class="pv-avatar">${esc(rival.name[0] ?? '?')}</span><div><b>${esc(rival.name)}</b><i>${ICON.elo}${rival.elo}</i></div></div>
          <div class="pv-hearts" id="pv-hearts-1"></div>
          <div class="pv-rdeck">${rival.deck.map((u, i) => `<span class="pv-mini" style="--rc:${RARITY_INFO[rarityOf(u.base)].css}"><img src="${this.host.ui.thumb(u.base)}" alt="${esc(u.base.name)}"><i id="pv-lv-1-${i}">1</i></span>`).join('')}</div>
        </div>`}
        ${local ? '' : `<button class="icon-btn pv-menu" data-pact="menu" aria-label="Menu">${ICON.pause}</button>`}
      </div>
      <div class="pv-mid"><div class="pv-wave" id="pv-wave">Get ready</div>${local ? `<button class="icon-btn pv-menu" data-pact="menu" aria-label="Menu">${ICON.pause}</button>` : ''}</div>
      <div class="pv-banner" id="pv-banner" hidden></div>
      <div class="pv-coach" id="pv-coach" hidden></div>
      <div class="pv-bot">${this.controls(0)}</div>`;
    const onClick = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pact]');
      if (!el || this.paused) { if (el?.dataset.pact === 'menu') this.menu(); return; }
      const side = Number(el.dataset.side ?? 0);
      if (el.dataset.pact === 'summon') { if (!this.match.summon(side)) this.host.audio.deny(); }
      else if (el.dataset.pact === 'power') { if (!this.match.powerUp(side, Number(el.dataset.i))) this.host.audio.deny(); }
      else if (el.dataset.pact === 'menu') this.menu();
    };
    this.root.addEventListener('click', onClick);
  }

  layout() {
    const top = this.root.querySelector('.pv-top')?.getBoundingClientRect().height ?? 80;
    const bot = this.root.querySelector('.pv-bot')?.getBoundingClientRect().height ?? 170;
    const e = this.host.engine;
    e.setBounds(this.match.sim.cols, this.match.sim.rows, top - 6, bot - 10);
    const mid = this.root.querySelector<HTMLElement>('.pv-mid');
    if (mid) {
      const p = e.project(0, 0, this.match.sim.cellZ(4));
      mid.style.top = `${p.y}px`;
    }
  }

  private set(id: string, val: string | number | boolean, apply: (el: HTMLElement) => void) {
    if (this.cache[id] === val) return;
    this.cache[id] = val;
    const el = this.root.querySelector<HTMLElement>('#' + id);
    if (el) apply(el);
  }

  private updateHud() {
    const m = this.match;
    for (let side = 0; side < 2; side++) {
      const s = m.sides[side];
      this.set(`pv-hearts-${side}`, s.hearts, (el) => { el.innerHTML = Array.from({ length: HEARTS }, (_, i) => `<span class="hp ${i < s.hearts ? 'on' : ''}">${ICON.heart}</span>`).join(''); });
      for (let i = 0; i < s.deck.length; i++) {
        this.set(`pv-lv-${side}-${i}`, s.power[i], (el) => { el.textContent = s.power[i] >= MAX_POWER ? 'MAX' : `Lv${s.power[i]}`; });
        const cost = m.powerCost(side, i);
        this.set(`pv-pc-${side}-${i}`, `${cost}:${s.compute >= cost}`, (el) => {
          el.innerHTML = Number.isFinite(cost) ? `${ICON.compute}${cost}` : '';
          el.parentElement!.classList.toggle('ok', s.compute >= cost);
          el.parentElement!.classList.toggle('max', !Number.isFinite(cost));
        });
      }
      const sc = m.summonCost(side), full = m.freeSlots(side).length === 0;
      this.set(`pv-sc-${side}`, sc, (el) => { el.textContent = String(sc); });
      this.set(`pv-sum-${side}`, `${s.compute >= sc}:${full}`, (el) => {
        el.classList.toggle('ok', s.compute >= sc && !full);
        el.classList.toggle('full', full);
        el.querySelector('.pv-sum-t')!.textContent = full ? 'Board full' : 'Summon';
      });
      this.set(`pv-cp-${side}`, Math.floor(s.compute), (el) => { el.querySelector('b')!.textContent = String(Math.floor(s.compute)); });
    }
    const boss = [0, 1].some((sd) => m.bossAlive(sd));
    const label = m.wave === 0 ? `First wave in ${Math.ceil(m.waveTime())}` : `Wave ${m.wave} · ${mmss(m.waveTime())}${(m.wave + 1) % 4 === 0 ? ' · boss next' : ''}`;
    this.set('pv-wave', `${label}:${boss}`, (el) => { el.textContent = boss ? `Wave ${m.wave} · BOSS` : label; el.classList.toggle('boss', boss); });
  }

  banner(title: string, sub = '', cls = '') {
    const el = this.root.querySelector<HTMLElement>('#pv-banner');
    if (!el) return;
    el.hidden = false;
    el.className = `pv-banner show ${cls}`;
    el.innerHTML = `<b>${esc(title)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}`;
    this.bannerT = 2.2;
  }

  menu() {
    if (this.match.ended) return;
    this.paused = true;
    const ranked = this.opts.mode === 'ranked';
    this.host.ui.openModal(`<div class="sheet small" data-noclose><h2>Paused</h2>
      <div class="btn-col">
        <button class="btn primary big wide" data-act="duel-resume">${ICON.play}<span>Resume</span></button>
        <button class="btn wide danger" data-act="duel-forfeit">${ranked ? 'Forfeit (counts as a loss)' : 'Leave duel'}</button>
      </div></div>`);
  }

  resume() { this.host.ui.closeModal(); this.paused = false; }
  forfeit() {
    this.host.ui.closeModal();
    this.paused = false;
    const m = this.match;
    if (!m.ended) { m.sides[0].hearts = 0; m.ended = true; m.winner = 1; m.events.push({ t: 'end', side: 1 }); }
  }

  // ------------------------------------------------------------------ input: drag a unit onto its twin to merge
  private sideAt(r: number) { return this.match.sideOfCell(r); }
  private canControl(side: number) { return side === 0 || this.opts.mode === 'local'; }

  private towerAtPoint(x: number, y: number): Tower | null {
    const p = this.host.engine.pick(x, y);
    if (!p) return null;
    const [c, r] = this.match.sim.worldToCell(p.x, p.z);
    return this.match.sim.towerAt(c, r);
  }

  private targetsFor(t: Tower) { return new Set(this.match.units(t.side).filter((u) => this.match.canMerge(t, u)).map((u) => u.id)); }

  private refreshTargets() {
    const v = this.host.view;
    v.mergeTargets.clear();
    v.drags.clear();
    for (const g of this.grabs.values()) {
      if (!g.moved) continue;
      for (const id of this.targetsFor(g.tower)) v.mergeTargets.add(id);
    }
  }

  /** On touch the dragged unit floats a little ahead of the finger, toward the far side of the player's own board. */
  private lift(e: PointerEvent, g: Grab) { return e.pointerType === 'mouse' ? 0 : g.tower.side === 1 && this.opts.mode === 'local' ? -30 : 30; }

  private bindInput() {
    const el = this.host.canvas;
    const down = (e: PointerEvent) => {
      if (this.paused || this.match.ended) return;
      const t = this.towerAtPoint(e.clientX, e.clientY);
      if (!t || !this.canControl(t.side) || !this.match.units(t.side).includes(t)) return;
      el.setPointerCapture?.(e.pointerId);
      this.grabs.set(e.pointerId, { pid: e.pointerId, tower: t, sx: e.clientX, sy: e.clientY, moved: false });
    };
    const move = (e: PointerEvent) => {
      const g = this.grabs.get(e.pointerId);
      if (!g) return;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) { g.moved = true; this.refreshTargets(); }
      if (!g.moved) return;
      const p = this.host.engine.pick(e.clientX, e.clientY - this.lift(e, g));
      if (p) this.host.view.drags.set(g.tower.id, { x: p.x, z: p.z });
    };
    const up = (e: PointerEvent) => {
      const g = this.grabs.get(e.pointerId);
      if (!g) return;
      this.grabs.delete(e.pointerId);
      this.host.view.drags.delete(g.tower.id);
      if (g.moved) {
        const target = this.towerAtPoint(e.clientX, e.clientY - this.lift(e, g)) ?? this.towerAtPoint(e.clientX, e.clientY);
        if (target && target !== g.tower && this.match.canMerge(g.tower, target) && e.type === 'pointerup') this.match.merge(g.tower, target);
        else if (target && target !== g.tower) this.host.audio.deny();
      } else if (e.type === 'pointerup') this.info(g.tower);
      this.refreshTargets();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const key = (e: KeyboardEvent) => {
      if (this.paused || this.match.ended) { if (e.key === 'Escape' && this.paused) this.resume(); return; }
      if (e.key === ' ') { e.preventDefault(); if (!this.match.summon(0)) this.host.audio.deny(); }
      else if (e.key >= '1' && e.key <= '5') { if (!this.match.powerUp(0, Number(e.key) - 1)) this.host.audio.deny(); }
      else if (e.key === 'Escape') this.menu();
    };
    window.addEventListener('keydown', key);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    });
  }

  /** Tap a unit: a short card about it, and a hint about what it merges with. */
  private info(t: Tower) {
    const s = this.match.sides[t.side];
    const spec = s.deck[t.ext.deck];
    const twins = this.match.units(t.side).filter((u) => this.match.canMerge(t, u)).length;
    const hint = t.rank >= 7 ? 'Maximum rank.' : twins ? `Drag onto ${twins === 1 ? 'its twin' : `one of ${twins} twins`} to merge into a random rank ${t.rank + 1} unit.` : `Needs another rank ${t.rank} ${spec.base.name} to merge.`;
    this.host.ui.say(`${spec.base.name} · rank ${t.rank} · power Lv${s.power[t.ext.deck]}. ${hint}`);
    this.host.view.mergeTargets = this.targetsFor(t);
    setTimeout(() => { if (!this.grabs.size) this.host.view.mergeTargets.clear(); }, 1200);
  }

  // ------------------------------------------------------------------ events → sound and callouts
  private onEvent(ev: MatchEvent) {
    const a = this.host.audio, fx = this.host.view.fx, mine = ev.side === 0 || this.opts.mode === 'local';
    switch (ev.t) {
      case 'summon': if (mine) a.build(); break;
      case 'merge':
        if (mine) a.upgrade();
        if (ev.text && ev.tower) fx.text(ev.tower.x, 1.6, ev.tower.z, ev.text.toUpperCase(), 'up');
        break;
      case 'power': {
        if (mine) a.upgrade();
        const s = this.match.sides[ev.side];
        const i = s.deck.findIndex((u) => u.base.id === ev.kind);
        for (const t of this.match.units(ev.side)) if (t.ext.deck === i) fx.fountain(t.x, 0.2, t.z, 0xffd166, 8, 2.2, 0.08, 0.6);
        const card = this.root.querySelector(`[data-pact="power"][data-side="${ev.side}"][data-i="${i}"]`);
        card?.classList.remove('pulse'); void (card as HTMLElement | null)?.offsetWidth; card?.classList.add('pulse');
        break;
      }
      case 'heart': {
        if (ev.side === 0 || this.opts.mode === 'local') { a.leak(); this.host.engine.damage = Math.min(1, this.host.engine.damage + 0.4); try { navigator.vibrate?.(60); } catch { /* */ } }
        const el = this.root.querySelector(`#pv-hearts-${ev.side}`);
        el?.classList.remove('hit'); void (el as HTMLElement | null)?.offsetWidth; el?.classList.add('hit');
        break;
      }
      case 'wave': a.wave(ev.n! % 4 === 0); if (ev.n! % 4 !== 0) this.banner(`Wave ${ev.n}`, ev.n! > 14 ? 'Overtime: enemies grow fast' : ''); break;
      case 'boss': this.banner(ENEMY_BY_ID[ev.kind!]?.name ?? 'Boss', 'Boss on both lanes', 'boss'); break;
      case 'bossCast':
        if (ev.side === 0 || this.opts.mode === 'local') { this.host.ui.say(ev.text ?? 'Boss ability'); a.jam(); }
        if (ev.x !== undefined) fx.ring(ev.x, 0.05, ev.z!, 0xff3d6a, 0.2, 1.6, 0.5, 0.12, 0.3);
        if (ev.kind === 'drain' && ev.tower) fx.text(ev.tower.x, 1.5, ev.tower.z, 'RANK −1', 'dmg');
        break;
      case 'ability':
        if (ev.tower) fx.text(ev.tower.x, 1.55, ev.tower.z, (ev.text ?? '').toUpperCase(), 'ability');
        break;
      case 'end': this.endT = 1.6; break;
      default: break;
    }
  }

  /** Advance one frame. Returns simulated seconds (for effect trails). */
  update(dt: number): number {
    const m = this.match;
    let simDt = 0;
    if (!this.paused && !m.ended) {
      for (let i = 0; i < this.speed; i++) {
        this.bot?.update(dt);
        this.autopilot?.update(dt);
        m.step(dt);
        simDt += dt;
      }
    } else if (m.ended && this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) { this.endT = -1; this.host.onEnd(m, this.opts); }
    }
    // a unit that merged or vanished mid-drag drops the drag
    for (const [pid, g] of this.grabs) if (!m.sim.towers.includes(g.tower)) { this.grabs.delete(pid); this.host.view.drags.delete(g.tower.id); this.refreshTargets(); }
    for (const ev of m.events) { this.onEvent(ev); this.coachEvent(ev); }
    m.events.length = 0;
    this.coach(dt);
    this.updateHud();
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.root.querySelector<HTMLElement>('#pv-banner')!.hidden = true; }
    return simDt;
  }

  // ------------------------------------------------------------------ first-duel coach
  private coachEvent(ev: MatchEvent) {
    if (!this.tip || ev.side !== 0) return;
    if (this.tip === 1 && ev.t === 'summon' && this.match.sides[0].summons >= 2) this.next();
    else if (this.tip === 2 && ev.t === 'merge') this.next();
    else if (this.tip === 3 && ev.t === 'power') this.next();
  }

  private next() { this.tip++; this.tipT = 0; if (this.tip > 4) this.tip = 0; }

  private coach(dt: number) {
    const el = this.root.querySelector<HTMLElement>('#pv-coach');
    if (!el) return;
    const m = this.match;
    this.tipT += dt;
    let text = '';
    if (this.tip === 1) text = 'Tap <b>Summon</b> to deploy a random unit from your deck. Each summon costs a little more compute.';
    else if (this.tip === 2) {
      const twins = m.units(0).some((a) => m.units(0).some((b) => m.canMerge(a, b)));
      text = twins ? 'Two identical units of the same rank glow when you drag. <b>Drag one onto its twin</b> to merge them into a stronger random unit.' : 'Keep summoning. When two identical units of the same rank appear, you can merge them.';
    } else if (this.tip === 3) {
      if (m.sides[0].compute >= 100 || this.tipT > 25) text = 'Spare compute? <b>Tap a unit card</b> below to power up every unit of that type for the rest of the match.';
    } else if (this.tip === 4) {
      text = 'A <b>boss</b> arrives every 4th wave on both lanes. A boss that gets through costs 2 hearts.';
      if (this.tipT > 7) this.next();
    }
    if (this.paused || m.ended) text = '';
    this.set('pv-coach', text, (e) => { e.hidden = !text; e.innerHTML = text; });
    void el;
  }

  dispose() {
    for (const f of this.cleanup) f();
    this.root.remove();
    this.host.view.drags.clear();
    this.host.view.mergeTargets.clear();
    this.host.view.dimOthers = false;
  }
}
