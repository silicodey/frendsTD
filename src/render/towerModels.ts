import * as THREE from 'three';
import type { Family, TowerDef } from '../data/types';
import { Builder, box, burst, cone, cyl, extrude, ico, oct, rbox, sph, tor, type Mat, type SpinPart, type V3 } from './builder';

const PI = Math.PI, P2 = PI / 2;

export interface TowerModel {
  base: THREE.BufferGeometry;
  head: THREE.BufferGeometry | null;
  parts: SpinPart[];
  headY: number;
  muzzle: V3; // head-local
  aims: boolean; // head yaws toward target
}

interface Kit { body: Mat; dark: Mat; accent: Mat; trim: Mat; glow: Mat; glow2: Mat }
export const KITS: Record<Family, Kit> = {
  gemini: {
    body: { c: 0xb9c6ea, m: 0.3, ro: 0.3 }, dark: { c: 0x18203a, m: 0.85, ro: 0.35 }, accent: { c: 0x4a62c8, m: 0.6, ro: 0.3 },
    trim: { c: 0xaebcdf, m: 1, ro: 0.2 }, glow: { c: 0x3d7dff, e: 3.2, ro: 0.4 }, glow2: { c: 0xa855ff, e: 3.2, ro: 0.4 },
  },
  claude: {
    body: { c: 0xd9c7ae, m: 0.05, ro: 0.5 }, dark: { c: 0x4a332a, m: 0.3, ro: 0.55 }, accent: { c: 0xc8623c, m: 0.1, ro: 0.45 },
    trim: { c: 0xd49a4a, m: 1, ro: 0.28 }, glow: { c: 0xff6a2a, e: 3.0 }, glow2: { c: 0xffb84a, e: 2.4 },
  },
  codex: {
    body: { c: 0x2c3944, m: 0.75, ro: 0.38 }, dark: { c: 0x0f1418, m: 0.8, ro: 0.45 }, accent: { c: 0xb4c2be, m: 0.2, ro: 0.35 },
    trim: { c: 0x8c99a6, m: 1, ro: 0.25 }, glow: { c: 0x14e08f, e: 2.6 }, glow2: { c: 0x7dffcf, e: 1.8 },
  },
  grok: {
    body: { c: 0x14151a, m: 0.9, ro: 0.24 }, dark: { c: 0x24262e, m: 0.8, ro: 0.35 }, accent: { c: 0xc4c4cc, m: 0.3, ro: 0.25 },
    trim: { c: 0xb8b8c4, m: 1, ro: 0.14 }, glow: { c: 0xff1f5a, e: 3.2 }, glow2: { c: 0xff8fb4, e: 2.4 },
  },
};

/** cylinder along +Z (top radius faces forward) */
const Z: V3 = [P2, 0, 0];
const flat = (m: Mat): Mat => ({ ...m, flat: true });

// ---------- family pedestals ----------
function pedestal(b: Builder, f: Family, grade: number): number {
  const K = KITS[f];
  b.at('base');
  let top = 0;
  if (f === 'gemini') {
    b.add(cyl(0.4, 0.44, 0.1, 6), { ...flat(K.dark), p: [0, 0.05, 0] });
    b.add(cyl(0.33, 0.38, 0.09, 6), { ...flat(K.body), p: [0, 0.145, 0] });
    b.add(tor(0.385, 0.014, 6, 6), { ...K.glow, p: [0, 0.103, 0], r: [P2, 0, PI / 6] });
    top = 0.19;
    if (grade >= 1) {
      b.add(cyl(0.24, 0.3, 0.09, 6), { ...flat(K.dark), p: [0, 0.235, 0] });
      b.add(tor(0.3, 0.012, 6, 6), { ...K.glow2, p: [0, 0.195, 0], r: [P2, 0, PI / 6] });
      b.ring(3, 0.34, () => oct(0.055), { ...flat(K.glow), p: [0, 0.25, 0], s: [0.7, 1.5, 0.7] }, PI / 6);
      top = 0.28;
    }
    if (grade >= 2) {
      b.ring(3, 0.34, () => oct(0.055), { ...flat(K.glow2), p: [0, 0.25, 0], s: [0.7, 1.5, 0.7] }, PI / 6 + PI / 3);
      b.add(cyl(0.16, 0.22, 0.1, 6), { ...flat(K.body), p: [0, 0.33, 0] });
      b.add(tor(0.23, 0.012, 6, 6), { ...K.trim, p: [0, 0.285, 0], r: [P2, 0, PI / 6] });
      top = 0.38;
      b.spin('halo', 'base', [0, 0.16, 0], [0, 0.5, 0]);
      b.add(tor(0.47, 0.01, 6, 48), { ...K.trim, p: [0, 0.16, 0], r: [P2, 0, 0] });
      b.ring(6, 0.47, () => oct(0.03), { ...flat(K.glow), p: [0, 0.16, 0] });
    }
    b.at('base');
    b.add(cyl(0.07, 0.1, 0.16, 6), { ...flat(K.trim), p: [0, top + 0.08, 0] });
    return top + 0.2;
  }
  if (f === 'claude') {
    b.add(cyl(0.42, 0.44, 0.06, 28), { ...K.dark, p: [0, 0.03, 0] });
    b.add(cyl(0.3, 0.4, 0.12, 28), { ...K.body, p: [0, 0.12, 0] });
    b.add(tor(0.405, 0.022, 8, 32), { ...K.accent, p: [0, 0.065, 0], r: [P2, 0, 0] });
    top = 0.18;
    if (grade >= 1) {
      b.ring(8, 0.35, () => sph(0.07, 10, 8), { ...K.accent, p: [0, 0.17, 0], s: [0.7, 0.45, 1.25] });
      b.add(cyl(0.2, 0.3, 0.1, 24), { ...K.body, p: [0, 0.23, 0] });
      b.add(tor(0.3, 0.014, 8, 32), { ...K.trim, p: [0, 0.185, 0], r: [P2, 0, 0] });
      top = 0.28;
    }
    if (grade >= 2) {
      b.ring(8, 0.26, () => sph(0.055, 10, 8), { ...K.trim, p: [0, 0.27, 0], s: [0.7, 0.45, 1.25] }, PI / 8);
      b.add(cyl(0.14, 0.2, 0.1, 24), { ...K.body, p: [0, 0.33, 0] });
      b.add(tor(0.205, 0.012, 8, 32), { ...K.glow2, p: [0, 0.285, 0], r: [P2, 0, 0] });
      top = 0.38;
      b.spin('halo', 'base', [0, 0.14, 0], [0, -0.4, 0]);
      b.add(tor(0.48, 0.012, 8, 48), { ...K.trim, p: [0, 0.14, 0], r: [P2, 0, 0] });
      b.ring(4, 0.48, () => sph(0.035, 8, 6), { ...K.glow, p: [0, 0.14, 0] });
    }
    b.at('base');
    b.add(cyl(0.06, 0.1, 0.16, 16), { ...K.accent, p: [0, top + 0.08, 0] });
    return top + 0.2;
  }
  if (f === 'codex') {
    b.add(rbox(0.86, 0.1, 0.86, 0.03), { ...K.dark, p: [0, 0.05, 0] });
    b.add(rbox(0.7, 0.1, 0.7, 0.03), { ...K.body, p: [0, 0.14, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2;
      b.add(box(0.5, 0.016, 0.02), { ...K.glow, p: [Math.sin(a) * 0.355, 0.14, Math.cos(a) * 0.355], r: [0, a, 0] });
    }
    top = 0.19;
    if (grade >= 1) {
      b.add(rbox(0.52, 0.09, 0.52, 0.03), { ...K.dark, p: [0, 0.235, 0] });
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i * PI) / 2;
        b.add(box(0.07, 0.2, 0.07), { ...K.body, p: [Math.sin(a) * 0.5, 0.2, Math.cos(a) * 0.5] });
        b.add(box(0.03, 0.02, 0.03), { ...K.glow, p: [Math.sin(a) * 0.5, 0.31, Math.cos(a) * 0.5] });
      }
      top = 0.28;
    }
    if (grade >= 2) {
      b.add(rbox(0.38, 0.1, 0.38, 0.03), { ...K.body, p: [0, 0.33, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i * PI) / 2;
        b.add(box(0.3, 0.016, 0.02), { ...K.glow2, p: [Math.sin(a) * 0.195, 0.33, Math.cos(a) * 0.195], r: [0, a, 0] });
      }
      top = 0.38;
      b.spin('halo', 'base', [0, 0.2, 0], [0, 0.45, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i * PI) / 2;
        // floating [ ] brackets
        b.add(box(0.26, 0.016, 0.016), { ...K.glow, p: [Math.sin(a) * 0.56, 0.2, Math.cos(a) * 0.56], r: [0, a, 0] });
        b.add(box(0.016, 0.016, 0.07), { ...K.glow, p: [Math.sin(a) * 0.53 + Math.cos(a) * 0.13, 0.2, Math.cos(a) * 0.53 - Math.sin(a) * 0.13], r: [0, a, 0] });
        b.add(box(0.016, 0.016, 0.07), { ...K.glow, p: [Math.sin(a) * 0.53 - Math.cos(a) * 0.13, 0.2, Math.cos(a) * 0.53 + Math.sin(a) * 0.13], r: [0, a, 0] });
      }
    }
    b.at('base');
    b.add(cyl(0.08, 0.1, 0.16, 8), { ...flat(K.trim), p: [0, top + 0.08, 0] });
    return top + 0.2;
  }
  // grok
  b.add(cyl(0.42, 0.45, 0.08, 8), { ...flat(K.body), p: [0, 0.04, 0], r: [0, PI / 8, 0] });
  b.add(cyl(0.3, 0.4, 0.1, 8), { ...flat(K.dark), p: [0, 0.13, 0], r: [0, PI / 8, 0] });
  b.add(tor(0.415, 0.012, 6, 8), { ...K.glow, p: [0, 0.085, 0], r: [P2, 0, PI / 8] });
  b.ring(4, 0.33, () => box(0.05, 0.16, 0.26), { ...K.body, p: [0, 0.13, 0], r: [-0.5, 0, 0] });
  top = 0.18;
  if (grade >= 1) {
    b.ring(4, 0.33, () => box(0.05, 0.16, 0.26), { ...K.trim, p: [0, 0.13, 0], r: [-0.5, 0, 0] }, PI / 4);
    b.add(cyl(0.2, 0.28, 0.1, 8), { ...flat(K.body), p: [0, 0.23, 0], r: [0, PI / 8, 0] });
    b.add(tor(0.29, 0.011, 6, 8), { ...K.trim, p: [0, 0.185, 0], r: [P2, 0, PI / 8] });
    top = 0.28;
  }
  if (grade >= 2) {
    b.ring(8, 0.4, () => cone(0.035, 0.22, 4), { ...K.trim, p: [0, 0.2, 0], r: [0.5, 0, 0] });
    b.add(cyl(0.14, 0.2, 0.1, 8), { ...flat(K.dark), p: [0, 0.33, 0], r: [0, PI / 8, 0] });
    b.add(tor(0.205, 0.012, 6, 8), { ...K.glow, p: [0, 0.285, 0], r: [P2, 0, PI / 8] });
    top = 0.38;
    b.spin('halo', 'base', [0, 0.2, 0], [0, 0.7, 0]);
    b.add(tor(0.5, 0.01, 6, 48), { ...K.glow, p: [0, 0.2, 0], r: [P2 + 0.16, 0, 0] });
  }
  b.at('base');
  b.add(cyl(0.06, 0.1, 0.16, 8), { ...flat(K.trim), p: [0, top + 0.08, 0] });
  return top + 0.2;
}

const ICO_DIRS: V3[] = (() => {
  const t = (1 + Math.sqrt(5)) / 2, o: V3[] = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) { o.push([0, s1, s2 * t], [s1, s2 * t, 0], [s2 * t, 0, s1]); }
  return o;
})();
const CUBE_DIRS: V3[] = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];

function openBook(b: Builder, K: Kit, w: number, d: number, y: number) {
  b.add(rbox(w, 0.035, d, 0.012), { ...K.body, p: [-w / 2 + 0.005, y + 0.045, 0], r: [0, 0, -0.32] });
  b.add(rbox(w, 0.035, d, 0.012), { ...K.body, p: [w / 2 - 0.005, y + 0.045, 0], r: [0, 0, 0.32] });
  b.add(box(0.035, 0.03, d), { ...K.accent, p: [0, y - 0.005, 0] });
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++)
    b.add(box(w * 0.62, 0.006, 0.022), { ...K.glow2, p: [sx * (w / 2), y + 0.072, -d * 0.26 + i * d * 0.26], r: [0, 0, sx * 0.32] });
}

// ---------- 48 heads ----------
function head(b: Builder, def: TowerDef, K: Kit): { muzzle: V3; aims: boolean; lift?: number } {
  const H = () => b.at('head');
  H();
  switch (def.id) {
    // ===== GEMINI =====
    case 'gem_nano':
      b.add(cyl(0.1, 0.14, 0.08, 6), { ...flat(K.body), p: [0, 0, 0] });
      b.spin('gem', 'head', [0, 0.26, 0], [0, 1.6, 0], 0.03);
      b.add(oct(0.15), { ...flat(K.glow), p: [0, 0.26, 0], s: [0.8, 1.3, 0.8] });
      b.add(tor(0.2, 0.01, 6, 24), { ...K.trim, p: [0, 0.26, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.26, 0], aims: false };
    case 'gem_flashlite':
      b.add(rbox(0.2, 0.14, 0.26, 0.03), { ...K.body });
      for (const x of [-0.09, 0.09]) b.add(box(0.04, 0.04, 0.36), { ...K.dark, p: [x, 0, 0.22] });
      b.add(oct(0.07), { ...flat(K.glow), p: [0, 0, 0.3] });
      b.add(box(0.2, 0.02, 0.03), { ...K.glow2, p: [0, 0.075, -0.05] });
      return { muzzle: [0, 0, 0.42], aims: true };
    case 'gem_flash':
      b.add(cyl(0.11, 0.13, 0.42, 14), { ...K.body, p: [0, 0, 0.08], r: Z });
      b.add(tor(0.115, 0.022, 8, 20), { ...K.trim, p: [0, 0, 0.28] });
      b.add(cyl(0.09, 0.09, 0.02, 16), { ...K.glow, p: [0, 0, 0.292], r: Z });
      b.add(oct(0.1), { ...flat(K.glow2), p: [0, 0, -0.2] });
      b.add(tor(0.13, 0.014, 6, 20), { ...K.dark, p: [0, 0, -0.06] });
      return { muzzle: [0, 0, 0.32], aims: true };
    case 'gem_twin':
      b.add(sph(0.11), { ...K.body });
      b.add(box(0.52, 0.05, 0.07), { ...K.dark, p: [0, 0.02, 0] });
      b.add(oct(0.13), { ...flat(K.glow), p: [-0.25, 0.17, 0], s: [0.7, 1.35, 0.7] });
      b.add(oct(0.13), { ...flat(K.glow2), p: [0.25, 0.17, 0], s: [0.7, 1.35, 0.7] });
      for (const x of [-0.25, 0.25]) b.add(cyl(0.05, 0.07, 0.06, 6), { ...flat(K.trim), p: [x, 0.04, 0] });
      return { muzzle: [0, 0.18, 0.05], aims: true };
    case 'gem_banana':
      b.add(cyl(0.17, 0.12, 0.1, 6), { ...flat(K.body) });
      b.add(tor(0.175, 0.012, 6, 6), { ...K.glow, p: [0, 0.05, 0], r: [P2, 0, PI / 6] });
      b.spin('nana', 'head', [0, 0.3, 0], [0, 0.9, 0], 0.025);
      b.add(tor(0.2, 0.062, 8, 18, PI * 0.72), { c: 0xffd92e, e: 0.35, ro: 0.42, m: 0, p: [0, 0.44, 0], r: [0, P2, PI * 1.14] });
      b.add(sph(0.035, 8, 6), { c: 0x5a3a12, ro: 0.7, p: [0, 0.405, 0.185] });
      b.add(sph(0.03, 8, 6), { c: 0x5a3a12, ro: 0.7, p: [0, 0.405, -0.185] });
      return { muzzle: [0, 0.3, 0], aims: false };
    case 'gem_pro':
      b.add(cyl(0.16, 0.16, 0.5, 3), { ...flat(K.body), p: [0, 0, 0.06], r: Z });
      b.add(oct(0.1), { ...flat(K.glow), p: [0, 0, 0.34] });
      for (const x of [-0.2, 0.2]) b.add(oct(0.07), { ...flat(K.glow2), p: [x, -0.02, -0.02], s: [0.7, 1.4, 0.7] });
      b.add(cyl(0.17, 0.17, 0.05, 3), { ...flat(K.dark), p: [0, 0, -0.16], r: Z });
      b.spin('ring', 'head', [0, 0, 0.12], [0, 0, 2.2]);
      b.add(tor(0.22, 0.014, 6, 28), { ...K.trim, p: [0, 0, 0.12] });
      b.add(oct(0.035), { ...flat(K.glow), p: [0.22, 0, 0.12] });
      b.add(oct(0.035), { ...flat(K.glow), p: [-0.22, 0, 0.12] });
      return { muzzle: [0, 0, 0.4], aims: true };
    case 'gem_vision':
      b.add(sph(0.2, 20, 14), { ...K.body });
      b.add(cyl(0.125, 0.125, 0.03, 20), { ...K.accent, p: [0, 0, 0.175], r: Z });
      b.add(sph(0.062, 12, 10), { ...K.glow, p: [0, 0, 0.195] });
      b.add(tor(0.26, 0.018, 8, 32), { ...K.trim, r: [0, P2, 0] });
      b.add(tor(0.235, 0.012, 6, 32), { ...K.glow2, r: [P2, 0, 0] });
      b.add(cyl(0.008, 0.008, 0.2, 5), { ...K.trim, p: [0, 0.3, -0.05] });
      return { muzzle: [0, 0, 0.24], aims: true };
    case 'gem_veo':
      b.add(cyl(0.2, 0.25, 0.08, 6), { ...flat(K.dark) });
      b.spin('aperture', 'head', [0, 0.12, 0], [0, 1.2, 0]);
      b.ring(6, 0.16, () => box(0.06, 0.016, 0.24), { ...K.trim, p: [0, 0.12, 0], r: [0.25, 0.9, 0] });
      b.add(sph(0.085, 14, 10), { ...K.glow, p: [0, 0.13, 0] });
      b.add(tor(0.32, 0.014, 6, 40), { ...K.glow2, p: [0, 0.12, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.14, 0], aims: false };
    case 'gem_ultra':
      b.add(tor(0.16, 0.03, 8, 6), { ...K.trim, p: [0, 0, 0], r: [P2, 0, 0] });
      b.add(oct(0.2), { ...flat(K.glow), p: [0, 0.26, 0], s: [0.75, 1.55, 0.75] });
      b.spin('sat', 'head', [0, 0.26, 0], [0, 1.5, 0]);
      b.ring(3, 0.33, () => oct(0.085), { ...flat(K.glow2), p: [0, 0.26, 0], s: [0.7, 1.4, 0.7] });
      b.add(tor(0.33, 0.008, 6, 40), { ...K.trim, p: [0, 0.26, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.3, 0], aims: false };
    case 'gem_deepthink':
      for (const x of [-0.08, 0.08]) b.add(box(0.05, 0.09, 0.82), { ...K.dark, p: [x, 0, 0.22] });
      b.add(box(0.045, 0.03, 0.74), { ...K.glow, p: [0, 0, 0.22] });
      b.add(rbox(0.28, 0.22, 0.28, 0.04), { ...K.body, p: [0, 0, -0.2] });
      b.add(ico(0.11, 1), { ...flat(K.glow2), p: [0, 0.17, -0.2] });
      for (const z of [0, 0.26, 0.52]) b.add(box(0.25, 0.035, 0.045), { ...K.trim, p: [0, 0.05, z] });
      return { muzzle: [0, 0, 0.64], aims: true };
    case 'gem_constellation':
      b.add(oct(0.15), { ...flat(K.glow), p: [0, 0.28, 0], s: [0.35, 1.7, 0.35] });
      b.add(oct(0.15), { ...flat(K.glow), p: [0, 0.28, 0], s: [1.7, 0.35, 0.35] });
      b.add(oct(0.15), { ...flat(K.glow), p: [0, 0.28, 0], s: [0.35, 0.35, 1.7] });
      b.spin('orbit1', 'head', [0, 0.28, 0], [0, 1.0, 0]);
      b.add(tor(0.34, 0.01, 6, 40), { ...K.trim, p: [0, 0.28, 0], r: [P2, 0, 0] });
      b.ring(5, 0.34, () => oct(0.05), { ...flat(K.glow2), p: [0, 0.28, 0] });
      b.spin('orbit2', 'head', [0, 0.28, 0], [0, -0.7, 0]);
      b.add(tor(0.28, 0.01, 6, 40), { ...K.trim, p: [0, 0.28, 0], r: [P2 + 1.0, 0, 0] });
      b.spin('orbit3', 'head', [0, 0.28, 0], [0, 0.5, 0]);
      b.add(tor(0.4, 0.008, 6, 40), { ...K.accent, p: [0, 0.28, 0], r: [P2 - 0.8, 0, 0.4] });
      return { muzzle: [0, 0.28, 0], aims: false };
    case 'gem_twinsuns':
      b.add(tor(0.14, 0.03, 8, 6), { ...K.trim, r: [P2, 0, 0] });
      b.add(oct(0.07), { ...flat(K.body), p: [0, 0.34, 0] });
      b.spin('suns', 'head', [0, 0.34, 0], [0, 2.2, 0], 0.03);
      b.add(sph(0.155, 18, 12), { c: 0x6aa8ff, e: 3.0, p: [0.24, 0.34, 0] });
      b.add(sph(0.125, 18, 12), { c: 0xff7bd5, e: 3.0, p: [-0.24, 0.34, 0] });
      b.spin('disc', 'head', [0, 0.34, 0], [0, -0.8, 0]);
      b.add(tor(0.42, 0.012, 6, 48), { ...K.trim, p: [0, 0.34, 0], r: [P2 + 0.3, 0, 0] });
      b.add(tor(0.47, 0.006, 6, 48), { ...K.glow2, p: [0, 0.34, 0], r: [P2 + 0.3, 0, 0] });
      return { muzzle: [0, 0.34, 0], aims: false };

    // ===== CLAUDE =====
    case 'cl_haiku':
      b.add(sph(0.13, 16, 12), { ...K.body });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + PI / 2;
        b.add(cyl(0.024, 0.03, 0.22, 8), { ...K.accent, p: [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.17], r: Z });
      }
      b.add(sph(0.04, 8, 6), { ...K.glow, p: [0, 0, 0.13] });
      b.add(tor(0.132, 0.012, 6, 24), { ...K.trim, p: [0, 0, -0.01] });
      return { muzzle: [0, 0, 0.3], aims: true };
    case 'cl_sonnet':
      b.add(cyl(0.09, 0.11, 0.4, 16), { ...K.body, p: [0, 0, 0.1], r: Z });
      b.add(sph(0.125, 16, 12), { ...K.body, p: [0, 0, -0.1] });
      b.add(tor(0.095, 0.024, 8, 24), { ...K.accent, p: [0, 0, 0.3] });
      b.add(tor(0.116, 0.012, 6, 24), { ...K.trim, p: [0, 0, 0] });
      b.add(cyl(0.065, 0.065, 0.02, 14), { ...K.glow, p: [0, 0, 0.305], r: Z });
      return { muzzle: [0, 0, 0.34], aims: true };
    case 'cl_artifact':
      b.add(cyl(0.05, 0.09, 0.06, 12), { ...K.dark });
      b.spin('win', 'head', [0, 0.28, 0], [0, 0.6, 0], 0.03);
      b.add(rbox(0.44, 0.33, 0.05, 0.02), { ...K.body, p: [0, 0.28, 0] });
      b.add(box(0.44, 0.06, 0.054), { ...K.accent, p: [0, 0.415, 0] });
      for (const s of [-1, 1]) {
        b.add(box(0.2, 0.026, 0.01), { ...K.glow, p: [-0.07 * s, 0.33, 0.03 * s] });
        b.add(box(0.27, 0.026, 0.01), { ...K.glow2, p: [-0.035 * s, 0.275, 0.03 * s] });
        b.add(box(0.14, 0.026, 0.01), { ...K.glow, p: [-0.1 * s, 0.22, 0.03 * s] });
      }
      b.spin('coins', 'head', [0, 0.28, 0], [0, -1.4, 0]);
      b.ring(3, 0.36, () => cyl(0.045, 0.045, 0.014, 12), { ...K.trim, p: [0, 0.28, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.3, 0], aims: false };
    case 'cl_constitution':
      b.add(cyl(0.05, 0.085, 0.14, 12), { ...K.dark, p: [0, 0, 0] });
      openBook(b, K, 0.24, 0.32, 0.08);
      b.spin('halo', 'head', [0, 0.36, 0], [0, 0.8, 0], 0.02);
      b.add(tor(0.2, 0.015, 8, 32), { ...K.glow, p: [0, 0.36, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.3, 0], aims: false };
    case 'cl_opus':
      b.add(sph(0.22, 20, 14), { ...K.body });
      b.add(cyl(0.13, 0.15, 0.3, 16), { ...K.accent, p: [0, 0, 0.24], r: Z });
      b.add(tor(0.135, 0.026, 8, 24), { ...K.trim, p: [0, 0, 0.385] });
      b.add(tor(0.223, 0.014, 6, 32), { ...K.trim });
      b.add(tor(0.223, 0.014, 6, 32), { ...K.trim, r: [0, P2, 0] });
      b.add(cyl(0.105, 0.105, 0.02, 16), { ...K.glow, p: [0, 0, 0.385], r: Z });
      return { muzzle: [0, 0, 0.42], aims: true };
    case 'cl_thinking':
      b.add(ico(0.19, 1), { c: 0xe8907a, ro: 0.5, e: 0.25, flat: true, p: [0, 0.2, 0], s: [1, 0.9, 1.1] });
      b.add(cyl(0.06, 0.06, 0.03, 14), { ...K.trim, p: [0, 0.2, 0.235], r: Z });
      b.add(sph(0.035, 8, 6), { ...K.glow2, p: [0, 0.2, 0.25] });
      b.spin('ring1', 'head', [0, 0.2, 0], [0, 1.0, 0]);
      b.add(tor(0.3, 0.012, 6, 36), { ...K.glow, p: [0, 0.2, 0], r: [P2 + 0.5, 0, 0] });
      b.spin('ring2', 'head', [0, 0.2, 0], [0, -1.4, 0]);
      b.add(tor(0.26, 0.012, 6, 36), { ...K.glow2, p: [0, 0.2, 0], r: [P2 - 0.7, 0, 0] });
      return { muzzle: [0, 0.2, 0.27], aims: true };
    case 'cl_guardrail':
      b.at('base');
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i * PI) / 2;
        b.add(cyl(0.028, 0.035, 0.5, 8), { ...K.dark, p: [Math.sin(a) * 0.43, 0.3, Math.cos(a) * 0.43] });
        b.add(sph(0.045, 8, 6), { ...K.trim, p: [Math.sin(a) * 0.43, 0.56, Math.cos(a) * 0.43] });
      }
      b.add(tor(0.43, 0.018, 6, 4), { ...K.glow, p: [0, 0.34, 0], r: [P2, 0, PI / 4] });
      b.add(tor(0.43, 0.018, 6, 4), { ...K.glow, p: [0, 0.47, 0], r: [P2, 0, PI / 4] });
      H();
      b.add(cyl(0.06, 0.09, 0.26, 12), { ...K.body, p: [0, 0.08, 0] });
      b.add(sph(0.09, 14, 10), { ...K.glow2, p: [0, 0.26, 0] });
      return { muzzle: [0, 0.26, 0], aims: false };
    case 'cl_mcp':
      b.spin('hub', 'head', [0, 0.2, 0], [0, 0.7, 0]);
      b.add(sph(0.14, 16, 12), { ...K.body, p: [0, 0.2, 0] });
      b.ring(6, 0.22, () => cyl(0.022, 0.022, 0.2, 6), { ...K.dark, p: [0, 0.2, 0], r: [P2, 0, 0] });
      b.ring(6, 0.34, () => rbox(0.08, 0.08, 0.08, 0.015), { ...K.accent, p: [0, 0.2, 0] });
      b.ring(6, 0.34, () => sph(0.028, 8, 6), { ...K.glow, p: [0, 0.255, 0] });
      b.add(sph(0.05, 10, 8), { ...K.glow2, p: [0, 0.35, 0] });
      b.add(tor(0.145, 0.012, 6, 24), { ...K.trim, p: [0, 0.2, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.3, 0], aims: false };
    case 'cl_code':
      b.add(rbox(0.4, 0.29, 0.1, 0.025), { ...K.dark, p: [0, 0.13, 0] });
      b.add(box(0.4, 0.035, 0.105), { ...K.accent, p: [0, 0.28, 0] });
      b.add(box(0.035, 0.03, 0.01), { ...K.glow, p: [-0.14, 0.2, 0.052] });
      b.add(box(0.16, 0.024, 0.01), { ...K.glow2, p: [-0.02, 0.2, 0.052] });
      b.add(box(0.24, 0.024, 0.01), { ...K.glow, p: [-0.04, 0.145, 0.052] });
      b.add(box(0.1, 0.024, 0.01), { ...K.glow2, p: [-0.11, 0.09, 0.052] });
      b.add(box(0.03, 0.04, 0.01), { ...K.glow, p: [-0.03, 0.09, 0.052] });
      b.add(cyl(0.04, 0.07, 0.06, 10), { ...K.body, p: [0, -0.03, 0] });
      b.spin('spark', 'head', [0, 0.42, 0], [0, 0, 1.5]);
      burst(b, 8, 0.1, 0.022, { ...K.glow, p: [0, 0.42, 0] });
      return { muzzle: [0, 0.14, 0.08], aims: true };
    case 'cl_computer':
      b.add(cone(0.08, 0.1, 10), { ...K.dark, p: [0, -0.02, 0], r: [PI, 0, 0] });
      b.spin('cursor', 'head', [0, 0.22, 0], [0, 0, 0], 0.035, 2.4);
      b.add(extrude([[0, 0], [0, -0.44], [0.1, -0.345], [0.17, -0.5], [0.235, -0.47], [0.17, -0.325], [0.3, -0.31]], 0.06, 0.012),
        { ...K.body, p: [-0.06, 0.22, 0.3], r: [P2 + 0.25, 0, 0] });
      b.add(tor(0.07, 0.012, 6, 20), { ...K.glow, p: [-0.06, 0.2, 0.31], r: [P2, 0, 0] });
      return { muzzle: [-0.06, 0.2, 0.32], aims: true };
    case 'cl_mythos':
      b.add(cyl(0.1, 0.17, 0.62, 4), { ...flat(K.body), p: [0, 0.26, 0], r: [0, PI / 4, 0] });
      b.add(rbox(0.27, 0.06, 0.27, 0.015), { ...K.trim, p: [0, 0.6, 0] });
      b.add(rbox(0.32, 0.05, 0.32, 0.015), { ...K.accent, p: [0, -0.04, 0] });
      b.spin('star', 'head', [0, 0.84, 0], [0, 0.8, 0], 0.03);
      burst(b, 12, 0.22, 0.03, { ...K.glow2, p: [0, 0.84, 0], r: [P2, 0, 0] });
      b.add(sph(0.075, 12, 10), { ...K.glow, p: [0, 0.84, 0] });
      b.spin('rune1', 'head', [0, 0.2, 0], [0, -1.0, 0]);
      b.add(tor(0.27, 0.012, 6, 8), { ...K.glow, p: [0, 0.2, 0], r: [P2, 0, 0] });
      b.spin('rune2', 'head', [0, 0.42, 0], [0, 1.3, 0]);
      b.add(tor(0.22, 0.012, 6, 8), { ...K.glow2, p: [0, 0.42, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.84, 0], aims: false };
    case 'cl_fable':
      openBook(b, K, 0.3, 0.42, 0.02);
      b.spin('orb', 'head', [0, 0.46, 0], [0, 0.4, 0], 0.035);
      b.add(sph(0.115, 16, 12), { ...K.glow2, p: [0, 0.46, 0] });
      burst(b, 16, 0.2, 0.022, { ...K.trim, e: 0.5, p: [0, 0.46, 0], r: [P2, 0, 0] }, 0.17);
      b.spin('threads', 'head', [0, 0.46, 0], [0, 1.3, 0]);
      b.ring(4, 0.33, () => sph(0.05, 10, 8), { ...K.glow, p: [0, 0.46, 0] });
      b.add(tor(0.33, 0.008, 6, 40), { ...K.accent, p: [0, 0.46, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.46, 0], aims: false };

    // ===== CODEX =====
    case 'cx_autocomplete':
      b.add(rbox(0.24, 0.18, 0.24, 0.03), { ...K.body });
      b.add(cyl(0.035, 0.04, 0.26, 8), { ...K.trim, p: [0, 0, 0.22], r: Z });
      b.add(box(0.13, 0.025, 0.03), { ...K.glow, p: [0, 0.1, 0.02] });
      b.add(box(0.245, 0.03, 0.08), { ...K.dark, p: [0, -0.02, -0.04] });
      return { muzzle: [0, 0, 0.36], aims: true };
    case 'cx_linter':
      b.add(rbox(0.15, 0.13, 0.15, 0.03), { ...K.body });
      b.add(rbox(0.52, 0.07, 0.11, 0.02), { ...K.accent, p: [0, 0.09, 0.05] });
      b.add(box(0.47, 0.016, 0.02), { ...K.glow, p: [0, 0.052, 0.11] });
      for (const x of [-0.16, 0, 0.16]) b.add(box(0.045, 0.03, 0.012), { c: 0xffd23a, e: 2.2, p: [x, 0.1, 0.108] });
      return { muzzle: [0, 0.07, 0.12], aims: true };
    case 'cx_mini':
      b.add(rbox(0.2, 0.1, 0.2, 0.03), { ...K.body });
      b.add(cyl(0.03, 0.03, 0.32, 8), { ...K.trim, p: [0, 0.04, 0], r: [0, 0, P2] });
      b.xf([0, 0.05, 0], [-0.75, 0, 0]);
      b.add(cyl(0.09, 0.11, 0.34, 12), { ...K.dark, p: [0, 0, 0.1], r: Z });
      b.add(tor(0.095, 0.022, 6, 20), { ...K.glow, p: [0, 0, 0.27] });
      b.xf();
      return { muzzle: [0, 0.26, 0.2], aims: true };
    case 'cx_unittest':
      b.add(rbox(0.29, 0.2, 0.27, 0.03), { ...K.body });
      for (const x of [-0.07, 0.07]) b.add(cyl(0.03, 0.032, 0.25, 8), { ...K.trim, p: [x, 0, 0.23], r: Z });
      b.add(box(0.1, 0.02, 0.04), { ...K.glow, p: [-0.055, 0.105, 0.03], r: [0, -0.785, 0] });
      b.add(box(0.2, 0.02, 0.04), { ...K.glow, p: [0.04, 0.105, -0.01], r: [0, 0.785, 0] });
      return { muzzle: [0, 0, 0.37], aims: true };
    case 'cx_compiler':
      b.add(rbox(0.3, 0.13, 0.3, 0.03), { ...K.body });
      b.xf([0, 0.04, 0], [-0.85, 0, 0]);
      b.add(cyl(0.13, 0.15, 0.42, 14), { ...K.dark, p: [0, 0, 0.14], r: Z });
      b.add(tor(0.135, 0.026, 8, 24), { ...K.glow, p: [0, 0, 0.35] });
      b.add(tor(0.15, 0.02, 6, 24), { ...K.trim, p: [0, 0, 0.08] });
      b.xf();
      b.spin('gear', 'head', [0, -0.07, 0], [0, 1.0, 0]);
      b.add(cyl(0.2, 0.2, 0.04, 16), { ...K.trim, p: [0, -0.07, 0] });
      b.ring(8, 0.215, () => box(0.06, 0.04, 0.05), { ...K.trim, p: [0, -0.07, 0] });
      return { muzzle: [0, 0.34, 0.26], aims: true };
    case 'cx_debugger':
      b.add(rbox(0.16, 0.14, 0.34, 0.03), { ...K.body, p: [0, 0, -0.02] });
      b.add(cyl(0.025, 0.03, 0.6, 8), { ...K.trim, p: [0, 0, 0.42], r: Z });
      b.add(box(0.065, 0.065, 0.07), { ...K.dark, p: [0, 0, 0.71] });
      b.add(cyl(0.04, 0.04, 0.2, 10), { ...K.dark, p: [0, 0.11, 0.02], r: Z });
      b.add(cyl(0.032, 0.032, 0.012, 10), { ...K.glow, p: [0, 0.11, 0.125], r: Z });
      b.add(sph(0.058, 12, 10), { c: 0xff3b3b, e: 2.6, p: [-0.115, 0.02, 0.05] });
      return { muzzle: [0, 0, 0.76], aims: true };
    case 'cx_pr':
      b.add(rbox(0.2, 0.1, 0.2, 0.03), { ...K.dark, p: [0, -0.02, 0] });
      b.xf([0, 0.1, 0], [-0.4, 0, 0]);
      b.add(rbox(0.36, 0.3, 0.32, 0.03), { ...K.body });
      for (const [x, y] of [[-0.085, -0.06], [0.085, -0.06], [0, 0.075]] as [number, number][]) {
        b.add(cyl(0.06, 0.06, 0.04, 12), { ...K.dark, p: [x, y, 0.155], r: Z });
        b.add(cone(0.04, 0.07, 10), { ...K.glow, p: [x, y, 0.18], r: Z });
      }
      b.add(box(0.37, 0.02, 0.2), { ...K.glow2, p: [0, 0.152, -0.02], s: [1, 0.5, 1] });
      b.xf();
      return { muzzle: [0, 0.18, 0.2], aims: true };
    case 'cx_ci':
      b.add(rbox(0.27, 0.23, 0.24, 0.03), { ...K.body, p: [0, 0, -0.08] });
      b.add(box(0.275, 0.03, 0.245), { ...K.glow, p: [0, 0.06, -0.08] });
      b.add(cyl(0.11, 0.11, 0.12, 12), { ...K.dark, p: [-0.19, -0.02, -0.08], r: [0, 0, P2] });
      b.spin('gat', 'head', [0, 0, 0.3], [0, 0, 7]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        b.add(cyl(0.022, 0.022, 0.46, 6), { ...K.trim, p: [Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.3], r: Z });
      }
      b.add(cyl(0.1, 0.1, 0.025, 12), { ...K.dark, p: [0, 0, 0.5], r: Z });
      b.add(cyl(0.1, 0.1, 0.025, 12), { ...K.dark, p: [0, 0, 0.1], r: Z });
      return { muzzle: [0, 0, 0.56], aims: true };
    case 'cx_sandbox': {
      const s = 0.23, y = 0.26;
      for (const a of [-1, 1]) for (const c of [-1, 1]) {
        b.add(box(s * 2, 0.022, 0.022), { ...K.glow, p: [0, y + a * s, c * s] });
        b.add(box(0.022, s * 2, 0.022), { ...K.glow, p: [a * s, y, c * s] });
        b.add(box(0.022, 0.022, s * 2), { ...K.glow, p: [a * s, y + c * s, 0] });
        for (const d of [-1, 1]) b.add(box(0.05, 0.05, 0.05), { ...K.trim, p: [a * s, y + c * s, d * s] });
      }
      b.spin('core', 'head', [0, y, 0], [0.7, 1.1, 0]);
      b.add(rbox(0.17, 0.17, 0.17, 0.02), { ...K.accent, p: [0, y, 0] });
      b.add(box(0.19, 0.03, 0.19), { ...K.glow2, p: [0, y, 0] });
      return { muzzle: [0, y, 0], aims: false };
    }
    case 'cx_refactor':
      b.add(rbox(0.25, 0.21, 0.25, 0.03), { ...K.body, p: [0, 0, -0.16] });
      for (const x of [-0.075, 0.075]) b.add(box(0.045, 0.1, 0.72), { ...K.dark, p: [x, 0, 0.26] });
      b.add(box(0.035, 0.03, 0.68), { ...K.glow, p: [0, 0, 0.26] });
      for (const z of [0.1, 0.42]) b.add(tor(0.12, 0.016, 6, 14, PI), { ...K.accent, p: [0, 0, z] });
      b.add(box(0.26, 0.025, 0.1), { ...K.glow2, p: [0, 0.11, -0.16] });
      return { muzzle: [0, 0, 0.62], aims: true };
    case 'cx_swarm':
      b.add(cyl(0.2, 0.25, 0.36, 6), { ...flat(K.body), p: [0, 0.1, 0] });
      b.add(tor(0.245, 0.014, 6, 6), { ...K.glow, p: [0, 0.0, 0], r: [P2, 0, PI / 6] });
      b.add(tor(0.215, 0.014, 6, 6), { ...K.glow, p: [0, 0.2, 0], r: [P2, 0, PI / 6] });
      b.add(cyl(0.27, 0.2, 0.045, 6), { ...flat(K.dark), p: [0, 0.3, 0] });
      b.add(cyl(0.01, 0.01, 0.22, 5), { ...K.trim, p: [0, 0.43, 0] });
      b.add(sph(0.032, 8, 6), { ...K.glow2, p: [0, 0.55, 0] });
      return { muzzle: [0, 0.4, 0], aims: false };
    case 'cx_max':
      b.add(rbox(0.52, 0.2, 0.42, 0.03), { ...K.body, p: [0, 0.04, 0] });
      b.xf([0, 0.2, -0.02], [-0.55, 0, 0]);
      b.add(rbox(0.5, 0.3, 0.36, 0.03), { ...K.dark });
      for (const x of [-0.15, 0, 0.15]) for (const y of [-0.065, 0.07]) {
        b.add(cyl(0.058, 0.058, 0.04, 12), { ...K.body, p: [x, y, 0.175], r: Z });
        b.add(cone(0.04, 0.08, 10), { ...K.glow, p: [x, y, 0.2], r: Z });
      }
      b.xf();
      b.spin('radar', 'head', [0.17, 0.42, -0.16], [0, 2.2, 0]);
      b.add(cyl(0.012, 0.012, 0.12, 5), { ...K.trim, p: [0.17, 0.38, -0.16] });
      b.add(cyl(0.1, 0.03, 0.04, 14), { ...K.accent, p: [0.17, 0.46, -0.13], r: [P2, 0, 0] });
      b.spin('holo', 'head', [0, 0, 0], [0, -0.6, 0]);
      b.add(tor(0.46, 0.01, 6, 6), { ...K.glow, p: [0, 0.02, 0], r: [P2, 0, 0] });
      return { muzzle: [0, 0.34, 0.26], aims: true };

    // ===== GROK =====
    case 'gk_spark':
      b.add(cone(0.075, 0.3, 6), { ...flat(K.body), p: [0, 0.1, 0] });
      b.add(sph(0.09, 14, 10), { ...K.trim, p: [0, 0.3, 0] });
      b.add(tor(0.115, 0.012, 6, 24), { ...K.glow, p: [0, 0.3, 0], r: [P2, 0, 0] });
      for (const x of [-1, 1]) b.add(cyl(0.008, 0.012, 0.18, 5), { ...K.trim, p: [x * 0.09, 0.14, 0], r: [0, 0, -x * 0.5] });
      return { muzzle: [0, 0.32, 0], aims: false };
    case 'gk_fun': {
      b.spin('dice', 'head', [0, 0.26, 0], [0.9, 1.3, 0.4], 0.02);
      const h = 0.135, y = 0.26;
      b.add(rbox(0.27, 0.27, 0.27, 0.04), { ...K.body, p: [0, y, 0] });
      const pip = (x: number, yy: number, z: number) => b.add(sph(0.028, 8, 6), { ...K.glow, p: [x, y + yy, z] });
      pip(0, 0, h);
      pip(h, 0.06, 0.06); pip(h, -0.06, -0.06);
      for (const d of [-0.07, 0, 0.07]) pip(d, h, d);
      for (const a of [-0.065, 0.065]) for (const c of [-0.065, 0.065]) pip(-h, a, c);
      for (const a of [-0.07, 0.07]) for (const c of [-0.07, 0.07]) pip(a, c, -h);
      pip(0, 0, -h);
      for (const a of [-0.07, 0.07]) for (const c of [-0.07, 0, 0.07]) pip(a, -h, c);
      return { muzzle: [0, 0.26, 0], aims: false };
    }
    case 'gk_tesla':
      b.add(cyl(0.05, 0.075, 0.42, 8), { ...K.dark, p: [0, 0.15, 0] });
      b.add(tor(0.19, 0.032, 8, 28), { ...K.trim, p: [0, 0.04, 0], r: [P2, 0, 0] });
      b.add(tor(0.145, 0.028, 8, 28), { ...K.trim, p: [0, 0.16, 0], r: [P2, 0, 0] });
      b.add(tor(0.1, 0.024, 8, 28), { ...K.trim, p: [0, 0.27, 0], r: [P2, 0, 0] });
      b.add(sph(0.09, 14, 10), { ...K.glow, p: [0, 0.42, 0] });
      return { muzzle: [0, 0.42, 0], aims: false };
    case 'gk_raptor':
      b.add(rbox(0.22, 0.1, 0.26, 0.03), { ...K.dark, p: [0, -0.02, 0] });
      b.xf([0, 0.02, -0.06], [-0.95, 0, 0]);
      b.add(box(0.05, 0.03, 0.5), { ...K.trim, p: [0, -0.09, 0.2] });
      b.add(cyl(0.07, 0.07, 0.36, 12), { ...K.accent, p: [0, 0, 0.2], r: Z });
      b.add(cone(0.07, 0.15, 12), { ...K.body, p: [0, 0, 0.455], r: Z });
      b.add(box(0.24, 0.016, 0.1), { ...K.body, p: [0, 0, 0.05] });
      b.add(box(0.016, 0.24, 0.1), { ...K.body, p: [0, 0, 0.05] });
      b.add(cyl(0.035, 0.055, 0.05, 10), { ...K.glow, p: [0, 0, -0.005], r: Z });
      b.add(tor(0.072, 0.008, 5, 16), { ...K.glow, p: [0, 0, 0.3] });
      b.xf();
      return { muzzle: [0, 0.4, 0.26], aims: true };
    case 'gk_vision':
      b.add(rbox(0.18, 0.18, 0.3, 0.03), { ...K.body });
      b.add(cyl(0.035, 0.04, 0.46, 8), { ...K.trim, p: [0, 0, 0.36], r: Z });
      for (const s of [-1, 1]) {
        b.add(box(0.46, 0.055, 0.03), { ...K.dark, p: [0, 0, 0.17], r: [0, 0, (s * PI) / 4] });
        b.add(box(0.44, 0.014, 0.036), { ...K.glow, p: [0, 0, 0.17], r: [0, 0, (s * PI) / 4] });
      }
      b.add(cyl(0.03, 0.03, 0.015, 8), { ...K.glow2, p: [0, 0, 0.595], r: Z });
      return { muzzle: [0, 0, 0.6], aims: true };
    case 'gk_unhinged':
      b.spin('ball', 'head', [0, 0.26, 0], [1.7, 2.3, 0.9]);
      b.add(ico(0.15, 0), { ...flat(K.body), p: [0, 0.26, 0] });
      for (const d of ICO_DIRS) {
        const l = Math.hypot(...d);
        const n: V3 = [d[0] / l, d[1] / l, d[2] / l];
        b.add(cone(0.04, 0.2, 5), { ...flat(K.trim), p: [n[0] * 0.2, 0.26 + n[1] * 0.2, n[2] * 0.2], dir: n });
        b.add(sph(0.022, 6, 5), { ...K.glow, p: [n[0] * 0.31, 0.26 + n[1] * 0.31, n[2] * 0.31] });
      }
      return { muzzle: [0, 0.26, 0], aims: false };
    case 'gk_meme':
      b.add(rbox(0.2, 0.1, 0.2, 0.03), { ...K.dark, p: [0, -0.03, 0] });
      b.xf([0, 0.06, 0], [-0.5, 0, 0]);
      b.add(cyl(0.2, 0.09, 0.36, 16), { ...K.body, p: [0, 0, 0.16], r: Z });
      b.add(tor(0.2, 0.026, 8, 28), { ...K.trim, p: [0, 0, 0.34] });
      b.add(cyl(0.165, 0.165, 0.02, 16), { ...K.glow, p: [0, 0, 0.3], r: Z });
      b.add(sph(0.12, 14, 10), { ...K.dark, p: [0, 0, -0.04] });
      b.xf();
      return { muzzle: [0, 0.24, 0.3], aims: true };
    case 'gk_bigbrain':
      b.add(cyl(0.16, 0.2, 0.06, 8), { ...flat(K.dark) });
      b.add(ico(0.19, 1), { c: 0xff5c8a, e: 0.7, ro: 0.4, flat: true, p: [0, 0.24, 0], s: [1, 0.85, 1.15] });
      b.add(tor(0.26, 0.014, 6, 32), { ...K.trim, p: [0, 0.24, 0] });
      b.add(tor(0.26, 0.014, 6, 32), { ...K.trim, p: [0, 0.24, 0], r: [0, P2, 0] });
      for (const x of [-0.1, 0.1]) {
        b.add(cyl(0.01, 0.01, 0.16, 5), { ...K.trim, p: [x, 0.5, 0] });
        b.add(sph(0.03, 8, 6), { ...K.glow, p: [x, 0.59, 0] });
      }
      return { muzzle: [0, 0.58, 0], aims: false };
    case 'gk_colossus':
      b.add(rbox(0.38, 0.64, 0.27, 0.02), { ...K.body, p: [0, 0.3, 0] });
      for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) for (const s of [-1, 1]) {
        const on = (r * 7 + c * 3 + (s > 0 ? 1 : 0)) % 5;
        b.add(box(0.05, 0.022, 0.01), { ...(on === 0 ? K.glow2 : on < 3 ? K.glow : K.dark), p: [-0.12 + c * 0.08, 0.06 + r * 0.08, s * 0.137] });
      }
      b.add(box(0.4, 0.03, 0.29), { ...K.trim, p: [0, -0.01, 0] });
      b.add(box(0.4, 0.03, 0.29), { ...K.trim, p: [0, 0.625, 0] });
      for (const x of [-0.2, 0.2]) for (const z of [-0.07, 0, 0.07]) b.add(box(0.02, 0.5, 0.035), { ...K.dark, p: [x, 0.3, z] });
      return { muzzle: [0, 0.66, 0], aims: false };
    case 'gk_heavy':
      b.add(rbox(0.3, 0.26, 0.36, 0.03), { ...K.body, p: [0, 0, -0.2] });
      b.add(cyl(0.07, 0.09, 0.82, 10), { ...K.dark, p: [0, 0, 0.36], r: Z });
      for (const z of [0.1, 0.36, 0.62]) b.add(tor(0.115, 0.03, 8, 20), { ...K.trim, p: [0, 0, z] });
      b.add(box(0.02, 0.02, 0.72), { ...K.glow, p: [0, 0.088, 0.36] });
      for (const x of [-0.076, 0.076]) b.add(box(0.02, 0.02, 0.72), { ...K.glow, p: [x, -0.045, 0.36] });
      b.add(box(0.31, 0.025, 0.2), { ...K.glow, p: [0, 0.135, -0.2], s: [1, 0.5, 1] });
      return { muzzle: [0, 0, 0.8], aims: true };
    case 'gk_blackhole':
      b.add(sph(0.19, 24, 16), { c: 0x000000, m: 0, ro: 1, p: [0, 0.32, 0] });
      b.spin('disc', 'head', [0, 0.32, 0], [0, 3.2, 0]);
      b.add(tor(0.3, 0.05, 4, 48), { ...K.glow, p: [0, 0.32, 0], r: [P2 + 0.32, 0, 0], s: [1, 1, 0.22] });
      b.add(tor(0.235, 0.022, 4, 48), { ...K.glow2, p: [0, 0.32, 0], r: [P2 + 0.32, 0, 0], s: [1, 1, 0.3] });
      b.spin('lens', 'head', [0, 0.32, 0], [0, -0.5, 0]);
      b.add(tor(0.215, 0.008, 6, 40), { ...K.glow2, p: [0, 0.32, 0] });
      b.add(tor(0.42, 0.008, 6, 48), { ...K.trim, p: [0, 0.32, 0], r: [P2 - 0.2, 0, 0.3] });
      return { muzzle: [0, 0.32, 0], aims: false };
    case 'gk_supernova':
      b.spin('star', 'head', [0, 0.46, 0], [0.3, 1.2, 0], 0.04);
      b.add(ico(0.17, 1), { c: 0xfff0f4, e: 3.2, flat: true, p: [0, 0.46, 0] });
      for (const d of CUBE_DIRS) {
        const n: V3 = [d[0] * 0.577, d[1] * 0.577, d[2] * 0.577];
        b.add(oct(0.07), { ...flat(K.glow), p: [n[0] * 0.25, 0.46 + n[1] * 0.25, n[2] * 0.25], dir: n, s: [0.32, 3.0, 0.32] });
      }
      b.spin('gyro1', 'head', [0, 0.46, 0], [0, -0.9, 0]);
      b.add(tor(0.4, 0.012, 6, 48), { ...K.trim, p: [0, 0.46, 0], r: [P2 + 0.6, 0, 0] });
      b.spin('gyro2', 'head', [0, 0.46, 0], [0, 0.6, 0]);
      b.add(tor(0.46, 0.012, 6, 48), { ...K.trim, p: [0, 0.46, 0], r: [P2 - 0.5, 0, 0.5] });
      return { muzzle: [0, 0.46, 0], aims: false };
  }
  // fallback
  b.add(sph(0.15), { ...K.glow, p: [0, 0.15, 0] });
  return { muzzle: [0, 0.2, 0], aims: false };
}

const cache = new Map<string, TowerModel>();

export function towerModel(def: TowerDef): TowerModel {
  let m = cache.get(def.id);
  if (m) return m;
  const b = new Builder();
  const grade = def.tier <= 4 ? 0 : def.tier <= 8 ? 1 : 2;
  const headY = pedestal(b, def.family, grade);
  const h = head(b, def, KITS[def.family]);
  m = {
    base: b.build('base')!,
    head: b.build('head'),
    parts: b.parts(),
    headY: headY + 0.06,
    muzzle: h.muzzle,
    aims: h.aims,
  };
  cache.set(def.id, m);
  return m;
}

let _drone: THREE.BufferGeometry | null = null;
export function droneGeometry(): THREE.BufferGeometry {
  if (_drone) return _drone;
  const K = KITS.codex;
  const b = new Builder();
  b.add(rbox(0.13, 0.06, 0.13, 0.02), { ...K.body });
  b.add(sph(0.03, 8, 6), { ...K.glow, p: [0, -0.02, 0.06] });
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2;
    b.add(box(0.02, 0.014, 0.12), { ...K.trim, p: [Math.sin(a) * 0.08, 0.01, Math.cos(a) * 0.08], r: [0, a, 0] });
    b.add(cyl(0.05, 0.05, 0.008, 10), { ...K.glow2, e: 1.2, p: [Math.sin(a) * 0.13, 0.03, Math.cos(a) * 0.13] });
  }
  _drone = b.build('base')!;
  return _drone;
}
