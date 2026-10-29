import { describe, it, expect } from 'vitest';
import { DRESSING_PLACEMENTS, DRESSING_MIN_OFFSET, outsideField } from '../../src/scenes/meadow-dressing.js';
import { BUTTERFLY_PATHS, lifeScaleFor } from '../../src/scenes/meadow-life.js';
import { FIELD_SIZE } from '../../src/systems/moisture-field.js';
import { QUADRAT_SIZE } from '../../src/systems/population-model.js';
import speciesJson from '../../content/species.json';

// Honesty rule (design/art-bible.md §5): real Poly Haven plants are background
// dressing only — never inside the sampling field, never counted.
describe('v2 meadow dressing honesty rule', () => {
  it('places every Poly Haven model outside the 100 m field, beyond any quadrat reach', () => {
    expect(DRESSING_PLACEMENTS.length).toBeGreaterThanOrEqual(20);
    for (const [id, x, z] of DRESSING_PLACEMENTS) {
      expect(outsideField(x, z), `${id} at ${x},${z}`).toBe(true);
    }
    // a quadrat centre is inside the field, so its frame reaches at most half a side outside
    expect(DRESSING_MIN_OFFSET).toBeGreaterThan(QUADRAT_SIZE / 2 + 2);
  });

  it('uses only manifest models, none of them a counted species', () => {
    const counted = new Set(speciesJson.species.map((s) => s.id));
    const allowed = new Set(['rock_07', 'dead_tree_trunk', 'wild_rooibos_bush', 'fern_02', 'flower_gazania', 'celandine_01']);
    for (const [id] of DRESSING_PLACEMENTS) {
      expect(allowed.has(id)).toBe(true);
      expect(counted.has(id)).toBe(false);
    }
  });

  it('scales ambient life down on Low (v2 revision M5)', () => {
    const low = lifeScaleFor({ vegetationDensity: 0.4 });
    const med = lifeScaleFor({ vegetationDensity: 0.7 });
    expect(low.butterflies).toBe(3);
    expect(low.mistSheets).toBe(3);
    expect(low.pollen).toBeLessThan(med.pollen);
    expect(lifeScaleFor({ vegetationDensity: 1 }).butterflies).toBe(BUTTERFLY_PATHS.length);
  });

  it('keeps butterfly loops over the margins, not the field interior', () => {
    for (const path of BUTTERFLY_PATHS) {
      for (const [x, , z] of path) {
        const inner = x > 1 && x < FIELD_SIZE - 1 && z > 1 && z < FIELD_SIZE - 1;
        expect(inner).toBe(false);
      }
    }
  });
});
