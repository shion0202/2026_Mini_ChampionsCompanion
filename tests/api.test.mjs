import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/api.js';
const DAY = 86400000;
const memory = () => {
  const map = new Map();
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: k => map.delete(k),
    key: n => [...map.keys()][n],
    get length() {
      return map.size;
    },
  };
};
const valid = value => {
  if (!value?.valid) throw Error('invalid');
  return value;
};
const response = value => ({ ok: true, json: async () => value });
const snapshot = (date, format = 'Singles', season = 'M6') => ({
  season,
  format,
  date,
  generatedAt: '2026-09-18T09:00:00Z',
  pokemon: { Salamence: { position: 1 } },
});

test('new date failure falls back to newest same-season same-format snapshot and keeps timestamps', async () => {
  let now = DAY,
    fail = false;
  const store = memory();
  const client = new ApiClient({
    storage: store,
    now: () => now,
    fetcher: async url => {
      if (fail) throw Error('missing new file');
      const [, season, date, format] = url.match(/meta\/(M\d+)\/([^/]+)\/(Singles|Doubles)/);
      return response(snapshot(date, format, season));
    },
  });
  await client.getSnapshot({ season: 'M6', format: 'Singles', date: '18_09_2026' });
  now += 1000;
  await client.getSnapshot({ season: 'M6', format: 'Singles', date: '19_09_2026' });
  now += 1000;
  await client.getSnapshot({ season: 'M6', format: 'Doubles', date: '20_09_2026' });
  now += 1000;
  await client.getSnapshot({ season: 'M5', format: 'Singles', date: '20_09_2026' });
  now += DAY;
  fail = true;
  const reloaded = new ApiClient({ storage: store, now: () => now, fetcher: client.fetcher });
  const result = await reloaded.getSnapshot(
    { season: 'M6', format: 'Singles', date: '20_09_2026' },
    { force: true },
  );
  assert.equal(result.data.date, '19_09_2026');
  assert.equal(result.data.generatedAt, '2026-09-18T09:00:00Z');
  assert.equal(result.fetchedAt, DAY + 1000);
  assert.equal(result.stale, true);
  await assert.rejects(
    reloaded.getSnapshot({ season: 'M4', format: 'Singles', date: '20_09_2026' }),
  );
});

test('fallback rejects expired, corrupt, mismatched and later-date cached snapshots', async () => {
  let now = DAY;
  const store = memory();
  const client = new ApiClient({
    storage: store,
    now: () => now,
    fetcher: async () => response(snapshot('19_09_2026')),
  });
  await client.getSnapshot({ season: 'M6', format: 'Singles', date: '19_09_2026' });
  client.fetcher = async () => {
    throw Error('offline');
  };
  await assert.rejects(client.getSnapshot({ season: 'M6', format: 'Singles', date: '18_09_2026' }));
  const key = 'champions:cache:v1:/data/meta/M6/18_09_2026/Singles.json';
  store.setItem(key, JSON.stringify({ fetchedAt: now, raw: snapshot('18_09_2026', 'Doubles') }));
  assert.equal(
    client.previousSnapshot({ season: 'M6', format: 'Singles', date: '18_09_2026' }),
    null,
  );
  store.setItem(key, 'broken');
  assert.equal(
    client.previousSnapshot({ season: 'M6', format: 'Singles', date: '18_09_2026' }),
    null,
  );
  now += 8 * DAY;
  await assert.rejects(client.getSnapshot({ season: 'M6', format: 'Singles', date: '20_09_2026' }));
});

test('session fallback works when storage is unavailable and a later success replaces it', async () => {
  let now = DAY,
    raw = snapshot('18_09_2026');
  const client = new ApiClient({
    now: () => now,
    fetcher: async () => {
      if (!raw) throw Error('offline');
      return response(raw);
    },
  });
  await client.getSnapshot({ season: 'M6', format: 'Singles', date: '18_09_2026' });
  now += DAY;
  raw = null;
  const old = await client.getSnapshot({ season: 'M6', format: 'Singles', date: '19_09_2026' });
  assert.equal(old.fetchedAt, DAY);
  assert.equal(old.stale, true);
  raw = snapshot('19_09_2026');
  const fresh = await client.getSnapshot({ season: 'M6', format: 'Singles', date: '19_09_2026' });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.fetchedAt, now);
  assert.equal(fresh.data.date, '19_09_2026');
});

test('valid response records actual fetch time and fresh cache avoids repeat request', async () => {
  let calls = 0;
  const client = new ApiClient({
    storage: memory(),
    now: () => DAY,
    fetcher: async () => {
      calls++;
      return response({ valid: true });
    },
  });
  const first = await client.get('/data/meta/index.json', valid);
  const second = await client.get('/data/meta/index.json', valid);
  assert.equal(first.fetchedAt, DAY);
  assert.equal(first.stale, false);
  assert.equal(second.fetchedAt, DAY);
  assert.equal(calls, 1);
});
test('failed refresh returns previous data without faking a newer timestamp', async () => {
  let now = DAY,
    fail = false;
  const client = new ApiClient({
    storage: memory(),
    now: () => now,
    fetcher: async () => {
      if (fail) throw Error('offline');
      return response({ valid: true });
    },
  });
  await client.get('/a', valid);
  now += DAY;
  fail = true;
  const result = await client.get('/a', valid, { force: true });
  assert.equal(result.stale, true);
  assert.equal(result.fetchedAt, DAY);
  assert.equal(result.data.valid, true);
});
test('cache older than seven days cannot become a permanent mirror', async () => {
  let now = DAY,
    fail = false;
  const client = new ApiClient({
    storage: memory(),
    now: () => now,
    fetcher: async () => {
      if (fail) throw Error('offline');
      return response({ valid: true });
    },
  });
  await client.get('/a', valid);
  now += 8 * DAY;
  fail = true;
  await assert.rejects(client.get('/a', valid));
});
test('malformed successful response cannot overwrite last valid data', async () => {
  let data = { valid: true };
  const client = new ApiClient({ storage: memory(), fetcher: async () => response(data) });
  await client.get('/a', valid);
  data = { bad: true };
  const result = await client.get('/a', valid, { force: true });
  assert.equal(result.stale, true);
  assert.equal(result.data.valid, true);
});
test('season and format cache keys cannot leak another selection', async () => {
  const client = new ApiClient({
    storage: memory(),
    fetcher: async url => response({ valid: true, url }),
  });
  const a = await client.get('/data/meta/M6/18_09_2026/Singles.json', valid);
  const b = await client.get('/data/meta/M5/10_09_2026/Doubles.json', valid);
  assert.notEqual(a.data.url, b.data.url);
});
test('blocked local storage does not prevent online use', async () => {
  const storage = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('quota');
    },
    get length() {
      throw Error('denied');
    },
  };
  const client = new ApiClient({ storage, fetcher: async () => response({ valid: true }) });
  assert.equal((await client.get('/a', valid)).data.valid, true);
});
test('unvalidated first response fails visibly', async () => {
  const client = new ApiClient({
    storage: memory(),
    fetcher: async () => response({ wrong: true }),
  });
  await assert.rejects(client.get('/a', valid), /invalid/);
});
