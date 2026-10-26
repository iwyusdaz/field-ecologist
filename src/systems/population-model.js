/**
 * The seeded population model for Ashcombe Meadow (design/ecology-model.md).
 *
 * Generates the true plant population over a 100 m x 100 m field from one seed:
 *  - Meadow Butterweed: Thomas (Neyman-Scott) cluster process (showy, clumped — the target species)
 *  - Common Daisy-leaf: homogeneous Poisson (random)
 *  - Blue Sedge: inhomogeneous Poisson thinned by the moisture field (gradient)
 *  - Tussock Bunchgrass: dense homogeneous Poisson (cover species)
 *  - Fen Orchid: sparse Thomas cluster process (rare, clumped)
 *
 * True totals/densities/cover are computed and stored for the reveal.
 * Pure module — no DOM, runs in Node (vitest), workers and the browser.
 * @module systems/population-model
 */
import { Rng } from './rng.js';
import { FIELD_SIZE, moisture, terrainHeight, zoneOf } from './moisture-field.js';

export const MEADOW_SEED = 20260535; // documented in design/ecology-model.md (chosen from a scan of consecutive seeds so realized totals sit near the parameter expectations)

/** Species process parameters (mirrors content/species.json modelParams). */
export const SPECIES_PARAMS = {
  'butterweed': { type: 'thomas', parentsPerM2: 0.003, offspringMean: 60, clusterSdM: 2.2 },
  'daisyleaf': { type: 'poisson', densityPerM2: 0.35 },
  'blue-sedge': { type: 'gradient', maxDensityPerM2: 0.9, moisturePower: 2.2 },
  'bunchgrass': { type: 'poisson', densityPerM2: 0.8 },
  'fen-orchid': { type: 'thomas', parentsPerM2: 0.0008, offspringMean: 3, clusterSdM: 3.0 },
};

export const SPECIES_ORDER = ['butterweed', 'daisyleaf', 'blue-sedge', 'bunchgrass', 'fen-orchid'];

/**
 * Generate one species' positions in the field.
 * @param {string} speciesId
 * @param {Rng} rng seeded stream
 * @returns {Array<{x:number, z:number}>} positions in metres
 */
export function generateSpecies(speciesId, rng) {
  const p = SPECIES_PARAMS[speciesId];
  if (!p) throw new Error(`unknown species: ${speciesId}`);
  const pts = [];
  const S = FIELD_SIZE;
  if (p.type === 'poisson') {
    const n = rng.poisson(p.densityPerM2 * S * S);
    for (let i = 0; i < n; i++) {
      pts.push({ x: rng.uniform(0, S), z: rng.uniform(0, S) });
    }
  } else if (p.type === 'gradient') {
    // Rejection (thinning) sampling for the inhomogeneous Poisson process.
    const lambdaMax = p.maxDensityPerM2;
    const n = rng.poisson(lambdaMax * S * S);
    for (let i = 0; i < n; i++) {
      const x = rng.uniform(0, S), z = rng.uniform(0, S);
      const keepProb = Math.pow(moisture(x, z), p.moisturePower);
      if (rng.next() < keepProb) pts.push({ x, z });
    }
  } else if (p.type === 'thomas') {
    // Parents over an expanded window (4*sigma margin) so edge clusters are not clipped.
    const m = 4 * p.clusterSdM;
    const nParents = rng.poisson(p.parentsPerM2 * (S + 2 * m) * (S + 2 * m));
    for (let i = 0; i < nParents; i++) {
      const px = rng.uniform(-m, S + m), pz = rng.uniform(-m, S + m);
      const nOff = rng.poisson(p.offspringMean);
      for (let j = 0; j < nOff; j++) {
        const x = px + rng.gaussian() * p.clusterSdM;
        const z = pz + rng.gaussian() * p.clusterSdM;
        if (x >= 0 && x <= S && z >= 0 && z <= S) pts.push({ x, z });
      }
    }
  } else {
    throw new Error(`unknown species process: ${speciesId}`);
  }
  return pts;
}

/**
 * Build the full meadow population from a seed.
 * @param {number} [seed=MEADOW_SEED]
 * @param {object} [opts] { species: subset ids (default all), withHeight: also store terrain height per plant }
 */
export function buildPopulation(seed = MEADOW_SEED, opts = {}) {
  const rng = new Rng(seed);
  const ids = opts.species || SPECIES_ORDER;
  /** @type {Record<string, Array<{x:number,z:number,h?:number}>>} */
  const positions = {};
  for (const id of ids) {
    const pts = generateSpecies(id, rng);
    if (opts.withHeight) for (const pt of pts) pt.h = terrainHeight(pt.x, pt.z);
    positions[id] = pts;
  }

  const trueTotals = {};
  const trueDensity = {};
  for (const id of ids) {
    trueTotals[id] = positions[id].length;
    trueDensity[id] = positions[id].length / (FIELD_SIZE * FIELD_SIZE);
  }

  // True Bunchgrass cover: fraction of a 0.25 m grid whose cell centre lies within
  // the modelled tussock footprint radius (0.55 m) of a bunchgrass plant.
  const coverGridStep = 0.25;
  const coverRadius = 0.55;
  const trueCover = { bunchgrass: bunchgrassCover(positions['bunchgrass'] || [], coverGridStep, coverRadius) };

  return {
    seed,
    fieldSize: FIELD_SIZE,
    positions,
    trueTotals,
    trueDensity,
    trueCover,
    zoneOf,
  };
}

/** Spatial cover fraction for a point set (grid-centre method). */
export function bunchgrassCover(points, step = 0.25, radius = 0.55) {
  const S = FIELD_SIZE;
  const n = Math.round(S / step);
  // Bucket plants into a coarse hash grid of cell size = radius for fast lookup.
  const cell = radius;
  const buckets = new Map();
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
  }
  let covered = 0, total = 0;
  const r2 = radius * radius;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      total++;
      const cx = (i + 0.5) * step, cz = (j + 0.5) * step;
      const bi = Math.floor(cx / cell), bj = Math.floor(cz / cell);
      let hit = false;
      for (let di = -1; di <= 1 && !hit; di++) {
        for (let dj = -1; dj <= 1 && !hit; dj++) {
          const arr = buckets.get(`${bi + di},${bj + dj}`);
          if (!arr) continue;
          for (const p of arr) {
            const dx = p.x - cx, dz = p.z - cz;
            if (dx * dx + dz * dz <= r2) { hit = true; break; }
          }
        }
      }
      if (hit) covered++;
    }
  }
  return covered / total;
}

/**
 * Count plants of a species inside a 2x2 m quadrat centred at (cx, cz).
 * Quadrat area = 4 m^2 (content/designs.json).
 */
export const QUADRAT_SIZE = 2;
export const QUADRAT_AREA = QUADRAT_SIZE * QUADRAT_SIZE;

export function countInQuadrat(positions, cx, cz, size = QUADRAT_SIZE) {
  const h = size / 2;
  let n = 0;
  for (const p of positions) {
    if (p.x >= cx - h && p.x < cx + h && p.z >= cz - h && p.z < cz + h) n++;
  }
  return n;
}

/** Spatial statistics helper: variance-to-mean ratio of counts in k x k metre cells (clumping index). */
export function clumpingIndex(points, cellSize = 5) {
  const S = FIELD_SIZE;
  const n = Math.round(S / cellSize);
  const counts = new Array(n * n).fill(0);
  for (const p of points) {
    const i = Math.min(n - 1, Math.max(0, Math.floor(p.x / cellSize)));
    const j = Math.min(n - 1, Math.max(0, Math.floor(p.z / cellSize)));
    counts[j * n + i]++;
  }
  const N = counts.length;
  const mean = counts.reduce((a, b) => a + b, 0) / N;
  const vari = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
  return mean > 0 ? vari / mean : 0;
}

/** Mean density (per m2) of a species inside an x-band. */
export function densityInXBand(points, xMin, xMax) {
  const S = FIELD_SIZE;
  const inBand = points.filter((p) => p.x >= xMin && p.x < xMax).length;
  return inBand / ((xMax - xMin) * S);
}
