# Agent review — v2.0.0 motion (Field Ecologist)

Agent review (AI reviewer). Method: code trace of `src/scenes/meadow-life.js`, `src/v2/ambient-life.js`, `meadow.js:_applyWind/_setCountingLife`, plus live state sampled from `window.__TEST__` on the preview build. SwiftShader runs at very low fps, so the life clock advanced only ~0.2 s per 2 s of wall time. Speeds were judged from code; state changes were judged live.

## Ambient systems: 7 registered, all live outside calm

| # | System | Live evidence (free view, Medium) |
|---|---|---|
| 1 | Gust waves (`uGust` → wind shader) | `uGust` 1, `uWind` 1, `uTime` advancing |
| 2 | 5 butterflies on margin splines | `butterfly-0` position changed between samples; wing flap updater |
| 3 | Pollen (260 points) | Particle volume registered and visible |
| 4 | Thinning mist (6 sheets + fog density over ~240 s life time) | Fog density 0.00719 → falls towards base 0.0032 |
| 5 | Cloud shadows (ground shader) | `uCloudT` advancing, `uCloudK` 0.22 |
| 6 | Stream (scrolling ripple normals) | Updater registered |
| 7 | Animated ecologist (breathe, blink, gaze, idle/write every 6 s) | `action` alternated `idle` → `write` |

This passes plan §8's "at least 5 ambient-life systems running". Birds and bees (plan §4.3) are absent, which is acceptable. No 10 s headed "is it alive" capture exists yet, so that is still pending with the orchestrator.

## Calm mode in the counting view

Live state on Low and Medium:

- `calm: true`, with `calmFactor` easing to 0.30 over ~0.35 s.
- `uWind` 0.12, `uGust` 0.
- `uCloudK` fading to 0 (0.141 → 0.046 within ~2 s).
- Butterflies, pollen, mist, character and all 4 rings: `visible:false`.

This matches DECISIONS #17.

**Things still moving inside the counted quadrat:**

| # | Sev | What moves | Assessment |
|---|---|---|---|
| M1 | **critical** (same root cause as visual V1) | **Stream ripple normals keep scrolling at 30 %** across any quadrat on the wet strip. The water mesh is not in `hideInCounting`, and its scroll runs as a custom updater at `effDt` (`meadow-life.js:119-124`). In stratified quadrat 4, about half the frame is a moving, semi-opaque surface over Sedge and Bunchgrass. This is the one element that competes with, and obscures, the counted cues. | `v2-medium-count-q4-stream-full.png` |
| M2 | ok | Counted plants sway at 12 % wind amplitude. | This is the v1 legibility level and is intended (realism-matrix). Not confusing in the frames. |
| M3 | minor | Cloud shadow fades over ~1–2 s after entering, not instantly. A brief darkening blob can slide out during the first second. | `meadow-life.js:155-157` (rate `dt*2`) |
| M4 | minor | Fog density keeps easing while counting. The ortho camera is at 8 m, so the effect is invisible. | — |

Calm mode itself does not slow wind phase (the shader uses `uTime = engine elapsed`). That is fine, because the amplitude is already cut to 12 %.

## Reduced motion

Tested with `reducedMotion: 'reduce'` on Low, in both the free view and the counting view.

- `AmbientLifeManager.update` skips character updates (no breathing, blink or gaze: `ambient-life.js:266-272`), then returns before particles, splines and custom updaters.
- So these are frozen: gust, cloud drift (`uCloudT` stayed 0), mist, stream scroll and wing flap.
- `uWind` is 0. Ring pulse is gated on `reducedMotion` (`in-world-interaction.js:488`). Glides cut instantly.
- **Two Low screenshots of the counting view taken 1 s apart are byte-identical (0 of 498,816 bytes differ).** In the normal-motion counting view, about 500k bytes differed.
- **Passes.** The v2 core patch for character breathing and gaze is in effect.

## Life on Low

| # | Sev | Finding |
|---|---|---|
| M5 | minor | **Not scaled.** Low still builds 260 pollen points, 5 butterflies, 6 mist sheets and the full character, and nothing in `meadow-life.js` reads `presetDef`. This matches the builder's note. Plan §2.5 says "Low preset: life systems at reduced counts". The cost is small: the counting view on Low was 32 draws, and the free view about 135. Fix: scale pollen by `presetDef.vegetationDensity` and drop to 3 butterflies on Low. |

## Top fixes

1. Push `meadow.env.water` into `hideInCounting`, or freeze its normal offset while `counting` (`meadow-life.js:120-124`). Combine this with the visual V1 fix (lower and narrow the ribbon).
2. Snap `cloudK` to 0 on `setCounting(true)` (`meadow-life.js:148-152`).
3. Scale pollen and butterfly counts by preset.
