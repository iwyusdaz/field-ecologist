/**
 * Re-sampling Web Worker (plan §8 phase 8: must load from any sub-path —
 * instantiated by the UI with `new Worker(new URL('./resampler.worker.js',
 * import.meta.url), { type: 'module' })`, which Vite bundles relatively).
 *
 * Protocol (main -> worker):
 *   { id, type: 'run', population, requests: [{ design, n, speciesId, iterations }], seedBase }
 *   { id, type: 'dispose' }
 * Worker -> main:
 *   { id, type: 'progress', done, total }
 *   { id, type: 'result', results: [summary...] }   // summaries include the histogram
 * @module systems/resampler.worker
 */
import { summarize, histogram, buildSpatialIndex } from './resampler.js';
import { generateQuadrats, showyClusters } from './designs.js';
import { QUADRAT_AREA } from './population-model.js';

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || msg.type === 'dispose') return;
  if (msg.type !== 'run') return;
  const { id, population, requests = [], seedBase = 1 } = msg;
  try {
    const clusters = showyClusters(population.positions['butterweed'] || []);
    // One spatial index per species, built once for all requests.
    const indexes = new Map();
    const indexFor = (speciesId) => {
      if (!indexes.has(speciesId)) {
        indexes.set(speciesId, buildSpatialIndex(population.positions[speciesId] || []));
      }
      return indexes.get(speciesId);
    };

    const total = requests.reduce((a, r) => a + (r.iterations || 1000), 0);
    let done = 0;
    const results = [];

    for (const req of requests) {
      const iterations = req.iterations || 1000;
      const { design, n, speciesId } = req;
      const index = indexFor(speciesId);
      const positions = population.positions[speciesId] || [];
      const trueDensity = population.trueDensity[speciesId] || 0;
      const estimates = new Array(iterations);
      const CHUNK = 50; // yield so progress messages flow
      for (let start = 0; start < iterations; start += CHUNK) {
        for (let i = start; i < Math.min(start + CHUNK, iterations); i++) {
          const seed = (seedBase * 1e6 + i) >>> 0;
          const quads = generateQuadrats(design, n, seed, { butterweedClusters: clusters });
          let cnt = 0;
          for (const q of quads) cnt += countFast(index, positions, q.x, q.z);
          estimates[i] = cnt / (n * QUADRAT_AREA);
        }
        done += Math.min(start + CHUNK, iterations) - start;
        self.postMessage({ id, type: 'progress', done, total });
        await new Promise((r) => setTimeout(r, 0));
      }
      const summary = summarize(estimates, trueDensity, { design, n, speciesId, iterations, seedBase });
      summary.histogram = histogram(estimates, 24);
      // The full estimate list is small (1000 numbers) and lets the UI offer
      // exact tables; keep it.
      results.push(summary);
    }
    self.postMessage({ id, type: 'result', results });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.stack || err) });
  }
};

function countFast(index, positions, cx, cz) {
  if (!index.buckets.size) return 0;
  const h = QUADRAT_SIZE / 2;
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
