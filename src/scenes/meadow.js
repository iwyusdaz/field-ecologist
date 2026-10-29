/**
 * The Ashcombe Meadow scene: terrain with a moisture gradient, Poly Haven CC0
 * HDRI sky (Belfast Open Field), sun + IBL lighting, instanced vegetation,
 * quadrat overlays, the field-station prop, the top-down orthographic counting
 * camera, and cinematic lighting hooks (dawn + mist for S1 only).
 * 1 unit = 1 m. Realism policy: design/realism-matrix.md.
 * @module scenes/meadow
 */
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitController } from '../core/input.js';
import { createPost } from '../core/post.js';
import { VegetationRenderer } from '../systems/vegetation-renderer.js';
import { FIELD_SIZE, terrainHeight, moisture, streamX } from '../systems/moisture-field.js';
import { QUADRAT_SIZE } from '../systems/population-model.js';
import { applyCaseGrade } from '../v2/cinematic-grade.js';
import { ModelLibrary } from '../v2/model-placer.js';
import { InWorldInteractionManager } from '../v2/in-world-interaction.js';
import { buildEnvironment, placeDressing, addCloudShadows } from './meadow-dressing.js';
import { buildMeadowLife } from './meadow-life.js';
import { buildTurf } from './meadow-turf.js';

/** v2 viewpoint rings: [id, label, ring x, ring z, camera pos, camera target]. */
export const MEADOW_VIEWPOINTS = [
  ['overview', 'Overview', 48, 7, [50, 24, -16], [50, 0, 42]],
  ['stream', 'The stream', 11, 28, [17, 2.6, 22], [8.5, 0.6, 34]],
  ['wet', 'Wet zone', 22, 56, [27, 3.2, 47], [19, 0.5, 60]],
  ['dry', 'Dry zone', 82, 56, [76, 4.4, 46], [84, 1.2, 60]],
];

const BASE = import.meta.env.BASE_URL || './';

/** Dawn key light (v2 revision V2): elevation 15°, azimuth from the east-south-east. */
export const DAWN_SUN_ELEVATION_DEG = 15;
const DAWN_AZ = THREE.MathUtils.degToRad(70); // from +z towards +x
const DAWN_EL = THREE.MathUtils.degToRad(DAWN_SUN_ELEVATION_DEG);
export const DAWN_SUN_OFFSET = new THREE.Vector3(
  Math.cos(DAWN_EL) * Math.sin(DAWN_AZ), Math.sin(DAWN_EL), Math.cos(DAWN_EL) * Math.cos(DAWN_AZ),
).multiplyScalar(80);
export const DAWN_SUN_COLOR = 0xffc683;
export const DAWN_SUN_INTENSITY = 2.7;
/** Warm dawn haze (mist blue warmed towards dawn gold). */
export const DAWN_HAZE = 0xe6cfae;

/** Quadrat stack placement in the station's local frame (beside the table, on the ground). */
export const STACK_OFFSET = [2.0, 0.35];
export const STACK_GROUND_Y = 0.03;

/** Canvas-generated soil/grass speckle: greys multiplied against vertex colours. */
function makeSpeckleTexture(size = 256) {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(0, 0, size, size);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 2400; i++) {
    const g = 190 + Math.floor(rnd() * 56);
    const r = rnd() * 2.2 + 0.5;
    ctx.fillStyle = `rgb(${g},${g - Math.floor(rnd() * 12)},${g - Math.floor(rnd() * 16)})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, r, r * (0.4 + rnd() * 1.2), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MeadowScene {
  /**
   * @param {import('../core/engine.js').Engine} engine
   * @param {object} opts { population, speciesList, onReady }
   */
  constructor(engine, { population, speciesList, onReady }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.population = population;
    this.speciesList = speciesList;
    this.onReady = onReady;
    this.quadratGroups = [];
    this.activeQuadrat = -1;
    this.walkAnim = null;
    this._disposed = false;

    // v2.0.0 grade: AgX + per-case exposure + dawn haze; the real HDRI stays the
    // light source and distant sky (no gradient dome).
    this.theme = applyCaseGrade('field-ecologist', { renderer: engine.renderer, scene: this.scene, addSkyDome: false });
    this.v2FogBase = 0.0032;
    this.v2Fog = this.scene.fog;
    // dawn haze (art bible: mist blue #B8CCD6 warmed towards dawn gold #F6A65A)
    if (this.v2Fog) { this.v2Fog.density = this.v2FogBase; this.v2Fog.color.set(DAWN_HAZE); }
    this.cloudUniforms = { uCloudT: { value: 0 }, uCloudK: { value: 0.22 } };

    this._buildLights();
    this._buildTerrain();
    this._buildStation();
    this.env = buildEnvironment(this.scene, { speckle: this._speckle, cloudUniforms: this.cloudUniforms });
    this.models = new ModelLibrary();
    this.dressingReady = placeDressing(this.models, this.env.statics).catch(() => 0);
    this._loadSky();

    this.vegetation = new VegetationRenderer({
      scene: this.scene,
      renderer: engine.renderer,
      population,
      speciesList,
      preset: engine.quality.presetDef,
    });

    // Post pipeline (SMAA Medium+, AO High+); orthographic quadrat view bypasses it.
    this.post = createPost(engine.renderer, this.scene, engine.camera, engine.quality.presetDef);
    engine.setComposer(this.post.composer);

    // Counting view: real orthographic camera looking straight down at a quadrat.
    this.orthoCam = new THREE.OrthographicCamera(-2.2, 2.2, 2.2, -2.2, 0.1, 50);
    this.counting = false;

    // Camera control: gentle orbit around the current point of interest.
    this.orbit = new OrbitController(engine.camera, engine.renderer.domElement, new THREE.Vector3(50, 1.2, 20));
    this.orbit.spherical.radius = 8;
    this.orbit.minRadius = 1.2;
    this.orbit.maxRadius = 160; // the reveal pulls back to an overhead "map" view

    engine.onUpdate((dt, t) => this._update(dt, t));
    engine.quality.onChange((def, name) => {
      this.vegetation.setPreset(def, name);
      if (this.turf) {
        const vis = this.turf.visible;
        this.scene.remove(this.turf);
        this.turf.geometry.dispose(); this.turf.material.dispose(); this.turf.dispose();
        const hide = this.lifeSystems.hideInCounting;
        const at = hide.indexOf(this.turf);
        this.turf = buildTurf(def.vegetationDensity ?? 0.7);
        this.turf.visible = vis;
        if (at >= 0) hide[at] = this.turf;
        this.scene.add(this.turf);
      }
      this.post.dispose();
      this.post = createPost(engine.renderer, this.scene, engine.camera, def);
      engine.setComposer(this.post.composer);
    });

    // Wind level state machine: ambient 1, counting 0.12, reduced motion 0.
    this.reducedMotion = engine.reducedMotion;
    this.lifeSystems = buildMeadowLife(this);
    this.life = this.lifeSystems.life;
    this.character = this.lifeSystems.character;
    this.lifeSystems.hideInCounting.push(this.character.root);
    // The station (table, guide, quadrat stack) stands just inside the south edge;
    // it is not part of any count, so it leaves the top-down counting view.
    this.lifeSystems.hideInCounting.push(this.station);
    // v2 revision V3: low instanced turf (one draw call), hidden in the counting view.
    this.turf = buildTurf(engine.quality.presetDef.vegetationDensity ?? 0.7);
    this.scene.add(this.turf);
    this.lifeSystems.hideInCounting.push(this.turf);
    this._buildInteraction();
    this._applyWind();
    // Exposed for tools (poster staging) and tests.
    this.terrainHeight = terrainHeight;
  }

  _buildLights() {
    // v2 revision V2 (dawn): a low (~15°) warm dawn-gold key light from the east;
    // the HDRI still supplies sky and ambient fill.
    this.sun = new THREE.DirectionalLight(DAWN_SUN_COLOR, DAWN_SUN_INTENSITY);
    this.sun.position.copy(DAWN_SUN_OFFSET);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.engine.quality.presetDef.shadowMapSize || 2048, this.engine.quality.presetDef.shadowMapSize || 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffe2bf, 0x55663c, 0.55);
    this.scene.add(this.hemi);
    this._dawnState = null; // set during S1 (see setDawn)
  }

  _buildTerrain() {
    const segs = 128;
    const geo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const lush = new THREE.Color(0x3e6b2e);
    const dry = new THREE.Color(0xa89055);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + FIELD_SIZE / 2;
      const z = pos.getZ(i) + FIELD_SIZE / 2;
      pos.setY(i, terrainHeight(x, z));
      const m = moisture(x, z);
      c.lerpColors(dry, lush, Math.min(1, m * 1.15));
      // per-vertex variation so the ground does not band
      const n = 0.9 + 0.2 * Math.abs(Math.sin(x * 12.9898 + z * 78.233) % 1);
      colors[i * 3] = c.r * n; colors[i * 3 + 1] = c.g * n; colors[i * 3 + 2] = c.b * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // Procedural speckle map (canvas-generated here, no asset): breaks the flat
    // vertex-coloured ground into soil/grass mottle at any distance.
    const speckle = makeSpeckleTexture();
    this._speckle = speckle;
    speckle.repeat.set(46, 46);
    speckle.wrapS = speckle.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: speckle, roughness: 0.95, metalness: 0,
    });
    addCloudShadows(mat, this.cloudUniforms);
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.position.set(FIELD_SIZE / 2, 0, FIELD_SIZE / 2);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  _buildStation() {
    // A minimal field station at the south gate: table + a folded quadrat frame + sign.
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.85 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), wood);
    top.position.y = 0.85;
    top.castShadow = true;
    g.add(top);
    for (const [lx, lz] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), wood);
      leg.position.set(lx, 0.42, lz);
      leg.castShadow = true;
      g.add(leg);
    }
    // quadrat stack: three 2 m frames stacked flat on the turf beside the table
    // (v2 revision V4: they used to hover at table height; I1: their hit proxy
    // swallowed the field guide on the table top).
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xdad4c4, roughness: 0.6, emissive: 0x000000 });
    const stack = new THREE.Group();
    stack.name = 'quadrat-stack';
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Group();
      for (const [w, d, ox, oz] of [[QUADRAT_SIZE, 0.03, 0, -QUADRAT_SIZE / 2], [QUADRAT_SIZE, 0.03, 0, QUADRAT_SIZE / 2], [0.03, QUADRAT_SIZE, -QUADRAT_SIZE / 2, 0], [0.03, QUADRAT_SIZE, QUADRAT_SIZE / 2, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), frameMat);
        bar.position.set(ox, 0, oz);
        bar.castShadow = true;
        f.add(bar);
      }
      f.position.set(0, STACK_GROUND_Y + k * 0.032, 0);
      f.rotation.y = k * 0.06;
      stack.add(f);
    }
    // invisible hit proxy (low slab over the frames) so the thin bars are easy to hover/click
    const hit = new THREE.Mesh(new THREE.BoxGeometry(QUADRAT_SIZE, 0.3, QUADRAT_SIZE), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.15;
    stack.add(hit);
    stack.position.set(STACK_OFFSET[0], 0, STACK_OFFSET[1]);
    g.add(stack);
    this.quadratStack = stack;
    // field guide: a green notebook on the table corner
    const guide = new THREE.Group();
    guide.name = 'field-guide-prop';
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.32), new THREE.MeshStandardMaterial({ color: 0x3d6b2c, roughness: 0.7, emissive: 0x000000 }));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: 0xf4eedc, roughness: 0.8, emissive: 0x000000 }));
    pages.position.set(0.006, 0.003, 0);
    guide.add(cover, pages);
    const ghit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.55), new THREE.MeshBasicMaterial({ visible: false }));
    guide.add(ghit);
    guide.position.set(-0.5, 0.9, 0.18);
    guide.rotation.y = 0.4;
    g.add(guide);
    this.fieldGuideProp = guide;
    // sign post
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), wood);
    post.position.set(-1.2, 0.65, -0.5);
    g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.7 }));
    board.position.set(-1.2, 1.2, -0.5);
    g.add(board);

    const sx = 50, sz = 2;
    g.position.set(sx, terrainHeight(sx, sz), sz);
    g.rotation.y = Math.PI; // face into the meadow
    // the stack rests on the terrain under it (station frame is rotated by PI)
    const stx = sx - STACK_OFFSET[0], stz = sz - STACK_OFFSET[1];
    stack.position.y = terrainHeight(stx, stz) - g.position.y;
    this.station = g;
    this.scene.add(g);
  }

  _loadSky() {
    new RGBELoader().load(
      `${BASE}assets/sky-meadow-1k.hdr`,
      (tex) => {
        if (this._disposed) return;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        // HDR data stays linear (RGBELoader output); setting an sRGB colorspace
        // here would double-darken the sky.
        this.scene.environment = tex;
        this.scene.background = tex;
        this.scene.backgroundBlurriness = 0.12;
        this.scene.environmentIntensity = 1.0;
        this.skyTex = tex;
        this.onReady?.();
      },
      undefined,
      () => {
        // HDRI missing -> neutral sky gradient so the app still works.
        if (this._disposed) return;
        const sky = new THREE.Color(0x9db8cc);
        this.scene.background = sky;
        this.scene.environment = null;
        this.onReady?.();
      },
    );
  }

  /**
   * Cinematic lighting hook (S1 only): dawn sun + lifting mist. Values come
   * from content/cinematics.json shot.lighting. Pass null to restore daylight.
   * @param {{sunElevationDeg:number, sunAzimuthDeg:number, mist:number, sunColor:string, exposure:number}|null} s
   */
  setDawn(s) {
    if (!s) {
      this._dawnState = null;
      this.scene.fog = this.v2Fog || null;
      if (this.v2Fog) this.v2Fog.density = this.v2FogBase;
      this.sun.color.set(DAWN_SUN_COLOR);
      this.sun.intensity = DAWN_SUN_INTENSITY;
      this.engine.renderer.toneMappingExposure = this.theme?.exposure ?? 1.0;
      this.sun.position.copy(DAWN_SUN_OFFSET);
      return;
    }
    this._dawnState = s;
    const el = THREE.MathUtils.degToRad(s.sunElevationDeg);
    const az = THREE.MathUtils.degToRad(s.sunAzimuthDeg);
    this.sun.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(80);
    this.sun.color.set(s.sunColor || 0xffd9a0);
    this.sun.intensity = 2.2;
    this.engine.renderer.toneMappingExposure = s.exposure ?? 1.0;
    if (s.mist > 0) {
      this.scene.fog = this.v2Fog || this.scene.fog || new THREE.FogExp2(0xcfd8dc, 0.001);
      this.scene.fog.density = 0.028 * s.mist;
    } else {
      this.scene.fog = this.v2Fog || null;
    }
  }

  /** Reveal highlight for the target species (S2). */
  highlightTarget(on) {
    this.vegetation.setSpeciesHighlight('butterweed', on);
  }

  /**
   * Quadrat overlays: white box-frame outlines for placed quadrats (thick
   * enough to read in the top-down counting view); the active one yellow.
   * @param {Array<{x:number,z:number}>} points
   */
  setQuadrats(points) {
    for (const g of this.quadratGroups) {
      this.scene.remove(g);
      g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    this.quadratGroups = [];
    const half = QUADRAT_SIZE / 2;
    for (const p of points) {
      const g = new THREE.Group();
      // frame: four thin boxes lying on the ground (readable from above)
      const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const barH = 0.035;
      for (const [w, d, ox, oz] of [
        [QUADRAT_SIZE, 0.035, 0, -half],
        [QUADRAT_SIZE, 0.035, 0, half],
        [0.035, QUADRAT_SIZE, -half, 0],
        [0.035, QUADRAT_SIZE, half, 0],
      ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, barH, d), frameMat);
        bar.position.set(ox, 0.02, oz);
        g.add(bar);
      }
      // corner posts give depth reading from ground level
      const postGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
      for (const [px, pz] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
        const post = new THREE.Mesh(postGeo, frameMat);
        post.position.set(px, 0.25, pz);
        g.add(post);
      }
      g.position.set(p.x, terrainHeight(p.x, p.z) + 0.06, p.z);
      this.scene.add(g);
      this.quadratGroups.push(g);
    }
    this.activeQuadrat = -1;
  }

  /** Highlight the active quadrat (yellow) and dim others. */
  setActiveQuadrat(i) {
    this.activeQuadrat = i;
    this.quadratGroups.forEach((g, j) => {
      const color = j === i ? 0xffd166 : 0xffffff;
      g.traverse((o) => { if (o.material) o.material.color.set(color); });
    });
    if (i >= 0 && this.quadratGroups[i]) {
      const p = this.quadratGroups[i].position;
      this.vegetation.setQuadratFocus(p.x, p.z);
    } else {
      this.vegetation.setQuadratFocus(null);
    }
    this._applyWind();
  }

  /**
   * Top-down counting view for the active quadrat (plan §6.1: orthographic toggle;
   * wind minimized — documented rationale: movement makes counting harder for no learning gain).
   */
  enterQuadratView(i) {
    if (i < 0 || !this.quadratGroups[i]) return;
    this.counting = true;
    this._setCountingLife(true);
    const p = this.quadratGroups[i].position;
    const c = this.orthoCam;
    c.position.set(p.x, p.y + 8, p.z + 0.001);
    c.up.set(0, 0, -1);
    c.lookAt(p.x, p.y, p.z);
    this._fitOrtho();
    this.engine.renderCamera = c; // orthographic view: no post pipeline (SMAA/AA via supersampling of the small viewport is unnecessary; direct render is crisp)
    this.setActiveQuadrat(i);
    if (!this._orthoResize) {
      this._orthoResize = () => { if (this.counting) this._fitOrtho(); };
      window.addEventListener('resize', this._orthoResize);
    }
  }

  /**
   * Fit the orthographic frustum to the canvas aspect (agent review: visual 3 —
   * the old ±1.9 square frustum stretched the 2 m quadrat into a rectangle) and
   * centre the quadrat in the canvas area not covered by the docked counting
   * form (`countingInsetRight`, CSS px; agent review: visual 2).
   */
  _fitOrtho() {
    const c = this.orthoCam;
    const el = this.engine.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    const inset = Math.min(Math.max(0, this.countingInsetRight || 0), w * 0.6);
    const free = Math.max(1, w - inset);
    const span = 2.6; // 2 m quadrat + 30 cm margin each side, in the smaller free dimension
    const s = span / Math.min(free, h); // metres per CSS pixel, same on both axes → square quadrat
    c.left = -(free / 2) * s;
    c.right = c.left + w * s;
    c.top = (h / 2) * s;
    c.bottom = -(h / 2) * s;
    c.updateProjectionMatrix();
  }

  /** Width (CSS px) of UI docked over the right edge during counting. */
  setCountingInset(px) {
    this.countingInsetRight = px;
    if (this.counting) this._fitOrtho();
  }

  exitQuadratView() {
    this.counting = false;
    this._setCountingLife(false);
    this.engine.renderCamera = null;
    this.setActiveQuadrat(-1);
    this.vegetation.setQuadratFocus(null);
    this._applyWind();
  }

  /** Walk the camera to a point (glide; cut when reduced motion). */
  walkTo(x, z, { height = 1.7, duration = 1.1, then = null } = {}) {
    const cam = this.engine.camera;
    const from = cam.position.clone();
    const to = new THREE.Vector3(x, terrainHeight(x, z) + height, z);
    this.freeCam = false;
    if (this.reducedMotion) {
      cam.position.copy(to);
      this.orbit.target.set(x, to.y - height + 1.2, z);
      this.orbit.update();
      then?.();
      return;
    }
    this.walkAnim = { from, to, t: 0, duration, then };
  }

  /** Ghost quadrat outlines for the S3 "many samples" rain (transient). */
  setGhostQuadrats(points) {
    if (!this.ghosts) {
      this.ghosts = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(QUADRAT_SIZE, QUADRAT_SIZE).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.35, depthWrite: false }),
        400,
      );
      this.ghosts.count = 0;
      this.ghosts.frustumCulled = false;
      this.scene.add(this.ghosts);
    }
    const m = new THREE.Matrix4();
    const n = Math.min(400, points.length);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      m.makeTranslation(p.x, terrainHeight(p.x, p.z) + 0.08, p.z);
      this.ghosts.setMatrixAt(i, m);
    }
    this.ghosts.count = n;
    this.ghosts.instanceMatrix.needsUpdate = true;
  }

  clearGhostQuadrats() {
    if (this.ghosts) this.ghosts.count = 0;
  }

  setReducedMotion(reduced) {
    this.reducedMotion = reduced;
    this.life?.setReducedMotion(reduced);
    if (this.interaction) this.interaction.reducedMotion = reduced;
    this._applyWind();
  }

  /** Counting view: calm mode on, overlays that could sit over the quadrat hidden. */
  _setCountingLife(on) {
    this.lifeSystems?.setCounting(on);
    for (const r of this.interaction?.hotspotRings || []) r.group.visible = !on;
  }

  /**
   * v2 in-world interaction: viewpoint rings (camera glide), WASD/arrows walk,
   * drag look, hover highlight + notebook tooltip on the quadrat stack and the
   * field guide. App-level actions are injected via setWorldActions().
   */
  _buildInteraction() {
    const ix = new InWorldInteractionManager({
      canvas: this.engine.renderer.domElement,
      camera: this.engine.camera,
      scene: this.scene,
      bounds: [-14, 114, -9, 112],
      walkSpeed: 6,
      reducedMotion: this.reducedMotion,
    });
    this.interaction = ix;
    this.freeCam = false;
    this.worldActions = {};
    for (const [id, label, x, z, camPos, camTarget] of MEADOW_VIEWPOINTS) {
      const ring = ix.addHotspotRing([x, terrainHeight(x, z) + 0.03, z], {
        id: `view-${id}`, label, hint: 'Click to go there', color: 0xf2c230,
        cameraPos: camPos, cameraTarget: camTarget,
        onClick: () => { this.freeCam = true; },
      });
      ring.scale.setScalar(2.4);
    }
    this.station.updateMatrixWorld(true);
    const st = this.quadratStack.getWorldPosition(new THREE.Vector3());
    ix.registerInteractive(this.quadratStack, {
      id: 'quadrat-stack', label: 'Quadrat stack', hint: 'Click to start placing quadrats',
      highlightColor: 0xf2c230,
      cameraPos: [st.x + 0.4, st.y + 2.6, st.z + 3.4], cameraTarget: [st.x, st.y + 0.1, st.z],
      onClick: () => { this.freeCam = true; this.worldActions.startPlacement?.(); },
    });
    ix.registerInteractive(this.fieldGuideProp, {
      id: 'field-guide', label: 'Field guide', hint: 'Click to open the field guide',
      highlightColor: 0xf2c230,
      onClick: () => { this.freeCam = true; this.worldActions.openGuide?.(); },
    });
  }

  /**
   * Keyboard/POI equivalent of the viewpoint rings (v2 revision I2/A1): glide
   * the camera to a MEADOW_VIEWPOINTS entry. Ignored while counting or while a
   * cinematic owns the camera. Returns true when the glide started.
   * @param {string} id 'overview' | 'stream' | 'wet' | 'dry'
   */
  goToViewpoint(id) {
    const vp = MEADOW_VIEWPOINTS.find((v) => v[0] === id);
    if (!vp || this.counting || !this.orbit.enabled || !this.interaction) return false;
    this.walkAnim = null;
    this.freeCam = true;
    if (!this.interaction.enabled) this.interaction.setEnabled(true);
    this.interaction.glideTo(vp[4], vp[5], 1.15);
    return true;
  }

  /** @param {{startPlacement?:Function, openGuide?:Function}} actions */
  setWorldActions(actions) {
    this.worldActions = { ...this.worldActions, ...actions };
  }

  _applyWind() {
    // Wind policy (design/realism-matrix.md): paused entirely under reduced motion,
    // ~12% inside the counting view (counting legibility), gentle otherwise.
    const level = this.reducedMotion ? 0 : this.counting ? 0.12 : 1;
    this.vegetation.setWindLevel(level);
  }

  _update(dt, t) {
    // walking glide
    if (this.walkAnim) {
      const a = this.walkAnim;
      a.t += dt / a.duration;
      const k = a.t >= 1 ? 1 : (a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2);
      this.engine.camera.position.lerpVectors(a.from, a.to, k);
      if (a.t >= 1) {
        this.orbit.target.set(a.to.x, a.to.y - 0.5, a.to.z);
        this.orbit.update();
        const cb = a.then;
        this.walkAnim = null;
        cb?.();
      }
    } else if (!this.counting) {
      // In-world navigation (drag look / WASD / ring glide) takes the camera
      // from the orbit controller until the app moves the orbit again.
      const ix = this.interaction;
      if (ix?.enabled && (ix.glide || ix.keys.size || ix._dragging)) this.freeCam = true;
      if (!this.freeCam) {
        this.orbit.update();
        if (ix) { ix.target.copy(this.orbit.target); ix._syncAnglesFromCamera(); }
      }
    }
    // interaction is only live in the free 3D view (not counting, cinematics, walks)
    const navOK = !this.counting && this.orbit.enabled && !this.walkAnim;
    if (this.interaction && this.interaction.enabled !== navOK) this.interaction.setEnabled(navOK);
    if (!this.orbit.enabled) this.freeCam = false;
    this.interaction?.update(dt, t);
    if (this.freeCam) {
      const cam = this.engine.camera.position;
      cam.y = Math.max(cam.y, terrainHeight(cam.x, cam.z) + 1.1);
    }
    this.lifeSystems?.update(dt, this.engine.renderCamera || this.engine.camera);
    // sun shadow follows the camera target so a 60 m shadow box always covers the view
    const focus = this.counting ? this.engine.renderCamera.position : (this.freeCam && this.interaction ? this.interaction.target : this.orbit.target);
    this.sun.target.position.set(focus.x, 0, focus.z);
    if (!this._dawnState) this.sun.position.set(focus.x + DAWN_SUN_OFFSET.x, DAWN_SUN_OFFSET.y, focus.z + DAWN_SUN_OFFSET.z);
    this.vegetation.update(this.engine.renderCamera || this.engine.camera, dt, t);
  }

  dispose() {
    this._disposed = true;
    if (this._orthoResize) window.removeEventListener('resize', this._orthoResize);
    this.vegetation.dispose();
    this.post.dispose();
    this.skyTex?.dispose();
  }
}
