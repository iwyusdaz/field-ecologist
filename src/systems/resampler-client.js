/**
 * Client for the re-sampling worker: spawns the module worker via
 * `new Worker(new URL('./resampler.worker.js', import.meta.url), { type: 'module' })`
 * (sub-path safe — Vite bundles the URL relative to base). Falls back to
 * chunked main-thread execution if workers are unavailable.
 * @module systems/resampler-client
 */
import { summarize, histogram } from './resampler.js';
import { buildSpatialIndex, designEstimate } from './resampler.js';
import { generateQuadrats, showyClusters } from './designs.js';
import { QUADRAT_SIZE } from './population-model.js';

export class ResamplerClient {
  constructor() {
    this.worker = null;
    this.seq = 0;
    this.pending = new Map();
  }

  _ensureWorker() {
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('./resampler.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this._onMessage(e.data);
      this.worker.onerror = (e) => {
        const pending = [...this.pending.values()];
        this.pending.clear();
        for (const p of pending) p.reject(new Error('worker error: ' + (e.message || 'unknown')));
      };
      return this.worker;
    } catch {
      this.worker = null;
      return null;
    }
  }

  _onMessage(msg) {
    if (!msg || !this.pending.has(msg.id)) return;
    const entry = this.pending.get(msg.id);
    if (msg.type === 'progress') { entry.onProgress?.(msg.done, msg.total); return; }
    this.pending.delete(msg.id);
    if (msg.type === 'result') entry.resolve(msg.results);
    else entry.reject(new Error(msg.message || 'resampler failure'));
  }

  /**
   * Run one or more re-sampling requests.
   * @param {object} population buildPopulation result (a plain-data clone is
   *   posted: structured clone cannot carry the population's function fields)
   * @param {Array<{design:string,n:number,speciesId:string,iterations?:number}>} requests
   * @param {(done:number,total:number)=>void} [onProgress]
   * @returns {Promise<Array<object>>} summaries (+ histogram each)
   */
  run(population, requests, onProgress) {
    const id = ++this.seq;
    const worker = this._ensureWorker();
    if (worker) {
      const payload = {
        positions: population.positions,
        trueDensity: population.trueDensity,
        trueCover: population.trueCover,
        fieldSize: population.fieldSize,
      };
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, onProgress });
        worker.postMessage({ id, type: 'run', population: payload, requests, seedBase: 1 });
      });
    }
    return this._runOnMainThread(population, requests, onProgress);
  }

  async _runOnMainThread(population, requests, onProgress) {
    const clusters = showyClusters(population.positions['butterweed'] || []);
    const total = requests.reduce((a, r) => a + (r.iterations || 1000), 0);
    let done = 0;
    const results = [];
    const indexes = new Map();
    for (const req of requests) {
      const iterations = req.iterations || 1000;
      const index = (() => {
        if (!indexes.has(req.speciesId)) indexes.set(req.speciesId, buildSpatialIndex(population.positions[req.speciesId] || []));
        return indexes.get(req.speciesId);
      })();
      const estimates = new Array(iterations);
      for (let i = 0; i < iterations; i++) {
        const seed = (1e6 + i) >>> 0;
        const quads = generateQuadrats(req.design, req.n, seed, { butterweedClusters: clusters });
        const positions = population.positions[req.speciesId] || [];
        const h = QUADRAT_SIZE / 2;
        const counts = quads.map((q) => {
          let cnt = 0;
          for (const p of positions) {
            if (p.x >= q.x - h && p.x < q.x + h && p.z >= q.z - h && p.z < q.z + h) cnt++;
          }
          return cnt;
        });
        estimates[i] = designEstimate(req.design, quads, counts);
        if (i % 50 === 0) {
          done++;
          onProgress?.(done, total);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      done += iterations - Math.ceil(iterations / 50) * 0; // reconcile
      onProgress?.(done, total);
      const summary = summarize(estimates, population.trueDensity[req.speciesId] || 0, {
        design: req.design, n: req.n, speciesId: req.speciesId, iterations, seedBase: 1,
      });
      summary.histogram = histogram(estimates, 24);
      results.push(summary);
    }
    return results;
  }

  dispose() {
    if (this.worker) { this.worker.postMessage({ type: 'dispose' }); this.worker.terminate(); this.worker = null; }
    this.pending.clear();
  }
}
