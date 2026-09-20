import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIndex,
  normalizeSnapshot,
  formatDate,
  percentageText,
  matchesQuery,
} from '../src/data.js';

const meta = {
  generatedAt: '2026-09-18T13:59:51.910Z',
  dataVersion: 'v1',
  seasons: [
    { season: 'M5', dates: ['10_09_2026'], formats: ['Singles'] },
    { season: 'M6', dates: ['11_09_2026', '18_09_2026'], formats: ['Singles', 'Doubles'] },
  ],
  pokemon: {
    Salamence: {
      name: 'Salamence',
      slug: 'salamence',
      types: ['Dragon', 'Flying'],
      sprite: 'pokemon_champions_assets/pokemon/Salamence.png',
    },
  },
};
const snapshot = () => ({
  season: 'M6',
  date: '18_09_2026',
  format: 'Singles',
  generatedAt: meta.generatedAt,
  pokemon: {
    Salamence: {
      position: 1,
      move: [
        ['Roost', 64.1, 2],
        ['Double-Edge', 76.5, 1],
      ],
      held_item: [
        ['Leftovers', 0, 1],
        ['Unknown', null, 2],
      ],
      teammate: [
        ['Primarina', 1],
        ['Garchomp', 2],
      ],
      stat_alignment: [['Adamant', 50.2, 'Attack', 'Sp. Atk', 1]],
      stat_points: [[13.5, 1, 32, 1, 0, 0, 32, 1]],
      ability: [['Intimidate', 99.3, 1]],
    },
    'Raichu-Alola': { position: 3, move: [] },
    Raichu: { position: 2, move: [] },
  },
});
const context = { season: 'M6', date: '18_09_2026', format: 'Singles' };

test('seasons and source dates are ordered chronologically without timezone conversion', () => {
  const index = normalizeIndex(meta);
  assert.equal(index.seasons[0].season, 'M6');
  assert.equal(index.seasons[0].dates[0], '18_09_2026');
  assert.equal(formatDate('18_09_2026'), '2026.09.18');
});
test('malformed dates cannot silently become another date', () => {
  assert.throws(() =>
    normalizeIndex({
      ...meta,
      seasons: [{ season: 'M6', dates: ['31_02_2026'], formats: ['Singles'] }],
    }),
  );
});
test('ranking retains form identity and sorts source rank', () => {
  const result = normalizeSnapshot(snapshot(), context);
  assert.deepEqual(
    result.pokemon.map(p => p.name),
    ['Salamence', 'Raichu', 'Raichu-Alola'],
  );
  assert.deepEqual(
    result.pokemon.map(p => p.id),
    ['salamence', 'raichu', 'raichualola'],
  );
});
test('wrong season or format cannot be rendered under the selected controls', () => {
  assert.throws(() => normalizeSnapshot(snapshot(), { ...context, season: 'M5' }));
  assert.throws(() => normalizeSnapshot(snapshot(), { ...context, format: 'Doubles' }));
  assert.throws(() => normalizeSnapshot(snapshot(), { ...context, date: '17_09_2026' }));
});
test('teammate tuple contains a rank, never a percentage', () => {
  const rows = normalizeSnapshot(snapshot(), context).pokemon[0].categories.teammate;
  assert.deepEqual(
    rows.map(r => [r.name, r.rank, r.percent]),
    [
      ['Primarina', 1, null],
      ['Garchomp', 2, null],
    ],
  );
});
test('actual zero stays zero; missing percentage stays missing', () => {
  const rows = normalizeSnapshot(snapshot(), context).pokemon[0].categories.held_item;
  assert.equal(rows[0].percent, 0);
  assert.equal(rows[1].percent, null);
  assert.equal(percentageText(rows[0].percent), '0.0%');
  assert.equal(percentageText(rows[1].percent), '정보 없음');
});
test('six stat investments preserve zero and source order', () => {
  const row = normalizeSnapshot(snapshot(), context).pokemon[0].categories.stat_points[0];
  assert.deepEqual(row.points, [1, 32, 1, 0, 0, 32]);
  assert.equal(row.percent, 13.5);
});
test('incomplete stat spread cannot silently turn into zero investment', () => {
  const raw = snapshot();
  raw.pokemon.Salamence.stat_points = [[13.5, 1, 32, 1, null, 0, 32, 1]];
  assert.throws(() => normalizeSnapshot(raw, context));
});
test('source category ranks, not incoming order, determine display order', () => {
  const rows = normalizeSnapshot(snapshot(), context).pokemon[0].categories.move;
  assert.equal(rows[0].name, 'Double-Edge');
});
test('invalid percent refuses payload instead of displaying misleading bars', () => {
  const raw = snapshot();
  raw.pokemon.Salamence.move[0][1] = 640;
  assert.throws(() => normalizeSnapshot(raw, context));
});
test('empty category is retained without invented statistics', () => {
  assert.deepEqual(normalizeSnapshot(snapshot(), context).pokemon[1].categories.ability, []);
});
test('Korean full name, initial consonants, English and dex number search work', () => {
  const p = { name: 'Salamence', label: '보만다', dex: 373 };
  assert.equal(matchesQuery(p, 'ㅂㅁㄷ'), true);
  assert.equal(matchesQuery(p, 'SALAM'), true);
  assert.equal(matchesQuery(p, '373'), true);
  assert.equal(matchesQuery(p, '고릴타'), false);
});
