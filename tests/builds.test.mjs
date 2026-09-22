// 샘플과 파티의 모양, 검증, 저장. DOM 없이 값만 다루므로 브라우저 없이 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NATURES, natureAdjust, emptySample, emptyParty } from '../src/builds.js';

const ko = JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url)));

test('성격 표는 ko.json의 25개와 키가 정확히 같다', () => {
  assert.deepEqual(Object.keys(NATURES).sort(), Object.keys(ko.stat_alignment).sort());
});

test('보정 없는 성격은 다섯 개다', () => {
  const neutral = Object.keys(NATURES).filter(id => natureAdjust(id)[0] === null);
  assert.deepEqual(neutral.sort(), ['bashful', 'docile', 'hardy', 'quirky', 'serious']);
});

test('보정이 있으면 올리는 능력과 내리는 능력이 서로 다르고 HP는 쓰지 않는다', () => {
  for (const [id, [up, down]] of Object.entries(NATURES)) {
    if (up === null) {
      assert.equal(down, null, id);
      continue;
    }
    assert.notEqual(up, down, id);
    assert.ok(!['HP'].includes(up) && !['HP'].includes(down), id);
  }
});

test('올리는 능력과 내리는 능력의 조합이 스무 가지 모두 나온다', () => {
  const pairs = new Set(
    Object.values(NATURES)
      .filter(([up]) => up !== null)
      .map(pair => pair.join('>')),
  );
  assert.equal(pairs.size, 20);
});

test('모르는 성격은 보정 없음으로 읽는다', () => {
  assert.deepEqual(natureAdjust('nope'), [null, null]);
  assert.deepEqual(natureAdjust(null), [null, null]);
  assert.deepEqual(natureAdjust(undefined), [null, null]);
});

test('빈 샘플과 빈 파티는 저장 가능한 모양이다', () => {
  const sample = emptySample();
  assert.deepEqual(sample.points, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(sample.moves, [null, null, null, null]);
  assert.deepEqual(sample.altMoves, []);
  assert.equal(sample.pokemon, null);
  assert.equal(sample.nature, null);
  assert.match(sample.id, /^[0-9a-f]{16}$/);
  const party = emptyParty();
  assert.deepEqual(party.members, [null, null, null, null, null, null]);
  assert.match(party.id, /^[0-9a-f]{16}$/);
});

test('새로 만들 때마다 다른 id가 나온다', () => {
  assert.notEqual(emptySample().id, emptySample().id);
});
