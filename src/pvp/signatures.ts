/**
 * Signature units: the top three of each family (see roster.ts) get a special capability and a talent
 * tree. Talents unlock at card levels 9, 11, 13 and 15; at each one you pick one of two. A choice is
 * free the first time and costs Resets to change.
 *
 * Everything a talent does is expressed as modifiers (UnitMods) so the match engine applies them all
 * the same way; `flags` switch on the few behaviours that need their own code.
 */

export interface UnitMods {
  dmg?: number; // +fraction
  rate?: number; // +fraction
  targets?: number; // +n
  chain?: number; // +jumps
  chainKeep?: number; // set falloff
  splash?: number; // +radius
  slow?: [number, number]; // +pct, +seconds
  stun?: number; // +seconds
  crit?: number; // +chance
  critMult?: number; // +multiplier
  rampSpeed?: number; // +fraction (reaches max ramp sooner)
  burst?: number; // +shots
  railWidth?: number; // +fraction
  dot?: [number, number]; // +fraction of damage per second, +seconds
  drones?: number; // +n
  buffDmg?: number; buffRate?: number; buffRange?: number; buffCrit?: number; // support auras, +absolute
  radius?: number; // +fraction for area units (nova / aura / support)
  pull?: number; // +fraction
  abilityCd?: number; // -fraction (0.25 = 25% faster)
  abilityPower?: number; // +fraction
  abilityRadius?: number; // +fraction
  flags?: string[];
}

export interface Talent { id: string; name: string; desc: string; mods: UnitMods }

export interface Ability {
  name: string;
  /** Human-readable, given the ability's current power multiplier. */
  text: (p: number) => string;
  /** Base cooldown in seconds (0 = passive / triggered). */
  cd: number;
}

export interface Signature { unit: string; ability: Ability; talents: [Talent, Talent][] }

export const TALENT_LEVELS = [9, 11, 13, 15];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const T = (id: string, name: string, desc: string, mods: UnitMods): Talent => ({ id, name, desc, mods });

export const SIGNATURES: Signature[] = [
  // ---------------------------------------------------------------- Gemini
  {
    unit: 'gem_ultra',
    ability: { name: 'Prism Burst', cd: 4, text: (p) => `Every 4s, each beam target bursts with light, dealing ${pct(1.5 * p)} of Ultra's damage to enemies around it.` },
    talents: [
      [T('ul1a', 'Wide Spectrum', '+1 beam target.', { targets: 1 }), T('ul1b', 'Focused Light', '+25% damage.', { dmg: 0.25 })],
      [T('ul2a', 'Rapid Refraction', 'Prism Burst 25% more often.', { abilityCd: 0.25 }), T('ul2b', 'Chromatic Slow', 'Bursts slow enemies by 30% for 2s.', { flags: ['burstSlow'] })],
      [T('ul3a', 'Hot Prism', 'Beams reach full power 40% sooner.', { rampSpeed: 0.4 }), T('ul3b', 'Big Bang', 'Burst radius +50%.', { abilityRadius: 0.5 })],
      [T('ul4a', 'Spectral Overload', 'Bursts deal +80% damage.', { abilityPower: 0.8 }), T('ul4b', 'Afterglow', 'Bursts leave enemies burning for 3s.', { flags: ['burstBurn'] })],
    ],
  },
  {
    unit: 'gem_deepthink',
    ability: { name: 'Chain of Thought', cd: 0, text: (p) => `Every enemy a rail passes through is marked for 4s and takes +${pct(0.12 * p)} damage from all your units.` },
    talents: [
      [T('dt1a', 'Long Context', 'Rail width +50%.', { railWidth: 0.5 }), T('dt1b', 'Deep Focus', '+25% damage.', { dmg: 0.25 })],
      [T('dt2a', 'Strong Prior', 'Marks add a further +8% damage taken.', { abilityPower: 0.66 }), T('dt2b', 'Memory', 'Marks last 3s longer.', { flags: ['longMark'] })],
      [T('dt3a', 'Think Faster', '+20% attack speed.', { rate: 0.2 }), T('dt3b', 'Insight', '25% chance to crit for ×2.5.', { crit: 0.25, critMult: 1.5 })],
      [T('dt4a', 'Epiphany', 'Every 4th rail deals triple damage.', { flags: ['epiphany'] }), T('dt4b', 'Contagion', 'Marked enemies that die mark everything near them.', { flags: ['contagion'] })],
    ],
  },
  {
    unit: 'gem_twinsuns',
    ability: { name: 'Solar Flare', cd: 0, text: (p) => `Enemies that die while burning explode, dealing ${pct(0.8 * p)} of Twin Suns' damage around them and setting the blast area on fire.` },
    talents: [
      [T('ts1a', 'Third Body', '+1 sun beam.', { targets: 1 }), T('ts1b', 'Fusion', '+25% damage.', { dmg: 0.25 })],
      [T('ts2a', 'Coronal Mass', 'Flare radius +40%.', { abilityRadius: 0.4 }), T('ts2b', 'Hotter Core', 'Burn damage +50%.', { dot: [0.5, 0] })],
      [T('ts3a', 'Corona', 'Beams slow enemies by 20%.', { slow: [0.2, 0.5] }), T('ts3b', 'Ignition', 'Beams reach full power 40% sooner.', { rampSpeed: 0.4 })],
      [T('ts4a', 'Chain Fusion', 'Flares deal double damage.', { abilityPower: 1 }), T('ts4b', 'Eclipse', 'Every 10s, both suns deal triple damage for 2s.', { flags: ['eclipse'] })],
    ],
  },
  // ---------------------------------------------------------------- Claude
  {
    unit: 'cl_computer',
    ability: { name: 'Automation', cd: 0, text: (p) => `Every 5th click is a triple-click: it also hits the two strongest other enemies for ${pct(p)} damage and stuns them.` },
    talents: [
      [T('cu1a', 'Macro', '+25% damage.', { dmg: 0.25 }), T('cu1b', 'Hotkeys', '+20% attack speed.', { rate: 0.2 })],
      [T('cu2a', 'Batch Job', 'Triple-click every 4th click.', { flags: ['click4'] }), T('cu2b', 'Drag & Drop', 'Triple-clicks hit 4 extra enemies.', { flags: ['click5'] })],
      [T('cu3a', 'Freeze Frame', 'Stuns last 0.4s longer.', { stun: 0.4 }), T('cu3b', 'Precise', '25% chance to crit for ×2.5.', { crit: 0.25, critMult: 0.5 })],
      [T('cu4a', 'Screenshot', 'Clicked enemies take +15% damage for 3s.', { flags: ['screenshot'] }), T('cu4b', 'Admin Rights', 'Clicks ignore armor and shred shields.', { flags: ['admin'] })],
    ],
  },
  {
    unit: 'cl_code',
    ability: { name: 'Agentic Merge', cd: 0, text: (p) => `When a merge produces Claude Code, ${pct(Math.min(0.6, 0.25 * p))} chance it comes out one rank higher.` },
    talents: [
      [T('cc1a', 'Long Horizon', '+2 chain jumps.', { chain: 2 }), T('cc1b', 'Sharper Output', '+25% damage.', { dmg: 0.25 })],
      [T('cc2a', 'Autonomy', 'Agentic Merge chance +15%.', { abilityPower: 0.6 }), T('cc2b', 'No Regressions', 'Chain keeps 95% damage per jump.', { chainKeep: 0.95 })],
      [T('cc3a', 'Interrupt', 'Bolts stun for 0.3s.', { stun: 0.3 }), T('cc3b', 'Fast Iteration', '+20% attack speed.', { rate: 0.2 })],
      [T('cc4a', 'Parallel Agents', 'Attacks 90% faster.', { flags: ['doubleChain'] }), T('cc4b', 'Self-Improve', '+6% damage for each Claude Code on your board.', { flags: ['selfImprove'] })],
    ],
  },
  {
    unit: 'cl_fable',
    ability: { name: 'Happily Ever After', cd: 0, text: (p) => `Every enemy Fable defeats gives +${Math.round(1 * p)} compute on top of the usual reward.` },
    talents: [
      [T('fb1a', 'Subplot', '+1 story thread.', { targets: 1 }), T('fb1b', 'Climax', '+25% damage.', { dmg: 0.25 })],
      [T('fb2a', 'Moral of the Story', '+1 more compute per kill.', { flags: ['morePerKill'] }), T('fb2b', 'Inspiring', 'Aura gives +10% more damage.', { buffDmg: 0.1 })],
      [T('fb3a', 'Plot Twist', '15% of kills pay double.', { flags: ['plotTwist'] }), T('fb3b', 'Page Turner', '+20% attack speed.', { rate: 0.2 })],
      [T('fb4a', 'Epilogue', 'Merging Fable refunds 25% of your next summon.', { flags: ['epilogue'] }), T('fb4b', 'Legend', 'Aura also gives +10% crit chance.', { buffCrit: 0.1 })],
    ],
  },
  // ---------------------------------------------------------------- Codex
  {
    unit: 'cx_refactor',
    ability: { name: 'Clean Code', cd: 0, text: (p) => `Every 5th rail sweeps the whole lane, hitting every enemy for ${pct(0.5 * p)} damage.` },
    talents: [
      [T('rf1a', 'Wide Diff', 'Rail width +50%.', { railWidth: 0.5 }), T('rf1b', 'Tight Loop', '+25% damage.', { dmg: 0.25 })],
      [T('rf2a', 'Continuous Refactor', 'Sweep every 4th rail.', { flags: ['sweep4'] }), T('rf2b', 'Full Rewrite', 'Sweeps deal +100% damage.', { abilityPower: 1 })],
      [T('rf3a', 'Hot Path', '+20% attack speed.', { rate: 0.2 }), T('rf3b', 'Lint Pass', 'Rails slow by 25% for 1.5s.', { slow: [0.25, 1.5] })],
      [T('rf4a', 'Zero Bugs', '20% chance to crit for ×3.', { crit: 0.2, critMult: 2 }), T('rf4b', 'Tech Debt', 'Swept enemies take +15% damage for 3s.', { flags: ['techDebt'] })],
    ],
  },
  {
    unit: 'cx_swarm',
    ability: { name: 'Parallelize', cd: 6, text: (p) => `Every 6s, drones fire ${pct(2 * p)} faster for 2s. Higher ranks launch more drones.` },
    talents: [
      [T('sw1a', 'Scale Out', '+1 drone.', { drones: 1 }), T('sw1b', 'Better Weights', '+25% damage.', { dmg: 0.25 })],
      [T('sw2a', 'Autoscale', 'Parallelize 25% more often.', { abilityCd: 0.25 }), T('sw2b', 'Long Job', 'Parallelize lasts 1.5s longer.', { flags: ['longParallel'] })],
      [T('sw3a', 'Cluster Bombs', 'Drone shots splash.', { splash: 0.6 }), T('sw3b', 'Low Latency', '+20% attack speed.', { rate: 0.2 })],
      [T('sw4a', 'Swarm Intelligence', '+8% damage per other Agent Swarm on your board.', { flags: ['swarmIntel'] }), T('sw4b', 'Hive', 'Drone shots slow by 20%.', { slow: [0.2, 1] })],
    ],
  },
  {
    unit: 'cx_max',
    ability: { name: 'Ship It', cd: 8, text: (p) => `Every 8s, launches a bonus barrage at ${pct(p)} power.` },
    talents: [
      [T('mx1a', 'Monorepo', '+2 missiles per barrage.', { burst: 2 }), T('mx1b', 'Optimized Build', '+25% damage.', { dmg: 0.25 })],
      [T('mx2a', 'Continuous Delivery', 'Ship It 25% more often.', { abilityCd: 0.25 }), T('mx2b', 'Blast Radius', 'Explosions +40% larger.', { splash: 0.5 })],
      [T('mx3a', 'Incendiary', 'Missiles leave a 3s burn.', { dot: [0.25, 3] }), T('mx3b', 'Fast CI', '+20% attack speed.', { rate: 0.2 })],
      [T('mx4a', 'Hotfix', 'Barrages target the strongest enemy.', { flags: ['hotfix'] }), T('mx4b', 'Release Train', 'Ship It fires twice.', { flags: ['releaseTrain'] })],
    ],
  },
  // ---------------------------------------------------------------- Grok
  {
    unit: 'gk_heavy',
    ability: { name: 'Overkill', cd: 0, text: (p) => `Rails instantly delete any non-boss enemy left below ${pct(Math.min(0.35, 0.12 * p))} health.` },
    talents: [
      [T('gh1a', 'Heavier', '+25% damage.', { dmg: 0.25 }), T('gh1b', 'Scope', '+15% crit chance.', { crit: 0.15 })],
      [T('gh2a', 'Ruthless', 'Execute threshold +6%.', { abilityPower: 0.5 }), T('gh2b', 'Hollow Point', 'Crits deal ×3.5.', { critMult: 1 })],
      [T('gh3a', 'Autoloader', '+20% attack speed.', { rate: 0.2 }), T('gh3b', 'Wide Bore', 'Rail width +50%.', { railWidth: 0.5 })],
      [T('gh4a', 'Unhinged', 'Every 3rd rail deals triple damage.', { flags: ['every3'] }), T('gh4b', 'Bounty Hunter', 'Executions give +5 compute.', { flags: ['bounty'] })],
    ],
  },
  {
    unit: 'gk_blackhole',
    ability: { name: 'Spaghettify', cd: 0, text: (p) => `Each pulse also tears ${pct(0.01 * p)} of max health from every non-boss it pulls.` },
    talents: [
      [T('eh1a', 'Wider Horizon', 'Pulse radius +25%.', { radius: 0.25 }), T('eh1b', 'Dense Core', '+25% damage.', { dmg: 0.25 })],
      [T('eh2a', 'Tidal Force', 'Pull 40% stronger.', { pull: 0.4 }), T('eh2b', 'Time Dilation', 'Slow lasts 1s longer.', { slow: [0, 1] })],
      [T('eh3a', 'Accretion', 'Pulses 25% faster.', { rate: 0.25 }), T('eh3b', 'Event', 'Pulled enemies are stunned for 0.5s.', { stun: 0.5 })],
      [T('eh4a', 'Singularity', 'Max-health damage doubled.', { abilityPower: 1 }), T('eh4b', 'No Escape', 'Pulls bosses at full strength.', { flags: ['pullBoss'] })],
    ],
  },
  {
    unit: 'gk_supernova',
    ability: { name: 'Cascade', cd: 0, text: (p) => `Every 5th strike becomes a Super Strike that hits every enemy in your lane for ${pct(1.5 * p)} damage.` },
    talents: [
      [T('sn1a', 'Forked', '+1 fork.', { chain: 1 }), T('sn1b', 'Brighter', '+25% damage.', { dmg: 0.25 })],
      [T('sn2a', 'Unstable', 'Super Strike every 4th strike.', { flags: ['cascade4'] }), T('sn2b', 'Hypernova', 'Super Strikes deal +75% damage.', { abilityPower: 0.75 })],
      [T('sn3a', 'Storm Front', '+20% attack speed.', { rate: 0.2 }), T('sn3b', 'Static', 'Strikes stun for 0.3s.', { stun: 0.3 })],
      [T('sn4a', 'Wide Arc', 'Strike radius +50%.', { splash: 0.6 }), T('sn4b', 'Ionized', 'Struck enemies take +10% damage for 3s.', { flags: ['ionized'] })],
    ],
  },
];

export const SIGNATURE_BY_ID: Record<string, Signature> = Object.fromEntries(SIGNATURES.map((s) => [s.unit, s]));
export const isSignatureId = (id: string) => !!SIGNATURE_BY_ID[id];

/** Ability strength at a card level: +6% per level above the rarity's starting level. */
export const abilityPower = (level: number, startLevel: number) => 1 + 0.06 * Math.max(0, level - startLevel);

/** Combine the chosen talents (one index per unlocked tier) into one set of modifiers. */
export function talentMods(unit: string, picks: number[], level: number): UnitMods {
  const sig = SIGNATURE_BY_ID[unit];
  const out: UnitMods = { flags: [] };
  if (!sig) return out;
  sig.talents.forEach((pair, tier) => {
    const pick = picks[tier];
    if (level < TALENT_LEVELS[tier] || (pick !== 0 && pick !== 1)) return;
    const m = pair[pick].mods;
    for (const [k, v] of Object.entries(m) as [keyof UnitMods, unknown][]) {
      if (k === 'flags') out.flags!.push(...(v as string[]));
      else if (Array.isArray(v)) { const cur = (out[k] as [number, number] | undefined) ?? [0, 0]; (out as Record<string, unknown>)[k] = [cur[0] + v[0], cur[1] + v[1]]; }
      else if (k === 'chainKeep') out.chainKeep = v as number;
      else (out as Record<string, number>)[k] = ((out as Record<string, number>)[k] ?? 0) + (v as number);
    }
  });
  return out;
}
