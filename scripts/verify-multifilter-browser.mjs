import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { setFilter, selectedFilters } from './browser-filter-helpers.mjs';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const species = {
  Gengar: ['Ghost', 'Poison'],
  Lopunny: ['Normal'],
  'Zoroark-Hisui': ['Normal', 'Ghost'],
  Salamence: ['Dragon', 'Flying'],
};
await context.route('https://**/*', async route => {
  if (!route.request().url().startsWith('https://championsbattledata.com/data/meta/'))
    return route.abort();
  const index = route.request().url().endsWith('index.json');
  return route.fulfill({
    json: index
      ? {
          seasons: [{ season: 'M6', dates: ['20_09_2026'], formats: ['Singles'] }],
          pokemon: Object.fromEntries(
            Object.entries(species).map(([name, types]) => [name, { name, types }]),
          ),
        }
      : {
          season: 'M6',
          date: '20_09_2026',
          format: 'Singles',
          pokemon: Object.fromEntries(
            Object.keys(species).map((name, i) => [name, { position: i + 1 }]),
          ),
        },
  });
});
const open = () => page.locator('#ranking-filter').click();
const apply = () => page.locator('#filter-form button[type=submit]').click();
const ids = () =>
  page.locator('.pokemon-select').evaluateAll(rows => rows.map(row => row.dataset.pokemon));
try {
  await page.goto('http://localhost:4173');
  await page.locator('.pokemon-select').first().waitFor();
  await page.locator('#theme').selectOption('dark');
  await open();
  await page.waitForFunction(() => !document.querySelector('#gimmick-filter fieldset').disabled);
  assert.equal(await page.locator('#gimmick-filter [data-group-summary]').innerText(), '전체');
  await setFilter(page, 'generation-filter', ['1', '4']);
  await apply();
  assert.deepEqual(await ids(), ['gengar', 'lopunny']);
  assert.match(await page.locator('#ranking-filter-summary').innerText(), /1세대 또는 4세대/);
  await open();
  await setFilter(page, 'generation-filter', ['1', '4'], 'and');
  await page.keyboard.press('Escape');
  assert.deepEqual(await ids(), ['gengar', 'lopunny']);
  await open();
  assert.equal(await page.locator('#generation-filter input[value=or]').isChecked(), true);
  await setFilter(page, 'generation-filter', ['1', '4'], 'and');
  await apply();
  assert.deepEqual(await ids(), []);
  await page.locator('#reset-filters').click();
  assert.equal((await ids()).length, 4);
  await open();
  await setFilter(page, 'type-filter', ['Normal', 'Ghost'], 'and');
  assert.ok(
    await page.locator('#type-filter').evaluate(el => el.scrollHeight <= el.clientHeight + 1),
  );
  assert.ok(await page.locator('#filter-fields').evaluate(el => el.scrollHeight > el.clientHeight));
  await page.locator('#filter-dialog').evaluate(el => (el.scrollTop = 0));
  await page.screenshot({ path: 'test-results/type-and-filter.png' });
  await apply();
  assert.deepEqual(await ids(), ['zoroarkhisui']);
  assert.match(await page.locator('#ranking-filter-summary').innerText(), /노말 그리고 고스트/);
  await open();
  await page.locator('#clear-filter').click();
  await apply();
  assert.equal((await ids()).length, 4);
  await page.locator('[data-pokemon="salamence"]').click();
  await page.locator('.reference-heading').waitFor();
  await page.locator('[data-category="learnset"]').click();
  await page.locator('#learnset-filter').click();
  await setFilter(page, 'learnset-type', ['Normal', 'Dragon']);
  await setFilter(page, 'learnset-category', ['Physical', 'Special']);
  await setFilter(page, 'learnset-trait', ['contact', 'recoil'], 'and');
  await apply();
  assert.equal(await page.locator('[data-effect-id="doubleedge"]').count(), 1);
  assert.equal(await page.locator('[data-effect-id="dragonclaw"]').count(), 0);
  assert.match(await page.locator('.active-filter-summary').last().innerText(), /접촉 그리고 반동/);
  await page.locator('#learnset-filter').click();
  await setFilter(page, 'learnset-trait', ['contact', 'recoil'], 'or');
  await apply();
  assert.equal(await page.locator('[data-effect-id="dragonclaw"]').count(), 1);
  await page.locator('#learnset-filter').click();
  await page.locator('#clear-filter').click();
  await page.keyboard.press('Escape');
  await page.locator('#learnset-filter').click();
  assert.deepEqual(await selectedFilters(page, 'learnset-trait'), ['contact', 'recoil']);
  await setFilter(page, 'learnset-trait', ['contact', 'recoil'], 'and');
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#filter-dialog').evaluate(el => (el.scrollTop = 0));
  await page.screenshot({ path: 'test-results/trait-and-filter.png' });
  await page.locator('#clear-filter').click();
  await apply();
  assert.equal(await page.locator('.active-filter-summary').count(), 1); // Ranking summary remains in its hidden panel.
  assert.ok((await page.locator('.move-table tbody tr').count()) > 40);
  assert.deepEqual(errors, []);
  console.log(
    'Per-group AND/OR passed: generation, dual types, traits, cancel, reset, empty conditions, 360px/desktop.',
  );
} finally {
  await browser.close();
}
