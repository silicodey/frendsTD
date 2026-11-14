import type { Family, TowerDef } from './types';

const COST = [50, 70, 100, 130, 170, 220, 280, 350, 450, 580, 750, 1000];

type Spec = Omit<TowerDef, 'family' | 'tier' | 'cost'>;

function fam(family: Family, specs: Spec[]): TowerDef[] {
  return specs.map((s, i) => ({ ...s, family, tier: i + 1, cost: COST[i] }));
}

const GEMINI = fam('gemini', [
  { id: 'gem_nano', name: 'Nano', role: 'Starter', kind: 'bullet', dmg: 5, rate: 2.0, range: 2.6,
    desc: 'On-device light bolts. Cheap, quick, always there.' },
  { id: 'gem_flashlite', name: 'Flash-Lite', role: 'Rapid', kind: 'bullet', dmg: 3.3, rate: 4.5, range: 2.4,
    desc: 'A stutter of photons. Low damage, absurd throughput.' },
  { id: 'gem_flash', name: 'Flash', role: 'Beam', kind: 'beam', dmg: 15, rate: 5, range: 2.8, ramp: [1.7, 2], shieldMult: 1.5,
    desc: 'Focused beam that heats up the longer it holds a target. Melts shields.' },
  { id: 'gem_twin', name: 'Twin Flash', role: 'Multi', kind: 'bullet', dmg: 9, rate: 1.8, range: 3.0, targets: 2,
    desc: 'Castor and Pollux. Two prisms, two targets, one tower.' },
  { id: 'gem_banana', name: 'Nano Banana', role: 'Splash', kind: 'lob', dmg: 26, rate: 0.7, range: 3.4, splash: 1.3, slow: [0.25, 1.5], noAir: true,
    desc: 'Lobs a generated banana. Splash damage and a slippery slow.' },
  { id: 'gem_pro', name: 'Pro', role: 'Heavy Beam', kind: 'beam', dmg: 30, rate: 5, range: 3.2, ramp: [2.1, 3], shieldMult: 1.5,
    desc: 'Long-context beam. Ramps to double power on a held target.' },
  { id: 'gem_vision', name: 'Pro Vision', role: 'Sniper', kind: 'sniper', dmg: 110, rate: 0.5, range: 5.5, crit: [0.25, 2.5],
    desc: 'Multimodal lens that sees across the map. Crits hard.' },
  { id: 'gem_veo', name: 'Veo', role: 'Slow Field', kind: 'aura', dmg: 12, rate: 4, range: 2.6, slow: [0.35, 0.5],
    desc: 'Renders the world in slow motion. Enemies in range crawl and burn.' },
  { id: 'gem_ultra', name: 'Ultra', role: 'Tri-Beam', kind: 'beam', dmg: 44, rate: 5, range: 3.6, targets: 3, ramp: [1.6, 2], shieldMult: 1.5,
    desc: 'Splits a refracted beam across three targets at once.' },
  { id: 'gem_deepthink', name: 'Deep Think', role: 'Rail', kind: 'rail', dmg: 420, rate: 0.4, range: 5.0, railWidth: 0.45,
    desc: 'Thinks, then fires a line of pure light through everything in its way.' },
  { id: 'gem_constellation', name: 'Constellation', role: 'Star Volley', kind: 'bullet', dmg: 40, rate: 1.6, range: 4.2, targets: 5,
    desc: 'Five guided stars per volley, each seeking its own target.' },
  { id: 'gem_twinsuns', name: 'Twin Suns', role: 'Ultimate', kind: 'beam', dmg: 110, rate: 5, range: 4.5, targets: 2, ramp: [2.5, 3], dot: [40, 3], shieldMult: 2,
    desc: 'Binary stars in orbit. Two solar lances that set everything ablaze.' },
]);

const CLAUDE = fam('claude', [
  { id: 'cl_haiku', name: 'Haiku', role: 'Starter', kind: 'bullet', dmg: 4, rate: 0.85, range: 2.7, burst: 3,
    desc: 'Three quick syllables / precise and inexpensive / gone before you blink.' },
  { id: 'cl_sonnet', name: 'Sonnet', role: 'All-rounder', kind: 'bullet', dmg: 11, rate: 1.2, range: 2.9, splash: 0.6,
    desc: 'Balanced verse. Reliable damage with a small burst on impact.' },
  { id: 'cl_artifact', name: 'Artifacts', role: 'Income', kind: 'income', dmg: 0, rate: 0, range: 0, income: 18,
    desc: 'Ships something useful every wave. Pays out bonus tokens.' },
  { id: 'cl_constitution', name: 'Constitution', role: 'Support', kind: 'support', dmg: 0, rate: 0, range: 2.2, buff: { dmg: 0.2 },
    desc: 'Good values, clearly written. Nearby towers deal more damage.' },
  { id: 'cl_opus', name: 'Opus', role: 'Heavy', kind: 'bullet', dmg: 62, rate: 0.6, range: 3.3, splash: 0.9, pierce: 0.5, projSpeed: 7,
    desc: 'A weighty, deliberate orb. Punches through half of any armor.' },
  { id: 'cl_thinking', name: 'Extended Thinking', role: 'Ramp Beam', kind: 'beam', dmg: 24, rate: 5, range: 3.2, ramp: [3.2, 4],
    desc: 'The longer it reasons about a target, the worse for the target. Boss killer.' },
  { id: 'cl_guardrail', name: 'Guardrails', role: 'Control Field', kind: 'aura', dmg: 0, rate: 4, range: 2.5, slow: [0.3, 0.5], vuln: 0.15,
    desc: 'A polite but firm field. Slows enemies and makes them take more damage.' },
  { id: 'cl_mcp', name: 'MCP Hub', role: 'Support', kind: 'support', dmg: 0, rate: 0, range: 2.6, buff: { rate: 0.2, range: 0.1 },
    desc: 'Connects everything to everything. Nearby towers fire faster and reach further.' },
  { id: 'cl_code', name: 'Claude Code', role: 'Agent Loop', kind: 'chain', dmg: 70, rate: 1.0, range: 3.4, chain: [6, 0.85, 2.2],
    desc: 'An agentic bolt that keeps finding the next task. Bounces through six enemies.' },
  { id: 'cl_computer', name: 'Computer Use', role: 'Cursor Sniper', kind: 'sniper', dmg: 520, rate: 0.33, range: 6, stun: 0.8,
    desc: 'Moves the cursor. Clicks the biggest threat. It stops working for a moment.' },
  { id: 'cl_mythos', name: 'Mythos', role: 'Shockwave', kind: 'nova', dmg: 120, rate: 0.5, range: 3.0, stun: 0.6,
    desc: 'Legend made tangible. A stunning wave rolls out over everything nearby.' },
  { id: 'cl_fable', name: 'Fable', role: 'Ultimate', kind: 'beam', dmg: 64, rate: 5, range: 4.4, targets: 4, ramp: [2.2, 3], buff: { dmg: 0.15 },
    desc: 'Weaves four story-threads at once and inspires every tower around it.' },
]);

const CODEX = fam('codex', [
  { id: 'cx_autocomplete', name: 'Autocomplete', role: 'Starter', kind: 'bullet', dmg: 2.6, rate: 4, range: 2.4,
    desc: 'Finishes your sentences. And your enemies. One token at a time.' },
  { id: 'cx_linter', name: 'Linter', role: 'Corrode', kind: 'bullet', dmg: 3, rate: 1.5, range: 2.8, dot: [6, 3],
    desc: 'Flags every flaw. Applies damage over time that ignores armor.' },
  { id: 'cx_mini', name: 'Codex Mini', role: 'Mortar', kind: 'lob', dmg: 16, rate: 0.75, range: 3.4, splash: 1.1, noAir: true,
    desc: 'Small model, small shells. Area damage for crowds.' },
  { id: 'cx_unittest', name: 'Unit Test', role: 'Armor Shred', kind: 'bullet', dmg: 15, rate: 1.6, range: 3.0, shred: 2,
    desc: 'Finds the edge case. Every hit strips armor from the target.' },
  { id: 'cx_compiler', name: 'Compiler', role: 'Heavy Mortar', kind: 'lob', dmg: 48, rate: 0.5, range: 4.0, splash: 1.5, noAir: true,
    desc: 'Takes a while to build. Lands like a release.' },
  { id: 'cx_debugger', name: 'Debugger', role: 'Breakpoint', kind: 'sniper', dmg: 90, rate: 0.55, range: 5.0, shieldMult: 2, pierce: 1,
    desc: 'Steps straight through armor and shreds shields. Nothing hides from a breakpoint.' },
  { id: 'cx_pr', name: 'Pull Request', role: 'Rocket Volley', kind: 'bullet', dmg: 30, rate: 0.5, range: 3.8, burst: 3, splash: 0.9, projSpeed: 6,
    desc: 'Three commits, one push. A volley of seeking rockets.' },
  { id: 'cx_ci', name: 'CI Pipeline', role: 'Gatling', kind: 'bullet', dmg: 7, rate: 6, range: 3.0, spinup: [2.3, 3],
    desc: 'Spins up and never stops shipping. Fire rate climbs while it has targets.' },
  { id: 'cx_sandbox', name: 'Sandbox', role: 'Lockdown', kind: 'nova', dmg: 60, rate: 0.2, range: 2.6, stun: 1.2,
    desc: 'Contains everything nearby in an isolated box. Long stun, every few seconds.' },
  { id: 'cx_refactor', name: 'Refactor', role: 'Rail', kind: 'rail', dmg: 260, rate: 0.6, range: 4.2, shred: 3, railWidth: 0.4,
    desc: 'Rewrites a whole line at once and strips armor on the way through.' },
  { id: 'cx_swarm', name: 'Agent Swarm', role: 'Drones', kind: 'drone', dmg: 22, rate: 2.5, range: 4.0, drones: 4,
    desc: 'Four parallel agents roam the area, each hunting on its own.' },
  { id: 'cx_max', name: 'Codex Max', role: 'Ultimate', kind: 'bullet', dmg: 110, rate: 0.25, range: 5.5, burst: 6, splash: 1.4, projSpeed: 6.5,
    desc: 'Deploys to production. A six-missile barrage that rewrites the battlefield.' },
]);

const GROK = fam('grok', [
  { id: 'gk_spark', name: 'Spark', role: 'Starter', kind: 'chain', dmg: 7, rate: 1.6, range: 2.1, chain: [2, 0.5, 1.5],
    desc: 'A crackle of static. Short range, jumps to a second target.' },
  { id: 'gk_fun', name: 'Fun Mode', role: 'Wildcard', kind: 'bullet', dmg: 14, rate: 1.05, range: 2.7, wild: [0.15, 1.85],
    desc: 'Might tickle. Might obliterate. Damage rolls wildly on every shot.' },
  { id: 'gk_tesla', name: 'Tesla Coil', role: 'Chain', kind: 'chain', dmg: 11, rate: 1.1, range: 2.7, chain: [4, 0.8, 1.9],
    desc: 'Arcs through four enemies. Loves a crowd.' },
  { id: 'gk_raptor', name: 'Raptor', role: 'Rocket', kind: 'bullet', dmg: 30, rate: 0.55, range: 4.2, splash: 1.2, projSpeed: 6,
    desc: 'Full-flow staged combustion. Long-range rocket with a wide blast.' },
  { id: 'gk_vision', name: 'X-Ray', role: 'Crit Sniper', kind: 'sniper', dmg: 45, rate: 0.6, range: 4.8, crit: [0.35, 3],
    desc: 'Sees the weak point. Triple-damage crits a third of the time.' },
  { id: 'gk_unhinged', name: 'Unhinged', role: 'Spray', kind: 'bullet', dmg: 8, rate: 2.2, range: 2.6, targets: 4,
    desc: 'No filter. Fires at four targets at once, constantly.' },
  { id: 'gk_meme', name: 'Meme Cannon', role: 'Burn Splash', kind: 'lob', dmg: 34, rate: 0.7, range: 3.6, splash: 1.3, dot: [14, 3],
    desc: 'Goes viral on impact. Splash damage plus a lingering burn. Hits air.' },
  { id: 'gk_bigbrain', name: 'Big Brain', role: 'Heavy Chain', kind: 'chain', dmg: 46, rate: 0.9, range: 3.4, chain: [7, 0.88, 2.4],
    desc: 'A thick bolt that forks through seven enemies with barely any falloff.' },
  { id: 'gk_colossus', name: 'Colossus', role: 'Support', kind: 'support', dmg: 0, rate: 0, range: 2.6, buff: { crit: 0.2 },
    desc: 'A supercluster next door. Nearby towers gain a 20% chance to crit for double.' },
  { id: 'gk_heavy', name: 'Grok Heavy', role: 'Railgun', kind: 'rail', dmg: 600, rate: 0.3, range: 5.5, crit: [0.2, 2.5], railWidth: 0.5,
    desc: 'One enormous shot through the whole column. Sometimes it crits.' },
  { id: 'gk_blackhole', name: 'Event Horizon', role: 'Gravity Well', kind: 'nova', dmg: 150, rate: 0.25, range: 3.0, pull: 2.5, slow: [0.5, 1.5],
    desc: 'Collapses space. Drags enemies back along the path and crushes them.' },
  { id: 'gk_supernova', name: 'Supernova', role: 'Ultimate', kind: 'strike', dmg: 240, rate: 1.3, range: 99, splash: 1.2, chain: [3, 0.6, 2.2],
    desc: 'Map-wide lightning storm. Strikes anywhere, forks, and never stops.' },
]);

export const TOWERS: TowerDef[] = [...GEMINI, ...CLAUDE, ...CODEX, ...GROK];
export const TOWER_BY_ID: Record<string, TowerDef> = Object.fromEntries(TOWERS.map((t) => [t.id, t]));

/** Stars required to unlock each tier (index = tier-1). */
export const TIER_UNLOCK = [0, 0, 2, 4, 7, 10, 13, 16, 20, 24, 29, 34];

export const MAX_LEVEL = 3;
const DMG_MULT = [1, 1.45, 2.1];
const RANGE_MULT = [1, 1.07, 1.14];
const RATE_MULT = [1, 1.08, 1.16];
const AUX_MULT = [1, 1.35, 1.7];

export interface TowerStats {
  dmg: number;
  rate: number;
  range: number;
  aux: number; // multiplier for buffs / income / control strength
}

export function statsAt(def: TowerDef, level: number): TowerStats {
  const i = Math.min(MAX_LEVEL, Math.max(1, level)) - 1;
  return {
    dmg: def.dmg * DMG_MULT[i],
    rate: def.rate * RATE_MULT[i],
    range: def.range >= 50 ? def.range : def.range * RANGE_MULT[i],
    aux: AUX_MULT[i],
  };
}

export function upgradeCost(def: TowerDef, level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.round((def.cost * (level === 1 ? 0.65 : 1.0)) / 5) * 5;
}

export function investedAt(def: TowerDef, level: number): number {
  let v = def.cost;
  for (let l = 1; l < level; l++) v += upgradeCost(def, l);
  return v;
}

export const SELL_REFUND = 0.7;

/** Approximate sustained single-target DPS, for UI bars. */
export function approxDps(def: TowerDef, level = 1): number {
  const s = statsAt(def, level);
  // beams and auras store damage per second; everything else stores damage per attack
  let d = def.kind === 'beam' || def.kind === 'aura' ? s.dmg : s.dmg * s.rate;
  if (def.burst) d *= def.burst;
  if (def.targets) d *= def.targets;
  if (def.drones) d *= def.drones;
  if (def.crit) d *= 1 + def.crit[0] * (def.crit[1] - 1);
  if (def.ramp) d *= 1 + (def.ramp[0] - 1) * 0.6;
  if (def.spinup) d *= 1 + (def.spinup[0] - 1) * 0.7;
  if (def.dot) d += def.dot[0];
  if (def.chain) d *= 1 + def.chain[0] * 0.35;
  if (def.splash) d *= 1.6;
  if (def.kind === 'rail' || def.kind === 'nova') d *= 2;
  return d;
}

/** Trait chips shown in the UI. */
export function traits(def: TowerDef): string[] {
  const t: string[] = [];
  if (def.targets) t.push(`${def.targets} targets`);
  if (def.burst) t.push(`${def.burst}-shot burst`);
  if (def.splash) t.push('Splash');
  if (def.chain) t.push(`Chains ×${def.chain[0]}`);
  if (def.slow) t.push(`Slow ${Math.round(def.slow[0] * 100)}%`);
  if (def.stun) t.push(`Stun ${def.stun}s`);
  if (def.dot) t.push('Burn');
  if (def.crit) t.push(`Crit ${Math.round(def.crit[0] * 100)}%`);
  if (def.ramp) t.push(`Ramps ×${def.ramp[0]}`);
  if (def.spinup) t.push('Spin-up');
  if (def.shred) t.push('Shreds armor');
  if (def.pierce) t.push(def.pierce >= 1 ? 'Ignores armor' : 'Armor pierce');
  if (def.shieldMult) t.push('Anti-shield');
  if (def.vuln) t.push(`+${Math.round(def.vuln * 100)}% dmg taken`);
  if (def.pull) t.push('Pulls back');
  if (def.wild) t.push('Random dmg');
  if (def.buff?.dmg) t.push(`Buff dmg +${Math.round(def.buff.dmg * 100)}%`);
  if (def.buff?.rate) t.push(`Buff rate +${Math.round(def.buff.rate * 100)}%`);
  if (def.buff?.range) t.push(`Buff range +${Math.round(def.buff.range * 100)}%`);
  if (def.buff?.crit) t.push(`Buff crit +${Math.round(def.buff.crit * 100)}%`);
  if (def.income) t.push(`+${def.income} tokens/wave`);
  if (def.drones) t.push(`${def.drones} drones`);
  if (def.kind === 'rail') t.push('Pierces line');
  if (def.kind === 'strike') t.push('Global range');
  if (def.noAir) t.push('Ground only');
  return t;
}
