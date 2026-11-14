import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Theme } from '../data/types';
import { mulberry32 } from '../data/levels';
import { CELL_BLOCKED, CELL_CORE, CELL_FREE, CELL_PORTAL, CELL_VOID, type Sim } from '../sim/sim';
import { Builder, box, cone, cyl, ico, oct, rbox, sph, tor, type Mat } from './builder';
import { additive, makePbr } from './materials';
import type { Engine } from './engine';

const PI = Math.PI, P2 = PI / 2;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

const NOISE = /* glsl */ `
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
`;

function tileTextures(accent: number, variant: number) {
  const S = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const map = mk(), em = mk(), bump = mk();
  const m = map.getContext('2d')!, e = em.getContext('2d')!, b = bump.getContext('2d')!;
  const rng = mulberry32(1234 + variant * 77);
  // albedo
  m.fillStyle = '#aab0bb'; m.fillRect(0, 0, S, S);
  const grd = m.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
  m.fillStyle = grd; m.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { m.fillStyle = `rgba(${rng() < 0.5 ? 0 : 255},${rng() < 0.5 ? 0 : 255},${rng() < 0.5 ? 0 : 255},${rng() * 0.05})`; m.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  m.strokeStyle = 'rgba(0,0,0,0.55)'; m.lineWidth = 10; m.strokeRect(5, 5, S - 10, S - 10);
  m.fillStyle = 'rgba(255,255,255,0.10)'; m.fillRect(26, 26, S - 52, S - 52);
  m.strokeStyle = 'rgba(0,0,0,0.5)'; m.lineWidth = 3; m.strokeRect(26, 26, S - 52, S - 52);
  for (const [x, y] of [[40, 40], [S - 40, 40], [40, S - 40], [S - 40, S - 40]]) {
    m.fillStyle = 'rgba(0,0,0,0.6)'; m.beginPath(); m.arc(x, y, 5, 0, 7); m.fill();
    m.fillStyle = 'rgba(255,255,255,0.35)'; m.beginPath(); m.arc(x - 1, y - 1, 2, 0, 7); m.fill();
  }
  // bump
  b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
  b.strokeStyle = '#303030'; b.lineWidth = 10; b.strokeRect(5, 5, S - 10, S - 10);
  b.fillStyle = '#9a9a9a'; b.fillRect(26, 26, S - 52, S - 52);
  b.strokeStyle = '#404040'; b.lineWidth = 3; b.strokeRect(26, 26, S - 52, S - 52);
  // emissive
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  e.strokeStyle = '#fff'; e.lineCap = 'round';
  e.shadowColor = '#fff'; e.shadowBlur = 6;
  e.lineWidth = 2.5; e.globalAlpha = 0.85;
  const L = 34;
  for (const [x, y, dx, dy] of [[16, 16, 1, 1], [S - 16, 16, -1, 1], [16, S - 16, 1, -1], [S - 16, S - 16, -1, -1]]) {
    e.beginPath(); e.moveTo(x + dx * L, y); e.lineTo(x, y); e.lineTo(x, y + dy * L); e.stroke();
  }
  if (variant === 0) {
    e.globalAlpha = 0.5; e.lineWidth = 3;
    e.beginPath(); e.arc(S / 2, S / 2, 46, 0, PI * 2); e.stroke();
    e.globalAlpha = 0.3; e.lineWidth = 2;
    e.beginPath(); e.arc(S / 2, S / 2, 60, 0.3, 1.3); e.stroke();
    e.beginPath(); e.arc(S / 2, S / 2, 60, 3.4, 4.4); e.stroke();
    b.strokeStyle = '#555'; b.lineWidth = 5; b.beginPath(); b.arc(S / 2, S / 2, 46, 0, PI * 2); b.stroke();
  } else {
    e.globalAlpha = 0.45; e.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      let x = 50 + rng() * 150, y = 50 + rng() * 150;
      e.beginPath(); e.moveTo(x, y);
      for (let k = 0; k < 3; k++) { if (rng() < 0.5) x = 44 + rng() * 168; else y = 44 + rng() * 168; e.lineTo(x, y); }
      e.stroke();
      e.beginPath(); e.arc(x, y, 5, 0, 7); e.fill();
    }
    m.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 4; i++) m.fillRect(48 + i * 44, 200, 30, 8);
  }
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4; t.generateMipmaps = true;
    return t;
  };
  return { map: tex(map, true), emissiveMap: tex(em, true), bumpMap: tex(bump, false) };
}

export class Board {
  group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private pathMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  private portalMats: THREE.ShaderMaterial[] = [];
  private core = new THREE.Group();
  private coreCrystal!: THREE.Mesh;
  private coreRings: THREE.Mesh[] = [];
  private coreLight!: THREE.PointLight;
  private extraCores: THREE.Group[] = [];
  private coreMat = makePbr();
  private coreFlash = 0;
  private drift: THREE.InstancedMesh | null = null;
  private driftMat: THREE.ShaderMaterial | null = null;
  private motes!: THREE.Points;
  private moteMat!: THREE.ShaderMaterial;
  private underMat!: THREE.ShaderMaterial;
  private gridMat!: THREE.ShaderMaterial;
  private tileMats: THREE.MeshStandardMaterial[] = [];
  private env: THREE.WebGLRenderTarget | null = null;
  key!: THREE.DirectionalLight;

  constructor(private engine: Engine, private sim: Sim, public theme: Theme) {
    const { scene } = engine;
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(new THREE.Color(theme.fog).multiplyScalar(0.55).getHex(), 0.016);
    this.pathMat = this.makePathMat();
    this.skyMat = this.makeSky();
    this.buildEnvMap();
    this.buildLights();
    this.buildTiles();
    this.buildPath();
    this.buildStructure();
    this.buildProps();
    this.buildPortals();
    this.buildCore();
    this.buildBackdrop();
  }

  private own<T extends { dispose(): void }>(x: T): T { this.disposables.push(x); return x; }

  // ---------- environment map (reflections) ----------
  private buildEnvMap() {
    const t = this.theme;
    const s = new THREE.Scene();
    const geo = new THREE.SphereGeometry(20, 24, 16);
    const bg = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { a: { value: new THREE.Color(t.sky[0]) }, b: { value: new THREE.Color(t.sky[1]) }, c: { value: new THREE.Color(t.rim) } },
      vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 a,b,c; varying vec3 d; void main(){ vec3 n = normalize(d); vec3 col = mix(b*1.2, a, smoothstep(-0.2,0.8,n.y)); col += c * 0.5 * smoothstep(0.3, -0.5, n.y); gl_FragColor = vec4(col,1.0); }',
    }));
    s.add(bg);
    const panel = (color: number, intensity: number, pos: [number, number, number], size: [number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
      return m;
    };
    const ps = [
      panel(t.key, 9, [-6, 10, 5], [8, 8]), panel(t.rim, 6, [10, 2, -8], [5, 10]), panel(t.tileAccent, 4, [-10, 1, -6], [3, 10]),
      panel(0xffffff, 3, [0, 3, 12], [10, 2]), panel(t.rim, 3, [0, -10, 0], [14, 14]),
    ];
    const pm = new THREE.PMREMGenerator(this.engine.renderer);
    this.env = pm.fromScene(s, 0.035);
    this.engine.scene.environment = this.env.texture;
    this.engine.scene.environmentIntensity = 0.75;
    pm.dispose(); geo.dispose(); (bg.material as THREE.Material).dispose();
    for (const p of ps) { p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
  }

  private buildLights() {
    const t = this.theme, g = this.group;
    g.add(new THREE.HemisphereLight(new THREE.Color(t.rim).lerp(new THREE.Color(0xffffff), 0.5), new THREE.Color(t.sky[0]), 0.55));
    const key = (this.key = new THREE.DirectionalLight(t.key, 3.1));
    key.position.set(-5.5, 13, 6.5);
    key.castShadow = true;
    const s = Math.max(this.sim.cols, this.sim.rows) / 2 + 2.5;
    key.shadow.camera.left = -s; key.shadow.camera.right = s; key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 3;
    g.add(key, key.target);
    const rim = new THREE.DirectionalLight(t.rim, 1.5);
    rim.position.set(8, 5, -10);
    g.add(rim, rim.target);
    const fill = new THREE.DirectionalLight(t.tileAccent, 0.5);
    fill.position.set(6, 3, 9);
    g.add(fill, fill.target);
  }

  // ---------- tiles ----------
  private buildTiles() {
    const { sim, theme } = this;
    const geo = this.own(new RoundedBoxGeometry(0.955, 0.26, 0.955, 3, 0.045));
    const cells: [number, number][][] = [[], []];
    const rng = mulberry32(sim.level.seed + 3);
    for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
      const v = sim.grid[r * sim.cols + c];
      if (v === CELL_FREE || v === CELL_BLOCKED) cells[v === CELL_FREE && rng() < 0.62 ? 0 : 1].push([c, r]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), base = new THREE.Color(theme.tile);
    for (let v = 0; v < 2; v++) {
      const tx = tileTextures(theme.tileAccent, v);
      const mat = this.own(new THREE.MeshStandardMaterial({
        map: tx.map, emissiveMap: tx.emissiveMap, bumpMap: tx.bumpMap, bumpScale: 2.2,
        emissive: new THREE.Color(theme.tileAccent), emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.52, envMapIntensity: 0.9,
      }));
      this.own(tx.map); this.own(tx.emissiveMap); this.own(tx.bumpMap);
      this.tileMats.push(mat);
      const mesh = new THREE.InstancedMesh(geo, mat, cells[v].length);
      cells[v].forEach(([c, r], i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.floor(rng() * 4) * P2);
        m4.compose(new THREE.Vector3(sim.cellX(c), -0.13, sim.cellZ(r)), q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m4);
        const k = 4.6 + rng() * 1.6;
        col.copy(base).multiplyScalar(k);
        mesh.setColorAt(i, col);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  // ---------- path ----------
  private makePathMat() {
    return this.own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(this.theme.pathGlow) }, uBoost: { value: 0 } },
      vertexShader: /* glsl */ `attribute float aCurve; varying vec2 vUv; varying float vCurve; void main(){ vUv = uv; vCurve = aCurve; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uBoost; uniform vec3 uColor; varying vec2 vUv; varying float vCurve;
        void main(){
          float u = vUv.x, v = vUv.y;
          float cu = abs(u - 0.5);
          float edge = smoothstep(0.035, 0.0, abs(cu - 0.44)) * 1.5;
          float chev = fract(v * 1.25 + cu * 1.1 - uTime * 0.9);
          float arrows = smoothstep(0.16, 0.0, chev) * smoothstep(0.36, 0.3, cu) * 0.55;
          float pulse = pow(max(0.0, sin(v * 0.9 - uTime * 2.6)), 12.0) * smoothstep(0.46, 0.2, cu) * (0.35 + uBoost);
          float base = 0.06 * smoothstep(0.5, 0.2, cu);
          float dots = smoothstep(0.03, 0.0, abs(cu - 0.36)) * step(0.5, fract(v * 4.0)) * 0.35;
          float straight = 1.0 - clamp(vCurve, 0.0, 1.0); // lengthwise patterns shear across corner triangles, so fade them there
          vec3 col = uColor * (edge + (arrows + dots) * straight + pulse + base);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
  }

  private buildPath() {
    const { sim, theme } = this;
    // recessed floor
    const cells: [number, number][] = [];
    for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
      const v = sim.grid[r * sim.cols + c];
      if (v !== CELL_FREE && v !== CELL_BLOCKED && v !== CELL_VOID) cells.push([c, r]);
    }
    const fgeo = this.own(new THREE.BoxGeometry(1.0, 0.1, 1.0));
    const fmat = this.own(new THREE.MeshStandardMaterial({ color: theme.path, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.3 }));
    const floor = new THREE.InstancedMesh(fgeo, fmat, cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach(([c, r], i) => { m4.makeTranslation(sim.cellX(c), -0.2, sim.cellZ(r)); floor.setMatrixAt(i, m4); });
    floor.receiveShadow = true;
    this.group.add(floor);
    // glowing ribbon(s)
    sim.paths.forEach((p, pi) => {
      const n = p.xs.length;
      const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), curve = new Float32Array(n * 2), idx: number[] = [];
      const W = 0.41;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = p.xs[b] - p.xs[a], tz = p.zs[b] - p.zs[a];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const y = -0.148 + pi * 0.0008;
        pos.set([p.xs[i] - tz * W, y, p.zs[i] + tx * W, p.xs[i] + tz * W, y, p.zs[i] - tx * W], i * 6);
uv.set([0, p.cum[i], 1, p.cum[i]], i * 4);
        if (i > 0 && i < n - 1) {
          const ax = p.xs[i] - p.xs[i - 1], az = p.zs[i] - p.zs[i - 1], bx = p.xs[i + 1] - p.xs[i], bz = p.zs[i + 1] - p.zs[i];
          const turning = Math.abs(ax * bz - az * bx) > 1e-6 || Math.hypot(ax, az) < 1e-6 || Math.hypot(bx, bz) < 1e-6;
          curve[i * 2] = curve[i * 2 + 1] = turning ? 1 : 0;
        }
        if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = this.own(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aCurve', new THREE.BufferAttribute(curve, 1));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, this.pathMat);
      mesh.renderOrder = 1;
      this.group.add(mesh);
    });
  }

  // ---------- the floating platform ----------
  private buildStructure() {
    const { sim, theme } = this;
    const W = sim.cols, D = sim.rows;
    const b = new Builder();
    const hull: Mat = { c: new THREE.Color(theme.tile).multiplyScalar(0.55).getHex(), m: 0.85, ro: 0.4 };
    const hull2: Mat = { c: new THREE.Color(theme.tile).multiplyScalar(0.9).getHex(), m: 0.8, ro: 0.35 };
    const glow: Mat = { c: theme.tileAccent, e: 2.4 };
    const glow2: Mat = { c: theme.rim, e: 2.2 };
    b.add(rbox(W + 0.9, 0.5, D + 0.9, 0.1), { ...hull, p: [0, -0.49, 0] });
    b.add(rbox(W + 0.5, 0.2, D + 0.5, 0.05), { ...hull2, p: [0, -0.31, 0] });
    // rim light strips
    for (const s of [-1, 1]) {
      b.add(box(W + 0.6, 0.035, 0.03), { ...glow, p: [0, -0.5, s * (D / 2 + 0.455)] });
      b.add(box(0.03, 0.035, D + 0.6), { ...glow, p: [s * (W / 2 + 0.455), -0.5, 0] });
    }
    // side greebles
    const rng = mulberry32(sim.level.seed + 99);
    for (let i = 0; i < D; i++) for (const s of [-1, 1]) {
      const z = i - (D - 1) / 2;
      if (rng() < 0.7) b.add(box(0.1, 0.22 + rng() * 0.2, 0.5 + rng() * 0.3), { ...hull2, p: [s * (W / 2 + 0.5), -0.62, z] });
      if (rng() < 0.4) b.add(box(0.04, 0.04, 0.2), { ...(rng() < 0.5 ? glow : glow2), p: [s * (W / 2 + 0.56), -0.56 - rng() * 0.1, z] });
    }
    for (let i = 0; i < W; i++) for (const s of [-1, 1]) {
      const x = i - (W - 1) / 2;
      if (rng() < 0.7) b.add(box(0.5 + rng() * 0.3, 0.22 + rng() * 0.2, 0.1), { ...hull2, p: [x, -0.62, s * (D / 2 + 0.5)] });
      if (rng() < 0.4) b.add(box(0.2, 0.04, 0.04), { ...(rng() < 0.5 ? glow : glow2), p: [x, -0.56 - rng() * 0.1, s * (D / 2 + 0.56)] });
    }
    // corner pylons
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 + 0.3), z = sz * (D / 2 + 0.3);
      b.add(cyl(0.16, 0.22, 1.1, 6), { ...hull2, flat: true, p: [x, -0.2, z] });
      b.add(cyl(0.05, 0.05, 0.5, 6), { ...glow, p: [x, 0.55, z] });
      b.add(oct(0.1), { ...glow2, flat: true, p: [x, 0.95, z], s: [0.7, 1.4, 0.7] });
      b.add(tor(0.2, 0.02, 6, 6), { ...hull, p: [x, 0.36, z], r: [P2, 0, 0] });
    }
    // underside
    b.add(rbox(W - 0.6, 0.5, D - 0.6, 0.1), { ...hull, p: [0, -0.95, 0] });
    b.add(rbox(W - 3, 0.6, D - 4, 0.1), { ...hull2, p: [0, -1.45, 0] });
    for (const s of [-1, 1]) b.add(box(W - 3.1, 0.04, 0.04), { ...glow, p: [0, -1.5, s * (D / 2 - 2)] });
    b.add(cyl(1.5, 0.7, 1.1, 8), { ...hull, flat: true, p: [0, -2.25, 0] });
    b.add(tor(1.05, 0.05, 6, 8), { ...glow, p: [0, -2.4, 0], r: [P2, 0, 0] });
    b.add(cone(0.6, 1.4, 8), { ...glow2, e: 3, flat: true, p: [0, -3.4, 0], r: [PI, 0, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add(cyl(0.3, 0.12, 1.6, 6), { ...hull2, flat: true, p: [sx * (W / 2 - 1.2), -1.7, sz * (D / 2 - 1.6)] });
      b.add(cone(0.12, 0.5, 6), { ...glow, flat: true, p: [sx * (W / 2 - 1.2), -2.7, sz * (D / 2 - 1.6)], r: [PI, 0, 0] });
    }
    const geo = this.own(b.build('base')!);
    const mesh = new THREE.Mesh(geo, this.own(makePbr()));
    mesh.castShadow = false; mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildProps() {
    const { sim, theme } = this;
    const b = new Builder();
    const rng = mulberry32(sim.level.seed + 55);
    const acc: Mat = { c: theme.tileAccent, e: 2.3 }, acc2: Mat = { c: theme.rim, e: 2.3 };
    let any = false;
    for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
      if (sim.grid[r * sim.cols + c] !== CELL_BLOCKED) continue;
      any = true;
      const x = sim.cellX(c), z = sim.cellZ(r);
      b.at('base', [x, 0, z]);
      if (theme.prop === 'server') {
        const kind = rng();
        if (kind < 0.6) {
          const h = 0.55 + rng() * 0.6, rot = rng() < 0.5 ? 0 : P2;
          b.add(rbox(0.62, h, 0.5, 0.03), { c: 0x141c26, m: 0.85, ro: 0.35, p: [0, h / 2, 0], r: [0, rot, 0] });
          const rows = Math.floor(h / 0.11);
          for (let i = 0; i < rows; i++) {
            const y = 0.09 + i * 0.105;
            for (const s of [-1, 1]) {
              const lit = rng();
              const led = box(0.42, 0.014, 0.01);
              b.add(led, { ...(lit < 0.2 ? acc2 : lit < 0.75 ? acc : { c: 0x0a0e14 }), p: rot ? [s * 0.253, y, 0] : [0, y, s * 0.253], r: [0, rot, 0] });
            }
          }
          b.add(box(0.5, 0.03, 0.38), { c: 0x2a3644, m: 0.9, ro: 0.3, p: [0, h + 0.015, 0], r: [0, rot, 0] });
        } else if (kind < 0.85) {
          b.add(cyl(0.3, 0.34, 0.12, 8), { c: 0x1a2634, m: 0.8, ro: 0.4, flat: true, p: [0, 0.06, 0] });
          b.add(cyl(0.035, 0.05, 0.7, 6), { c: 0x8c99a6, m: 1, ro: 0.25, p: [0, 0.45, 0] });
          b.add(cyl(0.3, 0.05, 0.1, 14), { c: 0x3a4a5c, m: 0.9, ro: 0.3, p: [0, 0.82, 0.05], r: [1.0, rng() * 6, 0] });
          b.add(sph(0.04, 8, 6), { ...acc2, p: [0, 0.98, 0] });
        } else {
          // cooling stack
          for (let i = 0; i < 3; i++) b.add(cyl(0.3 - i * 0.05, 0.3 - i * 0.05, 0.1, 12), { c: 0x1e2a38, m: 0.85, ro: 0.3, p: [0, 0.07 + i * 0.16, 0] });
          for (let i = 0; i < 3; i++) b.add(tor(0.27 - i * 0.05, 0.014, 5, 20), { ...acc, p: [0, 0.14 + i * 0.16, 0], r: [P2, 0, 0] });
        }
      } else if (theme.prop === 'crystal') {
        const n = 3 + Math.floor(rng() * 3);
        b.add(cyl(0.34, 0.38, 0.06, 7), { c: 0x1a1230, m: 0.7, ro: 0.5, flat: true, p: [0, 0.03, 0] });
        for (let i = 0; i < n; i++) {
          const a = rng() * PI * 2, d = i === 0 ? 0 : 0.12 + rng() * 0.14, h = i === 0 ? 0.5 + rng() * 0.5 : 0.2 + rng() * 0.35;
          const tint = rng() < 0.5 ? theme.tileAccent : theme.rim;
          b.add(oct(0.13 + rng() * 0.05), { c: tint, e: 0.9 + rng() * 0.8, m: 0.2, ro: 0.12, flat: true, p: [Math.cos(a) * d, h * 0.55, Math.sin(a) * d], s: [0.8, h / 0.26, 0.8], r: [(rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5] });
        }
      } else {
        const h = 0.6 + rng() * 0.7;
        b.add(cyl(0.34, 0.4, 0.1, 6), { c: 0x1c120e, m: 0.6, ro: 0.5, flat: true, p: [0, 0.05, 0] });
        b.add(cone(0.24, h, 5), { c: 0x120a08, m: 0.75, ro: 0.28, flat: true, p: [0, 0.1 + h / 2, 0], r: [0, rng() * 3, 0] });
        for (let i = 0; i < 2; i++) b.add(tor(0.2 - i * 0.07, 0.016, 5, 5), { ...acc, p: [0, 0.2 + i * h * 0.3, 0], r: [P2, 0, rng() * 3] });
        b.add(ico(0.07, 0), { ...acc2, e: 3, flat: true, p: [0, 0.22 + h + 0.08, 0] });
      }
    }
    if (!any) return;
    const mesh = new THREE.Mesh(this.own(b.build('base')!), this.own(makePbr()));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ---------- spawn portals ----------
  private buildPortals() {
    const b = new Builder();
    const hostile = 0xff2d55;
    for (const p of this.sim.portal) {
      const ang = Math.atan2(p.dx, p.dz);
      b.at('base').xf([p.x, 0, p.z], [0, ang, 0]);
      b.add(tor(0.46, 0.06, 8, 28), { c: 0x16090f, m: 0.9, ro: 0.25, p: [0, 0.42, -0.1] });
      b.add(tor(0.46, 0.022, 6, 28), { c: hostile, e: 3, p: [0, 0.42, -0.04] });
      for (const s of [-1, 1]) {
        b.add(rbox(0.16, 0.3, 0.26, 0.03), { c: 0x1c0d14, m: 0.85, ro: 0.3, p: [s * 0.44, 0.0, -0.1] });
        b.add(box(0.03, 0.2, 0.2), { c: hostile, e: 2.4, p: [s * 0.525, 0.0, -0.1] });
        b.add(cone(0.05, 0.2, 5), { c: 0x16090f, m: 0.9, ro: 0.25, flat: true, p: [s * 0.36, 0.9, -0.1], r: [0, 0, -s * 0.5] });
      }
      const mat = this.own(additive({
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(hostile) }, uColor2: { value: new THREE.Color(0xff9a3a) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor, uColor2; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
            float sw = sin(a * 3.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5;
            float sw2 = sin(a * 5.0 - r * 14.0 + uTime * 2.5) * 0.5 + 0.5;
            float m = smoothstep(1.0, 0.75, r);
            vec3 col = mix(uColor, uColor2, sw2) * (0.35 + sw * 1.4) * m + vec3(1.0, 0.8, 0.8) * smoothstep(0.35, 0.0, r) * 1.2;
            gl_FragColor = vec4(col * (0.7 + 0.3 * sin(uTime * 7.0)), 1.0);
          }`,
      }));
      this.portalMats.push(mat);
      const disc = new THREE.Mesh(this.own(new THREE.CircleGeometry(0.44, 28)), mat);
      disc.position.set(p.x - p.dx * 0.1, 0.42, p.z - p.dz * 0.1);
      disc.rotation.y = ang;
      this.group.add(disc);
    }
    const mesh = new THREE.Mesh(this.own(b.build('base')!), this.own(makePbr()));
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  // ---------- the Core (what you defend) ----------
  private buildCore() {
    const { core } = this.sim;
    this.own(this.coreMat);
    const b = new Builder();
    const metal: Mat = { c: 0x26303e, m: 0.9, ro: 0.28 }, trim: Mat = { c: 0xcfe0f5, m: 1, ro: 0.15 }, gl: Mat = { c: 0x5ff2ff, e: 2.8 };
    b.add(cyl(0.44, 0.48, 0.12, 8), { ...metal, flat: true, p: [0, -0.08, 0] });
    b.add(tor(0.42, 0.02, 6, 8), { ...gl, p: [0, -0.02, 0], r: [P2, 0, 0] });
    b.ring(4, 0.34, () => box(0.07, 0.4, 0.1), { ...metal, p: [0, 0.16, 0], r: [0.35, 0, 0] });
    b.ring(4, 0.27, () => box(0.03, 0.12, 0.03), { ...gl, p: [0, 0.38, 0] });
    const baseMesh = new THREE.Mesh(this.own(b.build('base')!), this.coreMat);
    baseMesh.castShadow = true;
    this.core.add(baseMesh);
    const c2 = new Builder();
    c2.add(ico(0.24, 0), { c: 0xbff8ff, e: 3.2, flat: true, s: [1, 1.35, 1] });
    c2.add(ico(0.3, 1), { c: 0x5ff2ff, e: 0.6, m: 0.3, ro: 0.05, flat: true, s: [0.6, 0.6, 0.6], p: [0, 0, 0] });
    this.coreCrystal = new THREE.Mesh(this.own(c2.build('base')!), this.coreMat);
    this.coreCrystal.position.y = 0.72;
    this.core.add(this.coreCrystal);
    for (let i = 0; i < 2; i++) {
      const r = new Builder();
      r.add(tor(0.4 + i * 0.09, 0.022, 6, 40), { ...trim });
      r.ring(3, 0.4 + i * 0.09, () => oct(0.04), { ...gl, flat: true, r: [P2, 0, 0] });
      const m = new THREE.Mesh(this.own(r.build('base')!), this.coreMat);
      m.position.y = 0.72; m.castShadow = true;
      this.coreRings.push(m); this.core.add(m);
    }
    const beam = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.1, 0.34, 7, 16, 1, true)), this.own(additive({
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0x5ff2ff) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; void main(){ float f = pow(clamp(abs(normalize(vN).z), 0.0, 1.0), 1.5); gl_FragColor = vec4(uColor * f * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * 0.55, 1.0); }',
    })));
    beam.position.y = 4.1;
    this.core.add(beam);
    this.coreLight = new THREE.PointLight(0x5ff2ff, 4, 6, 1.5);
    this.coreLight.position.y = 0.9;
    this.core.add(this.coreLight);
    this.core.position.set(core.x, 0, core.z);
    this.group.add(this.core);
    // duels: one Core at the end of each lane (extra ones share meshes, no extra light)
    for (const c of this.sim.cores) {
      if (Math.hypot(c.x - core.x, c.z - core.z) < 0.1) continue;
      const g = new THREE.Group();
      for (const ch of this.core.children) if (!(ch instanceof THREE.Light)) g.add(ch.clone());
      g.position.set(c.x, 0, c.z);
      this.extraCores.push(g);
      this.group.add(g);
    }
    // the neutral strip between two duel boards
    const voids: number[] = [];
    for (let r = 0; r < this.sim.rows; r++) if (this.sim.grid[r * this.sim.cols + 1] === CELL_VOID) voids.push(r);
    if (voids.length) {
      const z = this.sim.cellZ(voids[0]), W = this.sim.cols;
      const d = new Builder();
      d.add(box(W + 0.4, 0.05, 0.05), { c: 0xdfe8ff, e: 2.2, p: [0, -0.02, z] });
      for (const s of [-1, 1]) d.add(box(W + 0.4, 0.03, 0.02), { c: this.theme.tileAccent, e: 2.4, p: [0, -0.05, z + s * 0.32] });
      for (let i = 0; i < 9; i++) d.add(oct(0.06), { c: this.theme.rim, e: 2.6, flat: true, p: [(i - 4) * (W / 9), 0.02, z], s: [1.4, 0.4, 0.6] });
      const strip = new THREE.Mesh(this.own(d.build('base')!), this.own(makePbr()));
      this.group.add(strip);
    }
  }

  coreHit() { this.coreFlash = 1; }

  // ---------- sky, depth, atmosphere ----------
  private makeSky() {
    const t = this.theme;
    return this.own(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(t.sky[0]) }, uHorizon: { value: new THREE.Color(t.sky[1]) }, uNebula: { value: new THREE.Color(t.sky[2]) },
        uTime: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uNebula; uniform float uTime; varying vec3 vDir;
        ${NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float band = exp(-abs(d.y + 0.25) * 2.6);
          vec3 col = mix(uTop, uHorizon, band * 0.5);
          float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.008, uTime * 0.004));
          float n2 = fbm(d * 5.5 - vec3(uTime * 0.012, 0.0, 0.0));
          float neb = pow(smoothstep(0.35, 0.85, n), 1.6);
          col += uNebula * neb * (0.25 + 0.75 * n2) * 0.32;
          col += uHorizon * pow(smoothstep(0.45, 0.9, n2), 2.0) * 0.22;
          // stars
          vec3 g = d * 140.0; vec3 id = floor(g); vec3 f = fract(g) - 0.5;
          float h = hash(id);
          float star = step(0.992, h) * smoothstep(0.35, 0.0, length(f)) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 5.0) + h * 40.0));
          col += vec3(0.9, 0.95, 1.0) * star * 1.6 * (1.0 - neb * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
  }

  private buildBackdrop() {
    const { theme, sim } = this;
    const sky = new THREE.Mesh(this.own(new THREE.SphereGeometry(300, 32, 20)), this.skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    this.group.add(sky);

    // glow pool under the platform
    this.underMat = this.own(additive({
      uniforms: { uColor: { value: new THREE.Color(theme.rim) }, uColor2: { value: new THREE.Color(theme.tileAccent) }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uColor, uColor2; uniform float uTime; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float g = pow(max(0.0, 1.0 - r), 2.4);
          float rays = 0.6 + 0.4 * sin(a * 9.0 + uTime * 0.3) * sin(a * 4.0 - uTime * 0.2);
          gl_FragColor = vec4(mix(uColor, uColor2, r) * g * rays * 0.55, 1.0); }`,
    }));
    const under = new THREE.Mesh(this.own(new THREE.PlaneGeometry(46, 46)), this.underMat);
    under.rotation.x = -P2; under.position.y = -3.6;
    this.group.add(under);

    // infinite grid far below
    this.gridMat = this.own(additive({
      fog: false,
      uniforms: { uColor: { value: new THREE.Color(theme.tileAccent) }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec3 vW;
        float gridLine(vec2 p, float s){ vec2 g = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){ vec2 p = vW.xz; float d = length(p);
          float g = gridLine(p, 4.0) * 0.5 + gridLine(p, 20.0) * 0.8;
          float fade = smoothstep(150.0, 12.0, d);
          float pulse = 0.6 + 0.4 * sin(d * 0.15 - uTime * 0.8);
          gl_FragColor = vec4(uColor * g * fade * pulse * 0.2, 1.0); }`,
    }));
    const grid = new THREE.Mesh(this.own(new THREE.PlaneGeometry(400, 400)), this.gridMat);
    grid.rotation.x = -P2; grid.position.y = -26;
    this.group.add(grid);

    // drifting set dressing with real depth
    const rng = mulberry32(sim.level.seed + 7);
    const N = 150;
    const geo = this.own(theme.prop === 'server' ? new THREE.BoxGeometry(1, 1, 1) : theme.prop === 'crystal' ? new THREE.OctahedronGeometry(0.8) : new THREE.DodecahedronGeometry(0.75));
    const mat: THREE.Material = theme.prop === 'server'
      ? this.own(new THREE.ShaderMaterial({
        uniforms: { uBase: { value: new THREE.Color(theme.tile).multiplyScalar(0.7) }, uGlow: { value: new THREE.Color(theme.tileAccent) }, uGlow2: { value: new THREE.Color(theme.rim) }, uFog: { value: new THREE.Color(theme.fog).multiplyScalar(0.55) }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vL; varying vec3 vN; varying vec3 vS; varying float vD; varying float vId;
          void main(){ vL = position; vN = normal; vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vId = fract(instanceMatrix[3].x * 7.31 + instanceMatrix[3].z * 3.17);
            vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform vec3 uBase, uGlow, uGlow2, uFog; uniform float uTime; varying vec3 vL; varying vec3 vN; varying vec3 vS; varying float vD; varying float vId;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main(){
            vec3 col = uBase * (0.35 + 0.65 * max(0.0, dot(normalize(vN), normalize(vec3(-0.4, 0.8, 0.45)))));
            if (abs(vN.y) < 0.5) {
              float side = abs(vN.x) > 0.5 ? vL.z * vS.z : vL.x * vS.x;
              vec2 cell = vec2(floor(side * 2.2), floor((vL.y + 0.5) * vS.y * 1.6));
              vec2 f = vec2(fract(side * 2.2), fract((vL.y + 0.5) * vS.y * 1.6));
              float lit = step(0.52, h21(cell + vId * 91.0)) * (0.6 + 0.4 * sin(uTime * (0.5 + h21(cell) * 2.0) + h21(cell.yx) * 30.0));
              float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.35, f.y) * step(f.y, 0.7);
              col += mix(uGlow, uGlow2, step(0.8, h21(cell * 1.7))) * win * lit * 0.9;
            } else {
              float e = max(abs(vL.x), abs(vL.z));
              col += uGlow * smoothstep(0.44, 0.49, e) * 0.9;
            }
            float fd = vD * 0.014; float fog = 1.0 - exp(-fd * fd);
            gl_FragColor = vec4(mix(col, uFog, clamp(fog, 0.0, 1.0)), 1.0);
          }`,
      }))
      : this.own(new THREE.MeshStandardMaterial({
        color: new THREE.Color(theme.tile).multiplyScalar(0.55), metalness: 0.9, roughness: 0.25, flatShading: true,
        emissive: new THREE.Color(theme.rim), emissiveIntensity: 0.07,
      }));
    this.driftMat = mat instanceof THREE.ShaderMaterial ? mat : null;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = rng() * PI * 2, d = 11 + rng() * 60;
      p.set(Math.cos(a) * d * 0.9, -4 - rng() * 22 + (d > 30 ? rng() * 14 : 0), Math.sin(a) * d - 6);
      if (theme.prop === 'server') { e.set(0, Math.floor(rng() * 2) * P2, 0); s.set(2 + rng() * 4, 6 + rng() * 18, 2 + rng() * 4); p.set(Math.cos(a) * (9 + d * 0.9), -30 + s.y * 0.5 + rng() * 6, Math.sin(a) * (9 + d * 0.8) - 4); }
      else { e.set(rng() * 6, rng() * 6, rng() * 6); const k = 0.35 + rng() * 1.5; s.set(k, k * (1 + rng() * 1.8), k); p.set(Math.cos(a) * (10 + d * 0.8), -7 - rng() * 20, Math.sin(a) * (10 + d * 0.8) - 4); }
      m4.compose(p, q.setFromEuler(e), s);
      inst.setMatrixAt(i, m4);
    }
    this.drift = inst;
    this.group.add(inst);

    // floating motes around the board
    const M = 420;
    const mp = new Float32Array(M * 3), ms = new Float32Array(M * 2);
    for (let i = 0; i < M; i++) {
      mp.set([(rng() - 0.5) * 34, rng() * 16 - 6, (rng() - 0.5) * 40], i * 3);
      ms.set([rng(), 0.4 + rng()], i * 2);
    }
    const mg = this.own(new THREE.BufferGeometry());
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 2));
    this.moteMat = this.own(additive({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(theme.tileAccent) }, uColor2: { value: new THREE.Color(theme.rim) }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `attribute vec2 aSeed; uniform float uTime, uScale; varying float vA; varying float vMix;
        void main(){ vec3 p = position; p.y = mod(p.y + 6.0 + uTime * (0.15 + aSeed.x * 0.35), 16.0) - 6.0;
          p.x += sin(uTime * 0.4 + aSeed.x * 30.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * (0.035 + aSeed.y * 0.06) / -mv.z;
          vA = (0.35 + 0.65 * sin(uTime * (0.8 + aSeed.x) + aSeed.x * 50.0)) * smoothstep(-6.0, -3.0, p.y) * smoothstep(10.0, 6.0, p.y);
          vMix = aSeed.x; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor, uColor2; varying float vA; varying float vMix;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(mix(uColor, uColor2, step(0.6, vMix)) * a * a * max(vA, 0.0) * 1.3, 1.0); }`,
    }));
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
  }

  update(dt: number, time: number, waveActive: boolean) {
    this.pathMat.uniforms.uTime.value = time;
    const pb = this.pathMat.uniforms.uBoost;
    pb.value += ((waveActive ? 0.5 : 0) - pb.value) * Math.min(1, dt * 2);
    this.skyMat.uniforms.uTime.value = time;
    this.underMat.uniforms.uTime.value = time;
    this.gridMat.uniforms.uTime.value = time;
    this.moteMat.uniforms.uTime.value = time;
    this.moteMat.uniforms.uScale.value = this.engine.pointScale();
    for (const m of this.portalMats) m.uniforms.uTime.value = time;
    this.coreCrystal.rotation.y = time * 0.9;
    this.coreCrystal.position.y = 0.72 + Math.sin(time * 1.7) * 0.05;
    this.coreRings[0].rotation.set(time * 0.8, time * 0.5, 0);
    this.coreRings[1].rotation.set(P2 + time * 0.4, 0, time * 0.9);
    for (const g of this.extraCores) { g.children[1].rotation.y = -time * 0.9; g.children[2].rotation.set(time * 0.8, time * 0.5, 0); }
    this.coreFlash = Math.max(0, this.coreFlash - dt * 2.5);
    this.coreMat.u.uFx.value.x = this.coreFlash * 1.5;
    this.coreMat.u.uGlow.value = 1 + Math.sin(time * 2.4) * 0.15;
    this.coreLight.intensity = 4 + Math.sin(time * 2.4) * 0.8 + this.coreFlash * 14;
    this.coreLight.color.setHex(this.coreFlash > 0.05 ? 0xff5566 : 0x5ff2ff);
    if (this.drift) this.drift.rotation.y = time * 0.004;
    if (this.driftMat) this.driftMat.uniforms.uTime.value = time;
  }

  dispose() {
    this.engine.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.env?.dispose();
    this.engine.scene.environment = null;
  }
}
