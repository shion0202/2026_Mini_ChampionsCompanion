import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defenseRows,
  toggleDefenseType,
  renderTypeDefense,
  renderTypeMatrix,
} from '../src/type-chart-view.js';

const { types } = JSON.parse(
  await readFile(new URL('../public/data/reference.json', import.meta.url)),
);
const multipliers = selected =>
  Object.fromEntries(defenseRows(selected, types).map(row => [row.type, row.value]));

test('single and dual types combine weakness, resistance and immunity by multiplication', () => {
  assert.equal(multipliers(['Fire']).Water, 2);
  const fireFlying = multipliers(['Fire', 'Flying']);
  assert.equal(Object.keys(fireFlying).length, 18);
  assert.equal(fireFlying.Rock, 4);
  assert.equal(fireFlying.Grass, 0.25);
  assert.equal(fireFlying.Ice, 1);
  assert.equal(fireFlying.Ground, 0);
  assert.equal(multipliers(['Ground', 'Flying']).Electric, 0);
  assert.equal(multipliers(['Normal', 'Ghost']).Fighting, 0);
  assert.equal(multipliers(['Normal', 'Ghost']).Ghost, 0);
  assert.deepEqual(multipliers(['Flying', 'Fire']), fireFlying);
  assert.equal(multipliers(['Fire', 'Fire']).Water, 2);
  assert.deepEqual(defenseRows([], types), []);
});

test('selection toggles unique types and prevents a third type', () => {
  assert.deepEqual(toggleDefenseType([], 'Fire'), ['Fire']);
  assert.deepEqual(toggleDefenseType(['Fire'], 'Flying'), ['Fire', 'Flying']);
  assert.deepEqual(toggleDefenseType(['Fire', 'Flying'], 'Water'), ['Fire', 'Flying']);
  assert.deepEqual(toggleDefenseType(['Fire', 'Flying'], 'Fire'), ['Flying']);
  assert.deepEqual(toggleDefenseType(['Fire'], 'invalid'), ['Fire']);
  assert.match(
    renderTypeDefense(['Fire', 'Flying'], types),
    /data-defense-type="Water"[^>]* disabled/,
  );
});

test('matrix includes all 324 matchups with rows attacking and columns defending', () => {
  const html = renderTypeMatrix(types);
  assert.equal((html.match(/<td /g) ?? []).length, 324);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 18);
  assert.match(html, /불꽃 공격 → 물 방어: 0.5배/);
  assert.match(html, /물 공격 → 불꽃 방어: 2배/);
  assert.match(html, /노말 공격 → 고스트 방어: 0배/);
});
