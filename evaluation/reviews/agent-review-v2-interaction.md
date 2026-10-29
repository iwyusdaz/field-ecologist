# Agent review — v2.0.0 interaction (Field Ecologist)

Agent review (AI reviewer). I drove the preview build with Playwright on SwiftShader (low fps, so glide timing runs slower than wall clock). The repo's functional and a11y specs were also run against the review server: **8/8 passed** (full m1→m5 `__TEST__` playthrough, reveal + simulator, text-mode parity pass, CSV, axe).

## What works (verified)

| Item | Result |
|---|---|
| Viewpoint rings glide | 4 rings (`view-overview/stream/wet/dry`). `glideTo` moves the camera on an eased path (x 54.9 → 53.9 at 0.4 s → 28.9 at 1.9 s → ~22 by the next step, target 17). Rings and character are hidden in counting. |
| WASD walk | Holding `W` for 0.8 s moved the camera 4.6 m. The terrain floor clamp works. |
| Drag look | A 120 px drag changed yaw from 0.785 to 2.525 rad. A click under 6 px still counts as a click. |
| Hover highlight and tooltip | The stack highlights in emissive buttercup, the cursor becomes a pointer, and the tooltip reads "Quadrat stack — Click to start placing quadrats" (Nunito Sans, `#f8fafc` on `#11161d`). |
| Stack click → fieldwork | A click from m1 opens m3 at the design picker and focuses the first design button, with a live-region announcement (`v2-medium-stack-click-opens-m3.png`). |
| Counting form dock | Docks right. "Hide form to see the whole quadrat" collapses it to a "Show counting form (quadrat n)" pill, and the ortho frustum re-centres (`v2-low-count-q7-ui/full.png`). |
| Text-mode parity | Spec run passed: convenience placement on the 20×20 grid → quadrat 1 form → save → data sheet → submit → m4/m5. |
| `window.__TEST__` and m1–m5 hooks | Intact. Full playthrough passed: 10 stratified quadrats, submission, simulator, report, transfer, ≥ 30 learning-record events. |

## Findings

| # | Sev | Finding | Evidence |
|---|---|---|---|
| I1 | major | **The field guide prop cannot be hovered or clicked: the quadrat stack's hit proxy swallows it.** The stack's invisible 2 × 0.25 × 2 m box (`meadow.js:213-215`) sits at table height and covers the 0.24 m notebook at (−0.5, 0.9, 0.18). From three camera angles, all 121 pick samples around the guide's screen position returned `quadrat-stack`. Clicking the guide opens fieldwork, and `guide-dialog.open` stays false. The second in-world action from the builder's own list is broken. | `v2-medium-hover-guide-shows-stack.png`, `meadow.js:196-230` |
| I2 | major | **No keyboard or POI equivalent for the in-world navigation.** Rings, stack and guide are canvas-only; no button in the DOM matches stream, wet, dry, overview, stack or guide. Plan §2.3 says "every in-world action has a keyboard and points-of-interest equivalent". The stack and guide have panel equivalents (Module 3 nav, "Open field guide"). The four viewpoints have none, and v1 a11y finding 5 (PoiList never instantiated) is still open. WASD works only once the page has focus and the pointer is not over the HUD. | DOM scan |
| I3 | major | **§4.3 in-world tools are not built.** See the rating below. | — |
| I4 | minor | The hover tooltip only shows on direct canvas pointer events. When the HUD panel covers the station area (default layout in m1), the stack sits under the panel and cannot be reached until "Hide panel". | `v2-medium-station.png` |
| I5 | minor | The "kneel into counting" step is a 1.2 s walk glide at 1.6 m eye height, then a hard cut to the orthographic top-down view. There is no lowering motion. | `ui/fieldwork.js:477-484` |

## §4.3 / §8 "every learning action doable in-world": rating

| Learning action | In-world today | §4.3 target |
|---|---|---|
| Choose design | Panel only (stack opens the picker) | — |
| Place quadrat (convenience) | Panel map / number fields | Carry the frame and drop it on the ground; random draws thrown, animated |
| Walk to quadrat | Panel chip → auto glide | (OK) |
| Enter counting | Auto cut to ortho | Kneel (camera lowers) |
| Count plants | Number inputs in the dock | Tap each plant, hand-tally clicker |
| Check field marks | Field guide dialog (in-world prop broken, I1) | Hand lens over a plant |
| Record and see data sheet | HTML table | Caveat clipboard that fills as you count |

**About 1 of 7 learning actions is reachable in-world** (entering fieldwork via the stack), plus navigation. §8 "every learning action doable in-world" is **unmet (major)**. The builder lists this openly (DECISIONS #19, STATUS).

### The two highest-value additions

1. **Tap-to-count in the counting view.** This is the core learning action of Module 3. Clicking a plant in the ortho view drops a numbered tally mark (Caveat) on it and increments a clicker. That also gives learners a visible "already counted" trace, which reduces the double-count and miss errors the reveal later exposes.
   - **Honesty constraint:** the tap must *not* reveal species. Raycast to the instance, then ask "Which species?" through a five-button picker that writes to the same `draft.counts`. Do not auto-assign from the instance's species id, or ID practice disappears.
   - Keep the number inputs as the keyboard and text equivalent.
2. **Carry and drop the frame for the convenience design.** Hand placement *is* the biased design. Dropping the frame where the meadow "looks interesting" makes the bias felt in-world, and +369 % lands harder.
   - Use a ground raycast inside [1, 99] that feeds `session.placeConvenience(x, z)`. The existing map and number fields stay as equivalents.
   - Random designs keep their own generated points; the animated "throw" is optional polish.

The clipboard and hand lens are lower value: the docked form and the guide already serve those needs.
