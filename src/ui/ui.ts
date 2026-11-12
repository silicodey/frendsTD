import { ENEMY_BY_ID } from '../data/enemies';
import { LEVELS, THEMES, levelUnlocked } from '../data/levels';
import { MAX_LEVEL, TIER_UNLOCK, TOWERS, TOWER_BY_ID, approxDps, traits, upgradeCost } from '../data/towers';
import { FAMILIES, FAMILY_INFO, type Family, type TowerDef } from '../data/types';
import type { Thumbs } from '../render/thumbs';
import { LOADOUT_SIZE, type Save } from '../save';
import type { Sim, Tower } from '../sim/sim';
import { ICON } from './icons';

export interface AppApi {
  save: Save;
  thumbs: Thumbs;
  click(): void;
  deny(): void;
  renderNow(): void;
  startLevel(id: number): void;
  quitToMenu(): void;
  restart(): void;
  setPaused(p: boolean): void;
  cycleSpeed(): void;
  startWave(): void;
  selectCard(id: string | null): void;
  cardDown(id: string, ev: PointerEvent): void;
  upgradeSelected(): void;
  sellSelected(): void;
  cycleTarget(): void;
  deselect(): void;
  applySettings(): void;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const stars = (n: number, max = 3) => Array.from({ length: max }, (_, i) => `<span class="star ${i < n ? 'on' : ''}">${ICON.star}</span>`).join('');
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));
const MODE_LABEL: Record<string, string> = { first: 'First', strong: 'Strongest', near: 'Nearest', last: 'Last' };

export class UI {
  private menu: HTMLElement;
  private hud: HTMLElement;
  private modal: HTMLElement;
  private toast: HTMLElement;
  private armoryFamily: Family = 'gemini';
  private armoryDetail: string | null = null;
  private armoryFrom: number | null = null; // level id when opened from a briefing
  private cache: Record<string, string | number | boolean> = {};
  private hudBuilt = false;
  private bannerTimer = 0;
  private panelKey = '';
  private previewKey = '';

  constructor(private root: HTMLElement, private app: AppApi) {
    root.innerHTML = '<div id="menu"></div><div id="hud" hidden></div><div id="toast"></div><div id="modal" hidden></div>';
    this.menu = root.querySelector('#menu')!;
    this.hud = root.querySelector('#hud')!;
    this.modal = root.querySelector('#modal')!;
    this.toast = root.querySelector('#toast')!;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (card) this.app.cardDown(card.dataset.card!, e);
    });
  }

  // ------------------------------------------------------------------ events
  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!, arg = el.dataset.arg ?? '';
    const app = this.app;
    if (el.classList.contains('disabled')) { app.deny(); return; }
    if (!['upgrade', 'sell', 'wave'].includes(act)) app.click();
    switch (act) {
      case 'play': this.levels(); break;
      case 'title': this.title(); break;
      case 'armory': this.armoryFrom = null; this.armoryDetail = null; this.armory(); break;
      case 'armory-from': this.armoryFrom = Number(arg); this.armoryDetail = null; this.closeModal(); this.armory(); break;
      case 'armory-back': if (this.armoryFrom) { const id = this.armoryFrom; this.armoryFrom = null; this.levels(); this.briefing(id); } else this.title(); break;
      case 'family': this.armoryFamily = arg as Family; this.armoryDetail = null; this.armory(); break;
      case 'tower': this.armoryDetail = arg; this.armory(); break;
      case 'detail-close': this.armoryDetail = null; this.armory(); break;
      case 'equip': this.toggleEquip(arg); break;
      case 'unequip': this.toggleEquip(arg); break;
      case 'level': this.briefing(Number(arg)); break;
      case 'start': this.closeModal(); app.startLevel(Number(arg)); break;
      case 'close': this.closeModal(); break;
      case 'settings': this.settings(); break;
      case 'toggle-music': app.save.data.music = !app.save.data.music; app.save.write(); app.applySettings(); this.refreshSettings(); break;
      case 'toggle-sfx': app.save.data.sfx = !app.save.data.sfx; app.save.write(); app.applySettings(); this.refreshSettings(); break;
      case 'quality': {
        const order = ['auto', 'high', 'medium', 'low'] as const;
        app.save.data.quality = order[(order.indexOf(app.save.data.quality) + 1) % order.length];
        app.save.write(); app.applySettings(); this.refreshSettings(); break;
      }
      case 'reset-ask': el.outerHTML = `<button class="btn danger" data-act="reset-yes">Tap again to erase all progress</button>`; break;
      case 'reset-yes': app.save.reset(); this.closeModal(); this.title(); this.say('Progress erased'); break;
      case 'pause': app.setPaused(true); this.pause(); break;
      case 'resume': this.closeModal(); app.setPaused(false); break;
      case 'restart': this.closeModal(); app.restart(); break;
      case 'quit': this.closeModal(); app.quitToMenu(); this.levels(); break;
      case 'next': this.closeModal(); app.quitToMenu(); this.levels(); this.briefing(Number(arg)); break;
      case 'speed': app.cycleSpeed(); break;
      case 'wave': app.startWave(); break;
      case 'upgrade': app.upgradeSelected(); break;
      case 'sell': app.sellSelected(); break;
      case 'mode': app.cycleTarget(); break;
      case 'deselect': app.deselect(); break;
      default: break;
    }
  }

  private toggleEquip(id: string) {
    const lo = this.app.save.data.loadout;
    const i = lo.indexOf(id);
    if (i >= 0) { if (lo.length > 1) lo.splice(i, 1); else { this.say('Keep at least one tower equipped'); this.app.deny(); } }
    else if (lo.length >= LOADOUT_SIZE) { this.say(`Loadout is full (${LOADOUT_SIZE}). Remove a tower first.`); this.app.deny(); }
    else lo.push(id);
    this.app.save.write();
    this.armory();
  }

  say(text: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toast.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  private thumb(def: TowerDef, size = 192) { return this.app.thumbs.tower(def, size); }

  // ------------------------------------------------------------------ title
  title() {
    this.hudHide();
    const total = this.app.save.totalStars();
    this.menu.hidden = false;
    this.menu.className = 'screen title';
    this.menu.innerHTML = `
      <div class="title-top">
        <button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button>
      </div>
      <div class="title-mid">
        <div class="logo" aria-label="frendsTD"><span class="logo-a">frends</span><span class="logo-b">TD</span></div>
        <p class="tagline">Four AI families. One Core. Hold the line.</p>
        <div class="fam-row">${FAMILIES.map((f) => `<span class="fam-chip" style="--fc:${FAMILY_INFO[f].css}">${FAMILY_INFO[f].name}</span>`).join('')}</div>
      </div>
      <div class="title-bot">
        <button class="btn primary big" data-act="play">${ICON.play}<span>${total > 0 ? 'Continue' : 'Play'}</span></button>
        <button class="btn big" data-act="armory">${ICON.book}<span>Armory</span></button>
        <p class="foot">48 towers · 15 levels · 3 worlds${total ? ` · ${total}/45 ★` : ''}</p>
      </div>`;
  }

  // ------------------------------------------------------------------ level select
  levels() {
    this.hudHide();
    const save = this.app.save;
    const total = save.totalStars();
    let html = `<header class="bar"><button class="icon-btn" data-act="title" aria-label="Back">${ICON.back}</button><h1>Campaign</h1><div class="pill gold">${ICON.star}<b>${total}</b><i>/45</i></div></header><div class="scroll">`;
    THEMES.forEach((th, w) => {
      const lv = LEVELS.filter((l) => l.world === w);
      const got = lv.reduce((a, l) => a + (save.data.stars[l.id] ?? 0), 0);
      html += `<section class="world" style="--wc:${hex(th.tileAccent)};--wc2:${hex(th.rim)}"><div class="world-head"><span class="world-n">World ${w + 1}</span><h2>${th.name}</h2><span class="world-s">${got}/${lv.length * 3} ★</span></div><div class="level-list">`;
      for (const l of lv) {
        const open = levelUnlocked(l.id, save.data.stars);
        const s = save.data.stars[l.id] ?? 0;
        html += `<button class="level ${open ? '' : 'locked'} ${l.boss ? 'boss' : ''}" ${open ? `data-act="level" data-arg="${l.id}"` : 'disabled'}>
          <span class="level-n">${l.id}</span>
          <span class="level-t"><b>${esc(l.name)}</b><i>${esc(l.blurb)}</i></span>
          <span class="level-s">${open ? (l.boss ? `<em class="boss-tag">${ICON.skull}Boss</em>` : '') + `<span class="stars">${stars(s)}</span>` : ICON.lock}</span>
        </button>`;
      }
      html += '</div></section>';
    });
    html += '</div>';
    this.menu.hidden = false;
    this.menu.className = 'screen levels';
    this.menu.innerHTML = html;
  }

  briefing(id: number) {
    const l = LEVELS[id - 1];
    const save = this.app.save;
    const th = THEMES[l.world];
    const types = [...new Set([...l.pool, ...(l.boss ? [l.boss] : [])])];
    const lo = save.data.loadout.map((x) => TOWER_BY_ID[x]).filter(Boolean);
    const slots = Array.from({ length: LOADOUT_SIZE }, (_, i) => {
      const d = lo[i];
      return d ? `<div class="slot" style="--fc:${FAMILY_INFO[d.family].css}"><img src="${this.thumb(d)}" alt=""><span>${esc(d.name)}</span></div>` : `<div class="slot empty"><span>Empty</span></div>`;
    }).join('');
    this.openModal(`
      <div class="sheet briefing" style="--wc:${hex(th.tileAccent)}">
        <button class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
        <div class="eyebrow">Level ${l.id} · ${th.name}</div>
        <h2>${esc(l.name)}</h2>
        <p class="dim">${esc(l.blurb)}</p>
        <div class="meta-row"><span class="pill">${l.waves} waves</span><span class="pill">${l.paths.length > 1 ? l.paths.length + ' lanes' : '1 lane'}</span><span class="pill">${ICON.token}<b>${Math.round((l.startTokens * (1 + save.reinforcement(l.id))) / 10) * 10}</b></span>${save.reinforcement(l.id) ? `<span class="pill ok">Reinforcements +${Math.round(save.reinforcement(l.id) * 100)}%</span>` : ''}<span class="stars">${stars(save.data.stars[l.id] ?? 0)}</span></div>
        <h3>Threats</h3>
        <div class="threats">${types.map((t) => { const e = ENEMY_BY_ID[t]; return `<div class="threat ${e.boss ? 'boss' : ''}" title="${esc(e.desc)}"><img src="${this.app.thumbs.enemy(t, 128)}" alt=""><span>${esc(e.name)}</span></div>`; }).join('')}</div>
        <h3>Your loadout <button class="link" data-act="armory-from" data-arg="${l.id}">Change</button></h3>
        <div class="slots">${slots}</div>
        <button class="btn primary big wide" data-act="start" data-arg="${l.id}">${ICON.swords}<span>Deploy</span></button>
      </div>`);
    this.app.renderNow();
  }

  // ------------------------------------------------------------------ armory
  armory() {
    this.hudHide();
    const save = this.app.save;
    const total = save.totalStars();
    const fam = this.armoryFamily, info = FAMILY_INFO[fam];
    const list = TOWERS.filter((t) => t.family === fam);
    const lo = save.data.loadout;
    let html = `<header class="bar"><button class="icon-btn" data-act="armory-back" aria-label="Back">${ICON.back}</button><h1>Armory</h1><div class="pill gold">${ICON.star}<b>${total}</b></div></header>
      <nav class="tabs">${FAMILIES.map((f) => `<button class="tab ${f === fam ? 'on' : ''}" style="--fc:${FAMILY_INFO[f].css}" data-act="family" data-arg="${f}">${FAMILY_INFO[f].name}</button>`).join('')}</nav>
      <p class="fam-tag" style="--fc:${info.css}">${info.tagline}</p>
      <div class="scroll"><div class="grid" style="--fc:${info.css}">`;
    for (const t of list) {
      const need = TIER_UNLOCK[t.tier - 1];
      const open = need <= total;
      const eq = lo.includes(t.id);
      html += `<button class="tcard ${open ? '' : 'locked'} ${eq ? 'eq' : ''} ${this.armoryDetail === t.id ? 'sel' : ''}" data-act="tower" data-arg="${t.id}">
        <img src="${this.thumb(t)}" alt="">
        <span class="tier">${ROMAN[t.tier - 1]}</span>
        ${eq ? '<span class="eq-tag">Equipped</span>' : ''}
        ${open ? '' : `<span class="lock">${ICON.lock}<b>${need} ★</b></span>`}
        <span class="tname">${esc(t.name)}</span>
        <span class="tcost">${ICON.token}${t.cost}</span>
      </button>`;
    }
    html += `</div></div>
      <div class="tray"><div class="tray-h">Loadout <i>${lo.length}/${LOADOUT_SIZE}</i></div><div class="slots small">${Array.from({ length: LOADOUT_SIZE }, (_, i) => {
        const d = TOWER_BY_ID[lo[i]];
        return d ? `<button class="slot" style="--fc:${FAMILY_INFO[d.family].css}" data-act="unequip" data-arg="${d.id}" aria-label="Remove ${esc(d.name)}"><img src="${this.thumb(d)}" alt=""><span class="x">${ICON.close}</span></button>` : '<div class="slot empty"></div>';
      }).join('')}</div></div>`;
    if (this.armoryDetail) html += this.detail(TOWER_BY_ID[this.armoryDetail]);
    this.menu.hidden = false;
    this.menu.className = 'screen armory';
    const sc = this.menu.querySelector('.scroll')?.scrollTop ?? 0;
    this.menu.innerHTML = html;
    const ns = this.menu.querySelector('.scroll');
    if (ns) ns.scrollTop = sc;
    this.app.renderNow();
  }

  private detail(t: TowerDef) {
    const save = this.app.save;
    const info = FAMILY_INFO[t.family];
    const need = TIER_UNLOCK[t.tier - 1];
    const open = need <= save.totalStars();
    const eq = save.data.loadout.includes(t.id);
    const bar = (label: string, v: number, text: string) => `<div class="stat"><span>${label}</span><div class="meter"><i style="width:${Math.round(Math.min(1, Math.max(0.04, v)) * 100)}%"></i></div><b>${text}</b></div>`;
    const dps = approxDps(t);
    const isBeam = t.kind === 'beam' || t.kind === 'aura';
    let statsHtml = '';
    if (t.dmg > 0) {
      statsHtml += bar('Power', Math.log10(1 + dps) / Math.log10(1 + 2600), fmt(dps) + ' dps');
      statsHtml += bar(isBeam ? 'Damage/s' : 'Damage', Math.log10(1 + t.dmg) / Math.log10(601), fmt(t.dmg));
      if (!isBeam) statsHtml += bar('Fire rate', t.rate / 6, fmt(t.rate * (t.burst ?? 1)) + '/s');
    }
    if (t.range > 0) statsHtml += bar('Range', t.range >= 50 ? 1 : t.range / 6, t.range >= 50 ? 'Global' : fmt(t.range));
    return `<div class="detail" style="--fc:${info.css};--fc2:${info.css2}">
      <button class="icon-btn close" data-act="detail-close" aria-label="Close">${ICON.close}</button>
      <div class="detail-top">
        <img src="${this.thumb(t, 384)}" alt="">
        <div class="detail-h">
          <div class="eyebrow">${info.name} · Tier ${ROMAN[t.tier - 1]}</div>
          <h2>${esc(t.name)}</h2>
          <div class="role">${esc(t.role)}</div>
          <div class="pill">${ICON.token}<b>${t.cost}</b></div>
        </div>
      </div>
      <p class="desc">${esc(t.desc)}</p>
      <div class="stats">${statsHtml}</div>
      <div class="chips">${traits(t).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      ${open
        ? `<button class="btn ${eq ? '' : 'primary'} wide" data-act="${eq ? 'unequip' : 'equip'}" data-arg="${t.id}">${eq ? 'Remove from loadout' : 'Add to loadout'}</button>`
        : `<div class="locked-note">${ICON.lock} Unlocks at ${need} stars — you have ${save.totalStars()}</div>`}
    </div>`;
  }

  // ------------------------------------------------------------------ modals
  private openModal(html: string) { this.modal.hidden = false; this.modal.innerHTML = `<div class="scrim" data-act="${html.includes('data-noclose') ? '' : 'close'}"></div>${html}`; }
  closeModal() { this.modal.hidden = true; this.modal.innerHTML = ''; }
  modalOpen() { return !this.modal.hidden; }

  private settingsBody(inGame: boolean) {
    const d = this.app.save.data;
    const q = d.quality[0].toUpperCase() + d.quality.slice(1);
    return `<div class="set-list">
      <button class="set" data-act="toggle-music">${ICON.music}<span>Music</span><b class="${d.music ? 'on' : ''}">${d.music ? 'On' : 'Off'}</b></button>
      <button class="set" data-act="toggle-sfx">${ICON.sound}<span>Sound effects</span><b class="${d.sfx ? 'on' : ''}">${d.sfx ? 'On' : 'Off'}</b></button>
      <button class="set" data-act="quality">${ICON.gear}<span>Graphics</span><b class="on">${q}</b></button>
      ${inGame ? '' : `<button class="btn ghost" data-act="reset-ask">Erase progress</button>`}
    </div>`;
  }

  private settingsMode: 'menu' | 'pause' = 'menu';
  settings() {
    this.settingsMode = 'menu';
    this.openModal(`<div class="sheet small"><button class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button><h2>Settings</h2>${this.settingsBody(false)}</div>`);
  }
  private refreshSettings() { if (this.settingsMode === 'pause') this.pause(); else this.settings(); }

  pause() {
    this.settingsMode = 'pause';
    this.openModal(`<div class="sheet small" data-noclose><h2>Paused</h2>
      <div class="btn-col">
        <button class="btn primary big wide" data-act="resume">${ICON.play}<span>Resume</span></button>
        <button class="btn wide" data-act="restart">${ICON.restart}<span>Restart level</span></button>
        <button class="btn wide" data-act="quit">${ICON.back}<span>Leave level</span></button>
      </div>${this.settingsBody(true)}</div>`);
  }

  result(won: boolean, levelId: number, nStars: number, sim: Sim, unlocked: string[], onStar: (i: number) => void) {
    const l = LEVELS[levelId - 1];
    const next = LEVELS[levelId];
    const last = won && !next;
    const un = unlocked.map((id) => TOWER_BY_ID[id]).filter(Boolean);
    this.openModal(`<div class="sheet result ${won ? 'won' : 'lost'}" data-noclose>
      <div class="eyebrow">Level ${l.id} · ${esc(l.name)}</div>
      <h2>${won ? (last ? 'The Core is safe' : 'Victory') : 'Core breached'}</h2>
      ${won ? `<div class="big-stars">${stars(nStars)}</div>` : `<p class="dim">You held until wave ${sim.waveIdx + 1} of ${sim.waves.length}. Reinforcements are on the way: your next attempt starts with +${Math.round(Math.min(4, (this.app.save.data.fails[levelId] ?? 0)) * 15)}% tokens.</p>`}
      <div class="meta-row center"><span class="pill">${ICON.core}<b>${sim.lives}</b><i>/${sim.maxLives}</i></span><span class="pill">${sim.kills} kills</span><span class="pill">${ICON.token}<b>${sim.earned}</b> earned</span></div>
      ${last ? '<p class="dim">Every world cleared. The Maximizer is paperclips. Thanks for playing, frend.</p>' : ''}
      ${un.length ? `<h3>New towers unlocked</h3><div class="unlocks">${un.map((d) => `<div class="slot" style="--fc:${FAMILY_INFO[d.family].css}"><img src="${this.thumb(d)}" alt=""><span>${esc(d.name)}</span></div>`).join('')}</div>` : ''}
      <div class="btn-col">
        ${won && next ? `<button class="btn primary big wide" data-act="next" data-arg="${next.id}">${ICON.play}<span>Next level</span></button>` : ''}
        <button class="btn ${won && next ? '' : 'primary big'} wide" data-act="restart">${ICON.restart}<span>${won ? 'Replay' : 'Try again'}</span></button>
        <button class="btn wide" data-act="quit">${ICON.back}<span>Level select</span></button>
      </div></div>`);
    if (won) {
      const els = this.modal.querySelectorAll('.big-stars .star.on');
      els.forEach((el, i) => { (el as HTMLElement).style.animationDelay = `${0.35 + i * 0.32}s`; setTimeout(() => onStar(i), 350 + i * 320); });
    }
    this.app.renderNow();
  }

  // ------------------------------------------------------------------ HUD
  hudHide() { this.hud.hidden = true; this.hudBuilt = false; }

  hudShow(sim: Sim) {
    this.menu.hidden = true;
    this.menu.innerHTML = '';
    this.cache = {};
    this.panelKey = ''; this.previewKey = '';
    const lo = this.app.save.data.loadout.map((x) => TOWER_BY_ID[x]).filter(Boolean);
    this.hud.hidden = false;
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-l">
          <div class="res lives" id="h-lives">${ICON.core}<b>${sim.lives}</b></div>
          <div class="res tokens" id="h-tokens">${ICON.token}<b>${sim.tokens}</b></div>
        </div>
        <div class="hud-c"><span class="wave-l">Wave</span><b id="h-wave">0/${sim.waves.length}</b><div class="wave-bar"><i id="h-wavebar"></i></div></div>
        <div class="hud-r">
          <button class="icon-btn speed" data-act="speed" id="h-speed" aria-label="Game speed">1×</button>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
        </div>
      </div>
      <div class="banner" id="h-banner" hidden></div>
      <div class="hud-bot">
        <div class="above">
          <div class="tip" id="h-tip" hidden></div>
          <button class="wave-btn" data-act="wave" id="h-wavebtn"><span class="wb-main">${ICON.play}<b id="h-wavetxt">Start wave</b></span><span class="wb-prev" id="h-prev"></span></button>
        </div>
        <div class="build" id="h-build">
          ${lo.map((d) => `<button class="card" data-card="${d.id}" style="--fc:${FAMILY_INFO[d.family].css}" aria-label="${esc(d.name)}, ${d.cost} tokens">
            <img src="${this.thumb(d)}" alt="" draggable="false"><span class="cname">${esc(d.name)}</span><span class="ccost">${ICON.token}${d.cost}</span></button>`).join('')}
        </div>
        <div class="panel" id="h-panel" hidden></div>
      </div>`;
    this.hudBuilt = true;
    this.app.renderNow();
  }

  private set(id: string, key: string, val: string | number | boolean, apply: (el: HTMLElement) => void) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    const el = this.hud.querySelector<HTMLElement>('#' + id);
    if (el) apply(el);
  }

  tip(text: string | null) {
    this.set('h-tip', 'tip', text ?? '', (el) => { el.hidden = !text; el.textContent = text ?? ''; });
  }

  banner(title: string, sub = '', cls = '') {
    const el = this.hud.querySelector<HTMLElement>('#h-banner');
    if (!el) return;
    el.hidden = false;
    el.className = 'banner show ' + cls;
    el.innerHTML = `<b>${esc(title)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => { el.className = 'banner ' + cls; el.hidden = true; }, 2200);
  }

  pulse(id: 'h-lives' | 'h-tokens') {
    const el = this.hud.querySelector<HTMLElement>('#' + id);
    if (!el) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }

  hudUpdate(sim: Sim, selCard: string | null, selTower: Tower | null, speed: number) {
    if (!this.hudBuilt) return;
    this.set('h-lives', 'lives', sim.lives, (el) => { el.querySelector('b')!.textContent = String(sim.lives); el.classList.toggle('low', sim.lives <= 5); });
    this.set('h-tokens', 'tokens', sim.tokens, (el) => { el.querySelector('b')!.textContent = String(sim.tokens); });
    const w = Math.max(0, sim.waveIdx + 1);
    this.set('h-wave', 'wave', w, (el) => { el.textContent = `${w}/${sim.waves.length}`; });
    this.set('h-wavebar', 'wavebar', w, (el) => { el.style.width = `${(w / sim.waves.length) * 100}%`; });
    this.set('h-speed', 'speed', speed, (el) => { el.textContent = speed + '×'; el.classList.toggle('fast', speed > 1); });

    // wave button
    const can = sim.canStartWave();
    const early = sim.state === 'wave';
    const cd = sim.nextWaveT > 0 ? Math.ceil(sim.nextWaveT) : 0;
    const nextIdx = sim.waveIdx + 1;
    const label = !can ? '' : early ? `Call wave ${nextIdx + 1} early` : cd ? `Wave ${nextIdx + 1} in ${cd}s` : `Start wave ${nextIdx + 1}`;
    this.set('h-wavebtn', 'wavevis', can && !selTower, (el) => { el.hidden = !(can && !selTower); });
    this.set('h-wavetxt', 'wavetxt', label, (el) => { el.textContent = label; });
    this.set('h-wavebtn', 'waveearly', early, (el) => { el.classList.toggle('early', early); });
    const pk = can ? String(nextIdx) : '';
    if (pk !== this.previewKey) {
      this.previewKey = pk;
      const el = this.hud.querySelector<HTMLElement>('#h-prev');
      if (el) {
        el.innerHTML = can ? sim.wavePreview(nextIdx).map((p) => `<span class="pv ${ENEMY_BY_ID[p.type].boss ? 'boss' : ''}"><img src="${this.app.thumbs.enemy(p.type, 128)}" alt="${esc(ENEMY_BY_ID[p.type].name)}"><i>${p.count}</i></span>`).join('') : '';
        this.app.renderNow();
      }
    }

    // build cards
    const cards = this.hud.querySelectorAll<HTMLElement>('.card');
    cards.forEach((c) => {
      const id = c.dataset.card!;
      const afford = sim.tokens >= TOWER_BY_ID[id].cost;
      const k = `card:${id}`;
      const v = (afford ? 1 : 0) + (selCard === id ? 2 : 0);
      if (this.cache[k] !== v) { this.cache[k] = v; c.classList.toggle('poor', !afford); c.classList.toggle('sel', selCard === id); }
    });

    // tower panel
    const build = this.hud.querySelector<HTMLElement>('#h-build')!;
    const panel = this.hud.querySelector<HTMLElement>('#h-panel')!;
    if (selTower) {
      const t = selTower, d = t.def;
      const cost = upgradeCost(d, t.level);
      const canUp = t.level < MAX_LEVEL && sim.tokens >= cost;
      const key = `${t.id}:${t.level}:${canUp}:${t.mode}:${t.kills}:${Math.round(t.stats.dmg * 10)}:${Math.round(t.stats.range * 10)}`;
      if (key !== this.panelKey) {
        this.panelKey = key;
        const info = FAMILY_INFO[d.family];
        const st = t.stats;
        const isBeam = d.kind === 'beam' || d.kind === 'aura';
        const bits: string[] = [];
        if (d.dmg > 0) bits.push(`<span><i>${isBeam ? 'DPS' : 'DMG'}</i><b>${fmt(st.dmg)}</b></span>`);
        if (d.rate > 0 && !isBeam) bits.push(`<span><i>RATE</i><b>${fmt(st.rate * (d.burst ?? 1))}/s</b></span>`);
        if (d.range > 0) bits.push(`<span><i>RANGE</i><b>${d.range >= 50 ? '∞' : fmt(st.range)}</b></span>`);
        if (d.income) bits.push(`<span><i>INCOME</i><b>+${Math.round(d.income * st.aux)}</b></span>`);
        bits.push(`<span><i>KILLS</i><b>${t.kills}</b></span>`);
        const buffed = t.buffDmg || t.buffRate || t.buffRange || t.buffCrit;
        const targets = d.kind !== 'support' && d.kind !== 'income' && d.kind !== 'aura' && d.kind !== 'nova';
        panel.style.setProperty('--fc', info.css);
        panel.innerHTML = `
          <button class="icon-btn close" data-act="deselect" aria-label="Close">${ICON.close}</button>
          <div class="p-top"><img src="${this.thumb(d)}" alt="">
            <div class="p-h"><div class="p-name">${esc(d.name)} <span class="lv">${'◆'.repeat(t.level)}${'◇'.repeat(MAX_LEVEL - t.level)}</span></div>
            <div class="p-role">${info.name} · ${esc(d.role)}${buffed ? ' · <em>Buffed</em>' : ''}</div>
            <div class="p-stats">${bits.join('')}</div></div></div>
          <div class="p-btns">
            ${t.level < MAX_LEVEL ? `<button class="btn primary ${canUp ? '' : 'disabled'}" data-act="upgrade">${ICON.up}<span>Upgrade</span><em>${ICON.token}${cost}</em></button>` : `<div class="btn maxed">Max level</div>`}
            ${targets ? `<button class="btn" data-act="mode">${ICON.target}<span>${MODE_LABEL[t.mode]}</span></button>` : ''}
            <button class="btn" data-act="sell">${ICON.sell}<span>Sell</span><em>${ICON.token}${sim.sellValue(t)}</em></button>
          </div>`;
        this.app.renderNow();
      }
      if (panel.hidden) { panel.hidden = false; build.hidden = true; }
    } else if (!panel.hidden) { panel.hidden = true; build.hidden = false; this.panelKey = ''; }
  }
}
