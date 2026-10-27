/**
 * Re-sampling simulator core (pure, worker-safe): repeats a sampling effort
 * virtually, counting the TRUE plants inside each virtual quadrat set and
 * computing the density estimate exactly the way the learner did.
 *
 * 1,000+ virtual samples per design at n = 5..40 run in a Web Worker
 * (`resampler.worker.js`); this module holds the logic so vitest can prove
 * convergence for unbiased designs (plan §10 model validation).
 * @module systems/resampler
 */
import { generateQuadrats, showyClusters } from './designs.js';
import { countInQuadrat, QUADRAT_AREA, QUADRAT_SIZE } from './population-model.js';
import { strata, zoneOf, FIELD_SIZE } from './moisture-field.js';

/**
 * Run one virtual sampling effort and return the density estimate for a species.
 * @param {object} population result of buildPopulation (positions per species)
 * @param {object} opts { design, n, seed, speciesId, clusters, index? }
 * @returns {number} density estimate (individuals per m2)
 */
export function virtualEstimate(population, opts) {
  const { design, n, seed, speciesId, clusters } = opts;
  const quads = generateQuadrats(design, n, seed, { butterweedClusters: clusters });
  const positions = population.positions[speciesId];
  const index = opts.index || null;
  const counts = quads.map((q) => (index ? countInQuadratIndexed(index, q.x, q.z) : countInQuadrat(positions, q.x, q.z)));
  return designEstimate(design, quads, counts);
}

/**
 * The learner's estimator for one sampling effort (same rule as DataSheet.estimates):
 * stratified → Σ W_h · ȳ_h with area weights; every other design → total / area.
 * @param {string} design
 * @param {Array<{x:number,z:number}>} quads quadrat centres
 * @param {number[]} counts plants counted in each quadrat
 * @returns {number} density (per m2)
 */
export function designEstimate(design, quads, counts) {
  if (!quads.length) return 0;
  if (design !== 'stratified') {
    return counts.reduce((a, b) => a + b, 0) / (quads.length * QUADRAT_AREA);
  }
  const sums = new Map(), ns = new Map();
  quads.forEach((q, i) => {
    const z = zoneOf(q.x);
    sums.set(z, (sums.get(z) || 0) + counts[i]);
    ns.set(z, (ns.get(z) || 0) + 1);
  });
  let est = 0, wSum = 0;
  for (const s of strata()) {
    if (!ns.get(s.id)) continue;
    const w = (s.xMax - s.xMin) / FIELD_SIZE;
    wSum += w;
    est += w * sums.get(s.id) / (ns.get(s.id) * QUADRAT_AREA);
  }
  return est / wSum;
}

/**
 * Uniform-grid spatial index for fast "count inside a 2x2 m quadrat" lookups
 * (semantics identical to countInQuadrat's half-open bounds). Used by the
 * re-sampling worker: 1,000 iterations x up to 40 quadrats over ~15k plants.
 * @param {Array<{x:number,z:number}>} positions
 * @param {number} [cell] grid cell size in metres (default = quadrat size)
 * @returns {{ cell:number, buckets:Map<string,Array<{x:number,z:number}>> }}
 */
export function buildSpatialIndex(positions, cell = QUADRAT_SIZE) {
  const buckets = new Map();
  for (const p of positions) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(p);
  }
  return { cell, buckets };
}

/** Count plants inside a size x size quadrat at (cx,cz) using a buildSpatialIndex result. */
export function countInQuadratIndexed(index, cx, cz, size = QUADRAT_SIZE) {
  const h = size / 2;
  const cell = index.cell;
  const i0 = Math.floor((cx - h) / cell), i1 = Math.floor((cx + h - 1e-9) / cell);
  const j0 = Math.floor((cz - h) / cell), j1 = Math.floor((cz + h - 1e-9) / cell);
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const arr = index.buckets.get(`${i},${j}`);
      if (!arr) continue;
      for (const p of arr) {
        if (p.x >= cx - h && p.x < cx + h && p.z >= cz - h && p.z < cz + h) n++;
      }
    }
  }
  return n;
}

/**
 * Run `iterations` virtual samples and summarise the sampling distribution.
 * @param {object} population buildPopulation result
 * @param {object} opts { design, n, speciesId, iterations, seedBase, clusters }
 * @returns {{ estimates:number[], mean:number, sd:number, p025:number, p975:number, bias:number, trueDensity:number }}
 */
export function runResampling(population, opts) {
  const { design, n, speciesId, iterations = 1000, seedBase = 1 } = opts;
  const clusters = opts.clusters || showyClusters(population.positions['butterweed'] || []);
  const estimates = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    // Stable per-iteration seed derived from seedBase + i (no accumulation drift).
    estimates[i] = virtualEstimate(population, { design, n, seed: (seedBase * 1e6 + i) >>> 0, speciesId, clusters });
  }
  return summarize(estimates, population.trueDensity[speciesId], { design, n, speciesId, iterations });
}

/** Summarise estimates: mean, sd, percentile interval, bias vs truth. */
export function summarize(estimates, trueDensity, meta = {}) {
  const sorted = estimates.slice().sort((a, b) => a - b);
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  const vari = estimates.reduce((a, b) => a + (b - mean) ** 2, 0) / (estimates.length - 1);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    ...meta,
    estimates,
    trueDensity,
    mean,
    sd: Math.sqrt(Math.max(0, vari)),
    p025: q(0.025),
    p975: q(0.975),
    bias: mean - trueDensity,
  };
}

/** Histogram binning for the SVG chart (also returns the data table rows). */
export function histogram(estimates, bins = 20) {
  const min = Math.min(...estimates);
  const max = Math.max(...estimates);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const e of estimates) {
    const b = Math.min(bins - 1, Math.floor((e - min) / width));
    counts[b]++;
  }
  return {
    binStart: Array.from({ length: bins }, (_, i) => min + i * width),
    binWidth: width,
    counts,
    rows: counts.map((c, i) => ({
      from: min + i * width,
      to: min + (i + 1) * width,
      count: c,
    })),
  };
}
