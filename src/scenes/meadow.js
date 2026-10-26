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

const BASE = import.meta.env.BASE_URL || './';

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

    this._buildLights();
    this._buildTerrain();
    this._buildStream();
    this._buildStation();
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
      this.post.dispose();
      this.post = createPost(engine.renderer, this.scene, engine.camera, def);
      engine.setComposer(this.post.composer);
    });

    // Wind level state machine: ambient 1, counting 0.12, reduced motion 0.
    this.reducedMotion = engine.reducedMotion;
    this._applyWind();
  }

  _buildLights() {
    // Neutral daylight (the HDRI carries the overcast sky; the sun adds soft shadows).
    this.sun = new THREE.DirectionalLight(0xfff2df, 2.4);
    this.sun.position.set(40, 60, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.engine.quality.presetDef.shadowMapSize || 2048, this.engine.quality.presetDef.shadowMapSize || 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe4f5, 0x51663c, 0.5);
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
    speckle.repeat.set(46, 46);
    speckle.wrapS = speckle.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: speckle, roughness: 0.95, metalness: 0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.position.set(FIELD_SIZE / 2, 0, FIELD_SIZE / 2);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  _buildStream() {
    // A subtle ribbon following streamX(z).
    const pts = [];
    for (let z = -1; z <= FIELD_SIZE + 1; z += 2) {
      pts.push(new THREE.Vector3(streamX(z), 0.045, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    // Build a triangle strip manually (left/right offsets).
    const positions = [];
    const idx = [];
    const w = 0.9;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const next = pts[Math.min(i + 1, pts.length - 1)];
      const prev = pts[Math.max(i - 1, 0)];
      const dir = new THREE.Vector3().subVectors(next, prev).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(w);
      positions.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const strip = new THREE.BufferGeometry();
    strip.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    strip.setIndex(idx);
    strip.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x51707d, roughness: 0.25, metalness: 0.05 });
    this.stream = new THREE.Mesh(strip, mat);
    this.scene.add(this.stream);
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
    // quadrat frame resting on the table
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xdad4c4, roughness: 0.6 });
    for (const [w, d, ox, oz] of [[QUADRAT_SIZE, 0.03, 0, -QUADRAT_SIZE / 2], [QUADRAT_SIZE, 0.03, 0, QUADRAT_SIZE / 2], [0.03, QUADRAT_SIZE, -QUADRAT_SIZE / 2, 0], [0.03, QUADRAT_SIZE, QUADRAT_SIZE / 2, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), frameMat);
      bar.position.set(ox, 0.92, oz);
      g.add(bar);
    }
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
      this.scene.fog = null;
      this.sun.color.set(0xfff2df);
      this.sun.intensity = 2.4;
      this.engine.renderer.toneMappingExposure = 1.0;
      this.sun.position.set(40, 60, 25);
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
      this.scene.fog = this.scene.fog || new THREE.FogExp2(0xcfd8dc, 0.001);
      this.scene.fog.density = 0.028 * s.mist;
    } else {
      this.scene.fog = null;
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
    const p = this.quadratGroups[i].position;
    const c = this.orthoCam;
    c.position.set(p.x, p.y + 8, p.z + 0.001);
    c.up.set(0, 0, -1);
    c.lookAt(p.x, p.y, p.z);
    const half = 1.9; // see the 2 m quadrat with a margin
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.updateProjectionMatrix();
    this.engine.renderCamera = c; // orthographic view: no post pipeline (SMAA/AA via supersampling of the small viewport is unnecessary; direct render is crisp)
    this.setActiveQuadrat(i);
  }

  exitQuadratView() {
    this.counting = false;
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
    this._applyWind();
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
      this.orbit.update();
    }
    // sun shadow follows the camera target so a 60 m shadow box always covers the view
    const focus = this.counting ? this.engine.renderCamera.position : this.orbit.target;
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x + 40, 60, focus.z + 25);
    this.vegetation.update(this.engine.renderCamera || this.engine.camera, dt, t);
  }

  dispose() {
    this._disposed = true;
    this.vegetation.dispose();
    this.post.dispose();
    this.skyTex?.dispose();
  }
}
