# Agent review: Mayer's multimedia principles

Agent review. Reviewer: an AI agent, not an instructional-design expert and not learner data. Date: 2026-10-27.
Evidence: `content/*.json`, `src/ui/*`, `src/cinematics/shot-player.js`, and the screenshots in `evaluation/reviews/screenshots/`.

| Principle | Verdict | Evidence |
|---|---|---|
| Coherence | Mostly met | No insects, birds or fog during tasks (`realism-matrix.md:15`). Wind is cut to 12 % when counting. No bloom or DOF. Unused audio controls add clutter (finding 6) |
| Signaling | Partly met | The active quadrat is yellow, and each design is labelled "probability" or "non-probability". The reveal highlight is a weak material tint, not a marker (finding 4) |
| Redundancy | Met | No narration audio. Captions are text-only, so there's no audio + identical on-screen text duplication |
| Spatial contiguity | **Violated** | The counting form overlays the plants instead of sitting beside them (finding 1). The S2b truth table sits beside the map as intended |
| Temporal contiguity | **Violated** | S3 "builds the pile" after the histogram is already done (finding 2) |
| Segmenting | Met | Five modules, one quadrat at a time, 2–3 captions per shot, and "Shot n of m" progress |
| Pre-training | Partly met | M2 field guide + ID quiz before fieldwork. But the guide uses side-view portraits and the task uses top-down (finding 3) |
| Modality | N/A, defensible | No audio. Text captions are the choice for accessibility (`realism-matrix.md:17`) |
| Learner control | Partly met | Skip and Esc work from the first frame, modules can be entered in any order, and simulator n and design are learner-set. But there's no pause, no panel hide, and reduced-motion stills auto-advance (finding 5) |

## Violations

1. **Major (spatial contiguity).** The field-mark text and inputs sit on top of the image they describe. The learner can't look between a plant and its label (`screenshots/q2-medium-with-ui.png`). Fix: put the form in a side column next to an unobstructed quadrat view.

2. **Major (temporal contiguity).** The S3 narration ("Each flash of a square is one virtual sample. The pile they build is the sampling distribution", `cinematics.json:98-99`) doesn't play in step with the histogram filling (`reveal.js:226-234`, `app.js:459`). Fix: drive the rain and an incremental histogram from the worker progress callback.

3. **Major (pre-training transfer).** The ID quiz trains side views (`guide-portraits.js:56-58`), and fieldwork asks for top-down ID with different visible features. Only 1 of 8 ID items uses a `"quadrat"` view (`items.json:123`). Fix: add a top-down thumbnail per species to the guide, and add more quadrat-view quiz items.

4. **Minor (signaling).** The S2 reveal "glow-marker" (`cinematics.json:65`) is an emissive tint on plants about 2 cm across, seen from 150 m (`vegetation-renderer.js:137-148`). That is likely invisible as a signal (inferred, not screenshotted at full S2). Fix: use instanced marker discs.

5. **Minor (learner control).** No pause exists (`core/engine.js:122` is never called), and reduced-motion stills auto-advance (`shot-player.js:90`). Fix: pause on menu open, and add a Next button for stills.

6. **Minor (coherence).** Settings shows voice and ambient volume sliders for audio that doesn't exist, and a captions toggle that has no effect (`settings.js:86`). Remove them.

7. **Minor (coherence, a positive).** The decision to drop decorative wind, mist and wildlife during counting is well justified and implemented (`meadow.js:412-416`).

8. **Minor (signaling).** The terrain moisture gradient is a design input for stratification, but it reads weakly in the 3D view (`screenshots/02-m1-landing.png`). The 2D map (`fieldwork.js` MeadowMap with zones) carries it well. Fix: strengthen the lush-end colour.
