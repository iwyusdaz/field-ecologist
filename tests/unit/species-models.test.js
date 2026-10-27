/**
 * Counting legibility guard (agent review: visual finding 1, realism finding 5):
 * no species' identifying geometry may sit below the ground. Earlier builds sank
 * every instance 2 cm, which buried the Daisy-leaf rosette and the Fen Orchid's
 * two basal leaves on every preset.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  fieldMarkMinY, GROUND_SINK, MODELLED_SPECIES, MARK_BURIAL_TOLERANCE, ROSETTE_Y, buildSpeciesGeometry,
} from '../../src/systems/species-models.js';
import { terrainHeight } from '../../src/systems/moisture-field.js';
import { buildPopulation, MEADOW_SEED } from '../../src/systems/population-model.js';

const FLAT_MARK_SPECIES = ['daisyleaf', 'fen-orchid'];
// Smallest vertical instance scale the renderer applies (0.85 * 0.9).
const MIN_Y_SCALE = 0.85 * 0.9;
// Footprint radius of the flat basal leaves (m) — leaf tips reach ~8 cm from the crown.
const FLAT_FOOTPRINT = 0.08;

describe('species models: identifying geometry is above ground', () => {
  it('every content species has a model and a sink entry', () => {
    for (const id of ['butterweed', 'daisyleaf', 'blue-sedge', 'bunchgrass', 'fen-orchid']) {
      expect(MODELLED_SPECIES).toContain(id);
      expect(GROUND_SINK[id]).toBeTypeOf('number');
    }
  });

  it.each(MODELLED_SPECIES)('"%s": lowest field-mark part minus the instance sink is not below ground', (id) => {
    const minY = fieldMarkMinY(id);
    expect(Number.isFinite(minY)).toBe(true); // every species tags at least one mark
    expect(minY - GROUND_SINK[id]).toBeGreaterThanOrEqual(-MARK_BURIAL_TOLERANCE);
  });

  it.each(FLAT_MARK_SPECIES)('"%s": flat basal leaves are not sunk and sit clearly above the crown point', (id) => {
    expect(GROUND_SINK[id]).toBe(0);
    expect(fieldMarkMinY(id)).toBeGreaterThan(0.01);
    expect(ROSETTE_Y).toBeGreaterThanOrEqual(0.015);
  });

  it.each(FLAT_MARK_SPECIES)('"%s": flat leaves clear the real terrain under their whole footprint at every plant', (id) => {
    const pop = buildPopulation(MEADOW_SEED);
    const pts = pop.positions[id].slice(0, 600);
    const lowest = fieldMarkMinY(id) * MIN_Y_SCALE;
    let worst = Infinity;
    for (const p of pts) {
      const base = terrainHeight(p.x, p.z) - GROUND_SINK[id];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const g = terrainHeight(p.x + Math.cos(a) * FLAT_FOOTPRINT, p.z + Math.sin(a) * FLAT_FOOTPRINT);
        worst = Math.min(worst, base + lowest - g);
      }
    }
    expect(worst).toBeGreaterThan(0);
  });

  it('Blue Sedge reads wider than Bunchgrass from above (top-down footprint, not only colour)', () => {
    const footprint = (id) => {
      const { geometry } = buildSpeciesGeometry(id);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      return Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    };
    const sedge = footprint('blue-sedge');
    const grass = footprint('bunchgrass');
    expect(sedge).toBeGreaterThan(grass * 1.6);
    expect(grass).toBeGreaterThan(0.15); // 15–25 cm tussock (species card)
    expect(grass).toBeLessThan(0.3);
  });
});
