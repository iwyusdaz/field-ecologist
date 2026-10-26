# Alignment matrix (objective → activity → feedback → assessment)

| Objective | In-world activity | Immediate feedback | Assessment item(s) |
|---|---|---|---|
| LO1 design choice | M1 hypothesis task; M3 design picker with honest pros/cons (incl. the biased one); moisture-zone map | Hypothesis feedback explains what the choice implies for design; design picker states expected behaviour of each design | Pre-check 1, 3, 5; report rubric §design; transfer item 3 |
| LO2 quadrat method | M3: place 10 quadrats per design; top-down counting view; field-guide ID; counts + Bunchgrass cover bands; time meter | Data sheet updates live; mis-ID surfaces in the reveal as an error source; guide shows shape+size marks for every species | ID quiz items 1–6 (species), 7–8 (concept: colour-last rule, cover vs count); report rubric §data accuracy |
| LO3 estimate + uncertainty | M3 data sheet → density per m²; M4 simulator: 1,000 virtual samples per design at n = 5–40 in a Web Worker; SVG histogram + data table | Simulator reports mean, SD, 95% percentile interval, bias vs truth for the chosen design | Chart item 1; report rubric §uncertainty; pre-check item 4 (density arithmetic) |
| LO4 bias vs variance | M4 reveal: true population vs learner estimate per species; error decomposition (bias / variance / missed rarity / mis-ID); simulator design × n comparisons | The reveal names each error source from the learner's OWN data (e.g. "your convenience quadrats sat in clusters") | Chart items 2, 3; pre-check item 3; report rubric §limitations |
| LO5 transfer | M5 survey-sampling scenario (school study-habits survey) | Item feedback maps each survey design back to its quadrat counterpart | Transfer items 1–4 |

## Coverage check
Every objective has practice, immediate feedback, and at least one assessment
item (standards 3.4). Automated cross-reference test: `tests/unit/content.test.js`
verifies that every item id referenced by modules exists, every MC item has a
correct option present in its options, and every species referenced in items
exists in `content/species.json`.
