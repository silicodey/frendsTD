import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_TUNE, PvpMatch, WARN_S, WARD_EVERY, type DeckCard } from '../src/pvp/match';
import type { Tower } from '../src/sim/sim';

const COMMONS = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'gem_banana'];
const deck = (first?: DeckCard): DeckCard[] => [first ?? { id: COMMONS[0], level: 6, talents: [-1, -1, -1] }, ...COMMONS.slice(1).map((id) => ({ id, level: 6, talents: [-1, -1, -1] }))];
const match = (first?: DeckCard) => new PvpMatch({ name: 'A', deck: deck(first) }, { name: 'B', deck: deck() }, 9);
const place = (m: PvpMatch, slot: number, rank = 3) => {
  const [c, r] = m.freeSlots(0)[0];
  return (m as unknown as { put(side: number, deck: number, rank: number, c: number, r: number, silent: boolean): Tower }).put(0, slot, rank, c, r, true);
};
type Internals = { schedule(side: number, kind: string, ids: number[], dur: number, text: string): void };
const cast = (m: PvpMatch, kind: string, t: Tower, dur = 2) => (m as unknown as Internals).schedule(0, kind, [t.id], dur, kind);
const run = (m: PvpMatch, s: number) => { for (let i = 0; i < s * 60; i++) { m.step(1 / 60); m.sim.events.length = 0; } };
const runEvents = (m: PvpMatch, s: number) => { const out: string[] = []; for (let i = 0; i < s * 60; i++) { m.step(1 / 60); for (const e of m.events) out.push(e.t); m.events.length = 0; m.sim.events.length = 0; } return out; };

test('disruptions are telegraphed: a warning first, the effect a second later', () => {
  const m = match(); const t = place(m, 0, 4);
  cast(m, 'drain', t);
  const ev = runEvents(m, WARN_S * 0.5);
  assert.ok(ev.includes('warn'));
  assert.equal(t.rank, 4, 'not yet');
  run(m, WARN_S);
  assert.equal(t.rank, 3);
});

test('a Shield charge blocks exactly one disruption and is spent', () => {
  const m = match(); const t = place(m, 0, 4);
  t.ext.shield = 1;
  cast(m, 'drain', t);
  const ev = runEvents(m, WARN_S + 0.1);
  assert.ok(ev.includes('blocked'));
  assert.equal(t.rank, 4); assert.equal(t.ext.shield, 0);
  cast(m, 'drain', t); run(m, WARN_S + 0.1);
  assert.equal(t.rank, 3);
});

test('Anchored is immune to rank drain; Stable to Mutate and Clip; Hardened halves jams', () => {
  let m = match({ id: 'cl_sonnet', level: 6, talents: [1, -1, -1] }); // Anchored
  let t = place(m, 0, 5);
  for (let i = 0; i < 3; i++) { cast(m, 'drain', t); run(m, WARN_S + 0.1); }
  assert.equal(t.rank, 5);
  m = match({ id: 'cx_mini', level: 6, talents: [1, -1, -1] }); // Stable
  t = place(m, 0, 3);
  cast(m, 'mutate', t); run(m, WARN_S + 0.1);
  assert.ok(m.sim.towers.includes(t), 'not replaced');
  cast(m, 'clip', t, 6); run(m, WARN_S + 0.1);
  assert.ok(t.jamT <= 0);
  m = match({ id: 'gem_banana', level: 6, talents: [1, -1, -1] }); // Hardened
  t = place(m, 0, 3);
  cast(m, 'jam', t, 4); run(m, WARN_S + 0.02);
  assert.ok(t.jamT > 1.5 && t.jamT <= 2.01, `jam ${t.jamT}`);
});

test('Firewall ignores the first disruption each wave, not the second', () => {
  const m = match({ id: 'gem_flash', level: 6, talents: [1, -1, -1] }); // Firewall
  const t = place(m, 0, 5);
  cast(m, 'drain', t); run(m, WARN_S + 0.1);
  assert.equal(t.rank, 5);
  cast(m, 'drain', t); run(m, WARN_S + 0.1);
  assert.equal(t.rank, 4);
});

test('Ward: a support hands adjacent units a Shield charge every 12s', () => {
  const m = new PvpMatch({ name: 'A', deck: [{ id: 'gem_veo', level: 8, talents: [0, 0, -1] }, ...deck().slice(1)] }, { name: 'B', deck: deck() }, 3);
  const slots = m.freeSlots(0);
  const P = m as unknown as { put(side: number, deck: number, rank: number, c: number, r: number, silent: boolean): Tower };
  const halo = P.put(0, 0, 1, slots[0][0], slots[0][1], true);
  const n = P.put(0, 1, 1, slots[1][0], slots[1][1], true); // right next to it
  void halo;
  run(m, WARD_EVERY + 0.5);
  assert.equal(n.ext.shield, 1);
});

test('Courier pays a compute payload; Mutator death changes a unit (a gamble)', () => {
  const m = match();
  place(m, 0, 6); place(m, 1, 6); place(m, 2, 6);
  const c = m.sim.spawnEnemy('courier', 0, 0.3, 2);
  c.bounty = 1;
  const before = m.sides[0].compute;
  run(m, 3);
  assert.ok(!c.alive);
  assert.ok(m.sides[0].compute - before >= 20, `payload ${m.sides[0].compute - before}`);
  const ids = m.units(0).map((t) => t.id).join();
  m.sim.spawnEnemy('mutator', 0, 0.3, 2);
  run(m, 4);
  assert.notEqual(m.units(0).map((t) => t.id).join(), ids, 'one unit was replaced');
});

test('disruptions never target more than 2 units at once', () => {
  const m = match(); const ts = [place(m, 0), place(m, 1), place(m, 2)];
  (m as unknown as Internals).schedule(0, 'jam', ts.map((t) => t.id), 2, 'x');
  run(m, WARN_S + 0.1);
  assert.ok(ts.filter((t) => t.jamT > 0).length <= 2);
});

test('an unprotected board loses little to disruptions (≤15% of how far it gets)', async () => {
  const { PvpBot } = await import('../src/pvp/bot');
  const { STARTER_DECK } = await import('../src/pvp/profile');
  const { startLevel } = await import('../src/pvp/economy');
  const waves = (on: boolean) => {
    BOSS_TUNE.disruptions = on;
    let w = 0;
    for (let i = 0; i < 6; i++) {
      const d = STARTER_DECK.map((id) => ({ id, level: startLevel(id), talents: [-1, -1, -1] }));
      const m = new PvpMatch({ name: 'a', deck: d }, { name: 'b', deck: d }, 70 + i);
      const bots = [new PvpBot(m, 0, 0.3, i), new PvpBot(m, 1, 0.3, i + 5)];
      while (!m.ended && m.time < 600) { for (const b of bots) b.update((1 / 30) * 0.3); m.step(1 / 30); m.events.length = 0; m.sim.events.length = 0; }
      w += m.wave;
    }
    BOSS_TUNE.disruptions = true;
    return w;
  };
  const off = waves(false), on = waves(true);
  assert.ok(on >= off * 0.85, `with disruptions ${on} waves vs ${off} without`);
});
