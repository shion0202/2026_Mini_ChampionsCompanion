// Decisions app.js makes around the data: what the device remembered, which
// season and format are actually available, how the ranking list is assembled and
// what the user is told about it. Split out of app.js so they can run without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preferences,
  resolveSeason,
  resolveContext,
  buildList,
  loadMessages,
  selectionReset,
  sortLabel,
  activeFilters,
} from '../src/app-state.js';

const store = entries => ({
  getItem: k => (k in entries ? entries[k] : null),
});
const index = {
  seasons: [
    { season: 'M6', dates: ['18_09_2026', '11_09_2026'], formats: ['Singles', 'Doubles'] },
    { season: 'M5', dates: ['10_09_2026'], formats: ['Singles'] },
  ],
  pokemon: {
    Salamence: { name: 'Salamence', types: ['Dragon', 'Flying'], sprite: 'a.png' },
  },
};
const snapshot = {
  date: '18_09_2026',
  pokemon: [
    { name: 'Salamence', id: 'salamence', rank: 1, categories: {} },
    { name: 'Unlisted', id: 'unlisted', rank: 2, categories: {} },
  ],
};
const locale = { pokemon: name => ({ label: `ko:${name}`, dex: 373 }) };

test('a blocked or missing store still yields usable defaults', () => {
  for (const storage of [
    null,
    undefined,
    {
      getItem: () => {
        throw Error('blocked');
      },
    },
  ]) {
    const p = preferences(storage);
    assert.equal(p.format, 'Singles');
    assert.equal(p.season, '');
    assert.equal(p.spreadMode, 'grouped');
    assert.deepEqual([...p.favorites], []);
  }
});
test('stored preferences are read back', () => {
  const p = preferences(
    store({
      'champions:format': '"Doubles"',
      'champions:season': '"M6"',
      'champions:spreadMode': '"individual"',
      'champions:favorites': '["salamence","garchomp"]',
    }),
  );
  assert.equal(p.format, 'Doubles');
  assert.equal(p.season, 'M6');
  assert.equal(p.spreadMode, 'individual');
  assert.deepEqual([...p.favorites], ['salamence', 'garchomp']);
});
test('an unknown battle format never reaches the request', () => {
  assert.equal(preferences(store({ 'champions:format': '"Triples"' })).format, 'Singles');
  assert.equal(preferences(store({ 'champions:format': '17' })).format, 'Singles');
});
test('corrupt favourites cannot become entries in the list', () => {
  const p = preferences(
    store({ 'champions:favorites': '["salamence",5,null,{"id":"x"},"garchomp"]' }),
  );
  assert.deepEqual([...p.favorites], ['salamence', 'garchomp']);
  assert.deepEqual([...preferences(store({ 'champions:favorites': '"nope"' })).favorites], []);
  assert.deepEqual([...preferences(store({ 'champions:favorites': 'not json' })).favorites], []);
});

test('a season that is no longer published falls back to the newest one', () => {
  assert.equal(resolveSeason(index, 'M6'), 'M6');
  assert.equal(resolveSeason(index, 'M5'), 'M5');
  assert.equal(resolveSeason(index, 'M1'), 'M6');
  assert.equal(resolveSeason(index, ''), 'M6');
});
test('the newest date of the chosen season is requested', () => {
  assert.deepEqual(resolveContext(index, { season: 'M6', format: 'Doubles' }), {
    season: 'M6',
    date: '18_09_2026',
    format: 'Doubles',
  });
});
test('a format the season does not publish fails instead of substituting', () => {
  assert.throws(() => resolveContext(index, { season: 'M5', format: 'Doubles' }), /배틀 형식/);
  assert.throws(() => resolveContext(index, { season: 'M9', format: 'Singles' }), /시즌/);
});

test('list entries keep source rank and gain index artwork and the Korean label', () => {
  const list = buildList(index, snapshot, locale);
  assert.deepEqual(
    list.map(p => p.rank),
    [1, 2],
  );
  assert.equal(list[0].sprite, 'a.png');
  assert.deepEqual(list[0].types, ['Dragon', 'Flying']);
  assert.equal(list[0].label, 'ko:Salamence');
  assert.equal(list[0].id, 'salamence');
});
test('a Pokemon missing from the index still appears with its ranking', () => {
  const list = buildList(index, snapshot, locale);
  assert.equal(list[1].rank, 2);
  assert.equal(list[1].sprite, undefined);
  assert.equal(list[1].label, 'ko:Unlisted');
});

test('nothing unusual produces no notice', () => {
  assert.equal(loadMessages({ stale: false, date: '18_09_2026', skipped: 0 }), '');
});
test('stale data and skipped records are both reported, together if needed', () => {
  const stale = loadMessages({ stale: true, date: '18_09_2026', skipped: 0 });
  const skipped = loadMessages({ stale: false, date: '18_09_2026', skipped: 3 });
  const both = loadMessages({ stale: true, date: '18_09_2026', skipped: 3 });
  assert.match(stale, /2026\.09\.18/);
  assert.match(skipped, /3마리/);
  assert.equal(both, `${stale} ${skipped}`);
});

test('moving to another Pokemon resets the tab, the form and every learnset filter', () => {
  const state = {
    category: 'stat_points',
    form: 'salamencemega',
    learnQuery: '드래곤',
    learnType: ['Dragon'],
    learnCategory: ['Physical'],
    learnTrait: ['contact'],
    learnModes: { type: 'and' },
    selected: 'salamence',
    query: 'keep me',
  };
  Object.assign(state, selectionReset());
  assert.equal(state.category, 'overview');
  assert.equal(state.form, null);
  assert.equal(state.learnQuery, '');
  assert.deepEqual(state.learnType, []);
  assert.deepEqual(state.learnCategory, []);
  assert.deepEqual(state.learnTrait, []);
  assert.deepEqual(state.learnModes, {});
  // The ranking search and the selection itself are not part of the reset.
  assert.equal(state.query, 'keep me');
  assert.equal(state.selected, 'salamence');
});

test('sortLabel names the field and the direction', () => {
  assert.equal(sortLabel('rank', false), '사용 순위 (오름차순)');
  assert.equal(sortLabel('name', true), '이름 (내림차순)');
  assert.equal(sortLabel('dex', false), '도감 번호 (오름차순)');
});

const labels = {
  generation: { 1: '1세대', 2: '2세대' },
  type: { Fire: '불꽃', Water: '물' },
  gimmick: { mega: '메가진화' },
};
test('no filters produce no summaries', () => {
  assert.deepEqual(
    activeFilters({ generation: [], type: [], gimmick: [], favoriteOnly: false }, labels),
    [],
  );
});
test('each active group contributes one summary and favourites count as one', () => {
  assert.deepEqual(
    activeFilters(
      {
        generation: ['1', '2'],
        type: ['Fire'],
        gimmick: [],
        favoriteOnly: true,
        rankModes: { generation: 'and' },
      },
      labels,
    ),
    ['1세대 그리고 2세대', '불꽃', '즐겨찾기'],
  );
});
test('a missing rankModes falls back to OR without throwing', () => {
  assert.deepEqual(
    activeFilters({ generation: ['1', '2'], type: [], gimmick: [], favoriteOnly: false }, labels),
    ['1세대 또는 2세대'],
  );
});
