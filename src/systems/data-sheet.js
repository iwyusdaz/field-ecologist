/**
 * Learner's data sheet: per-quadrat species records, estimates and time budget.
 * Shared by the 3D fieldwork UI and text mode (parity requirement).
 * @module systems/data-sheet
 */
import { QUADRAT_AREA } from './population-model.js';
import { strata, zoneOf, FIELD_SIZE } from './moisture-field.js';

export const COVER_BANDS = [
  { id: '0-5', label: '< 5%', midpoint: 2.5 },
  { id: '5-25', label: '5–25%', midpoint: 15 },
  { id: '25-50', label: '25–50%', midpoint: 37.5 },
  { id: '50-100', label: '> 50%', midpoint: 75 },
];

/** A blank record for one quadrat. */
export function blankQuadratRecord(index) {
  return {
    index,                 // 1-based order visited
    x: null, z: null,      // centre in metres
    counts: {},            // speciesId -> integer count (0 allowed once visited)
    cover: null,           // bunchgrass cover band id or null
    visited: false,
    timeCost: 0,
  };
}

export class DataSheet {
  constructor({ budget }) {
    this.design = null;
    this.quadrats = [];
    this.budget = budget;         // { quadrats, timeUnits, walkCostPerM, baseCostPerQuadrat }
    this.timeUsed = 0;
    this.misIds = 0;              // optional tally from the guide workflow (not auto-graded)
  }

  start(designId, points) {
    this.design = designId;
    this.timeUsed = 0;
    this.quadrats = points.map((p, i) => {
      const rec = blankQuadratRecord(i + 1);
      rec.x = p.x; rec.z = p.z;
      return rec;
    });
  }

  /** Walk cost from a world point to a quadrat centre (straight line, metres). */
  walkCost(from, to) {
    return this.budget.baseCostPerQuadrat
      + Math.hypot(to.x - from.x, to.z - from.z) * this.budget.walkCostPerM;
  }

  /** Charge time for visiting quadrat index i (1-based) coming from `from`. */
  chargeVisit(i, from) {
    const rec = this.quadrats[i - 1];
    const cost = this.walkCost(from, { x: rec.x, z: rec.z });
    rec.timeCost = cost;
    this.timeUsed += cost;
    rec.visited = true;
    return cost;
  }

  remainingTime() { return Math.max(0, this.budget.timeUnits - this.timeUsed); }
  visitedCount() { return this.quadrats.filter((q) => q.visited).length; }
  allVisited() { return this.visitedCount() >= this.quadrats.length; }

  setCount(quadratIndex, speciesId, count) {
    const rec = this.quadrats[quadratIndex - 1];
    if (!rec) throw new Error('no such quadrat');
    rec.counts[speciesId] = Math.max(0, Math.min(999, Math.round(count)));
  }

  setCover(quadratIndex, bandId) {
    const rec = this.quadrats[quadratIndex - 1];
    rec.cover = COVER_BANDS.some((b) => b.id === bandId) ? bandId : null;
  }

  /** Records considered complete: visited and (counts set for >=1 species or cover set). */
  completedRecords() {
    return this.quadrats.filter((q) => q.visited && (Object.keys(q.counts).length > 0 || q.cover));
  }

  /**
   * Density estimate per species from the completed records (individuals / m2).
   *
   * - Blank counts are treated as 0 (agent review: expert research-methods 2,
   *   heuristics 3): a saved quadrat with no entry for a species is a quadrat
   *   where none were recorded. `__blanks` counts how many entries were filled
   *   this way so the UI can say so.
   * - Simple random / systematic / convenience: total count / total sampled area.
   * - Stratified: Σ W_h · ȳ_h, where W_h is stratum h's share of the meadow area
   *   and ȳ_h the mean density of its sampled quadrats (agent review: expert
   *   research-methods 1). Unequal allocation (4 wet / 3 mid / 3 dry) would
   *   otherwise over-weight the wet stratum. If a stratum has no completed
   *   record, the sampled strata's weights are renormalised (`__missingStrata`).
   * @param {string[]} [speciesIds] species to estimate (blanks → 0); defaults to those recorded
   */
  estimates(speciesIds) {
    const recs = this.completedRecords();
    const ids = speciesIds || [...new Set(recs.flatMap((q) => Object.keys(q.counts)))];
    const area = recs.length * QUADRAT_AREA;
    const out = {};
    let blanks = 0;
    for (const q of recs) for (const sp of ids) if (q.counts[sp] === undefined) blanks++;
    const countOf = (q, sp) => q.counts[sp] ?? 0;

    if (this.design === 'stratified' && recs.length) {
      const groups = new Map();
      for (const s of strata()) groups.set(s.id, { w: (s.xMax - s.xMin) / FIELD_SIZE, recs: [] });
      for (const q of recs) groups.get(zoneOf(q.x))?.recs.push(q);
      const sampled = [...groups.values()].filter((g) => g.recs.length);
      const wSum = sampled.reduce((a, g) => a + g.w, 0);
      for (const sp of ids) {
        out[sp] = sampled.reduce((a, g) => {
          const mean = g.recs.reduce((b, q) => b + countOf(q, sp), 0) / (g.recs.length * QUADRAT_AREA);
          return a + (g.w / wSum) * mean;
        }, 0);
      }
      out.__estimator = 'stratified';
      out.__missingStrata = [...groups.entries()].filter(([, g]) => !g.recs.length).map(([id]) => id);
    } else {
      for (const sp of ids) out[sp] = area ? recs.reduce((a, q) => a + countOf(q, sp), 0) / area : 0;
      out.__estimator = 'pooled';
    }
    out.__area = area;
    out.__quadrats = recs.length;
    out.__blanks = blanks;
    return out;
  }

  /** Mean bunchgrass cover (%) from completed cover bands (band midpoints). */
  coverEstimate() {
    const recs = this.completedRecords().filter((q) => q.cover);
    if (!recs.length) return null;
    const mid = COVER_BANDS.find((b) => b.id === recs[0].cover)?.midpoint;
    const mean = recs.reduce((a, q) => {
      const b = COVER_BANDS.find((x) => x.id === q.cover);
      return a + (b ? b.midpoint : 0);
    }, 0) / recs.length;
    void mid;
    return mean;
  }

  /** Total individuals of a species observed. */
  totalObserved(speciesId) {
    return this.completedRecords().reduce((a, q) => a + (q.counts[speciesId] || 0), 0);
  }
}
