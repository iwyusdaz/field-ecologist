/**
 * world.js — Ashcombe Meadow at dawn, the v3 scene (plan 10 §6.3).
 *
 * Builds the ground, sky, Sun, clouds, the five counted species (the v1
 * population and vegetation renderer, unchanged), the field station, the
 * quadrats and survey stakes, the dry-stone wall and gate, the hedgerow, the
 * clustered woodland with impostors, margin flowers and the rest of the
 * background dressing (all outside the field), and the living layer: wind,
 * mist, stream, butterflies, bees, birds, pollen and a distant field worker.
 * It registers every catalog object with the inspect system and every motion
 * system with the motion manager, and owns the counting view (the kneeling
 * camera at a quadrat, tap-to-tally and the hand lens).
 *
 * Asset tiers (S4 manifest): `first` loads before the first frame; `stream`
 * (boulders, ferns, margin flowers, log, nettles, undergrowth, stump,
 * branches, mud and soil maps) loads after the learner's first click.
 * @module meadow3/world
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VegetationRenderer } from '../systems/vegetation-renderer.js';
import { FIELD_SIZE, terrainHeight, streamX } from '../systems/moisture-field.js';
import { QUADRAT_SIZE } from '../systems/population-model.js';
import { turfPlacements } from '../scenes/meadow-turf.js';
import { createAnimatedCharacter } from '../v2/stylized-character.js';
import { createGlint } from '../v3/inspect.js';
import { applyWind } from '../systems/wind.js';
import { BASE, loadGLB, loadKTX2, loadHDR, manifestIndex } from './loaders.js';
import { buildGround, buildHills, buildStream, buildSoilBank, groundY, makeCloudUniforms, addCloudShade, channelDepth } from './ground.js';
import { DawnSky, Clouds } from './sky.js';
import { LodSet, bakeImpostor } from './lod.js';
import { WALL_Z, GATE_X, HEDGE_Z, outsideField, DRESSING_MIN_OFFSET } from './stream-course.js';
import * as tx from './textures.js';

export const STATION = { x: 50, z: 2 };
/** Depth of the dawn haze layer over the meadow (m). */
const HAZE_DEPTH = 30;
/** Where the learner first stands: by the station, looking north into the meadow. */
export const HOME_VIEW = { target: [50, groundY(50, 15) + 1.1, 15], radius: 13, theta: Math.PI, phi: 1.4 };

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const up = new THREE.Vector3(0, 1, 0);
/** Trees and hedge shrubs: full-detail LOD0 (and its shadow) within 30 m, LOD1 beyond (60 m cost 2 M triangles at the hedge). */
const LOD0_NEAR = 30;
/**
 * One variant per scanned plant: LOD1 where the scan has it (they sit at the
 * field margins, seen from a few metres or more), else LOD0, else the first.
 */
export function lodPick(list) {
  const by = new Map();
  const rank = (l) => (l === 1 ? 0 : l === 0 ? 1 : 2);
  for (const o of list) {
    const m = /^(.*)_LOD(\d+)$/.exec(o.name || '');
    const base = m ? m[1] : o.name || o.uuid, lv = m ? +m[2] : 0;
    const cur = by.get(base);
    if (!cur || rank(lv) < rank(cur.lv)) by.set(base, { o, lv });
  }
  return [...by.values()].map((v) => v.o);
}
/**
 * Replace repeated clones under `group` (same geometry and material) with one
 * InstancedMesh each: the same plants in the same places, one draw call per
 * part instead of one per copy. Instances get no outline hull (hover shows the label).
 */
export function instancify(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || Array.isArray(m.material)) return;
    const k = `${m.geometry.uuid}|${m.material.uuid}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(m);
  });
  const mat = new THREE.Matrix4();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const im = new THREE.InstancedMesh(list[0].geometry, list[0].material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, mat.multiplyMatrices(inv, m.matrixWorld)));
    im.castShadow = list[0].castShadow;
    im.receiveShadow = list[0].receiveShadow;
    im.name = `${list[0].name}-instances`;
    im.userData.noOutline = true;
    im.computeBoundingBox();
    im.computeBoundingSphere();
    group.add(im);
    for (const m of list) m.parent.remove(m);
  }
}

export class MeadowWorld {
  /**
   * @param {object} app  v3 app
   * @param {{ population: object, species: object[] }} o
   */
  constructor(app, { population, species }) {
    this.app = app;
    this.engine = app.engine;
    this.scene = app.engine.scene;
    this.population = population;
    this.species = species;
    this.group = new THREE.Group();
    this.group.name = 'ashcombe-meadow';
    this.scene.add(this.group);
    this.cloud = makeCloudUniforms();
    this.roots = {};          // catalog id -> Object3D[] (registered with inspect)
    this.frames = {};         // catalog id -> inspect frame options
    this.quadratFrames = [];  // placed frames
    this.stakes = [];         // placed stakes
    this.activeQuadrat = -1;
    this.counting = false;
    this.colliders = [];
    this.windTime = 0;
    this.preset = app.engine.quality.presetDef;
    this.presetName = app.engine.quality.name || 'medium';
    const cam = app.engine.camera;
    cam.near = 0.05; cam.far = 9000; cam.updateProjectionMatrix();
  }

  add(id, obj, frame) { (this.roots[id] ||= []).push(obj); if (frame) this.frames[id] = frame; return obj; }

  groundY(x, z) { return groundY(x, z); }

  // ------------------------------------------------------------------ load
  async load() {
    const r = this.engine.renderer;
    const res = await fetch(`${BASE}assets/v3/manifest.json`);
    this.mf = manifestIndex(await res.json());
    const mf = this.mf;
    // Sky, Sun, haze first (the title screen shows the sky).
    this.sky = new DawnSky(this.app, this.group);
    this.clouds = new Clouds(this.group, this.cloud.uCloudWind.value);
    this.ground = buildGround(this.group, this.cloud);
    this.hills = buildHills(this.group, this.cloud);
    this.stream = buildStream(this.group, this.cloud);
    this.soil = buildSoilBank(this.group);
    // Species specimens before the vegetation renderer, so each species' first
    // catalog node (the scale check) is a whole plant at its model size.
    this._buildSpecimens();
    this.vegetation = new VegetationRenderer({ scene: this.group, renderer: r, population: this.population, speciesList: this.species, preset: this.preset });
    this.vegetation.setPreset(this.preset, this.presetName);
    for (const sp of this.vegetation.species.values()) {
      // The instance set changes as the camera moves: a fixed sphere over the
      // field keeps the raycast's early-out valid (bindPicking, counting taps).
      sp.nearMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(50, 1, 50), 90);
      sp.nearMesh.castShadow = this.presetName === 'high' || this.presetName === 'ultra';
      sp.nearMesh.userData.noOutline = true;
      sp.impMesh.raycast = () => {};
    }
    this._hideSpecimenInstances();
    this._buildTurf();

    const [hdr, dry, dryN, dryR, wet, grass, wallC, wallN, cloudsTex, station, clip, lens, guide, flask, pencils, stool, stake, trees] = await Promise.all([
      loadHDR(mf.file('sky-lilienstein-1k')),
      loadKTX2(r, mf.file('ground-dry', 'color'), { repeat: true }),
      loadKTX2(r, mf.file('ground-dry', 'normal'), { srgb: false, repeat: true }),
      loadKTX2(r, mf.file('ground-dry', 'rough'), { srgb: false, repeat: true }),
      loadKTX2(r, mf.file('ground-wet', 'color'), { repeat: true }),
      loadKTX2(r, mf.file('grass-blades')),
      loadKTX2(r, mf.file('wall-stone', 'color'), { repeat: true }),
      loadKTX2(r, mf.file('wall-stone', 'normal'), { srgb: false, repeat: true }),
      loadKTX2(r, mf.file('cloud-sprites')),
      loadGLB(r, mf.file('station-table')), loadGLB(r, mf.file('clipboard')), loadGLB(r, mf.file('hand-lens')),
      loadGLB(r, mf.file('field-guide')), loadGLB(r, mf.file('flask')), loadGLB(r, mf.file('pencils')),
      loadGLB(r, mf.file('stool')), loadGLB(r, mf.file('survey-stake')), loadGLB(r, mf.file('woodland-trees')),
    ]);
    this.sky.setEnvironment(hdr);
    this.ground.setMaps({ dry, wet, normal: dryN, rough: dryR });
    this.hills.material.map = dry.clone(); this.hills.material.map.repeat.set(1, 1); this.hills.material.needsUpdate = true;
    this.clouds.setAtlas(cloudsTex);
    this.stakeProto = stake.scene;
    this._buildStation({ station, clip, lens, guide, flask, pencils, stool });
    this._buildQuadratKit();
    this._buildWall(wallC, wallN);
    this._buildTrees(trees.scene);
    this._buildGrassCards(grass);
    this._buildMist();
    this._buildLife();
    this._buildCues();
    this.colliders.push(new THREE.Box3(new THREE.Vector3(STATION.x - 0.7, 0, STATION.z - 0.5), new THREE.Vector3(STATION.x + 0.7, 2, STATION.z + 0.5)));
    // Catalog roots that are not models.
    this.add('sun-dawn', this.sky.sun);
    for (const c of this.clouds.sprites) this.add('clouds', c);
    this.add('hills', this.hills);
    this.add('soil', this.soil);
    this.add('stream', this.stream);
    this.add('wet-ground', this.ground.wetPatch);
    this.add('dry-ground', this.ground.dryPatch);
  }

  /** Stream tier: loaded after the first click (plan §7 download gate). */
  startStreaming() {
    if (this._streaming) return this._streaming;
    const r = this.engine.renderer, mf = this.mf;
    this._streaming = Promise.all([
      loadGLB(r, mf.file('boulder')), loadGLB(r, mf.file('fern')), loadGLB(r, mf.file('margin-gazania')),
      loadGLB(r, mf.file('margin-celandine')), loadGLB(r, mf.file('margin-periwinkle')), loadGLB(r, mf.file('fallen-log')),
      loadGLB(r, mf.file('hedge-nettle')), loadGLB(r, mf.file('hedge-undergrowth')), loadGLB(r, mf.file('woodland-stump')),
      loadGLB(r, mf.file('woodland-branches')),
      loadKTX2(r, mf.file('stream-mud', 'color'), { repeat: true }), loadKTX2(r, mf.file('stream-mud', 'normal'), { srgb: false, repeat: true }),
      loadKTX2(r, mf.file('soil', 'color'), { repeat: true }), loadKTX2(r, mf.file('soil', 'normal'), { srgb: false, repeat: true }),
    ]).then(([boulder, fern, gaz, cel, peri, log, nettle, under, stump, branches, mudC, mudN, soilC, soilN]) => {
      const bm = this.stream.userData.bankMaterial;
      bm.map = mudC; bm.normalMap = mudN; bm.color.set(0xffffff); bm.needsUpdate = true;
      this.soil.material.map = soilC; this.soil.material.normalMap = soilN; this.soil.material.color.set(0xffffff); this.soil.material.needsUpdate = true;
      this._buildDressing({ boulder, fern, log, stump, branches });
      this._buildHedgeFoot({ nettle, under });
      this._buildMarginFlowers({ gaz, cel, peri });
      this.streamed = true;
      this._registerAll(['fallen-log', 'margin-flowers']);
      this.onStreamed?.();
    }).catch((e) => console.warn('Meadow detail not streamed:', e.message));
    return this._streaming;
  }

  // ------------------------------------------------------------------ species
  _buildSpecimens() {
    // One to three plants per species near the places learners stand (the
    // station, the stream, the dry rise): drawn as their own meshes at model
    // size (scale 1), so each species has a clickable plant with a true box.
    const spots = [[50, 9], [16, 30], [82, 55], [44, 22]];
    this.specimens = new Map();
    const g = new THREE.Group();
    g.name = 'species-specimens';
    this.group.add(g);
    this._specimenGroup = g;
    for (const sp of this.species) {
      const pts = this.population.positions[sp.id] || [];
      const chosen = [];
      for (const [sx, sz] of spots) {
        let best = null, bd = Infinity;
        for (const p of pts) {
          if (chosen.includes(p)) continue;
          const d = Math.hypot(p.x - sx, p.z - sz);
          if (d < bd) { bd = d; best = p; }
        }
        if (best && bd < 14) chosen.push(best);
        if (chosen.length >= 3) break;
      }
      if (!chosen.length && pts.length) chosen.push(pts[0]);
      this.specimens.set(sp.id, chosen.map((p) => ({ x: p.x, z: p.z, mesh: null })));
    }
  }

  _hideSpecimenInstances() {
    // A depth- and colour-less copy of the species model: drawn nowhere, but
    // the inspect system raycasts it. bindPicking() moves it onto the plant
    // under the pointer, so hovering or clicking any near plant names that
    // plant and frames it, not the whole species mesh.
    const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
    this.proxies = new Map();
    for (const [id, list] of this.specimens) {
      const sp = this.vegetation.species.get(id);
      for (const s of list) {
        const orig = this.vegetation.hideInstance(id, s.x, s.z);
        const mesh = new THREE.Mesh(sp.geometry, sp.windMat);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        if (orig) orig.decompose(pos, q, sc); else pos.set(s.x, terrainHeight(s.x, s.z), s.z);
        mesh.position.copy(pos);
        mesh.quaternion.copy(q);
        mesh.castShadow = this.presetName === 'high' || this.presetName === 'ultra'; // like the plants around it
        mesh.receiveShadow = true;
        mesh.name = `${id}-specimen`;
        mesh.userData.scaleFrame = 'local'; // turned like the plant it replaces: measure in its own axes
        this._specimenGroup.add(mesh);
        s.mesh = mesh;
        this.add(id, mesh);
      }
      const proxy = new THREE.Mesh(sp.geometry, ghost);
      proxy.matrixAutoUpdate = false;
      proxy.matrix.makeTranslation(0, -100, 0);
      proxy.name = `${id}-pointer-proxy`;
      proxy.castShadow = false;
      proxy.userData.noOutline = false;
      this.group.add(proxy);
      this.proxies.set(id, proxy);
      this.add(id, proxy);
    }
  }

  /** Move a species' pointer proxy onto the near plant under the pointer (hover, tap). */
  bindPicking() {
    const el = this.engine.renderer.domElement;
    let last = 0;
    const move = (e, force) => {
      const insp = this.app.inspect;
      if (this.counting || !insp?.enabled || insp.selected) return;
      const now = performance.now();
      if (!force && now - last < 70) return;
      last = now;
      const hit = this.plantAt(e.clientX, e.clientY, { nearOnly: true });
      if (!hit?.matrix) return;
      const proxy = this.proxies.get(hit.id);
      proxy.matrix.copy(hit.matrix);
      proxy.matrixWorldNeedsUpdate = true;
      proxy.updateMatrixWorld(true);
    };
    el.addEventListener('pointermove', (e) => move(e, false));
    el.addEventListener('pointerdown', (e) => move(e, true), { capture: true });
  }

  /**
   * The drawn plant nearest a ground point (the hand lens never zooms on bare
   * ground): near instances and the catalog specimens. With `quadrat` only
   * plants whose base is inside that frame count.
   * @returns {{ id: string, base: THREE.Vector3, point: THREE.Vector3 }|null} point: the leaves and flower head (upper part of the plant)
   */
  plantNear(p, { quadrat = null, maxD = 1.5, exact = false } = {}) {
    if (exact) maxD = 0.05; // p is a plant's base (a plant the pointer hit)
    const h = QUADRAT_SIZE / 2;
    const inside = quadrat ? (x, z) => Math.abs(x - quadrat.x) <= h && Math.abs(z - quadrat.z) <= h : null;
    // A counted species first (the lens is for identification); Bunchgrass, the dense cover
    // species, only when no other plant is within reach.
    const best = (!exact && this.vegetation.nearestDrawn(p.x, p.z, maxD, inside, new Set(['bunchgrass']))) || this.vegetation.nearestDrawn(p.x, p.z, maxD, inside);
    let out = best ? { id: best.id, base: new THREE.Vector3(best.x, best.y, best.z), height: best.height, d: best.d } : null;
    for (const [id, list] of this.specimens) for (const s of list) {
      const m = s.mesh;
      if (!m || (inside && !inside(m.position.x, m.position.z)) || (!exact && id === 'bunchgrass' && out)) continue;
      const d = Math.hypot(m.position.x - p.x, m.position.z - p.z);
      if (d < maxD && (!out || d < out.d)) {
        m.geometry.boundingBox || m.geometry.computeBoundingBox();
        out = { id, base: m.position.clone(), height: m.geometry.boundingBox.max.y * m.scale.y, d };
      }
    }
    if (!out) return null;
    return { id: out.id, base: out.base, point: out.base.clone().add(new THREE.Vector3(0, Math.max(0.05, out.height * 0.75), 0)) };
  }

  /** Raycast the near plants (and specimens) at a client point: { id, base, point } or null. */
  plantAt(x, y, { quadrat = null, nearOnly = false } = {}) {
    const el = this.engine.renderer.domElement;
    const r = el.getBoundingClientRect();
    this._ray ||= new THREE.Raycaster();
    this._ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.engine.camera);
    const targets = [];
    for (const sp of this.vegetation.species.values()) targets.push(sp.nearMesh);
    for (const list of this.specimens.values()) for (const s of list) targets.push(s.mesh);
    const hits = this._ray.intersectObjects(targets, false);
    for (const h of hits) {
      let id = null, base = null, matrix = null;
      for (const [sid, sp] of this.vegetation.species) {
        if (h.object === sp.nearMesh) { id = sid; matrix = new THREE.Matrix4(); sp.nearMesh.getMatrixAt(h.instanceId, matrix); base = new THREE.Vector3().setFromMatrixPosition(matrix); }
      }
      if (nearOnly && !matrix) return null; // a specimen is in front: it is a root itself
      if (!id) for (const [sid, list] of this.specimens) for (const s of list) if (s.mesh === h.object) { id = sid; base = s.mesh.position.clone(); }
      if (!id) continue;
      if (quadrat && (Math.abs(base.x - quadrat.x) > QUADRAT_SIZE / 2 || Math.abs(base.z - quadrat.z) > QUADRAT_SIZE / 2)) continue;
      return { id, base, matrix, point: h.point.clone() };
    }
    return null;
  }

  _buildTurf() {
    const list = turfPlacements(this.preset.vegetationDensity ?? 0.7).filter((t) => t.inField || channelDepth(t.x, t.z) < 0.02);
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const cx = Math.cos(a) * 0.35, cz = Math.sin(a) * 0.35;
      pos.push(-0.12 * Math.sin(a), 0, 0.12 * Math.cos(a), 0.12 * Math.sin(a), 0, -0.12 * Math.cos(a), cx, 1, cz);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = 'meadow-turf';
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const lush = new THREE.Color(0x587f3a), dry = new THREE.Color(0xa9a062), c = new THREE.Color();
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      const span = t.inField ? 0.05 : t.h * 0.7;
      s.set(span, t.h, span);
      m.compose(p.set(t.x, t.inField ? t.y : groundY(t.x, t.z), t.z), q, s);
      mesh.setMatrixAt(i, m);
      c.lerpColors(dry, lush, Math.min(1, t.wet * 1.1 + (t.inField ? 0.1 : 0.45)));
      c.offsetHSL((t.tone - 0.5) * 0.04, 0, (t.tone - 0.5) * 0.12);
      mesh.setColorAt(i, c);
    });
    mesh.raycast = () => {};
    this.turf = mesh;
    this.group.add(mesh);
  }

  // ------------------------------------------------------------------ station
  _buildStation({ station, clip, lens, guide, flask, pencils, stool }) {
    const g = new THREE.Group();
    g.name = 'field-station';
    g.position.set(STATION.x, terrainHeight(STATION.x, STATION.z), STATION.z);
    g.rotation.y = Math.PI; // the long side faces into the meadow
    this.group.add(g);
    this.stationGroup = g;
    const shadows = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const table = station.scene;
    shadows(table);
    table.userData.scaleFrame = 'local';
    g.add(table);
    this.add('field-station', table);
    const top = 0.8;
    const clipboard = clip.scene;
    shadows(clipboard);
    clipboard.position.set(0.22, top, 0.05);
    clipboard.rotation.y = Math.PI; // reads from the meadow side
    clipboard.userData.scaleFrame = 'local';
    // The data sheet the learner fills (drawn on a canvas, updated as they count).
    this.sheet = tx.clipboardSheet();
    clipboard.updateMatrixWorld(true);
    const cb = new THREE.Box3().setFromObject(clipboard);
    const size = cb.getSize(new THREE.Vector3());
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.86, size.z * 0.8), new THREE.MeshStandardMaterial({ map: this.sheet.texture, roughness: 0.9 }));
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(0, size.y * 0.55, -size.z * 0.04);
    paper.name = 'data-sheet-paper';
    paper.userData.noOutline = true;
    clipboard.add(paper);
    g.add(clipboard);
    this.clipboard = clipboard;
    this.add('clipboard', clipboard);
    const hl = lens.scene;
    shadows(hl);
    // The lens lies flat on the table (its handle points along the table).
    hl.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    hl.position.set(-0.12, top + 0.014, 0.12);
    hl.userData.scaleFrame = 'local';
    g.add(hl);
    this.handLens = hl;
    this.add('hand-lens', hl);
    const book = guide.scene;
    book.traverse((o) => { if (o.name === 'binder_notebook') o.visible = false; });
    shadows(book);
    book.position.set(-0.42, top, -0.05);
    book.rotation.y = 0.3;
    g.add(book);
    const fl = flask.scene; shadows(fl); fl.position.set(0.46, top, -0.2); g.add(fl);
    const pc = pencils.scene; shadows(pc); pc.position.set(-0.3, top + 0.04, 0.2); pc.rotation.y = 1.2; g.add(pc);
    const st = stool.scene; shadows(st); st.position.set(-0.95, 0, 0.55); st.rotation.y = 0.5; g.add(st);
    this.fieldGuideProp = book;
  }

  /** The quadrat kit by the table: one frame laid out flat, two stacked, three spare stakes. */
  _buildQuadratKit() {
    this.frameGeo = quadratFrameGeometry();
    this.frameMat = new THREE.MeshStandardMaterial({ map: tx.quadratTexture(), roughness: 0.45, metalness: 0.35 });
    const lay = (x, z, y, rot) => {
      const f = new THREE.Mesh(this.frameGeo, this.frameMat);
      f.position.set(x, y, z);
      f.rotation.y = rot;
      f.castShadow = true;
      f.receiveShadow = true;
      f.userData.scaleFrame = 'local';
      f.name = 'quadrat-frame';
      this.group.add(f);
      return f;
    };
    const kx = STATION.x - 2.6, kz = STATION.z + 0.6;
    this.add('quadrat', lay(kx, kz, terrainHeight(kx, kz) + 0.016, 0));
    const sx = STATION.x + 2.2, sz = STATION.z - 0.2;
    for (let k = 0; k < 2; k++) this.add('quadrat', lay(sx, sz, terrainHeight(sx, sz) + 0.016 + k * 0.03, 0.06 * k));
    for (let k = 0; k < 3; k++) {
      const s = this._stake(k + 1);
      // lying on the ground beside the frames, ready to use
      s.rotation.set(0, 0.2 * k, Math.PI / 2);
      const x = STATION.x + 1.4 + k * 0.12, z = STATION.z + 0.9 + k * 0.05;
      s.position.set(x, terrainHeight(x, z) + 0.03, z);
      this.group.add(s);
      this.add('random-sampling', s);
    }
  }

  _stake(n) {
    const s = this.stakeProto.clone(true);
    s.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; // a 4 cm stake: its shadow cost a draw per cascade per stake
      if (o.material?.name === 'number-plate') { o.material = o.material.clone(); o.material.map = tx.numberPlateTexture(n); o.material.color?.set(0xffffff); o.material.needsUpdate = true; }
      if (o.material?.name === 'flagging-tape') s.userData.tape = o;
    });
    s.userData.scaleFrame = 'local';
    s.name = `survey-stake-${n}`;
    return s;
  }

  // ------------------------------------------------------------------ wall, trees, dressing
  _buildWall(colorMap, normalMap) {
    const rnd = seeded(4242);
    const stoneGeo = new THREE.DodecahedronGeometry(0.24, 0); // split-stone facets; detail 1 cost 169k triangles
    const mat = new THREE.MeshStandardMaterial({ map: colorMap, normalMap, roughness: 0.95, color: 0xd8d2c4 });
    colorMap.repeat.set(1, 1);
    const pl = [];
    const gap = streamX(WALL_Z);
    for (let x = -14; x <= 114; x += 0.4) {
      if (x > GATE_X[0] && x < GATE_X[1]) continue;
      if (Math.abs(x - gap) < 2.4) continue;
      const g = groundY(x, WALL_Z);
      for (let row = 0; row < 4; row++) pl.push({ x: x + (row % 2) * 0.2 + (rnd() - 0.5) * 0.08, y: g + 0.15 + row * 0.24, z: WALL_Z + (rnd() - 0.5) * 0.1, row });
    }
    const stones = new THREE.InstancedMesh(stoneGeo, mat, pl.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    pl.forEach((st, i) => {
      e.set(rnd() * 3, rnd() * 3, rnd() * 3);
      q.setFromEuler(e);
      const cap = st.row === 3;
      s.set(cap ? 0.75 : 1 + rnd() * 0.45, cap ? 1.15 : 0.62 + rnd() * 0.25, cap ? 0.85 : 1.0 + rnd() * 0.3);
      m.compose(p.set(st.x, st.y + (cap ? 0.06 : 0), st.z), cap ? q.setFromEuler(e.set(0, rnd() * 3, 1.45)) : q, s);
      stones.setMatrixAt(i, m);
    });
    stones.castShadow = this.presetName === 'high' || this.presetName === 'ultra'; // 169k triangles per cascade on Medium
    stones.receiveShadow = true;
    stones.name = 'dry-stone-wall';
    const wall = new THREE.Group();
    wall.name = 'stone-wall';
    wall.add(stones);
    // Five-bar gate, swung open into the field, with two posts (weathered oak).
    const wood = new THREE.MeshStandardMaterial({ map: tx.woodTexture(), roughness: 0.85 });
    const bar = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const gy = groundY(50, WALL_Z);
    for (const px of GATE_X) {
      const post = new THREE.Mesh(bar(0.2, 1.5, 0.2), wood);
      post.position.set(px, gy + 0.75, WALL_Z);
      post.castShadow = true;
      wall.add(post);
    }
    const parts = [];
    for (let b = 0; b < 5; b++) parts.push(bar(2.9, 0.09, 0.06).translate(1.5, 0.3 + b * 0.22, 0));
    for (const bx of [0.08, 2.9]) parts.push(bar(0.1, 1.2, 0.08).translate(bx, 0.75, 0));
    parts.push(bar(3.1, 0.08, 0.05).rotateZ(0.3).translate(1.5, 0.75, 0.02));
    const gate = new THREE.Mesh(mergeGeometries(parts.map((x) => x.toNonIndexed())), wood);
    gate.position.set(GATE_X[0] + 0.1, gy, WALL_Z);
    gate.rotation.y = -1.1;
    gate.castShadow = true;
    gate.name = 'five-bar-gate';
    wall.add(gate);
    this.group.add(wall);
    this.add('stone-wall', wall);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-14, -1, WALL_Z - 0.4), new THREE.Vector3(GATE_X[0], 3, WALL_Z + 0.4)));
  }

  /** Hedgerow (own-work hedge shrubs), woodland edge (clustered trees), hill groves (impostors). */
  _buildTrees(root) {
    const node = (n) => root.getObjectByName(n);
    const rnd = seeded(808);
    const far = this.preset.features?.impostorFar ?? 250;
    // Hedgerow: shrubs every ~3.6 m along the north boundary, gap at the stream.
    const hedgePl = [];
    for (let x = -6; x <= 104; x += 3.4 + rnd() * 0.6) {
      if (Math.abs(x - streamX(HEDGE_Z)) < 2.6) continue;
      const z = HEDGE_Z + (rnd() - 0.5) * 0.8;
      hedgePl.push({ x, z, y: groundY(x, z) - 0.05, rot: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.3 });
    }
    // A few hedgerow trees (small tree form) standing in the hedge line.
    const hedgeTrees = [-2, 27, 61, 92].map((x) => ({ x, z: HEDGE_Z + 0.4, y: groundY(x, HEDGE_Z + 0.4) - 0.05, rot: rnd() * 6.28, scale: 0.9 + rnd() * 0.2 }));
    const hedge = new THREE.Group();
    hedge.name = 'hedgerow';
    this.group.add(hedge);
    this.hedgeShrubs = new LodSet(hedge, { name: 'hedge-shrubs', levels: [node('hedge-shrub-LOD0'), node('hedge-shrub-LOD1')], near: [LOD0_NEAR], far: Infinity, impostor: null, placements: hedgePl, castShadow: true });
    const tLevels = [node('tree-small-LOD0'), node('tree-small-LOD1')];
    const impSmall = bakeImpostor(this.engine.renderer, node('tree-small-LOD0'));
    const impTall = bakeImpostor(this.engine.renderer, node('tree-tall-LOD0'));
    this.hedgeTrees = new LodSet(hedge, { name: 'hedge-trees', levels: tLevels, near: [LOD0_NEAR], far, impostor: impSmall, placements: hedgeTrees, castShadow: true });
    this.add('hedgerow', hedge);
    this.hedgeGroup = hedge;
    // Woodland edge: groves (clusters) of tall and small trees beyond the hedge.
    const wood = new THREE.Group();
    wood.name = 'woodland-edge';
    this.group.add(wood);
    const tall = [], small = [];
    const groves = [[-12, 125, 6], [14, 120, 7], [38, 128, 8], [60, 121, 6], [83, 127, 8], [108, 122, 6], [24, 140, 7], [72, 142, 7], [-6, 146, 5], [98, 145, 6]];
    for (const [gx, gz, n] of groves) for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 8.5;
      const x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
      const p = { x, z, y: groundY(x, z) - 0.1, rot: rnd() * 6.28, scale: 0.8 + rnd() * 0.35 };
      (k % 3 === 2 ? small : tall).push(p);
    }
    // Single trees between the groves.
    for (let k = 0; k < 10; k++) { const x = -20 + rnd() * 140, z = 114 + rnd() * 36; small.push({ x, z, y: groundY(x, z) - 0.1, rot: rnd() * 6.28, scale: 0.8 + rnd() * 0.3 }); }
    this.woodTall = new LodSet(wood, { name: 'woodland-tall', levels: [node('tree-tall-LOD0'), node('tree-tall-LOD1')], near: [LOD0_NEAR], far, impostor: impTall, placements: tall, castShadow: true });
    this.woodSmall = new LodSet(wood, { name: 'woodland-small', levels: tLevels, near: [LOD0_NEAR], far, impostor: impSmall, placements: small, castShadow: true });
    // Groves on the hills (seen as impostors from the meadow).
    const hillTrees = [];
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2;
      const c = [50 + Math.cos(a) * (235 + rnd() * 60), 50 + Math.sin(a) * (235 + rnd() * 60)];
      const n = 5 + Math.floor(rnd() * 8);
      for (let j = 0; j < n; j++) {
        const x = c[0] + (rnd() - 0.5) * 22, z = c[1] + (rnd() - 0.5) * 22;
        hillTrees.push({ x, z, y: this.hills.userData.heightAt(x, z) - 0.3, rot: rnd() * 6.28, scale: 0.8 + rnd() * 0.4 });
      }
    }
    this.hillGroves = new LodSet(wood, { name: 'hill-groves', levels: [node('tree-tall-LOD0'), node('tree-tall-LOD1')], near: [LOD0_NEAR], far, impostor: impTall, placements: hillTrees, castShadow: false });
    this.add('woodland-edge', wood);
    this.woodGroup = wood;
    this.lodSets = [this.hedgeShrubs, this.hedgeTrees, this.woodTall, this.woodSmall, this.hillGroves];
  }

  /** Long grass cards at the field margins (wind root), never inside the field. */
  _buildGrassCards(map) {
    const rnd = seeded(5150);
    const pl = [];
    const n = Math.round(5200 * Math.min(1, (this.preset.vegetationDensity ?? 0.7) / 0.7));
    while (pl.length < n) {
      const side = Math.floor(rnd() * 4);
      const t = rnd() * 124 - 12, o = 1.6 + rnd() * 6.5;
      const x = side === 0 ? t : side === 1 ? t : side === 2 ? -o : FIELD_SIZE + o;
      const z = side === 0 ? -o : side === 1 ? FIELD_SIZE + o : t;
      if (!outsideField(x, z, 1.5) || channelDepth(x, z) > 0.02 || (z < WALL_Z + 0.8 && z > WALL_Z - 0.8)) continue;
      pl.push({ x, z, h: 0.35 + rnd() * 0.3, rot: rnd() * Math.PI, tone: rnd() });
    }
    const quad = (a) => new THREE.PlaneGeometry(0.6, 1, 1, 3).translate(0, 0.5, 0).rotateY(a);
    const geo = mergeGeometries([quad(0), quad(Math.PI / 2)]);
    const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    // Same GPU wind as the counted species (shared uniforms set in addMotion).
    this.grassMat = mat;
    const mesh = new THREE.InstancedMesh(geo, mat, pl.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    pl.forEach((g, i) => {
      q.setFromAxisAngle(up, g.rot);
      s.set(g.h * 0.9, g.h, g.h * 0.9);
      m.compose(p.set(g.x, groundY(g.x, g.z) - 0.03, g.z), q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHSL(0.2 + g.tone * 0.05, 0.35, 0.55 + g.tone * 0.15));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.name = 'margin-long-grass';
    mesh.userData.noOutline = true;
    this.group.add(mesh);
    this.grassCards = mesh;
    this.add('wind', mesh);
  }

  _buildDressing({ boulder, fern, log, stump, branches }) {
    const place = (src, x, z, rot, scale = 1, sink = 0.04, shadows = true) => {
      const o = src.clone(true);
      o.position.set(x, groundY(x, z) - sink, z);
      o.rotation.y = rot;
      o.scale.setScalar(scale);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = true; } });
      this.group.add(o);
      return o;
    };
    for (const [x, z, r] of [[-8, -7, 0.3], [108, -6, 1.7], [109, 30, 2.5], [-9, 96, 0.9], [110, 88, 2.1]]) place(boulder.scene, x, z, r, 1, 0.1);
    const ferns = new THREE.Group();
    ferns.name = 'stream-ferns';
    this.group.add(ferns);
    for (const [x, z, r] of [[streamX(-6) - 2.2, -6, 0.4], [streamX(-9) + 2.3, -9.5, 1.9], [streamX(-14) - 2.4, -14, 2.6], [streamX(106) - 2.2, 106, 1.1], [streamX(110) + 2.4, 110, 0.2], [streamX(113) - 2.5, 113, 2.2]]) {
      ferns.attach(place(fern.scene, x, z, r, 1, 0.02, false));
    }
    instancify(ferns); // six ferns, four parts each: four draws instead of 24
    this.add('stream', ferns);
    const lg = place(log.scene, 109, 62, Math.PI / 2, 1, 0.06);
    lg.userData.scaleFrame = 'local';
    this.add('fallen-log', lg);
    const stp = place(stump.scene, 30, 113.5, 0.8, 1, 0.05);
    const br = place(branches.scene, 44, 114, 1.4, 1, 0.02);
    this.woodGroup.attach(stp);
    this.woodGroup.attach(br);
  }

  _buildHedgeFoot({ nettle, under }) {
    const rnd = seeded(31);
    const nettles = lodPick(nettle.scene.children.filter((o) => o.isMesh || o.children.length));
    const shrubs = lodPick(under.scene.children); // about 12k triangles each: about one spot in twelve
    const foot = new THREE.Group();
    foot.name = 'hedge-foot';
    this.hedgeGroup.add(foot);
    for (let x = -4; x < 103; x += 1.1 + rnd() * 1.4) {
      if (Math.abs(x - streamX(HEDGE_Z)) < 3) continue;
      const parts = rnd() < 0.08 ? shrubs : nettles;
      const src = parts[Math.floor(rnd() * parts.length)];
      const o = src.clone(true);
      const z = HEDGE_Z - 1.3 - rnd() * 0.6;
      o.position.set(x, groundY(x, z) - 0.02, z);
      o.rotation.y = rnd() * 6.28;
      o.scale.setScalar(1 + rnd() * 0.25); // real scan size (no upscaling)
      o.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; } });
      foot.add(o);
    }
    instancify(foot);
  }

  _buildMarginFlowers({ gaz, cel, peri }) {
    const rnd = seeded(77);
    const sets = [peri, gaz, cel].map((glb) => lodPick(glb.scene.children.filter((o) => o.isObject3D)));
    const spots = [];
    for (let x = 6; x < 100; x += 2.2 + rnd() * 2) spots.push([x, -6.2 - rnd() * 1.6]);
    for (let x = 4; x < 100; x += 2.4 + rnd() * 2.4) spots.push([x, HEDGE_Z - 2.6 - rnd() * 0.8]);
    for (let z = 6; z < 96; z += 3 + rnd() * 3) spots.push([FIELD_SIZE + 5.2 + rnd() * 1.5, z]);
    this.flowerSpots = spots.filter(([x, z]) => outsideField(x, z, DRESSING_MIN_OFFSET) && channelDepth(x, z) < 0.02);
    const put = (src, x, z, rot, parent) => {
      const o = src.clone(true);
      o.position.set(x, groundY(x, z) - 0.01, z);
      o.rotation.set(0, rot, 0);
      o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
      parent.add(o);
      return o;
    };
    // The measured clump (catalog realSize): one periwinkle_plant_01, first in the scene graph.
    const first = peri.scene.getObjectByName('periwinkle_plant_01_LOD0') || sets[0][0];
    const [fx, fz] = this.flowerSpots[0];
    const clump = put(first, fx, fz, 0, this.group);
    clump.userData.scaleFrame = 'local';
    this.add('margin-flowers', clump);
    const g = new THREE.Group();
    g.name = 'margin-flowers';
    this.group.add(g);
    this.flowerSpots.slice(1).forEach(([x, z], i) => {
      const set = sets[(i + 1) % 3];
      put(set[Math.floor(rnd() * set.length)], x, z, rnd() * 6.28, g);
    });
    instancify(g);
    this.add('margin-flowers', g);
    this.marginFlowers = g;
  }

  // ------------------------------------------------------------------ mist, life, cues
  _buildMist() {
    const tex = tx.mistTexture();
    this.mistMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xf1ede6, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    this.mistBanks = [];
    for (const z of [-30, -12, 18, 46, 74, 112, 132]) {
      const bank = new THREE.Group();
      bank.name = 'mist-bank';
      for (let k = 0; k < 3; k++) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(26, 20).rotateX(-Math.PI / 2), this.mistMat);
        sheet.position.y = k;
        sheet.rotation.y = k * 0.0;
        sheet.renderOrder = 3;
        bank.add(sheet);
      }
      bank.position.set(streamX(z) + 2, Math.min(terrainHeight(streamX(z), z), 7) + 0.25, z);
      bank.userData.baseX = bank.position.x;
      this.group.add(bank);
      this.mistBanks.push(bank);
      this.add('mist', bank);
    }
  }

  _buildLife() {
    const lifeScale = this.presetName === 'low' ? 0.6 : 1;
    // Butterflies on loops over the margins (never over the field interior).
    const paths = [
      [[-6, 1.2, 20], [-3, 1.8, 32], [-7, 1.4, 44], [-9, 2.0, 30]],
      [[20, 1.3, 104], [32, 1.9, 105.5], [44, 1.4, 103], [30, 1.7, 102]],
      [[60, 1.4, 104], [72, 2.0, 105.5], [84, 1.3, 103], [70, 1.6, 102]],
      [[104.5, 1.2, 14], [107, 1.8, 26], [104, 1.4, 34], [102.5, 1.7, 22]],
      [[22, 1.0, -6], [34, 1.6, -8], [40, 1.2, -5], [30, 1.4, -4.5]],
      [[56, 1.0, -6.5], [64, 1.5, -8.5], [70, 1.1, -5.5], [62, 1.3, -4.8]],
    ];
    const colours = ['#f2c230', '#f6a65a', '#f4f1e6', '#e8a33d', '#cfd9e6', '#f2c230'];
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.026, 0, -0.01, 0.022, 0, 0.018, 0, 0, 0, 0.022, 0, 0.018, 0.004, 0, 0.022], 3));
    wingGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 0, 1, 1, 0, 0.5, 1, 1, 0.3, 1], 2));
    wingGeo.computeVertexNormals();
    const bodyGeo = new THREE.CapsuleGeometry(0.0025, 0.016, 2, 6).rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ map: tx.beeTexture(), color: 0x3a2a1c, roughness: 0.8 });
    this.butterflies = paths.slice(0, Math.round(paths.length * lifeScale)).map((path, i) => {
      const b = new THREE.Group();
      b.name = `butterfly-${i}`;
      const wm = new THREE.MeshStandardMaterial({ map: tx.wingTexture(colours[i], i + 3), side: THREE.DoubleSide, roughness: 0.7 });
      const wings = [-1, 1].map((sd) => { const p = new THREE.Group(); const w = new THREE.Mesh(wingGeo, wm); w.scale.x = sd; p.add(w); p.userData.side = sd; b.add(p); return p; });
      b.add(new THREE.Mesh(bodyGeo, bodyMat));
      b.userData.wings = wings;
      b.userData.path = path.map(([x, y, z]) => new THREE.Vector3(x, groundY(x, z) + y, z));
      b.userData.curve = new THREE.CatmullRomCurve3(b.userData.path, true);
      b.userData.u = i / 6;
      b.userData.restSize = [0.05, 0.01, 0.04];
      this.group.add(b);
      this.add('butterflies', b);
      return b;
    });
    // Bees: hop between the margin flower spots (set once the flowers stream in).
    const beeGeo = new THREE.CapsuleGeometry(0.004, 0.009, 2, 8).rotateX(Math.PI / 2);
    const beeWing = new THREE.MeshStandardMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.55, roughness: 0.3, map: tx.clothTexture(2) });
    const beeMat = new THREE.MeshStandardMaterial({ map: tx.beeTexture(), roughness: 0.7 });
    const bwGeo = new THREE.BufferGeometry();
    bwGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.007, 0.002, -0.003, 0.006, 0.002, 0.004], 3));
    bwGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
    bwGeo.computeVertexNormals();
    this.bees = [];
    const beeHomes = [[24, -6.6], [26, -7.2], [37, -6.4], [63, -6.8], [80, -6.2], [106, 18], [106.5, 40], [30, HEDGE_Z - 3]];
    beeHomes.slice(0, Math.round(8 * lifeScale)).forEach(([x, z], i) => {
      const b = new THREE.Group();
      b.name = `bee-${i}`;
      b.add(new THREE.Mesh(beeGeo, beeMat));
      for (const sd of [-1, 1]) { const w = new THREE.Mesh(bwGeo, beeWing); w.scale.x = sd; w.position.y = 0.003; b.add(w); }
      b.position.set(x, groundY(x, z) + 0.3, z);
      b.userData = { home: new THREE.Vector3(x, 0, z), from: b.position.clone(), to: b.position.clone(), t: 1, wait: i * 0.4, restSize: [0.015, 0.01, 0.012] };
      this.group.add(b);
      this.bees.push(b);
      this.add('bees', b);
    });
    // Birds crossing between the hedgerow and the woodland, 6-14 m up.
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.07, 0.02, 0, -0.06, -0.02, 0, -0.06, 0, 0.012, 0.0], 3));
    birdGeo.setIndex([0, 1, 3, 0, 3, 2, 0, 2, 1, 1, 2, 3]);
    birdGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 1, 1, 0, 1, 0.5, 0.5], 2));
    birdGeo.computeVertexNormals();
    const bwing = new THREE.BufferGeometry();
    bwing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.12, 0, 0.0, 0, 0, -0.04], 3));
    bwing.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 0, 1], 2));
    bwing.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ map: tx.featherTexture(), side: THREE.DoubleSide, roughness: 0.85 });
    this.birds = [0, 1, 2, 3].slice(0, Math.max(2, Math.round(4 * lifeScale))).map((i) => {
      const b = new THREE.Group();
      b.name = `bird-${i}`;
      b.add(new THREE.Mesh(birdGeo, fm));
      const wings = [-1, 1].map((sd) => { const w = new THREE.Mesh(bwing, fm); w.scale.x = sd; b.add(w); return w; });
      b.userData = { wings, phase: i * 1.7, lane: i, restSize: [0.25, 0.05, 0.15] };
      b.scale.setScalar(1);
      this.group.add(b);
      this.add('birds', b);
      return b;
    });
    // Pollen and dust motes in the low sun around the station and the south half.
    const motes = 220;
    const mp = new Float32Array(motes * 3);
    const rnd = seeded(66);
    for (let i = 0; i < motes; i++) { mp[i * 3] = 30 + rnd() * 40; mp[i * 3 + 1] = 0.3 + rnd() * 2.4; mp[i * 3 + 2] = -6 + rnd() * 36; }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ map: tx.moteTexture(), color: 0xffe6b0, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false }));
    this.motes.name = 'pollen-motes';
    this.motes.raycast = () => {};
    this.group.add(this.motes);
    // The field worker on the strip north of the field, laying out a tape.
    const worker = createAnimatedCharacter({
      id: 'field-worker', name: 'Field worker', height: 1.75, hairStyle: 'cap', outfit: 'jacket',
      topColor: 0x5c7a3e, accentColor: 0xe0a33a, bottomColor: 0x3d3a34, hairColor: 0x4a3324, skinColor: 0xb98463, prop: 'none',
    });
    const cloth = tx.clothTexture(8), skin = tx.skinTexture();
    worker.root.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.map) return;
      o.material = o.material.clone();
      o.material.map = o.material.color && o.material.color.r > 0.6 && o.material.color.g > 0.4 && o.material.color.b > 0.3 ? skin : cloth;
      o.castShadow = this.presetName === 'high' || this.presetName === 'ultra'; // 100 m off: its shadow pass is not worth 22 draws per cascade
    });
    worker.root.updateMatrixWorld(true);
    // The figure's own box: the flat contact-shadow disc under the feet (0.7 m) is not part of the person.
    const body = new THREE.Box3(), mb = new THREE.Box3();
    worker.root.traverse((o) => { if (!o.isMesh) return; mb.setFromObject(o); if (mb.max.y - mb.min.y > 0.01) body.union(mb); });
    const wb = body.getSize(new THREE.Vector3());
    worker.root.userData.restSize = [wb.x, wb.y, wb.z].map((v) => +v.toFixed(3));
    worker.root.name = 'field-worker';
    this.worker = worker;
    this.workerPath = { x0: 56, x1: 96, z: 103.6, x: 56, dir: 1, pause: 0 };
    worker.root.position.set(56, groundY(56, 103.6), 103.6);
    worker.root.rotation.y = Math.PI / 2;
    worker.setAction('walk');
    this.group.add(worker.root);
    this.add('field-worker', worker.root);
    // The tape the worker lays out (yellow measuring tape on the ground).
    const tapeTex = tx.quadratTexture();
    tapeTex.wrapS = THREE.RepeatWrapping;
    this.tape = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.016).rotateX(-Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshStandardMaterial({ color: 0xf2c230, map: tapeTex, roughness: 0.5 }));
    this.tape.name = 'measuring-tape';
    this.tape.raycast = () => {};
    this.tape.position.set(56, groundY(56, 103.6) + 0.02, 103.6);
    this.group.add(this.tape);
  }

  /** Task cues that stay visible (plan §4.2): glints, labelled in the legend. */
  _buildCues() {
    this.glints = {};
    const glint = (id, label, obj, dy) => {
      const g = createGlint(label, { size: 0.32 });
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      g.position.set((b.min.x + b.max.x) / 2, b.max.y + dy, (b.min.z + b.max.z) / 2);
      g.visible = false;
      this.group.add(g);
      this.glints[id] = g;
    };
    glint('hand-lens', 'Task glint', this.handLens, 0.22);
    glint('clipboard', 'Task glint', this.clipboard, 0.22);
    glint('field-station', 'Task glint', this.fieldGuideProp, 0.25);
    glint('quadrat', 'Task glint', this.roots.quadrat[0], 0.4);
    // Tally marks (counting view) and the quadrat preview (convenience placement).
    const ring = new THREE.RingGeometry(0.03, 0.046, 20).rotateX(-Math.PI / 2);
    this.tally = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }), 400);
    this.tally.count = 0;
    this.tally.frustumCulled = false;
    this.tally.renderOrder = 6;
    this.tally.userData.marker = { label: 'Tally mark' };
    this.tally.raycast = () => {};
    this.tally.name = 'tally-marks';
    this.group.add(this.tally);
    this.preview = new THREE.Mesh(this.frameGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.7, depthWrite: false }));
    this.preview.visible = false;
    this.preview.raycast = () => {};
    this.preview.userData.marker = { label: 'Quadrat preview' };
    this.preview.name = 'quadrat-preview';
    this.group.add(this.preview);
    this.ghosts = new THREE.InstancedMesh(new THREE.PlaneGeometry(QUADRAT_SIZE, QUADRAT_SIZE).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.35, depthWrite: false }), 400);
    this.ghosts.count = 0;
    this.ghosts.frustumCulled = false;
    this.ghosts.userData.marker = { label: 'Virtual quadrats (simulator)' };
    this.ghosts.raycast = () => {};
    this.ghosts.name = 'virtual-quadrats';
    this.group.add(this.ghosts);
  }

  legend() {
    return [
      { label: 'Task glint', text: 'A soft star above the object the current step asks you to use (the hand lens, the clipboard, the field guide, the quadrat frame).' },
      { label: 'Numbered survey stake', text: 'A wooden stake with pink tape and a number plate at the corner of each quadrat. The number matches a row on your data sheet.' },
      { label: 'Quadrat frame', text: 'A 2 m square frame with red tape every 50 cm. Count the plants whose base is inside it.' },
      { label: 'Tally mark', text: 'A small yellow ring where you tallied a plant while counting a quadrat.' },
      { label: 'Quadrat preview', text: 'A pale frame you drag over the meadow while you place quadrats by hand. Let go to drop it there.' },
      { label: 'Virtual quadrats (simulator)', text: 'Pale blue squares: the quadrats of the simulator’s virtual repeats in Module 4.' },
      // Scenery has no info card (owner decision 2026-11-07), so its motion labels live here.
      { label: 'Motion in the scene', text: 'Time-lapse: the Sun’s climb and the thinning mist. Illustrative: clouds, wind gusts, birds, butterflies, bees, pollen and the stake tape. Real pace: the stream and the colleague walking the north strip.' },
    ];
  }

  setGlint(id) { for (const [k, g] of Object.entries(this.glints || {})) g.visible = k === id; }

  // ------------------------------------------------------------------ quadrats
  /** Place frames and numbered stakes at the design's points. */
  setQuadrats(points) {
    for (const f of this.quadratFrames) { this.group.remove(f); }
    for (const s of this.stakes) { this.group.remove(s); }
    const app = this.app;
    this.quadratFrames = points.map((p) => {
      const f = new THREE.Mesh(this.frameGeo, this.frameMat);
      // Rest on the highest corner, so no bar sinks into sloping ground.
      const hq = QUADRAT_SIZE / 2;
      const y = Math.max(...[[-hq, -hq], [hq, -hq], [hq, hq], [-hq, hq], [0, 0]].map(([dx, dz]) => terrainHeight(p.x + dx, p.z + dz)));
      f.position.set(p.x, y + 0.02, p.z);
      f.castShadow = true;
      f.userData.scaleFrame = 'local';
      f.name = 'quadrat-frame';
      this.group.add(f);
      return f;
    });
    this.stakes = points.map((p, i) => {
      const s = this._stake(i + 1);
      const x = p.x - QUADRAT_SIZE / 2 - 0.08, z = p.z - QUADRAT_SIZE / 2 - 0.08;
      s.position.set(x, terrainHeight(x, z) - 0.1, z);
      s.rotation.y = Math.PI;
      this.group.add(s);
      return s;
    });
    this.roots.quadrat = [...this.roots.quadrat.slice(0, 3), ...this.quadratFrames];
    this.roots['random-sampling'] = [...this.roots['random-sampling'].slice(0, 3), ...this.stakes];
    if (app.inspect) { app.inspect.unregister('quadrat'); app.inspect.unregister('random-sampling'); this._registerAll(['quadrat', 'random-sampling']); }
    this.setActiveQuadrat(-1);
  }

  setActiveQuadrat(i) {
    this.activeQuadrat = i;
    this.quadratFrames.forEach((f, j) => { f.material = j === i ? (this._activeMat ||= this.frameMat.clone()) : this.frameMat; });
    if (this._activeMat) this._activeMat.emissive?.set(0x6a4a00);
    const p = this.quadratFrames[i]?.position;
    this.vegetation.setQuadratFocus(p ? p.x : null, p ? p.z : null);
  }

  /**
   * The kneeling view of quadrat i: the camera about 45° above the frame from
   * the south (the station side), as close as it can be while the whole 2 m
   * frame (with a margin) fits inside `free`, the part of the screen the Now
   * card leaves open, in NDC { x0, x1, y0, y1 }.
   */
  kneelView(i, free = { x0: -1, x1: 1, y0: -1, y1: 1 }) {
    const f = this.quadratFrames[i];
    if (!f) return null;
    const c = f.position.clone();
    const cam = this.engine.camera;
    const theta = Math.PI, phi = 0.8;
    const back = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
    const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
    const upv = back.clone().cross(right).normalize();
    const tmp = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.05, 100);
    const pts = [];
    for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [1.15, 1.15], [-1.15, 1.15]]) for (const y of [0, 0.45]) pts.push(new THREE.Vector3(c.x + x, c.y + y, c.z + z));
    const v = new THREE.Vector3();
    const th = Math.tan((cam.fov * Math.PI) / 360);
    const fw = (free.x1 - free.x0) * 0.96, fh = (free.y1 - free.y0) * 0.96;
    let best = null;
    for (let r = 1.6; r < 9; r += 0.05) {
      tmp.position.copy(c).addScaledVector(back, r);
      tmp.lookAt(c);
      tmp.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { v.copy(p).project(tmp); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      if (x1 - x0 <= fw && y1 - y0 <= fh) {
        // Shift the orbit target (and so the camera) so the frame centres in the free area.
        const sx = (free.x0 + free.x1) / 2 - (x0 + x1) / 2, sy = (free.y0 + free.y1) / 2 - (y0 + y1) / 2;
        const target = c.clone().addScaledVector(right, -sx * r * th * cam.aspect).addScaledVector(upv, -sy * r * th);
        best = { target: target.toArray(), radius: r, theta, phi };
        break;
      }
    }
    return best || { target: c.toArray(), radius: 3.4, theta, phi };
  }

  /** Ground point inside the active quadrat under a client point (for a tap that hits no plant). */
  groundAt(x, y) {
    const f = this.quadratFrames[this.activeQuadrat];
    if (!f) return null;
    const el = this.engine.renderer.domElement;
    const r = el.getBoundingClientRect();
    this._ray ||= new THREE.Raycaster();
    this._ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.engine.camera);
    const hit = new THREE.Vector3();
    if (!this._ray.ray.intersectPlane(new THREE.Plane(up, -f.position.y), hit)) return null;
    if (Math.abs(hit.x - f.position.x) > 1.03 || Math.abs(hit.z - f.position.z) > 1.03) return null;
    return hit;
  }

  addTally(p) {
    if (this.tally.count >= 400) return;
    this.tally.setMatrixAt(this.tally.count++, new THREE.Matrix4().makeTranslation(p.x, terrainHeight(p.x, p.z) + 0.14, p.z));
    this.tally.instanceMatrix.needsUpdate = true;
  }
  clearTally() { this.tally.count = 0; }

  /** Counting view on/off: calm, life that could sit over the frame hidden, wind at 12%. */
  setCounting(on) {
    this.counting = on;
    for (const b of this.mistBanks) b.visible = !on;
    this.motes.visible = !on;
    this.cloud.uCloudK.value = on ? 0 : 0.2;
    if (!on) { this.clearTally(); this.setActiveQuadrat(-1); }
  }

  /** The pale quadrat frame that follows the pointer; `lifted` while it is being dragged. */
  setPreview(p, { lifted = false } = {}) {
    this.preview.visible = Boolean(p);
    if (p) this.preview.position.set(p.x, terrainHeight(p.x, p.z) + (lifted ? 0.18 : 0.03), p.z);
  }

  /** Ground point in the field under a client point (convenience placement). */
  fieldPointAt(x, y) {
    const el = this.engine.renderer.domElement;
    const r = el.getBoundingClientRect();
    this._ray ||= new THREE.Raycaster();
    this._ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.engine.camera);
    const hit = this._ray.intersectObject(this.ground.field, false)[0];
    if (!hit) return null;
    const p = hit.point;
    if (p.x < 1 || p.x > FIELD_SIZE - 1 || p.z < 1 || p.z > FIELD_SIZE - 1) return null;
    return p;
  }

  setGhosts(points) {
    const m = new THREE.Matrix4();
    const n = Math.min(400, points.length);
    for (let i = 0; i < n; i++) { const p = points[i]; m.makeTranslation(p.x, terrainHeight(p.x, p.z) + 0.08, p.z); this.ghosts.setMatrixAt(i, m); }
    this.ghosts.count = n;
    this.ghosts.instanceMatrix.needsUpdate = true;
  }
  clearGhosts() { this.ghosts.count = 0; }

  highlightSpecies(id, on) { this.vegetation.setSpeciesHighlight(id, on); }

  updateSheet(sheet) { this.sheet?.draw(sheet); }

  // ------------------------------------------------------------------ inspect + motion
  registerAll() { this._registerAll(Object.keys(this.roots)); }

  _registerAll(ids) {
    const insp = this.app.inspect;
    if (!insp) return;
    for (const id of ids) {
      const list = this.roots[id];
      if (!list?.length || insp.items.has(id) || !this.app.catalog.has(id)) continue;
      insp.register(id, list, { frame: this.frames[id] || this._frameFor(id) });
    }
  }

  _frameFor(id) {
    const g = (eye, center, fov) => ({ view: { eye, center, fov } });
    const y = (x, z, h = 0) => groundY(x, z) + h;
    switch (id) {
      case 'sun-dawn': return { look: true, fitFov: true, minFov: 4, heightFrac: 0.18 };
      case 'clouds': return { look: true, fitFov: true, heightFrac: 0.5 };
      case 'hills': return g([50, 2.2, 58], [50 + 280 * Math.sin(0.2), 30, 50 + 280 * Math.cos(0.2)], 36);
      case 'woodland-edge': return g([46, 1.8, 88], [40, 6, 124], 50);
      case 'hedgerow': return g([40, 1.7, 96], [44, 1.4, HEDGE_Z], 55);
      case 'stone-wall': return g([44, 1.6, -4], [40, 0.6, WALL_Z], 55);
      case 'stream': return g([streamX(-14) + 6, y(streamX(-14) + 6, -14, 1.6), -14], [streamX(-6), y(streamX(-6), -6, 0), -6], 55);
      case 'wet-ground': return g([26, y(26, 22, 1.7), 22], [14, y(14, 30, 0), 30], 55);
      case 'dry-ground': return g([72, y(72, 32, 1.7), 32], [84, y(84, 40, 0), 40], 55);
      case 'wind': return g([60, y(60, 112, 1.5) - 7, 98], [60, y(60, 104, 0.3), 104], 50);
      case 'soil': return g([streamX(-7.5) - 0.6, y(streamX(-7.5) - 0.6, -7.5, 1.3), -7.5], [streamX(-7.5) + 1.2, y(streamX(-7.5) + 1.2, -7.5, -0.2), -7.5], 40);
      case 'mist': return g([30, y(30, 30, 2.2), 26], [streamX(46), 1.4, 46], 60);
      case 'field-worker': return { look: true, fitFov: true, heightFrac: 0.4 };
      case 'birds': return { look: true, fitFov: true, heightFrac: 0.3, minFov: 2 };
      case 'clipboard': case 'hand-lens': {
        // Flat things on the table: look down on them from the station side, so the
        // sheet (or the lens) reads face-on instead of edge-on.
        const root = this.roots[id]?.[0];
        if (!root) return {};
        const c = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
        const d = id === 'clipboard' ? 0.55 : 0.32;
        return g([c.x + 0.04, c.y + d, c.z - d * 0.55], c.toArray(), 40);
      }
      default: return {};
    }
  }

  /** Register the motion systems (plan §5.1: >= 8 across the four layers). */
  addMotion(motion) {
    const veg = this.vegetation;
    const wind = veg.windUniforms;
    wind.uGust ||= { value: 1 };
    // grass cards share the wind shader
    applyWind(this.grassMat, wind);
    this.grassMat.needsUpdate = true;
    motion.add({ id: 'sun-timelapse', layer: 'sky', label: 'time-lapse', objects: ['sun-dawn'], description: 'The Sun climbs from 3° toward 21° above the east-north-east horizon; the light warms less and brightens. Held still in calm mode.',
      update: (dt) => { if (!motion.calm && !this.sunHold) this.sky.advance(dt); } });
    motion.add({ id: 'clouds', layer: 'sky', label: 'illustrative', objects: ['clouds'], description: 'Clouds at 1-1.7 km drift on an illustrative 5.5 m/s wind; their shadows slide over the meadow.',
      update: (dt) => { this.clouds.update(dt); this.cloud.uCloudT.value += dt; } });
    motion.add({ id: 'birds', layer: 'sky', label: 'illustrative', objects: ['birds'], description: 'Small birds fly between the hedgerow and the woodland, 6-14 m up.',
      update: (dt, t) => this._updateBirds(t) });
    motion.add({ id: 'wind', layer: 'environment', label: 'illustrative', objects: ['wind'], description: 'GPU wind: sway and gust bands across the sward and the margin grass (seen from above as lighter bands rolling across the field); 12% while counting.',
      update: (dt) => {
        this.windTime += dt; wind.uTime.value = this.windTime; wind.uWind.value = this.counting ? 0.12 : 1; wind.uGust.value = this.counting ? 0 : 1;
        this.cloud.uWindT.value = this.windTime; this.cloud.uGustSheen.value = this.counting ? 0 : 0.16;
      } });
    motion.add({ id: 'mist', layer: 'environment', label: 'time-lapse', objects: ['mist'], description: 'Mist banks over the stream drift and thin as the Sun climbs (time-lapse).',
      update: (dt, t) => this._updateMist(t) });
    motion.add({ id: 'stream', layer: 'environment', label: 'accurate', objects: ['stream'], description: 'The stream surface moves with the current at about 0.25 m/s.',
      update: (dt) => { const nm = this.stream.userData.normalMap; nm.offset.y -= dt * 0.25 / 2.2; nm.offset.x += dt * 0.01; } });
    motion.add({ id: 'pollen', layer: 'environment', label: 'illustrative', objects: ['margin-flowers'], description: 'Pollen and dust motes drift in the low sunlight near the station (illustrative density).',
      update: (dt, t) => this._updateMotes(dt, t) });
    motion.add({ id: 'butterflies', layer: 'agents', label: 'illustrative', objects: ['butterflies'], description: 'Butterflies flutter on loops over the margins, never over the field interior.',
      update: (dt, t) => this._updateButterflies(dt, t) });
    motion.add({ id: 'bees', layer: 'agents', label: 'illustrative', objects: ['bees'], description: 'Bees hop from flower to flower along the margins.',
      update: (dt, t) => this._updateBees(dt, t) });
    motion.add({ id: 'field-worker', layer: 'agents', label: 'accurate', objects: ['field-worker'], description: 'A colleague walks the north strip at walking pace, laying out and reeling in a tape.',
      update: (dt, t) => this._updateWorker(dt, t) });
    motion.add({ id: 'stake-tape', layer: 'objects', label: 'illustrative', objects: ['random-sampling'], description: 'The pink flagging tape on the survey stakes flutters in the breeze.',
      update: (dt, t) => this._updateTapes(t) });
    motion.add({ id: 'clipboard-sheet', layer: 'objects', label: 'illustrative', objects: ['clipboard'], description: 'The data sheet on the clipboard fills in as you record each quadrat; its corner lifts in the breeze.',
      update: (dt, t) => { if (this.clipboard) { const paper = this.clipboard.getObjectByName('data-sheet-paper'); if (paper) paper.rotation.x = -Math.PI / 2 + Math.sin(t * 1.7) * 0.012; } } });
  }

  _birdAt(u, s, out) {
    const x0 = -30 + u.lane * 20, x1 = 140 - u.lane * 12;
    const x = x0 + (x1 - x0) * s;
    const z = HEDGE_Z + 6 + Math.sin(s * Math.PI * 2 + u.phase) * 12 + u.lane * 3;
    return out.set(x, groundY(x, z) + 6 + u.lane * 2 + Math.sin(s * Math.PI * 3) * 1.5, z);
  }

  _updateBirds(t) {
    this._bv ||= new THREE.Vector3();
    for (const b of this.birds || []) {
      const u = b.userData;
      const s = (t * 0.035 + u.phase * 0.21) % 1;
      this._birdAt(u, s, b.position);
      b.lookAt(this._birdAt(u, (s + 0.003) % 1, this._bv));
      const flap = Math.sin(t * 14 + u.phase) * 0.6 * (Math.sin(t * 0.7 + u.phase) > -0.3 ? 1 : 0.1);
      u.wings[0].rotation.z = flap; u.wings[1].rotation.z = -flap;
    }
  }

  _updateMist(t) {
    const el = this.sky.override ?? this.sky.elevation;
    const thin = THREE.MathUtils.clamp((el - 3) / 16, 0, 1);
    this._mistOpacity = 0.55 - 0.42 * thin;
    this.mistBanks.forEach((b, i) => { b.position.x = b.userData.baseX + Math.sin(t * 0.04 + i) * 2.5; b.children.forEach((sh, k) => { sh.position.y = k * (0.85 + 0.15 * thin); }); });
  }

  _updateMotes(dt, t) {
    const a = this.motes.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      a.array[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.08 + dt * 0.05;
      a.array[i * 3 + 1] += Math.cos(t * 0.4 + i * 1.3) * dt * 0.05;
      if (a.array[i * 3] > 70) a.array[i * 3] = 30;
    }
    a.needsUpdate = true;
  }

  _updateButterflies(dt, t) {
    for (const [i, b] of (this.butterflies || []).entries()) {
      const u = b.userData;
      u.u = (u.u + dt * 0.012 * (1 + 0.3 * Math.sin(t * 0.7 + i))) % 1;
      const p = u.curve.getPointAt(u.u), q = u.curve.getPointAt((u.u + 0.005) % 1);
      b.position.copy(p);
      b.position.y += Math.sin(t * 5 + i) * 0.04;
      b.lookAt(q.x, b.position.y, q.z);
      const a = 0.2 + 1.0 * (0.5 + 0.5 * Math.sin(t * 16 + i * 1.3));
      u.wings[0].rotation.z = a; u.wings[1].rotation.z = -a;
    }
  }

  _updateBees(dt, t) {
    const spots = this.flowerSpots || [];
    for (const [i, b] of this.bees.entries()) {
      const u = b.userData;
      if (u.t >= 1) {
        u.wait -= dt;
        if (u.wait > 0) { b.position.y = u.to.y + Math.sin(t * 9 + i) * 0.006; continue; }
        u.from.copy(b.position);
        const near = spots.filter(([x, z]) => Math.hypot(x - u.home.x, z - u.home.z) < 6);
        const [x, z] = near.length ? near[Math.floor((t * 7 + i * 13) % near.length)] : [u.home.x + Math.sin(t + i) * 1.5, u.home.z + Math.cos(t + i) * 0.8];
        u.to.set(x + Math.sin(i + t) * 0.12, groundY(x, z) + 0.22 + 0.08 * Math.sin(t + i), z);
        u.t = 0; u.wait = 1.5 + ((i * 7 + Math.floor(t)) % 5) * 0.6;
      }
      u.t = Math.min(1, u.t + dt / Math.max(0.4, u.from.distanceTo(u.to) / 1.6));
      b.position.lerpVectors(u.from, u.to, u.t);
      b.position.y += Math.sin(u.t * Math.PI) * 0.15 + Math.sin(t * 23 + i) * 0.004;
      b.lookAt(u.to.x, b.position.y, u.to.z);
      b.children[1].rotation.z = Math.sin(t * 60) * 0.5; b.children[2].rotation.z = -Math.sin(t * 60) * 0.5;
    }
  }

  _updateWorker(dt, t) {
    const w = this.workerPath, ch = this.worker;
    if (w.pause > 0) { w.pause -= dt; ch.setAction('idle'); }
    else {
      ch.setAction('walk');
      w.x += w.dir * 1.1 * dt; // walking pace while laying a tape
      if (w.x > w.x1 || w.x < w.x0) { w.dir *= -1; w.x = THREE.MathUtils.clamp(w.x, w.x0, w.x1); w.pause = 4; }
    }
    ch.root.position.set(w.x, groundY(w.x, w.z), w.z);
    ch.root.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    ch.update(dt, t, 1);
    const len = Math.max(0.01, w.x - w.x0);
    this.tape.scale.x = len;
    this.tape.position.y = groundY(w.x0, w.z) + 0.02;
  }

  _updateTapes(t) {
    for (const [i, s] of [...(this.roots['random-sampling'] || [])].entries()) {
      const tape = s.userData.tape;
      if (tape) tape.rotation.y = Math.sin(t * 3.1 + i * 1.7) * 0.25;
    }
  }

  /** Per frame (always, not a motion system): camera-relative sky and the LOD buckets. */
  update(dt, t) {
    const cam = this.engine.camera;
    this.sky.follow(cam);
    this.vegetation.update(cam, dt, t);
    this.vegetation.windUniforms.uTime.value = this.windTime;
    for (const l of this.lodSets || []) l.update(cam, dt);
    // Ground mist is a thin layer seen edge-on from eye height; from high up its
    // flat sheets read as white panels, so it fades out between 8 m and 30 m up.
    const up = cam.position.y - groundY(cam.position.x, cam.position.z);
    // The dawn haze is a layer about 30 m deep over the cool ground, not a fog that
    // fills the air. From above it, a sight line crosses only that layer, so the
    // haze thins as ~30 m / height (the overhead views of Modules 3 and 4 were
    // washed grey by a fog meant for eye-height views).
    this.engine.scene.fog.density = this.sky.fogDensity * Math.min(1, HAZE_DEPTH / Math.max(1, up));
    this.mistMat.opacity = (this._mistOpacity ?? 0.55) * (1 - THREE.MathUtils.smoothstep(up, 8, 30));
    // Small life is not drawn where it would be under a pixel or two (overhead views).
    for (const b of this.bees || []) b.visible = b.position.distanceToSquared(cam.position) < 35 * 35;
    for (const b of this.butterflies || []) b.visible = b.position.distanceToSquared(cam.position) < 90 * 90;
  }
}

/** One 2 m quadrat frame: four 25 mm tubes with corner joints, u along each bar. */
export function quadratFrameGeometry() {
  const h = QUADRAT_SIZE / 2, t = 0.025;
  const bars = [
    new THREE.BoxGeometry(QUADRAT_SIZE, t, t).translate(0, t / 2, -h),
    new THREE.BoxGeometry(QUADRAT_SIZE, t, t).translate(0, t / 2, h),
    new THREE.BoxGeometry(QUADRAT_SIZE, t, t).rotateY(Math.PI / 2).translate(-h, t / 2, 0),
    new THREE.BoxGeometry(QUADRAT_SIZE, t, t).rotateY(Math.PI / 2).translate(h, t / 2, 0),
  ];
  for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) bars.push(new THREE.BoxGeometry(t * 1.6, 0.03, t * 1.6).translate(x, 0.015, z));
  const g = mergeGeometries(bars.map((b) => b.toNonIndexed()));
  g.computeBoundingBox();
  return g;
}

export { addCloudShade };
