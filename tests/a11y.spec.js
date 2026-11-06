/**
 * axe-core checks (0 critical or serious) on the v3 states: title, practice,
 * every module, an open info card, the field guide, data sheet and report
 * drawers, the menu, and text mode.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ready } from './helpers.js';
async function scan(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
test('axe: 0 critical/serious on every v3 state', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await ready(page);
  await scan(page, 'title');
  await page.getByRole('button', { name: /^start/i }).click();
  await scan(page, 'practice');
  await page.getByRole('button', { name: /skip practice/i }).click();
  await page.waitForTimeout(1200);
  await scan(page, 'm1');
  await page.evaluate(() => window.__TEST__.inspect.open('field-station'));
  await page.waitForTimeout(800);
  await scan(page, 'info card');
  await page.keyboard.press('Escape');
  for (const i of [1, 2, 3, 4]) {
    await page.evaluate((n) => window.__TEST__.app.goModule(n), i);
    await page.waitForTimeout(2200);
    await scan(page, `m${i + 1}`);
  }
  await page.evaluate(() => window.__TEST__.lessons._guideDrawer(null));
  await page.waitForTimeout(800);
  await scan(page, 'field guide drawer');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const L = window.__TEST__.lessons; L.app.goModule(2); L.chooseDesign('random'); L._dataSheetDrawer(); });
  await page.waitForTimeout(1200);
  await scan(page, 'data sheet drawer');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const L = window.__TEST__.lessons; L.app.goModule(4); L._reportDrawer(); });
  await page.waitForTimeout(1200);
  await scan(page, 'report drawer');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="menu"]').click();
  await scan(page, 'menu');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__TEST__.ui.toggleTextMode());
  await page.waitForTimeout(1200);
  await scan(page, 'text mode');
});
test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('axe: bottom tab strip and bottom-sheet card', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.__TEST__.app.goModule(1));
    await page.waitForTimeout(2200);
    await scan(page, 'phone m2');
    await page.evaluate(() => window.__TEST__.inspect.open('clipboard'));
    await page.waitForTimeout(800);
    await scan(page, 'phone info card');
  });
});
