import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export interface PartOpts {
  p?: V3; r?: V3; s?: number | V3; dir?: V3; // dir: orient the part's +Y axis along this vector
  c: number; e?: number; m?: number; ro?: number; flat?: boolean;
}
export interface Mat { c: number; e?: number; m?: number; ro?: number; flat?: boolean }
export interface SpinPart { geo: THREE.BufferGeometry; parent: 'base' | 'head'; pivot: V3; spin: V3; bob: number; bobSpeed: number }

const PI = Math.PI;
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const rbox = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
export const cyl = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);
export const sph = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const oct = (r: number) => new THREE.OctahedronGeometry(r);
export const ico = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
export const tet = (r: number) => new THREE.TetrahedronGeometry(r);
export const dod = (r: number) => new THREE.DodecahedronGeometry(r);
export const tor = (R: number, tube: number, rs = 8, ts = 24, arc = PI * 2) => new THREE.TorusGeometry(R, tube, rs, ts, arc);
export const lathe = (pts: [number, number][], seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
export const tube = (pts: V3[], r: number, seg = 32, rs = 8, closed = false) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.5), seg, r, rs, closed);
export function extrude(pts: [number, number][], depth: number, bevel = 0.02) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

const _up = new THREE.Vector3(0, 1, 0), _p2 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** Drop zero-area triangles (cone tips, sphere poles): they produce NaN normals when flat-shaded. */
function stripDegenerate(g: THREE.BufferGeometry) {
  const pos = g.attributes.position.array as Float32Array;
  const nor = g.attributes.normal?.array as Float32Array | undefined;
  const tris = pos.length / 9;
  const keep: number[] = [];
  for (let t = 0; t < tris; t++) {
    const i = t * 9;
    const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * cx + cy * cy + cz * cz > 1e-16) keep.push(t);
  }
  if (keep.length === tris) return;
  const np = new Float32Array(keep.length * 9), nn = new Float32Array(keep.length * 9);
  keep.forEach((t, k) => {
    np.set(pos.subarray(t * 9, t * 9 + 9), k * 9);
    if (nor) nn.set(nor.subarray(t * 9, t * 9 + 9), k * 9);
  });
  g.setAttribute('position', new THREE.BufferAttribute(np, 3));
  if (nor) g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
}

export class Builder {
  private groups = new Map<string, THREE.BufferGeometry[]>();
  private meta = new Map<string, Omit<SpinPart, 'geo'>>();
  private cur = 'base';
  private offset: V3 = [0, 0, 0];
  private xform: THREE.Matrix4 | null = null;

  /** Apply a group transform (position + euler) to all following parts; call with no args to reset. */
  xf(p?: V3, r?: V3) {
    if (!p) { this.xform = null; return this; }
    this.xform = new THREE.Matrix4().compose(
      new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    return this;
  }

  /** Select the group that subsequent parts are added to. */
  at(name: string, offset: V3 = [0, 0, 0]) { this.cur = name; this.offset = offset; this.xform = null; return this; }

  /** Define an animated sub-part (spins/bobs around its pivot) and select it. */
  spin(name: string, parent: 'base' | 'head', pivot: V3, spin: V3, bob = 0, bobSpeed = 2) {
    this.meta.set(name, { parent, pivot, spin, bob, bobSpeed });
    return this.at(name);
  }

  add(geo: THREE.BufferGeometry, o: PartOpts) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.morphAttributes = {};
    stripDegenerate(g);
    const s = o.s ?? 1;
    _p.set(o.p?.[0] ?? 0, o.p?.[1] ?? 0, o.p?.[2] ?? 0);
    _p.x += this.offset[0]; _p.y += this.offset[1]; _p.z += this.offset[2];
    _e.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
    _q.setFromEuler(_e);
    if (o.dir) _q.setFromUnitVectors(_up, _p2.set(o.dir[0], o.dir[1], o.dir[2]).normalize());
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    if (this.xform) g.applyMatrix4(this.xform);
    if (o.flat) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), pbr = new Float32Array(n * 3);
    _c.setHex(o.c);
    const e = o.e ?? 0, m = o.m ?? 0.1, ro = o.ro ?? 0.6;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      pbr[i * 3] = e; pbr[i * 3 + 1] = m; pbr[i * 3 + 2] = ro;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 3));
    let list = this.groups.get(this.cur);
    if (!list) this.groups.set(this.cur, (list = []));
    list.push(g);
    return this;
  }

  /** Repeat a part n times around the Y axis. */
  ring(n: number, radius: number, make: (i: number, ang: number) => THREE.BufferGeometry, o: PartOpts, phase = 0) {
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * PI * 2;
      this.add(make(i, a), {
        ...o,
        p: [Math.sin(a) * radius + (o.p?.[0] ?? 0), o.p?.[1] ?? 0, Math.cos(a) * radius + (o.p?.[2] ?? 0)],
        r: [o.r?.[0] ?? 0, a + (o.r?.[1] ?? 0), o.r?.[2] ?? 0],
      });
    }
    return this;
  }

  build(name: string): THREE.BufferGeometry | null {
    const list = this.groups.get(name);
    if (!list || !list.length) return null;
    const g = mergeGeometries(list, false)!;
    for (const x of list) x.dispose();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  parts(): SpinPart[] {
    const out: SpinPart[] = [];
    for (const [name, meta] of this.meta) {
      const geo = this.build(name);
      if (!geo) continue;
      geo.translate(-meta.pivot[0], -meta.pivot[1], -meta.pivot[2]);
      out.push({ geo, ...meta });
    }
    return out;
  }
}

/** A radial starburst of n spokes in the XY plane. */
export function burst(b: Builder, n: number, len: number, thick: number, o: PartOpts, inner = 0.02) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const l = len * (i % 2 ? 0.78 : 1);
    const mid = inner + l / 2;
    b.add(cyl(thick * 0.35, thick, l, 6), {
      ...o,
      p: [(o.p?.[0] ?? 0) + Math.sin(a) * mid * (o.r?.[0] ? 1 : 1), (o.p?.[1] ?? 0) + (o.r?.[0] ? 0 : Math.cos(a) * mid), (o.p?.[2] ?? 0) + (o.r?.[0] ? Math.cos(a) * mid : 0)],
      r: o.r?.[0] ? [PI / 2, 0, -a] : [0, 0, -a],
    });
  }
}
