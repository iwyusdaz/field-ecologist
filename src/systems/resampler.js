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
import { countInQuadrat, QUADRAT_AREA } from './population-model.js';

/**
 * Run one virtual sampling effort and return the density estimate for a species.
 * @param {object} population result of buildPopulation (positions per species)
 * @param {object} opts { design, n, seed, speciesId, clusters }
 * @returns {number} density estimate (individuals per m2)
 */
export function virtualEstimate(population, opts) {
  const { design, n, seed, speciesId, clusters } = opts;
  const quads = generateQuadrats(design, n, seed, { butterweedClusters: clusters });
  const positions = population.positions[speciesId];
  let total = 0;
  for (const q of quads) {
    total += countInQuadrat(positions, q.x, q.z);
  }
  return total / (n * QUADRAT_AREA);
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
