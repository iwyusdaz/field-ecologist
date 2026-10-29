import { describe, it, expect } from 'vitest';
import { streamRibbonRuns, STREAM_HALF_WIDTH } from '../../src/scenes/meadow-dressing.js';
import { buildPopulation } from '../../src/systems/population-model.js';
import { FIELD_SIZE } from '../../src/systems/moisture-field.js';

// v2 revision V1 (critical): the stream water ribbon must never cover a counted plant.

/** Point-in-convex-or-concave polygon (ray casting) on the xz plane. */
function inPolygon(px, pz, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

describe('stream water ribbon vs the counted population', () => {
  const runs = streamRibbonRuns();
  const quads = [];
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i++) {
      const [l0, r0] = run[i], [l1, r1] = run[i + 1];
      quads.push([l0, r0, r1, l1]);
    }
  }

  it('builds a real ribbon (two runs, south and north of the field)', () => {
    expect(runs.length).toBe(2);
    expect(quads.length).toBeGreaterThan(40);
  });

  it('keeps every ribbon vertex outside the 100 m sampling field', () => {
    for (const run of runs) {
      for (const pair of run) {
        for (const p of pair) {
          const inside = p.x >= 0 && p.x <= FIELD_SIZE && p.z >= 0 && p.z <= FIELD_SIZE;
          expect(inside, `${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(false);
        }
      }
    }
  });

  it('has zero counted plant bases inside the water polygon', () => {
    const pop = buildPopulation();
    let n = 0, under = 0;
    for (const pts of Object.values(pop.positions)) {
      for (const p of pts) {
        n++;
        // cheap bounds reject, then exact polygon test
        for (const q of quads) {
          const minZ = Math.min(...q.map((v) => v.z)) - 0.01, maxZ = Math.max(...q.map((v) => v.z)) + 0.01;
          if (p.z < minZ || p.z > maxZ) continue;
          if (inPolygon(p.x, p.z, q)) { under++; break; }
        }
      }
    }
    expect(n).toBeGreaterThan(10000);
    expect(under).toBe(0);
    expect(STREAM_HALF_WIDTH).toBeGreaterThan(0.5);
  });
});
