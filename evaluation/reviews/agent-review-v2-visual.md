# Agent review — v2.0.0 visual (Field Ecologist, "Ashcombe Meadow at dawn")

Agent review (AI reviewer, not a human or learner). Build `7441b25` with `VITE_TEST_HOOKS=1`, preview at 1280×720. **Rendering caveat:** headless Chromium with SwiftShader (software WebGL). Colour, shadow softness, texture filtering and the dark hedge may look different on a GPU. Low has no real-time shadows by design. Judge fidelity from these frames with that in mind. Screenshots: `evaluation/reviews/screenshots/v2-{low,medium}-*.png`.

## Verdict

The meadow now has a real surround: a stone wall with an open gate, a ring of hills, a stream ribbon, a hedgerow line and boulders, all placed by code outside the field. The honesty rule holds for the Poly Haven plants. The new stream ribbon breaks it in a different way, though: it covers counted plants inside the field. The scene still reads as an overcast mid-morning, not dawn, and the field itself is still sparse plants on bare speckled soil.

## Findings

| # | Sev | Finding | Evidence |
|---|---|---|---|
| V1 | **critical** | **The stream water ribbon sits over 463 counted plants inside the field**: 72 Butterweed, 59 Daisy-leaf, 166 Sedge, 163 Bunchgrass and 3 of the 34 Fen Orchids. The ribbon is 1.9 m wide, 80 % opaque, `depthWrite:false`, `renderOrder 2`, and sits up to 8.7 cm above plant bases. Daisy-leaf rosettes (`ROSETTE_Y` 1.6 cm) and Fen Orchid basal leaves are fully under the tinted film, which undoes v1 fix R1 ("field marks above ground") along the whole wet strip. In the counting view, stratified quadrat 4 (x 9.1, z 73.8) is half covered by blue-grey water, and the ripple normals keep scrolling at 30 % across the counted plants. In the free view, counted plants appear to grow in the water. | `src/scenes/meadow-dressing.js:246-282` (ribbon width `w = 0.95`, y = max bank + 0.035, opacity 0.8); `meadow-life.js:119-124` (scroll not hidden in counting). Node trace over `buildPopulation()`. `v2-medium-count-q4-stream-full.png`, `v2-low-stream.png` |
| V2 | major | **Dawn does not read.** The HDRI sky is flat overcast grey. The sun is neutral `#fff2df` at 60 m elevation, which casts no low gold light. The haze `#c6d0cc` is grey-blue. Exposure is 1.15 with AgX. There is no LUT (no `.cube` in the repo; plan §2.1). The art bible's own grade line ("warm soft contrast, low gold sun") is not achieved. Every frame reads as a cool overcast late morning. | `meadow.js:76,131`; `v2-*-overview.png`, `v2-*-field-edge-south.png`, `poster-2.0.0.jpg` |
| V3 | major | **No meadow grass.** Plan §4.3 asks for dense wind-driven grass plus instanced blades. The field is still the five counted species on a speckled vertex-colour ground, and the surrounding apron is bare green. Combined with V2, this is the largest gap from "living, detailed place". Filler grass can go on the apron, and inside the field only as very short, low-contrast turf below the field-mark heights, so cue salience is kept. | `meadow-dressing.js:112-142`; all v2 frames |
| V4 | major | **The quadrat stack floats.** The three 2 m frames lie flat at y 0.92–0.99 around the station table, ringing it in mid-air. The comment says "leaning against the table". This hero interactive prop is not grounded (§8 grounding item). | `meadow.js:196-216`; `v2-*-station.png` |
| V5 | minor | **Hard seam at the field edge.** The apron is dropped 0.45 m and tinted lush outside the field. From the overview, the field looks like a tan mat laid on green grass, with a straight edge. | `meadow-dressing.js:122-125`; `v2-low-overview.png`, `v2-medium-field-edge-south.png` |
| V6 | minor | **Hill silhouettes are stair-stepped.** The ring has 120 segments and 6 radial steps, so the horizon edge is visibly faceted. The blurred HDRI tree line also shows above and behind the hills, which reads as two horizons. | `meadow-dressing.js:145-164`; `v2-low-wall-gate.png` |
| V7 | minor | **The hedgerow renders near-black** (wild_rooibos after per-material merge) and reads as dark blobs. This may be a SwiftShader artefact, so it needs a GPU check. A South African rooibos and gazania also make an odd "English upland" hedge. Visually acceptable, ecologically off. | `v2-low-hedge-north.png`, `v2-medium-station.png` |
| V8 | minor | **The margin flowers are invisible** at every captured viewpoint (gazania and celandine at 0.2–0.3 m, at the wall foot). | — |
| V9 | minor | **Doc mismatch.** The art bible §4 puts the wall on the "west boundary". The code builds it on the south (z = −11). There are 32 dressing placements, not 30. | `meadow-dressing.js:20,27-47` |

## Honesty rule (Poly Haven plants)

- **Code: passes.** All 32 placements have `outsideField(x, z, 4.5) === true`; the nearest is fern at (5.5, −6), 6 m outside. Quadrat centres are clamped to [1, 99] (`designs.js:23`), so no frame reaches past 0 or 100. Dressing is never registered with the population, data sheet, estimator or guide (the guide is built from `content/species.json` only). The unit test `meadow-v2.test.js` passes.
- **Screenshot: passes.** No Poly Haven plant appears in any counting view, in any quadrat, or inside the field in the overview, edge or stream frames.
- **Confusability: low.** Celandine and gazania are low yellow and orange flowers. Butterweed is a 40–55 cm yellow drumstick on a leafy stem. None share a counted silhouette, and all are ≥ 4.5 m outside.
- **The stream ribbon (V1) is the honesty-adjacent defect.** It is not a real plant, but it degrades the counted species' field marks inside quadrats.

## Typography (computed styles)

`h1` and `h2` compute to `Fraunces, Georgia, serif`. Body, buttons and the tooltip compute to `"Nunito Sans", system-ui`. Plain font switches `h1` and `body` to `system-ui` with `aria-pressed="true"`.

**Caveat is never used.** `document.fonts` shows Fraunces 600/700 and Nunito Sans 400/700 loaded, and no Caveat. `hud-shell.css:66-80` sets the tooltip to the body face, which is correct under the readability rule, but nothing else in the world uses the accent face. The station sign board is blank. Art bible §3 still claims Caveat tooltips. **minor**: put Caveat on the sign board and the clipboard, and fix the art bible line.

## Cue salience in the counting view (Low and Medium)

Frames: `v2-low-count-q7-*`, `v2-low-count-q3-*`, `v2-medium-count-q4-stream-full`.

**Away from the stream, all four sampled species stay identifiable on Low:**
- Butterweed: yellow head plus paired leaves.
- Daisy-leaf: pale rosette with white buttons.
- Sedge: long arching blue-grey blades with brown spikes.
- Bunchgrass: small olive tuft with cream dots.

The R2 shape cue for Sedge vs Bunchgrass holds: big blue fountain vs small stiff tuft. Rings, butterflies, pollen, mist and the character are hidden, and cloud shadow fades to 0. **Fen Orchid was not in any captured quadrat and is not verified.**

**On the stream strip, salience fails (V1).** Low frustum and sizes match Medium; only density and shadows differ.

## Poster

`public/poster-2.0.0.jpg` (1200×630) is a real scene render: quadrat frames, Butterweed, Sedge, stream, hedge and hills. It is not blank. It shows the same overcast, bare-soil look (V2, V3).

## Top fixes

1. V1: add `meadow.env.water` to `hideInCounting` (`meadow-life.js` ~line 124), and drop the ribbon to bed level / narrow it (`meadow-dressing.js:248,260`) so no counted plant base is under it. Better still, clear plants from a 1 m channel in the population model *only if* the true totals and tests are re-baselined. The safest option is hide plus lower.
2. V2: lower the sun to about 12–18° with dawn gold (`meadow.js:131-132`), warm the haze towards `#F6A65A`/`#B8CCD6`, and add the case `.cube` LUT, or use a warmer dawn HDRI.
3. V4: lean the frames against a table leg on the ground, or stack them flat on the ground beside the table.
4. V3: add apron grass (instanced cards) plus short in-field turf under 6 cm.
