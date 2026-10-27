# Ecology model (design/ecology-model.md)

**Statement of honesty:** the meadow is a **teaching model**. The five species
are botanically plausible but fictional, constructed for teaching purposes; the
meadow is not a real regional flora and uses no real abundance data. All
parameters below are documented so an instructor can read exactly what the
simulation claims — and what it does not.

## Field
- 100 m × 100 m (10,000 m²), origin at the NW corner; x runs west→east, z north→south.
- A stream runs near the west edge and meanders; ground moisture falls from the
  stream to the dry rise in the east.

## Moisture field (analytic, deterministic)
```
streamX(z)     = 14 + 6 · sin(2π z / 40)
moisture(x,z)  = clamp01(1.25 − (x − streamX(z)) / 38)
```
Soil moisture falls to ~0 about 47 m east of the stream, leaving the eastern
rise dry. Wet / mid / dry strata are the three equal-area x-thirds
(see `moisture-field.js#strata`), used by the stratified design and shown on
the map.

## Terrain height (analytic)
```
h(x,z) = max(0.05, 0.03 · (x − streamX(z)) + 0.35·sin(0.11x)·cos(0.09z)
             + 0.2·sin(0.031x + 2)·sin(0.043z) + 0.8)
```
Gentle rise eastward (dry side higher, ≤ ~4 m), ripples for micro-relief.
1 unit = 1 m.

## Species and processes (seeded, reproducible)

Seed: **20260535** ("meadow seed"). PRNG: mulberry32 + Box–Muller gaussians
(`src/systems/rng.js`). The same seed always produces the same meadow, so the
"truth" is stable for teaching, testing and the reveal. The seed was chosen by
scanning consecutive seeds so the realized totals sit near the parameter
expectations for every species (checked by unit tests). Realized totals for
this seed: Butterweed 1,783 · Daisy-leaf 3,474 · Blue Sedge 3,196 ·
Bunchgrass 8,079 · Fen Orchid 34.

| Species | Process | Parameters | Expected total |
|---|---|---|---|
| Meadow Butterweed (target, showy) | Thomas cluster (Neyman–Scott) | parents 0.003/m² (κ), offspring mean μ = 60, dispersal σ = 2.2 m | κ·μ·A ≈ 1,800 |
| Common Daisy-leaf | homogeneous Poisson | λ = 0.35/m² | ≈ 3,500 |
| Blue Sedge | inhomogeneous Poisson (thinning by moisture) | λ(x,z) = 0.9 · moisture^2.2 | ≈ 2,300, concentrated in the wet third |
| Tussock Bunchgrass | homogeneous Poisson (dense) | λ = 0.8/m² | ≈ 8,000 |
| Fen Orchid (rare) | Thomas cluster | κ = 0.0008/m², μ = 3, σ = 3.0 m | ≈ 24 |

Thomas process (verified definition, `research/sources.md` #4): parents from a
Poisson process; each parent produces a Poisson(μ) number of offspring at
isotropic Gaussian(σ) displacements; only offspring are kept. Parents are drawn
over an expanded window (4σ margin) so clusters near edges are not clipped.

## Why these parameters
- **Butterweed ≈ 1,800 / clumps σ = 2.2 m:** dense enough that a 2×2 m quadrat
  inside a cluster counts several individuals, sparse enough (mean 0.18/m²) that
  random quadrats often see zero — the contrast that makes the convenience
  design's bias dramatic and visible.
- **Sedge gradient power 2.2:** strong but not absolute; the wet:dry density
  ratio is large enough that stratified sampling visibly steadies the estimate.
- **Orchid ≈ 24 in 8 tiny colonies:** with 10 quadrats of 4 m² (0.4% of the
  meadow), the expected number of sampled orchids is ≈ 0.01 — "0 observed"
  is the normal outcome, which is the lesson.
- **Bunchgrass λ = 0.8/m²:** too dense to count per-quadrat (≈ 3 individuals
  per 4 m² quadrat plus visual tussock size), so cover bands are the honest
  method — mirroring real practice (OpenStax §45.1).

## True values stored for the reveal
`buildPopulation(seed)` computes and stores, before any sampling:
- `trueTotals[speciesId]` — exact plant counts,
- `trueDensity[speciesId]` — total / 10,000 m²,
- `trueCover.bunchgrass` — fraction of a 5 cm grid whose cell centre lies
  within 0.10 m of a bunchgrass plant (a 20 cm tussock: matches the species
  card's "15–25 cm across" and the rendered model, ~22 cm). For seed
  20260535 this is 2.5 % (the "< 5 %" band). Revised from 0.55 m / 53 %
  after the agent review (DECISIONS.md revision R3).

## Validation (unit-tested, `tests/unit/`)
1. Totals match parameters within Poisson tolerance for the fixed seed.
2. Clumping: variance-to-mean ratio of 5×5 m cell counts ≫ 1 for Butterweed and
   the Orchid; ≈ 1 for Daisy-leaf (homogeneous Poisson property).
3. Gradient: mean Sedge density in the wet third > 4× the dry third.
4. Rarity: Orchid total < 40.
5. Determinism: identical seed → identical points; different seed → different.
6. Bounds: every point inside [0,100]².
7. Re-sampler convergence: for the three probability designs, the mean of 1,000
   re-sampled density estimates is within a few percent of the true density for
   the target species; the convenience design's mean is biased upward by a
   large margin; stratified SD < simple-random SD for the gradient species.

## What the model does NOT claim
- No competition, succession, phenology or seed-bank dynamics.
- No real species names, ranges or abundances.
- The "wherever looks interesting" behaviour is a stylized model of human
  convenience placement (60% near visible showy clusters, 40% near the field
  entrance/path), not survey data about real students' behaviour.
