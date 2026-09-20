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
const nature = (name, percent, up, down, rank) => ({ name, percent, up, down, rank });
const spread = (percent, spe, rank) => ({
  rank,
  name: '',
  percent,
  points: [0, 32, 0, 0, 4, spe],
});
const usage = [
  // 빠른 어태커. 상승 성격과 스피드 투자를 쓰므로 최속과 준속만 나온다.
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
      stat_alignment: [
        nature('Jolly', 70.2, 'Speed', 'Sp. Atk', 1),
        nature('Adamant', 24.1, 'Attack', 'Sp. Atk', 2),
      ],
      stat_points: [spread(80.5, 32, 1), spread(14.2, 32, 2)],
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
      stat_alignment: [nature('Modest', 61.3, 'Sp. Atk', 'Attack', 1)],
      stat_points: [spread(58.4, 32, 1)],
    },
  },
  // 스피드 종족값 30에 상위 15위. 느려도 기준선으로 잡혀야 한다. 스피드를 내리는
  // 성격 45.2%에 미투자 배치 84.6%라 무보정과 최저만 나온다.
  {
    name: 'Snorlax',
    id: 'snorlax',
    rank: 9,
    categories: {
      move: [],
      held_item: [{ name: 'Leftovers', rank: 1, percent: 55 }],
      ability: [{ name: 'Thick Fat', rank: 1, percent: 80 }],
      stat_alignment: [
        nature('Adamant', 40.1, 'Attack', 'Sp. Atk', 1),
        nature('Quiet', 30.4, 'Sp. Atk', 'Speed', 2),
        nature('Relaxed', 14.8, 'Defense', 'Speed', 3),
      ],
      stat_points: [spread(84.6, 0, 1), spread(9.2, 32, 2)],
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

test('the environment marker follows rank alone, slow Pokemon included', () => {
  const lines = battleSpeedRows(reference, locale, usage, {});
  assert.ok(
    lines.filter(line => line.rank === 1).every(line => line.prominent),
    '1위는 표시된다',
  );
  // 느려도 상위권이면 그 자체가 환경의 기준선이다.
  const slow = lines.filter(line => line.id === 'snorlax');
  assert.ok(slow.length, '잠만보 줄이 없다');
  assert.ok(slow[0].base < 70, '픽스처가 저속이 아니다');
  assert.ok(
    slow.every(line => line.prominent),
    '15위 안이면 스피드가 느려도 표시한다',
  );
  assert.ok(
    lines.filter(line => line.rank === 40).every(line => !line.prominent),
    '15위 밖은 표시하지 않는다',
  );
});

test('presets follow the nature and the point spread the Pokemon actually uses', () => {
  const lines = battleSpeedRows(reference, locale, usage, {});
  const presetsOf = id => new Set(lines.filter(line => line.id === id).map(line => line.preset));
  // 겁쟁이 70.2%에 투자 배치 94.7%. 하락 성격도 미투자 배치도 기준에 못 미친다.
  assert.deepEqual([...presetsOf('meowscarada')].sort(), ['준속', '최속']);
  // 냉정 30.4% + 무사태평 14.8% = 45.2%, 미투자 배치 84.6%.
  assert.deepEqual([...presetsOf('snorlax')].sort(), ['무보정', '최저']);
});

test('the threshold is inclusive, matching the move and item filter', () => {
  const [meowscarada] = usage;
  // 무보정 성격과 미투자 배치를 충분히 두어 무보정 줄이 남게 한다. 그래야 최저만
  // 임계값을 오가고, 아무 축도 닿지 않아 네 줄을 모두 남기는 폴백과 섞이지 않는다.
  const at = percent => [
    {
      ...meowscarada,
      categories: {
        ...meowscarada.categories,
        stat_alignment: [
          nature('Adamant', 62.4, 'Attack', 'Sp. Atk', 1),
          nature('Quiet', percent, 'Sp. Atk', 'Speed', 2),
        ],
        stat_points: [spread(90, 0, 1)],
      },
    },
  ];
  const presets = value =>
    new Set(battleSpeedRows(reference, locale, at(value), {}).map(line => line.preset));
  assert.ok(presets(10).has('최저'), '정확히 10%도 채용으로 본다');
  assert.ok(!presets(9.9).has('최저'), '10% 미만은 쓰지 않는다');
});

test('a Pokemon with no spread statistics keeps every preset', () => {
  const bare = [
    { ...usage[0], categories: { ...usage[0].categories, stat_alignment: [], stat_points: [] } },
  ];
  const presets = new Set(battleSpeedRows(reference, locale, bare, {}).map(line => line.preset));
  // 근거가 없다는 것은 쓰지 않는다는 뜻이 아니다. 조용히 지우지 않는다.
  assert.deepEqual([...presets].sort(), ['무보정', '준속', '최속', '최저']);
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

test('equal speed values share one row instead of repeating the number', () => {
  const at = (label, value, base) => ({
    label,
    base,
    preset: '준속',
    value,
    prominent: label === '메가한카리아스Z',
    condition: '스케일샷 (S+1)',
    effect: 'S+1',
    effectNote: null,
    effectName: '스케일샷',
    percent: 17.8,
    sprite: null,
  });
  const markup = renderSpeedLines([
    at('메가한카리아스Z', 304, 151),
    at('메가번치코', 304, 100),
    at('파라블레이즈', 300, 85),
  ]);
  assert.equal(markup.match(/class="speed-value"/g).length, 2, '304가 두 번 적히면 안 된다');
  assert.equal(markup.match(/class="speed-group[ "]/g).length, 2);
  assert.equal(markup.match(/class="speed-line"/g).length, 3, '항목은 셋 다 남아야 한다');
  assert.match(markup, /<span class="speed-value">304<\/span>/);
  // 묶음 안에 한 마리라도 상위권이면 그 값이 환경 기준선이다.
  assert.match(markup, /class="speed-group speed-prominent"[^]*?304/);
  // [0]은 <ol> 여는 부분이므로 묶음은 1번부터다.
  const [, first, second] = markup.split('<li class="speed-group');
  assert.ok(first.includes('speed-prominent'), '304 묶음은 강조된다');
  assert.ok(!second.includes('speed-prominent'), '300 묶음은 강조되지 않는다');
});
