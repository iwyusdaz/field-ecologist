/**
 * Seeded deterministic PRNG utilities (mulberry32 + gaussian via Box–Muller).
 * The whole meadow is reproducible from one seed (design/ecology-model.md).
 * Pure module — no DOM, usable in workers and unit tests.
 * @module systems/rng
 */

/** @param {number} seed 32-bit integer */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded uniform [0,1) stream with derived gaussian + poisson helpers. */
export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
    this._spare = null;
  }

  /** Uniform in [min, max). */
  uniform(min = 0, max = 1) { return min + (max - min) * this.next(); }

  /** Uniform integer in [min, max] inclusive. */
  int(min, max) { return Math.floor(this.uniform(min, max + 1)); }

  /** Standard normal via Box–Muller (with cached spare). */
  gaussian() {
    if (this._spare !== null) { const s = this._spare; this._spare = null; return s; }
    let u = 0, v = 0;
    do { u = this.next(); } while (u === 0);
    v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this._spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  /**
   * Poisson sample. Knuth's multiplication algorithm for small lambda;
   * a rounded normal approximation for large lambda (Knuth underflows for
   * lambda > ~700 and crawls above ~30; the approximation's skewness is
   * 1/sqrt(lambda) < 0.19 there — plenty for a teaching model).
   */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.gaussian()));
    }
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > L);
    return k - 1;
  }

  /** Fisher–Yates shuffle (copy). */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Deterministic hash of a string to a 32-bit seed (for per-run seeds). */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
