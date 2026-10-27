/**
 * Module 4 — The reveal: true population vs the learner's estimate, error
 * sources, and the re-sampling simulator (Web Worker, 1,000 virtual samples,
 * n = 5..40). Charts ship with data tables and text summaries (plan §11).
 * @module ui/reveal
 */
import { dataTable } from '../a11y/text-mode.js';
import { announce } from '../a11y/announcer.js';
import { histogramChart, designComparison } from './charts.js';
import { ResamplerClient } from '../systems/resampler-client.js';
import { mcItem } from '../learning/assess.js';

export class RevealUI {
  /**
   * @param {object} opts
   * @param {import('../app.js').App} opts.app
   * @param {HTMLElement} opts.container
   */
  constructor({ app, container }) {
    this.app = app;
    this.container = container;
    this.resampler = new ResamplerClient();
    this.lastRun = null; // summaries of the most recent run
  }

  get submitted() { return this.app.state.submitted; }

  render() {
    this.container.innerHTML = '';
    const sec = this._panel('The reveal — the meadow’s true population');
    if (!this.submitted) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Submit your fieldwork in Module 3 first — the reveal only unlocks once you have committed to a sample, exactly as in real field work.';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Go to Module 3 (Fieldwork)';
      btn.addEventListener('click', () => this.app.goToModule('m3'));
      sec.append(p, btn);
      this.container.appendChild(sec);
      return;
    }
    sec.appendChild(this._revealTable());
    sec.appendChild(this._errorSources());
    this.container.appendChild(sec);

    const sim = this._panel('Re-sampling simulator — 1,000 virtual field days');
    sim.appendChild(this._simulatorControls());
    sim.appendChild(this._simResultsHost());
    this.container.appendChild(sim);

    // chart interpretation items appear after the first run
    if (this.app.state.simRan) this._renderChartItems();
  }

  _revealTable() {
    const app = this.app;
    const res = app.state.submission;
    const sec = document.createElement('section');
    sec.className = 'reveal-table-block';
    const h = document.createElement('h3');
    h.textContent = 'Your estimate vs the truth';
    sec.appendChild(h);
    const rows = [];
    for (const sp of app.species) {
      const est = res.estimates[sp.id];
      const truth = app.population.trueDensity[sp.id];
      const shown = est == null
        ? '— (no record)'
        : `${est.toFixed(2)} / m²`;
      const err = est == null ? '—'
        : truth > 0 ? `${est >= truth ? '+' : ''}${(((est - truth) / truth) * 100).toFixed(0)}%` : '—';
      rows.push([sp.name, shown, `${truth.toFixed(3)} / m²`, err]);
    }
    // bunchgrass cover row
    const trueCover = app.population.trueCover.bunchgrass;
    rows.push([
      'Tussock Bunchgrass — cover',
      res.cover == null ? '—' : `${res.cover.toFixed(1)}%`,
      `${(trueCover * 100).toFixed(1)}%`,
      res.cover == null ? '—' : `${res.cover >= trueCover * 100 ? '+' : ''}${(((res.cover / 100) - trueCover) / trueCover * 100).toFixed(0)}%`,
    ]);
    sec.appendChild(dataTable(
      ['Species', 'Your estimate', 'True density/cover', 'Error'],
      rows,
      'The meadow’s true population beside your estimate (per m²; cover in % of ground)',
    ));
    const p = document.createElement('p');
    p.className = 'chart-summary';
    p.textContent = `Your sample of ${res.quadrats} quadrats covered ${(res.area).toFixed(0)} m² — ${(res.area / 10000 * 100).toFixed(1)}% of the meadow. Everything you did not sample was invisible to you; the truth was there the whole time.`;
    sec.appendChild(p);
    const notes = estimatorNotes(res);
    if (notes) {
      const n = document.createElement('p');
      n.className = 'hint estimator-note';
      n.textContent = notes;
      sec.appendChild(n);
    }
    return sec;
  }

  _errorSources() {
    const sec = document.createElement('section');
    sec.className = 'error-sources';
    const h = document.createElement('h3');
    h.textContent = 'Where your error came from';
    sec.appendChild(h);
    for (const src of this.app.modules.revealErrorSources) {
      const d = document.createElement('details');
      const s = document.createElement('summary');
      s.textContent = src.label;
      const p = document.createElement('p');
      p.textContent = src.text;
      d.append(s, p);
      sec.appendChild(d);
      if (src.id === 'bias' && this.app.state.design === 'convenience') {
        const note = document.createElement('p');
        note.className = 'guide-warning';
        note.textContent = 'This one is yours: you chose the “wherever looks interesting” design, so your Butterweed estimate is pulled toward the showy clusters.';
        sec.appendChild(note);
      }
      if (src.id === 'misid' && this.app.guideDialogMistakes?.length) {
        const note = document.createElement('p');
        note.className = 'guide-warning';
        note.textContent = 'During the ID quiz you mixed up at least one species — if the same happened in the field, it moved counts between species. Check the table above.';
        sec.appendChild(note);
      }
    }
    return sec;
  }

  _simulatorControls() {
    const app = this.app;
    const sec = document.createElement('section');
    sec.className = 'sim-controls';

    const designLabel = document.createElement('label');
    designLabel.append('Design ');
    const designSel = document.createElement('select');
    designSel.id = 'sim-design';
    for (const d of app.designs.designs) {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.name;
      if (d.id === app.state.design) o.selected = true;
      designSel.appendChild(o);
    }
    designLabel.appendChild(designSel);

    const spLabel = document.createElement('label');
    spLabel.append('Species ');
    const spSel = document.createElement('select');
    spSel.id = 'sim-species';
    for (const sp of app.species) {
      const o = document.createElement('option');
      o.value = sp.id;
      o.textContent = sp.name;
      spSel.appendChild(o);
    }
    spSel.value = app.modules.researchQuestion.studySpecies;
    spLabel.appendChild(spSel);

    const nLabel = document.createElement('label');
    nLabel.append('Quadrats per virtual sample (n) ');
    const nOut = document.createElement('output');
    nOut.textContent = '10';
    const nRange = document.createElement('input');
    nRange.type = 'range'; nRange.min = '5'; nRange.max = '40'; nRange.step = '5'; nRange.value = '10';
    nRange.id = 'sim-n';
    nRange.addEventListener('input', () => { nOut.textContent = nRange.value; });
    nLabel.append(nRange, ' ', nOut);

    const run = document.createElement('button');
    run.type = 'button';
    run.textContent = 'Run 1,000 virtual samples';
    run.addEventListener('click', () => {
      this.runSimulator({
        design: designSel.value,
        n: parseInt(nRange.value, 10),
        speciesId: spSel.value,
      });
    });

    const compare = document.createElement('button');
    compare.type = 'button';
    compare.className = 'secondary';
    compare.textContent = 'Compare all four designs (same n and species)';
    compare.addEventListener('click', () => {
      this.runSimulator({
        n: parseInt(nRange.value, 10),
        speciesId: spSel.value,
        allDesigns: true,
      });
    });

    const prog = document.createElement('p');
    prog.className = 'sim-progress';
    prog.setAttribute('role', 'status');
    prog.textContent = 'The simulator counts the TRUE plants inside each virtual quadrat set — the same estimate you made, repeated a thousand times.';
    prog.id = 'sim-progress';

    sec.append(designLabel, spLabel, nLabel, run, compare, prog);
    return sec;
  }

  _simResultsHost() {
    if (!this.resultsHost) {
      this.resultsHost = document.createElement('div');
      this.resultsHost.className = 'sim-results';
      this.resultsHost.setAttribute('aria-live', 'polite');
    }
    return this.resultsHost;
  }

  /**
   * Run the simulator (via the worker client) and render results.
   * @param {object} opts { design, n, speciesId, allDesigns }
   */
  async runSimulator(opts) {
    const app = this.app;
    const requests = opts.allDesigns
      ? ['random', 'systematic', 'stratified', 'convenience'].map((d) => ({
          design: d, n: opts.n, speciesId: opts.speciesId, iterations: 1000,
        }))
      : [{ design: opts.design, n: opts.n, speciesId: opts.speciesId, iterations: 1000 }];
    const prog = this.container.querySelector('.sim-progress');
    const firstRun = !app.state.simRan;
    app.state.simRan = true;
    // S3 plays during the first run; the graded chart items wait until it ends.
    this._s3Pending = app.onSimulatorStart?.(firstRun) === true;
    let learnerEstimate = null;
    const sub = app.state.submission;
    if (sub?.estimates[opts.speciesId] != null) learnerEstimate = sub.estimates[opts.speciesId];
    try {
      const results = await this.resampler.run(app.population, requests, (done, total) => {
        if (prog) prog.textContent = `Running virtual samples… ${Math.round((done / total) * 100)}%`;
        app.onSimulatorProgress?.(done, total);
      });
      this.lastRun = results;
      if (prog) prog.textContent = `Done: ${results.length * 1000} virtual samples.`
        + (firstRun ? ' Now read the distribution before the interpretation questions.' : '');
      this._renderResults(results, { learnerEstimate, speciesId: opts.speciesId });
      app.onSimulatorRun?.(results, firstRun);
      if (firstRun && !this._itemsShown && !this._s3Pending) this._renderChartItems();
      app.record.log('completed', {
        id: 'simulator-run',
        name: 'Re-sampling simulator run',
        description: `${results.map((r) => r.design).join(', ')} at n=${opts.n} for ${opts.speciesId}`,
      }, { response: `${opts.speciesId}@n=${opts.n}` });
      return results;
    } catch (e) {
      if (prog) prog.textContent = 'The simulator failed to run: ' + e.message;
      announce('Simulator error.', { assertive: true });
      throw e;
    }
  }

  _renderResults(results, { learnerEstimate, speciesId }) {
    const host = this.resultsHost;
    host.innerHTML = '';
    for (const summary of results) {
      host.appendChild(histogramChart(summary, { learnerEstimate }));
    }
    if (results.length > 1) host.appendChild(designComparison(results));
  }

  _renderChartItems() {
    if (this._itemsShown) return;
    this._itemsShown = true;
    const sec = this._panel('Interpret the sampling distributions');
    const p = document.createElement('p');
    p.textContent = 'Answer from the charts above. Wrong turns show the same teaching explanation as the feedback — nothing is graded twice.';
    sec.appendChild(p);
    for (const item of this.app.items.chartItems) {
      mcItem({
        item,
        container: sec,
        onAnswered: (r) => {
          this.app.record.log('answered', { id: item.id, name: item.prompt.slice(0, 60) }, {
            response: r.chosen, success: r.correct,
          });
        },
      });
    }
    this.container.appendChild(sec);
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

  dispose() { this.resampler.dispose(); }
}

/**
 * Chart items render after S3 ends (played or skipped). Installed on RevealUI.
 */
RevealUI.prototype.onS3Done = function onS3Done() {
  const wasPending = this._s3Pending;
  this._s3Pending = false;
  if (wasPending && this.app.state.simRan && !this._itemsShown && this.lastRun) this._renderChartItems();
};

/**
 * Plain-language notes about how the estimate was computed (blank counts as 0;
 * stratified weighting). Exported for text mode.
 * @param {object} res FieldworkSession.submit() result
 * @returns {string}
 */
export function estimatorNotes(res) {
  const out = [];
  if (res.estimator === 'stratified') {
    out.push('Stratified estimate: the mean density in each moisture zone, weighted by that zone’s share of the meadow (each is one third), so the extra wet-zone quadrat does not over-weight the wet ground.');
    if (res.missingStrata?.length) out.push(`No completed quadrat in the ${res.missingStrata.join(' and ')} zone, so that zone could not be represented.`);
  }
  if (res.blanksAsZero > 0) {
    out.push(`${res.blanksAsZero} blank count${res.blanksAsZero === 1 ? ' was' : 's were'} treated as 0 (a saved quadrat with no number means none were recorded there).`);
  }
  return out.join(' ');
}
