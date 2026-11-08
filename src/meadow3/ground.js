/**
 * ground.js — Ashcombe Meadow's ground: the 100 m sampling field and the
 * apron around it (one textured material that blends the dry and wet sward
 * by soil moisture, with drifting cloud shadows), the faceting-free hill
 * ring, the stream with mud banks, the cut bank where the topsoil shows, and
 * the two stratum patches the learner can click (wet and dry ground).
 * 1 unit = 1 m. Heights come from systems/moisture-field.js, shared with the
 * population model, so every counted plant stands on this ground.
 * @module meadow3/ground
 */
import * as THREE from 'three';
import { FIELD_SIZE, terrainHeight, moisture, streamX } from '../systems/moisture-field.js';
import { streamRibbonRuns, STREAM_HALF_WIDTH } from './stream-course.js';

/**
 * Stream channel depth outside the field (m): the open water south and north
 * of the field runs in a channel 0.32 m deep in the middle, with sloping banks.
 * Inside the field the stream line is damp ground (no channel, no water).
 */
export const CHANNEL_HALF = 1.6;
export const CHANNEL_DEPTH = 0.5;
/** Water surface below the bank tops: where the channel is as deep as at the ribbon edge. */
export const WATER_DROP = CHANNEL_DEPTH * (1 - (STREAM_HALF_WIDTH / CHANNEL_HALF) ** 2) - 0.02;
export function channelDepth(x, z) {
  if (z > -1.5 && z < FIELD_SIZE + 1.5) return 0;
  const d = Math.abs(x - streamX(z)) / CHANNEL_HALF;
  return d >= 1 ? 0 : CHANNEL_DEPTH * (1 - d * d);
}

/** Ground height everywhere (the apron sits 2 cm under the field edge, the field is exact). */
export function groundY(x, z) {
  const inside = x >= 0 && x <= FIELD_SIZE && z >= 0 && z <= FIELD_SIZE;
  return inside ? terrainHeight(x, z) : Math.min(terrainHeight(x, z), 7) - 0.02 - channelDepth(x, z);
}

/** Shared uniforms for cloud shadows on every ground-like material. */
export function makeCloudUniforms() {
  // uWindT / uGustSheen: the gust bands of the GPU wind (systems/wind.js) seen on the sward
  // from above, where single blades are under a pixel (set by MeadowWorld.addMotion).
  return { uCloudT: { value: 0 }, uCloudK: { value: 0.2 }, uCloudWind: { value: new THREE.Vector2(5.5, 2.0) }, uWindT: { value: 0 }, uGustSheen: { value: 0 } };
}

const CLOUD_GLSL = /* glsl */`
  vec2 cp = vGroundW / 900.0 - uCloudWind * uCloudT / 900.0;
  float cn = 0.5 + 0.25 * (sin(cp.x * 6.2832 * 1.3) + sin(cp.y * 6.2832 * 1.1 + 1.7)) + 0.2 * sin((cp.x + cp.y) * 6.2832 * 2.3 + 0.6);
  float cloudShade = 1.0 - uCloudK * smoothstep(0.62, 0.92, cn);`;

/**
 * The sward material: MeshStandardMaterial with the dry sward map, the wet
 * sward blended in by the aMoist attribute, macro tint from vertex colours,
 * normal and roughness maps, and cloud shadows. Maps arrive later (KTX2).
 */
export function swardMaterial(cloud) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.userData.wetMap = { value: null };
  mat.userData.surfaceDetail = true; // the maps load after the mesh is created
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWetMap = mat.userData.wetMap;
    Object.assign(sh.uniforms, cloud);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMoist;\nvarying float vMoist;\nvarying vec2 vGroundW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoist = aMoist;\nvGroundW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMoist;\nvarying vec2 vGroundW;\nuniform sampler2D uWetMap;\nuniform float uCloudT;\nuniform float uCloudK;\nuniform vec2 uCloudWind;\nuniform float uWindT;\nuniform float uGustSheen;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 dryC = texture2D(map, vMapUv);
  vec4 wetC = texture2D(uWetMap, vMapUv * 0.83);
  diffuseColor *= mix(dryC, wetC, smoothstep(0.3, 0.8, vMoist));
#endif
${CLOUD_GLSL}
  diffuseColor.rgb *= cloudShade;
  // A gust flattens the grass and turns the paler blade sides and seed heads to the
  // light: a lighter band that rolls across the field (same band as the plant sway).
  float gustBand = smoothstep(0.6, 1.0, sin(vGroundW.x * 0.09 + vGroundW.y * 0.035 - uWindT * 0.55));
  diffuseColor.rgb *= 1.0 + uGustSheen * gustBand;`);
  };
  mat.customProgramCacheKey = () => 'meadow-sward-v3-gust';
  return mat;
}

/** Cloud shadows only (hills, banks): patches a standard material. */
export function addCloudShade(mat, cloud, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cloud);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundW;\nuniform float uCloudT;\nuniform float uCloudK;\nuniform vec2 uCloudWind;')
      .replace('#include <map_fragment>', `#include <map_fragment>\n${CLOUD_GLSL}\n  diffuseColor.rgb *= cloudShade;`);
  };
  mat.customProgramCacheKey = () => `meadow-cloudshade-${key}`;
}

function hash(x, z) { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); }

/** A height-field grid mesh (x0..x1, z0..z1) with colour and moisture attributes. */
function gridMesh(x0, z0, size, segs, heightFn, tintFn) {
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + size / 2, 0, z0 + size / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const moist = new Float32Array(pos.count);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightFn(x, z));
    const m = moisture(x, z);
    moist[i] = m;
    tintFn(c, x, z, m);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aMoist', new THREE.BufferAttribute(moist, 1));
  // Repeat the sward texture every 2.4 m.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2.4, pos.getZ(i) / 2.4);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, null);
}

/**
 * Build the field, the apron, the stratum patches and the soil bank.
 * @returns {{ field: THREE.Mesh, apron: THREE.Mesh, material: THREE.Material, wetPatch: THREE.Mesh, dryPatch: THREE.Mesh, setMaps: Function }}
 */
export function buildGround(parent, cloud) {
  const mat = swardMaterial(cloud);
  const warm = new THREE.Color(0xe9dcb8), lush = new THREE.Color(0xb9cf9a), damp = new THREE.Color(0x8fa77a);
  const field = gridMesh(0, 0, FIELD_SIZE, 128, terrainHeight, (c, x, z, m) => {
    c.lerpColors(warm, lush, Math.min(1, m * 1.1));
    // The stream line inside the field is damp ground (no open water over plants).
    const d = Math.abs(x - streamX(z));
    if (d < STREAM_HALF_WIDTH * 1.6) c.lerp(damp, 0.55 * (1 - d / (STREAM_HALF_WIDTH * 1.6)));
    c.multiplyScalar(0.92 + 0.16 * hash(x, z));
  });
  field.material = mat;
  field.receiveShadow = true;
  field.name = 'meadow-field-ground';
  parent.add(field);

  const A = 560;
  const apron = gridMesh(FIELD_SIZE / 2 - A / 2, FIELD_SIZE / 2 - A / 2, A, 140, (x, z) => {
    const inside = x > 1 && x < FIELD_SIZE - 1 && z > 1 && z < FIELD_SIZE - 1;
    return Math.min(terrainHeight(x, z), 7) - (inside ? 0.45 : 0.02) - channelDepth(x, z);
  }, (c, x, z, m) => {
    c.lerpColors(warm, lush, Math.min(1, m * 1.05 + 0.25));
    const d = Math.hypot(x - 50, z - 50);
    c.lerp(new THREE.Color(0xa9bd93), Math.min(1, Math.max(0, (d - 100) / 160)));
    c.multiplyScalar(0.9 + 0.2 * hash(x * 0.3, z * 0.3));
  });
  apron.material = mat;
  apron.receiveShadow = true;
  apron.name = 'meadow-apron-ground';
  parent.add(apron);

  // Stratum patches (catalog wet-ground, dry-ground): invisible sheets 3 cm above
  // the sward, so a click on that ground opens the stratum's card.
  const patch = (x0, z0, w, d, name) => {
    const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w / 1.5), Math.ceil(d / 1.5));
    geo.rotateX(-Math.PI / 2);
    geo.translate(x0 + w / 2, 0, z0 + d / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) + 0.03);
    geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    m.name = name;
    parent.add(m);
    return m;
  };
  const wetPatch = patch(4, 14, 18, 30, 'wet-ground-patch');
  const dryPatch = patch(74, 24, 18, 30, 'dry-ground-patch');

  return {
    field, apron, material: mat, wetPatch, dryPatch,
    setMaps({ dry, wet, normal, rough }) {
      mat.map = dry; mat.userData.wetMap.value = wet;
      // A sward is matte: at a 3-20 deg dawn Sun the scanned gravel roughness map and a
      // strong normal map gave a wet, glittering sheen (v3 GPU screens). Rough map unused.
      mat.normalMap = normal; mat.normalScale.set(0.35, 0.35);
      mat.roughness = 1; void rough;
      mat.needsUpdate = true;
    },
  };
}

/**
 * Distant hills: a displaced ring 210-340 m from the field centre with smooth
 * normals (v2 faceting fixed: 240 x 28 segments, normals from the analytic
 * height), the dry sward texture at a large repeat, and the dawn haze (fog).
 * Crest about 56 m above the lowest base.
 */
export function buildHills(parent, cloud) {
  const segA = 240, segR = 28, r0 = 210, r1 = 340;
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const prof = Math.sin(Math.PI * Math.min(1, Math.max(0, (r - r0) / (r1 - r0)))) ** 0.8;
    const h = (24 + 14 * Math.sin(a * 3 + 0.7) + 8 * Math.sin(a * 7 + 2.1) + 4 * Math.sin(a * 13) + 2 * Math.sin(a * 29 + r * 0.05)) * prof;
    return h + Math.min(terrainHeight(x + 50, z + 50), 7) - 0.6;
  };
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color(), low = new THREE.Color(0x8ea877), high = new THREE.Color(0xb7c4a0);
  for (let j = 0; j <= segR; j++) {
    const r = r0 + (r1 - r0) * (j / segR);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      pos.push(x, y, z);
      uv.push(x / 9, z / 9);
      c.lerpColors(low, high, Math.min(1, Math.max(0, y / 50)));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
    const a = j * (segA + 1) + i, b = a + segA + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // Smooth normals from the analytic height (central differences), so the
  // ring never shows facets at the seam or between segments.
  const n = new Float32Array(pos.length);
  const e = 0.8;
  for (let k = 0; k < pos.length; k += 3) {
    const x = pos[k], z = pos[k + 2];
    const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    const v = new THREE.Vector3(-dx, 2 * e, -dz).normalize();
    n[k] = v.x; n[k + 1] = v.y; n[k + 2] = v.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  addCloudShade(mat, cloud, 'hills');
  const hills = new THREE.Mesh(geo, mat);
  hills.position.set(FIELD_SIZE / 2, 0, FIELD_SIZE / 2);
  hills.name = 'meadow-hills';
  hills.receiveShadow = true;
  parent.add(hills);
  hills.userData.heightAt = (wx, wz) => heightAt(wx - FIELD_SIZE / 2, wz - FIELD_SIZE / 2);
  return hills;
}

/** Procedural ripple normal map for the stream (canvas, own work). */
function rippleNormal(size = 128) {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
    const dx = 0.5 * Math.cos(u * 3 + v * 2) + 0.3 * Math.cos(u * 5 - v * 4);
    const dy = 0.5 * Math.cos(v * 4 + u) + 0.3 * Math.sin(v * 7 + u * 2);
    const i = (y * size + x) * 4;
    img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 235; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * The stream where it runs outside the field (open water south and north of
 * it), with muddy banks either side. Water flows at about 0.25 m/s (the
 * ripple normal map scrolls with the current; catalog card `stream`).
 * @returns {THREE.Group} with userData.normalMap and userData.bankMaterial
 */
const BANK_N = 5;
export function buildStream(parent, cloud) {
  const group = new THREE.Group();
  group.name = 'stream';
  const positions = [], uvs = [], idx = [];
  const bankPos = [], bankUv = [], bankIdx = [];
  let base = 0, bbase = 0;
  for (const run of streamRibbonRuns()) {
    let dist = 0;
    run.forEach(([l, r], i) => {
      const cx = (l.x + r.x) / 2, cz = (l.z + r.z) / 2;
      if (i > 0) { const [pl, pr] = run[i - 1]; dist += Math.hypot(cx - (pl.x + pr.x) / 2, cz - (pl.z + pr.z) / 2); }
      // Water surface inside the carved channel, meeting the banks at the ribbon edge (about 0.2 m deep mid-stream).
      const y = Math.min(terrainHeight(cx, cz), 7) - 0.02 - WATER_DROP;
      positions.push(l.x, y, l.z, r.x, y, r.z);
      uvs.push(0, dist / 2.2, 1, dist / 2.2);
      if (i < run.length - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      // Banks: from inside the water edge up and out to the sward, 5 samples
      // across, 1.5 cm above the carved apron.
      const ox = (r.x - l.x) / (2 * STREAM_HALF_WIDTH), oz = (r.z - l.z) / (2 * STREAM_HALF_WIDTH);
      for (const [p, s] of [[l, -1], [r, 1]]) {
        for (let k = 0; k < BANK_N; k++) {
          const off = -0.15 + ((CHANNEL_HALF - STREAM_HALF_WIDTH + 0.35) * k) / (BANK_N - 1);
          const ex = p.x + ox * s * off, ez = p.z + oz * s * off;
          bankPos.push(ex, groundY(ex, ez) + 0.015, ez);
          bankUv.push(k / (BANK_N - 1), dist / 1.5);
        }
      }
      if (i < run.length - 1) {
        const a = bbase + i * 2 * BANK_N, b = a + 2 * BANK_N;
        for (let side = 0; side < 2; side++) for (let k = 0; k < BANK_N - 1; k++) {
          const p0 = a + side * BANK_N + k, p1 = b + side * BANK_N + k;
          bankIdx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
        }
      }
    });
    base += run.length * 2;
    bbase += run.length * 2 * BANK_N;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const normalMap = rippleNormal();
  const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x4f6e72, roughness: 0.06, metalness: 0.1, normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
    transparent: true, opacity: 0.86, envMapIntensity: 1.5,
  }));
  water.name = 'stream-water';
  water.renderOrder = 2;
  water.receiveShadow = true;
  group.add(water);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bankPos, 3));
  bgeo.setAttribute('uv', new THREE.Float32BufferAttribute(bankUv, 2));
  bgeo.setIndex(bankIdx);
  bgeo.computeVertexNormals();
  const bankMat = new THREE.MeshStandardMaterial({ color: 0x6a5a44, roughness: 0.92, side: THREE.DoubleSide });
  bankMat.userData.surfaceDetail = true; // stream-mud maps stream in after the first click
  addCloudShade(bankMat, cloud, 'banks');
  const banks = new THREE.Mesh(bgeo, bankMat);
  banks.name = 'stream-banks';
  banks.receiveShadow = true;
  group.add(banks);
  group.userData.normalMap = normalMap;
  group.userData.bankMaterial = bankMat;
  parent.add(group);
  return group;
}

/**
 * The cut stream bank where the topsoil shows (catalog `soil`): a 3 m long,
 * 0.4 m deep face of dark soil on the east bank south of the field, with a
 * grass lip. Box 3 x 0.4 x 0.4 m.
 */
export function buildSoilBank(parent) {
  const z0 = -9, z1 = -6;
  const zs = 8;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= zs; k++) {
    const z = z0 + (z1 - z0) * (k / zs);
    const xEdge = streamX(z) + STREAM_HALF_WIDTH + 0.02;
    const top = groundY(xEdge + 0.4, z) - 0.005;
    // A profile from the water's edge (bottom) back 0.4 m into the bank (top).
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      const x = xEdge + 0.4 * t * t;
      // Never under the bank's own surface (G2: the profile sat inside the carved
      // channel wall, under the bank mesh, so nobody could see or click it).
      const y = Math.max(top - 0.4 + 0.4 * t, groundY(x, z) + 0.03) + 0.008 * Math.sin(k * 1.7 + j);
      pos.push(x, y, z);
      uv.push(k / zs * 3, t * 0.6);
    }
  }
  for (let k = 0; k < zs; k++) for (let j = 0; j < 4; j++) {
    const a = k * 5 + j, b = a + 5;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3628, roughness: 0.95, side: THREE.DoubleSide });
  mat.userData.surfaceDetail = true; // the soil maps stream in after the first click
  const bank = new THREE.Mesh(geo, mat);
  bank.name = 'soil-bank';
  bank.castShadow = false;
  bank.receiveShadow = true;
  parent.add(bank);
  return bank;
}
