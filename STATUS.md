# Status — Field Ecologist: Sampling the Meadow (1.0.0)

Checklist from plan `implementation-plans/immersive/03-field-ecologist.md` §14 and
the shared standards. Statuses: **done**, done(agent review pending), **not possible (reason)**.

## Final quality checklist (plan §14)

- [x] **done** — Population model tests pass; the re-sampler converges (18 population + 14 resampler + 16 fieldwork unit tests; unbiased designs' mean estimates match true density within tolerance).
- [x] **done** — All 4 designs playable (simple random with one redraw, systematic, stratified by moisture zone, convenience with manual placement); the biased design produces visible bias (modelled convenience sampler: +369 % mean Butterweed bias at n = 10 and +365 % at n = 40 across 1,000 virtual samples, re-run 2026-10-27 after the estimator revision; the unit test asserts > +25 %; visible in the reveal table after a convenience run).
- [x] **done** — CSV export opens correctly in spreadsheet apps (RFC 4180 quoting, CRLF, UTF-8 BOM, self-describing columns; unit-tested).
- [x] **done** — Text mode supports every decision (design choice, placement, quadrat sampling with field-mark descriptions, counts/cover, data sheet, CSV, reveal, simulator with data tables, report, transfer, assessment — one shared session and record).
- [x] **done** — Performance budgets met, measured headed on an Apple M1 (2026-10-27, Module 3 fieldwork view): 60 fps on every preset; Medium 35 draw calls and 298k triangles; Ultra 609k triangles; menu interactive 0.78 s; 2.53 MB before first interaction (`evaluation/results/perf-2026-10-27.json`). Low preset legibility is kept by never thinning instances inside the counted quadrat; the independent legibility review is still pending.
- [x] **done** — Cinematics ≤ 90 s (S1+S2+S3 = 55 s), skippable from the first frame (Skip + Esc), captioned, with text descriptions and reduced-motion still versions.
- [x] **done** — README: play link (marked pending deployment), evaluation notice at top, realism rationale in design/realism-matrix.md. *(Trailer: placeholder only — see below.)*

## Build contract (08-vercel-deployment.md §5)

- [x] **done** — Vite `base: './'`; relative asset URLs; no absolute paths in the built output.
- [x] **done** — `public/showcase.json` matches `schemas/showcase.schema.json` (`node scripts/validate-showcase.mjs 1.0.0` passes).
- [x] **done** — `public/attribution.json` generated from `ATTRIBUTION.md` (`scripts/gen-attribution.mjs`, run automatically by `npm run build`).
- [x] **done** — Posters `public/poster-1.0.0.webp` (46 KB) + `.jpg` (92 KB), 1200×630, rendered from the real scene via `scripts/render-poster.mjs` (Playwright screenshot of the staged real scene; staging script is committed).
- [x] **done** — `public/favicon.svg` (original SVG, CC BY 4.0 alongside content).
- [x] **done** — Sub-path test green: `SLUG=field-ecologist npx playwright test tests/sub-path.spec.js` — zero failed requests, zero console errors, canvas renders, text mode opens, "All projects" → `/`.
- [x] **done** — Unit tests green (76); functional + a11y specs green (Playwright); CI workflow and release workflow present, actions pinned to SHAs, slug substituted in CI.
- [x] **done** — Self-hosted decoders (vite plugin serves them from the pinned three package into `dist/decoders/`; no CDN requests; no vendored decoder files in git).
- [x] **done** — Re-sampling Web Worker loads from a sub-path (`new Worker(new URL('./resampler.worker.js', import.meta.url), { type: 'module' })`; proven by the sub-path test — the simulator runs there with zero console errors).
- [x] **done** — gitleaks clean; no file > 20 MB; repo ≪ 300 MB.

## Phases (plan §8)

- [x] Phase 0 — template scaffold, workflows, pins.
- [x] Phase 1 — verified research (`research/sources.md`, `research/sampling-methods-notes.md`), ecology model doc.
- [x] Phase 2 — objectives, alignment matrix, items, rubric, transfer, teacher guide, realism matrix, shot list, text-mode design.
- [x] Phase 3 — seeded population model + true totals + tests.
- [x] Phase 4 — procedural species models with distinct field marks, instancing + chunk culling + imposter LOD, GPU wind shader (12 % in quadrat view, 0 under reduced motion), moisture-gradient terrain + stream, Poly Haven CC0 HDRI, preset-scaled density.
- [x] Phase 5 — design picker, point generation per design, placement, walk + time budget, counting view, field guide workflow, counts + cover entry, data sheet, CSV, reveal, worker simulator, charts with data tables.
- [x] Phase 6 — S1–S3 cinematics wired to the scene (dawn lighting/mist, reveal highlight + held overhead map view, ghost-quadrat rain).
- [x] Phase 7 — overlay, settings (quality/FOV/motion/audio), announcements, text mode, learning record ("My progress" page with download + clear-my-data).
- [x] Phase 8 — release build contract (above). Note: no git tag was created (orchestrator instruction; the release workflow will fire on the owner's `v1.0.0` tag).
- [x] Phase 9 — all copy lives in `content/*.json`; ≥ 5 revisions documented in `DECISIONS.md`; trailer: **not possible (no video asset produced — placeholder section in README; screen-capture trailer left to the orchestrator)**.

## Known limitations (honest)

1. No real learners and no physical phone testing (see the README notice).
2. Performance was measured on one machine (Apple M1); no physical phone was tested, so mobile performance is inferred from the Low preset. The plan's "ID legibility check on each preset" was executed informally during development (screenshots on Medium/Low; field marks stay distinguishable; counted quadrats are never thinned) but awaits the independent expert-style review pass.
3. The five species are fictional teaching models (labeled in-app and in docs); no regional-flora accuracy is claimed.
4. **Pending:** agent expert reviews (ecology instructor, research-methods lecturer) and the other design reviews, to be added in `evaluation/reviews/` and labeled "Agent review".
