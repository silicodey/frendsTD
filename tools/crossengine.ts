// Cross-engine determinism: record a long bot-vs-bot match as a command log, then replay it here (Node) and
// print the state hashes. tests/e2e can replay the same log in a browser and compare.
//   npx tsx tools/crossengine.ts record out.json [seed]   → writes {setups, seed, cmds, hashes}
//   npx tsx tools/crossengine.ts replay out.json           → re-checks the hashes in Node
import { readFileSync, writeFileSync } from 'node:fs';
import { PvpMatch, type PlayerSetup } from '../src/pvp/match';
import { PvpBot } from '../src/pvp/bot';
import { STARTER_DECK } from '../src/pvp/profile';
import { startLevel } from '../src/pvp/economy';
import { HASH_EVERY, INPUT_DELAY, Lockstep, matchHash, type Cmd, type TimedCmd } from '../src/net/protocol';

export function replay(setups: PlayerSetup[], seed: number, cmds: TimedCmd[], maxTick: number) {
  const map = new Map<number, TimedCmd[]>();
  for (const c of cmds) map.set(c.tick, [...(map.get(c.tick) ?? []), c]);
  const m = new PvpMatch(setups[0], setups[1], seed);
  const lock = new Lockstep(m, (t) => map.get(t));
  const hashes: number[] = [];
  while (lock.tick < maxTick && !m.ended) {
    lock.step();
    if (lock.tick % HASH_EVERY === 0) hashes.push(matchHash(m));
    m.events.length = 0; m.sim.events.length = 0;
  }
  return { hashes, tick: lock.tick, winner: m.winner };
}

const [mode, file, seedArg] = process.argv.slice(2);
if (mode === 'record') {
  const seed = Number(seedArg ?? 822197190);
  const deck = STARTER_DECK.map((id) => ({ id, level: startLevel(id) + 6, talents: [-1, -1, -1, -1] }));
  const setups: PlayerSetup[] = [{ name: 'a', deck }, { name: 'b', deck: deck.map((c) => ({ ...c })) }];
  const m = new PvpMatch(setups[0], setups[1], seed);
  const cmds: TimedCmd[] = [];
  const map = new Map<number, TimedCmd[]>();
  const lock = new Lockstep(m, (t) => map.get(t));
  const mk = (side: number) => new PvpBot(m, side, 0.8, side + 1, (c: Cmd) => { const tc: TimedCmd = { tick: lock.tick + INPUT_DELAY, side, c, n: cmds.length }; cmds.push(tc); map.set(tc.tick, [...(map.get(tc.tick) ?? []), tc]); });
  const bots = [mk(0), mk(1)];
  while (!m.ended && lock.tick < 60 * 900) { for (const b of bots) b.update(1 / 60); lock.step(); m.events.length = 0; m.sim.events.length = 0; }
  const r = replay(setups, seed, cmds, lock.tick);
  writeFileSync(file, JSON.stringify({ setups, seed, cmds, maxTick: lock.tick, hashes: r.hashes }));
  console.log(`recorded ${cmds.length} commands, ${lock.tick} ticks (wave ${m.wave}), ${r.hashes.length} hashes`);
} else if (mode === 'replay') {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const r = replay(d.setups, d.seed, d.cmds, d.maxTick);
  const bad = r.hashes.findIndex((h, i) => h !== d.hashes[i]);
  console.log(bad < 0 ? `identical: ${r.hashes.length} hashes` : `DIVERGED at hash #${bad} (tick ${(bad + 1) * HASH_EVERY})`);
}
