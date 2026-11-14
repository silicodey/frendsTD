/**
 * frendsTD online duel server.
 *
 *   npm run build && npm run server        → game at http://localhost:8787, duels over ws://localhost:8787/ws
 *
 * One process serves the built game (dist/) and runs the duel rooms:
 *  - a player creates a room and gets a 4-letter code; a friend joins with it
 *  - when both press Ready, everyone gets the same start time and a shared countdown
 *  - during the match the server stamps each tap with the tick it takes effect and relays it to both
 *    players (deterministic lockstep, see src/net/protocol.ts), runs its own copy of the match to
 *    referee the result, and checks the players' state hashes against its own
 *  - a dropped player has 30 s to reconnect (the full input log replays them back to the present)
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { PvpMatch, type DeckCard } from '../src/pvp/match';
import {
  COUNTDOWN_MS, HASH_EVERY, INPUT_DELAY, Lockstep, PROTO, RECONNECT_GRACE_MS, TICK_MS,
  cleanCmd, cleanCode, cleanDeck, cleanName, matchHash, randomCode,
  type ClientMsg, type LobbyPlayer, type ServerMsg, type StartInfo, type TimedCmd,
} from '../src/net/protocol';

const DUEL_THEMES = [0, 1, 2, 3, 4, 5];
const MAX_ROOMS = 1000;
const CMD_BURST = 20; // commands per player per second

interface Seat {
  conn: Conn | null;
  name: string; deck: DeckCard[]; ready: boolean; token: string;
  droppedAt: number; // 0 while connected
  forfeited: boolean;
  cmdWindow: number; cmdCount: number;
}

interface Room {
  code: string;
  seats: (Seat | null)[];
  state: 'lobby' | 'countdown' | 'playing';
  info: StartInfo | null;
  lock: Lockstep | null;
  cmds: Map<number, TimedCmd[]>;
  log: TimedCmd[];
  pending: TimedCmd[];
  upto: number;
  hashes: Map<number, number>;
  emptySince: number;
  countdownTimer: NodeJS.Timeout | null;
}

interface Conn { ws: WebSocket; hello: boolean; name: string; deck: DeckCard[] | null; room: Room | null; side: number; alive: boolean }

export interface ServerOptions { port?: number; host?: string; staticDir?: string | null; quiet?: boolean; countdownMs?: number }

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** Server clock in ms; players sync to it with pings. */
const now = () => performance.timeOrigin + performance.now();

export function startServer(opts: ServerOptions = {}) {
  const log = (...a: unknown[]) => { if (!opts.quiet) console.log(new Date().toISOString(), ...a); };
  const rooms = new Map<string, Room>();
  const staticDir = opts.staticDir === null ? null : path.resolve(opts.staticDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));

  // ---------------------------------------------------------------- static files (the game itself)
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, proto: PROTO, rooms: rooms.size }));
      return;
    }
    if (!staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404); res.end(); return; }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(staticDir, path.normalize(rel));
    if (!file.startsWith(staticDir)) { res.writeHead(403); res.end(); return; }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found. Run `npm run build` first so dist/ exists.');
    }
  });

  // ---------------------------------------------------------------- helpers
  const send = (c: Conn | null | undefined, m: ServerMsg) => { if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)); };
  const broadcast = (r: Room, m: ServerMsg) => { for (const s of r.seats) send(s?.conn, m); };
  const fail = (c: Conn, code: string, msg: string) => send(c, { t: 'error', code, msg });
  const serverTick = (r: Room) => Math.floor((now() - r.info!.startAt) / TICK_MS);

  const lobby = (r: Room) => {
    const players: (LobbyPlayer | null)[] = r.seats.map((s) => (s ? { name: s.name, ready: s.ready, connected: !!s.conn, deck: s.deck } : null));
    broadcast(r, { t: 'lobby', code: r.code, state: r.state, players });
  };

  const newRoom = (): Room | null => {
    if (rooms.size >= MAX_ROOMS) return null;
    let code = randomCode(() => randomInt(1 << 30) / (1 << 30));
    for (let i = 0; rooms.has(code) && i < 50; i++) code = randomCode(() => randomInt(1 << 30) / (1 << 30));
    if (rooms.has(code)) return null;
    const r: Room = { code, seats: [null, null], state: 'lobby', info: null, lock: null, cmds: new Map(), log: [], pending: [], upto: -1, hashes: new Map(), emptySince: 0, countdownTimer: null };
    rooms.set(code, r);
    return r;
  };

  const seatFor = (c: Conn, r: Room, side: number) => {
    const seat: Seat = { conn: c, name: c.name, deck: c.deck!, ready: false, token: randomBytes(12).toString('hex'), droppedAt: 0, forfeited: false, cmdWindow: 0, cmdCount: 0 };
    r.seats[side] = seat;
    c.room = r; c.side = side;
    send(c, { t: 'room', code: r.code, you: side, token: seat.token });
    lobby(r);
  };

  const cancelCountdown = (r: Room) => {
    if (r.state !== 'countdown') return;
    if (r.countdownTimer) clearTimeout(r.countdownTimer);
    r.countdownTimer = null;
    r.state = 'lobby'; r.info = null; r.lock = null;
    for (const s of r.seats) if (s) s.ready = false;
    log(`room ${r.code}: countdown cancelled`);
  };

  const maybeStart = (r: Room) => {
    if (r.state !== 'lobby' || !r.seats.every((s) => s && s.ready && s.conn)) return;
    const [a, b] = r.seats as Seat[];
    const info: StartInfo = {
      startAt: Math.round(now() + (opts.countdownMs ?? COUNTDOWN_MS)), seed: randomInt(1, 0x7fffffff), theme: DUEL_THEMES[randomInt(DUEL_THEMES.length)],
      setups: [{ name: a.name, deck: a.deck, elo: 0 }, { name: b.name, deck: b.deck, elo: 0 }],
    };
    r.state = 'countdown'; r.info = info;
    r.cmds = new Map(); r.log = []; r.pending = []; r.upto = -1; r.hashes = new Map();
    for (const s of r.seats as Seat[]) s.forfeited = false;
    r.lock = new Lockstep(new PvpMatch(info.setups[0], info.setups[1], info.seed), (t) => r.cmds.get(t));
    broadcast(r, { t: 'start', info });
    lobby(r);
    r.countdownTimer = setTimeout(() => { if (r.state === 'countdown') { r.state = 'playing'; r.countdownTimer = null; lobby(r); } }, Math.max(0, info.startAt - now()));
    log(`room ${r.code}: ${a.name} vs ${b.name}, seed ${info.seed}`);
  };

  const pushCmd = (r: Room, side: number, c: TimedCmd['c']) => {
    const tick = Math.max(serverTick(r) + INPUT_DELAY, r.upto + 1);
    const tc: TimedCmd = { tick, side, c };
    let list = r.cmds.get(tick);
    if (!list) r.cmds.set(tick, (list = []));
    list.push(tc);
    r.log.push(tc);
    r.pending.push(tc);
  };

  const finish = (r: Room, reason: string) => {
    const m = r.lock!.match;
    broadcast(r, { t: 'end', winner: m.winner, tick: r.lock!.tick, reason });
    log(`room ${r.code}: ended at tick ${r.lock!.tick}, winner ${m.winner} (${reason})`);
    r.state = 'lobby';
    r.lock = null;
    for (const [i, s] of r.seats.entries()) if (s) { s.ready = false; if (!s.conn) r.seats[i] = null; }
    lobby(r);
  };

  /** Advance every running match to the latest final tick and tell both players. */
  const tickRooms = () => {
    for (const r of rooms.values()) {
      if (!r.lock || !r.info || (r.state !== 'playing' && r.state !== 'countdown')) continue;
      const st = serverTick(r);
      if (st < 0) continue;
      if (r.state === 'countdown') { r.state = 'playing'; lobby(r); }
      const upto = st + INPUT_DELAY - 1;
      if (upto <= r.upto && !r.pending.length) continue;
      const lock = r.lock;
      while (lock.tick <= upto && !lock.match.ended) {
        lock.step();
        if (lock.tick % HASH_EVERY === 0) {
          r.hashes.set(lock.tick, matchHash(lock.match));
          if (r.hashes.size > 40) r.hashes.delete(r.hashes.keys().next().value!);
        }
      }
      r.upto = Math.max(r.upto, upto);
      broadcast(r, { t: 'turn', upto: r.upto, cmds: r.pending });
      r.pending = [];
      lock.match.events.length = 0;
      lock.match.sim.events.length = 0;
      if (lock.match.ended) finish(r, r.seats.some((s) => s?.forfeited) ? 'forfeit' : 'hearts');
    }
  };

  const leaveRoom = (c: Conn, quitting: boolean) => {
    const r = c.room;
    if (!r) return;
    const seat = r.seats[c.side];
    c.room = null;
    if (!seat || seat.conn !== c) return;
    if (r.state === 'playing' || (r.state === 'countdown' && r.info && now() >= r.info.startAt)) {
      seat.conn = null;
      if (quitting) { if (!seat.forfeited) { seat.forfeited = true; pushCmd(r, c.side, { k: 'f' }); } }
      else { seat.droppedAt = now(); broadcast(r, { t: 'peer', side: c.side, connected: false, graceMs: RECONNECT_GRACE_MS }); }
    } else {
      cancelCountdown(r);
      if (quitting) r.seats[c.side] = null;
      else { seat.conn = null; seat.ready = false; seat.droppedAt = now(); }
      lobby(r);
    }
    if (!r.seats.some((s) => s?.conn)) r.emptySince = now();
  };

  // ---------------------------------------------------------------- messages
  const onMessage = (c: Conn, m: ClientMsg) => {
    if (m.t === 'ping') { send(c, { t: 'pong', c: m.c, s: now() }); return; }
    if (m.t === 'hello') {
      if (m.proto !== PROTO) { fail(c, 'version', 'This game version does not match the server. Reload to update.'); c.ws.close(); return; }
      const deck = cleanDeck(m.deck);
      if (!deck) { fail(c, 'deck', 'Your deck is not valid for online duels.'); return; }
      c.hello = true; c.name = cleanName(m.name); c.deck = deck;
      if (c.room) { const s = c.room.seats[c.side]; if (s && s.conn === c && c.room.state === 'lobby') { s.name = c.name; s.deck = deck; lobby(c.room); } }
      return;
    }
    if (!c.hello) { fail(c, 'hello', 'Say hello first.'); return; }
    switch (m.t) {
      case 'create': {
        leaveRoom(c, true);
        const r = newRoom();
        if (!r) { fail(c, 'busy', 'The server is full. Try again in a minute.'); return; }
        seatFor(c, r, 0);
        log(`room ${r.code}: created by ${c.name}`);
        return;
      }
      case 'join': {
        const code = cleanCode(m.code);
        const r = code ? rooms.get(code) : undefined;
        if (!r) { fail(c, 'not_found', 'No room with that code. Check the letters with your friend.'); return; }
        if (c.room === r) return;
        if (r.state !== 'lobby') { fail(c, 'started', 'That match has already started.'); return; }
        const free = r.seats.findIndex((s) => !s || (!s.conn && s.droppedAt && now() - s.droppedAt > RECONNECT_GRACE_MS));
        if (free < 0) { fail(c, 'full', 'That room already has two players.'); return; }
        leaveRoom(c, true);
        seatFor(c, r, free);
        log(`room ${r.code}: ${c.name} joined`);
        return;
      }
      case 'resume': {
        const code = cleanCode(m.code);
        const r = code ? rooms.get(code) : undefined;
        const side = r ? r.seats.findIndex((s) => s && s.token === m.token) : -1;
        if (!r || side < 0) { fail(c, 'resume', 'That match is over or the room has closed.'); return; }
        const seat = r.seats[side]!;
        if (seat.conn && seat.conn !== c) { const old = seat.conn; old.room = null; old.ws.close(); }
        seat.conn = c; seat.droppedAt = 0;
        c.room = r; c.side = side;
        send(c, { t: 'room', code: r.code, you: side, token: seat.token });
        if (r.info && r.lock && (r.state === 'playing' || r.state === 'countdown')) send(c, { t: 'sync', info: r.info, upto: r.upto, cmds: r.log });
        broadcast(r, { t: 'peer', side, connected: true });
        lobby(r);
        return;
      }
      case 'ready': {
        const r = c.room, seat = r?.seats[c.side];
        if (!r || !seat) return;
        if (r.state === 'countdown' && !m.on && r.info && now() < r.info.startAt - 300) { cancelCountdown(r); lobby(r); return; }
        if (r.state !== 'lobby') return;
        seat.ready = !!m.on;
        lobby(r);
        maybeStart(r);
        return;
      }
      case 'leave': leaveRoom(c, true); return;
      case 'cmd': {
        const r = c.room, seat = r?.seats[c.side];
        if (!r || !seat || seat.conn !== c || r.state !== 'playing' || !r.lock || r.lock.match.ended || seat.forfeited) return;
        const cmd = cleanCmd(m.c);
        if (!cmd) return;
        const t = now();
        if (t - seat.cmdWindow > 1000) { seat.cmdWindow = t; seat.cmdCount = 0; }
        if (++seat.cmdCount > CMD_BURST) return;
        if (cmd.k === 'f') seat.forfeited = true;
        pushCmd(r, c.side, cmd);
        return;
      }
      case 'hash': {
        const r = c.room;
        if (!r || typeof m.tick !== 'number' || typeof m.h !== 'number') return;
        const mine = r.hashes.get(m.tick);
        if (mine !== undefined && mine !== m.h) {
          log(`room ${r.code}: DESYNC side ${c.side} at tick ${m.tick} (${m.h} vs server ${mine})`);
          send(c, { t: 'desync', tick: m.tick });
        }
        return;
      }
    }
  };

  // ---------------------------------------------------------------- sockets
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
  const conns = new Map<WebSocket, Conn>();
  wss.on('connection', (ws) => {
    const c: Conn = { ws, hello: false, name: 'Player', deck: null, room: null, side: -1, alive: true };
    conns.set(ws, c);
    send(c, { t: 'welcome', proto: PROTO, now: now() });
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return;
      try { onMessage(c, m); } catch (e) { log('message error', e); }
    });
    ws.on('close', () => { conns.delete(ws); leaveRoom(c, false); });
  });

  const loop = setInterval(tickRooms, 50);
  const sweep = setInterval(() => {
    const t = now();
    for (const [code, r] of rooms) {
      for (const [side, s] of r.seats.entries()) {
        if (!s || s.conn || !s.droppedAt || t - s.droppedAt < RECONNECT_GRACE_MS) continue;
        if (r.state === 'playing' && r.lock && !r.lock.match.ended) { if (!s.forfeited) { s.forfeited = true; pushCmd(r, side, { k: 'f' }); log(`room ${code}: side ${side} timed out`); } }
        else if (r.state === 'lobby') { r.seats[side] = null; lobby(r); }
      }
      const occupied = r.seats.some((s) => s?.conn);
      if (!occupied && (!r.seats.some(Boolean) || (r.emptySince && t - r.emptySince > 120000))) {
        if (r.countdownTimer) clearTimeout(r.countdownTimer);
        rooms.delete(code);
      }
    }
  }, 1000);
  // drop sockets that stopped answering
  const heartbeat = setInterval(() => {
    for (const [ws, c] of conns) {
      if (!c.alive) { ws.terminate(); continue; }
      c.alive = false;
      ws.ping();
    }
  }, 15000);

  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  const ready = new Promise<number>((resolve) => server.listen(port, opts.host ?? '0.0.0.0', () => {
    const a = server.address();
    resolve(typeof a === 'object' && a ? a.port : port);
  }));
  ready.then((p) => log(`frendsTD server on http://localhost:${p}  (duels: ws://localhost:${p}/ws${staticDir ? `, game from ${staticDir}` : ''})`));

  return {
    ready, rooms,
    close: () => new Promise<void>((resolve) => {
      clearInterval(loop); clearInterval(sweep); clearInterval(heartbeat);
      for (const r of rooms.values()) if (r.countdownTimer) clearTimeout(r.countdownTimer);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.close(() => resolve());
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
