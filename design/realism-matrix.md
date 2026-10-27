# Realism matrix

Principle: *realism where it helps learning, restraint where it doesn't*
(standards 3.1). High realism only where noticing the detail is part of the
learning; simplify anything that competes for attention during a task.

| Scene element | Realism level | Learning cue? | Rationale | Evidence |
|---|---|---|---|---|
| Species models (leaf shape, flower form, height) | High (procedural, marks exaggerated where noted below) | **Yes** | Identification depends on field marks; exaggeration keeps marks readable from the top-down counting view on the Low preset. Flat basal leaves (Daisy-leaf rosette, Orchid's two leaves) sit above the ground (no instance sink); Sedge vs Bunchgrass differ from above by footprint (~70 cm open star vs ~22 cm dense disc), blade width (26 mm vs 7 mm) and seed heads (dark brown spikes vs pale straw heads), not only colour | Plan §6.1; legibility check in plan §10; agent review (visual 1, 4, 5); `tests/unit/species-models.test.js` |
| Distribution patterns (clumping, gradient, rarity) | High (from a documented stochastic model) | **Yes** | Natural clumping and gradients are exactly what make sampling design matter; a schematic dot grid would remove the difficulty the lesson is about | Plan §1 |
| Terrain + moisture gradient (lusher low ground, dry rise) | Medium–High (procedural) | **Yes (partly)** | The gradient is a design input (stratification) and is visible on the map; terrain detail beyond that is cosmetic and kept low | Plan §6.1 |
| Grass and ground cover | Medium | Partly | Obstruction makes counting authentic; inside the active quadrat nothing is thinned or shrunk (counted plants, including the cover species, render at true size so visible cover = true cover) | Plan §6.1; agent review (realism 4) |
| Wind animation | Low during counting; gentle otherwise | **No** | Movement makes counting harder for no learning gain → wind amplitude is reduced to ~12% inside the quadrat view; documented rationale (no decorative motion during tasks) | Standards 3.1; Advances in Physiol. Educ. finding on decorative animation |
| Lighting / time of day | Medium (dawn in cinematic S1 → neutral overcast daylight for fieldwork) | No | Dawn motivates; neutral overcast light (Belfast Open Field HDRI) gives even, non-dramatic illumination for the task | Plan §6.1 |
| Fog, insects, birds | None during tasks | No | Seductive details; mist exists only inside cinematic S1 and is removed after | 2025 seductive-details meta-analysis (plan references) |
| Post-processing | Restrained (SMAA; AO on High+; no bloom; DOF never) | No | Nothing in a daylight meadow physically motivates bloom; no decorative motion or glow during tasks | Standards 4.3 |
| Audio | Optional mutable ambience only | No | Ambient bed only; no narration audio (captions are text); no distracting cues | Plan §6.1 |
| Species naming | Fictional-but-plausible, labeled | — | Honesty rule: "teaching model, not a real regional flora" stated in the field guide and docs | Brief honesty rule |

## What is deliberately NOT realistic
- The flora is fictional (constructed for teaching purposes), stated in-app.
- Species marks are exaggerated for legibility in the counting view. Enlargements
  beyond the real dimensions on the species cards:
  - Fen Orchid basal leaves 7 cm long (card: 3–5 cm, ~1.6×) and pale glossy green;
    flowers 12 mm across (card: < 5 mm, ~2.5×), cream.
  - Blue Sedge blades 26 mm wide (card: 2–4 mm, ~7×); Bunchgrass blades 7 mm
    (card: < 2 mm, ~3.5×). The *ratio* (sedge clearly wider) is what is taught.
  - Sedge seed spikes 2.2 cm dark capsules (card: "tiny brown spike").
  - Daisy-leaf rosette leaves 7.5 cm (card-consistent) on an 8 mm-thick leaf so
    it reads from above.
- The earlier in-quadrat shrink of Bunchgrass and Daisy-leaf was removed (it
  biased the visible cover and changed a counted species' size mark).
- The convenience design's "wherever looks interesting" is a *modeled* human
  behaviour (near-cluster preference), documented in `research/sampling-methods-notes.md`.

## What IS real (verified sources)
- The quadrat method workflow and the definitions of the four sampling designs
  (OpenStax Biology 2e §45.1; OpenStax Introductory Statistics 2e §1.2 —
  `research/sources.md` #2, #3).
- The Thomas cluster process used for clumping (spatstat documentation —
  `research/sources.md` #4).
- NGSS HS-LS2-2 wording (`research/sources.md` #1).
- Sky lighting: Poly Haven "Belfast Open Field" CC0 HDRI (`research/sources.md` #7).
