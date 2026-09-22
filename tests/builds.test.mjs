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
  setMove,
  partiesUsing,
  deleteSample,
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

const built = () => ({
  ...emptySample(),
  name: '물리형',
  pokemon: 'Salamence',
  moves: ['A', 'B', 'C', 'D'],
  altMoves: ['E', 'F', 'G'],
});

test('후보에 있는 기술로 바꾸면 자리를 맞바꾼다', () => {
  const next = setMove(built(), 3, 'E');
  assert.deepEqual(next.moves, ['A', 'B', 'C', 'E']);
  assert.deepEqual(next.altMoves, ['D', 'F', 'G']);
});

test('맞바꿔도 후보 개수와 순서가 유지된다', () => {
  const next = setMove(built(), 0, 'F');
  assert.deepEqual(next.moves, ['F', 'B', 'C', 'D']);
  assert.deepEqual(next.altMoves, ['E', 'A', 'G']);
});

test('후보에 없는 기술로 바꾸면 원래 기술은 그냥 빠진다', () => {
  const next = setMove(built(), 3, 'Z');
  assert.deepEqual(next.moves, ['A', 'B', 'C', 'Z']);
  assert.deepEqual(next.altMoves, ['E', 'F', 'G']);
});

test('빈 칸에 후보를 넣으면 후보에서 빠지고 되돌아오는 기술은 없다', () => {
  const next = setMove({ ...built(), moves: ['A', 'B', 'C', null] }, 3, 'E');
  assert.deepEqual(next.moves, ['A', 'B', 'C', 'E']);
  assert.deepEqual(next.altMoves, ['F', 'G']);
});

test('기술을 비우면 후보는 그대로다', () => {
  const next = setMove(built(), 3, null);
  assert.deepEqual(next.moves, ['A', 'B', 'C', null]);
  assert.deepEqual(next.altMoves, ['E', 'F', 'G']);
});

test('맞바꿈은 원본을 고치지 않는다', () => {
  const sample = built();
  setMove(sample, 3, 'E');
  assert.deepEqual(sample.moves, ['A', 'B', 'C', 'D']);
  assert.deepEqual(sample.altMoves, ['E', 'F', 'G']);
});

const docWith = () => {
  const one = { ...emptySample(), id: 'one1one1one1one1', name: '하나' };
  const two = { ...emptySample(), id: 'two2two2two2two2', name: '둘' };
  return {
    samples: [one, two],
    parties: [
      {
        ...emptyParty(),
        id: 'p1p1p1p1p1p1p1p1',
        name: '첫 구축',
        members: ['one1one1one1one1', 'two2two2two2two2', null, null, null, null],
      },
      {
        ...emptyParty(),
        id: 'p2p2p2p2p2p2p2p2',
        name: '둘째 구축',
        members: ['two2two2two2two2', null, null, null, null, null],
      },
    ],
    version: 0,
  };
};

test('샘플을 쓰는 파티를 센다', () => {
  const doc = docWith();
  assert.deepEqual(
    partiesUsing(doc, 'two2two2two2two2').map(p => p.id),
    ['p1p1p1p1p1p1p1p1', 'p2p2p2p2p2p2p2p2'],
  );
  assert.deepEqual(partiesUsing(doc, 'none').length, 0);
});

test('샘플을 지우면 그 자리가 빈 자리로 돌아간다', () => {
  const next = deleteSample(docWith(), 'two2two2two2two2');
  assert.deepEqual(
    next.samples.map(s => s.id),
    ['one1one1one1one1'],
  );
  assert.deepEqual(next.parties[0].members, ['one1one1one1one1', null, null, null, null, null]);
  assert.deepEqual(next.parties[1].members, [null, null, null, null, null, null]);
});

test('삭제는 원본을 고치지 않는다', () => {
  const doc = docWith();
  deleteSample(doc, 'two2two2two2two2');
  assert.equal(doc.samples.length, 2);
  assert.equal(doc.parties[0].members[1], 'two2two2two2two2');
});
