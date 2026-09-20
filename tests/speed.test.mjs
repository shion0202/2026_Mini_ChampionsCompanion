import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocale } from '../src/locale.js';
import { speedRows, speedGroups, battleSpeedRows } from '../src/speed.js';
import { renderSpeedRows, renderSpeedLines } from '../src/speed-view.js';

const read = file =>
  readFile(new URL(`../public/data/${file}.json`, import.meta.url)).then(JSON.parse);
const [reference, ko] = await Promise.all(['reference', 'ko'].map(read));
const locale = createLocale(ko);

test('Champions speed ranges use points and nature with flooring, including Mega stats', () => {
  const rows = speedRows(reference, locale, { query: '보만다' });
  const normal = rows.find(r => r.id === 'salamence');
  const mega = rows.find(r => r.id === 'salamencemega');
  assert.deepEqual(normal.values, [167, 152, 120, 108]);
  assert.deepEqual(mega.values, [189, 172, 140, 126]);
  assert.equal(normal.base, 100);
  assert.equal(mega.base, 120);
});

test('only forms with Champions reference data are included; filters combine', () => {
  const rows = speedRows(reference, locale);
  assert.ok(
    rows.every(row => /[가-힣]/.test(row.label)),
    'all displayed forms have Korean names',
  );
  assert.ok(rows.some(r => r.id === 'salamencemega'));
  assert.ok(!rows.some(r => r.id === 'regieleki'));
  assert.ok(!rows.some(r => ['pikachucosplay', 'greninjabond'].includes(r.id)));
  assert.ok(rows.some(r => r.id === 'gourgeistsmall'));
  assert.equal(rows.find(r => r.id === 'meowsticfmega').label, '메가냐오닉스 (암컷)');
  assert.ok(
    !speedRows(reference, locale, { includeMega: false }).some(r => r.id === 'meowsticfmega'),
  );
  assert.ok(
    speedRows(reference, locale, { includeMega: false }).every(r => !r.forme.startsWith('Mega')),
  );
  assert.equal(
    speedRows(reference, locale, { query: 'ㅂㅁㄷ', type: 'Flying', includeMega: false }).length,
    1,
  );
  assert.equal(speedRows(reference, locale, { query: 'Salamence', type: 'Water' }).length, 0);
});

test('groups merge equal speed and each ordering uses the selected numeric value', () => {
  const rows = speedRows(reference, locale);
  const groups = speedGroups(rows);
  assert.equal(
    groups.reduce((n, g) => n + g.rows.length, 0),
    rows.length,
  );
  assert.equal(new Set(groups.map(g => g.value)).size, groups.length);
  assert.ok(groups.every(g => g.rows.every(r => r.base === g.value)));
  for (const preset of [0, 1, 2, 3]) {
    for (const ascending of [false, true]) {
      const sorted = speedRows(reference, locale, { mode: 'actual', preset, ascending });
      assert.ok(
        sorted.every(
          (row, i) =>
            !i ||
            (ascending
              ? sorted[i - 1].values[preset] <= row.values[preset]
              : sorted[i - 1].values[preset] >= row.values[preset]),
        ),
      );
    }
  }
});

test('views label tiers, every preset column, empty results and escape names', () => {
  const rows = speedRows(reference, locale, { query: '보만다' });
  assert.match(renderSpeedRows(rows, { mode: 'base' }).replace(/<[^>]*>/g, ''), /100족/);
  const actual = renderSpeedRows(rows, { mode: 'actual' });
  for (const label of ['최속', '준속', '무보정', '최저']) assert.match(actual, new RegExp(label));
  // 네 열이 같은 종족값에서 나와 정렬 순서가 같으므로 기준 열을 고르지 않는다.
  assert.ok(!actual.includes('speed-selected'), '기준 열 표시가 남아 있다');
  assert.ok(!actual.includes('aria-sort'), '정렬 기준이 없는데 정렬 표시가 남아 있다');
  assert.match(renderSpeedRows([], { mode: 'base' }), /조건에 맞는 포켓몬이 없습니다/);
  assert.ok(
    renderSpeedRows([{ ...rows[0], label: '<script>' }], { mode: 'base' }).includes(
      '&lt;script&gt;',
    ),
  );
});

// 채용률 10% 미만은 무시하고, 효과는 서로 곱하지 않는다. 사용률 상위를 대상으로
// 실제로 나올 수 있는 스피드 라인만 만든다.
const usage = [
  {
    name: 'Meowscarada',
    id: 'meowscarada',
    rank: 1,
    categories: {
      move: [
        { name: 'Trailblaze', rank: 1, percent: 42 },
        { name: 'Agility', rank: 2, percent: 4 },
      ],
      held_item: [{ name: 'Choice Scarf', rank: 1, percent: 31 }],
      ability: [{ name: 'Protean', rank: 1, percent: 88 }],
    },
  },
  {
    name: 'Venusaur',
    id: 'venusaur',
    rank: 40,
    categories: {
      move: [],
      held_item: [{ name: 'Venusaurite', rank: 1, percent: 64 }],
      ability: [{ name: 'Overgrow', rank: 1, percent: 12 }],
    },
  },
];

test('battle lines apply adopted effects only, never multiplying them together', () => {
  const lines = battleSpeedRows(reference, locale, usage, {});
  const meow = lines.filter(line => line.base === 123 && line.preset === '최속');
  const conditions = meow.map(line => line.condition);
  assert.ok(conditions.includes('효과 미적용'));
  assert.ok(
    conditions.some(text => text.startsWith('풀베기') || /S\+1/.test(text)),
    `채용률 42%인 기술이 빠졌다: ${conditions.join(' / ')}`,
  );
  assert.ok(
    conditions.some(text => /1\.5배/.test(text)),
    '구애스카프가 빠졌다',
  );
  assert.ok(!conditions.some(text => /고속이동|S\+2/.test(text)), '채용률 4%는 쓰지 않는다');
  // 서로 다른 효과를 겹쳐 만든 줄이 없어야 한다.
  const base = meow.find(line => line.condition === '효과 미적용').value;
  for (const line of meow)
    assert.ok(line.value <= base * 2, `${line.condition}에서 효과가 겹쳐 계산됐다`);
});

test('a mega stone adopted above the threshold produces the mega form with its own ability', () => {
  const lines = battleSpeedRows(reference, locale, usage, {});
  assert.ok(
    lines.some(line => line.id === 'venusaurmega'),
    '이상해꽃 메가 폼이 없다',
  );
  const chlorophyll = lines.filter(
    line => line.id === 'venusaurmega' && /엽록소/.test(line.condition),
  );
  assert.equal(chlorophyll.length, 0, '메가 이상해꽃의 특성은 두꺼운지방이라 엽록소가 없다');
  // 메가는 스톤 채용률을 근거로 삼고, 그 사실을 기록한다.
  const mega = lines.find(line => line.id === 'venusaurmega' && line.percent !== null);
  if (mega) assert.ok(mega.evidence, '메가 특성 줄은 근거를 남겨야 한다');
});

test('the environment marker follows rank and base speed together', () => {
  const lines = battleSpeedRows(reference, locale, usage, {});
  assert.ok(
    lines.some(line => line.rank === 1 && line.prominent),
    '1위 고속 포켓몬은 표시된다',
  );
  assert.ok(
    lines.filter(line => line.rank === 40).every(line => !line.prominent),
    '15위 밖은 표시하지 않는다',
  );
});

test('battle lines render the value, the badge, the sprite and the effect source', () => {
  const markup = renderSpeedLines([
    {
      label: '오롱털<b>',
      base: 120,
      preset: '최속',
      value: 378,
      prominent: true,
      condition: '경파 (도구 소모 후, 2배)',
      effect: '2배',
      effectNote: '도구 소모 후',
      effectName: '경파',
      percent: 22,
      sprite: 'https://example.com/a.png?x=1&y=2',
    },
  ]);
  assert.match(markup, /speed-prominent/);
  assert.match(markup, /<span class="speed-value">378<\/span>/);
  assert.match(markup, /speed-preset">최속</);
  assert.match(markup, /120족/);
  assert.match(markup, /speed-effect">2배</);
  assert.match(markup, /경파 · 도구 소모 후/);
  assert.match(markup, /22%/);
  assert.match(markup, /<img class="portrait speed-portrait"/);
  assert.ok(!markup.includes('<b>'), '이름은 이스케이프되어야 한다');
  assert.match(markup, /x=1&amp;y=2/, '주소도 이스케이프되어야 한다');
  assert.match(renderSpeedLines([]), /조건에 맞는 포켓몬이 없습니다/);
});

test('base and actual views now carry the ranking sprite', () => {
  const rows = speedRows(reference, locale, { query: '보만다' }, null);
  assert.match(renderSpeedRows(rows, { mode: 'base' }), /speed-mon/);
  assert.match(renderSpeedRows(rows, { mode: 'actual' }), /speed-mon/);
  // 이미지가 없는 항목도 자리를 지켜야 줄이 흔들리지 않는다.
  assert.match(renderSpeedRows(rows, { mode: 'base' }), /no-portrait|speed-portrait/);
});
