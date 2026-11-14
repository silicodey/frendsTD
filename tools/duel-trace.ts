// Wave-by-wave trace of one AI duel: npx tsx tools/duel-trace.ts [seed] [deck] [level]
import { PvpMatch, type DeckCard } from '../src/pvp/match';
import { PvpBot } from '../src/pvp/bot';
import { startLevel } from '../src/pvp/economy';
const seed = Number(process.argv[2] ?? 1);
const ids = process.argv[3] ?? 'gem_flash,cl_sonnet,cx_mini,gk_tesla,cl_thinking';
const lvl = Number(process.argv[4] ?? 1);
const deck = (): DeckCard[] => ids.split(',').map((id) => ({ id, level: Math.max(lvl, startLevel(id)), talents: [0, 0, 0, 0] }));
const m = new PvpMatch({ name: 'A', deck: deck() }, { name: 'B', deck: deck() }, seed);
const bots = [new PvpBot(m, 0, 0.7, 1), new PvpBot(m, 1, 0.7, 2)];
let w = -1;
const dt = 1 / 30;
while (!m.ended && m.time < 900) {
  for (const b of bots) b.update(dt);
  m.step(dt);
  for (const ev of m.sim.events) if (ev.t === 'leak' && ev.enemy!.pathIdx === 0) console.log(`   leak t ${m.time.toFixed(1)} ${ev.enemy!.def.id} hp ${ev.enemy!.hp.toFixed(0)}/${ev.enemy!.maxHp.toFixed(0)} dist ${ev.enemy!.dist.toFixed(1)} path ${ev.enemy!.path.length.toFixed(1)}`);
  m.sim.events.length = 0; m.events.length = 0;
  for (const ev of []) void ev;
  if (m.wave !== w || m.ended) {
    w = m.wave;
    const s = m.sides[0];
    const units = m.units(0);
    const dps = units.reduce((a, t) => a + t.stats.dmg * (t.def.kind === 'beam' || t.def.kind === 'aura' ? 1 : t.stats.rate * (t.def.burst ?? 1)) * (t.def.targets ?? 1), 0);
    const lane = m.sim.enemies.filter((e) => e.pathIdx === 0);
    console.log(`t ${m.time.toFixed(0).padStart(3)} wave ${w}: hearts ${s.hearts} compute ${s.compute.toFixed(0)} summons ${s.summons} cost ${m.summonCost(0)} units ${units.length} ranks [${units.map((u) => u.rank).join('')}] power ${s.power.join('')} dps ${dps.toFixed(0)} | lane ${lane.length} hp ${lane.reduce((a, e) => a + e.hp, 0).toFixed(0)} kills ${s.kills} earned ${s.computeEarned}`);
  }
}
console.log('winner', m.winner, 'wave', m.wave, 't', m.time.toFixed(0));
