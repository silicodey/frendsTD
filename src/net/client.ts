import type { DeckCard } from '../pvp/match';
import {
  PROTO, TICK_MS, cleanCode,
  type ClientMsg, type Cmd, type LobbyPlayer, type ServerMsg, type StartInfo, type TimedCmd,
} from './protocol';
import { GAME_SERVER } from './config';

const SERVER_KEY = 'frendstd.server';
const RESUME_KEY = 'frendstd.online';

const store = {
  get(k: string, s: Storage | undefined) { try { return s?.getItem(k) ?? null; } catch { return null; } },
  set(k: string, v: string | null, s: Storage | undefined) { try { if (v === null) s?.removeItem(k); else s?.setItem(k, v); } catch { /* private mode */ } },
};
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

/** "example.com", "https://example.com" or "ws://1.2.3.4:8787" → a WebSocket URL ending in /ws. */
export function normalizeServer(input: string): string {
  let s = input.trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(s) ? 'ws://' : 'wss://') + s;
  s = s.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  try {
    const u = new URL(s);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return '';
    if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
    u.search = ''; u.hash = '';
    return u.toString();
  } catch { return ''; }
}

const sameOrigin = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * The server to use. A developer override (?server=…, remembered) comes first. A page served over plain
 * http is a local or home-network server, so it talks to itself. Otherwise the server built into the game,
 * and failing that the site the page came from.
 */
export function defaultServer(): string {
  const loc = typeof location !== 'undefined' ? location : null;
  const q = loc ? new URLSearchParams(loc.search).get('server') : null;
  if (q) { const n = normalizeServer(q); if (n) { store.set(SERVER_KEY, n, local()); return n; } }
  const saved = store.get(SERVER_KEY, local());
  if (saved) return saved;
  if (loc?.protocol === 'http:' && loc.host) return sameOrigin();
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SERVER_URL;
  const built = normalizeServer(env || GAME_SERVER);
  if (built) return built;
  if (loc && loc.protocol === 'https:' && !/claude|anthropic/.test(loc.hostname)) return sameOrigin();
  return '';
}

/** This tab was in an online room before a reload (so it should try to rejoin). */
export const pendingResume = () => !!store.get(RESUME_KEY, session());

export function saveServer(url: string) { store.set(SERVER_KEY, url || null, local()); }

/** A share link that opens the game straight into a room. */
export function inviteLink(code: string, server: string): string {
  if (typeof location === 'undefined') return code;
  const sameSite = /^https?:$/.test(location.protocol) && server === `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const base = /^https?:$/.test(location.protocol) ? `${location.origin}${location.pathname}` : '';
  if (!base) return code;
  return `${base}?room=${code}${sameSite ? '' : `&server=${encodeURIComponent(server)}`}`;
}

export type NetEvent = 'status' | 'room' | 'lobby' | 'start' | 'sync' | 'turn' | 'end' | 'peer' | 'error' | 'desync';

export interface LobbyState { code: string; state: 'lobby' | 'countdown' | 'playing' | 'ended'; players: (LobbyPlayer | null)[] }

/**
 * One connection to the duel server: rooms, the shared clock, and the stream of stamped commands.
 * It reconnects by itself and, mid-room, resumes the seat (the server replays the match inputs).
 */
export class OnlineSession {
  status: 'offline' | 'connecting' | 'online' = 'offline';
  error: { code: string; msg: string } | null = null;
  code = ''; you = -1; token = '';
  lobby: LobbyState | null = null;
  info: StartInfo | null = null;
  cmds = new Map<number, TimedCmd[]>();
  upto = -1;
  result: { winner: number; tick: number; reason: string } | null = null;
  peerOnline = [true, true];
  peerGraceUntil = 0;
  desync = false;
  roomSince = 0; // local ms when we entered the current room
  rtt = 0;
  /** The server is asleep (free hosting idles) and is being woken up: tell the player it takes a moment. */
  waking = false;
  private woke = false;
  private ws: WebSocket | null = null;
  private want = false;
  private retry = 0;
  private retryTimer = 0;
  private pingTimer = 0;
  private offset = 0; // server ms − performance.now()
  private samples: { rtt: number; off: number }[] = [];
  private listeners = new Set<(e: NetEvent) => void>();

  constructor(public url: string, private hello: () => { name: string; deck: DeckCard[] }) {
    const saved = store.get(RESUME_KEY, session());
    if (saved) {
      try {
        const s = JSON.parse(saved) as { url: string; code: string; token: string };
        if (s.url === url && cleanCode(s.code) && typeof s.token === 'string') { this.code = s.code; this.token = s.token; }
      } catch { /* ignore */ }
    }
  }

  /** A seat this tab held before a reload, if any. */
  get resumable() { return !!(this.code && this.token); }

  on(fn: (e: NetEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(e: NetEvent) { for (const f of [...this.listeners]) { try { f(e); } catch (err) { console.error(err); } } }

  // ---------------------------------------------------------------- connection
  connect() {
    this.want = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.retryTimer);
    this.status = 'connecting';
    this.emit('status');
    if (!this.woke) { this.wake(); return; }
    this.openSocket();
  }

  /**
   * A free server sleeps when nobody has played for a while and needs up to a minute to start.
   * Knock on its health page first (that wakes it) and only then open the game connection.
   */
  private wake() {
    const health = this.url.replace(/^ws/i, 'http').replace(/\/ws$/, '/health');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const giveUp = setTimeout(() => ctrl?.abort(), 90000);
    const slow = setTimeout(() => { if (this.status === 'connecting') { this.waking = true; this.emit('status'); } }, 2000);
    const done = () => {
      clearTimeout(giveUp); clearTimeout(slow);
      this.woke = true;
      if (!this.want) return;
      this.openSocket();
    };
    fetch(health, { cache: 'no-store', signal: ctrl?.signal }).then(done, done);
  }

  private openSocket() {
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.fail('connect', 'That server address is not valid.'); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.waking = false;
      this.status = 'online';
      this.error = null;
      const h = this.hello();
      this.send({ t: 'hello', proto: PROTO, name: h.name, deck: h.deck });
      this.samples = [];
      for (let i = 0; i < 5; i++) setTimeout(() => this.ping(), i * 120);
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.ping(), 2000);
      if (this.code && this.token) this.send({ t: 'resume', code: this.code, token: this.token });
      this.emit('status');
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      const wasOnline = this.status === 'online';
      this.status = 'offline';
      this.emit('status');
      if (!this.want) return;
      if (!wasOnline && this.retry >= 5 && !this.code) { this.fail('connect', "Couldn't reach the game server. Check your internet connection and try again."); return; }
      this.retry++;
      this.retryTimer = window.setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** Math.min(4, this.retry)));
    };
  }

  /** Leave any room and disconnect. */
  close() {
    this.want = false;
    if (this.code) this.send({ t: 'leave' });
    this.forgetRoom();
    clearTimeout(this.retryTimer); clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* ignore */ }
    this.status = 'offline';
    this.listeners.clear();
  }

  private fail(code: string, msg: string) {
    this.want = false;
    this.woke = false; this.waking = false; this.retry = 0;
    this.error = { code, msg };
    this.status = 'offline';
    this.emit('error');
    this.emit('status');
  }

  private send(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  private ping() { this.send({ t: 'ping', c: performance.now() }); }

  // ---------------------------------------------------------------- clock
  /** The server's clock, estimated from the lowest-latency recent ping. */
  serverNow() { return performance.now() + this.offset; }
  /** Which tick the match should be on now (negative during the countdown). */
  clockTick() { return this.info ? Math.floor((this.serverNow() - this.info.startAt) / TICK_MS) : -1; }
  /** Seconds until the match starts. */
  countdown() { return this.info ? (this.info.startAt - this.serverNow()) / 1000 : 0; }

  // ---------------------------------------------------------------- room actions
  create() { this.send({ t: 'create' }); }
  join(code: string) { this.send({ t: 'join', code }); }
  ready(on: boolean) { this.send({ t: 'ready', on }); }
  cmd(c: Cmd) { this.send({ t: 'cmd', c }); }
  hash(tick: number, h: number) { this.send({ t: 'hash', tick, h }); }
  leaveRoom() { this.send({ t: 'leave' }); this.forgetRoom(); this.emit('room'); }
  refreshHello() { if (this.status === 'online') { const h = this.hello(); this.send({ t: 'hello', proto: PROTO, name: h.name, deck: h.deck }); } }

  private forgetRoom() {
    this.code = ''; this.you = -1; this.token = ''; this.lobby = null; this.info = null; this.result = null;
    this.cmds = new Map(); this.upto = -1; this.desync = false; this.peerOnline = [true, true];
    store.set(RESUME_KEY, null, session());
  }

  private addCmds(list: TimedCmd[]) {
    for (const c of list) {
      let l = this.cmds.get(c.tick);
      if (!l) this.cmds.set(c.tick, (l = []));
      l.push(c);
    }
  }

  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'welcome': break;
      case 'pong': {
        const t = performance.now(), rtt = t - m.c;
        this.samples.push({ rtt, off: m.s - (m.c + rtt / 2) });
        if (this.samples.length > 10) this.samples.shift();
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        this.offset = best.off;
        // the network's round trip, not the page being busy: the best of the last few
        this.rtt = Math.round(Math.min(...this.samples.slice(-5).map((x) => x.rtt)));
        break;
      }
      case 'error':
        this.error = { code: m.code, msg: m.msg };
        if (m.code === 'resume') this.forgetRoom();
        if (m.code === 'version') this.want = false;
        this.emit('error');
        break;
      case 'room':
        if (m.code !== this.code) this.roomSince = Date.now();
        this.code = m.code; this.you = m.you; this.token = m.token; this.error = null;
        store.set(RESUME_KEY, JSON.stringify({ url: this.url, code: m.code, token: m.token }), session());
        this.emit('room');
        break;
      case 'lobby':
        this.lobby = { code: m.code, state: m.state, players: m.players };
        this.peerOnline = m.players.map((p) => !!p?.connected);
        this.emit('lobby');
        break;
      case 'start':
        this.info = m.info; this.cmds = new Map(); this.upto = -1; this.result = null; this.desync = false;
        this.emit('start');
        break;
      case 'sync':
        this.info = m.info; this.cmds = new Map(); this.addCmds(m.cmds); this.upto = m.upto; this.result = null;
        this.emit('sync');
        break;
      case 'turn':
        this.addCmds(m.cmds);
        this.upto = Math.max(this.upto, m.upto);
        break;
      case 'peer':
        this.peerOnline[m.side] = m.connected;
        this.peerGraceUntil = m.connected ? 0 : Date.now() + (m.graceMs ?? 0);
        this.emit('peer');
        break;
      case 'desync': this.desync = true; this.emit('desync'); break;
      case 'end': this.result = { winner: m.winner, tick: m.tick, reason: m.reason }; this.emit('end'); break;
    }
  }
}
