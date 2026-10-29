/**
 * v2 revision V3: a cheap low turf layer between the counted species, as ONE
 * InstancedMesh (one draw call; no shadow casting). Each instance is a
 * three-blade tuft (3 triangles), colour-varied, placed by a seeded RNG.
 *
 * Learning-cue rule: inside the sampling field the turf stays BELOW the
 * shortest counted field mark (Daisy-leaf rosette, ROSETTE_Y = 1.6 cm above
 * ground), so it can never hide a plant a learner counts; outside the field
 * (the apron up to APRON_REACH m out) it grows taller. The layer is also hidden
 * in the top-down counting view (meadow-life hideInCounting).
 * @module scenes/meadow-turf
 */
import * as THREE from 'three';
import { Rng } from '../systems/rng.js';
import { FIELD_SIZE, terrainHeight, moisture } from '../systems/moisture-field.js';
import { ROSETTE_Y } from '../systems/species-models.js';

export const TURF_SEED = 77031;
/** Tallest in-field tuft (m): kept clear below the lowest counted field mark. */
export const TURF_MAX_IN_FIELD = Math.min(0.012, ROSETTE_Y - 0.004);
export const APRON_REACH = 22;
/** Tufts at vegetationDensity 1 (Medium 0.7 / Low 0.4 scale this down). */
export const TURF_FIELD_COUNT = 36000;
export const TURF_APRON_COUNT = 18000;

/**
 * Pure placement list (no THREE objects): { x, z, y, h, rot, tone, inField }.
 * @param {number} density 0..1 preset vegetation density
 */
export function turfPlacements(density = 1, seed = TURF_SEED) {
  const rng = new Rng(seed);
  const out = [];
  const nField = Math.round(TURF_FIELD_COUNT * density);
  for (let i = 0; i < nField; i++) {
    const x = rng.uniform(0.2, FIELD_SIZE - 0.2), z = rng.uniform(0.2, FIELD_SIZE - 0.2);
    const h = TURF_MAX_IN_FIELD * rng.uniform(0.55, 1);
    out.push({ x, z, y: terrainHeight(x, z), h, rot: rng.uniform(0, Math.PI * 2), tone: rng.next(), wet: moisture(x, z), inField: true });
  }
  const nApron = Math.round(TURF_APRON_COUNT * density);
  const S = FIELD_SIZE;
  for (let i = 0; i < nApron; i++) {
    // uniform in the band [-R, S+R]^2 minus the field (rejection)
    let x, z;
    do {
      x = rng.uniform(-APRON_REACH, S + APRON_REACH);
      z = rng.uniform(-APRON_REACH, S + APRON_REACH);
    } while (x > -1 && x < S + 1 && z > -1 && z < S + 1);
    const h = rng.uniform(0.07, 0.16);
    out.push({ x, z, y: Math.min(terrainHeight(x, z), 7) - 0.02, h, rot: rng.uniform(0, Math.PI * 2), tone: rng.next(), wet: moisture(x, z), inField: false });
  }
  return out;
}

/** Unit tuft: three thin triangles (blades) fanning from the origin, height 1. */
function tuftGeometry() {
  const pos = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.18, lean = 0.32;
    // base left, base right, tip (leaning outwards)
    pos.push(-sa * w, 0, ca * w, sa * w, 0, -ca * w, ca * lean, 1, sa * lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // up-facing normals light the blades like the ground they sit on
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/**
 * Build the turf InstancedMesh.
 * @param {number} density preset vegetation density
 */
export function buildTurf(density = 1) {
  const list = turfPlacements(density);
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, list.length);
  mesh.name = 'v2-meadow-turf';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const lush = new THREE.Color(0x4d7a33), dry = new THREE.Color(0xa59a5a), c = new THREE.Color();
  list.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rot);
    // footprint ~ height for the apron, wider-than-tall mat inside the field
    const span = t.inField ? 0.05 : t.h * 0.7;
    s.set(span, t.h, span);
    m.compose(p.set(t.x, t.y, t.z), q, s);
    mesh.setMatrixAt(i, m);
    c.lerpColors(dry, lush, Math.min(1, t.wet * 1.1 + (t.inField ? 0.1 : 0.45)));
    c.offsetHSL((t.tone - 0.5) * 0.04, 0, (t.tone - 0.5) * 0.12);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
