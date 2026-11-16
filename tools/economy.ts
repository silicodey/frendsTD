// Economy pacing: how long does an active player take to reach each Breakthrough?
//   npx tsx tools/economy.ts [matches per day] [win rate] [days]
import { newProfile, settleMatch, upgrade, canUpgrade, buyOffer, shopOffers, grantWeights } from '../src/pvp/profile';
import { mulberry32 } from '../src/data/levels';
import { MAX_CARD_LEVEL } from '../src/pvp/economy';

const PER_DAY = Number(process.argv[2] ?? 15), WIN = Number(process.argv[3] ?? 0.55), DAYS = Number(process.argv[4] ?? 120);
const DAY = 86400000, T0 = Date.parse('2026-11-16T08:00:00Z');
const rng = mulberry32(12345);
const p = newProfile(T0);
grantWeights(p, 'gk_heavy', 1); // a legendary in the collection from the start
const watch = ['gem_flash', 'cl_thinking', 'gk_heavy'];
const reached: Record<string, Record<number, number>> = Object.fromEntries(watch.map((id) => [id, {}]));
for (let d = 0; d < DAYS; d++) {
  const now = T0 + d * DAY;
  for (let i = 0; i < PER_DAY; i++) {
    settleMatch(p, rng() < WIN ? 1 : 0, p.elo, rng, now + i * 60000, ['gemini', 'claude', 'codex', 'grok'][Math.floor(d / 7) % 4] as never);
    // spend: level every owned unit whenever possible, lowest level first (Breakthroughs included)
    for (let more = true; more;) {
      more = false;
      const ids = Object.keys(p.cards).sort((a, b) => p.cards[a].level - p.cards[b].level);
      for (const id of ids) if (canUpgrade(p, id) === 'ok') {
        const r = upgrade(p, id, now)!;
        if (reached[id]) reached[id][r.level] ??= d + 1;
        more = true;
        break;
      }
    }
  }
  // a thrifty daily shop habit: the 300-Token shard bundle when Tokens allow
  const sh = shopOffers(p, now).find((o) => o.mats?.shards === 30);
  if (sh && !sh.sold && p.tokens > 2000) buyOffer(p, sh.key, now);
}
const lv = Object.values(p.cards).map((c) => c.level);
const blocked: Record<string, number> = {};
for (const id of Object.keys(p.cards)) { const w = canUpgrade(p, id); blocked[w] = (blocked[w] ?? 0) + 1; }
console.log(`collection: ${lv.length} units, avg level ${(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1)}, blocked by ${JSON.stringify(blocked)}`);
console.log(`${PER_DAY} matches/day at ${Math.round(WIN * 100)}% wins, ${DAYS} days → Elo ${p.elo}, ${p.tokens} Tokens left, mats ${JSON.stringify(p.mats)}`);
for (const id of watch) {
  const r = reached[id];
  console.log(`  ${id.padEnd(12)} level ${p.cards[id]?.level ?? '-'}  ·  L6 day ${r[6] ?? '—'}  L8 day ${r[8] ?? '—'}  L10 day ${r[MAX_CARD_LEVEL] ?? '—'}`);
}
