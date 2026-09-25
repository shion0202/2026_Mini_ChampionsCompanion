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
  createShare,
  pullShare,
  shareLink,
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
  assert.equal(
    newSyncCode(n => new Uint8Array(n).fill(33)),
    '1'.repeat(20),
  );
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

test('sharing sends the snapshot with the code and reads back the id', async () => {
  let seen;
  const spy = async (url, init) => {
    seen = { url, init };
    return new Response('{"id":"ABCDEFGHJKMN","expiresAt":9}');
  };
  const snapshot = { kind: 'sample', sample: { id: 'a' } };
  assert.deepEqual(await createShare(spy, code, snapshot), {
    status: 'ok',
    id: 'ABCDEFGHJKMN',
    expiresAt: 9,
  });
  assert.equal(seen.url, './api/share');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['x-sync-code'], code);
  assert.deepEqual(JSON.parse(seen.init.body), snapshot);
  assert.equal((await createShare(reply(403, {}), code, snapshot)).status, 'notSynced');
  assert.equal((await createShare(reply(413, {}), code, snapshot)).status, 'error');
  assert.equal((await createShare(down, code, snapshot)).status, 'offline');
});

test('opening a link needs no code and tells a missing link apart', async () => {
  let seen;
  const spy = async (url, init) => {
    seen = { url, init };
    return new Response('{"kind":"sample"}');
  };
  assert.deepEqual(await pullShare(spy, 'ABCDEFGHJKMN'), {
    status: 'ok',
    share: { kind: 'sample' },
  });
  assert.equal(seen.url, './api/share/ABCDEFGHJKMN');
  assert.equal(seen.init, undefined, '코드 헤더를 보내지 않는다');
  assert.equal((await pullShare(reply(404, {}), 'X')).status, 'missing');
  assert.equal((await pullShare(reply(503, {}), 'X')).status, 'retry');
  assert.equal((await pullShare(down, 'X')).status, 'offline');
});

test('a share link is the app address with the id in the fragment', () => {
  const location = {
    origin: 'https://app.example',
    pathname: '/',
    search: '?x=1',
    hash: '#builds',
  };
  assert.equal(shareLink(location, 'ABCDEFGHJKMN'), 'https://app.example/#share=ABCDEFGHJKMN');
});
