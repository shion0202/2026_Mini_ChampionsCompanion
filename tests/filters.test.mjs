import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectRanking } from '../src/reference.js';
import { renderLearnsetRows } from '../src/reference-view.js';
import { createLocale } from '../src/locale.js';
const data = JSON.parse(await readFile(new URL('../public/data/reference.json', import.meta.url)));
const locale = createLocale(
  JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url))),
);
const list = [
  {
    id: 'zoroarkhisui',
    name: 'Zoroark-Hisui',
    label: '조로아크 (히스이)',
    dex: 571,
    types: ['Normal', 'Ghost'],
    rank: 1,
  },
  { id: 'gengar', name: 'Gengar', label: '팬텀', dex: 94, types: ['Ghost', 'Poison'], rank: 2 },
  { id: 'lopunny', name: 'Lopunny', label: '이어롭', dex: 428, types: ['Normal'], rank: 3 },
];
test('ranking combines OR generations with AND dual types and independent groups', () => {
  assert.deepEqual(
    selectRanking(list, { generation: ['1', '4'] }).map(p => p.id),
    ['gengar', 'lopunny'],
  );
  assert.deepEqual(
    selectRanking(list, { type: ['Normal', 'Ghost'], rankModes: { type: 'and' } }).map(p => p.id),
    ['zoroarkhisui'],
  );
  assert.equal(
    selectRanking(list, { type: ['Normal', 'Ghost'], rankModes: { type: 'or' } }).length,
    3,
  );
  assert.deepEqual(
    selectRanking(list, { generation: ['1', '4'], type: ['Ghost'] }).map(p => p.id),
    ['gengar'],
  );
  assert.equal(
    selectRanking(list, { generation: ['1', '4'], rankModes: { generation: 'and' } }).length,
    0,
  );
  assert.equal(
    selectRanking(list, { type: [], generation: [], gimmick: [], rankModes: { type: 'and' } })
      .length,
    3,
  );
});
test('gimmick selections allow either kind but never classify unknown forms as none', () => {
  assert.equal(selectRanking(list, { reference: data, gimmick: ['mega', 'none'] }).length, 3);
  assert.equal(
    selectRanking(list, {
      reference: data,
      gimmick: ['mega', 'none'],
      rankModes: { gimmick: 'and' },
    }).length,
    0,
  );
  assert.equal(
    selectRanking([{ id: 'unknown' }], { reference: data, gimmick: ['none'] }).length,
    0,
  );
});
test('learnset filters support OR types and AND properties together', () => {
  const render = (types, categories, traits, modes = {}) =>
    renderLearnsetRows(data, locale, { id: 'salamence' }, '', types, categories, traits, modes);
  const rows = render(['Normal', 'Dragon'], ['Physical', 'Special'], ['contact', 'recoil'], {
    trait: 'and',
  });
  assert.match(rows.html, /data-effect-id="doubleedge"/);
  assert.doesNotMatch(rows.html, /data-effect-id="dragonclaw"/);
  const either = render(['Normal', 'Dragon'], [], ['contact', 'recoil']);
  assert.match(either.html, /data-effect-id="dragonclaw"/);
  assert.ok(either.count > rows.count);
  assert.equal(render(['Normal', 'Dragon'], [], [], { type: 'and' }).count, 0);
  assert.equal(render([], ['Physical', 'Special'], [], { category: 'and' }).count, 0);
});
