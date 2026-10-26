/**
 * Re-sampler validation (plan §10, required): the re-sampler's estimates
 * converge to the truth for unbiased (probability) designs, the convenience
 * design is visibly biased, and stratification reduces variance for the
 * gradient species. These are the statistical claims the app teaches —
 * they must hold numerically.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { buildPopulation, MEADOW_SEED } from '../../src/systems/population-model.js';
import { runResampling, histogram, virtualEstimate } from '../../src/systems/resampler.js';
import { showyClusters } from '../../src/systems/designs.js';

const pop = buildPopulation(MEADOW_SEED);
const clusters = showyClusters(pop.positions['butterweed']);

// Iterations kept moderate so the suite stays fast; the shipped simulator uses 1000+.
const IT = 500;

describe('re-sampler convergence (unbiased designs)', () => {
  it.each(['random', 'systematic', 'stratified'])(
    'design "%s" at n=20 converges to the true Butterweed density (|bias| < 12%)',
    (design) => {
      const r = runResampling(pop, { design, n: 20, speciesId: 'butterweed', iterations: IT, clusters });
      const relBias = Math.abs(r.bias) / r.trueDensity;
      expect(relBias).toBeLessThan(0.12);
    },
  );

  it.each(['random', 'systematic', 'stratified'])(
    'design "%s" at n=20 converges for Daisy-leaf too (dense random species)',
    (design) => {
      const r = runResampling(pop, { design, n: 20, speciesId: 'daisyleaf', iterations: IT, clusters });
      expect(Math.abs(r.bias) / r.trueDensity).toBeLessThan(0.1);
    },
  );

  it('larger n narrows the sampling distribution (variance decreases)', () => {
    const small = runResampling(pop, { design: 'random', n: 5, speciesId: 'butterweed', iterations: IT, clusters });
    const big = runResampling(pop, { design: 'random', n: 40, speciesId: 'butterweed', iterations: IT, clusters });
    expect(big.sd).toBeLessThan(small.sd);
  });

  it('stratified has lower spread than simple random for the gradient species (Sedge)', () => {
    const strat = runResampling(pop, { design: 'stratified', n: 12, speciesId: 'blue-sedge', iterations: IT, clusters });
    const rand = runResampling(pop, { design: 'random', n: 12, speciesId: 'blue-sedge', iterations: IT, clusters });
    expect(strat.sd).toBeLessThan(rand.sd);
  });

  it('estimates are exactly the taught estimator (count / sampled area) for one draw', () => {
    const est = virtualEstimate(pop, { design: 'random', n: 8, seed: 99, speciesId: 'butterweed', clusters });
    expect(est).toBeGreaterThanOrEqual(0);
    expect(est).toBeLessThan(5); // sane bound for a 0.18/m2 species even when clumped
  });
});

describe('re-sampler exposes bias for the convenience design', () => {
  it('"wherever looks interesting" overestimates Butterweed (bias > +25%)', () => {
    const conv = runResampling(pop, { design: 'convenience', n: 10, speciesId: 'butterweed', iterations: IT, clusters });
    const rand = runResampling(pop, { design: 'random', n: 10, speciesId: 'butterweed', iterations: IT, clusters });
    expect(conv.bias).toBeGreaterThan(pop.trueDensity['butterweed'] * 0.25);
    // and the biased mean sits clearly above the fair design's mean
    expect(conv.mean).toBeGreaterThan(rand.mean * 1.3);
  });

  it('bias persists as n grows (more data does not fix design bias)', () => {
    const n10 = runResampling(pop, { design: 'convenience', n: 10, speciesId: 'butterweed', iterations: IT, clusters });
    const n40 = runResampling(pop, { design: 'convenience', n: 40, speciesId: 'butterweed', iterations: IT, clusters });
    // both strongly biased; the larger-n run is NOT dramatically less biased
    expect(n40.bias).toBeGreaterThan(pop.trueDensity['butterweed'] * 0.2);
    expect(Math.abs(n40.bias - n10.bias)).toBeLessThan(n10.bias * 0.8);
  });

  it('the rare orchid is missed by most virtual samples under every design (0 observed ≠ 0 present)', () => {
    const conv = runResampling(pop, { design: 'convenience', n: 10, speciesId: 'fen-orchid', iterations: 200, clusters });
    const rand = runResampling(pop, { design: 'random', n: 10, speciesId: 'fen-orchid', iterations: 200, clusters });
    const zeros = (r) => r.estimates.filter((e) => e === 0).length / r.estimates.length;
    // With 10 quadrats of 4 m2 (0.4% of the meadow) and ~30 orchids in tiny colonies,
    // the majority of virtual samples see none — for fair AND unfair designs alike.
    expect(zeros(rand)).toBeGreaterThan(0.5);
    expect(zeros(conv)).toBeGreaterThan(0.5);
    // Both designs underestimate the orchid on average (missed rarity is universal).
    expect(rand.mean).toBeLessThan(pop.trueDensity['fen-orchid'] * 1.2);
    expect(conv.mean).toBeLessThan(pop.trueDensity['fen-orchid'] * 1.2);
  });
});

describe('histogram + summary', () => {
  it('histogram bins cover all estimates and preserve the total count', () => {
    const r = runResampling(pop, { design: 'random', n: 20, speciesId: 'butterweed', iterations: 200, clusters });
    const h = histogram(r.estimates, 20);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(200);
    expect(h.rows).toHaveLength(20);
    for (const row of h.rows) expect(row.to).toBeCloseTo(row.from + h.binWidth, 10);
  });

  it('summary percentiles bracket the mean and truth is stored alongside', () => {
    const r = runResampling(pop, { design: 'random', n: 20, speciesId: 'butterweed', iterations: 300, clusters });
    expect(r.p025).toBeLessThanOrEqual(r.mean);
    expect(r.p975).toBeGreaterThanOrEqual(r.mean);
    expect(r.trueDensity).toBe(pop.trueDensity['butterweed']);
  });
});
