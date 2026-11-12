import * as THREE from 'three';
import { additive } from './materials';
import type { Engine } from './engine';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

// ---------------- GPU-drawn, CPU-simulated particles ----------------
class Particles {
  points: THREE.Points;
  private pos: Float32Array; private vel: Float32Array; private col: Float32Array; private dat: Float32Array; // size, life01
  private life: Float32Array; private max: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private cursor = 0; private high = 0;
  private geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;

  constructor(private cap: number) {
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.dat = new Float32Array(cap * 2); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aData', new THREE.BufferAttribute(this.dat, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = additive({
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `attribute vec3 aColor; attribute vec2 aData; uniform float uScale; varying vec3 vC; varying float vL;
        void main(){ vC = aColor; vL = aData.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aData.x * uScale * (0.35 + 0.65 * aData.y) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying vec3 vC; varying float vL;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a + smoothstep(0.35, 0.0, d) * 0.8;
          gl_FragColor = vec4(vC * a * smoothstep(0.0, 0.25, vL), 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, bright: number, size: number, life: number, gravity = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    if (i >= this.high) this.high = i + 1;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r * bright; this.col[i * 3 + 1] = color.g * bright; this.col[i * 3 + 2] = color.b * bright;
    this.dat[i * 2] = size; this.dat[i * 2 + 1] = 1;
    this.life[i] = life; this.max[i] = life; this.grav[i] = gravity; this.drag[i] = drag;
  }

  update(dt: number) {
    const { pos, vel, life, max, dat, grav, drag } = this;
    let top = 0;
    for (let i = 0; i < this.high; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { dat[i * 2] = 0; dat[i * 2 + 1] = 0; continue; }
      top = i + 1;
      const k = i * 3;
      if (drag[i] > 0) { const f = Math.exp(-drag[i] * dt); vel[k] *= f; vel[k + 1] *= f; vel[k + 2] *= f; }
      vel[k + 1] -= grav[i] * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      dat[i * 2 + 1] = life[i] / max[i];
    }
    this.high = top;
    this.geo.setDrawRange(0, Math.max(1, top));
    const a = this.geo.attributes as Record<string, THREE.BufferAttribute>;
    a.position.needsUpdate = true; a.aColor.needsUpdate = true; a.aData.needsUpdate = true;
  }
}

interface Beam { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; life: number; max: number; used: boolean; width: number }
interface Ring { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; r0: number; r1: number }
interface Flash { sprite: THREE.Sprite; t: number; dur: number; size: number }
interface Bolt { pts: number[]; life: number; max: number; color: THREE.Color; width: number; jitterT: number; seed: number; amp: number }
interface FloatText { el: HTMLDivElement; t: number; dur: number; x: number; y: number; z: number; busy: boolean }

export class Fx {
  sparks = new Particles(3600);
  private beams: Beam[] = [];
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private bolts: Bolt[] = [];
  private boltMesh: THREE.InstancedMesh;
  private lights: { l: THREE.PointLight; t: number; dur: number; power: number }[] = [];
  private texts: FloatText[] = [];
  private beamGeo: THREE.BufferGeometry;
  private ringGeo = new THREE.PlaneGeometry(2, 2);
  private flashTex: THREE.Texture;
  group = new THREE.Group();
  private textLayer: HTMLElement | null;
  lowFx = false;

  constructor(private engine: Engine, textLayer: HTMLElement | null) {
    this.textLayer = textLayer;
    engine.scene.add(this.group);
    this.group.add(this.sparks.points);
    // beam: open cylinder along +Z, length 1
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.beamGeo.rotateX(Math.PI / 2); this.beamGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 28; i++) {
      const mat = additive({
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uAlpha: { value: 1 }, uLen: { value: 1 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime, uAlpha, uLen; varying vec2 vUv; varying vec3 vN;
          void main(){ float f = pow(clamp(abs(normalize(vN).z), 0.0, 1.0), 2.2); // MSAA can extrapolate varyings on sub-pixel tubes
            float flow = 0.75 + 0.25 * sin(vUv.y * uLen * 9.0 - uTime * 30.0) + 0.2 * sin(vUv.y * uLen * 23.0 - uTime * 55.0);
            vec3 col = uColor * f * flow * 2.0 + vec3(1.0) * pow(f, 6.0) * 1.3;
            gl_FragColor = vec4(min(col * uAlpha, vec3(6.0)), 1.0); }`,
      });
      const mesh = new THREE.Mesh(this.beamGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 15;
      this.group.add(mesh);
      this.beams.push({ mesh, mat, life: 0, max: 0, used: false, width: 0.05 });
    }
    for (let i = 0; i < 26; i++) {
      const mat = additive({
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uThick: { value: 0.12 }, uFill: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uT, uThick, uFill; varying vec2 vUv;
          void main(){ float r = length(vUv - 0.5) * 2.0;
            float ring = smoothstep(uThick, 0.0, abs(r - (1.0 - uThick))) ;
            float fill = smoothstep(1.0, 0.2, r) * uFill * step(r, 1.0);
            float a = (ring * 1.6 + fill) * (1.0 - uT) * (1.0 - uT);
            gl_FragColor = vec4(uColor * a, 1.0); }`,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 12;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t: 1, dur: 1, r0: 0, r1: 1 });
    }
    // radial flash sprite texture
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.6)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'lighter';
    for (const a of [0, Math.PI / 2]) { g.save(); g.translate(64, 64); g.rotate(a); const lg = g.createLinearGradient(-64, 0, 64, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(-64, -1.5, 128, 3); g.restore(); }
    this.flashTex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 36; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, color: 0xffffff }));
      sprite.visible = false; sprite.renderOrder = 18;
      this.group.add(sprite);
      this.flashes.push({ sprite, t: 1, dur: 1, size: 1 });
    }
    // lightning segments
    const seg = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    seg.rotateX(Math.PI / 2); seg.translate(0, 0, 0.5);
    this.boltMesh = new THREE.InstancedMesh(seg, new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }), 900);
    this.boltMesh.count = 0; this.boltMesh.frustumCulled = false; this.boltMesh.renderOrder = 16;
    this.boltMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3), 3);
    this.group.add(this.boltMesh);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 7, 1.6);
      this.group.add(l);
      this.lights.push({ l, t: 1, dur: 1, power: 0 });
    }
    if (textLayer) for (let i = 0; i < 36; i++) {
      const el = document.createElement('div');
      el.className = 'float-text';
      textLayer.appendChild(el);
      this.texts.push({ el, t: 0, dur: 1, x: 0, y: 0, z: 0, busy: false });
    }
  }

  // ---------- emitters ----------
  burst(x: number, y: number, z: number, color: number, n: number, speed: number, size = 0.1, life = 0.5, gravity = 4, up = 0.4, bright = 2.2) {
    if (this.lowFx) n = Math.ceil(n * 0.5);
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), s = speed * (0.35 + Math.random() * 0.85);
      this.sparks.emit(x, y, z, Math.sin(e) * Math.cos(a) * s, Math.cos(e) * s * 0.8 + up * speed, Math.sin(e) * Math.sin(a) * s,
        _c, bright * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), life * (0.5 + Math.random()), gravity, 2.2);
    }
  }

  trail(x: number, y: number, z: number, color: number, size = 0.09, life = 0.28, bright = 1.6) {
    _c.setHex(color);
    this.sparks.emit(x + (Math.random() - 0.5) * 0.04, y + (Math.random() - 0.5) * 0.04, z + (Math.random() - 0.5) * 0.04, 0, 0.1, 0, _c, bright, size, life, 0, 0);
  }

  fountain(x: number, y: number, z: number, color: number, n: number, speed = 2.5, size = 0.09, life = 0.8) {
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.35;
      this.sparks.emit(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * 0.3, speed * (0.5 + Math.random()), Math.sin(a) * 0.3, _c, 2, size * (0.5 + Math.random()), life * (0.5 + Math.random() * 0.8), -0.5, 1.5);
    }
  }

  ringBurst(x: number, y: number, z: number, color: number, n: number, radius: number, speed: number, size = 0.08, life = 0.5) {
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      this.sparks.emit(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius, Math.cos(a) * speed, 0.3 + Math.random() * 0.6, Math.sin(a) * speed, _c, 2, size, life * (0.6 + Math.random() * 0.6), 0, 2);
    }
  }

  /** One-shot or persistent beam. life<=0 → valid for this frame only. */
  beam(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, width: number, life = 0, alpha = 1) {
    let b: Beam | undefined;
    for (const c of this.beams) if (!c.used && c.life <= 0) { b = c; break; }
    if (!b) return;
    b.used = true; b.life = life; b.max = life; b.width = width;
    _v.set(x1, y1, z1); _v2.set(x2, y2, z2);
    const len = _v.distanceTo(_v2);
    b.mesh.position.copy(_v);
    b.mesh.lookAt(_v2);
    b.mesh.scale.set(width, width, len);
    b.mat.uniforms.uColor.value.setHex(color);
    b.mat.uniforms.uTime.value = this.engine.time;
    b.mat.uniforms.uAlpha.value = alpha;
    b.mat.uniforms.uLen.value = len;
    b.mesh.visible = true;
  }

  ring(x: number, y: number, z: number, color: number, r0: number, r1: number, dur = 0.5, thick = 0.14, fill = 0, bright = 1.6) {
    let r: Ring | undefined;
    for (const c of this.rings) if (c.t >= 1) { r = c; break; }
    if (!r) return;
    r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1;
    r.mesh.position.set(x, y, z);
    r.mat.uniforms.uColor.value.setHex(color).multiplyScalar(bright);
    r.mat.uniforms.uThick.value = thick; r.mat.uniforms.uFill.value = fill;
    r.mesh.visible = true;
  }

  flash(x: number, y: number, z: number, color: number, size: number, dur = 0.18, bright = 1.5) {
    let f: Flash | undefined;
    for (const c of this.flashes) if (c.t >= 1) { f = c; break; }
    if (!f) return;
    f.t = 0; f.dur = dur; f.size = size;
    f.sprite.position.set(x, y, z);
    (f.sprite.material as THREE.SpriteMaterial).color.setHex(color).multiplyScalar(bright);
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
  }

  light(x: number, y: number, z: number, color: number, power: number, dur = 0.3) {
    let best = this.lights[0];
    for (const c of this.lights) { if (c.t >= 1) { best = c; break; } if (c.t > best.t) best = c; }
    best.t = 0; best.dur = dur; best.power = power;
    best.l.position.set(x, y, z); best.l.color.setHex(color);
  }

  bolt(pts: number[], color: number, width = 0.035, life = 0.2, amp = 0.22) {
    if (this.bolts.length > 40) this.bolts.shift();
    this.bolts.push({ pts, life, max: life, color: new THREE.Color(color), width, jitterT: 0, seed: Math.random() * 1000, amp });
  }

  explosion(x: number, y: number, z: number, color: number, radius: number, big = false) {
    this.flash(x, y + 0.15, z, 0xffffff, radius * 2.6, 0.16, 1.4);
    this.flash(x, y + 0.15, z, color, radius * 3.6, 0.3, 1.3);
    this.ring(x, 0.03, z, color, radius * 0.2, radius * 1.15, 0.42, 0.16, 0.5);
    this.burst(x, y + 0.1, z, color, big ? 26 : 14, 3 + radius * 2, 0.12, 0.5, 6, 0.5);
    this.burst(x, y + 0.1, z, 0xffffff, big ? 8 : 4, 2 + radius, 0.07, 0.3, 3, 0.4, 3);
    this.light(x, y + 0.6, z, color, big ? 14 : 8, 0.35);
    if (big) this.engine.shake(0.12);
  }

  text(x: number, y: number, z: number, str: string, cls: string) {
    if (!this.textLayer) return;
    let t: FloatText | undefined;
    for (const c of this.texts) if (!c.busy) { t = c; break; }
    if (!t) return;
    t.busy = true; t.t = 0; t.dur = 0.9; t.x = x; t.y = y; t.z = z;
    t.el.textContent = str;
    t.el.className = 'float-text show ' + cls;
  }

  private buildBolts() {
    let n = 0;
    const mesh = this.boltMesh;
    const col = mesh.instanceColor!.array as Float32Array;
    for (const b of this.bolts) {
      const k = b.life / b.max;
      const w = b.width * (0.4 + 0.6 * k);
      const hops = b.pts.length / 3 - 1;
      for (let h = 0; h < hops; h++) {
        const ax = b.pts[h * 3], ay = b.pts[h * 3 + 1], az = b.pts[h * 3 + 2];
        const bx = b.pts[h * 3 + 3], by = b.pts[h * 3 + 4], bz = b.pts[h * 3 + 5];
        const len = Math.hypot(bx - ax, by - ay, bz - az);
        const segs = Math.max(3, Math.min(14, Math.round(len * 3.5)));
        let px = ax, py = ay, pz = az;
        for (let s = 1; s <= segs && n < 900; s++) {
          const t = s / segs;
          const j = s === segs ? 0 : b.amp * Math.sin(t * Math.PI) * Math.min(1, len * 0.5);
          const r1 = Math.sin(b.seed + s * 12.9898 + h * 4.1) * 43758.5453, r2 = Math.sin(b.seed + s * 78.233 + h * 1.7) * 12345.678, r3 = Math.sin(b.seed + s * 39.425 + h * 9.3) * 2345.67;
          const qx = ax + (bx - ax) * t + ((r1 - Math.floor(r1)) - 0.5) * 2 * j;
          const qy = ay + (by - ay) * t + ((r2 - Math.floor(r2)) - 0.5) * 2 * j;
          const qz = az + (bz - az) * t + ((r3 - Math.floor(r3)) - 0.5) * 2 * j;
          _v.set(px, py, pz); _v2.set(qx - px, qy - py, qz - pz);
          const l = _v2.length();
          _q.setFromUnitVectors(FWD, _v2.multiplyScalar(1 / (l || 1)));
          _m.compose(_v, _q, _s.set(w, w, l));
          mesh.setMatrixAt(n, _m);
          const br = 1.2 + 2.2 * k;
          col[n * 3] = b.color.r * br + 0.25 * k; col[n * 3 + 1] = b.color.g * br + 0.25 * k; col[n * 3 + 2] = b.color.b * br + 0.25 * k;
          n++;
          px = qx; py = qy; pz = qz;
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }

  /** Call at the start of each frame before emitting per-frame beams. */
  beginFrame() {
    for (const b of this.beams) { if (b.used && b.max <= 0) { b.used = false; b.mesh.visible = false; } }
  }

  update(dt: number) {
    const e = this.engine;
    this.sparks.mat.uniforms.uScale.value = e.pointScale();
    this.sparks.update(dt);
    for (const b of this.beams) {
      if (b.max > 0 && b.used) {
        b.life -= dt;
        if (b.life <= 0) { b.used = false; b.mesh.visible = false; b.max = 0; continue; }
        const k = b.life / b.max;
        b.mat.uniforms.uAlpha.value = k * k;
        b.mesh.scale.x = b.mesh.scale.y = b.width * (0.3 + 0.7 * k);
      }
      if (b.mesh.visible) b.mat.uniforms.uTime.value = e.time;
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) { r.mesh.visible = false; continue; }
      const ease = 1 - Math.pow(1 - r.t, 3);
      const s = r.r0 + (r.r1 - r.r0) * ease;
      r.mesh.scale.set(s, s, 1);
      r.mat.uniforms.uT.value = r.t;
    }
    for (const f of this.flashes) {
      if (f.t >= 1) continue;
      f.t += dt / f.dur;
      if (f.t >= 1) { f.sprite.visible = false; continue; }
      const s = f.size * (0.5 + 0.5 * Math.sqrt(f.t));
      f.sprite.scale.set(s, s, 1);
      f.sprite.material.opacity = (1 - f.t) * (1 - f.t);
    }
    for (const l of this.lights) {
      if (l.t >= 1) { l.l.intensity = 0; continue; }
      l.t += dt / l.dur;
      l.l.intensity = l.power * Math.max(0, 1 - l.t) ** 2;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt; b.jitterT -= dt;
      if (b.jitterT <= 0) { b.jitterT = 0.045; b.seed = Math.random() * 1000; }
      if (b.life <= 0) this.bolts.splice(i, 1);
    }
    this.buildBolts();
    for (const t of this.texts) {
      if (!t.busy) continue;
      t.t += dt / t.dur;
      if (t.t >= 1) { t.busy = false; t.el.className = 'float-text'; continue; }
      e.project(t.x, t.y + t.t * 0.9, t.z, _v);
      t.el.style.transform = `translate3d(${_v.x.toFixed(1)}px, ${_v.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(t.t < 0.15 ? 0.6 + (t.t / 0.15) * 0.6 : 1.2 - (t.t - 0.15) * 0.25).toFixed(3)})`;
      t.el.style.opacity = String(t.t > 0.6 ? 1 - (t.t - 0.6) / 0.4 : 1);
    }
  }

  clear() {
    for (const b of this.beams) { b.used = false; b.life = 0; b.max = 0; b.mesh.visible = false; }
    for (const r of this.rings) { r.t = 1; r.mesh.visible = false; }
    for (const f of this.flashes) { f.t = 1; f.sprite.visible = false; }
    for (const t of this.texts) { t.busy = false; t.el.className = 'float-text'; }
    this.bolts.length = 0;
    this.boltMesh.count = 0;
  }
}
