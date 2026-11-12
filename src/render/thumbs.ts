import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FAMILY_INFO, type TowerDef } from '../data/types';
import { ENEMY_BY_ID } from '../data/enemies';
import type { Engine } from './engine';
import { enemyModel } from './enemyModels';
import { makePbr } from './materials';
import { TowerVis } from './view';

const S = 384; // internal portrait resolution
const _vp = new THREE.Vector4();

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
  private composer: EffectComposer;

  constructor(private engine: Engine) {
    const pm = new THREE.PMREMGenerator(engine.renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.03);
    pm.dispose();
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.4;
    // Same light counts and fog type as the game scene, so both share one compiled PBR program.
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(64, 64);
    const rim = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(4, 2, -5);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(3, 1, 5);
    this.scene.add(key, rim, fill, new THREE.HemisphereLight(0xbfd4ff, 0x10141c, 0.6));
    for (let i = 0; i < 3; i++) this.scene.add(new THREE.PointLight(0xffffff, 0, 1, 1.6));
    this.scene.fog = new THREE.FogExp2(0x000000, 0);
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
    const rt = new THREE.WebGLRenderTarget(S, S, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(engine.renderer, rt);
    this.composer.setPixelRatio(1);
    this.composer.setSize(S, S);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(S, S), 0.3, 0.7, 0.82));
    this.composer.addPass(new OutputPass());
  }

  private shoot(obj: THREE.Object3D, size: number, color: number, lookY: number, dist: number): string {
    const r = this.engine.renderer;
    this.scene.add(obj);
    this.backMat.uniforms.uColor.value.setHex(color);
    this.cam.position.set(dist * 0.62, lookY + dist * 0.52, dist * 0.78);
    this.cam.lookAt(0, lookY, 0);
    // Render through a small dedicated composer into the corner of the main canvas, then copy it out.
    // (Resizing the main composer for every portrait would reallocate all of its render targets.)
    const pr = r.getPixelRatio();
    r.getViewport(_vp);
    r.setViewport(0, 0, S / pr, S / pr);
    this.composer.render(0);
    r.setViewport(_vp);
    this.canvas.width = this.canvas.height = size;
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    const src = r.domElement;
    ctx.drawImage(src, 0, src.height - S, S, S, 0, 0, size, size);
    this.scene.remove(obj);
    return this.canvas.toDataURL('image/webp', 0.9);
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
    // frame by the model's real bounds so every portrait fills its card
    const box = new THREE.Box3().setFromObject(vis.group);
    const cy = (box.min.y + box.max.y) / 2, h = box.max.y - box.min.y;
    const span = Math.max(h, (box.max.x - box.min.x) * 0.95, (box.max.z - box.min.z) * 0.95);
    url = this.shoot(vis.group, size, FAMILY_INFO[def.family].color, cy - 0.02, 1.15 + span * 1.95);
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
    url = this.shoot(mesh, size, ENEMY_BY_ID[id]?.color ?? 0xff4455, h * 0.5 + m.anim.hover, 0.85 + span * 2.25);
    this.cache.set(k, url);
    return url;
  }
}
