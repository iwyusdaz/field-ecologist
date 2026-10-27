# Agent review: cognitive walkthrough

Agent review. Reviewer: an AI agent playing a persona. This is not a real learner session. Date: 2026-10-27.
Persona: **Noor, 16, Grade 11 biology** (`design/personas.md`). She is confident with averages and believes "more data always fixes bias". Path: 3D mode, Medium preset, 1280×800, mouse plus keyboard.
At each step I ask three questions: (Q1) will she know what to do, (Q2) will she see progress, (Q3) will she get usable feedback? Every "no" is logged.

| # | Step | Q1 | Q2 | Q3 | Notes |
|---|---|---|---|---|---|
| 1 | Load; S1 dawn plays | Yes | Yes ("Shot 1 of 2") | n/a | The panel hides most of the cinematic (`screenshots/04-s1-cinematic-playing.png`) |
| 2 | M1 hypothesis + 5 pre-check items | Yes | Partly | Yes ("why" text) | No item counter is visible beyond "Pre-check (5 items)" |
| 3 | M2 field guide + 8 ID items | Yes | Partly | Yes | ID images are side-view portraits (`guide-portraits.js:56-58`); fieldwork is top-down |
| 4 | M3 choose a design | Yes | Yes | Yes | The cards are honest about bias (`screenshots/05-m3-design-picker.png`) |
| 5 | Click quadrat chip 1 | Yes | Yes (time charged, announced) | Yes | — |
| 6 | Identify and count the plants | **No** | Yes | **No** | See breakdowns A–C |
| 7 | Bunchgrass cover band | **No** | Yes | **No** | See breakdown D |
| 8 | Save; repeat ×10 | Yes | Yes (green chips, data sheet) | Partly | The data sheet shows `butterweed:2`-style ids, not names (`fieldwork.js:343`) |
| 9 | Submit → M4 reveal + S2 | Yes | Yes | **No** | See breakdown E |
| 10 | Run the simulator (n = 5 → 40, convenience) | Yes | Yes (progress %) | Partly | See breakdown F |
| 11 | Chart items | Yes | Yes | Yes | They appear under the S3 overlay (breakdown F) |
| 12 | M5 report, rubric, transfer | Yes | Yes | Yes (self-check) | Not walked in depth |

## Breakdowns (each is a "no")

**A. Critical (step 6, Q1). Noor can't see the plants she is asked to count.** After the walk, the counting form covers the 2 m frame (`screenshots/q7-medium-with-ui.png`). Nothing tells her she can, or how to, see underneath. She will probably type counts from the text marks or guess. Fix: dock the form beside the quadrat.

**B. Critical (step 6, Q3). Her Daisy-leaf and Fen Orchid counts will be wrong without her knowing.** Their key marks don't render (`agent-review-visual.md`, finding 1). The orchid colony quadrat (`screenshots/conv-q1-medium-quadrat-zoom.png`) holds 2 orchids that look like nothing. She'll record 0, and the reveal will tell her that sampling "missed" a species she actually sampled.

**C. Major (step 6, Q1). Sedge vs Bunchgrass needs side-view marks.** The form tells her "fountain-like tuft… arching" vs "tight upright tussock". From above, both are stars. She has to fall back on colour, which the guide says is only a secondary cue (`species.json:69, 93`).

**D. Major (step 7, Q3). The cover band is a trap.** What she sees, a few thin tussocks, honestly reads as "< 5 %". The reveal will then say the truth is 53 % (`population.trueCover`). Her conclusion will be "I'm bad at cover", not anything about sampling.

**E. Major (step 9, Q3). The reveal caption reads "every one of the N Butterweed plants"** (`cinematics.json:61`). The one number that makes the truth tangible is missing.

**F. Major (step 10, Q3). This step targets Noor's specific misconception, and it's undercut twice.**
- S3 starts only after the histogram is finished (`reveal.js:226-234`). She never sees the distribution "build".
- The S3 overlay then sits on top of the graded chart items (`app.js:459`).
- The bias-vs-n lesson only lands if she actually compares n = 5 with n = 40 under convenience. The UI allows it, but nothing prompts that comparison before chart item 2.
- Fix: play S3 during the run, then reveal the items. Add a "Try n = 40 with the same design" button after the first run.

**G. Minor (step 3 → 6, Q1). The guide teaches side-view marks, but fieldwork uses top-down.** Add a top-down thumbnail to each field-guide card.

**H. Minor (step 8, Q2). The data sheet uses species ids (`blue-sedge:3`), not display names.** Use `sp.name`.

## Verdict

Steps 1–5 and 8–12 are learnable for Noor. Step 6 is the core LO2 activity, and as built she can't complete it accurately in 3D. That contaminates the reveal (LO3/LO4), which is the module's main payoff.
