# Sampling-methods notes (verified against sources in `sources.md`)

This file records how the four sampling designs in the game are implemented and
how each maps to the standard definitions. Definitions were verified against
OpenStax Introductory Statistics 2e §1.2 and OpenStax Biology 2e §45.1 on
2026-10-27 (see `sources.md`).

## Quadrat method (Biology 2e §45.1)

- Quadrats are square sample areas marked out within a habitat, used for
  immobile or slow-moving organisms such as plants.
- Multiple quadrat samples are placed at random locations across the habitat.
- The researcher counts individuals inside each quadrat boundary and uses those
  counts to estimate population size and density for the whole habitat.
- Quadrat size depends on the organism's density and size (1 m² for daffodils,
  ~100 m² for redwoods).

**In the game:** quadrats are 2 m × 2 m (4 m²), a common size for herbaceous
meadow plants, chosen so that a top-down counting view shows a countable number
of individuals (0–15 plants of the target species per quadrat). Density
estimate = (total individuals counted) / (total area sampled). The meadow is
100 m × 100 m = 10,000 m².

## The four designs

| Design | Standard definition (source #3) | In-game implementation (`src/systems/designs.js`) |
|---|---|---|
| Simple random | Any group of n sampling units equally likely to be chosen | n quadrat centers drawn uniformly at random over the 100 × 100 m field (seeded) |
| Systematic | Random start, then fixed, periodic interval | A regular grid of spacing s = sqrt(10000/n) m with a random start offset in [0, s); n grid points taken in scanline order |
| Stratified | Divide the population into strata; take a proportionate number from each | The moisture field is divided into three strata along the wetness axis (wet, mid, dry) of equal area; n/3 quadrats per stratum (rounded, wet stratum gets extras), simple random within each stratum |
| "Wherever looks interesting" (convenience) | Using results that are readily available; "may be very good ... and highly biased in others" | Modeled as a human walking from the field station and placing quadrats where showy plants are conspicuous: 60% of quadrats are placed near visible clusters of the showy target species (within a few meters of a cluster), the rest near the field edge/path. This is a *modeled human behavior*, not a sampling method anyone should use — the game is designed so that this design visibly overestimates the showy species and misses the rare one |

## Key teaching consequences (grounded in the constructed model, unit-tested)

1. **Convenience bias:** because the showy target species (Butterweed) is
   clumped, "wherever looks interesting" places quadrats inside clusters and
   overestimates its density (tests assert the mean re-sampled estimate for the
   convenience design exceeds the true density by a large margin, while the
   three probability designs are approximately unbiased).
2. **Gradient + variance:** the Sedge follows a moisture gradient. Simple random
   sampling wastes quadrats in unsuitable thirds; stratifying by moisture zone
   lowers the variance of the estimate for the Sedge (tests assert
   SD_stratified < SD_simple-random for the gradient species).
3. **Rare species:** the Fen Orchid (~24 plants, clumped) is almost never caught
   by 10 quadrats of 4 m². The reveal shows observed ≈ 0 vs true ≈ 24 — a
   memorable demonstration that "we saw none" is not evidence of absence.
4. **Sample size:** the re-sampling simulator shows that increasing n narrows
   the sampling distribution but does not remove bias from the convenience
   design (bias is design-dependent, variance is n-dependent).

## Estimation formulas used in-app

- Density estimate (per species): `D̂ = Σ counts / (n × quadratArea)` individuals
  per m², where quadratArea = 4 m².
- Percent cover (Bunchgrass only): mean of per-quadrat cover-band midpoints
  (bands 0–5–25–50–100%, midpoints 2.5/15/37.5/75%).
- Uncertainty: standard deviation of the estimate across re-samples, and a
  simple 95% interval taken from the 2.5–97.5 percentiles of the sampling
  distribution (percentile bootstrap-style interval from the simulated
  distribution, described in-app as such).
- True values are computed exactly from the seeded population (point counts
  inside the field; true cover from a 0.25 m resolution grid).

## Transfer to survey sampling (module 5)

The same four designs map onto surveying students about study habits:
- Simple random → draw n names from the full student list at random.
- Systematic → every kth name on an alphabetized list from a random start.
- Stratified → sample proportionately from each year group (strata).
- Convenience → survey the people in the library at lunch (readily available;
  biased toward students who use the library).
Definitions and the bias warning for convenience sampling follow source #3.
