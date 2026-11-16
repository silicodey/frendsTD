import { TOWER_BY_ID, dutyOf } from '../data/towers';
import { PVP_UNITS } from './roster';
import { SIGNATURE_BY_ID, TALENT_LEVELS, type Talent, type UnitMods } from './signatures';

/**
 * Specialities: what a unit learns at its Breakthroughs (card levels 6, 8 and 10). Each Breakthrough
 * opens a row of two; you pick one (free the first time, a Reset to change).
 *
 *   Damage units   L6  a core pair (signature units keep their signature row)
 *                  L8  Keen Edge (crit) or Overclock (raw damage): equal value on an average account; crit
 *                      pulls ahead in crit-built decks (Monolith, crit perks, high account crit damage)
 *                  L10 a capstone pair
 *   Support units  aura upgrades, Ward (shield charges for neighbours) and disruption-proof auras
 *
 * Resilience options (firewall, hardened, anchored, stable, ward…) counter monster and boss disruptions.
 */
export const SPECIALITY_LEVELS = TALENT_LEVELS;

const S = (id: string, name: string, desc: string, mods: UnitMods): Talent => ({ id, name, desc, mods });

// shared options
const KEEN = (u: string) => S(`${u}-keen`, 'Keen Edge', '+14% crit chance and +50% crit damage.', { crit: 0.14, critMult: 0.5 });
const OVERCLOCK = (u: string) => S(`${u}-over`, 'Overclock', '+18% damage.', { dmg: 0.18 });
const FIREWALL = (u: string) => S(`${u}-fw`, 'Firewall', 'Ignores the first disruption each wave.', { flags: ['firewall'] });
const HARDENED = (u: string) => S(`${u}-hd`, 'Hardened', 'Jams on this unit last half as long.', { flags: ['hardened'] });
const ANCHORED = (u: string) => S(`${u}-an`, 'Anchored', 'Immune to rank drain.', { flags: ['anchored'] });
const STABLE = (u: string) => S(`${u}-st`, 'Stable', 'Immune to Mutate and paperclipping.', { flags: ['stable'] });
const WARD = (u: string) => S(`${u}-ward`, 'Ward', 'Adjacent units gain a Shield charge every 12s (blocks one disruption).', { flags: ['ward'] });
const SANCTUARY = (u: string, name = 'Sanctuary') => S(`${u}-sanct`, name, 'Adjacent units ignore the first disruption each wave.', { flags: ['wardAura'] });

type Pair = [Talent, Talent];
const OWN: Record<string, Pair[]> = {
  // ---------------------------------------------------------------- London
  gem_flash: [
    [S('fl6a', 'Prism Lens', '+1 beam target.', { targets: 1 }), FIREWALL('fl')],
    [KEEN('fl'), OVERCLOCK('fl')],
    [S('fl10a', 'Solar Focus', 'Beams reach full power 40% sooner.', { rampSpeed: 0.4 }), S('fl10b', 'Dazzle', 'Beams slow enemies by 15%.', { slow: [0.15, 0.5] })],
  ],
  gem_banana: [
    [S('pb6a', 'Full Bloom', 'Splash radius +50%.', { splash: 0.5 }), HARDENED('pb')],
    [KEEN('pb'), OVERCLOCK('pb')],
    [S('pb10a', 'Sticky Light', 'Slow +15% and lasts 0.5s longer.', { slow: [0.15, 0.5] }), S('pb10b', 'Burning Petals', 'Shells leave a 3s burn.', { dot: [0.25, 3] })],
  ],
  gem_veo: [
    [S('ha6a', 'Wider Halo', 'Field radius +25%.', { radius: 0.25 }), S('ha6b', 'Deep Freeze', 'Slow +15%.', { slow: [0.15, 0] })],
    [WARD('ha'), S('ha8b', 'Searing', 'Field damage +50%.', { dmg: 0.5 })],
    [SANCTUARY('ha'), S('ha10b', 'Exposure', 'Enemies in the field take +10% damage.', { flags: ['auraVuln'] })],
  ],
  // ---------------------------------------------------------------- California
  cl_sonnet: [
    [S('ba6a', 'Refrain', '+1 target.', { targets: 1 }), ANCHORED('ba')],
    [KEEN('ba'), OVERCLOCK('ba')],
    [S('ba10a', 'Crescendo', '+25% attack speed.', { rate: 0.25 }), S('ba10b', 'Chorus', 'Splash radius +50%.', { splash: 0.5 })],
  ],
  cl_thinking: [
    [S('rv6a', 'Deep Focus', 'Beam reaches full power 40% sooner.', { rampSpeed: 0.4 }), FIREWALL('rv')],
    [KEEN('rv'), OVERCLOCK('rv')],
    [S('rv10a', 'Second Thought', '+1 beam target.', { targets: 1 }), S('rv10b', 'Lucid', 'Ignores armor and shreds shields.', { flags: ['admin'] })],
  ],
  cl_mcp: [
    [S('nx6a', 'Bandwidth', 'Aura gives +10% more attack speed.', { buffRate: 0.1 }), S('nx6b', 'Mesh', 'Aura radius +25%.', { radius: 0.25 })],
    [WARD('nx'), S('nx8b', 'Uplink', 'Aura also gives +10% damage.', { buffDmg: 0.1 })],
    [SANCTUARY('nx', 'Failover'), S('nx10b', 'Sync', 'Aura also gives +10% crit chance.', { buffCrit: 0.1 })],
  ],
  // ---------------------------------------------------------------- Prishtina
  cx_mini: [
    [S('sc6a', 'Payload', 'Splash radius +50%.', { splash: 0.5 }), STABLE('sc')],
    [KEEN('sc'), OVERCLOCK('sc')],
    [S('sc10a', 'Cluster', '+1 shell per salvo.', { burst: 1 }), S('sc10b', 'Napalm', 'Shells leave a 3s burn.', { dot: [0.3, 3] })],
  ],
  cx_debugger: [
    [S('db6a', 'Stack Trace', '+20% damage.', { dmg: 0.2 }), HARDENED('db')],
    [KEEN('db'), OVERCLOCK('db')],
    [S('db10a', 'Core Dump', 'Shots stun for 0.4s.', { stun: 0.4 }), S('db10b', 'Hot Reload', '+25% attack speed.', { rate: 0.25 })],
  ],
  cx_sandbox: [
    [S('sb6a', 'Bigger Box', 'Lockdown radius +25%.', { radius: 0.25 }), S('sb6b', 'Long Lock', 'Stuns last 0.3s longer.', { stun: 0.3 })],
    [WARD('sb'), S('sb8b', 'Containment', 'Pulses 25% faster.', { rate: 0.25 })],
    [SANCTUARY('sb', 'Isolation'), S('sb10b', 'Quarantine', 'Locked-down enemies take +10% damage.', { flags: ['auraVuln'] })],
  ],
  // ---------------------------------------------------------------- Tokyo
  gk_tesla: [
    [S('ac6a', 'Extra Arc', '+2 chain jumps.', { chain: 2 }), ANCHORED('ac')],
    [KEEN('ac'), OVERCLOCK('ac')],
    [S('ac10a', 'Overcharge', 'Arcs stun for 0.25s.', { stun: 0.25 }), S('ac10b', 'Superconductor', 'Chain keeps 95% damage per jump.', { chainKeep: 0.95 })],
  ],
  gk_unhinged: [
    [S('fr6a', 'More Chaos', '+1 target.', { targets: 1 }), STABLE('fr')],
    [KEEN('fr'), OVERCLOCK('fr')],
    [S('fr10a', 'Rapid Fire', '+25% attack speed.', { rate: 0.25 }), S('fr10b', 'Spray', 'Shots splash.', { splash: 0.4 })],
  ],
  gk_colossus: [
    [S('mo6a', 'Gravity', 'Aura gives +5% more crit chance.', { buffCrit: 0.05 }), S('mo6b', 'Wide Base', 'Aura radius +25%.', { radius: 0.25 })],
    [WARD('mo'), S('mo8b', 'Resonance', 'Aura also gives +10% damage.', { buffDmg: 0.1 })],
    [SANCTUARY('mo', 'Bulwark'), S('mo10b', 'Singular', 'Aura gives +8% more crit chance.', { buffCrit: 0.08 })],
  ],
};

/** Signature units: their signature row at L6, crit-or-damage (or Ward for supports) at L8, their capstones at L10. */
function fromSignature(id: string): Pair[] {
  const t = SIGNATURE_BY_ID[id].talents;
  const mid: Pair = dutyOf(TOWER_BY_ID[id]) === 'support' ? [WARD(id), t[1][0]] : [KEEN(id), OVERCLOCK(id)];
  return [t[0], mid, t[3]];
}

export const SPECIALITIES: Record<string, Pair[]> = Object.fromEntries(
  PVP_UNITS.map((u) => [u.id, SIGNATURE_BY_ID[u.id] ? fromSignature(u.id) : OWN[u.id]]).filter(([, v]) => v),
);
export const hasSpecialities = (id: string) => !!SPECIALITIES[id];

/** Combine the chosen specialities (one pick per unlocked row) into one set of modifiers. */
export function specialityMods(unit: string, picks: number[], level: number): UnitMods {
  const rows = SPECIALITIES[unit];
  const out: UnitMods = { flags: [] };
  if (!rows) return out;
  rows.forEach((pair, tier) => {
    const pick = picks[tier];
    if (level < SPECIALITY_LEVELS[tier] || (pick !== 0 && pick !== 1)) return;
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

/** The chosen speciality names for a card (for HUD and info screens). */
export function chosenSpecialities(unit: string, picks: number[], level: number): Talent[] {
  const rows = SPECIALITIES[unit] ?? [];
  return rows.map((pair, tier) => (level >= SPECIALITY_LEVELS[tier] && (picks[tier] === 0 || picks[tier] === 1) ? pair[picks[tier]] : null)).filter((x): x is Talent => !!x);
}
