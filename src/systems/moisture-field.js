/**
 * The analytic moisture field and terrain height for Ashcombe Meadow
 * (design/ecology-model.md). Pure functions — shared by the population model,
 * the vegetation renderer, the map, and text mode.
 * Field: 100 m x 100 m. x: west(0, wet, stream) -> east(100, dry rise). 1 unit = 1 m.
 * @module systems/moisture-field
 */

export const FIELD_SIZE = 100;

/** x-coordinate of the meandering stream line at a given z. */
export function streamX(z) {
  return 14 + 6 * Math.sin((2 * Math.PI * z) / 40);
}

/** Soil moisture in [0,1]: 1 at the stream, falling to ~0 by the dry rise. */
export function moisture(x, z) {
  const m = 1.25 - (x - streamX(z)) / 38;
  return Math.min(1, Math.max(0, m));
}

/**
 * The three sampling strata: equal-area thirds along the moisture gradient
 * (the x axis). Used by the stratified design, the map and text mode.
 * @returns {Array<{id:'wet'|'mid'|'dry', label:string, xMin:number, xMax:number}>}
 */
export function strata() {
  const s = FIELD_SIZE / 3;
  return [
    { id: 'wet', label: 'Streamside (wet)', xMin: 0, xMax: s },
    { id: 'mid', label: 'Mid-ground', xMin: s, xMax: 2 * s },
    { id: 'dry', label: 'Dry rise', xMin: 2 * s, xMax: FIELD_SIZE },
  ];
}

/** Stratum id ('wet'|'mid'|'dry') for a point — equal-area thirds along the gradient axis. */
export function zoneOf(x) {
  const s = FIELD_SIZE / 3;
  return x < s ? 'wet' : x < 2 * s ? 'mid' : 'dry';
}

/** Terrain height (metres) — gentle rise to the east plus micro-relief. */
export function terrainHeight(x, z) {
  const base = 0.03 * (x - streamX(z)) + 0.35 * Math.sin(0.11 * x) * Math.cos(0.09 * z)
    + 0.2 * Math.sin(0.031 * x + 2) * Math.sin(0.043 * z) + 0.8;
  return Math.max(0.05, base);
}
