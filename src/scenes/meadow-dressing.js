/**
 * v2.0.0 static environment around the sampling field: the surrounding apron
 * terrain, distant hills, a dry-stone wall with a five-bar gate, the flowing
 * stream water, and the Poly Haven CC0 background dressing.
 *
 * HONESTY RULE (design/art-bible.md §5): every real-plant model is placed at
 * least DRESSING_MIN_OFFSET metres OUTSIDE the 100 m x 100 m sampling field, so
 * no quadrat (and no counting view) can ever contain one, and none of them is
 * known to the population model, the data sheet or the estimators.
 * @module scenes/meadow-dressing
 */
import * as THREE from 'three';
import { FIELD_SIZE, terrainHeight, moisture, streamX } from '../systems/moisture-field.js';
import { mergeStaticGroup } from '../v2/cinematic-grade.js';

/** Minimum distance (m) from the field boundary for any dressing model. */
export const DRESSING_MIN_OFFSET = 4.5;

/** The south boundary wall line (z) and its gate gap (x range, beside the field station). */
export const WALL_Z = -11;
export const GATE_X = [47, 53];

/**
 * Background dressing placements (Poly Haven CC0, manifest ids). All outside the field.
 * [id, x, z, targetHeight, rotationY]
 */
export const DRESSING_PLACEMENTS = [
  // hedgerow beyond the north boundary (gap where the stream leaves the field)
  ['wild_rooibos_bush', -4, 107, 2.1, 0.2], ['wild_rooibos_bush', 18, 108, 2.4, 1.3],
  ['wild_rooibos_bush', 31, 107, 1.9, 2.4], ['wild_rooibos_bush', 45, 108.5, 2.3, 0.7],
  ['wild_rooibos_bush', 59, 107, 2.0, 1.9], ['wild_rooibos_bush', 73, 108, 2.4, 2.9],
  ['wild_rooibos_bush', 87, 107.5, 2.1, 0.4], ['wild_rooibos_bush', 101, 108, 2.2, 1.6],
  // fallen trunk and boulders at the edges
  ['dead_tree_trunk', 109, 62, 1.1, 1.2],
  ['rock_07', -8, -7, 1.0, 0.3], ['rock_07', 108, -6, 1.3, 1.7], ['rock_07', 109, 30, 0.9, 2.5],
  ['rock_07', -9, 96, 1.2, 0.9], ['rock_07', 110, 88, 0.8, 2.1],
  // ferns on the stream banks where the stream runs beyond the field
  ['fern_02', 5.5, -6, 0.7, 0.4], ['fern_02', 11, -8, 0.8, 1.9], ['fern_02', 4.5, -9.5, 0.6, 2.6],
  ['fern_02', 5, 106, 0.7, 1.1], ['fern_02', 12, 110, 0.8, 0.2], ['fern_02', 6, 112, 0.7, 2.2],
  // margin flower clusters (south margin in front of the wall, east edge)
  ['flower_gazania', 24, -6, 0.28, 0.3], ['flower_gazania', 25.2, -7, 0.26, 1.7],
  ['flower_gazania', 63, -6.5, 0.3, 2.2], ['flower_gazania', 64, -5.6, 0.25, 0.9],
  ['flower_gazania', 106, 18, 0.28, 1.2], ['flower_gazania', 106.8, 19.4, 0.26, 2.8],
  ['celandine_01', 37, -6, 0.22, 0.5], ['celandine_01', 38, -7.2, 0.2, 2.0],
  ['celandine_01', 80, -6.4, 0.22, 1.4], ['celandine_01', 81.2, -5.5, 0.2, 0.2],
  ['celandine_01', -6, 52, 0.22, 1.0], ['celandine_01', -6.8, 53.3, 0.2, 2.4],
];

/** True when (x, z) lies at least `margin` metres outside the sampling field. */
export function outsideField(x, z, margin = DRESSING_MIN_OFFSET) {
  const S = FIELD_SIZE;
  return x < -margin || x > S + margin || z < -margin || z > S + margin;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Procedural ripple normal map for the stream (canvas, no asset). */
function makeRippleNormal(size = 128) {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const dx = 0.5 * Math.cos(u * 3 + v * 2) + 0.3 * Math.cos(u * 5 - v * 4);
      const dy = 0.5 * Math.cos(v * 4 + u) + 0.3 * Math.sin(v * 7 + u * 2);
      const i = (y * size + x) * 4;
      img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 235; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Cloud-shadow patch for ground materials: darkens the diffuse colour with slow
 * drifting blobs (uniform uCloudT advanced by the ambient-life updater).
 */
export function addCloudShadows(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudT = uniforms.uCloudT;
    shader.uniforms.uCloudK = uniforms.uCloudK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloudW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudW;\nuniform float uCloudT;\nuniform float uCloudK;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec2 cp = vCloudW + vec2(uCloudT * 2.2, uCloudT * 0.9);
  float cn = 0.5 + 0.22 * (sin(cp.x * 0.041) + sin(cp.y * 0.033 + 1.7)) + 0.18 * sin((cp.x + cp.y) * 0.019 + 0.6);
  diffuseColor.rgb *= 1.0 - uCloudK * smoothstep(0.62, 0.9, cn);`);
  };
  material.customProgramCacheKey = () => 'meadow-cloud-ground';
}

/**
 * Build the static environment. Returns handles the scene animates.
 * @param {THREE.Scene} scene
 * @param {{speckle: THREE.Texture, cloudUniforms: object}} opts
 */
export function buildEnvironment(scene, { speckle, cloudUniforms }) {
  const env = { group: new THREE.Group() };
  env.group.name = 'v2-meadow-environment';
  scene.add(env.group);

  // --- apron terrain around the field (lowered under the field so the field mesh wins)
  const A = 520, segs = 104;
  const geo = new THREE.PlaneGeometry(A, A, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const lush = new THREE.Color(0x4f7a37), dry = new THREE.Color(0x9c8b55), far = new THREE.Color(0x6f8a5e);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + FIELD_SIZE / 2, z = pos.getZ(i) + FIELD_SIZE / 2;
    const inside = x > 1 && x < FIELD_SIZE - 1 && z > 1 && z < FIELD_SIZE - 1;
    pos.setY(i, Math.min(terrainHeight(x, z), 7) - (inside ? 0.45 : 0.02));
    const outside = !(x >= 0 && x <= FIELD_SIZE && z >= 0 && z <= FIELD_SIZE);
    c.lerpColors(dry, lush, Math.min(1, Math.max(0, moisture(x, z)) * 1.1 + (outside ? 0.55 : 0.25)));
    const d = Math.hypot(x - 50, z - 50);
    c.lerp(far, Math.min(1, Math.max(0, (d - 90) / 160)));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const apronSpeckle = speckle.clone();
  apronSpeckle.repeat.set(220, 220);
  apronSpeckle.wrapS = apronSpeckle.wrapT = THREE.RepeatWrapping;
  apronSpeckle.anisotropy = 8;
  apronSpeckle.needsUpdate = true;
  const apronMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: apronSpeckle, roughness: 0.96 });
  addCloudShadows(apronMat, cloudUniforms);
  const apron = new THREE.Mesh(geo, apronMat);
  apron.position.set(FIELD_SIZE / 2, 0, FIELD_SIZE / 2);
  apron.receiveShadow = true;
  apron.name = 'v2-apron';
  env.group.add(apron);

  // --- distant hills: a displaced ring on the horizon (fades into the dawn haze)
  const ring = new THREE.RingGeometry(210, 340, 120, 6);
  ring.rotateX(-Math.PI / 2);
  const rp = ring.attributes.position;
  const hc = new Float32Array(rp.count * 3);
  const hillLow = new THREE.Color(0x4c6a3c), hillHigh = new THREE.Color(0x7f9a86);
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i);
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const prof = Math.sin(Math.PI * Math.min(1, Math.max(0, (r - 210) / 130)));
    const h = (26 + 16 * Math.sin(a * 3 + 0.7) + 9 * Math.sin(a * 7 + 2.1) + 5 * Math.sin(a * 13)) * prof;
    rp.setY(i, h + Math.min(terrainHeight(x + 50, z + 50), 7) - 0.5);
    c.lerpColors(hillLow, hillHigh, Math.min(1, h / 50));
    hc[i * 3] = c.r; hc[i * 3 + 1] = c.g; hc[i * 3 + 2] = c.b;
  }
  ring.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  ring.computeVertexNormals();
  const hills = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false }));
  hills.position.set(FIELD_SIZE / 2, 0, FIELD_SIZE / 2);
  hills.name = 'v2-hills';
  env.group.add(hills);

  // --- static group: dry-stone wall + gate (procedural) + Poly Haven dressing (merged later)
  const statics = new THREE.Group();
  statics.name = 'v2-meadow-statics';
  env.group.add(statics);
  env.statics = statics;
  buildWallAndGate(statics);

  // --- flowing stream (scrolling-normal water ribbon following streamX, on the ground)
  env.water = buildStream();
  env.group.add(env.water);
  return env;
}

function buildWallAndGate(parent) {
  const rnd = seeded(4242);
  const stoneGeo = new THREE.IcosahedronGeometry(0.26, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8576, roughness: 0.95, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: 0.95, flatShading: true });
  const placements = [];
  const streamGap = streamX(WALL_Z);
  for (let x = -14; x <= 114; x += 0.42) {
    if (x > GATE_X[0] && x < GATE_X[1]) continue;
    if (Math.abs(x - streamGap) < 2.4) continue;
    const g = terrainHeight(x, WALL_Z);
    for (let row = 0; row < 3; row++) {
      placements.push({ x: x + (row % 2) * 0.21 + (rnd() - 0.5) * 0.08, y: g + 0.18 + row * 0.3, z: WALL_Z + (rnd() - 0.5) * 0.12, row });
    }
  }
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, placements.length);
  const caps = new THREE.InstancedMesh(stoneGeo, capMat, Math.ceil(placements.length / 3));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let ci = 0;
  placements.forEach((st, i) => {
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    s.set(1 + rnd() * 0.5, 0.75 + rnd() * 0.3, 1.1 + rnd() * 0.4);
    m.compose(p.set(st.x, st.y, st.z), q, s);
    stones.setMatrixAt(i, m);
    if (st.row === 2 && ci < caps.count) {
      s.set(0.9, 1.15, 1.0);
      m.compose(p.set(st.x, st.y + 0.3, st.z), q.setFromEuler(e.set(0, rnd() * 3, 1.4)), s);
      caps.setMatrixAt(ci++, m);
    }
  });
  caps.count = ci;
  stones.castShadow = caps.castShadow = true;
  stones.receiveShadow = caps.receiveShadow = true;
  stones.name = 'v2-dry-stone-wall';
  parent.add(stones, caps);

  // five-bar gate (left open towards the field) with two posts
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5338, roughness: 0.88 });
  const gy = terrainHeight(50, WALL_Z);
  for (const px of GATE_X) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), wood);
    post.position.set(px, gy + 0.75, WALL_Z);
    post.castShadow = true;
    parent.add(post);
  }
  const gate = new THREE.Group();
  for (let b = 0; b < 5; b++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.09, 0.06), wood);
    bar.position.set(1.5, 0.3 + b * 0.22, 0);
    gate.add(bar);
  }
  for (const bx of [0.08, 2.9]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.08), wood);
    st.position.set(bx, 0.75, 0);
    gate.add(st);
  }
  const brace = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 0.05), wood);
  brace.position.set(1.5, 0.75, 0.02);
  brace.rotation.z = 0.3;
  gate.add(brace);
  gate.position.set(GATE_X[0] + 0.1, gy, WALL_Z);
  gate.rotation.y = -1.1; // swung open, into the field side
  gate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  parent.add(gate);
}

/** Stream ribbon half-width (m) and the clear margin it keeps from the field edge. */
export const STREAM_HALF_WIDTH = 0.95;
export const STREAM_FIELD_CLEARANCE = 1.5;

/**
 * Open-water stream course as ribbon segments (pure; no DOM). v2 revision V1/M1:
 * the population model grows counted plants right on the stream line (it is a
 * wet flush inside the field, not open water: 32 plant bases within 5 cm of it),
 * so open water is drawn ONLY where the stream runs outside the sampling field —
 * south of the field (z < 0) and north of it (z > 100), kept STREAM_FIELD_CLEARANCE
 * metres clear of the boundary. Inside the field the course is the darker damp
 * ground colour of the terrain (see meadow.js _buildTerrain), which never covers a
 * plant. Each run is a list of [left, right] cross-section points ({x, z}).
 * @returns {Array<Array<[{x:number,z:number},{x:number,z:number}]>>}
 */
export function streamRibbonRuns(w = STREAM_HALF_WIDTH) {
  const ranges = [[-60, -STREAM_FIELD_CLEARANCE - w], [FIELD_SIZE + STREAM_FIELD_CLEARANCE + w, FIELD_SIZE + 60]];
  return ranges.map(([z0, z1]) => {
    const zs = [];
    for (let z = z0; z < z1; z += 1.5) zs.push(z);
    zs.push(z1);
    return zs.map((z, i) => {
      const zn = zs[Math.min(i + 1, zs.length - 1)], zp = zs[Math.max(i - 1, 0)];
      const dx = streamX(zn) - streamX(zp), dz = zn - zp;
      const len = Math.hypot(dx, dz) || 1;
      const sx = (-dz / len) * w, sz = (dx / len) * w;
      const x = streamX(z);
      return [{ x: x - sx, z: z - sz }, { x: x + sx, z: z + sz }];
    });
  });
}

function buildStream() {
  const positions = [], uvs = [], idx = [];
  let base = 0;
  for (const run of streamRibbonRuns()) {
    let dist = 0;
    run.forEach(([l, r], i) => {
      const cx = (l.x + r.x) / 2, cz = (l.z + r.z) / 2;
      if (i > 0) {
        const [pl, pr] = run[i - 1];
        dist += Math.hypot(cx - (pl.x + pr.x) / 2, cz - (pl.z + pr.z) / 2);
      }
      // flat across the bed, just above the higher bank so it never sinks under the terrain
      const y = Math.max(terrainHeight(l.x, l.z), terrainHeight(r.x, r.z), terrainHeight(cx, cz)) + 0.035;
      positions.push(l.x, y, l.z, r.x, y, r.z);
      uvs.push(0, dist / 2.2, 1, dist / 2.2);
      if (i < run.length - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    base += run.length * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const normalMap = makeRippleNormal();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5b7d8a, roughness: 0.08, metalness: 0.15, normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55), transparent: true, opacity: 0.8,
    envMapIntensity: 1.4, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'v2-stream-water';
  mesh.renderOrder = 2;
  mesh.receiveShadow = true;
  mesh.userData.normalMap = normalMap;
  return mesh;
}

/**
 * Load the Poly Haven dressing into `statics`, then merge the whole static group
 * per material (one draw call per material). Resolves with the merged-mesh count.
 * @param {import('../v2/model-placer.js').ModelLibrary} library
 */
export async function placeDressing(library, statics) {
  const placed = await Promise.all(DRESSING_PLACEMENTS.map(([id, x, z, h, ry]) => library.place(statics, id, {
    position: [x, terrainHeight(x, z) - 0.03, z], rotationY: ry, targetHeight: h,
    castShadow: false, receiveShadow: true, contactShadow: h > 0.5,
  })));
  // v2 revision V7: the hedgerow read near-black. Lift its foliage materials
  // (shared by every bush, so each is adjusted once) before the per-material merge.
  const lifted = new Set();
  placed.forEach((w, k) => {
    if (!w || DRESSING_PLACEMENTS[k][0] !== 'wild_rooibos_bush') return;
    w.traverse((o) => {
      const m = o.isMesh && o.material;
      if (!m || Array.isArray(m) || lifted.has(m) || !m.color) return;
      lifted.add(m);
      m.color.multiplyScalar(1.6).offsetHSL(0, 0, 0.04);
      if (m.emissive) m.emissive.setHex(0x1a2412);
      m.envMapIntensity = Math.max(m.envMapIntensity ?? 1, 1.3);
    });
  });
  return mergeStaticGroup(statics);
}
