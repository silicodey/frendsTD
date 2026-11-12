import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { sharedTime } from './materials';

export type Quality = 'low' | 'medium' | 'high';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.9 },
    uAberration: { value: 0.0016 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uDamage: { value: 0 },
    uTime: { value: 0 },
    uSat: { value: 1.12 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette, uAberration, uDamage, uTime, uSat; uniform vec3 uTint;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float d2 = dot(c, c);
      vec2 off = c * d2 * uAberration * 6.0;
      vec3 col = min(vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b), vec3(16.0));
      if (isnan(col.r) || isnan(col.g) || isnan(col.b)) col = vec3(0.0); // never let one bad pixel poison the frame
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // gentle filmic contrast in shadows, cool shadows / warm highlights
      col *= mix(vec3(0.94, 0.98, 1.08), vec3(1.05, 1.0, 0.95), smoothstep(0.0, 1.2, l)) * uTint;
      float v = smoothstep(0.85, 0.15, d2 * 2.2 * uVignette);
      col *= mix(0.42, 1.0, v);
      col += vec3(0.9, 0.05, 0.08) * uDamage * (1.0 - v) * 1.4;
      float n = fract(sin(dot(gl_FragCoord.xy + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.012;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  quality: Quality = 'high';
  width = 1; height = 1; dpr = 1;
  time = 0;

  // camera rig
  target = new THREE.Vector3();
  fitTarget = new THREE.Vector3();
  fitDist = 20;
  zoom = 1; // user zoom multiplier (smaller = closer)
  pan = new THREE.Vector3();
  elevation = 0.96; // radians from horizontal
  private fitEl = 0.96;
  azimuth = 0;
  /** Cinematic override (trailer): when set, the camera rig is bypassed. */
  cine: { pos: THREE.Vector3; look: THREE.Vector3; fov: number; roll: number } | null = null;
  /** 1 → 0 fly-in when a level opens. */
  intro = 0;
  private shakeAmt = 0;
  private shakeOff = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  damage = 0;
  private fps = 60; private fpsT = 0; private frames = 0; private slowStreak = 0; private fastStreak = 0;
  autoDpr = true;
  maxDpr = 2;
  private bounds = { cols: 9, rows: 14, top: 0, bottom: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setClearColor(0x02040a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps neon emissives saturated instead of bleaching them
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.7, 0.82);
    // clamp bloom input: MSAA-extrapolated speculars on sub-pixel geometry can produce fireflies
    const hp = (this.bloom as unknown as { materialHighPassFilter: THREE.ShaderMaterial }).materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); if (isnan(texel.r) || isnan(texel.g) || isnan(texel.b)) texel = vec4(0.0); texel = clamp(texel, vec4(0.0), vec4(10.0));');
    hp.needsUpdate = true;
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.scene.add(this.camera);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.maxDpr = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.bloom.strength = q === 'low' ? 0.45 : 0.55;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.applySize();
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w); this.height = Math.max(1, h);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr, this.dpr < 0.6 ? 1 : this.dpr || 1);
    if (!this.autoDpr || this.dpr <= 0) this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.applySize();
    this.fit();
  }

  private applySize() {
    const { width: w, height: h } = this;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Frame the board inside the screen area left free by the HUD (insets in CSS px). */
  setBounds(cols: number, rows: number, top: number, bottom: number) {
    this.bounds = { cols, rows, top, bottom };
    this.fit();
  }

  private placeCamera(target: THREE.Vector3, dist: number) {
    const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
    this.camPos.set(target.x + Math.sin(this.azimuth) * ce * dist, target.y + se * dist, target.z + Math.cos(this.azimuth) * ce * dist);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
  }

  fit() {
    const { cols, rows, top, bottom } = this.bounds;
    const hx = cols / 2 + 0.12, hz = rows / 2 + 0.3;
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { pts.push(new THREE.Vector3(sx * hx, 0, sz * hz)); pts.push(new THREE.Vector3(sx * hx, sz < 0 ? 1.5 : 0.4, sz * hz)); }
    const tN = 1 - (2 * top) / this.height, bN = -1 + (2 * bottom) / this.height; // safe NDC y range
    const cy = (tN + bN) / 2, availY = Math.max(0.2, tN - bN), availX = 1.97;
    const target = this.fitTarget.set(0, 0, 0);
    let dist = 30;
    const az = this.azimuth;
    this.azimuth = 0;
    const v = new THREE.Vector3();
    for (let it = 0; it < 24; it++) {
      this.placeCamera(target, dist);
      let minX = 9, maxX = -9, minY = 9, maxY = -9;
      for (const p of pts) {
        v.copy(p).project(this.camera);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const s = Math.max((maxX - minX) / availX, (maxY - minY) / availY);
      dist = Math.min(400, Math.max(2, dist * (1 + (s - 1) * 0.8)));
      // re-centre vertically: moving the target toward the camera pushes the board up the screen
      const midY = (minY + maxY) / 2;
      target.z -= (midY - cy) * dist * 0.3 * Math.tan((this.camera.fov * Math.PI) / 360) / 0.287;
    }
    this.fitDist = dist;
    this.azimuth = az;
    this.fitEl = this.elevation;
  }

  /** Apply the cinematic camera right away so project()/pick() match the frame about to be drawn. */
  applyCine() {
    const c = this.cine;
    if (!c) return;
    if (Math.abs(this.camera.fov - c.fov) > 0.001) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.copy(c.pos);
    this.camera.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
    this.camera.lookAt(c.look);
    this.camera.updateMatrixWorld(true);
  }

  /** Advance clocks without drawing (used when a capture skips frames). */
  tick(dt: number) { this.time += dt; sharedTime.value = this.time; this.shakeAmt *= Math.exp(-dt * 9); }

  shake(a: number) { this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }
  /** Uncapped shake for set pieces. */
  quake(a: number) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  /** Convert a screen point (CSS px) to a point on the ground plane y=0. */
  pick(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const ndc = new THREE.Vector3((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = -this.camera.position.y / dir.y;
    if (t < 0) return null;
    return out.copy(this.camera.position).addScaledVector(dir, t);
  }

  project(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(x, y, z).project(this.camera);
    out.x = (out.x * 0.5 + 0.5) * this.width;
    out.y = (-out.y * 0.5 + 0.5) * this.height;
    return out;
  }

  render(dt: number) {
    this.time += dt;
    sharedTime.value = this.time;
    // camera
    if (this.cine) {
      const c = this.cine;
      if (Math.abs(this.camera.fov - c.fov) > 0.001) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
      this.camera.position.copy(c.pos);
      this.camera.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
      this.camera.lookAt(c.look);
      this.camera.updateMatrixWorld(true);
    } else {
    this.camera.up.set(0, 1, 0);
    if (this.camera.fov !== 32) { this.camera.fov = 32; this.camera.updateProjectionMatrix(); }
    if (Math.abs(this.elevation - this.fitEl) > 0.002) this.fit();
    const maxPan = (1 - this.zoom) * 7 + 0.001;
    this.pan.x = THREE.MathUtils.clamp(this.pan.x, -maxPan, maxPan);
    this.pan.z = THREE.MathUtils.clamp(this.pan.z, -maxPan * 1.6, maxPan * 1.6);
    this.target.copy(this.fitTarget).add(this.pan);
    if (this.intro > 0.001) {
      this.intro = Math.max(0, this.intro - dt * 0.9);
      const k = this.intro * this.intro * (3 - 2 * this.intro); // smoothstep
      const el = this.elevation;
      this.elevation = el - k * 0.42;
      const az = this.azimuth;
      this.azimuth = az + k * 0.55;
      this.placeCamera(this.target, this.fitDist * this.zoom * (1 + k * 0.55));
      this.elevation = el; this.azimuth = az;
    } else this.placeCamera(this.target, this.fitDist * this.zoom);
    }
    if (this.shakeAmt > 0.001) {
      const t = this.time * 47;
      this.shakeOff.set(Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5, Math.sin(t * 1.7 + 1) + Math.sin(t * 3.7) * 0.5, 0).multiplyScalar(this.shakeAmt * 0.35);
      this.camera.position.add(this.shakeOff.applyQuaternion(this.camera.quaternion));
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.damage = Math.max(0, this.damage - dt * 1.6);
    const gu = this.grade.uniforms;
    gu.uDamage.value = this.damage;
    gu.uTime.value = this.time;
    this.composer.render(dt);

    // adaptive resolution
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0;
      if (this.autoDpr && this.time > 2) {
        if (this.fps < 45) { this.slowStreak++; this.fastStreak = 0; } else if (this.fps > 57) { this.fastStreak++; this.slowStreak = 0; } else { this.slowStreak = 0; this.fastStreak = 0; }
        const maxD = Math.min(window.devicePixelRatio || 1, this.maxDpr);
        if (this.slowStreak >= 2 && this.dpr > 0.75) { this.dpr = Math.max(0.75, this.dpr * 0.85); this.applySize(); this.slowStreak = 0; }
        else if (this.fastStreak >= 8 && this.dpr < maxD) { this.dpr = Math.min(maxD, this.dpr * 1.1); this.applySize(); this.fastStreak = 0; }
      }
    }
  }

  getFps() { return this.fps; }

  /** Pixels per world unit at distance 1 — multiply by world size / view depth for gl_PointSize. */
  pointScale() { return (this.height * this.dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)); }
}
