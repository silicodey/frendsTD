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
import { dutyOf, subroleOf, traits } from '../data/towers';
import { SIGNATURE_BY_ID } from './signatures';
import type { OnlineSession } from '../net/client';
import { DT, HASH_EVERY, Lockstep, TICK_MS, applyCmd, matchHash, type Cmd } from '../net/protocol';

export type DuelMode = 'ranked' | 'local' | 'practice' | 'online';

export interface DuelOptions {
  mode: DuelMode;
  me: PlayerSetup;
  rival: PlayerSetup;
  rivalSkill: number;
  theme: number;
  seed: number;
  /** First duel: coach the player through summon, merge and power-up. */
  tutorial?: boolean;
  /** Online: the server connection and which side of the board is ours (1 = the top lane, shown at the bottom). */
  online?: { session: OnlineSession; side: number };
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
  /** Our side of the match (0 = bottom lane). Online, the second player is side 1 and the camera turns round. */
  readonly me: number;
  readonly foe: number;
  private lock: Lockstep | null = null;
  private apT = 0;
  /** Online watchdog: when we last forced a reconnect, and since when we've been cut off. */
  private kickedAt = 0;
  private offlineSince = 0;
  /** Time spent running smoothly without a match update (a frozen tab or a slow first frame doesn't count). */
  private staleMs = 0;
  private lastSeenTurn = 0;
  private lastNetFrame = 0;
  private rebuiltAt = 0;
  /** Set when an online match had to stop (server restarted, connection gone): shown on the result screen. */
  interrupted: string | null = null;
  private suppressClick = false;
  private net: OnlineSession | null = null;

  constructor(private host: DuelHost, public opts: DuelOptions) {
    const on = opts.online;
    this.me = on?.side ?? 0;
    this.foe = 1 - this.me;
    if (on) {
      const info = on.session.info!;
      this.net = on.session;
      this.match = new PvpMatch(info.setups[0], info.setups[1], info.seed);
      this.lock = new Lockstep(this.match, (t) => on.session.cmds.get(t));
    } else this.match = new PvpMatch(opts.me, opts.rival, opts.seed);
    if (opts.mode === 'ranked' || opts.mode === 'practice') this.bot = new PvpBot(this.match, 1, opts.rivalSkill, opts.seed);
    host.setSim(this.match.sim);
    host.view.mySide = this.me;
    host.view.load(this.match.sim, THEMES[opts.theme] ?? THEMES[0]);
    host.view.dimOthers = true;
    host.view.showAllGains = opts.mode === 'local';
    this.root = document.createElement('div');
    this.root.id = 'pvp';
    this.root.className = `pvp ${opts.mode === 'local' ? 'local' : ''} ${on ? 'online' : ''}`;
    document.getElementById('ui')!.appendChild(this.root);
    this.buildHud();
    this.bindInput();
    this.layout();
    if (!on) this.banner('Duel', opts.mode === 'local' ? 'Local · first to lose 3 hearts loses' : `vs ${opts.rival.name}`);
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
    const m = this.match, local = this.opts.mode === 'local', online = !!this.net, foe = this.foe;
    const rival = m.sides[foe];
    this.root.innerHTML = `
      <div class="pv-top ${local ? 'flip' : ''}">
        ${local ? this.controls(1) : `
        <div class="pv-rival">
          <div class="pv-who"><span class="pv-avatar">${esc(rival.name[0] ?? '?')}</span><div><b>${esc(rival.name)}</b>${online ? `<i class="pv-net" id="pv-net">${ICON.globe}<span>online</span></i>` : `<i>${ICON.elo}${rival.elo}</i>`}</div></div>
          <div class="pv-hearts" id="pv-hearts-${foe}"></div>
          <div class="pv-rdeck">${rival.deck.map((u, i) => `<span class="pv-mini" style="--rc:${RARITY_INFO[rarityOf(u.base)].css}"><img src="${this.host.ui.thumb(u.base)}" alt="${esc(u.base.name)}"><i id="pv-lv-${foe}-${i}">1</i></span>`).join('')}</div>
        </div>`}
        ${local ? '' : `<button class="icon-btn pv-menu" data-pact="menu" aria-label="Menu">${ICON.pause}</button>`}
      </div>
      <div class="pv-mid"><div class="pv-wave" id="pv-wave">Get ready</div>${local ? `<button class="icon-btn pv-menu" data-pact="menu" aria-label="Menu">${ICON.pause}</button>` : ''}</div>
      <div class="pv-banner" id="pv-banner" hidden></div>
      <div class="pv-coach" id="pv-coach" hidden></div>
      ${online ? '<div class="pv-count" id="pv-count" hidden></div><div class="pv-netmsg" id="pv-netmsg" hidden></div>' : ''}
      <div class="pv-bot">${this.controls(this.me)}</div>`;
    // long-press (or right-click) a unit card: its details instead of a power-up
    let press = 0, pressed: HTMLElement | null = null;
    const cancelPress = () => { clearTimeout(press); pressed = null; };
    this.root.addEventListener('pointerdown', (e) => {
      // a new touch starts fresh (a long-press releases over the popup, so its click never reaches us)
      this.suppressClick = false;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pact="power"]');
      if (!el || this.paused) return;
      pressed = el;
      clearTimeout(press);
      press = window.setTimeout(() => {
        if (pressed !== el) return;
        this.suppressClick = true;
        try { navigator.vibrate?.(15); } catch { /* */ }
        this.cardInfo(Number(el.dataset.side ?? 0), Number(el.dataset.i));
      }, 420);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.root.addEventListener(ev, cancelPress);
    this.root.addEventListener('contextmenu', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pact="power"]');
      if (!el) return;
      e.preventDefault();
      cancelPress();
      if (!this.paused) this.cardInfo(Number(el.dataset.side ?? 0), Number(el.dataset.i));
    });
    const onClick = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pact]');
      if (this.suppressClick) { this.suppressClick = false; return; }
      if (!el || this.paused) { if (el?.dataset.pact === 'menu') this.menu(); return; }
      const side = Number(el.dataset.side ?? 0);
      if (el.dataset.pact === 'summon') this.act(side, { k: 's' });
      else if (el.dataset.pact === 'power') this.act(side, { k: 'p', i: Number(el.dataset.i) });
      else if (el.dataset.pact === 'menu') this.menu();
    };
    this.root.addEventListener('click', onClick);
  }

  /** Do something for a side: right away offline; online, send it to the server (it lands for both players at the same tick). */
  private act(side: number, c: Cmd) {
    if (!this.canControl(side) || this.match.ended) return;
    if (c.k === 'p' && !this.match.hasType(side, c.i)) {
      this.host.audio.deny();
      this.host.ui.say(`Summon a ${this.match.sides[side].deck[c.i].base.name} first, then power it up`);
      return;
    }
    if (!this.net) { if (!applyCmd(this.match, side, c)) this.host.audio.deny(); return; }
    if (this.net.clockTick() < 0) { this.host.audio.deny(); return; }
    const m = this.match, s = m.sides[side];
    // obvious refusals get instant feedback instead of a round trip
    if (c.k === 's' && (s.compute < m.summonCost(side) || !m.freeSlots(side).length)) { this.host.audio.deny(); return; }
    if (c.k === 'p' && s.compute < m.powerCost(side, c.i)) { this.host.audio.deny(); return; }
    this.net.cmd(c);
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
        const cost = m.powerCost(side, i), has = m.hasType(side, i);
        this.set(`pv-pc-${side}-${i}`, `${cost}:${s.compute >= cost}:${has}`, (el) => {
          el.innerHTML = Number.isFinite(cost) ? `${ICON.compute}${cost}` : '';
          el.parentElement!.classList.toggle('ok', s.compute >= cost && has);
          el.parentElement!.classList.toggle('none', !has && Number.isFinite(cost));
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

  /** A unit card's details: what it does, its numbers right now, and what a power-up would add. */
  cardInfo(side: number, i: number) {
    const m = this.match, s = m.sides[side], spec = s.deck[i];
    if (!spec) return;
    const def = spec.base, d = spec.def, fam = FAMILY_INFO[def.family], r = RARITY_INFO[rarityOf(def)];
    const sig = SIGNATURE_BY_ID[def.id];
    const pl = s.power[i];
    const area = d.kind === 'nova' || d.kind === 'aura' || d.kind === 'support';
    const beam = d.kind === 'beam' || d.kind === 'aura';
    const dmg = d.dmg * spec.levelMult * (1 + 0.25 * (pl - 1));
    const units = m.units(side).filter((t) => t.ext.deck === i);
    const best = units.reduce((a, t) => Math.max(a, t.rank), 0);
    const rows: [string, string][] = [];
    if (d.dmg > 0) rows.push([beam ? 'Damage / sec (rank 1)' : 'Damage (rank 1)', dmg.toFixed(dmg < 10 ? 1 : 0)]);
    if (!beam && d.rate > 0) rows.push(['Attack speed', `${(d.rate * (d.burst ?? 1)).toFixed(2)}/s`]);
    rows.push(['Reach', area ? (d.kind === 'support' ? 'Adjacent units' : `${d.range.toFixed(1)} tiles`) : 'Whole lane']);
    rows.push(['Each rank', `+${Math.round((1.85 - 1) * 100)}% damage, +7% speed`]);
    rows.push(['Card level', String(spec.card.level)]);
    rows.push(['On the board', units.length ? `${units.length} · best rank ${best}` : 'none yet']);
    const cost = m.powerCost(side, i);
    const powerLine = !Number.isFinite(cost) ? 'Power-up maxed (Lv 5).'
      : !units.length ? `Summon one first, then power-ups cost ${cost} compute.`
      : `Next power-up (${cost} compute): +25% damage for every ${def.name} on the board${sig ? ' and a stronger special capability' : ''}.`;
    const picks = sig ? sig.talents.map((pair, tier) => pair[spec.card.talents[tier]]).filter(Boolean) : [];
    const offline = !this.net;
    if (offline) this.paused = true;
    this.host.ui.openModal(`<div class="sheet unit-sheet card-info" data-noclose style="--fc:${fam.css};--fc2:${fam.css2};--rc:${r.css}">
      <button class="icon-btn close" data-act="duel-resume" aria-label="Close">${ICON.close}</button>
      <div class="us-top">
        <img src="${this.host.ui.thumb(def, 256)}" alt="">
        <div class="us-h">
          <div class="eyebrow">${fam.name} · ${r.name}${sig ? ' · ★ Signature' : ''}</div>
          <h2>${esc(def.name)}</h2>
          <div class="duty ${dutyOf(def)}">${dutyOf(def) === 'support' ? ICON.shield : ICON.swords}${dutyOf(def) === 'support' ? 'Support' : 'Damage'} · ${subroleOf(def)}</div>
          <div class="role">${esc(def.role)} · power Lv ${pl}/${MAX_POWER}</div>
        </div>
      </div>
      <p class="desc">${esc(def.desc)}</p>
      <div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div>
      <div class="chips">${traits(d).filter((x) => x !== 'Global range').slice(0, 7).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      ${sig ? `<div class="ability"><div class="ab-h"><span class="eyebrow">Special capability</span><b>${esc(sig.ability.name)}</b></div><p>${esc(sig.ability.text(spec.ap))}</p></div>` : ''}
      ${picks.length ? `<div class="chips">${picks.map((t) => `<span class="chip" title="${esc(t.desc)}">★ ${esc(t.name)}</span>`).join('')}</div>` : ''}
      <p class="dim small">${esc(powerLine)} Merge two of the same rank into a random unit one rank higher.</p>
      <button class="btn primary wide" data-act="duel-resume">${ICON.play}<span>${offline ? 'Back to the match' : 'Close'}</span></button>
    </div>`);
  }

  menu() {
    if (this.match.ended) return;
    this.paused = true;
    const ranked = this.opts.mode === 'ranked', online = !!this.net;
    const ui = this.host.ui;
    ui.settingsMode = 'duel';
    ui.duelMenuRefresh = () => { if (this.paused && !this.match.ended) this.menu(); };
    ui.openModal(`<div class="sheet small" data-noclose><h2>${online ? 'Menu' : 'Paused'}</h2>
      ${online ? '<p class="dim">The match keeps running for your friend while this is open.</p>' : ''}
      <div class="set-list">${ui.soundRows()}</div>
      <div class="btn-col">
        <button class="btn primary big wide" data-act="duel-resume">${ICON.play}<span>${online ? 'Back to the match' : 'Resume'}</span></button>
        <button class="btn wide danger" data-act="duel-forfeit">${ranked ? 'Forfeit (counts as a loss)' : online ? 'Concede the match' : 'Leave duel'}</button>
      </div></div>`);
  }

  resume() { this.host.ui.closeModal(); this.paused = false; this.suppressClick = false; }
  forfeit() {
    this.host.ui.closeModal();
    this.paused = false;
    const m = this.match;
    if (this.net) { if (!m.ended) this.net.cmd({ k: 'f' }); return; }
    if (!m.ended) m.forfeit(0);
  }

  // ------------------------------------------------------------------ input: drag a unit onto its twin to merge
  private sideAt(r: number) { return this.match.sideOfCell(r); }
  private canControl(side: number) { return side === this.me || this.opts.mode === 'local'; }

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
        if (target && target !== g.tower && this.match.canMerge(g.tower, target) && e.type === 'pointerup') this.act(g.tower.side, { k: 'm', a: g.tower.id, b: target.id });
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
      if (e.key === ' ') { e.preventDefault(); this.act(this.me, { k: 's' }); }
      else if (e.key >= '1' && e.key <= '5') this.act(this.me, { k: 'p', i: Number(e.key) - 1 });
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
    const a = this.host.audio, fx = this.host.view.fx, mine = ev.side === this.me || this.opts.mode === 'local';
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
        if (mine) { a.leak(); this.host.engine.damage = Math.min(1, this.host.engine.damage + 0.4); try { navigator.vibrate?.(60); } catch { /* */ } }
        const el = this.root.querySelector(`#pv-hearts-${ev.side}`);
        el?.classList.remove('hit'); void (el as HTMLElement | null)?.offsetWidth; el?.classList.add('hit');
        break;
      }
      case 'wave': a.wave(ev.n! % 4 === 0); if (ev.n! % 4 !== 0) this.banner(`Wave ${ev.n}`, ev.n! > 14 ? 'Overtime: enemies grow fast' : ''); break;
      case 'boss': this.banner(ENEMY_BY_ID[ev.kind!]?.name ?? 'Boss', 'Boss on both lanes', 'boss'); break;
      case 'bossCast':
        if (mine) { this.host.ui.say(ev.text ?? 'Boss ability'); a.jam(); }
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
    if (this.net) simDt = this.stepOnline(dt);
    else if (!this.paused && !m.ended) {
      for (let i = 0; i < this.speed; i++) {
        this.bot?.update(dt);
        this.autopilot?.update(dt);
        m.step(dt);
        simDt += dt;
      }
    }
    if (m.ended && this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.endT = -1;
        // online, the server's copy of the match is the referee
        const r = this.net?.result;
        if (r && r.winner !== m.winner) m.winner = r.winner;
        this.host.onEnd(m, this.opts);
      }
    }
    // a unit that merged or vanished mid-drag drops the drag
    for (const [pid, g] of this.grabs) if (!m.sim.towers.includes(g.tower)) { this.grabs.delete(pid); this.host.view.drags.delete(g.tower.id); this.refreshTargets(); }
    for (const ev of m.events) { this.onEvent(ev); this.coachEvent(ev); }
    m.events.length = 0;
    this.coach(dt);
    this.updateHud();
    if (this.net) this.updateNet();
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.root.querySelector<HTMLElement>('#pv-banner')!.hidden = true; }
    return simDt;
  }

  // ------------------------------------------------------------------ online lockstep
  /** Dev/test aid: let the AI play our side (online it sends its moves through the server like a person). */
  enableAutopilot(skill: number) {
    this.autopilot = new PvpBot(this.match, this.me, skill, 7, this.net ? (c) => this.net!.cmd(c) : undefined);
  }

  /** Simulate up to the tick the clock says, but never past what the server has confirmed. */
  private stepOnline(dt: number): number {
    const net = this.net!, lock = this.lock!, m = this.match;
    if (net.lost && !m.ended) {
      // the match can't continue: end it here as a no-contest rather than wait forever
      this.interrupted = net.lost;
      m.ended = true; m.winner = -1;
      m.events.push({ t: 'end', side: -1 });
      return 0;
    }
    if (this.autopilot && net.clockTick() >= 0 && !m.ended) {
      // the test autopilot keeps wall-clock pace even when frames are slow (the match itself runs on the shared clock)
      const t = performance.now();
      this.autopilot.update(this.apT ? Math.min(1, (t - this.apT) / 1000) : dt);
      this.apT = t;
    }
    const r = net.result;
    // the referee says it is over but we have not got there (only possible after a divergence): end it here
    // the referee says it is over but we have not got there: after a divergence, or because we were away and
    // can't replay to the end (no inputs past what we were sent) — end it here with the referee's result
    if (r && !m.ended && (lock.tick >= r.tick + 30 || net.upto + 1 < r.tick)) { m.ended = true; m.winner = r.winner; m.events.push({ t: 'end', side: r.winner }); }
    if (m.ended) return 0;
    const target = Math.min(net.clockTick() + 1, net.upto + 1);
    const behind = target - lock.tick;
    if (behind <= 0) return 0;
    const catchUp = behind > 20;
    const max = catchUp ? Math.min(behind, 900) : 3;
    let n = 0;
    while (lock.tick < target && n < max && !m.ended) {
      lock.step();
      n++;
      if (lock.tick % HASH_EVERY === 0) net.hash(lock.tick, matchHash(m));
      if (catchUp) {
        // fast-forwarding (after a reconnect or a backgrounded tab): skip the effects and sounds of the past
        m.sim.events.length = 0;
        const end = m.events.find((e) => e.t === 'end');
        m.events.length = 0;
        if (end) m.events.push(end);
      }
    }
    return Math.min(n, 3) * DT;
  }

  /**
   * The server (the referee) says our copy of the match no longer matches its own. Rebuild it from the
   * server's command log, which is the whole truth of a lockstep match, and carry on from the same tick.
   */
  private rebuild() {
    const net = this.net!, info = net.info, old = this.lock!;
    if (!info) return;
    const m = new PvpMatch(info.setups[0], info.setups[1], info.seed);
    const lock = new Lockstep(m, (t) => net.cmds.get(t));
    while (lock.tick < old.tick && !m.ended) { lock.step(); m.events.length = 0; m.sim.events.length = 0; }
    this.match = m; this.lock = lock;
    for (const g of this.grabs.values()) this.host.view.drags.delete(g.tower.id);
    this.grabs.clear();
    this.host.view.mergeTargets.clear();
    this.host.setSim(m.sim);
    this.host.view.load(m.sim, THEMES[this.opts.theme] ?? THEMES[0]);
    if (this.autopilot) this.enableAutopilot(this.autopilot.skill);
    this.cache = {};
    console.warn(`online: resynced the match at tick ${lock.tick}`);
  }

  private updateNet() {
    const net = this.net!;
    if (net.desync && !this.match.ended && performance.now() - this.rebuiltAt > 15000) {
      this.rebuiltAt = performance.now();
      net.desync = false;
      this.rebuild();
    }
    const m = this.match;
    // the shared start countdown
    const left = net.countdown();
    const count = left > 0 ? String(Math.ceil(left)) : left > -0.9 && !m.ended ? 'GO!' : '';
    this.set('pv-count', count, (el) => { el.hidden = !count; el.textContent = count; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); });
    // connection problems, ours or theirs
    // watchdog: connected but no match updates for a while → reconnect (which also resumes our seat)
    const now = performance.now();
    const live = !m.ended && left < 0;
    const frameGap = this.lastNetFrame ? now - this.lastNetFrame : 0;
    this.lastNetFrame = now;
    if (net.lastTurnAt !== this.lastSeenTurn || !live || net.status !== 'online') { this.lastSeenTurn = net.lastTurnAt; this.staleMs = 0; }
    else this.staleMs += Math.min(frameGap, 250);
    const stalled = this.staleMs > 5000;
    if (stalled && now - this.kickedAt > 10000) { this.kickedAt = now; this.staleMs = 0; net.kick(); }
    // cut off for too long (the server's grace period is 30 s): stop instead of hanging
    if (live && net.status !== 'online') { this.offlineSince ||= now; if (now - this.offlineSince > 40000) net.markLost('Lost the connection to the game server. Check your internet and start a new match.'); }
    else this.offlineSince = 0;
    let msg = '';
    if (net.status !== 'online') msg = 'Connection lost · reconnecting…';
    else if (stalled) msg = 'Reconnecting to the match…';
    else if (!net.peerOnline[this.foe] && !m.ended) {
      const s = Math.max(0, Math.ceil((net.peerGraceUntil - Date.now()) / 1000));
      msg = `${m.sides[this.foe].name} disconnected · ${s}s to come back`;
    } else if (this.lock!.tick < net.clockTick() - 30 && !m.ended && left < 0) msg = 'Waiting for the server…';
    this.set('pv-netmsg', msg, (el) => { el.hidden = !msg; el.textContent = msg; });
    const ping = net.status === 'online' ? `${net.rtt} ms` : 'offline';
    this.set('pv-net', `${ping}:${net.peerOnline[this.foe]}`, (el) => {
      el.querySelector('span')!.textContent = net.peerOnline[this.foe] ? ping : 'away';
      el.classList.toggle('bad', net.status !== 'online' || !net.peerOnline[this.foe] || net.rtt > 250);
    });
  }

  // ------------------------------------------------------------------ first-duel coach
  private coachEvent(ev: MatchEvent) {
    if (!this.tip || ev.side !== this.me) return;
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
