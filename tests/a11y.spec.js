/**
 * Accessibility: axe on the HTML overlay (menus, HUD, module panels, dialogs,
 * text mode incl. the 20x20 grid map). Gate: zero critical or serious issues
 * (push gate in CI).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('overlay UI has no critical or serious axe issues', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas, [data-webgl-fallback]').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500); // let the menu/HUD settle

  const scan = async (label) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('canvas')
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    if (bad.length) console.log(`axe violations (${label}):`, JSON.stringify(bad, null, 2));
    expect(bad, label).toEqual([]);
  };

  await scan('initial view');

  // Settings dialog
  await page.getByRole('button', { name: 'Settings' }).click();
  await scan('settings dialog');
  await page.keyboard.press('Escape');

  // Menu dialog
  await page.getByRole('button', { name: 'Menu' }).click();
  await scan('menu dialog');
  await page.keyboard.press('Escape');

  // Text mode (module 1: hypothesis + pre-check)
  await page.getByRole('button', { name: /text mode/i }).first().click();
  await scan('text mode');

  // My progress dialog (from text mode the header is still present)
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'My progress' }).click();
  await scan('progress dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /text mode/i }).first().click(); // back to 3D
});

test('module panels, field guide and text-mode grid have no critical or serious issues', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas, [data-webgl-fallback]').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape'); // skip cinematic

  const scan = async (label) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('canvas')
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    if (bad.length) console.log(`axe violations (${label}):`, JSON.stringify(bad, null, 2));
    expect(bad, label).toEqual([]);
  };

  // Module 2: field guide cards + quiz
  await page.locator('.module-nav button').nth(1).click();
  await page.waitForTimeout(900);
  await scan('module 2 field guide');

  // Field guide dialog (opens from the counting form)
  await page.locator('.module-nav button').nth(2).click();
  await page.getByRole('button', { name: /Choose Simple random/ }).click();
  await page.waitForTimeout(600);
  await scan('module 3 fieldwork view');
  await page.locator('.chip').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Open field guide' }).click();
  await scan('field guide dialog');
  await page.keyboard.press('Escape');

  // Module 4 reveal (gated state: unsubmitted) + module 5 report
  await page.locator('.module-nav button').nth(3).click();
  await page.waitForTimeout(500);
  await scan('module 4 gated');
  await page.locator('.module-nav button').nth(4).click();
  await page.waitForTimeout(500);
  await scan('module 5 report');

  // Text mode fieldwork grid (400-cell map) + reveal in text mode
  await page.evaluate(() => {
    const t = window.__TEST__;
    t.hooks.goTo('m3');
    t.hooks.chooseDesign('random');
    for (let i = 1; i <= 10; i++) {
      t.hooks.visitQuadrat(i);
      t.hooks.setCount(i, { butterweed: t.app.session.trueCounts(i).butterweed || 0 });
      t.hooks.finishQuadrat(i);
    }
    t.hooks.submitFieldwork();
    t.shell.toggleTextMode();
    t.hooks.goTo('m3');
  });
  await scan('text mode grid map');
  await page.locator('.module-nav button').nth(3).click();
  await page.waitForTimeout(400);
  await scan('text mode reveal');
});
