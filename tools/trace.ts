// Trace one bot run: npx tsx tools/trace.ts <level> <comma-separated tower ids>
import { LEVELS } from '../src/data/levels';
import { Sim } from '../src/sim/sim';
import { Bot } from '../src/sim/bot';

const level = LEVELS[Number(process.argv[2]) - 1];
const loadout = process.argv[3].split(',');
const sim = new Sim(level);
sim.autoDelay = 3;
const bot = new Bot(sim, loadout);
let lastWave = -1, steps = 0;
const dt = 1 / 30;
while (sim.state !== 'won' && sim.state !== 'lost' && steps < 30 * 60 * 40) {
  bot.update(dt); sim.step(dt); sim.events.length = 0; steps++;
  if (sim.waveIdx !== lastWave) {
    lastWave = sim.waveIdx;
    const w = sim.waves[sim.waveIdx];
    const counts = new Map<string, number>();
    for (const t of sim.towers) counts.set(t.def.name, (counts.get(t.def.name) ?? 0) + 1);
    const towers = [...counts].map(([n, c]) => c + 'x' + n).join(', ');
    const wave = w.groups.map((g) => g.count + g.type + '*' + g.hpMult.toFixed(1)).join(' + ');
    console.log('w' + (sim.waveIdx + 1) + ': lives ' + sim.lives + ' tokens ' + sim.tokens + ' [' + towers + '] <- ' + wave);
  }
}
console.log(sim.state, 'lives', sim.lives, 'wave', sim.waveIdx + 1, 't', Math.round(sim.time), 'tokens', sim.tokens);
