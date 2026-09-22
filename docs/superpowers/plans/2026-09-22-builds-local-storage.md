# 샘플과 파티 로컬 저장 구현 계획 (1단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포켓몬 샘플과 파티를 브라우저에 저장하고, 목록에서 찾아보고, JSON 파일로 내보내고 가져온다. 서버 없이 PC에서 완결된다.

**Architecture:** 기존 `app-state` / `app-view` / `app` 삼분할을 그대로 따른다. `src/builds.js`가 모양·검증·저장을 맡고 DOM을 쓰지 않는다. `src/builds-view.js`가 마크업 문자열만 만든다. `src/app.js`는 상태 보관과 DOM 조작, 이벤트 연결만 한다. 두 새 모듈은 인자만 받아 값을 돌려주므로 `node --test`로 브라우저 없이 검사한다.

**Tech Stack:** 바닐라 ES 모듈, 런타임 의존성 없음, `node:test` + `t.assert.snapshot`, localStorage.

**설계 근거:** [docs/builds-and-sync.md](../../builds-and-sync.md)

## Global Constraints

- Node.js 22 이상. **런타임 의존성을 추가하지 않는다.** 빌드 도구도 없다.
- 화면에 나오는 글은 모두 한국어다. 코드 주석도 이 저장소는 한국어와 영어를 섞어 쓰므로 기존 파일의 톤을 따른다.
- Prettier 설정: `printWidth: 100`, `singleQuote: true`, `arrowParens: "avoid"`, `endOfLine: "crlf"`. 각 작업의 마지막 커밋 전에 `npm run format`을 실행한다.
- 전체 검사는 `node --test tests/*.test.mjs`. 스냅샷 갱신은 `node --test --test-update-snapshots tests/*.test.mjs`.
- `src/builds.js`와 `src/builds-view.js`는 **DOM을 쓰지 않는다.** `document`, `window`, `localStorage`를 직접 참조하지 않고 인자로 받는다.
- localStorage 키는 `champions:` 접두사를 쓴다. 이 기능의 키는 `champions:builds` 하나다.
- 저장소가 막혔거나 내용이 깨져도 **예외를 밖으로 던지지 않는다.** `src/app-state.js`의 `preferences()`와 같은 규칙으로 기본값으로 되돌아간다.
- 능력 포인트 범위는 `src/data.js:106-113`의 통계 검증과 같다: 각 칸 0 이상 32 이하 정수, 합계 66 이하. **더 좁은 자체 기준을 만들지 않는다.**
- 능력 이름은 `src/locale.js`의 `STAT_NAMES` 키를 쓴다: `HP`, `Attack`, `Defense`, `Sp. Atk`, `Sp. Def`, `Speed`.
- 기술·도구·특성·포켓몬은 **영문 이름으로 저장**한다. 한국어 표시는 `locale.js`가 맡는다.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/builds.js` (신규) | 성격 표, 빈 모양, 검증, 기술 맞바꿈, 삭제, localStorage 읽기·쓰기, JSON 입출력 |
| `src/builds-view.js` (신규) | 목록과 편집 화면의 마크업 문자열 |
| `tests/builds.test.mjs` (신규) | `builds.js` 전부 |
| `tests/builds-view.test.mjs` (신규) | `builds-view.js` 스냅샷 |
| `index.html` (수정) | 헤더 버튼 하나, `#builds` 패널 |
| `src/app.js` (수정) | 상태, `showPage` 항목, 해시 경로, 이벤트 연결 |
| `src/styles.css` (수정) | 새 패널 스타일 |
| `sw.js` (수정) | 새 모듈 캐시 목록, 캐시 이름 |
| `scripts/verify-builds-browser.mjs` (신규) | 브라우저 회귀 검증 |
| `docs/verification.md` (수정) | 검증 기록 |

`src/sync.js`와 `functions/`는 3단계에서 만든다. 이 계획에 없다.

## 재사용하는 것

새로 만들기 전에 이미 있는 것을 쓴다.

- `src/html.js` — `esc()`
- `src/reference.js` — `STAT_KEYS`, `POINT_LETTERS`, `spreadLabel(points)`, `statRanges(stats)`
- `src/data.js` — `toId(text)`, `matchesQuery(row, query)`
- `src/locale.js` — `createLocale(dictionary)`, `STAT_NAMES`, `TYPE_LABELS`
- `src/speed-catalog.js` — `SPEED_SPECIES` (챔피언스 출전 가능 폼 349개의 집합)
- `src/app-view.js` — `portrait(row, className)`

`SPEED_SPECIES`는 스피드 화면에서 먼저 쓰여 그런 이름이 붙었을 뿐 챔피언스 출전 목록 그 자체다. 이 계획에서 **이름을 바꾸지 않는다.** 바꾸면 `speed.js`, `speed.test.mjs`, `scripts/update-speed-catalog.mjs`, `docs/speed-ranking.md`까지 번진다. `builds.js`에서 불러 쓰면서 주석으로 이유를 남긴다.

## 일부러 넣지 않은 것

- **같은 샘플을 파티에 두 번 넣는 것을 막지 않는다.** 설계 문서의 검증 목록에 없다. 종족 제한(같은 포켓몬 두 마리 금지)도 폼 처리 때문에 따로 판단이 필요하므로 요청받은 뒤에 넣는다.
- **후보 기술마다 개별 메모를 두지 않는다.** 설계 문서의 결정이다. `note` 하나에 적는다.
- **통계 값을 샘플 초깃값으로 넣지 않는다.** 설계 문서의 결정이다. 빈 값에서 시작한다.

---

### Task 1: 성격 표와 빈 모양

**Files:**
- Create: `src/builds.js`
- Test: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `NATURES` (객체: 성격 id → `[올리는 능력, 내리는 능력]`), `natureAdjust(id) → [string|null, string|null]`, `emptySample() → sample`, `emptyParty() → party`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds.test.mjs`를 새로 만든다.

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `Cannot find module '.../src/builds.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/builds.js`를 새로 만든다.

```js
// 샘플과 파티의 모양, 검증, 저장. app-state.js처럼 DOM을 쓰지 않고 인자만 받아
// 값을 돌려주므로 브라우저 없이 검사할 수 있다.

// 성격 25개의 능력 보정. 통계는 그 포켓몬에 실제로 쓰인 성격의 보정만 알려주므로
// 통계에서 표를 끌어낼 수 없고, 샘플 편집은 통계를 못 불러온 상태에서도 되어야
// 한다. 이름은 locale.js의 STAT_NAMES 키를 쓴다.
// ponytail: 직접 적은 표. 상위 자료가 보정을 함께 주기 시작하면 생성으로 옮긴다
const ATK = 'Attack';
const DEF = 'Defense';
const SPA = 'Sp. Atk';
const SPD = 'Sp. Def';
const SPE = 'Speed';
export const NATURES = {
  hardy: [null, null],
  docile: [null, null],
  serious: [null, null],
  bashful: [null, null],
  quirky: [null, null],
  lonely: [ATK, DEF],
  brave: [ATK, SPE],
  adamant: [ATK, SPA],
  naughty: [ATK, SPD],
  bold: [DEF, ATK],
  relaxed: [DEF, SPE],
  impish: [DEF, SPA],
  lax: [DEF, SPD],
  timid: [SPE, ATK],
  hasty: [SPE, DEF],
  jolly: [SPE, SPA],
  naive: [SPE, SPD],
  modest: [SPA, ATK],
  mild: [SPA, DEF],
  quiet: [SPA, SPE],
  rash: [SPA, SPD],
  calm: [SPD, ATK],
  gentle: [SPD, DEF],
  sassy: [SPD, SPE],
  careful: [SPD, SPA],
};
export const natureAdjust = id => NATURES[id] ?? [null, null];

// crypto.randomUUID는 보안 컨텍스트에서만 있다. LAN HTTP 주소로 여는 경우가
// 있으므로 어디서나 되는 getRandomValues를 쓴다.
const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(8))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

export const emptySample = () => ({
  id: newId(),
  name: '',
  note: '',
  pokemon: null,
  form: null,
  ability: null,
  nature: null,
  points: [0, 0, 0, 0, 0, 0],
  moves: [null, null, null, null],
  altMoves: [],
  updatedAt: 0,
});

export const emptyParty = () => ({
  id: newId(),
  name: '',
  note: '',
  members: [null, null, null, null, null, null],
  updatedAt: 0,
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "샘플과 파티의 빈 모양과 성격 보정 표를 만든다"
```

---

### Task 2: 검증

**Files:**
- Modify: `src/builds.js`
- Test: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: `emptySample()`, `emptyParty()`
- Produces: `validateSample(sample) → string[]`, `validateParty(party, samples) → string[]` — 빈 배열이면 저장 가능하다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds.test.mjs`의 import 줄에 `validateSample`, `validateParty`를 더하고 파일 끝에 붙인다.

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `validateSample is not a function`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/builds.js` 끝에 붙인다.

```js
// 저장을 막을 이유만 모은다. 빈 배열이면 저장한다. 능력 포인트 범위는 통계
// 자료의 검증(data.js)과 같은 값을 쓴다. 자체로 더 좁은 기준을 만들면 게임이
// 허용하는 배치를 거절하게 된다.
export function validateSample(sample) {
  const errors = [];
  if (!sample.name?.trim()) errors.push('이름을 입력하세요.');
  if (!sample.pokemon) errors.push('포켓몬을 고르세요.');
  const points = sample.points;
  if (
    !Array.isArray(points) ||
    points.length !== 6 ||
    !points.every(p => Number.isInteger(p) && p >= 0 && p <= 32)
  )
    errors.push('능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.');
  else if (points.reduce((a, b) => a + b, 0) > 66)
    errors.push('능력 포인트 합계는 66을 넘을 수 없습니다.');
  // 빈 칸은 여러 개여도 중복이 아니다.
  const moves = [...(sample.moves ?? []), ...(sample.altMoves ?? [])].filter(Boolean);
  if (new Set(moves).size !== moves.length) errors.push('같은 기술을 두 번 넣을 수 없습니다.');
  return errors;
}

// 빈 자리는 정상이다. 구상 중인 조합을 적어두는 것이 이 기능의 쓸모다.
export function validateParty(party, samples) {
  const errors = [];
  if (!party.name?.trim()) errors.push('이름을 입력하세요.');
  const ids = new Set(samples.map(s => s.id));
  if (party.members.some(id => id !== null && !ids.has(id)))
    errors.push('목록에 없는 샘플을 가리킵니다.');
  return errors;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: PASS, 15 tests

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "샘플과 파티의 저장 조건을 검사한다"
```

---

### Task 3: 기술 맞바꿈과 샘플 삭제

**Files:**
- Modify: `src/builds.js`
- Test: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: `emptySample()`, `emptyParty()`
- Produces: `setMove(sample, slot, move) → sample` (새 객체), `partiesUsing(doc, id) → party[]`, `deleteSample(doc, id) → doc` (새 객체)

`doc`은 `{ samples: sample[], parties: party[], version: number }` 모양이다. Task 4가 이 모양을 저장소에서 읽고 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import 줄에 `setMove`, `partiesUsing`, `deleteSample`을 더하고 파일 끝에 붙인다.

```js
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
  assert.deepEqual(next.parties[0].members, [
    'one1one1one1one1',
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(next.parties[1].members, [null, null, null, null, null, null]);
});

test('삭제는 원본을 고치지 않는다', () => {
  const doc = docWith();
  deleteSample(doc, 'two2two2two2two2');
  assert.equal(doc.samples.length, 2);
  assert.equal(doc.parties[0].members[1], 'two2two2two2two2');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `setMove is not a function`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/builds.js` 끝에 붙인다.

```js
// 채용 기술 한 칸을 바꾼다. 새 기술이 이미 후보에 있으면 그 자리에 원래 기술이
// 들어간다. 교체는 후보를 소비하는 것이 아니라 뒤바꾸는 것이라 후보 개수와 순서가
// 그대로 남는다. 후보에 없는 기술로 바꿀 때는 맞바꾸지 않는다. 고르는 기술마다
// 후보가 자동으로 늘어나면 목록이 의도와 무관하게 불어난다.
export function setMove(sample, slot, move) {
  const previous = sample.moves[slot] ?? null;
  const moves = sample.moves.map((m, i) => (i === slot ? move : m));
  const at = move === null ? -1 : sample.altMoves.indexOf(move);
  const altMoves =
    at === -1
      ? sample.altMoves
      : // 빈 칸을 채운 경우 previous가 null이라 그 자리가 사라진다.
        sample.altMoves.map((m, i) => (i === at ? previous : m)).filter(m => m !== null);
  return { ...sample, moves, altMoves };
}

export const partiesUsing = (doc, id) => doc.parties.filter(p => p.members.includes(id));

// 파티가 샘플을 참조하므로 지운 샘플의 자리를 빈 자리로 되돌린다. 파티 자체는
// 남는다. 여섯 자리를 다 채우지 않은 파티도 정상이기 때문이다.
export function deleteSample(doc, id) {
  return {
    ...doc,
    samples: doc.samples.filter(s => s.id !== id),
    parties: doc.parties.map(p =>
      p.members.includes(id) ? { ...p, members: p.members.map(m => (m === id ? null : m)) } : p,
    ),
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: PASS, 24 tests

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "채용 기술과 후보 기술이 자리를 맞바꾼다"
```

---

### Task 4: 저장과 JSON 입출력

**Files:**
- Modify: `src/builds.js`
- Test: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: `emptySample()`, `emptyParty()`
- Produces: `EMPTY_DOC`, `readDoc(storage) → doc`, `writeDoc(storage, doc) → boolean`, `toJson(doc) → string`, `fromJson(text) → { doc, skipped, error }`, `mergeDocs(current, incoming) → doc`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import 줄에 `readDoc`, `writeDoc`, `toJson`, `fromJson`, `mergeDocs`를 더하고 파일 끝에 붙인다.

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `readDoc is not a function`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/builds.js` 끝에 붙인다.

```js
const KEY = 'champions:builds';
export const EMPTY_DOC = { samples: [], parties: [], version: 0 };

// 통계 자료와 같은 태도다. 형식을 확인할 수 없는 항목은 고쳐 쓰지 않고 뺀다.
// data.js가 같은 6칸 능력 포인트를 원소 타입까지 확인하므로 여기도 같은 깊이로 본다.
// 다만 값의 범위와 중복은 보지 않는다. 그것은 validateSample이 판단할 저장 조건이고,
// 두 곳에 같은 규칙을 적으면 어긋난다. 범위를 벗어난 항목은 조용히 사라지는 대신
// 화면에 떠서 고칠 수 있어야 한다.
const isMoveSlot = m => m === null || typeof m === 'string';

const isSample = s =>
  !!s &&
  typeof s === 'object' &&
  typeof s.id === 'string' &&
  typeof s.name === 'string' &&
  Array.isArray(s.points) &&
  s.points.length === 6 &&
  s.points.every(Number.isInteger) &&
  Array.isArray(s.moves) &&
  s.moves.length === 4 &&
  s.moves.every(isMoveSlot) &&
  Array.isArray(s.altMoves) &&
  s.altMoves.every(m => typeof m === 'string');

const isParty = p =>
  !!p &&
  typeof p === 'object' &&
  typeof p.id === 'string' &&
  typeof p.name === 'string' &&
  Array.isArray(p.members) &&
  p.members.length === 6 &&
  p.members.every(isMoveSlot);

const normalizeDoc = raw =>
  !raw || typeof raw !== 'object'
    ? { ...EMPTY_DOC }
    : {
        samples: Array.isArray(raw.samples) ? raw.samples.filter(isSample) : [],
        parties: Array.isArray(raw.parties) ? raw.parties.filter(isParty) : [],
        version: Number.isInteger(raw.version) ? raw.version : 0,
      };

// preferences()와 같은 규칙: 막히거나 깨진 저장소가 앱을 멈추게 하지 않는다.
export function readDoc(storage) {
  try {
    return normalizeDoc(JSON.parse(storage?.getItem(KEY)));
  } catch {
    return { ...EMPTY_DOC };
  }
}

// 용량 초과나 차단을 숨기지 않는다. 화면이 저장되지 않았음을 알려야 한다.
export function writeDoc(storage, doc) {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export const toJson = doc => JSON.stringify(doc, null, 2);

// 사용자가 고른 파일이므로 신뢰 경계다. 읽지 못한 항목 수를 돌려주어 화면이
// 알릴 수 있게 한다.
export function fromJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      doc: null,
      skipped: 0,
      error: '파일을 읽을 수 없습니다. 내보내기로 만든 JSON 파일인지 확인하세요.',
    };
  }
  const doc = normalizeDoc(raw);
  if (!doc.samples.length && !doc.parties.length)
    return { doc: null, skipped: 0, error: '읽을 수 있는 샘플이나 파티가 없습니다.' };
  const total =
    (Array.isArray(raw?.samples) ? raw.samples.length : 0) +
    (Array.isArray(raw?.parties) ? raw.parties.length : 0);
  return { doc, skipped: total - doc.samples.length - doc.parties.length, error: null };
}

// 가져오기는 덮어쓰지 않는다. 다른 기기에 있던 것을 지우면 되돌릴 수 없다.
// 같은 id는 가져온 쪽이 이긴다.
export function mergeDocs(current, incoming) {
  const merge = (mine, theirs) => {
    const byId = new Map(mine.map(x => [x.id, x]));
    for (const item of theirs) byId.set(item.id, item);
    return [...byId.values()];
  };
  return {
    samples: merge(current.samples, incoming.samples),
    parties: merge(current.parties, incoming.parties),
    version: current.version,
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: PASS, 32 tests

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "샘플과 파티를 저장하고 JSON으로 주고받는다"
```

---

### Task 5: 고를 수 있는 항목 만들기

편집 화면이 포켓몬, 특성, 기술, 도구를 고르려면 목록이 필요하다. 마크업이 아니라 자료 판단이므로 `builds.js`에 둔다.

**Files:**
- Modify: `src/builds.js`
- Test: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: `SPEED_SPECIES` (`src/speed-catalog.js`), `matchesQuery` (`src/data.js`), `toId` (`src/data.js`)
- Produces: `speciesOptions(reference, locale, query) → [{ id, name, label, dex, types, sprite }]`, `abilityOptions(reference, pokemon) → string[]`, `moveOptions(reference, pokemon) → string[] | null`

`moveOptions`가 `null`을 주면 그 폼의 배우는 기술 자료가 없다는 뜻이다. 그럴 때 편집 화면은 도감 전체에서 고르게 하고 자료 미제공을 알린다. **다른 세대 기술로 대체하지 않는다** — `docs/battle-reference-plan.md`의 기존 결정이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import 줄에 `speciesOptions`, `abilityOptions`, `moveOptions`를 더하고, 파일 위쪽 `ko` 줄 옆에 실제 자료를 읽는 줄을 더한다.

```js
import { createLocale } from '../src/locale.js';

const reference = JSON.parse(
  await readFile(new URL('../public/data/reference.json', import.meta.url)),
);
const locale = createLocale(ko);
```

파일 끝에 붙인다.

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `speciesOptions is not a function`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/builds.js` 맨 위 import에 더한다.

```js
import { matchesQuery } from './data.js';
// 스피드 화면에서 먼저 쓰여 그런 이름이 붙었을 뿐 챔피언스 출전 폼 목록 그
// 자체다. 이름을 바꾸면 speed.js, 생성 스크립트, 문서까지 번지므로 그대로 쓴다.
import { SPEED_SPECIES } from './speed-catalog.js';
```

파일 끝에 붙인다.

```js
// 편집 화면에서 고를 수 있는 것들. reference.json에는 타 작품 종도 있으므로
// 출전 목록으로 거른다. speed.js의 speedRows와 같은 자료원이다.
export function speciesOptions(reference, locale, query = '') {
  return Object.entries(reference.species)
    .filter(([id]) => SPEED_SPECIES.has(id))
    .map(([id, species]) => ({
      id,
      name: species.name,
      label: locale.pokemon(species.name).label,
      dex: species.dex,
      types: species.types,
    }))
    .filter(row => matchesQuery(row, query))
    .sort((a, b) => (a.dex ?? 0) - (b.dex ?? 0) || a.id.localeCompare(b.id));
}

export const abilityOptions = (reference, pokemon) =>
  reference.species[pokemon]?.abilities ?? [];

// null은 그 폼의 배우는 기술 자료가 없다는 뜻이다. 다른 세대 기술로 대체하지
// 않는다. 화면이 미제공을 알리고 도감 전체에서 고르게 한다.
export const moveOptions = (reference, pokemon) =>
  reference.species[pokemon]?.learnset ?? null;
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: PASS, 36 tests

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "편집 화면에서 고를 포켓몬과 특성, 기술 목록을 만든다"
```

---

### Task 6: 목록과 편집 마크업

**Files:**
- Create: `src/builds-view.js`
- Test: `tests/builds-view.test.mjs`

**Interfaces:**
- Consumes: `esc` (`src/html.js`), `spreadLabel`, `POINT_LETTERS` (`src/reference.js`), `natureAdjust`, `NATURES` (`src/builds.js`), `STAT_NAMES` (`src/locale.js`)
- Produces: `sampleList(samples, locale, reference)`, `partyList(parties, samples, locale)`, `sampleEditor(sample, { reference, locale })`, `partyEditor(party, samples, locale)` — 모두 HTML 문자열

`reference`가 `null`이면 포켓몬 이름 자리에 저장된 id가 그대로 나온다. 도감 자료를 아직 불러오지 않은 상태에서도 목록이 뜨게 하려는 것이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds-view.test.mjs`를 새로 만든다.

```js
// 목록과 편집 화면의 마크업. app-view.test.mjs와 같은 스냅샷 방식이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocale } from '../src/locale.js';
import { emptySample, emptyParty } from '../src/builds.js';
import { sampleList, partyList, sampleEditor, partyEditor } from '../src/builds-view.js';

const read = file =>
  readFile(new URL(`../public/data/${file}.json`, import.meta.url)).then(JSON.parse);
const [reference, ko] = await Promise.all(['reference', 'ko'].map(read));
const locale = createLocale(ko);

const sample = {
  ...emptySample(),
  id: 'aaaaaaaaaaaaaaaa',
  name: '물리형 보만다',
  note: '스카프로 선공을 잡는다.\n후보는 "상성 보완역"이라 <4번째>와 자유롭게 바꾼다.',
  pokemon: 'salamence',
  ability: 'Intimidate',
  nature: 'adamant',
  points: [0, 32, 0, 0, 2, 32],
  moves: ['Dragon Claw', 'Earthquake', 'Dragon Dance', 'Roost'],
  altMoves: ['Fire Fang', 'Crunch'],
};
const party = {
  ...emptyParty(),
  id: 'p1p1p1p1p1p1p1p1',
  name: '스카프 선공 구축',
  note: '선공을 잡고 굳히는 구성이다.',
  members: ['aaaaaaaaaaaaaaaa', null, null, null, null, null],
};

test('빈 목록은 무엇을 하면 되는지 알린다', t => {
  t.assert.snapshot([sampleList([], locale, reference), partyList([], [], locale)]);
});

test('샘플 목록은 이름, 포켓몬, 배분 요약을 보여준다', t => {
  t.assert.snapshot(sampleList([sample], locale, reference));
});

test('도감 자료가 없으면 포켓몬 이름 대신 저장된 id가 나온다', t => {
  t.assert.snapshot(sampleList([sample], locale, null));
});

test('파티 목록은 채운 자리 수를 보여준다', t => {
  t.assert.snapshot(partyList([party], [sample], locale));
});

test('샘플 편집 화면은 채용 기술과 후보 기술을 나눠 보여준다', t => {
  t.assert.snapshot(sampleEditor(sample, { reference, locale }));
});

test('빈 샘플 편집 화면은 통계 값을 미리 채우지 않는다', t => {
  const html = sampleEditor({ ...emptySample(), id: 'bbbbbbbbbbbbbbbb' }, { reference, locale });
  assert.equal(html.includes('Dragon Claw'), false);
  t.assert.snapshot(html);
});

test('파티 편집 화면은 빈 자리를 빈 자리로 보여준다', t => {
  t.assert.snapshot(partyEditor(party, [sample], locale));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds-view.test.mjs`
Expected: FAIL — `Cannot find module '.../src/builds-view.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/builds-view.js`를 새로 만든다. 기존 CSS 클래스(`list-heading`, `empty-state`, `text-button`)를 그대로 쓴다.

```js
// 샘플과 파티 화면의 마크업. app-view.js와 같이 문자열만 만들고 DOM을 만지지
// 않으므로 브라우저 없이 스냅샷으로 비교한다.
import { esc } from './html.js';
import { spreadLabel, POINT_LETTERS } from './reference.js';
import { natureAdjust } from './builds.js';
import { STAT_NAMES } from './locale.js';

// 명사를 조사가 붙은 문장에 끼워넣지 않는다. '샘플이'는 맞지만 '파티이'는 틀린다.
// 다른 뷰 모듈도 맥락마다 문장을 통으로 적는다.
const empty = (message, action, label) =>
  `<div class="empty-state"><p>${message}</p>` +
  `<button class="text-button" data-builds-new="${action}">${label}</button></div>`;

const speciesLabel = (locale, reference, id) => {
  const species = reference?.species?.[id];
  return species ? locale.pokemon(species.name).label : (id ?? '포켓몬 미선택');
};

// 성격은 한국어 이름과 보정을 함께 보여준다. 이름만으로는 무엇이 오르내리는지
// 바로 읽히지 않는다.
const natureLabel = (locale, id) => {
  if (!id) return '보정 미선택';
  const [up, down] = natureAdjust(id);
  const name = locale.label('stat_alignment', id);
  if (!up) return `${name} (보정 없음)`;
  return `${name} (${STAT_NAMES[up]} ↑ ${STAT_NAMES[down]} ↓)`;
};

// reference가 null이면 포켓몬 이름 자리에 저장된 id가 나온다. 도감을 아직
// 불러오지 않은 상태에서도 목록은 떠야 한다.
export function sampleList(samples, locale, reference = null) {
  if (!samples.length) return empty('저장한 샘플이 없습니다.', 'sample', '샘플 만들기');
  return `<ul class="builds-list">${samples
    .map(
      s =>
        `<li class="builds-row"><button class="builds-open" data-builds-sample="${esc(s.id)}">` +
        `<span class="builds-name">${esc(s.name)}</span>` +
        `<small class="builds-sub">${esc(speciesLabel(locale, reference, s.pokemon))}` +
        ` · ${esc(spreadLabel(s.points))}</small>` +
        `</button></li>`,
    )
    .join('')}</ul>`;
}

export function partyList(parties, samples, locale) {
  if (!parties.length) return empty('저장한 파티가 없습니다.', 'party', '파티 만들기');
  const names = new Map(samples.map(s => [s.id, s.name]));
  return `<ul class="builds-list">${parties
    .map(p => {
      const filled = p.members.filter(Boolean);
      const shown = filled.map(id => names.get(id) ?? '없는 샘플').join(', ');
      return (
        `<li class="builds-row"><button class="builds-open" data-builds-party="${esc(p.id)}">` +
        `<span class="builds-name">${esc(p.name)}</span>` +
        `<small class="builds-sub">${filled.length}/6${shown ? ` · ${esc(shown)}` : ''}</small>` +
        `</button></li>`
      );
    })
    .join('')}</ul>`;
}

const moveSlot = (move, slot) =>
  `<li><span class="builds-slot">${slot + 1}</span>` +
  `<button class="builds-pick" data-builds-move="${slot}">` +
  `${move ? esc(move) : '기술 고르기'}</button></li>`;

const pointRow = (value, index) =>
  `<label class="builds-point"><span>${POINT_LETTERS[index]}</span>` +
  `<input type="number" min="0" max="32" step="1" value="${value}" data-builds-point="${index}"></label>`;

export function sampleEditor(sample, { reference, locale }) {
  const total = sample.points.reduce((a, b) => a + b, 0);
  return (
    `<form class="builds-editor" data-builds-form="sample">` +
    `<label class="builds-field">이름<input type="text" value="${esc(sample.name)}" data-builds-field="name" placeholder="예: 스카프 보만다"></label>` +
    `<button type="button" class="builds-pick builds-species" data-builds-species>` +
    `${esc(speciesLabel(locale, reference, sample.pokemon))}</button>` +
    `<button type="button" class="builds-pick" data-builds-ability>` +
    `${sample.ability ? esc(locale.label('ability', sample.ability)) : '특성 고르기'}</button>` +
    `<button type="button" class="builds-pick" data-builds-nature>` +
    `${esc(natureLabel(locale, sample.nature))}</button>` +
    `<fieldset class="builds-points"><legend>능력 포인트 <small>합계 ${total} / 66</small></legend>` +
    `${sample.points.map(pointRow).join('')}</fieldset>` +
    `<fieldset class="builds-moves"><legend>채용 기술</legend>` +
    `<ul>${sample.moves.map(moveSlot).join('')}</ul></fieldset>` +
    `<fieldset class="builds-alts"><legend>후보 기술</legend>` +
    `<ul>${sample.altMoves
      .map(
        m =>
          `<li><span>${esc(m)}</span>` +
          `<button type="button" class="text-button" data-builds-alt-remove="${esc(m)}">빼기</button></li>`,
      )
      .join('')}</ul>` +
    `<button type="button" class="text-button" data-builds-alt-add>후보 더하기</button></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="보정과 포인트의 의도, 기술의 의도, 후보 기술인 이유">${esc(sample.note)}</textarea></label>` +
    `</form>`
  );
}

export function partyEditor(party, samples, locale) {
  const names = new Map(samples.map(s => [s.id, s.name]));
  return (
    `<form class="builds-editor" data-builds-form="party">` +
    `<label class="builds-field">이름<input type="text" value="${esc(party.name)}" data-builds-field="name" placeholder="예: 스카프 선공 구축"></label>` +
    `<fieldset class="builds-members"><legend>구성</legend><ul>${party.members
      .map(
        (id, slot) =>
          `<li><span class="builds-slot">${slot + 1}</span>` +
          `<button type="button" class="builds-pick" data-builds-member="${slot}">` +
          `${id ? esc(names.get(id) ?? '없는 샘플') : '빈 자리'}</button></li>`,
      )
      .join('')}</ul></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="왜 이런 조합인지">${esc(party.note)}</textarea></label>` +
    `</form>`
  );
}
```

- [ ] **Step 4: 스냅샷을 만들고 확인한다**

Run: `node --test --test-update-snapshots tests/builds-view.test.mjs`

그다음 `tests/builds-view.test.mjs.snapshot`을 **열어서 읽는다.** 스냅샷은 만들면 무조건 통과하므로 내용을 눈으로 봐야 의미가 있다. 확인할 것:

- 포켓몬 이름이 `보만다`로 나온다 (`salamence`가 아니다)
- 성격이 `고집 (공격 ↑ 특수공격 ↓)`로 나온다
- 배분 요약이 `AS + d` 꼴로 나온다 (`spreadLabel([0,32,0,0,2,32])`의 결과)
- 빈 샘플 스냅샷에 `Dragon Claw`가 없다
- 설명의 줄바꿈과 따옴표가 이스케이프되어 있다

Run: `node --test tests/builds-view.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds-view.js tests/builds-view.test.mjs tests/builds-view.test.mjs.snapshot
git commit -m "샘플과 파티의 목록과 편집 화면을 그린다"
```

---

### Task 7: 앱에 연결

**Files:**
- Modify: `index.html` (헤더 `nav` 37행 근처, `main` 안 패널)
- Modify: `src/app.js` (상태 86행 근처, `showPage` 410-425행, 해시 처리 1153-1173행, 시작 처리 1225-1231행)
- Modify: `src/styles.css` (끝에 추가)
- Modify: `sw.js` (`APP_FILES` 2-33행, `CACHE` 1행)

**Interfaces:**
- Consumes: Task 1-6의 모든 export
- Produces: 동작하는 화면. 다음 단계가 쓸 새 export는 없다.

- [ ] **Step 1: 헤더 버튼과 패널을 넣는다**

`index.html`의 `<nav class="category-nav">` 안, `dex-link` 다음 줄에 넣는다.

```html
      <button id="builds-link" aria-pressed="false">내 샘플</button>
```

`<section id="speed" ...>` 앞에 패널을 넣는다.

```html
    <section id="builds" class="builds-panel" aria-labelledby="builds-title" hidden>
      <div class="list-heading"><h2 id="builds-title">내 샘플</h2></div>
      <div class="segmented" role="group" aria-label="보기 전환">
        <button data-builds-tab="sample" aria-pressed="true">샘플</button>
        <button data-builds-tab="party" aria-pressed="false">파티</button>
      </div>
      <div class="builds-controls">
        <label class="builds-search">검색<input id="builds-search" type="search" placeholder="이름, 포켓몬" autocomplete="off"></label>
        <button id="builds-new" class="text-button">새로 만들기</button>
        <button id="builds-export" class="text-button">JSON 내보내기</button>
        <label class="text-button builds-import">JSON 가져오기<input id="builds-import" type="file" accept="application/json,.json" hidden></label>
      </div>
      <p id="builds-status" class="builds-status" role="status"></p>
      <div id="builds-rows"></div>
    </section>
```

- [ ] **Step 2: 상태와 화면 전환을 잇는다**

`src/app.js` 위쪽 import 묶음에 더한다.

이 작업은 목록과 저장만 잇는다. 편집 흐름은 다음 계획이므로 **지금 쓰는 것만
불러온다.** 쓰지 않는 import를 미리 넣지 않는다.

```js
import { readDoc, writeDoc, toJson, fromJson, mergeDocs } from './builds.js';
import { sampleList, partyList } from './builds-view.js';
```

`state` 객체(86행 `page: 'ranking'` 근처)에 더한다.

```js
  builds: readDoc(storage),
  buildsTab: 'sample',
  buildsQuery: '',
  buildsEditing: null,
```

`showPage`의 패널 목록(413-419행)에 한 줄 더한다.

```js
    builds: 'builds',
```

- [ ] **Step 3: 화면을 그리고 여는 함수를 더한다**

`openSpeed` 옆에 붙인다.

```js
const BUILDS_TABS = ['sample', 'party'];

function buildsSave() {
  if (!writeDoc(storage, state.builds)) {
    $('builds-status').textContent =
      '브라우저 저장 공간에 쓰지 못했습니다. 저장 공간이 가득 찼거나 막혀 있습니다.';
    return false;
  }
  return true;
}

function renderBuilds() {
  if (state.page !== 'builds') return;
  document
    .querySelectorAll('[data-builds-tab]')
    .forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.buildsTab === state.buildsTab)),
    );
  const query = state.buildsQuery.trim().toLowerCase();
  const { samples, parties } = state.builds;
  if (state.buildsTab === 'sample') {
    const shown = query
      ? samples.filter(s => `${s.name} ${s.pokemon ?? ''}`.toLowerCase().includes(query))
      : samples;
    $('builds-rows').innerHTML = sampleList(shown, state.locale, state.reference);
  } else {
    const shown = query ? parties.filter(p => p.name.toLowerCase().includes(query)) : parties;
    $('builds-rows').innerHTML = partyList(shown, samples, state.locale);
  }
}

function openBuilds(tab = 'sample', { navigate = true } = {}) {
  state.buildsTab = BUILDS_TABS.includes(tab) ? tab : 'sample';
  showPage('builds');
  if (navigate) history.pushState({ builds: state.buildsTab }, '', `#builds=${state.buildsTab}`);
  renderBuilds();
  window.scrollTo(0, 0);
}
```

> `state.reference`는 도감을 아직 열지 않았으면 `null`이다. 그때는 목록에 포켓몬 이름 대신 저장된 id가 나온다. 이 작업에서는 그대로 두고, Step 7의 브라우저 확인에서 실제로 어떻게 보이는지 확인한 뒤 필요하면 `openBuilds`에서 도감 자료를 먼저 불러오도록 고친다.

- [ ] **Step 4: 버튼과 경로를 잇는다**

`speed-link` 이벤트 연결(832행 근처)과 같은 자리에 더한다.

```js
$('builds-link').addEventListener('click', () => {
  if (state.page !== 'builds') openBuilds(state.buildsTab);
});
$('builds-search').addEventListener('input', event => {
  state.buildsQuery = event.target.value;
  renderBuilds();
});
document.querySelectorAll('[data-builds-tab]').forEach(button =>
  button.addEventListener('click', () => {
    openBuilds(button.dataset.buildsTab);
  }),
);
$('builds-export').addEventListener('click', () => {
  const blob = new Blob([toJson(state.builds)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `champions-builds-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});
$('builds-import').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const { doc, skipped, error } = fromJson(await file.text());
  if (error) {
    $('builds-status').textContent = error;
    return;
  }
  // 덮어쓰지 않고 합친다. 이 기기에 있던 것을 지우면 되돌릴 수 없다.
  state.builds = mergeDocs(state.builds, doc);
  if (buildsSave())
    $('builds-status').textContent =
      `샘플 ${doc.samples.length}개, 파티 ${doc.parties.length}개를 가져왔습니다.` +
      (skipped ? ` 형식을 확인할 수 없는 ${skipped}개는 제외했습니다.` : '');
  renderBuilds();
});
```

해시 처리(1153행 근처 `popstate` 안)에 더한다.

```js
  if (params.has('builds')) {
    openBuilds(params.get('builds'), { navigate: false });
    return;
  }
```

시작 처리(1225행 근처)에 더한다.

```js
const startupBuilds = new URLSearchParams(location.hash.slice(1)).get('builds');
if (startupBuilds !== null) openBuilds(startupBuilds, { navigate: false });
```

- [ ] **Step 5: 서비스 워커 목록을 갱신한다**

`sw.js` 1행의 캐시 이름을 올린다.

```js
const CACHE = 'champions-shell-v23';
```

`APP_FILES`의 `'./src/speed.js',` 앞에 더한다.

```js
  './src/builds.js',
  './src/builds-view.js',
```

> `/api/*`는 3단계에서 생긴다. 지금 손대지 않아도 된다. `sw.js`의 fetch 처리는 `APP_FILES`에 있는 주소만 가로채므로 목록에 없는 주소는 그대로 네트워크로 간다.

- [ ] **Step 6: 스타일을 더한다**

`src/styles.css` 끝에 붙인다. **새 색을 만들지 않는다.** `styles.css:4-11`이 정의하고 `styles.css:1744-1750`이 다크 테마로 다시 정의하는 변수만 쓴다: `--ink`, `--muted`, `--line`, `--teal`, `--teal-soft`, `--bg`, `--white`, `--radius`. 이 변수만 쓰면 다크 테마가 저절로 따라온다.

```css
.builds-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-block: 1rem;
}
.builds-search {
  flex: 1 1 14rem;
}
.builds-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.builds-open {
  width: 100%;
  text-align: left;
  display: grid;
  gap: 0.15rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--white);
  color: var(--ink);
  cursor: pointer;
}
.builds-open:hover {
  border-color: var(--teal);
}
.builds-name {
  font-weight: 600;
}
.builds-sub {
  color: var(--muted);
}
.builds-points {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.builds-point input {
  width: 100%;
}
.builds-status {
  color: var(--muted);
}
.builds-status:empty {
  display: none;
}
```

- [ ] **Step 7: 실제 브라우저에서 확인한다**

```bash
node --test tests/*.test.mjs
node scripts/serve.mjs --port 4173
```

`http://localhost:4173`에서 확인한다.

1. 헤더의 ‘내 샘플’을 눌러 빈 목록과 안내가 나오는지.
2. 주소창에 `#builds=party`를 넣고 새로고침해 파티 탭으로 열리는지.
3. 샘플/파티 탭 전환 후 뒤로 가기가 이전 탭으로 돌아가는지.
4. JSON 내보내기로 파일이 받아지는지. 그 파일을 다시 가져오기로 넣었을 때 개수 안내가 나오고 중복이 늘어나지 않는지.
5. 형식이 아닌 파일(예: `README.md`)을 가져오기에 넣었을 때 안내만 나오고 목록이 비지 않는지.
6. 라이트/다크 양 테마, 360px 폭과 PC 폭.
7. 랭킹·도감·스피드 화면이 그대로 동작하는지(회귀).

- [ ] **Step 8: 커밋한다**

```bash
npm run format
git add index.html src/app.js src/styles.css sw.js
git commit -m "내 샘플 화면을 앱에 연결한다"
```

---

---

### Task 8: 브라우저 회귀 검증 스크립트

목록·저장·JSON 입출력은 DOM과 파일 API를 거치므로 `node --test`가 닿지 않는다. 이 저장소는 그 범위를 `scripts/verify-*-browser.mjs`로 덮는다. 같은 관례를 따른다.

**Files:**
- Create: `scripts/verify-builds-browser.mjs`
- Modify: `docs/verification.md` (끝에 절 추가)

**Interfaces:**
- Consumes: Task 7이 만든 화면. 새 export는 쓰지 않는다.
- Produces: 없다. 실행 가능한 검증 스크립트가 결과물이다.

기존 스크립트와 같은 방식으로 돈다. Playwright는 **의존성으로 추가하지 않고** 환경변수로 받는다.

```bash
node scripts/serve.mjs --port 4173   # 다른 터미널에서 먼저 띄운다
PLAYWRIGHT_MODULE=<playwright 모듈 경로> BROWSER_EXECUTABLE=<브라우저 실행 파일> \
  node scripts/verify-builds-browser.mjs
```

- [ ] **Step 1: 스크립트를 쓴다**

`scripts/verify-navigation-browser.mjs`의 앞부분(모듈 로드, 브라우저 실행, `pageerror` 수집, `context.route`로 API 가로채기)을 그대로 따른다. **새 방식을 만들지 않는다.**

```js
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// 이 화면은 통계를 쓰지 않는다. 외부 연결을 모두 막아 통계 장애와 무관하게
// 저장 기능만 검증한다.
await context.route('https://**/*', route => route.abort());

try {
  // 1. 빈 목록
  await page.goto('http://localhost:4173/#builds=sample');
  await page.locator('#builds .empty-state').waitFor({ state: 'visible' });

  // 2. 저장한 것이 새로고침 후에도 남는다
  await page.evaluate(() => {
    const doc = {
      samples: [
        {
          id: 'aaaaaaaaaaaaaaaa',
          name: '물리형 보만다',
          note: '스카프로 선공을 잡는다.',
          pokemon: 'salamence',
          form: null,
          ability: 'Intimidate',
          nature: 'adamant',
          points: [0, 32, 0, 0, 2, 32],
          moves: ['Dragon Claw', 'Earthquake', 'Dragon Dance', 'Roost'],
          altMoves: ['Fire Fang'],
          updatedAt: 0,
        },
      ],
      parties: [
        {
          id: 'p1p1p1p1p1p1p1p1',
          name: '스카프 선공 구축',
          note: '',
          members: ['aaaaaaaaaaaaaaaa', null, null, null, null, null],
          updatedAt: 0,
        },
      ],
      version: 1,
    };
    localStorage.setItem('champions:builds', JSON.stringify(doc));
  });
  await page.reload();
  await page.locator('#builds-rows').getByText('물리형 보만다').waitFor({ state: 'visible' });

  // 3. 검색
  await page.locator('#builds-search').fill('없는이름');
  await page.locator('#builds .empty-state').waitFor({ state: 'visible' });
  await page.locator('#builds-search').fill('');

  // 4. 파티 탭과 채운 자리 수
  await page.locator('[data-builds-tab="party"]').click();
  await page.locator('#builds-rows').getByText('스카프 선공 구축').waitFor({ state: 'visible' });
  assert.match(await page.locator('#builds-rows .builds-sub').first().innerText(), /1\/6/);

  // 5. 뒤로 가기가 이전 탭으로 돌아간다
  await page.goBack();
  assert.equal(
    await page.locator('[data-builds-tab="sample"]').getAttribute('aria-pressed'),
    'true',
  );

  // 6. 내보내기가 파일을 준다
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#builds-export').click(),
  ]);
  assert.match(download.suggestedFilename(), /^champions-builds-\d{4}-\d{2}-\d{2}\.json$/);

  // 7. 가져오기는 덮어쓰지 않고 합친다
  await page.locator('#builds-import').setInputFiles({
    name: 'builds.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        samples: [
          {
            id: 'bbbbbbbbbbbbbbbb',
            name: '가져온 샘플',
            note: '',
            pokemon: 'salamence',
            form: null,
            ability: null,
            nature: null,
            points: [0, 0, 0, 0, 0, 0],
            moves: [null, null, null, null],
            altMoves: [],
            updatedAt: 0,
          },
        ],
        parties: [],
        version: 0,
      }),
    ),
  });
  await page.locator('#builds-status').waitFor({ state: 'visible' });
  // 원래 있던 것이 지워지지 않았다.
  await page.locator('#builds-rows').getByText('물리형 보만다').waitFor({ state: 'visible' });
  await page.locator('#builds-rows').getByText('가져온 샘플').waitFor({ state: 'visible' });

  // 8. 형식이 아닌 파일은 안내만 내고 목록을 비우지 않는다
  await page.locator('#builds-import').setInputFiles({
    name: 'not-json.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('이것은 JSON이 아니다'),
  });
  assert.match(await page.locator('#builds-status').innerText(), /읽을 수 없습니다/);
  await page.locator('#builds-rows').getByText('물리형 보만다').waitFor({ state: 'visible' });

  await page.screenshot({ path: 'test-results/builds-mobile.png' });

  // 9. PC 폭과 다크 테마
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/builds-desktop-dark.png' });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
  );

  assert.deepEqual(errors, []);
  console.log('Builds list, storage and JSON exchange passed.');
} finally {
  await browser.close();
}
```

- [ ] **Step 2: 서버를 띄우고 실행한다**

```bash
node scripts/serve.mjs --port 4173
```

다른 터미널에서:

```bash
PLAYWRIGHT_MODULE=<경로> BROWSER_EXECUTABLE=<경로> node scripts/verify-builds-browser.mjs
```

Expected: `Builds list, storage and JSON exchange passed.`

실패하면 스크립트가 아니라 **앱을 고친다.** 스크립트의 기댓값을 앱에 맞춰 낮추지 않는다. 단, 선택자(`#builds-rows`, `.builds-sub` 등)가 Task 7이 실제로 만든 마크업과 다르면 그때는 선택자를 맞춘다.

- [ ] **Step 3: 스크린샷을 눈으로 본다**

`test-results/builds-mobile.png`와 `test-results/builds-desktop-dark.png`를 **열어서 본다.** 확인할 것: 다크 테마에서 목록 항목이 배경에 묻히지 않는지, 390px에서 조작 버튼들이 줄바꿈되어도 겹치지 않는지, 포켓몬 이름이 한국어로 나오는지.

`test-results/`는 `.prettierignore`와 Git에서 제외된다. 커밋하지 않는다.

- [ ] **Step 4: 검증 기록을 남긴다**

`docs/verification.md` 끝에 절을 더한다. 기존 절들과 같은 톤으로, **실제로 실행한 결과만** 적는다. 통과하지 않은 것을 통과했다고 적지 않는다.

```markdown
## 샘플과 파티 로컬 저장 검증 — 2026-09-22

`scripts/verify-builds-browser.mjs`: 빈 목록 안내, 저장한 샘플과 파티의 새로고침 후 유지,
이름 검색, 파티의 채운 자리 수, 탭 전환과 뒤로 가기, JSON 내보내기 파일 이름,
가져오기가 기존 항목을 지우지 않고 합치는 것, 형식이 아닌 파일의 안내와 목록 보존,
390px과 1280px 가로 넘침 없음, 다크 테마를 확인했습니다. 런타임 오류 0개.

이 화면은 통계 API를 쓰지 않으므로 외부 연결을 모두 차단한 상태로 검증했습니다.
```

- [ ] **Step 5: 커밋한다**

```bash
node --test tests/*.test.mjs
npm run format
git add scripts/verify-builds-browser.mjs docs/verification.md
git commit -m "내 샘플 화면의 브라우저 회귀 검증을 더한다"
```


## 남은 것

이 계획은 **목록과 저장까지**다. 편집 화면(`sampleEditor`, `partyEditor`)의 마크업은 Task 6에서 만들지만 Task 7은 그것을 화면에 띄우는 이벤트를 잇지 않는다. 사용자가 별도 계획으로 하기로 정했다.

- 샘플·파티 만들기와 고치기 흐름: 고르기 창(포켓몬, 특성, 성격, 기술, 도구), `setMove`로 맞바꿈, 저장 시 `validateSample` 결과 표시
- 삭제와 `partiesUsing` 확인 문구
- 편집 중 이탈 경고
- `README.md`의 ‘현재 기능’ 갱신

설계 문서의 2단계(배포와 APK), 3단계(동기화), 4단계(공유 링크)는 각각 별도 계획이다.
