/**
 * v3 browser tests (headless Chromium, software WebGL, Low preset): the
 * field-notebook layout, the clickable meadow, keyboard-only completion of all
 * five modules, text-mode parity, reduced motion, touch, and the no-WebGL
 * fallback. GPU gates (performance, alive) run headed in ui-audit.
 */
import { test, expect } from '@playwright/test';
import { ready, visibleLabels, pointOn } from './helpers.js';
const T = (page, fn, arg) => page.evaluate(fn, arg);
/** Press Tab until `locator` has focus (the real keyboard path), then press `key`. */
async function kb(page, locator, key = 'Enter', max = 250) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await expect(el).toBeVisible();
  for (let i = 0; i < max; i++) {
    const where = await el.evaluate((e) => { const a = document.activeElement; if (a === e) return 0; if (!a || a === document.body) return 1; return a.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1; });
    if (where === 0) { await page.keyboard.press(key); return; }
    await page.keyboard.press(where > 0 ? 'Tab' : 'Shift+Tab');
  }
  throw new Error(`could not reach ${locator} by Tab`);
}
const now = (page, re) => page.locator('[data-ui="now-card"] button').filter({ hasText: re }).first();
const drawer = (page) => page.locator('[data-ui="drawer"]');
/** Answer every question in a question drawer by keyboard (first choice each time), then close it. */
async function answerAll(page) {
  for (let n = 0; n < 12; n++) {
    const close = drawer(page).getByRole('button', { name: /^Close$/ });
    if (await close.isVisible().catch(() => false)) { await kb(page, close); return; }
    await kb(page, drawer(page).locator('.choice-btn:not([disabled])').first());
    await kb(page, drawer(page).getByRole('button', { name: /Next question|See your result/ }));
  }
  throw new Error('question drawer did not finish');
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); } });
});

test('notebook rail on desktop: a 56 px left rail at rest that opens with horizontal tab names on hover and focus', async ({ page }) => {
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(0));
  await page.waitForTimeout(1500);
  const read = () => T(page, () => {
    const barEl = document.querySelector('[data-ui="top-bar"]');
    const bar = barEl.getBoundingClientRect();
    const tabs = [...document.querySelectorAll('[data-ui="module-step"]')].map((b) => b.getBoundingClientRect());
    const labels = [...document.querySelectorAll('.v3-step-label')].map((l) => { const r = l.getBoundingClientRect(); const cs = getComputedStyle(l); return { w: r.width, h: r.height, mode: cs.writingMode, tf: cs.transform }; });
    const menu = document.querySelector('[data-action="menu"]').getBoundingClientRect();
    return { open: barEl.dataset.open === 'true', bar: [bar.left, bar.top, bar.width, bar.height], tabsStacked: tabs.every((t, i) => !i || t.top >= tabs[i - 1].bottom - 1), menuBelow: menu.top > tabs.at(-1).bottom, vh: innerHeight, labels };
  });
  const rest = await read();
  expect(rest.open).toBe(false);
  expect(rest.bar[0]).toBe(0);
  expect(rest.bar[2]).toBeLessThanOrEqual(56);
  expect(rest.bar[3]).toBe(rest.vh);
  expect(rest.tabsStacked).toBe(true);
  expect(rest.menuBelow).toBe(true);
  // Nothing on the rail is rotated (G2 owner feedback: no bottom-to-top text).
  for (const l of rest.labels) { expect(l.mode).toBe('horizontal-tb'); expect(l.tf).toBe('none'); }
  // Hover: the rail opens over the scene and every tab name reads left to right.
  const tab = await page.locator('[data-ui="module-step"]').nth(2).boundingBox();
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
  await page.waitForTimeout(400);
  const open = await read();
  expect(open.open).toBe(true);
  expect(open.bar[2]).toBeGreaterThanOrEqual(160);
  for (const l of open.labels) { expect(l.mode).toBe('horizontal-tb'); expect(l.w).toBeGreaterThan(30); expect(l.h).toBeLessThan(30); }
  await page.mouse.move(900, 300);
  await page.waitForTimeout(500);
  expect((await read()).open).toBe(false);
  // Keyboard focus opens it too.
  await page.locator('[data-ui="module-step"]').first().focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  expect((await read()).open).toBe(true);
});

/** Screen point of a meadow ground point (x, z). */
const screenOf = (page, x, z) => T(page, ([px, pz]) => {
  const T2 = window.__TEST__, cam = T2.engine.camera;
  const v = cam.position.clone().set(px, T2.world.groundY(px, pz), pz).project(cam);
  const r = T2.engine.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [x, z]);
const PLACE_BY_HAND = () => {
  const L = window.__TEST__.lessons;
  L.app.goModule(2); L.chooseDesign('convenience'); L.step[2] = 1; L._enterStep(2); L.refresh();
};
const viewOf = (page) => T(page, () => window.__TEST__.rig.view());

test('quadrat drag with the mouse: press on the meadow, drag the frame, release to drop it there', async ({ page }) => {
  await ready(page);
  await T(page, PLACE_BY_HAND);
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-ui="now-card"]')).toContainText('drag the pale frame');
  const a = await screenOf(page, 42, 35), b = await screenOf(page, 58, 48);
  const before = await viewOf(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  const mid = await T(page, () => { const p = window.__TEST__.world.preview; return { visible: p.visible, x: p.position.x, z: p.position.z }; });
  expect(mid.visible).toBe(true);
  expect(Math.hypot(mid.x - 58, mid.z - 48)).toBeLessThan(2);
  expect(await T(page, () => window.__TEST__.lessons.session.points.length)).toBe(0); // nothing dropped yet
  await page.mouse.up();
  const pts = await T(page, () => window.__TEST__.lessons.session.points.map((p) => [p.x, p.z]));
  expect(pts.length).toBe(1);
  expect(Math.hypot(pts[0][0] - 58, pts[0][1] - 48)).toBeLessThan(2); // where it was released, not where it was picked up
  const after = await viewOf(page);
  expect(after.theta).toBeCloseTo(before.theta, 5); // the drag did not also turn the camera
  expect(after.phi).toBeCloseTo(before.phi, 5);
  // A drag that starts off the field still turns the camera.
  await page.mouse.move(700, 40); await page.mouse.down(); await page.mouse.move(820, 60, { steps: 6 }); await page.mouse.up();
  expect((await viewOf(page)).theta).not.toBeCloseTo(before.theta, 3);
  expect(await T(page, () => window.__TEST__.lessons.session.points.length)).toBe(1);
});

test('quadrat placement by keyboard: Place by map takes typed x and z', async ({ page }) => {
  await ready(page);
  await T(page, PLACE_BY_HAND);
  await page.waitForTimeout(2500);
  await kb(page, now(page, /Place by map/));
  await kb(page, drawer(page).locator('#place-x'), 'Digit3');
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await page.keyboard.type('70');
  await kb(page, drawer(page).getByRole('button', { name: /Place quadrat here/ }));
  const pts = await T(page, () => window.__TEST__.lessons.session.points.map((p) => [p.x, p.z]));
  expect(pts).toEqual([[30, 70]]);
});

test('hand lens: a point on bare ground zooms onto the nearest plant, inside the frame while counting', async ({ page }) => {
  await ready(page);
  await T(page, () => { const L = window.__TEST__.lessons; L.app.goModule(2); L.chooseDesign('random'); L.step[2] = 2; L._enterStep(2); L.refresh(); L.enterQuadrat(1); });
  await page.waitForTimeout(2500);
  const r = await T(page, () => {
    const L = window.__TEST__.lessons, w = L.world;
    const q = L.session.points[0];
    L._lensOn();
    const ok = L._lensZoom(w.quadratFrames[0].position.clone());
    return { ok, zoomed: L.fw.zoomed, q: [q.x, q.z], plant: w.plantNear(w.quadratFrames[0].position, { quadrat: q, maxD: Infinity }) };
  });
  expect(r.ok).toBe(true);
  expect(r.zoomed).toBe(true);
  expect(r.plant).not.toBeNull();
  await page.waitForTimeout(1500);
  const look = await T(page, () => window.__TEST__.rig.view().target);
  // The lens looks at a plant whose base is inside the frame, not at the bare frame centre.
  const near = await T(page, (p) => window.__TEST__.world.plantNear({ x: p[0], z: p[2] }, { exact: true }), look);
  expect(near).not.toBeNull();
  expect(Math.abs(near.base.x - r.q[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(near.base.z - r.q[1])).toBeLessThanOrEqual(1);
});

test('Back steps back inside a module, then to the module before; Back to start shows the title', async ({ page }) => {
  await ready(page);
  await T(page, () => { const L = window.__TEST__.lessons; L.app.goModule(1); L.step[1] = 2; L._enterStep(1); L.refresh(); });
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ui="now-card"]')).toContainText('Name the species');
  await page.locator('[data-ui="back"]').click();
  await expect(page.locator('[data-ui="now-card"]')).toContainText('Look closely with the hand lens');
  await page.locator('[data-ui="back"]').click();
  await expect(page.locator('[data-ui="now-card"]')).toContainText('Meet the five species');
  await expect(page.getByRole('link', { name: /all projects/i })).toHaveCount(0);
  await page.getByRole('button', { name: /^menu$/i }).click();
  await page.locator('[data-ui="back-to-start"]').click();
  await expect(page.locator('[data-ui="title-screen"]')).toBeVisible();
});

test('title, practice, then Module 1 with the station cue', async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-ui="title-screen"]')).toBeVisible();
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.locator('[data-ui="now-card"]')).toContainText(/Practice 1 of/);
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.locator('[data-ui="now-card"]')).toContainText('Arrive at Ashcombe Meadow');
  const r = await T(page, () => ({ ids: window.__TEST__.inspect.ids(), course: window.__TEST__.catalog.inspectable.map((o) => o.id) }));
  expect(r.ids.sort()).toEqual(r.course.sort());
});

test('labels are hidden at rest; hover shows one; a click opens the card beside the object', async ({ page }) => {
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(1));
  await page.waitForTimeout(3000);
  expect(await visibleLabels(page)).toEqual([]);
  let id = null, p = null;
  for (const c of ['clipboard', 'field-station', 'hand-lens', 'butterweed', 'daisyleaf', 'stone-wall']) { p = await pointOn(page, c); if (p) { id = c; break; } }
  expect(p).not.toBeNull();
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(600);
  expect(await visibleLabels(page)).toContain(id);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(`[data-ui="info-card"][data-object-id="${id}"]`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="info-card"]')).toBeHidden();
});

test('every course object (task, learn) is in the keyboard list after streaming and opens by Enter; scenery is not', async ({ page }) => {
  await ready(page);
  await T(page, async () => { await window.__TEST__.world.startStreaming(); window.__TEST__.app.goModule(0); });
  await page.waitForTimeout(1500);
  const course = await T(page, () => window.__TEST__.catalog.inspectable.map((o) => o.id));
  const decor = await T(page, () => window.__TEST__.catalog.objects.filter((o) => o.role === 'decorative').map((o) => o.id));
  const listed = await T(page, () => window.__TEST__.inspect.ids());
  for (const id of course) expect(listed).toContain(id);
  for (const id of decor) expect(listed).not.toContain(id);
  expect(decor).toEqual(expect.arrayContaining(['clouds', 'butterflies', 'bees']));
  await T(page, () => window.__TEST__.app.openObjects());
  await kb(page, drawer(page).locator('[data-object-id="clipboard"]'));
  await expect(page.locator('[data-ui="info-card"][data-object-id="clipboard"]')).toBeVisible();
});

// Keyboard-only completion, one test per module (software WebGL is slow; one
// five-module run did not fit the 5-minute test cap). Each test reaches its
// module's start state through the test hooks (the earlier modules' results),
// then completes the module with Tab, Shift+Tab, Enter, Space, typing and Esc only.
const SUBMITTED = () => {
  const L = window.__TEST__.lessons;
  L.app.goModule(2); L.chooseDesign('random');
  for (let i = 1; i <= L.session.points.length; i++) { L.enterQuadrat(i); L.fw.draft.cover = '5-25'; L._saveQuadrat(); }
  L.submit();
};
test.describe('keyboard-only completion', () => {
  test.use({ viewport: { width: 800, height: 600 } });
  test('Module 1 (from the title screen)', async ({ page }) => {
    await ready(page);
    await kb(page, page.getByRole('button', { name: /^start/i }));
    await kb(page, page.getByRole('button', { name: /skip practice/i }));
    await kb(page, now(page, /^Next step$/));
    await kb(page, page.locator('[data-ui="now-card"] .v3-choice').first());
    await page.waitForTimeout(2600);
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /Open the pre-check/));
    await answerAll(page);
    await kb(page, now(page, /^Next step$/));
    await expect(page.locator('[data-ui="now-card"]')).toContainText('Meet the five species');
    expect(await T(page, () => window.__TEST__.shell.done.has(0))).toBe(true);
  });
  test('Module 2', async ({ page }) => {
    await ready(page);
    await T(page, () => window.__TEST__.app.goModule(1));
    await page.waitForTimeout(1500);
    await kb(page, now(page, /Open the field guide/));
    await page.keyboard.press('Escape');
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /Use the hand lens/));
    await kb(page, now(page, /Look at the centre/));
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /Open the quiz/));
    await answerAll(page);
    await kb(page, now(page, /^Next step$/));
    await expect(page.locator('[data-ui="now-card"]')).toContainText('Choose a sampling design');
    expect(await T(page, () => window.__TEST__.shell.done.has(1))).toBe(true);
  });
  const countByKeyboard = async (page, max) => {
    for (let q = 0; q < max; q++) {
      const go = now(page, /Go to quadrat \d+/);
      if (!(await go.isVisible().catch(() => false))) break;
      await kb(page, go);
      await kb(page, now(page, /Count sheet/));
      await kb(page, drawer(page).locator('input[type="radio"]').first(), 'Space');
      await kb(page, drawer(page).getByRole('button', { name: /Save quadrat/ }));
      await page.waitForTimeout(300);
    }
  };
  test('Module 3 (part 1): design, stakes, quadrats 1-4 by the count sheet', async ({ page }) => {
    await ready(page);
    await T(page, () => window.__TEST__.app.goModule(2));
    await page.waitForTimeout(1500);
    await kb(page, page.locator('[data-ui="now-card"] .v3-choice').filter({ hasText: /random/i }).first());
    await page.waitForTimeout(2000);
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /^Next step$/));
    await countByKeyboard(page, 4);
    expect(await T(page, () => window.__TEST__.lessons.session.sheet.visitedCount())).toBe(4);
  });
  // Parts 2 and 3 (G2): one six-quadrat keyboard run did not fit the 5-minute test cap
  // under software WebGL (it reached quadrat 10). Every quadrat is still counted by keyboard.
  const SAVED = (n) => {
    const L = window.__TEST__.lessons;
    L.app.goModule(2); L.chooseDesign('random'); L.step[2] = 2; L._enterStep(2);
    for (let i = 1; i <= n; i++) { L.enterQuadrat(i); L.fw.draft.cover = '5-25'; L._saveQuadrat(); }
  };
  test('Module 3 (part 2): quadrats 5-7 by the count sheet', async ({ page }) => {
    await ready(page);
    await T(page, SAVED, 4);
    await page.waitForTimeout(2000);
    await countByKeyboard(page, 3);
    expect(await T(page, () => window.__TEST__.lessons.session.sheet.visitedCount())).toBe(7);
  });
  test('Module 3 (part 3): quadrats 8-10 by the count sheet, then submit', async ({ page }) => {
    await ready(page);
    await T(page, SAVED, 7);
    await page.waitForTimeout(2000);
    await countByKeyboard(page, 8);
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /Open the data sheet/));
    await kb(page, drawer(page).getByRole('button', { name: /Submit fieldwork/ }));
    await expect(page.locator('[data-ui="now-card"]')).toContainText('See the true population');
    expect(await T(page, () => window.__TEST__.shell.done.has(2))).toBe(true);
  });
  test('Module 4: results, simulator, chart questions', async ({ page }) => {
    await ready(page);
    await T(page, SUBMITTED);
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-ui="now-card"]')).toContainText('See the true population');
    await kb(page, now(page, /Open the results/));
    await page.keyboard.press('Escape');
    await kb(page, now(page, /Open the simulator/));
    await kb(page, drawer(page).getByRole('button', { name: /Run 1,000 virtual samples/ }));
    await page.waitForFunction(() => window.__TEST__.lessons.state.simRan, null, { timeout: 120_000 });
    await page.keyboard.press('Escape');
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /Open the chart questions/));
    await answerAll(page);
    await kb(page, now(page, /^Next step$/));
    await expect(page.locator('[data-ui="now-card"]')).toContainText('Write your report');
    expect(await T(page, () => window.__TEST__.shell.done.has(3))).toBe(true);
  });
  test('Module 5: report and transfer', async ({ page }) => {
    await ready(page);
    await T(page, SUBMITTED);
    await T(page, () => window.__TEST__.app.goModule(4));
    await page.waitForTimeout(2000);
    await kb(page, now(page, /Open the report/));
    await kb(page, drawer(page).locator('textarea').first(), 'KeyM');
    await page.keyboard.type('eadow Butterweed was clumped near the stream.');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await kb(page, now(page, /^Next step$/));
    await kb(page, now(page, /Open the transfer questions/));
    await answerAll(page);
    await kb(page, now(page, /^Finish$/));
    expect(await T(page, () => window.__TEST__.shell.done.has(4))).toBe(true);
  });
});

test('text mode: every module renders, every course object is listed, decisions write the same state', async ({ page }) => {
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(0));
  await page.waitForTimeout(1200);
  await T(page, () => window.__TEST__.ui.toggleTextMode());
  const tm = page.locator('#textmode');
  await expect(tm).toContainText('Your hypothesis');
  const names = await T(page, () => window.__TEST__.catalog.inspectable.map((o) => o.name));
  const text = await tm.innerText();
  for (const n of names) expect(text).toContain(n);
  const fs = tm.locator('fieldset').first();
  await fs.getByRole('radio').first().check();
  await fs.getByRole('button', { name: /Submit answer/ }).click();
  await page.waitForTimeout(300);
  expect(await T(page, () => window.__TEST__.lessons.state.hypothesis)).toBeTruthy();
  for (const [i, label] of [[1, 'Species'], [2, 'Fieldwork'], [3, 'Reveal'], [4, 'Report']]) {
    await T(page, (n) => window.__TEST__.app.goModule(n), i);
    await page.waitForTimeout(1000);
    const sec = tm.locator(`section[aria-label="${label}"]`);
    await expect(sec).toBeVisible();
    expect((await sec.innerText()).length).toBeGreaterThan(80);
  }
});

test('reduced motion stops the sun time-lapse, the stream and the worker', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(0));
  await page.waitForTimeout(2500);
  const snap = () => T(page, () => { const w = window.__TEST__.world; return [w.sky.elevation, w.worker.root.position.x, w.stream.userData.normalMap.offset.y]; });
  const a = await snap();
  await page.waitForTimeout(2000);
  expect(await snap()).toEqual(a);
  expect(await T(page, () => window.__TEST__.motion.factor)).toBe(0);
});

test('motion report: at least eight systems on four layers, every label on a card', async ({ page }) => {
  await ready(page);
  const r = await T(page, () => ({ rep: window.__TEST__.motion.report(), problems: window.__TEST__.motion.checkLabels(window.__TEST__.catalog) }));
  expect(r.rep.ok).toBe(true);
  expect(r.problems).toEqual([]);
});

test.describe('touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('bottom tab strip; a tap on an object opens its card above the strip', async ({ page }) => {
    await ready(page);
    await T(page, () => window.__TEST__.app.goModule(1));
    await page.waitForTimeout(3000);
    const bar = await T(page, () => { const r = document.querySelector('[data-ui="top-bar"]').getBoundingClientRect(); return [r.top, r.bottom, r.height, innerHeight]; });
    expect(bar[1]).toBe(bar[3]);
    expect(bar[2]).toBeLessThanOrEqual(56);
    let id = null, p = null;
    for (const c of ['clipboard', 'field-station', 'hand-lens', 'butterweed', 'daisyleaf']) { p = await pointOn(page, c); if (p) { id = c; break; } }
    expect(p).not.toBeNull();
    await page.touchscreen.tap(p.x, p.y);
    const card = page.locator(`[data-ui="info-card"][data-object-id="${id}"]`);
    await expect(card).toBeVisible();
    const cb = await card.boundingBox();
    expect(cb.y + cb.height).toBeLessThanOrEqual(bar[0]);
  });
});

test.describe('touch drag', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('quadrat drag by touch: touch the meadow, drag the frame, lift to drop it', async ({ page }) => {
    await ready(page);
    await T(page, PLACE_BY_HAND);
    await page.waitForTimeout(3000);
    // Collapse the Now sheet so the meadow is free to touch.
    await T(page, () => window.__TEST__.shell.setNowExpanded?.(false));
    await page.waitForTimeout(400);
    let a = await screenOf(page, 45, 40), b = await screenOf(page, 55, 55);
    const free = (p) => T(page, (q) => document.elementFromPoint(q.x, q.y)?.id === 'app', p);
    expect(await free(a)).toBe(true);
    expect(await free(b)).toBe(true);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
    await touch('touchStart', a);
    for (let k = 1; k <= 8; k++) await touch('touchMove', { x: a.x + ((b.x - a.x) * k) / 8, y: a.y + ((b.y - a.y) * k) / 8 });
    await touch('touchEnd');
    await page.waitForTimeout(200);
    const pts = await T(page, () => window.__TEST__.lessons.session.points.map((p) => [p.x, p.z]));
    expect(pts.length).toBe(1);
    expect(Math.hypot(pts[0][0] - 55, pts[0][1] - 55)).toBeLessThan(2.5);
  });
});

test('without WebGL2 the app runs in text mode with every objective', async ({ page }) => {
  await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => window.__APP_READY__, null, { timeout: 60_000 });
  await expect(page.locator('#textmode')).toBeVisible();
  await expect(page.locator('#textmode')).toContainText('Your hypothesis');
  expect(errors).toEqual([]);
});
