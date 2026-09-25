// 배틀에서 쓸 수 없는 도구 목록. 고정 목록이므로 도감이 바뀌어도 어긋나지 않는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EXCLUDED_ITEMS, pruneItems } from '../src/item-exclusions.js';

const reference = JSON.parse(
  await readFile(new URL('../public/data/reference.json', import.meta.url)),
);

test('every excluded item exists, is not in Champions, and is not a mega stone', () => {
  assert.equal(EXCLUDED_ITEMS.size, 129);
  for (const id of EXCLUDED_ITEMS) {
    const item = reference.held_item[id];
    assert.ok(item, `${id}는 도감에 있어야 한다`);
    assert.equal(item.champions, false, `${id}는 수록된 도구다`);
    assert.equal(item.megaStone, undefined, `${id}는 메가스톤이다`);
  }
});

test('items that do something in battle stay', () => {
  // 이름이 Z로 끝나는 메가스톤, 전용 도구, 플레이트, 효과가 있는 진화 관련 도구.
  for (const id of [
    'absolitez',
    'garchompitez',
    'lucarionitez',
    'normalgem',
    'adamantorb',
    'flameplate',
    'firememory',
    'deepseatooth',
    'razorclaw',
    'razorfang',
    'eviolite',
    'mewtwonitex',
    'custapberry',
    'salacberry',
    'enigmaberry',
  ])
    assert.ok(!EXCLUDED_ITEMS.has(id), id);
});

test('pruning removes only the listed items and leaves the rest of the data alone', () => {
  const pruned = pruneItems(reference);
  assert.equal(
    Object.keys(pruned.held_item).length,
    Object.keys(reference.held_item).length - EXCLUDED_ITEMS.size,
  );
  assert.ok(!('ghostiumz' in pruned.held_item));
  assert.ok('choicescarf' in pruned.held_item);
  assert.equal(pruned.move, reference.move);
  assert.ok('ghostiumz' in reference.held_item, '원본은 그대로다');
});
