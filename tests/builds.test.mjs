// 샘플과 파티의 모양, 검증, 저장. DOM 없이 값만 다루므로 브라우저 없이 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  NATURES,
  natureAdjust,
  emptySample,
  emptyParty,
  validateSample,
  validateParty,
} from '../src/builds.js';

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

const filled = () => ({ ...emptySample(), name: '물리형', pokemon: 'Salamence' });

test('빈 샘플은 이름과 포켓몬이 없다고 알린다', () => {
  assert.deepEqual(validateSample(emptySample()), ['이름을 입력하세요.', '포켓몬을 고르세요.']);
});

test('공백만 있는 이름은 이름이 아니다', () => {
  assert.deepEqual(validateSample({ ...filled(), name: '   ' }), ['이름을 입력하세요.']);
});

test('능력 포인트는 각 칸 32 이하다', () => {
  assert.deepEqual(validateSample({ ...filled(), points: [0, 33, 0, 0, 0, 0] }), [
    '능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.',
  ]);
  assert.deepEqual(validateSample({ ...filled(), points: [0, 32, 0, 0, 0, 0] }), []);
  assert.deepEqual(validateSample({ ...filled(), points: [0, -1, 0, 0, 0, 0] }), [
    '능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.',
  ]);
  assert.deepEqual(validateSample({ ...filled(), points: [0, 1.5, 0, 0, 0, 0] }), [
    '능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.',
  ]);
  assert.deepEqual(validateSample({ ...filled(), points: [0, 0, 0, 0, 0] }), [
    '능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.',
  ]);
});

test('능력 포인트 합계는 66 이하다', () => {
  assert.deepEqual(validateSample({ ...filled(), points: [32, 32, 2, 0, 0, 0] }), []);
  assert.deepEqual(validateSample({ ...filled(), points: [32, 32, 3, 0, 0, 0] }), [
    '능력 포인트 합계는 66을 넘을 수 없습니다.',
  ]);
});

test('같은 기술을 채용과 후보에 겹쳐 넣을 수 없다', () => {
  assert.deepEqual(
    validateSample({
      ...filled(),
      moves: ['Earthquake', null, null, null],
      altMoves: ['Earthquake'],
    }),
    ['같은 기술을 두 번 넣을 수 없습니다.'],
  );
  assert.deepEqual(
    validateSample({ ...filled(), moves: ['Earthquake', 'Earthquake', null, null] }),
    ['같은 기술을 두 번 넣을 수 없습니다.'],
  );
});

test('빈 칸이 여러 개인 것은 기술 중복이 아니다', () => {
  assert.deepEqual(validateSample(filled()), []);
});

test('없는 샘플을 가리키는 파티는 알린다', () => {
  const samples = [{ ...emptySample(), id: 'aaaaaaaaaaaaaaaa' }];
  const party = {
    ...emptyParty(),
    name: '구축',
    members: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', null, null, null, null],
  };
  assert.deepEqual(validateParty(party, samples), ['목록에 없는 샘플을 가리킵니다.']);
  assert.deepEqual(
    validateParty(
      { ...party, members: ['aaaaaaaaaaaaaaaa', null, null, null, null, null] },
      samples,
    ),
    [],
  );
});

test('빈 자리만 있는 파티도 이름만 있으면 저장된다', () => {
  assert.deepEqual(validateParty({ ...emptyParty(), name: '구상 중' }, []), []);
});
