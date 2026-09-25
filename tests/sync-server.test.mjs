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
  assert.equal(
    (await call(env, { code: 'abcdefghjkmnpqrstv01' })).status,
    400,
    '정규화는 앱이 한다',
  );
  assert.equal(
    (await call(env, { code: 'ABCDEFGHJKMNPQRSTVU1' })).status,
    400,
    'U는 쓰지 않는 글자',
  );
});

test('bodies that are too large or malformed are rejected before storage', async () => {
  const env = { BUILDS: kv() };
  const huge = JSON.stringify({ doc: { ...doc, note: 'x'.repeat(MAX_BODY) }, version: 0 });
  assert.equal((await call(env, { method: 'PUT', body: huge })).status, 413);
  assert.equal((await call(env, { method: 'PUT', body: '{not json' })).status, 400);
  assert.equal(
    (await call(env, { method: 'PUT', body: { doc: { samples: [] }, version: 0 } })).status,
    400,
  );
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
