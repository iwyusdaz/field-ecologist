# Research sources

Every fact used in the app or in the design docs that describes the real world is
listed here with the URL that was opened, the date it was accessed, and what was
verified. Facts that could not be verified against a source are marked UNVERIFIED
and are either removed or labeled as such in the app.

| # | Claim as used in the project | Source (URL) | Access date | Verification status |
|---|---|---|---|---|
| 1 | NGSS HS-LS2-2 performance expectation: "Use mathematical representations to support and revise explanations based on evidence about factors affecting biodiversity and populations in ecosystems of different scales." Clarification: "Examples of mathematical representations include finding the average, determining trends, and using graphical comparisons of multiple sets of data." Assessment boundary: "Assessment is limited to provided data." | https://www.nextgenscience.org/pe/hs-ls2-2-ecosystems-interactions-energy-and-dynamics (PE page; the wording also appears in the official topic listing https://www.nextgenscience.org/sites/default/files/HSTopic.pdf) | 2026-10-27 | VERIFIED (PE statement, clarification and assessment boundary confirmed on the nextgenscience.org PE page; the "...of different scales" tail confirmed via the official topic PDF listing as reported in search results and the California CDE standards page) |
| 2 | For immobile organisms such as plants, quadrats are used to estimate population size and density; multiple quadrat samples are performed at several random locations; researchers count individuals within quadrat boundaries; quadrat number and size depend on the organism (e.g. 1 m² for daffodils vs ~100 m² for giant redwoods). Mark–recapture is used for mobile organisms. | OpenStax Biology 2e, section 45.1 "Population Demography", https://openstax.org/books/biology-2e/pages/45-1-population-demography | 2026-10-27 | VERIFIED (quotes confirmed on page: "For immobile organisms such as plants, or for very small and slow-moving organisms, a quadrat may be used"; "Multiple quadrat samples are performed throughout the habitat at several random locations"; quadrat size examples; "For mobile organisms... scientists use a technique called mark and recapture.") |
| 3 | Simple random sampling: "Any group of n individuals is equally likely to be chosen as any other group of n individuals." Stratified sampling: "divide the population into groups called strata and then take a proportionate number from each stratum." Systematic sampling: "randomly select a starting point and take every nth piece of data from a listing of the population." Convenience sampling: "involves using results that are readily available" and "may be very good in some cases and highly biased (favor certain outcomes) in others." Sampling bias arises when some members of the population are less likely to be chosen than others. | OpenStax Introductory Statistics 2e, section 1.2 "Data, Sampling, and Variation in Data and Sampling", https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling | 2026-10-27 | VERIFIED (definitions quoted from the page) |
| 4 | Thomas (Neyman–Scott) cluster process: parent points from a Poisson process; each parent produces a Poisson-distributed number of offspring at isotropic Gaussian displacements; overall intensity = kappa × mu; parents simulated on an expanded window (default 4× scale). | spatstat.random documentation for rThomas, https://www.rdocumentation.org/packages/spatstat.random/versions/3.3-1/topics/rThomas (spatstat.org redirects to https://spatstat.github.io/) | 2026-10-27 | VERIFIED (definition and parameter meanings confirmed on the documentation page) |
| 5 | Poly Haven assets are CC0: "Our assets are all licensed as CC0, which is effectively Public Domain even in jurisdictions that do not support the Public Domain." | https://www.polyhaven.com/license | 2026-10-27 | VERIFIED |
| 6 | Virtual labs can beat hands-on labs for conceptual science knowledge: meta-analysis of 43 studies, g ≈ 0.55 in favor of virtual labs for conceptual knowledge, stronger at secondary level. | Putica & Stanišić (2026), "Impact of virtual and hands-on laboratory experimentation on the acquisition of conceptual science knowledge: a meta-analysis", Frontiers in Education 11, https://www.frontiersin.org/articles/10.3389/feduc.2026.1869632 | 2026-10-27 | VERIFIED (title, authors, journal, finding confirmed on the article page) |
| 7 | Belfast Open Field HDRI (asset id `belfast_open_field`), authors Dimitrios Savva (photography) and Jarod Guest (processing), CC0, described as "an overcast morning with soft, low-contrast natural light across a grassy open field and distant trees on a gentle hill". | https://api.polyhaven.com/info/belfast_open_field and https://polyhaven.com/a/belfast_open_field | 2026-10-27 | VERIFIED (API response opened; file `1k` HDR, 1,647,689 bytes, downloaded from https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/belfast_open_field_1k.hdr on 2026-10-27, sha256 8acb87e692dc0176f22047a5a12859a83277e183bc91ffaaec5b7837331534b8, stored as `public/assets/sky-meadow-1k.hdr`) |

## Notes on quote policy

OpenStax pages state that their CC BY-NC-SA content may not be used to train
generative AI without permission. The short quotations above were retrieved to
verify the facts this project relies on; the app itself does not reproduce
OpenStax passages verbatim. In-app wording paraphrases the concepts and links
the definitions back to the field guide / glossary text written for this project
(content licensed CC BY 4.0).

## Not verified / intentionally absent

- Regional flora accuracy: the five species are fictional teaching species, not
  a real regional flora. They are labeled "teaching model, not a real regional
  flora" everywhere they appear. No real species range or abundance data is used.
- The claim "biased placement overestimates showy species" is a mathematical
  property of the constructed population model in this repo (unit-tested), not
  an empirical claim about real meadows.
