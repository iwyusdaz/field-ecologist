# Teacher guide

**Field Ecologist: Sampling the Meadow** — a 45–60 minute pre-lab simulation on
sampling design, quadrats, bias and uncertainty. Follows NGSS HS-LS2-2 (use
mathematical representations to support and revise explanations about factors
affecting biodiversity and populations) and Science Practices 3–5.

## What students do
1. **Module 1 · The question (≈ 8 min):** dawn arrival cinematic (skippable),
   the research question ("How abundant is Meadow Butterweed across the
   meadow?"), a hypothesis choice, and a 5-item pre-check.
2. **Module 2 · Know your species (≈ 8 min):** field guide with shape+size
   field marks for five species, then an 8-item identification quiz.
3. **Module 3 · Fieldwork (≈ 15–20 min):** choose one of four sampling designs
   (simple random, systematic, stratified by moisture zone, or the deliberately
   biased "wherever looks interesting"), place 10 quadrats under a walking-time
   budget, count species per quadrat in a top-down view, estimate Bunchgrass
   cover in bands, and submit the data sheet.
4. **Module 4 · The reveal (≈ 10–15 min):** the true population vs the student's
   estimate; then a re-sampling simulator (1,000 virtual samples per design at
   n = 5–40) showing sampling distributions; 3 interpretation items.
5. **Module 5 · Report + transfer (≈ 8 min):** a methods-and-results report from
   the student's own data with a rubric self-check, then 4 survey-sampling
   transfer items.

## Lesson shapes
- **One period (45–60 min):** run modules 1–4 in class; assign module 5 as
  homework (the report saves to the student's browser and can be exported).
- **Pre-lab for a real field trip (flipped):** students do modules 1–3 at home;
  class discusses design choice before the trip; after the real trip, compare
  class CSV exports with the simulation's reveal.

## Discussion prompts that land hard
- "Your quadrats found zero Fen Orchids. The meadow has about two dozen. What
  can you honestly claim?" (absence of evidence ≠ evidence of absence)
- "With 'wherever looks interesting', does taking 40 quadrats instead of 10 fix
  the estimate?" (bias is a design property, not a size problem — show it in
  the simulator)
- "Why did stratifying by moisture steady the Blue Sedge estimate but barely
  change Butterweed's?" (strata help when the species follows the strata)

## Data and export
- The data sheet exports to **CSV** (opens in Excel/Sheets): one row per
  quadrat × species with counts, cover bands, coordinates and design metadata.
- Students' learning records stay in their browser (nothing is sent anywhere);
  "My progress" offers JSON download and a clear-my-data button.

## Honest framing for students
- The species are fictional teaching species ("a teaching model, not a real
  regional flora"), built so the patterns (clumping, gradient, rarity) behave
  realistically. Real quadrat practice (OpenStax Biology 2e §45.1) and sampling
  definitions (OpenStax Introductory Statistics 2e §1.2) are followed.
- The simulator's 1,000 virtual samples are computer repeats of the sampling
  procedure, not new field data.

## Accessibility
Text mode covers every objective and item (20×20 grid map with moisture zones;
structured plant descriptions for counting). Keyboard-only play, reduced-motion
versions of all cinematics, colour-independent field marks, charts with data
tables. See `design/accessibility-plan.md`.

## Common misconceptions to watch for
| Misconception | Where the app confronts it |
|---|---|
| "More data fixes bias" | Simulator: n slider vs design comparison (chart item 2) |
| "A systematic grid is biased because it isn't random" | Design picker text: systematic with a random start is a probability design |
| "We found 0, so there are none" | Orchid reveal + chart item 3 |
| "Estimates should equal the truth" | Reveal error decomposition: bias vs variance vs rarity vs mis-ID |
