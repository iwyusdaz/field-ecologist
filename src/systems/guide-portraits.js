/**
 * Field-guide portraits: render each species' procedural model to a PNG data
 * URL with a small offscreen renderer (one-time at startup, then disposed).
 * Used by the HTML field guide; text mode relies on the field-mark text
 * instead (shape + size first, per the accessibility rule). If WebGL is
 * unavailable the guide falls back to text-only cards.
 * @module systems/guide-portraits
 */
import * as THREE from 'three';
import { buildSpeciesGeometry } from './species-models.js';

/**
 * @param {string[]} speciesIds
 * @returns {Promise<Record<string, string>>} speciesId -> data URL (may be {} on failure)
 */
export async function renderGuidePortraits(speciesIds) {
  const out = {};
  let canvas;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 320;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe8d8);
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const dl = new THREE.DirectionalLight(0xfff2df, 2.2);
    dl.position.set(1.2, 2.4, 1.4);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xcfe0ff, 0.8);
    dl2.position.set(-1.5, 1.2, -1.0);
    scene.add(dl2);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6f8f5a, roughness: 1 }),
    );
    scene.add(ground);

    for (const id of speciesIds) {
      let geometry;
      try {
        ({ geometry } = buildSpeciesGeometry(id));
      } catch {
        continue;
      }
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
      }));
      mesh.castShadow = false;
      scene.add(mesh);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      const h = Math.max(0.05, bb.max.y - bb.min.y);
      const r = Math.max(0.05, bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
      cam.position.set(0.02 + r * 2.6, h * 0.85, r * 2.6 + h * 0.6);
      cam.lookAt(0, h * 0.45, 0);
      renderer.render(scene, cam);
      out[id] = canvas.toDataURL('image/png');
      scene.remove(mesh);
      mesh.material.dispose();
      geometry.dispose();
    }
    renderer.dispose();
  } catch {
    return {}; // guide falls back to text-only
  }
  return out;
}
