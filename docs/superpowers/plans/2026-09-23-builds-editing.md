# 샘플과 파티 편집 흐름 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장된 샘플과 파티를 화면에서 만들고 고치고 지운다. 1단계가 남겨둔 편집 흐름을 완성한다.

**Architecture:** 편집기는 목록을 대체하는 하위 화면이며 주소는 `#builds=sample&edit=<id>`다. 고르는 방식은 후보 수에 따라 네이티브 `<select>`와 `<dialog>` 하나를 돌려 쓰는 검색 창으로 가른다. 고치는 동안에는 저장된 문서를 건드리지 않고 초안만 바꾸며, 초안은 `champions:builds-draft`에 계속 써 두어 나갔다 돌아와도 이어서 고친다. 판단은 `builds.js`, 마크업은 `builds-view.js`, 배선만 `app.js`가 맡는 기존 분리를 그대로 지킨다.

**Tech Stack:** 바닐라 ES 모듈, 런타임 의존성 없음, 네이티브 `<dialog>`·`<select>`, `node:test` + `t.assert.snapshot`, localStorage.

**설계 근거:** [docs/builds-and-sync.md](../../builds-and-sync.md)의 ‘편집’ 절

## Global Constraints

- Node.js 22 이상. **런타임 의존성을 추가하지 않는다.** 빌드 도구도 없다.
- 화면에 나오는 글은 모두 한국어다.
- Prettier 설정: `printWidth: 100`, `singleQuote: true`, `arrowParens: "avoid"`, `endOfLine: "crlf"`. 각 작업의 커밋 전에 `npm run format`을 실행한다. 이 명령은 `src/**`, `tests/**`, `scripts/**`, `sw.js`만 덮고 **`index.html`은 덮지 않으므로** 그 파일은 주변 들여쓰기에 손으로 맞춘다.
- 전체 검사는 `node --test tests/*.test.mjs`. 시작 시점에 243개가 통과한다. 스냅샷 갱신은 `node --test --test-update-snapshots tests/*.test.mjs`.
- `src/builds.js`와 `src/builds-view.js`는 **DOM을 쓰지 않는다.** `document`, `window`, `localStorage`를 직접 참조하지 않고 인자로 받는다.
- localStorage 키는 `champions:` 접두사를 쓴다. 이 기능은 `champions:builds`와 `champions:builds-draft` 두 개를 쓴다.
- 저장소가 막혔거나 내용이 깨져도 **예외를 밖으로 던지지 않는다.** `readDoc`과 같은 규칙으로 기본값으로 되돌아간다.
- 능력 포인트 범위는 각 칸 0 이상 32 이하 정수, 합계 66 이하다. 이 규칙은 `validateSample`에만 둔다. 형식 가드에 옮기지 않는다.
- 포켓몬·기술·도구·특성은 **영문 이름으로 저장**한다. 성격은 id(`adamant`)로 저장한다. 한국어 표시는 `locale.js`가 맡는다.
- `src/styles.css`는 기존 변수(`--ink`, `--muted`, `--line`, `--teal`, `--teal-soft`, `--bg`, `--white`, `--radius`)만 쓴다. **새 색을 만들지 않는다.**
- 네이티브 `confirm()`과 `alert()`를 쓰지 않는다. 이 앱은 확인을 `<dialog>`로 한다.

## 파일 구조

| 파일 | 이 계획에서의 책임 |
| --- | --- |
| `src/builds.js` (수정) | 초안 보관, 후보 기술 더하기·빼기, 능력 포인트 입력 해석 |
| `src/builds-view.js` (수정) | 편집기를 설계에 맞게 고치고 고르기 창 목록을 그린다 |
| `index.html` (수정) | `<dialog id="picker-dialog">`, 삭제 확인 `<dialog>` |
| `src/app.js` (수정) | 편집기 열기·닫기, 필드 배선, 고르기 창 배선, 저장·삭제 |
| `src/styles.css` (수정) | 편집기와 고르기 창 스타일 |
| `tests/builds.test.mjs` (수정) | 초안과 새 판단 함수 |
| `tests/builds-view.test.mjs` (수정) | 편집기와 고르기 창 스냅샷 |
| `scripts/verify-builds-browser.mjs` (수정) | 편집 흐름 회귀 |
| `README.md` (수정) | ‘현재 기능’에 내 샘플 추가 |

## 이미 있는 것 — 다시 만들지 않는다

`src/builds.js`가 내보내는 것: `NATURES`, `natureAdjust`, `emptySample`, `emptyParty`, `validateSample`, `validateParty`, `setMove`, `partiesUsing`, `deleteSample`, `EMPTY_DOC`, `readDoc`, `writeDoc`, `toJson`, `fromJson`, `mergeDocs`, `speciesOptions`, `abilityOptions`, `moveOptions`, `itemOptions`, `searchSamples`, `searchParties`.

`src/builds-view.js`가 내보내는 것: `sampleList`, `partyList`, `sampleEditor`, `partyEditor`.

`src/app.js`에 이미 있는 것: `state.buildsEditing`(현재 `null`), `renderBuilds()`, `openBuilds(tab, {navigate})`, `buildsSave()`, `BUILDS_TABS`, `toast(text)`, `loadingState(text)`.

기존 대화상자 셋(`effect-dialog`, `filter-dialog`, `about-dialog`)이 `showModal()`/`close()`로 동작한다. 새 창도 같은 방식이다.

## 일부러 넣지 않는 것

- **파티 안에서 샘플을 새로 만들지 않는다.** 구성원 고르기는 이미 저장된 샘플만 보여준다. 중첩 편집은 초안 관리가 급격히 복잡해진다.
- **되돌리기(undo)를 만들지 않는다.** 저장 전에는 ‘목록으로’가 곧 되돌리기이고, 저장 뒤에는 다시 고치면 된다.
- **고르기 창에 필터를 넣지 않는다.** 검색만 둔다. 타입·분류 필터가 필요해지면 그때 도감 화면의 필터를 가져온다.

---

### Task 1: 편집기를 설계에 맞춘다

특성과 성격은 후보가 적어 창을 열 필요가 없다. 네이티브 `<select>`로 바꾸고, 편집기에 저장·목록으로·삭제 버튼과 오류 표시 자리, 초안 복구 안내를 더한다.

**Files:**
- Modify: `src/builds-view.js`
- Modify: `tests/builds-view.test.mjs`, `tests/builds-view.test.mjs.snapshot`

**Interfaces:**
- Consumes: `NATURES`, `natureAdjust`, `abilityOptions` (`src/builds.js`)
- Produces: `sampleEditor(sample, { reference, locale, existing = false, resumed = false, errors = [] })`, `partyEditor(party, samples, { locale, existing = false, resumed = false, errors = [] })`

파티 편집기의 인자 모양이 바뀐다. 지금은 `partyEditor(party, samples, locale)`이고 앞으로는 세 번째가 객체다. 샘플 편집기와 모양을 맞춰 호출부가 헷갈리지 않게 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds-view.test.mjs`의 기존 `partyEditor(party, samples, locale)` 호출 두 곳을 `partyEditor(party, samples, { locale })`로 고치고, 파일 끝에 붙인다.

```js
test('특성과 성격은 창이 아니라 목록에서 고른다', () => {
  const html = sampleEditor(sample, { reference, locale });
  // 보만다의 특성은 위협과 자기과신 둘이다.
  assert.ok(html.includes('<select data-builds-field="ability"'));
  assert.ok(html.includes('위협'));
  assert.ok(html.includes('자기과신'));
  assert.ok(html.includes('<select data-builds-field="nature"'));
  assert.ok(html.includes('고집'));
  // 더 이상 버튼이 아니다.
  assert.equal(html.includes('data-builds-ability>'), false);
  assert.equal(html.includes('data-builds-nature>'), false);
});

test('고른 특성과 성격에 selected가 붙는다', () => {
  const html = sampleEditor(sample, { reference, locale });
  assert.ok(html.includes('value="Intimidate" selected'));
  assert.ok(html.includes('value="adamant" selected'));
});

test('포켓몬을 고르지 않으면 특성 목록이 비어 있다', () => {
  const html = sampleEditor({ ...emptySample(), id: 'dddddddddddddddd' }, { reference, locale });
  assert.ok(html.includes('먼저 포켓몬을 고르세요'));
});

test('저장한 적 있는 샘플에만 삭제 버튼이 있다', () => {
  assert.ok(sampleEditor(sample, { reference, locale, existing: true }).includes('data-builds-delete'));
  assert.equal(
    sampleEditor(sample, { reference, locale, existing: false }).includes('data-builds-delete'),
    false,
  );
});

test('저장을 막은 이유를 모두 보여준다', () => {
  const html = sampleEditor(sample, {
    reference,
    locale,
    errors: ['이름을 입력하세요.', '포켓몬을 고르세요.'],
  });
  assert.ok(html.includes('이름을 입력하세요.'));
  assert.ok(html.includes('포켓몬을 고르세요.'));
  assert.equal(html.includes('data-builds-errors hidden'), false);
});

test('오류가 없으면 오류 자리를 숨긴다', () => {
  assert.ok(sampleEditor(sample, { reference, locale }).includes('data-builds-errors hidden'));
});

test('초안을 이어서 고칠 때만 안내한다', () => {
  assert.ok(sampleEditor(sample, { reference, locale, resumed: true }).includes('이어서 고치는 중'));
  assert.equal(
    sampleEditor(sample, { reference, locale }).includes('이어서 고치는 중'),
    false,
  );
});

test('파티 편집기도 같은 인자 모양을 쓴다', t => {
  t.assert.snapshot(partyEditor(party, [sample], { locale, existing: true, errors: ['이름을 입력하세요.'] }));
});
```

> 자료로 확인한 값이다. 보만다의 특성은 `Intimidate`(위협)와 `Moxie`(자기과신) 둘이고, 성격을 한국어 이름순으로 정렬하면 개구쟁이·건방·겁쟁이·고집·냉정 순으로 시작한다. 이 값들이 실제와 다르게 나오면 자료가 바뀐 것이므로 **테스트를 고치지 말고 보고한다.**

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds-view.test.mjs`
Expected: FAIL — `<select data-builds-field="ability"`를 찾지 못함

- [ ] **Step 3: 구현한다**

`src/builds-view.js`의 import에 `NATURES`와 `abilityOptions`를 더한다.

```js
import { NATURES, natureAdjust, abilityOptions } from './builds.js';
```

`natureLabel` 아래에 붙인다.

```js
// 후보가 적은 항목은 창을 열지 않고 목록에서 고른다. 모바일에서는 OS 선택기가
// 떠서 가장 빠르고, 우리가 만들 코드가 거의 없다.
const choices = (items, selected, placeholder) =>
  `<option value="">${placeholder}</option>` +
  items
    .map(
      o =>
        `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>` +
        `${esc(o.label)}</option>`,
    )
    .join('');

// 성격은 한국어 이름순으로 고른다. 저장은 id로 한다.
const natureChoices = locale =>
  Object.keys(NATURES)
    .map(id => ({ value: id, label: natureLabel(locale, id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));

// 경고 상자는 이미 .notice가 있다. 라이트와 다크가 함께 정의돼 있으므로 새 색을
// 만들지 않고 그대로 쓴다.
const errorList = errors =>
  `<ul class="builds-errors notice" data-builds-errors${errors.length ? '' : ' hidden'}>` +
  `${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;

const editorActions = existing =>
  `<div class="builds-actions">` +
  `<button type="submit" class="primary-button" data-builds-save>저장</button>` +
  `<button type="button" class="text-button" data-builds-cancel>목록으로</button>` +
  `${existing ? '<button type="button" class="text-button builds-delete" data-builds-delete>삭제</button>' : ''}` +
  `</div>`;

const resumeNote = resumed =>
  resumed
    ? '<p class="builds-resume">이어서 고치는 중입니다. 저장하지 않은 내용이 남아 있었습니다.</p>'
    : '';
```

`sampleEditor`를 바꾼다. 이름·포켓몬·도구 부분과 능력 포인트 아래는 그대로 두고, 특성과 성격 버튼 두 줄을 아래로 교체하며 시그니처와 앞뒤를 고친다.

```js
export function sampleEditor(
  sample,
  { reference, locale, existing = false, resumed = false, errors = [] },
) {
  const total = sample.points.reduce((a, b) => a + b, 0);
  const abilities = abilityOptions(reference, sample.pokemon).map(name => ({
    value: name,
    label: locale.label('ability', name),
  }));
  return (
    `<form class="builds-editor" data-builds-form="sample">` +
    `${resumeNote(resumed)}${errorList(errors)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(sample.name)}" data-builds-field="name" placeholder="예: 스카프 보만다"></label>` +
    `<button type="button" class="builds-pick builds-species" data-builds-species>` +
    `${esc(speciesLabel(locale, reference, sample.pokemon))}</button>` +
    `<button type="button" class="builds-pick" data-builds-item>` +
    `${sample.item ? esc(locale.label('held_item', sample.item)) : '도구 고르기'}</button>` +
    `<label class="builds-field">특성<select data-builds-field="ability"${abilities.length ? '' : ' disabled'}>` +
    `${choices(abilities, sample.ability, abilities.length ? '특성 고르기' : '먼저 포켓몬을 고르세요')}` +
    `</select></label>` +
    `<label class="builds-field">능력 보정<select data-builds-field="nature">` +
    `${choices(natureChoices(locale), sample.nature, '보정 고르기')}` +
    `</select></label>` +
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
    `${editorActions(existing)}` +
    `</form>`
  );
}
```

`partyEditor`의 시그니처와 앞뒤를 고친다. 가운데 구성원 목록은 그대로다.

```js
export function partyEditor(
  party,
  samples,
  { locale, existing = false, resumed = false, errors = [] },
) {
  const names = new Map(samples.map(s => [s.id, s.name]));
  return (
    `<form class="builds-editor" data-builds-form="party">` +
    `${resumeNote(resumed)}${errorList(errors)}` +
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
    `${editorActions(existing)}` +
    `</form>`
  );
}
```

- [ ] **Step 4: 스냅샷을 갱신하고 읽는다**

```bash
node --test --test-update-snapshots tests/builds-view.test.mjs
```

`tests/builds-view.test.mjs.snapshot`을 **열어서 읽는다.** 스냅샷은 만들면 무조건 통과하므로 눈으로 봐야 의미가 있다. 확인할 것:

- 특성 `<select>` 안에 보만다의 특성 둘이 한국어로 있고 `Intimidate`에 `selected`가 붙어 있다
- 성격 `<select>`에 25개가 한국어 이름순으로 있고 `adamant`에 `selected`가 붙어 있다
- 저장·목록으로 버튼이 있고, `existing: true`인 스냅샷에만 삭제가 있다
- 기존 값(`보만다`, `구애스카프`, `AS + d`, 이스케이프된 설명)이 그대로다

```bash
node --test tests/*.test.mjs
```

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds-view.js tests/builds-view.test.mjs tests/builds-view.test.mjs.snapshot
git commit -m "편집기에 저장과 삭제를 두고 특성과 성격을 목록에서 고른다"
```

---

### Task 2: 초안을 보관한다

고치는 동안 저장된 문서를 건드리지 않고, 나갔다 돌아와도 이어서 고칠 수 있게 초안을 따로 써 둔다.

**Files:**
- Modify: `src/builds.js`
- Modify: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: `EMPTY_DOC`, `emptySample`, `emptyParty`
- Produces: `DRAFT_KEY`, `readDrafts(storage) → object`, `writeDrafts(storage, drafts) → boolean`, `draftKey(kind, id) → string`, `pruneDrafts(drafts, doc) → object`

`kind`는 `'sample'` 또는 `'party'`다. 새로 만드는 중이면 `id`가 `null`이고 키는 `new-sample`·`new-party`가 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds.test.mjs`의 import에 `DRAFT_KEY`, `readDrafts`, `writeDrafts`, `draftKey`, `pruneDrafts`를 더하고 파일 끝에 붙인다.

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `draftKey is not a function`

- [ ] **Step 3: 구현한다**

`src/builds.js`의 `const KEY = 'champions:builds';` 아래에 붙인다.

```js
export const DRAFT_KEY = 'champions:builds-draft';
```

파일 끝에 붙인다.

```js
// 고치는 동안의 초안. 저장된 문서와 따로 두어 저장을 누르기 전에는 문서가 바뀌지
// 않는다. 나갔다 돌아와도 이어서 고칠 수 있고 브라우저를 그냥 닫아도 잃지 않는다.
// 새로 만드는 중인 것과 고치는 중인 것을 한 객체에 담되 키를 달리해, 여러 개를
// 고치다 말아도 서로 덮어쓰지 않는다.
export const draftKey = (kind, id) => id ?? `new-${kind}`;

export function readDrafts(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(DRAFT_KEY));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeDrafts(storage, drafts) {
  try {
    if (!storage) return false;
    storage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

// 지워진 샘플이나 파티의 초안은 돌아갈 곳이 없다. 앱을 열 때 털어낸다.
export function pruneDrafts(drafts, doc) {
  const live = new Set([
    'new-sample',
    'new-party',
    ...doc.samples.map(s => s.id),
    ...doc.parties.map(p => p.id),
  ]);
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => live.has(key)));
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test tests/builds.test.mjs
node --test tests/*.test.mjs
```

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "고치는 중인 초안을 따로 보관한다"
```

---

### Task 3: 후보 기술 더하기·빼기와 포인트 입력 해석

편집기가 바꿔야 하는 값 중 규칙이 있는 것들이다. DOM 없이 검사할 수 있도록 `builds.js`에 둔다.

**Files:**
- Modify: `src/builds.js`
- Modify: `tests/builds.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `addAltMove(sample, move) → sample`, `removeAltMove(sample, move) → sample`, `setPoint(sample, index, raw) → sample`

`setPoint`의 `raw`는 `<input type="number">`에서 읽은 문자열이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import에 `addAltMove`, `removeAltMove`, `setPoint`를 더하고 파일 끝에 붙인다.

```js
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
```

> `built()`는 이 파일에 이미 있다. `moves`가 `['A','B','C','D']`, `altMoves`가 `['E','F','G']`, `points`가 여섯 칸 0인 샘플이다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `addAltMove is not a function`

- [ ] **Step 3: 구현한다**

`src/builds.js`의 `setMove` 아래에 붙인다.

```js
// 채용했거나 이미 후보인 기술은 다시 넣지 않는다. validateSample이 같은 중복을
// 저장 단계에서도 막지만, 넣을 수 없는 것을 넣게 두었다가 저장할 때 거절하는 것은
// 불친절하다.
export function addAltMove(sample, move) {
  if (!move || sample.moves.includes(move) || sample.altMoves.includes(move)) return sample;
  return { ...sample, altMoves: [...sample.altMoves, move] };
}

export const removeAltMove = (sample, move) => ({
  ...sample,
  altMoves: sample.altMoves.filter(m => m !== move),
});

// 입력 칸에서 읽은 문자열을 해석한다. 빈 칸은 0이고, 정수가 아니거나 0~32 밖이면
// 이전 값을 지킨다. 화면에서 만들 수 없는 값을 만들지 않는 편이 저장할 때
// 거절하는 것보다 낫다. 합계 66은 여러 칸이 함께 정해지므로 validateSample이 본다.
export function setPoint(sample, index, raw) {
  const text = String(raw ?? '').trim();
  const value = text === '' ? 0 : Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 32) return sample;
  return { ...sample, points: sample.points.map((p, i) => (i === index ? value : p)) };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test tests/builds.test.mjs
node --test tests/*.test.mjs
```

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -m "후보 기술을 더하고 빼며 포인트 입력을 해석한다"
```

---

### Task 4: 고르기 창

포켓몬 349개, 도구 166개, 기술 60개 안팎은 `<select>`로 찾을 수 없다. 검색창이 있는 창 **하나**를 셋이 돌려 쓴다. 자료만 다르고 조작은 같으므로 창을 세 개 만들지 않는다.

**Files:**
- Modify: `src/builds-view.js`
- Modify: `index.html`
- Modify: `tests/builds-view.test.mjs`, `tests/builds-view.test.mjs.snapshot`

**Interfaces:**
- Consumes: `esc` (`src/html.js`)
- Produces: `pickerRows(rows, limit) → string` — `rows`는 `[{ value, label, sub }]`이고 `sub`는 없으면 빈 문자열이다.

`value`는 저장할 값(영문 이름 또는 샘플 id), `label`은 화면에 보일 한국어, `sub`는 부제(포켓몬은 타입, 기술은 분류, 샘플은 포켓몬 이름)다. 자료를 행으로 바꾸는 일은 Task 5에서 `app.js`가 한다. 이 파일은 그리기만 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds-view.test.mjs`의 import에 `pickerRows`를 더하고 파일 끝에 붙인다.

```js
const pickerFixture = [
  { value: 'Salamence', label: '보만다', sub: '드래곤 · 비행' },
  { value: 'Charizard', label: '리자몽', sub: '불꽃 · 비행' },
  { value: 'Dragonite', label: '망나뇽', sub: '드래곤 · 비행' },
];

test('고르기 창은 값과 한국어 이름과 부제를 보여준다', t => {
  t.assert.snapshot(pickerRows(pickerFixture, 10));
});

test('고르기 창은 한 번에 보여줄 수를 제한한다', () => {
  const html = pickerRows(pickerFixture, 2);
  assert.ok(html.includes('보만다'));
  assert.ok(html.includes('리자몽'));
  assert.equal(html.includes('망나뇽'), false);
});

test('부제가 없으면 자리를 만들지 않는다', () => {
  const html = pickerRows([{ value: 'A', label: '가', sub: '' }], 10);
  assert.equal(html.includes('picker-sub'), false);
});

test('찾는 것이 없으면 안내한다', () => {
  assert.ok(pickerRows([], 10).includes('찾는 항목이 없습니다'));
});

test('값과 이름을 이스케이프한다', () => {
  const html = pickerRows([{ value: '<v>', label: '<이름>', sub: '<부제>' }], 10);
  assert.ok(html.includes('&lt;이름&gt;'));
  assert.ok(html.includes('&lt;v&gt;'));
  assert.equal(html.includes('<이름>'), false);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds-view.test.mjs`
Expected: FAIL — `pickerRows is not a function`

- [ ] **Step 3: 구현한다**

`src/builds-view.js` 끝에 붙인다.

```js
// 포켓몬·도구·기술·샘플이 같은 창을 돌려 쓴다. 자료를 행으로 바꾸는 일은 app.js가
// 하고 여기서는 그리기만 한다. 셋의 조작이 같으므로 창을 나누지 않는다.
export function pickerRows(rows, limit) {
  if (!rows.length) return '<div class="empty-state"><p>찾는 항목이 없습니다.</p></div>';
  return `<ul class="picker-list">${rows
    .slice(0, limit)
    .map(
      row =>
        `<li><button type="button" class="picker-row" data-picker-value="${esc(row.value)}">` +
        `<span class="picker-name">${esc(row.label)}</span>` +
        `${row.sub ? `<small class="picker-sub">${esc(row.sub)}</small>` : ''}` +
        `</button></li>`,
    )
    .join('')}</ul>`;
}
```

`index.html`의 `<dialog id="filter-dialog" ...>` 다음 줄에 창을 더한다. 기존 대화상자들과 같은 구조(제목 + 닫기 버튼 + 본문)를 따른다.

```html
  <dialog id="picker-dialog" aria-labelledby="picker-title"><div class="dialog-heading"><h2 id="picker-title">고르기</h2><button type="button" id="close-picker" class="icon-button" aria-label="고르기 닫기">×</button></div><div class="search-box"><span aria-hidden="true">⌕</span><input id="picker-search" type="search" placeholder="이름, 초성, 영문 검색" autocomplete="off" aria-label="고르기 검색"></div><p id="picker-help" class="builds-resume" hidden></p><div id="picker-rows"></div><button type="button" id="picker-more" class="load-more" hidden>더 보기</button></dialog>
```

삭제 확인 창도 같은 자리에 더한다. 네이티브 `confirm()`을 쓰지 않는 앱 관례를 따른다.

```html
  <dialog id="confirm-dialog" aria-labelledby="confirm-title"><div class="dialog-heading"><h2 id="confirm-title">삭제</h2><button type="button" id="close-confirm" class="icon-button" aria-label="삭제 취소">×</button></div><p id="confirm-body"></p><div class="filter-actions"><button type="button" id="cancel-confirm" class="text-button">취소</button><button type="button" id="accept-confirm" class="primary-button">삭제</button></div></dialog>
```

- [ ] **Step 4: 스냅샷을 갱신하고 읽는다**

```bash
node --test --test-update-snapshots tests/builds-view.test.mjs
```

스냅샷을 **열어서** 세 줄이 `보만다 / 드래곤 · 비행` 꼴로 나오는지 확인한다.

```bash
node --test tests/*.test.mjs
```

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds-view.js index.html tests/builds-view.test.mjs tests/builds-view.test.mjs.snapshot
git commit -m "고르기 창과 삭제 확인 창을 만든다"
```

---

### Task 5: 편집기를 열고 닫고 필드를 잇는다

**Files:**
- Modify: `src/app.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 1~3의 모든 export
- Produces: `openBuildsEditor(kind, id, { navigate })`, `closeBuildsEditor()`, `renderBuildsEditor()`, `saveDraft()`

이 작업은 편집기를 화면에 띄우고 이름·설명·포인트·특성·성격을 고칠 수 있게 한다. **고르기 창(포켓몬·도구·기술·구성원)과 저장·삭제는 다음 두 작업이다.** 이 작업이 끝난 시점에 저장 버튼은 아직 아무 일도 하지 않는다.

- [ ] **Step 1: import와 상태를 더한다**

`src/app.js`의 `./builds.js` import에 더한다.

```js
import {
  readDoc,
  writeDoc,
  toJson,
  fromJson,
  mergeDocs,
  searchSamples,
  searchParties,
  emptySample,
  emptyParty,
  setPoint,
  readDrafts,
  writeDrafts,
  draftKey,
  pruneDrafts,
} from './builds.js';
```

`./builds-view.js` import에 더한다.

```js
import { sampleList, partyList, sampleEditor, partyEditor } from './builds-view.js';
```

`state`의 `buildsEditing: null,` 아래에 더한다.

```js
  buildsDrafts: {},
  buildsErrors: [],
  buildsResumed: false,
```

앱이 시작할 때 초안을 읽고 정리한다. `state.builds = readDoc(storage)`가 이미 상태 정의 안에 있으므로, 그 아래 초기화 구역(`loadReference();`가 있는 곳 근처)에 한 줄 더한다.

```js
// 지워진 샘플의 초안은 돌아갈 곳이 없다. 열 때 한 번 털어낸다.
state.buildsDrafts = pruneDrafts(readDrafts(storage), state.builds);
writeDrafts(storage, state.buildsDrafts);
```

- [ ] **Step 2: 여닫기와 그리기를 더한다**

`openBuilds` 아래에 붙인다.

```js
function saveDraft() {
  const editing = state.buildsEditing;
  if (!editing) return;
  state.buildsDrafts = { ...state.buildsDrafts, [draftKey(editing.kind, editing.id)]: editing.draft };
  writeDrafts(storage, state.buildsDrafts);
}

function dropDraft(kind, id) {
  const { [draftKey(kind, id)]: _removed, ...rest } = state.buildsDrafts;
  state.buildsDrafts = rest;
  writeDrafts(storage, state.buildsDrafts);
}

function renderBuildsEditor() {
  const editing = state.buildsEditing;
  if (!editing || state.page !== 'builds' || !state.locale || !state.reference) return;
  const shared = {
    locale: state.locale,
    existing: editing.id !== null,
    resumed: state.buildsResumed,
    errors: state.buildsErrors,
  };
  $('builds-rows').innerHTML =
    editing.kind === 'sample'
      ? sampleEditor(editing.draft, { reference: state.reference, ...shared })
      : partyEditor(editing.draft, state.builds.samples, shared);
}

function openBuildsEditor(kind, id, { navigate = true } = {}) {
  const list = kind === 'sample' ? state.builds.samples : state.builds.parties;
  const saved = id === null ? null : (list.find(x => x.id === id) ?? null);
  // 주소로 들어왔는데 그 id가 없으면 목록으로 돌려보낸다.
  if (id !== null && !saved) {
    openBuilds(kind, { navigate });
    return;
  }
  const kept = state.buildsDrafts[draftKey(kind, id)];
  const base = saved ?? (kind === 'sample' ? emptySample() : emptyParty());
  state.buildsResumed = !!kept;
  state.buildsErrors = [];
  state.buildsEditing = { kind, id, draft: kept ?? base };
  state.buildsTab = kind;
  showPage('builds');
  if (navigate)
    history.pushState({ builds: kind, edit: id ?? 'new' }, '', `#builds=${kind}&edit=${id ?? 'new'}`);
  renderBuildsEditor();
  window.scrollTo(0, 0);
}

function closeBuildsEditor({ navigate = true } = {}) {
  state.buildsEditing = null;
  state.buildsErrors = [];
  state.buildsResumed = false;
  openBuilds(state.buildsTab, { navigate });
}
```

`renderBuilds()`에 편집 중이면 편집기를 그리는 분기를 더한다. **`state.locale` 가드보다 뒤에 넣는다.** 편집기는 특성·성격·도구 이름을 한국어로 그리므로 locale이 없으면 터진다. 주소로 편집 화면에 바로 들어오면 locale이 아직 도착하지 않은 상태가 실제로 일어난다.

`state.reference`도 같이 확인한다. `abilityOptions`와 `moveOptions`, `speciesOptions`가 `reference.species`를 옵셔널 체이닝 없이 참조하므로 도감 자료가 없으면 던진다. 편집기는 도감 없이는 포켓몬도 특성도 고를 수 없으니 도착할 때까지 ‘불러오는 중’을 보여주는 것이 맞다. 목록 화면은 자료가 없어도 저장된 id를 보여줄 수 있지만 편집기는 할 수 있는 일이 없다.

```js
  if (!state.locale) {
    $('builds-rows').innerHTML = loadingState('한국어 명칭을 불러오는 중입니다.');
    return;
  }
  if (state.buildsEditing) return renderBuildsEditor();
  const { samples, parties } = state.builds;
```

`renderBuildsEditor()` 자체도 같은 이유로 locale을 확인한다. 이미 그린 뒤 자료가 도착해 다시 그려지는 경로가 있기 때문이다.

```js
function renderBuildsEditor() {
  const editing = state.buildsEditing;
  if (!editing || state.page !== 'builds' || !state.locale || !state.reference) return;
```

- [ ] **Step 3: 이벤트를 잇는다**

`$('builds-search')` 배선 근처에 붙인다. 편집기 안의 요소는 `innerHTML`로 다시 그려지므로 **개별 리스너를 붙이지 않고 `#builds-rows`에 위임한다.**

```js
$('builds-rows').addEventListener('click', event => {
  const newBuild = event.target.closest('[data-builds-new]');
  if (newBuild) {
    openBuildsEditor(newBuild.dataset.buildsNew, null);
    return;
  }
  const openSample = event.target.closest('[data-builds-sample]');
  if (openSample) {
    openBuildsEditor('sample', openSample.dataset.buildsSample);
    return;
  }
  const openParty = event.target.closest('[data-builds-party]');
  if (openParty) {
    openBuildsEditor('party', openParty.dataset.buildsParty);
    return;
  }
  if (event.target.closest('[data-builds-cancel]')) closeBuildsEditor();
});

// 이름과 설명은 입력할 때마다 초안에 담는다. 다시 그리면 커서가 튀므로 그리지 않는다.
$('builds-rows').addEventListener('input', event => {
  const field = event.target.closest('[data-builds-field]');
  if (!field || !state.buildsEditing) return;
  const name = field.dataset.buildsField;
  if (name !== 'name' && name !== 'note') return;
  state.buildsEditing.draft = { ...state.buildsEditing.draft, [name]: field.value };
  saveDraft();
});

// 포인트와 목록 선택은 값이 정해진 뒤에 다시 그린다.
$('builds-rows').addEventListener('change', event => {
  if (!state.buildsEditing) return;
  const point = event.target.closest('[data-builds-point]');
  if (point) {
    state.buildsEditing.draft = setPoint(
      state.buildsEditing.draft,
      Number(point.dataset.buildsPoint),
      point.value,
    );
    saveDraft();
    renderBuildsEditor();
    return;
  }
  const field = event.target.closest('[data-builds-field]');
  if (!field) return;
  const name = field.dataset.buildsField;
  if (name !== 'ability' && name !== 'nature') return;
  state.buildsEditing.draft = { ...state.buildsEditing.draft, [name]: field.value || null };
  saveDraft();
  renderBuildsEditor();
});

// 편집기는 form이라 Enter로 제출될 수 있다. 저장 배선은 다음 작업이므로 여기서는
// 새로고침만 막는다.
$('builds-rows').addEventListener('submit', event => event.preventDefault());
```

- [ ] **Step 4: 주소를 잇는다**

`popstate` 처리의 `builds` 분기를 고친다.

```js
  if (params.has('builds')) {
    const edit = params.get('edit');
    if (edit) openBuildsEditor(params.get('builds'), edit === 'new' ? null : edit, { navigate: false });
    else {
      state.buildsEditing = null;
      openBuilds(params.get('builds'), { navigate: false });
    }
    return;
  }
```

시작 처리도 같이 고친다.

```js
const startupBuilds = new URLSearchParams(location.hash.slice(1)).get('builds');
if (startupBuilds !== null) {
  const startupEdit = new URLSearchParams(location.hash.slice(1)).get('edit');
  if (startupEdit)
    openBuildsEditor(startupBuilds, startupEdit === 'new' ? null : startupEdit, { navigate: false });
  else openBuilds(startupBuilds, { navigate: false });
}
```

- [ ] **Step 5: 스타일을 더한다**

`src/styles.css` 끝에 붙인다. **기존 변수만 쓴다.**

```css
.builds-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}
/* 삭제에 별도 색을 주지 않는다. 실수를 막는 것은 색이 아니라 확인 창이고,
   이 앱에 없는 색을 새로 들이는 값어치가 없다. 자리만 떨어뜨려 둔다. */
.builds-delete {
  margin-inline-start: auto;
}
/* 색과 테두리는 .notice가 이미 준다. 여기서는 목록 모양만 지운다. */
.builds-errors {
  list-style: none;
  display: grid;
  gap: 0.25rem;
}
.builds-errors:not([hidden]) {
  padding-inline-start: 1rem;
}
.builds-resume {
  margin: 0;
  color: var(--muted);
}
.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.picker-row {
  width: 100%;
  text-align: left;
  display: grid;
  gap: 0.1rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--white);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
}
.picker-row:hover {
  border-color: var(--teal);
}
.picker-sub {
  color: var(--muted);
}
#picker-rows {
  max-height: 55vh;
  overflow-y: auto;
}
```

> 새 색을 하나도 들이지 않는다. 오류 상자는 기존 `.notice`(`styles.css:282`, 다크는 `styles.css:1923`)를 덧붙여 쓰고, 삭제 버튼은 기존 `.text-button` 그대로 둔다. 이 저장소는 `:root` 변수 밖에서도 색을 직접 적고 `[data-theme='dark']`로 다시 적는 방식을 쓰지만, 이번 작업에는 그럴 필요가 없다.

- [ ] **Step 6: 확인하고 커밋한다**

```bash
node --test tests/*.test.mjs
node scripts/serve.mjs --port 4173
```

브라우저에서 확인한다.

1. 목록의 ‘샘플 만들기’를 누르면 빈 편집기가 열리고 주소가 `#builds=sample&edit=new`가 된다.
2. 이름을 입력하고 목록으로 → 다시 들어가면 입력한 이름이 남아 있고 ‘이어서 고치는 중’이 보인다.
3. 능력 포인트에 33을 넣으면 값이 되돌아간다. 32는 들어간다.
4. 성격 목록에서 고르면 편집기가 다시 그려지며 선택이 유지된다.
5. 뒤로가기가 목록으로 돌아간다.
6. 기존 다섯 화면이 그대로 동작한다.

```bash
npm run format
git add src/app.js src/styles.css
git commit -m "편집기를 열고 닫으며 이름과 포인트와 보정을 고친다"
```

---

### Task 6: 고르기 창을 잇는다

**Files:**
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `pickerRows` (`src/builds-view.js`), `speciesOptions`·`itemOptions`·`moveOptions`·`setMove`·`addAltMove`·`removeAltMove` (`src/builds.js`), `matchesQuery` (`src/data.js`), `TYPE_LABELS` (`src/locale.js`)
- Produces: 없다. 다음 작업이 쓸 새 export는 없다.

- [ ] **Step 1: import를 더한다**

```js
import { pickerRows } from './builds-view.js';
```

`./builds.js` import에 `speciesOptions`, `itemOptions`, `moveOptions`, `setMove`, `addAltMove`, `removeAltMove`를 더한다. `matchesQuery`는 `./data.js`에서, `TYPE_LABELS`는 `./locale.js`에서 이미 불러오고 있는지 확인하고 없으면 더한다.

- [ ] **Step 2: 창을 여는 코드를 더한다**

`openBuildsEditor` 아래에 붙인다.

```js
const PICKER_TITLES = {
  species: '포켓몬 고르기',
  item: '도구 고르기',
  move: '기술 고르기',
  member: '샘플 고르기',
};

// 네 가지가 같은 창을 쓴다. 무엇을 고르는 중인지와 어디에 넣을지를 들고 있는다.
let picker = null;

function pickerSource() {
  const draft = state.buildsEditing?.draft;
  if (!picker || !draft) return [];
  if (picker.kind === 'species')
    return speciesOptions(state.reference, state.locale, '').map(row => ({
      value: row.name,
      label: row.label,
      sub: row.types.map(t => TYPE_LABELS[t] ?? t).join(' · '),
      dex: row.dex,
      name: row.name,
    }));
  if (picker.kind === 'item')
    return itemOptions(state.reference).map(name => ({
      value: name,
      label: state.locale.label('held_item', name),
      sub: '',
      name,
    }));
  if (picker.kind === 'move') {
    const learnable = moveOptions(state.reference, draft.pokemon);
    const names = learnable ?? Object.values(state.reference.move).map(m => m.name);
    return names.map(name => ({
      value: name,
      label: state.locale.label('move', name),
      sub: '',
      name,
    }));
  }
  return state.builds.samples.map(s => ({
    value: s.id,
    label: s.name,
    sub: s.pokemon ? state.locale.pokemon(state.reference?.species?.[s.pokemon]?.name ?? s.pokemon).label : '',
    name: s.name,
  }));
}

function renderPicker() {
  const rows = pickerSource().filter(row => matchesQuery(row, picker.query));
  $('picker-rows').innerHTML = pickerRows(rows, picker.limit);
  $('picker-more').hidden = rows.length <= picker.limit;
}

function openPicker(kind, slot = null) {
  const draft = state.buildsEditing?.draft;
  if (!draft) return;
  if (kind === 'move' && !draft.pokemon) {
    toast('먼저 포켓몬을 고르세요.');
    return;
  }
  picker = { kind, slot, query: '', limit: 50 };
  $('picker-title').textContent = PICKER_TITLES[kind];
  $('picker-search').value = '';
  const missing = kind === 'move' && moveOptions(state.reference, draft.pokemon) === null;
  $('picker-help').hidden = !missing;
  if (missing)
    $('picker-help').textContent =
      '이 폼의 배우는 기술 자료가 없어 도감 전체에서 고릅니다. 실제로 배우는지는 확인되지 않습니다.';
  renderPicker();
  $('picker-dialog').showModal();
}
```

- [ ] **Step 3: 고른 값을 넣는 코드를 더한다**

```js
function applyPicked(value) {
  const editing = state.buildsEditing;
  if (!editing || !picker) return;
  const draft = editing.draft;
  if (picker.kind === 'species')
    // 포켓몬이 바뀌면 그 포켓몬의 것이 아닌 특성이 남는다. 특성만 비운다.
    // 기술은 사용자가 고른 것이므로 임의로 지우지 않는다.
    editing.draft = { ...draft, pokemon: value, ability: null };
  else if (picker.kind === 'item') editing.draft = { ...draft, item: value };
  else if (picker.kind === 'member')
    editing.draft = { ...draft, members: draft.members.map((m, i) => (i === picker.slot ? value : m)) };
  else if (picker.slot === 'alt') editing.draft = addAltMove(draft, value);
  else {
    const swapped = draft.altMoves.includes(value);
    const previous = draft.moves[picker.slot];
    editing.draft = setMove(draft, picker.slot, value);
    // 후보와 자리를 맞바꾼 것은 화면만 보고는 알 수 없다.
    if (swapped && previous)
      toast(`후보의 ${state.locale.label('move', value)}와 자리를 바꿨습니다.`);
  }
  picker = null;
  $('picker-dialog').close();
  saveDraft();
  renderBuildsEditor();
}
```

- [ ] **Step 4: 이벤트를 잇는다**

Task 5에서 만든 `$('builds-rows')` 클릭 위임에 분기를 더한다. `cancel` 분기 앞에 넣는다.

```js
  if (event.target.closest('[data-builds-species]')) return openPicker('species');
  if (event.target.closest('[data-builds-item]')) return openPicker('item');
  if (event.target.closest('[data-builds-alt-add]')) return openPicker('move', 'alt');
  const moveSlot = event.target.closest('[data-builds-move]');
  if (moveSlot) return openPicker('move', Number(moveSlot.dataset.buildsMove));
  const memberSlot = event.target.closest('[data-builds-member]');
  if (memberSlot) return openPicker('member', Number(memberSlot.dataset.buildsMember));
  const altRemove = event.target.closest('[data-builds-alt-remove]');
  if (altRemove) {
    state.buildsEditing.draft = removeAltMove(
      state.buildsEditing.draft,
      altRemove.dataset.buildsAltRemove,
    );
    saveDraft();
    renderBuildsEditor();
    return;
  }
```

헤더의 ‘새로 만들기’ 버튼도 잇는다. `index.html:101`의 `#builds-new`는 `.builds-controls` 안에 있어 `#builds-rows` 위임이 닿지 않는다. 빈 상태의 만들기 버튼은 목록이 비었을 때만 나오므로, 이것을 잇지 않으면 **샘플이 하나라도 생긴 뒤에는 새로 만들 방법이 없다.** 어느 것을 만들지는 지금 보고 있는 탭이 정한다.

```js
$('builds-new').onclick = () => openBuildsEditor(state.buildsTab, null);
```

창 자체의 배선은 기존 대화상자들 근처에 붙인다.

```js
$('close-picker').onclick = () => {
  picker = null;
  $('picker-dialog').close();
};
$('picker-search').addEventListener('input', event => {
  if (!picker) return;
  picker.query = event.target.value;
  picker.limit = 50;
  renderPicker();
});
$('picker-more').addEventListener('click', () => {
  if (!picker) return;
  picker.limit += 50;
  renderPicker();
});
$('picker-rows').addEventListener('click', event => {
  const row = event.target.closest('[data-picker-value]');
  if (row) applyPicked(row.dataset.pickerValue);
});
// Escape로 닫아도 고르는 중이라는 상태가 남지 않게 한다.
$('picker-dialog').addEventListener('close', () => {
  picker = null;
});
```

- [ ] **Step 5: 확인하고 커밋한다**

```bash
node --test tests/*.test.mjs
node scripts/serve.mjs --port 4173
```

브라우저에서 확인한다.

1. 포켓몬 고르기에서 `리자몽`, `ㄹㅈㅁ`, `6`으로 찾아지고 고르면 편집기에 반영된다.
2. 포켓몬을 고르면 특성 목록이 그 포켓몬의 것으로 바뀐다.
3. 포켓몬을 고르지 않은 채 기술 고르기를 누르면 ‘먼저 포켓몬을 고르세요’가 뜬다.
4. 기술 4번 칸을 후보에 있는 기술로 바꾸면 후보 자리에 원래 기술이 들어가고 토스트가 뜬다.
5. ‘더 보기’가 50개 넘는 목록에서 동작한다.
6. 파티 편집에서 구성원 칸을 누르면 저장된 샘플이 보인다.
7. **샘플이 이미 하나 있는 상태에서** 헤더의 ‘새로 만들기’를 누르면 빈 편집기가 열린다. 파티 탭에서 누르면 파티 편집기가 열린다.

```bash
npm run format
git add src/app.js
git commit -m "포켓몬과 도구와 기술과 구성원을 창에서 고른다"
```

---

### Task 7: 저장과 삭제, 그리고 문서

**Files:**
- Modify: `src/app.js`
- Modify: `scripts/verify-builds-browser.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `validateSample`, `validateParty`, `partiesUsing`, `deleteSample` (`src/builds.js`); Task 5가 만든 `dropDraft(kind, id)`, `closeBuildsEditor({navigate})`, `renderBuildsEditor()`와 기존 `buildsSave()`, `toast(text)` (`src/app.js`)
- Produces: 없다.

`buildsSave()`는 `state.builds`를 저장소에 쓰고 실패하면 `false`를 주며 안내 문구를 이미 띄운다. `dropDraft`는 그 항목의 초안을 지우고 저장소에 반영한다.

- [ ] **Step 1: 저장을 잇는다**

`./builds.js` import에 `validateSample`, `validateParty`, `partiesUsing`, `deleteSample`을 더한다. `applyPicked` 아래에 붙인다.

```js
function commitBuild() {
  const editing = state.buildsEditing;
  if (!editing) return;
  const { kind, id, draft } = editing;
  const errors =
    kind === 'sample' ? validateSample(draft) : validateParty(draft, state.builds.samples);
  state.buildsErrors = errors;
  if (errors.length) {
    renderBuildsEditor();
    return;
  }
  const saved = { ...draft, updatedAt: Date.now() };
  const list = kind === 'sample' ? 'samples' : 'parties';
  const previous = state.builds;
  state.builds = {
    ...previous,
    [list]:
      id === null
        ? [...previous[list], saved]
        : previous[list].map(x => (x.id === id ? saved : x)),
  };
  // 쓰지 못했으면 되돌린다. 목록에 보이는데 새로고침하면 사라지는 상태를 만들지
  // 않는다. buildsSave가 이미 실패를 알렸다.
  if (!buildsSave()) {
    state.builds = previous;
    return;
  }
  dropDraft(kind, id);
  toast('저장했습니다.');
  closeBuildsEditor();
}
```

Task 5에서 새로고침만 막던 `submit` 처리를 바꾼다.

```js
$('builds-rows').addEventListener('submit', event => {
  event.preventDefault();
  commitBuild();
});
```

- [ ] **Step 2: 삭제를 잇는다**

```js
let confirmAction = null;

function askConfirm(message, action) {
  $('confirm-body').textContent = message;
  confirmAction = action;
  $('confirm-dialog').showModal();
}

function removeBuild() {
  const editing = state.buildsEditing;
  if (!editing || editing.id === null) return;
  const { kind, id } = editing;
  const used = kind === 'sample' ? partiesUsing(state.builds, id).length : 0;
  const message =
    kind === 'sample'
      ? `‘${editing.draft.name}’을 지웁니다.` +
        (used ? ` 이 샘플을 쓰는 파티 ${used}개의 자리가 비워집니다.` : '')
      : `‘${editing.draft.name}’을 지웁니다.`;
  askConfirm(message, () => {
    const previous = state.builds;
    state.builds =
      kind === 'sample'
        ? deleteSample(previous, id)
        : { ...previous, parties: previous.parties.filter(p => p.id !== id) };
    if (!buildsSave()) {
      state.builds = previous;
      return;
    }
    dropDraft(kind, id);
    toast('지웠습니다.');
    closeBuildsEditor();
  });
}
```

`$('builds-rows')` 클릭 위임에 더한다.

```js
  if (event.target.closest('[data-builds-delete]')) return removeBuild();
```

확인 창 배선을 기존 대화상자들 근처에 붙인다.

```js
$('close-confirm').onclick = () => $('confirm-dialog').close();
$('cancel-confirm').onclick = () => $('confirm-dialog').close();
$('accept-confirm').onclick = () => {
  const action = confirmAction;
  $('confirm-dialog').close();
  action?.();
};
$('confirm-dialog').addEventListener('close', () => {
  confirmAction = null;
});
```

- [ ] **Step 3: 브라우저 회귀 검증을 넓힌다**

`scripts/verify-builds-browser.mjs`의 `assert.deepEqual(errors, [])` 앞에 붙인다. 기존 검사는 그대로 둔다.

```js
  // 편집: 빈 값에서 만들어 저장한다
  await page.goto('http://localhost:4173/#builds=sample');
  await page.locator('#builds-rows').waitFor({ state: 'visible' });
  await page.locator('[data-builds-new="sample"]').click();
  await page.locator('[data-builds-form="sample"]').waitFor({ state: 'visible' });
  await page.locator('[data-builds-field="name"]').fill('검증용 샘플');
  await page.locator('[data-builds-species]').click();
  await page.locator('#picker-search').fill('보만다');
  await page.locator('[data-picker-value="Salamence"]').click();
  await page.locator('[data-builds-field="ability"]').selectOption('Intimidate');
  await page.locator('[data-builds-field="nature"]').selectOption('adamant');
  await page.locator('[data-builds-point="1"]').fill('32');
  await page.locator('[data-builds-save]').click();
  await page.locator('#builds-rows').getByText('검증용 샘플').waitFor({ state: 'visible' });

  // 저장한 것은 새로고침 후에도 남는다
  await page.reload();
  await page.locator('#builds-rows').getByText('검증용 샘플').waitFor({ state: 'visible' });

  // 이름을 비우면 저장을 막고 이유를 보여준다
  await page.locator('#builds-rows').getByText('검증용 샘플').click();
  await page.locator('[data-builds-field="name"]').fill('');
  await page.locator('[data-builds-save]').click();
  assert.match(await page.locator('[data-builds-errors]').innerText(), /이름을 입력하세요/);

  // 초안은 나갔다 돌아와도 남는다
  await page.locator('[data-builds-cancel]').click();
  await page.locator('#builds-rows').getByText('검증용 샘플').click();
  await page.locator('.builds-resume').waitFor({ state: 'visible' });

  await page.screenshot({ path: 'test-results/builds-editor.png' });
```

- [ ] **Step 4: README를 갱신한다**

`README.md`의 ‘현재 기능’ 목록 끝에 한 줄 더한다. 목록의 다른 줄과 같은 톤으로 쓰고, **아직 없는 기능을 적지 않는다.**

```markdown
- 헤더의 ‘내 샘플’에서 포켓몬 배치(샘플)와 여섯 마리 조합(파티)을 만들고 고치고 지웁니다. 이름·초성·도감 번호로 찾으며, JSON 파일로 내보내고 가져옵니다. 저장은 이 브라우저에만 남습니다
```

같은 문서에서 저장 위치를 설명하는 문단(‘즐겨찾기와 선택한 시즌/형식은 해당 브라우저에 저장됩니다’로 시작하는 곳)에 샘플과 파티도 같은 저장소를 쓴다는 것을 한 문장 더한다.

- [ ] **Step 5: 확인하고 커밋한다**

```bash
node --test tests/*.test.mjs
node scripts/serve.mjs --port 4173
```

브라우저에서 확인한다.

1. 빈 값에서 샘플을 만들어 저장하면 목록에 나오고 새로고침 후에도 남는다.
2. 이름을 비우고 저장하면 ‘이름을 입력하세요.’가 뜨고 목록으로 나가지 않는다.
3. 저장하면 초안이 사라져 다시 들어갈 때 ‘이어서 고치는 중’이 뜨지 않는다.
4. 파티가 쓰는 샘플을 지우려 하면 몇 개의 자리가 비워지는지 알리고, 확인하면 그 파티의 자리가 빈 자리가 된다.
5. 삭제 확인 창에서 취소하면 아무 일도 일어나지 않는다.

```bash
npm run format
git add src/app.js scripts/verify-builds-browser.mjs README.md
git commit -m "샘플과 파티를 저장하고 지운다"
```

---

## 남은 것

- `docs/verification.md`에 이번 편집 흐름의 확인 결과를 적는다. **실제로 실행한 것만 적고**, Playwright로 스크립트를 돌리지 못했다면 그대로 밝힌다.
- 설계 문서의 2단계(배포와 APK), 3단계(동기화), 4단계(공유 링크)는 각각 별도 계획이다.
