/**
 * Sampling-design tests: each design obeys its definition (research/sampling-methods-notes.md).
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { generateQuadrats, showyClusters } from '../../src/systems/designs.js';
import { zoneOf, FIELD_SIZE } from '../../src/systems/moisture-field.js';

describe('designs', () => {
  it('simple random: points uniform-ish, inside bounds, reproducible', () => {
    const a = generateQuadrats('random', 10, 7);
    const b = generateQuadrats('random', 10, 7);
    expect(a).toEqual(b);
    for (const p of a) {
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(FIELD_SIZE);
      expect(p.z).toBeGreaterThan(0); expect(p.z).toBeLessThan(FIELD_SIZE);
    }
    // spread across the field (not all in one corner)
    const xs = a.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
  });

  it('systematic: forms a grid (distinct rows/cols) with random start inside first cell', () => {
    const pts = generateQuadrats('systematic', 10, 11);
    expect(pts).toHaveLength(10);
    const xs = new Set(pts.map((p) => Math.round(p.x * 10)));
    const zs = new Set(pts.map((p) => Math.round(p.z * 10)));
    expect(xs.size).toBeGreaterThanOrEqual(4); // 4 columns
    expect(zs.size).toBeGreaterThanOrEqual(3); // 3 rows
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(FIELD_SIZE);
    }
  });

  it('stratified: equal quota per third (extras to the wet stratum), each stratum sampled', () => {
    const n = 10;
    const pts = generateQuadrats('stratified', n, 13);
    const byZone = { wet: 0, mid: 0, dry: 0 };
    for (const p of pts) byZone[zoneOf(p.x)]++;
    expect(byZone).toEqual({ wet: 4, mid: 3, dry: 3 });
    // reproducible
    expect(generateQuadrats('stratified', n, 13)).toEqual(pts);
  });

  it('convenience: sits near showy clusters when they are given', () => {
    const clusters = showyClusters([
      { x: 30, z: 30 }, { x: 30.5, z: 30.5 }, { x: 31, z: 30 }, { x: 30, z: 31 },
      { x: 31, z: 31 }, { x: 30.5, z: 30 }, { x: 30, z: 30.5 }, { x: 31.5, z: 30.5 },
      { x: 30.2, z: 31.4 }, { x: 30.9, z: 30.9 },
    ]);
    expect(clusters.length).toBe(1);
    const pts = generateQuadrats('convenience', 12, 17, { butterweedClusters: clusters });
    const near = pts.filter((p) => Math.hypot(p.x - 30.5, p.z - 30.7) < 8).length;
    // 60% of 12 ≈ 7 expected near clusters; allow spread
    expect(near).toBeGreaterThanOrEqual(4);
  });

  it('unknown design throws', () => {
    expect(() => generateQuadrats(' psychic', 5, 1)).toThrow(/unknown design/);
  });

  it('n=5 and n=40 both work for every design', () => {
    for (const d of ['random', 'systematic', 'stratified', 'convenience']) {
      expect(generateQuadrats(d, 5, 3)).toHaveLength(5);
      expect(generateQuadrats(d, 40, 3)).toHaveLength(40);
    }
  });
});
