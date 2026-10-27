# Agent review: heuristic evaluation (Nielsen 10 + playability)

Agent review. Reviewer: an AI agent, not a usability professional and not real-user data. Date: 2026-10-27.
Basis: the running build (port 4193, headless), screenshots in `evaluation/reviews/screenshots/`, and the code paths cited.

## Ratings

| Heuristic | 3D UI | Text mode | Note |
|---|---|---|---|
| H1 Visibility of system status | Pass | Pass | Time meter with a text value; "Quadrat 7 of 10 — wet zone"; sampled chips turn green; live announcements |
| H2 Match with the real world | Concern | Pass | Top-down ortho hides side-view field marks; no boundary rule |
| H3 User control and freedom | Concern | Pass | Skip and Esc work everywhere; but no pause, no panel hide, and a random redraw only before the first visit |
| H4 Consistency and standards | Concern | Pass | Captions toggle and audio sliders that do nothing; breadcrumb duplicates the tabs |
| H5 Error prevention | **Fail** | Concern | Blank count vs zero ambiguity; the form covers the plants being counted |
| H6 Recognition over recall | Pass | Concern | Field marks sit beside each input in 3D; text mode echoes the marks verbatim (too easy) |
| H7 Flexibility and efficiency | Concern | Pass | No keyboard map placement; no counting zoom |
| H8 Aesthetic and minimalist design | Concern | Pass | The panel dominates the scene in every module |
| H9 Help users recover from errors | Pass | Pass | "Close without saving"; quiz feedback explains (`items.json` "why") |
| H10 Help and documentation | Pass | Pass | Field guide button in each quadrat; design cards state strength and trade-off |
| P1 Clear goals | Pass | Pass | The research question is stated in M1 and in S1b |
| P2 Feedback | Concern | Pass | The reveal is strong feedback, but its N caption is broken and the cover "truth" contradicts the view |
| P3 Challenge/skill balance | **Fail** | Concern | 3D: the difficulty is visual (hidden species); text: the difficulty is near zero (exact counts given) |
| P4 No unnecessary friction | Concern | Pass | Walk glide, then a form that hides the view, then the learner closes the form to see the plants, which loses typed values |

## Findings

1. **Critical (H5, P3, 3D). Counting in 3D can't be done accurately as built.** The panel covers the frame (`screenshots/q7-low-with-ui.png`), and the Daisy-leaf and orchid marks are invisible (`agent-review-visual.md`, findings 1, 2 and 4). Fix: dock the panel and repair the models.

2. **Major (P4, H3). There is no way to see the quadrat without closing the form.** "Close without saving" discards the inputs (`fieldwork.js:324-329`). A learner who needs to look again loses their typed counts. Fix: add a "Hide panel / show quadrat" toggle that keeps the form state.

3. **Major (H5). Blank and zero are ambiguous.** A blank count is dropped from the record (`fieldwork.js:306`), and the estimate for that species disappears or is distorted (expert review, research-methods lecturer, finding 2). Fix: give inputs a default of 0, or confirm "treat blanks as 0?" on save.

4. **Major (P2). The reveal's headline caption shows "N"** (`content/cinematics.json:61`, realism review, finding 1).

5. **Major (P2, H2). The cover "truth" (53 %) contradicts what the learner sees (under 5 %)** (expert review, ecology instructor, finding 1).

6. **Major (P3, text mode). Text mode gives exact counts and verbatim marks, so there is no ID or counting challenge** (`quadrat-describe.js:83-85`; accessibility review, finding 1).

7. **Major (H3). There is no pause.** The menu offers "Resume" but nothing is paused (`core/engine.js:122` is never called).

8. **Minor (H4). The "Captions on" toggle and the master, voice and ambient sliders have no effect** (`settings.js:86, 118`; no audio in `src/`). Fix: remove them or wire them up.

9. **Minor (H8). The duplicate breadcrumb strip overlaps the panel heading** (`screenshots/02-m1-landing.png`).

10. **Minor (H2). The counting view's aspect distortion turns the square quadrat into a rectangle** (`meadow.js:349-350`; visual review, finding 3).

11. **Minor (H7). Convenience placement is click-or-type only.** There is no keyboard cursor on the map (`meadow-map.js:70`).

12. **Minor (H1). The time meter cost isn't previewed.** The chip labels give coordinates but not the walk cost, so learners can't plan the route the budget rewards. Fix: add "≈ X units from here" to each chip's `aria-label` and tooltip.
