// Every Now card, rendered as the shell renders it (tool controls included),
// before and after its step is done: at most 60 words and an action or a
// question in each (plan 10 §2.1; template-changes T-23).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Lessons } from '../../src/meadow3/lessons.js';
import { nowCardIssues } from '../../src/v3/shell.js';
import { buildPopulation, MEADOW_SEED } from '../../src/systems/population-model.js';
import species from '../../content/species.json';
import designs from '../../content/designs.json';
import items from '../../content/items.json';
import modules from '../../content/modules.json';
import cinematics from '../../content/cinematics.json';

/** A minimal element: enough for the lesson tools to build their controls; text() reads what a learner would see. */
function fakeElement(tag) {
  const e = {
    tagName: tag.toUpperCase(), children: [], textContent: '', style: {}, dataset: {}, attributes: {}, hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    append(...k) { for (const c of k) e.children.push(typeof c === 'string' ? { text: () => c } : c); },
    appendChild(c) { e.append(c); return c; },
    setAttribute(k, v) { e.attributes[k] = String(v); }, getAttribute: (k) => e.attributes[k] ?? null, removeAttribute(k) { delete e.attributes[k]; },
    addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    text() { return e.hidden ? '' : [e.textContent, ...(tag === 'input' ? [] : e.children.map((c) => c.text?.() ?? ''))].filter(Boolean).join(' '); },
  };
  return e;
}
const cardText = (n, toolBox) => [n.step ? `Step ${n.step} of ${n.total}` : n.kicker, n.goal, n.action, n.result, n.question?.prompt,
  ...(n.question?.choices || []).map((c) => c.text), toolBox?.text(), n.hint, n.primary?.label, n.secondary?.label, n.readMore?.label].filter(Boolean).join(' ');

describe('every Now card: at most 60 words and an action (T-23)', () => {
  const saved = globalThis.document;
  beforeAll(() => { globalThis.document = { createElement: fakeElement, createElementNS: (_, t) => fakeElement(t), activeElement: null }; });
  afterAll(() => { globalThis.document = saved; });
  const L = new Lessons({ slug: 'unit-now', content: { species, designs, items, modules, cinematics }, population: buildPopulation(MEADOW_SEED) });
  const mods = L.moduleDefs();
  const app = { engine: null, record: { log() {} }, shell: { touch: false, setNow() {}, toast() {}, setModuleDone() {}, now: { querySelector: () => null }, textModeRoot: { hidden: true } }, module: 0, goModule() {}, completeModule() {} };
  L.app = app; L.record = app.record;
  const render = (i, k) => {
    L.step[i] = k;
    const n = L.nowFor(i);
    let box = null;
    if (n.tool) { box = fakeElement('div'); n.tool(box, app.shell); }
    return { n, text: cardText(n, box) };
  };
  for (const pass of ['fresh', 'done']) {
    for (const [i, steps] of L.steps.entries()) {
      for (const [k, st] of steps.entries()) {
        it(`${pass}: ${mods[i].id} step ${k + 1} (${st.id})`, () => {
          if (pass === 'done') {
            L.startSession();
            if (!L.session.design) L.chooseDesign('random');
            L.complete(st.id);
          }
          const { n, text } = render(i, k);
          expect(nowCardIssues(text, n).issues).toEqual([]);
        });
      }
    }
    for (const i of L.steps.keys()) {
      it(`${pass}: ${mods[i].id} module-complete card`, () => {
        const { n, text } = render(i, L.steps[i].length);
        expect(nowCardIssues(text, n).issues).toEqual([]);
      });
    }
  }
});
