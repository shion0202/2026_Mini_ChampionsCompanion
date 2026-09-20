import { setFilter, selectedFilters } from './browser-filter-helpers.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
try {
  await page.goto('http://localhost:4173');
  await page.locator('.pokemon-select').first().waitFor({ timeout: 45000 });
  assert.equal(await page.locator('#season option').first().innerText(), '[최신] M-6 (M-C)');
  assert.equal(await page.locator('#sort option[value=dex]').innerText(), '도감 번호순');
  await page.locator('#theme').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.reload();
  await page.locator('.pokemon-select').first().waitFor();
  assert.equal(await page.locator('#theme').inputValue(), 'dark');
  await page.locator('#ranking-filter').click();
  for (const id of ['season', 'sort']) {
    assert.deepEqual(
      await page
        .locator('#' + id)
        .evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]),
      [id === 'sort' ? 'rgb(32, 47, 55)' : 'rgb(25, 38, 45)', 'rgb(224, 234, 237)'],
    );
    assert.deepEqual(
      await page
        .locator('#' + id + ' option')
        .first()
        .evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]),
      ['rgb(25, 38, 45)', 'rgb(224, 234, 237)'],
    );
  }
  assert.match(await page.locator('#reverse-sort').innerText(), /오름차순/);
  assert.equal(
    await page.locator('#generation-filter [data-choice][value="8"]').getAttribute('data-label'),
    '8세대 (가라르·히스이)',
  );
  await setFilter(page, 'type-filter', 'Flying');
  await setFilter(page, 'generation-filter', '3');
  await page.locator('#filter-form button[type=submit]').click();
  assert.ok(await page.locator('[data-pokemon="salamence"]').count());
  assert.equal(await page.locator('[data-pokemon="garchomp"]').count(), 0);
  await page.locator('#sort').selectOption('dex');
  assert.equal(await page.locator('[data-pokemon="salamence"] .dex-number').innerText(), 'No.373');
  assert.equal(await page.locator('[data-pokemon="salamence"] .rank').innerText(), '01');
  await page.locator('#reverse-sort').click();
  assert.equal(await page.locator('#reverse-sort').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#reverse-sort').innerText(), /내림차순/);
  await page.screenshot({ path: 'test-results/dark-ranking.png' });
  await page.locator('[data-pokemon="salamence"]').click();
  assert.equal(
    await page.locator('[data-category="overview"]').getAttribute('aria-selected'),
    'true',
  );
  await page.locator('[data-form="salamencemega"]').waitFor();
  assert.equal(
    await page.locator('.detail-panel').evaluate(el => getComputedStyle(el).backgroundColor),
    'rgb(25, 38, 45)',
  );
  await page.locator('.hero-portrait').evaluate(img => img.decode());
  await page.locator('[data-form="salamencemega"]').click();
  assert.equal(await page.locator('#pokemon-title').innerText(), '메가보만다');
  assert.equal(await page.locator('.japanese-name').innerText(), 'メガボーマンダ');
  assert.match(await page.locator('.hero-portrait').getAttribute('src'), /champions\/10089\.png$/);
  await page.locator('.hero-portrait').evaluate(img => img.decode());
  await page.locator('[data-stat-mode="actual"]').click();
  assert.match(
    await page.locator('.actual-stats tbody tr').nth(1).innerText(),
    /216\s+197\s+165\s+148/,
  );
  assert.match(await page.locator('.dimensions').innerText(), /112.6/);
  assert.match(await page.locator('.matchup-group').first().innerText(), /얼음\s*×4/);
  await page.screenshot({ path: 'test-results/dark-reference.png', fullPage: true });
  await page.locator('[data-effect-id="aerilate"]').click();
  assert.match(await page.locator('#effect-body').innerText(), /비행/);
  await page.screenshot({ path: 'test-results/dark-effect.png' });
  await page.keyboard.press('Escape');
  await page.locator('[data-category="move"]').click();
  assert.equal(await page.locator('#pokemon-title').innerText(), '보만다');
  assert.ok((await page.locator('.stat-percent.percentage-prominent').count()) > 0);
  assert.match(await page.locator('.category-heading').innerText(), /상위 10개/);
  await page.locator('[data-effect-id="doubleedge"]').click();
  assert.match(await page.locator('.effect-names').innerText(), /Double-Edge.*すてみタックル/s);
  assert.match(await page.locator('.move-traits').innerText(), /접촉.*반동/s);
  await page.screenshot({ path: 'test-results/move-multilingual.png' });
  await page.locator('#close-effect').click();
  await page.screenshot({ path: 'test-results/adoption-contrast.png' });
  for (const row of await page.locator('.stat-percent').evaluateAll(els =>
    els.map(el => ({
      rate: parseFloat(el.textContent),
      emphasized: el.classList.contains('percentage-prominent'),
    })),
  ))
    assert.equal(row.emphasized, row.rate >= 10);
  await page.locator('[data-effect-id="earthquake"]').click();
  assert.match(await page.locator('#effect-body').innerText(), /그래스필드/);
  await page.locator('#close-effect').click();
  await page.locator('[data-category="held_item"]').click();
  await page
    .locator('.stat-row .item-image')
    .first()
    .evaluate(img => img.decode());
  await page.screenshot({ path: 'test-results/dark-items.png', fullPage: true });
  await page.locator('[data-effect-id="salamencite"]').click();
  assert.match(await page.locator('#effect-body').innerText(), /메가/);
  await page.locator('#close-effect').click();
  await page.locator('[data-category="ability"]').click();
  await page.locator('[data-effect-id="intimidate"]').click();
  assert.match(await page.locator('#effect-body').innerText(), /공격.*1단계/);
  await page.locator('#close-effect').click();
  await page.locator('[data-category="learnset"]').click();
  await page.locator('#learnset-search').fill('지진');
  assert.equal(await page.locator('.move-table tbody tr').count(), 1);
  await page.locator('#learnset-filter').click();
  await setFilter(page, 'learnset-type', 'Fire');
  await page.locator('#filter-form button[type=submit]').click();
  assert.equal(await page.locator('.move-table tbody tr').count(), 0);
  await page.locator('#learnset-search').fill('');
  await page.locator('#learnset-filter').click();
  await setFilter(page, 'learnset-type', '');
  await setFilter(page, 'learnset-category', 'Physical');
  await page.locator('#filter-form button[type=submit]').click();
  assert.ok((await page.locator('.move-table tbody tr').count()) > 5);
  await page.locator('#learnset-filter').click();
  await setFilter(page, 'learnset-trait', 'recoil');
  await page.keyboard.press('Escape');
  assert.ok((await page.locator('.move-table tbody tr').count()) > 5);
  await page.locator('#learnset-filter').click();
  assert.deepEqual(await selectedFilters(page, 'learnset-trait'), []);
  await setFilter(page, 'learnset-trait', 'recoil');
  await page.locator('#filter-form button[type=submit]').click();
  assert.ok(await page.locator('[data-effect-id="doubleedge"]').count());
  assert.equal(await page.locator('[data-effect-id="earthquake"]').count(), 0);
  assert.match(await page.locator('.active-filter-summary').last().innerText(), /반동/);
  await page.screenshot({ path: 'test-results/trait-filter.png' });
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('[data-category="stat_points"]').click();
  await page.locator('.spread-groups details').first().locator('summary').click();
  assert.ok(
    (await page.locator('.spread-groups details').first().locator('tbody tr').count()) >= 2,
  );
  await page.locator('[data-spread-mode="individual"]').click();
  assert.equal(await page.locator('.spread-groups').count(), 0);
  assert.ok((await page.locator('.spread-table tbody tr').count()) > 5);
  await page.locator('#theme').selectOption('light');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-category="overview"]').click();
  await page.screenshot({ path: 'test-results/desktop-reference.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#theme').selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.locator('[data-category="overview"]').click();
  await page.locator('[data-form="salamencemega"]').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'Reference UI passed: theme persistence/system, filters, mega stats, effects, learnset, grouping, 360px/390px/desktop, offline.',
  );
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(-3500));
  throw error;
} finally {
  await browser.close();
}
