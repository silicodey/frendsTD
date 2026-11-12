import * as THREE from 'three';
import { Builder, box, cone, cyl, ico, lathe, oct, rbox, sph, tet, tor, tube, type Mat, type V3 } from './builder';

const PI = Math.PI, P2 = PI / 2;
const Z: V3 = [P2, 0, 0];

export interface EnemyAnim {
  hover: number; // resting height above ground
  bob: number; bobSpeed: number;
  spin: number; // continuous yaw (rad/s); 0 = face travel direction
  rock: number; // walking side-to-side rock amplitude
  hop: number;
  wiggle: [number, number, number]; // amp, freq, speed (vertex shader)
  tumble?: number;
}
export interface EnemyModel { geo: THREE.BufferGeometry; anim: EnemyAnim; height: number }

const A = (o: Partial<EnemyAnim>): EnemyAnim => ({ hover: 0, bob: 0, bobSpeed: 3, spin: 0, rock: 0, hop: 0, wiggle: [0, 0, 0], ...o });
const EYE: Mat = { c: 0xff3040, e: 3.2 };
const EYEW: Mat = { c: 0xffffff, e: 3.0 };
const g = (c: number, e = 2.4): Mat => ({ c, e });

function legs(b: Builder, n: number, x: number, y: number, z0: number, z1: number, m: Mat, len = 0.16) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
    for (const s of [-1, 1]) {
      b.add(box(len, 0.025, 0.03), { ...m, p: [s * (x + len * 0.35), y, z], r: [0, 0, -s * 0.6] });
      b.add(box(0.025, len * 0.8, 0.03), { ...m, p: [s * (x + len * 0.72), y - len * 0.42, z], r: [0, 0, s * 0.25] });
    }
  }
}

function worm(b: Builder, n: number, r0: number, body: Mat, glow: Mat, heads = 1) {
  let z = 0.3 * (n / 5);
  for (let i = 0; i < n; i++) {
    const r = r0 * (1 - (i / n) * 0.45);
    b.add(sph(r, 12, 10), { ...body, p: [0, r, z], s: [1, 0.9, 1.1] });
    b.add(tor(r * 0.96, r * 0.12, 5, 16), { ...glow, p: [0, r, z + r * 0.15] });
    if (i > 0) b.add(cone(r * 0.25, r * 0.7, 5), { ...body, m: 0.6, ro: 0.3, p: [0, r * 1.95, z] });
    z -= r * 1.45;
  }
  const fz = 0.3 * (n / 5) + r0 * 0.75;
  if (heads === 1) {
    for (const s of [-1, 1]) b.add(sph(r0 * 0.2, 8, 6), { ...EYEW, p: [s * r0 * 0.42, r0 * 1.3, fz] });
    b.add(cone(r0 * 0.5, r0 * 0.5, 8), { ...glow, e: 1.5, p: [0, r0 * 0.75, fz + r0 * 0.1], r: [-P2, 0, 0] });
  } else {
    for (let h = 0; h < heads; h++) {
      const a = ((h - (heads - 1) / 2) / heads) * 1.7;
      const hx = Math.sin(a) * r0 * 1.5, hz = fz + Math.cos(a) * r0 * 0.9, hy = r0 * (1.5 + (h % 2) * 0.5);
      b.add(tube([[0, r0, fz - r0 * 0.6], [hx * 0.5, hy * 0.9, fz], [hx, hy, hz]], r0 * 0.24, 8, 6), { ...body });
      b.add(sph(r0 * 0.42, 10, 8), { ...body, p: [hx, hy, hz + r0 * 0.1], s: [1, 0.85, 1.25] });
      b.add(cone(r0 * 0.24, r0 * 0.3, 6), { ...glow, e: 2, p: [hx, hy - r0 * 0.05, hz + r0 * 0.6], r: [-P2, 0, 0] });
      for (const s of [-1, 1]) {
        b.add(sph(r0 * 0.09, 6, 5), { ...EYEW, p: [hx + s * r0 * 0.2, hy + r0 * 0.2, hz + r0 * 0.42] });
        b.add(cone(r0 * 0.08, r0 * 0.4, 5), { c: 0xffe9c0, m: 0.3, ro: 0.4, p: [hx + s * r0 * 0.25, hy + r0 * 0.5, hz - r0 * 0.05], r: [-0.4, 0, -s * 0.4] });
      }
    }
  }
}

function paperclip(b: Builder, scale: number, r: number, m: Mat, p: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) {
  const pts: [number, number][] = [
    [0.14, 0.25], [0.14, -0.35], [0.07, -0.48], [-0.07, -0.48], [-0.14, -0.35], [-0.14, 0.38], [-0.09, 0.49], [0, 0.49],
    [0.045, 0.38], [0.045, -0.22], [0, -0.31], [-0.045, -0.22], [-0.045, 0.15],
  ];
  b.add(tube(pts.map(([x, y]) => [x * scale, y * scale, 0] as V3), r, 56, 6), { ...m, p, r: rot });
}

const builders: Record<string, (b: Builder) => EnemyAnim> = {
  bug(b) {
    const shell: Mat = { c: 0x2c5a22, m: 0.5, ro: 0.3, flat: true }, gl = g(0x9be36b, 2.2);
    b.add(ico(0.2, 1), { ...shell, p: [0, 0.17, -0.03], s: [1, 0.7, 1.35] });
    b.add(box(0.02, 0.012, 0.42), { ...gl, p: [0, 0.312, -0.03] });
    for (const s of [-1, 1]) b.add(sph(0.035, 6, 5), { ...gl, p: [s * 0.1, 0.27, -0.08] });
    b.add(sph(0.1, 10, 8), { c: 0x1c3a16, m: 0.5, ro: 0.3, p: [0, 0.15, 0.25] });
    for (const s of [-1, 1]) {
      b.add(sph(0.03, 6, 5), { ...EYE, p: [s * 0.05, 0.18, 0.33] });
      b.add(cyl(0.006, 0.01, 0.16, 4), { c: 0x1c3a16, p: [s * 0.05, 0.27, 0.32], r: [0.7, 0, -s * 0.3] });
    }
    legs(b, 3, 0.16, 0.14, -0.14, 0.14, { c: 0x16300f, m: 0.4, ro: 0.4 });
    return A({ rock: 0.12 });
  },
  glitch(b) {
    b.add(tet(0.2), { c: 0x47f5ff, e: 2.0, flat: true, p: [0, 0.3, 0] });
    b.add(tet(0.14), { c: 0xff3df0, e: 2.2, flat: true, p: [0.1, 0.36, 0.05], r: [1, 2, 0.4] });
    b.add(tet(0.12), { c: 0xffffff, e: 1.6, flat: true, p: [-0.1, 0.24, -0.05], r: [2, 0.5, 1.4] });
    b.add(box(0.36, 0.02, 0.05), { c: 0x47f5ff, e: 2.5, p: [0.06, 0.2, 0] });
    b.add(box(0.26, 0.02, 0.05), { c: 0xff3df0, e: 2.5, p: [-0.09, 0.42, 0] });
    return A({ hover: 0.08, bob: 0.06, bobSpeed: 9, spin: 7 });
  },
  spam(b) {
    const y: Mat = { c: 0xf0b63a, m: 0.2, ro: 0.45 };
    b.add(rbox(0.3, 0.2, 0.22, 0.03), { ...y, p: [0, 0.16, 0] });
    b.add(box(0.31, 0.02, 0.23), { ...g(0xffe08a, 1.6), p: [0, 0.2, 0] });
    b.add(cone(0.14, 0.1, 4), { c: 0xc88a1a, flat: true, p: [0, 0.2, 0.112], r: [P2, PI / 4, 0], s: [1.45, 0.3, 1] });
    for (const s of [-1, 1]) b.add(sph(0.03, 6, 5), { ...EYE, p: [s * 0.07, 0.13, 0.115] });
    for (const s of [-1, 1]) b.add(box(0.04, 0.07, 0.06), { c: 0x6b4a10, p: [s * 0.09, 0.035, 0] });
    return A({ hop: 0.14, bobSpeed: 11 });
  },
  trojan(b) {
    const br: Mat = { c: 0x9a6a2a, m: 0.85, ro: 0.32 }, gold: Mat = { c: 0xffd27a, m: 1, ro: 0.2 }, wood: Mat = { c: 0x4a2f18, m: 0.2, ro: 0.6 };
    b.add(rbox(0.34, 0.26, 0.5, 0.05), { ...br, p: [0, 0.3, -0.03] });
    for (const z of [-0.2, -0.03, 0.14]) b.add(box(0.36, 0.28, 0.03), { ...gold, p: [0, 0.3, z] });
    b.add(rbox(0.16, 0.34, 0.16, 0.04), { ...br, p: [0, 0.52, 0.2], r: [0.35, 0, 0] });
    b.add(rbox(0.15, 0.15, 0.3, 0.04), { ...br, p: [0, 0.68, 0.33], r: [0.35, 0, 0] });
    b.add(box(0.03, 0.3, 0.14), { ...g(0xff8a2a, 2.2), p: [0, 0.62, 0.12], r: [0.35, 0, 0] });
    for (const s of [-1, 1]) {
      b.add(sph(0.028, 6, 5), { ...EYE, p: [s * 0.078, 0.7, 0.36] });
      b.add(cone(0.03, 0.09, 4), { ...gold, p: [s * 0.05, 0.8, 0.22] });
      for (const z of [-0.2, 0.15]) {
        b.add(cyl(0.1, 0.1, 0.05, 12), { ...wood, p: [s * 0.2, 0.1, z], r: [0, 0, P2] });
        b.add(cyl(0.035, 0.035, 0.06, 8), { ...gold, p: [s * 0.2, 0.1, z], r: [0, 0, P2] });
      }
    }
    b.add(box(0.44, 0.04, 0.6), { ...wood, p: [0, 0.14, -0.03] });
    return A({ rock: 0.03 });
  },
  worm(b) { worm(b, 5, 0.15, { c: 0x9a2a62, m: 0.25, ro: 0.38 }, g(0xff5aa8, 1.3)); return A({ wiggle: [0.07, 9, 7] }); },
  wormling(b) { worm(b, 3, 0.13, { c: 0xb04a80, m: 0.25, ro: 0.38 }, g(0xff7ac0, 1.3)); return A({ wiggle: [0.06, 11, 10] }); },
  phantom(b) {
    b.add(lathe([[0.001, 0.56], [0.12, 0.53], [0.19, 0.42], [0.2, 0.25], [0.17, 0.1], [0.22, 0.0], [0.12, 0.05], [0.001, 0.08]], 14), { c: 0x7a55e0, e: 0.4, ro: 0.3, m: 0.1 });
    for (const s of [-1, 1]) b.add(sph(0.04, 8, 6), { ...EYEW, p: [s * 0.075, 0.38, 0.165], s: [1, 1.5, 0.6] });
    b.add(sph(0.035, 8, 6), { c: 0x12062a, p: [0, 0.27, 0.185], s: [1.4, 1.8, 0.5] });
    b.add(tor(0.26, 0.012, 5, 24), { ...g(0xb18cff, 2), p: [0, 0.12, 0], r: [P2, 0, 0] });
    return A({ hover: 0.18, bob: 0.07, bobSpeed: 2.5 });
  },
  encryptor(b) {
    const st: Mat = { c: 0x3a6a8c, m: 0.9, ro: 0.25 };
    b.add(rbox(0.36, 0.3, 0.2, 0.04), { ...st, p: [0, 0.2, 0] });
    b.add(tor(0.11, 0.035, 8, 16, PI), { c: 0xb8d8ea, m: 1, ro: 0.15, p: [0, 0.35, 0] });
    for (const s of [-1, 1]) {
      b.add(cyl(0.045, 0.045, 0.02, 12), { ...g(0x5ad1ff, 2.6), p: [0, 0.23, s * 0.102], r: Z });
      b.add(box(0.03, 0.1, 0.02), { ...g(0x5ad1ff, 2.6), p: [0, 0.16, s * 0.102] });
      b.add(sph(0.025, 6, 5), { ...EYE, p: [s * 0.12, 0.29, 0.1] });
    }
    b.add(box(0.37, 0.02, 0.21), { ...g(0x5ad1ff, 1.5), p: [0, 0.08, 0] });
    return A({ hover: 0.1, bob: 0.04, bobSpeed: 3 });
  },
  daemon(b) {
    const w: Mat = { c: 0xdff5e8, m: 0.1, ro: 0.35 }, gl = g(0x4dff9a, 2.4);
    b.add(rbox(0.14, 0.42, 0.14, 0.03), { ...w, p: [0, 0.3, 0] });
    b.add(rbox(0.42, 0.14, 0.14, 0.03), { ...w, p: [0, 0.3, 0] });
    b.add(box(0.06, 0.36, 0.145), { ...gl, p: [0, 0.3, 0] });
    b.add(box(0.36, 0.06, 0.145), { ...gl, p: [0, 0.3, 0] });
    b.add(tor(0.3, 0.014, 5, 28), { ...gl, p: [0, 0.3, 0], r: [P2, 0, 0] });
    for (const s of [-1, 1]) b.add(sph(0.022, 6, 5), { ...EYE, p: [s * 0.035, 0.42, 0.075] });
    return A({ hover: 0.12, bob: 0.06, bobSpeed: 3.5, spin: 1.2 });
  },
  drone(b) {
    const d: Mat = { c: 0x2a2018, m: 0.8, ro: 0.3 };
    b.add(rbox(0.2, 0.09, 0.3, 0.03), { ...d, p: [0, 0.05, 0] });
    b.add(sph(0.05, 8, 6), { ...EYE, p: [0, 0.03, 0.15] });
    b.add(box(0.21, 0.015, 0.16), { ...g(0xff9d47, 2.2), p: [0, 0.097, -0.03] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add(box(0.035, 0.02, 0.2), { ...d, p: [sx * 0.14, 0.06, sz * 0.12], r: [0, sx * sz * 0.9, 0] });
      b.add(cyl(0.11, 0.11, 0.008, 14), { c: 0xffc27a, e: 0.9, ro: 0.2, p: [sx * 0.21, 0.1, sz * 0.2] });
      b.add(cyl(0.02, 0.02, 0.05, 6), { ...d, p: [sx * 0.21, 0.08, sz * 0.2] });
    }
    return A({ bob: 0.05, bobSpeed: 4, rock: 0.06 });
  },
  injector(b) {
    const gl = g(0xd04dff, 2.2);
    b.add(cyl(0.09, 0.09, 0.4, 12), { c: 0xcfd6e6, m: 0.3, ro: 0.15, p: [0, 0.22, 0], r: Z });
    b.add(cyl(0.07, 0.07, 0.3, 12), { ...gl, p: [0, 0.22, 0.02], r: Z, s: [1, 1, 1] });
    b.add(cyl(0.012, 0.03, 0.26, 6), { c: 0xe8eef7, m: 1, ro: 0.15, p: [0, 0.22, 0.33], r: Z });
    b.add(cyl(0.11, 0.11, 0.03, 12), { c: 0x3a1a4a, m: 0.6, ro: 0.3, p: [0, 0.22, -0.2], r: Z });
    b.add(cyl(0.03, 0.03, 0.14, 8), { c: 0x3a1a4a, m: 0.6, ro: 0.3, p: [0, 0.22, -0.28], r: Z });
    b.add(cyl(0.1, 0.1, 0.02, 12), { c: 0x3a1a4a, m: 0.6, ro: 0.3, p: [0, 0.22, -0.35], r: Z });
    for (const s of [-1, 1]) b.add(sph(0.025, 6, 5), { ...EYE, p: [s * 0.06, 0.3, 0.19] });
    legs(b, 2, 0.08, 0.16, -0.1, 0.12, { c: 0x3a1a4a, m: 0.5, ro: 0.4 }, 0.15);
    return A({ rock: 0.08 });
  },
  ransom(b) {
    const d: Mat = { c: 0x5a1414, m: 0.7, ro: 0.35 }, gold: Mat = { c: 0xffc24a, m: 1, ro: 0.2 };
    b.add(rbox(0.5, 0.34, 0.46, 0.05), { ...d, p: [0, 0.25, 0] });
    b.add(cyl(0.25, 0.25, 0.5, 14, ), { ...d, p: [0, 0.42, 0], r: [0, 0, P2], s: [0.55, 1, 0.92] });
    for (const x of [-0.17, 0.17]) b.add(box(0.05, 0.5, 0.48), { ...gold, p: [x, 0.3, 0], s: [1, 1, 1] });
    b.add(rbox(0.13, 0.15, 0.05, 0.02), { ...gold, p: [0, 0.3, 0.24] });
    b.add(cyl(0.025, 0.025, 0.06, 8), { c: 0x000000, p: [0, 0.31, 0.25], r: Z });
    for (const s of [-1, 1]) {
      b.add(box(0.09, 0.035, 0.02), { ...EYE, p: [s * 0.13, 0.46, 0.215], r: [0, 0, -s * 0.3] });
      b.add(tor(0.09, 0.022, 6, 14), { c: 0x9aa2ae, m: 1, ro: 0.25, p: [s * 0.27, 0.22, 0.05], r: [0, P2, 0] });
      b.add(tor(0.09, 0.022, 6, 14), { c: 0x9aa2ae, m: 1, ro: 0.25, p: [s * 0.27, 0.22, -0.1], r: [P2, 0, 0] });
    }
    for (const x of [-0.12, 0, 0.12]) b.add(cone(0.035, 0.12, 5), { ...gold, p: [x, 0.6, 0] });
    b.add(box(0.52, 0.02, 0.48), { ...g(0xff4d4d, 2), p: [0, 0.41, 0] });
    legs(b, 2, 0.22, 0.12, -0.14, 0.14, { c: 0x2a0a0a, m: 0.5, ro: 0.4 }, 0.14);
    return A({ rock: 0.05 });
  },
  hydra(b) { worm(b, 6, 0.2, { c: 0x6e1846, m: 0.4, ro: 0.32 }, g(0xff4a94, 1.6), 3); return A({ wiggle: [0.05, 5, 4] }); },
  hydraling(b) { worm(b, 4, 0.17, { c: 0x8a2658, m: 0.35, ro: 0.33 }, g(0xff62a8, 1.5), 2); return A({ wiggle: [0.06, 7, 6] }); },
  titan(b) {
    const wht: Mat = { c: 0xe9e6f5, m: 0.2, ro: 0.3, flat: true }, drk: Mat = { c: 0x2a1a55, m: 0.7, ro: 0.3, flat: true };
    b.add(lathe([[0.001, 0.5], [0.16, 0.48], [0.26, 0.3], [0.2, 0.12], [0.3, 0], [0.14, 0.04], [0.001, 0.06]], 10), { c: 0x1a1038, m: 0.6, ro: 0.4, flat: true });
    b.add(ico(0.22, 1), { ...wht, p: [-0.055, 0.66, 0], s: [0.75, 1.25, 0.9] });
    b.add(ico(0.22, 1), { ...drk, p: [0.055, 0.66, 0], s: [0.75, 1.25, 0.9] });
    b.add(sph(0.04, 8, 6), { ...g(0x47f5ff, 3), p: [-0.1, 0.7, 0.16], s: [1.3, 0.6, 0.6] });
    b.add(sph(0.04, 8, 6), { ...g(0xff3df0, 3), p: [0.1, 0.7, 0.16], s: [1.3, 0.6, 0.6] });
    b.add(box(0.012, 0.56, 0.42), { ...g(0x9d7bff, 2.6), p: [0, 0.66, 0] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      b.add(oct(0.06), { ...g(i % 2 ? 0x47f5ff : 0xff3df0, 2.2), flat: true, p: [Math.sin(a) * 0.2, 1.02 + (i % 2) * 0.04, Math.cos(a) * 0.2], s: [0.5, 1.8, 0.5] });
    }
    for (const s of [-1, 1]) b.add(rbox(0.16, 0.08, 0.2, 0.03), { ...(s < 0 ? wht : drk), p: [s * 0.3, 0.42, 0], r: [0, 0, -s * 0.3] });
    b.add(tor(0.36, 0.016, 5, 32), { ...g(0x9d7bff, 2.2), p: [0, 0.2, 0], r: [P2, 0, 0] });
    return A({ hover: 0.16, bob: 0.05, bobSpeed: 1.6 });
  },
  clip(b) {
    paperclip(b, 0.6, 0.026, { c: 0xdfe6f0, m: 1, ro: 0.18 }, [0, 0.3, 0], [0, 0.7, 0.35]);
    b.add(sph(0.03, 6, 5), { ...EYE, p: [0, 0.4, 0.12] });
    return A({ hop: 0.08, bobSpeed: 14, rock: 0.2 });
  },
  maximizer(b) {
    const steel: Mat = { c: 0xdfe6f0, m: 1, ro: 0.16 };
    b.add(cyl(0.3, 0.36, 0.12, 10), { c: 0x2a2e36, m: 0.85, ro: 0.3, flat: true, p: [0, 0.06, 0] });
    b.add(tor(0.33, 0.02, 6, 10), { ...g(0xff3040, 2.4), p: [0, 0.12, 0], r: [P2, 0, 0] });
    paperclip(b, 1.25, 0.05, steel, [0, 0.74, 0], [0, 0, 0]);
    paperclip(b, 1.25, 0.05, steel, [0, 0.74, 0], [0, P2, 0]);
    paperclip(b, 0.95, 0.035, { c: 0x9aa6b8, m: 1, ro: 0.2 }, [0, 0.7, 0], [0, PI / 4, PI]);
    b.add(sph(0.13, 16, 12), { ...EYE, p: [0, 0.78, 0] });
    b.add(tor(0.17, 0.02, 6, 20), { c: 0x2a2e36, m: 0.9, ro: 0.25, p: [0, 0.78, 0] });
    b.add(tor(0.17, 0.02, 6, 20), { c: 0x2a2e36, m: 0.9, ro: 0.25, p: [0, 0.78, 0], r: [0, P2, 0] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      paperclip(b, 0.3, 0.014, steel, [Math.sin(a) * 0.42, 0.5 + (i % 3) * 0.22, Math.cos(a) * 0.42], [i, a, i * 0.7]);
    }
    return A({ bob: 0.03, bobSpeed: 1.5, spin: 0.7 });
  },
};

const cache = new Map<string, EnemyModel>();
export function enemyModel(id: string): EnemyModel {
  let m = cache.get(id);
  if (m) return m;
  const b = new Builder();
  const fn = builders[id] ?? builders.bug;
  const anim = fn(b);
  const geo = b.build('base')!;
  m = { geo, anim, height: geo.boundingBox!.max.y };
  cache.set(id, m);
  return m;
}
