/**
 * GPU wind shader for instanced vegetation (MeshStandardMaterial + onBeforeCompile).
 *
 * Wind level policy (design/realism-matrix.md): wind is a gentle ambient motion
 * outdoors, but movement makes counting harder for no learning gain — inside the
 * quadrat counting view the amplitude drops to ~12%, and with reduced motion it
 * pauses entirely. No decorative gusts, no sweeps.
 * @module systems/wind
 */

/**
 * Patch a MeshStandardMaterial for instanced wind sway.
 * @param {THREE.MeshStandardMaterial} material
 * @param {{uTime:{value:number}, uWind:{value:number}}} sharedUniforms uniforms shared by all species materials
 */
export function applyWind(material, sharedUniforms) {
  const uniforms = sharedUniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec2 vOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  #else
    vec2 vOrigin = vec2(0.0);
  #endif
  float phase = uTime * 1.6 + vOrigin.x * 0.37 + vOrigin.y * 0.53;
  float hFactor = clamp(position.y * 2.2, 0.0, 1.0);
  transformed.x += sin(phase) * uWind * hFactor * 0.05;
  transformed.z += cos(phase * 0.83) * uWind * hFactor * 0.04;`);
  };
  material.customProgramCacheKey = () => 'meadow-wind';
  return uniforms;
}
