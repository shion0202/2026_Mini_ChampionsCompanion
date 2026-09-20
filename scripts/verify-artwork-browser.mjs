import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { megaSprite, itemSprite } from '../src/images.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.goto('http://localhost:4173/#pokemon=dragonite');
  await page.locator('[data-form="dragonitemega"]').waitFor({ timeout: 45000 });
  await page.locator('#theme').selectOption('dark');
  await page.locator('[data-form="dragonitemega"]').click();
  await page.locator('.hero-portrait').evaluate(img => img.decode());
  const urls = [
    'Salamence-Mega',
    'Dragonite-Mega',
    'Lucario-Mega-Z',
    'Raichu-Mega-X',
    'Raichu-Mega-Y',
    'Mewtwo-Mega-X',
  ]
    .map(megaSprite)
    .concat(['Dragoninite', 'Lucarionite Z', 'Life Orb'].map(itemSprite));
  const loaded = await page.evaluate(
    async urls =>
      Promise.all(
        urls.map(async src => {
          const img = new Image();
          img.src = src;
          await img.decode();
          return img.naturalWidth > 0;
        }),
      ),
    urls,
  );
  assert.ok(loaded.every(Boolean));
  await page.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'test-results/champions-mega-dragonite.png' });
  await page.locator('[data-category="held_item"]').click();
  await page.locator('[data-effect-id="dragoninite"]').click();
  await page.locator('.effect-item-art img').evaluate(img => img.decode());
  await page.screenshot({ path: 'test-results/gen9-item-dialog.png' });
  console.log('Champions/HOME renders and gen9 item images decoded successfully.');
} finally {
  await browser.close();
}
