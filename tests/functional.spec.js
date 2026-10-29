/**
 * Functional test: a scripted playthrough of the full learning path
 * (menu → modules → one full objective → assessment) using the window.__TEST__
 * hooks (exposed when the build sets VITE_TEST_HOOKS=1; release builds strip
 * them), plus DOM-level checks at each step and a text-mode parity pass.
 */
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/');
  await expect(page.locator('.module-nav button')).toHaveCount(5, { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); // skip the dawn cinematic if it started
  await page.waitForTimeout(300);
}

test('menu and settings open by keyboard', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Menu' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-dialog')).not.toBeVisible();
});

test('all module tabs are reachable and activate by keyboard', async ({ page }) => {
  await boot(page);
  const tabs = page.locator('.module-nav button');
  for (let i = 0; i < 5; i++) {
    await tabs.nth(i).focus();
    await page.keyboard.press('Enter');
    await expect(tabs.nth(i)).toHaveAttribute('aria-current', 'page');
  }
});

test('full playthrough: question → species → fieldwork → reveal → report', async ({ page }) => {
  await boot(page);
  const info = await page.evaluate(async () => {
    const t = window.__TEST__;
    if (!t) return { error: 'no test hooks — build with VITE_TEST_HOOKS=1' };
    const H = t.hooks;
    const out = { steps: [] };
    const ok = (name, cond) => out.steps.push({ name, pass: Boolean(cond) });

    // ---- Module 1: hypothesis + pre-check ----
    H.goTo('m1');
    H.answerItem('hypothesis', 'clumped');
    for (const item of t.app.items.precheck) {
      H.answerItem(item.id, item.correct);
    }
    ok('m1 complete', H.state().completed.m1 === true);

    // ---- Module 2: ID quiz (8 items, one deliberate mistake) ----
    H.goTo('m2');
    for (const item of t.app.items.idQuiz) {
      const truth = item.correct ?? item.speciesRef;
      H.answerItem(item.id, item.id === 'id3' ? 'blue-sedge' : truth); // one mis-ID
    }
    ok('m2 complete', H.state().completed.m2 === true);
    ok('mis-ID recorded', (t.app.guideDialogMistakes || []).length === 1);

    // ---- Module 3: fieldwork (stratified, all 10 quadrats) ----
    H.goTo('m3');
    const designRes = H.chooseDesign('stratified');
    ok('design chosen', designRes.ok === true && H.state().design === 'stratified');
    ok('10 quadrats placed', t.app.session.points.length === 10);
    // stratified puts >= 3 quadrats in each moisture third
    const zoneCount = { wet: 0, mid: 0, dry: 0 };
    for (const p of t.app.session.points) {
      const s = p.x < 100 / 3 ? 'wet' : p.x < 200 / 3 ? 'mid' : 'dry';
      zoneCount[s]++;
    }
    ok('strata covered', zoneCount.wet >= 3 && zoneCount.mid >= 3 && zoneCount.dry >= 3);

    const speciesIds = t.app.species.map((s) => s.id);
    for (let i = 1; i <= 10; i++) {
      const v = H.visitQuadrat(i);
      ok(`visit ${i}`, v.ok === true);
      const truths = t.app.session.trueCounts(i);
      const counts = {};
      for (const sp of speciesIds) {
        if (sp === 'bunchgrass') continue; // recorded as a cover band below
        if (truths[sp]) counts[sp] = truths[sp];
      }
      H.setCount(i, counts);
      H.setCover(i, '5-25');
      H.finishQuadrat(i);
    }
    ok('time charged', t.app.session.sheet.timeUsed > 0 && t.app.session.remainingTime() < 100);
    const sub = H.submitFieldwork();
    ok('submission', sub.quadrats === 10 && sub.estimates.butterweed !== undefined);
    // Single-effort sanity (the convergence proof lives in the unit tests):
    // a fair design's estimate is within 1.5x of the truth.
    ok('estimate near truth', Math.abs(sub.estimates.butterweed - t.app.population.trueDensity.butterweed) <
      t.app.population.trueDensity.butterweed * 1.5);

    // ---- Module 4: reveal + simulator + chart interpretation ----
    H.goTo('m4');
    ok('reveal table rendered', document.body.innerText.includes('Your estimate vs the truth'));
    const sim = await H.runSimulator({ design: 'stratified', n: 10, speciesId: 'butterweed' });
    ok('simulator ran', sim.ok === true);
    const simBias = await H.runSimulator({ design: 'convenience', n: 10, speciesId: 'butterweed' });
    ok('biased sim ran', simBias.ok === true);
    for (const item of t.app.items.chartItems) H.answerItem(item.id, item.correct);

    // ---- Module 5: report + transfer ----
    H.goTo('m5');
    for (const s of ['design', 'results', 'uncertainty', 'limitations']) H.fillReport(s, `Test draft for ${s}.`);
    H.completeRubric();
    for (const item of t.app.items.transfer) {
      H.answerItem(item.id, item.correct);
    }
    ok('m5 complete', H.state().completed.m5 === true);

    // ---- learning record ----
    const verbs = {};
    for (const e of t.record.events) verbs[e.verb.display['en-US']] = (verbs[e.verb.display['en-US']] || 0) + 1;
    out.verbs = verbs;
    out.eventCount = t.record.events.length;
    ok('answered items >= 20', (verbs.answered || 0) >= 20); // 1 hypothesis + 5 pre + 8 id + 3 chart + 4 transfer
    ok('experienced events >= 11', (verbs.experienced || 0) >= 11); // design + 10 quadrat visits
    ok('completed events >= 5', (verbs.completed || 0) >= 5); // m1, m2, submission, simulator, rubric, transfer
    return out;
  });

  console.log(JSON.stringify(info, null, 1));
  expect(info.error).toBeUndefined();
  for (const s of info.steps) expect(s.pass, s.name).toBe(true);
  expect(info.eventCount).toBeGreaterThan(30);
});

test('reveal UI shows the truth table and the simulator chart with a data table', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const t = window.__TEST__;
    t.hooks.goTo('m3');
    t.hooks.chooseDesign('random');
    for (let i = 1; i <= 10; i++) {
      t.hooks.visitQuadrat(i);
      const truths = t.app.session.trueCounts(i);
      t.hooks.setCount(i, { butterweed: truths.butterweed || 0 });
      t.hooks.finishQuadrat(i);
    }
    t.hooks.submitFieldwork();
    t.hooks.goTo('m4');
    await t.hooks.runSimulator({ design: 'random', n: 10, speciesId: 'butterweed' });
  });
  await expect(page.getByText('Your estimate vs the truth')).toBeVisible();
  await expect(page.locator('.sim-results svg').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Histogram data table')).toBeVisible();
  await page.getByText('Histogram data table').click();
  await expect(page.locator('.sim-results table').first()).toBeVisible();
});

test('text mode: full parity pass over the same objectives', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Text mode' }).first().click();
  await expect(page.locator('#textmode')).toBeVisible();

  // m1 renders (hypothesis radios + pre-check)
  await expect(page.locator('#textmode')).toContainText('Module 1');
  await expect(page.locator('#textmode')).toContainText(/wallpaper pattern/);

  // jump to m3 and play the fieldwork loop through the text-mode grid
  await page.locator('.module-nav button').nth(2).click();
  await expect(page.locator('#textmode')).toContainText('Module 3');
  await page.getByRole('button', { name: 'Choose Wherever looks interesting' }).click();
  await expect(page.locator('#textmode')).toContainText(/of 10 placed|placed \d+ of 10|pick each centre/i);

  // place 3 quadrats by clicking grid cells (convenience = learner picks)
  const cells = page.locator('.grid-map .cell');
  expect(await cells.count()).toBe(400);
  await cells.nth(44).click();
  await cells.nth(90).click();
  await cells.nth(210).click();
  await expect(page.locator('#textmode')).toContainText(/3 of 10 placed/);

  // open the sampling form on a placed cell
  await page.locator('.grid-map .cell.selected').first().click();
  await expect(page.locator('#textmode')).toContainText(/Quadrat 1/);
  const group = page.locator('.tm-group').first();
  if (await group.count()) {
    const isCover = await group.evaluate((el) => el.dataset.cover === 'true');
    if (isCover) {
      await group.getByRole('radio').first().check();
    } else {
      await group.locator('select').selectOption('butterweed');
      await group.locator('input[type="number"]').fill('1');
    }
  }
  await page.getByRole('button', { name: /Save quadrat 1/ }).click();

  // data sheet shows the record; submit unlocks the reveal
  await expect(page.locator('#textmode')).toContainText('Your data sheet');
  const submitBtn = page.getByRole('button', { name: /Submit fieldwork for the reveal/ });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await page.locator('.module-nav button').nth(3).click();
  await expect(page.locator('#textmode')).toContainText(/The reveal|Module 4/);
  await expect(page.locator('#textmode')).toContainText(/true population|Go to Module 3/);

  // m5 renders report + transfer in text mode
  await page.locator('.module-nav button').nth(4).click();
  await expect(page.locator('#textmode')).toContainText(/Transfer|Module 5/);

  const events = await page.evaluate(() => window.__TEST__.record.events.length);
  expect(events).toBeGreaterThan(3);
});

/** Put the camera on a fixed station view and return the guide/stack screen points. */
async function stationView(page) {
  // Collapse the HUD drawer so the station is not under the panel (review I4).
  await page.locator('[data-action="toggle-drawer"]').click();
  return page.evaluate(async () => {
    const t = window.__TEST__;
    const s = t.scene;
    const ix = s.interaction;
    s.station.updateMatrixWorld(true);
    const g = s.fieldGuideProp.getWorldPosition(new s.station.position.constructor());
    s.freeCam = true;
    ix.glideTo([g.x + 0.6, g.y + 1.3, g.z - 1.6], [g.x, g.y, g.z], 0);
    await new Promise((r) => setTimeout(r, 400));
    const rect = t.engine.renderer.domElement.getBoundingClientRect();
    const project = (obj) => {
      const v = obj.getWorldPosition(new s.station.position.constructor()).project(t.engine.camera);
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    };
    const guide = project(s.fieldGuideProp);
    const pickedId = ix._pickAtClient(guide.x, guide.y)?.entry?.id ?? null;
    const topEl = document.elementFromPoint(guide.x, guide.y)?.id ?? null;
    return { guide, pickedId, topEl };
  });
}

test('in-world field guide prop is hoverable and opens the guide, not fieldwork', async ({ page }) => {
  await boot(page);
  const v = await stationView(page);
  expect(v.topEl).toBe('app');
  expect(v.pickedId).toBe('field-guide');
  await page.mouse.move(v.guide.x, v.guide.y);
  await expect(page.locator('.v2-world-tooltip')).toContainText('Field guide');
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#guide-dialog')).toHaveAttribute('open', '');
  const mod = await page.evaluate(() => window.__TEST__.hooks.state().module);
  expect(mod).not.toBe('m3');
  // the fictional-species statement is visible in the in-field guide dialog
  await expect(page.locator('#guide-dialog [data-testid="species-statement"]')).toBeVisible();
  await expect(page.locator('#guide-dialog [data-testid="species-statement"]')).toContainText(/fictional/);
});

test('fictional-species statement is visible in Module 2 and text-mode Module 2', async ({ page }) => {
  await boot(page);
  await page.locator('.module-nav button').nth(1).click();
  const m2 = page.locator('#overlays [data-testid="species-statement"]').first();
  await expect(m2).toBeVisible();
  await expect(m2).toContainText(/constructed for teaching purposes/);
  await page.getByRole('button', { name: 'Text mode' }).first().click();
  await expect(page.locator('#textmode')).toContainText('Module 2');
  const tm = page.locator('#textmode [data-testid="species-statement"]');
  await expect(tm).toBeVisible();
  await expect(tm).toContainText(/fictional/);
});

test('viewpoint buttons glide the camera by keyboard (ring equivalent)', async ({ page }) => {
  await boot(page);
  const btn = page.getByRole('button', { name: 'Go to viewpoint: Dry zone' });
  await expect(btn).toBeVisible();
  await btn.focus();
  await page.keyboard.press('Enter');
  // the glide ends at the dry-zone camera position (MEADOW_VIEWPOINTS: [76, 4.4, 46])
  await expect.poll(async () => page.evaluate(() => {
    const p = window.__TEST__.engine.camera.position;
    return Math.hypot(p.x - 76, p.z - 46);
  }), { timeout: 60_000 }).toBeLessThan(1.5);
  await expect(page.getByRole('button', { name: 'Go to viewpoint: The stream' })).toBeVisible();
});

test('tap-to-count: click a plant, name its species, the tally increments (no auto-ID)', async ({ page }) => {
  await boot(page);
  await page.locator('.module-nav button').nth(2).click();
  await page.getByRole('button', { name: /^Choose Simple random/ }).click();
  await page.locator('button.chip').first().click();
  // wait for the walk glide to end in the orthographic counting view
  await expect.poll(() => page.evaluate(() => window.__TEST__.scene.counting), { timeout: 60_000 }).toBe(true);
  // hide the form so the whole quadrat is clickable, then find a counted plant's screen point
  await page.getByRole('button', { name: 'Hide form to see the whole quadrat' }).click();
  const tap = await page.evaluate(() => {
    const t = window.__TEST__;
    const s = t.scene;
    const g = s.quadratGroups[s.activeQuadrat].position;
    const rect = t.engine.renderer.domElement.getBoundingClientRect();
    const V = g.constructor;
    // nearest plant (any counted species) to the quadrat centre, projected through the ortho camera
    let best = null;
    for (const pts of Object.values(t.app.population.positions)) {
      for (const p of pts) {
        const d = Math.hypot(p.x - g.x, p.z - g.z);
        if (Math.abs(p.x - g.x) < 0.9 && Math.abs(p.z - g.z) < 0.9 && (!best || d < best.d)) best = { d, x: p.x, z: p.z };
      }
    }
    const pt = best || { x: g.x, z: g.z };
    const v = new V(pt.x, g.y, pt.z).project(s.orthoCam);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  });
  await page.mouse.click(tap.x, tap.y);
  const picker = page.getByRole('group', { name: 'Which species is this plant?' });
  await expect(picker).toBeVisible();
  // the picker offers all five species and has not pre-selected or labelled the plant
  await expect(picker.locator('button[data-species]')).toHaveCount(5);
  await picker.getByRole('button', { name: 'Meadow Butterweed', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__TEST__.scene.tallyMarks?.count ?? 0)).toBe(1);
  // the count form (text equivalent) shows the tally
  await page.getByRole('button', { name: /Show counting form/ }).click();
  await expect(page.locator('#count-1-butterweed')).toHaveValue('1');
});

test('CSV export produces a self-describing sheet', async ({ page }) => {
  await boot(page);
  const csv = await page.evaluate(() => {
    const t = window.__TEST__;
    t.hooks.goTo('m3');
    t.hooks.chooseDesign('random');
    t.hooks.visitQuadrat(1);
    t.hooks.setCount(1, { butterweed: 3 });
    t.hooks.setCover(1, '5-25');
    t.hooks.finishQuadrat(1);
    return t.hooks.csvPreview();
  });
  expect(csv.split('\r\n')[0]).toContain('quadrat,x_m,z_m,species_id');
  expect(csv).toContain('butterweed');
  expect(csv).toContain('5-25');
});
