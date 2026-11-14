// Unit tests for duels: roster logic, economy, profile actions, match rules, abilities and bosses.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWERS, TOWER_BY_ID, approxDps } from '../src/data/towers';
import { mulberry32 } from '../src/data/levels';
import { FAMILIES } from '../src/data/types';
import { PVP_UNITS, SIGNATURE_IDS, RARITY_INFO, rarityOf, selectRoster, PER_FAMILY, SIGNATURES_PER_FAMILY } from '../src/pvp/roster';
import { SIGNATURES, SIGNATURE_BY_ID, TALENT_LEVELS, talentMods } from '../src/pvp/signatures';
import {
  ARENAS, LIMIT_MAX, LIMIT_REGEN_S, MAX_CARD_LEVEL, TOKENS_TABLE, WEIGHTS_TABLE, arenaFor, dailyOffers, eloDelta, nextLimitIn, openCheckpoint,
  startLevel, tickLimits, unitsUpTo, upgradeCost, usageLevel, usageToNext,
} from '../src/pvp/economy';
import {
  DECK_SIZE, STARTER_DECK, buyOffer, canUpgrade, chooseTalent, grantWeights, newProfile, resetLimits, sanitize, setDeckSlot, settleMatch, shopOffers,
  spendLimit, upgrade, deckCards,
} from '../src/pvp/profile';
import { HEARTS, MAX_POWER, MAX_RANK, POWER_COSTS, PvpMatch, START_COMPUTE, buildSpec, type DeckCard } from '../src/pvp/match';
import { PvpBot } from '../src/pvp/bot';
import type { Tower } from '../src/sim/sim';

const T0 = 1_700_000_000_000;
const deckOf = (ids: string[], level?: number, talents = [-1, -1, -1, -1]): DeckCard[] => ids.map((id) => ({ id, level: level ?? startLevel(id), talents }));
const COMMONS = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'cl_thinking'];
const newMatch = (a = COMMONS, b = COMMONS, seed = 1, level?: number) => new PvpMatch({ name: 'A', deck: deckOf(a, level) }, { name: 'B', deck: deckOf(b, level) }, seed);
const run = (m: PvpMatch, secs: number, bots: PvpBot[] = []) => { for (let i = 0; i < secs * 30 && !m.ended; i++) { for (const b of bots) b.update(1 / 30); m.step(1 / 30); m.sim.events.length = 0; m.events.length = 0; } };
/** Put a unit of deck slot `deck` and `rank` at a free slot of `side`. */
function place(m: PvpMatch, side: number, deck: number, rank = 1): Tower {
  const [c, r] = m.freeSlots(side)[0];
  const t = m.sim.placeTower(m.sides[side].deck[deck].def, c, r, side, rank, true, { deck });
  m.sim.recomputeBuffs();
  return t;
}

// ------------------------------------------------------------------ roster
test('roster: six units per family, all rarities, no income, three signatures each', () => {
  const sel = selectRoster();
  assert.equal(sel.length, 4);
  for (const f of sel) {
    assert.equal(f.units.length, PER_FAMILY);
    assert.equal(f.signatures.length, SIGNATURES_PER_FAMILY);
    assert.ok(f.units.every((t) => t.kind !== 'income' && t.family === f.family));
    assert.deepEqual(new Set(f.units.map(rarityOf)).size, 4, `${f.family} covers every rarity`);
    for (const s of f.signatures) assert.ok(f.units.includes(s));
  }
  assert.equal(PVP_UNITS.length, 24);
  assert.equal(new Set(PVP_UNITS.map((t) => t.id)).size, 24);
  assert.equal(SIGNATURE_IDS.size, 12);
});

test('signatures: every signature unit has an ability and 4 talent pairs, and nothing else does', () => {
  assert.equal(SIGNATURES.length, 12);
  for (const s of SIGNATURES) {
    assert.ok(SIGNATURE_IDS.has(s.unit), `${s.unit} is a selected signature`);
    assert.equal(s.talents.length, TALENT_LEVELS.length);
    for (const pair of s.talents) assert.equal(pair.length, 2);
    assert.ok(s.ability.text(1).length > 10);
  }
  for (const id of SIGNATURE_IDS) assert.ok(SIGNATURE_BY_ID[id], `${id} has a signature entry`);
});

test('talents only apply once their level is reached', () => {
  const lo = talentMods('gem_ultra', [0, 0, 0, 0], 10);
  assert.equal(lo.targets, 1); // level 9 talent
  assert.equal(lo.abilityCd, undefined); // level 11 talent not yet
  const hi = talentMods('gem_ultra', [1, 1, 1, 1], 15);
  assert.equal(hi.dmg, 0.25);
  assert.ok(hi.flags!.includes('burstSlow') && hi.flags!.includes('burstBurn'));
  assert.deepEqual(talentMods('gem_flash', [0, 0, 0, 0], 15), { flags: [] });
});

test('battle specs are normalised: rarer and higher level hits harder, nothing is NaN', () => {
  for (const t of PVP_UNITS) {
    for (const lvl of [startLevel(t.id), MAX_CARD_LEVEL]) {
      const s = buildSpec({ id: t.id, level: lvl, talents: [0, 1, 0, 1] });
      for (const v of [s.def.dmg, s.def.rate, s.def.range, s.ap, s.levelMult]) assert.ok(Number.isFinite(v), `${t.id} ${lvl}`);
    }
  }
  const c = buildSpec({ id: 'gem_flash', level: 7, talents: [] }), l = buildSpec({ id: 'gem_twinsuns', level: 7, talents: [] });
  assert.ok(approxDps(l.def) > approxDps(c.def) * 1.2, 'legendary out-damages common at equal level');
  assert.ok(buildSpec({ id: 'gem_flash', level: 9, talents: [] }).levelMult > c.levelMult);
});

// ------------------------------------------------------------------ economy
test('upgrade tables cover every level from each rarity start to 15', () => {
  for (const r of Object.keys(WEIGHTS_TABLE) as (keyof typeof WEIGHTS_TABLE)[]) assert.equal(WEIGHTS_TABLE[r].length, MAX_CARD_LEVEL - RARITY_INFO[r].startLevel, r);
  assert.equal(TOKENS_TABLE.length, MAX_CARD_LEVEL + 1);
  for (const t of PVP_UNITS) {
    for (let L = startLevel(t.id); L < MAX_CARD_LEVEL; L++) {
      const c = upgradeCost(t.id, L)!;
      assert.ok(c.weights > 0 && c.tokens > 0, `${t.id} ${L}`);
    }
    assert.equal(upgradeCost(t.id, MAX_CARD_LEVEL), null);
  }
});

test('usage levels and limit regeneration', () => {
  assert.equal(usageLevel(0).level, 1);
  assert.equal(usageLevel(usageToNext(1)).level, 2);
  assert.equal(usageLevel(usageToNext(1) - 1).level, 1);
  const s = { n: 2, t: T0 };
  assert.deepEqual(tickLimits(s, T0 + LIMIT_REGEN_S * 1000 - 1), s);
  assert.equal(tickLimits(s, T0 + LIMIT_REGEN_S * 1000).n, 3);
  assert.equal(tickLimits(s, T0 + LIMIT_REGEN_S * 1000 * 100).n, LIMIT_MAX);
  const half = tickLimits(s, T0 + LIMIT_REGEN_S * 1500);
  assert.equal(half.n, 3);
  assert.ok(Math.abs(nextLimitIn(half, T0 + LIMIT_REGEN_S * 1500) - LIMIT_REGEN_S / 2) < 1e-6, 'partial progress carries over');
});

test('elo: winning gains, losing loses, upsets pay more', () => {
  assert.ok(eloDelta(500, 500, 1) > 0 && eloDelta(500, 500, 0) < 0);
  assert.ok(eloDelta(500, 800, 1) > eloDelta(500, 300, 1));
  assert.equal(arenaFor(0).id, 0);
  assert.equal(arenaFor(ARENAS[2].elo).id, 2);
  // every PvP unit unlocks in exactly one arena
  const all = ARENAS.flatMap((a) => a.unlocks);
  assert.equal(all.length, 24);
  assert.equal(new Set(all).size, 24);
});

test('checkpoints only contain units from unlocked arenas', () => {
  for (let arena = 0; arena < ARENAS.length; arena++) {
    const pool = new Set(unitsUpTo(arena));
    for (const kind of ['common', 'rare', 'epic', 'legendary'] as const) for (let s = 1; s < 20; s++) {
      const loot = openCheckpoint(kind, arena, mulberry32(s * 77 + arena));
      assert.ok(loot.tokens > 0);
      for (const w of loot.weights) { assert.ok(pool.has(w.id), `${w.id} at arena ${arena}`); assert.ok(w.n > 0 && Number.isInteger(w.n)); }
    }
  }
});

test('daily shop is deterministic per day and only offers unlocked units', () => {
  assert.deepEqual(dailyOffers(100, 1), dailyOffers(100, 1));
  for (const o of dailyOffers(100, 0)) if (o.id) assert.ok(unitsUpTo(0).includes(o.id));
});

// ------------------------------------------------------------------ profile
test('new profiles start valid; sanitize repairs damage', () => {
  const p = newProfile(T0);
  assert.equal(p.deck.length, DECK_SIZE);
  assert.ok(p.deck.every((id) => p.cards[id]));
  const broken = { ...newProfile(T0), tokens: NaN, deck: ['nope', 'gem_flash', 'gem_flash'], cards: { nope: { level: 3, weights: 1 }, gem_flash: { level: 99, weights: -4 } } } as never;
  const fixed = sanitize(broken, T0);
  assert.equal(fixed.tokens, 300);
  assert.equal(fixed.cards.gem_flash.level, MAX_CARD_LEVEL);
  assert.equal(fixed.cards.gem_flash.weights, 0);
  assert.ok(!('nope' in fixed.cards));
  assert.equal(fixed.deck.length, DECK_SIZE);
  assert.equal(new Set(fixed.deck).size, DECK_SIZE);
  for (const id of STARTER_DECK) assert.ok(fixed.cards[id]);
});

test('upgrading spends Weights and Tokens, pays Usage, stops at 15', () => {
  const p = newProfile(T0);
  assert.equal(canUpgrade(p, 'gem_flash'), 'weights');
  p.cards.gem_flash.weights = 100000; p.tokens = 1e7;
  const r = upgrade(p, 'gem_flash', T0)!;
  assert.equal(r.level, 2);
  assert.equal(p.cards.gem_flash.weights, 100000 - WEIGHTS_TABLE.common[0]);
  assert.equal(p.tokens, 1e7 - TOKENS_TABLE[2]);
  assert.ok(p.usage > 0);
  while (upgrade(p, 'gem_flash', T0));
  assert.equal(p.cards.gem_flash.level, MAX_CARD_LEVEL);
  assert.equal(canUpgrade(p, 'gem_flash'), 'max');
  assert.ok(p.resets > 5, 'Usage levels paid Resets');
});

test('talents: locked below level, first pick free, changes cost a Reset', () => {
  const p = newProfile(T0);
  grantWeights(p, 'gem_ultra', 1);
  assert.equal(chooseTalent(p, 'gem_ultra', 0, 1), 'locked');
  p.cards.gem_ultra.level = 9;
  const resets = p.resets;
  assert.equal(chooseTalent(p, 'gem_ultra', 0, 1), 'ok');
  assert.equal(p.resets, resets);
  assert.equal(chooseTalent(p, 'gem_ultra', 0, 1), 'same');
  assert.equal(chooseTalent(p, 'gem_ultra', 0, 0), 'ok');
  assert.equal(p.resets, resets - 1);
  assert.equal(chooseTalent(p, 'gem_ultra', 1, 0), 'locked', 'level 11 tier still locked');
  p.resets = 0;
  assert.equal(chooseTalent(p, 'gem_ultra', 0, 1), 'resets');
  assert.equal(chooseTalent(p, 'gem_flash', 0, 0), 'locked', 'not a signature');
});

test('deck slots swap instead of duplicating', () => {
  const p = newProfile(T0);
  const before = [...p.deck];
  assert.ok(setDeckSlot(p, 0, p.deck[3]));
  assert.equal(p.deck[0], before[3]); assert.equal(p.deck[3], before[0]);
  assert.ok(!setDeckSlot(p, 0, 'gk_supernova'), 'cannot use a unit you do not own');
  grantWeights(p, 'gem_banana', 1);
  assert.ok(setDeckSlot(p, 2, 'gem_banana'));
  assert.equal(new Set(p.deck).size, DECK_SIZE);
});

test('limits: battles spend them, Resets refill them', () => {
  const p = newProfile(T0);
  for (let i = 0; i < LIMIT_MAX; i++) assert.ok(spendLimit(p, T0));
  assert.ok(!spendLimit(p, T0));
  const resets = p.resets;
  assert.ok(resetLimits(p, T0));
  assert.equal(p.limits.n, LIMIT_MAX);
  assert.equal(p.resets, resets - 1);
  assert.ok(!resetLimits(p, T0), 'nothing to reset when full');
  for (let i = 0; i < 3; i++) spendLimit(p, T0);
  assert.ok(spendLimit(p, T0 + LIMIT_REGEN_S * 1000 * 2), 'regenerated limits are usable');
});

test('settling matches: wins pay Tokens, Elo and a Checkpoint; losses cost Elo', () => {
  const p = newProfile(T0);
  const w = settleMatch(p, 1, 0, mulberry32(5), T0);
  assert.ok(w.elo > 0 && w.tokens > 0 && w.checkpoint);
  assert.equal(p.wins, 1);
  const elo = p.elo;
  const l = settleMatch(p, 0, elo, mulberry32(6), T0);
  assert.ok(l.elo < 0 && !l.checkpoint);
  assert.equal(p.elo, elo + l.elo);
  assert.equal(p.losses, 1);
  // ten wins guarantee an Epic (or better) Checkpoint
  const q = newProfile(T0);
  const kinds = Array.from({ length: 10 }, (_, i) => settleMatch(q, 1, q.elo, mulberry32(1000 + i), T0).checkpoint!.kind);
  assert.ok(kinds.some((k) => k === 'epic' || k === 'legendary'));
});

test('shop: each daily deal sells once; Limits deal needs Resets and room', () => {
  const p = newProfile(T0);
  p.tokens = 1e6;
  const deal = shopOffers(p, T0).find((o) => o.costTokens)!;
  assert.equal(buyOffer(p, deal.key, T0), 'ok');
  assert.equal(buyOffer(p, deal.key, T0), 'sold');
  assert.equal(buyOffer(p, 'limits', T0), 'full');
  spendLimit(p, T0);
  assert.equal(buyOffer(p, 'limits', T0), 'ok');
  assert.equal(shopOffers(p, T0 + 86400000).find((o) => o.costTokens)!.sold, false, 'deals reset the next day');
});

test('first Weight of a unit unlocks it', () => {
  const p = newProfile(T0);
  assert.ok(grantWeights(p, 'gk_unhinged', 5));
  assert.equal(p.cards.gk_unhinged.weights, 4);
  assert.ok(!grantWeights(p, 'gk_unhinged', 5));
  assert.equal(p.cards.gk_unhinged.weights, 9);
  assert.ok(!grantWeights(p, 'gem_nano', 1), 'campaign-only towers are not PvP units');
  assert.ok(!p.cards.gem_nano);
});

// ------------------------------------------------------------------ match rules
test('summoning: cost rises each time, needs compute and a free slot', () => {
  const m = newMatch();
  const c0 = m.summonCost(0);
  assert.ok(m.summon(0));
  assert.ok(m.summonCost(0) > c0);
  assert.equal(m.sides[0].compute, START_COMPUTE - c0);
  m.sides[0].compute = 1e9;
  for (let i = 0; i < 20; i++) m.summon(0);
  assert.equal(m.units(0).length, 15);
  assert.equal(m.summon(0), null, 'board full');
  assert.equal(m.units(1).length, 0, 'the other side is untouched');
  m.sides[1].compute = 0;
  assert.equal(m.summon(1), null, 'no compute');
  for (const t of m.units(0)) assert.ok(m.sideOfCell(t.r) === 0);
});

test('merging: same unit and rank only, result is one rank higher where the target was', () => {
  const m = newMatch();
  const a = place(m, 0, 0), b = place(m, 0, 0), c = place(m, 0, 1), d = place(m, 0, 0, 2);
  const e = place(m, 1, 0);
  assert.ok(!m.canMerge(a, c), 'different unit');
  assert.ok(!m.canMerge(a, d), 'different rank');
  assert.ok(!m.canMerge(a, e), 'other player');
  assert.ok(!m.canMerge(a, a), 'itself');
  const where = [b.c, b.r];
  const r = m.merge(a, b)!;
  assert.equal(r.rank, 2);
  assert.deepEqual([r.c, r.r], where);
  assert.ok(!m.sim.towers.includes(a) && !m.sim.towers.includes(b));
  const top = place(m, 0, 2, MAX_RANK), top2 = place(m, 0, 2, MAX_RANK);
  assert.ok(!m.canMerge(top, top2), 'rank 7 is the cap');
});

test('power-ups follow the cost ladder and cap at level 5', () => {
  const m = newMatch();
  m.sides[0].compute = 1e6;
  for (let i = 0; i < MAX_POWER - 1; i++) {
    const before = m.sides[0].compute;
    assert.ok(m.powerUp(0, 2));
    assert.equal(before - m.sides[0].compute, POWER_COSTS[i]);
  }
  assert.equal(m.sides[0].power[2], MAX_POWER);
  assert.ok(!m.powerUp(0, 2));
  const t = place(m, 0, 2), u = place(m, 0, 3);
  assert.ok(t.stats.dmg > 0);
  const dmg = u.stats.dmg;
  m.powerUp(0, 3);
  assert.ok(u.stats.dmg > dmg, 'power-up applies to units already on the board');
});

test('higher rank means more damage and speed', () => {
  const m = newMatch();
  const a = place(m, 0, 0, 1), b = place(m, 0, 0, 4);
  assert.ok(b.stats.dmg > a.stats.dmg * 5 && b.stats.rate > a.stats.rate);
});

test('lanes are isolated: your units never hit the rival lane', () => {
  const m = newMatch();
  for (let i = 0; i < 15; i++) place(m, 0, i % 5, 3);
  m.sim.spawnEnemy('trojan', 1, 50);
  const e = m.sim.enemies[0];
  const hp = e.hp;
  for (let i = 0; i < 30 * 6; i++) { m.sim.step(1 / 30); m.sim.events.length = 0; }
  assert.equal(e.hp, hp);
});

test('kills pay compute to the side that killed; leaks cost that side hearts', () => {
  const m = newMatch();
  for (let i = 0; i < 15; i++) place(m, 0, i % 5, 4);
  const c0 = m.sides[0].compute, c1 = m.sides[1].compute;
  run(m, 40);
  assert.ok(m.sides[0].compute > c0, 'side 0 earned from its kills');
  assert.ok(m.sides[1].hearts < HEARTS, 'empty side 1 leaked');
  assert.equal(m.sides[0].hearts, HEARTS);
  assert.equal(m.sides[1].compute, c1, 'side 1 killed nothing');
});

test('a full match between AI rivals ends with a winner, deterministically', () => {
  const play = (seed: number) => {
    const m = newMatch(COMMONS, COMMONS, seed);
    const bots = [new PvpBot(m, 0, 0.7, seed), new PvpBot(m, 1, 0.7, seed + 1)];
    run(m, 1200, bots);
    return m;
  };
  const a = play(3), b = play(3);
  assert.ok(a.ended);
  assert.equal(a.winner, b.winner);
  assert.equal(a.wave, b.wave);
  assert.equal(a.time, b.time);
  assert.ok(a.wave >= 6, `went a reasonable distance (wave ${a.wave})`);
});

test('fairness: mirrored AI decks win about equally', () => {
  const wins = [0, 0];
  for (let s = 1; s <= 30; s++) {
    const m = newMatch(COMMONS, COMMONS, s);
    run(m, 1200, [new PvpBot(m, 0, 0.7, s * 2), new PvpBot(m, 1, 0.7, s * 2 + 1)]);
    if (m.winner >= 0) wins[m.winner]++;
  }
  assert.ok(Math.min(...wins) >= 7, `wins ${wins}`);
});

// ------------------------------------------------------------------ abilities
const sigMatch = (id: string, talents = [-1, -1, -1, -1], level = 15) =>
  new PvpMatch({ name: 'A', deck: [{ id, level, talents }, ...deckOf(COMMONS.slice(0, 4), level)] }, { name: 'B', deck: deckOf(COMMONS) }, 2);

test('Deep Think rails mark enemies for extra damage', () => {
  const m = sigMatch('gem_deepthink');
  place(m, 0, 0, 3);
  for (let i = 0; i < 6; i++) m.sim.spawnEnemy('trojan', 0, 20, 2 + i * 0.3);
  run(m, 3);
  assert.ok(m.sim.enemies.some((e) => e.pathIdx === 0 && e.vulnT > 0 && e.vuln >= 0.12));
});

test('Twin Suns: burning enemies explode when they die', () => {
  const m = sigMatch('gem_twinsuns');
  place(m, 0, 0, 5);
  for (let i = 0; i < 8; i++) m.sim.spawnEnemy('bug', 0, 2, 3 + i * 0.2);
  let flares = 0;
  for (let i = 0; i < 30 * 6; i++) { m.step(1 / 30); flares += m.sim.events.filter((e) => e.t === 'explode' && e.tower?.def.id === 'gem_twinsuns').length; m.sim.events.length = 0; m.events.length = 0; }
  assert.ok(flares > 0);
});

test('Fable kills pay extra compute', () => {
  const run1 = (id: string) => {
    const m = new PvpMatch({ name: 'A', deck: [{ id, level: 12, talents: [] }] }, { name: 'B', deck: deckOf(COMMONS) }, 4);
    place(m, 0, 0, 4);
    for (let i = 0; i < 6; i++) m.sim.spawnEnemy('bug', 0, 1, 2 + i * 0.5);
    run(m, 3.5);
    return { earned: m.sides[0].computeEarned, kills: m.sides[0].kills };
  };
  const f = run1('cl_fable'), x = run1('gem_flash');
  assert.ok(f.kills > 0 && f.earned / f.kills > x.earned / Math.max(1, x.kills));
});

test('Grok Heavy executes low-health enemies', () => {
  const m = sigMatch('gk_heavy');
  place(m, 0, 0, 2);
  for (let i = 0; i < 5; i++) { const e = m.sim.spawnEnemy('trojan', 0, 30, 2 + i * 0.3); e.hp = e.maxHp * 0.1; }
  let casts = 0;
  for (let i = 0; i < 30 * 4; i++) { m.step(1 / 30); casts += m.events.filter((e) => e.t === 'ability' && e.text === 'Overkill').length; m.sim.events.length = 0; m.events.length = 0; }
  assert.ok(casts > 0);
});

test('Event Horizon tears max health from what it pulls', () => {
  const m = sigMatch('gk_blackhole');
  const t = place(m, 0, 0, 2);
  const e = m.sim.spawnEnemy('trojan', 0, 30, 0);
  // park it next to the tower
  let best = 0, bd = 1e9;
  for (let d = 0; d < e.path.length; d += 0.1) { e.dist = d; m.sim.place(e); const k = Math.hypot(e.x - t.x, e.z - t.z); if (k < bd) { bd = k; best = d; } }
  e.dist = best; m.sim.place(e); e.stunT = 99; e.armor = 0;
  const hp = e.hp;
  run(m, 8);
  assert.ok(e.hp < hp - e.maxHp * 0.01);
});

test('Supernova Cascade hits the whole lane', () => {
  const m = sigMatch('gk_supernova');
  place(m, 0, 0, 1);
  for (let i = 0; i < 10; i++) { const e = m.sim.spawnEnemy('trojan', 0, 60, i); e.stunT = 99; }
  let cascades = 0;
  for (let i = 0; i < 30 * 12; i++) { m.step(1 / 30); cascades += m.events.filter((e) => e.t === 'ability' && e.text === 'Cascade').length; m.sim.events.length = 0; m.events.length = 0; }
  assert.ok(cascades > 0);
});

test('Claude Code Agentic Merge can skip a rank', () => {
  let skipped = 0;
  for (let s = 1; s <= 40; s++) {
    const m = new PvpMatch({ name: 'A', deck: [{ id: 'cl_code', level: 15, talents: [] }] }, { name: 'B', deck: deckOf(COMMONS) }, s);
    const a = place(m, 0, 0), b = place(m, 0, 0);
    if (m.merge(a, b)!.rank === 3) skipped++;
  }
  assert.ok(skipped > 0 && skipped < 40, `skipped ${skipped}/40`);
});

test('timed abilities fire (Prism Burst, Parallelize, Ship It)', () => {
  for (const id of ['gem_ultra', 'cx_swarm', 'cx_max']) {
    const m = sigMatch(id);
    place(m, 0, 0, 2);
    for (let i = 0; i < 12; i++) { const e = m.sim.spawnEnemy('trojan', 0, 80, i * 0.8); e.stunT = 99; }
    let casts = 0;
    for (let i = 0; i < 30 * 14; i++) { m.step(1 / 30); casts += m.events.filter((e) => e.t === 'ability').length; m.sim.events.length = 0; m.events.length = 0; }
    assert.ok(casts > 0, id);
  }
});

// ------------------------------------------------------------------ bosses
function bossMatch(boss: string) {
  const m = newMatch();
  for (let i = 0; i < 8; i++) place(m, 0, i % 5, 3);
  const e = m.sim.spawnEnemy(boss, 0, 50);
  e.stunT = 0; e.hp = 1e9; e.maxHp = 1e9;
  return { m, e };
}

test('boss Deepfake Titan steals ranks but never below 1', () => {
  const { m } = bossMatch('titan');
  const before = m.units(0).reduce((a, t) => a + t.rank, 0);
  run(m, 20);
  const after = m.units(0).reduce((a, t) => a + t.rank, 0);
  assert.ok(after < before);
  assert.ok(m.units(0).every((t) => t.rank >= 1));
});

test('boss Hydra swaps units without losing or stacking any', () => {
  const { m } = bossMatch('hydra');
  const cells = () => m.units(0).map((t) => `${t.c},${t.r}`).sort().join('|');
  const before = cells();
  let swaps = 0;
  for (let i = 0; i < 30 * 13; i++) { m.step(1 / 30); swaps += m.events.filter((e) => e.t === 'bossCast').length; m.sim.events.length = 0; m.events.length = 0; }
  assert.ok(swaps > 0);
  assert.equal(cells(), before, 'same set of occupied cells');
  assert.equal(new Set(m.units(0).map((t) => `${t.c},${t.r}`)).size, m.units(0).length);
});

test('boss Maximizer jams units', () => {
  const { m } = bossMatch('maximizer');
  let jammed = false;
  for (let i = 0; i < 30 * 13 && !jammed; i++) { m.step(1 / 30); jammed = m.units(0).some((t) => t.jamT > 0); m.sim.events.length = 0; m.events.length = 0; }
  assert.ok(jammed);
});

test('every PvP unit works in a real match (no NaN, nothing stuck)', () => {
  for (let i = 0; i < PVP_UNITS.length; i += 5) {
    const ids = PVP_UNITS.slice(i, i + 5).map((t) => t.id);
    while (ids.length < 5) ids.push(COMMONS[ids.length]);
    const m = new PvpMatch({ name: 'A', deck: deckOf(ids, 12, [0, 1, 0, 1]) }, { name: 'B', deck: deckOf(COMMONS, 12) }, i + 1);
    const bots = [new PvpBot(m, 0, 0.8, i), new PvpBot(m, 1, 0.8, i + 1)];
    for (let k = 0; k < 30 * 240 && !m.ended; k++) {
      for (const b of bots) b.update(1 / 30);
      m.step(1 / 30);
      m.sim.events.length = 0; m.events.length = 0;
    }
    for (const t of m.sim.towers) assert.ok(Number.isFinite(t.stats.dmg) && Number.isFinite(t.stats.rate), t.def.id);
    for (const s of m.sides) assert.ok(Number.isFinite(s.compute) && s.compute >= 0);
    assert.ok(m.wave >= 4, `${ids} reached wave ${m.wave}`);
  }
});

test('starter deck and every arena unlock refer to real towers', () => {
  for (const id of [...STARTER_DECK, ...ARENAS.flatMap((a) => a.unlocks)]) assert.ok(TOWER_BY_ID[id], id);
  assert.ok(FAMILIES.every((f) => PVP_UNITS.some((t) => t.family === f)));
  assert.equal(TOWERS.length, 48);
  assert.equal(deckCards(newProfile(T0)).length, DECK_SIZE);
});
