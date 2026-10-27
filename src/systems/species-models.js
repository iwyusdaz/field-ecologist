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

/**
 * Local height (m) of flat basal leaves above the plant origin. Flat parts are
 * the primary field mark for Daisy-leaf and Fen Orchid, so they must clear the
 * terrain everywhere under the leaf (terrain slope <= ~0.08 m/m over an 8 cm
 * leaf is <= 7 mm; the mesh interpolation error is < 1 mm).
 */
export const ROSETTE_Y = 0.016;

/**
 * How far each species' instances are sunk into the terrain (m). Upright
 * species are sunk 4 mm (covers the terrain mesh's interpolation error, which
 * is < 1 mm at 0.78 m cells) so stem bases never float; species whose
 * identifying marks lie flat on the ground are NOT sunk (agent review:
 * visual finding 1 — the old uniform -0.02 hid both rosettes).
 */
export const GROUND_SINK = {
  'butterweed': 0.004,
  'daisyleaf': 0,
  'blue-sedge': 0.004,
  'bunchgrass': 0.004,
  'fen-orchid': 0,
};

/** Burial tolerance for the base of upright marks (blade roots) in the unit test (m). */
export const MARK_BURIAL_TOLERANCE = 0.005;

/** Tag a part as an identifying field mark (checked by the above-ground unit test). */
function mark(geo) {
  geo.userData.fieldMark = true;
  return geo;
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
      const leaf = mark(colored(new THREE.ConeGeometry(0.028, 0.13, 4), 0x557a2e));
      leaf.rotateZ(Math.PI / 2); // lie sideways, tip outward
      parts.push(place(leaf, { pos: [side * 0.05, y, 0], rot: [0, 0, side * -0.35], scale: [1, 1, 0.35] }));
    }
    // rounded button head 2-3 cm across on a bare stalk top
    const head = mark(colored(new THREE.IcosahedronGeometry(0.017, 1), 0xf2c832));
    parts.push(place(head, { pos: [0, h + 0.01, 0], scale: [1, 0.8, 1] }));
    const rim = colored(new THREE.CylinderGeometry(0.016, 0.004, 0.012, 6), 0xd9a918);
    parts.push(place(rim, { pos: [0, h - 0.004, 0] }));
    return parts;
  },

  // Flat basal rosette of round, bluntly toothed leaves + short stalks with small white button flowers.
  // The rosette sits ABOVE the ground (local y >= ROSETTE_Y, no instance sink — see
  // GROUND_SINK) and is a lighter green than the wet-zone ground so the round
  // star of leaves reads from the top-down counting view.
  'daisyleaf': () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = mark(colored(ovalLeaf(0.075, 0.034, 0.008), i % 2 ? 0x67a447 : 0x5c9a40));
      // leaf centred 4 cm out from the crown, tilted up slightly (rosettes cup)
      parts.push(place(leaf, { pos: [Math.cos(a) * 0.04, ROSETTE_Y, Math.sin(a) * 0.04], rot: [0, Math.PI / 2 - a, 0] }));
    }
    // pale crown where the leaves meet (helps the eye find each rosette's centre)
    parts.push(place(mark(colored(new THREE.CylinderGeometry(0.014, 0.016, 0.01, 8), 0xa9c98a)), { pos: [0, ROSETTE_Y + 0.004, 0] }));
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

  // Fountain-like tuft of fewer, WIDER arching blades, bluish-green, brown spike tips.
  // From above: an open star ~45-55 cm across with visibly wide blades and gaps
  // between them, plus 3 dark brown seed spikes near the centre (top-down cue
  // that does not depend on colour hue: blade width, open spread, dark dots).
  'blue-sedge': () => {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const h = 0.3 + 0.12 * ((i * 7919) % 100) / 100;
      const b = mark(blade(h, 0.026, 0.13 + 0.05 * (i % 3), 0.62));
      parts.push(place(colored(b, 0x6a8f8a), { rot: [0, -a, 0] }));
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.4;
      const tip = [Math.cos(a) * 0.05, 0.36 + 0.03 * k, Math.sin(a) * 0.05];
      parts.push(place(colored(new THREE.CylinderGeometry(0.003, 0.004, 0.36, 5), 0x6f7d4f), {
        pos: [tip[0] / 2, tip[1] / 2, tip[2] / 2], rot: [Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14],
      }));
      // brown seed spike: elongated dark capsule, readable as a dark dot from above
      parts.push(place(mark(colored(new THREE.SphereGeometry(0.011, 6, 4), 0x4a3820)), { pos: tip, scale: [1, 2.2, 1] }));
    }
    return parts;
  },

  // Tight upright tussock: a dense mop of many hair-thin stiff blades from one point.
  // From above: a compact, densely filled disc ~18-24 cm across (half the sedge's
  // spread), fine-textured, with pale straw seed heads at some blade tips.
  'bunchgrass': () => {
    const parts = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + (i % 2) * 0.4;
      const h = 0.24 + 0.1 * ((i * 104729) % 100) / 100;
      const b = mark(blade(h, 0.007, 0.025 + 0.02 * (i % 3), 0.16 + 0.06 * (i % 2)));
      parts.push(place(colored(b, i % 3 ? 0x7c8a4a : 0x9aa05a), { rot: [0, -a, 0] }));
    }
    // straw seed heads on 5 stems (pale, small, fine-grained texture from above)
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26;
      parts.push(place(mark(colored(new THREE.SphereGeometry(0.006, 5, 3), 0xd8c98a)), {
        pos: [Math.cos(a) * 0.06, 0.32 + 0.01 * (k % 2), Math.sin(a) * 0.06], scale: [1, 2.5, 1],
      }));
    }
    return parts;
  },

  // Slender bare stem + loose ONE-SIDED spike of tiny flowers + exactly two flat oval basal leaves.
  // Legibility exaggeration (design/realism-matrix.md): basal leaves 7 cm long
  // (real 3-5 cm, ~1.6x), flowers 12 mm across (real < 5 mm, ~2.5x). From above:
  // two glossy pale ovals in a V with a cream dot cluster where they meet.
  'fen-orchid': () => {
    const parts = [];
    const h = 0.26;
    parts.push(place(colored(new THREE.CylinderGeometry(0.0035, 0.005, h, 5), 0x5d7a4a), { pos: [0, h / 2, 0] }));
    for (const side of [-1, 1]) {
      const leaf = mark(colored(ovalLeaf(0.07, 0.034, 0.008), 0x8cc46a));
      // leaf centre 3.4 cm out, at +/-35 degrees from the stem axis (a "V")
      const a = side * 0.6;
      parts.push(place(leaf, { pos: [Math.sin(a) * 0.034, ROSETTE_Y, Math.cos(a) * 0.034], rot: [0, a, 0] }));
    }
    // one-sided spike: 9 flowers along the top third, offset to +z
    for (let i = 0; i < 9; i++) {
      const t = 0.66 + (i / 9) * 0.32;
      parts.push(place(mark(colored(new THREE.SphereGeometry(0.006, 6, 4), 0xeef0c8)), {
        pos: [0.004 * Math.cos(i * 2.1), h * t, 0.009 + 0.004 * Math.sin(i * 2.1)],
      }));
    }
    return parts;
  },
};

/**
 * Lowest local y of any identifying field-mark part of a species model
 * (before the instance sink). Used by the above-ground unit test.
 * @param {string} speciesId
 * @returns {number}
 */
export function fieldMarkMinY(speciesId) {
  const parts = builders[speciesId]();
  let min = Infinity;
  for (const g of parts) {
    if (!g.userData.fieldMark) { g.dispose(); continue; }
    g.computeBoundingBox();
    min = Math.min(min, g.boundingBox.min.y);
    g.dispose();
  }
  return min;
}

/** Species ids that have a model. */
export const MODELLED_SPECIES = Object.keys(builders);

/**
 * Build the merged geometry for a species.
 * @param {string} speciesId
 * @returns {{ geometry: THREE.BufferGeometry, height: number, radius: number }}
 */
export function buildSpeciesGeometry(speciesId) {
  const build = builders[speciesId];
  if (!build) throw new Error(`no model for species ${speciesId}`);
  const parts = build();
  // mergeGeometries requires every geometry to share the same attribute set —
  // polyhedron geometries (icosahedron) are non-indexed while cylinders/spheres
  // are indexed, so normalize everything to non-indexed first.
  const normalized = parts.map((g) => {
    if (g.index) { const n = g.toNonIndexed(); g.dispose(); return n; }
    return g;
  });
  const merged = mergeGeometries(normalized, false);
  merged.computeBoundingSphere();
  const bs = merged.boundingSphere;
  for (const p of normalized) p.dispose();
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
