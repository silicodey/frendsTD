// Is each Damage unit's L8 speciality pair balanced? Keen Edge (crit) vs Overclock (raw damage).
//   npx tsx tools/specpairs.ts [crit damage = 1.5]
//
// Like the first pass of tools/calibrate.ts, a whole board of one unit (15 copies, rank 3, level 8) holds
// the real wave stream until it leaks; the time it survives converts into an equivalent damage ratio
// (~1.25× damage per 20 s survived). Within ±5% means the pair is balanced at that crit damage.
import { PvpMatch, buildSpec, type DeckCard } from '../src/pvp/match';
import { PVP_UNITS } from '../src/pvp/roster';
import { SPECIALITIES } from '../src/pvp/specialities';
import { dutyOf } from '../src/data/towers';

const CRIT = Number(process.argv[2] ?? 1.5), LEVEL = 8, RANK = 3;

function survive(id: string, pick: number, seed: number): number {
  const deck: DeckCard[] = [{ id, level: LEVEL, talents: [-1, pick, -1] }];
  const m = new PvpMatch({ name: 'A', deck }, { name: 'B', deck }, seed);
  m.sides[0].deck = deck.map((d) => buildSpec(d, { noRarity: true, critDmg: CRIT }));
  for (const [c, r] of m.freeSlots(0)) m.sim.placeTower(m.sides[0].deck[0].def, c, r, 0, RANK, true, { deck: 0 });
  m.sim.recomputeBuffs();
  m.sides[1].hearts = 1e9;
  m.sides[0].hearts = 25;
  while (m.sides[0].hearts > 0 && m.time < 1200) { m.step(1 / 20); m.sim.events.length = 0; m.events.length = 0; }
  return m.time;
}

const rows: [string, number][] = [];
for (const u of PVP_UNITS) {
  const row = SPECIALITIES[u.id]?.[1];
  if (dutyOf(u) !== 'damage' || !row || !row[0].id.endsWith('-keen')) continue;
  const t = (pick: number) => (survive(u.id, pick, 1) + survive(u.id, pick, 2) + survive(u.id, pick, 3)) / 3;
  const keen = t(0), over = t(1);
  const ratio = Math.pow(1.25, (keen - over) / 20); // > 1: Keen Edge is worth more
  rows.push([u.id, ratio]);
  console.log(`${u.name.padEnd(14)} keen ${keen.toFixed(0)}s  overclock ${over.toFixed(0)}s  → crit worth ${((ratio - 1) * 100).toFixed(1).padStart(5)}% vs damage`);
}
const off = rows.filter(([, r]) => Math.abs(r - 1) > 0.05);
console.log(off.length ? `outside ±5%: ${off.map(([id, r]) => `${id} ${((r - 1) * 100).toFixed(1)}%`).join(', ')}` : 'all pairs within ±5%');
