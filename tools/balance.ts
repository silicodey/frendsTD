// Headless balance check: a greedy bot plays every level with tier-appropriate loadouts.
import { LEVELS } from '../src/data/levels';
import { TOWERS, TIER_UNLOCK } from '../src/data/towers';
import { Sim } from '../src/sim/sim';
import { Bot } from '../src/sim/bot';
import { FAMILIES } from '../src/data/types';

function loadoutFor(stars: number, variant: number): string[] {
  const avail = TOWERS.filter((t) => TIER_UNLOCK[t.tier - 1] <= stars);
  if (variant < 4) {
    // mono-family: top 6 tiers of one family
    return avail.filter((t) => t.family === FAMILIES[variant]).slice(-6).map((t) => t.id);
  }
  // mixed: a cheap starter + best of each family
  const pick: string[] = [];
  for (const f of FAMILIES) { const l = avail.filter((t) => t.family === f); pick.push(l[l.length - 1].id); }
  const cheap = avail.filter((t) => t.tier <= 2 && t.kind !== 'income');
  pick.push(cheap[0].id, avail.filter((t) => t.family === 'claude').slice(-2)[0].id);
  return [...new Set(pick)];
}

const only = process.argv[2] ? Number(process.argv[2]) : 0;
let stars = 0;
for (const level of LEVELS) {
  const row: string[] = [];
  if (!only || only === level.id) {
    for (let v = 0; v < 5; v++) {
      const sim = new Sim(level);
      sim.autoDelay = 3;
      const bot = new Bot(sim, loadoutFor(stars, v));
      let steps = 0;
      const dt = 1 / 30;
      while (sim.state !== 'won' && sim.state !== 'lost' && steps < 30 * 60 * 40) { bot.update(dt); sim.step(dt); sim.events.length = 0; steps++; }
      const name = v < 4 ? FAMILIES[v].slice(0, 3) : 'mix';
      row.push(`${name}:${sim.state === 'won' ? `W${sim.stars()}★ ${sim.lives}hp` : `L@${sim.waveIdx + 1}`}`.padEnd(14));
    }
    console.log(`L${String(level.id).padStart(2)} ${level.name.padEnd(20)} stars=${String(Math.round(stars)).padStart(2)} | ${row.join(' ')}`);
  }
  stars += 2.4; // assume an average player earns ~2.4 stars per level
}
