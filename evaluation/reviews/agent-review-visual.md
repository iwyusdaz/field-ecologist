# Agent review: visual quality and Low-preset ID legibility

Agent review. Reviewer: an AI agent. It is not a human expert and it is not real-learner data. Date: 2026-10-27.
Build: `VITE_TEST_HOOKS=1 npm run build -- --outDir tmp/review-build`, served with `vite preview` on port 4193.
Browser: headless Chromium with SwiftShader (software GL). Viewport: 1440×900 or 1280×800, DPR 1 or 2.
Presets were set with `window.__TEST__.engine.quality.set()`. That is the same `QualityManager.set` the Settings dialog calls (`src/ui/settings.js:113-114`).
Screenshots: `evaluation/reviews/screenshots/`.

Method limits: software rendering can't show GPU-specific artefacts such as shadow acne or AO noise, and it can't measure frame rate. The camera walk to a quadrat didn't finish within 2.5 s under SwiftShader, so the scripts called `scene.enterQuadratView(i)` directly after `fieldworkUI.openQuadrat(i)`. That is the same callback `walkTo` fires (`src/ui/fieldwork.js:400-409`).

## The pending Low vs Medium legibility check (plan §10, STATUS.md limitation 2)

**Question:** can each species be identified inside a counted quadrat on Low, compared with Medium?

**Short answer:** Low and Medium look the same inside the counting view, and no counted plant is thinned on either. The code's promise holds. But on *every* preset, two of the five species can't be identified from their stated field marks in the counting view, and two more can only be told apart by colour. The legibility problem doesn't come from the presets. It comes from the counting view and the models.

Evidence, same quadrats on both presets:

| Quadrat | Medium | Low | True counts (`session.trueCounts`) | Rendered near-LOD instances inside the 2 m frame (all 4 presets) |
|---|---|---|---|---|
| Random design Q2 (wet zone) | `q2-medium-canvas.png` | `q2-low-canvas.png` | butterweed 2, daisyleaf 2, sedge 3, bunchgrass 6 | identical: 2 / 2 / 3 / 6 |
| Random design Q7 (wet zone) | `q7-medium-canvas.png` | `q7-low-canvas.png` | butterweed 5, sedge 2, bunchgrass 1 | identical: 5 / 2 / 1 |
| Placed on an orchid colony (13.0, 44.3) | `conv-q1-medium-quadrat-zoom.png` | `conv-q1-low-quadrat-zoom.png` | daisyleaf 1, sedge 4, bunchgrass 4, **fen-orchid 2** | identical |
| Placed in a Butterweed clump (7.1, 33.8) | `conv-q2-medium-quadrat-zoom.png` | `conv-q2-low-quadrat-zoom.png` | butterweed 14, daisyleaf 2, sedge 2, bunchgrass 5 | identical |
| Orchid / Daisy-leaf close crops | `legibility-medium-orchid-1.png`, `legibility-medium-daisyleaf-3.png` | `legibility-low-daisyleaf-3.png` | — | — |

High and Ultra versions are in the same folder (`q2-high-canvas.png`, `q2-ultra-canvas.png`, and so on). They look the same because the orthographic counting view skips the post pipeline (`src/core/engine.js:93-94`, `src/scenes/meadow.js:353`). Only `resolutionScale` (0.75 on Low) changes. That softens edges slightly but removes no marks.

Per-species verdict in the counting view (same on Low and Medium):

- **Meadow Butterweed: identifiable.** You see a yellow head and lance leaves from above. A dense clump (conv-q2) still separates into countable heads.
- **Blue Sedge vs Tussock Bunchgrass: separable only by colour and spread.** From directly above, both are radial "stars" of blades. The field marks that tell them apart are side-view properties: "arching fountain" vs "stiff upright", and the triangular stem. A top-down projection hides them. Bluish vs straw colour and the larger sedge spread are the only cues left. That breaks the guide's rule that shape and size come before colour (`content/species.json:69,93`).
- **Common Daisy-leaf: not identifiable by its primary mark.** The flat rosette doesn't render. Only the two white flower discs (about 3 px) show (`legibility-*-daisyleaf-3.png`).
- **Fen Orchid: effectively invisible.** At the colony with two true orchids, the Medium crop shows one sub-pixel pale speck and the Low crop shows nothing usable. The "exactly two flat oval basal leaves" mark (`content/species.json:115`) isn't drawn.

## Findings

1. **Critical. Rosette and orchid basal leaves render below the ground, so the key field marks for 2 of 5 species are invisible on every preset.**
   - Instances are placed at `terrainHeight(x,z) - 0.02` (`src/systems/vegetation-renderer.js:62`).
   - The flat leaves sit at local y = 0.004 with a thickness of 0.004 (`src/systems/species-models.js:87, 132-133`), which puts them about 1.6 cm below the surface.
   - Evidence: `conv-q1-*-quadrat-zoom.png` and `legibility-*-daisyleaf-3.png`. In the ground-level views (`ground-medium.png`, `ground-low.png`), Daisy-leaf shows only as white flowers on bare stalks.
   - Fix: lift flat basal parts to y ≥ 0.025 local, or remove the −0.02 sink for rosette species. Then re-shoot the legibility table.

2. **Critical. In the counting view, the HTML counting form covers the quadrat being counted.**
   - At 1280×800 the 2 m frame spans about x 290–990, y 260–645. The fieldwork panel (94 % opaque surface, `src/styles/site.css:182-187`) spans about x 128–1150, y 122–790. See `q7-low-with-ui.png` and `q2-medium-with-ui.png`: the frame shows faintly behind the inputs.
   - The panel has no collapse or "hide panel" control (no match in `src/`).
   - Fix: dock the counting form to one side, for example a right column ≤ 30 % wide, and shift the ortho camera so the quadrat sits in the free area. Or add a "Show quadrat" toggle that hides the panel.

3. **Major. The counting view's ortho frustum ignores aspect ratio, so the 2 m × 2 m quadrat renders as a 700 × 385 px rectangle and every plant is stretched horizontally.**
   - `left/right/top/bottom = ±1.9` (`src/scenes/meadow.js:349-350`) on a 1280×696 canvas. The rectangular frame is visible in `q2-medium-canvas.png`.
   - Size is the stated second field mark, so this distorts an ID cue.
   - Fix: `c.left = -half*aspect; c.right = half*aspect`, and update on resize.

4. **Major. In the counting view, the orchid's flowers and stem are below pixel size on every preset.**
   - Flower spheres have a 3.8 mm radius and the stem a 3.5 mm radius (`species-models.js:129,137`). At about 183 px/m (DPR 1, Medium) that is under 1 px, and Low's 0.75 scale makes it smaller still.
   - The rare species is the one sampling is meant to "miss". At present it is missed by rendering, not by design.
   - Fix: exaggerate the orchid's top-down silhouette (the leaves, once fixed per finding 1), or add a "lens" zoom (half = 0.6 m) on a sub-cell.

5. **Major. The top-down view removes the sedge/bunchgrass shape marks.** See the per-species verdict above. Fix: add an oblique "side look" (about 35°) toggle in the counting view, or show a small side-view inset for the selected plant.

6. **Major. The visible Bunchgrass cover doesn't match the "true" cover the reveal scores against.**
   - True cover is 53.1 % (`population.trueCover`). It comes from a 0.55 m footprint radius (`src/systems/population-model.js:101`).
   - The model and the guide say tussocks are 15–25 cm across (`content/species.json:91`). In every counting view, the grass covers well under 5 % of the frame.
   - A learner who reads the frame correctly will pick "< 5 %" and be scored as about −95 % wrong. See also the expert review.
   - Fix: set the cover radius to about 0.1 m (true cover about 2.5 %), or make the rendered tussocks match a 0.55 m footprint.

7. **Major. The module panel hides the S1 dawn cinematic.** The Module 1 panel stays on screen while S1 plays. The camera glide, mist and Butterweed patch show only in the side margins (`04-s1-cinematic-playing.png`; overlay z-index 20, `site.css:109-110`). Fix: hide or fade `#overlay-host` panels while `player.playing`.

8. **Minor. A duplicate breadcrumb strip overlaps the top edge of the module panel.** The "1 · The question" / "3 · Fieldwork" strip at y ≈ 95–135 overlaps the panel heading (`02-m1-landing.png`, `q7-low-with-ui.png`). Fix: give it its own row or drop it, since the tabs already show the current module.

9. **Minor. Landing at Module 1 shows the "dry" tan terrain dominating the frame.** The wet stream side reads teal-grey rather than "lusher" green (`02-m1-landing.png`). The gradient is a design input (realism matrix row 3). Fix: raise saturation on the lush end (`meadow.js` terrain `lush` colour 0x3e6b2e).

10. **Minor. The HDRI background is visibly blurred and low-resolution at ground level** (`ground-medium.png`). It is decorative, so it's acceptable. Consider a slight fog band at the horizon.

11. **Minor. The yellow active-quadrat frame (#ffd166) is low-contrast against the dry-zone ground**, though it is fine on green (`q2-*-canvas.png`). Fix: add a dark 1 px outline.

12. **Minor. Console warnings: `PCFSoftShadowMap has been removed`, plus deprecated `THREE.Clock` and `RGBELoader`.** `src/core/engine.js:28` asks for PCFSoft and silently gets PCF. Fix: request `PCFShadowMap` explicitly.

What passed: no z-fighting on quadrat frames, no broken textures, no missing assets, and zero page errors across all runs. Butterweed reads well at every distance. The Low preset keeps every counted instance, as STATUS.md claims (verified numerically above).
