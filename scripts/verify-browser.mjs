// Optional browser verification: set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE.
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
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
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
try {
  await page.goto('http://localhost:4173');
  await page.locator('.pokemon-select').first().waitFor({ timeout: 45000 });
  assert.equal(await page.locator('.pokemon-select').count(), 30);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.pokemon-row img')]
      .slice(0, 3)
      .every(img => img.complete && img.naturalWidth > 0),
  );
  await page.screenshot({ path: 'test-results/mobile-ranking.png' });
  await page.locator('#search').fill('ㅂㅁㄷ');
  await page.locator('[data-pokemon="salamence"]').click();
  assert.match(await page.locator('#pokemon-title').innerText(), /보만다/);
  for (const category of ['move', 'held_item', 'stat_alignment', 'ability']) {
    await page.locator(`[data-category="${category}"]`).click();
    assert.ok((await page.locator('.stat-row').count()) > 0);
  }
  await page.locator('.hero-favorite').click();
  assert.equal(await page.locator('.hero-favorite').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-category="stat_points"]').click();
  assert.equal(await page.locator('.spread-table tbody tr').first().locator('td').count(), 7);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/mobile-detail.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-category="teammate"]').click();
  assert.equal(await page.locator('.stat-percent').count(), 0);
  await page.locator('#back').click();
  await page.locator('#search').waitFor({ state: 'visible' });
  await page.locator('#search').fill('');
  await page.locator('#favorites-filter').click();
  assert.equal(await page.locator('.pokemon-select').count(), 1);
  await page.locator('#favorites-filter').click();
  await page.locator('[data-format="Doubles"]').click();
  await page.locator('.pokemon-select').first().waitFor();
  console.log('Doubles leader:', await page.locator('.pokemon-select').first().innerText());
  await page.locator('#season').selectOption('M5');
  await page.locator('.pokemon-select').first().waitFor();
  assert.match(await page.locator('#source-status').innerText(), /資料|자료/);
  await page.locator('.pokemon-select').first().click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  await page.reload();
  await page.locator('.pokemon-select').first().waitFor();
  console.log(
    'Offline reload:',
    await page.locator('#source-status').innerText(),
    'Notice:',
    await page.locator('#notice').textContent(),
  );
  assert.match(await page.locator('#source-status').innerText(), /보관 자료/);
  assert.equal(await page.locator('#notice').isVisible(), true);
  assert.deepEqual(errors, []);
  const fresh = await browser.newContext({ serviceWorkers: 'block' });
  await fresh.route('https://championsbattledata.com/**', route => route.abort());
  const empty = await fresh.newPage();
  await empty.goto('http://localhost:4173');
  await empty.locator('#retry').waitFor();
  assert.equal(await empty.locator('.pokemon-select').count(), 0);
  await fresh.close();
  console.log('Browser verification passed');
} catch (error) {
  console.error('Page state:', (await page.locator('body').innerText()).slice(0, 4000));
  throw error;
} finally {
  await browser.close();
}
