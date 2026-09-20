// 빌드 도구. 검색하고 받아오고 캐시하고 큐를 쓴다. 판단은 article-parse.mjs가 한다.
// 사용: node scripts/collect-articles.mjs --season M5 [--format singles]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  buildIndex,
  readPage,
  digest,
  parseTitle,
  looksLikeArticle,
  looksRelevant,
  searchQueries,
  rssLinks,
} from './article-parse.mjs';

const root = new URL('../', import.meta.url);
const AGENT = 'ChampionsCompanion/0.2 (+https://github.com/Verebell)';
const PAUSE = 1000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const argument = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? null : process.argv[at + 1];
};
const season = argument('season');
if (!season) {
  console.error('사용: node scripts/collect-articles.mjs --season M5 [--format singles|doubles]');
  process.exit(1);
}
const format = argument('format');
const wanted = format ? (format.toLowerCase().startsWith('d') ? 'Doubles' : 'Singles') : null;

// 하테나 북마크는 note, pokesol, fc2, 개인 도메인 기사를 모두 색인한다. users 기본값이
// 3이라 그대로 두면 북마크가 적은 개인 구축기사가 거의 전부 빠진다.
const feedUrl = query =>
  `https://b.hatena.ne.jp/q/${encodeURIComponent(query)}?mode=rss&target=text&users=1&sort=recent`;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.text();
}

const cacheDir = new URL('.cache/articles/', root);
await mkdir(cacheDir, { recursive: true });
const cachePath = url => new URL(`${createHash('sha1').update(url).digest('hex')}.html`, cacheDir);

async function fetchArticle(url) {
  const path = cachePath(url);
  try {
    return await readFile(path, 'utf8');
  } catch {
    const html = await fetchText(url);
    await writeFile(path, html);
    await wait(PAUSE);
    return html;
  }
}

const [reference, ko, existing] = await Promise.all(
  ['reference', 'ko', 'articles'].map(name =>
    readFile(new URL(`public/data/${name}.json`, root), 'utf8').then(JSON.parse),
  ),
);
const index = buildIndex(reference, ko);
const known = new Set(existing.articles.map(article => article.url));

const found = new Map();
let feeds = 0;
for (const query of searchQueries({ season })) {
  try {
    for (const link of rssLinks(await fetchText(feedUrl(query))))
      if (
        looksLikeArticle(link.url) &&
        looksRelevant(link.title) &&
        !known.has(link.url) &&
        !found.has(link.url)
      )
        found.set(link.url, link);
    feeds++;
  } catch (error) {
    console.error(`검색 실패 (${query}): ${error.message}`);
  }
  await wait(PAUSE);
}
console.log(`검색 ${feeds}회로 후보 ${found.size}건`);

const slug = value =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

const entries = [];
// 왜 걸렀는지 세어 둔다. 한 건도 안 남을 때 검색어 탓인지 필터 탓인지 알아야 한다.
const skipped = { fetch: 0, 'not-an-article': 0, season: 0, format: 0 };
for (const [url, link] of found) {
  let html;
  try {
    html = await fetchArticle(url);
  } catch (error) {
    console.error(`본문 실패 (${url}): ${error.message}`);
    skipped.fetch++;
    continue;
  }
  const page = readPage(html);
  const title = parseTitle(page.title || link.title);
  const { candidates, flags } = digest(page, index);
  // 제목에 최종 순위가 없으면 구축기사가 아닐 확률이 높다. 챔피언스 후보가 여섯
  // 미만인 글까지 큐에 넣으면 판정 비용만 늘어난다.
  if (title.rank === null && candidates.filter(c => c.champions).length < 6) {
    skipped['not-an-article']++;
    continue;
  }
  // 제목이 밝힌 시즌과 형식이 요청과 다르면 거른다. 밝히지 않은 글은 통과시켜
  // 3단계가 본문과 이미지로 판단하게 둔다.
  if (title.season && title.season !== season.toUpperCase()) {
    skipped.season++;
    continue;
  }
  if (wanted && title.format && title.format !== wanted) {
    skipped.format++;
    continue;
  }
  entries.push({
    url,
    id: [
      String(title.season ?? season).toLowerCase(),
      (title.format ?? wanted ?? '').toLowerCase(),
      slug(page.siteName),
    ]
      .filter(Boolean)
      .join('-'),
    title: page.title || link.title,
    author: null,
    siteName: page.siteName,
    publishedAt: page.publishedAt ?? link.date,
    rank: title.rank,
    season: title.season,
    format: title.format,
    monthly: title.monthly,
    images: page.images,
    excerpt: page.excerpt,
    candidates,
    flags: [
      ...flags,
      ...(title.rank === null ? ['rank-missing'] : []),
      ...(title.season === null ? ['season-missing'] : []),
      ...(title.format === null ? ['format-missing'] : []),
      ...(title.monthly ? ['monthly-challenge'] : []),
    ],
  });
}

const out = new URL('.cache/article-queue.json', root);
await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
console.log(`큐에 ${entries.length}건`);
console.log(
  '거른 것: ' +
    Object.entries(skipped)
      .filter(([, count]) => count)
      .map(([reason, count]) => `${reason} ${count}`)
      .join(', '),
);
console.log(`플래그가 붙은 건: ${entries.filter(e => e.flags.length).length}`);
