/**
 * Module 5 — Methods-and-results report from the learner's own data + rubric
 * self-check + survey-sampling transfer items. Free text is never auto-graded;
 * it is saved to the local learning record (plan §5.4, standards §7).
 * @module ui/report
 */
import { announce } from '../a11y/announcer.js';
import { mcItem, rubricSelfCheck, scoreAnswers } from '../learning/assess.js';
import { dataTable } from '../a11y/text-mode.js';

export class ReportUI {
  /**
   * @param {object} opts
   * @param {import('../app.js').App} opts.app
   * @param {HTMLElement} opts.container
   */
  constructor({ app, container }) {
    this.app = app;
    this.container = container;
  }

  render() {
    this.container.innerHTML = '';
    const sec = this._panel('Your methods-and-results report');
    sec.appendChild(this._reportForm());
    this.container.appendChild(sec);

    const transferSec = this._panel('Transfer — the same logic in a school survey');
    const intro = document.createElement('p');
    intro.textContent = this.app.modules.modules.m5.transferIntro;
    transferSec.appendChild(intro);
    this._transferBlock(transferSec);
    this.container.appendChild(transferSec);
  }

  _reportForm() {
    const app = this.app;
    const sec = document.createElement('section');
    sec.className = 'report-form';

    // results recap (from the learner's own data sheet — not the truth)
    if (app.state.submission) {
      const res = app.state.submission;
      const rows = app.species.map((sp) => [
        sp.name,
        res.estimates[sp.id] != null ? `${res.estimates[sp.id].toFixed(2)} / m²` : '—',
      ]);
      rows.push(['Tussock Bunchgrass — cover', res.cover == null ? '—' : `${res.cover.toFixed(1)}%`]);
      sec.appendChild(dataTable(
        ['Species', 'Your estimate'],
        rows,
        'Your results so far (from your data sheet, not the truth)',
      ));
    }

    for (const s of app.modules.report.sections) {
      const label = document.createElement('label');
      label.className = 'report-section';
      const strong = document.createElement('strong');
      strong.textContent = s.title;
      const guide = document.createElement('span');
      guide.className = 'report-guidance';
      guide.textContent = ` ${s.guidance}`;
      label.append(strong, guide);
      const ta = document.createElement('textarea');
      ta.rows = 4;
      ta.id = `report-${s.id}`;
      ta.value = app.state.reportDrafts[s.id] || '';
      ta.setAttribute('aria-label', `Report section: ${s.title}`);
      ta.addEventListener('change', () => {
        app.state.reportDrafts[s.id] = ta.value;
        app.record.log('attempted', { id: `report-${s.id}`, name: `Report section: ${s.title}` }, { response: ta.value });
      });
      label.appendChild(ta);
      sec.appendChild(label);
    }

    const rubricHost = document.createElement('div');
    rubricSelfCheck({
      criteria: app.items.reportRubric,
      container: rubricHost,
      onComplete: (ratings) => {
        app.state.rubric = ratings;
        app.record.log('completed', { id: 'report-rubric', name: 'Rubric self-check' }, { response: JSON.stringify(ratings) });
        announce('Self-check saved. It is not a grade — use it to revise your draft.');
      },
    });
    sec.appendChild(rubricHost);
    return sec;
  }

  _transferBlock(container) {
    const app = this.app;
    const host = document.createElement('div');
    container.appendChild(host);
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Show the transfer questions';
    nextBtn.addEventListener('click', () => {
      nextBtn.disabled = true;
      for (const item of app.items.transfer) {
        mcItem({
          item,
          container: host,
          onAnswered: (r) => {
            app.record.log('answered', { id: item.id, name: item.prompt.slice(0, 60) }, {
              response: r.chosen, success: r.correct,
            });
            app.state.transferAnswers[item.id] = r;
            const all = app.items.transfer.map((i) => app.state.transferAnswers[i.id]).filter(Boolean);
            if (all.length === app.items.transfer.length) {
              const score = scoreAnswers(all);
              app.record.log('completed', { id: 'transfer-task', name: 'Survey-sampling transfer task' }, {
                success: true, ...score,
              });
              const done = document.createElement('p');
              done.className = 'chart-summary';
              done.textContent = `Transfer task complete: ${score.correct} of ${score.total} on first attempts shown. The explanations above are the teaching — revisit any of them.`;
              host.appendChild(done);
              app.onModuleComplete?.('m5');
            }
          },
        });
      }
    });
    container.appendChild(nextBtn);
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
