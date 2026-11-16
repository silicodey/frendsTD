// Cross-engine determinism: record a long bot-vs-bot match as a command log, then replay it here (Node) and
// print the state hashes. tests/e2e can replay the same log in a browser and compare.
//   npx tsx tools/crossengine.ts record out.json [seed]   → writes {setups, seed, cmds, hashes}
//   npx tsx tools/crossengine.ts replay out.json           → re-checks the hashes in Node
import { readFileSync, writeFileSync } from 'node:fs';
import { PvpMatch, type PlayerSetup } from '../src/pvp/match';
import { PvpBot } from '../src/pvp/bot';
import { STARTER_DECK } from '../src/pvp/profile';
import { MAX_CARD_LEVEL, startLevel } from '../src/pvp/economy';
import { cleanPerk, type WeeklyPerk } from '../src/pvp/perks';
import { HASH_EVERY, INPUT_DELAY, Lockstep, matchHash, type Cmd, type TimedCmd } from '../src/net/protocol';

export function replay(setups: PlayerSetup[], seed: number, cmds: TimedCmd[], maxTick: number, perk: WeeklyPerk | null = null) {
  const map = new Map<number, TimedCmd[]>();
  for (const c of cmds) map.set(c.tick, [...(map.get(c.tick) ?? []), c]);
  const m = new PvpMatch(setups[0], setups[1], seed, perk);
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
  // high levels with specialities, uneven crit damage and a merge-spawn perk: every random rule in play
  const deck = STARTER_DECK.map((id, i) => ({ id, level: Math.min(MAX_CARD_LEVEL, startLevel(id) + 7), talents: [i % 2, (i + 1) % 2, i % 2] }));
  const setups: PlayerSetup[] = [{ name: 'a', deck, critDmg: 1.74 }, { name: 'b', deck: deck.map((c) => ({ ...c, talents: c.talents.map((t) => 1 - t) })), critDmg: 2.06 }];
  const perk = cleanPerk({ id: 'xe', family: 'claude', effect: { kind: 'mergeSpawn', r1: 0.15, r2: 0.05 } });
  const m = new PvpMatch(setups[0], setups[1], seed, perk);
  const cmds: TimedCmd[] = [];
  const map = new Map<number, TimedCmd[]>();
  const lock = new Lockstep(m, (t) => map.get(t));
  const mk = (side: number) => new PvpBot(m, side, 0.8, side + 1, (c: Cmd) => { const tc: TimedCmd = { tick: lock.tick + INPUT_DELAY, side, c, n: cmds.length }; cmds.push(tc); map.set(tc.tick, [...(map.get(tc.tick) ?? []), tc]); });
  const bots = [mk(0), mk(1)];
  while (!m.ended && lock.tick < 60 * 900) { for (const b of bots) b.update(1 / 60); lock.step(); m.events.length = 0; m.sim.events.length = 0; }
  const r = replay(setups, seed, cmds, lock.tick, perk);
  writeFileSync(file, JSON.stringify({ setups, seed, perk, cmds, maxTick: lock.tick, hashes: r.hashes }));
  console.log(`recorded ${cmds.length} commands, ${lock.tick} ticks (wave ${m.wave}), ${r.hashes.length} hashes`);
} else if (mode === 'replay') {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const r = replay(d.setups, d.seed, d.cmds, d.maxTick, d.perk ?? null);
  const bad = r.hashes.findIndex((h, i) => h !== d.hashes[i]);
  console.log(bad < 0 ? `identical: ${r.hashes.length} hashes` : `DIVERGED at hash #${bad} (tick ${(bad + 1) * HASH_EVERY})`);
}
