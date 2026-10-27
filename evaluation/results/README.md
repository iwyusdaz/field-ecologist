# Test outputs (builder runs, 2026-10-27)

Raw console outputs of the builder's verification runs on the release-candidate
build. These are the runs described in `evaluation/METHODS.md`; CI re-runs the
same suites on every push (`.github/workflows/ci.yml`).

- `unit-tests.txt` — vitest 5.0.5: 76 tests, 6 files, all pass.
- `functional-a11y.txt` — Playwright 1.64.1 (Chromium) on the build with test
  hooks (`VITE_TEST_HOOKS=1`): 6 functional + 2 accessibility specs, 8 passed.
- `sub-path.txt` — sub-path build test at `/play/field-ecologist/`: 1 passed
  (zero failed requests, zero console errors).
