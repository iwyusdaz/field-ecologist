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

test('notebook rail on desktop: one 56 px left rail with module tabs and the menu at its foot', async ({ page }) => {
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(0));
  await page.waitForTimeout(1500);
  const r = await T(page, () => {
    const bar = document.querySelector('[data-ui="top-bar"]').getBoundingClientRect();
    const tabs = [...document.querySelectorAll('[data-ui="module-step"]')].map((b) => b.getBoundingClientRect());
    const menu = document.querySelector('[data-action="menu"]').getBoundingClientRect();
    return { bar: [bar.left, bar.top, bar.width, bar.height], tabsStacked: tabs.every((t, i) => !i || t.top >= tabs[i - 1].bottom - 1), menuBelow: menu.top > tabs.at(-1).bottom, vh: innerHeight };
  });
  expect(r.bar[0]).toBe(0);
  expect(r.bar[2]).toBeLessThanOrEqual(56);
  expect(r.bar[3]).toBe(r.vh);
  expect(r.tabsStacked).toBe(true);
  expect(r.menuBelow).toBe(true);
});

test('title, practice, then Module 1 with the station cue', async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-ui="title-screen"]')).toBeVisible();
  await page.getByRole('button', { name: /^start/i }).click();
  await expect(page.locator('[data-ui="now-card"]')).toContainText(/Practice 1 of/);
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.locator('[data-ui="now-card"]')).toContainText('Arrive at Ashcombe Meadow');
  const ids = await T(page, () => window.__TEST__.inspect.ids());
  expect(ids.length).toBeGreaterThanOrEqual(20);
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

test('every catalog object is in the keyboard list after streaming and opens by Enter', async ({ page }) => {
  await ready(page);
  await T(page, async () => { await window.__TEST__.world.startStreaming(); window.__TEST__.app.goModule(0); });
  await page.waitForTimeout(1500);
  const all = await T(page, () => window.__TEST__.catalog.objects.map((o) => o.id));
  const listed = await T(page, () => window.__TEST__.inspect.ids());
  for (const id of all) expect(listed).toContain(id);
  await T(page, () => window.__TEST__.app.openObjects());
  await kb(page, drawer(page).locator('[data-object-id="clipboard"]'));
  await expect(page.locator('[data-ui="info-card"][data-object-id="clipboard"]')).toBeVisible();
});

test('keyboard-only completion of all five modules', async ({ page }) => {
  await ready(page);
  await kb(page, page.getByRole('button', { name: /^start/i }));
  await kb(page, page.getByRole('button', { name: /skip practice/i }));
  // Module 1
  await kb(page, now(page, /^Next step$/));
  await kb(page, page.locator('[data-ui="now-card"] .v3-choice').first());
  await page.waitForTimeout(2600);
  await kb(page, now(page, /^Next step$/));
  await kb(page, now(page, /Open the pre-check/));
  await answerAll(page);
  await kb(page, now(page, /^Next step$/));
  await expect(page.locator('[data-ui="now-card"]')).toContainText('Meet the five species');
  // Module 2
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
  // Module 3: simple random, count every quadrat with the count sheet
  await kb(page, page.locator('[data-ui="now-card"] .v3-choice').filter({ hasText: /random/i }).first());
  await page.waitForTimeout(2000);
  await kb(page, now(page, /^Next step$/));
  await kb(page, now(page, /^Next step$/));
  for (let q = 0; q < 12; q++) {
    const go = now(page, /Go to quadrat \d+/);
    if (!(await go.isVisible().catch(() => false))) break;
    await kb(page, go);
    await kb(page, now(page, /Count sheet/));
    await kb(page, drawer(page).locator('input[type="radio"]').first(), 'Space');
    await kb(page, drawer(page).getByRole('button', { name: /Save quadrat/ }));
    await page.waitForTimeout(400);
  }
  await kb(page, now(page, /^Next step$/));
  await kb(page, now(page, /Open the data sheet/));
  await kb(page, drawer(page).getByRole('button', { name: /Submit fieldwork/ }));
  await expect(page.locator('[data-ui="now-card"]')).toContainText('See the true population');
  // Module 4
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
  // Module 5
  await kb(page, now(page, /Open the report/));
  await kb(page, drawer(page).locator('textarea').first(), 'KeyM');
  await page.keyboard.type('eadow Butterweed was clumped near the stream.');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await kb(page, now(page, /^Next step$/));
  await kb(page, now(page, /Open the transfer questions/));
  await answerAll(page);
  await kb(page, now(page, /^Finish$/));
  expect(await T(page, () => [0, 1, 2, 3, 4].every((i) => window.__TEST__.shell.done.has(i)))).toBe(true);
});

test('text mode: every module renders, every catalog object is listed, decisions write the same state', async ({ page }) => {
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(0));
  await page.waitForTimeout(1200);
  await T(page, () => window.__TEST__.ui.toggleTextMode());
  const tm = page.locator('#textmode');
  await expect(tm).toContainText('Your hypothesis');
  const names = await T(page, () => window.__TEST__.catalog.objects.map((o) => o.name));
  const text = await tm.innerText();
  for (const n of names) expect(text).toContain(n);
  await tm.locator('.choice-btn').first().click();
  await page.waitForTimeout(300);
  expect(await T(page, () => window.__TEST__.lessons.state.hypothesis)).toBeTruthy();
  for (const i of [1, 2, 3, 4]) {
    await T(page, (n) => window.__TEST__.app.goModule(n), i);
    await page.waitForTimeout(1000);
    await expect(tm.locator('h3').first()).toContainText(`Module ${i + 1}`);
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
