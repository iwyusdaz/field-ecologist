/**
 * Text descriptions of quadrats and grid cells (text mode, design/text-mode-design.md).
 * Composed from the TRUE population with the species' field-mark copy; the
 * learner still has to identify from the marks and enter counts themselves.
 * Pure module — no DOM.
 * @module systems/quadrat-describe
 */
import { countInQuadrat, QUADRAT_SIZE } from './population-model.js';
import { zoneOf } from './moisture-field.js';

/** Perceptual code for a 5 m grid cell (legend: · bare-ish, b bunchgrass, ~ sedge, y yellow heads, o orchid, d daisies). */
export function cellCode(counts) {
  if ((counts['fen-orchid'] || 0) > 0) return 'o';
  if ((counts['butterweed'] || 0) >= 3) return 'y';
  if ((counts['blue-sedge'] || 0) >= 10) return '~';
  if ((counts['bunchgrass'] || 0) >= 12) return 'b';
  if ((counts['daisyleaf'] || 0) >= 3) return 'd';
  return '·';
}

/**
 * Summarise the meadow as a 20 x 20 grid of 5 m cells (plan §11).
 * Rows are x bands (west→east, so the row label carries the moisture zone),
 * columns are z bands. Returns cells[j * 20 + i] where i = x band, j = z band.
 * @param {object} population buildPopulation result
 * @param {number} [gridN] cells per edge
 */
export function buildGrid(population, gridN = 20) {
  const S = population.fieldSize;
  const step = S / gridN;
  const cells = new Array(gridN * gridN).fill(null);
  for (const sp of Object.keys(population.positions)) {
    for (const p of population.positions[sp]) {
      const i = Math.min(gridN - 1, Math.floor(p.x / step));
      const j = Math.min(gridN - 1, Math.floor(p.z / step));
      let cell = cells[j * gridN + i];
      if (!cell) {
        cell = cells[j * gridN + i] = {
          i, j,
          cx: i * step + step / 2, cz: j * step + step / 2,
          zone: zoneOf(i * step + step / 2),
          counts: {},
        };
      }
      cell.counts[sp] = (cell.counts[sp] || 0) + 1;
    }
  }
  for (let k = 0; k < cells.length; k++) {
    if (!cells[k]) {
      const j = Math.floor(k / gridN), i = k % gridN;
      cells[k] = { i, j, cx: i * step + step / 2, cz: j * step + step / 2, zone: zoneOf(i * step + step / 2), counts: {} };
    }
    cells[k].code = cellCode(cells[k].counts);
  }
  return { gridN, step, cells };
}

/**
 * Describe the plants inside a quadrat at (cx, cz) as structured text groups:
 * one group per species present, each with an honest count and the species'
 * field-mark copy — but NOT the name (the learner identifies from the marks).
 * @param {object} population buildPopulation result
 * @param {Array<{id:string,fieldMarks:string[],heightCm:string}>} speciesList content species
 * @param {number} cx centre x (m)
 * @param {number} cz centre z (m)
 * @param {number} [size] quadrat edge in metres
 */
export function describeQuadrat(population, speciesList, cx, cz, size = QUADRAT_SIZE) {
  const groups = [];
  for (const sp of speciesList) {
    const n = countInQuadrat(population.positions[sp.id] || [], cx, cz, size);
    if (n === 0) continue;
    const shapeMark = (sp.fieldMarks && sp.fieldMarks[0]) || '';
    const sizeMark = (sp.fieldMarks && sp.fieldMarks[1]) || '';
    const leafMark = (sp.fieldMarks && sp.fieldMarks[2]) || '';
    groups.push({
      speciesId: sp.id,
      individuals: n,
      coverEstimated: Boolean(sp.coverEstimated),
      marks: [shapeMark, sizeMark, leafMark].filter(Boolean),
      // Dense species are described as "too many to count" — matching the cover method.
      description: sp.coverEstimated
        ? `${n} tight upright tussocks of hair-thin stiff blades — too many to count individually in the time you have.`
        : `${n} plant${n === 1 ? '' : 's'}: ${shapeMark.replace(/^shape:\s*/i, '')} ${sizeMark.replace(/^size:\s*/i, '')}`.trim(),
    });
  }
  groups.sort((a, b) => b.individuals - a.individuals);
  return { cx, cz, size, zone: zoneOf(cx), groups };
}
