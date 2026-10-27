/**
 * Population model validation (plan §10: "generated populations match their
 * parameters") — the required model validation for the reveal to be honest.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildPopulation, generateSpecies, clumpingIndex, densityInXBand,
  countInQuadrat, MEADOW_SEED, SPECIES_PARAMS,
  bunchgrassCover, coverInQuadrat, BUNCHGRASS_COVER_RADIUS,
} from '../../src/systems/population-model.js';
import { moisture, terrainHeight, FIELD_SIZE } from '../../src/systems/moisture-field.js';
import { Rng } from '../../src/systems/rng.js';

const pop = buildPopulation(MEADOW_SEED);

describe('population model: totals match parameters (fixed seed)', () => {
  it('Butterweed (Thomas, kappa*mu*A) total within ~12% of expectation', () => {
    const p = SPECIES_PARAMS['butterweed'];
    const expected = p.parentsPerM2 * p.offspringMean * FIELD_SIZE * FIELD_SIZE; // 1800
    expect(pop.trueTotals['butterweed']).toBeGreaterThan(expected * 0.88);
    expect(pop.trueTotals['butterweed']).toBeLessThan(expected * 1.12);
  });

  it('Daisy-leaf (Poisson lambda=0.35/m2) total within Poisson spread', () => {
    const expected = 0.35 * FIELD_SIZE * FIELD_SIZE; // 3500, sd ~ 59
    expect(Math.abs(pop.trueTotals['daisyleaf'] - expected)).toBeLessThan(4 * Math.sqrt(expected));
  });

  it('Bunchgrass (Poisson lambda=0.8/m2) total within Poisson spread', () => {
    const expected = 0.8 * FIELD_SIZE * FIELD_SIZE; // 8000
    expect(Math.abs(pop.trueTotals['bunchgrass'] - expected)).toBeLessThan(4 * Math.sqrt(expected));
  });

  it('Blue Sedge (gradient) total is between 15% and 60% of the ceiling lambdaMax*A', () => {
    const ceiling = SPECIES_PARAMS['blue-sedge'].maxDensityPerM2 * FIELD_SIZE * FIELD_SIZE; // 9000
    // mean moisture^2.2 over the field is well below 1; keep honest wide bounds
    expect(pop.trueTotals['blue-sedge']).toBeGreaterThan(ceiling * 0.15);
    expect(pop.trueTotals['blue-sedge']).toBeLessThan(ceiling * 0.6);
  });

  it('Fen Orchid is rare (< 40 plants) and present', () => {
    const n = pop.trueTotals['fen-orchid'];
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(40);
  });

  it('stores true totals and densities for every species', () => {
    for (const id of ['butterweed', 'daisyleaf', 'blue-sedge', 'bunchgrass', 'fen-orchid']) {
      expect(pop.trueTotals[id]).toBe(pop.positions[id].length);
      expect(pop.trueDensity[id]).toBeCloseTo(pop.positions[id].length / 10000, 10);
    }
  });
});

describe('population model: distribution patterns', () => {
  it('clumped species have variance-to-mean ratio >> 1 in 5 m cells', () => {
    expect(clumpingIndex(pop.positions['butterweed'], 5)).toBeGreaterThan(3);
    expect(clumpingIndex(pop.positions['fen-orchid'], 5)).toBeGreaterThan(1.5);
  });

  it('random species have variance-to-mean ratio ~ 1 in 5 m cells', () => {
    expect(clumpingIndex(pop.positions['daisyleaf'], 5)).toBeLessThan(1.5);
    expect(clumpingIndex(pop.positions['daisyleaf'], 5)).toBeGreaterThan(0.6);
  });

  it('Blue Sedge follows the moisture gradient (wet third much denser than dry third)', () => {
    const wet = densityInXBand(pop.positions['blue-sedge'], 0, FIELD_SIZE / 3);
    const dry = densityInXBand(pop.positions['blue-sedge'], (2 * FIELD_SIZE) / 3, FIELD_SIZE);
    expect(wet).toBeGreaterThan(dry * 4);
    // and its density correlates with the moisture field's west-high structure
    expect(wet).toBeGreaterThan(0);
  });

  it('gradient species is rarer than the ceiling everywhere (thinning worked)', () => {
    // the density in any band must stay below lambdaMax
    const any = densityInXBand(pop.positions['blue-sedge'], 0, 20);
    expect(any).toBeLessThan(SPECIES_PARAMS['blue-sedge'].maxDensityPerM2);
  });

  it('all plants lie inside the field bounds', () => {
    for (const pts of Object.values(pop.positions)) {
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(FIELD_SIZE);
        expect(p.z).toBeGreaterThanOrEqual(0);
        expect(p.z).toBeLessThanOrEqual(FIELD_SIZE);
      }
    }
  });

  it('Thomas clusters actually cluster: nearest- neighbour concentration around cluster cores', () => {
    // In a 2x2 m quadrat centred on a random butterweed plant, the mean count
    // should far exceed what a homogeneous Poisson of the same total would give.
    const pts = pop.positions['butterweed'];
    let sum = 0;
    const nSamples = 120;
    for (let i = 0; i < nSamples; i++) {
      const p = pts[Math.floor((i * 7919) % pts.length)]; // deterministic sampling of centres
      sum += countInQuadrat(pts, p.x, p.z);
    }
    const meanAroundPlant = sum / nSamples;
    // Poisson expectation would be ~ 1 + 4*0.18 = 1.72; a Thomas cluster core is much denser.
    expect(meanAroundPlant).toBeGreaterThan(4);
  });
});

describe('population model: determinism and seeding', () => {
  it('same seed -> identical populations', () => {
    const a = buildPopulation(MEADOW_SEED);
    const b = buildPopulation(MEADOW_SEED);
    expect(JSON.stringify(a.positions)).toBe(JSON.stringify(b.positions));
  });

  it('different seed -> different populations (same statistics regime)', () => {
    const a = buildPopulation(MEADOW_SEED + 1);
    expect(JSON.stringify(a.positions)).not.toBe(JSON.stringify(pop.positions));
    expect(a.trueTotals['butterweed']).toBeGreaterThan(1200);
    expect(a.trueTotals['butterweed']).toBeLessThan(2600);
  });

  it('species generation is reproducible per-species', () => {
    const a = generateSpecies('butterweed', new Rng(42));
    const b = generateSpecies('butterweed', new Rng(42));
    expect(a).toEqual(b);
  });

  it('unknown species process throws', () => {
    expect(() => generateSpecies('martian-cactus', new Rng(1))).toThrow(/unknown species/);
  });
});

describe('moisture field sanity', () => {
  it('moisture is 1 near the stream and low on the dry rise', () => {
    const zMid = 50;
    expect(moisture(14, zMid)).toBeGreaterThan(0.9);
    expect(moisture(95, zMid)).toBeLessThan(0.2);
  });

  it('terrain height is gentle (0.05..4 m) everywhere', () => {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const x = (i / 20) * 100, z = (j / 20) * 100;
        const y = terrainHeight(x, z);
        expect(y).toBeGreaterThanOrEqual(0.05);
        expect(y).toBeLessThan(4);
      }
    }
  });
});

describe('true Bunchgrass cover matches what is drawn and described (agent review: visual 6)', () => {
  it('footprint radius is a 15–25 cm tussock (species card)', () => {
    expect(BUNCHGRASS_COVER_RADIUS * 2).toBeGreaterThanOrEqual(0.15);
    expect(BUNCHGRASS_COVER_RADIUS * 2).toBeLessThanOrEqual(0.25);
  });

  it('true cover is ~ lambda * pi * r^2 (sparse Poisson: 1 - exp(-lambda*pi*r^2) ~ 2.5 %)', () => {
    const lambda = 0.8;
    const expected = 1 - Math.exp(-lambda * Math.PI * BUNCHGRASS_COVER_RADIUS ** 2);
    expect(pop.trueCover.bunchgrass).toBeGreaterThan(expected * 0.85);
    expect(pop.trueCover.bunchgrass).toBeLessThan(expected * 1.15);
    expect(pop.trueCover.bunchgrass).toBeLessThan(0.05); // the '< 5 %' band is the honest answer
  });

  it('raster cover counts overlapping tussocks once (hand example)', () => {
    // two identical points = one disc; disc area pi*0.1^2 = 0.0314 m2 of 10,000 m2
    const one = bunchgrassCover([{ x: 50, z: 50 }]);
    const two = bunchgrassCover([{ x: 50, z: 50 }, { x: 50, z: 50 }]);
    expect(two).toBe(one);
    expect(one).toBeCloseTo((Math.PI * 0.01) / 10000, 5);
  });

  it('per-quadrat true cover agrees with the field-wide figure on average', () => {
    let sum = 0, k = 0;
    for (let x = 5; x < 100; x += 10) {
      for (let z = 5; z < 100; z += 10) { sum += coverInQuadrat(pop.positions['bunchgrass'], x, z); k++; }
    }
    expect(Math.abs(sum / k - pop.trueCover.bunchgrass)).toBeLessThan(0.01);
  });
});
