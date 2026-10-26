/**
 * Text-mode modules (design/text-mode-design.md): full parity with the 3D mode.
 * - The meadow is a 20 × 20 grid data table (rows = x bands west→east with a
 *   moisture-zone column, columns = z bands) built from the SAME population.
 * - Sampling a selected cell reveals a structured description of the plants in
 *   the 2 m quadrat at the cell centre; the learner identifies from the marks
 *   and counts — misreading the marks causes mis-ID exactly as in 3D.
 * - Modules 4 and 5 reuse the same RevealUI / ReportUI components (charts ship
 *   with data tables), driven by the same session and record.
 * @module a11y/textmode-modules
 */
import { dataTable, choiceItem } from './text-mode.js';
import { buildGrid, describeQuadrat } from '../systems/quadrat-describe.js';
import { buildGuide } from '../ui/field-guide.js';
import { RevealUI } from '../ui/reveal.js';
import { ReportUI } from '../ui/report.js';
import { mcItem } from '../learning/assess.js';
import { announce } from './announcer.js';
import { COVER_BANDS } from '../systems/data-sheet.js';

const GRID_LEGNED = 'Legend: · bare-ish ground, b bunchgrass tussocks, ~ sedge tufts, y yellow flower heads nearby, d daisies, o orchid present (rare). Zone column = moisture third along the gradient.';

export function registerTextModules({ textMode, app }) {
  textMode.register('m1', (body, api) => renderM1(body, api, app));
  textMode.register('m2', (body, api) => renderM2(body, api, app));
  textMode.register('m3', (body, api) => renderM3(body, api, app));
  textMode.register('m4', (body, api) => renderM4(body, api, app));
  textMode.register('m5', (body, api) => renderM5(body, api, app));
}

/* ---------------- Module 1 ---------------- */
function renderM1(body, api, app) {
  api.setTitle('Module 1 — The question');
  const intro = document.createElement('p');
  intro.textContent = app.modules.modules.m1.intro;
  body.appendChild(intro);
  const facts = document.createElement('ul');
  for (const f of app.modules.researchQuestion.meadowFacts) {
    const li = document.createElement('li'); li.textContent = f; facts.appendChild(li);
  }
  body.appendChild(facts);
  const rq = document.createElement('p');
  rq.innerHTML = `<strong>Research question:</strong> ${app.modules.researchQuestion.text}`;
  body.appendChild(rq);

  const h = document.createElement('h3');
  h.textContent = 'Your hypothesis';
  body.appendChild(h);
  const hypItem = app.items.hypothesisTask;
  if (!app.state.hypothesis) {
    body.appendChild(choiceItem({
      prompt: hypItem.prompt,
      options: hypItem.options,
      onAnswer: (opt) => {
        app.state.hypothesis = opt.id;
        app.record.log('answered', { id: hypItem.id, name: 'Hypothesis choice' }, { response: opt.id });
        app.textModeFeedback = hypItem.why;
        app.goToModule('m1'); // re-render with feedback
      },
    }));
  } else {
    const chosen = hypItem.options.find((o) => o.id === app.state.hypothesis);
    const p = document.createElement('p');
    p.innerHTML = `You chose: <em>${chosen.text}</em>`;
    body.appendChild(p);
    const why = document.createElement('p');
    why.textContent = hypItem.why;
    body.appendChild(why);
  }

  const h2 = document.createElement('h3');
  h2.textContent = 'Pre-check (5 items)';
  body.appendChild(h2);
  for (const item of app.items.precheck) {
    mcItem({
      item,
      container: body,
      onAnswered: (r) => {
        app.record.log('answered', { id: item.id, name: item.prompt.slice(0, 60) }, {
          response: r.chosen, success: r.correct,
        });
        app.state.precheck[item.id] = r;
        const got = Object.keys(app.state.precheck).length;
        if (got === app.items.precheck.length) {
          app.onModuleComplete?.('m1');
          announce('Pre-check complete. Module 2 is next: learn the species.');
        }
      },
    });
  }
}

/* ---------------- Module 2 ---------------- */
function renderM2(body, api, app) {
  api.setTitle('Module 2 — Know your species');
  body.appendChild(buildParagraph(app.modules.modules.m2.intro));
  body.appendChild(buildParagraph(app.modules.modules.m2.guideCallout));
  body.appendChild(buildGuide({ species: app.species, portraits: {} }));
  const h = document.createElement('h3');
  h.textContent = 'Identification quiz (8 items)';
  body.appendChild(h);
  const speciesOptions = app.species.map((sp) => ({ id: sp.id, text: sp.name }));
  for (const item of app.items.idQuiz) {
    const asItem = item.kind === 'species' && !item.options
      ? { ...item, options: speciesOptions, correct: item.speciesRef }
      : item;
    mcItem({
      item: asItem,
      container: body,
      onAnswered: (r) => {
        app.record.log('answered', { id: item.id, name: item.prompt.slice(0, 60) }, {
          response: r.chosen, success: r.correct,
        });
        app.state.idQuiz[item.id] = r;
        if (!r.correct && item.kind === 'species') {
          app.guideDialogMistakes = app.guideDialogMistakes || [];
          app.guideDialogMistakes.push({ item: item.id, chose: r.chosen, truth: asItem.correct });
        }
        if (Object.keys(app.state.idQuiz).length === app.items.idQuiz.length) {
          app.onModuleComplete?.('m2');
          announce('ID quiz complete. Fieldwork awaits in Module 3.');
        }
      },
    });
  }
}

/* ---------------- Module 3 ---------------- */
function renderM3(body, api, app) {
  api.setTitle('Module 3 — Fieldwork (text mode)');
  body.appendChild(buildParagraph(app.modules.modules.m3.intro));

  if (!app.session) {
    // design picker (same honest descriptions)
    const h = document.createElement('h3');
    h.textContent = 'Choose your sampling design';
    body.appendChild(h);
    for (const d of app.designs.designs) {
      const card = document.createElement('section');
      const h4 = document.createElement('h4');
      h4.textContent = `${d.name} (${d.kind === 'probability' ? 'probability' : 'non-probability'} design)`;
      card.appendChild(h4);
      card.appendChild(buildParagraph(d.definition));
      card.appendChild(buildParagraph(`Strength: ${d.pros}`));
      card.appendChild(buildParagraph(`Trade-off: ${d.cons}`));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `Choose ${d.name}`;
      btn.addEventListener('click', () => {
        app.startSession();
        const res = app.session.chooseDesign(d.id);
        if (!res.ok) { announce(res.error, { assertive: true }); return; }
        app.record.log('experienced', { id: `design-${d.id}`, name: `Chose design: ${d.id}` }, { response: d.id });
        app.state.design = d.id;
        if (app.session.design !== 'convenience') snapToCells(app);
        announce(`Design chosen: ${d.name}.`);
        app.goToModule('m3');
      });
      card.appendChild(btn);
      body.appendChild(card);
    }
    return;
  }

  const s = app.session;
  if (!s.placementDone()) {
    const p = buildParagraph(`Convenience placement in text mode: pick cells in the grid below — that is exactly the freedom (and the bias) of this design. ${s.points.length} of ${s.maxQuadrats} placed.`);
    body.appendChild(p);
  }
  body.appendChild(buildParagraph(`Design: ${s.design}. Field time left: ${Math.round(s.remainingTime())} of ${s.budget.timeUnits} units. Walking between quadrats costs time at the same rate as the 3D mode.`));
  renderGrid(body, app);
  if (app.state.tmActiveQuadrat) renderSampling(body, app, app.state.tmActiveQuadrat);
  renderTextDataSheet(body, app);
}

/** Snap the session's quadrat points to their 5 m grid-cell centres (text mode). */
function snapToCells(app) {
  const grid = app.getGrid();
  const snapped = app.session.points.map((p) => {
    const i = Math.min(grid.gridN - 1, Math.floor(p.x / grid.step));
    const j = Math.min(grid.gridN - 1, Math.floor(p.z / grid.step));
    return { x: grid.cells[j * grid.gridN + i].cx, z: grid.cells[j * grid.gridN + i].cz };
  });
  app.session.points = snapped;
  app.session.sheet.start(app.session.design, snapped);
  app.session.lastFrom = { x: 50, z: 3 };
}

function renderGrid(body, app) {
  const s = app.session;
  const grid = app.getGrid();
  const selected = new Map(); // cellKey -> quadrat index (1-based)
  s.points.forEach((p, idx) => {
    const i = Math.floor(p.x / grid.step), j = Math.floor(p.z / grid.step);
    selected.set(`${i},${j}`, idx + 1);
  });

  const cap = document.createElement('p');
  cap.className = 'hint';
  cap.textContent = GRID_LEGNED;
  body.appendChild(cap);

  const table = document.createElement('table');
  table.className = 'grid-map';
  const caption = document.createElement('caption');
  caption.textContent = 'Ashcombe Meadow as a 20 × 20 grid (rows: west→east x bands with moisture zone; columns: south→north z bands). Each cell is a 5 m square.';
  table.appendChild(caption);
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(document.createElement('th'));
  for (let j = 0; j < grid.gridN; j++) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = `z${j}`;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (let i = 0; i < grid.gridN; i++) {
    const tr = document.createElement('tr');
    const rowHead = document.createElement('th');
    rowHead.scope = 'row';
    rowHead.textContent = `x${i} ${zoneShort(grid.cells[i].zone)}`;
    tr.appendChild(rowHead);
    for (let j = 0; j < grid.gridN; j++) {
      const cell = grid.cells[j * grid.gridN + i];
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell';
      btn.textContent = cell.code;
      const qi = selected.get(`${i},${j}`);
      const visited = qi ? s.sheet.quadrats[qi - 1]?.visited : false;
      btn.setAttribute('aria-label',
        `Cell x band ${i} (${cell.zone}), z band ${j}. Vegetation: ${cell.code}.` +
        (qi ? ` In your sample as quadrat ${qi}${visited ? ' (sampled)' : ''}.` : ' Not in your sample.'));
      if (qi) btn.classList.add(visited ? 'sampled' : 'selected');
      btn.addEventListener('click', () => onCellClick(app, cell, qi));
      td.appendChild(btn);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

function zoneShort(zone) {
  return zone === 'wet' ? '(wet)' : zone === 'mid' ? '(mid)' : '(dry)';
}

function onCellClick(app, cell, qi) {
  const s = app.session;
  if (!s.design) { announce('Choose a sampling design first.', { assertive: true }); return; }
  if (qi) {
    app.state.tmActiveQuadrat = qi;
    const r = s.visit(qi);
    if (!r.ok) { announce(r.error, { assertive: true }); app.state.tmActiveQuadrat = null; }
    else if (!r.alreadyVisited) {
      announce(`Quadrat ${qi}: time charged ${r.cost.toFixed(1)} units. ${Math.round(s.remainingTime())} left.`);
    }
    app.goToModule('m3');
    return;
  }
  if (s.design === 'convenience') {
    const res = s.placeConvenience(cell.cx, cell.cz);
    if (!res.ok) { announce(res.error, { assertive: true }); return; }
    app.goToModule('m3');
    return;
  }
  announce('That cell is not in your sample — your design placed the quadrats (that constraint is the point).', { assertive: true });
}

function renderSampling(body, app, qi) {
  const s = app.session;
  const p = s.points[qi - 1];
  const desc = describeQuadrat(app.population, app.species, p.x, p.z);
  const sec = document.createElement('section');
  sec.className = 'counting-form';
  const h = document.createElement('h3');
  h.textContent = `Quadrat ${qi} — cell x${Math.floor(p.x / 5)}, z${Math.floor(p.z / 5)}, ${desc.zone} zone`;
  sec.appendChild(h);
  if (!desc.groups.length) {
    sec.appendChild(buildParagraph('Nothing grows inside this quadrat but a little grass. No records needed — close it.'));
  }
  for (const g of desc.groups) {
    const fs = document.createElement('fieldset');
    const lg = document.createElement('legend');
    lg.textContent = 'Specimen group';
    fs.appendChild(lg);
    const marks = document.createElement('p');
    marks.textContent = g.description;
    fs.appendChild(marks);
    const marksList = document.createElement('ul');
    for (const m of g.marks) {
      const li = document.createElement('li'); li.textContent = m; marksList.appendChild(li);
    }
    fs.appendChild(marksList);
    if (!g.coverEstimated) {
      const selLabel = document.createElement('label');
      selLabel.append('Which species is this? ');
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `Species for the group: ${g.description.slice(0, 40)}`);
      sel.appendChild(new Option('— choose from the field marks —', ''));
      for (const sp of app.species) sel.appendChild(new Option(sp.name, sp.id));
      selLabel.appendChild(sel);
      const cntLabel = document.createElement('label');
      cntLabel.append(' Count to record: ');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0; inp.max = 999; inp.step = 1;
      inp.setAttribute('aria-label', `Count for the group (${g.individuals} individuals described)`);
      cntLabel.appendChild(inp);
      fs.append(selLabel, cntLabel);
      fs.dataset.groupId = g.speciesId;
      fs.dataset.individuals = String(g.individuals);
      fs.className = 'tm-group';
    } else {
      // dense species: cover band from the described tussock load
      const bands = document.createElement('fieldset');
      const bl = document.createElement('legend');
      bl.textContent = 'Percent cover band for this dense species';
      bands.appendChild(bl);
      for (const band of COVER_BANDS) {
        const lab = document.createElement('label');
        lab.className = 'choice';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = `tm-cover-${qi}`; radio.value = band.id;
        lab.append(radio, Object.assign(document.createElement('span'), { textContent: ` ${band.label}` }));
        bands.appendChild(lab);
      }
      bands.className = 'tm-group tm-cover';
      bands.dataset.cover = 'true';
      fs.appendChild(bands);
    }
    sec.appendChild(fs);
  }
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = `Save quadrat ${qi}`;
  save.addEventListener('click', () => {
    const counts = {};
    let cover = null;
    for (const fsEl of sec.querySelectorAll('.tm-group')) {
      if (fsEl.dataset.cover) {
        const sel = fsEl.querySelector('input:checked');
        if (sel) cover = sel.value;
      } else {
        const spSel = fsEl.querySelector('select');
        const cntIn = fsEl.querySelector('input[type="number"]');
        if (spSel && spSel.value && cntIn && cntIn.value !== '') {
          counts[spSel.value] = parseInt(cntIn.value, 10);
          const truth = fsEl.dataset.groupId;
          if (spSel.value !== truth) {
            app.guideDialogMistakes = app.guideDialogMistakes || [];
            app.guideDialogMistakes.push({ item: `quad${qi}`, chose: spSel.value, truth });
          }
        }
      }
    }
    s.record(qi, { counts, cover });
    announce(`Quadrat ${qi} saved with ${Object.keys(counts).length} species record${Object.keys(counts).length === 1 ? '' : 's'}${cover ? ' and a cover band' : ''}.`);
    app.state.tmActiveQuadrat = null;
    app.goToModule('m3');
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary';
  close.textContent = 'Close without saving';
  close.addEventListener('click', () => {
    app.state.tmActiveQuadrat = null;
    app.goToModule('m3');
  });
  sec.append(save, close);
  body.appendChild(sec);
}

function renderTextDataSheet(body, app) {
  const s = app.session;
  if (!s.points.length) return;
  const sec = document.createElement('section');
  sec.className = 'data-sheet-block';
  sec.appendChild(Object.assign(document.createElement('h3'), { textContent: 'Your data sheet' }));
  sec.appendChild(dataTable(
    ['Quadrat', 'x, z (m)', 'Records', 'Time cost'],
    s.sheet.quadrats.map((q) => [
      q.index,
      q.visited ? `${q.x.toFixed(0)}, ${q.z.toFixed(0)}` : '—',
      Object.entries(q.counts).map(([sp, n]) => `${sp}:${n}`).join(', ') || (q.cover ? `cover:${q.cover}` : '—'),
      q.visited ? q.timeCost.toFixed(1) : '—',
    ]),
    'Data sheet (text mode) — one row per quadrat',
  ));
  const row = document.createElement('div');
  row.className = 'btn-row';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = 'Download data sheet (CSV)';
  exportBtn.addEventListener('click', () => app.exportData());
  row.appendChild(exportBtn);
  const submit = document.createElement('button');
  submit.type = 'button';
  const completed = s.sheet.completedRecords().length;
  submit.textContent = `Submit fieldwork for the reveal (${completed} quadrat${completed === 1 ? '' : 's'} recorded)`;
  submit.disabled = completed === 0;
  submit.addEventListener('click', () => {
    const res = s.submit();
    app.state.submitted = true;
    app.state.submission = res;
    app.record.log('completed', {
      id: 'fieldwork-submission',
      name: 'Fieldwork submitted',
      description: `Design ${s.design}, ${res.quadrats} quadrats recorded`,
    }, { success: true, response: s.design, estimates: res.estimates, cover: res.cover, quadrats: res.quadrats });
    announce('Fieldwork submitted. The reveal follows in Module 4.');
    app.goToModule('m4');
  });
  row.appendChild(submit);
  sec.appendChild(row);
  body.appendChild(sec);
}

/* ---------------- Modules 4 & 5 (shared components) ---------------- */
function renderM4(body, api, app) {
  api.setTitle('Module 4 — The reveal');
  body.appendChild(buildParagraph(app.modules.modules.m4.intro));
  const reveal = new RevealUI({ app, container: body });
  reveal.render();
  app.state.tmReveal = reveal; // kept alive while text mode shows m4
}

function renderM5(body, api, app) {
  api.setTitle('Module 5 — Report and transfer');
  body.appendChild(buildParagraph(app.modules.modules.m5.intro));
  const report = new ReportUI({ app, container: body });
  report.render();
}

function buildParagraph(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}
