# Evaluation methods — Field Ecologist 1.0.0

What was run, what it shows, and — equally important — what it cannot show.

## What was run (automated, by the builder agent)

| Method | Tool | Scope | Result |
|---|---|---|---|
| Unit tests | vitest 5.0.5 (node) | 76 tests: population-model statistics (totals/density/clumping/gradient vs parameters), sampling designs (point generation, strata coverage), data sheet + estimates, CSV correctness, resampler convergence (unbiased designs' mean ≈ truth; convenience biased ≈ +4.2 per m² above truth on Butterweed), fieldwork session (budget, records), spatial-index parity, quadrat descriptions/grid | all pass |
| Functional tests | Playwright 1.64.1 (Chromium, built app with test hooks) | 6 tests: keyboard menu/settings, module tabs, full scripted playthrough (m1 hypothesis + pre-check → m2 ID quiz incl. one deliberate mis-ID → m3 stratified fieldwork with all 10 quadrats, time budget charged → m4 reveal table + 2 simulator runs → m5 report + rubric + transfer), reveal chart + data table visibility, text-mode parity pass through the 20×20 grid, CSV content | all pass |
| Accessibility | axe-core 4.14 via Playwright | WCAG 2.0/2.1 A+AA tags, canvas excluded: initial view, settings/menu/progress dialogs, text mode m1, module 2 field guide, field guide dialog, module 3 fieldwork view, module 4 gated state, module 5 report, text-mode grid map (400-cell table), text-mode reveal | zero critical or serious violations |
| Sub-path build test | Playwright + static server | Built app copied to `tmp/play/field-ecologist/`, served, loaded at `/play/field-ecologist/`: zero failed requests, zero console errors, canvas renders, text mode opens, "All projects" → `/`; the simulator's Web Worker runs from the sub-path | pass |
| Model validation | vitest (same suite) | Generated populations match their stochastic parameters (totals within Poisson noise, gradient density falls with moisture, clumping index for Thomas species ≫ random); re-sampler estimates converge for unbiased designs | pass |
| Poster render | scripts/render-poster.mjs | Real scene staged (densest Butterweed cluster, two placed quadrats), captured at 1200×630: webp 46 KB / jpg 92 KB (≤ 200 KB budget) | pass |
| Secret scan | gitleaks 8.24.3 `detect --no-git --redact` | whole repo, run before pushes | clean |
| Size checks | CI | no file > 20 MB; dist ≈ 7.3 MB total (dominated by the 1k HDRI + wasm decoders) | pass |

## What these methods can show

- The logic is correct: the population matches its documented parameters; the
  estimator the learners use is unbiased for the three probability designs;
  the convenience design is biased in the documented direction and magnitude.
- The full learning path is completable end-to-end by script in both modes,
  the UI is keyboard operable and axe-clean at the AA gates checked, and the
  release build works from a sub-path with no external requests.

## What these methods cannot show (honest limitations)

1. **Learning outcomes.** No real learners have used this. The pre-check →
   reveal → transfer design may still confuse; item difficulty was not
   piloted. `evaluation/human-protocol/` contains the consent and session
   templates for the first real playtests.
2. **Performance on other devices.** Measured headed on one machine only
   (Apple M1, ANGLE Metal, 2026-10-27, `../_tools/perf-sample.mjs`, Module 3
   fieldwork view, 3 s warm-up + 8 s sample per preset; raw output in
   `results/perf-2026-10-27.json`): 60 fps on every preset; draw calls 32–35;
   triangles 96k (Low), 298k (Medium), 609k (High/Ultra); menu interactive
   0.78 s; 2.53 MB before first interaction. All inside the standards 4.5
   budgets. No physical phone was tested; mobile performance is inferred from
   the Low preset. Frame rate is capped by the 60 Hz display.
3. **ID legibility on Low.** Checked informally with screenshots during
   development (field marks stay distinguishable; counted quadrats are never
   density-thinned), but the plan's independent expert-style legibility check
   belongs to the review pass in `evaluation/reviews/`.
4. **Domain accuracy.** The five species are fictional teaching models
   (labeled in-app); the distribution processes are standard (verified against
   spatstat docs) but parameter values are pedagogical choices, not field
   data. An ecology-instructor review should confirm the teaching claims.
5. **Accessibility with assistive tech.** axe + keyboard coverage is not a
   substitute for testing with real screen readers (the text-mode grid map is
   the main candidate for such a pass).

## Expert-style reviews

Added by the orchestrator after the build (see `evaluation/reviews/README.md`):
ecology instructor, research-methods lecturer, multimedia-principles and
accessibility reviewers.
