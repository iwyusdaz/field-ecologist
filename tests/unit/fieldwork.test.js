/**
 * Fieldwork session unit tests: design flow, redraw rules, time budget,
 * convenience placement, records and submission (Module 3 logic shared by
 * 3D mode and text mode).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FieldworkSession, GATE } from '../../src/systems/fieldwork.js';
import { buildPopulation } from '../../src/systems/population-model.js';
import { buildGrid, describeQuadrat, cellCode } from '../../src/systems/quadrat-describe.js';
import { buildSpatialIndex, countInQuadratIndexed } from '../../src/systems/resampler.js';

const population = buildPopulation();
// The real content list (field marks included) for description tests.
const speciesContent = JSON.parse(readFileSync(new URL('../../content/species.json', import.meta.url), 'utf8'));
const speciesList = speciesContent.species;
const budget = { quadrats: 10, timeUnits: 100, walkCostPerM: 0.12, baseCostPerQuadrat: 1.5 };

function session(design = 'random') {
  const s = new FieldworkSession({ population, speciesList, budget, seed: 42 });
  s.chooseDesign(design);
  return s;
}

describe('fieldwork session: designs and points', () => {
  it('generates maxQuadrats points for probability designs', () => {
    for (const d of ['random', 'systematic', 'stratified']) {
      const s = session(d);
      expect(s.points).toHaveLength(10);
      for (const p of s.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.z).toBeGreaterThanOrEqual(0);
        expect(p.z).toBeLessThanOrEqual(100);
      }
    }
  });

  it('starts convenience with manual placement', () => {
    const s = session('convenience');
    expect(s.points).toHaveLength(0);
    expect(s.placementDone()).toBe(false);
    const r = s.placeConvenience(55, 30);
    expect(r.ok).toBe(true);
    expect(s.points).toHaveLength(1);
  });

  it('rejects convenience placement beyond the budget and clamps to the field', () => {
    const s = session('convenience');
    for (let i = 0; i < 10; i++) expect(s.placeConvenience(-50 + i, 500).ok).toBe(true);
    expect(s.points).toHaveLength(10);
    expect(s.points[0].x).toBeGreaterThanOrEqual(1); // clamped inside
    expect(s.placementDone()).toBe(true);
    expect(s.placeConvenience(50, 50).ok).toBe(false);
  });

  it('allows exactly one redraw for the random design, before any visit', () => {
    const s = session('random');
    const first = s.points.map((p) => `${p.x},${p.z}`).join('|');
    expect(s.redraw().ok).toBe(true);
    expect(s.points.map((p) => `${p.x},${p.z}`).join('|')).not.toBe(first);
    expect(s.redraw().ok).toBe(false);
  });

  it('refuses redraw after sampling has begun', () => {
    const s = session('random');
    s.visit(1);
    expect(s.redraw().ok).toBe(false);
  });

  it('rejects unknown designs', () => {
    const s = new FieldworkSession({ population, speciesList, budget });
    expect(s.chooseDesign('haphazard').ok).toBe(false);
  });
});

describe('fieldwork session: visits and the time budget', () => {
  it('charges base cost plus straight-line walking from the gate, then chains stops', () => {
    const s = session('random');
    const p1 = s.points[0];
    const expectBase = budget.baseCostPerQuadrat + Math.hypot(p1.x - GATE.x, p1.z - GATE.z) * budget.walkCostPerM;
    const r1 = s.visit(1);
    expect(r1.ok).toBe(true);
    expect(r1.cost).toBeCloseTo(expectBase, 6);
    const p2 = s.points[1];
    const r2 = s.visit(2);
    expect(r2.cost).toBeCloseTo(budget.baseCostPerQuadrat + Math.hypot(p2.x - p1.x, p2.z - p1.z) * budget.walkCostPerM, 6);
    expect(s.remainingTime()).toBeCloseTo(budget.timeUnits - r1.cost - r2.cost, 6);
  });

  it('does not double-charge a revisit', () => {
    const s = session('random');
    s.visit(1);
    const t = s.remainingTime();
    const r = s.visit(1);
    expect(r.alreadyVisited).toBe(true);
    expect(s.remainingTime()).toBe(t);
  });

  it('runs out of time without a failure state', () => {
    const s = new FieldworkSession({ population, speciesList, budget: { ...budget, timeUnits: 3 }, seed: 7 });
    s.chooseDesign('random');
    const r = s.visit(1);
    expect(r.ok).toBe(true);
    expect(s.remainingTime()).toBe(0);
    expect(s.visit(2).ok).toBe(false);
    // submission still works with partial data
    s.record(1, { counts: { butterweed: 4 } });
    const sub = s.submit();
    expect(sub.quadrats).toBe(1);
  });

  it('records counts (clamped to 0..999) and cover bands', () => {
    const s = session('stratified');
    s.visit(1);
    s.record(1, { counts: { 'blue-sedge': 12 }, cover: '25-50' });
    const rec = s.sheet.quadrats[0];
    expect(rec.counts['blue-sedge']).toBe(12);
    expect(rec.cover).toBe('25-50');
    s.record(1, { counts: { 'blue-sedge': 5000 } });
    expect(rec.counts['blue-sedge']).toBe(999);
    s.record(1, { cover: 'not-a-band' });
    expect(rec.cover).toBeNull();
  });

  it('computes estimates from completed records only (individuals / m2)', () => {
    const s = session('systematic');
    s.visit(1);
    s.record(1, { counts: { butterweed: 8 } });   // 8 / 4 m2 = 2
    s.visit(2);
    s.record(2, { counts: { butterweed: 4 } });   // + 1 = 3 / 8 m2
    const sub = s.submit();
    expect(sub.estimates.butterweed).toBeCloseTo(12 / 8, 6);
    expect(sub.quadrats).toBe(2);
    expect(sub.area).toBeCloseTo(8, 6);
  });
});

describe('quadrat descriptions and grid (text mode parity)', () => {
  it('builds a 20x20 grid whose row zone matches the moisture field', () => {
    const grid = buildGrid(population);
    expect(grid.gridN).toBe(20);
    expect(grid.cells).toHaveLength(400);
    const wet = grid.cells[2];        // i=2 (x band 2, west) at j=0 -> wet
    const dry = grid.cells[19];       // i=19 (x band 19, east) at j=0 -> dry
    expect(wet.zone).toBe('wet');
    expect(dry.zone).toBe('dry');
    for (const cell of grid.cells) expect(typeof cell.code).toBe('string');
  });

  it('cell codes follow the legend priority (orchid > yellow > sedge > tussock > daisy > bare)', () => {
    expect(cellCode({ 'fen-orchid': 1 })).toBe('o');
    expect(cellCode({ butterweed: 3 })).toBe('y');
    expect(cellCode({ 'blue-sedge': 10 })).toBe('~');
    expect(cellCode({ bunchgrass: 12 })).toBe('b');
    expect(cellCode({ daisyleaf: 3 })).toBe('d');
    expect(cellCode({})).toBe('·');
  });

  it('describes a quadrat with per-species groups but WITHOUT naming the species', () => {
    // find a quadrat centre that certainly contains butterweed: use a cluster cell
    const grid = buildGrid(population);
    const rich = grid.cells.find((c) => (c.counts['butterweed'] || 0) >= 3);
    expect(rich).toBeTruthy();
    const d = describeQuadrat(population, speciesList, rich.cx, rich.cz);
    const bw = d.groups.find((g) => g.speciesId === 'butterweed');
    expect(bw.individuals).toBeGreaterThanOrEqual(3);
    expect(d.groups.every((g) => !/\b(butterweed|sedge|orchid|daisy|bunchgrass)\b/i.test(g.description))).toBe(true);
    expect(bw.marks.length).toBeGreaterThanOrEqual(2);
  });

  it('cover-estimated species are described as too-many-to-count', () => {
    const grid = buildGrid(population);
    const g = grid.cells.find((c) => (c.counts['bunchgrass'] || 0) >= 5);
    const d = describeQuadrat(population, speciesList, g.cx, g.cz);
    const bg = d.groups.find((x) => x.speciesId === 'bunchgrass');
    expect(bg.coverEstimated).toBe(true);
    expect(bg.description).toMatch(/too many to count/);
  });
});

describe('spatial index parity', () => {
  it('indexed counting matches the brute-force count on every quadrat of a design', () => {
    const s = session('stratified');
    for (const id of ['butterweed', 'blue-sedge', 'fen-orchid']) {
      const positions = population.positions[id];
      const index = buildSpatialIndex(positions);
      for (const p of s.points) {
        expect(countInQuadratIndexed(index, p.x, p.z)).toBe(
          positions.filter((q) => q.x >= p.x - 1 && q.x < p.x + 1 && q.z >= p.z - 1 && q.z < p.z + 1).length,
        );
      }
    }
  });
});
