import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trendPoints,
  positionsOf,
  rankSeries,
  rankOf,
  createTrendStore,
  dateLabel,
} from '../src/trends.js';

// normalizeIndex가 만드는 모양: 최신 시즌이 앞, 날짜도 최신이 앞.
const seasons = [
  { season: 'M6', dates: ['25_09_2026', '24_09_2026', '11_09_2026'], formats: ['Singles'] },
  { season: 'M5', dates: ['10_09_2026'], formats: ['Singles'] },
  { season: 'M4', dates: ['05_08_2026'], formats: ['Singles'] },
  { season: 'M3', dates: ['08_07_2026'], formats: ['Singles'] },
  { season: 'M2', dates: ['17_06_2026'], formats: ['Singles'] },
  { season: 'M1', dates: ['13_05_2026'], formats: ['Singles'] },
];

test('regulations use the final day of their last season', () => {
  assert.deepEqual(trendPoints(seasons, 'regulation'), [
    { season: 'M2', date: '17_06_2026', label: 'M-A' },
    { season: 'M5', date: '10_09_2026', label: 'M-B' },
    { season: 'M6', date: '25_09_2026', label: 'M-C' },
  ]);
  // 표에 없는 새 시즌은 추정하지 않는다.
  const withNew = [{ season: 'M7', dates: ['01_10_2026'], formats: [] }, ...seasons];
  assert.equal(trendPoints(withNew, 'regulation').length, 3);
});

test('seasons use their final day, oldest first', () => {
  assert.deepEqual(
    trendPoints(seasons, 'season').map(p => [p.label, p.date]),
    [
      ['M1', '13_05_2026'],
      ['M2', '17_06_2026'],
      ['M3', '08_07_2026'],
      ['M4', '05_08_2026'],
      ['M5', '10_09_2026'],
      ['M6', '25_09_2026'],
    ],
  );
});

test('the current season is every day of the newest season, oldest first', () => {
  assert.deepEqual(
    trendPoints(seasons, 'current').map(p => p.label),
    ['9/11', '9/24', '9/25'],
  );
  assert.equal(dateLabel('05_08_2026'), '8/5');
  assert.deepEqual(trendPoints([], 'season'), []);
});

test('only positions are kept from a snapshot', () => {
  const positions = positionsOf({
    pokemon: {
      Salamence: { position: 1, move: [] },
      Broken: { position: 'x' },
      Garchomp: { position: 2 },
    },
  });
  assert.deepEqual(
    [...positions],
    [
      ['Salamence', 1],
      ['Garchomp', 2],
    ],
  );
  assert.equal(positionsOf({}), null);
  assert.equal(positionsOf(null), null);
});

const at = entries => new Map(entries);

test('series include anyone inside the limit at some point, sorted by the last rank', () => {
  const list = [
    at([
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 9],
    ]),
    at([
      ['A', 2],
      ['B', 1],
      ['D', 3],
      ['C', 7],
    ]),
  ];
  const series = rankSeries(list, 3);
  assert.deepEqual(
    series.map(s => [s.name, s.ranks]),
    [
      ['B', [2, 1]],
      ['A', [1, 2]],
      ['D', [null, 3]],
      ['C', [3, null]],
    ],
    '한계 밖과 자료 없음은 null이다',
  );
  // 불러오지 못한 시점(null)은 빈칸이다.
  assert.deepEqual(rankSeries([null, at([['A', 1]])], 3), [{ name: 'A', ranks: [null, 1] }]);
});

test('a single pokemon keeps its real rank beyond the limit', () => {
  assert.deepEqual(rankOf([at([['A', 150]]), null, at([])], 'A'), [150, null, null]);
});

test('the store fetches each snapshot once and forgets failures', async () => {
  const calls = [];
  let fail = true;
  const store = createTrendStore(async path => {
    calls.push(path);
    if (path.includes('M1') && fail) throw new Error('down');
    return { pokemon: { A: { position: 1 } } };
  });
  const point = { season: 'M2', date: '17_06_2026' };
  const [one, two] = await Promise.all([store.get(point, 'Singles'), store.get(point, 'Singles')]);
  assert.equal(one, two);
  assert.deepEqual(calls, ['/data/meta/M2/17_06_2026/Singles.json']);
  await store.get(point, 'Doubles');
  assert.equal(calls.length, 2, '형식이 다르면 다른 자료다');
  const failed = { season: 'M1', date: '13_05_2026' };
  assert.equal(await store.get(failed, 'Singles'), null);
  fail = false;
  assert.equal((await store.get(failed, 'Singles')).get('A'), 1, '실패는 다시 받는다');
});

test('the small chart labels only the ends and the best and worst ranks once', async () => {
  const { miniRankChart } = await import('../src/trends-view.js');
  const points = Array.from({ length: 12 }, (_, i) => ({ label: `9/${i + 1}` }));
  const flat = miniRankChart(points, Array(12).fill(1));
  assert.equal(flat.match(/1위/g).length, 2, '처음과 끝만');
  const moving = miniRankChart(points, [5, 4, 3, 1, 2, 2, 3, 9, 4, 4, 4, 6]);
  assert.deepEqual(moving.match(/\d+위/g), ['5위', '1위', '9위', '6위']);
  assert.ok(miniRankChart(points.slice(0, 3), [null, null, 2]).includes('순위 밖'));
  assert.ok(miniRankChart(points, Array(12).fill(null)).includes('순위 기록이 없습니다'));
});
