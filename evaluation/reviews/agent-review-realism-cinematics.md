# Agent review: realism matrix and cinematic budget

Agent review. Reviewer: an AI agent, not a human expert. Date: 2026-10-27.
I checked `design/realism-matrix.md`, `design/shot-list.md` and `content/cinematics.json` against the running build (port 4193, headless) and against `src/cinematics/shot-player.js`, `src/app.js:382-457`, `src/systems/vegetation-renderer.js` and `src/core/quality.js`.

## Cinematic budget checklist

| Rule | Result | Evidence |
|---|---|---|
| Total ≤ 90 s | Pass: 55 s (12 + 8 + 14 + 6 + 15) | `content/cinematics.json` durations |
| Every shot ≤ 25 s | Pass: longest is 15 s | same |
| Purpose tag on every shot | Pass | `purpose` on each shot; shown in-app as "Shot 2 of 2 — purpose: motivate" (`screenshots/04-s1-cinematic-playing.png`) |
| Skippable from the first frame | Pass | Skip button rendered when playback starts; Esc listener on `document` (`shot-player.js:52-61`) |
| Captions | Pass, with defects (findings 1, 6) | `shot-player.js:84` |
| Reduced-motion version | Pass | Still frame at the path end, held for `max(2.5 s, 0.7 × duration)` (`shot-player.js:87-90`). Verified: with `reducedMotion: 'reduce'`, `motion.reduced === true` and S1 shows a still with captions (`screenshots/07-reduced-motion-s1-still.png`) |
| Never during assessment | **Fail** (finding 2) | `reveal.js:233-234`, `app.js:458-460` |

## Findings

1. **Major. The S2a caption shows a literal "N".** `content/cinematics.json:61` reads "This is every one of the N Butterweed plants…". Nothing in `shot-player.js` or `app.js` replaces N. `shot-player.js:84` joins the raw captions. The reveal's key number (1,783 plants for seed 777) appears as "N". Fix: substitute `population.trueTotals.butterweed` before `load(def)`, for example with a `{trueTotal}` token.

2. **Major. S3 plays while the assessment items are on screen.**
   - On the first simulator run, `_renderChartItems()` adds the three graded interpretation items (`reveal.js:234`). In the same tick, `onSimulatorRun` starts S3 (`app.js:459`).
   - The S3 caption and overlay therefore play over live MC items. That breaks the shot-list rule "Cinematics never play during an assessment".
   - Fix: play S3 first, and render the chart items in `_afterCinematic('s3-many-samples')`.

3. **Major. S3 claims `"sync": "resampler-progress"`, but it isn't synced.**
   - S3 starts only after `resampler.run` has resolved. The histogram is already drawn (`reveal.js:226-233`).
   - The ghost rain runs on a fixed interval of 24 sets (`app.js:438-445`). The caption "The pile they build is the sampling distribution" describes a build-up the learner never sees.
   - Fix: start S3 before `run()` and drive both the rain and an incremental histogram from the progress callback. Otherwise, drop the sync claim and reword the caption.

4. **Major. Inside the active quadrat, the "counting affordance" shrinks a counted species.**
   - `setQuadratFocus` scales `bunchgrass` *and* `daisyleaf` down by up to 45 % (`vegetation-renderer.js:131-133, 203-209`).
   - The realism matrix describes only "background-grass" being reduced (`realism-matrix.md:12, 23-24`). Daisy-leaf is a counted species, and size is its second field mark ("8–15 cm"). Bunchgrass is the cover species, so shrinking it biases the cover estimate down.
   - Fix: remove `daisyleaf` from the focus set, and don't shrink the cover species. If you keep the shrink, document it and allow for it in the true cover.

5. **Major. A high-realism element fails its own learning cue.** The matrix row "Species models: High, marks exaggerated for legibility on Low" (`realism-matrix.md:9`) isn't met for Fen Orchid and Daisy-leaf. Their basal leaves render below the ground, and the orchid's flowers are sub-pixel in the counting view (see `agent-review-visual.md`, findings 1 and 4). The row's evidence column cites the plan §10 legibility check, which hasn't passed. Fix the models, then update the row.

6. **Minor. The "Captions on" setting does nothing.** `settings.state.captions` is saved (`settings.js:118`) but nothing else reads it (no other match in `src/`). Captions are always shown, which is safe, but the control misleads. Fix: wire it to `.cinematic-caption` visibility, or remove it.

7. **Minor. The audio description is hidden and isn't announced.** `.cinematic-audio-description` is `visually-hidden` with no live region (`shot-player.js:48-49`). Only the caption is `aria-live="polite"`. Screen-reader users get the captions but not the description of what the camera shows, which is the reason audio descriptions exist. Fix: append the description to the polite announcement, or make it a live region.

8. **Minor. The realism-matrix "Audio" row describes something that doesn't exist.** The row says "Optional mutable ambience" (`realism-matrix.md:17`). No audio is loaded anywhere (no `Audio`/`AudioContext` in `src/`), yet Settings shows master, voice and ambient sliders. Fix: change the row to "None", and hide the sliders or mark them "no audio in this module".

9. **Minor. The documented post-processing doesn't match the preset config.** The matrix and `post.js:3` say "no bloom", but `quality.js:26, 37, 48` list `'bloom-light'` for Medium and above. It's harmless because `createPost` ignores it, but it confuses anyone auditing the claim. Fix: remove `bloom-light` from the presets.

10. **Minor. The S2 description promises "small yellow marker[s]"** (`cinematics.json:64`). The code tints the existing plant materials emissive (`vegetation-renderer.js:137-148`). From the 150 m overhead hold, plants about 2 cm across can't resolve as distinct markers. Not screenshotted, so this is inferred from code and geometry. Fix: draw real instanced marker discs, about 0.5 m, for the reveal.

11. **Minor. The S1 visuals are mostly hidden** behind the Module 1 panel (`screenshots/04-s1-cinematic-playing.png`). The "orient" purpose suffers. Fix: hide the module panels while `player.playing`.

## Decorative-element audit

- HDRI sky (Medium–High realism, no learning cue): it is decorative but cheap and justified as "even illumination". Acceptable.
- Dawn mist (S1 only): it motivates and is removed for the task. Acceptable.
- Wind (1.0 ambient, 0.12 counting, 0 under reduced motion; `meadow.js:412-416`): matches the matrix.
- Terrain colour gradient: a real cue, but weak (see visual review, finding 9).
- Nothing high-realism was found that is purely decorative. The problem runs the other way: one high-realism cue (the species field marks) is under-delivered.
