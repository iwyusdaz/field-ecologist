/**
 * Procedural species models with distinct field marks (built from three.js
 * primitives, vertex-coloured, merged per species). Constructed teaching
 * models — fictional species, marks slightly exaggerated for legibility
 * (design/realism-matrix.md). 1 unit = 1 m; plants are real-world sized.
 * @module systems/species-models
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Fill a geometry with a flat colour as a 'color' attribute. */
function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Apply translation/rotation/scale in place. */
function place(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]))
    .scale(new THREE.Vector3(scale[0], scale[1], scale[2]))
    .setPosition(pos[0], pos[1], pos[2]);
  geo.applyMatrix4(m);
  return geo;
}

/**
 * A tapered blade (narrow plane) that arches outward — the workhorse for
 * sedges and grasses. Base at origin, height h, arching `bend` metres sideways.
 */
function blade(h, w, bend, lean = 0) {
  const g = new THREE.PlaneGeometry(w, h, 1, 4);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / h;
    pos.setX(i, pos.getX(i) * (1 - 0.65 * t));          // taper to a point
    pos.setZ(i, pos.getZ(i) + bend * t * t);            // arch outward
  }
  if (lean) g.rotateX(lean);
  return g;
}

/** A flattened oval leaf/rosette leaf. */
function ovalLeaf(len, wid, thick = 0.004) {
  const g = new THREE.SphereGeometry(0.5, 6, 4);
  g.scale(wid, thick, len);
  return g;
}

const builders = {
  // Upright stem + rounded drumstick-like yellow head + lance-shaped alternate leaves.
  'butterweed': () => {
    const parts = [];
    const h = 0.5;
    parts.push(place(colored(new THREE.CylinderGeometry(0.006, 0.011, h, 6), 0x4a6b2a), { pos: [0, h / 2, 0] }));
    // lance-shaped alternate leaves along the stem (flattened, pointed via cone)
    for (let i = 0; i < 4; i++) {
      const y = 0.12 + i * 0.09;
      const side = i % 2 ? 1 : -1;
      const leaf = colored(new THREE.ConeGeometry(0.028, 0.13, 4), 0x557a2e);
      leaf.rotateZ(Math.PI / 2); // lie sideways, tip outward
      parts.push(place(leaf, { pos: [side * 0.05, y, 0], rot: [0, 0, side * -0.35], scale: [1, 1, 0.35] }));
    }
    // rounded button head 2-3 cm across on a bare stalk top
    const head = colored(new THREE.IcosahedronGeometry(0.017, 1), 0xf2c832);
    parts.push(place(head, { pos: [0, h + 0.01, 0], scale: [1, 0.8, 1] }));
    const rim = colored(new THREE.CylinderGeometry(0.016, 0.004, 0.012, 6), 0xd9a918);
    parts.push(place(rim, { pos: [0, h - 0.004, 0] }));
    return parts;
  },

  // Flat basal rosette of round, bluntly toothed leaves + short stalks with small white button flowers.
  'daisyleaf': () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = colored(ovalLeaf(0.075, 0.032), 0x3f7a35);
      parts.push(place(leaf, { pos: [Math.cos(a) * 0.035, 0.004, Math.sin(a) * 0.035], rot: [0, -a, 0] }));
    }
    for (let i = 0; i < 2; i++) {
      const a = i * 2.4 + 0.5;
      parts.push(place(colored(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 5), 0x4c7c3a), {
        pos: [Math.cos(a) * 0.03, 0.05, Math.sin(a) * 0.03], rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25],
      }));
      parts.push(place(colored(new THREE.CylinderGeometry(0.008, 0.009, 0.006, 8), 0xf2f2ea), {
        pos: [Math.cos(a) * 0.043, 0.102, Math.sin(a) * 0.043], rot: [0.4 * Math.sin(a), 0, -0.4 * Math.cos(a)],
      }));
    }
    return parts;
  },

  // Fountain-like tuft of narrow arching blades, bluish-green, tiny brown spike tips.
  'blue-sedge': () => {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const h = 0.3 + 0.12 * ((i * 7919) % 100) / 100;
      const b = blade(h, 0.007, 0.09 + 0.05 * (i % 3), 0.5);
      parts.push(place(colored(b, 0x6a8f7d), { rot: [0, -a, 0] }));
    }
    parts.push(place(colored(new THREE.CylinderGeometry(0.004, 0.005, 0.34, 5), 0x7d6b3f), { pos: [0.02, 0.17, 0.03], rot: [0.12, 0, 0.1] }));
    return parts;
  },

  // Tight upright tussock: a mop of hair-thin stiff blades from one point.
  'bunchgrass': () => {
    const parts = [];
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + (i % 2) * 0.4;
      const h = 0.24 + 0.1 * ((i * 104729) % 100) / 100;
      const b = blade(h, 0.005, 0.05 + 0.04 * (i % 3), 0.35);
      parts.push(place(colored(b, i % 3 ? 0x8a8a4f : 0x9aa058), { rot: [0, -a, 0] }));
    }
    return parts;
  },

  // Slender bare stem + loose ONE-SIDED spike of tiny flowers + exactly two flat oval basal leaves.
  'fen-orchid': () => {
    const parts = [];
    const h = 0.26;
    parts.push(place(colored(new THREE.CylinderGeometry(0.0035, 0.005, h, 5), 0x5d7a4a), { pos: [0, h / 2, 0] }));
    for (const side of [-1, 1]) {
      const leaf = colored(ovalLeaf(0.045, 0.022, 0.003), 0x4f7d3e);
      parts.push(place(leaf, { pos: [side * 0.02, 0.004, 0.008], rot: [0, side * 0.5, 0] }));
    }
    // one-sided spike: 8 tiny flowers along the top third, offset to +z
    for (let i = 0; i < 8; i++) {
      const t = 0.68 + (i / 8) * 0.3;
      parts.push(place(colored(new THREE.SphereGeometry(0.0038, 5, 4), 0xb9c99a), {
        pos: [0.004, h * t, 0.006 + 0.004 * Math.sin(i * 2.1)],
      }));
    }
    return parts;
  },
};

/**
 * Build the merged geometry for a species.
 * @param {string} speciesId
 * @returns {{ geometry: THREE.BufferGeometry, height: number, radius: number }}
 */
export function buildSpeciesGeometry(speciesId) {
  const build = builders[speciesId];
  if (!build) throw new Error(`no model for species ${speciesId}`);
  const parts = build();
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  const bs = merged.boundingSphere;
  for (const p of parts) p.dispose();
  return { geometry: merged, height: bs.center.y * 2 + 0.05, radius: Math.max(0.12, bs.radius) };
}

/** Species tint used on the map, charts and reveal markers (never the only cue — labels always accompany). */
export const SPECIES_COLORS = {
  'butterweed': '#e3b422',
  'daisyleaf': '#e8e6da',
  'blue-sedge': '#7fa08d',
  'bunchgrass': '#a8a35c',
  'fen-orchid': '#8fb573',
};
