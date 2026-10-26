/**
 * Vegetation renderer: one InstancedMesh per species for the near LOD (real
 * procedural geometry with the wind shader) + one InstancedMesh of camera-facing
 * billboard imposters for the distance, with chunk-based culling between them.
 *
 * Performance design (plan §13, standards 4.5):
 *  - ~17,000 plants total but only 10 instanced draw calls at full detail;
 *  - chunks are 10 m x 10 m; a chunk's instances go to the near mesh when the
 *    camera is within `nearDist` (preset-scaled) and the chunk intersects the
 *    frustum, otherwise to the imposter mesh (also frustum-limited);
 *  - visible instance buffers are rebuilt at most every 150 ms or when the
 *    camera moves > 1.5 m (matrix upload is the only per-move CPU cost);
 *  - vegetation density and near distance scale with the quality preset;
 *  - wind amplitude is reduced inside the quadrat view (see systems/wind.js).
 * @module systems/vegetation-renderer
 */
import * as THREE from 'three';
import { buildSpeciesGeometry } from './species-models.js';
import { applyWind } from './wind.js';
import { terrainHeight, FIELD_SIZE } from './moisture-field.js';

const CHUNK = 10;                 // metres per chunk edge
const CHUNKS = FIELD_SIZE / CHUNK;

/** Deterministic per-instance jitter in [0,1). */
function frac(n) { return (n * 0.618033988749895) % 1; }

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {object} opts.population buildPopulation result
 * @param {Array<{id:string}>} opts.speciesList content species list
 * @param {object} opts.preset quality preset definition (vegetationDensity, textureMaxSize...)
 */
export class VegetationRenderer {
  constructor({ scene, renderer, population, speciesList, preset }) {
    this.scene = scene;
    this.renderer = renderer;
    this.population = population;
    this.windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
    this.nearDist = 24;
    this.lastBuildPos = new THREE.Vector3(1e9, 0, 0);
    this.lastBuildTime = 0;
    this._frustum = new THREE.Frustum();
    this._mat4 = new THREE.Matrix4();
    this._v = new THREE.Vector3();

    this.species = new Map();
    this._aabb = new THREE.Box3();
    this.densityFactor = preset.vegetationDensity;
    for (const meta of speciesList) {
      const id = meta.id;
      const pts = population.positions[id] || [];
      const { geometry, radius } = buildSpeciesGeometry(id);

      // Per-instance transforms (all instances; preset density thins at rebuild time).
      const mats = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const s = 0.85 + 0.3 * frac(i * 3 + 7);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, terrainHeight(p.x, p.z) - 0.02, p.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), frac(i * 5 + 1) * Math.PI * 2),
          new THREE.Vector3(s, s * (0.9 + 0.2 * frac(i * 11 + 3)), s),
        );
        mats.push(m);
      }

      // Sort instances by chunk and store chunk ranges.
      const order = mats.map((m, idx) => ({
        idx,
        c: Math.min(CHUNKS - 1, Math.floor(m.elements[12] / CHUNK)) + Math.min(CHUNKS - 1, Math.floor(m.elements[14] / CHUNK)) * CHUNKS,
      })).sort((a, b) => a.c - b.c);
      const ranges = new Map(); // chunk -> [start, count)
      order.forEach((o, pos) => {
        if (!ranges.has(o.c)) ranges.set(o.c, [pos, 0]);
        ranges.get(o.c)[1]++;
      });
      const sortedMatrices = order.map((o) => mats[o.idx]);
      const totalCount = sortedMatrices.length;

      // Wind material for the near mesh (shares the renderer-level wind uniforms).
      const windMat = new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
      });
      applyWind(windMat, this.windUniforms);

      // Near instanced mesh (capacity covers the largest plausible near set).
      const nearCap = Math.max(64, Math.ceil(totalCount * 0.55) + 256);
      const nearMesh = new THREE.InstancedMesh(geometry, windMat, nearCap);
      nearMesh.frustumCulled = false;
      nearMesh.castShadow = true;
      nearMesh.receiveShadow = true;
      nearMesh.count = 0;
      scene.add(nearMesh);

      // Baked billboard imposter (rendered from the real geometry once at startup).
      // The bake fits the model's bounding box into a square; the imposter plane
      // uses that same square size in world metres so the billboard is undistorted
      // and the plant sits on the ground inside it.
      const baked = bakeImposter(renderer, geometry);
      const impMat = new THREE.MeshBasicMaterial({ map: baked.texture, alphaTest: 0.2, side: THREE.DoubleSide });
      const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      const impCap = Math.max(64, totalCount);
      const impMesh = new THREE.InstancedMesh(quad, impMat, impCap);
      impMesh.frustumCulled = false;
      impMesh.renderOrder = 1;
      impMesh.count = 0;
      scene.add(impMesh);

      geometry.computeBoundingBox();
      const modelHeight = Math.max(0.1, geometry.boundingBox.max.y);
      this.species.set(id, {
        id, geometry, nearMesh, impMesh, windMat, impMat,
        matrices: sortedMatrices, ranges,
        worldRadius: radius,
        height: baked.side, // billboard square side in metres (ground-anchored via the 0.5-translate)
      });
    }
  }

  /** Set wind level: 1 ambient, 0.12 quadrat counting, 0 reduced motion. */
  setWindLevel(v) { this.windUniforms.uWind.value = v; }

  /**
   * Reduce background-species prominence inside the active quadrat so the
   * counted plants read clearly (a counting affordance, like parting the sward
   * — documented in design/realism-matrix.md). Pass null to clear.
   */
  setQuadratFocus(cx, cz) {
    this._focus = cx == null ? null : { x: cx, z: cz, r: 2.2, scale: 0.55, species: new Set(['bunchgrass', 'daisyleaf']) };
    this.lastBuildPos.set(1e9, 0, 0); // force rebuild
  }

  /** Reveal highlight: tint a species' materials (labels/markers in HTML carry meaning too). */
  setSpeciesHighlight(id, on) {
    const sp = this.species.get(id);
    if (!sp) return;
    if (on) {
      sp.windMat.emissive = new THREE.Color(0x554400);
      sp.impMat.color = new THREE.Color(0xffe08a);
    } else {
      sp.windMat.emissive = new THREE.Color(0x000000);
      sp.impMat.color = new THREE.Color(0xffffff);
    }
  }

  /** Apply a new preset (density + near distance scale). */
  setPreset(presetDef, name) {
    this.nearDist = name === 'low' ? 14 : name === 'medium' ? 24 : 32;
    // Density changes require a rebuild of instance sets; we thin at rebuild time
    // via densityFactor so preset switches are cheap.
    this.densityFactor = presetDef.vegetationDensity;
    this.lastBuildPos.set(1e9, 0, 0);
  }

  /**
   * Per-frame: advance wind; throttled rebuild of the visible instance buffers.
   */
  update(camera, dt, elapsed) {
    this.windUniforms.uTime.value = elapsed;
    const moved = camera.position.distanceTo(this.lastBuildPos) > 1.5;
    const stale = elapsed - this.lastBuildTime > 0.15;
    if (!moved && !stale) return;
    this.lastBuildPos.copy(camera.position);
    this.lastBuildTime = elapsed;

    const projScreen = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(projScreen);

    const focus = this._focus;
    for (const sp of this.species.values()) {
      const { nearMesh, impMesh, matrices, ranges } = sp;
      let nearCount = 0, impCount = 0;

      for (let c = 0; c < CHUNKS * CHUNKS; c++) {
        const ci = c % CHUNKS, cj = Math.floor(c / CHUNKS);
        const x0 = ci * CHUNK, z0 = cj * CHUNK;
        this._aabb.min.set(x0, -1, z0);
        this._aabb.max.set(x0 + CHUNK, 6, z0 + CHUNK);
        if (!this._frustum.intersectsBox(this._aabb)) continue;
        const range = ranges.get(c);
        if (!range) continue;
        const [start, count] = range;
        // Chunk centre distance decides near vs imposter.
        const dx = camera.position.x - (x0 + CHUNK / 2);
        const dz = camera.position.z - (z0 + CHUNK / 2);
        const dist2 = dx * dx + dz * dz;
        const isNear = dist2 < this.nearDist * this.nearDist;
        for (let k = 0; k < count; k++) {
          const instIdx = start + k;
          // Preset density thinning (deterministic per instance).
          if (frac(instIdx * 7 + 3) >= this.densityFactor) continue;
          const m = matrices[instIdx];
          const px = m.elements[12], pz = m.elements[14];
          if (isNear) {
            if (nearCount >= nearMesh.instanceMatrix.count) break;
            if (focus && sp.id && focus.species.has(sp.id)) {
              const d = Math.hypot(px - focus.x, pz - focus.z);
              if (d < focus.r) {
                this._mat4.copy(m);
                const s = focus.scale + (1 - focus.scale) * (d / focus.r);
                this._mat4.elements[0] = m.elements[0] * s;
                this._mat4.elements[5] = m.elements[5] * s;
                this._mat4.elements[10] = m.elements[10] * s;
                nearMesh.setMatrixAt(nearCount++, this._mat4);
                continue;
              }
            }
            nearMesh.setMatrixAt(nearCount++, m);
          } else {
            if (impCount >= impMesh.instanceMatrix.count) break;
            // Billboard faces the camera from the plant's own position (top-down
            // safe: from directly above, yaw is arbitrary and the quad is hidden
            // behind the near LOD anyway).
            _q.setFromAxisAngle(UP, Math.atan2(camera.position.x - px, camera.position.z - pz));
            this._mat4.compose(
              _p.set(px, m.elements[13], pz),
              _q,
              _s.set(sp.height, sp.height, 1),
            );
            impMesh.setMatrixAt(impCount++, this._mat4);
          }
        }
      }
      nearMesh.count = nearCount;
      impMesh.count = impCount;
      nearMesh.instanceMatrix.needsUpdate = true;
      impMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const sp of this.species.values()) {
      this.scene.remove(sp.nearMesh, sp.impMesh);
      sp.geometry.dispose();
      sp.nearMesh.dispose();
      sp.impMesh.dispose();
      sp.windMat.dispose();
      sp.impMat.map?.dispose();
      sp.impMat.dispose();
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Render one species geometry into a small RGBA texture (billboard imposter).
 * The ortho camera fits the model's bounding box into a square of side `side`
 * metres; the returned `side` lets the imposter plane reproduce that framing
 * 1:1 (undistorted, plant grounded at the plane's base).
 * @returns {{ texture: THREE.Texture, side: number }}
 */
function bakeImposter(renderer, geometry, size = 128) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const w = Math.max(0.05, bb.max.x - bb.min.x);
  const h = Math.max(0.05, bb.max.y - bb.min.y);
  const d = Math.max(0.05, bb.max.z - bb.min.z);
  const side = Math.max(w, h, d) * 1.25; // small margin for sway/jitter
  const cx = (bb.min.x + bb.max.x) / 2;
  const cy = (bb.min.y + bb.max.y) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const rt = new THREE.WebGLRenderTarget(size, size, { format: THREE.RGBAFormat });
  const half = side / 2;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, side * 4);
  cam.position.set(cx + side, cy + side * 0.8, cz + side);
  cam.lookAt(cx, cy, cz);
  const scn = new THREE.Scene();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  scn.add(new THREE.Mesh(geometry, mat));
  scn.add(new THREE.AmbientLight(0xffffff, 2.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.0);
  dl.position.set(1, 2, 0.7);
  scn.add(dl);
  const prevRT = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scn, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  mat.dispose();
  return { texture: rt.texture, side };
}
