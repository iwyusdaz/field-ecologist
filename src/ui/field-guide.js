/**
 * HTML field guide: one card per species — portrait, field marks (shape → size
 * → leaf → colour), look-alike warning, and how to record it. Data comes from
 * content/species.json. Used in Module 2 (study) and as a dialog during
 * fieldwork (identify-by-selection workflow). Portraits are rendered from the
 * actual procedural models; if WebGL is unavailable the cards are text-only.
 * @module ui/field-guide
 */
import { openDialog, closeDialog } from '../a11y/focus.js';
import { announce } from '../a11y/announcer.js';

/**
 * Build the guide content (a <section> with a card per species).
 * @param {object} opts
 * @param {Array<object>} opts.species content species list
 * @param {Record<string,string>} [opts.portraits] speciesId -> data URL
 * @param {boolean} [opts.compact] smaller cards (for the in-field dialog)
 */
export function buildGuide({ species, portraits = {}, compact = false }) {
  const sec = document.createElement('section');
  sec.className = 'field-guide' + (compact ? ' compact' : '');
  const intro = document.createElement('p');
  intro.className = 'guide-callout';
  intro.textContent = 'Read the marks in order: shape → size → leaf → colour. Colour is only ever a secondary cue, so the guide works for everyone including colour-blind users.';
  sec.appendChild(intro);
  for (const sp of species) {
    const card = document.createElement('article');
    card.className = 'guide-card';
    card.setAttribute('data-species', sp.id);
    const h = document.createElement('h3');
    h.textContent = sp.name;
    card.appendChild(h);
    if (portraits[sp.id]) {
      const img = document.createElement('img');
      img.src = portraits[sp.id];
      img.alt = `Close-up view of ${sp.name}: ${sp.habit}`;
      img.width = 160; img.height = 160;
      img.className = 'guide-portrait';
      card.appendChild(img);
    }
    const dl = document.createElement('dl');
    const add = (t, d) => {
      const dt = document.createElement('dt'); dt.textContent = t;
      const dd = document.createElement('dd'); dd.textContent = d;
      dl.append(dt, dd);
    };
    add('Height', sp.heightCm);
    add('Flowers', sp.flower);
    add('Leaves', sp.leaf);
    add('Habit', sp.habit);
    card.appendChild(dl);
    const marks = document.createElement('ul');
    marks.className = 'guide-marks';
    for (const m of sp.fieldMarks) {
      const li = document.createElement('li');
      li.textContent = m;
      marks.appendChild(li);
    }
    card.appendChild(marks);
    const warn = document.createElement('p');
    warn.className = 'guide-warning';
    warn.textContent = `Look-alike: ${sp.lookAlikeWarning}`;
    card.appendChild(warn);
    const rec = document.createElement('p');
    rec.className = 'guide-record';
    rec.textContent = `Record it as: ${sp.countMethod}.`;
    card.appendChild(rec);
    sec.appendChild(card);
  }
  return sec;
}

/**
 * Open the guide as a modal dialog (used during counting).
 * @param {HTMLDialogElement} dialog
 * @param {object} opts { species, portraits, trigger }
 */
export function openGuideDialog(dialog, { species, portraits, trigger }) {
  dialog.innerHTML = '';
  const h = document.createElement('h2');
  h.id = 'guide-dialog-title';
  h.textContent = 'Field guide — Ashcombe Meadow species';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dialog-close';
  close.textContent = 'Close guide';
  close.addEventListener('click', () => closeDialog(dialog));
  dialog.setAttribute('aria-labelledby', 'guide-dialog-title');
  dialog.append(h, close, buildGuide({ species, portraits, compact: true }));
  openDialog(dialog, trigger);
  announce('Field guide opened');
}
