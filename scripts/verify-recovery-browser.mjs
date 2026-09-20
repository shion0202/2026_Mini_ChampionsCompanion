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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let date = '18_09_2026',
  failSnapshot = false,
  failIndex = false;
const entries = {
  Bronzong: ['Steel', 'Psychic'],
  Dragonite: ['Dragon', 'Flying'],
  Bewear: ['Normal', 'Fighting'],
  Charizard: ['Fire', 'Flying'],
  Salamence: ['Dragon', 'Flying'],
  Pawmot: ['Electric', 'Fighting'],
};
const generatedAt = '2026-09-18T03:04:00Z';
await context.route('https://**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'championsbattledata.com') return route.abort();
  if (url.pathname === '/data/meta/index.json') {
    if (failIndex) return route.abort();
    return route.fulfill({
      json: {
        seasons: [{ season: 'M6', dates: [date], formats: ['Singles', 'Doubles'] }],
        pokemon: Object.fromEntries(
          Object.entries(entries).map(([name, types]) => [name, { name, types }]),
        ),
      },
    });
  }
  if (failSnapshot || !url.pathname.endsWith('/Singles.json'))
    return route.fulfill({ status: 503, body: 'Test outage' });
  return route.fulfill({
    json: {
      season: 'M6',
      date,
      format: 'Singles',
      generatedAt: date === '18_09_2026' ? generatedAt : '2026-09-19T05:06:00Z',
      pokemon: Object.fromEntries(
        Object.keys(entries).map((name, index) => [name, { position: index + 1 }]),
      ),
    },
  });
});
const select = async name => {
  if (await page.locator('#back').count()) await page.locator('#back').click();
  await page.locator('#search').fill(name);
  await page.locator('.pokemon-select').first().click();
  await page.locator('.reference-heading').waitFor();
};
const group = number => page.locator('.matchup-group').nth(number);
const refresh = async () => {
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
};
try {
  await mkdir('test-results', { recursive: true });
  await page.goto('http://localhost:4173');
  await page.locator('.pokemon-select').first().waitFor();
  await page.locator('#theme').selectOption('dark');

  assert.match(await page.locator('#season option').first().innerText(), /M-6 \(M-C\)/);
  assert.deepEqual(
    await page.locator('.header-actions > *').evaluateAll(items => items.map(el => el.id)),
    ['install', 'theme', 'about', 'refresh'],
  );
  await page.locator('#install').evaluate(el => (el.hidden = false));
  for (const width of [360, 390, 760, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const centered = await page.locator('#refresh').evaluate(el => {
      const b = el.getBoundingClientRect(),
        i = el.querySelector('svg').getBoundingClientRect();
      return Math.abs((b.top + b.bottom - i.top - i.bottom) / 2) < 2;
    });
    assert.equal(centered, true);
  }
  await page.locator('#install').evaluate(el => (el.hidden = true));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#ranking-filter').click();
  await setFilter(page, 'type-filter', 'Electric');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.pokemon-select').count(), 6);
  await page.locator('#ranking-filter').click();
  assert.deepEqual(await selectedFilters(page, 'type-filter'), []);
  await setFilter(page, 'type-filter', 'Electric');
  await page.locator('#filter-form button[type=submit]').click();
  assert.equal(await page.locator('.pokemon-select').count(), 1);
  await page.locator('#ranking-filter').click();
  await page.locator('#clear-filter').click();
  await page.locator('#filter-form button[type=submit]').click();
  assert.equal(await page.locator('.pokemon-select').count(), 6);
  await page.locator('.ranking-controls').screenshot({ path: 'test-results/compact-controls.png' });
  await page.locator('#ranking-filter').click();
  await page.waitForFunction(() => !document.querySelector('#gimmick-filter fieldset').disabled);
  await setFilter(page, 'gimmick-filter', 'mega');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.pokemon-select').count(), 6);
  await page.locator('#ranking-filter').click();
  assert.deepEqual(await selectedFilters(page, 'gimmick-filter'), []);
  await setFilter(page, 'gimmick-filter', 'mega');
  await page.screenshot({ path: 'test-results/gimmick-filter.png' });
  await page.locator('#filter-form button[type=submit]').click();
  assert.equal(await page.locator('.pokemon-select').count(), 3);
  assert.equal(await page.locator('[data-pokemon="pawmot"]').count(), 0);
  assert.match(await page.locator('#ranking-filter-summary').innerText(), /메가진화/);
  await page.locator('#ranking-filter').click();
  await setFilter(page, 'gimmick-filter', 'none');
  await page.locator('#filter-form button[type=submit]').click();
  assert.equal(await page.locator('.pokemon-select').count(), 3);
  assert.equal(await page.locator('[data-pokemon="salamence"]').count(), 0);
  await page.locator('#search').fill('보만다');
  await page.locator('#reset-filters').click();
  assert.equal(await page.locator('.pokemon-select').count(), 6);
  await select('보만다');
  await page.locator('[data-effect-id="intimidate"]').hover();
  await page.locator('.reference-abilities').screenshot({ path: 'test-results/effect-hover.png' });
  assert.equal(await page.locator('#defense-ability').count(), 0);
  assert.equal(await page.locator('.matchup-alternative').count(), 0);
  assert.match(await group(0).locator('.matchup').first().innerText(), /얼음\s*×4/);
  assert.equal(await page.locator('.neutral-types summary').innerText(), '1배 상성 보기');
  const gap = await page.evaluate(
    () =>
      document.querySelector('#detail').getBoundingClientRect().top -
      document.querySelector('.toolbar').getBoundingClientRect().bottom,
  );
  assert.ok(gap >= 15);
  await select('빠르모트');
  assert.equal(await page.locator('[data-matchup-ability="voltabsorb"]').count(), 1);
  assert.equal(await page.locator('[data-matchup-ability="naturalcure"]').count(), 0);
  assert.match(await page.locator('[data-matchup-type="Electric"]').innerText(), /×0.5.*축전.*×0/s);
  await select('동탁군');
  assert.match(await page.locator('[data-matchup-type="Ground"]').innerText(), /×2.*부유.*×0/s);
  assert.match(await page.locator('[data-matchup-type="Fire"]').innerText(), /×2.*내열.*×1/s);
  const height = async type =>
    page.locator(`[data-matchup-type="${type}"]`).evaluate(el => el.getBoundingClientRect().height);
  assert.ok((await height('Fire')) > (await height('Ghost')));
  await page.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'test-results/ability-defense.png', fullPage: true });
  await select('망나뇽');
  assert.equal(await page.locator('[data-matchup-ability="multiscale"]').count(), 0);
  assert.match(await group(0).innerText(), /얼음\s*×4/);
  await select('리자몽');
  await page.locator('[data-form="charizardmegax"]').click();
  assert.equal(await page.locator('#defense-ability').count(), 0);
  assert.match(await page.locator('.rank-pill').innerText(), /#4.*사용 순위/s);
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  const oldTimes = await page.locator('#current-source-times').textContent();
  const oldKey = 'champions:cache:v1:/data/meta/M6/18_09_2026/Singles.json';
  const oldCache = await page.evaluate(key => localStorage.getItem(key), oldKey);
  date = '19_09_2026';
  failSnapshot = true;
  await refresh();
  assert.match(await page.locator('#source-status').innerText(), /2026\.09\.18.*보관 자료/s);
  assert.match(await page.locator('#notice').innerText(), /2026\.09\.18의 이전 통계/);
  assert.equal(await page.locator('#current-source-times').textContent(), oldTimes);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), oldKey), oldCache);
  assert.match(await page.locator('.detail-source').innerText(), /2026\.09\.18/);
  await page.screenshot({ path: 'test-results/previous-statistics.png', fullPage: true });
  // A reload uses the NEW cached index and the OLD cached daily file.
  await page.reload();
  await page.locator('.reference-heading').waitFor();
  assert.match(await page.locator('#source-status').innerText(), /2026\.09\.18.*보관 자료/s);
  assert.equal(await page.locator('#current-source-times').textContent(), oldTimes);
  // Losing the stored index still allows the running session to recover.
  await page.evaluate(() => localStorage.removeItem('champions:cache:v1:/data/meta/index.json'));
  failIndex = true;
  await refresh();
  assert.equal(await page.locator('#current-source-times').textContent(), oldTimes);
  failIndex = false;
  await page.locator('[data-format="Doubles"]').click();
  await page.locator('#retry').waitFor();
  assert.equal(await page.locator('#source-status').innerText(), '자료 없음');
  await page.locator('[data-format="Singles"]').click();
  await page.locator('.reference-heading').waitFor();
  failSnapshot = false;
  await refresh();
  assert.match(await page.locator('#source-status').innerText(), /2026\.09\.19/s);
  assert.equal(await page.locator('#notice').isVisible(), false);
  assert.notEqual(await page.locator('#current-source-times').textContent(), oldTimes);
  assert.deepEqual(errors, []);
  console.log(
    'Recovery + ability UI passed: rollover outage, exact timestamp preservation, reload, missing index, format isolation, recovery, compact dialogs, type-specific comparison, header order, 360px.',
  );
} finally {
  await browser.close();
}
