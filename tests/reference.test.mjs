import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  statRanges,
  defenseChart,
  defenseComparisons,
  spreadLabel,
  groupSpreads,
  generation,
  selectRanking,
} from '../src/reference.js';
import { renderReference, percentClass } from '../src/reference-view.js';
import { createLocale } from '../src/locale.js';
const data = JSON.parse(await readFile(new URL('../public/data/reference.json', import.meta.url)));
const locale = createLocale(
  JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url))),
);

test('adoption emphasis includes exactly ten percent but not low or missing rates', () => {
  assert.equal(percentClass(null), '');
  assert.equal(percentClass(0), '');
  assert.equal(percentClass(9.9), '');
  assert.match(percentClass(10), /percentage-prominent/);
  assert.match(percentClass(99.9), /percentage-prominent/);
});

test('type-specific ability comparisons replace selectors and omit unrelated abilities', () => {
  const render = (id, form) =>
    renderReference(
      data,
      locale,
      { id, label: locale.pokemon(data.species[id].name).label },
      form,
      'base',
    );
  assert.doesNotMatch(render('salamence'), /id="defense-ability"/);
  assert.doesNotMatch(render('salamence', 'salamencemega'), /id="defense-ability"/);
  const pawmot = render('pawmot');
  assert.match(pawmot, /data-matchup-ability="voltabsorb"/);
  assert.doesNotMatch(pawmot, /data-matchup-ability="(naturalcure|ironfist)"/);
  assert.doesNotMatch(pawmot, /id="defense-ability"/);
  const bronzong = render('bronzong');
  assert.match(bronzong, /data-matchup-ability="levitate"/);
  assert.match(bronzong, /data-matchup-ability="heatproof"/);
  assert.doesNotMatch(bronzong, /data-matchup-ability="heavymetal"/);
  assert.doesNotMatch(render('dragonite'), /data-matchup-ability="multiscale"/);
});

test('comparisons preserve base values and only show changed type-specific alternatives', () => {
  const rows = defenseComparisons(['Ice', 'Ground'], data.types, ['Thick Fat', 'Oblivious']);
  const fire = rows.find(x => x.type === 'Fire');
  assert.equal(fire.value, 2);
  assert.deepEqual(fire.alternatives, [{ ability: 'thickfat', value: 1 }]);
  const ice = rows.find(x => x.type === 'Ice');
  assert.equal(ice.value, 1);
  assert.equal(ice.alternatives[0].value, 0.5);
  assert.equal(rows.find(x => x.type === 'Electric').alternatives.length, 0);
  assert.equal(
    defenseComparisons(['Dragon', 'Flying'], data.types, ['Multiscale']).some(
      x => x.alternatives.length,
    ),
    false,
  );
});

test('spread abbreviations describe major investment without merging sub-32 spreads', () => {
  assert.equal(spreadLabel([20, 0, 0, 19, 0, 20]), 'HCS');
  assert.equal(spreadLabel([22, 0, 11, 1, 0, 32]), 'HS + bc');
  assert.equal(spreadLabel([10, 0, 23, 13, 0, 20]), 'BS + hc');
  assert.equal(spreadLabel([0, 0, 0, 0, 0, 0]), '무배분');
  const rows = [
    { rank: 1, percent: 20, points: [20, 0, 0, 19, 0, 20] },
    { rank: 2, percent: 10, points: [19, 0, 0, 20, 0, 20] },
  ];
  const groups = groupSpreads(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, 'HCS');
});
test('Mega Salamence stat ranges match the supplied game-reference example', () => {
  const stats = statRanges(data.species.salamencemega.stats);
  assert.deepEqual(stats.hp, [202, 202, 170, 170]);
  assert.deepEqual(stats.atk, [216, 197, 165, 148]);
  assert.deepEqual(stats.def, [200, 182, 150, 135]);
  assert.deepEqual(stats.spe, [189, 172, 140, 126]);
});
test('dual types multiply weaknesses and preserve immunity without ability assumptions', () => {
  const chart = defenseChart(['Dragon', 'Flying'], data.types);
  assert.equal(chart.Ice, 4);
  assert.equal(chart.Grass, 0.25);
  assert.equal(chart.Ground, 0);
  assert.equal(defenseChart(['Electric'], data.types).Ground, 2);
});

test('selected abilities apply type immunity and damage modifiers without changing the base chart', () => {
  assert.equal(defenseChart(['Electric'], data.types, { ability: 'levitate' }).Ground, 0);
  assert.equal(defenseChart(['Electric'], data.types, { ability: 'eelevate' }).Ground, 0);
  assert.equal(defenseChart(['Fire'], data.types, { ability: 'waterabsorb' }).Water, 0);
  assert.equal(defenseChart(['Grass', 'Steel'], data.types, { ability: 'thickfat' }).Fire, 2);
  assert.equal(defenseChart(['Grass', 'Steel'], data.types, { ability: 'flashfire' }).Fire, 0);
  const dry = defenseChart(['Grass'], data.types, { ability: 'dryskin' });
  assert.equal(dry.Fire, 2.5);
  assert.equal(dry.Water, 0);
  const filter = defenseChart(['Rock', 'Ground'], data.types, { ability: 'filter' });
  assert.equal(filter.Water, 3);
  assert.equal(filter.Normal, 0.5);
  assert.equal(filter.Electric, 0);
  assert.equal(defenseChart(['Rock'], data.types, { ability: 'purifyingsalt' }).Ghost, 0.5);
  assert.equal(defenseChart(['Electric'], data.types).Ground, 2);
});

test('conditional abilities require matching conditions and preserve existing immunities', () => {
  assert.equal(defenseChart(['Dragon', 'Flying'], data.types, { ability: 'multiscale' }).Ice, 4);
  const full = defenseChart(['Dragon', 'Flying'], data.types, {
    ability: 'multiscale',
    fullHP: true,
  });
  assert.equal(full.Ice, 2);
  assert.equal(full.Ground, 0);
  assert.equal(defenseChart(['Normal'], data.types, { ability: 'fluffy', contact: false }).Fire, 2);
  assert.equal(defenseChart(['Normal'], data.types, { ability: 'fluffy', contact: true }).Fire, 1);
  assert.equal(
    defenseChart(['Normal'], data.types, { ability: 'fluffy', contact: true }).Fighting,
    1,
  );
  assert.equal(
    defenseChart(['Normal'], data.types, { ability: 'icescales', category: 'Physical' }).Fighting,
    2,
  );
  assert.equal(
    defenseChart(['Normal'], data.types, { ability: 'icescales', category: 'Special' }).Fighting,
    1,
  );
  assert.equal(
    defenseChart(['Normal'], data.types, { ability: 'furcoat', category: 'Physical' }).Fighting,
    1,
  );
  assert.equal(defenseChart(['Normal'], data.types, { ability: 'intimidate' }).Fighting, 2);
  assert.equal(defenseChart(['Bug', 'Ghost'], data.types, { ability: 'wonderguard' }).Water, 0);
});
test('32-point grouping combines AS leftovers but keeps custom investments separate', () => {
  const rows = [
    { rank: 1, percent: 13.5, points: [1, 32, 1, 0, 0, 32] },
    { rank: 2, percent: 11.8, points: [2, 32, 0, 0, 0, 32] },
    { rank: 3, percent: 6, points: [1, 0, 1, 32, 0, 32] },
    { rank: 4, percent: 3.5, points: [27, 25, 5, 0, 0, 9] },
    { rank: 5, percent: 3, points: [26, 25, 6, 0, 0, 9] },
  ];
  const result = groupSpreads(rows);
  assert.equal(result.length, 4);
  assert.equal(result[0].label, 'AS');
  assert.equal(result[0].percent, 25.3);
  assert.equal(result[0].rows.length, 2);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].percent, 13.5);
});
test('a missing percentage never becomes an invented group total', () => {
  const result = groupSpreads([
    { rank: 1, percent: 0, points: [2, 32, 0, 0, 0, 32] },
    { rank: 2, percent: null, points: [1, 32, 1, 0, 0, 32] },
  ]);
  assert.equal(result[0].percent, null);
});
test('generation uses original species national dex boundaries', () => {
  assert.equal(generation(151), 1);
  assert.equal(generation(152), 2);
  assert.equal(generation(812), 8);
  assert.equal(generation(null), null);
});
test('sort direction, type, generation and favorites compose without mutating source ranks', () => {
  const list = [
    { id: 'b', name: 'B', label: '나', dex: 812, types: ['Grass'], rank: 1 },
    { id: 'a', name: 'A', label: '가', dex: 373, types: ['Dragon', 'Flying'], rank: 3 },
    { id: 'c', name: 'C', label: '다', dex: 6, types: ['Fire', 'Flying'], rank: 2 },
  ];
  assert.deepEqual(
    selectRanking(list, { sort: 'name', reverse: true }).map(p => p.id),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    selectRanking(list, { sort: 'dex', type: 'Flying' }).map(p => p.id),
    ['c', 'a'],
  );
  assert.deepEqual(
    selectRanking(list, { type: 'Flying', generation: 3 }).map(p => p.id),
    ['a'],
  );
  assert.deepEqual(
    selectRanking(list, { favorites: new Set(['c']), favoriteOnly: true }).map(p => p.id),
    ['c'],
  );
  assert.deepEqual(
    list.map(p => p.rank),
    [1, 3, 2],
  );
});
test('reference connects Champions learnsets and Korean effects to matching records', () => {
  assert.ok(data.species.salamence.learnset.includes('roost'));
  assert.equal(data.species.salamence.height, 1.5);
  assert.equal(data.species.salamencemega.weight, 112.6);
  assert.match(data.ability.intimidate.effect, /공격.*1단계/);
  assert.match(data.move.earthquake.effect, /그래스필드/);
  assert.ok(data.held_item.lifeorb.effect);
  assert.equal(data.move.protect.pp, 8);
});

test('gimmick filters use the exact form and compose with the other ranking filters', () => {
  const list = ['salamence', 'pawmot', 'floette', 'floetteeternal', 'unknown'].map((id, i) => ({
    id,
    name: id,
    label: id,
    rank: i + 1,
    types: ['Flying'],
    dex: 373,
  }));
  assert.equal(selectRanking(list, { reference: data }).length, 5);
  assert.deepEqual(
    selectRanking(list, { reference: data, gimmick: 'mega' }).map(p => p.id),
    ['salamence', 'floetteeternal'],
  );
  assert.deepEqual(
    selectRanking(list, { reference: data, gimmick: 'none' }).map(p => p.id),
    ['pawmot', 'floette'],
  );
  assert.deepEqual(
    selectRanking(list, {
      reference: data,
      gimmick: 'mega',
      favoriteOnly: true,
      favorites: new Set(['floetteeternal']),
      type: 'Flying',
      generation: 3,
    }).map(p => p.id),
    ['floetteeternal'],
  );
  assert.equal(selectRanking(list, { gimmick: 'none' }).length, 0);
});
test('Eternal Floette alone links to its mega and keeps its own learnset', () => {
  assert.deepEqual(data.species.salamence.megas, ['salamencemega']);
  assert.ok(data.species.charizard.megas.includes('charizardmegax'));
  assert.ok(data.species.charizard.megas.includes('charizardmegay'));
  assert.deepEqual(data.species.floette.megas, []);
  assert.deepEqual(data.species.floetteeternal.megas, ['floettemega']);
  assert.ok(data.species.floettemega.learnset.includes('lightofruin'));
});
test('shared size and color form learnsets are resolved from Champions personal data', () => {
  for (const id of [
    'gourgeistlarge',
    'gourgeistsmall',
    'gourgeistsuper',
    'mausholdfour',
    'squawkabillyyellow',
    'vivillonfancy',
  ]) {
    assert.ok(data.species[id].learnset?.length > 10, id);
    assert.equal(data.species[id].learnsetSource, 'champout');
  }
});
