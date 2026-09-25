# 내 샘플 3단계 — 동기화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동기화 코드 하나로 PC와 안드로이드가 같은 샘플·파티 문서를 보게 한다.

**Architecture:** `localStorage`가 1차 저장소이고 서버는 뒤따른다. 서버는 Cloudflare Pages Functions(`functions/api/[[path]].js`) 한 파일이 KV 키 `doc:<코드>`에 문서를 통째로 두고 낙관적 잠금을 건다. 판단은 전부 순수 함수(`handle`, `src/sync.js`)에 두어 `node --test`와 가짜 KV로 검사하고, 실제 동작은 Cloudflare 미리보기 배포에서 확인한다.

**Tech Stack:** 브라우저 ES 모듈, Cloudflare Pages Functions, Workers KV, Node 24 내장 `node:test`(전역 `Request`/`Response`/`crypto` 사용).

설계는 `docs/builds-and-sync.md`의 `저장과 동기화`·`API` 절, 현재 상태는 `docs/builds-handoff.md`에 있다.

## Global Constraints

- 새 npm 의존성을 넣지 않는다. `wrangler`도 넣지 않는다. `devDependencies`는 `prettier` 하나다.
- KV 무료 한도(2026-09-25 확인): 읽기 하루 10만, 쓰기 하루 1,000, **같은 키 초당 1회**, 값 최대 25 MiB. Functions 요청은 Workers와 합쳐 하루 10만.
- KV 바인딩 이름은 `BUILDS`, 키는 `doc:<코드>`다.
- 동기화 코드는 Crockford base32 20자(`0-9`, `A-Z`에서 `I L O U` 제외, 100비트)다. **주소(쿼리)에 넣지 않고** `x-sync-code` 헤더로 보낸다. 쿼리는 접속 기록에 남는다.
- 서버에 올리는 본문은 512 KiB를 넘지 않는다.
- 조용히 덮어쓰지 않는다. 버전이 어긋나면 사람이 어느 쪽을 남길지 고른다.
- `src/builds.js`, `src/builds-view.js`, `src/sync.js`는 DOM을 쓰지 않는다. 배선은 `src/app.js`만 한다.
- 새 `<button>`은 모두 `type="button"`을 단다. 이것을 빼먹어 편집기가 닫히던 버그가 있었다.
- 주석과 문서는 한국어, 식별자는 영어. Prettier 설정(`printWidth 100`, `singleQuote`, `arrowParens: avoid`, CRLF)을 따르고 커밋 전 `npm run format`을 돌린다.
- 커밋 메시지는 한국어 한 줄 요약, 빈 줄, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트는 `node --test "tests/*.test.mjs"`로 돌린다. 글로브는 따옴표로 감싼다. 시작 시점 314개.

## 시작 전

미리보기 배포로 확인하려면 브랜치가 필요하다. 모든 작업을 이 브랜치에서 하고 Task 6에서 `main`에 합친다.

```bash
git switch -c builds-sync
```

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `functions/api/[[path]].js` (새) | `/api/doc`의 GET·PUT. `handle(request, env)`가 판단을 다 하고 `onRequest`는 부르기만 한다 |
| `src/sync.js` (새) | 코드 만들기·정규화, 서버 받기·올리기, 열 때 할 일 판단, 올리기 모으기, 동기화 설정 읽기·쓰기 |
| `src/builds.js` | `sample.form` 제거, `docFromServer`, `joinDocs` 추가 |
| `src/builds-view.js` | `syncBar` 마크업 |
| `src/app.js` | 저장 뒤 올리기, 열 때 맞추기, 동기화 단추 배선 |
| `index.html`, `src/styles.css` | 동기화 줄 자리와 모양 |
| `sw.js` | `./src/sync.js`를 사전 캐시, 캐시 이름 올림 |
| `package.json` | `format` 대상에 `functions/` 추가 |
| `tests/sync-server.test.mjs` (새), `tests/sync.test.mjs` (새), `tests/builds.test.mjs`, `tests/builds-view.test.mjs` | 검사 |

---

### Task 1: 저장 모양 정리와 합치기 규칙

`sample.form`은 모델에만 있고 아무 데서도 쓰지 않는다. 폼은 `pokemon` id가 이미 구분한다(`charizardmegax`). 저장 모양을 정하는 이 단계에서 지운다. 서버에서 받은 문서를 믿지 않고 펴는 함수와, 처음 연결할 때 두 문서를 합치는 규칙도 여기 둔다.

**Files:**
- Modify: `src/builds.js` (`emptySample`, `normalizeDoc`, 파일 끝)
- Test: `tests/builds.test.mjs`

**Interfaces:**
- Produces:
  - `docFromServer(doc: unknown, version: number) => { samples, parties, version }` — 서버 문서를 `normalizeDoc`으로 펴고 버전을 서버 값으로 둔다. `doc`이 `null`이면 빈 문서.
  - `joinDocs(local: Doc, server: Doc) => Doc` — id가 같으면 `updatedAt`이 **더 큰** 쪽, 같으면 `local`. 결과의 `version`은 `server.version`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds.test.mjs`의 `../src/builds.js` import 목록에 `docFromServer`, `joinDocs`를 더하고 파일 끝에 붙인다.

```js
test('the unused form field is gone from new and stored samples', () => {
  assert.ok(!('form' in emptySample()));
  const stored = {
    samples: [{ ...emptySample(), id: 'a', name: '보만다', form: 'Mega' }],
    parties: [],
    version: 3,
  };
  const doc = readDoc({ getItem: () => JSON.stringify(stored) });
  assert.ok(!('form' in doc.samples[0]), '예전 저장본의 form도 읽을 때 걷어낸다');
  assert.equal(doc.samples[0].name, '보만다');
  assert.equal(doc.version, 3);
});

test('a document from the server is checked like any stored one', () => {
  const doc = docFromServer(
    { samples: [{ ...emptySample(), id: 'a', name: '가' }, { id: 'broken' }], parties: 'x' },
    7,
  );
  assert.deepEqual(
    doc.samples.map(s => s.id),
    ['a'],
  );
  assert.deepEqual(doc.parties, []);
  assert.equal(doc.version, 7, '버전은 서버가 알려준 값이다');
  assert.deepEqual(docFromServer(null, 0), { samples: [], parties: [], version: 0 });
});

test('joining keeps both sides and lets the later save win', () => {
  const at = (id, name, updatedAt) => ({ ...emptySample(), id, name, updatedAt });
  const local = { samples: [at('a', '이 기기 옛것', 100), at('b', '이 기기만', 50)], parties: [], version: 0 };
  const server = {
    samples: [at('a', '서버 새것', 200), at('c', '서버만', 10)],
    parties: [{ ...emptyParty(), id: 'p', name: '파티' }],
    version: 4,
  };
  const joined = joinDocs(local, server);
  const names = Object.fromEntries(joined.samples.map(s => [s.id, s.name]));
  assert.deepEqual(names, { a: '서버 새것', b: '이 기기만', c: '서버만' });
  assert.equal(joined.parties.length, 1);
  assert.equal(joined.version, 4, '서버 버전 위에 올린다');
  // 시각이 같으면 이 기기 것을 둔다.
  assert.equal(
    joinDocs({ ...local, samples: [at('a', '이쪽', 5)] }, { ...server, samples: [at('a', '저쪽', 5)] })
      .samples[0].name,
    '이쪽',
  );
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds.test.mjs`
Expected: FAIL — `does not provide an export named 'docFromServer'`

- [ ] **Step 3: 구현한다**

`src/builds.js`의 `emptySample`에서 `form: null,` 줄을 지운다.

`normalizeDoc`을 다음으로 바꾼다.

```js
// 예전 저장본의 sample.form은 쓰이지 않던 칸이다. 폼은 pokemon id가 구분한다.
const dropForm = ({ form, ...sample }) => sample;

const normalizeDoc = raw =>
  !raw || typeof raw !== 'object'
    ? { ...EMPTY_DOC }
    : {
        samples: Array.isArray(raw.samples) ? raw.samples.filter(isSample).map(dropForm) : [],
        parties: Array.isArray(raw.parties) ? raw.parties.filter(isParty) : [],
        version: Number.isInteger(raw.version) ? raw.version : 0,
      };
```

`mergeDocs` 바로 아래에 더한다.

```js
// 서버에서 받은 문서도 신뢰 경계다. 저장소에서 읽은 것과 같은 검사를 거친다.
// 버전은 문서 안의 값이 아니라 서버가 따로 알려준 값을 쓴다.
export const docFromServer = (doc, version) => ({ ...normalizeDoc(doc), version });

// 동기화에 처음 붙을 때 이 기기 것과 서버 것을 합친다. 가져오기(mergeDocs)와 달리
// 어느 쪽도 ‘새로 들어온 것’이 아니므로 나중에 저장한 쪽을 남긴다. 시각이 같으면
// 이 기기 것을 둔다. 합친 결과는 서버 버전 위에 올린다.
export function joinDocs(local, server) {
  const pick = (mine, theirs) => {
    const byId = new Map(mine.map(x => [x.id, x]));
    for (const item of theirs) {
      const kept = byId.get(item.id);
      if (!kept || (item.updatedAt ?? 0) > (kept.updatedAt ?? 0)) byId.set(item.id, item);
    }
    return [...byId.values()];
  };
  return {
    samples: pick(local.samples, server.samples),
    parties: pick(local.parties, server.parties),
    version: server.version,
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test "tests/*.test.mjs"`
Expected: 317개 통과, 0개 실패. `builds-view` 스냅샷은 `form`을 그리지 않으므로 바뀌지 않는다.

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds.js tests/builds.test.mjs
git commit -F - <<'EOF'
쓰지 않던 sample.form을 지우고 서버 문서를 펴고 합치는 규칙을 둔다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 서버 — `/api/doc`

**Files:**
- Create: `functions/api/[[path]].js`
- Modify: `package.json` (`format`, `format:check`)
- Test: `tests/sync-server.test.mjs`

**Interfaces:**
- Produces:
  - `handle(request: Request, env: { BUILDS?: KV }) => Promise<Response>`
  - `CODE: RegExp` — `/^[0-9A-HJKMNP-TV-Z]{20}$/`. `src/sync.js`가 만드는 코드는 이것을 통과해야 한다.
  - `MAX_BODY = 512 * 1024`
  - `GET /api/doc` + `x-sync-code` → `200 { doc, version }`, 없으면 `{ doc: null, version: 0 }`
  - `PUT /api/doc` + `x-sync-code` + 본문 `{ doc, version }` → `200 { version }` / `409 { error: 'conflict', version }` / `429 { error: 'busy' }` / `400` / `413`
  - 바인딩이 없으면 `503 { error: 'storage not bound' }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/sync-server.test.mjs`를 만든다.

```js
// 서버 판단만 검사한다. 실제 KV와 라우팅은 미리보기 배포에서 확인한다(Task 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, MAX_BODY } from '../functions/api/[[path]].js';

const CODE = 'ABCDEFGHJKMNPQRSTV01';

// Workers KV의 get(key, 'json')과 put(key, text)만 흉내 낸다. busy면 같은 키 초당
// 1회 제한에 걸린 것처럼 put이 던진다.
const kv = () => ({
  store: new Map(),
  busy: false,
  async get(key, type) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return type === 'json' ? JSON.parse(value) : value;
  },
  async put(key, value) {
    if (this.busy) throw new Error('KV PUT failed: 429 Too Many Requests');
    this.store.set(key, value);
  },
});

const call = (env, { method = 'GET', path = '/api/doc', code = CODE, body } = {}) =>
  handle(
    new Request(`https://example.pages.dev${path}`, {
      method,
      headers: code === null ? {} : { 'x-sync-code': code },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
  );
const doc = { samples: [], parties: [], version: 0 };

test('an unknown code reads as an empty document at version zero', async () => {
  const response = await call({ BUILDS: kv() });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { doc: null, version: 0 });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('saving from the version you read moves the version forward', async () => {
  const env = { BUILDS: kv() };
  const saved = await call(env, { method: 'PUT', body: { doc, version: 0 } });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { version: 1 });
  assert.deepEqual(await (await call(env)).json(), { doc, version: 1 });
  const next = await call(env, { method: 'PUT', body: { doc, version: 1 } });
  assert.deepEqual(await next.json(), { version: 2 });
});

test('a save based on an old version is refused, not merged', async () => {
  const env = { BUILDS: kv() };
  await call(env, { method: 'PUT', body: { doc, version: 0 } });
  const stale = await call(env, {
    method: 'PUT',
    body: { doc: { ...doc, samples: [{ id: 'x' }] }, version: 0 },
  });
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: 'conflict', version: 1 });
  assert.deepEqual((await (await call(env)).json()).doc, doc, '서버 쪽은 그대로다');
});

test('the code comes only from the header and must be well formed', async () => {
  const env = { BUILDS: kv() };
  assert.equal((await call(env, { code: null })).status, 400);
  assert.equal((await call(env, { code: null, path: `/api/doc?key=${CODE}` })).status, 400);
  assert.equal((await call(env, { code: 'SHORT' })).status, 400);
  assert.equal((await call(env, { code: 'abcdefghjkmnpqrstv01' })).status, 400, '정규화는 앱이 한다');
  assert.equal((await call(env, { code: 'ABCDEFGHJKMNPQRSTVU1' })).status, 400, 'U는 쓰지 않는 글자');
});

test('bodies that are too large or malformed are rejected before storage', async () => {
  const env = { BUILDS: kv() };
  const huge = JSON.stringify({ doc: { ...doc, note: 'x'.repeat(MAX_BODY) }, version: 0 });
  assert.equal((await call(env, { method: 'PUT', body: huge })).status, 413);
  assert.equal((await call(env, { method: 'PUT', body: '{not json' })).status, 400);
  assert.equal((await call(env, { method: 'PUT', body: { doc: { samples: [] }, version: 0 } })).status, 400);
  assert.equal((await call(env, { method: 'PUT', body: { doc, version: -1 } })).status, 400);
  assert.equal((await call(env, { method: 'PUT', body: { doc, version: '0' } })).status, 400);
  assert.equal(env.BUILDS.store.size, 0);
});

test('the per-key write limit answers 429 and keeps the version', async () => {
  const env = { BUILDS: kv() };
  await call(env, { method: 'PUT', body: { doc, version: 0 } });
  env.BUILDS.busy = true;
  const busy = await call(env, { method: 'PUT', body: { doc, version: 1 } });
  assert.equal(busy.status, 429);
  env.BUILDS.busy = false;
  assert.equal((await (await call(env)).json()).version, 1);
});

test('other paths and methods, and a missing binding, say so plainly', async () => {
  const env = { BUILDS: kv() };
  assert.equal((await call(env, { path: '/api/share/abc' })).status, 404);
  assert.equal((await call(env, { method: 'POST', body: {} })).status, 405);
  const unbound = await call({});
  assert.equal(unbound.status, 503);
  assert.deepEqual(await unbound.json(), { error: 'storage not bound' });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/sync-server.test.mjs`
Expected: FAIL — `Cannot find module ... functions\api\[[path]].js`

- [ ] **Step 3: 구현한다**

`functions/api/[[path]].js`를 만든다. Pages가 저장소 루트의 `functions/`를 찾으므로 출력 디렉터리가 `dist`여도 이 위치가 맞다.

```js
// Cloudflare Pages Functions. /api/* 를 받는다. 저장소는 KV 바인딩 BUILDS다.
// 판단은 handle 하나에 두고 onRequest는 부르기만 한다. handle은 Request와 env만
// 받으므로 node --test에서 가짜 KV로 검사한다(tests/sync-server.test.mjs).

// 동기화 코드는 Crockford base32 20자(100비트)다. 이 코드를 가진 사람이 문서 전체
// 권한을 가진다. 주소에 넣으면 접속 기록에 남으므로 헤더로만 받는다.
export const CODE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
// 샘플 수백 개도 수십 KB다. 남의 코드로 큰 값을 밀어 넣어 한도를 쓰는 일을 막는다.
export const MAX_BODY = 512 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 모양만 본다. 항목 하나하나의 검사는 받는 쪽 앱의 normalizeDoc이 한다. 여기서
// 같은 규칙을 한 벌 더 두면 둘이 어긋난다.
const isDoc = doc =>
  !!doc && typeof doc === 'object' && Array.isArray(doc.samples) && Array.isArray(doc.parties);

export async function handle(request, env) {
  if (!env?.BUILDS) return json({ error: 'storage not bound' }, 503);
  const url = new URL(request.url);
  if (url.pathname !== '/api/doc') return json({ error: 'not found' }, 404);
  const code = request.headers.get('x-sync-code') ?? '';
  if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
  const key = `doc:${code}`;

  if (request.method === 'GET') {
    const stored = await env.BUILDS.get(key, 'json');
    return json(stored ?? { doc: null, version: 0 });
  }

  if (request.method === 'PUT') {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY)
      return json({ error: 'too large' }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    if (!isDoc(body?.doc) || !Number.isInteger(body?.version) || body.version < 0)
      return json({ error: 'bad body' }, 400);
    const stored = await env.BUILDS.get(key, 'json');
    const current = stored?.version ?? 0;
    // 낙관적 잠금. 이 기기가 읽은 뒤에 다른 기기가 올렸으면 덮어쓰지 않는다.
    // ponytail: KV에는 비교 후 쓰기가 없어 두 기기가 전파 시간(최대 60초) 안에 함께
    // 올리면 둘 다 통과할 수 있다. 한 사람이 기기를 번갈아 쓰는 범위에서는 받아들인다.
    // 동시 편집이 잦아지면 Durable Objects로 옮긴다.
    if (body.version !== current) return json({ error: 'conflict', version: current }, 409);
    const version = current + 1;
    try {
      await env.BUILDS.put(key, JSON.stringify({ doc: body.doc, version }));
    } catch {
      // 같은 키는 초당 한 번만 쓸 수 있다. 잠시 뒤 다시 보내면 된다.
      return json({ error: 'busy' }, 429);
    }
    return json({ version });
  }

  return json({ error: 'method not allowed' }, 405);
}

export const onRequest = ({ request, env }) => handle(request, env);
```

`package.json`의 두 스크립트에 `"functions/**/*.js"`를 더한다.

```json
    "format": "prettier --write \"src/**/*.{js,css}\" \"tests/**/*.mjs\" \"scripts/**/*.mjs\" \"functions/**/*.js\" sw.js",
    "format:check": "prettier --check \"src/**/*.{js,css}\" \"tests/**/*.mjs\" \"scripts/**/*.mjs\" \"functions/**/*.js\" sw.js"
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test "tests/*.test.mjs"`
Expected: 324개 통과, 0개 실패.

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add functions package.json tests/sync-server.test.mjs
git commit -F - <<'EOF'
동기화 문서를 KV에 두고 버전으로 덮어쓰기를 막는 서버를 둔다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: 앱 쪽 동기화 판단 — `src/sync.js`

**Files:**
- Create: `src/sync.js`
- Test: `tests/sync.test.mjs`

**Interfaces:**
- Consumes: `CODE` (Task 2) — 테스트에서만
- Produces:
  - `CODE_LENGTH = 20`
  - `newSyncCode(random?: (n) => Uint8Array) => string`
  - `normalizeCode(input: unknown) => string | null` — 대문자로, 공백·하이픈 제거, `I L→1`, `O→0`
  - `formatCode(code: string) => 'XXXX-XXXX-XXXX-XXXX-XXXX'`
  - `pullDoc(fetcher, code) => Promise<{ status: 'ok', doc, version } | { status: 'offline'|'retry'|'error' }>`
  - `pushDoc(fetcher, code, doc, version) => Promise<{ status: 'ok', version } | { status: 'conflict', version } | { status: 'offline'|'retry'|'error' }>`
  - `planOnOpen({ based, dirty, server }) => 'pull' | 'push' | 'conflict' | 'none'`
  - `createUploader({ push, wait, onState, delay?, retryDelay?, retries? }) => { request(): void, pending(): boolean }` — `push()`는 인자 없이 최신 로컬 상태를 올리고 위 `pushDoc` 결과를 돌려준다. `onState(status, result?)`로 `'uploading'`과 최종 상태를 알린다.
  - `readSync(storage) => { code, dirty } | null`, `writeSync(storage, meta | null) => boolean` — 키 `champions:sync`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/sync.test.mjs`를 만든다.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_LENGTH,
  newSyncCode,
  normalizeCode,
  formatCode,
  pullDoc,
  pushDoc,
  planOnOpen,
  createUploader,
  readSync,
  writeSync,
} from '../src/sync.js';
import { CODE } from '../functions/api/[[path]].js';

const code = 'ABCDEFGHJKMNPQRSTV01';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('new codes are 20 Crockford characters the server accepts', () => {
  for (let i = 0; i < 200; i++) {
    const made = newSyncCode();
    assert.equal(made.length, CODE_LENGTH);
    assert.match(made, CODE);
  }
  // 바이트를 32로 나눈 나머지로 고른다. 32는 256을 나누므로 치우침이 없다.
  assert.equal(newSyncCode(n => new Uint8Array(n).fill(33)), '1'.repeat(20));
});

test('a hand-typed code forgives case, dashes and look-alike letters', () => {
  assert.equal(formatCode(code), 'ABCD-EFGH-JKMN-PQRS-TV01');
  assert.equal(normalizeCode('abcd-efgh-jkmn-pqrs-tv01'), code);
  assert.equal(normalizeCode(' ABCD EFGH JKMN PQRS TVOI '), code, 'O는 0, I는 1');
  assert.equal(normalizeCode(formatCode(code)), code);
  assert.equal(normalizeCode('ABCD'), null);
  assert.equal(normalizeCode('ABCDEFGHJKMNPQRSTVU1'), null, 'U는 쓰지 않는 글자');
  assert.equal(normalizeCode(null), null);
});

const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
const down = async () => {
  throw new TypeError('Failed to fetch');
};

test('pull and push report ok, conflict, retry, offline and error', async () => {
  assert.deepEqual(await pullDoc(reply(200, { doc: null, version: 0 }), code), {
    status: 'ok',
    doc: null,
    version: 0,
  });
  assert.deepEqual(await pushDoc(reply(200, { version: 4 }), code, {}, 3), {
    status: 'ok',
    version: 4,
  });
  assert.deepEqual(await pushDoc(reply(409, { error: 'conflict', version: 7 }), code, {}, 3), {
    status: 'conflict',
    version: 7,
  });
  assert.equal((await pushDoc(reply(429, {}), code, {}, 3)).status, 'retry');
  assert.equal((await pushDoc(reply(503, {}), code, {}, 3)).status, 'retry');
  assert.equal((await pushDoc(reply(413, {}), code, {}, 3)).status, 'error');
  assert.equal((await pullDoc(reply(400, {}), code)).status, 'error');
  assert.equal((await pushDoc(down, code, {}, 3)).status, 'offline');
  assert.equal((await pullDoc(down, code)).status, 'offline');
});

test('the code travels in a header, never in the address', async () => {
  let seen;
  const spy = async (url, init) => {
    seen = { url, init };
    return new Response('{"version":1}');
  };
  await pushDoc(spy, code, { samples: [], parties: [] }, 0);
  assert.ok(!String(seen.url).includes(code));
  assert.equal(seen.init.headers['x-sync-code'], code);
  assert.equal(seen.init.method, 'PUT');
  assert.deepEqual(JSON.parse(seen.init.body), { doc: { samples: [], parties: [] }, version: 0 });
});

test('on open: take newer, send local changes, stop on conflict', () => {
  assert.equal(planOnOpen({ based: 3, dirty: false, server: 5 }), 'pull');
  assert.equal(planOnOpen({ based: 3, dirty: true, server: 5 }), 'conflict');
  assert.equal(planOnOpen({ based: 5, dirty: true, server: 5 }), 'push');
  assert.equal(planOnOpen({ based: 5, dirty: false, server: 5 }), 'none');
  // 서버 쪽이 비었거나 사라졌으면 이 기기 것을 다시 올린다.
  assert.equal(planOnOpen({ based: 5, dirty: false, server: 0 }), 'push');
});

test('saves made while uploading go out once afterwards, never in parallel', async () => {
  let inFlight = 0;
  let most = 0;
  let calls = 0;
  let release;
  const push = async () => {
    calls++;
    inFlight++;
    most = Math.max(most, inFlight);
    await new Promise(resolve => (release = resolve));
    inFlight--;
    return { status: 'ok', version: calls };
  };
  const states = [];
  const uploader = createUploader({ push, wait: async () => {}, onState: s => states.push(s) });
  uploader.request();
  await tick();
  uploader.request();
  uploader.request();
  uploader.request();
  release();
  await tick();
  await tick();
  release();
  await tick();
  await tick();
  assert.equal(calls, 2, '몰린 저장 세 번은 한 번으로 보낸다');
  assert.equal(most, 1, '한 번에 하나만 보낸다');
  assert.equal(uploader.pending(), false);
  assert.deepEqual(states, ['uploading', 'ok', 'uploading', 'ok']);
});

test('a busy server is retried a few times, then the change waits', async () => {
  let calls = 0;
  const states = [];
  const uploader = createUploader({
    push: async () => (calls++, { status: 'retry' }),
    wait: async () => {},
    onState: s => states.push(s),
    retries: 2,
  });
  uploader.request();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(calls, 3, '처음 한 번과 다시 두 번');
  assert.equal(states.at(-1), 'retry');
  assert.equal(uploader.pending(), false, '더 보내지 않고 다음 기회를 기다린다');
});

test('offline and conflict stop the loop without retrying', async () => {
  for (const status of ['offline', 'conflict', 'error']) {
    let calls = 0;
    const states = [];
    const uploader = createUploader({
      push: async () => (calls++, { status }),
      wait: async () => {},
      onState: s => states.push(s),
    });
    uploader.request();
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(calls, 1, status);
    assert.equal(states.at(-1), status);
  }
});

test('sync settings survive a reload and a broken store never throws', () => {
  const store = new Map();
  const storage = {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
  };
  assert.equal(readSync(storage), null);
  assert.equal(writeSync(storage, { code, dirty: true }), true);
  assert.deepEqual(readSync(storage), { code, dirty: true });
  writeSync(storage, null);
  assert.equal(readSync(storage), null);
  store.set('champions:sync', '{broken');
  assert.equal(readSync(storage), null);
  store.set('champions:sync', JSON.stringify({ code: 'nope', dirty: true }));
  assert.equal(readSync(storage), null, '코드가 틀린 설정은 없는 것으로 본다');
  const full = {
    setItem() {
      throw new Error('quota');
    },
  };
  assert.equal(writeSync(full, { code, dirty: false }), false);
  assert.equal(writeSync(null, { code, dirty: false }), false);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/sync.test.mjs`
Expected: FAIL — `Cannot find module ... src\sync.js`

- [ ] **Step 3: 구현한다**

`src/sync.js`를 만든다.

```js
// 동기화. 서버 통신과 버전 판단만 한다. DOM도 localStorage도 직접 만지지 않고
// fetch와 저장소를 인자로 받으므로 node --test에서 가짜로 검사한다.
// 설계는 docs/builds-and-sync.md의 ‘저장과 동기화’ 절이다.

// Crockford base32. 손으로 옮겨 적을 때 헷갈리는 I L O U가 없다.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 20;
const META = 'champions:sync';
const URL_DOC = './api/doc';

// 100비트. 32는 256을 나누므로 바이트를 32로 나눈 나머지에 치우침이 없다.
export function newSyncCode(random = n => crypto.getRandomValues(new Uint8Array(n))) {
  return [...random(CODE_LENGTH)].map(byte => ALPHABET[byte % 32]).join('');
}

// 다른 기기에 표시된 코드를 손으로 옮겨 적는다. 대소문자와 하이픈·공백을 가리지
// 않고, Crockford 규칙대로 I·L은 1, O는 0으로 읽는다.
export function normalizeCode(input) {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return code.length === CODE_LENGTH && [...code].every(c => ALPHABET.includes(c)) ? code : null;
}

export const formatCode = code => code.match(/.{1,4}/g).join('-');

// 결과는 상태 문자열 하나로 갈라 돌려준다.
//  ok       서버와 맞췄다
//  conflict 다른 기기가 먼저 올렸다
//  retry    잠시 뒤 다시 하면 된다 (같은 키 초당 1회 제한, 서버 일시 오류)
//  offline  연결이 없거나 응답을 받지 못했다
//  error    서버가 받지 않았다 (너무 큼, 형식 오류). 다시 해도 같다
async function send(fetcher, code, init) {
  try {
    const response = await fetcher(URL_DOC, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-sync-code': code },
    });
    return { response, body: await response.json().catch(() => null) };
  } catch {
    return { response: null, body: null };
  }
}
const failure = response =>
  !response ? 'offline' : response.status === 429 || response.status >= 500 ? 'retry' : 'error';

export async function pullDoc(fetcher, code) {
  const { response, body } = await send(fetcher, code, { method: 'GET' });
  if (!response?.ok) return { status: failure(response) };
  return { status: 'ok', doc: body?.doc ?? null, version: body?.version ?? 0 };
}

export async function pushDoc(fetcher, code, doc, version) {
  const { response, body } = await send(fetcher, code, {
    method: 'PUT',
    body: JSON.stringify({ doc, version }),
  });
  if (response?.status === 409) return { status: 'conflict', version: body?.version ?? null };
  if (!response?.ok) return { status: failure(response) };
  return { status: 'ok', version: body.version };
}

// 앱을 열 때 할 일. 로컬 문서가 바탕으로 한 서버 버전(based)과 올리지 못한 변경이
// 남았는지(dirty)만 보면 된다. 서버가 앞서 있는데 이 기기에도 변경이 있으면
// 어느 쪽을 남길지 사람이 고른다.
export function planOnOpen({ based, dirty, server }) {
  if (server > based) return dirty ? 'conflict' : 'pull';
  if (server < based) return 'push';
  return dirty ? 'push' : 'none';
}

// 저장이 몰려도 서버에는 한 번에 하나만 보낸다. 같은 키는 초당 한 번만 쓸 수 있고,
// 보내는 사이에 들어온 변경은 끝난 뒤 한 번에 보낸다. push는 인자 없이 그 순간의
// 최신 로컬 문서를 올린다. 문서를 여기 붙잡아 두면 버전이 오래된 채로 나간다.
// 서버가 바쁘면 몇 번 다시 하고, 연결이 없거나 충돌이면 멈춘다. 멈춘 변경은 앱이
// 저장해 둔 dirty 표시가 기억하고, 다음에 앱을 열거나 연결이 돌아올 때 다시 보낸다.
export function createUploader({
  push,
  wait,
  onState,
  delay = 1200,
  retryDelay = 1500,
  retries = 3,
}) {
  let dirty = false;
  let running = false;
  async function run() {
    running = true;
    let attempts = 0;
    while (dirty) {
      await wait(attempts ? retryDelay : delay);
      dirty = false;
      onState('uploading');
      const result = await push();
      if (result.status === 'retry' && attempts < retries) {
        attempts++;
        dirty = true;
        continue;
      }
      attempts = 0;
      onState(result.status, result);
      if (result.status !== 'ok') {
        dirty = false;
        break;
      }
    }
    running = false;
  }
  return {
    request() {
      dirty = true;
      if (!running) run();
    },
    pending: () => dirty,
  };
}

// readDoc과 같은 규칙: 막히거나 깨진 저장소가 앱을 멈추게 하지 않는다. 코드가 틀린
// 설정은 없는 것으로 본다. 틀린 코드로 계속 보내봐야 서버가 거절한다.
export function readSync(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(META));
    const code = normalizeCode(raw?.code);
    return code ? { code, dirty: raw.dirty === true } : null;
  } catch {
    return null;
  }
}

export function writeSync(storage, meta) {
  try {
    if (!storage) return false;
    if (meta) storage.setItem(META, JSON.stringify(meta));
    else storage.removeItem(META);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test "tests/*.test.mjs"`
Expected: 333개 통과, 0개 실패.

- [ ] **Step 5: 변이 검사로 올리기 모으기가 실제로 잡히는지 본다**

`src/sync.js`의 `if (!running) run();`을 `run();`으로 잠시 바꾸고 `node --test tests/sync.test.mjs`를 돌린다.
Expected: `saves made while uploading go out once afterwards, never in parallel` 실패. 되돌린 뒤 다시 돌려 통과를 확인한다.

- [ ] **Step 6: 커밋한다**

```bash
npm run format
git add src/sync.js tests/sync.test.mjs
git commit -F - <<'EOF'
동기화 코드와 받기·올리기, 열 때 할 일과 올리기 모으기를 둔다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 동기화 줄 마크업

**Files:**
- Modify: `src/builds-view.js` (파일 끝)
- Modify: `index.html` (내 샘플 패널)
- Modify: `src/styles.css` (`.builds-status` 규칙 근처)
- Test: `tests/builds-view.test.mjs`

**Interfaces:**
- Produces: `syncBar(sync: { code, dirty } | null, status: string) => string`. 단추는 `data-sync` 값으로 `enable`, `join`, `code`, `off`, `pull`, `push` 중 하나를 단다. 코드 자체는 그리지 않는다.
- `index.html`에 `<div id="builds-sync" class="builds-sync"></div>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/builds-view.test.mjs`의 `../src/builds-view.js` import 목록에 `syncBar`를 더하고 파일 끝에 붙인다.

```js
const synced = { code: 'ABCDEFGHJKMNPQRSTV01', dirty: false };

test('sync bar: off, checking, synced, offline and conflict', t => {
  t.assert.snapshot(
    [
      syncBar(null, 'off'),
      syncBar(synced, 'checking'),
      syncBar(synced, 'ok'),
      syncBar(synced, 'offline'),
      syncBar(synced, 'conflict'),
    ].join('\n'),
  );
});

test('sync bar buttons never submit a form', () => {
  for (const [sync, status] of [
    [null, 'off'],
    [synced, 'ok'],
    [synced, 'conflict'],
  ]) {
    const buttons = syncBar(sync, status).match(/<button[^>]*>/g);
    assert.ok(buttons.length >= 2, status);
    assert.ok(
      buttons.every(b => b.includes('type="button"')),
      status,
    );
  }
});

test('the sync bar never prints the code itself', () => {
  for (const status of ['ok', 'offline', 'conflict'])
    assert.ok(!syncBar(synced, status).includes('ABCD'), status);
});

test('a conflict offers exactly the two ways out', () => {
  const actions = [...syncBar(synced, 'conflict').matchAll(/data-sync="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(actions, ['pull', 'push']);
  const off = [...syncBar(null, 'off').matchAll(/data-sync="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(off, ['enable', 'join']);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/builds-view.test.mjs`
Expected: FAIL — `does not provide an export named 'syncBar'`

- [ ] **Step 3: 구현한다**

`src/builds-view.js` 끝에 더한다.

```js
// 동기화 줄. 상태 문장 하나와 그 상태에서 할 수 있는 일만 둔다. 코드는 여기 그리지
// 않는다. 코드를 가진 사람이 문서 전체 권한을 가지므로 ‘코드 보기’를 눌렀을 때만
// 상태 줄에 보인다.
const SYNC_TEXT = {
  off: '이 기기에만 저장합니다.',
  checking: '서버와 맞추는 중…',
  uploading: '올리는 중…',
  ok: '다른 기기와 동기화됩니다.',
  offline: '연결이 없어 올리지 못했습니다. 연결되면 다시 올립니다.',
  retry: '서버가 바빠 올리지 못했습니다. 다음 저장이나 다음 실행 때 다시 올립니다.',
  error: '서버가 받지 않았습니다. 저장 내용이 너무 크거나 형식이 맞지 않습니다.',
  conflict: '다른 기기에서 바뀌었습니다. 어느 쪽을 남길지 고르세요.',
};
const syncButton = (action, label) =>
  `<button type="button" class="text-button" data-sync="${action}">${label}</button>`;

export function syncBar(sync, status) {
  if (!sync)
    return (
      `<p>${SYNC_TEXT.off}</p>` + syncButton('enable', '동기화 켜기') + syncButton('join', '코드로 연결')
    );
  const actions =
    status === 'conflict'
      ? syncButton('pull', '서버 것 불러오기') + syncButton('push', '이 기기 것으로 덮어쓰기')
      : syncButton('code', '코드 보기') + syncButton('off', '끄기');
  return `<p role="status">${SYNC_TEXT[status] ?? SYNC_TEXT.ok}</p>${actions}`;
}
```

`index.html`에서 `id="builds-controls"` div가 닫힌 바로 다음, `builds-filter-summary` 앞에 넣는다.

```html
      <div id="builds-sync" class="builds-sync"></div>
```

`src/styles.css`의 `.builds-status:empty` 규칙 다음에 더한다.

```css
/* 동기화 줄. 목록 위에 한 줄로 두고 좁으면 단추가 아래로 내려간다. */
.builds-sync {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 4px 0 12px;
  font-size: 13px;
  color: var(--muted);
}
.builds-sync p {
  margin: 0;
  flex: 1 1 auto;
}
```

- [ ] **Step 4: 스냅샷을 만들고 통과를 확인한다**

```bash
node --test --test-update-snapshots tests/builds-view.test.mjs
node --test "tests/*.test.mjs"
```

Expected: 337개 통과, 0개 실패. `git diff tests/builds-view.test.mjs.snapshot`에는 새 항목 하나만 늘어야 한다. 줄바꿈만 바뀐 다른 스냅샷 파일이 생기면 `git checkout`으로 되돌린다.

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add src/builds-view.js index.html src/styles.css tests/builds-view.test.mjs tests/builds-view.test.mjs.snapshot
git commit -F - <<'EOF'
내 샘플에 동기화 상태 줄을 그린다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 배선 — 저장 뒤 올리기, 열 때 맞추기, 단추

`src/app.js`는 DOM을 쓰므로 `node:test`로 부를 수 없다. 이 Task의 확인은 Task 6의 미리보기 배포에서 한다. 여기서는 기존 테스트가 깨지지 않는지와 빌드만 본다.

**Files:**
- Modify: `src/app.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: Task 1의 `docFromServer`, `joinDocs`; Task 3의 `newSyncCode`, `normalizeCode`, `formatCode`, `pullDoc`, `pushDoc`, `planOnOpen`, `createUploader`, `readSync`, `writeSync`; Task 4의 `syncBar`, `#builds-sync`

- [ ] **Step 1: import와 상태를 더한다**

`./builds.js`에서 가져오는 목록에 `docFromServer`, `joinDocs`를, `./builds-view.js` 목록에 `syncBar`를 더한다. `./builds.js` import 바로 아래에 새 줄을 넣는다.

```js
import {
  newSyncCode,
  normalizeCode,
  formatCode,
  pullDoc,
  pushDoc,
  planOnOpen,
  createUploader,
  readSync,
  writeSync,
} from './sync.js';
```

`state`의 `builds: readDoc(storage),` 다음 줄에 넣는다.

```js
  // null이면 이 기기에만 저장한다. dirty는 올리지 못한 변경이 남았다는 표시다.
  sync: readSync(storage),
  syncStatus: 'off',
```

- [ ] **Step 2: 올리기와 상태 갱신을 둔다**

`function buildsSave()` 바로 위에 넣는다.

```js
// 동기화. 이 기기에 먼저 쓰고 서버는 뒤따른다(docs/builds-and-sync.md).
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const syncFetch = (url, init) => fetch(url, init);
const uploader = createUploader({
  push: () => pushDoc(syncFetch, state.sync.code, state.builds, state.builds.version),
  wait,
  onState: syncState,
});

function renderSyncBar() {
  const bar = $('builds-sync');
  bar.hidden = !!state.buildsEditing;
  bar.innerHTML = syncBar(state.sync, state.syncStatus);
}

// 올리기 결과를 반영한다. 성공하면 서버가 준 버전을 로컬 문서에 적고, 올리는 사이
// 새 변경이 없었을 때만 dirty를 푼다. 실패하면 dirty를 남겨 다음 기회에 다시 보낸다.
function syncState(status, result) {
  state.syncStatus = status;
  if (status === 'ok' && Number.isInteger(result?.version)) {
    state.builds = { ...state.builds, version: result.version };
    writeDoc(storage, state.builds);
  }
  if (state.sync && status !== 'uploading') {
    state.sync = { ...state.sync, dirty: status === 'ok' ? uploader.pending() : true };
    writeSync(storage, state.sync);
  }
  renderSyncBar();
}

// 서버 것을 그대로 받는다. 지워진 항목의 초안은 돌아갈 곳이 없으므로 털어낸다.
function adoptServer(server) {
  state.builds = docFromServer(server.doc, server.version);
  writeDoc(storage, state.builds);
  state.buildsDrafts = pruneDrafts(state.buildsDrafts, state.builds);
  writeDrafts(storage, state.buildsDrafts);
  state.sync = { ...state.sync, dirty: false };
  writeSync(storage, state.sync);
  state.syncStatus = 'ok';
  renderSyncBar();
  renderBuilds();
}

// 받기가 실패하면 dirty를 건드리지 않는다. 올린 적 없는 변경이 생긴 것이 아니다.
async function syncOnOpen() {
  if (!state.sync) return;
  state.syncStatus = 'checking';
  renderSyncBar();
  const server = await pullDoc(syncFetch, state.sync.code);
  if (server.status !== 'ok') {
    state.syncStatus = server.status;
    return renderSyncBar();
  }
  const plan = planOnOpen({
    based: state.builds.version,
    dirty: state.sync.dirty,
    server: server.version,
  });
  if (plan === 'pull') return adoptServer(server);
  if (plan === 'conflict') return syncState('conflict');
  if (plan === 'push') {
    state.builds = { ...state.builds, version: server.version };
    return uploader.request();
  }
  state.syncStatus = 'ok';
  renderSyncBar();
}

function showSyncCode() {
  const text = formatCode(state.sync.code);
  $('builds-status').textContent =
    `동기화 코드: ${text} — 다른 기기의 ‘코드로 연결’에 입력하세요. ` +
    '이 코드를 가진 사람은 샘플을 모두 보고 고칠 수 있습니다.';
  navigator.clipboard?.writeText(text).then(
    () => toast('코드를 복사했습니다.'),
    () => {},
  );
}
```

- [ ] **Step 3: 저장할 때 올리기를 부탁한다**

`buildsSave`의 마지막 `return true;`를 다음으로 바꾼다. 저장·삭제·가져오기가 모두 이 함수를 지나므로 여기 한 곳이면 된다.

```js
  // 로컬 저장이 성공한 뒤에만 올린다. 올리지 못해도 저장은 성립한다.
  if (state.sync) {
    state.sync = { ...state.sync, dirty: true };
    writeSync(storage, state.sync);
    uploader.request();
  }
  return true;
```

- [ ] **Step 4: 편집 중에는 동기화 줄을 감춘다**

`renderBuildsChrome(editing)`의 첫 줄로 넣는다. 편집기는 `renderBuilds`를 거치지 않는 경로로도 그려지는데 두 경로가 모두 이 함수를 부른다.

```js
  renderSyncBar();
```

- [ ] **Step 5: 단추를 잇는다**

`$('builds-export').addEventListener('click', …)` 바로 앞에 넣는다.

```js
$('builds-sync').addEventListener('click', async event => {
  const action = event.target.closest('[data-sync]')?.dataset.sync;
  if (!action) return;
  if (action === 'enable') {
    // 새 코드는 서버에 아무것도 없으므로 버전 0에서 올린다.
    state.sync = { code: newSyncCode(), dirty: true };
    writeSync(storage, state.sync);
    state.builds = { ...state.builds, version: 0 };
    writeDoc(storage, state.builds);
    uploader.request();
    return showSyncCode();
  }
  if (action === 'join') {
    const typed = prompt('다른 기기의 ‘코드 보기’에 나온 동기화 코드를 입력하세요.');
    if (typed === null) return;
    const code = normalizeCode(typed);
    if (!code) {
      $('builds-status').textContent = '동기화 코드가 올바르지 않습니다. 20자를 그대로 입력하세요.';
      return;
    }
    const server = await pullDoc(syncFetch, code);
    if (server.status !== 'ok') {
      $('builds-status').textContent =
        '서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.';
      return;
    }
    // 이 기기 것을 버리지 않고 합친다. 같은 항목은 나중에 저장한 쪽을 남긴다.
    const previous = { builds: state.builds, sync: state.sync };
    state.builds = joinDocs(state.builds, docFromServer(server.doc, server.version));
    state.sync = { code, dirty: true };
    writeSync(storage, state.sync);
    if (!buildsSave()) {
      state.builds = previous.builds;
      state.sync = previous.sync;
      writeSync(storage, previous.sync);
    }
    return renderBuilds();
  }
  if (action === 'code') return showSyncCode();
  if (action === 'off')
    return askConfirm(
      '이 기기의 동기화를 끕니다. 서버와 다른 기기의 자료는 그대로 남습니다. ' +
        '다시 켜려면 코드가 필요하니 먼저 적어 두세요.',
      () => {
        state.sync = null;
        writeSync(storage, null);
        state.syncStatus = 'off';
        renderSyncBar();
      },
      '끄기',
    );
  if (action === 'pull')
    return askConfirm(
      '서버의 내용으로 바꿉니다. 이 기기에서 올리지 못한 변경은 사라집니다.',
      async () => {
        const server = await pullDoc(syncFetch, state.sync.code);
        if (server.status !== 'ok') {
          state.syncStatus = server.status;
          return renderSyncBar();
        }
        adoptServer(server);
      },
      '불러오기',
    );
  if (action === 'push')
    return askConfirm(
      '이 기기의 내용으로 서버를 덮어씁니다. 다른 기기에서 바꾼 내용은 사라집니다.',
      async () => {
        const server = await pullDoc(syncFetch, state.sync.code);
        if (server.status !== 'ok') {
          state.syncStatus = server.status;
          return renderSyncBar();
        }
        state.builds = { ...state.builds, version: server.version };
        writeDoc(storage, state.builds);
        uploader.request();
      },
      '덮어쓰기',
    );
});
```

- [ ] **Step 6: 연결이 돌아오면 다시 보내고, 열 때 맞춘다**

기존 `window.addEventListener('online', …)` 다음에 넣는다. 기존 알림은 그대로 둔다.

```js
// 연결이 돌아오면 올리지 못한 변경을 다시 보낸다. 충돌은 사람이 고를 때까지 둔다.
window.addEventListener('online', () => {
  if (state.sync?.dirty && state.syncStatus !== 'conflict') uploader.request();
});
```

파일 끝의 `loadArticles();` 다음 줄에 넣는다.

```js
syncOnOpen();
```

- [ ] **Step 7: 서비스 워커에 새 파일을 넣는다**

`sw.js`의 `CACHE` 번호를 하나 올리고(`'champions-shell-v24'` → `'champions-shell-v25'`, 현재 값에서 1 증가), `APP_FILES`의 `'./src/builds-view.js',` 다음 줄에 넣는다.

```js
  './src/sync.js',
```

`/api/*`는 `APP_FILES`에 없으므로 서비스 워커가 가로채지 않고 네트워크로 간다. 따로 손볼 것이 없다.

- [ ] **Step 8: 확인한다**

```bash
npm run format
npm run format:check
node --test "tests/*.test.mjs"
npm run build
```

Expected: 서식 통과, 337개 통과, 빌드 성공. 로컬 `npm run dev`로 내 샘플 화면을 열면 동기화 줄에 ‘이 기기에만 저장합니다’와 단추 두 개가 보인다. 로컬에는 Functions가 없으므로 ‘동기화 켜기’는 연결 없음 상태로 끝나는 것이 정상이다.

- [ ] **Step 9: 커밋한다**

```bash
git add src/app.js sw.js
git commit -F - <<'EOF'
저장 뒤 서버로 올리고 열 때 맞추며 동기화 단추를 잇는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 미리보기 배포에서 확인하고 합친다

**사람이 할 일(대시보드)** — 코드가 준비된 이 시점에 한다.

1. Cloudflare 대시보드 → **Storage & Databases → KV** → **Create** → 이름 `champions-builds`
2. **Workers & Pages** → `2026-mini-championscompanion` → **Settings → Bindings** → **Add → KV namespace**
   - Variable name: `BUILDS`
   - KV namespace: `champions-builds`
   - **Production과 Preview 두 환경 모두**에 추가한다. 미리보기 배포는 Preview 바인딩을 쓴다.

- [ ] **Step 1: 브랜치를 올려 미리보기 배포를 만든다**

```bash
git push -u origin builds-sync
```

Cloudflare가 `https://builds-sync.2026-mini-championscompanion.pages.dev`에 배포한다. 1~2분 걸린다. 바인딩을 배포 뒤에 더했다면 대시보드에서 그 배포를 **Retry deployment** 해야 바인딩이 붙는다.

- [ ] **Step 2: 서버를 직접 두드려 본다**

```bash
B=https://builds-sync.2026-mini-championscompanion.pages.dev
C=$(node --input-type=module -e "import('./src/sync.js').then(m => console.log(m.newSyncCode()))")
curl -s -H "x-sync-code: $C" "$B/api/doc"
curl -s -X PUT -H "x-sync-code: $C" -H "content-type: application/json" -d '{"doc":{"samples":[],"parties":[]},"version":0}' "$B/api/doc"
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "x-sync-code: $C" -H "content-type: application/json" -d '{"doc":{"samples":[],"parties":[]},"version":0}' "$B/api/doc"
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/doc"
```

Expected, 순서대로: `{"doc":null,"version":0}` / `{"version":1}` / `409` / `400`.
`503`과 `{"error":"storage not bound"}`가 나오면 Preview 바인딩이 없거나 배포가 바인딩보다 먼저 만들어진 것이다. 이 검사로 KV에 빈 문서 하나가 남는다. 무해하다.

- [ ] **Step 3: 브라우저로 두 기기를 흉내 낸다**

미리보기 주소에서 내 샘플을 연다.

1. 샘플 하나를 저장한다 → ‘동기화 켜기’ → 상태 줄에 코드가 나오고, 잠시 뒤 ‘다른 기기와 동기화됩니다’가 된다. 코드를 적어 둔다.
2. 개발자 도구에서 `localStorage.removeItem('champions:builds')`, `localStorage.removeItem('champions:sync')` 후 새로고침한다. 새 기기와 같은 상태다. 목록이 비어 있어야 한다.
3. ‘코드로 연결’ → 적어 둔 코드를 하이픈 없이 소문자로 입력한다 → 1의 샘플이 나타나야 한다.
4. 샘플을 연달아 세 번 저장한다 → 개발자 도구 Network에서 `PUT /api/doc`이 동시에 둘 이상 나가지 않고, 마지막 저장까지 올라가야 한다.
5. Network를 Offline으로 바꾸고 저장 → ‘연결이 없어…’. Online으로 되돌리면 다시 올라가 ‘동기화됩니다’가 된다.
6. 충돌: 다른 브라우저(또는 폰)에서 같은 코드로 연결해 한쪽에서 저장한다. 다른 쪽을 새로고침하기 전에 그쪽에서 저장한다 → ‘다른 기기에서 바뀌었습니다’와 단추 두 개. ‘서버 것 불러오기’로 서버 내용이 들어와야 한다.

- [ ] **Step 4: 문서를 맞춘다**

`docs/builds-and-sync.md`의 `API` 절 코드 블록을 바꾼다.

```
GET  /api/doc               x-sync-code: <코드>   → { doc, version }
PUT  /api/doc               x-sync-code: <코드>   → { version } / 409 { version } / 429
POST /api/share             x-sync-code: <코드>   → { id }        (4단계)
GET  /api/share/<id>                              → 스냅샷 (코드 불필요, 읽기 전용)
```

그 아래에 덧붙인다.

```markdown
코드는 쿼리가 아니라 `x-sync-code` 헤더로 보낸다. 쿼리는 접속 기록에 남는다.

KV는 같은 키에 초당 한 번만 쓸 수 있다. 앱은 저장을 모아 한 번에 하나만 보내고
(`createUploader`), 서버는 제한에 걸리면 429를 돌려준다. 앱은 몇 번 다시 보낸 뒤
멈추고, 다음 저장이나 다음 실행, 연결 복귀 때 다시 보낸다.
```

같은 문서 `저장과 동기화` 절의 ‘다른 기기에서 바뀌었습니다. 새로 불러온 뒤 다시 저장하세요’ 문장이 있는 문단을 다음으로 바꾼다.

```markdown
올릴 때 읽어온 `version`을 함께 보낸다. 서버에 더 새 버전이 있으면 거부하고
‘다른 기기에서 바뀌었습니다’를 띄운 뒤 두 길을 준다. ‘서버 것 불러오기’는 이
기기의 올리지 못한 변경을 버리고, ‘이 기기 것으로 덮어쓰기’는 다른 기기의 변경을
버린다. 어느 쪽이든 확인을 받는다. 조용히 덮어쓰지 않는다.

처음 ‘코드로 연결’할 때는 이 기기 것과 서버 것을 합친다. 같은 항목은 나중에 저장한
쪽을 남긴다(`joinDocs`).
```

`docs/builds-handoff.md`의 상태 표에서 `| 3 동기화 | 다음 작업 |`을 `| 3 동기화 | **완료** |`로, `| 4 공유 링크 | 3단계 뒤 |`를 `| 4 공유 링크 | 다음 작업 |`로 바꾸고, `## 다음 작업 — 3단계 동기화` 절 전체를 다음으로 바꾼다.

```markdown
## 3단계 동기화

`functions/api/[[path]].js`가 `/api/doc`을, `src/sync.js`가 앱 쪽 판단을 맡는다.
KV 바인딩 `BUILDS`(네임스페이스 `champions-builds`)가 Production과 Preview에 모두
있어야 한다. 없으면 서버가 503 `storage not bound`를 돌려준다.

Functions는 로컬 `npm run dev`에서 돌지 않는다. 서버 판단은
`tests/sync-server.test.mjs`가 가짜 KV로 검사하고, 실제 동작은 브랜치를 올려 만든
미리보기 배포에서 본다.

## 다음 작업 — 4단계 공유 링크

설계는 `docs/builds-and-sync.md`의 `저장과 동기화` 끝 문단과 `API` 절에 있다.
```

`docs/builds-handoff.md`의 `## 미룬 것`에서 `sample.form` 항목을 지운다.

- [ ] **Step 5: 커밋하고 합친다**

```bash
git add docs/builds-and-sync.md docs/builds-handoff.md
git commit -F - <<'EOF'
동기화 API와 충돌 처리, 인수인계를 실제 구현에 맞춘다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git switch main
git merge --ff-only builds-sync
git push
```

Production 바인딩이 이미 있으므로 `main` 배포에서도 바로 동작한다. 폰(APK)과 PC에서 같은 코드로 연결해 한쪽에서 저장한 샘플이 다른 쪽을 다시 열었을 때 보이는지 확인한다.
