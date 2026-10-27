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

  // True Bunchgrass cover: fraction of a fine 5 cm grid whose cell centre lies
  // within the tussock footprint radius of a bunchgrass plant. The radius
  // (BUNCHGRASS_COVER_RADIUS = 0.10 m, a 20 cm tussock) matches the species card
  // ("tussock 15–25 cm across") and the rendered model (~22 cm across). Earlier
  // builds used 0.55 m (53 % cover), which contradicted what learners see
  // (agent review: visual finding 6, expert ecology-instructor finding 1).
  const trueCover = { bunchgrass: bunchgrassCover(positions['bunchgrass'] || []) };

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

/** Tussock footprint radius (m) used for the true cover (species card: 15–25 cm across). */
export const BUNCHGRASS_COVER_RADIUS = 0.10;
/** Grid step (m) for the true-cover raster. */
export const COVER_GRID_STEP = 0.05;

/**
 * Spatial cover fraction for a point set (grid-centre method): the share of
 * grid cells whose centre lies within `radius` of at least one plant.
 * Rasterises each plant's disc onto a bitmap, so overlaps are counted once.
 */
export function bunchgrassCover(points, step = COVER_GRID_STEP, radius = BUNCHGRASS_COVER_RADIUS) {
  const n = Math.round(FIELD_SIZE / step);
  const grid = new Uint8Array(n * n);
  const r2 = radius * radius;
  let covered = 0;
  for (const p of points) {
    const i0 = Math.max(0, Math.floor((p.x - radius) / step));
    const i1 = Math.min(n - 1, Math.floor((p.x + radius) / step));
    const j0 = Math.max(0, Math.floor((p.z - radius) / step));
    const j1 = Math.min(n - 1, Math.floor((p.z + radius) / step));
    for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * step - p.x;
      for (let j = j0; j <= j1; j++) {
        const dz = (j + 0.5) * step - p.z;
        if (dx * dx + dz * dz <= r2) {
          const k = i * n + j;
          if (!grid[k]) { grid[k] = 1; covered++; }
        }
      }
    }
  }
  return covered / (n * n);
}

/** True cover fraction inside one 2 m quadrat (same raster rule; for tests and the reveal). */
export function coverInQuadrat(points, cx, cz, size = QUADRAT_SIZE, step = COVER_GRID_STEP, radius = BUNCHGRASS_COVER_RADIUS) {
  const h = size / 2;
  const near = points.filter((p) => Math.abs(p.x - cx) <= h + radius && Math.abs(p.z - cz) <= h + radius);
  const n = Math.round(size / step);
  let covered = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = cx - h + (i + 0.5) * step, z = cz - h + (j + 0.5) * step;
      if (near.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= radius * radius)) covered++;
    }
  }
  return covered / (n * n);
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
