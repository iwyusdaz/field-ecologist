/**
 * lessons.js — the five modules in the v3 scene-first shell (plan 10 §2, §6.3).
 *
 * Each module is a short run of steps. A step shows in the Now card: the
 * goal, one action, a control hint and one primary button (at most 60
 * words). Longer content opens in the drawer on demand: the field guide, the
 * pre-check, quiz and chart questions (one at a time), the design comparison,
 * the placement map, the count sheet, the data sheet, the results, the
 * simulator and the report. Every decision has a text-mode equivalent that
 * writes the same state (text-mode parity): text mode reuses the v2 renderers
 * (a11y/textmode-modules.js), which read and write this object as their `app`.
 *
 * Fieldwork in 3D (Module 3): choose a design, see the numbered survey stakes
 * (or drop frames by hand for the convenience design), walk to each quadrat,
 * kneel, click each plant inside the frame and name it (the scene never names
 * it for you), use the hand lens for a close look, estimate the Bunchgrass
 * cover band, save. The clipboard on the station table fills as you go.
 * @module meadow3/lessons
 */
import * as THREE from 'three';
import { FieldworkSession } from '../systems/fieldwork.js';
import { buildGrid } from '../systems/quadrat-describe.js';
import { dataSheetCSV, downloadCSV } from '../systems/export-csv.js';
import { generateQuadrats, showyClusters } from '../systems/designs.js';
import { zoneOf } from '../systems/moisture-field.js';
import { COVER_BANDS } from '../systems/data-sheet.js';
import { MeadowMap } from '../systems/meadow-map.js';
import { buildGuide } from '../ui/field-guide.js';
import { RevealUI } from '../ui/reveal.js';
import { ReportUI } from '../ui/report.js';
import { mcItem, scoreAnswers } from '../learning/assess.js';
import { dataTable } from '../a11y/text-mode.js';
import { registerTextModules } from '../a11y/textmode-modules.js';
import { announce } from '../a11y/announcer.js';
import { STATION } from './world.js';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };
const btn = (label, onClick, cls = 'v3-btn') => { const b = el('button', { type: 'button', className: cls, textContent: label }); b.addEventListener('click', onClick); return b; };
const para = (parent, text, cls) => parent.appendChild(el('p', { textContent: text, ...(cls ? { className: cls } : {}) }));

/** Short species names for the Now card (the full names are in the field guide). */
export const SHORT = { butterweed: 'Butterweed', daisyleaf: 'Daisy-leaf', 'blue-sedge': 'Blue Sedge', bunchgrass: 'Bunchgrass', 'fen-orchid': 'Fen Orchid' };
const MODULE_IDS = ['m1', 'm2', 'm3', 'm4', 'm5'];
export const MODULE_LABELS = ['Question', 'Species', 'Fieldwork', 'Reveal', 'Report'];

/** Rig views (target, radius, theta, phi). theta π = from the south (the station side). */
export const VIEWS = {
  m1: { target: [47, 1.0, 20], radius: 15, theta: Math.PI + 0.2, phi: 1.36 },
  m2: { target: [STATION.x + 1, 0.4, 8], radius: 4.2, theta: Math.PI + 0.15, phi: 1.12 },
  m3: { target: [50, 0, 42], radius: 64, theta: Math.PI, phi: 0.98 },
  m4: { target: [50, 0, 50], radius: 120, theta: Math.PI, phi: 0.3 },
  m5: { target: [STATION.x - 0.2, 0.9, STATION.z + 0.1], radius: 2.4, theta: Math.PI + 0.35, phi: 1.02 },
};

export class Lessons {
  /**
   * @param {{ slug: string, content: object, population: object }} o
   *   content: species (content/species.json), designs, items, modules, cinematics
   */
  constructor({ slug, content, population }) {
    this.slug = slug;
    this.content = content;
    this.modules = content.modules;         // text-mode renderers read app.modules
    this.items = content.items;
    this.designs = content.designs;
    this.species = content.species.species;
    this.population = population;
    this.state = {
      module: 'm1', design: null, points: [], submitted: false, submission: null, simRan: false,
      hypothesis: null, precheck: {}, idQuiz: {}, chartAnswers: {}, transferAnswers: {}, reportDrafts: {}, rubric: null,
      completed: {}, cinematicSeen: {}, tmActiveQuadrat: null, done: {},
    };
    this.session = null;
    this.step = {};
    this.app = null;
    this.world = null;
    this.fw = { active: null, phase: 'tally', draft: null, pending: null, lens: false, zoomed: false };
    this.guideDialogMistakes = [];
    this.portraits = {};
  }

  // ------------------------------------------------------------ wiring
  bind(app, world) {
    this.app = app;
    this.world = world;
    this.record = app.record;
    if (!app.engine) return;
    app.rig.on('tap', (x, y) => this._onTap(x, y));
    app.shell.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    app.shell.canvas.addEventListener('pointerleave', () => world.setPreview(null));
  }

  /** Text-mode renderers (v2) registered against a small registry. */
  _textRenderers() {
    if (this._tm) return this._tm;
    const reg = {};
    registerTextModules({ textMode: { register: (id, fn) => { reg[id] = fn; } }, app: this });
    this._tm = reg;
    return reg;
  }

  hint(desktop, touch) { return this.app?.shell?.touch ? touch : desktop; }
  done(id) { return Boolean(this.state.done[id]); }
  complete(id, name = id, payload) {
    if (this.state.done[id]) return;
    this.state.done[id] = true;
    this.record?.log('completed', { id, name }, payload !== undefined ? { response: payload } : undefined);
  }

  // ------------------------------------------------------------ v2 "app" API (text mode, RevealUI, ReportUI)
  startSession() {
    if (!this.session) this.session = new FieldworkSession({ population: this.population, speciesList: this.species, budget: this.designs.budget, seed: 777 });
    return this.session;
  }
  getGrid() { return (this._grid ||= buildGrid(this.population)); }
  exportData() {
    if (!this.session) return;
    downloadCSV(dataSheetCSV(this.session.sheet, this.species), 'field-ecologist-data.csv');
    this.record.log('experienced', { id: 'csv-export', name: 'Downloaded the data sheet as CSV' });
  }
  /** Called by the v2 renderers to re-render (or move to) a module. */
  goToModule(id) {
    const i = MODULE_IDS.indexOf(id);
    if (i < 0) return;
    this._syncFromText();
    if (this.app.module !== i) this.app.goModule(i);
    else if (!this.app.shell.textModeRoot.hidden) this.app.shell._renderText();
    else this.refresh();
  }
  onModuleComplete(id) {
    const i = MODULE_IDS.indexOf(id);
    this.state.completed[id] = true;
    // Text mode marks the module done; the learner moves on with "Next module".
    if (i >= 0) this.app.shell.setModuleDone(i, true);
    this.record.log('completed', { id: `module-${id}`, name: MODULE_LABELS[i] });
  }
  /** Text mode may have chosen a design or saved quadrats: keep the scene in step. */
  _syncFromText() {
    if (this.session && this.world) {
      if (this.session.points !== this._shownPoints) { this.world.setQuadrats(this.session.points); this._shownPoints = this.session.points; }
      this.world.updateSheet(this.session.sheet);
      this.state.points = this.session.points;
    }
    if (this.session?.design) this.state.design = this.session.design;
  }
  // RevealUI hooks: virtual quadrats appear in the meadow while the simulator runs.
  onSimulatorStart() { this._rainShown = 0; return false; }
  onSimulatorProgress(done, total) {
    if (!this.world) return;
    const k = Math.max(1, Math.round((24 * done) / Math.max(1, total)));
    if (k <= this._rainShown) return;
    this._rainShown = k;
    this._ghostSets(k);
  }
  onSimulatorRun() { this.refresh(); }
  _ghostSets(k) {
    const design = this.state.design || 'random';
    const n = Math.min(40, Math.max(5, this.state.submission?.quadrats || 10));
    const clusters = showyClusters(this.population.positions.butterweed || []);
    const pts = [];
    for (let i = 0; i < k; i++) pts.push(...generateQuadrats(design, n, (10_000 + i) >>> 0, { butterweedClusters: clusters }));
    this.world.setGhosts(pts);
  }

  // ------------------------------------------------------------ module defs
  moduleDefs() {
    const L = this;
    this.steps = [this._m1(), this._m2(), this._m3(), this._m4(), this._m5()];
    const mk = (i) => ({
      id: MODULE_IDS[i], label: MODULE_LABELS[i],
      get view() { return VIEWS[MODULE_IDS[i]]; },
      calm: false,
      enter: () => L.enterModule(i),
      now: () => L.nowFor(i),
      text: (body) => L.textFor(i, body),
    });
    return MODULE_IDS.map((_, i) => mk(i));
  }

  enterModule(i) {
    this.state.module = MODULE_IDS[i];
    if (this.fw.active) this._leaveCounting({ save: false });
    const steps = this.steps[i];
    let k = steps.findIndex((s) => !s.done());
    if (k < 0) k = steps.length;
    this.step[i] = k;
    this._enterStep(i);
  }

  _enterStep(i) {
    this._active?.leave?.();
    const s = this.steps[i][this.step[i]];
    this._active = s || null;
    const a = this.app;
    if (a.engine) {
      a.inspect.setEnabled(!s?.noInspect);
      a.motion.setCalm(Boolean(s?.calm));
      this.world.setGlint(s?.glint || null);
      a.inspect.setCue(s?.cue || null);
    }
    s?.enter?.();
  }

  refresh() { if (this.app?.module >= 0 && this.app.shell.textModeRoot.hidden) this.app.shell.setNow(this.nowFor(this.app.module)); }

  next(i = this.app.module) {
    this.step[i] = (this.step[i] ?? 0) + 1;
    if (this.step[i] >= this.steps[i].length) { this._finishModule(i); return; }
    this._enterStep(i);
    this.refresh();
  }

  _finishModule(i) {
    this._active?.leave?.();
    this._active = null;
    this.state.completed[MODULE_IDS[i]] = true;
    this.record.log('completed', { id: `module-${MODULE_IDS[i]}`, name: MODULE_LABELS[i] });
    if (i + 1 < MODULE_IDS.length) this.app.completeModule(i);
    else { this.app.shell.setModuleDone(i, true); this.refresh(); this.app.shell.toast('Survey complete. Your report and record stay in this browser.', 5000); }
  }

  nowFor(i) {
    const steps = this.steps[i];
    const k = this.step[i] ?? 0;
    if (k >= steps.length) return this._doneCard(i);
    return { step: k + 1, total: steps.length, ...steps[k].now() };
  }

  _doneCard(i) {
    const last = i === MODULE_IDS.length - 1;
    return {
      kicker: 'Module complete',
      goal: last ? 'Survey complete' : `${MODULE_LABELS[i]} is done`,
      action: last ? 'Your report stays in this browser. Explore the meadow, or open My progress.' : 'Press Next module to go on, or keep exploring.',
      primary: last ? { label: 'Open my progress', onClick: () => this.app.shell.root.querySelector('[data-action="progress"]')?.click() } : { label: 'Next module', onClick: () => this.app.goModule(i + 1) },
    };
  }

  /** Text mode: the v2 renderer for this module, then a Next module button. */
  textFor(i, body) {
    const id = MODULE_IDS[i];
    const fn = this._textRenderers()[id];
    const api = { setTitle: (t) => { body.querySelector('h3').textContent = t; } };
    fn(body, api);
    if (i + 1 < MODULE_IDS.length) body.appendChild(btn('Next module', () => this.app.goModule(i + 1), 'v3-btn v3-primary'));
  }

  // ------------------------------------------------------------ shared drawers
  /** One question at a time in the drawer (pre-check, quiz, chart and transfer questions). */
  _questionDrawer({ title, items, store, key, trigger, intro, onAllDone, mapItem = (x) => x }) {
    const shell = this.app.shell;
    const render = (body) => {
      const answered = items.filter((it) => store[it.id]).length;
      const idx = items.findIndex((it) => !store[it.id]);
      if (intro && idx === 0) para(body, intro);
      if (idx < 0) {
        const score = scoreAnswers(items.map((it) => store[it.id]));
        const p = para(body, `All ${items.length} answered: ${score.correct} correct on the first try. Close this drawer to go on.`, 'chart-summary');
        body.appendChild(btn('Close', () => shell.closeDrawer(), 'v3-btn v3-primary'));
        shell.revealInDrawer(p);
        return;
      }
      para(body, `Question ${idx + 1} of ${items.length}`, 'v3-kicker');
      const item = mapItem(items[idx]);
      const wrap = mcItem({
        item, container: body,
        onAnswered: (r) => {
          store[items[idx].id] = r;
          this.record.log('answered', { id: items[idx].id, name: items[idx].prompt.slice(0, 60) }, { response: r.chosen, success: r.correct });
          if (!r.correct && items[idx].kind === 'species') this.guideDialogMistakes.push({ item: items[idx].id, chose: r.chosen, truth: item.correct });
          const last = idx === items.length - 1;
          const b = btn(last ? 'See your result' : 'Next question', () => { body.innerHTML = ''; render(body); }, 'v3-btn v3-primary');
          wrap.appendChild(b);
          b.focus();
          if (items.every((it) => store[it.id])) onAllDone?.();
        },
      });
      void answered;
    };
    shell.openDrawer({ title, key, trigger, render, onClose: () => this.refresh() });
  }

  _guideDrawer(trigger, onClose) {
    this.app.shell.openDrawer({
      title: 'Field guide', key: 'guide', trigger,
      render: (b) => { b.appendChild(buildGuide({ species: this.species, portraits: this.portraits || {}, compact: true })); },
      onClose: () => { onClose?.(); this.refresh(); },
    });
  }

  // ------------------------------------------------------------ Module 1: the question
  _m1() {
    const L = this;
    const hyp = this.items.hypothesisTask;
    return [
      {
        id: 'm1-arrive', done: () => L.done('m1-arrive'),
        now: () => ({
          goal: 'Arrive at Ashcombe Meadow',
          action: 'Press Watch the dawn to see the meadow wake up, or press Next step to begin.',
          hint: L.hint('Drag to look around. Click any plant or object to learn what it is.', 'Drag to look around. Tap any plant or object to learn what it is.'),
          primary: { label: 'Next step', onClick: () => { L.complete('m1-arrive', 'Arrived at the meadow'); L.next(0); } },
          secondary: L.app.engine ? { label: 'Watch the dawn', play: true, onClick: () => L.playDawn() } : undefined,
          readMore: { label: 'About this survey', title: 'About this survey', render: (b) => { para(b, L.modules.modules.m1.intro); const ul = b.appendChild(el('ul')); for (const f of L.modules.researchQuestion.meadowFacts) ul.appendChild(el('li', { textContent: f })); } },
        }),
      },
      {
        id: 'm1-hypothesis', done: () => Boolean(L.state.hypothesis),
        now: () => {
          const chosen = L.state.hypothesis;
          return {
            goal: 'Make a guess first',
            action: chosen ? 'Press Next step. The reveal in Module 4 will test your guess.' : 'Choose the answer you think is right. Any answer is a fair start.',
            question: chosen ? undefined : {
              prompt: hyp.nowPrompt,
              choices: hyp.options.map((o) => ({ id: o.id, text: o.short })),
              onAnswer: (id) => {
                L.state.hypothesis = id;
                L.record.log('answered', { id: hyp.id, name: 'Hypothesis choice' }, { response: id });
                setTimeout(() => L.refresh(), 2200);
                return { correct: true, feedback: hyp.nowFeedback };
              },
            },
            result: chosen ? `Your guess: ${hyp.options.find((o) => o.id === chosen)?.short}` : undefined,
            primary: { label: 'Next step', disabled: !chosen, onClick: () => L.next(0) },
            readMore: { label: 'Why guess first?', title: 'Why guess first?', render: (b) => para(b, hyp.why) },
          };
        },
      },
      {
        id: 'm1-precheck', done: () => L.items.precheck.every((it) => L.state.precheck[it.id]),
        now: () => {
          const n = L.items.precheck.filter((it) => L.state.precheck[it.id]).length;
          const all = n === L.items.precheck.length;
          return {
            goal: 'Check what you know',
            action: all ? 'Pre-check done. Press Next step.' : 'Press Open the pre-check. Answer five short questions, one at a time.',
            result: n ? `${n} of ${L.items.precheck.length} answered` : undefined,
            primary: all ? { label: 'Next step', onClick: () => { L.onModuleComplete('m1'); L.next(0); } }
              : { label: 'Open the pre-check', onClick: (e) => L._questionDrawer({ title: 'Pre-check', key: 'precheck', items: L.items.precheck, store: L.state.precheck, trigger: L.app.shell.now.querySelector('[data-action="now-primary"]') }) },
          };
        },
      },
    ];
  }

  // ------------------------------------------------------------ Module 2: species
  _m2() {
    const L = this;
    return [
      {
        id: 'm2-guide', done: () => L.done('m2-guide'), glint: 'field-station',
        now: () => ({
          goal: 'Meet the five species',
          action: L.done('m2-guide') ? 'Press Next step.' : 'Press Open the field guide. Read each plant in order: shape, size, leaf, then colour.',
          hint: L.hint('Then hover over plants near you to see their names.', 'Then tap plants near you to see their names.'),
          primary: L.done('m2-guide') ? { label: 'Next step', onClick: () => L.next(1) }
            : { label: 'Open the field guide', onClick: () => L._guideDrawer(L.app.shell.now.querySelector('[data-action="now-primary"]'), () => L.complete('m2-guide', 'Read the field guide')) },
        }),
      },
      {
        id: 'm2-lens', done: () => L.done('m2-lens'), glint: 'hand-lens',
        enter: () => { if (L.app.engine) L.app.rig.flyTo(L._lensSpotView(), 1.2); },
        leave: () => L._lensOff(),
        now: () => ({
          goal: 'Look closely with the hand lens',
          action: L.fw.zoomed ? 'Look at the leaf edges and flower heads. Press Lens off, then try another plant.' : L.hint('Press Use the hand lens, then click one plant near the quadrat frame.', 'Press Use the hand lens, then tap one plant near the quadrat frame.'),
          result: L.done('m2-lens') ? 'You used the lens. Use it again any time you are not sure.' : undefined,
          primary: L.done('m2-lens') ? { label: 'Next step', onClick: () => { L._lensOff(); L.next(1); } }
            : L.fw.lens ? { label: 'Lens off', onClick: () => L._lensOff() } : { label: 'Use the hand lens', onClick: () => L._lensOn() },
          secondary: L.done('m2-lens') && (L.fw.lens || L.fw.zoomed) ? { label: 'Lens off', onClick: () => L._lensOff() } : undefined,
        }),
      },
      {
        id: 'm2-quiz', done: () => L.items.idQuiz.every((it) => L.state.idQuiz[it.id]),
        now: () => {
          const n = L.items.idQuiz.filter((it) => L.state.idQuiz[it.id]).length;
          const all = n === L.items.idQuiz.length;
          return {
            goal: 'Name the species',
            action: all ? 'Quiz done. Press Next step to start fieldwork.' : 'Press Open the quiz. Name each plant from its marks, one at a time.',
            result: n ? `${n} of ${L.items.idQuiz.length} answered` : undefined,
            primary: all ? { label: 'Next step', onClick: () => { L.onModuleComplete('m2'); L.next(1); } }
              : { label: 'Open the quiz', onClick: () => L._quizDrawer() },
            readMore: all ? undefined : { label: 'Open the field guide', title: 'Field guide', render: (b) => b.appendChild(buildGuide({ species: L.species, portraits: L.portraits || {}, compact: true })) },
          };
        },
      },
    ];
  }

  _quizDrawer() {
    const opts = this.species.map((sp) => ({ id: sp.id, text: sp.name }));
    this._questionDrawer({
      title: 'Quiz', key: 'quiz', items: this.items.idQuiz, store: this.state.idQuiz,
      trigger: this.app.shell.now.querySelector('[data-action="now-primary"]'),
      mapItem: (it) => (it.kind === 'species' && !it.options ? { ...it, options: opts, correct: it.speciesRef } : it),
    });
  }

  /** A spot by the station where several species grow close together (the lens practice). */
  _lensSpotView() {
    const f = this.world?.roots.quadrat?.[0];
    const p = f ? f.position : new THREE.Vector3(STATION.x - 2.6, 0.9, STATION.z + 0.6);
    return { target: [p.x, p.y + 0.1, p.z + 0.6], radius: 2.6, theta: Math.PI + 0.25, phi: 0.95 };
  }

  _lensOn() {
    this.fw.lens = true;
    this.app.inspect.setEnabled(false);
    this._lensRing(false);
    this.refresh();
  }
  _lensOff() {
    const a = this.app;
    if (!a?.engine) return;
    const was = this.fw.zoomed;
    this.fw.lens = false;
    this.fw.zoomed = false;
    this._lensRing(false);
    if (!this.fw.active) a.inspect.setEnabled(!this._active?.noInspect);
    if (was && this._lensBack) a.rig.flyTo(this._lensBack, 0.6);
    this._lensBack = null;
    this.refresh();
  }
  _lensRing(on) {
    const layer = this.app.shell.labelLayer;
    let ring = layer.querySelector('.fe-lens');
    if (!ring) { ring = el('div', { className: 'fe-lens' }); ring.setAttribute('aria-hidden', 'true'); layer.appendChild(ring); }
    ring.classList.toggle('is-on', on);
  }
  /** Zoom the camera onto a point like a hand lens (a narrow field of view from close by). */
  _lensZoom(point) {
    const a = this.app;
    const cam = a.engine.camera;
    this._lensBack ||= a.rig.view();
    const flat = new THREE.Vector3(cam.position.x - point.x, 0, cam.position.z - point.z).normalize();
    const eye = point.clone().addScaledVector(flat, 0.38).add(new THREE.Vector3(0, 0.42, 0));
    a.rig.flyTo(a.rig.viewFrom(eye.toArray(), point.toArray(), { fov: 14 }), 0.7);
    this.fw.zoomed = true;
    this._lensRing(true);
    if (this._active?.id === 'm2-lens') this.complete('m2-lens', 'Used the hand lens');
    this.record.log('experienced', { id: 'hand-lens-look', name: 'Looked through the hand lens' });
    announce('Hand lens close-up. Press Lens off to step back.');
    this.refresh();
  }

  // ------------------------------------------------------------ Module 3: fieldwork
  _m3() {
    const L = this;
    return [
      {
        id: 'm3-design', done: () => Boolean(L.session?.design),
        now: () => {
          const d = L.session?.design ? L.designs.designs.find((x) => x.id === L.session.design) : null;
          return {
            goal: 'Choose a sampling design',
            action: d ? 'Press Next step to see where your quadrats go.' : 'Choose one design. Press Compare the designs to read about each one.',
            question: d ? undefined : {
              prompt: 'Where will your 10 quadrats go?',
              choices: L.designs.designs.map((x) => ({ id: x.id, text: x.name })),
              onAnswer: (id) => { L.chooseDesign(id); setTimeout(() => L.refresh(), 1600); return { correct: true, feedback: `${L.designs.designs.find((x) => x.id === id).name}: ${L.designs.designs.find((x) => x.id === id).nowLine}` }; },
            },
            result: d ? `Your design: ${d.name}` : undefined,
            primary: { label: 'Next step', disabled: !d, onClick: () => L.next(2) },
            readMore: { label: 'Compare the designs', title: 'Compare the designs', render: (b) => L._designCards(b) },
          };
        },
      },
      {
        id: 'm3-place', done: () => Boolean(L.session?.placementDone() && L.done('m3-place')),
        enter: () => { if (L.app.engine) L.app.rig.flyTo(VIEWS.m3, 1.2); },
        leave: () => L.world?.setPreview(null),
        now: () => {
          const s = L.session;
          if (!s) return { goal: 'Choose a design first', action: 'Press Back to the designs.', primary: { label: 'Back to the designs', onClick: () => { L.step[2] = 0; L._enterStep(2); L.refresh(); } } };
          if (s.design === 'convenience' && !s.placementDone()) {
            return {
              goal: 'Place your quadrats by hand',
              action: L.hint(`Click the meadow where you want each quadrat. A pale frame shows the spot.`, `Tap the meadow where you want each quadrat.`),
              result: `${s.points.length} of ${s.maxQuadrats} placed`,
              hint: 'Keyboard: Place by map lets you type the spot.',
              primary: { label: 'Place by map', onClick: () => L._placementDrawer() },
            };
          }
          const what = { random: 'Your 10 stakes mark random spots.', systematic: 'Your 10 stakes sit on an even grid.', stratified: 'Your stakes are spread over the wet, middle and dry zones.', convenience: 'Your 10 frames are where you put them.' }[s.design];
          return {
            goal: 'See where your quadrats are',
            action: `${what} Press Next step to start counting.`,
            hint: 'Each numbered stake marks one quadrat. Click a stake to learn more.',
            primary: { label: 'Next step', onClick: () => { L.complete('m3-place', 'Placed the quadrats'); L.next(2); } },
            secondary: s.design === 'random' && s.redrawsLeft > 0 && s.visitsDone === 0 ? { label: 'Redraw the spots', onClick: () => L.redraw() } : undefined,
          };
        },
      },
      {
        id: 'm3-count', done: () => Boolean(L.session && (L.session.sheet.allVisited() && !L.fw.active || L.done('m3-count'))),
        leave: () => { if (L.fw.active) L._leaveCounting({ save: false }); },
        now: () => L._countCard(),
      },
      {
        id: 'm3-submit', done: () => Boolean(L.state.submitted),
        now: () => ({
          goal: 'Hand in your data',
          action: 'Press Open the data sheet. Check your rows, then press Submit fieldwork.',
          result: L.session ? `${L.session.sheet.completedRecords().length} quadrats recorded` : undefined,
          primary: { label: 'Open the data sheet', onClick: () => L._dataSheetDrawer() },
        }),
      },
    ];
  }

  _designCards(b) {
    para(b, 'Each design is described honestly, including the one that will bias your estimate. You have 10 quadrats and one field day.');
    for (const d of this.designs.designs) {
      const card = b.appendChild(el('section', { className: 'fe-design' }));
      card.appendChild(el('h3', { textContent: `${d.name} (${d.kind === 'probability' ? 'probability design' : 'not a probability design'})` }));
      para(card, d.definition);
      para(card, `Strength: ${d.pros}`);
      para(card, `Trade-off: ${d.cons}`);
      if (!this.session?.design) card.appendChild(btn(`Choose ${d.name}`, () => { this.chooseDesign(d.id); this.app.shell.closeDrawer(); }, 'v3-btn'));
    }
  }

  chooseDesign(id) {
    this.startSession();
    const res = this.session.chooseDesign(id);
    if (!res.ok) { announce(res.error, { assertive: true }); return res; }
    this.state.design = id;
    this.record.log('experienced', { id: `design-${id}`, name: `Chose design: ${id}` }, { response: id });
    this._syncFromText();
    return res;
  }

  redraw() {
    const r = this.session?.redraw();
    if (!r?.ok) { this.app.shell.toast(r?.error || 'No redraw left.'); return; }
    this._syncFromText();
    this.app.shell.toast('New random spots drawn. That was your one redraw.');
    this.refresh();
  }

  placeConvenience(x, z) {
    const s = this.session;
    const res = s?.placeConvenience(x, z);
    if (!res?.ok) { this.app.shell.toast(res?.error || 'Choose a design first.'); return res; }
    this._syncFromText();
    announce(`Quadrat ${s.points.length} placed at x ${Math.round(res.point.x)}, z ${Math.round(res.point.z)}.`);
    if (s.placementDone()) this.app.shell.toast('All 10 quadrats placed.');
    this.refresh();
    return res;
  }

  _placementDrawer() {
    const L = this;
    this.app.shell.openDrawer({
      title: 'Placement map', key: 'placement', trigger: this.app.shell.now.querySelector('[data-action="now-primary"]'),
      render: (b) => {
        const s = L.session;
        para(b, `Type a spot (in metres from the south-west corner), or click the map. ${s.points.length} of ${s.maxQuadrats} placed.`);
        const map = new MeadowMap({ interactive: true, onPick: (x, z) => { L.placeConvenience(x, z); L._placementDrawer(); } });
        map.setQuadrats(s.points);
        b.appendChild(map.el);
        const row = b.appendChild(el('div', { className: 'fe-coords' }));
        const ix = el('input', { type: 'number', min: 1, max: 99, step: 0.5, id: 'place-x' });
        const iz = el('input', { type: 'number', min: 1, max: 99, step: 0.5, id: 'place-z' });
        row.append(el('label', { textContent: 'x (west to east) ' }, ix), el('label', { textContent: 'z (south to north) ' }, iz));
        row.appendChild(btn('Place quadrat here', () => {
          const x = parseFloat(ix.value), z = parseFloat(iz.value);
          if (Number.isNaN(x) || Number.isNaN(z)) { announce('Enter both numbers first.', { assertive: true }); return; }
          L.placeConvenience(x, z);
          if (L.session.placementDone()) L.app.shell.closeDrawer(); else L._placementDrawer();
        }, 'v3-btn v3-primary'));
      },
      onClose: () => this.refresh(),
    });
  }

  // ---- counting
  _nextUnvisited() { return this.session?.sheet.quadrats.find((q) => !q.visited)?.index ?? null; }

  _countCard() {
    const s = this.session;
    const fw = this.fw;
    if (!s) return { goal: 'Choose a design first', action: 'Press Back to the designs.', primary: { label: 'Back to the designs', onClick: () => { this.step[2] = 0; this._enterStep(2); this.refresh(); } } };
    const time = `Field time left: ${Math.round(s.remainingTime())} of ${s.budget.timeUnits}`;
    if (!fw.active) {
      const next = this._nextUnvisited();
      const visited = s.sheet.visitedCount();
      if (!next || s.remainingTime() <= 0) {
        return {
          goal: 'Fieldwork done',
          action: s.remainingTime() <= 0 && next ? 'The field day is over. Press Next step to hand in what you have.' : 'All quadrats counted. Press Next step to hand in your data.',
          result: `${visited} of ${s.points.length} quadrats counted`,
          primary: { label: 'Next step', onClick: () => { this.complete('m3-count', 'Fieldwork counted'); this.next(2); } },
        };
      }
      return {
        goal: 'Count your quadrats',
        action: `Press Go to quadrat ${next}. Walking there uses field time.`,
        result: `${visited} of ${s.points.length} counted · ${time}`,
        hint: 'You can open your data sheet at any time.',
        primary: { label: `Go to quadrat ${next}`, onClick: () => this.enterQuadrat(next) },
        secondary: { label: 'Open the data sheet', onClick: () => this._dataSheetDrawer() },
      };
    }
    const i = fw.active;
    const zone = zoneOf(s.points[i - 1].x);
    const kicker = `Quadrat ${i} of ${s.points.length} · ${zone} zone`;
    if (fw.phase === 'pick') {
      return {
        kicker, goal: 'Which species is this?',
        action: 'Choose its name. Not sure? Press Cancel and use the hand lens.',
        tool: (box) => {
          const row = box.appendChild(el('div', { className: 'fe-picker', role: 'group' }));
          row.setAttribute('aria-label', 'Species');
          for (const sp of this.species) row.appendChild(btn(SHORT[sp.id], () => this._tally(sp.id), 'v3-btn fe-pick'));
        },
        primary: { label: 'Cancel', onClick: () => { fw.phase = 'tally'; fw.pending = null; this.refresh(); } },
      };
    }
    if (fw.phase === 'cover') {
      const band = COVER_BANDS.find((b) => b.id === fw.draft.cover);
      return {
        kicker, goal: 'Estimate the grass cover',
        action: band ? `Press Save quadrat ${i}.` : 'Choose how much of the frame Tussock Bunchgrass covers.',
        question: band ? undefined : {
          prompt: 'Bunchgrass covers about…',
          choices: COVER_BANDS.map((b) => ({ id: b.id, text: b.label })),
          onAnswer: (id) => { fw.draft.cover = id; setTimeout(() => this.refresh(), 900); return { correct: true, feedback: `Cover band ${COVER_BANDS.find((b) => b.id === id).label} noted.` }; },
        },
        result: band ? `Cover: ${band.label}` : undefined,
        primary: { label: `Save quadrat ${i}`, disabled: !band, onClick: () => this._saveQuadrat() },
        secondary: { label: 'Back to counting', onClick: () => { fw.phase = 'tally'; this.refresh(); } },
      };
    }
    const counts = this.species.filter((sp) => !sp.coverEstimated).map((sp) => `${SHORT[sp.id]} ${fw.draft.counts[sp.id] || 0}`).join(' · ');
    return {
      kicker, goal: fw.zoomed ? 'Hand lens close-up' : 'Count the plants in the frame',
      action: fw.zoomed ? 'Click a plant to count it, or press Lens off.'
        : fw.lens ? this.hint('Click the plant you want to look at closely.', 'Tap the plant you want to look at closely.')
          : this.hint('Click each plant whose base is inside the frame, then name it.', 'Tap each plant whose base is inside the frame, then name it.'),
      result: counts,
      tool: (box) => {
        const row = box.appendChild(el('div', { className: 'fe-tools' }));
        row.appendChild(btn(fw.lens ? 'Lens off' : 'Hand lens', () => (fw.lens ? this._lensOff() : this._lensOn()), 'v3-btn'));
        row.appendChild(btn('Count sheet', () => this._countSheetDrawer(), 'v3-btn'));
      },
      primary: { label: 'Next: grass cover', onClick: () => { fw.phase = 'cover'; this._lensOff(); this.refresh(); } },
    };
  }

  /** Walk to quadrat i (time charged), kneel, calm the scene and start counting. */
  enterQuadrat(i) {
    const s = this.session;
    const r = s.visit(i);
    if (!r.ok) { this.app.shell.toast(r.error); this.refresh(); return; }
    const rec = s.sheet.quadrats[i - 1];
    this.fw = { active: i, phase: 'tally', pending: null, lens: false, zoomed: false, draft: { counts: { ...rec.counts }, cover: rec.cover } };
    this.state.points = s.points;
    if (!r.alreadyVisited) {
      this.record.log('experienced', { id: `quadrat-${i}`, name: `Sampled quadrat ${i}` }, { response: `x ${s.points[i - 1].x.toFixed(0)}, z ${s.points[i - 1].z.toFixed(0)}` });
      announce(`Walking to quadrat ${i}. Field time used: ${r.cost.toFixed(1)}. ${Math.round(s.remainingTime())} left.`);
    }
    this.world.updateSheet(s.sheet);
    const a = this.app;
    if (a.engine) {
      a.inspect.close({ restore: false });
      a.inspect.setEnabled(false);
      a.motion.setCalm(true);
      this.world.setActiveQuadrat(i - 1);
      this.world.setCounting(true);
    }
    this.refresh();
    if (a.engine) requestAnimationFrame(() => a.rig.flyTo(this.world.kneelView(i - 1, this.freeRect()), 1.6));
  }

  /** The part of the screen (NDC) the Now card leaves free. */
  freeRect() {
    const sh = this.app.shell;
    const r = sh.now.getBoundingClientRect();
    const W = innerWidth, H = innerHeight, top = sh.topBarHeight();
    const nx = (px) => (px / W) * 2 - 1, ny = (py) => 1 - (py / H) * 2;
    const f = { x0: -0.98, x1: 0.98, y0: -0.98, y1: ny(top + 8) };
    // The notebook rail (left, desktop) or tab strip (bottom, phones).
    const nav = sh.topBar?.offsetParent ? sh.topBar.getBoundingClientRect() : null;
    if (nav?.width) { if (nav.height > H * 0.6) f.x0 = nx(nav.right + 12); else f.y0 = ny(nav.top - 12); }
    if (sh.now.hidden || !r.width) return f;
    if (r.width < W * 0.6) { if (r.left < W / 2) f.x0 = nx(r.right + 12); else f.x1 = nx(r.left - 12); }
    else f.y0 = ny(r.top - 12);
    return f;
  }

  _tally(id) {
    const fw = this.fw;
    const sp = this.species.find((x) => x.id === id);
    if (sp.coverEstimated) {
      this.app.shell.toast('Bunchgrass is too dense to count. You estimate its cover next.');
      fw.phase = 'tally'; fw.pending = null; this.refresh();
      return;
    }
    fw.draft.counts[id] = (fw.draft.counts[id] || 0) + 1;
    if (fw.pending) this.world.addTally(fw.pending.base);
    this.record.log('experienced', { id: `quadrat-${fw.active}-tally`, name: `Tallied a plant in quadrat ${fw.active}` }, { response: id });
    if (fw.pending && fw.pending.id !== id) this.guideDialogMistakes.push({ item: `quad${fw.active}`, chose: id, truth: fw.pending.id });
    announce(`${sp.name}: ${fw.draft.counts[id]} in quadrat ${fw.active}.`);
    fw.phase = 'tally'; fw.pending = null;
    this.refresh();
  }

  _saveQuadrat() {
    const s = this.session, fw = this.fw, i = fw.active;
    const counts = {};
    for (const sp of this.species) if (!sp.coverEstimated) counts[sp.id] = parseInt(fw.draft.counts[sp.id] || 0, 10);
    s.record(i, { counts, cover: fw.draft.cover || null });
    s.finishVisit(i);
    this.record.log('attempted', { id: `quadrat-${i}-records`, name: `Recorded quadrat ${i}` }, { response: JSON.stringify({ counts, cover: fw.draft.cover || null }) });
    this.world.updateSheet(s.sheet);
    announce(`Quadrat ${i} saved.`);
    this.app.shell.toast(`Quadrat ${i} saved to your data sheet.`);
    this._leaveCounting({ save: true });
  }

  _leaveCounting() {
    const a = this.app;
    this._lensOff();
    this.fw = { active: null, phase: 'tally', draft: null, pending: null, lens: false, zoomed: false };
    if (a.engine) {
      this.world.setCounting(false);
      a.motion.setCalm(false);
      a.inspect.setEnabled(true);
      a.rig.flyTo(VIEWS.m3, 1.2);
    }
    this.refresh();
  }

  _countSheetDrawer() {
    const L = this, fw = this.fw, i = fw.active;
    this.app.shell.openDrawer({
      title: 'Count sheet', key: 'count-sheet', trigger: this.app.shell.now.querySelector('.fe-tools .v3-btn:nth-child(2)'),
      render: (b) => {
        para(b, `Quadrat ${i}. Type or fix each count. Leave a species at 0 if you find none.`);
        for (const sp of L.species.filter((x) => !x.coverEstimated)) {
          const inp = el('input', { type: 'number', min: 0, max: 999, step: 1, value: String(fw.draft.counts[sp.id] || 0), id: `count-${i}-${sp.id}` });
          inp.addEventListener('input', () => { fw.draft.counts[sp.id] = Math.max(0, parseInt(inp.value || '0', 10) || 0); });
          b.appendChild(el('label', { className: 'fe-count-row', textContent: `${sp.name} ` }, inp));
        }
        const fs = b.appendChild(el('fieldset'));
        fs.appendChild(el('legend', { textContent: 'Tussock Bunchgrass cover in the frame' }));
        for (const band of COVER_BANDS) {
          const r = el('input', { type: 'radio', name: `cover-${i}`, value: band.id, checked: fw.draft.cover === band.id });
          r.addEventListener('change', () => { if (r.checked) fw.draft.cover = band.id; });
          fs.appendChild(el('label', { className: 'choice' }, r, el('span', { textContent: ` ${band.label}` })));
        }
        b.appendChild(btn(`Save quadrat ${i}`, () => { L.app.shell.closeDrawer(); if (!fw.draft.cover) { fw.phase = 'cover'; L.refresh(); return; } L._saveQuadrat(); }, 'v3-btn v3-primary'));
        b.appendChild(el('h3', { textContent: 'Field guide' }));
        b.appendChild(buildGuide({ species: L.species, portraits: L.portraits || {}, compact: true }));
      },
      onClose: () => this.refresh(),
    });
  }

  _dataSheetDrawer() {
    const L = this;
    const s = this.session;
    this.app.shell.openDrawer({
      title: 'Data sheet', key: 'data-sheet', trigger: this.app.shell.now.querySelector('[data-action="now-primary"], [data-action="now-secondary"]'),
      render: (b) => {
        if (!s) { para(b, 'Choose a design in Module 3 first.'); return; }
        para(b, `Design: ${L.designs.designs.find((d) => d.id === s.design)?.name}. Field time left: ${Math.round(s.remainingTime())} of ${s.budget.timeUnits}.`);
        b.appendChild(dataTable(['Quadrat', 'Where (x, z m)', 'Records'], s.sheet.quadrats.map((q) => [
          String(q.index), `${s.points[q.index - 1].x.toFixed(0)}, ${s.points[q.index - 1].z.toFixed(0)} (${zoneOf(s.points[q.index - 1].x)})`,
          q.visited ? (Object.entries(q.counts).map(([sp, n]) => `${SHORT[sp]} ${n}`).join(', ') + (q.cover ? `, cover ${COVER_BANDS.find((x) => x.id === q.cover)?.label}` : '')) || 'none' : 'not counted yet',
        ]), 'Your data sheet: one row per quadrat'));
        const row = b.appendChild(el('div', { className: 'fe-row' }));
        const next = L._nextUnvisited();
        if (next && s.remainingTime() > 0 && !L.state.submitted) row.appendChild(btn(`Go to quadrat ${next}`, () => { L.app.shell.closeDrawer(); if (L.app.module !== 2 || L._active?.id !== 'm3-count') { L.step[2] = 2; L._enterStep(2); } L.enterQuadrat(next); }, 'v3-btn'));
        row.appendChild(btn('Download the data sheet (CSV)', () => L.exportData(), 'v3-btn'));
        const done = s.sheet.completedRecords().length;
        const sub = btn(L.state.submitted ? 'Submitted' : `Submit fieldwork (${done} quadrats)`, () => { L.submit(); L.app.shell.closeDrawer(); }, 'v3-btn v3-primary');
        sub.disabled = !done || L.state.submitted;
        row.appendChild(sub);
      },
      onClose: () => this.refresh(),
    });
  }

  submit() {
    const s = this.session;
    if (!s || this.state.submitted) return;
    const res = s.submit();
    this.state.submitted = true;
    this.state.submission = res;
    this.state.points = s.points;
    this.record.log('completed', { id: 'fieldwork-submission', name: 'Fieldwork submitted', description: `Design ${s.design}, ${res.quadrats} quadrats recorded` },
      { success: true, response: s.design, estimates: res.estimates, cover: res.cover, quadrats: res.quadrats });
    announce('Fieldwork submitted. The reveal is next.');
    this.complete('m3-count', 'Fieldwork counted');
    if (this.app.module === 2) {
      this.onModuleComplete('m3');
      this.step[2] = this.steps[2].length;
      this._finishModule(2);
    }
  }

  // ------------------------------------------------------------ Module 4: the reveal
  _reveal() {
    if (!this._revealUI) this._revealUI = new RevealUI({ app: this, container: el('div') });
    return this._revealUI;
  }

  _m4() {
    const L = this;
    const needData = () => ({ goal: 'Hand in your data first', action: 'Press Go to fieldwork. The reveal opens once you submit a sample.', primary: { label: 'Go to fieldwork', onClick: () => L.app.goModule(2) } });
    return [
      {
        id: 'm4-results', done: () => L.done('m4-results'),
        now: () => (!L.state.submitted ? needData() : {
          goal: 'See the true population',
          action: 'Press Open the results to compare your estimate with the truth.',
          hint: 'The yellow tint in the meadow marks every Butterweed plant.',
          primary: { label: 'Open the results', onClick: () => L._resultsDrawer() },
          secondary: L.app.engine ? { label: 'Watch the reveal', play: true, onClick: () => L.playReveal() } : undefined,
        }),
        enter: () => { if (L.state.submitted && L.world) L.world.highlightSpecies('butterweed', true); },
        leave: () => L.world?.highlightSpecies('butterweed', false),
      },
      {
        id: 'm4-sim', done: () => Boolean(L.state.simRan && L.done('m4-sim')),
        now: () => ({
          goal: 'Repeat your survey 1,000 times',
          action: L.state.simRan ? 'Read the chart, then press Next step.' : 'Press Open the simulator. Run 1,000 virtual samples, then read the chart.',
          hint: 'Each pale blue square in the meadow is one virtual quadrat.',
          primary: L.state.simRan ? { label: 'Next step', onClick: () => { L.complete('m4-sim', 'Ran the simulator'); L.next(3); } } : { label: 'Open the simulator', onClick: () => L._simDrawer() },
          secondary: L.state.simRan ? { label: 'Open the simulator', onClick: () => L._simDrawer() } : undefined,
        }),
        leave: () => L.world?.clearGhosts(),
      },
      {
        id: 'm4-charts', done: () => L.items.chartItems.every((it) => L.state.chartAnswers[it.id]),
        now: () => {
          const n = L.items.chartItems.filter((it) => L.state.chartAnswers[it.id]).length;
          const all = n === L.items.chartItems.length;
          return {
            goal: 'Read the sampling distributions',
            action: all ? 'Questions done. Press Next step.' : 'Press Open the chart questions. Answer them from the simulator chart.',
            result: n ? `${n} of ${L.items.chartItems.length} answered` : undefined,
            primary: all ? { label: 'Next step', onClick: () => { L.onModuleComplete('m4'); L.next(3); } }
              : { label: 'Open the chart questions', onClick: () => L._questionDrawer({ title: 'Chart questions', key: 'charts', items: L.items.chartItems, store: L.state.chartAnswers, trigger: L.app.shell.now.querySelector('[data-action="now-primary"]'), intro: 'Answer from the simulator chart (Open the simulator shows it again).' }) },
            secondary: { label: 'Open the simulator', onClick: () => L._simDrawer() },
          };
        },
      },
    ];
  }

  _resultsDrawer() {
    const ui = this._reveal();
    this.app.shell.openDrawer({
      title: 'Results', key: 'results', trigger: this.app.shell.now.querySelector('[data-action="now-primary"]'),
      render: (b) => { ui.container = b; b.appendChild(ui._revealTable()); b.appendChild(ui._errorSources()); },
      onClose: () => { this.complete('m4-results', 'Read the results'); if (this._active?.id === 'm4-results') this.next(3); else this.refresh(); },
    });
  }

  _simDrawer() {
    const ui = this._reveal();
    this.app.shell.openDrawer({
      title: 'Simulator', key: 'simulator', trigger: this.app.shell.now.querySelector('[data-action="now-primary"], [data-action="now-secondary"]'),
      render: (b) => {
        ui.container = b;
        para(b, this.modules.modules.m4.simulatorBlurb);
        b.appendChild(ui._simulatorControls());
        b.appendChild(ui._simResultsHost());
      },
      onClose: () => this.refresh(),
    });
  }

  // ------------------------------------------------------------ Module 5: report and transfer
  _m5() {
    const L = this;
    return [
      {
        id: 'm5-report', done: () => L.done('m5-report'), glint: 'clipboard',
        now: () => ({
          goal: 'Write your report',
          action: L.done('m5-report') ? 'Press Next step.' : 'Press Open the report. Write each part from your own data sheet.',
          hint: 'Your report is saved in this browser only. Nothing is graded by the app.',
          primary: L.done('m5-report') ? { label: 'Next step', onClick: () => L.next(4) } : { label: 'Open the report', onClick: () => L._reportDrawer() },
        }),
      },
      {
        id: 'm5-transfer', done: () => L.items.transfer.every((it) => L.state.transferAnswers[it.id]),
        now: () => {
          const n = L.items.transfer.filter((it) => L.state.transferAnswers[it.id]).length;
          const all = n === L.items.transfer.length;
          return {
            goal: 'Use it in a school survey',
            action: all ? 'Questions done. Press Finish.' : 'Press Open the transfer questions. The same sampling ideas work for people.',
            result: n ? `${n} of ${L.items.transfer.length} answered` : undefined,
            primary: all ? { label: 'Finish', onClick: () => { L.record.log('completed', { id: 'transfer-task', name: 'Survey-sampling transfer task' }, { success: true, ...scoreAnswers(L.items.transfer.map((it) => L.state.transferAnswers[it.id])) }); L.onModuleComplete('m5'); L.next(4); } }
              : { label: 'Open the transfer questions', onClick: () => L._questionDrawer({ title: 'Transfer questions', key: 'transfer', items: L.items.transfer, store: L.state.transferAnswers, trigger: L.app.shell.now.querySelector('[data-action="now-primary"]'), intro: L.modules.modules.m5.transferIntro }) },
          };
        },
      },
    ];
  }

  _reportDrawer() {
    const ui = new ReportUI({ app: this, container: el('div') });
    this.app.shell.openDrawer({
      title: 'Report', key: 'report', trigger: this.app.shell.now.querySelector('[data-action="now-primary"]'),
      render: (b) => { ui.container = b; para(b, this.modules.report.note); b.appendChild(ui._reportForm()); },
      onClose: () => { if (Object.values(this.state.reportDrafts).some((t) => String(t || '').trim()) || this.state.rubric) this.complete('m5-report', 'Wrote the report'); this.refresh(); },
    });
  }

  // ------------------------------------------------------------ pointer: lens, counting, placement
  _onTap(x, y) {
    const a = this.app;
    if (!a.engine || a.shell.phase === 'cinematic') return;
    const fw = this.fw;
    // Hand lens: the next tap zooms there.
    if (fw.lens && !fw.zoomed) {
      const hit = this.world.plantAt(x, y, fw.active ? { quadrat: this.session.points[fw.active - 1] } : {});
      const p = hit?.point || this.world.groundAt(x, y) || this.world.fieldPointAt(x, y);
      if (p) this._lensZoom(p);
      return;
    }
    if (fw.active && (fw.phase === 'tally' || fw.phase === 'pick')) {
      const q = this.session.points[fw.active - 1];
      const hit = this.world.plantAt(x, y, { quadrat: q });
      if (!hit) { a.shell.toast('No plant there. Click a stem or leaves inside the frame.'); return; }
      fw.pending = hit;
      fw.phase = 'pick';
      this.refresh();
      a.shell.now.querySelector('.fe-pick')?.focus({ preventScroll: true });
      return;
    }
    if (this._active?.id === 'm3-place' && this.session?.design === 'convenience' && !this.session.placementDone()) {
      const p = this.world.fieldPointAt(x, y);
      if (!p) { a.shell.toast('Click inside the meadow (the 100 m field).'); return; }
      this.placeConvenience(p.x, p.z);
    }
  }

  _onPointerMove(e) {
    if (this._active?.id !== 'm3-place' || this.session?.design !== 'convenience' || this.session.placementDone()) return;
    this.world.setPreview(this.world.fieldPointAt(e.clientX, e.clientY));
  }

  // ------------------------------------------------------------ cinematics
  _cine(id) { return this.content.cinematics.cinematics.find((c) => c.id === id); }

  playDawn() {
    const a = this.app, w = this.world;
    const def = this._cine('s1-dawn-arrival');
    a.player.onShot = (shot) => { if (shot.lighting) w.sky.setElevation(shot.lighting.sunElevationDeg); };
    a.player.onFinish = () => {
      a.player.onShot = null;
      w.sky.clearOverride();
      this.state.cinematicSeen['s1-dawn-arrival'] = true;
      this.record.log('experienced', { id: 'cinematic-s1-dawn-arrival', name: def.title });
      a.rig.flyTo(VIEWS.m1, 0.05);
    };
    a.playCinematic(def);
  }

  playReveal() {
    const a = this.app, w = this.world;
    const def = fillCaptionTokens(this._cine('s2-reveal'), this.population);
    w.highlightSpecies('butterweed', true);
    a.player.onFinish = () => {
      this.state.cinematicSeen['s2-reveal'] = true;
      this.record.log('experienced', { id: 'cinematic-s2-reveal', name: def.title });
      a.rig.flyTo(VIEWS.m4, 0.05);
    };
    a.playCinematic(def);
  }

  /** Legend entries for the scene's cues. */
  legend() { return this.world ? this.world.legend() : []; }
}

/**
 * Replace `{trueTotal.<speciesId>}` tokens in cinematic captions with the real totals.
 */
export function fillCaptionTokens(def, population) {
  const sub = (t) => (typeof t === 'string' ? t.replace(/\{trueTotal\.([a-z-]+)\}/g, (m, id) => (population.trueTotals[id] ?? 0).toLocaleString('en-US')) : t);
  return { ...def, shots: (def.shots || []).map((sh) => ({ ...sh, captions: (sh.captions || []).map(sub), description: sub(sh.description) })) };
}
