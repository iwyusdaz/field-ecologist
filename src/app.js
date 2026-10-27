/**
 * Application controller: content loading, the engine + meadow scene, the
 * module state machine (m1..m5), the shared FieldworkSession, cinematics,
 * text mode, the learning record and the test hooks. The per-module UI lives
 * in ui/fieldwork.js, ui/reveal.js, ui/report.js and a11y/textmode-modules.js.
 * @module app
 */
import { Engine } from './core/engine.js';
import { loadJSON, hasWebGL2 } from './core/assets.js';
import { Shell } from './ui/shell.js';
import { Settings } from './ui/settings.js';
import { ProgressPage } from './ui/progress.js';
import { LearningRecord } from './learning/record.js';
import { TextMode } from './a11y/text-mode.js';
import { MotionPrefs } from './a11y/motion.js';
import { ShotPlayer } from './cinematics/shot-player.js';
import { MeadowScene } from './scenes/meadow.js';
import { buildPopulation, MEADOW_SEED } from './systems/population-model.js';
import { FieldworkSession } from './systems/fieldwork.js';
import { FieldworkUI } from './ui/fieldwork.js';
import { RevealUI } from './ui/reveal.js';
import { ReportUI } from './ui/report.js';
import { registerTextModules } from './a11y/textmode-modules.js';
import { buildGuide } from './ui/field-guide.js';
import { mcItem } from './learning/assess.js';
import { renderGuidePortraits } from './systems/guide-portraits.js';
import { buildGrid } from './systems/quadrat-describe.js';
import { dataSheetCSV, downloadCSV } from './systems/export-csv.js';
import { generateQuadrats, showyClusters } from './systems/designs.js';
import { announce } from './a11y/announcer.js';
// Content is bundled at build time (Vite JSON imports) — same files the docs
// reference; editing content/ requires a rebuild, which keeps docs and app in sync.
import speciesContentJson from '../content/species.json';
import designsJson from '../content/designs.json';
import itemsJson from '../content/items.json';
import modulesJson from '../content/modules.json';
import cinematicsJson from '../content/cinematics.json';

export const SLUG = window.__SLUG__ || 'field-ecologist';
window.__SLUG__ = SLUG;

const MODULE_IDS = ['m1', 'm2', 'm3', 'm4', 'm5'];
const MODULE_LABELS = ['1 · The question', '2 · Know your species', '3 · Fieldwork', '4 · The reveal', '5 · Report & transfer'];

export class App {
  constructor() {
    this.state = {
      module: 'm1',
      design: null,
      points: [],
      submitted: false,
      submission: null,
      simRan: false,
      hypothesis: null,
      precheck: {},
      idQuiz: {},
      transferAnswers: {},
      reportDrafts: {},
      rubric: null,
      completed: {},
      cinematicSeen: {},
      tmActiveQuadrat: null,
    };
    this._grid = null;
    this.ready = this._init();
  }

  async _init() {
    // Content (separate from code, standards 3.4) — bundled via JSON imports.
    this.speciesContent = speciesContentJson;
    this.designs = designsJson;
    this.items = itemsJson;
    this.modules = modulesJson;
    this.cinematicsContent = cinematicsJson;
    this.species = this.speciesContent.species;
    this.population = buildPopulation(MEADOW_SEED);

    // Shell + dialogs.
    this.shell = new Shell({
      slug: SLUG,
      title: 'Field Ecologist: Sampling the Meadow',
      moduleLabels: MODULE_LABELS,
      onModuleChange: (i) => this.goToModule(MODULE_IDS[i]),
    });
    this.shell.listeners.menu = () => this.pauseAll();
    this.shell.menuDialog?.addEventListener('close', () => this.resumeAll());

    // WebGL fallback (after the shell exists — it owns #stage).
    if (!hasWebGL2()) {
      document.getElementById('stage').insertAdjacentHTML(
        'beforeend',
        '<div data-webgl-fallback role="alert"><p>WebGL is not available in this browser. ' +
        'You can still complete every objective in <strong>Text mode</strong> (button above).</p></div>',
      );
    }

    this.record = new LearningRecord(SLUG);
    this.motion = new MotionPrefs(SLUG);

    // 3D engine + scene (skipped cleanly when WebGL2 is unavailable; text mode
    // covers every objective — the fallback notice is injected by main.js).
    this.textMode = new TextMode({ root: document.getElementById('textmode'), slug: SLUG });
    registerTextModules({ textMode: this.textMode, app: this });

    if (hasWebGL2()) {
      this.canvas = document.getElementById('app');
      this.engine = new Engine(this.canvas);
      this.scene = new MeadowScene(this.engine, {
        population: this.population,
        speciesList: this.species,
        onReady: () => { this.sceneReady = true; },
      });
      this.engine.quality.restore();
      this.engine.start();
      this.settings = new Settings({
        slug: SLUG,
        dialog: document.getElementById('settings-dialog'),
        quality: this.engine.quality,
        motion: this.motion,
        onFov: (fov) => {
          this.engine.camera.fov = fov;
          this.engine.baseFov = fov;
          this.engine.camera.updateProjectionMatrix();
        },
      });
      this.player = new ShotPlayer({
        container: document.getElementById('cinematic-host'),
        camera: this.engine.camera,
        motion: this.motion,
        onSkip: (id) => {
          this.state.cinematicSeen[id] = 'skipped';
          this.record.log('experienced', { id, name: this._cineTitle(id) }, { response: 'skipped' });
        },
        onDone: (id) => this._afterCinematic(id),
      });
      this.fieldworkUI = new FieldworkUI({ app: this, container: this._overlayHost() });
      this.revealUI = new RevealUI({ app: this, container: this._overlayHost() });
      this.reportUI = new ReportUI({ app: this, container: this._overlayHost() });
      // Portraits render from the real models; non-blocking, refresh the guide when done.
      renderGuidePortraits(this.species.map((s) => s.id)).then((p) => {
        this.portraits = p;
        if (this.state.module === 'm2' && this.textMode.root.hidden) this._renderM2();
      });
    } else {
      this.settings = new Settings({
        slug: SLUG,
        dialog: document.getElementById('settings-dialog'),
        motion: this.motion,
      });
      this.fieldworkUI = null;
      this.revealUI = null;
      this.reportUI = null;
    }

    this.progress = new ProgressPage({ slug: SLUG, dialog: document.getElementById('progress-dialog'), record: this.record });
    this.shell.on('settings', (btn) => this.settings.open(btn));
    this.shell.on('progress', (btn) => this.progress.open(btn));
    this.shell.on('restart', () => this.restartModule());

    // Text mode hides the canvas AND the HTML panels; show() renders the same module.
    const origToggle = this.shell.toggleTextMode.bind(this.shell);
    this.shell.toggleTextMode = () => {
      const showing = origToggle();
      const overlays = this._overlayHost();
      overlays.style.display = showing ? 'none' : '';
      if (showing && this.player?.playing) this.player.skip(); // no cinematic behind text mode
      if (showing) this.textMode.show(this.state.module);
      return showing;
    };

    this.goToModule('m1');
    this._exposeTestHooks();
  }

  _overlayHost() {
    // Panels live in the shell's #overlays region (semantic HTML above canvas).
    return document.getElementById('overlays');
  }

  /* ------------------------- module navigation ------------------------- */
  goToModule(id) {
    const idx = MODULE_IDS.indexOf(id);
    if (idx < 0) return;
    this.state.module = id;
    this.shell.setModule(idx);
    if (document.getElementById('textmode') && !document.getElementById('textmode').hidden) {
      this.textMode.show(id);
      return; // text mode renders the same module
    }
    this.shell.setStatus(MODULE_LABELS[idx]);
    if (!this.fieldworkUI) return; // no-WebGL: text mode only
    // clear the previous panel and render the module's UI
    this._overlayHost().innerHTML = '';
    this.fieldworkUI.undock();
    if (id === 'm1') this._renderM1();
    else if (id === 'm2') this._renderM2();
    else if (id === 'm3') this._renderM3();
    else if (id === 'm4') this._renderM4();
    else if (id === 'm5') this._renderM5();
  }

  restartModule() {
    if (this.state.module === 'm3' && this.session) {
      this.session = null;
      this.state.design = null;
      this.state.submitted = false;
      this.state.submission = null;
      this.scene?.setQuadrats([]);
    }
    this.goToModule(this.state.module);
  }

  /* ------------------------- modules (3D mode) ------------------------- */
  _renderM1() {
    const host = this._overlayHost();
    const sec = document.createElement('section');
    sec.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'Module 1 — The question';
    sec.appendChild(h);
    const intro = document.createElement('p');
    intro.textContent = this.modules.modules.m1.intro;
    sec.appendChild(intro);
    const rq = document.createElement('p');
    rq.innerHTML = `<strong>Research question:</strong> ${this.modules.researchQuestion.text}`;
    sec.appendChild(rq);
    const facts = document.createElement('ul');
    for (const f of this.modules.researchQuestion.meadowFacts) {
      const li = document.createElement('li'); li.textContent = f; facts.appendChild(li);
    }
    sec.appendChild(facts);
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'secondary';
    replay.textContent = 'Replay the dawn arrival (skippable)';
    replay.addEventListener('click', () => this.playCinematic('s1-dawn-arrival'));
    sec.appendChild(replay);
    // The arrival plays once on first entry (skippable from the first frame;
    // reduced motion renders stills + captions — content/cinematics.json policy).
    if (!this.state.cinematicSeen['s1-dawn-arrival']) {
      setTimeout(() => this.playCinematic('s1-dawn-arrival'), 350);
    }

    // hypothesis task (any answer accepted; feedback teaches)
    const hyp = this.items.hypothesisTask;
    const h3 = document.createElement('h3');
    h3.textContent = 'Your hypothesis';
    sec.appendChild(h3);
    if (this.state.hypothesis) {
      const chosen = hyp.options.find((o) => o.id === this.state.hypothesis);
      const p = document.createElement('p');
      p.innerHTML = `You chose: <em>${chosen.text}</em>`;
      const why = document.createElement('p');
      why.textContent = hyp.why;
      sec.append(p, why);
    } else {
      for (const opt of hyp.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice-btn';
        b.textContent = opt.text;
        b.addEventListener('click', () => {
          this.state.hypothesis = opt.id;
          this.record.log('answered', { id: hyp.id, name: 'Hypothesis choice' }, { response: opt.id });
          announce(hyp.why);
          this.goToModule('m1');
        });
        sec.appendChild(b);
      }
    }

    // pre-check
    const h4 = document.createElement('h3');
    h4.textContent = 'Pre-check (5 items)';
    sec.appendChild(h4);
    for (const item of this.items.precheck) this._mcItem(item, sec, 'precheck', () => {
      if (Object.keys(this.state.precheck).length === this.items.precheck.length) {
        this.onModuleComplete('m1');
      }
    });
    host.appendChild(sec);
  }

  _renderM2() {
    const host = this._overlayHost();
    const sec = document.createElement('section');
    sec.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'Module 2 — Know your species';
    sec.appendChild(h);
    const intro = document.createElement('p');
    intro.textContent = this.modules.modules.m2.intro;
    sec.appendChild(intro);
    const guideHost = document.createElement('div');
    guideHost.appendChild(buildGuide({ species: this.species, portraits: this.portraits || {} }));
    sec.appendChild(guideHost);
    const h3 = document.createElement('h3');
    h3.textContent = 'Identification quiz (8 items)';
    sec.appendChild(h3);
    const speciesOptions = this.species.map((sp) => ({ id: sp.id, text: sp.name }));
    for (const item of this.items.idQuiz) {
      const asItem = item.kind === 'species' && !item.options
        ? { ...item, options: speciesOptions, correct: item.speciesRef }
        : item;
      this._mcItem(asItem, sec, 'idQuiz', () => {
        if (Object.keys(this.state.idQuiz).length === this.items.idQuiz.length) {
          this.onModuleComplete('m2');
        }
      }, item);
    }
    host.appendChild(sec);
  }

  _renderM3() {
    if (!this.fieldworkUI) return;
    this.fieldworkUI.render();
  }

  _renderM4() {
    if (!this.revealUI) return;
    const firstEntry = !this.state.cinematicSeen['s2-reveal'] && this.state.submitted;
    this.revealUI.render();
    if (firstEntry) this.playCinematic('s2-reveal');
  }

  _renderM5() {
    if (!this.reportUI) return;
    this.reportUI.render();
  }

  /** Shared MC item renderer (3D panels): logs + tracks per-module answers. */
  _mcItem(item, container, group, onAll, original) {
    mcItem({
      item,
      container,
      onAnswered: (r) => {
        this.record.log('answered', { id: original?.id || item.id, name: (original?.prompt || item.prompt).slice(0, 60) }, {
          response: r.chosen, success: r.correct,
        });
        this.state[group][original?.id || item.id] = r;
        if (!r.correct && (original?.kind === 'species' || item.kind === 'species')) {
          this.guideDialogMistakes = this.guideDialogMistakes || [];
          this.guideDialogMistakes.push({ item: original?.id || item.id, chose: r.chosen, truth: item.correct });
        }
        onAll?.();
      },
    });
  }

  onModuleComplete(id) {
    this.state.completed[id] = true;
    this.record.log('completed', { id: `module-${id}`, name: MODULE_LABELS[MODULE_IDS.indexOf(id)] });
  }

  /* ------------------------- session + export ------------------------- */
  startSession() {
    if (!this.session) {
      this.session = new FieldworkSession({
        population: this.population,
        speciesList: this.species,
        budget: this.designs.budget,
        seed: 777,
      });
    }
    return this.session;
  }

  getGrid() {
    if (!this._grid) this._grid = buildGrid(this.population);
    return this._grid;
  }

  exportData() {
    if (!this.session) return;
    downloadCSV(dataSheetCSV(this.session.sheet, this.species), 'field-ecologist-data.csv');
    this.record.log('experienced', { id: 'csv-export', name: 'Downloaded the data sheet as CSV' });
  }

  /* ------------------------- cinematics ------------------------- */
  _cine(id) {
    return this.cinematicsContent.cinematics.find((c) => c.id === id);
  }
  _cineTitle(id) { return this._cine(id)?.title || id; }

  playCinematic(id) {
    if (!this.player || !this.scene) { this._afterCinematic(id); return; }
    const def = this._cine(id);
    if (!def) return;
    if (this.state.cinematicSeen[id] && id !== 's1-dawn-arrival') return false; // reveal cinematics play once
    this.player.load(fillCaptionTokens(def, this.population));
    if (id === 's1-dawn-arrival' && def.shots[0]?.lighting) {
      this.scene.setDawn(def.shots[0].lighting);
    }
    if (id === 's2-reveal') {
      this.scene.setQuadrats(this.state.points || []);
      this.scene.highlightTarget(true);
    }
    if (id === 's3-many-samples') this._startGhostRain(def);
    this.scene.orbit.enabled = false;
    this.scene.walkAnim = null;
    const wasSkipped = () => this.state.cinematicSeen[id] === 'skipped';
    const done = () => {
      if (!wasSkipped() && !this.state.cinematicSeen[id]) {
        this.state.cinematicSeen[id] = 'played';
        this.record.log('experienced', { id, name: this._cineTitle(id) }, { response: 'played' });
      }
      this._afterCinematic(id);
    };
    this.player.onDone = done;
    this.player.play();
    return true;
  }

  _afterCinematic(id) {
    if (!this.scene) return;
    this.scene.orbit.enabled = true;
    if (id === 's1-dawn-arrival') {
      this.scene.setDawn(null);
      // place the camera at the field station for the module UI
      this.scene.orbit.target.set(50, 1.2, 20);
      this.scene.orbit.spherical.radius = 8;
      this.scene.orbit.update();
    }
    if (id === 's2-reveal') {
      this.scene.highlightTarget(false);
      // hold the overhead "map" view while the reveal tables are read
      this.scene.orbit.target.set(50, 0, 50);
      this.scene.orbit.spherical.radius = 120;
      this.scene.orbit.spherical.phi = 0.18;
      this.scene.orbit.update();
    }
    if (id === 's3-many-samples') {
      this._stopGhostRain();
      this.revealUI?.onS3Done?.();
    }
  }

  /**
   * S3 ghost-quadrat rain. Driven by the worker's progress callback
   * (`onSimulatorProgress`) while the simulator runs, so the squares appear in
   * step with the virtual samples (agent review: realism 3, multimedia 2). If no
   * run drives it (replay), it falls back to a fixed interval.
   */
  _startGhostRain(def) {
    this._rainDef = def;
    this._rainShown = 0;
    if (this._rainDriven) return;
    const duration = def.shots[0]?.duration || 15;
    const design = this.state.design || 'random';
    const n = Math.min(40, Math.max(5, this.state.submission?.quadrats || 10));
    const clusters = showyClusters(this.population.positions['butterweed'] || []);
    this._rainTimer && clearInterval(this._rainTimer);
    const total = 24; // 24 visible sets across the shot (400 ghost squares cap)
    let k = 0;
    this._rainTimer = setInterval(() => {
      k++;
      const pts = [];
      for (let i = 0; i < k; i++) {
        pts.push(...generateQuadrats(design, n, (10_000 + i) >>> 0, { butterweedClusters: clusters }));
      }
      this.scene.setGhostQuadrats(pts);
      if (k >= total) this._stopGhostRain(true);
    }, (duration * 1000) / total);
  }

  _stopGhostRain(keep) {
    if (this._rainTimer) { clearInterval(this._rainTimer); this._rainTimer = null; }
    if (!keep) this.scene?.clearGhostQuadrats();
  }

  /* ------------------------- simulator callbacks ------------------------- */
  /**
   * Called before the first simulator run starts. S3 plays DURING the run and
   * before the graded chart items exist (standards: no cinematic during
   * assessment; agent review: realism 2). Returns true if S3 is playing.
   */
  onSimulatorStart(firstRun) {
    if (!firstRun) return false;
    this._rainDriven = true;
    const playing = this.playCinematic('s3-many-samples') === true && !!this.player?.playing;
    if (!playing) this._rainDriven = false;
    return playing;
  }

  /** Worker progress → ghost rain (24 visible sets across the run). */
  onSimulatorProgress(done, total) {
    if (!this._rainDriven || !this.scene || !this.player?.playing) return;
    const k = Math.max(1, Math.round((24 * done) / Math.max(1, total)));
    if (k <= this._rainShown) return;
    this._rainShown = k;
    const design = this.state.design || 'random';
    const n = Math.min(40, Math.max(5, this.state.submission?.quadrats || 10));
    const clusters = showyClusters(this.population.positions['butterweed'] || []);
    const pts = [];
    for (let i = 0; i < k; i++) pts.push(...generateQuadrats(design, n, (10_000 + i) >>> 0, { butterweedClusters: clusters }));
    this.scene.setGhostQuadrats(pts);
  }

  onSimulatorRun() {
    this._rainDriven = false;
  }

  /** Pause everything time-based while the menu is open (agent review: a11y 3, heuristics 7). */
  pauseAll() {
    this.engine?.pause();
    this.player?.pause();
  }

  resumeAll() {
    this.engine?.resume();
    this.player?.resume();
  }

  /* ------------------------- test hooks ------------------------- */
  _exposeTestHooks() {
    if (!__TEST_HOOKS__) return;
    const findItem = (id) => {
      for (const list of [this.items.precheck, this.items.idQuiz, this.items.chartItems, this.items.transfer]) {
        const it = list.find((x) => x.id === id);
        if (it) return it;
      }
      if (this.items.hypothesisTask.id === id) return this.items.hypothesisTask;
      return null;
    };
    const resolveCorrect = (item) => item.correct ?? item.speciesRef ?? null;
    window.__TEST__ = {
      app: this,
      engine: this.engine,
      scene: this.scene,
      shell: this.shell,
      record: this.record,
      textMode: this.textMode,
      settings: this.settings,
      session: () => this.session,
      hooks: {
        goTo: (m) => this.goToModule(m),
        state: () => this.state,
        answerItem: (itemId, choiceId) => {
          const item = findItem(itemId);
          if (!item) return { ok: false, error: 'no such item' };
          const correct = choiceId === resolveCorrect(item);
          if (itemId === this.items.hypothesisTask.id) {
            this.state.hypothesis = choiceId;
          } else if (this.items.precheck.some((x) => x.id === itemId)) {
            this.state.precheck[itemId] = { itemId, correct, chosen: choiceId };
            if (Object.keys(this.state.precheck).length === this.items.precheck.length) this.onModuleComplete('m1');
          } else if (this.items.idQuiz.some((x) => x.id === itemId)) {
            this.state.idQuiz[itemId] = { itemId, correct, chosen: choiceId };
            if (!correct && (item.kind === 'species')) {
              this.guideDialogMistakes = this.guideDialogMistakes || [];
              this.guideDialogMistakes.push({ item: itemId, chose: choiceId, truth: resolveCorrect(item) });
            }
            if (Object.keys(this.state.idQuiz).length === this.items.idQuiz.length) this.onModuleComplete('m2');
          } else if (this.items.chartItems.some((x) => x.id === itemId)) {
            this.state.chartAnswers = this.state.chartAnswers || {};
            this.state.chartAnswers[itemId] = { itemId, correct, chosen: choiceId };
          } else if (this.items.transfer.some((x) => x.id === itemId)) {
            this.state.transferAnswers[itemId] = { itemId, correct, chosen: choiceId };
            const all = this.items.transfer.map((i) => this.state.transferAnswers[i.id]).filter(Boolean);
            if (all.length === this.items.transfer.length) this.onModuleComplete('m5');
          }
          this.record.log('answered', { id: itemId, name: itemId }, { response: choiceId, success: correct });
          return { ok: true, itemId, correct };
        },
        chooseDesign: (designId) => {
          this.startSession();
          const res = this.session.chooseDesign(designId);
          if (res.ok) {
            this.state.design = designId;
            this.record.log('experienced', { id: `design-${designId}`, name: `Chose design: ${designId}` }, { response: designId });
            this.scene?.setQuadrats(this.session.points);
            if (this.state.module === 'm3') this.goToModule('m3');
          }
          return res;
        },
        redraw: () => {
          const res = this.session?.redraw();
          if (res?.ok) this.scene?.setQuadrats(this.session.points);
          return res || { ok: false };
        },
        placeConvenience: (x, z) => {
          const res = this.session?.placeConvenience(x, z);
          if (res?.ok) this.scene?.setQuadrats(this.session.points);
          return res || { ok: false };
        },
        visitQuadrat: (i) => {
          const res = this.session?.visit(i);
          if (res?.ok) {
            this.record.log('experienced', { id: `quadrat-${i}`, name: `Sampled quadrat ${i}` });
            this.state.points = this.session.points;
          }
          return res || { ok: false };
        },
        setCount: (i, speciesOrCounts, n) => {
          const counts = typeof speciesOrCounts === 'string' ? { [speciesOrCounts]: n } : speciesOrCounts;
          return this.session?.record(i, { counts }) || { ok: false };
        },
        setCover: (i, bandId) => this.session?.record(i, { cover: bandId }) || { ok: false },
        finishQuadrat: (i) => this.session?.finishVisit(i) || { ok: false },
        csvPreview: () => (this.session ? dataSheetCSV(this.session.sheet, this.species) : ''),
        submitFieldwork: () => {
          if (!this.session) return { ok: false, error: 'no session' };
          const res = this.session.submit();
          this.state.submitted = true;
          this.state.submission = res;
          this.state.points = this.session.points;
          this.record.log('completed', {
            id: 'fieldwork-submission', name: 'Fieldwork submitted',
            description: `Design ${this.session.design}, ${res.quadrats} quadrats recorded`,
          }, { success: true, response: this.session.design, estimates: res.estimates, cover: res.cover, quadrats: res.quadrats });
          return res;
        },
        runSimulator: async (opts = {}) => {
          const reveal = this.revealUI;
          if (!reveal) return { ok: false, error: 'no 3D reveal UI' };
          try {
            await reveal.runSimulator({
              design: opts.design || this.state.design || 'random',
              n: opts.n || 10,
              speciesId: opts.speciesId || 'butterweed',
              allDesigns: opts.allDesigns,
            });
            return { ok: true };
          } catch (e) {
            return { ok: false, error: String(e && e.message || e) };
          }
        },
        fillReport: (sectionId, text) => {
          this.state.reportDrafts[sectionId] = text;
          this.record.log('attempted', { id: `report-${sectionId}`, name: `Report section: ${sectionId}` }, { response: text });
          return { ok: true };
        },
        completeRubric: () => {
          const ratings = {};
          for (const c of this.items.reportRubric) ratings[c.id] = 2;
          this.state.rubric = ratings;
          this.record.log('completed', { id: 'report-rubric', name: 'Rubric self-check' }, { response: JSON.stringify(ratings) });
          return ratings;
        },
        openTextMode: () => this.shell.toggleTextMode(),
        sceneReady: () => Boolean(this.sceneReady),
      },
    };
  }
}

/**
 * Replace `{trueTotal.<speciesId>}` tokens in cinematic captions/descriptions
 * with the real totals (agent review: realism 1 — S2a showed a literal "N").
 * @param {object} def cinematic definition from content/cinematics.json
 * @param {{trueTotals: Record<string, number>}} population
 */
export function fillCaptionTokens(def, population) {
  const sub = (t) => (typeof t === 'string'
    ? t.replace(/\{trueTotal\.([a-z-]+)\}/g, (m, id) => (population.trueTotals[id] ?? 0).toLocaleString('en-US'))
    : t);
  return {
    ...def,
    shots: (def.shots || []).map((sh) => ({ ...sh, captions: (sh.captions || []).map(sub), description: sub(sh.description) })),
  };
}
