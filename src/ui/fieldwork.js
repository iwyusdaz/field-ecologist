/**
 * Module 3 — Fieldwork (3D mode UI): design picker → placement/points →
 * per-quadrat visit + counting → data sheet → submit. All state lives in the
 * shared FieldworkSession so text mode drives the identical logic.
 * @module ui/fieldwork
 */
import { FieldworkSession } from '../systems/fieldwork.js';
import { MeadowMap } from '../systems/meadow-map.js';
import { openGuideDialog } from './field-guide.js';
import { dataTable } from '../a11y/text-mode.js';
import { announce } from '../a11y/announcer.js';
import { zoneOf } from '../systems/moisture-field.js';
import { COVER_BANDS } from '../systems/data-sheet.js';

export class FieldworkUI {
  /**
   * @param {object} opts
   * @param {import('../app.js').App} opts.app
   * @param {HTMLElement} opts.container overlay container for the panel
   */
  constructor({ app, container }) {
    this.app = app;
    this.container = container;
    this.session = null;
    this.activeIndex = null;   // 1-based quadrat being counted
    this.collapsed = false;    // counting form hidden to show the whole quadrat
    this.drafts = new Map();   // quadrat index -> { counts: {id: string}, cover } typed but unsaved
    this.dialog = document.getElementById('guide-dialog');
  }

  get population() { return this.app.population; }
  get species() { return this.app.species; }
  get budget() { return this.app.designs.budget; }
  get scene() { return this.app.scene; }

  /** (Re)render the module panel from session state. */
  render() {
    this.container.innerHTML = '';
    const counting = !!(this.session && this.session.placementDone() && this.activeIndex);
    this.container.classList.toggle('counting-docked', counting && !this.collapsed);
    this.container.classList.toggle('counting-collapsed', counting && this.collapsed);
    if (!this.session) this._renderDesignPicker();
    else if (!this.session.placementDone()) this._renderPlacement();
    else if (counting && this.collapsed) this._renderCollapsed();
    else this._renderField();
    this._updateInset();
  }

  /**
   * Tell the scene how much of the canvas the docked form covers so the
   * orthographic view centres the quadrat in the free area (agent review:
   * visual 2, cognitive A, multimedia 1). Collapsed → the whole canvas.
   */
  _updateInset() {
    if (!this.scene?.setCountingInset) return;
    const docked = this.container.classList.contains('counting-docked');
    const narrow = window.matchMedia?.('(max-width: 700px)').matches;
    const px = docked && !narrow ? this.container.getBoundingClientRect().width + 16 : 0;
    this.scene.setCountingInset(px);
  }

  /** Remove dock classes (called when leaving the module). */
  undock() {
    this.container.classList.remove('counting-docked', 'counting-collapsed');
    this.scene?.setCountingInset?.(0);
  }

  /** Collapsed counting state: one bar, the quadrat fills the view; drafts are kept. */
  _renderCollapsed() {
    const bar = document.createElement('section');
    bar.className = 'panel counting-collapsed-bar';
    bar.setAttribute('aria-label', `Counting quadrat ${this.activeIndex} (form hidden)`);
    const show = document.createElement('button');
    show.type = 'button';
    show.textContent = `Show counting form (quadrat ${this.activeIndex})`;
    show.setAttribute('aria-expanded', 'false');
    show.addEventListener('click', () => {
      this.collapsed = false;
      this.render();
      this.container.querySelector('.counting-form input')?.focus();
    });
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Your typed counts are kept.';
    bar.append(show, p);
    this.container.appendChild(bar);
    show.focus();
  }

  _draft(i) {
    if (!this.drafts.has(i)) this.drafts.set(i, { counts: {}, cover: undefined });
    return this.drafts.get(i);
  }

  // ---------- design picker ----------
  _renderDesignPicker() {
    const sec = this._panel('Choose your sampling design');
    const intro = document.createElement('p');
    intro.textContent = 'The map already shows the moisture gradient (wet by the stream, dry on the rise). Each design below is described honestly — including the one that will bias your estimate. You have a budget of 10 quadrats and one field day.';
    sec.appendChild(intro);
    for (const d of this.app.designs.designs) {
      const card = document.createElement('article');
      card.className = 'design-card' + (d.kind === 'nonprobability' ? ' nonprobability' : '');
      const h = document.createElement('h3');
      h.textContent = d.name;
      const kind = document.createElement('span');
      kind.className = 'kind-badge';
      kind.textContent = d.kind === 'probability' ? 'probability design' : 'non-probability design';
      h.appendChild(document.createTextNode(' '));
      h.appendChild(kind);
      card.appendChild(h);
      const def = document.createElement('p');
      def.textContent = d.definition;
      card.appendChild(def);
      const pros = document.createElement('p');
      pros.innerHTML = `<strong>Strength:</strong> `;
      pros.appendChild(document.createTextNode(d.pros));
      const cons = document.createElement('p');
      cons.innerHTML = `<strong>Trade-off:</strong> `;
      cons.appendChild(document.createTextNode(d.cons));
      card.append(pros, cons);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `Choose ${d.name}`;
      btn.addEventListener('click', () => this._choose(d.id, btn));
      card.appendChild(btn);
      sec.appendChild(card);
    }
    this.container.appendChild(sec);
  }

  _choose(designId, trigger) {
    this.session = new FieldworkSession({
      population: this.population,
      speciesList: this.species,
      budget: this.budget,
      seed: 777,
    });
    const res = this.session.chooseDesign(designId);
    if (!res.ok) { announce(res.error, { assertive: true }); return; }
    this.app.record.log('experienced', {
      id: `design-${designId}`,
      name: `Chose design: ${designId}`,
      description: 'Sampling design choice for the fieldwork',
    }, { response: designId });
    this.app.state.design = designId;
    this._syncScene();
    announce(`Design chosen: ${designId}.`);
    this.render();
  }

  // ---------- placement (convenience) ----------
  _renderPlacement() {
    const s = this.session;
    const sec = this._panel('Place your quadrats — wherever looks interesting');
    const p = document.createElement('p');
    p.textContent = `This is the non-probability design: you pick each centre. Placed ${s.points.length} of ${s.maxQuadrats}. Click the map, or type coordinates — both do the same thing.`;
    sec.appendChild(p);

    const map = new MeadowMap({ interactive: true, onPick: (x, z) => this._placeAt(x, z) });
    map.setQuadrats(s.points);
    sec.appendChild(map.el);

    const row = document.createElement('div');
    row.className = 'coord-row';
    const lblX = document.createElement('label');
    lblX.append('x (0–100 m) ');
    const inX = document.createElement('input');
    inX.type = 'number'; inX.min = 0; inX.max = 100; inX.step = 0.5; inX.id = 'place-x';
    lblX.appendChild(inX);
    const lblZ = document.createElement('label');
    lblZ.append('z (0–100 m) ');
    const inZ = document.createElement('input');
    inZ.type = 'number'; inZ.min = 0; inZ.max = 100; inZ.step = 0.5; inZ.id = 'place-z';
    lblZ.appendChild(inZ);
    const placeBtn = document.createElement('button');
    placeBtn.type = 'button';
    placeBtn.textContent = 'Place quadrat here';
    placeBtn.addEventListener('click', () => {
      const x = parseFloat(inX.value), z = parseFloat(inZ.value);
      if (Number.isNaN(x) || Number.isNaN(z)) { announce('Enter both coordinates first.', { assertive: true }); return; }
      this._placeAt(x, z);
    });
    row.append(lblX, lblZ, placeBtn);
    sec.appendChild(row);
    this.container.appendChild(sec);
  }

  _placeAt(x, z) {
    const res = this.session.placeConvenience(x, z);
    if (!res.ok) { announce(res.error, { assertive: true }); return; }
    this._syncScene();
    if (this.session.placementDone()) {
      announce('All quadrats placed. The fieldwork view is ready.');
      this.render();
    } else {
      announce(`Quadrat ${this.session.points.length} placed at x ${Math.round(x)}, z ${Math.round(z)}.`);
      this.render();
    }
  }

  // ---------- fieldwork view ----------
  _renderField() {
    const s = this.session;
    const sec = this._panel(`Fieldwork — ${s.points.length} quadrats, one field day`);

    // status row: time meter + design summary + controls
    const status = document.createElement('div');
    status.className = 'fw-status';
    const meter = document.createElement('div');
    meter.className = 'time-meter';
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', 'Remaining field time');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    meter.setAttribute('aria-valuenow', String(Math.round(s.timeFraction() * 100)));
    const fill = document.createElement('div');
    fill.className = 'time-fill';
    fill.style.width = `${s.timeFraction() * 100}%`;
    meter.appendChild(fill);
    const timeTxt = document.createElement('span');
    timeTxt.className = 'time-text';
    timeTxt.textContent = `Field time left: ${Math.round(s.remainingTime())} of ${s.budget.timeUnits} units`;
    status.append(meter, timeTxt);

    if (s.design === 'random' && s.redrawsLeft > 0 && s.visitsDone === 0) {
      const redraw = document.createElement('button');
      redraw.type = 'button';
      redraw.textContent = `Redraw quadrat locations (${s.redrawsLeft} left)`;
      redraw.addEventListener('click', () => {
        const r = s.redraw();
        if (!r.ok) { announce(r.error, { assertive: true }); return; }
        this._syncScene();
        announce('New random locations drawn.');
        this.render();
      });
      status.appendChild(redraw);
    }
    sec.appendChild(status);

    // quadrat chips + map
    const wrap = document.createElement('div');
    wrap.className = 'fw-layout';
    const chips = document.createElement('div');
    chips.className = 'quadrat-chips';
    chips.setAttribute('role', 'list');
    chips.setAttribute('aria-label', 'Quadrats');
    const visited = s.sheet.quadrats.map((q) => q.visited);
    s.points.forEach((pt, idx) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (visited[idx] ? ' visited' : '');
      chip.setAttribute('role', 'listitem');
      const zone = zoneOf(pt.x);
      chip.textContent = `${idx + 1}`;
      chip.setAttribute('aria-label',
        `Quadrat ${idx + 1}: x ${pt.x.toFixed(0)}, z ${pt.z.toFixed(0)}, ${zone} zone${visited[idx] ? ', sampled' : ''}`);
      chip.title = `Quadrat ${idx + 1} — x ${pt.x.toFixed(0)} m, z ${pt.z.toFixed(0)} m (${zone})`;
      chip.addEventListener('click', () => this.openQuadrat(idx + 1));
      chips.appendChild(chip);
    });
    const map = new MeadowMap({ showZones: true });
    map.setQuadrats(s.points);
    map.setStates(visited, this.activeIndex ? this.activeIndex - 1 : -1);
    wrap.append(chips, map.el);

    // counting form for the active quadrat (or hint)
    const work = document.createElement('div');
    work.className = 'counting-area';
    if (this.activeIndex) work.appendChild(this._countingForm(this.activeIndex));
    else {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Select a quadrat to walk to it and record what grows inside. Each walk costs time; when the meter empties, the day ends with whatever you have.';
      work.appendChild(hint);
    }
    wrap.appendChild(work);
    sec.appendChild(wrap);

    // data sheet + export + submit
    sec.appendChild(this._dataSheetBlock());

    this.container.appendChild(sec);
  }

  _countingForm(i) {
    const s = this.session;
    const rec = s.sheet.quadrats[i - 1];
    const form = document.createElement('section');
    form.className = 'counting-form';
    const h = document.createElement('h3');
    h.textContent = `Quadrat ${i} of ${s.points.length} — ${zoneOf(rec.x)} zone`;
    form.appendChild(h);

    // guide access
    const guideBtn = document.createElement('button');
    guideBtn.type = 'button';
    guideBtn.textContent = 'Open field guide';
    guideBtn.addEventListener('click', () => openGuideDialog(this.dialog, {
      species: this.species, portraits: this.app.portraits, trigger: guideBtn,
    }));
    form.appendChild(guideBtn);
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'secondary';
    hideBtn.textContent = 'Hide form to see the whole quadrat';
    hideBtn.setAttribute('aria-expanded', 'true');
    hideBtn.addEventListener('click', () => { this.collapsed = true; this.render(); announce('Counting form hidden. Your typed counts are kept.'); });
    form.appendChild(hideBtn);
    const draft = this._draft(i);

    const blankNote = document.createElement('p');
    blankNote.className = 'hint';
    blankNote.textContent = 'Leave a count blank or type 0 if you find none: blanks are saved as 0.';
    form.appendChild(blankNote);

    const list = document.createElement('div');
    for (const sp of this.species) {
      const rowEl = document.createElement('div');
      rowEl.className = 'count-row';
      const name = document.createElement('label');
      name.className = 'count-name';
      name.append(`${sp.name} `);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 0; input.max = 999; input.step = 1;
      input.id = `count-${i}-${sp.id}`;
      input.value = draft.counts[sp.id] !== undefined ? draft.counts[sp.id]
        : rec.counts[sp.id] !== undefined ? String(rec.counts[sp.id]) : '';
      input.addEventListener('input', () => { draft.counts[sp.id] = input.value; });
      input.setAttribute('aria-label', `Count of ${sp.name} in quadrat ${i}`);
      if (sp.coverEstimated) {
        // percent-cover bands instead of a count
        const fs = document.createElement('fieldset');
        fs.className = 'cover-bands';
        const lg = document.createElement('legend');
        lg.textContent = `${sp.name} — percent cover band (too dense to count)`;
        fs.appendChild(lg);
        for (const band of COVER_BANDS) {
          const lab = document.createElement('label');
          lab.className = 'choice';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `cover-${i}`;
          radio.value = band.id;
          radio.checked = (draft.cover !== undefined ? draft.cover : rec.cover) === band.id;
          radio.addEventListener('change', () => { if (radio.checked) draft.cover = band.id; });
          lab.append(radio, Object.assign(document.createElement('span'), { textContent: ` ${band.label}` }));
          fs.appendChild(lab);
        }
        rowEl.appendChild(fs);
      } else {
        name.appendChild(input);
        const marks = document.createElement('span');
        marks.className = 'count-marks';
        marks.textContent = ` — ${(sp.fieldMarks[0] || '').replace(/^shape:\s*/i, '')}`;
        name.appendChild(marks);
        rowEl.appendChild(name);
      }
      list.appendChild(rowEl);
    }
    form.appendChild(list);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save and close this quadrat';
    save.addEventListener('click', () => {
      const counts = {};
      for (const sp of this.species) {
        if (sp.coverEstimated) continue;
        const v = form.querySelector(`#count-${i}-${sp.id}`)?.value;
        if (v !== '' && v != null) counts[sp.id] = parseInt(v, 10);
      }
      const coverSel = form.querySelector(`input[name="cover-${i}"]:checked`);
      s.record(i, { counts, cover: coverSel ? coverSel.value : null });
      s.finishVisit(i);
      this.app.record.log('attempted', {
        id: `quadrat-${i}-records`,
        name: `Recorded quadrat ${i}`,
        description: `${Object.keys(counts).length} species count(s)${coverSel ? ' + cover band' : ''}`,
      }, { response: JSON.stringify({ counts, cover: coverSel ? coverSel.value : null }) });
      announce(`Quadrat ${i} saved. ${Object.keys(counts).length} species recorded.`);
      this.drafts.delete(i);
      this.collapsed = false;
      this.activeIndex = null;
      this._closeTallyPicker();
      this.scene?.exitQuadratView();
      this.render();
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Close without saving';
    cancel.addEventListener('click', () => {
      this.drafts.delete(i);
      this.collapsed = false;
      this.activeIndex = null;
      this._closeTallyPicker();
      this.scene?.exitQuadratView();
      this.render();
    });
    btnRow.append(save, cancel);
    form.appendChild(btnRow);
    return form;
  }

  _dataSheetBlock() {
    const s = this.session;
    const sec = document.createElement('section');
    sec.className = 'data-sheet-block';
    const h = document.createElement('h3');
    h.textContent = 'Your data sheet';
    sec.appendChild(h);
    const rows = s.sheet.quadrats.map((q) => [
      q.index,
      q.visited ? `${q.x.toFixed(0)}, ${q.z.toFixed(0)}` : '—',
      Object.entries(q.counts).map(([sp, n]) => `${sp}:${n}`).join(', ') || (q.cover ? `cover:${q.cover}` : '—'),
      q.visited ? q.timeCost.toFixed(1) : '—',
    ]);
    sec.appendChild(dataTable(
      ['Quadrat', 'x, z (m)', 'Records', 'Time cost'],
      rows,
      'Data sheet: one row per quadrat (— = not yet sampled)',
    ));
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Download data sheet (CSV)';
    exportBtn.addEventListener('click', () => this.app.exportData());
    btnRow.appendChild(exportBtn);

    const submit = document.createElement('button');
    submit.type = 'button';
    const completed = s.sheet.completedRecords().length;
    submit.textContent = `Submit fieldwork for the reveal (${completed} quadrat${completed === 1 ? '' : 's'} recorded)`;
    submit.disabled = completed === 0;
    submit.addEventListener('click', () => this._submit(submit));
    btnRow.appendChild(submit);
    sec.appendChild(btnRow);
    return sec;
  }

  _submit(trigger) {
    const s = this.session;
    const res = s.submit();
    this.app.state.submitted = true;
    this.app.state.submission = res;
    this.app.record.log('completed', {
      id: 'fieldwork-submission',
      name: 'Fieldwork submitted',
      description: `Design ${s.design}, ${res.quadrats} quadrats recorded`,
    }, {
      success: true,
      response: s.design,
      estimates: res.estimates,
      cover: res.cover,
      quadrats: res.quadrats,
    });
    announce('Fieldwork submitted. The reveal is ready in Module 4.');
    this.app.goToModule('m4');
  }

  /** Open (walk to) quadrat i and show its counting form. */
  openQuadrat(i) {
    const s = this.session;
    const res = s.visit(i);
    if (!res.ok) { announce(res.error, { assertive: true }); return; }
    this.activeIndex = i;
    this.collapsed = false;
    if (!res.alreadyVisited) {
      announce(`Walking to quadrat ${i}. Time charged: ${res.cost.toFixed(1)} units. ${Math.round(s.remainingTime())} left.`);
    }
    const p = s.points[i - 1];
    if (this.scene) {
      this.scene.setQuadrats(s.points);
      this.scene.walkTo(p.x, p.z, {
        height: 1.6,
        duration: 1.2,
        then: () => {
          this.scene.enterQuadratView(i - 1);
          this.scene.onCountTap = (tap) => this._openTallyPicker(i, tap);
          announce(`Counting view open for quadrat ${i}. Click a plant to tally it, or type the counts in the form.`);
        },
      });
    }
    this.render();
  }

  /**
   * v2 revision I3 (§4.3 tap-to-count): after a click on the plant, the learner
   * names its species from a five-button picker; the matching count (draft and
   * visible input) goes up by one and a tally ring marks the spot. The scene
   * never tells the picker which plant was hit, so identification stays the
   * learner's job. The number inputs remain the keyboard/text equivalent.
   */
  _openTallyPicker(i, tap) {
    this._closeTallyPicker();
    const picker = document.createElement('div');
    picker.className = 'tally-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Which species is this plant?');
    const q = document.createElement('p');
    q.className = 'tally-q';
    q.textContent = 'Which species is this?';
    picker.appendChild(q);
    for (const sp of this.species) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.species = sp.id;
      if (sp.coverEstimated) {
        b.textContent = `${sp.name} (cover, not counted)`;
        b.addEventListener('click', () => {
          announce(`${sp.name} is recorded as a percent-cover band in the form, not tallied.`);
          this._closeTallyPicker();
        });
      } else {
        b.textContent = sp.name;
        b.addEventListener('click', () => this._tally(i, sp, tap));
      }
      picker.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this._closeTallyPicker());
    picker.appendChild(cancel);
    picker.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this._closeTallyPicker(); } });
    picker.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, tap.clientX + 12))}px`;
    picker.style.top = `${Math.max(8, Math.min(window.innerHeight - 280, tap.clientY - 20))}px`;
    document.body.appendChild(picker);
    this._picker = picker;
    picker.querySelector('button')?.focus();
  }

  _closeTallyPicker() {
    if (this._picker) { this._picker.remove(); this._picker = null; }
  }

  _tally(i, sp, tap) {
    const draft = this._draft(i);
    const rec = this.session.sheet.quadrats[i - 1];
    const input = document.getElementById(`count-${i}-${sp.id}`);
    const cur = draft.counts[sp.id] !== undefined ? draft.counts[sp.id]
      : input ? input.value : rec.counts[sp.id] !== undefined ? String(rec.counts[sp.id]) : '';
    const next = (parseInt(cur, 10) || 0) + 1;
    draft.counts[sp.id] = String(next);
    if (input) input.value = String(next);
    this.scene?.addTallyMark(tap.x, tap.z);
    this.app.record.log('experienced', { id: `quadrat-${i}-tally`, name: `Tallied a plant in quadrat ${i}` }, { response: sp.id });
    announce(`${sp.name}: ${next} tallied in quadrat ${i}.`);
    this._closeTallyPicker();
  }

  _syncScene() {
    if (this.scene) this.scene.setQuadrats(this.session.points);
    this.app.state.points = this.session.points;
  }

  _panel(title) {
    const sec = document.createElement('section');
    sec.className = 'panel';
    sec.setAttribute('aria-label', title);
    const h = document.createElement('h2');
    h.textContent = title;
    sec.appendChild(h);
    return sec;
  }
}
