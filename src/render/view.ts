import * as THREE from 'three';
import { FAMILY_INFO, type TowerDef, type Theme } from '../data/types';
import { ENEMIES } from '../data/enemies';
import { TOWER_BY_ID } from '../data/towers';
import { CELL_FREE, type Enemy, type Projectile, type Sim, type SimEvent, type Tower } from '../sim/sim';
import { Board } from './board';
import { Builder, oct, tor } from './builder';
import type { Engine } from './engine';
import { enemyModel, type EnemyModel } from './enemyModels';
import { Fx } from './fx';
import { additive, makePbr } from './materials';
import { droneGeometry, towerModel, type TowerModel } from './towerModels';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _v = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);
const _c2 = new THREE.Color();
const HOSTILE = 0xff2d55;
const GOLD = 0xffd166;
/** Visual-only scale-up so towers and enemies read well on a phone. */
export const TOWER_SCALE = 1.22, ENEMY_SCALE = 1.2;

const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Visual for one placed tower (also reused for the placement ghost and thumbnails). */
export class TowerVis {
  group = new THREE.Group();
  head = new THREE.Group();
  recoilNode = new THREE.Group();
  mat = makePbr();
  model: TowerModel;
  parts: { mesh: THREE.Mesh; spin: [number, number, number]; bob: number; bobSpeed: number; py: number }[] = [];
  yaw = 0; recoil = 0; flash = 0; activity = 0; level = 1;
  private pips: THREE.Mesh | null = null;
  seed = Math.random() * 10;

  constructor(public def: TowerDef, shadows = true) {
    const m = (this.model = towerModel(def));
    _c.setHex(FAMILY_INFO[def.family].color);
    this.mat.u.uRim.value.set(_c.r, _c.g, _c.b, 0.85);
    const base = new THREE.Mesh(m.base, this.mat);
    base.castShadow = shadows; base.receiveShadow = shadows;
    this.group.add(base);
    this.head.position.y = m.headY;
    this.group.add(this.head);
    this.head.add(this.recoilNode);
    if (m.head) {
      const h = new THREE.Mesh(m.head, this.mat);
      h.castShadow = shadows;
      this.recoilNode.add(h);
    }
    for (const p of m.parts) {
      const mesh = new THREE.Mesh(p.geo, this.mat);
      mesh.castShadow = shadows;
      mesh.position.set(...p.pivot);
      (p.parent === 'head' ? this.recoilNode : this.group).add(mesh);
      this.parts.push({ mesh, spin: p.spin, bob: p.bob, bobSpeed: p.bobSpeed, py: p.pivot[1] });
    }
  }

  setLevel(level: number) {
    this.level = level;
    if (this.pips) { this.group.remove(this.pips); this.pips.geometry.dispose(); this.pips = null; }
    if (level > 1) {
      const b = new Builder();
      const info = FAMILY_INFO[this.def.family];
      const n = level - 1;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        for (let k = 0; k < n; k++)
          b.add(oct(0.045), { c: level >= 3 ? 0xffe08a : info.color2, e: 2.6, flat: true, p: [Math.sin(a) * 0.5, 0.1 + k * 0.11, Math.cos(a) * 0.5], s: [0.7, 1.2, 0.7] });
      }
      if (level >= 3) b.add(tor(0.56, 0.012, 6, 48), { c: 0xffe08a, e: 2.4, p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
      this.pips = new THREE.Mesh(b.build('base')!, this.mat);
      this.group.add(this.pips);
    }
    this.mat.u.uGlow.value = 1 + (level - 1) * 0.22;
  }

  animate(dt: number, time: number) {
    const m = this.model;
    this.recoil *= Math.exp(-dt * 13);
    this.flash *= Math.exp(-dt * 12);
    this.activity *= Math.exp(-dt * 2.5);
    this.head.rotation.y = this.yaw;
    this.recoilNode.position.z = -this.recoil * 0.09;
    const boost = 1 + this.activity * 2.2;
    for (const p of this.parts) {
      p.mesh.rotation.x += p.spin[0] * dt * boost; p.mesh.rotation.y += p.spin[1] * dt * boost; p.mesh.rotation.z += p.spin[2] * dt * boost;
      if (p.bob) p.mesh.position.y = p.py + Math.sin(time * p.bobSpeed + this.seed) * p.bob;
    }
    this.mat.u.uFx.value.x = this.flash * 0.35;
    this.mat.u.uGlow.value = (1 + (this.level - 1) * 0.22) * (1 + this.activity * 0.5);
    void m;
  }

  /** World-space muzzle position. */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    const [mx, my, mz] = this.model.muzzle;
    const s = this.group.scale.x, c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    return out.set(this.group.position.x + (mx * c + mz * sn) * s, this.group.position.y + (this.model.headY + my) * s, this.group.position.z + (-mx * sn + mz * c) * s);
  }

  dispose() { this.mat.dispose(); if (this.pips) this.pips.geometry.dispose(); }
}

interface EnemyBatch { mesh: THREE.InstancedMesh; model: EnemyModel; fx: THREE.InstancedBufferAttribute; n: number; cap: number }
interface Ghost { type: string; x: number; y: number; z: number; yaw: number; scale: number; t: number }

export class GameView {
  sim!: Sim;
  board: Board | null = null;
  fx: Fx;
  towers = new Map<number, TowerVis>();
  private batches = new Map<string, EnemyBatch>();
  private ghosts: Ghost[] = [];
  private proj: THREE.InstancedMesh;
  private projPrev = new WeakMap<Projectile, THREE.Vector3>();
  private drones: THREE.InstancedMesh;
  private bars: THREE.Mesh;
  private barPos: THREE.InstancedBufferAttribute;
  private barData: THREE.InstancedBufferAttribute;
  private bubbles: THREE.InstancedMesh;
  private bubbleA: THREE.InstancedBufferAttribute;
  private rangeRing: THREE.Mesh;
  private rangeMat: THREE.ShaderMaterial;
  private cursor: THREE.Mesh;
  private cursorMat: THREE.ShaderMaterial;
  private slots: THREE.InstancedMesh;
  private slotMat: THREE.ShaderMaterial;
  private pads: THREE.InstancedMesh;
  private padsDirty = true;
  private auras = new Map<number, THREE.Mesh>();
  private auraGeo = new THREE.CircleGeometry(1, 48);
  private ghost: TowerVis | null = null;
  private ghostDef: string | null = null;
  selected: Tower | null = null;
  root = new THREE.Group();
  onEvent: ((ev: SimEvent) => void) | null = null;
  private healthBarCap = 400;

  constructor(private engine: Engine, textLayer: HTMLElement | null) {
    this.fx = new Fx(engine, textLayer);
    engine.scene.add(this.root);

    // projectiles
    const pg = new THREE.OctahedronGeometry(1, 0);
    this.proj = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ toneMapped: false }), 500);
    this.proj.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
    this.proj.count = 0; this.proj.frustumCulled = false;
    this.root.add(this.proj);

    // drones
    const dg = droneGeometry().clone();
    const dfx = new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4);
    for (let i = 0; i < 64; i++) dfx.setXYZW(i, 0, 1, 0, 0);
    dg.setAttribute('iFx', dfx);
    this.drones = new THREE.InstancedMesh(dg, makePbr(true), 64);
    this.drones.count = 0; this.drones.frustumCulled = false; this.drones.castShadow = true;
    this.root.add(this.drones);

    // health bars (billboards)
    const bg = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    bg.index = plane.index; bg.setAttribute('position', plane.attributes.position); bg.setAttribute('uv', plane.attributes.uv);
    this.barPos = new THREE.InstancedBufferAttribute(new Float32Array(this.healthBarCap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.barData = new THREE.InstancedBufferAttribute(new Float32Array(this.healthBarCap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    bg.setAttribute('iPos', this.barPos); bg.setAttribute('iData', this.barData);
    bg.instanceCount = 0;
    this.bars = new THREE.Mesh(bg, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: /* glsl */ `attribute vec3 iPos; attribute vec4 iData; varying vec2 vUv; varying vec4 vD;
        void main(){ vUv = uv; vD = iData; vec4 mv = viewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * vec2(iData.z, iData.w > 0.5 ? 0.13 : 0.085); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying vec2 vUv; varying vec4 vD;
        void main(){
          float bx = 0.03 / max(vD.z, 0.2) * 0.5; float by = 0.18;
          float inside = step(bx, vUv.x) * step(vUv.x, 1.0 - bx) * step(by, vUv.y) * step(vUv.y, 1.0 - by);
          vec3 col = vec3(0.02, 0.03, 0.05); float a = 0.85;
          float u = (vUv.x - bx) / (1.0 - 2.0 * bx);
          if (inside > 0.5) {
            float shieldBand = step(0.62, vUv.y) * step(0.001, vD.y);
            if (shieldBand > 0.5) { col = u < vD.y ? vec3(0.35, 0.85, 1.0) * 1.3 : vec3(0.05, 0.1, 0.14); }
            else {
              vec3 hc = mix(vec3(1.0, 0.2, 0.25), mix(vec3(1.0, 0.8, 0.2), vec3(0.3, 1.0, 0.45), smoothstep(0.45, 0.8, vD.x)), smoothstep(0.15, 0.5, vD.x));
              col = u < vD.x ? hc * (0.85 + 0.3 * vUv.y) : vec3(0.1, 0.03, 0.05);
            }
          }
          gl_FragColor = vec4(col, a); }`,
    }));
    this.bars.frustumCulled = false; this.bars.renderOrder = 30;
    this.root.add(this.bars);

    // shield bubbles
    const sg = new THREE.SphereGeometry(0.5, 20, 14);
    this.bubbleA = new THREE.InstancedBufferAttribute(new Float32Array(128), 1).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('iA', this.bubbleA);
    this.bubbles = new THREE.InstancedMesh(sg, additive({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `attribute float iA; varying float vA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vA = iA; vP = position; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `uniform float uTime; varying float vA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2);
          float hex = 0.5 + 0.5 * sin(vP.y * 40.0 + uTime * 4.0);
          gl_FragColor = vec4(vec3(0.3, 0.8, 1.0) * (f * 1.6 + hex * 0.08) * vA, 1.0); }`,
    }), 128);
    this.bubbles.count = 0; this.bubbles.frustumCulled = false; this.bubbles.renderOrder = 14;
    this.root.add(this.bubbles);

    // range ring
    this.rangeMat = additive({
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uTime: { value: 0 }, uR: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime, uR; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float px = 0.045 / uR;
          float edge = smoothstep(px, 0.0, abs(r - (1.0 - px))) * (0.65 + 0.35 * step(0.5, fract(a * 9.55 + uTime * 0.6)));
          float fill = step(r, 1.0) * (0.022 + 0.04 * smoothstep(0.4, 1.0, r));
          float sweep = step(r, 1.0) * pow(max(0.0, sin(r * 9.0 - uTime * 3.0)), 14.0) * 0.08;
          gl_FragColor = vec4(uColor * (edge * 1.5 + fill + sweep), 1.0); }`,
    });
    this.rangeRing = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.rangeMat);
    this.rangeRing.rotation.x = -Math.PI / 2; this.rangeRing.position.y = 0.035; this.rangeRing.visible = false; this.rangeRing.renderOrder = 10;
    this.root.add(this.rangeRing);

    // tile cursor
    this.cursorMat = additive({
      uniforms: { uColor: { value: new THREE.Color(0x66ffcc) }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ vec2 p = abs(vUv - 0.5) * 2.0; float d = max(p.x, p.y);
          float edge = smoothstep(0.1, 0.0, abs(d - 0.88)); float corner = step(0.55, min(p.x, p.y));
          float fill = step(d, 0.88) * (0.14 + 0.06 * sin(uTime * 6.0));
          gl_FragColor = vec4(uColor * (edge * (0.5 + corner) * 1.6 + fill), 1.0); }`,
    });
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.cursorMat);
    this.cursor.rotation.x = -Math.PI / 2; this.cursor.position.y = 0.03; this.cursor.visible = false; this.cursor.renderOrder = 11;
    this.root.add(this.cursor);

    // under-tower pads: soft contact shadow plus a family-coloured ring, in one premultiplied quad
    this.pads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vC = instanceColor; gl_Position = projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec3 vC;
        void main(){ float r = length(vUv - 0.5) * 3.0;
          float ao = smoothstep(1.15, 0.35, r) * 0.6;
          float ring = smoothstep(0.07, 0.0, abs(r - 0.97)) * (0.75 + 0.25 * sin(uTime * 2.0));
          float halo = smoothstep(1.45, 0.9, r) * smoothstep(0.5, 0.95, r) * 0.16;
          gl_FragColor = vec4(vC * (ring * 1.5 + halo), ao); }`,
    }), 96);
    this.pads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);
    this.pads.count = 0; this.pads.frustumCulled = false; this.pads.renderOrder = 7;
    this.root.add(this.pads);

    // buildable slot markers
    this.slotMat = additive({
      uniforms: { uColor: { value: new THREE.Color(0x66ffcc) }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vW;
        void main(){ vec2 p = abs(vUv - 0.5) * 2.0; float d = max(p.x, p.y);
          float corner = step(0.5, min(p.x, p.y)) * smoothstep(0.12, 0.0, abs(d - 0.82));
          float dot = smoothstep(0.16, 0.06, length(vUv - 0.5) * 2.0);
          float w = 0.55 + 0.45 * sin(uTime * 3.0 - (vW.x + vW.z) * 0.7);
          gl_FragColor = vec4(uColor * (corner * 0.9 + dot * 0.6) * w, 1.0); }`,
    });
    this.slots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.slotMat, 256);
    this.slots.count = 0; this.slots.visible = false; this.slots.frustumCulled = false; this.slots.renderOrder = 9;
    this.root.add(this.slots);
  }

  load(sim: Sim, theme: Theme) {
    this.unload();
    this.sim = sim;
    this.board = new Board(this.engine, sim, theme);
    // pre-create enemy batches for every type that can appear (avoids hitches mid-wave)
    const types = new Set<string>();
    for (const w of sim.waves) for (const g of w.groups) types.add(g.type);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of [...types]) {
        const d = ENEMIES.find((e) => e.id === t);
        for (const child of [d?.split?.into, d?.spawn?.type]) if (child && !types.has(child)) { types.add(child); grew = true; }
      }
    }
    for (const t of types) this.batch(t);
  }

  private batch(type: string): EnemyBatch {
    let b = this.batches.get(type);
    if (b) return b;
    const model = enemyModel(type);
    const def = ENEMIES.find((e) => e.id === type)!;
    const cap = def.boss ? 8 : def.size < 0.7 ? 220 : 120;
    const geo = model.geo.clone();
    const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iFx', fx);
    const mat = makePbr(true);
    mat.u.uWiggle.value.set(...model.anim.wiggle);
    _c.setHex(def.color).lerp(_c2.setHex(HOSTILE), 0.55);
    mat.u.uRim.value.set(_c.r, _c.g, _c.b, 0.5);
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true;
    this.root.add(mesh);
    b = { mesh, model, fx, n: 0, cap };
    this.batches.set(type, b);
    return b;
  }

  unload() {
    for (const v of this.towers.values()) { this.root.remove(v.group); v.dispose(); }
    this.towers.clear();
    for (const b of this.batches.values()) { this.root.remove(b.mesh); b.mesh.geometry.dispose(); (b.mesh.material as THREE.Material).dispose(); }
    this.batches.clear();
    for (const a of this.auras.values()) { this.root.remove(a); (a.material as THREE.Material).dispose(); }
    this.auras.clear();
    this.ghosts.length = 0;
    this.setGhost(null, 0, 0, false);
    this.select(null);
    this.fx.clear();
    this.board?.dispose();
    this.board = null;
    this.proj.count = 0; this.drones.count = 0; this.bubbles.count = 0; this.pads.count = 0; this.padsDirty = true;
    (this.bars.geometry as THREE.InstancedBufferGeometry).instanceCount = 0;
  }

  // ---------- selection & placement ----------
  select(t: Tower | null) {
    this.selected = t;
    if (!this.ghostDef) this.rangeRing.visible = false;
  }

  showSlots(show: boolean) {
    this.slots.visible = show;
    if (!show) return;
    const sim = this.sim;
    let n = 0;
    for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
      if (sim.grid[r * sim.cols + c] !== CELL_FREE || sim.towerAt(c, r) || n >= 256) continue;
      _m.makeTranslation(sim.cellX(c), 0.025, sim.cellZ(r));
      this.slots.setMatrixAt(n++, _m);
    }
    this.slots.count = n;
    this.slots.instanceMatrix.needsUpdate = true;
  }

  /** Placement preview. Pass null to hide. */
  setGhost(defId: string | null, c: number, r: number, valid: boolean, onBoard = true) {
    if (defId !== this.ghostDef) {
      if (this.ghost) { this.root.remove(this.ghost.group); this.ghost.dispose(); this.ghost = null; }
      this.ghostDef = defId;
      if (defId) {
        this.ghost = new TowerVis(TOWER_BY_ID[defId], false);
        this.ghost.mat.u.uFx.value.y = 0.62;
        this.ghost.group.scale.setScalar(TOWER_SCALE);
        this.root.add(this.ghost.group);
      }
      this.showSlots(!!defId);
    }
    if (!defId || !this.ghost) { this.cursor.visible = false; if (!this.selected) this.rangeRing.visible = false; return; }
    const sim = this.sim;
    const x = sim.cellX(c), z = sim.cellZ(r);
    this.ghost.group.visible = onBoard;
    this.cursor.visible = onBoard;
    this.rangeRing.visible = onBoard && valid;
    this.ghost.group.position.set(x, valid ? 0.06 : 0.02, z);
    this.ghost.mat.u.uFx.value.w = valid ? 0 : 0.8;
    this.ghost.mat.u.uFx.value.y = valid ? 0.7 : 0.4;
    this.cursor.position.set(x, 0.03, z);
    this.cursorMat.uniforms.uColor.value.setHex(valid ? 0x66ffcc : 0xff4466);
    const def = this.ghost.def;
    const range = def.range >= 50 ? 0 : def.range;
    if (range > 0) {
      this.rangeRing.position.set(x, 0.035, z);
      this.rangeRing.scale.set(range, range, 1);
      this.rangeMat.uniforms.uR.value = range;
      this.rangeMat.uniforms.uColor.value.setHex(FAMILY_INFO[def.family].color);
    } else this.rangeRing.visible = false;
  }

  private addAura(t: Tower) {
    const info = FAMILY_INFO[t.def.family];
    const mat = additive({
      uniforms: { uColor: { value: new THREE.Color(info.color) }, uTime: { value: 0 }, uOn: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime, uOn; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float rings = pow(max(0.0, sin(r * 14.0 - uTime * 2.2)), 8.0) * 0.16;
          float spokes = smoothstep(0.92, 1.0, sin(a * 6.0 + uTime * 0.5)) * 0.1 * smoothstep(0.2, 0.9, r);
          float edge = smoothstep(0.06, 0.0, abs(r - 0.96)) * 0.55;
          gl_FragColor = vec4(uColor * (rings + spokes + edge + 0.03) * (0.16 + uOn * 0.4) * step(r, 1.0), 1.0); }`,
    });
    const mesh = new THREE.Mesh(this.auraGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(t.x, 0.028, t.z);
    mesh.renderOrder = 8;
    this.root.add(mesh);
    this.auras.set(t.id, mesh);
  }

  // ---------- events → effects ----------
  private handle(ev: SimEvent) {
    const fx = this.fx;
    const fam = ev.family ? FAMILY_INFO[ev.family] : null;
    const col = fam ? fam.color : 0xffffff;
    switch (ev.t) {
      case 'spawn': {
        const e = ev.enemy!;
        if (this.sim.time - e.born < 0.05) fx.burst(e.x, e.y + 0.3, e.z, HOSTILE, e.def.boss ? 30 : 4, 2, 0.1, 0.4, 0, 0.2);
        if (e.def.boss) { fx.ring(e.x, 0.03, e.z, HOSTILE, 0.2, 3.5, 0.9, 0.1, 0.3); this.engine.shake(0.25); }
        break;
      }
      case 'shot': {
        const v = this.towers.get(ev.tower!.id);
        if (v) {
          v.recoil = 1; v.flash = 1; v.activity = Math.min(1.5, v.activity + 0.35);
          v.muzzle(_v);
          if (ev.tower!.def.kind !== 'drone') fx.flash(_v.x, _v.y, _v.z, col, 0.5, 0.09, 1.4);
          else fx.flash(ev.x!, ev.y!, ev.z!, col, 0.3, 0.08, 1.3);
        }
        break;
      }
      case 'hit':
        fx.burst(ev.x!, ev.y!, ev.z!, col, ev.crit ? 9 : 3, ev.crit ? 3.2 : 1.8, ev.crit ? 0.1 : 0.07, 0.3, 3, 0.3);
        if (ev.crit) {
          fx.flash(ev.x!, ev.y!, ev.z!, 0xffffff, 0.9, 0.14, 1.5);
          fx.text(ev.x!, ev.y! + 0.5, ev.z!, `${Math.round(ev.n ?? 0)}!`, 'crit');
        }
        break;
      case 'explode':
        fx.explosion(ev.x!, ev.y!, ev.z!, ev.tower?.def.id === 'gem_banana' ? 0xffe14a : col, ev.r!, ev.r! >= 1.35);
        break;
      case 'chain': {
        const v = this.towers.get(ev.tower!.id);
        const pts = ev.pts!;
        if (v && pts[1] === 1.25) { v.muzzle(_v); pts[0] = _v.x; pts[1] = _v.y; pts[2] = _v.z; v.flash = 1; v.activity = Math.min(1.5, v.activity + 0.5); }
        const w = 0.02 + Math.min(0.05, ev.tower!.stats.dmg * 0.0006);
        fx.bolt(pts, col, w, 0.2, 0.24);
        fx.bolt(pts.slice(), 0xffffff, w * 0.4, 0.14, 0.1);
        for (let i = 3; i < pts.length; i += 3) fx.flash(pts[i], pts[i + 1], pts[i + 2], col, 0.7, 0.14, 1.4);
        fx.light(pts[3], pts[4] + 0.3, pts[5], col, 5, 0.2);
        break;
      }
      case 'sniper': {
        const v = this.towers.get(ev.tower!.id);
        if (v) { v.recoil = 1.6; v.flash = 1; v.activity = 1; v.muzzle(_v); }
        else _v.set(ev.tower!.x, 1, ev.tower!.z);
        fx.beam(_v.x, _v.y, _v.z, ev.x!, ev.y!, ev.z!, col, ev.crit ? 0.07 : 0.04, 0.16);
        fx.flash(_v.x, _v.y, _v.z, col, 0.9, 0.12, 1.5);
        fx.flash(ev.x!, ev.y!, ev.z!, col, ev.crit ? 1.6 : 1.0, 0.18, 1.5);
        fx.burst(ev.x!, ev.y!, ev.z!, col, 10, 3, 0.09, 0.35, 3, 0.3);
        if (ev.tower!.def.id === 'cl_computer') { fx.ring(ev.x!, 0.04, ev.z!, col, 0.9, 0.15, 0.3, 0.2, 0); fx.ring(ev.x!, 0.04, ev.z!, 0xffffff, 0.1, 0.8, 0.35, 0.12, 0.2); }
        break;
      }
      case 'rail': {
        const v = this.towers.get(ev.tower!.id);
        if (v) { v.recoil = 2.2; v.flash = 1; v.activity = 1.5; v.muzzle(_v); } else _v.set(ev.x!, ev.y!, ev.z!);
        fx.beam(_v.x, _v.y, _v.z, ev.x2!, ev.y2!, ev.z2!, col, 0.16, 0.38);
        fx.beam(_v.x, _v.y, _v.z, ev.x2!, ev.y2!, ev.z2!, 0xffffff, 0.05, 0.25);
        fx.flash(_v.x, _v.y, _v.z, col, 1.6, 0.2, 1.6);
        const n = 14;
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          fx.burst(_v.x + (ev.x2! - _v.x) * k, _v.y + (ev.y2! - _v.y) * k, _v.z + (ev.z2! - _v.z) * k, col, 2, 1.2, 0.08, 0.5, 0, 0.1);
        }
        fx.light(_v.x, _v.y, _v.z, col, 10, 0.3);
        this.engine.shake(0.1);
        break;
      }
      case 'strike': {
        const x = ev.x!, z = ev.z!;
        const pts = [x + (Math.random() - 0.5) * 2, 13, z + (Math.random() - 0.5) * 2, x, ev.y! + 0.1, z];
        fx.bolt(pts, col, 0.09, 0.26, 0.5);
        fx.bolt(pts.slice(), 0xffffff, 0.035, 0.2, 0.3);
        break;
      }
      case 'nova': {
        const v = this.towers.get(ev.tower!.id);
        if (v) { v.flash = 1.5; v.activity = 1.5; }
        const r = ev.r!;
        if (ev.kind === 'pull') {
          fx.ring(ev.x!, 0.05, ev.z!, col, r, 0.2, 0.55, 0.2, 0.6);
          fx.ring(ev.x!, 0.05, ev.z!, 0x8844ff, r * 0.8, 0.1, 0.45, 0.3, 0);
          fx.ringBurst(ev.x!, 0.3, ev.z!, col, 28, r, -r * 1.8, 0.1, 0.5);
          this.engine.shake(0.15);
        } else {
          fx.ring(ev.x!, 0.05, ev.z!, col, 0.3, r, 0.5, 0.1, 0.25);
          fx.ring(ev.x!, 0.05, ev.z!, 0xffffff, 0.2, r * 0.9, 0.38, 0.05, 0);
          fx.ringBurst(ev.x!, 0.25, ev.z!, col, 26, 0.4, r * 1.6, 0.09, 0.5);
          if (v) { v.muzzle(_v); fx.flash(_v.x, _v.y, _v.z, col, 2.0, 0.25, 1.5); }
          this.engine.shake(0.08);
        }
        fx.light(ev.x!, 1, ev.z!, col, 9, 0.35);
        break;
      }
      case 'death': {
        const e = ev.enemy!;
        const s = e.def.size;
        fx.burst(e.x, e.y + 0.25 * s, e.z, e.def.color, Math.round(6 + s * 8), 2.2 + s, 0.09 + s * 0.03, 0.5, 5, 0.5);
        fx.flash(e.x, e.y + 0.25 * s, e.z, e.def.color, 0.8 + s * 0.9, 0.2, 1.3);
        fx.text(e.x, e.y + 0.5 + s * 0.3, e.z, `+${ev.n}`, 'gold');
        this.ghosts.push({ type: e.def.id, x: e.x, y: e.y, z: e.z, yaw: Math.atan2(e.dx, e.dz), scale: s, t: 0 });
        if (e.def.boss || s >= 1.6) {
          fx.explosion(e.x, e.y + 0.4, e.z, e.def.color, s * 1.3, true);
          fx.ring(e.x, 0.04, e.z, 0xffffff, 0.3, s * 3, 0.8, 0.08, 0.2);
          this.engine.shake(e.def.boss ? 0.5 : 0.2);
        }
        break;
      }
      case 'leak': {
        const c = this.sim.core;
        this.board?.coreHit();
        this.engine.damage = Math.min(1, this.engine.damage + 0.55);
        this.engine.shake(0.22);
        fx.burst(c.x, 0.7, c.z, HOSTILE, 22, 4, 0.12, 0.6, 3, 0.4);
        fx.ring(c.x, 0.04, c.z, HOSTILE, 0.2, 2.2, 0.5, 0.14, 0.4);
        fx.text(c.x, 1.5, c.z, `-${ev.n}`, 'dmg');
        break;
      }
      case 'build': {
        const t = ev.tower!;
        const info = FAMILY_INFO[t.def.family];
        fx.ring(t.x, 0.04, t.z, info.color, 0.2, 1.3, 0.45, 0.14, 0.4);
        fx.fountain(t.x, 0.1, t.z, info.color2, 16, 2.6);
        fx.light(t.x, 0.8, t.z, info.color, 6, 0.4);
        break;
      }
      case 'upgrade': {
        const t = ev.tower!;
        fx.ring(t.x, 0.04, t.z, GOLD, 0.2, 1.5, 0.5, 0.12, 0.4);
        fx.fountain(t.x, 0.1, t.z, GOLD, 26, 3.2, 0.1, 1.0);
        fx.flash(t.x, 0.9, t.z, GOLD, 2.2, 0.3, 1.3);
        fx.light(t.x, 0.9, t.z, GOLD, 8, 0.45);
        this.towers.get(t.id)?.setLevel(t.level);
        fx.text(t.x, 1.5, t.z, `LEVEL ${t.level}`, 'up');
        break;
      }
      case 'sell': {
        const t = ev.tower!;
        fx.burst(t.x, 0.5, t.z, GOLD, 18, 2.5, 0.1, 0.6, 4, 0.6);
        fx.ring(t.x, 0.04, t.z, 0xffffff, 0.8, 0.1, 0.3, 0.2, 0);
        break;
      }
      case 'income':
        fx.fountain(ev.x!, 0.8, ev.z!, GOLD, 10, 2, 0.09, 0.8);
        fx.text(ev.x!, 1.4, ev.z!, `+${ev.n}`, 'gold big');
        break;
      case 'jam': {
        const t = ev.tower!;
        fx.bolt([ev.x2!, ev.y2! + 0.4, ev.z2!, t.x, 0.9, t.z], 0xd04dff, 0.035, 0.3, 0.3);
        fx.flash(t.x, 0.9, t.z, 0xd04dff, 1.4, 0.3, 1.3);
        fx.text(t.x, 1.5, t.z, 'JAMMED', 'jam');
        break;
      }
      case 'heal':
        fx.ring(ev.x!, 0.04, ev.z!, 0x4dff9a, 0.2, ev.r!, 0.5, 0.1, 0.25);
        fx.fountain(ev.x!, 0.2, ev.z!, 0x4dff9a, 6, 1.5, 0.08, 0.6);
        break;
      case 'split':
        fx.ring(ev.x!, 0.04, ev.z!, ev.enemy!.def.color, 0.1, 0.9, 0.3, 0.2, 0.3);
        break;
      default:
        break;
    }
  }

  // ---------- per-frame sync ----------
  update(dt: number, simDt: number) {
    const sim = this.sim, fx = this.fx, time = this.engine.time;
    if (!sim) return;
    fx.beginFrame();
    for (const ev of sim.events) { this.handle(ev); this.onEvent?.(ev); }
    sim.events.length = 0;
    this.board?.update(dt, time, sim.state === 'wave');

    // towers
    const seen = new Set<number>();
    for (const t of sim.towers) {
      seen.add(t.id);
      let v = this.towers.get(t.id);
      if (!v) {
        v = new TowerVis(t.def);
        v.group.position.set(t.x, 0, t.z);
        v.setLevel(t.level);
        this.root.add(v.group);
        this.towers.set(t.id, v);
        if (t.def.kind === 'aura') this.addAura(t);
        this.padsDirty = true;
        if (this.slots.visible) this.showSlots(true);
      }
      const age = sim.time - t.born;
      const sc = (age < 0.4 ? Math.max(0.01, easeOutBack(Math.min(1, age / 0.4))) : 1) * (1 + (t.level - 1) * 0.07) * TOWER_SCALE;
      v.group.scale.setScalar(sc);
      if (v.model.aims && (t.aimX || t.aimZ)) {
        const want = Math.atan2(t.aimX, t.aimZ);
        let d = want - v.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        v.yaw += d * Math.min(1, dt * 14);
      }
      const jam = t.jamT > 0;
      v.mat.u.uFx.value.w += ((jam ? 0.85 : 0) - v.mat.u.uFx.value.w) * Math.min(1, dt * 10);
      if (jam && Math.random() < dt * 14) fx.burst(t.x + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, t.z + (Math.random() - 0.5) * 0.4, 0xd04dff, 1, 0.8, 0.08, 0.3, 0, 0);
      if (t.def.spinup) v.activity = Math.max(v.activity, (t.spin / t.def.spinup[1]) * 1.4);
      v.animate(dt, time);
      // persistent beams
      if (t.def.kind === 'beam' && t.targets.length && !jam) {
        const info = FAMILY_INFO[t.def.family];
        v.activity = Math.max(v.activity, 1);
        v.muzzle(_v);
        const mx = _v.x, my = _v.y, mz = _v.z;
        for (let i = 0; i < t.targets.length; i++) {
          const e = t.targets[i];
          if (!e.alive) continue;
          const ramp = t.def.ramp ? Math.min(1, t.rampTs[i] / t.def.ramp[1]) : 0.5;
          const ey = e.y + e.def.size * 0.3;
          const c = i % 2 === 1 ? info.color2 : info.color;
          const w = (0.022 + ramp * 0.03) * (1 + t.def.tier * 0.04) * (1 + Math.sin(time * 40 + i) * 0.12);
          fx.beam(mx, my, mz, e.x, ey, e.z, c, w, 0, 0.8 + ramp * 0.4);
          if (Math.random() < dt * 30) fx.burst(e.x, ey, e.z, c, 1, 1.6, 0.07, 0.3, 2, 0.4);
          if (Math.random() < dt * 12) fx.flash(e.x, ey, e.z, c, 0.45 + ramp * 0.4, 0.1, 1.2);
        }
        if (Math.random() < dt * 20) fx.flash(mx, my, mz, info.color, 0.5, 0.08, 1.2);
      }
      const aura = this.auras.get(t.id);
      if (aura) {
        const u = (aura.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = time;
        u.uOn.value += ((sim.time - t.shotT < 0.4 ? 1 : 0) - u.uOn.value) * Math.min(1, dt * 5);
        aura.scale.setScalar(t.stats.range);
        if (sim.time - t.shotT < 0.4) v.activity = Math.max(v.activity, 0.8);
      }
    }
    for (const [id, v] of this.towers) {
      if (seen.has(id)) continue;
      this.root.remove(v.group); v.dispose(); this.towers.delete(id);
      const a = this.auras.get(id);
      if (a) { this.root.remove(a); (a.material as THREE.Material).dispose(); this.auras.delete(id); }
      if (this.selected && this.selected.id === id) this.select(null);
      this.padsDirty = true;
      if (this.slots.visible) this.showSlots(true);
    }

    // selection ring
    if (this.selected && !this.ghostDef) {
      const t = this.selected;
      const r = t.stats.range >= 50 ? 0 : t.stats.range;
      this.rangeRing.visible = r > 0;
      this.rangeRing.position.set(t.x, 0.035, t.z);
      this.rangeRing.scale.set(r, r, 1);
      this.rangeMat.uniforms.uR.value = Math.max(0.5, r);
      this.rangeMat.uniforms.uColor.value.setHex(FAMILY_INFO[t.def.family].color);
      this.cursor.visible = true;
      this.cursor.position.set(t.x, 0.03, t.z);
      this.cursorMat.uniforms.uColor.value.setHex(0xffffff);
    } else if (!this.ghostDef) this.cursor.visible = false;
    if (this.padsDirty) {
      this.padsDirty = false;
      let pn = 0;
      for (const t of sim.towers) {
        if (pn >= 96) break;
        _m.makeTranslation(t.x, 0.014, t.z);
        this.pads.setMatrixAt(pn, _m);
        this.pads.setColorAt(pn, _c.setHex(FAMILY_INFO[t.def.family].color));
        pn++;
      }
      this.pads.count = pn;
      this.pads.instanceMatrix.needsUpdate = true;
      this.pads.instanceColor!.needsUpdate = true;
    }
    (this.pads.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.rangeMat.uniforms.uTime.value = time;
    this.cursorMat.uniforms.uTime.value = time;
    this.slotMat.uniforms.uTime.value = time;
    if (this.ghost) this.ghost.animate(dt, time);

    this.syncEnemies(dt, time);
    this.syncProjectiles(simDt);

    // drones
    let dn = 0;
    for (const t of sim.towers) {
      if (!t.drones.length) continue;
      for (let i = 0; i < t.drones.length && dn < 64; i++) {
        const d = t.drones[i];
        const yaw = d.target ? Math.atan2(d.target.x - d.x, d.target.z - d.z) : d.ang + Math.PI / 2;
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        _m.compose(_p.set(d.x, 1.45 + Math.sin(time * 5 + i * 2) * 0.05, d.z), _q, _s.setScalar(1.25));
        this.drones.setMatrixAt(dn++, _m);
      }
    }
    this.drones.count = dn;
    if (dn) this.drones.instanceMatrix.needsUpdate = true;

    (this.bubbles.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    fx.update(dt);
  }

  private syncEnemies(dt: number, time: number) {
    const sim = this.sim;
    for (const b of this.batches.values()) b.n = 0;
    let bars = 0, bub = 0;
    const bp = this.barPos.array as Float32Array, bd = this.barData.array as Float32Array;
    const put = (b: EnemyBatch, x: number, y: number, z: number, yaw: number, roll: number, pitch: number, scale: number, flash: number, alpha: number, phase: number, r: number, g: number, bl: number) => {
      if (b.n >= b.cap) return;
      const i = b.n++;
      _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale));
      b.mesh.setMatrixAt(i, _m);
      b.fx.setXYZW(i, flash, alpha, phase, 0);
      const ca = b.mesh.instanceColor!.array as Float32Array;
      ca[i * 3] = r; ca[i * 3 + 1] = g; ca[i * 3 + 2] = bl;
    };
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const b = this.batch(e.def.id);
      const an = b.model.anim;
      const age = sim.time - e.born;
      const grow = age < 0.3 ? 0.2 + 0.8 * (age / 0.3) : 1;
      const ph = (e.id * 0.618) % 1;
      const moving = e.stunT > 0 ? 0 : 1;
      let y = e.y + an.hover + (an.bob ? Math.sin(time * an.bobSpeed + ph * 6.28) * an.bob : 0);
      if (an.hop) y += Math.abs(Math.sin(time * an.bobSpeed * 0.5 + ph * 6.28)) * an.hop * moving;
      const yaw = an.spin ? time * an.spin + ph * 6.28 : Math.atan2(e.dx, e.dz);
      const roll = an.rock ? Math.sin(time * 9 + ph * 6.28) * an.rock * moving : 0;
      const flash = Math.max(0, 1 - (sim.time - e.hitT) / 0.1) * (e.def.size > 1.5 ? 0.14 : 0.36);
      let r = 1, g = 1, bl = 1;
      if (e.stunT > 0) { r = 1.35; g = 1.3; bl = 0.55; }
      else if (e.slowT > 0) { r = 0.6; g = 0.85; bl = 1.5; }
      else if (e.dotT > 0) { r = 1.5; g = 0.8; bl = 0.55; }
      const es = e.def.size * ENEMY_SCALE;
      put(b, e.x, y, e.z, yaw, roll, 0, es * grow, flash, e.phased ? 0.28 : 1, ph, r, g, bl);
      if (e.dotT > 0 && Math.random() < dt * 10) this.fx.trail(e.x + (Math.random() - 0.5) * 0.2, y + e.def.size * 0.3, e.z + (Math.random() - 0.5) * 0.2, 0xff8a3a, 0.1, 0.4, 1.5);
      if (e.slowT > 0 && Math.random() < dt * 5) this.fx.trail(e.x + (Math.random() - 0.5) * 0.2, y + e.def.size * 0.2, e.z + (Math.random() - 0.5) * 0.2, 0x66b8ff, 0.08, 0.4, 1.2);
      const top = y + b.model.height * es + 0.18;
      if ((e.hp < e.maxHp || e.def.boss || e.shield < e.maxShield) && bars < this.healthBarCap && !e.phased) {
        bp[bars * 3] = e.x; bp[bars * 3 + 1] = top; bp[bars * 3 + 2] = e.z;
        bd[bars * 4] = Math.max(0, e.hp / e.maxHp); bd[bars * 4 + 1] = e.maxShield > 0 ? e.shield / e.maxShield : 0;
        bd[bars * 4 + 2] = e.def.boss ? 1.7 : 0.42 + e.def.size * 0.22; bd[bars * 4 + 3] = e.def.boss ? 1 : 0;
        bars++;
      }
      if (e.shield > 1 && bub < 128) {
        const s = es * 0.95 + 0.25;
        _m.compose(_p.set(e.x, y + b.model.height * es * 0.5, e.z), _q.identity(), _s.setScalar(s));
        this.bubbles.setMatrixAt(bub, _m);
        (this.bubbleA.array as Float32Array)[bub] = 0.45 + 0.55 * (e.shield / e.maxShield) + Math.max(0, 1 - (sim.time - e.hitT) / 0.15) * 0.8;
        bub++;
      }
    }
    // death pops
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gst = this.ghosts[i];
      gst.t += dt / 0.2;
      if (gst.t >= 1) { this.ghosts.splice(i, 1); continue; }
      const b = this.batch(gst.type);
      put(b, gst.x, gst.y + b.model.anim.hover + gst.t * 0.15, gst.z, gst.yaw, 0, 0, gst.scale * ENEMY_SCALE * (1 + gst.t * 0.45), 1.2, 1 - gst.t, 0, 1, 1, 1);
    }
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      if (b.n) { b.mesh.instanceMatrix.needsUpdate = true; b.fx.needsUpdate = true; b.mesh.instanceColor!.needsUpdate = true; }
    }
    (this.bars.geometry as THREE.InstancedBufferGeometry).instanceCount = bars;
    this.barPos.needsUpdate = true; this.barData.needsUpdate = true;
    this.bubbles.count = bub;
    if (bub) { this.bubbles.instanceMatrix.needsUpdate = true; this.bubbleA.needsUpdate = true; }
  }

  private syncProjectiles(simDt: number) {
    const sim = this.sim, fx = this.fx;
    let n = 0;
    const col = this.proj.instanceColor!.array as Float32Array;
    for (const p of sim.projectiles) {
      if (!p.alive || n >= 500) continue;
      let prev = this.projPrev.get(p);
      if (!prev) { prev = new THREE.Vector3(p.sx, p.sy, p.sz); this.projPrev.set(p, prev); }
      _v.set(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      const l = _v.length();
      if (l > 1e-4) _q.setFromUnitVectors(FWD, _v.multiplyScalar(1 / l)); else _q.identity();
      const info = FAMILY_INFO[p.def.family];
      const banana = p.def.id === 'gem_banana';
      const big = !!p.def.splash;
      const tier = 1 + p.def.tier * 0.035;
      if (p.lob) _s.set(0.1 * tier, 0.1 * tier, banana ? 0.2 : 0.13 * tier);
      else if (big) _s.set(0.065 * tier, 0.065 * tier, 0.24 * tier);
      else _s.set(0.04 * tier, 0.04 * tier, 0.2 * tier);
      if (p.crit) _s.multiplyScalar(1.4);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
      this.proj.setMatrixAt(n, _m);
      _c.setHex(banana ? 0xffe14a : info.color);
      const br = banana ? 2.2 : 3.2;
      col[n * 3] = _c.r * br + 0.35; col[n * 3 + 1] = _c.g * br + 0.35; col[n * 3 + 2] = _c.b * br + 0.35;
      n++;
      if (simDt > 0) {
        const c = banana ? 0xffe14a : info.color;
        fx.trail((p.x + prev.x) / 2, (p.y + prev.y) / 2, (p.z + prev.z) / 2, c, big ? 0.13 : 0.075, big ? 0.38 : 0.2, big ? 1.5 : 1.2);
        if (big && !p.lob) fx.trail(prev.x, prev.y, prev.z, 0xffb060, 0.1, 0.25, 1.6);
      }
      prev.set(p.x, p.y, p.z);
    }
    this.proj.count = n;
    if (n) { this.proj.instanceMatrix.needsUpdate = true; this.proj.instanceColor!.needsUpdate = true; }
  }
}

export type { Enemy };
