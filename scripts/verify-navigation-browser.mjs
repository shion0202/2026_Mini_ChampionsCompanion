import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
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
const names = ['Salamence', 'Dragonite', 'Charizard'];
await context.route('https://**/*', async route => {
  if (!route.request().url().startsWith('https://championsbattledata.com/data/meta/'))
    return route.abort();
  const index = route.request().url().endsWith('index.json');
  return route.fulfill({
    json: index
      ? {
          seasons: [{ season: 'M6', dates: ['19_09_2026'], formats: ['Singles'] }],
          pokemon: Object.fromEntries(
            names.map(name => [name, { name, types: ['Dragon', 'Flying'] }]),
          ),
        }
      : {
          season: 'M6',
          date: '19_09_2026',
          format: 'Singles',
          pokemon: Object.fromEntries(
            names.map((name, i) => [
              name,
              {
                position: i + 1,
                teammate: names.filter(n => n !== name).map((n, j) => [n, j + 1]),
                move: [['Double-Edge', 70, 1]],
                held_item: [['Dragoninite', 90, 1]],
              },
            ]),
          ),
        },
  });
});
const choose = async id => {
  await page.locator(`[data-pokemon="${id}"]`).first().click();
  await page.locator('.reference-heading').waitFor();
};
const team = async id => {
  await page.locator('[data-category="teammate"]').click();
  await page.locator(`.teammate-row[data-pokemon="${id}"]`).click();
};
try {
  await page.goto('http://localhost:4173');
  await page.locator('.pokemon-select').first().waitFor();
  await choose('salamence');
  await team('dragonite');
  await team('charizard');
  await page.locator('#back').click();
  await page.waitForFunction(
    () => !document.body.classList.contains('detail-open'),
    {},
    { timeout: 3000 },
  );
  assert.equal(new URL(page.url()).hash, '');
  await choose('salamence');
  await team('dragonite');
  await page.locator('#previous-pokemon').click();
  await page.waitForFunction(
    () => document.querySelector('#pokemon-title')?.textContent === '보만다',
  );
  await page.goForward();
  await page.waitForFunction(
    () => document.querySelector('#pokemon-title')?.textContent === '망나뇽',
  );
  await page.locator('.brand').click();
  assert.equal(new URL(page.url()).hash, '');
  await page.goto('http://localhost:4173/#pokemon=salamence');
  await page.locator('.reference-heading').waitFor();
  assert.equal(await page.locator('#previous-pokemon').isVisible(), false);
  await page.locator('#back').click();
  assert.equal(new URL(page.url()).hash, '');
  await choose('salamence');
  await page.locator('#theme').selectOption('dark');
  await page.locator('[data-category="move"]').click();
  await page.locator('[data-effect-id="doubleedge"]').click();
  const gap = await page.evaluate(
    () =>
      document.querySelector('.effect-names').getBoundingClientRect().top -
      document.querySelector('#effect-title').getBoundingClientRect().bottom,
  );
  assert.ok(gap >= 0 && gap <= 8, `Name gap ${gap}`);
  assert.equal(
    await page.locator('.move-traits').evaluate(el => getComputedStyle(el).borderBottomStyle),
    'solid',
  );
  await page.screenshot({ path: 'test-results/refined-move-dialog.png' });
  await page.keyboard.press('Escape');
  await page.locator('[data-category="held_item"]').click();
  await page.locator('[data-effect-id="dragoninite"]').click();
  assert.equal(
    await page
      .locator('.effect-item-art')
      .evaluate(
        el =>
          el.getBoundingClientRect().bottom <=
          document.querySelector('#effect-title').getBoundingClientRect().top,
      ),
    true,
  );
  await page.locator('.effect-item-art .item-fallback').waitFor({ state: 'visible' });
  await page.screenshot({ path: 'test-results/refined-item-fallback.png' });
  assert.deepEqual(errors, []);
  console.log('Navigation and dialog regression passed.');
} finally {
  await browser.close();
}
