import { TOWERS, TIER_UNLOCK } from './data/towers';
import type { Quality } from './render/engine';
import { newProfile, sanitize, type PvpProfile } from './pvp/profile';

export interface SaveData {
  stars: Record<number, number>;
  loadout: string[];
  music: boolean;
  sfx: boolean;
  quality: Quality | 'auto';
  tutorial: boolean;
  seen: string[]; // tower ids the player has been shown as unlocked
  fails: Record<number, number>; // consecutive defeats per level → reinforcements
  pvp: PvpProfile;
}

const KEY = 'frendsTD.save.v1';
export const LOADOUT_SIZE = 6;
const DEFAULT_LOADOUT = ['gem_nano', 'cl_haiku', 'cx_autocomplete', 'gk_spark', 'cl_sonnet', 'cx_linter'];

function defaults(): SaveData {
  return { stars: {}, loadout: [...DEFAULT_LOADOUT], music: true, sfx: true, quality: 'auto', tutorial: false, seen: [], fails: {}, pvp: newProfile(Date.now()) };
}

export class Save {
  data: SaveData = defaults();

  constructor() { this.load(); }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...defaults(), ...JSON.parse(raw) };
    } catch { /* storage unavailable: play without persistence */ }
    this.data.pvp = sanitize(this.data.pvp ?? newProfile(Date.now()), Date.now());
    this.data.loadout = this.data.loadout.filter((id) => this.isUnlocked(id)).slice(0, LOADOUT_SIZE);
    if (!this.data.loadout.length) this.data.loadout = [...DEFAULT_LOADOUT];
  }

  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  reset() { this.data = { ...defaults(), music: this.data.music, sfx: this.data.sfx, quality: this.data.quality }; this.write(); }

  /** Tokens paid for a campaign result: 40 per newly earned star, 10 for a replayed win. */
  campaignTokens(levelId: number, stars: number) {
    const gained = Math.max(0, stars - (this.data.stars[levelId] ?? 0));
    return gained > 0 ? gained * 40 : stars > 0 ? 10 : 0;
  }

  /** Bonus starting tokens (fraction) earned by losing a level: +15% per defeat, up to +60%. */
  reinforcement(levelId: number) { return Math.min(4, this.data.fails[levelId] ?? 0) * 0.15; }

  totalStars() { return Object.values(this.data.stars).reduce((a, b) => a + b, 0); }

  isUnlocked(id: string) {
    const t = TOWERS.find((x) => x.id === id);
    return !!t && TIER_UNLOCK[t.tier - 1] <= this.totalStars();
  }

  /** Record a level result; returns tower ids newly unlocked by the stars gained. */
  complete(levelId: number, stars: number): string[] {
    const before = this.totalStars();
    this.data.pvp.tokens += this.campaignTokens(levelId, stars);
    if (stars > (this.data.stars[levelId] ?? 0)) this.data.stars[levelId] = stars;
    delete this.data.fails[levelId];
    const after = this.totalStars();
    this.write();
    return TOWERS.filter((t) => TIER_UNLOCK[t.tier - 1] > before && TIER_UNLOCK[t.tier - 1] <= after).map((t) => t.id);
  }
}
