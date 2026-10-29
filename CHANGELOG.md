# Changelog

All notable changes to this project are documented here. Format based on
Keep a Changelog; versioning is semver (major for breaking changes, minor for
new content, patch for fixes).

## [2.0.0] — 2026-10-29

Visual and interaction revamp ("Ashcombe Meadow at dawn", plan 09 §4.3). The
learning core is unchanged: same seeded population, the same four designs, the
area-weighted stratified estimator, the 1,000-sample re-sampler (+369 %
convenience bias at n = 10), the counting form dock and full text-mode parity.

### Added
- Art bible (`design/art-bible.md`): palette, grade, typography, model,
  ambient-life and interaction lists, and the fictional-species honesty rule.
- Self-hosted fonts (SIL OFL 1.1): Fraunces (display), Nunito Sans (body),
  Caveat (in-world notebook accent); **Plain font** header toggle.
- Floating HUD: full-bleed 3D with a collapsible panel drawer (**Hide panel**).
- Living meadow: AgX case grade + dawn haze (the real CC0 HDRI still lights the
  scene), surrounding terrain, distant hills, a dry-stone wall with an open
  five-bar gate, a flowing stream (scrolling-normal water), and Poly Haven CC0
  dressing (hedgerow, boulders, fallen trunk, ferns, margin flowers) merged per
  material — all outside the sampling field and never counted.
- Ambient life: wind gust waves across the grass, five wing-flap butterflies on
  margin loops, drifting pollen, morning mist that thins, drifting cloud
  shadows, and an animated field-ecologist character (cap + clipboard; idle and
  writing poses; gaze follows the camera). Calm mode (~30 %) in the counting
  view, where mist/pollen/butterflies/rings/cloud shadows are hidden; reduced
  motion freezes everything.
- In-world interaction: buttercup viewpoint rings (overview, stream, wet zone,
  dry zone) with camera glide, WASD/arrow walk and drag look, hover highlight +
  tooltip on the quadrat stack (click → fieldwork/placement) and the field
  guide (click → guide dialog). Every panel control is kept.
- Unit tests for the honesty rule (dressing and butterflies never inside the
  field; dressing ids never a counted species).

### Changed
- Posters re-rendered from the v2 scene (`poster-2.0.0.*`, blank-frame retry);
  1.0.0 posters removed.

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

### Fixed (agent-review revisions, folded in before tagging)
Seven agent design reviews ran on the release candidate (AI reviewers, not
humans; reports in `evaluation/reviews/`). Their major findings were fixed and
logged with evidence as R1–R7 in `DECISIONS.md`: no identifying geometry below
ground; top-down shape cues and size-correct marks for Sedge vs Bunchgrass and
the Orchid; true Bunchgrass cover recomputed for the drawn tussock size (2.5 %)
and no in-quadrat shrink of counted species; the stratified estimator weighted
by stratum area with blank counts saved as 0 (shared by the simulator);
docked/collapsible counting form and an aspect-correct orthographic counting
view; the menu pauses the engine and cinematics; the S2a caption states the
real plant total and S3 now plays during the simulator run, before the graded
chart items, with the ghost rain driven by the run's progress.

### Verification
- 96 unit tests, 6 functional Playwright tests (full playthrough + text-mode
  parity), 2 accessibility specs, sub-path test — all green after the
  revisions.
- No real learners have tested this yet (see README evaluation notice and
  evaluation/METHODS.md).
