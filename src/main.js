/**
 * Field Ecologist v3 — entry point (plan 10 §6.3, scene-first revamp).
 * The v3 template shell (src/v3/, synced with _tools/sync-v3-core.mjs) runs
 * Ashcombe Meadow at dawn (src/meadow3/world.js), the five modules
 * (src/meadow3/lessons.js) and the object catalog (content/objects.json).
 * The field-notebook layout (left spine rail, phone tab strip, field-guide
 * cards) is repo code: src/meadow3/notebook-layout.js + src/styles/meadow-v3.css.
 */
import './v3/layers.css';
import './v3/type.css';
import './v3/shell.css';
import './styles/case-fonts.css';
import './styles/meadow-v3.css';
import { createSceneApp } from './v3/app.js';
import catalog from '../content/objects.json';
import species from '../content/species.json';
import designs from '../content/designs.json';
import items from '../content/items.json';
import modules from '../content/modules.json';
import cinematics from '../content/cinematics.json';
import { buildPopulation, MEADOW_SEED } from './systems/population-model.js';
import { Lessons } from './meadow3/lessons.js';
import { MeadowWorld, HOME_VIEW } from './meadow3/world.js';
import { applyNotebookLayout } from './meadow3/notebook-layout.js';

const SLUG = window.__SLUG__ || 'field-ecologist';
window.__SLUG__ = SLUG;
const population = buildPopulation(MEADOW_SEED);
const lessons = new Lessons({ slug: SLUG, content: { species, designs, items, modules, cinematics }, population });
const mods = lessons.moduleDefs();
const app = await createSceneApp({
  slug: SLUG,
  title: 'Field Ecologist',
  shortTitle: 'Field Ecologist',
  modules: mods,
  catalog,
  home: HOME_VIEW,
  walkable: true,
  titleScreen: { kicker: 'Ashcombe Meadow at dawn · fictional teaching species', oneLiner: 'Plan a quadrat survey, count five plant species in the meadow, then find out how your sampling design biased your estimate.' },
  practiceObject: 'field-station',
  lut: `${import.meta.env.BASE_URL}assets/v3/lut/ashcombe-dawn-33-eea64172.png`,
  limits: { minRadius: 0.6, maxRadius: 220, minPhi: 0.12, maxPhi: 1.52, minEye: 0.35, eyeHeight: 1.6 },
  buildScene: async (a) => {
    const world = new MeadowWorld(a, { population, species: species.species });
    await world.load();
    world.registerAll();
    world.bindPicking();
    world.addMotion(a.motion);
    lessons.bind(a, world);
    a.world = world;
    a.lessons = lessons;
    // Stream the detail tier after the learner's first interaction (plan §7 download gate).
    const first = () => { world.startStreaming(); for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, first, true); };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, first, true);
    return {
      groundHeight: (x, z) => world.groundY(x, z),
      colliders: world.colliders,
      legend: lessons.legend(),
      update: (dt, t) => world.update(dt, t),
    };
  },
});
applyNotebookLayout(app);
if (__TEST_HOOKS__ && window.__TEST__) Object.assign(window.__TEST__, { lessons, world: app.world });
window.__app = app;
