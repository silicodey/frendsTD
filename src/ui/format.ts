/** Damage as players read it: 437, 1.2K (nearest hundred), 12K (nearest thousand), 3.4M. */
export function fmtDamage(v: number): string {
  if (v < 1000) return String(Math.round(v));
  if (v < 1e4) return `${(Math.round(v / 100) / 10).toFixed(1)}K`;
  if (v < 1e6) return `${Math.round(v / 1000)}K`;
  if (v < 1e7) return `${(Math.round(v / 1e5) / 10).toFixed(1)}M`;
  return `${Math.round(v / 1e6)}M`;
}
