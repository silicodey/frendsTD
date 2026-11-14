// Boss and wave difficulty report: how far do typical boards get, and do bosses die?
//   npx tsx tools/bosses.ts [matches] [level offset] [skill]
import { BOSS_TUNE, PvpMatch, type DeckCard } from '../src/pvp/match';
// experiment: TUNE='{"armor":0.4}' npx tsx tools/bosses.ts …
if (process.env.TUNE) Object.assign(BOSS_TUNE, JSON.parse(process.env.TUNE));
import { PvpBot } from '../src/pvp/bot';
import { startLevel } from '../src/pvp/economy';
import { STARTER_DECK } from '../src/pvp/profile';
import { Lockstep, DT } from '../src/net/protocol';

const N = Number(process.argv[2] ?? 20);
const plus = Number(process.argv[3] ?? 0);
const skill = Number(process.argv[4] ?? 0.7);
const pace = Number(process.argv[5] ?? 1); // <1 = a slower, more casual player
const deck = (): DeckCard[] => STARTER_DECK.map((id) => ({ id, level: startLevel(id) + plus, talents: [-1, -1, -1, -1] }));
interface Rec { wave: number; type: string; max: number; left: number; killed: boolean; alive: number }
const recs: Rec[] = [];
let endWave = 0, endT = 0;
const endWaves: number[] = [];
for (let i = 0; i < N; i++) {
  const m = new PvpMatch({ name: 'A', deck: deck() }, { name: 'B', deck: deck() }, 1000 + i);
  const bots = [new PvpBot(m, 0, skill, i * 3 + 1), new PvpBot(m, 1, skill, i * 3 + 2)];
  const lock = new Lockstep(m, () => undefined);
  const seen = new Map<number, Rec & { born: number; e: { alive: boolean; hp: number; dist: number } }>();
  while (!m.ended && m.time < 1200) {
    for (const b of bots) b.update(DT * pace);
    lock.step();
    for (const e of m.sim.enemies) if (e.def.boss && !seen.has(e.id)) seen.set(e.id, { wave: m.wave, type: e.def.id, max: e.maxHp + e.maxShield, left: 1, killed: false, alive: 0, born: m.time, e });
    for (const r of seen.values()) if (r.alive === 0 && !r.e.alive) { r.alive = m.time - r.born; r.killed = r.e.hp <= 0; r.left = Math.max(0, r.e.hp) / r.max; }
    m.sim.events.length = 0; m.events.length = 0;
  }
  for (const r of seen.values()) { if (r.alive === 0) { r.alive = m.time - r.born; r.left = Math.max(0, r.e.hp) / r.max; } recs.push(r); }
  endWave += m.wave; endT += m.time; endWaves.push(m.wave);
}
const byWave = new Map<number, Rec[]>();
for (const r of recs) byWave.set(r.wave, [...(byWave.get(r.wave) ?? []), r]);
console.log(`tune ${JSON.stringify(BOSS_TUNE)}\ndecks: starter +${plus} levels, bot skill ${skill}, pace ${pace}, ${N} matches`);
for (const [w, rs] of [...byWave].sort((a, b) => a[0] - b[0])) {
  const k = rs.filter((r) => r.killed).length;
  console.log(`wave ${String(w).padStart(2)} ${rs[0].type.padEnd(9)} killed ${String(k).padStart(3)}/${String(rs.length).padEnd(3)} avg health left ${(rs.reduce((a, r) => a + r.left, 0) / rs.length * 100).toFixed(0).padStart(3)}%  avg time alive ${(rs.reduce((a, r) => a + r.alive, 0) / rs.length).toFixed(0)}s`);
}
endWaves.sort((a, b) => a - b);
console.log(`match ends: avg wave ${(endWave / N).toFixed(1)} (median ${endWaves[Math.floor(N / 2)]}), avg ${(endT / N / 60).toFixed(1)} min`);
