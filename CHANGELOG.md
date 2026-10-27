# Changelog

All notable changes to this project are documented here. Format based on
Keep a Changelog; versioning is semver (major for breaking changes, minor for
new content, patch for fixes).

## [1.0.0] — 2026-10-27

First release: five course modules around a field-sampling game on a seeded
teaching meadow.

### Added
- Seeded population model (Thomas clumps, Poisson random, moisture-gradient
  sedge, dense cover grass, rare clumped orchid) with true totals computed for
  the reveal; unit-tested against its parameters.
- Four sampling designs — simple random (one redraw), systematic grid,
  stratified by moisture zone, and the deliberately biased "wherever looks
  interesting" — with a 10-quadrat budget and a walking-time meter.
- Quadrat workflow: design picker, point generation/placement, walk-and-count
  loop, focused top-down counting view (wind reduced to ~12 %, paused under
  reduced motion), field-guide identification, counts and percent-cover bands,
  data sheet, RFC 4180 CSV export.
- The reveal: true population vs the learner's estimate with error-source
  explanations, and a re-sampling simulator (Web Worker, 1,000 virtual samples
  per run, n = 5–40) with SVG histograms that always ship with data tables and
  text summaries; design-comparison table.
- Assessment: hypothesis task, 5-item pre-check, 8-item ID quiz, 3 chart
  interpretation items, 4-criterion report with rubric self-check (never
  auto-graded), 4 survey-sampling transfer items. Local-only learning record
  with download and per-project data clearing.
- Three skippable, captioned cinematics (dawn arrival, reveal, "a thousand
  samples") with reduced-motion still versions; ≤ 55 s total.
- Full-parity text mode: the meadow as a 20 × 20 grid data table with a
  moisture-zone column; the same session, assessment engine and record.
- Procedural environment: 100 m × 100 m terrain with a moisture gradient and
  stream, instanced vegetation (chunk culling, imposter LOD, preset-scaled
  density, no thinning inside the counted quadrat), GPU wind shader, Poly Haven
  CC0 HDRI (belfast_open_field), quality presets Low→Ultra with warm-up
  auto-selection and dynamic resolution.
- Accessibility: axe-clean overlay (zero critical/serious), full keyboard
  operability, live-region announcements, focus trapping in dialogs, reduced
  motion throughout, colour-independent field marks.
- Release packaging: showcase.json (validated), attribution.json generated from
  ATTRIBUTION.md, 1200×630 posters rendered from the real scene, favicon,
  sub-path build test, CI and release workflows.

### Verification
- 76 unit tests, 6 functional Playwright tests (full playthrough + text-mode
  parity), 2 accessibility specs, sub-path test — all green at release.
- No real learners have tested this yet (see README evaluation notice and
  evaluation/METHODS.md).
