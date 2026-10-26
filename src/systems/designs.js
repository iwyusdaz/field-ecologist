/**
 * Sampling designs: quadrat point generation per design (content/designs.json).
 * Pure module — used by the fieldwork game, the re-sampler worker and tests.
 * All randomness is seeded so virtual repeats are reproducible.
 * @module systems/designs
 */
import { Rng } from './rng.js';
import { FIELD_SIZE } from './moisture-field.js';
import { strata } from './moisture-field.js';

/**
 * Generate n quadrat centres (metres) for a design.
 * @param {string} designId 'random' | 'systematic' | 'stratified' | 'convenience'
 * @param {number} n number of quadrats
 * @param {number} seed seed for this virtual effort
 * @param {object} [ctx] context needed by some designs:
 *   ctx.butterweedClusters: array of {x,z} showy-cluster reference points (for 'convenience')
 * @returns {Array<{x:number,z:number}>}
 */
export function generateQuadrats(designId, n, seed, ctx = {}) {
  const rng = new Rng(seed);
  const S = FIELD_SIZE;
  const half = 1; // keep the 2x2 quadrat fully inside the field
  switch (designId) {
    case 'random': {
      const pts = [];
      for (let i = 0; i < n; i++) {
        pts.push({ x: rng.uniform(half, S - half), z: rng.uniform(half, S - half) });
      }
      return pts;
    }
    case 'systematic': {
      // Regular grid with a random start; n points taken in scanline order.
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const stepX = (S - 2 * half) / cols;
      const stepZ = (S - 2 * half) / rows;
      const ox = half + rng.uniform(0, stepX);
      const oz = half + rng.uniform(0, stepZ);
      const pts = [];
      for (let r = 0; r < rows && pts.length < n; r++) {
        for (let c = 0; c < cols && pts.length < n; c++) {
          pts.push({ x: ox + c * stepX, z: oz + r * stepZ });
        }
      }
      return pts;
    }
    case 'stratified': {
      // Equal-area thirds along the moisture gradient; n/3 per stratum (extras to the wet stratum),
      // simple random within each.
      const bands = strata();
      const pts = [];
      const per = Math.floor(n / 3);
      const extra = n - per * 3; // wet stratum absorbs the remainder
      bands.forEach((b, bi) => {
        const k = per + (bi === 0 ? extra : 0);
        for (let i = 0; i < k; i++) {
          pts.push({
            x: rng.uniform(Math.max(half, b.xMin), Math.min(S - half, b.xMax)),
            z: rng.uniform(half, S - half),
          });
        }
      });
      return pts;
    }
    case 'convenience': {
      // Modeled "wherever looks interesting": a person walks from the field gate and
      // places quadrats where showy plants catch the eye (near visible Butterweed
      // clusters), plus a few near the entrance path. 60% near clusters, 40% near gate.
      const clusters = ctx.butterweedClusters || [];
      const pts = [];
      const gate = { x: S / 2, z: 3 };
      for (let i = 0; i < n; i++) {
        if (clusters.length && rng.next() < 0.6) {
          // Choose a visible cluster and sit inside it.
          const c = clusters[rng.int(0, clusters.length - 1)];
          const x = Math.min(S - half, Math.max(half, c.x + rng.gaussian() * 1.6));
          const z = Math.min(S - half, Math.max(half, c.z + rng.gaussian() * 1.6));
          pts.push({ x, z });
        } else {
          const x = Math.min(S - half, Math.max(half, gate.x + rng.gaussian() * 14));
          const z = Math.min(S - half, Math.max(half, gate.z + Math.abs(rng.gaussian()) * 10));
          pts.push({ x, z });
        }
      }
      return pts;
    }
    default:
      throw new Error(`unknown design: ${designId}`);
  }
}

/** Metadata describing each design (id -> summary used by UI + docs). */
export const DESIGN_IDS = ['random', 'systematic', 'stratified', 'convenience'];
export const PROBABILITY_DESIGNS = ['random', 'systematic', 'stratified'];

/**
 * Compute showy-cluster reference points (for the convenience design) from the
 * Butterweed positions: local density peaks. We reuse the population's own
 * cluster "parent" density by gridding: cells whose 3 m-neighbourhood contains
 * >= 8 butterweed plants, thinned to a handful of reference points.
 * @param {Array<{x:number,z:number}>} butterweedPositions
 * @returns {Array<{x:number,z:number}>}
 */
export function showyClusters(butterweedPositions) {
  const cell = 3;
  const counts = new Map();
  for (const p of butterweedPositions) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const hot = [];
  for (const [k, c] of counts) {
    if (c >= 8) {
      const [i, j] = k.split(',').map(Number);
      hot.push({ x: (i + 0.5) * cell, z: (j + 0.5) * cell, c });
    }
  }
  // Thin to <= 24 reference points, preferring the densest cells, spread apart.
  hot.sort((a, b) => b.c - a.c);
  const picked = [];
  for (const h of hot) {
    if (picked.length >= 24) break;
    if (picked.every((p) => (p.x - h.x) ** 2 + (p.z - h.z) ** 2 > 36)) picked.push(h);
  }
  return picked.map(({ x, z }) => ({ x, z }));
}
