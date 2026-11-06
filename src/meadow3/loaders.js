/**
 * loaders.js — shared KTX2 and glTF loaders with self-hosted decoders
 * (build contract 08 §5.1). The Basis transcoder is served from
 * `${BASE_URL}decoders/basis/` by vite-plugin-decoders.js (CSP-safe glue,
 * template-changes T-24); the meshopt decoder is bundled from the pinned three
 * package. Asset paths come from public/assets/v3/manifest.json (S4).
 * @module meadow3/loaders
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const BASE = import.meta.env?.BASE_URL || './';
let ktx2 = null, gltf = null;

export function getKTX2(renderer) {
  if (ktx2) return ktx2;
  ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}decoders/basis/`).detectSupport(renderer);
  return ktx2;
}

export function getGLTF(renderer) {
  if (gltf) return gltf;
  gltf = new GLTFLoader().setKTX2Loader(getKTX2(renderer)).setMeshoptDecoder(MeshoptDecoder);
  return gltf;
}

/** Load a KTX2 texture (colour textures in sRGB, data textures linear). */
export async function loadKTX2(renderer, path, { srgb = true, repeat = false, anisotropy = 8 } = {}) {
  const tex = await getKTX2(renderer).loadAsync(`${BASE}${path}`);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

export async function loadGLB(renderer, path) {
  const g = await getGLTF(renderer).loadAsync(`${BASE}${path}`);
  noTransmission(g.scene);
  return g;
}

/**
 * Transmissive glTF glass (KHR_materials_transmission: the hand lens, the
 * flask) makes three.js draw the whole opaque scene a second time every frame
 * (it doubled every draw call and triangle here; object-detective measured
 * about 26 ms of GPU time for one lens). Thin glass reads the same as a
 * transparent, reflective surface, so transmission is swapped for opacity.
 */
export function noTransmission(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) {
      if (!m?.isMeshPhysicalMaterial || !(m.transmission > 0)) continue;
      m.transmission = 0;
      m.transparent = true;
      m.opacity = Math.min(m.opacity, 0.25);
      m.depthWrite = false;
      m.needsUpdate = true;
    }
  });
}

export async function loadHDR(path) {
  const tex = await new RGBELoader().loadAsync(`${BASE}${path}`);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/**
 * The S4 manifest: asset id -> its files. `file(id, match)` returns the
 * public path of the first file of an asset (or the one whose name contains
 * `match`, for the multi-map textures).
 */
export function manifestIndex(manifest) {
  const byId = new Map(Object.entries(manifest.assets || {}));
  return {
    byId,
    entry: (id) => byId.get(id) || null,
    file(id, match = '') {
      const e = byId.get(id);
      if (!e) throw new Error(`manifest: no asset "${id}"`);
      const f = (e.files || []).find((x) => !match || x.file.includes(match));
      if (!f) throw new Error(`manifest: asset "${id}" has no file matching "${match}"`);
      return f.file;
    },
  };
}
