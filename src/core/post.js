/**
 * Restrained post pipeline (standards 4.3): SMAA on Medium+, N8AO on High+.
 * No bloom (nothing in a daylight meadow physically motivates it — documented
 * in DECISIONS.md) and no DOF outside cinematics. If an effect is unavailable
 * the pipeline degrades gracefully to direct rendering.
 *
 * n8ao 2.x ships `N8AOPass` (a postprocessing Pass that composites AO over the
 * rendered beauty in the input buffer), so the chain is
 * RenderPass -> N8AOPass -> EffectPass(SMAA).
 * @module core/post
 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, SMAAEffect } from 'postprocessing';
import { N8AOPass } from 'n8ao';

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {object} presetDef quality preset definition
 * @returns {{ composer: import('postprocessing').EffectComposer|null, setSize(w:number,h:number): void, dispose(): void }}
 */
export function createPost(renderer, scene, camera, presetDef) {
  const wantsSmaa = Array.isArray(presetDef.post) && presetDef.post.includes('smaa');
  if (!wantsSmaa) {
    return { composer: null, setSize() {}, dispose() {} };
  }
  try {
    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    if (presetDef.aoEnabled) {
      const ao = new N8AOPass(scene, camera, renderer.domElement.width || 512, renderer.domElement.height || 512);
      ao.configuration.aoRadius = 1.6;
      ao.configuration.intensity = 2.2;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.aoSamples = 8;   // restrained; High+/Ultra only
      ao.configuration.denoiseSamples = 4;
      composer.addPass(ao);
    }
    composer.addPass(new EffectPass(camera, new SMAAEffect()));
    return {
      composer,
      setSize(w, h) { composer.setSize(w, h); },
      dispose() { composer.dispose(); },
    };
  } catch (e) {
    console.warn('post pipeline unavailable, rendering directly:', e);
    return { composer: null, setSize() {}, dispose() {} };
  }
}
