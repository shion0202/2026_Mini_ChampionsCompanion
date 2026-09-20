import test from 'node:test';
import assert from 'node:assert/strict';
import { supplementCatalog } from '../scripts/reference-catalog.mjs';

test('catalog fallback joins names across IDs, keeps game text and avoids unusable notices', async () => {
  const versions = 'id,identifier,order\n20,sword-shield,20\n10,newer,30\n';
  const tables = {};
  for (const kind of ['move', 'ability', 'item']) {
    tables[`${kind}_names.csv`] =
      `${kind}_id,local_language_id,name\n123,9,Example\n123,3,예시\n123,11,れい\n456,9,Preserved\n456,3,보완 이름\n`;
    tables[`${kind}_flavor_text.csv`] =
      `${kind}_id,version_group_id,language_id,flavor_text\n123,20,3,"체력을\n회복한다."\n123,10,3,사용할 수 없다.\n456,20,3,보완 설명\n`;
  }
  tables['version_groups.csv'] = versions;
  const data = Object.fromEntries(
    ['move', 'ability', 'held_item'].map(kind => [
      kind,
      {
        example: { name: 'Example', label: 'Example', effect: null },
        preserved: { name: 'Preserved', label: '게임 이름', effect: '게임 설명' },
        absent: { name: 'Absent', label: 'Absent', effect: null },
      },
    ]),
  );
  await supplementCatalog(data, async url => tables[url.split('/').at(-1)]);
  for (const records of [data.move, data.ability, data.held_item]) {
    assert.equal(records.example.label, '예시');
    assert.equal(records.example.japanese, 'れい');
    assert.equal(records.example.effect, '체력을 회복한다.');
    assert.equal(records.example.effectVersion, 'sword-shield');
    assert.equal(records.preserved.label, '게임 이름');
    assert.equal(records.preserved.effect, '게임 설명');
    assert.equal(records.preserved.effectVersion, undefined);
    assert.equal(records.absent.effect, null);
  }
});
