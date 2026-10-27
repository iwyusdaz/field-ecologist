#!/usr/bin/env node
/**
 * Render the release poster (1200x630, webp + jpg, each <= 200 KB) from the
 * REAL scene: loads the built app in headless Chromium, stages a hero shot via
 * the app's own camera, and encodes the WebGL canvas to webp/jpg via
 * canvas.toDataURL (Chromium encodes both formats natively — no extra deps).
 *
 * Usage: npm run build && node scripts/render-poster.mjs
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let __posterInfoRaw;
const DIST = join(root, 'dist');
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.hdr': 'image/vnd.radiance', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
};
const server = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = join(DIST, rel);
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4177, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('http://127.0.0.1:4177/', { waitUntil: 'networkidle', timeout: 45_000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape'); // skip the dawn cinematic if playing
await page.waitForTimeout(800);

// Stage the hero shot: grass-level view of the densest real Butterweed cluster,
// sun behind the camera, stream-side ground in the background.
__posterInfoRaw = await page.evaluate(() => {
  const t = window.__TEST__;
  const scene = t.scene;
  // Freeze the auto-playing dawn cinematic WITHOUT its camera reset
  // (_afterCinematic would move the camera back to the station).
  if (t.player) {
    t.player.playing = false;
    t.player.root.hidden = true;
    cancelAnimationFrame(t.player._raf);
    clearTimeout(t.player._stillTimer);
  }
  scene.scene.backgroundBlurriness = 0;
  // densest 3 m cell of the target species (the modelled "showy patch")
  const counts = new Map();
  for (const p of t.app.population.positions['butterweed']) {
    const k = `${Math.floor(p.x / 3)},${Math.floor(p.z / 3)}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [k, n] of counts) {
    const [i, j] = k.split(',').map(Number);
    // keep the composition inside the meadow with depth behind the patch
    if (i < 8 || i > 22 || j < 8 || j > 24) continue;
    if (n > bestN) { bestN = n; best = k; }
  }
  const [bi, bj] = best.split(',').map(Number);
  const px = bi * 3 + 1.5, pz = bj * 3 + 1.5;
  scene.setQuadrats([
    { x: px - 1.5, z: pz - 0.8 },
    { x: px + 1.7, z: pz + 1.1 },
  ]);
  scene.orbit.target.set(px, scene.terrainHeight(px, pz) + 0.25, pz);
  scene.orbit.spherical.radius = 5.2;
  scene.orbit.spherical.phi = 1.35;
  scene.orbit.spherical.theta = 2.15; // camera south-west of the patch, looking into the field
  scene.orbit.update();
  scene.setDawn(null);
  return {
    target: [Math.round(px * 10) / 10, Math.round(pz * 10) / 10],
    cam: scene.orbit.camera.position.toArray().map((n) => Math.round(n * 10) / 10),
    preset: t.engine.quality.name,
    veg: [...scene.vegetation.species.values()].map((s) => `${s.id}:near=${s.nearMesh.count},imp=${s.impMesh.count}`).join(' | '),
  };
});
console.log('[poster]', JSON.stringify(__posterInfoRaw));
await page.waitForTimeout(2500); // let the HDRI + instanced sets settle
console.log('[poster after settle]', JSON.stringify(await page.evaluate(() => {
  const s = window.__TEST__.scene.vegetation;
  return [...s.species.values()].map((x) => `${x.id}:near=${x.nearMesh.count},imp=${x.impMesh.count}`).join(' | ');
})));

// Capture the composited frame the way the engine actually renders it (the
// rAF loop), with all HTML UI hidden. Chromium encodes webp + jpeg natively.
await page.evaluate(() => {
  const t = window.__TEST__;
  // Re-assert the frozen state right before capture (a queued cinematic tick
  // can otherwise replay the dawn overlay over the staged frame).
  if (t.player) {
    t.player.playing = false;
    t.player.root.hidden = true;
    cancelAnimationFrame(t.player._raf);
    clearTimeout(t.player._stillTimer);
    t.player.root.querySelectorAll('.cinematic-caption,.cinematic-progress,.cinematic-skip').forEach((n) => n.remove());
  }
  t.scene.setDawn(null);
  for (const sel of ['.app-header', '.module-nav', '.hud', '#overlays', '.skip-link', '.cinematic-overlay']) {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: join(root, 'public', `poster-${VERSION}.webp`), type: 'webp', quality: 82 });
await page.screenshot({ path: join(root, 'public', `poster-${VERSION}.jpg`), type: 'jpeg', quality: 86 });

for (const f of [`poster-${VERSION}.webp`, `poster-${VERSION}.jpg`]) {
  const kb = Math.round(statSync(join(root, 'public', f)).size / 1024);
  console.log(`${f}: ${kb} KB`);
  if (kb > 200) { console.error('over 200 KB budget'); process.exit(1); }
}

await browser.close();
server.close();
console.log('poster rendered from the real scene');
