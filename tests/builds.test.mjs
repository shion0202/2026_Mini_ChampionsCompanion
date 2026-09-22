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
  addAltMove,
  removeAltMove,
  setPoint,
  partiesUsing,
  deleteSample,
  EMPTY_DOC,
  readDoc,
  writeDoc,
  DRAFT_KEY,
  readDrafts,
  writeDrafts,
  draftKey,
  pruneDrafts,
  toJson,
  fromJson,
  mergeDocs,
  speciesOptions,
  abilityOptions,
  moveOptions,
  itemOptions,
  searchSamples,
  searchParties,
} from '../src/builds.js';

const ko = JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url)));
import { createLocale } from '../src/locale.js';

const reference = JSON.parse(
  await readFile(new URL('../public/data/reference.json', import.meta.url)),
);
const locale = createLocale(ko);

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

// app-state.test.mjs와 같은 방식의 가짜 저장소.
const store = entries => ({
  getItem: k => (k in entries ? entries[k] : null),
  setItem: (k, v) => {
    entries[k] = v;
  },
});
const sealed = {
  getItem: () => {
    throw Error('blocked');
  },
  setItem: () => {
    throw Error('blocked');
  },
};

test('막히거나 비었거나 깨진 저장소는 빈 문서를 준다', () => {
  for (const storage of [null, undefined, sealed, store({}), store({ 'champions:builds': '{' })]) {
    assert.deepEqual(readDoc(storage), { samples: [], parties: [], version: 0 });
  }
});

test('저장한 문서를 그대로 읽는다', () => {
  const entries = {};
  const doc = { samples: [built()], parties: [emptyParty()], version: 3 };
  assert.equal(writeDoc(store(entries), doc), true);
  assert.deepEqual(readDoc(store(entries)), doc);
});

test('막힌 저장소에 쓰면 false를 주고 예외를 던지지 않는다', () => {
  assert.equal(writeDoc(sealed, { samples: [], parties: [], version: 0 }), false);
  assert.equal(writeDoc(null, { samples: [], parties: [], version: 0 }), false);
});

test('모양이 깨진 항목은 목록에서 빠진다', () => {
  const entries = {
    'champions:builds': JSON.stringify({
      samples: [built(), { id: 'x' }, null, { ...built(), points: [1, 2] }],
      parties: [{ ...emptyParty(), name: '구축' }, 'nope'],
      version: 1,
    }),
  };
  const doc = readDoc(store(entries));
  assert.equal(doc.samples.length, 1);
  assert.equal(doc.parties.length, 1);
  assert.equal(doc.version, 1);
});

test('내보낸 JSON을 다시 가져오면 같은 문서가 된다', () => {
  const doc = { samples: [built()], parties: [{ ...emptyParty(), name: '구축' }], version: 2 };
  const result = fromJson(toJson(doc));
  assert.equal(result.error, null);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.doc, doc);
});

test('JSON이 아니거나 읽을 항목이 없으면 이유를 준다', () => {
  assert.match(fromJson('없는 파일').error, /읽을 수 없습니다/);
  assert.match(fromJson('{"samples":[],"parties":[]}').error, /읽을 수 있는/);
});

test('가져오기는 읽지 못한 항목 수를 센다', () => {
  const text = JSON.stringify({ samples: [built(), { id: 'x' }], parties: [], version: 0 });
  const result = fromJson(text);
  assert.equal(result.skipped, 1);
  assert.equal(result.doc.samples.length, 1);
});

test('가져오기는 덮어쓰지 않고 합친다', () => {
  const mine = { ...emptySample(), id: 'mine1mine1mine12', name: '내 것' };
  const theirs = { ...emptySample(), id: 'their1their1thei', name: '가져온 것' };
  const updated = { ...mine, name: '고친 것' };
  const merged = mergeDocs(
    { samples: [mine], parties: [], version: 5 },
    { samples: [theirs, updated], parties: [], version: 0 },
  );
  assert.deepEqual(
    merged.samples.map(s => s.name),
    ['고친 것', '가져온 것'],
  );
  assert.equal(merged.version, 5);
});

test('길이는 맞고 원소 형식이 틀린 항목도 목록에서 빠진다', () => {
  const entries = {
    'champions:builds': JSON.stringify({
      samples: [
        { ...built(), id: 'good000000000000' },
        { ...built(), id: 'bad00000000000p1', points: ['a', 'b', 'c', 'd', 'e', 'f'] },
        { ...built(), id: 'bad00000000000p2', moves: [1, 2, 3, 4] },
        { ...built(), id: 'bad00000000000p3', altMoves: [null] },
      ],
      parties: [
        { ...emptyParty(), id: 'goodparty0000000', name: '구축' },
        { ...emptyParty(), id: 'badparty00000000', name: '나쁨', members: [1, 2, 3, 4, 5, 6] },
      ],
      version: 0,
    }),
  };
  const doc = readDoc(store(entries));
  assert.deepEqual(
    doc.samples.map(s => s.id),
    ['good000000000000'],
  );
  assert.deepEqual(
    doc.parties.map(p => p.id),
    ['goodparty0000000'],
  );
});

test('범위를 벗어난 능력 포인트는 형식 문제가 아니라 저장 조건 문제다', () => {
  // 가드는 형식만 본다. 40은 정수이므로 읽히고, 걸러내는 일은 validateSample이 한다.
  const over = { ...built(), id: 'over000000000000', points: [40, 0, 0, 0, 0, 0] };
  const entries = {
    'champions:builds': JSON.stringify({ samples: [over], parties: [], version: 0 }),
  };
  assert.equal(readDoc(store(entries)).samples.length, 1);
  assert.deepEqual(validateSample(over), ['능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.']);
});

test('포켓몬 목록은 챔피언스 출전 폼만 준다', () => {
  const all = speciesOptions(reference, locale, '');
  // 현재 출전 목록은 349개다. 도감을 갱신하면 늘거나 줄 수 있으므로 하한만 본다.
  assert.ok(all.length > 300);
  assert.ok(all.every(row => row.label && row.name));
  // reference.json에는 타 작품 종도 있다. 출전 목록 밖은 나오지 않는다.
  assert.equal(
    all.some(row => row.id === 'bulbasaur'),
    false,
  );
  assert.ok(all.some(row => row.id === 'salamence'));
});

test('포켓몬 목록은 한국어 이름과 초성으로 찾는다', () => {
  const byName = speciesOptions(reference, locale, '보만다');
  assert.ok(byName.some(row => row.id === 'salamence'));
  const byChosung = speciesOptions(reference, locale, 'ㅂㅁㄷ');
  assert.ok(byChosung.some(row => row.id === 'salamence'));
});

test('특성 목록은 그 폼의 것만 준다', () => {
  assert.deepEqual(abilityOptions(reference, 'salamence'), ['Intimidate', 'Moxie']);
  assert.deepEqual(abilityOptions(reference, 'none'), []);
});

test('배우는 기술이 없는 폼은 null을 준다', () => {
  assert.equal(moveOptions(reference, 'salamence').length, 62);
  assert.equal(moveOptions(reference, 'none'), null);
});

test('빈 샘플은 도구를 지니지 않는다', () => {
  assert.equal(emptySample().item, null);
});

test('도구 목록은 챔피언스 수록 도구만 준다', () => {
  const items = itemOptions(reference);
  assert.ok(items.includes('Choice Scarf'));
  // abilityshield는 champions가 거짓이다.
  assert.equal(items.includes('Ability Shield'), false);
  assert.ok(items.every(name => typeof name === 'string'));
  // 431개 중 166개가 수록이다. 도감을 갱신하면 달라질 수 있으므로 범위로 본다.
  assert.ok(items.length > 100 && items.length < 431);
});

test('도구 목록에 중복이 없다', () => {
  const items = itemOptions(reference);
  assert.equal(new Set(items).size, items.length);
});

const charizard = () => ({
  ...emptySample(),
  id: 'char000000000000',
  name: '물리형',
  pokemon: 'charizard',
});

test('샘플 이름에 없어도 포켓몬 한국어 이름으로 찾는다', () => {
  const s = charizard();
  assert.deepEqual(searchSamples([s], '리자몽', reference, locale), [s]);
});

test('초성과 영문 이름과 도감 번호로도 찾는다', () => {
  const s = charizard();
  assert.deepEqual(searchSamples([s], 'ㄹㅈㅁ', reference, locale), [s]);
  assert.deepEqual(searchSamples([s], 'charizard', reference, locale), [s]);
  assert.deepEqual(searchSamples([s], '6', reference, locale), [s]);
});

test('샘플 자신의 이름으로도 찾는다', () => {
  const s = charizard();
  assert.deepEqual(searchSamples([s], '물리', reference, locale), [s]);
});

test('맞지 않는 검색어는 걸러낸다', () => {
  assert.deepEqual(searchSamples([charizard()], '보만다', reference, locale), []);
});

test('빈 검색어는 전부 준다', () => {
  const list = [charizard()];
  assert.deepEqual(searchSamples(list, '', reference, locale), list);
  assert.deepEqual(searchSamples(list, '   ', reference, locale), list);
});

test('도감 자료가 없으면 저장된 키로만 찾는다', () => {
  const s = charizard();
  assert.deepEqual(searchSamples([s], 'chari', null, null), [s]);
  assert.deepEqual(searchSamples([s], '리자몽', null, null), []);
});

test('파티는 이름으로 찾는다', () => {
  const p = { ...emptyParty(), id: 'party00000000000', name: '스카프 선공 구축' };
  assert.deepEqual(searchParties([p], '스카프', ''), [p]);
  assert.deepEqual(searchParties([p], 'ㅅㅋㅍ', ''), [p]);
  assert.deepEqual(searchParties([p], '없는것', ''), []);
  assert.deepEqual(searchParties([p], ''), [p]);
});

test('초안 키는 새로 만들 때와 고칠 때가 다르다', () => {
  assert.equal(draftKey('sample', null), 'new-sample');
  assert.equal(draftKey('party', null), 'new-party');
  assert.equal(draftKey('sample', 'abc'), 'abc');
  assert.equal(draftKey('party', 'abc'), 'abc');
});

test('막히거나 비었거나 깨진 저장소는 빈 초안을 준다', () => {
  for (const storage of [null, undefined, sealed, store({}), store({ [DRAFT_KEY]: '{' })]) {
    assert.deepEqual(readDrafts(storage), {});
  }
});

test('초안을 그대로 읽는다', () => {
  const entries = {};
  const drafts = { 'new-sample': { ...emptySample(), name: '쓰다 만 것' } };
  assert.equal(writeDrafts(store(entries), drafts), true);
  assert.deepEqual(readDrafts(store(entries)), drafts);
});

test('막힌 저장소에 쓰면 false를 주고 던지지 않는다', () => {
  assert.equal(writeDrafts(sealed, {}), false);
  assert.equal(writeDrafts(null, {}), false);
});

test('배열이나 원시값이 들어 있으면 빈 초안으로 본다', () => {
  assert.deepEqual(readDrafts(store({ [DRAFT_KEY]: '[]' })), {});
  assert.deepEqual(readDrafts(store({ [DRAFT_KEY]: '3' })), {});
});

test('문서에 없는 id를 가리키는 초안은 정리한다', () => {
  const doc = {
    samples: [{ ...emptySample(), id: 'live000000000000' }],
    parties: [{ ...emptyParty(), id: 'party00000000000' }],
    version: 0,
  };
  const drafts = {
    'new-sample': { name: '새로 만드는 중' },
    'new-party': { name: '새 파티' },
    live000000000000: { name: '살아있는 샘플' },
    party00000000000: { name: '살아있는 파티' },
    gone000000000000: { name: '지워진 것' },
  };
  assert.deepEqual(Object.keys(pruneDrafts(drafts, doc)).sort(), [
    'live000000000000',
    'new-party',
    'new-sample',
    'party00000000000',
  ]);
});

test('정리는 원본을 고치지 않는다', () => {
  const drafts = { gone000000000000: { name: '지워진 것' } };
  pruneDrafts(drafts, { ...EMPTY_DOC });
  assert.deepEqual(Object.keys(drafts), ['gone000000000000']);
});

test('후보 기술을 더한다', () => {
  const next = addAltMove(built(), 'Z');
  assert.deepEqual(next.altMoves, ['E', 'F', 'G', 'Z']);
});

test('이미 채용했거나 후보에 있는 기술은 더하지 않는다', () => {
  assert.deepEqual(addAltMove(built(), 'E').altMoves, ['E', 'F', 'G']);
  assert.deepEqual(addAltMove(built(), 'A').altMoves, ['E', 'F', 'G']);
  assert.deepEqual(addAltMove(built(), null).altMoves, ['E', 'F', 'G']);
});

test('후보 기술을 뺀다', () => {
  assert.deepEqual(removeAltMove(built(), 'F').altMoves, ['E', 'G']);
  assert.deepEqual(removeAltMove(built(), '없는것').altMoves, ['E', 'F', 'G']);
});

test('후보를 고쳐도 원본과 채용 기술은 그대로다', () => {
  const sample = built();
  addAltMove(sample, 'Z');
  removeAltMove(sample, 'E');
  assert.deepEqual(sample.altMoves, ['E', 'F', 'G']);
  assert.deepEqual(addAltMove(built(), 'Z').moves, ['A', 'B', 'C', 'D']);
});

test('포인트 입력은 정수로 읽고 범위를 벗어난 입력은 무시한다', () => {
  assert.deepEqual(setPoint(built(), 1, '32').points, [0, 32, 0, 0, 0, 0]);
  assert.deepEqual(setPoint(built(), 1, '0').points, [0, 0, 0, 0, 0, 0]);
  // 범위 밖은 이전 값을 지킨다. validateSample이 아니라 입력 단계에서 막는다.
  const filledPoint = setPoint(built(), 1, '32');
  assert.deepEqual(setPoint(filledPoint, 1, '33').points, [0, 32, 0, 0, 0, 0]);
  assert.deepEqual(setPoint(filledPoint, 1, '-1').points, [0, 32, 0, 0, 0, 0]);
  assert.deepEqual(setPoint(filledPoint, 1, '1.5').points, [0, 32, 0, 0, 0, 0]);
  assert.deepEqual(setPoint(filledPoint, 1, 'abc').points, [0, 32, 0, 0, 0, 0]);
});

test('비운 칸은 0으로 읽는다', () => {
  const filledPoint = setPoint(built(), 1, '32');
  assert.deepEqual(setPoint(filledPoint, 1, '').points, [0, 0, 0, 0, 0, 0]);
});

test('포인트를 고쳐도 원본은 그대로다', () => {
  const sample = built();
  setPoint(sample, 1, '32');
  assert.deepEqual(sample.points, [0, 0, 0, 0, 0, 0]);
});
