/**
 * Restrained post pipeline (standards 4.3): SMAA on Medium+, N8AO on High+.
 * No bloom (nothing in a daylight meadow physically motivates it — documented
 * in DECISIONS.md) and no DOF outside cinematics. If an effect is unavailable
 * the pipeline degrades gracefully to direct rendering.
 * @module core/post
 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, SMAAEffect } from 'postprocessing';
import { N8AOEffect } from 'n8ao';

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
    const effects = [new SMAAEffect()];
    if (presetDef.aoEnabled) {
      effects.push(new N8AOEffect(camera, { aoRadius: 1.6, intensity: 2.2, distanceFalloff: 0.6 }));
    }
    composer.addPass(new EffectPass(camera, ...effects));
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
