// Data-driven unit balance for duels.
//   npx tsx tools/calibrate.ts            → rewrites src/pvp/calibration.ts
//
// Every PvP unit fills a whole board (15 copies, rank 3, same level, no rarity bonus) and holds the real
// wave stream until it leaks 3 hearts. A unit that falls earlier than the median gets a damage
// multiplier; one that lasts longer gets less. Support units can't hold a lane alone, so they are
// measured as 5 supports + 10 reference units against 15 reference units (same for pull-back control). Repeats until stable.
import { writeFileSync } from 'node:fs';
import { PvpMatch, buildSpec, type DeckCard } from '../src/pvp/match';
import { PVP_UNITS } from '../src/pvp/roster';
import { PvpBot } from '../src/pvp/bot';

const LEVEL = 9, RANK = 3, REF = 'cl_sonnet';
const cal: Record<string, number> = Object.fromEntries(PVP_UNITS.map((t) => [t.id, 1]));

function survive(id: string, c: number, support: boolean, seed: number): number {
  const deck: DeckCard[] = [{ id, level: LEVEL, talents: [] }, { id: REF, level: LEVEL, talents: [] }];
  const m = new PvpMatch({ name: 'A', deck }, { name: 'B', deck }, seed);
  m.sides[0].deck = deck.map((d, i) => buildSpec(d, { noRarity: true, cal: i === 0 ? c : cal[REF] }));
  const slots = m.freeSlots(0);
  slots.forEach(([cc, r], i) => {
    const deckIdx = support ? (i % 3 === 1 ? 0 : 1) : 0;
    m.sim.placeTower(m.sides[0].deck[deckIdx].def, cc, r, 0, RANK, true, { deck: deckIdx });
  });
  m.sim.recomputeBuffs();
  m.sides[1].hearts = 1e9;
  m.sides[0].hearts = 25; // many hearts: leaks add up gradually instead of hinging on one boss
  while (m.sides[0].hearts > 0 && m.time < 1200) { m.step(1 / 20); m.sim.events.length = 0; m.events.length = 0; }
  return m.time;
}

const score = (id: string, c: number) => {
  const def = PVP_UNITS.find((t) => t.id === id)!;
  // supports and pure crowd control can't be judged on a board made only of themselves
  const support = def.kind === 'support' || !!def.pull;
  return (survive(id, c, support, 1) + survive(id, c, support, 2)) / 2;
};

for (let it = 0; it < 8; it++) {
  const t: Record<string, number> = {};
  for (const u of PVP_UNITS) t[u.id] = score(u.id, cal[u.id]);
  const sorted = Object.values(t).sort((a, b) => a - b);
  const target = sorted[Math.floor(sorted.length / 2)];
  let worst = 0;
  for (const u of PVP_UNITS) {
    // enemy HP grows ~1.17× per 20s wave and wave size grows too: ~1.25× damage per 20s survived
    const step = Math.pow(1.25, (target - t[u.id]) / 20);
    cal[u.id] = Math.min(6, Math.max(0.03, cal[u.id] * Math.pow(step, 0.8)));
    worst = Math.max(worst, Math.abs(t[u.id] - target));
  }
  console.log(`iteration ${it + 1}: median ${target.toFixed(0)}s, worst gap ${worst.toFixed(0)}s`);
  if (process.argv.includes('-v')) console.log('   ' + PVP_UNITS.map((u) => `${u.id}:${t[u.id].toFixed(0)}`).join(' '));
  if (worst < 6) break;
}
// ------------------------------------------------------------------ pass 2: real matches
// Static boards miss what only happens in play (merges, random summons, Agentic Merge, support
// placement). Each unit now plays full AI-vs-AI duels as one of five cards against a reference deck
// at equal strength, and its multiplier moves until it wins about half.
const REFS = ['gem_flash', 'cl_sonnet', 'cx_mini', 'gk_tesla', 'cx_debugger'];
function winRate(id: string, n: number): number {
  let w = 0;
  for (let s = 1; s <= n; s++) {
    const refs = REFS.filter((r) => r !== id).slice(0, 4);
    const A: DeckCard[] = [id, ...refs].map((x) => ({ id: x, level: LEVEL, talents: [] }));
    const B: DeckCard[] = REFS.map((x) => ({ id: x, level: LEVEL, talents: [] }));
    const m = new PvpMatch({ name: 'A', deck: A }, { name: 'B', deck: B }, s * 7 + 1);
    m.sides[0].deck = A.map((d) => buildSpec(d, { noRarity: true, cal: cal[d.id] }));
    m.sides[1].deck = B.map((d) => buildSpec(d, { noRarity: true, cal: cal[d.id] }));
    const bots = [new PvpBot(m, 0, 0.7, s), new PvpBot(m, 1, 0.7, s + 999)];
    while (!m.ended && m.time < 1500) { for (const b of bots) b.update(1 / 30); m.step(1 / 30); m.sim.events.length = 0; m.events.length = 0; }
    w += m.winner === 0 ? 1 : m.winner === -1 ? 0.5 : 0;
  }
  return w / n;
}
if (!process.argv.includes('--static-only')) {
  const N = 40;
  const hist: Record<string, number[]> = {};
  for (let it = 0; it < 8; it++) {
    let worst = 0;
    const out: string[] = [];
    for (const u of PVP_UNITS) {
      if (REFS.includes(u.id)) continue;
      const wr = winRate(u.id, N);
      // one card is a fifth of the deck: its multiplier must move ~1.4× the win-rate error
      cal[u.id] = Math.min(6, Math.max(0.03, cal[u.id] * (1 - 0.8 * (wr - 0.5))));
      (hist[u.id] ??= []).push(cal[u.id]);
      worst = Math.max(worst, Math.abs(wr - 0.5));
      out.push(`${u.id}:${Math.round(wr * 100)}%`);
    }
    console.log(`match pass ${it + 1}: worst ${Math.round(worst * 100)} points off 50%`);
    if (process.argv.includes('-v')) console.log('   ' + out.join(' '));
    if (worst < 0.1) break;
  }
  // measurements are noisy: settle on the geometric mean of each unit's last few multipliers
  for (const [id, h] of Object.entries(hist)) {
    const tail = h.slice(-4);
    cal[id] = Math.exp(tail.reduce((a, x) => a + Math.log(x), 0) / tail.length);
  }
  // validate on seeds the calibration never saw
  const check = PVP_UNITS.filter((u) => !REFS.includes(u.id)).map((u) => {
    let w = 0;
    for (let s = 101; s <= 160; s++) {
      const refs = REFS.slice(0, 4);
      const A: DeckCard[] = [u.id, ...refs].map((x) => ({ id: x, level: LEVEL, talents: [] }));
      const B: DeckCard[] = REFS.map((x) => ({ id: x, level: LEVEL, talents: [] }));
      const m = new PvpMatch({ name: 'A', deck: A }, { name: 'B', deck: B }, s);
      m.sides[0].deck = A.map((d) => buildSpec(d, { noRarity: true, cal: cal[d.id] }));
      m.sides[1].deck = B.map((d) => buildSpec(d, { noRarity: true, cal: cal[d.id] }));
      const bots = [new PvpBot(m, 0, 0.7, s), new PvpBot(m, 1, 0.7, s + 999)];
      while (!m.ended && m.time < 1500) { for (const b of bots) b.update(1 / 30); m.step(1 / 30); m.sim.events.length = 0; m.events.length = 0; }
      w += m.winner === 0 ? 1 : m.winner === -1 ? 0.5 : 0;
    }
    return `${u.id}:${Math.round((w / 60) * 100)}%`;
  });
  console.log('validation (60 fresh matches each): ' + check.join(' '));
}

const lines = PVP_UNITS.map((u) => `  ${u.id}: ${cal[u.id].toFixed(3)}, // ${u.name}`).join('\n');
writeFileSync('src/pvp/calibration.ts', `// Generated by tools/calibrate.ts: per-unit damage multipliers that make every kit equally effective
// on a duel board before rarity and level advantages are applied. Re-run the tool after changing units.
export const CAL: Record<string, number> = {
${lines}
};
`);
console.log(lines);
