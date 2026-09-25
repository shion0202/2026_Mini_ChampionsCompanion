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
// 이 화면은 통계를 쓰지 않는다. 외부 연결을 모두 막아 통계 장애와 무관하게
// 저장 기능만 검증한다.
await context.route('https://**/*', route => route.abort());

try {
  // 1. 빈 목록
  await page.goto('http://localhost:4173/#builds=sample');
  await page.locator('#builds .empty-state').waitFor({ state: 'visible' });

  // 2. 저장한 것이 새로고침 후에도 남는다
  await page.evaluate(() => {
    const doc = {
      samples: [
        {
          id: 'aaaaaaaaaaaaaaaa',
          name: '물리형 보만다',
          note: '스카프로 선공을 잡는다.',
          pokemon: 'salamence',
          form: null,
          ability: 'Intimidate',
          nature: 'adamant',
          points: [0, 32, 0, 0, 2, 32],
          moves: ['Dragon Claw', 'Earthquake', 'Dragon Dance', 'Roost'],
          altMoves: ['Fire Fang'],
          updatedAt: 0,
        },
      ],
      parties: [
        {
          id: 'p1p1p1p1p1p1p1p1',
          name: '스카프 선공 구축',
          note: '',
          members: ['aaaaaaaaaaaaaaaa', null, null, null, null, null],
          updatedAt: 0,
        },
      ],
      version: 1,
    };
    localStorage.setItem('champions:builds', JSON.stringify(doc));
  });
  await page.reload();
  await page.locator('#builds-rows').getByText('물리형 보만다').waitFor({ state: 'visible' });

  // 3. 검색
  await page.locator('#builds-search').fill('없는이름');
  await page.locator('#builds .empty-state').waitFor({ state: 'visible' });
  await page.locator('#builds-search').fill('');

  // 4. 파티 탭과 채운 자리 수
  await page.locator('[data-builds-tab="party"]').click();
  await page.locator('#builds-rows').getByText('스카프 선공 구축').waitFor({ state: 'visible' });
  assert.match(await page.locator('#builds-rows .builds-sub').first().innerText(), /1\/6/);

  // 5. 뒤로 가기가 이전 탭으로 돌아간다
  await page.goBack();
  assert.equal(
    await page.locator('[data-builds-tab="sample"]').getAttribute('aria-pressed'),
    'true',
  );

  // 6. 동기화 단추가 JSON 단추 자리(새로 만들기 옆)에 있다
  assert.deepEqual(
    await page
      .locator('.builds-buttons [data-sync]')
      .evaluateAll(els => els.map(e => e.dataset.sync)),
    ['enable', 'join'],
  );
  assert.equal(await page.locator('#builds-sync-status').innerText(), '이 기기에만 저장합니다.');

  await page.screenshot({ path: 'test-results/builds-mobile.png' });

  // 7. PC 폭과 다크 테마
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/builds-desktop-dark.png' });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
  );

  // 편집: 빈 값에서 만들어 저장한다
  await page.goto('http://localhost:4173/#builds=sample');
  await page.locator('#builds-rows').waitFor({ state: 'visible' });
  await page.locator('[data-builds-new="sample"]').click();
  await page.locator('[data-builds-form="sample"]').waitFor({ state: 'visible' });
  await page.locator('[data-builds-field="name"]').fill('검증용 샘플');
  await page.locator('[data-builds-species]').click();
  await page.locator('#picker-search').fill('보만다');
  await page.locator('[data-picker-value="Salamence"]').click();
  await page.locator('[data-builds-field="ability"]').selectOption('Intimidate');
  await page.locator('[data-builds-field="nature"]').selectOption('adamant');
  await page.locator('[data-builds-point="1"]').fill('32');
  await page.locator('[data-builds-save]').click();
  await page.locator('#builds-rows').getByText('검증용 샘플').waitFor({ state: 'visible' });

  // 저장한 것은 새로고침 후에도 남는다
  await page.reload();
  await page.locator('#builds-rows').getByText('검증용 샘플').waitFor({ state: 'visible' });

  // 이름을 비우면 저장을 막고 이유를 보여준다
  await page.locator('#builds-rows').getByText('검증용 샘플').click();
  await page.locator('[data-builds-field="name"]').fill('');
  await page.locator('[data-builds-save]').click();
  assert.match(await page.locator('[data-builds-errors]').innerText(), /이름을 입력하세요/);

  // 초안은 나갔다 돌아와도 남는다
  await page.locator('[data-builds-cancel]').click();
  await page.locator('#builds-rows').getByText('검증용 샘플').click();
  await page.locator('.builds-resume').waitFor({ state: 'visible' });

  await page.screenshot({ path: 'test-results/builds-editor.png' });

  assert.deepEqual(errors, []);
  console.log('Builds list, storage and JSON exchange passed.');
} finally {
  await browser.close();
}
