import { TOWER_BY_ID, traits } from '../data/towers';
import { mulberry32 } from '../data/levels';
import { FAMILIES, FAMILY_INFO, type Family } from '../data/types';
import type { AudioEngine } from '../audio/audio';
import type { Save } from '../save';
import type { UI } from '../ui/ui';
import { ICON } from '../ui/icons';
import type { DuelOptions } from './battle';
import {
  ARENAS, CHECKPOINT_INFO, LIMIT_MAX, MAX_CARD_LEVEL, TALENT_RESPEC_RESETS, arenaOfUnit, nextLimitIn, startLevel, unitsUpTo,
  upgradeCost, usageLevel, usageTier, type CheckpointLoot,
} from './economy';
import type { DeckCard, PvpMatch } from './match';
import { buildSpec } from './match';
import {
  DECK_SIZE, arenaOf, buyOffer, canUpgrade, chooseTalent, deckCards, limits, resetLimits, setDeckSlot, settleMatch, shopOffers, spendLimit, upgrade,
  type MatchResult,
} from './profile';
import { PVP_UNITS, RARITY_INFO, isSignature, rarityOf } from './roster';
import { SIGNATURE_BY_ID, TALENT_LEVELS } from './signatures';

export interface ScreensHost {
  save: Save; ui: UI; audio: AudioEngine;
  startDuel(opts: DuelOptions): void;
  endDuel(): void;
  toTitle(): void;
  duelResume(): void;
  duelForfeit(): void;
  renderNow(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const RIVAL_NAMES = ['overfit_olga', 'TensorTom', 'gradient_greg', 'promptlord', 'zero_shot_zoe', 'ByteDancer', 'kv_cache_kai', 'tokenizer_tia', 'attn_is_all', 'LoRA_lara',
  'beam_search_bo', 'dropout_dan', 'softmax_sam', 'RLHF_rita', 'epoch_eve', 'quantized_q', 'hallucinate_hal', 'context_cleo', 'agent_ash', 'diffusion_di'];

/** How hard a card hits at a level: rarity power × level scaling (what normalised battle damage is built from). */
export const cardPower = (id: string, level: number) => RARITY_INFO[rarityOf(TOWER_BY_ID[id])].power * Math.pow(1.09, level - 1);

/** A ranked rival near your rating with a deck of matching strength (not just matching levels). */
export function makeRival(elo: number, myDeck: DeckCard[], arena: number, rng: () => number, matchesPlayed: number) {
  const pool = unitsUpTo(arena);
  const target = myDeck.reduce((a, c) => a + cardPower(c.id, c.level), 0) / myDeck.length;
  // units that can be levelled to roughly your strength (their starting level must not already overshoot it)
  const fits = pool.filter((id) => cardPower(id, startLevel(id)) <= target * 1.06);
  const pickFrom = fits.length >= DECK_SIZE ? fits : [...pool].sort((a, b) => cardPower(a, startLevel(a)) - cardPower(b, startLevel(b))).slice(0, Math.max(DECK_SIZE, fits.length));
  const deckIds = [...pickFrom].sort(() => rng() - 0.5).slice(0, DECK_SIZE);
  const deck: DeckCard[] = deckIds.map((id) => {
    const want = target * (0.97 + rng() * 0.08);
    // the level whose strength is closest to what we want
    let lvl = startLevel(id);
    while (lvl < MAX_CARD_LEVEL && Math.abs(cardPower(id, lvl + 1) - want) < Math.abs(cardPower(id, lvl) - want)) lvl++;
    return { id, level: lvl, talents: TALENT_LEVELS.map((L) => (lvl >= L ? Math.floor(rng() * 2) : -1)) };
  });
  const rivalElo = Math.max(0, Math.round(elo + (rng() - 0.45) * 120));
  // the first few matches are gentle while you learn
  const skill = matchesPlayed < 3 ? 0.3 + matchesPlayed * 0.08 : Math.min(0.92, 0.45 + arena * 0.08 + (rng() - 0.5) * 0.15);
  return { name: RIVAL_NAMES[Math.floor(rng() * RIVAL_NAMES.length)] + (rng() < 0.4 ? `_${Math.floor(rng() * 99)}` : ''), elo: rivalElo, deck, skill };
}

export class PvpScreens {
  private filter: Family | 'all' = 'all';
  private pickSlotFor: string | null = null;
  private timer = 0;
  private lastResult: MatchResult | null = null;

  constructor(private host: ScreensHost) {
    host.ui.extra = (act, arg, el) => this.onClick(act, arg, el);
  }

  private get p() { return this.host.save.data.pvp; }
  private save() { this.host.save.write(); }
  private thumb(id: string, size = 192) { return this.host.ui.thumb(TOWER_BY_ID[id], size); }

  /** The currency strip shown on every duel screen. */
  wallet() {
    const p = this.p, now = Date.now(), l = limits(p, now);
    const next = nextLimitIn(l, now);
    return `<div class="wallet">
      <span class="cur tok" title="Tokens">${ICON.token}<b id="w-tok">${fmt(p.tokens)}</b></span>
      <span class="cur rst" title="Resets">${ICON.reset}<b id="w-rst">${p.resets}</b></span>
      <span class="cur lim ${l.n === 0 ? 'empty' : ''}" title="Limits">${ICON.limit}<b id="w-lim">${l.n}/${LIMIT_MAX}</b>${l.n < LIMIT_MAX ? `<i id="w-limt">${mmss(next)}</i>` : ''}</span>
    </div>`;
  }

  private tick() {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const el = document.getElementById('w-limt');
      if (!el) { clearInterval(this.timer); return; }
      const now = Date.now(), l = limits(this.p, now);
      el.textContent = mmss(nextLimitIn(l, now));
      const n = document.getElementById('w-lim');
      if (n && n.textContent !== `${l.n}/${LIMIT_MAX}`) { this.save(); this.home(); }
    }, 1000);
  }

  private screen(cls: string, html: string) {
    const ui = this.host.ui;
    ui.hudHide();
    ui.menu.hidden = false;
    ui.menu.className = `screen ${cls}`;
    const sc = ui.menu.querySelector('.scroll')?.scrollTop ?? 0;
    ui.menu.innerHTML = html;
    const ns = ui.menu.querySelector('.scroll');
    if (ns && ui.menu.dataset.view === cls) ns.scrollTop = sc;
    ui.menu.dataset.view = cls;
    this.tick();
    this.host.renderNow();
  }

  // ------------------------------------------------------------------ home
  home() {
    const p = this.p, arena = arenaOf(p), next = ARENAS[arena.id + 1];
    const u = usageLevel(p.usage);
    const l = limits(p, Date.now());
    const prog = next ? (p.elo - arena.elo) / (next.elo - arena.elo) : 1;
    const deck = deckCards(p);
    this.screen('pvp-home', `
      <header class="bar"><button class="icon-btn" data-act="pv-title" aria-label="Back">${ICON.back}</button><h1>Ranked</h1>${this.wallet()}</header>
      <div class="scroll">
        <section class="arena-card" style="--ac:${['#35e0ff', '#35e0ff', '#c86bff', '#c86bff', '#ffa23a', '#ff5a3d'][arena.id]}">
          <div class="arena-top"><span class="eyebrow">Arena ${arena.id + 1}</span><span class="elo">${ICON.elo}<b>${p.elo}</b> Elo</span></div>
          <h2>${arena.name}</h2>
          <p class="dim">${arena.blurb}</p>
          <div class="meter big"><i style="width:${Math.round(Math.min(1, Math.max(0.02, prog)) * 100)}%"></i></div>
          <div class="arena-next">${next ? `<span>${next.elo - p.elo} Elo to <b>${next.name}</b></span><span class="unl">${next.unlocks.slice(0, 4).map((id) => `<img src="${this.thumb(id, 128)}" alt="${esc(TOWER_BY_ID[id].name)}" title="Unlocks ${esc(TOWER_BY_ID[id].name)}">`).join('')}</span>` : '<span>Top arena reached</span>'}</div>
        </section>
        <h3 class="sec">Your deck <button class="link" data-act="pv-collection">Edit</button></h3>
        <div class="deck5">${deck.map((c) => this.unitTile(c.id, false)).join('')}</div>
        <div class="btn-col">
          ${l.n > 0
            ? `<button class="btn primary big wide" data-act="pv-battle">${ICON.swords}<span>Battle</span><em>${ICON.limit}1</em></button>`
            : `<div class="limit-out">Limit reached · next in <b>${mmss(nextLimitIn(l, Date.now()))}</b></div>
               <button class="btn primary big wide ${p.resets < 1 ? 'disabled' : ''}" data-act="pv-reset">${ICON.reset}<span>Reset your Limits</span><em>${ICON.reset}1</em></button>`}
          <div class="row2">
            <button class="btn wide" data-act="pv-practice">${ICON.target}<span>Practice</span></button>
            <button class="btn wide" data-act="pv-local">${ICON.duo}<span>Local duel</span></button>
          </div>
          <div class="row2">
            <button class="btn wide" data-act="pv-collection">${ICON.cards}<span>Units</span>${this.upgradableCount() ? `<span class="dot">${this.upgradableCount()}</span>` : ''}</button>
            <button class="btn wide" data-act="pv-shop">${ICON.shop}<span>Shop</span></button>
          </div>
        </div>
        <section class="usage">
          <div class="usage-h"><span>${ICON.usage} Usage tier <b>${usageTier(u.level)} ${u.level}</b></span><i>${u.into}/${u.need}</i></div>
          <div class="meter"><i style="width:${Math.round((u.into / u.need) * 100)}%"></i></div>
          <p class="dim small">Usage grows as you upgrade units and play. Every level pays Tokens and 2 Resets, and resets your Limits.</p>
        </section>
        <p class="record">${p.wins}W · ${p.losses}L${p.draws ? ` · ${p.draws}D` : ''}${p.streak > 1 ? ` · ${p.streak} win streak` : ''} · best ${p.bestElo} Elo</p>
      </div>`);
  }

  private upgradableCount() { return Object.keys(this.p.cards).filter((id) => canUpgrade(this.p, id) === 'ok').length; }

  private unitTile(id: string, showWeights: boolean, extra = '') {
    const p = this.p, def = TOWER_BY_ID[id], r = RARITY_INFO[rarityOf(def)], c = p.cards[id];
    const fam = FAMILY_INFO[def.family];
    if (!c) {
      const arena = ARENAS[arenaOfUnit(id)];
      const open = arena.id <= arenaOf(p).id;
      return `<button class="utile locked" data-act="pv-unit" data-arg="${id}" style="--rc:${r.css};--fc:${fam.css}">
        <img src="${this.thumb(id)}" alt=""><span class="u-name">${esc(def.name)}</span>
        <span class="u-lock">${ICON.lock}<i>${open ? 'Find in Checkpoints' : arena.name}</i></span></button>`;
    }
    const cost = upgradeCost(id, c.level);
    const ok = canUpgrade(p, id) === 'ok';
    const w = cost ? Math.min(1, c.weights / cost.weights) : 1;
    return `<button class="utile ${ok ? 'can' : ''} ${extra}" data-act="pv-unit" data-arg="${id}" style="--rc:${r.css};--fc:${fam.css}">
      <img src="${this.thumb(id)}" alt="">
      ${isSignature(id) ? `<span class="u-sig" title="Signature unit">★</span>` : ''}
      <span class="u-lvl">Lv ${c.level}</span>
      <span class="u-name">${esc(def.name)}</span>
      ${showWeights ? `<span class="u-w ${ok ? 'ok' : ''}"><i style="width:${Math.round(w * 100)}%"></i><b>${cost ? `${c.weights}/${cost.weights}` : 'MAX'}</b></span>` : ''}
    </button>`;
  }

  // ------------------------------------------------------------------ collection
  collection() {
    const p = this.p;
    const list = PVP_UNITS.filter((t) => this.filter === 'all' || t.family === this.filter)
      .sort((a, b) => (p.cards[b.id] ? 1 : 0) - (p.cards[a.id] ? 1 : 0) || RARITY_INFO[rarityOf(a)].startLevel - RARITY_INFO[rarityOf(b)].startLevel || a.tier - b.tier);
    const ownedN = PVP_UNITS.filter((t) => p.cards[t.id]).length;
    this.screen('pvp-coll', `
      <header class="bar"><button class="icon-btn" data-act="pv-home" aria-label="Back">${ICON.back}</button><h1>Units</h1>${this.wallet()}</header>
      ${this.pickSlotFor ? `<div class="pick-hint">Tap a deck slot to put <b>${esc(TOWER_BY_ID[this.pickSlotFor].name)}</b> in it. <button class="link" data-act="pv-pick-cancel">Cancel</button></div>` : ''}
      <div class="deck5 slots-row">${p.deck.map((id, i) => `<div class="slotwrap ${this.pickSlotFor ? 'pick' : ''}" ${this.pickSlotFor ? `data-act="pv-slot" data-arg="${i}"` : ''}>${this.unitTile(id, false)}</div>`).join('')}</div>
      <nav class="tabs five">${(['all', ...FAMILIES] as const).map((f) => `<button class="tab ${this.filter === f ? 'on' : ''}" style="--fc:${f === 'all' ? '#dfe8ff' : FAMILY_INFO[f].css}" data-act="pv-filter" data-arg="${f}">${f === 'all' ? 'All' : FAMILY_INFO[f].name}</button>`).join('')}</nav>
      <p class="coll-note">${ownedN}/${PVP_UNITS.length} collected · ★ Signature units have talents</p>
      <div class="scroll"><div class="ugrid">${list.map((t) => this.unitTile(t.id, true)).join('')}</div></div>`);
  }

  // ------------------------------------------------------------------ unit sheet
  unit(id: string) {
    const p = this.p, def = TOWER_BY_ID[id], rarity = rarityOf(def), r = RARITY_INFO[rarity], fam = FAMILY_INFO[def.family];
    const c = p.cards[id];
    const level = c?.level ?? r.startLevel;
    const spec = buildSpec({ id, level, talents: p.talents[id] ?? [-1, -1, -1, -1] });
    const sig = SIGNATURE_BY_ID[id];
    const cost = c ? upgradeCost(id, c.level) : null;
    const state = canUpgrade(p, id);
    const inDeck = p.deck.includes(id);
    const area = def.kind === 'nova' || def.kind === 'aura' || def.kind === 'support';
    const beam = def.kind === 'beam' || def.kind === 'aura';
    const dmg = spec.def.dmg * spec.levelMult;
    const statRows: [string, string][] = [];
    if (def.dmg > 0) statRows.push([beam ? 'Damage / sec' : 'Damage', dmg.toFixed(dmg < 10 ? 1 : 0)]);
    if (!beam && def.rate > 0) statRows.push(['Attack speed', `${(spec.def.rate * (spec.def.burst ?? 1)).toFixed(2)}/s`]);
    statRows.push(['Reach', area ? (def.kind === 'support' ? 'Adjacent units' : `${spec.def.range.toFixed(1)} tiles`) : 'Whole lane']);
    if (def.buff) statRows.push(['Aura', traits(spec.def).filter((x) => x.startsWith('Buff')).join(', ').replace(/Buff /g, '')]);
    const arena = ARENAS[arenaOfUnit(id)];
    const talentRows = sig ? sig.talents.map((pair, tier) => {
      const L = TALENT_LEVELS[tier];
      const open = !!c && level >= L;
      const pick = p.talents[id]?.[tier] ?? -1;
      return `<div class="trow ${open ? '' : 'locked'}"><span class="tl">Lv ${L}</span>${pair.map((t, k) => `
        <button class="talent ${pick === k ? 'on' : ''}" ${open ? `data-act="pv-talent" data-arg="${id}:${tier}:${k}"` : 'disabled'}>
          <b>${esc(t.name)}</b><i>${esc(t.desc)}</i></button>`).join('')}</div>`;
    }).join('') : '';
    this.host.ui.openModal(`
      <div class="sheet unit-sheet" style="--fc:${fam.css};--fc2:${fam.css2};--rc:${r.css}">
        <button class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
        <div class="us-top">
          <img src="${this.thumb(id, 384)}" alt="">
          <div class="us-h">
            <div class="eyebrow">${fam.name} · ${r.name}${sig ? ' · ★ Signature' : ''}</div>
            <h2>${esc(def.name)}</h2>
            <div class="role">${esc(def.role)}</div>
            ${c ? `<div class="us-lvl">Level <b>${c.level}</b><i>/${MAX_CARD_LEVEL}</i></div>` : `<div class="us-lvl locked">${ICON.lock} ${arena.id <= arenaOf(p).id ? 'Find its first Weight in a Checkpoint' : `Unlocks in ${arena.name} (${arena.elo} Elo)`}</div>`}
          </div>
        </div>
        <p class="desc">${esc(def.desc)}</p>
        <div class="kv">${statRows.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div>
        <div class="chips">${traits(spec.def).filter((x) => x !== 'Global range' && !x.startsWith('Buff')).slice(0, 6).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
        ${sig ? `<div class="ability"><div class="ab-h"><span class="eyebrow">Special capability</span><b>${esc(sig.ability.name)}</b></div><p>${esc(sig.ability.text(spec.ap))}</p><p class="dim small">Grows stronger with every level (+6% per level).</p></div>
          <h3>Talents <span class="hint">pick one per row · changing costs ${TALENT_RESPEC_RESETS} Reset</span></h3><div class="talents">${talentRows}</div>` : ''}
        ${c ? `<div class="us-actions">
          ${cost ? `<div class="wbar"><span>${ICON.weights} Weights</span><div class="meter"><i style="width:${Math.round(Math.min(1, c.weights / cost.weights) * 100)}%"></i></div><b>${c.weights}/${cost.weights}</b></div>` : '<div class="wbar max">Max level</div>'}
          <div class="row2">
            ${cost ? `<button class="btn primary wide ${state === 'ok' ? '' : 'disabled'}" data-act="pv-upgrade" data-arg="${id}">${ICON.up}<span>Upgrade</span><em>${ICON.token}${fmt(cost.tokens)}</em></button>` : ''}
            <button class="btn wide ${inDeck ? 'disabled' : ''}" data-act="pv-use" data-arg="${id}">${inDeck ? 'In deck' : 'Use in deck'}</button>
          </div>
          ${state === 'weights' ? `<p class="dim small center">Needs ${cost!.weights - c.weights} more Weights. Win battles to open Checkpoints, or check the Shop.</p>` : state === 'tokens' ? `<p class="dim small center">Needs ${fmt(cost!.tokens - p.tokens)} more Tokens.</p>` : ''}
        </div>` : ''}
      </div>`);
    this.host.renderNow();
  }

  // ------------------------------------------------------------------ shop
  shop() {
    const p = this.p, now = Date.now();
    const offers = shopOffers(p, now);
    const left = 86400 - ((now / 1000) % 86400);
    this.screen('pvp-shop', `
      <header class="bar"><button class="icon-btn" data-act="pv-home" aria-label="Back">${ICON.back}</button><h1>Shop</h1>${this.wallet()}</header>
      <div class="scroll">
        <p class="dim">Daily deals refresh in ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m.</p>
        <div class="offers">${offers.map((o) => {
          const def = o.id ? TOWER_BY_ID[o.id] : null;
          const r = def ? RARITY_INFO[rarityOf(def)] : null;
          const icon = def ? `<img src="${this.thumb(def.id)}" alt="">` : `<span class="o-ico">${o.key === 'limits' ? ICON.limit : ICON.token}</span>`;
          const price = o.costTokens ? `${ICON.token}${fmt(o.costTokens)}` : `${ICON.reset}${o.costResets}`;
          return `<div class="offer ${o.sold ? 'sold' : ''}" style="--rc:${r?.css ?? '#ffcf5c'}">${icon}
            <div class="o-t"><b>${def ? esc(def.name) : esc(o.label)}</b><i>${def ? `${o.label} · ${r!.name}` : o.key === 'limits' ? `Back to ${LIMIT_MAX}/${LIMIT_MAX} right now` : 'Straight to your wallet'}</i></div>
            <button class="btn ${o.sold ? 'disabled' : 'primary'}" data-act="pv-buy" data-arg="${o.key}">${o.sold ? 'Bought' : price}</button></div>`;
        }).join('')}</div>
        <section class="explain">
          <h3>Currencies</h3>
          <p>${ICON.token} <b>Tokens</b>: the main currency. Win battles and campaign stars to earn them; spend them on upgrades.</p>
          <p>${ICON.weights} <b>Weights</b>: each unit's own cards. Collect them from Checkpoints to level that unit up.</p>
          <p>${ICON.limit} <b>Limits</b>: every ranked battle uses one. One comes back every 8 minutes, up to ${LIMIT_MAX}.</p>
          <p>${ICON.reset} <b>Resets</b>: reset your Limits instantly, change a talent, or buy Tokens. Earned from Usage levels.</p>
          <p>${ICON.usage} <b>Usage</b>: account XP from upgrades and battles. Each level pays Tokens and Resets.</p>
        </section>
      </div>`);
  }

  // ------------------------------------------------------------------ matchmaking and results
  private seed() { return (Date.now() & 0xffffff) ^ (this.p.matches * 2654435761); }

  battle(mode: 'ranked' | 'practice' | 'local') {
    const p = this.p, now = Date.now();
    if (mode === 'ranked' && !spendLimit(p, now)) { this.host.audio.deny(); this.home(); return; }
    this.save();
    const seed = this.seed();
    const rng = mulberry32(seed);
    const deck = deckCards(p);
    const arena = arenaOf(p);
    const rival = mode === 'local'
      ? { name: 'Player 2', elo: p.elo, deck: deck.map((c) => ({ ...c })), skill: 0 }
      : makeRival(p.elo, deck, arena.id, rng, mode === 'ranked' ? p.matches : 3);
    const opts: DuelOptions = {
      mode, me: { name: mode === 'local' ? 'Player 1' : 'You', deck, elo: p.elo }, rival: { name: rival.name, deck: rival.deck, elo: rival.elo },
      rivalSkill: rival.skill, theme: arena.theme, seed, tutorial: mode !== 'local' && p.matches === 0 && !p.coached,
    };
    if (opts.tutorial) { p.coached = true; this.save(); }
    this.matchmaking(opts, () => this.host.startDuel(opts));
  }

  private matchmaking(opts: DuelOptions, go: () => void) {
    const ui = this.host.ui;
    const side = (name: string, elo: number, deck: DeckCard[], cls: string) => `
      <div class="mm-side ${cls}"><div class="mm-name"><span class="pv-avatar">${esc(name[0])}</span><b>${esc(name)}</b>${opts.mode !== 'local' ? `<i>${ICON.elo}${elo}</i>` : ''}</div>
        <div class="mm-deck">${deck.map((c) => `<span style="--rc:${RARITY_INFO[rarityOf(TOWER_BY_ID[c.id])].css}"><img src="${this.thumb(c.id, 128)}" alt=""><i>${c.level}</i></span>`).join('')}</div></div>`;
    ui.menu.hidden = false;
    ui.menu.className = 'screen mm';
    ui.menu.dataset.view = 'mm';
    ui.menu.innerHTML = `<div class="mm-wrap">
      ${side(opts.rival.name, opts.rival.elo ?? 0, opts.rival.deck, 'top')}
      <div class="mm-vs">VS</div>
      ${side(opts.me.name, opts.me.elo ?? 0, opts.me.deck, 'bot')}
      <p class="mm-tip">${opts.mode === 'local' ? 'Each player taps and drags on their own half. Hold the phone flat between you.' : 'Summon units, drag a unit onto its twin to merge, and power up your best type. Lose 3 hearts and you lose.'}</p>
    </div>`;
    this.host.renderNow();
    this.host.audio.wave(false);
    setTimeout(() => { ui.menu.hidden = true; ui.menu.innerHTML = ''; go(); }, opts.mode === 'local' ? 2600 : 2200);
  }

  /** Called by the duel when it finishes. */
  finished(match: PvpMatch, opts: DuelOptions) {
    const p = this.p, now = Date.now();
    const score = match.winner === 0 ? 1 : match.winner === -1 ? 0.5 : 0;
    const ui = this.host.ui;
    if (score === 1) this.host.audio.win(); else if (score === 0) this.host.audio.lose();
    if (opts.mode !== 'ranked') {
      const title = opts.mode === 'local' ? (match.winner === -1 ? 'Draw' : `${match.sides[match.winner].name} wins`) : score === 1 ? 'Victory' : score === 0 ? 'Defeat' : 'Draw';
      ui.openModal(`<div class="sheet result ${score === 0 && opts.mode !== 'local' ? 'lost' : 'won'}" data-noclose>
        <div class="eyebrow">${opts.mode === 'local' ? 'Local duel' : 'Practice · no rewards'}</div><h2>${esc(title)}</h2>
        ${this.statsLine(match, opts.mode === 'local')}
        <div class="btn-col"><button class="btn primary big wide" data-act="pv-again" data-arg="${opts.mode}">${ICON.restart}<span>Rematch</span></button>
        <button class="btn wide" data-act="pv-leave">${ICON.back}<span>Done</span></button></div></div>`);
      return;
    }
    const res = settleMatch(p, score, opts.rival.elo ?? p.elo, mulberry32(opts.seed ^ 0x9e3779b9), now);
    this.save();
    this.lastResult = res;
    const arena = arenaOf(p);
    ui.openModal(`<div class="sheet result ${score === 0 ? 'lost' : 'won'}" data-noclose>
      <div class="eyebrow">Ranked · vs ${esc(opts.rival.name)}</div>
      <h2>${score === 1 ? 'Victory' : score === 0 ? 'Defeat' : 'Draw'}</h2>
      <div class="elo-line ${res.elo >= 0 ? 'up' : 'down'}">${ICON.elo}<b>${p.elo}</b><i>${res.elo >= 0 ? '+' : ''}${res.elo}</i></div>
      ${res.arenaUp ? `<div class="arena-up">New arena: <b>${arena.name}</b>. New units can now drop from Checkpoints.</div>` : ''}
      ${this.statsLine(match)}
      <div class="rewards"><span class="pill gold">${ICON.token}<b>+${res.tokens}</b> Tokens</span><span class="pill">${ICON.usage}<b>+${res.usage}</b> Usage</span></div>
      ${res.reached.map((l) => `<div class="lvlup">${ICON.usage} Usage level ${l} · ${usageTier(l)} — +${100 * l} Tokens, +2 Resets, Limits reset</div>`).join('')}
      ${res.checkpoint ? `<button class="checkpoint ${res.checkpoint.kind}" data-act="pv-open" style="--cc:${CHECKPOINT_INFO[res.checkpoint.kind].css}"><span class="cp-box"></span><b>${CHECKPOINT_INFO[res.checkpoint.kind].name}</b><i>Tap to open</i></button>` : ''}
      <div class="btn-col">
        <button class="btn primary big wide" data-act="pv-again" data-arg="ranked">${ICON.swords}<span>Battle again</span><em>${ICON.limit}1</em></button>
        <button class="btn wide" data-act="pv-leave">${ICON.back}<span>Ranked home</span></button>
      </div></div>`);
    if (!res.checkpoint) ui.modal.querySelector('.checkpoint')?.remove();
    this.host.renderNow();
  }

  private statsLine(match: PvpMatch, local = false) {
    const row = (side: number, label = '') => {
      const s = match.sides[side];
      return `<div class="meta-row center">${label ? `<span class="pill who">${esc(label)}</span>` : `<span class="pill">Wave <b>${match.wave}</b></span>`}<span class="pill">${s.kills} ${s.kills === 1 ? 'kill' : 'kills'}</span><span class="pill">${s.merges} ${s.merges === 1 ? 'merge' : 'merges'}</span><span class="pill">Top rank <b>${s.maxRank}</b></span></div>`;
    };
    return local ? `${row(0, match.sides[0].name)}${row(1, match.sides[1].name)}` : row(0);
  }

  private openCheckpoint(el: HTMLElement) {
    const loot = this.lastResult?.checkpoint as CheckpointLoot | undefined;
    if (!loot) return;
    const unlocked = new Set(this.lastResult!.unlocked);
    el.outerHTML = `<div class="loot">${[{ id: '', n: loot.tokens }, ...loot.weights].map((w, i) => w.id
      ? `<div class="lcard" style="--rc:${RARITY_INFO[rarityOf(TOWER_BY_ID[w.id])].css};animation-delay:${0.15 + i * 0.18}s"><img src="${this.thumb(w.id, 128)}" alt=""><b>${unlocked.has(w.id) ? 'NEW' : `+${w.n}`}</b><i>${esc(TOWER_BY_ID[w.id].name)}</i></div>`
      : `<div class="lcard tok" style="animation-delay:0.05s"><span>${ICON.token}</span><b>+${w.n}</b><i>Tokens</i></div>`).join('')}</div>`;
    this.host.audio.upgrade();
    this.host.renderNow();
  }

  // ------------------------------------------------------------------ clicks
  private onClick(act: string, arg: string, el: HTMLElement): boolean {
    if (act === 'duel-resume') { this.host.duelResume(); return true; }
    if (act === 'duel-forfeit') { this.host.duelForfeit(); return true; }
    if (!act.startsWith('pv-')) return false;
    const p = this.p, now = Date.now();
    const a = this.host.audio;
    switch (act) {
      case 'pv-title': this.host.toTitle(); break;
      case 'pv-home': this.pickSlotFor = null; this.home(); break;
      case 'pv-collection': this.collection(); break;
      case 'pv-shop': this.shop(); break;
      case 'pv-filter': this.filter = arg as Family | 'all'; this.collection(); break;
      case 'pv-unit': this.unit(arg); break;
      case 'pv-upgrade': {
        const r = upgrade(p, arg, now);
        if (!r) { a.deny(); break; }
        this.save(); a.upgrade();
        this.host.ui.say(`${TOWER_BY_ID[arg].name} reached level ${r.level} · +${r.usage} Usage${r.reached.length ? ` · Usage level ${r.reached[r.reached.length - 1]}!` : ''}`);
        this.unit(arg);
        if (this.host.ui.menu.dataset.view === 'pvp-coll') this.collection();
        break;
      }
      case 'pv-talent': {
        const [id, tier, opt] = arg.split(':');
        const r = chooseTalent(p, id, Number(tier), Number(opt));
        if (r === 'resets') { a.deny(); this.host.ui.say(`Changing a talent costs ${TALENT_RESPEC_RESETS} Reset.`); break; }
        if (r !== 'ok') break;
        this.save(); a.click(); this.unit(id);
        break;
      }
      case 'pv-use': this.host.ui.closeModal(); this.pickSlotFor = arg; this.collection(); break;
      case 'pv-pick-cancel': this.pickSlotFor = null; this.collection(); break;
      case 'pv-slot':
        if (this.pickSlotFor && setDeckSlot(p, Number(arg), this.pickSlotFor)) { this.save(); a.click(); }
        this.pickSlotFor = null; this.collection();
        break;
      case 'pv-buy': {
        const r = buyOffer(p, arg, now);
        if (r === 'ok') { this.save(); a.upgrade(); this.host.ui.say('Purchased'); }
        else { a.deny(); this.host.ui.say(r === 'tokens' ? 'Not enough Tokens' : r === 'resets' ? 'Not enough Resets' : r === 'full' ? 'Your Limits are already full' : 'Not available'); }
        this.shop();
        break;
      }
      case 'pv-reset':
        if (resetLimits(p, now)) { this.save(); a.upgrade(); this.host.ui.say(`Limits reset to ${LIMIT_MAX}/${LIMIT_MAX}`); } else a.deny();
        this.home();
        break;
      case 'pv-battle': this.battle('ranked'); break;
      case 'pv-practice': this.battle('practice'); break;
      case 'pv-local': this.battle('local'); break;
      case 'pv-again': this.host.ui.closeModal(); this.host.endDuel(); if (arg === 'ranked' && limits(p, now).n <= 0) { this.home(); this.host.ui.say('Limit reached. Reset it or wait for the next one.'); } else this.battle(arg as 'ranked'); break;
      case 'pv-leave': this.host.ui.closeModal(); this.host.endDuel(); this.home(); break;
      case 'pv-open': this.openCheckpoint(el); break;
      default: return false;
    }
    return true;
  }
}
