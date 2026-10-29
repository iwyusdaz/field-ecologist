# Art Bible — Field Ecologist v2.0.0 ("Ashcombe Meadow at dawn")

## 1. Mood

A dew-wet summer morning on a fictional upland meadow: low gold sun, mist lifting off the stream, grass moving in rolling gusts, insects waking along the margins. The meadow is a place you stand in, not a picture you look at. The learning cues (the five counted species, the quadrat frames, the moisture gradient) stay the sharpest and most readable things on screen; everything alive around them is softer, slower and placed outside the sampling area.

## 2. Palette and grade

| Role | Hex | Usage |
|---|---|---|
| Dew green | `#6E9B4E` | Grass tint, HUD accent family (`--v2-accent #3D6B2C` is its AA-safe darker step) |
| Buttercup | `#F2C230` | Active quadrat frame, hotspot rings, hover highlight |
| Dawn gold | `#F6A65A` | Sun colour, sky horizon, light warmth |
| Mist blue | `#B8CCD6` | Morning mist, distant hills, stream highlights |
| Loam | `#4A3628` | Banks, soil, dry-stone wall mortar shadow, gate timber |

Grade (`applyCaseGrade('field-ecologist')`): AgX tone mapping, exposure 1.15, warm soft contrast, lifted shadows. The real Poly Haven HDRI (Belfast Open Field, CC0) still drives image-based lighting and the distant sky; a gradient sky dome is not added (the HDRI is the sky beyond ~30 m). Height/distance fog `#D8CCB8` sits behind the field so the hills fade into the dawn haze.

HUD surface: warm paper `rgba(250, 246, 236, 0.92)` with text `#1F291A` (≥ 12:1).

## 3. Typography (`src/styles/case-fonts.css`, SIL OFL 1.1, self-hosted WOFF2)

| Role | Variable | Face | Use |
|---|---|---|---|
| Display | `--font-display` | Fraunces 600/700 | App title, module headings |
| Body | `--font-body` | Nunito Sans 400/600/700 | All instructions, forms, the counting dock, buttons |
| Accent | `--font-accent` | Caveat 600 | In-world field-notebook handwriting only: hover tooltips on the quadrat stack and field guide, notebook labels |

Readability rule: instructions and numbers are always Nunito Sans. **Plain font** (header button) switches all three roles to system sans.

## 4. Models (Poly Haven, CC0 1.0; `public/assets/models/manifest.json`)

| ID | Author | Placement |
|---|---|---|
| `wild_rooibos_bush` | James Ray Cock, Jenelle van Heerden | Hedgerow beyond the north boundary (z > 100) |
| `dead_tree_trunk` | Rob Tuytel | Fallen log beyond the east boundary |
| `rock_07` | Jenelle van Heerden | Boulders at the corners and east edge, outside the field |
| `fern_02` | Rob Tuytel, Rico Cilliers | Stream banks where the stream leaves the field (z < 0 and z > 100) |
| `flower_gazania` | James Ray Cock, Jenelle van Heerden | Margin clusters along the south and east edges, outside the field |
| `celandine_01` | Rob Tuytel, Rico Cilliers | Margin clusters along the south and west edges, outside the field |

All static dressing is merged per material (`mergeStaticGroup`) to stay inside the 300 draw-call budget.

Procedural (own work): dry-stone wall + five-bar gate along the west boundary, distant hills ring, flowing stream ribbon with scrolling-normal water material, wing-flap butterflies, the field-ecologist character.

## 5. The fictional-species honesty rule

The five counted species (Meadow Butterweed, Common Daisy-leaf, Blue Sedge, Tussock Bunchgrass, Fen Orchid) are **fictional** and are our own procedural models. They are the **only** plants that are counted, drawn inside quadrats, or listed in the field guide.

Real Poly Haven plants are **background dressing only**:
- placed strictly outside the 100 m × 100 m sampling area (`0 ≤ x, z ≤ 100`), so no random, systematic or stratified draw and no hand-placed quadrat can contain one;
- never registered with the population model, the data sheet, the estimator or the re-sampler;
- chosen and sized so none can be confused with a counted species (gazania and celandine are low flowers in clusters at the hedge foot; fern and rooibos are shrubs; no real plant uses the counted species' silhouettes).

A unit test asserts every dressing position lies outside the field.

## 6. Ambient life (`src/v2/ambient-life.js`, calm mode in the counting view)

1. Wind gusts: the existing grass wind shader, modulated by slow gust waves rolling across the field.
2. Butterflies: 5 wing-flap butterflies on looping splines over the margins (not over quadrats).
3. Pollen: drifting pollen particles in the low sun.
4. Morning mist: low fog that slowly thins as the session runs.
5. Cloud shadows: soft dark patches drifting across the field.
6. Stream: scrolling water normals.
7. Character: the field ecologist breathes, blinks, shifts weight, alternates idle and writing poses; gaze follows the camera.

Calm mode (counting view): motion slows to ~30 %, particles dim; nothing freezes. Wind in the counting view stays at the v1 legibility level (12 %). Reduced motion stops all non-essential motion.

## 7. In-world interaction (`src/v2/in-world-interaction.js`)

- Glowing buttercup floor rings at the overview, the stream, the wet zone and the dry zone; clicking one glides the camera there.
- WASD/arrows walk, drag looks (the orbit controller remains for keyboard/button steps).
- Hover highlight + Caveat tooltip on the quadrat stack and the field guide at the station.
- Clicking the quadrat stack starts placement (same action as the panel button); clicking the field guide opens the guide.
- Every in-world action keeps its panel and text-mode equivalent.
