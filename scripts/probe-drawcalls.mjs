// Headless draw-call probe (not a Playwright spec): node tests/drawcalls.probe.mjs <url>
import { chromium } from '@playwright/test';
const url = process.argv[2] || 'http://127.0.0.1:4179/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForFunction(() => window.__TEST__?.app?.sceneReady, null, { timeout: 60000 });
await page.keyboard.press('Escape');
const out = {};
for (const preset of ['low', 'medium']) {
  out[preset] = await page.evaluate(async (p) => {
    const t = window.__TEST__;
    t.engine.quality.set?.(p);
    t.scene.setDawn(null);
    const s = t.scene;
    s.orbit.target.set(50, 1.2, 30);
    s.orbit.spherical.radius = 30;
    s.freeCam = false;
    await new Promise((r) => setTimeout(r, 2500));
    const r = t.engine.renderer;
    r.info.autoReset = false;
    r.info.reset();
    await new Promise((res) => requestAnimationFrame(() => res()));
    const calls = r.info.render.calls;
    r.info.autoReset = true;
    return { calls, preset: t.engine.quality.preset ?? t.engine.quality.name };
  }, preset);
}
console.log(JSON.stringify(out));
await browser.close();
