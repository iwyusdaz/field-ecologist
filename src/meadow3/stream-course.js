/**
 * stream-course.js — the stream's open-water course and the boundary lines
 * of Ashcombe Meadow (pure; no DOM). Moved from the v2 scenes/meadow-dressing.js.
 *
 * v2 revision V1: the population model grows counted plants right on the
 * stream line (it is a wet flush inside the field, not open water), so open
 * water is drawn only where the stream runs outside the sampling field, kept
 * STREAM_FIELD_CLEARANCE metres clear of the boundary.
 *
 * Honesty rule (design/art-bible.md §5): every real-plant model stands at
 * least DRESSING_MIN_OFFSET metres outside the 100 m x 100 m field, so no
 * quadrat can contain one.
 * @module meadow3/stream-course
 */
import { FIELD_SIZE, streamX } from '../systems/moisture-field.js';

export const STREAM_HALF_WIDTH = 0.95;
export const STREAM_FIELD_CLEARANCE = 1.5;
export const DRESSING_MIN_OFFSET = 4.5;
/** The south boundary wall line (z) and its gate gap (x range, beside the field station). */
export const WALL_Z = -11;
export const GATE_X = [47, 53];
/** The north hedgerow line (z). */
export const HEDGE_Z = 107.5;

/** True when (x, z) lies at least `margin` metres outside the sampling field. */
export function outsideField(x, z, margin = DRESSING_MIN_OFFSET) {
  const S = FIELD_SIZE;
  return x < -margin || x > S + margin || z < -margin || z > S + margin;
}

/**
 * Open-water stream course as ribbon segments: south of the field (z < 0) and
 * north of it (z > 100). Each run is a list of [left, right] cross-section points.
 * @returns {Array<Array<[{x:number,z:number},{x:number,z:number}]>>}
 */
export function streamRibbonRuns(w = STREAM_HALF_WIDTH) {
  const ranges = [[-60, -STREAM_FIELD_CLEARANCE - w], [FIELD_SIZE + STREAM_FIELD_CLEARANCE + w, FIELD_SIZE + 60]];
  return ranges.map(([z0, z1]) => {
    const zs = [];
    for (let z = z0; z < z1; z += 1.5) zs.push(z);
    zs.push(z1);
    return zs.map((z, i) => {
      const zn = zs[Math.min(i + 1, zs.length - 1)], zp = zs[Math.max(i - 1, 0)];
      const dx = streamX(zn) - streamX(zp), dz = zn - zp;
      const len = Math.hypot(dx, dz) || 1;
      const sx = (-dz / len) * w, sz = (dx / len) * w;
      const x = streamX(z);
      return [{ x: x - sx, z: z - sz }, { x: x + sx, z: z + sz }];
    });
  });
}
