import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cos, exp, ln, log2, pow, sin, hypot } from '../src/sim/dmath';
import { PvpMatch, type PlayerSetup } from '../src/pvp/match';
import { STARTER_DECK } from '../src/pvp/profile';
import { startLevel } from '../src/pvp/economy';
import {
  CmdBook, HASH_EVERY, Lockstep, PROTO, applyCmd, cleanCmd, cleanCode, cleanDeck, cleanName, matchHash, pickN,
  type ClientMsg, type ServerMsg, type TimedCmd,
} from '../src/net/protocol';
import { startServer } from '../server/index';
import { THEMES } from '../src/data/levels';

const deck = STARTER_DECK.map((id) => ({ id, level: startLevel(id) + 2, talents: [-1, -1, -1] }));
const setup = (name: string): PlayerSetup => ({ name, deck: deck.map((c) => ({ ...c })), elo: 0 });

test('deterministic math matches Math closely', () => {
  for (let x = -20; x <= 20; x += 0.137) {
    assert.ok(Math.abs(sin(x) - Math.sin(x)) < 1e-12, `sin ${x}`);
    assert.ok(Math.abs(cos(x) - Math.cos(x)) < 1e-12, `cos ${x}`);
  }
  for (const x of [1e-6, 0.01, 0.5, 1, 1.5, 2, 3.7, 10, 1234.5, 1e9]) {
    assert.ok(Math.abs(ln(x) - Math.log(x)) < 1e-12 * Math.max(1, Math.abs(Math.log(x))), `ln ${x}`);
    assert.ok(Math.abs(log2(x) - Math.log2(x)) < 1e-11, `log2 ${x}`);
  }
  for (const x of [-30, -1, -0.2, 0, 0.3, 1, 5, 40]) assert.ok(Math.abs(exp(x) / Math.exp(x) - 1) < 1e-13, `exp ${x}`);
  for (const [b, e] of [[1.17, 12], [1.27, -3], [1.09, 14], [2.5, 0.7], [0.3, 1.8], [1.3, 0]] as const) assert.ok(Math.abs(pow(b, e) / Math.pow(b, e) - 1) < 1e-12, `pow ${b}^${e}`);
  assert.equal(hypot(3, 4), 5);
});

test('command validation rejects junk', () => {
  assert.deepEqual(cleanCmd({ k: 's' }), { k: 's' });
  assert.deepEqual(cleanCmd({ k: 'p', i: 4 }), { k: 'p', i: 4 });
  assert.equal(cleanCmd({ k: 'p', i: 5 }), null);
  assert.equal(cleanCmd({ k: 'm', a: 3, b: 3 }), null);
  assert.equal(cleanCmd({ k: 'x' }), null);
  assert.equal(cleanCmd('s'), null);
  assert.equal(cleanName('  <b>bob</b>\n '), 'bbob/b');
  assert.equal(cleanName(''), 'Player');
  assert.equal(cleanCode(' abcd '), 'ABCD');
  assert.equal(cleanCode('AB1D'), null); // 1 is not in the alphabet
  assert.ok(cleanDeck(deck));
  assert.equal(cleanDeck(deck.slice(0, 4)), null);
  assert.equal(cleanDeck([...deck.slice(0, 4), deck[0]]), null, 'duplicates');
  assert.equal(cleanDeck(deck.map((c, i) => (i === 0 ? { ...c, level: 99 } : c))), null, 'level cap');
  assert.equal(cleanDeck(deck.map((c, i) => (i === 0 ? { ...c, id: 'not_a_unit' } : c))), null);
  // talents are stripped where a unit has none or has not unlocked them
  const sig = cleanDeck([{ id: 'gem_ultra', level: 9, talents: [1, 1, 1, 1] }, ...deck.slice(1)])!;
  assert.deepEqual(sig[0].talents, [1, 1, -1], 'rows unlocked at 6 and 8, not 10');
  assert.equal(cleanDeck([{ id: 'gem_ultra', level: 11, talents: [] }, ...deck.slice(1)]), null, 'levels stop at 10');
});

/** A scripted game: random but reproducible commands for both sides. */
function script(seed: number, ticks: number): TimedCmd[] {
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: TimedCmd[] = [];
  for (let t = 30; t < ticks; t += 20 + Math.floor(r() * 40)) {
    const side = r() < 0.5 ? 0 : 1, x = r();
    out.push({ tick: t, side, c: x < 0.75 ? { k: 's' } : { k: 'p', i: Math.floor(r() * 5) }, n: out.length });
  }
  return out;
}

/** Plays a script, merging whatever pairs exist every so often (as players do). */
function play(seed: number, cmds: TimedCmd[], ticks: number) {
  const m = new PvpMatch(setup('a'), setup('b'), seed);
  const map = new Map<number, TimedCmd[]>();
  for (const c of cmds) map.set(c.tick, [...(map.get(c.tick) ?? []), c]);
  const lock = new Lockstep(m, (t) => map.get(t));
  const hashes: number[] = [];
  while (lock.tick < ticks && !m.ended) {
    lock.step();
    if (lock.tick % 97 === 0) for (const side of [0, 1]) {
      const us = m.units(side);
      const a = us.find((x) => us.some((y) => m.canMerge(x, y)));
      const b = a && us.find((y) => m.canMerge(a, y));
      if (a && b) applyCmd(m, side, { k: 'm', a: a.id, b: b.id });
    }
    if (lock.tick % HASH_EVERY === 0) hashes.push(matchHash(m));
    m.events.length = 0; m.sim.events.length = 0;
  }
  return { m, hashes, tick: lock.tick };
}

test('lockstep: the same inputs give the same match, tick for tick', () => {
  const cmds = script(42, 60 * 150);
  const a = play(9001, cmds, 60 * 150), b = play(9001, cmds, 60 * 150);
  assert.ok(a.hashes.length > 20);
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.m.winner, b.m.winner);
  assert.equal(a.m.sim.towers.length, b.m.sim.towers.length);
  // and moving one command by a single tick changes the outcome somewhere (the hash really sees the state)
  const first = cmds.findIndex((c) => c.c.k === 's');
  const shifted = cmds.map((c, i) => (i === first ? { ...c, tick: c.tick + 1 } : c));
  const c = play(9001, shifted, 60 * 150);
  assert.notDeepEqual(a.hashes, c.hashes);
});

test('forfeit ends the match for the other side', () => {
  const m = new PvpMatch(setup('a'), setup('b'), 5);
  assert.ok(applyCmd(m, 0, { k: 'f' }));
  assert.equal(m.ended, true);
  assert.equal(m.winner, 1);
  assert.equal(applyCmd(m, 1, { k: 's' }), false, 'nothing happens after the end');
});

// ------------------------------------------------------------------ server: two real clients over WebSockets
class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
  cmds = new Map<number, TimedCmd[]>();
  upto = -1;
  lock: Lockstep | null = null;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'start') this.lock = new Lockstep(new PvpMatch(m.info.setups[0], m.info.setups[1], m.info.seed), (t) => this.cmds.get(t));
      if (m.t === 'turn') { this.upto = m.upto; for (const c of m.cmds) this.cmds.set(c.tick, [...(this.cmds.get(c.tick) ?? []), c]); }
      for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
    };
  }
  open() { return new Promise<void>((r) => { if (this.ws.readyState === 1) r(); else this.ws.onopen = () => r(); }); }
  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }
  wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 8000): Promise<Extract<ServerMsg, { t: T }>> {
    const hit = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
    if (hit) return Promise.resolve(hit as Extract<ServerMsg, { t: T }>);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), ms);
      this.waiters.push({ pred: (m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>), res: (m) => { clearTimeout(timer); res(m as Extract<ServerMsg, { t: T }>); } });
    });
  }
  /** Simulate as far as the server allows, sending hashes like the game does. */
  catchUp() {
    const l = this.lock!;
    while (l.tick <= this.upto && !l.match.ended) {
      l.step();
      if (l.tick % HASH_EVERY === 0) this.send({ t: 'hash', tick: l.tick, h: matchHash(l.match) });
      l.match.events.length = 0; l.match.sim.events.length = 0;
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('server: create, join, ready, countdown, play in lockstep, forfeit', async () => {
  const srv = startServer({ port: 0, staticDir: null, quiet: true, countdownMs: 600 });
  const port = await srv.ready;
  const url = `ws://localhost:${port}/ws`;
  const a = new Client(url), b = new Client(url);
  try {
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'hello', proto: PROTO, name: 'Ada', deck });
    b.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    a.send({ t: 'create' });
    const room = await a.wait('room');
    assert.equal(room.you, 0);
    b.send({ t: 'join', code: 'ZZZZ' });
    assert.equal((await b.wait('error')).code, 'not_found');
    b.send({ t: 'join', code: room.code.toLowerCase() });
    assert.equal((await b.wait('room')).you, 1);
    const lob = await a.wait('lobby', (m) => m.players.every((p) => p));
    assert.deepEqual(lob.players.map((p) => p!.name), ['Ada', 'Bo']);
    a.send({ t: 'ready', on: true });
    await sleep(50);
    assert.ok(!a.msgs.some((m) => m.t === 'start'), 'one ready player is not enough');
    b.send({ t: 'ready', on: true });
    const [sa, sb] = await Promise.all([a.wait('start'), b.wait('start')]);
    assert.equal(sa.info.seed, sb.info.seed);
    assert.equal(sa.info.startAt, sb.info.startAt);
    assert.deepEqual(sa.info.setups.map((s) => s.name), ['Ada', 'Bo']);
    assert.ok(THEMES[sa.info.theme], `theme ${sa.info.theme} exists`);
    // a third player cannot join a full room
    const c = new Client(url); await c.open();
    c.send({ t: 'hello', proto: PROTO, name: 'Cy', deck }); c.send({ t: 'join', code: room.code });
    assert.equal((await c.wait('error')).code, 'started');
    c.ws.close();
    // play: both summon a few times, keep simulating
    await a.wait('turn', (m) => m.upto > 30, 5000);
    for (let i = 0; i < 4; i++) { a.send({ t: 'cmd', c: { k: 's' } }); b.send({ t: 'cmd', c: { k: 's' } }); await sleep(120); a.catchUp(); b.catchUp(); }
    for (let i = 0; i < 25; i++) { await sleep(100); a.catchUp(); b.catchUp(); }
    assert.ok(a.lock!.tick > HASH_EVERY, `simulated ${a.lock!.tick} ticks`);
    assert.equal(a.lock!.match.units(0).length, 4, 'both clients see 4 summons for player A');
    assert.equal(b.lock!.match.units(1).length, 4);
    // the two clients agree exactly
    const t = Math.min(a.lock!.tick, b.lock!.tick);
    assert.ok(t > 0);
    await sleep(300);
    assert.ok(!a.msgs.some((m) => m.t === 'desync') && !b.msgs.some((m) => m.t === 'desync'), 'no desync reported');
    // junk and spoofed commands are ignored
    b.send({ t: 'cmd', c: { k: 'm', a: a.lock!.match.units(0)[0].id, b: a.lock!.match.units(0)[1].id } }); // B tries to merge A's units
    a.send({ t: 'cmd', c: { k: 'p', i: 99 } } as unknown as ClientMsg);
    await sleep(300); a.catchUp(); b.catchUp();
    assert.equal(a.lock!.match.units(0).length, 4);
    // A concedes
    a.send({ t: 'cmd', c: { k: 'f' } });
    const [ea, eb] = await Promise.all([a.wait('end'), b.wait('end')]);
    assert.equal(ea.winner, 1); assert.equal(eb.winner, 1); assert.equal(ea.reason, 'forfeit');
    await sleep(100); a.catchUp(); b.catchUp();
    assert.equal(a.lock!.match.ended, true); assert.equal(a.lock!.match.winner, 1);
    assert.equal(b.lock!.match.winner, 1);
    assert.equal(matchHash(a.lock!.match), matchHash(b.lock!.match));
    // room returns to the lobby, nobody ready
    const back = await a.wait('lobby', (m) => m.state === 'lobby' && m.players.every((p) => p && !p.ready));
    assert.ok(back);
  } finally {
    a.ws.close(); b.ws.close();
    await srv.close();
  }
});

test('server: a dropped player resumes with the full input log', async () => {
  const srv = startServer({ port: 0, staticDir: null, quiet: true, countdownMs: 300 });
  const port = await srv.ready;
  const url = `ws://localhost:${port}/ws`;
  const a = new Client(url), b = new Client(url);
  try {
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'hello', proto: PROTO, name: 'Ada', deck }); b.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    a.send({ t: 'create' });
    const room = await a.wait('room');
    b.send({ t: 'join', code: room.code });
    const broom = await b.wait('room');
    a.send({ t: 'ready', on: true }); b.send({ t: 'ready', on: true });
    await b.wait('start');
    await a.wait('turn', (m) => m.upto > 20, 5000);
    b.send({ t: 'cmd', c: { k: 's' } }); a.send({ t: 'cmd', c: { k: 's' } });
    await sleep(400);
    b.ws.close();
    await a.wait('peer', (m) => m.side === 1 && !m.connected);
    a.send({ t: 'cmd', c: { k: 's' } });
    await sleep(300);
    // B comes back on a new socket
    const b2 = new Client(url); await b2.open();
    b2.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    b2.send({ t: 'resume', code: room.code, token: broom.token });
    const sync = await b2.wait('sync');
    assert.equal(sync.cmds.length, 3);
    b2.lock = new Lockstep(new PvpMatch(sync.info.setups[0], sync.info.setups[1], sync.info.seed), (t) => b2.cmds.get(t));
    for (const c of sync.cmds) b2.cmds.set(c.tick, [...(b2.cmds.get(c.tick) ?? []), c]);
    b2.upto = sync.upto;
    await a.wait('peer', (m) => m.side === 1 && m.connected);
    await sleep(400); a.catchUp(); b2.catchUp();
    const t = Math.min(a.lock!.tick, b2.lock!.tick);
    // replay both to the same tick and compare
    const fresh = (cl: Client) => { const l = new Lockstep(new PvpMatch(sync.info.setups[0], sync.info.setups[1], sync.info.seed), (x) => cl.cmds.get(x)); while (l.tick < t) l.step(); return matchHash(l.match); };
    assert.equal(fresh(a), fresh(b2));
    assert.equal(a.lock!.match.units(0).length, 2);
    assert.equal(b2.lock!.match.units(1).length, 1);
    b2.ws.close();
  } finally {
    a.ws.close(); b.ws.close();
    await srv.close();
  }
});

test('server: wrong game version is turned away', async () => {
  const srv = startServer({ port: 0, staticDir: null, quiet: true });
  const port = await srv.ready;
  const a = new Client(`ws://localhost:${port}/ws`);
  try {
    await a.open();
    a.send({ t: 'hello', proto: PROTO + 1, name: 'Old', deck });
    assert.equal((await a.wait('error')).code, 'version');
  } finally { a.ws.close(); await srv.close(); }
});

test('server: a restart warns players, and a fresh server says the match is gone', async () => {
  const srv = startServer({ port: 0, staticDir: null, quiet: true, countdownMs: 200 });
  const port = await srv.ready;
  const url = `ws://localhost:${port}/ws`;
  const a = new Client(url), b = new Client(url);
  try {
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'hello', proto: PROTO, name: 'Ada', deck }); b.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    a.send({ t: 'create' });
    const room = await a.wait('room');
    b.send({ t: 'join', code: room.code });
    await b.wait('room');
    a.send({ t: 'ready', on: true }); b.send({ t: 'ready', on: true });
    await a.wait('turn', (m) => m.upto > 10, 5000);
    srv.shutdown('test');
    assert.equal((await a.wait('error', (m) => m.code === 'restart')).code, 'restart');
    assert.equal((await b.wait('error', (m) => m.code === 'restart')).code, 'restart');
  } finally { a.ws.close(); b.ws.close(); await srv.close(); }
  // the new server has never heard of that room
  const srv2 = startServer({ port: 0, staticDir: null, quiet: true });
  const port2 = await srv2.ready;
  const c = new Client(`ws://localhost:${port2}/ws`);
  try {
    await c.open();
    c.send({ t: 'hello', proto: PROTO, name: 'Ada', deck });
    c.send({ t: 'resume', code: 'ABCD', token: 'x' });
    assert.equal((await c.wait('error')).code, 'resume');
  } finally { c.ws.close(); await srv2.close(); }
});

test('a command delivered twice (around a reconnect) is applied once', () => {
  const book = new CmdBook();
  const cmds: TimedCmd[] = [{ tick: 50, side: 0, c: { k: 's' }, n: 0 }, { tick: 50, side: 1, c: { k: 's' }, n: 1 }, { tick: 80, side: 0, c: { k: 's' }, n: 2 }];
  book.add(cmds.slice(0, 2));
  book.add(cmds);          // the full log after a resume
  book.add(cmds.slice(2)); // and the same command again in the next turn
  assert.equal(book.size, 3);
  assert.equal(book.get(50)!.length, 2);
  assert.equal(book.get(80)!.length, 1);
  // and the match it drives is the same as with no duplicates
  const run = (src: (t: number) => TimedCmd[] | undefined) => { const m = new PvpMatch(setup('a'), setup('b'), 3); const l = new Lockstep(m, src); while (l.tick < 600) l.step(); return matchHash(m); };
  const clean = new Map<number, TimedCmd[]>([[50, cmds.slice(0, 2)], [80, cmds.slice(2)]]);
  assert.equal(run((t) => book.get(t)), run((t) => clean.get(t)));
});

test('pickN picks distinct items deterministically', () => {
  let s = 7; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const a = pickN([1, 2, 3, 4, 5], 2, r); s = 7; const b = pickN([1, 2, 3, 4, 5], 2, r);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 2);
  assert.equal(pickN([1], 3, r).length, 1);
});

test('server: resuming while a move is in flight still gives the same match as the other player', async () => {
  const srv = startServer({ port: 0, staticDir: null, quiet: true, countdownMs: 200 });
  const port = await srv.ready;
  const url = `ws://localhost:${port}/ws`;
  const a = new Client(url), b = new Client(url);
  try {
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'hello', proto: PROTO, name: 'Ada', deck }); b.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    a.send({ t: 'create' });
    const room = await a.wait('room');
    b.send({ t: 'join', code: room.code });
    const broom = await b.wait('room');
    a.send({ t: 'ready', on: true }); b.send({ t: 'ready', on: true });
    await a.wait('turn', (m) => m.upto > 20, 5000);
    b.ws.close();
    await a.wait('peer', (m) => m.side === 1 && !m.connected);
    const b2 = new Client(url); await b2.open();
    b2.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    // a move lands on the server right as B resumes: it is in B's sync log AND in the next turn
    a.send({ t: 'cmd', c: { k: 's' } });
    b2.send({ t: 'resume', code: room.code, token: broom.token });
    const sync = await b2.wait('sync');
    const book = new CmdBook();
    book.add(sync.cmds);
    await sleep(400);
    for (const m of b2.msgs) if (m.t === 'turn') book.add(m.cmds);
    const aBook = new CmdBook();
    for (const m of a.msgs) if (m.t === 'turn') aBook.add(m.cmds);
    assert.equal(book.size, aBook.size, 'both players hold the same set of commands');
    const play = (src: (t: number) => TimedCmd[] | undefined) => { const l = new Lockstep(new PvpMatch(sync.info.setups[0], sync.info.setups[1], sync.info.seed), src); while (l.tick < sync.upto) l.step(); return matchHash(l.match); };
    assert.equal(play((t) => book.get(t)), play((t) => aBook.get(t)));
    b2.ws.close();
  } finally { a.ws.close(); b.ws.close(); await srv.close(); }
});

test('server: away past the grace period loses by timeout, and coming back shows the result in the room', async () => {
  const srv = startServer({ port: 0, staticDir: null, quiet: true, countdownMs: 200, graceMs: 1200 });
  const port = await srv.ready;
  const url = `ws://localhost:${port}/ws`;
  const a = new Client(url), b = new Client(url);
  try {
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'hello', proto: PROTO, name: 'Ada', deck }); b.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    a.send({ t: 'create' });
    const room = await a.wait('room');
    b.send({ t: 'join', code: room.code });
    const broom = await b.wait('room');
    a.send({ t: 'ready', on: true }); b.send({ t: 'ready', on: true });
    await a.wait('turn', (m) => m.upto > 10, 5000);
    b.ws.close();
    const end = await a.wait('end', () => true, 8000);
    assert.equal(end.winner, 0);
    assert.equal(end.reason, 'timeout');
    const b2 = new Client(url); await b2.open();
    b2.send({ t: 'hello', proto: PROTO, name: 'Bo', deck });
    b2.send({ t: 'resume', code: room.code, token: broom.token });
    assert.equal((await b2.wait('room')).you, 1, 'the seat was kept');
    const e2 = await b2.wait('end');
    assert.equal(e2.reason, 'timeout');
    assert.equal(e2.winner, 0);
    const lob = await b2.wait('lobby', (m) => m.state === 'lobby' && m.players.every((p) => p));
    assert.ok(lob, 'both are back in the room for a rematch');
    b2.ws.close();
  } finally { a.ws.close(); b.ws.close(); await srv.close(); }
});
