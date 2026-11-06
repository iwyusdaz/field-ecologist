/**
 * notebook-layout.js — Field Ecologist's own navigation (owner direction,
 * 2026-11-06): the template's top bar becomes a field-notebook spine.
 *
 * - Desktop: a 56 px left rail. Module tabs are stacked spine labels with
 *   progress ticks; the discovery count and the Menu button sit at its foot.
 * - Phones (shorter side under 600 px, the shell's own rule): a 56 px bottom
 *   tab strip with the same controls.
 * - Pop-ups (Now card, info cards, drawer, dialogs) are ruled field-guide
 *   paper with a pinned corner and slide in from the rail side.
 *
 * The look is CSS (src/styles/meadow-v3.css). This module only tells the
 * template where the bar is: the shell's topBarHeight() feeds the info-card
 * and label bounds, which must not start below a full-height rail, and the
 * rail or strip joins the rectangles labels and cards avoid. The template
 * core (src/v3/) is not edited; the instance methods are wrapped here.
 * ui-audit reads the same positions from evaluation/ui-audit.config.json
 * (navBar: left on desktop, bottom on phones).
 * @module meadow3/notebook-layout
 */

/** Where the navigation bar sits for a shell layout name. */
export function navEdge(layout) { return layout === 'desktop' ? 'left' : 'bottom'; }

/**
 * @param {object} app  the v3 app (createSceneApp)
 */
export function applyNotebookLayout(app) {
  const shell = app.shell;
  const bar = shell.topBar;
  bar.setAttribute('aria-label', 'Field notebook');
  bar.dataset.nav = 'notebook';
  const sync = () => { shell.root.dataset.nav = navEdge(shell.layout); };
  sync();
  shell.on('layout', sync);
  // The drawer body scrolls; keyboard users can reach it even when it holds no
  // control (the field guide, results), axe scrollable-region-focusable.
  const body = shell.drawer.querySelector('.v3-drawer-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-labelledby', 'v3-drawer-title');
  // No bar along the top edge in either layout: bounds start at the viewport top.
  shell.topBarHeight = () => 0;
  const reserved = shell.reservedRects.bind(shell);
  shell.reservedRects = (o) => {
    const out = reserved(o);
    if (bar.offsetParent) {
      const r = bar.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 });
    }
    return out;
  };
  // Re-place an open card once the layout has its final geometry.
  shell.on('layout', () => app.inspect?._placeCard(true));
}
