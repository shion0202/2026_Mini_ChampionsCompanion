// Render snapshots for the ranking and detail markup that app.js writes into the DOM.
// These functions were split out of app.js so they can be checked without a browser;
// app.js itself is still only reachable through scripts/verify-*-browser.mjs.
//
// Update after an intentional markup change, then review the diff:
//   npm run test:snapshots
import test, { snapshot } from 'node:test';
import {
  fmtTime,
  typeBadges,
  portrait,
  seasonOptions,
  sourceChip,
  sourceTimes,
  rankingFilterButton,
  loadingState,
  errorState,
  rankingEmpty,
  rankingRows,
  heroMarkup,
  detailPlaceholder,
  detailWaiting,
  detailShell,
  referenceStatus,
  categoryHeader,
  categoryEmpty,
  statRows,
  groupSummary,
  filterGroup,
  filterHelp,
  rankingFilterFooter,
} from '../src/app-view.js';

snapshot.setDefaultSnapshotSerializers([
  value => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)),
]);

// Stubs, not the real dictionaries: this suite checks markup, and locale.test.mjs
// already covers how names are resolved.
const locale = { label: (kind, name) => `${kind}:${name}` };
const reference = { move: { roost: { label: '로스트' } } };
const list = [
  { id: 'garchomp', name: 'Garchomp', label: '한카리아스', rank: 2, dex: 445, types: ['Dragon'] },
];
const salamence = {
  id: 'salamence',
  name: 'Salamence',
  label: '보만다',
  rank: 1,
  dex: 373,
  types: ['Dragon', 'Flying'],
  sprite: 'https://example.test/a b&c.png',
};
const noSprite = { id: 'raichu', name: 'Raichu', label: '라이츄', rank: 2, dex: 26, types: [] };

test('fmtTime renders KST and never guesses at a missing time', t => {
  t.assert.snapshot(
    [null, undefined, '', 'not a date', '2026-09-18T09:00:00Z', 0].map(
      v => `${v} -> ${fmtTime(v)}`,
    ),
  );
});
test('typeBadges: two types, empty and missing', t => {
  t.assert.snapshot([typeBadges(['Dragon', 'Flying']), typeBadges([]), typeBadges(undefined)]);
});
test('portrait escapes the sprite url and falls back without one', t => {
  t.assert.snapshot([
    portrait(salamence),
    portrait(salamence, 'hero-portrait'),
    portrait(noSprite),
  ]);
});
test('seasonOptions marks the newest season and appends known regulations', t => {
  t.assert.snapshot(
    seasonOptions([{ season: 'M6' }, { season: 'M5' }, { season: 'M99' }], {
      M6: 'M-C',
      M5: 'M-B',
    }),
  );
});
test('sourceChip distinguishes fresh from archived data', t => {
  t.assert.snapshot([
    sourceChip({ stale: false, date: '18_09_2026' }),
    sourceChip({ stale: true, date: '18_09_2026' }),
  ]);
});
test('sourceTimes keeps the three timestamps separate', t => {
  t.assert.snapshot(
    sourceTimes({ date: '18_09_2026', generatedAt: '2026-09-18T09:00:00Z', fetchedAt: null }),
  );
});
test('rankingFilterButton shows a badge only when filters are active', t => {
  t.assert.snapshot([rankingFilterButton(0), rankingFilterButton(3)]);
});
test('loadingState and the two placeholders', t => {
  t.assert.snapshot([loadingState('통계를 불러오는 중'), detailPlaceholder(), detailWaiting()]);
});
test('errorState escapes the reported message', t => {
  t.assert.snapshot(errorState('<script>alert("x")</script> & 실패'));
});
test('rankingEmpty explains the favourite filter separately from search', t => {
  t.assert.snapshot([rankingEmpty(false), rankingEmpty(true)]);
});
test('rankingRows: rank order, selection and favourite state', t => {
  t.assert.snapshot(
    rankingRows([salamence, noSprite], {
      selected: 'salamence',
      sort: 'rank',
      favorites: new Set(['raichu']),
    }),
  );
});
test('rankingRows adds the dex number only when sorting by dex', t => {
  t.assert.snapshot(
    rankingRows([salamence, { ...noSprite, dex: null }], {
      selected: null,
      sort: 'dex',
      favorites: new Set(),
    }),
  );
});
test('heroMarkup with a Japanese name, a dex number and a favourite', t => {
  t.assert.snapshot(
    heroMarkup({ entry: salamence, shown: salamence, japanese: 'ボーマンダ', isFavorite: true }),
  );
});
test('heroMarkup omits the Japanese line and the dex number when absent', t => {
  const entry = { ...noSprite, dex: null };
  t.assert.snapshot(heroMarkup({ entry, shown: entry, japanese: '', isFavorite: false }));
});
test('detailShell: previous button shown, Singles', t => {
  t.assert.snapshot(
    detailShell({
      hasPrevious: true,
      format: 'Singles',
      season: 'M6',
      labels: { overview: '기본 정보', move: '기술' },
      category: 'move',
      date: '18_09_2026',
      generatedAt: '2026-09-18T09:00:00Z',
      fetchedAt: 1758182400000,
    }),
  );
});
test('detailShell: previous button hidden, Doubles', t => {
  t.assert.snapshot(
    detailShell({
      hasPrevious: false,
      format: 'Doubles',
      season: 'M6',
      labels: { overview: '기본 정보' },
      category: 'overview',
      date: '18_09_2026',
      generatedAt: null,
      fetchedAt: null,
    }),
  );
});
test('referenceStatus separates loading from a failed load with a retry', t => {
  t.assert.snapshot([referenceStatus(false), referenceStatus(true)]);
});
test('categoryHeader counts teammates as creatures and the rest as entries', t => {
  t.assert.snapshot([
    categoryHeader('move', [1, 2, 3]),
    categoryHeader('teammate', [1, 2]),
    categoryHeader('ability', []),
    categoryEmpty(),
  ]);
});
test('statRows: move names open the effect popup and use the reference label', t => {
  t.assert.snapshot(
    statRows(
      [
        { rank: 1, name: 'Roost', percent: 64.1 },
        { rank: 2, name: 'Unknown Move', percent: null },
      ],
      { category: 'move', locale, reference, list },
    ),
  );
});
test('statRows: held items carry artwork', t => {
  t.assert.snapshot(
    statRows([{ rank: 1, name: "King's Rock", percent: 0 }], {
      category: 'held_item',
      locale,
      reference,
      list,
    }),
  );
});
test('statRows: a teammate outside this season is labelled, not linked', t => {
  t.assert.snapshot(
    statRows(
      [
        { rank: 1, name: 'Garchomp', percent: null },
        { rank: 2, name: 'Absent', percent: null },
      ],
      { category: 'teammate', locale, reference, list },
    ),
  );
});
test('statRows: stat alignment shows the raised and lowered stat', t => {
  t.assert.snapshot(
    statRows(
      [
        { rank: 1, name: 'Adamant', percent: 50.2, up: 'Attack', down: 'Sp. Atk' },
        { rank: 2, name: 'Serious', percent: 9.9 },
      ],
      { category: 'stat_alignment', locale, reference, list },
    ),
  );
});
test('groupSummary: loading, failed, chosen values and none', t => {
  const options = { 1: '1세대', 2: '2세대' };
  t.assert.snapshot([
    groupSummary({ disabled: true, refError: false, values: [], options, mode: 'or' }),
    groupSummary({ disabled: true, refError: true, values: [], options, mode: 'or' }),
    groupSummary({ disabled: false, refError: false, values: ['1', '2'], options, mode: 'or' }),
    groupSummary({ disabled: false, refError: false, values: ['1', '2'], options, mode: 'and' }),
    groupSummary({ disabled: false, refError: false, values: [], options, mode: 'or' }),
  ]);
});
test('filterGroup: checked values, selected mode and an escaped label', t => {
  t.assert.snapshot(
    filterGroup(
      'type-filter',
      'type',
      '타입',
      { Fire: '불꽃', Water: '물 & "바다"' },
      ['Fire'],
      'and',
      false,
      '불꽃',
    ),
  );
});
test('filterGroup: a disabled group still reports why', t => {
  t.assert.snapshot(
    filterGroup(
      'gimmick-filter',
      'gimmick',
      '기믹',
      { mega: '메가진화' },
      [],
      'or',
      true,
      '불러오는 중',
    ),
  );
});
test('filter dialog help and ranking footer', t => {
  t.assert.snapshot([filterHelp(), rankingFilterFooter(false), rankingFilterFooter(true)]);
});
