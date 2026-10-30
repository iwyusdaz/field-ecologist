/**
 * v3-assets.config.mjs — the v3 (plan 10 §6.3) asset list for Ashcombe Meadow.
 *
 * Every third-party asset comes from a source on the plan 09 decision 2 list
 * (CC0 / public domain / CC BY 4.0 / own work). `fetch-v3-assets.mjs` checks the
 * licence before it downloads anything; `check-v3-assets.mjs` re-checks the
 * shipped manifest, ATTRIBUTION.md and content/objects.json.
 *
 * tier: 'first'  = needed for the first view (counts toward the 15 MB desktop /
 *                  8 MB mobile first-load budget);
 *       'stream' = loaded after the first click (plan §7 Download gate).
 * catalog: content/objects.json ids the asset is used for.
 * @module scripts/v3-assets.config
 */

/** Licences allowed by plan 09 decision 2. Anything else (NC, ND, unknown) is rejected. */
export const ALLOWED_LICENCES = ['CC0 1.0', 'Public domain', 'CC BY 4.0', 'Own work (MIT)'];
/** Patterns that must never appear in a licence string. */
export const FORBIDDEN_LICENCE = /\b(NC|ND|non[- ]?commercial|no[- ]?deriv|research or evaluation|mixamo)\b/i;

/**
 * Site-wide licence pages. Neither Poly Haven's nor ambientCG's API carries a
 * per-asset licence field; every asset on both sites is CC0. The fetch script
 * opens these pages at run time and aborts unless the CC0 statement is there.
 */
export const SOURCE_SITES = {
  polyhaven: {
    licence: 'CC0 1.0',
    hosts: ['polyhaven.com', 'api.polyhaven.com', 'dl.polyhaven.org'],
    licencePage: 'https://polyhaven.com/license',
    mustContain: 'CC0',
  },
  ambientcg: {
    licence: 'CC0 1.0',
    hosts: ['ambientcg.com', 'docs.ambientcg.com'],
    licencePage: 'https://docs.ambientcg.com/license/',
    mustContain: 'CC0 1.0 Universal',
  },
};

/** Poly Haven models -> public/assets/v3/models/<out>-<hash8>.glb (meshopt + quantization + KTX2). */
export const POLYHAVEN_MODELS = [
  // field station (south gate)
  { id: 'wooden_table_02', out: 'station-table', catalog: ['field-station'], tier: 'first', tex: 512, maxTris: 4000, use: 'Field station table by the south gate' },
  { id: 'clipboard', out: 'clipboard', catalog: ['clipboard'], tier: 'first', tex: 512, maxTris: 6500, use: 'The learner\'s clipboard; the data sheet texture is drawn over it at run time' },
  { id: 'magnifying_glass_01', out: 'hand-lens', catalog: ['hand-lens'], tier: 'first', tex: 512, maxTris: 7500, use: 'Hand lens on the station table; opens the close-up mode' },
  { id: 'binder_notebook', out: 'field-guide', catalog: ['field-station'], tier: 'first', tex: 512, maxTris: 9000, use: 'Field guide on the station table' },
  { id: 'plastic_thermos', out: 'flask', catalog: ['field-station'], tier: 'first', tex: 256, maxTris: 6000, use: 'Flask on the station table' },
  { id: 'folding_wooden_stool', out: 'stool', catalog: ['field-station'], tier: 'first', tex: 512, maxTris: 6500, use: 'Folding stool beside the table' },
  { id: 'stationery_supplies', out: 'pencils', catalog: ['field-station'], tier: 'first', tex: 256, maxTris: 4500, use: 'Pencils and eraser on the station table' },
  // background dressing, all outside the 100 m x 100 m sampling field
  { id: 'boulder_01', out: 'boulder', catalog: [], tier: 'stream', tex: 512, maxTris: 8000, use: 'Boulders (about 1.8 m, real scan size) at the field corners, outside the sampling area' },
  { id: 'fern_02', out: 'fern', catalog: ['stream'], tier: 'stream', tex: 512, maxTris: 6500, use: 'Ferns on the stream banks beyond the field' },
  { id: 'flower_gazania', out: 'margin-gazania', catalog: ['margin-flowers'], tier: 'stream', tex: 512, maxTris: 12000, use: 'Orange margin flowers in front of the wall, outside the field' },
  { id: 'celandine_01', out: 'margin-celandine', catalog: ['margin-flowers'], tier: 'stream', tex: 512, maxTris: 12000, use: 'Low celandine clusters at the hedge foot, outside the field' },
  { id: 'periwinkle_plant', out: 'margin-periwinkle', catalog: ['margin-flowers'], tier: 'stream', tex: 512, maxTris: 12000, use: 'Pink periwinkle clusters along the margins, outside the field' },
  { id: 'dead_tree_trunk', out: 'fallen-log', catalog: ['fallen-log'], tier: 'stream', tex: 512, maxTris: 12000, use: 'Fallen log beyond the east boundary' },
  { id: 'nettle_plant', out: 'hedge-nettle', catalog: ['hedgerow'], tier: 'stream', tex: 512, maxTris: 12000, use: 'Nettles at the hedge foot, outside the field' },
  { id: 'shrub_04', out: 'hedge-undergrowth', catalog: ['hedgerow'], tier: 'stream', tex: 512, maxTris: 12000, use: 'Undergrowth at the hedge foot, outside the field' },
  { id: 'tree_stump_01', out: 'woodland-stump', catalog: ['woodland-edge'], tier: 'stream', tex: 512, maxTris: 10000, use: 'Tree stump at the woodland edge' },
  { id: 'dry_branches_medium_01', out: 'woodland-branches', catalog: ['woodland-edge'], tier: 'stream', tex: 512, maxTris: 8000, use: 'Fallen branches on the woodland floor' },
];

/** Poly Haven HDRIs -> public/assets/v3/hdri/<out>-<hash8>.hdr (unmodified). */
export const POLYHAVEN_HDRIS = [
  { id: 'lilienstein', res: '1k', out: 'sky-lilienstein-1k', catalog: ['sun-dawn', 'clouds'], tier: 'first', use: 'Early-morning sky and image-based lighting on Low/Medium (Takram atmosphere replaces the visible sky on High/Ultra)' },
];

/**
 * ambientCG materials -> public/assets/v3/textures/<out>-<map>-<hash8>.ktx2, or
 * (embed: true) only staged in data/raw for build-v3-own-assets.mjs, which bakes
 * them into the own-work GLBs.
 * maps: color (sRGB, ETC1S), normal (NormalGL, ETC1S normal mode), rough (R, ETC1S), opacity (merged into color alpha).
 */
export const AMBIENTCG_MATERIALS = [
  { id: 'Grass004', out: 'ground-dry', catalog: ['dry-ground', 'wind'], tier: 'first', size: { color: 1024, normal: 512, rough: 512 }, use: 'Dry-rise sward (paler, firmer ground away from the stream)' },
  { id: 'Grass003', out: 'ground-wet', catalog: ['wet-ground'], tier: 'first', size: { color: 1024, normal: 512, rough: 512 }, use: 'Streamside sward (darker, lusher ground)' },
  { id: 'Rock064', out: 'wall-stone', catalog: ['stone-wall'], tier: 'first', size: { color: 512, normal: 512, rough: 256 }, use: 'Mossy stones of the dry-stone wall' },
  { id: 'Foliage001', out: 'grass-blades', catalog: ['wind'], tier: 'first', size: { color: 1024 }, alpha: true, use: 'Grass-blade cards for the wind-blown sward outside the field' },
  { id: 'Ground036', out: 'stream-mud', catalog: ['stream'], tier: 'stream', size: { color: 512, normal: 512, rough: 256 }, use: 'Muddy stream banks seen up close' },
  { id: 'Ground048', out: 'soil', catalog: ['soil'], tier: 'stream', size: { color: 512, normal: 512, rough: 256 }, use: 'Topsoil in the cut stream bank' },
  { id: 'Bark012', embed: true, catalog: ['woodland-edge', 'hedgerow'], use: 'Bark of the own-work woodland trees and hedge shrubs (baked into woodland-trees.glb)' },
  { id: 'LeafSet024', embed: true, catalog: ['woodland-edge', 'hedgerow'], use: 'Leaves composited into leaf-cluster cards for the own-work trees and hedge shrubs (baked into woodland-trees.glb)' },
];

/** Own-work assets made by scripts/build-v3-own-assets.mjs (MIT, this repo). */
export const OWN_ASSETS = [
  { out: 'woodland-trees', kind: 'glb', catalog: ['woodland-edge', 'hedgerow'], tier: 'first', use: 'Three broadleaf forms (tall tree, small tree, hedge shrub), each LOD0 (<= 8k triangles) + LOD1 (<= 150 triangles), same pivot at the trunk base; impostors are baked from LOD0 at run time' },
  { out: 'survey-stake', kind: 'glb', catalog: ['random-sampling'], tier: 'first', use: 'Numbered survey stake with flagging tape; the number plate takes a run-time canvas texture' },
  { out: 'cloud-sprites', kind: 'ktx2', catalog: ['clouds'], tier: 'first', use: 'Four soft cloud billboards (2x2 atlas) for the Medium/High sky fallback' },
  { out: 'ashcombe-dawn-33', kind: 'lut', catalog: [], tier: 'first', use: 'Case LUT grade (33^3) in display space after AgX; .cube source in assets-src/lut/, PNG strip shipped' },
];

/**
 * Catalog objects that move, with the label their card must carry (plan §5.2):
 * physically correct real-time motion, or labelled time-lapse / illustrative.
 */
export const MOTION = {
  mist: 'time-lapse',
  'sun-dawn': 'time-lapse',
  clouds: 'illustrative',
  wind: 'illustrative',
  butterflies: 'illustrative',
  bees: 'illustrative',
  birds: 'illustrative',
  stream: 'real-time',
};

/**
 * Catalog objects that need no file: they are drawn in code (own work) by the
 * scene. Listed so every catalog id maps to an asset or to code.
 */
export const CODE_ONLY = {
  butterweed: 'Fictional teaching species, procedural model (src/systems/species-models.js)',
  daisyleaf: 'Fictional teaching species, procedural model (src/systems/species-models.js)',
  'blue-sedge': 'Fictional teaching species, procedural model (src/systems/species-models.js)',
  bunchgrass: 'Fictional teaching species, procedural model (src/systems/species-models.js)',
  'fen-orchid': 'Fictional teaching species, procedural model (src/systems/species-models.js)',
  quadrat: 'Procedural 2 m frame (src/scenes/meadow.js)',
  stream: 'Procedural water ribbon (src/scenes/meadow-dressing.js) + stream-mud texture + fern models',
  hills: 'Procedural hill ring (src/scenes/meadow-dressing.js); v3 fixes the faceting in code (smooth normals, more segments)',
  'stone-wall': 'Procedural instanced stones (src/scenes/meadow-dressing.js) + wall-stone texture',
  mist: 'Procedural mist sheets (src/scenes/meadow-life.js)',
  'sun-dawn': 'Sun light + sky (HDRI on Low/Medium, Takram atmosphere on High/Ultra)',
  wind: 'GPU wind in the grass shader + grass-blades texture',
  butterflies: 'Procedural wing-flap butterflies (src/scenes/meadow-life.js)',
  bees: 'Procedural bees (v3 motion layer)',
  birds: 'Procedural birds (v3 motion layer)',
  'field-worker': 'Procedural character (src/v2/stylized-character.js)',
};
