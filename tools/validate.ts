// Win rate of each unit (one card in a reference deck) against the reference deck, on fresh seeds.
//   npx tsx tools/validate.ts [unit ids…]          (default: every non-reference duel unit)
//   npx tsx tools/validate.ts --tune [unit ids…]   nudges units more than 6 points off 50% and rewrites
//                                                  src/pvp/calibration.ts (a final touch after tools/calibrate.ts)
import { PvpMatch, buildSpec, type DeckCard } from '../src/pvp/match';
import { PVP_UNITS } from '../src/pvp/roster';
import { PvpBot } from '../src/pvp/bot';
import { readFileSync, writeFileSync } from 'node:fs';
import { CAL } from '../src/pvp/calibration';

const LEVEL = 6, REFS = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'cx_debugger'];
const N = Number(process.env.N ?? 100);
const TUNE = process.argv.includes('--tune'), args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = args.length ? args : PVP_UNITS.map((u) => u.id).filter((id) => !REFS.includes(id));
function winRate(id: string): number {
  let w = 0;
  for (let s = 201; s < 201 + N; s++) {
    const A: DeckCard[] = [id, ...REFS.slice(0, 4)].map((x) => ({ id: x, level: LEVEL, talents: [-1, -1, -1] }));
    const B: DeckCard[] = REFS.map((x) => ({ id: x, level: LEVEL, talents: [-1, -1, -1] }));
    const m = new PvpMatch({ name: 'A', deck: A }, { name: 'B', deck: B }, s);
    m.sides[0].deck = A.map((d) => buildSpec(d, { noRarity: true, cal: CAL[d.id] }));
    m.sides[1].deck = B.map((d) => buildSpec(d, { noRarity: true, cal: CAL[d.id] }));
    const bots = [new PvpBot(m, 0, 0.7, s), new PvpBot(m, 1, 0.7, s + 999)];
    while (!m.ended && m.time < 1500) { for (const b of bots) b.update(1 / 30); m.step(1 / 30); m.sim.events.length = 0; m.events.length = 0; }
    w += m.winner === 0 ? 1 : m.winner === -1 ? 0.5 : 0;
  }
  return w / N;
}
let todo = ids;
for (let it = 0; it < (TUNE ? 4 : 1) && todo.length; it++) {
  const off: string[] = [];
  for (const id of todo) {
    const wr = winRate(id);
    console.log(`${id.padEnd(14)} ${Math.round(wr * 100)}%  (cal ${CAL[id].toFixed(3)})`);
    if (TUNE && Math.abs(wr - 0.5) > 0.06) { CAL[id] *= 1 - 0.8 * (wr - 0.5); off.push(id); }
  }
  todo = off;
  if (TUNE && off.length) console.log(`-- retuning ${off.join(', ')}`);
}
if (TUNE) {
  const f = 'src/pvp/calibration.ts';
  let src = readFileSync(f, 'utf8');
  for (const [id, v] of Object.entries(CAL)) src = src.replace(new RegExp(`(\\n  ${id}: )[0-9.]+`), `$1${v.toFixed(3)}`);
  writeFileSync(f, src);
}
