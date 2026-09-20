import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { moveTraits } from '../src/move-traits.js';
import { renderEffect, renderLearnsetRows, renderSpreads } from '../src/reference-view.js';
import { createLocale } from '../src/locale.js';
const data = JSON.parse(await readFile(new URL('../public/data/reference.json', import.meta.url)));
const locale = createLocale(
  JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url))),
);

test('move properties distinguish recoil from other self damage and ignore engine flags', () => {
  assert.deepEqual(moveTraits({ flags: { contact: 1, protect: 1 }, recoil: [1, 3] }), [
    'contact',
    'recoil',
  ]);
  assert.deepEqual(moveTraits({ flags: { slicing: 1, contact: 0 }, drain: [1, 2] }), [
    'slicing',
    'drain',
  ]);
  assert.deepEqual(moveTraits({ flags: {}, mindBlownRecoil: true }), []);
});
test('real move details include Japanese, English and properties without adding table tags', () => {
  const effect = renderEffect(data, locale, 'move', 'doubleedge');
  assert.match(effect.heading, /Double-Edge/);
  assert.match(effect.heading, /すてみタックル/);
  assert.match(effect.html, /반동/);
  assert.match(effect.html, /접촉/);
  const rows = renderLearnsetRows(data, locale, { id: 'salamence' }, '', '', '', 'recoil');
  assert.ok(rows.count > 0);
  assert.match(rows.html, /data-effect-id="doubleedge"/);
  assert.doesNotMatch(rows.html, /data-effect-id="earthquake"|move-traits/);
  assert.equal(
    renderLearnsetRows(data, locale, { id: 'salamence' }, '', 'Normal', 'Status', 'recoil').count,
    0,
  );
});
test('ability and item details include multilingual names', () => {
  assert.match(
    renderEffect(data, locale, 'ability', 'intimidate').heading,
    /Intimidate[\s\S]*いかく/,
  );
  assert.match(
    renderEffect(data, locale, 'held_item', 'lifeorb').heading,
    /Life Orb[\s\S]*いのちのたま/,
  );
});
test('spread display accepts ranks 11–20, limits at 20 and places grouping note below', () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({
    rank: i + 1,
    points: [i, 0, 0, 0, 0, 0],
    percent: 1,
  }));
  const html = renderSpreads(rows, 'individual');
  assert.match(html, /<th>20<\/th>/);
  assert.doesNotMatch(html, /<th>21<\/th>/);
  const grouped = renderSpreads(rows, 'grouped');
  assert.ok(grouped.indexOf('grouping-rule') > grouped.indexOf('spread-groups'));
});
