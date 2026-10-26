# Text-mode design (the 20 × 20 grid-map equivalent)

Parity rule (standards 5.2): text mode covers the SAME objectives (LO1–LO5) and
the SAME assessment decisions as the 3D mode. This document is the spec; the
implementation lives in `src/a11y/textmode-modules.js`.

## Overview representation
- The meadow is a **20 × 20 grid data table** (400 cells, 5 m × 5 m each) with a
  **moisture-zone column** on the left (wet / mid / dry per row band) — the plan
  specifies "a data table with a moisture-zone column".
- Cells render as a table: each cell contains a short code — the dominant
  vegetation hint (e.g. `·` bare-ish, `b` bunchgrass, `y` yellow heads nearby,
  `~` sedge tuft) — plus moisture initial. A legend above the table explains the
  codes. Cells are buttons (keyboard operable) for the convenience design.
- Zone membership is computed from the same moisture field as the 3D mode, so
  stratified sampling selects the same strata.

## Decisions in text mode
1. **Design choice:** radio list (same four designs, same honest descriptions).
2. **Quadrat placement:** for random/systematic/stratified the app selects the
   cells (announced, with coordinates); for convenience the learner picks any
   cells (click or keyboard) — the same freedom and the same bias.
3. **Sampling a cell:** reveals a structured description of the plants inside
   the 2 m × 2 m quadrat at the cell centre, e.g.:
   > "4 upright stems, knee height, each with one rounded drumstick-like head
   > (shape: circle from above; size: 2–3 cm). Leaves: alternate, lance-shaped
   > with pointed tips. → matches Meadow Butterweed's field marks."
   The learner identifies (species select) and enters a count — misreading marks
   causes mis-ID exactly as in 3D. Bunchgrass uses the same cover bands.
4. **Data sheet, CSV export:** identical modules (`data-sheet.js`, `export-csv.js`).
5. **Reveal + simulator:** identical tables/charts (charts always ship with data
   tables), and the same Web Worker re-sampler.
6. **Assessment:** the same items engine (`learning/assess.js`) drives both
   modes; the ID quiz in text mode presents the field-mark text instead of the
   rendered close-up (the marks are shape+size first, so the text is a faithful
   representation, not a lossy transcript).
7. **Learning record:** same verbs and objects, same "My progress" page.

## Parity note
No objective is missing in text mode. The 3D-only affordance (spatial walking /
camera) has no assessment weight: walking time is charged in text mode too
(straight-line distance between quadrat cells × the same rate).
