import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FAMILY_INFO, type TowerDef } from '../data/types';
import { ENEMY_BY_ID } from '../data/enemies';
import type { Engine } from './engine';
import { enemyModel } from './enemyModels';
import { makePbr } from './materials';
import { TowerVis } from './view';

/**
 * Renders portraits of towers and enemies with the real game renderer (same
 * materials, lighting model and bloom), for use in the HTML UI.
 */
export class Thumbs {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private env: THREE.WebGLRenderTarget;
  private backdrop: THREE.Mesh;
  private backMat: THREE.ShaderMaterial;
  private canvas = document.createElement('canvas');
  private cache = new Map<string, string>();
  private enemyMat = makePbr();

  constructor(private engine: Engine) {
    const pm = new THREE.PMREMGenerator(engine.renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.03);
    pm.dispose();
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.4;
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(4, 2, -5); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x10141c, 0.6));
    this.backMat = new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false,
      uniforms: { uColor: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = length((vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.15));
          vec3 col = mix(uColor * 0.11, vec3(0.008, 0.011, 0.02), smoothstep(0.0, 0.6, d));
          float floorGlow = smoothstep(0.34, 0.0, abs(vUv.y - 0.2)) * smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
          gl_FragColor = vec4(col + uColor * floorGlow * 0.03, 1.0); }`,
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backMat);
    this.backdrop.frustumCulled = false; this.backdrop.renderOrder = -100;
    this.scene.add(this.backdrop);
  }

  private shoot(obj: THREE.Object3D, size: number, color: number, lookY: number, dist: number, rim?: number): string {
    const e = this.engine;
    const pass = e.composer.passes[0] as RenderPass;
    const oldScene = pass.scene, oldCam = pass.camera;
    const { width, height, dpr } = e;
    const bloom = e.bloom.strength, vig = e.grade.uniforms.uVignette.value, ab = e.grade.uniforms.uAberration.value;
    this.scene.add(obj);
    this.backMat.uniforms.uColor.value.setHex(color);
    this.cam.position.set(dist * 0.62, lookY + dist * 0.52, dist * 0.78);
    this.cam.lookAt(0, lookY, 0);
    pass.scene = this.scene; pass.camera = this.cam;
    e.bloom.strength = 0.3; e.grade.uniforms.uVignette.value = 0; e.grade.uniforms.uAberration.value = 0;
    e.renderer.setPixelRatio(1); e.renderer.setSize(size, size, false);
    e.composer.setPixelRatio(1); e.composer.setSize(size, size);
    e.composer.render(0);
    this.canvas.width = this.canvas.height = size;
    const ctx = this.canvas.getContext('2d')!;
    ctx.drawImage(e.renderer.domElement, 0, 0, size, size);
    const url = this.canvas.toDataURL('image/webp', 0.9);
    // restore
    this.scene.remove(obj);
    pass.scene = oldScene; pass.camera = oldCam;
    e.bloom.strength = bloom; e.grade.uniforms.uVignette.value = vig; e.grade.uniforms.uAberration.value = ab;
    e.dpr = dpr;
    e.renderer.setPixelRatio(dpr); e.renderer.setSize(width, height, false);
    e.composer.setPixelRatio(dpr); e.composer.setSize(width, height);
    void rim;
    return url;
  }

  tower(def: TowerDef, size = 256): string {
    const k = `t:${def.id}:${size}`;
    let url = this.cache.get(k);
    if (url) return url;
    const vis = new TowerVis(def, false);
    vis.yaw = 0.55;
    vis.animate(0.4, 1.3);
    vis.animate(0.3, 1.7);
    vis.group.rotation.y = 0.0;
    const tall = def.id === 'cl_mythos' ? 0.16 : 0;
    url = this.shoot(vis.group, size, FAMILY_INFO[def.family].color, 0.5 + tall, 3.5 + tall * 2);
    vis.dispose();
    this.cache.set(k, url);
    return url;
  }

  enemy(id: string, size = 128): string {
    const k = `e:${id}:${size}`;
    let url = this.cache.get(k);
    if (url) return url;
    const m = enemyModel(id);
    const mesh = new THREE.Mesh(m.geo, this.enemyMat);
    mesh.rotation.y = 0.75;
    const h = m.height;
    mesh.position.y = m.anim.hover;
    const span = Math.max(h, m.geo.boundingSphere!.radius * 1.5);
    url = this.shoot(mesh, size, ENEMY_BY_ID[id]?.color ?? 0xff4455, h * 0.5 + m.anim.hover, 1.2 + span * 2.9);
    this.cache.set(k, url);
    return url;
  }
}
