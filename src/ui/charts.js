/**
 * SVG histogram with its data table and text summary (accessibility rule:
 * charts always ship with data tables and a text summary — plan §11).
 * @module ui/charts
 */
import { dataTable } from '../a11y/text-mode.js';

/**
 * @param {object} summary runResampling summary (+ histogram)
 * @param {object} [opts] { learnerEstimate }
 * @returns {HTMLElement} section containing svg + table + summary text
 */
export function histogramChart(summary, opts = {}) {
  const sec = document.createElement('section');
  sec.className = 'chart-block';
  const { histogram: hist, mean, sd, p025, p975, trueDensity, bias, design, n, speciesId } = summary;

  const W = 560, H = 220, PAD = 38;
  const maxCount = Math.max(...hist.counts, 1);
  const min = hist.binStart[0];
  const max = hist.binStart[hist.binStart.length - 1] + hist.binWidth;
  const sx = (v) => PAD + ((v - min) / (max - min || 1)) * (W - PAD - 10);
  const sy = (c) => H - 26 - (c / maxCount) * (H - 26 - 18);

  const bars = hist.counts.map((c, i) => {
    const x0 = sx(hist.binStart[i]);
    const x1 = sx(hist.binStart[i] + hist.binWidth);
    const y = sy(c);
    return `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, x1 - x0 - 1).toFixed(1)}"
      height="${(H - 26 - y).toFixed(1)}" fill="#6f8f5a"><title>${hist.rows[i].from.toFixed(2)}–${hist.rows[i].to.toFixed(2)}: ${c} of ${summary.iterations}</title></rect>`;
  }).join('');
  const trueX = sx(trueDensity);
  const meanX = sx(mean);
  let learnerLine = '';
  if (opts.learnerEstimate != null && opts.learnerEstimate >= min && opts.learnerEstimate <= max) {
    const lx = sx(opts.learnerEstimate);
    learnerLine = `<line x1="${lx}" y1="12" x2="${lx}" y2="${H - 26}" stroke="#c2492f" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="${lx + 3}" y="20" font-size="10" fill="#c2492f">your estimate</text>`;
  }
  const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    `Histogram of ${summary.iterations} virtual ${design} samples of n=${n} for ${speciesId}: mean ${fmt(mean)} per square metre, ` +
    `95% interval ${fmt(p025)} to ${fmt(p975)}, true density ${fmt(trueDensity)}. A data table follows.`);
  svg.innerHTML = `
    ${bars}
    <line x1="${PAD}" y1="${H - 26}" x2="${W - 10}" y2="${H - 26}" stroke="#444"/>
    <line x1="${PAD}" y1="12" x2="${PAD}" y2="${H - 26}" stroke="#444"/>
    <text x="${PAD}" y="${H - 8}" font-size="10" fill="#444">${fmt(min)}</text>
    <text x="${W - 10}" y="${H - 8}" font-size="10" fill="#444" text-anchor="end">${fmt(max)}</text>
    <text x="${12}" y="${H / 2}" font-size="10" fill="#444" transform="rotate(-90 12 ${H / 2})" text-anchor="middle">virtual samples</text>
    ${Number.isFinite(trueX) && trueX >= PAD ? `<line x1="${trueX}" y1="12" x2="${trueX}" y2="${H - 26}" stroke="#1f4d2e" stroke-width="2"/>
      <text x="${trueX + 3}" y="32" font-size="10" fill="#1f4d2e">true density</text>` : ''}
    ${Number.isFinite(meanX) && meanX >= PAD ? `<line x1="${meanX}" y1="12" x2="${meanX}" y2="${H - 26}" stroke="#3d5a80" stroke-width="2" stroke-dasharray="5 3"/>
      <text x="${meanX + 3}" y="44" font-size="10" fill="#3d5a80">mean of samples</text>` : ''}
    ${learnerLine}`;

  const h3 = document.createElement('h4');
  h3.textContent = `Sampling distribution — ${summary.speciesId}, ${design} design, n = ${n} (${summary.iterations} virtual samples)`;
  sec.append(h3, svg);

  const summ = document.createElement('p');
  summ.className = 'chart-summary';
  const biasWord = Math.abs(bias) < 0.01 * Math.max(0.001, trueDensity)
    ? 'essentially unbiased'
    : `${bias > 0 ? 'above' : 'below'} the truth by about ${fmt(Math.abs(bias))} per m²`;
  summ.textContent = `The ${summary.iterations} virtual repeats average ${fmt(mean)} individuals per m², ` +
    `with standard deviation ${fmt(sd)}; most repeats (95%) land between ${fmt(p025)} and ${fmt(p975)}. ` +
    `On average this design is ${biasWord}.`;
  sec.appendChild(summ);

  const details = document.createElement('details');
  const s = document.createElement('summary');
  s.textContent = 'Histogram data table';
  details.appendChild(s);
  details.appendChild(dataTable(
    ['Estimate from (per m²)', 'to (per m²)', 'virtual samples'],
    hist.rows.map((r) => [r.from.toFixed(2), r.to.toFixed(2), r.count]),
    `Bin counts for the ${design} sampling distribution (n=${n}, ${speciesId})`,
  ));
  sec.appendChild(details);
  return sec;
}

/**
 * Compare-designs summary table (mean ± sd, bias) across designs for one species/n.
 * @param {Array<object>} summaries runResampling summaries, one per design
 */
export function designComparison(summaries) {
  const sec = document.createElement('section');
  sec.className = 'chart-block';
  const h = document.createElement('h4');
  h.textContent = 'Design comparison (same meadow, same effort)';
  sec.appendChild(h);
  const p = document.createElement('p');
  p.className = 'chart-summary';
  p.textContent = 'Read the bias column: a fair design centres on the true density; the convenience design sits above it no matter how many quadrats you take.';
  sec.appendChild(p);
  sec.appendChild(dataTable(
    ['Design', 'Mean (per m²)', 'SD', '95% interval', 'Bias vs truth'],
    summaries.map((s) => [
      s.design,
      s.mean.toFixed(2),
      s.sd.toFixed(2),
      `${s.p025.toFixed(2)} – ${s.p975.toFixed(2)}`,
      (s.bias >= 0 ? '+' : '') + s.bias.toFixed(2),
    ]),
    `Mean, spread and bias per design (${summaries[0]?.speciesId ?? ''}, n=${summaries[0]?.n ?? ''})`,
  ));
  return sec;
}
