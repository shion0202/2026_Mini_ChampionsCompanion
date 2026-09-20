import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocale } from '../src/locale.js';
import { speedRows, speedGroups } from '../src/speed.js';
import { renderSpeedRows } from '../src/speed-view.js';

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

test('views label tiers, selected sorting column, empty results and escape names', () => {
  const rows = speedRows(reference, locale, { query: '보만다' });
  assert.match(renderSpeedRows(rows, { mode: 'base' }).replace(/<[^>]*>/g, ''), /100족/);
  const actual = renderSpeedRows(rows, { mode: 'actual', preset: 2 });
  assert.match(actual, /aria-sort="descending"/);
  assert.match(actual, /무투자/);
  assert.match(renderSpeedRows([], { mode: 'base' }), /조건에 맞는 포켓몬이 없습니다/);
  assert.ok(
    renderSpeedRows([{ ...rows[0], label: '<script>' }], { mode: 'base' }).includes(
      '&lt;script&gt;',
    ),
  );
});
