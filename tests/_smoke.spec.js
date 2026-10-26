import { test } from '@playwright/test';

test('smoke: quadrat view debug', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('overlays').style.display = 'none'; });
  const dbg = await page.evaluate(() => {
    const t = window.__TEST__;
    t.hooks.chooseDesign('random');
    const p = t.app.session.points[0];
    t.scene.walkTo(p.x, p.z, { duration: 0.1, then: () => t.scene.enterQuadratView(0) });
    return { p, design: t.app.session.design, groups: t.scene.quadratGroups.length };
  });
  await page.waitForTimeout(2000);
  const dbg2 = await page.evaluate(() => {
    const t = window.__TEST__;
    const s = t.app.session;
    const counts = s.trueCounts(1);
    const cam = t.engine.renderCamera;
    return {
      counts,
      renderCam: cam ? { x: cam.position.x, y: cam.position.y, z: cam.position.z, left: cam.left, right: cam.right } : null,
      mainCam: { x: t.engine.camera.position.x, y: t.engine.camera.position.y, z: t.engine.camera.position.z },
      counting: t.scene.counting,
      wind: t.scene.vegetation.windUniforms.uWind.value,
      fps: t.engine.fps,
    };
  });
  await page.screenshot({ path: 'tmp/shot-quadrat.png' });
  console.log(JSON.stringify({ dbg, dbg2, errors }, null, 1));
});
