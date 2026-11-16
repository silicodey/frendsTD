import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPerk, currentPerk, perkEndsIn, perkForWeek, setPerkOverrides, type WeeklyPerk } from '../src/pvp/perks';
import { weekNumber } from '../src/pvp/economy';
import { PvpMatch, buildSpec, type DeckCard } from '../src/pvp/match';
import type { Tower } from '../src/sim/sim';

const at = (iso: string) => Date.parse(iso);

test('weeks run Monday 00:00 UTC to Monday; the two scheduled weeks', () => {
  assert.equal(weekNumber(at('2026-11-16T00:00:00Z')), weekNumber(at('2026-11-22T23:59:59Z')));
  assert.notEqual(weekNumber(at('2026-11-15T23:59:59Z')), weekNumber(at('2026-11-16T00:00:00Z')));
  const w1 = currentPerk(at('2026-11-18T10:00:00Z'));
  assert.equal(w1.family, 'gemini');
  assert.deepEqual(w1.effect, { kind: 'critDmg', amount: 0.03 });
  const w2 = currentPerk(at('2026-11-25T10:00:00Z'));
  assert.equal(w2.family, 'claude');
  assert.deepEqual(w2.effect, { kind: 'mergeSpawn', r1: 0.15, r2: 0.05 });
  assert.ok(Math.abs(perkEndsIn(at('2026-11-22T23:00:00Z')) - 3600) < 1);
  // every week has a perk
  for (let w = 2900; w < 2960; w++) assert.ok(perkForWeek(w).family);
});

test('server config can override a week; junk is rejected', () => {
  setPerkOverrides({ '2026-11-30': { family: 'grok', effect: { kind: 'dmg', amount: 0.06 } }, '2026-12-07': { family: 'nope', effect: { kind: 'dmg', amount: 1 } } });
  assert.equal(currentPerk(at('2026-12-01T12:00:00Z')).family, 'grok');
  assert.notEqual(currentPerk(at('2026-12-08T12:00:00Z')).family, 'nope');
  setPerkOverrides({});
  assert.equal(cleanPerk({ family: 'gemini', effect: { kind: 'dmg', amount: 9 } })!.effect.kind === 'dmg' && (cleanPerk({ family: 'gemini', effect: { kind: 'dmg', amount: 9 } })!.effect as { amount: number }).amount, 0.5, 'amounts are capped');
  assert.equal(cleanPerk({ family: 'gemini', effect: { kind: 'explode' } }), null);
  assert.equal(cleanPerk({ family: 'Tokyo', effect: { kind: 'shieldStart' } })!.family, 'grok', 'display names work too');
});

const card = (id: string, level = 6): DeckCard => ({ id, level, talents: [-1, -1, -1] });
const deck = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'gem_banana'].map((id) => card(id));
const perk = (family: WeeklyPerk['family'], effect: WeeklyPerk['effect']): WeeklyPerk => ({ id: 't', family, effect });

test('crit damage perk: +3% on the featured class only', () => {
  const p = perk('gemini', { kind: 'critDmg', amount: 0.03 });
  const a = buildSpec(card('gem_flash'), { critDmg: 1.5 }), b = buildSpec(card('gem_flash'), { critDmg: 1.5, perk: p });
  assert.ok(Math.abs(b.def.crit![1] / a.def.crit![1] - 1.03) < 1e-9);
  const c = buildSpec(card('cl_sonnet'), { critDmg: 1.5, perk: p });
  assert.equal(c.def.crit![1], 1.5, 'other classes unaffected');
});

test('merge-spawn perk: merging the featured class summons bonus units at about the stated rates', () => {
  const p = perk('claude', { kind: 'mergeSpawn', r1: 0.15, r2: 0.05 });
  let r1 = 0, r2 = 0, merges = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const m = new PvpMatch({ name: 'a', deck: deck.map((c, i) => (i === 0 ? card('cl_sonnet') : c)).map((c, i) => (i === 1 ? card('cl_thinking') : c)) }, { name: 'b', deck }, seed, p);
    const P = m as unknown as { put(side: number, deck: number, rank: number, c: number, r: number, silent: boolean): Tower };
    const s = m.freeSlots(0);
    const a = P.put(0, 0, 1, s[0][0], s[0][1], true), b = P.put(0, 0, 1, s[1][0], s[1][1], true);
    const before = m.units(0).length;
    m.merge(a, b); merges++;
    const extra = m.units(0).filter((t) => t.id > b.id + 1);
    if (m.units(0).length === before) { const x = extra[0]; if (x?.rank === 2) r2++; else if (x) r1++; }
  }
  assert.ok(r1 / merges > 0.09 && r1 / merges < 0.22, `rank-1 bonus ${r1}/${merges}`);
  assert.ok(r2 / merges > 0.015 && r2 / merges < 0.1, `rank-2 bonus ${r2}/${merges}`);
});

test('start-rank, power discount and shield-start perks', () => {
  const sr = new PvpMatch({ name: 'a', deck }, { name: 'b', deck }, 3, perk('gemini', { kind: 'startRank', chance: 1 }));
  sr.sides[0].compute = 1e6;
  for (let i = 0; i < 10; i++) { const t = sr.summon(0)!; assert.equal(t.rank, t.def.family === 'gemini' ? 2 : 1); }
  const pd = new PvpMatch({ name: 'a', deck }, { name: 'b', deck }, 3, perk('codex', { kind: 'powerDiscount', amount: 0.15 }));
  assert.equal(pd.powerCost(0, 2), 85);
  assert.equal(pd.powerCost(0, 0), 100);
  const ss = new PvpMatch({ name: 'a', deck }, { name: 'b', deck }, 3, perk('grok', { kind: 'shieldStart' }));
  ss.sides[0].compute = 1e6;
  for (let i = 0; i < 10; i++) { const t = ss.summon(0)!; assert.equal(t.ext.shield ?? 0, t.def.family === 'grok' ? 1 : 0); }
});

test("the online server puts this week's perk in every match it starts", async () => {
  const { startServer } = await import('../server/index');
  const { PROTO } = await import('../src/net/protocol');
  const srv = startServer({ port: 0, staticDir: null, quiet: true, countdownMs: 200 });
  const port = await srv.ready;
  try {
    const cfg = await (await fetch(`http://localhost:${port}/config`)).json() as { perk: WeeklyPerk };
    assert.equal(cfg.perk.family, currentPerk(Date.now()).family);
    const open = (u: string) => new Promise<WebSocket>((r) => { const w = new WebSocket(u); w.onopen = () => r(w); });
    const a = await open(`ws://localhost:${port}/ws`), b = await open(`ws://localhost:${port}/ws`);
    const next = (w: WebSocket, t: string) => new Promise<Record<string, unknown>>((r) => { const h = (e: MessageEvent) => { const m = JSON.parse(String(e.data)); if (m.t === t) { w.removeEventListener('message', h); r(m); } }; w.addEventListener('message', h); });
    for (const w of [a, b]) w.send(JSON.stringify({ t: 'hello', proto: PROTO, name: 'x', deck }));
    a.send(JSON.stringify({ t: 'create' }));
    const room = await next(a, 'room');
    b.send(JSON.stringify({ t: 'join', code: room.code }));
    await next(b, 'room');
    const st = next(a, 'start');
    a.send(JSON.stringify({ t: 'ready', on: true })); b.send(JSON.stringify({ t: 'ready', on: true }));
    const start = await st as { info: { perk: WeeklyPerk } };
    assert.deepEqual(start.info.perk, currentPerk(Date.now()));
    a.close(); b.close();
  } finally { await srv.close(); }
});
