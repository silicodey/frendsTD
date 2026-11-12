import * as THREE from 'three';

export interface PbrUniforms {
  uFx: { value: THREE.Vector4 }; // x: white flash, y: opacity (dither), z: phase, w: tint-to-dark (jam)
  uGlow: { value: number };
  uTime: { value: number };
  uWiggle: { value: THREE.Vector3 }; // amp, freq, speed
}

export const sharedTime = { value: 0 };

/**
 * One PBR shader for every procedural model in the game. Colour, emissive strength,
 * metalness and roughness all come from vertex attributes so that a whole tower or
 * enemy is a single draw call.
 */
export function makePbr(instanced = false): THREE.MeshStandardMaterial & { u: PbrUniforms } {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 1.0 }) as THREE.MeshStandardMaterial & { u: PbrUniforms };
  mat.u = {
    uFx: { value: new THREE.Vector4(0, 1, 0, 0) },
    uGlow: { value: 1 },
    uTime: sharedTime,
    uWiggle: { value: new THREE.Vector3(0, 0, 0) },
  };
  if (instanced) mat.defines = { ...(mat.defines ?? {}), INST_FX: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.u);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', /* glsl */ `
        attribute vec3 aPbr;
        varying vec3 vPbr;
        varying vec4 vFx;
        uniform vec4 uFx;
        uniform float uTime;
        uniform vec3 uWiggle;
        #ifdef INST_FX
        attribute vec4 iFx;
        #endif
        void main() {
          vPbr = aPbr;
          #ifdef INST_FX
          vFx = iFx;
          #else
          vFx = uFx;
          #endif`)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        if (uWiggle.x > 0.0) {
          float w = sin(position.z * uWiggle.y - uTime * uWiggle.z + vFx.z * 6.2831);
          transformed.x += w * uWiggle.x * smoothstep(0.6, -0.6, position.z);
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', /* glsl */ `
        varying vec3 vPbr;
        varying vec4 vFx;
        uniform float uGlow;
        void main() {
          if (vFx.y < 0.999) {
            float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (n > vFx.y) discard;
          }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vPbr.z, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance = vColor.rgb * vPbr.x * uGlow + vec3(1.0, 0.92, 0.85) * vFx.x;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.25, vFx.w);
        totalEmissiveRadiance *= 1.0 - vFx.w * 0.85;`);
  };
  mat.customProgramCacheKey = () => (instanced ? 'pbr-inst' : 'pbr');
  return mat;
}

/** Additive, depth-test-only material helper for glows. */
export function additive(params: THREE.ShaderMaterialParameters): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...params });
}
