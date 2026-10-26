/**
 * Fieldwork session: the state machine of Module 3, shared by the 3D fieldwork
 * UI and text mode (parity requirement). Owns the design choice, quadrat
 * placement, the visit/time budget and the learner's DataSheet.
 * Pure logic — no DOM, unit-testable.
 * @module systems/fieldwork
 */
import { generateQuadrats, DESIGN_IDS, showyClusters } from './designs.js';
import { DataSheet } from './data-sheet.js';
import { countInQuadrat } from './population-model.js';

/** The gate the field crew starts from (world metres; the station is at x=50, z=2). */
export const GATE = { x: 50, z: 3 };

export class FieldworkSession {
  /**
   * @param {object} opts
   * @param {object} opts.population buildPopulation result
   * @param {Array<{id:string,name:string,coverEstimated?:boolean}>} opts.speciesList
   * @param {{quadrats:number,timeUnits:number,walkCostPerM:number,baseCostPerQuadrat:number}} opts.budget
   * @param {number} [opts.seed] learner-effort seed (distinct from the meadow seed)
   */
  constructor({ population, speciesList, budget, seed = 777 }) {
    this.population = population;
    this.speciesList = speciesList;
    this.budget = budget;
    this.seed = seed;
    this.sheet = new DataSheet({ budget });
    this.design = null;
    this.points = [];
    this.redrawsLeft = 1;          // designs.json: random allows one redraw before starting
    this.placedCount = 0;          // convenience placement progress
    this.visitsDone = 0;
    this.lastFrom = { ...GATE };
    this.started = false;
    this.submitted = false;
    this.clusters = showyClusters(population.positions['butterweed'] || []);
  }

  get maxQuadrats() { return this.budget.quadrats; }

  /**
   * Choose a design and generate its quadrat centres. For 'convenience' the
   * learner places points manually (placeConvenience); points stay empty until then.
   * @param {string} designId
   * @returns {{ ok: boolean, error?: string }}
   */
  chooseDesign(designId) {
    if (!DESIGN_IDS.includes(designId)) return { ok: false, error: `unknown design ${designId}` };
    this.design = designId;
    this.placedCount = 0;
    this.visitsDone = 0;
    this.started = false;
    this.sheet = new DataSheet({ budget: this.budget });
    this.lastFrom = { ...GATE };
    if (designId === 'convenience') {
      this.points = [];
      return { ok: true };
    }
    this.points = generateQuadrats(designId, this.maxQuadrats, this.seed, { butterweedClusters: this.clusters });
    this.sheet.start(designId, this.points);
    return { ok: true };
  }

  /** Redraw the random points (allowed once, before any visit). */
  redraw() {
    if (this.design !== 'random') return { ok: false, error: 'redraw is only part of the simple random design' };
    if (this.redrawsLeft <= 0) return { ok: false, error: 'no redraws left' };
    if (this.visitsDone > 0) return { ok: false, error: 'too late — you have already sampled a quadrat' };
    this.redrawsLeft--;
    this.seed += 101;
    this.points = generateQuadrats('random', this.maxQuadrats, this.seed, { butterweedClusters: this.clusters });
    this.sheet.start('random', this.points);
    return { ok: true };
  }

  /** Convenience placement: the learner picks each centre. */
  placeConvenience(x, z) {
    if (this.design !== 'convenience') return { ok: false, error: 'placement is manual only for the convenience design' };
    if (this.points.length >= this.maxQuadrats) return { ok: false, error: 'quadrat budget used up' };
    const S = this.population.fieldSize;
    const half = 1;
    const p = { x: Math.min(S - half, Math.max(half, x)), z: Math.min(S - half, Math.max(half, z)) };
    this.points.push(p);
    this.sheet.start('convenience', this.points);
    this.placedCount = this.points.length;
    return { ok: true, point: p };
  }

  placementDone() {
    return this.design !== 'convenience' || this.points.length >= this.maxQuadrats;
  }

  /**
   * Visit quadrat i (1-based): charge the walk from the previous stop and open
   * its record. There is no failure state: if time runs out, remaining quadrats
   * simply cannot be visited (the reveal works with whatever was recorded).
   */
  visit(i) {
    if (i < 1 || i > this.points.length) return { ok: false, error: 'no such quadrat' };
    const rec = this.sheet.quadrats[i - 1];
    if (rec.visited) return { ok: true, alreadyVisited: true, rec };
    if (this.sheet.remainingTime() <= 0) return { ok: false, error: 'out of time — the day ends here' };
    const cost = this.sheet.chargeVisit(i, this.lastFrom);
    this.lastFrom = { x: rec.x, z: rec.z };
    this.visitsDone++;
    this.started = true;
    return { ok: true, cost, rec };
  }

  /** True counts inside quadrat i (used by text mode to compose descriptions; the 3D learner sees the plants). */
  trueCounts(i) {
    const p = this.points[i - 1];
    const out = {};
    for (const sp of this.speciesList) {
      const n = countInQuadrat(this.population.positions[sp.id] || [], p.x, p.z);
      if (n > 0) out[sp.id] = n;
    }
    return out;
  }

  /** Enter a count / cover band on the open record. */
  record(i, { counts = {}, cover = null } = {}) {
    for (const [sp, n] of Object.entries(counts)) this.sheet.setCount(i, sp, n);
    if (cover) this.sheet.setCover(i, cover);
    return { ok: true };
  }

  finishVisit(i) {
    const rec = this.sheet.quadrats[i - 1];
    if (!rec) return { ok: false, error: 'no such quadrat' };
    return { ok: true, rec };
  }

  remainingTime() { return this.sheet.remainingTime(); }
  timeFraction() { return Math.max(0, Math.min(1, this.sheet.remainingTime() / this.budget.timeUnits)); }

  /**
   * Submit: compute the learner's estimates. The reveal follows from this.
   * @returns {{ estimates: object, cover: number|null, quadrats: number }}
   */
  submit() {
    this.submitted = true;
    const est = this.sheet.estimates();
    const estimates = {};
    for (const sp of this.speciesList) {
      if (est[sp.id] !== undefined) estimates[sp.id] = est[sp.id];
    }
    return {
      estimates,
      cover: this.sheet.coverEstimate(),
      quadrats: est.__quadrats,
      area: est.__area,
    };
  }
}
