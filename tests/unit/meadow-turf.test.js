import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { turfPlacements, TURF_MAX_IN_FIELD } from '../../src/scenes/meadow-turf.js';
import { ROSETTE_Y } from '../../src/systems/species-models.js';
import { FIELD_SIZE } from '../../src/systems/moisture-field.js';

// v2 revision V3: the in-field turf must never hide a counted field mark.
describe('meadow turf layer', () => {
  const list = turfPlacements(1);

  it('keeps every in-field tuft below the lowest counted field mark (Daisy-leaf rosette)', () => {
    const inField = list.filter((t) => t.inField);
    expect(inField.length).toBeGreaterThan(10000);
    for (const t of inField) expect(t.h).toBeLessThanOrEqual(TURF_MAX_IN_FIELD);
    expect(TURF_MAX_IN_FIELD).toBeLessThan(ROSETTE_Y);
  });

  it('keeps the taller apron tufts outside the field', () => {
    for (const t of list.filter((x) => !x.inField)) {
      const inside = t.x >= 0 && t.x <= FIELD_SIZE && t.z >= 0 && t.z <= FIELD_SIZE;
      expect(inside).toBe(false);
    }
  });

  it('is deterministic (seeded RNG, no Math.random) and scales with preset density', () => {
    const again = turfPlacements(1);
    expect(again[123]).toEqual(list[123]);
    expect(turfPlacements(0.4).length).toBeLessThan(list.length * 0.5);
    const src = readFileSync(new URL('../../src/scenes/meadow-turf.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
  });
});
