# Ashcombe Meadow: project design notes for the constructed objects

These notes are the source for catalog cards (`content/objects.json`) that
describe things this project made up. They are design records, not outside
research. Every fact about the real world is in `sources.md`. Agent work,
2026-11-06 (v3 build, plan 10 §6.3).

## Fictional teaching species {#species}
Meadow Butterweed, Common Daisy-leaf, Blue Sedge, Tussock Bunchgrass and Fen
Orchid are constructed for teaching. They are botanically plausible but
fictional, and the meadow is a teaching model, not a real regional flora.
- Their field marks, heights and distributions are defined in
  `content/species.json` (heights in `heightCm`, marks in `fieldMarks`).
- Their 3D models are procedural (`src/systems/species-models.js`). The marks
  are slightly exaggerated so they stay readable at quadrat distance
  (`design/realism-matrix.md`).
- Their spatial patterns (clumped, random, moisture gradient, dense, rare and
  clumped) come from the seeded population model
  (`src/systems/population-model.js`, `design/ecology-model.md`).

## Data sheet and clipboard {#data-sheet}
The learner's data sheet (`src/systems/data-sheet.js`) records each quadrat's
number, centre, species counts and the Bunchgrass cover band. The clipboard
in the scene shows the same rows as the learner counts. The sheet layout is
illustrative, not a standard survey form.

## Hand lens close-up {#hand-lens}
The hand lens is a magnifier model (Poly Haven, CC0). In the app it opens a
close-up view: the camera's field of view narrows around the spot the learner
taps, so leaf shape and the teeth on the leaf edge read clearly. The close-up
is an illustrative stand-in for looking through a real lens.

## Field station {#field-station}
The station table, field guide, flask, pencils and stool are Poly Haven scans
(CC0) placed by the south gate. The station is fictional scenery for the
survey's starting point (`design/art-bible.md`).

## Stream and moisture gradient {#stream}
The stream line follows `streamX(z)` in `src/systems/moisture-field.js`; soil
moisture falls with distance from it (`design/ecology-model.md`). Inside the
sampling field the stream line is damp ground, so no counted plant is ever
under water. The water surface moves at about 0.25 m/s, a slow lowland
stream pace; the meadow and its stream are fictional.

## Clouds {#clouds}
The clouds are billboards (own-work atlas, `assets-src/`). They drift with a
constant illustrative wind, and their shadows on the ground move with them.
Shapes, speed and timing are illustrative.

## Field worker {#field-worker}
A fictional colleague walks the strip north of the field and lays out a tape
line for a separate survey. The figure is a stylised procedural character
(`src/v2/stylized-character.js`). They never enter the sampling field.

## Wind in the grass {#wind}
The sward moves with a GPU wind shader (`src/systems/wind.js`): a small sway
plus gust bands that travel across the field. The motion is illustrative. It
drops to about 12% while the learner counts and stops under reduced motion.
