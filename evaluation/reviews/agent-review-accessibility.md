# Agent review: accessibility (GAG, XAG, WCAG 2.1 AA overlay)

Agent review. Reviewer: an AI agent. It is not an assistive-technology user and it is not a conformance audit; full WCAG validation needs manual AT testing. Date: 2026-10-27.
Method: headless Chromium on port 4193, a keyboard Tab-order trace, `reducedMotion: 'reduce'` context emulation, and a code read of `src/a11y/*`, `src/ui/*` and `src/styles/site.css`. I didn't re-run axe; the repo's own `tests/a11y.spec.js` covers that.

## Spot-check: text-mode parity on 3 objectives

| Objective | 3D path | Text-mode path | Parity? |
|---|---|---|---|
| LO1 Design (choose a design, place points) | Design cards → buttons; convenience placement by map click or x/z inputs (`fieldwork.js:107-131`) | Same cards; grid table placement (`textmode-modules.js`) | Yes |
| LO2 Quadrat method (identify + count) | Learner must see and count plants in the ortho view | `describeQuadrat` states the **exact count** per specimen group, e.g. "3 plants: fountain-like tuft…" (`quadrat-describe.js:83-85`) | **No, it's asymmetric** (finding 1) |
| LO4 Diagnose bias (reveal + simulator) | Reveal table + histograms with data tables (`reveal.js`, `charts.js`) | Same tables, shared session | Yes |

## Findings

1. **Major. The text mode and the 3D view test different skills for LO2, and both are flawed.**
   - Text mode hands over an exact count and the verbatim shape mark (`quadrat-describe.js:73,85`).
   - The 3D counting form prints that same shape mark next to each species name (`fieldwork.js:286-288`).
   - So identifying in text mode is string-matching, and counting needs no effort. In 3D, two species can't be seen at all (visual review, findings 1 and 4).
   - Fix: describe each plant individually in text mode, for example a list of "plant at NW corner: …". Paraphrase the marks so they don't match the form labels word for word, and let the learner do the counting.

2. **Major. The counting form covers the quadrat, and nothing hides it.** For low-vision and magnifier users at 200 % text size, the panel fills the whole viewport, so they can't see the 3D content they are counting (`screenshots/q7-low-with-ui.png`). Fix: add a dockable or collapsible panel (XAG: UI customisation).

3. **Major. There is no pause.** `engine.pause()` exists (`core/engine.js:122`) but nothing calls it, including the Menu dialog. The menu offers "Resume" (`ui/shell.js:45`), but time-based elements keep running underneath: S1 and S3 camera paths, wind, and the reduced-motion still timers. GAG requires the ability to pause. Fix: call `engine.pause()` and `player` pause on menu open, and resume on close.

4. **Major. The cinematic audio description isn't announced** (`shot-player.js:48-49`, visually hidden and not live). Fix: see the realism review, finding 7.

5. **Major. The Points-of-interest list exists but is never used.** `PoiList` is defined (`a11y/focus.js:47`) and nothing instantiates it (no other reference in `src/`). The quadrat chips (`fieldwork.js:192-207`) partly fill the role in Module 3. Modules 1, 2, 4 and 5 have no keyboard path to scene POIs: the station, the stream, the Butterweed patch, the reveal overhead. Fix: instantiate `PoiList` for each module's camera targets, or remove the plan claim.

6. **Minor. The convenience-design map is pointer-only** (`meadow-map.js:70`, `pointerdown` on the SVG, no keyboard handler). The x/z number inputs provide an alternative (`fieldwork.js:111-131`), so this passes WCAG 2.1.1. But keyboard users don't get the spatial "click where it looks interesting" experience that teaches the bias. Fix: allow arrow-key cursor movement on the map, then Enter to place.

7. **Minor. The quadrat chips use `role="listitem"` on `<button>` elements** (`fieldwork.js:201`). That overrides the button role, so screen readers may announce "list item" instead of "button". Fix: wrap each button in an `<li>` inside a `<ul>`.

8. **Minor. The "Captions on" toggle has no effect** (realism review, finding 6). It is also a WCAG 3.3.2 / 4.1.2 honesty issue: the control's state doesn't match the behaviour.

9. **Minor. Audio sliders control no audio** (realism review, finding 8). They are a cognitive-load issue, not an a11y blocker.

10. **Minor. The breadcrumb strip overlaps the panel heading** (`screenshots/02-m1-landing.png`). It may fail 1.4.10 reflow at 320 px. That wasn't tested here; check it at 320 px width.

11. **Minor. The reduced-motion still frames still auto-advance** after `max(2.5 s, 0.7 × duration)` (`shot-player.js:90`). Users who read slowly may lose a caption. Fix: add a "Next" button in reduced-motion mode (WCAG 2.2.1 timing adjustable).

## Passes (verified)

- **Keyboard order is logical:** Menu → Settings → Text mode → All projects → 5 module tabs → module content (Tab trace).
- **Skip works from the first frame:** Skip button + Esc, verified.
- **Reduced motion:** `prefers-reduced-motion` is honoured at startup (`motion.reduced === true`). Wind goes to 0, walking becomes a cut (`meadow.js:367-373`), and cinematics become still frames (`screenshots/07-reduced-motion-s1-still.png`).
- **Live regions:** polite and assertive announcers (`a11y/announcer.js:15-20`). Quadrat walk, save and submit are announced (`fieldwork.js:316, 382, 397, 408`).
- **No colour-only cues in the HTML:** design cards are labelled "probability"/"non-probability", species rows are named, and the time meter has a text value (`fieldwork.js:157-160`). Colour-only cues remain in the 3D counting view (visual review, finding 5).
- **Captions:** high-contrast `rgba(0,0,0,.85)` / white (`site.css:116-122`).
- **Focus visibility:** 3 px outline (`site.css:60-62`).
- **Text mode:** the grid is a real `<table>` with a caption and `scope` headers (`textmode-modules.js:205-223`).
- **Settings** offers text size, contrast, FOV and reduced motion (`screenshots/08-settings-dialog.png`).
