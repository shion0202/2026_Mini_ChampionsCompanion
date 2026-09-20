// Render snapshots for the detail view. These catch accidental markup changes
// during refactors, which the behavioural tests in reference.test.mjs do not see.
//
// Update after an intentional markup change, then review the diff:
//   npm run test:snapshots
//
// app.js is not covered here: it touches the DOM on import, so it cannot be
// loaded in node:test. The scripts/verify-*-browser.mjs scripts cover it.
import test, { snapshot } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  renderReference,
  renderLearnsetShell,
  renderLearnsetRows,
  renderEffect,
  renderSpreads,
  effectButton,
  percentClass,
  FILTER_ICON,
} from '../src/reference-view.js';
import { createLocale } from '../src/locale.js';

// Store markup as written so a snapshot diff shows the real output, not an escaped form.
snapshot.setDefaultSnapshotSerializers([
  value => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)),
]);

const data = JSON.parse(await readFile(new URL('../public/data/reference.json', import.meta.url)));
const locale = createLocale(
  JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url))),
);
// Fixed ids, not positions: species order in reference.json must not move these cases.
const mon = id => ({
  id,
  name: data.species[id]?.name ?? id,
  label: locale.pokemon(data.species[id]?.name ?? id).label,
});

// salamence carries a mega form, pawmot a type-changing ability, shedinja Wonder Guard
// and no Champions learnset, gholdengo neither mega nor ability alternatives.
test('renderReference: mega form switch and 4x weakness', t => {
  t.assert.snapshot(renderReference(data, locale, mon('salamence'), null, 'base'));
});
test('renderReference: actual stat ranges replace base stats', t => {
  t.assert.snapshot(renderReference(data, locale, mon('salamence'), null, 'actual'));
});
test('renderReference: selecting the mega form keeps the original statistics note', t => {
  t.assert.snapshot(renderReference(data, locale, mon('salamence'), 'salamencemega', 'base'));
});
test('renderReference: ability alternatives appear under the type multiplier', t => {
  t.assert.snapshot(renderReference(data, locale, mon('pawmot'), null, 'base'));
});
test('renderReference: Wonder Guard collapses every non-super-effective type', t => {
  t.assert.snapshot(renderReference(data, locale, mon('shedinja'), null, 'base'));
});
test('renderReference: a species with no reference entry', t => {
  t.assert.snapshot(renderReference(data, locale, mon('zzz-not-a-species'), null, 'base'));
});

test('renderLearnsetShell: no filters applied', t => {
  t.assert.snapshot(renderLearnsetShell(data, mon('salamence'), '', [], [], [], {}));
});
test('renderLearnsetShell: filter badge and summary for three groups', t => {
  t.assert.snapshot(
    renderLearnsetShell(
      data,
      mon('salamence'),
      '드래곤',
      ['Dragon', 'Flying'],
      ['Physical'],
      ['contact'],
      { type: 'or', category: 'or', trait: 'or' },
    ),
  );
});
test('renderLearnsetShell: no Champions learnset for this form', t => {
  t.assert.snapshot(renderLearnsetShell(data, mon('shedinja'), '', [], [], [], {}));
});

test('renderLearnsetRows: single type filter', t => {
  t.assert.snapshot(renderLearnsetRows(data, locale, mon('salamence'), '', ['Dragon'], [], [], {}));
});
test('renderLearnsetRows: nothing matches', t => {
  t.assert.snapshot(
    renderLearnsetRows(data, locale, mon('salamence'), 'zzzznomatch', [], [], [], {}),
  );
});

test('renderEffect: move with positive priority', t => {
  t.assert.snapshot(renderEffect(data, locale, 'move', 'accelerock'));
});
test('renderEffect: move carrying several traits', t => {
  t.assert.snapshot(renderEffect(data, locale, 'move', 'aerialace'));
});
test('renderEffect: held item renders its artwork in the heading', t => {
  t.assert.snapshot(renderEffect(data, locale, 'held_item', 'leftovers'));
});
test('renderEffect: ability', t => {
  t.assert.snapshot(renderEffect(data, locale, 'ability', 'intimidate'));
});
test('renderEffect: unknown key never invents an explanation', t => {
  t.assert.snapshot(renderEffect(data, locale, 'move', 'zzznotreal'));
});

// Mirrors the row shape normalizeSnapshot produces for stat_points, including a
// missing percentage and a spread with no 32-point investment.
const spreadRows = [
  { rank: 1, name: '', percent: 20.5, points: [0, 32, 0, 0, 0, 32] },
  { rank: 2, name: '', percent: 8.6, points: [0, 32, 0, 0, 4, 32] },
  { rank: 3, name: '', percent: null, points: [0, 32, 0, 0, 0, 30] },
  { rank: 4, name: '', percent: 3.4, points: [8, 32, 2, 0, 0, 12] },
  { rank: 5, name: '', percent: 1.0, points: [0, 0, 0, 0, 0, 0] },
  { rank: 21, name: '', percent: 0.1, points: [32, 0, 0, 0, 0, 0] },
];
test('renderSpreads: grouped totals keep an unknown percentage unknown', t => {
  t.assert.snapshot(renderSpreads(spreadRows, 'grouped'));
});
test('renderSpreads: original rows past rank 20 are dropped', t => {
  t.assert.snapshot(renderSpreads(spreadRows, 'individual'));
});
test('renderSpreads: no rows', t => {
  t.assert.snapshot(renderSpreads([], 'grouped'));
});

test('effectButton escapes the label in both the text and the aria-label', t => {
  t.assert.snapshot(effectButton('move', 'x"y', 'A & B <b>"quoted"</b>'));
});
test('percentClass boundaries', t => {
  t.assert.snapshot([null, 0, 9.9, 10, 99.9, 100].map(percentClass));
});
test('FILTER_ICON', t => {
  t.assert.snapshot(FILTER_ICON);
});
