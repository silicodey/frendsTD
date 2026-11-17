import * as THREE from 'three';
import type { Family, TowerDef } from '../data/types';
import { Builder, box, burst, cone, cyl, extrude, ico, oct, rbox, sph, tor, tube, type Mat, type SpinPart, type V3 } from './builder';

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
    body: { c: 0x52657a, m: 0.7, ro: 0.36 }, dark: { c: 0x1d2730, m: 0.8, ro: 0.42 }, accent: { c: 0xc2d0cc, m: 0.2, ro: 0.35 },
    trim: { c: 0x8c99a6, m: 1, ro: 0.25 }, glow: { c: 0x14e08f, e: 2.6 }, glow2: { c: 0x7dffcf, e: 1.8 },
  },
  grok: {
    body: { c: 0x2e3040, m: 0.85, ro: 0.26 }, dark: { c: 0x454858, m: 0.8, ro: 0.32 }, accent: { c: 0xd0d0da, m: 0.3, ro: 0.25 },
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
    case 'gem_twin':
      b.add(sph(0.11), { ...K.body });
      b.add(box(0.52, 0.05, 0.07), { ...K.dark, p: [0, 0.02, 0] });
      b.add(oct(0.13), { ...flat(K.glow), p: [-0.25, 0.17, 0], s: [0.7, 1.35, 0.7] });
      b.add(oct(0.13), { ...flat(K.glow2), p: [0.25, 0.17, 0], s: [0.7, 1.35, 0.7] });
      for (const x of [-0.25, 0.25]) b.add(cyl(0.05, 0.07, 0.06, 6), { ...flat(K.trim), p: [x, 0.04, 0] });
      return { muzzle: [0, 0.18, 0.05], aims: true };
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
  }
  // fallback
  b.add(sph(0.15), { ...K.glow, p: [0, 0.15, 0] });
  return { muzzle: [0, 0.2, 0], aims: false };
}

// ---------- full custom models (rebuilt from concept sheets: their own base, not the class pedestal) ----------
const TK = {
  gun: { c: 0x2e3040, m: 0.7, ro: 0.36 } as Mat, gun2: { c: 0x454858, m: 0.65, ro: 0.34 } as Mat, dark: { c: 0x252731, m: 0.6, ro: 0.42 } as Mat,
  chrome: { c: 0xa4a6b2, m: 0.85, ro: 0.3 } as Mat, slot: { c: 0xff2a62, e: 1.0 } as Mat, tip: { c: 0xd0d0da, m: 0.5, ro: 0.3 } as Mat,
};
/** The Tokyo concept plinth: an octagonal gunmetal block, chamfered top with a thin chrome edge, slot lights on the diagonal faces. Returns its top. */
function tokyoPlinth(b: Builder, h = 0.2): number {
  const OCT = PI / 8;
  b.at('base');
  b.add(cyl(0.38, 0.43, h, 8), { ...TK.gun, flat: true, p: [0, h / 2, 0], r: [0, OCT, 0] });
  b.add(cyl(0.32, 0.38, 0.035, 8), { ...TK.gun2, flat: true, p: [0, h + 0.0175, 0], r: [0, OCT, 0] });
  b.add(tor(0.385, 0.01, 4, 8), { ...TK.chrome, p: [0, h, 0], r: [P2, 0, OCT] });
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i * PI) / 2;
    b.xf([Math.sin(a) * 0.395, h / 2, Math.cos(a) * 0.395], [0, a, 0]);
    b.add(box(0.1, 0.022, 0.012), { ...TK.slot, r: [-0.24, 0, 0] });
  }
  b.xf();
  return h + 0.035;
}
type Custom = (b: Builder, K: Kit) => { headY: number; muzzle: V3; aims: boolean };
/** London concept palette and its hexagonal plinth (flat face to the front, wedge with a violet slot, blue slot lights, glowing turntable ring). */
const LK = {
  steel: { c: 0x98a3c6, m: 0.45, ro: 0.36 } as Mat, navy: { c: 0x18203a, m: 0.6, ro: 0.4 } as Mat, cobalt: { c: 0x4a62c8, m: 0.4, ro: 0.35 } as Mat,
  trim: { c: 0xaebcdf, m: 0.85, ro: 0.25 } as Mat, blue: { c: 0x3d7dff, e: 1.0 } as Mat, violet: { c: 0xa855ff, e: 1.0 } as Mat,
  crystal: { c: 0x86dcff, e: 0.7, m: 0.2, ro: 0.08, flat: true } as Mat,
};
function londonPlinth(b: Builder): number {
  const HEX = PI / 6;
  b.at('base');
  b.add(cyl(0.4, 0.44, 0.15, 6), { ...LK.steel, flat: true, p: [0, 0.075, 0], r: [0, HEX, 0] });
  b.add(cyl(0.36, 0.4, 0.03, 6), { ...LK.steel, flat: true, p: [0, 0.165, 0], r: [0, HEX, 0] });
  b.add(cyl(0.33, 0.33, 0.01, 6), { ...LK.navy, p: [0, 0.181, 0], r: [0, HEX, 0] });
  for (const a of [PI / 3, -PI / 3]) {
    b.xf([Math.sin(a) * 0.384, 0.075, Math.cos(a) * 0.384], [0, a, 0]);
    b.add(box(0.11, 0.026, 0.012), { ...LK.blue, r: [-0.13, 0, 0] });
  }
  const wedge: [number, number][] = [[-0.05, 0], [0.06, 0], [0.05, 0.15], [0.0, 0.18], [-0.05, 0.13]];
  b.xf([0, 0, 0.385], [0, 0, 0]);
  b.add(extrude(wedge, 0.11, 0.012), { ...LK.steel, flat: true, r: [0, -P2, 0] });
  b.add(box(0.02, 0.07, 0.012), { ...LK.violet, p: [0, 0.075, 0.072], r: [-0.08, 0, 0] });
  b.xf();
  b.add(cyl(0.17, 0.19, 0.03, 32), { ...LK.navy, p: [0, 0.2, 0] });
  b.add(tor(0.185, 0.009, 6, 40), { ...LK.blue, p: [0, 0.2, 0], r: [P2, 0, 0] });
  return 0.215;
}

const CUSTOM: Record<string, Custom> = {
  // Supernova: a caged red star in a chrome gimbal, between two tall pylons, on a two-tier octagonal plinth
  gk_supernova: (b, K) => {
    const OCT = PI / 8, STAR_Y = 0.58;
    const gun: Mat = { c: 0x2e3040, m: 0.7, ro: 0.36 }, gun2: Mat = { c: 0x454858, m: 0.65, ro: 0.34 }, top: Mat = { c: 0x262833, m: 0.6, ro: 0.42 };
    const chrome: Mat = { c: 0xa4a6b2, m: 0.85, ro: 0.3 }, slot: Mat = { c: 0xff2a62, e: 1.0 }, collar: Mat = { c: 0x30323d, m: 0.6, ro: 0.4 };
    b.at('base');
    b.add(cyl(0.4, 0.43, 0.2, 8), { ...gun, flat: true, p: [0, 0.1, 0], r: [0, OCT, 0] }); // lower tier
    b.add(cyl(0.385, 0.4, 0.03, 8), { ...chrome, flat: true, p: [0, 0.215, 0], r: [0, OCT, 0] }); // chrome chamfer band
    b.add(cyl(0.31, 0.355, 0.08, 8), { ...gun2, flat: true, p: [0, 0.27, 0], r: [0, OCT, 0] }); // upper tier
    b.add(cyl(0.27, 0.27, 0.01, 8), { ...top, p: [0, 0.312, 0], r: [0, OCT, 0] }); // top face
    // short slot lights on the diagonal faces of the lower tier
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2;
      b.xf([Math.sin(a) * 0.392, 0.12, Math.cos(a) * 0.392], [0, a, 0]);
      b.add(box(0.1, 0.022, 0.012), { ...slot });
    }
    // pylons on the axes: tall leaning pylons left and right, short wedges front and back (profile: x = outward, y = up)
    const tall: [number, number][] = [[-0.055, 0], [0.045, 0], [0.085, 0.36], [0.115, 0.66], [0.07, 0.72], [0.02, 0.66], [-0.005, 0.38]];
    const wedge: [number, number][] = [[-0.05, 0], [0.075, 0], [0.065, 0.17], [0.005, 0.21], [-0.05, 0.16]];
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2, isTall = i % 2 === 1; // ±X tall (left/right from the default camera), ±Z wedges
      b.xf([Math.sin(a) * 0.37, 0.2, Math.cos(a) * 0.37], [0, a, 0]); // local +Z points outward
      if (isTall) {
        b.add(extrude(tall, 0.105, 0.012), { ...gun2, flat: true, r: [0, -P2, 0] });
        b.add(box(0.022, 0.13, 0.012), { ...slot, p: [0, 0.14, 0.075], r: [0.08, 0, 0] });
      } else {
        b.add(extrude(wedge, 0.13, 0.012), { ...gun2, flat: true, r: [0, -P2, 0] });
        b.add(box(0.022, 0.1, 0.012), { ...slot, p: [0, 0.09, 0.087], r: [-0.06, 0, 0] });
      }
    }
    b.xf();
    // the star: slow spin and a small bob
    b.spin('star', 'base', [0, STAR_Y, 0], [0, 0.6, 0], 0.012, 1.6);
    b.add(sph(0.135, 20, 14), { c: 0xff1f5a, e: 1.15, m: 0.1, ro: 0.3, p: [0, STAR_Y, 0] });
    // two gimbal rings with collar clamps, turning opposite ways around the star
    const ring = (name: string, R: number, rot: V3, spin: V3) => {
      b.spin(name, 'base', [0, STAR_Y, 0], spin);
      b.xf([0, STAR_Y, 0], rot);
      b.add(tor(R, 0.013, 8, 48), { ...chrome });
      for (const th of [0.25, 0.25 + PI]) {
        const pt: V3 = [Math.cos(th) * R, Math.sin(th) * R, 0];
        b.add(cyl(0.024, 0.024, 0.045, 10), { ...collar, p: pt, dir: [-Math.sin(th), Math.cos(th), 0] });
      }
      b.xf();
    };
    ring('ringA', 0.215, [0, 0.6, 0.45], [0, 0.85, 0]);
    ring('ringB', 0.245, [P2 - 0.55, 0, -0.35], [0, -0.55, 0]);
    b.at('base');
    return { headY: STAR_Y, muzzle: [0, 0, 0], aims: false };
  },
  // Arc Coil: a stacked coil on an octagonal plinth; two counter-rotating banded rings, a spark gap of two bent prongs on top
  gk_tesla: (b) => {
    const { gun, gun2, dark, chrome, slot, tip } = TK;
    tokyoPlinth(b);
    b.add(cyl(0.13, 0.15, 0.4, 16), { ...dark, p: [0, 0.43, 0] }); // core column
    // two coil rings, turning opposite ways
    const coil = (name: string, y: number, spin: number) => {
      b.spin(name, 'base', [0, y, 0], [0, spin, 0]);
      b.add(cyl(0.29, 0.29, 0.1, 32), { ...gun2, p: [0, y, 0] });
      b.add(cyl(0.21, 0.21, 0.104, 24), { ...dark, p: [0, y, 0] });
      for (const dy of [-0.05, 0.05]) b.add(tor(0.29, 0.012, 6, 40), { ...chrome, p: [0, y + dy, 0], r: [P2, 0, 0] });
      for (const a of [-0.5, 0.5, PI - 0.5, PI + 0.5]) {
        b.add(box(0.075, 0.024, 0.012), { ...slot, p: [Math.sin(a) * 0.292, y, Math.cos(a) * 0.292], r: [0, a, 0] });
      }
      for (const a of [0, PI]) b.add(box(0.045, 0.06, 0.03), { ...dark, p: [Math.sin(a) * 0.3, y - 0.05, Math.cos(a) * 0.3], r: [0, a, 0] });
    };
    coil('coilLow', 0.33, 0.8);
    coil('coilHigh', 0.49, -0.8);
    b.at('base');
    b.add(cyl(0.15, 0.15, 0.06, 20), { ...dark, p: [0, 0.6, 0] }); // cap
    b.add(cyl(0.11, 0.13, 0.03, 20), { ...gun, p: [0, 0.645, 0] });
    // the spark gap: two bent prongs facing each other
    for (const sx of [-1, 1]) {
      b.add(box(0.06, 0.16, 0.07), { ...gun2, flat: true, p: [sx * 0.17, 0.66, 0], r: [0, 0, sx * -0.18] });
      b.add(box(0.06, 0.12, 0.07), { ...gun2, flat: true, p: [sx * 0.12, 0.78, 0], r: [0, 0, sx * 0.75] });
      b.add(box(0.05, 0.05, 0.06), { ...tip, p: [sx * 0.065, 0.815, 0] });
    }
    return { headY: 0.81, muzzle: [0, 0, 0], aims: false };
  },
  // Frenzy: a drum turret cradled by two armour cheeks on a chrome turntable; a cross of four barrels spins on its face
  gk_unhinged: (b) => {
    const { gun2, dark, chrome, slot } = TK;
    const top = tokyoPlinth(b);
    b.add(cyl(0.27, 0.29, 0.05, 32), { ...chrome, p: [0, top + 0.025, 0] }); // turntable
    // head (yaws to aim; +Z is forward)
    const DY = 0.25, FZ = 0.17;
    b.at('head');
    b.add(cyl(0.22, 0.22, 0.34, 28), { ...gun2, p: [0, DY, 0], r: [P2, 0, 0] }); // drum
    b.add(cyl(0.23, 0.23, 0.04, 28), { ...chrome, p: [0, DY, -0.05], r: [P2, 0, 0] }); // band
    b.add(cyl(0.2, 0.2, 0.02, 28), { ...dark, p: [0, DY, FZ], r: [P2, 0, 0] });
    b.add(tor(0.15, 0.012, 6, 32), { ...chrome, p: [0, DY, FZ + 0.012] });
    b.add(cyl(0.06, 0.06, 0.03, 8), { ...dark, p: [0, 0.03, 0] }); // neck
    const cheek: [number, number][] = [[-0.2, 0], [0.16, 0], [0.2, 0.18], [0.16, 0.44], [-0.12, 0.46], [-0.22, 0.3]];
    for (const sx of [-1, 1]) {
      b.add(extrude(cheek, 0.1, 0.014), { ...gun2, flat: true, p: [sx * 0.29, 0.01, 0], r: [0, sx * P2, 0] });
      b.add(box(0.012, 0.13, 0.024), { ...slot, p: [sx * 0.352, 0.2, 0.08] });
    }
    // the spinning barrel cross
    b.spin('barrels', 'head', [0, DY, FZ], [0, 0, 2.2]);
    b.add(cyl(0.065, 0.065, 0.07, 16), { ...dark, p: [0, DY, FZ + 0.035], r: [P2, 0, 0] });
    b.add(cyl(0.035, 0.035, 0.012, 16), { ...slot, e: 1.2, p: [0, DY, FZ + 0.072], r: [P2, 0, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2, x = Math.cos(a) * 0.13, y = DY + Math.sin(a) * 0.13;
      b.add(box(Math.abs(Math.cos(a)) * 0.09 + 0.04, Math.abs(Math.sin(a)) * 0.09 + 0.04, 0.05), { ...dark, p: [x * 0.55, DY + (y - DY) * 0.55, FZ + 0.03] });
      b.add(cyl(0.045, 0.045, 0.1, 14), { ...gun2, p: [x, y, FZ + 0.06], r: [P2, 0, 0] });
      b.add(tor(0.04, 0.011, 6, 18), { ...chrome, p: [x, y, FZ + 0.11] });
      b.add(cyl(0.028, 0.028, 0.01, 12), { c: 0x101118, p: [x, y, FZ + 0.111], r: [P2, 0, 0] });
      b.add(box(0.012, 0.035, 0.012), { ...slot, p: [x + Math.cos(a + P2) * 0.05, y + Math.sin(a + P2) * 0.05, FZ + 0.06], r: [0, 0, a] });
    }
    return { headY: top + 0.05, muzzle: [0, DY, FZ + 0.12], aims: true };
  },
  // Monolith (support): a tall chamfered slab with glowing edge lines, a turning chrome ring at its foot, a hovering cap
  gk_colossus: (b) => {
    const { gun, gun2, chrome, slot } = TK;
    const top = tokyoPlinth(b, 0.18);
    b.add(cyl(0.27, 0.31, 0.05, 8), { ...gun2, flat: true, p: [0, top + 0.025, 0], r: [0, PI / 8, 0] });
    const y0 = top + 0.05;
    const prof = (w: number, d: number, c: number): [number, number][] => [[-w + c, -d], [w - c, -d], [w, -d + c], [w, d - c], [w - c, d], [-w + c, d], [-w, d - c], [-w, -d + c]];
    const H = 0.6;
    b.add(extrude(prof(0.13, 0.085, 0.03), H, 0.01), { ...gun, flat: true, p: [0, y0 + H / 2, 0], r: [-P2, 0, 0] });
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      b.add(box(0.012, H - 0.04, 0.012), { ...slot, p: [sx * 0.1225, y0 + H / 2, sz * 0.0775], r: [0, sx * sz * PI / 4, 0] });
    }
    b.add(extrude(prof(0.136, 0.091, 0.034), 0.03, 0.008), { ...gun2, flat: true, p: [0, y0 + H, 0], r: [-P2, 0, 0] }); // shoulder
    // a ring turning at the foot, with two clamps so its motion shows
    b.spin('ring', 'base', [0, y0 + 0.04, 0], [0, 0.6, 0]);
    b.add(tor(0.2, 0.014, 8, 40), { ...chrome, p: [0, y0 + 0.04, 0], r: [P2, 0, 0] });
    for (const a of [0, PI]) b.add(box(0.03, 0.03, 0.04), { ...gun2, p: [Math.sin(a) * 0.2, y0 + 0.04, Math.cos(a) * 0.2], r: [0, a, 0] });
    // the hovering cap
    const capY = y0 + H + 0.1;
    b.spin('cap', 'base', [0, capY, 0], [0, 0.45, 0], 0.018, 1.4);
    b.add(extrude(prof(0.15, 0.1, 0.04), 0.06, 0.01), { ...gun2, flat: true, p: [0, capY, 0], r: [-P2, 0, 0] });
    b.add(extrude(prof(0.145, 0.095, 0.038), 0.012, 0), { ...chrome, p: [0, capY - 0.036, 0], r: [-P2, 0, 0] });
    b.at('base');
    return { headY: capY, muzzle: [0, 0, 0], aims: false };
  },
  // Event Horizon (support): a matte black sphere in a turning segmented disc, held by three curved chrome arms
  gk_blackhole: (b) => {
    const { gun2, dark, chrome, slot } = TK;
    const top = tokyoPlinth(b);
    b.add(cyl(0.31, 0.355, 0.08, 8), { ...gun2, flat: true, p: [0, top + 0.04, 0], r: [0, PI / 8, 0] });
    const t2 = top + 0.08, SY = 0.62, SR = 0.2;
    b.add(cyl(0.05, 0.09, 0.14, 12), { ...dark, p: [0, t2 + 0.07, 0] }); // stub under the sphere
    // front wedge with a slot
    const wedge: [number, number][] = [[-0.05, 0], [0.07, 0], [0.06, 0.15], [0.005, 0.19], [-0.05, 0.14]];
    b.xf([0, t2 - 0.08, 0.36], [0, 0, 0]);
    b.add(extrude(wedge, 0.12, 0.012), { ...gun2, flat: true, r: [0, -P2, 0] });
    b.add(box(0.02, 0.09, 0.012), { ...slot, p: [0, 0.08, 0.082], r: [-0.06, 0, 0] });
    b.xf();
    // three arms, 120 degrees apart: a block on the rim, then a chrome tube curving up and in, pink tip
    for (const a of [PI, PI / 3, -PI / 3]) {
      const dx = Math.sin(a), dz = Math.cos(a), at = (r: number, y: number): [number, number, number] => [dx * r, y, dz * r];
      b.xf(at(0.31, t2), [0, a, 0]);
      b.add(box(0.11, 0.1, 0.12), { ...gun2, flat: true, p: [0, 0.03, 0] });
      b.xf();
      const end = at(0.25, 0.86), prev = at(0.31, 0.83);
      b.add(tube([at(0.31, t2 + 0.06), at(0.41, t2 + 0.25), at(0.4, 0.68), prev, end], 0.028, 28, 8), { ...chrome });
      const d: V3 = [end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]];
      b.add(cyl(0.031, 0.031, 0.035, 12), { ...slot, p: end, dir: d }); // glowing tip band
      b.add(sph(0.029, 10, 8), { ...chrome, p: [end[0] + d[0] * 0.35, end[1] + d[1] * 0.35, end[2] + d[2] * 0.35] });
    }
    // the sphere bobs; the disc turns
    b.spin('sphere', 'base', [0, SY, 0], [0, 0.2, 0], 0.02, 1.2);
    b.add(sph(SR, 24, 16), { c: 0x000000, m: -1, ro: 1, p: [0, SY, 0] }); // pure black: no glow, no rim light (negative metalness)
    b.spin('disc', 'base', [0, SY, 0], [0, 0.5, 0]);
    b.add(cyl(0.33, 0.33, 0.026, 40), { ...TK.gun, p: [0, SY, 0] });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      b.add(box(0.008, 0.03, 0.12), { ...dark, p: [Math.sin(a) * 0.265, SY, Math.cos(a) * 0.265], r: [0, a, 0] });
    }
    b.at('base');
    return { headY: SY, muzzle: [0, 0, 0], aims: false };
  },
  // Juggernaut: an armoured twin-rail cannon on a turntable, collared rails with a glowing strip between, a spinning counterweight drum
  gk_heavy: (b) => {
    const { gun, gun2, dark, chrome, slot } = TK;
    const top = tokyoPlinth(b);
    b.add(cyl(0.22, 0.26, 0.05, 32), { ...chrome, p: [0, top + 0.025, 0] });
    b.at('head');
    const Y = 0.19;
    b.add(cyl(0.11, 0.14, 0.08, 8), { ...dark, p: [0, 0.04, 0] }); // neck
    b.add(rbox(0.26, 0.2, 0.3, 0.03), { ...gun2, p: [0, Y + 0.02, -0.03] }); // housing
    b.add(rbox(0.2, 0.06, 0.22, 0.02), { ...gun, p: [0, Y + 0.14, -0.02] }); // roof
    for (const sx of [-1, 1]) {
      b.add(rbox(0.08, 0.22, 0.28, 0.025), { ...gun2, p: [sx * 0.17, Y + 0.01, -0.04] }); // cheek
      b.add(box(0.012, 0.11, 0.024), { ...slot, p: [sx * 0.212, Y + 0.03, 0.02] });
      b.add(cyl(0.065, 0.065, 0.05, 16), { ...gun, p: [sx * 0.225, Y - 0.02, 0.06], r: [0, 0, P2] }); // trunnion
      b.add(cyl(0.045, 0.045, 0.012, 16), { ...chrome, p: [sx * 0.252, Y - 0.02, 0.06], r: [0, 0, P2] });
    }
    // twin square rails with collars and a glowing strip between them
    for (const sx of [-1, 1]) {
      b.add(box(0.075, 0.075, 0.52), { ...gun2, p: [sx * 0.06, Y, 0.37] });
      b.add(box(0.045, 0.045, 0.005), { c: 0x101118, p: [sx * 0.06, Y, 0.632] });
      for (const z of [0.2, 0.32, 0.44, 0.56]) {
        b.add(box(0.088, 0.088, 0.035), { ...gun, p: [sx * 0.06, Y, z] });
        b.add(box(0.012, 0.03, 0.012), { ...slot, p: [sx * 0.105, Y, z] });
      }
    }
    b.add(box(0.018, 0.012, 0.42), { ...slot, e: 1.1, p: [0, Y, 0.38] });
    // counterweight drum at the back
    b.spin('drum', 'head', [0, Y + 0.08, -0.22], [1.0, 0, 0]);
    b.add(cyl(0.085, 0.085, 0.24, 20), { ...dark, p: [0, Y + 0.08, -0.22], r: [0, 0, P2] });
    for (const sx of [-1, 1]) b.add(cyl(0.09, 0.09, 0.03, 20), { ...chrome, p: [sx * 0.13, Y + 0.08, -0.22], r: [0, 0, P2] });
    b.add(box(0.1, 0.012, 0.03), { ...slot, p: [0, Y + 0.165, -0.22] });
    return { headY: top + 0.05, muzzle: [0, Y, 0.64], aims: true };
  },
  // Flare: a crystal-lens searchlight on a two-armed yoke; the focusing ring turns
  gem_flash: (b) => {
    const { steel, navy, cobalt, trim, blue, crystal } = LK;
    const top = londonPlinth(b);
    b.at('head');
    const Y = 0.26;
    b.add(cyl(0.11, 0.13, 0.05, 24), { ...steel, p: [0, 0.025, 0] });
    const arm: [number, number][] = [[-0.07, 0], [0.07, 0], [0.06, 0.2], [0.03, 0.29], [-0.05, 0.29], [-0.07, 0.2]];
    for (const sx of [-1, 1]) {
      b.add(extrude(arm, 0.06, 0.012), { ...steel, flat: true, p: [sx * 0.17, 0.02, 0], r: [0, P2, 0] });
      b.add(cyl(0.05, 0.05, 0.03, 16), { ...trim, p: [sx * 0.2, Y, 0], r: [0, 0, P2] });
      b.add(box(0.012, 0.045, 0.016), { ...blue, p: [sx * 0.216, Y, 0] });
    }
    b.add(cyl(0.16, 0.16, 0.16, 8), { ...steel, flat: true, p: [0, Y, -0.12], r: [P2, 0, PI / 8] }); // rear housing
    b.add(cyl(0.165, 0.165, 0.035, 8), { ...cobalt, flat: true, p: [0, Y, -0.1], r: [P2, 0, PI / 8] });
    b.add(cyl(0.11, 0.11, 0.14, 20), { ...navy, p: [0, Y, 0.02], r: [P2, 0, 0] }); // waist
    b.add(box(0.012, 0.03, 0.06), { ...blue, p: [0.11, Y, 0.02] });
    b.add(box(0.012, 0.03, 0.06), { ...blue, p: [-0.11, Y, 0.02] });
    b.spin('focus', 'head', [0, Y, 0.15], [0, 0, 0.9]);
    b.add(cyl(0.15, 0.15, 0.12, 24), { ...steel, p: [0, Y, 0.15], r: [P2, 0, 0] });
    for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; b.add(box(0.05, 0.022, 0.1), { ...cobalt, p: [Math.cos(a) * 0.152, Y + Math.sin(a) * 0.152, 0.15], r: [0, 0, a] }); }
    b.add(tor(0.12, 0.014, 8, 32), { ...trim, p: [0, Y, 0.212] });
    b.at('head');
    b.add(ico(0.11, 1), { ...crystal, p: [0, Y, 0.2], s: [1, 1, 0.55] }); // the lens
    return { headY: top, muzzle: [0, Y, 0.26], aims: true };
  },
  // Photon Bloom: a light-mortar flower: six hinged petals around a cup holding a glowing crystal seed
  gem_banana: (b) => {
    const { steel, navy, cobalt, trim, blue, violet, crystal } = LK;
    const top = londonPlinth(b);
    b.add(cyl(0.07, 0.09, 0.06, 20), { ...navy, p: [0, top + 0.03, 0] }); // stem
    // petals (slowly turning as a crown)
    const th = 1.1, rot = (x: number, y: number, z: number): V3 => [x, y * Math.cos(th) - z * Math.sin(th), y * Math.sin(th) + z * Math.cos(th)];
    const plate: [number, number][] = [[-0.075, 0], [0.075, 0], [0.12, 0.13], [0.085, 0.27], [-0.085, 0.27], [-0.12, 0.13]];
    const inset: [number, number][] = plate.map(([x, y]) => [x * 0.7, 0.035 + y * 0.7]);
    b.spin('petals', 'base', [0, top + 0.05, 0], [0, 0.22, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i * PI) / 3 + PI / 6, H = top + 0.05;
      b.xf([Math.sin(a) * 0.15, H, Math.cos(a) * 0.15], [0, a, 0]); // local +Z points outward
      b.add(extrude(plate, 0.028, 0.01), { ...steel, flat: true, r: [th, 0, 0] });
      b.add(extrude(inset, 0.04, 0), { ...navy, flat: true, r: [th, 0, 0] });
      b.add(box(0.07, 0.03, 0.042), { ...cobalt, p: rot(0, 0.255, 0), r: [th, 0, 0] });
      b.add(cyl(0.024, 0.024, 0.07, 12), { ...trim, p: [0, 0.01, 0], r: [0, 0, P2] }); // hinge
      b.add(tor(0.025, 0.006, 6, 12), { ...blue, p: [0, 0.01, 0], r: [0, P2, 0] });
    }
    b.xf();
    b.at('base');
    // the cup and its seed
    const C = top + 0.06;
    b.add(cyl(0.13, 0.1, 0.13, 28), { ...steel, p: [0, C + 0.065, 0] });
    b.add(tor(0.125, 0.016, 8, 32), { ...trim, p: [0, C + 0.13, 0], r: [P2, 0, 0] });
    b.add(tor(0.12, 0.008, 6, 32), { ...blue, p: [0, C + 0.06, 0], r: [P2, 0, 0] });
    b.add(cyl(0.11, 0.11, 0.01, 24), { ...navy, p: [0, C + 0.128, 0] });
    b.add(tor(0.095, 0.008, 6, 32), { ...violet, p: [0, C + 0.135, 0], r: [P2, 0, 0] });
    const SY = C + 0.19;
    b.spin('seed', 'base', [0, SY, 0], [0, 0.8, 0], 0.02, 1.8);
    b.add(oct(0.07), { ...crystal, p: [0, SY, 0], s: [1, 1.35, 1] });
    b.at('base');
    return { headY: SY, muzzle: [0, 0, 0], aims: false };
  },
  // Halo (support): a wide halo ring on three struts turning above the plinth, a floating crystal at its heart
  gem_veo: (b) => {
    const { steel, navy, cobalt, blue, crystal } = LK;
    const top = londonPlinth(b);
    const RY = 0.47;
    b.spin('halo', 'base', [0, RY, 0], [0, 0.35, 0]);
    b.add(tor(0.34, 0.024, 8, 56), { ...steel, p: [0, RY, 0], r: [P2, 0, 0] });
    b.add(tor(0.255, 0.02, 8, 48), { ...steel, p: [0, RY, 0], r: [P2, 0, 0] });
    b.add(tor(0.298, 0.04, 4, 48), { ...navy, p: [0, RY - 0.004, 0], r: [P2, 0, 0], s: [1, 1, 0.35] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      b.add(box(0.075, 0.008, 0.016), { ...blue, p: [Math.sin(a) * 0.298, RY + 0.012, Math.cos(a) * 0.298], r: [0, a + P2, 0] });
    }
    for (const a of [0, (2 * PI) / 3, (-2 * PI) / 3]) {
      const bot: V3 = [Math.sin(a) * 0.07, top + 0.02, Math.cos(a) * 0.07], tp: V3 = [Math.sin(a) * 0.3, RY - 0.02, Math.cos(a) * 0.3];
      const d: V3 = [tp[0] - bot[0], tp[1] - bot[1], tp[2] - bot[2]], len = Math.hypot(...d);
      b.add(cyl(0.018, 0.024, len, 8), { ...steel, flat: true, p: [(bot[0] + tp[0]) / 2, (bot[1] + tp[1]) / 2, (bot[2] + tp[2]) / 2], dir: d });
      b.add(box(0.07, 0.04, 0.07), { ...cobalt, p: [Math.sin(a) * 0.34, RY + 0.01, Math.cos(a) * 0.34], r: [0, a, 0] });
    }
    const CY = 0.5;
    b.spin('crystal', 'base', [0, CY, 0], [0, 0.7, 0], 0.025, 1.4);
    b.add(oct(0.075), { ...crystal, p: [0, CY, 0], s: [1, 1.6, 1] });
    b.at('base');
    return { headY: CY, muzzle: [0, 0, 0], aims: false };
  },
  // Spectra: a tall triangular crystal prism in a three-legged frame with a waist ring and three crystal-lens emitters
  gem_ultra: (b) => {
    const { steel, navy, cobalt, trim, blue, crystal } = LK;
    const top = londonPlinth(b);
    b.add(cyl(0.15, 0.17, 0.05, 24), { ...navy, p: [0, top + 0.025, 0] });
    b.add(tor(0.155, 0.009, 6, 32), { ...blue, p: [0, top + 0.04, 0], r: [P2, 0, 0] });
    const PH = 0.62, PY = top + 0.05 + PH / 2, WY = top + 0.33;
    const legAngles = [PI, PI / 3, -PI / 3];
    for (const a of legAngles) {
      const bot: V3 = [Math.sin(a) * 0.29, top, Math.cos(a) * 0.29], tp: V3 = [Math.sin(a) * 0.15, top + PH - 0.02, Math.cos(a) * 0.15];
      const d: V3 = [tp[0] - bot[0], tp[1] - bot[1], tp[2] - bot[2]], len = Math.hypot(...d);
      const mid: V3 = [(bot[0] + tp[0]) / 2, (bot[1] + tp[1]) / 2, (bot[2] + tp[2]) / 2];
      b.add(cyl(0.035, 0.055, len, 4), { ...steel, flat: true, p: mid, dir: d });
      b.add(box(0.03, 0.03, 0.03), { ...cobalt, p: [tp[0], tp[1] + 0.02, tp[2]] });
      // emitter pod at the waist, facing outward
      const r = 0.235, pod: V3 = [Math.sin(a) * r, WY, Math.cos(a) * r], out: V3 = [Math.sin(a), 0, Math.cos(a)];
      b.add(cyl(0.05, 0.05, 0.06, 16), { ...steel, p: pod, dir: out });
      b.add(tor(0.04, 0.01, 6, 20), { ...trim, p: [pod[0] + out[0] * 0.032, WY, pod[2] + out[2] * 0.032], r: [0, a, 0] });
      b.add(ico(0.03, 1), { ...crystal, p: [pod[0] + out[0] * 0.034, WY, pod[2] + out[2] * 0.034] });
      b.add(box(0.03, 0.016, 0.024), { ...cobalt, p: [pod[0], WY + 0.055, pod[2]], r: [0, a, 0] });
    }
    b.add(tor(0.19, 0.016, 8, 48), { ...steel, p: [0, WY, 0], r: [P2, 0, 0] }); // waist ring
    // the prism turns slowly
    b.spin('prism', 'base', [0, PY, 0], [0, 0.35, 0]);
    b.add(cyl(0.135, 0.135, PH, 3), { ...crystal, e: 0.6, p: [0, PY, 0] });
    b.add(cyl(0.02, 0.02, PH * 0.96, 3), { c: 0xa855ff, e: 0.9, p: [0, PY, 0.07] });
    b.at('base');
    return { headY: WY, muzzle: [0, 0, 0], aims: false };
  },
};

const cache = new Map<string, TowerModel>();

export function towerModel(def: TowerDef): TowerModel {
  let m = cache.get(def.id);
  if (m) return m;
  const b = new Builder();
  const custom = CUSTOM[def.id];
  let headY: number, h: { muzzle: V3; aims: boolean };
  if (custom) ({ headY, ...h } = custom(b, KITS[def.family]));
  else {
    const grade = def.tier <= 4 ? 0 : def.tier <= 8 ? 1 : 2;
    headY = pedestal(b, def.family, grade) + 0.06;
    h = head(b, def, KITS[def.family]);
  }
  m = {
    base: b.build('base')!,
    head: b.build('head'),
    parts: b.parts(),
    headY,
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
