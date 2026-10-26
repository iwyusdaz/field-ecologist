/**
 * Learner's data sheet: per-quadrat species records, estimates and time budget.
 * Shared by the 3D fieldwork UI and text mode (parity requirement).
 * @module systems/data-sheet
 */
import { QUADRAT_AREA } from './population-model.js';

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
   * Density estimate per species from the completed records (individuals / m2),
   * exactly the estimator taught in-app: total count / total sampled area.
   */
  estimates() {
    const out = {};
    const recs = this.completedRecords();
    const area = recs.length * QUADRAT_AREA;
    for (const q of recs) {
      for (const [sp, n] of Object.entries(q.counts)) {
        out[sp] = (out[sp] || 0) + n;
      }
    }
    for (const sp of Object.keys(out)) out[sp] = out[sp] / area;
    out.__area = area;
    out.__quadrats = recs.length;
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
