# Agent review — v2.0.0 honesty and accessibility (Field Ecologist)

Agent review (AI reviewer; automated axe is not a substitute for testing with assistive technology or for an expert accessibility review). Preview build `7441b25`, Chromium headless with SwiftShader.

## axe (wcag2a/aa, 21a/aa; canvas excluded)

| State | Critical/serious | Moderate/minor |
|---|---|---|
| m1 question | 0 | 0 |
| m2 field guide and species quiz | 0 | 0 |
| m3 fieldwork (design chosen, chips and map) | 0 | 0 |
| m3 counting view, form docked | 0 | 0 |
| m3 counting view, form hidden (pill) | 0 | 0 |
| m4 reveal after submission | 0 | 0 |
| m4 reveal and convenience simulator | 0 | 0 |
| m5 report and transfer | 0 | 0 |

The repo's `tests/a11y.spec.js` also passed: initial view, settings, menu, text mode, progress, m2, m3, field guide dialog, m4, m5. **Gate met.**

## Contrast (computed and token values)

| Pair | Ratio |
|---|---|
| Tooltip `#f8fafc` on `#11161d` | 17.4:1 |
| HUD text `#1f291a` on `#faf6ec` | 14.0:1 |
| Accent `#3d6b2c` on HUD | 5.8:1 |
| Bubble speaker `#ffd166` on `#11161d` (unused here) | 12.6:1 |
| Ring buttercup `#f2c230` vs dry ground `#a89055` | **1.85:1** |
| Ring buttercup vs wet ground `#3e6b2e` | 3.7:1 |

Rings are non-text graphics, so the WCAG 1.4.11 target is 3:1. On the dry zone the ring sits at 1.85:1, and it reads faintly in `v2-low-overview.png`. **minor**: add a dark outline ring or raise the emissive.

## Honesty

| Check | Result |
|---|---|
| Real dressing plants credited | All 6 Poly Haven models are in `ATTRIBUTION.md` (rows 14–19) and in the built `attribution.json`. Each is marked "background only, never counted". The HDRI (Belfast Open Field) is credited too. |
| Fonts credited | Fraunces, Nunito Sans and Caveat appear in `ATTRIBUTION.md` (rows 20–22) and `attribution.json`, all under SIL OFL 1.1. |
| Dressing never presented as counted | Passes. It is not in the guide, quiz, counting form, data sheet or estimators, and lies outside the field (see the visual report). |
| Bias and estimators unchanged | `npx vitest run`: **102/102 pass**. That covers the convenience bias test (> +25 %), random/systematic/stratified convergence (< 12 %), and the stratified variance check. v2 touched no estimator or population code. The +369 % / +365 % wording in `README.md:34` and `STATUS.md` is unchanged. |
| Poster alt | "Grass-level view across a meadow at dawn: two white 2 m quadrat frames among yellow-flowered plants and blue sedges, a stream winding behind them, a hedgerow and green hills on the horizon." The content is accurate. **"at dawn" overstates it**: the frame is a flat overcast day. **minor**: say "early morning", or fix the grade first (visual V2). |
| **Fictional-species label in-app** | **major (§8 "honesty labels intact"; pre-existing, not a v2 regression).** The statement "These five species are constructed for teaching purposes… fictional…" lives in `content/species.json` `meta.statement` and ships in the bundle, but **no code renders it**. A regex for fictional, teaching, invented or "not a real" found nothing in the visible text of m1, m2 (guide and quiz), the field guide dialog, text-mode m2 or the menu. The source before v2 (`7775791~1`) had no consumer either. `STATUS.md` "labeled in-app and in docs" is therefore only half true. Fix: render `meta.statement` as a note at the top of the m2 field guide, in the guide dialog and in text-mode m2. |

## Other a11y notes

| # | Sev | Finding |
|---|---|---|
| A1 | major | In-world viewpoint rings have no keyboard or POI equivalent (same as interaction I2). |
| A2 | minor | The tooltip is `aria-hidden`. That is fine because it only mirrors canvas hover, but it means the stack and guide are mouse-only discoveries. |
| A3 | ok | Plain font switches `h1` and `body` to `system-ui`, and `aria-pressed` toggles. |
| A4 | ok | Reduced motion freezes the scene completely (frames byte-identical; see the motion report). |
| A5 | carry-over | v1 a11y findings 1, 4–11 are still open (STATUS "Known limitations"). |

## Top fixes

1. Render `content/species.json` `meta.statement` in the guide and text-mode m2 (`src/ui/field-guide.js`, and the text-mode m2 renderer).
2. Add a DOM POI list ("Go to: Overview / Stream / Wet zone / Dry zone") that calls `interaction.glideTo`.
3. Outline the hotspot rings for ≥ 3:1 on the dry ground.
