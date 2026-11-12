export type Family = 'gemini' | 'claude' | 'codex' | 'grok';

export type TowerKind =
  | 'bullet' // homing projectile(s)
  | 'beam' // continuous ramping beam
  | 'lob' // arcing explosive shell (ground only unless stated)
  | 'chain' // instant arc lightning that jumps
  | 'sniper' // instant long-range hit
  | 'rail' // piercing line shot
  | 'nova' // pulse around the tower
  | 'aura' // persistent field (slow / damage / vulnerability)
  | 'support' // buffs nearby towers
  | 'income' // generates tokens
  | 'drone' // autonomous orbiting drones
  | 'strike'; // sky strike at target location (global)

export interface TowerDef {
  id: string;
  family: Family;
  tier: number; // 1..12
  name: string;
  role: string;
  desc: string;
  cost: number;
  kind: TowerKind;
  dmg: number;
  rate: number; // attacks per second
  range: number; // tiles
  targets?: number;
  burst?: number;
  splash?: number;
  slow?: [number, number]; // pct, duration
  dot?: [number, number]; // dps, duration
  stun?: number;
  crit?: [number, number]; // chance, mult
  ramp?: [number, number]; // max mult, seconds to max
  spinup?: [number, number]; // rate mult, seconds to max
  shred?: number;
  pierce?: number; // 0..1 fraction of armor ignored
  shieldMult?: number;
  noAir?: boolean;
  chain?: [number, number, number]; // jumps, falloff, jump range
  vuln?: number;
  pull?: number;
  buff?: { dmg?: number; rate?: number; range?: number; crit?: number };
  income?: number;
  drones?: number;
  wild?: [number, number];
  projSpeed?: number;
  railWidth?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  desc: string;
  hp: number;
  speed: number;
  armor: number;
  shield?: number;
  bounty: number;
  leak: number; // lives lost on leak
  size: number; // visual + hit radius scale
  flying?: boolean;
  boss?: boolean;
  heal?: { range: number; pct: number; cd: number };
  split?: { into: string; n: number };
  phase?: { on: number; off: number };
  jam?: { range: number; dur: number; cd: number };
  spawn?: { type: string; n: number; cd: number };
  haste?: { range: number; pct: number };
  color: number;
}

export interface WaveGroup {
  type: string;
  count: number;
  gap: number; // seconds between spawns
  delay: number; // seconds after wave start
  path: number; // path index
  hpMult: number;
}

export interface Wave {
  groups: WaveGroup[];
  bonus: number;
  boss?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  sky: [number, number, number]; // top, horizon, nebula
  tile: number;
  tileAccent: number;
  path: number;
  pathGlow: number;
  fog: number;
  key: number; // key light color
  rim: number;
  prop: 'server' | 'crystal' | 'pylon';
}

export interface LevelDef {
  id: number; // 1-based
  name: string;
  blurb: string;
  world: number; // 0..2
  cols: number;
  rows: number;
  paths: [number, number][][]; // waypoint lists
  waves: number;
  startTokens: number;
  lives: number;
  hp: number; // enemy hp scalar
  threat: number; // wave size scalar
  pool: string[];
  boss?: string;
  seed: number;
}

export const FAMILY_INFO: Record<Family, { name: string; tagline: string; color: number; color2: number; css: string; css2: string }> = {
  gemini: { name: 'Gemini', tagline: 'Light & prisms — beams, multi-target, range', color: 0x4f8cff, color2: 0xb46bff, css: '#5b9bff', css2: '#b77bff' },
  claude: { name: 'Claude', tagline: 'Thought & care — support, control, precision', color: 0xff8a5c, color2: 0xffd3a8, css: '#ff8f63', css2: '#ffd9b0' },
  codex: { name: 'Codex', tagline: 'Code & automation — rapid fire, shells, drones', color: 0x2ee6a6, color2: 0x9dffd9, css: '#2fe8a8', css2: '#a8ffe0' },
  grok: { name: 'Grok', tagline: 'Chaos & lightning — burst, crits, mayhem', color: 0xff2d6f, color2: 0xffa0c0, css: '#ff3d7a', css2: '#ffb0cc' },
};

export const FAMILIES: Family[] = ['gemini', 'claude', 'codex', 'grok'];
