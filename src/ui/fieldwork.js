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
    this.dialog = document.getElementById('guide-dialog');
  }

  get population() { return this.app.population; }
  get species() { return this.app.species; }
  get budget() { return this.app.designs.budget; }
  get scene() { return this.app.scene; }

  /** (Re)render the module panel from session state. */
  render() {
    this.container.innerHTML = '';
    if (!this.session) this._renderDesignPicker();
    else if (!this.session.placementDone()) this._renderPlacement();
    else this._renderField();
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
      input.value = rec.counts[sp.id] !== undefined ? String(rec.counts[sp.id]) : '';
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
          radio.checked = rec.cover === band.id;
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
      this.activeIndex = null;
      this.scene?.exitQuadratView();
      this.render();
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Close without saving';
    cancel.addEventListener('click', () => {
      this.activeIndex = null;
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
          announce(`Counting view open for quadrat ${i}.`);
        },
      });
    }
    this.render();
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
