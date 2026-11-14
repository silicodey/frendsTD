// Headless duels between AI rivals: balance and stability checks for the PvP engine.
//   npx tsx tools/duel.ts [matches] [deckA] [deckB] [levelA] [levelB]
import { PvpMatch, type DeckCard } from '../src/pvp/match';
import { PvpBot } from '../src/pvp/bot';
import { startLevel } from '../src/pvp/economy';

const N = Number(process.argv[2] ?? 20);
const deck = (ids: string, lvl: number): DeckCard[] => ids.split(',').map((id) => ({ id, level: Math.max(lvl, startLevel(id)), talents: [0, 0, 0, 0] }));
const A = process.argv[3] ?? 'gem_flash,cl_sonnet,cx_mini,gk_tesla,cl_thinking';
const B = process.argv[4] ?? A;
const la = Number(process.argv[5] ?? 1), lb = Number(process.argv[6] ?? la);
let wins = [0, 0, 0], waves = 0, secs = 0, bad = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const m = new PvpMatch({ name: 'A', deck: deck(A, la) }, { name: 'B', deck: deck(B, lb) }, i + 1);
  const bots = [new PvpBot(m, 0, 0.7, i * 3 + 1), new PvpBot(m, 1, 0.7, i * 3 + 2)];
  const dt = 1 / 30;
  while (!m.ended && m.time < 900) {
    for (const b of bots) b.update(dt);
    m.step(dt);
    m.sim.events.length = 0; m.events.length = 0;
    for (const s of m.sides) if (!Number.isFinite(s.compute)) bad++;
  }
  wins[m.winner === -1 ? 2 : m.winner]++;
  waves += m.wave; secs += m.time;
  if (process.argv.includes('-v')) console.log(`#${i + 1} winner ${m.winner} wave ${m.wave} t ${m.time.toFixed(0)}s  A: hearts ${m.sides[0].hearts} rank ${m.sides[0].maxRank} merges ${m.sides[0].merges} power ${m.sides[0].power}  B: hearts ${m.sides[1].hearts} rank ${m.sides[1].maxRank} power ${m.sides[1].power}`);
}
console.log(`A wins ${wins[0]}  B wins ${wins[1]}  draws ${wins[2]}  avg wave ${(waves / N).toFixed(1)}  avg length ${(secs / N / 60).toFixed(1)} min  non-finite ${bad}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
