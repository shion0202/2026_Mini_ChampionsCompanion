import { SOURCE, normalizeSnapshot, formatDate } from './data.js';
const PREFIX = 'champions:cache:v1:';
const FRESH_MS = 60 * 60 * 1000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORDS = 5;

export class ApiClient {
  constructor({
    storage = null,
    fetcher = globalThis.fetch.bind(globalThis),
    now = Date.now,
  } = {}) {
    this.storage = storage;
    this.fetcher = fetcher;
    this.now = now;
    this.snapshots = new Map();
    this.prune();
  }
  prune() {
    [...this.snapshots]
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .forEach(([key, item], index) => {
        if (
          this.now() - item.fetchedAt > MAX_AGE ||
          item.fetchedAt > this.now() + FRESH_MS ||
          index >= MAX_RECORDS - 1
        )
          this.snapshots.delete(key);
      });
    try {
      const records = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          records.push({ key, fetchedAt: JSON.parse(this.storage.getItem(key)).fetchedAt });
        } catch {
          records.push({ key, fetchedAt: 0 });
        }
      }
      records
        .sort((a, b) => b.fetchedAt - a.fetchedAt)
        .forEach((r, index) => {
          if (
            !Number.isFinite(r.fetchedAt) ||
            this.now() - r.fetchedAt > MAX_AGE ||
            index >= MAX_RECORDS
          )
            this.storage.removeItem(r.key);
        });
    } catch {
      /* Private browsing or disabled storage: online mode still works. */
    }
  }
  read(path, validate) {
    try {
      const item = JSON.parse(this.storage.getItem(PREFIX + path));
      if (
        !item ||
        !Number.isFinite(item.fetchedAt) ||
        this.now() - item.fetchedAt > MAX_AGE ||
        item.fetchedAt > this.now() + FRESH_MS
      ) {
        this.storage.removeItem(PREFIX + path);
        return null;
      }
      return { data: validate(item.raw), fetchedAt: item.fetchedAt };
    } catch {
      return null;
    }
  }
  previousSnapshot(context) {
    this.prune();
    const candidates = [...this.snapshots.values()];
    // Collect first: read() drops expired entries, and removing during an indexed
    // walk shifts the remaining keys down and skips one.
    const matches = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const path = key.slice(PREFIX.length);
        const match = path.match(
          /^\/data\/meta\/(M\d+)\/(\d{2}_\d{2}_\d{4})\/(Singles|Doubles)\.json$/,
        );
        if (!match || match[1] !== context.season || match[3] !== context.format) continue;
        matches.push({ path, season: match[1], date: match[2], format: match[3] });
      }
    } catch {
      /* Session copies still work when browser storage is unavailable. */
    }
    for (const { path, season, date, format } of matches) {
      const item = this.read(path, raw => normalizeSnapshot(raw, { season, date, format }));
      if (item) candidates.push(item);
    }
    return (
      candidates
        .filter(
          ({ data }) =>
            data.season === context.season &&
            data.format === context.format &&
            (!context.date || formatDate(data.date) <= formatDate(context.date)),
        )
        .sort(
          (a, b) =>
            formatDate(b.data.date).localeCompare(formatDate(a.data.date)) ||
            b.fetchedAt - a.fetchedAt,
        )[0] ?? null
    );
  }
  async getSnapshot(context, options) {
    const path = `/data/meta/${context.season}/${context.date}/${context.format}.json`;
    try {
      const result = await this.get(path, raw => normalizeSnapshot(raw, context), options);
      this.snapshots.set(path, { data: result.data, fetchedAt: result.fetchedAt });
      this.prune();
      return result;
    } catch (error) {
      const previous = this.previousSnapshot(context);
      if (previous) return { ...previous, stale: true, cached: true, error: String(error.message) };
      throw error;
    }
  }
  async get(path, validate, { force = false } = {}) {
    this.prune();
    const previous = this.read(path, validate);
    if (!force && previous && this.now() - previous.fetchedAt < FRESH_MS)
      return { ...previous, stale: false, cached: true };
    try {
      const response = await this.fetcher(SOURCE + path, {
        cache: 'no-cache',
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`통계 서버 응답 오류 (${response.status})`);
      const raw = await response.json();
      const data = validate(raw);
      const fetchedAt = this.now();
      try {
        this.storage.setItem(PREFIX + path, JSON.stringify({ fetchedAt, raw }));
        this.prune();
      } catch {
        /* Storage quota is not a network failure. */
      }
      return { data, fetchedAt, stale: false, cached: false };
    } catch (error) {
      if (previous) return { ...previous, stale: true, cached: true, error: String(error.message) };
      throw error;
    }
  }
}
