// 빌드 도구. 검색하고 받아오고 캐시하고 큐를 쓴다. 판단은 article-parse.mjs가 한다.
// 사용: node scripts/collect-articles.mjs --season M5 [--format singles]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  buildIndex,
  readPage,
  digest,
  parseTitle,
  isFetchable,
  looksRelevant,
  searchQueries,
  rssLinks,
  googleLinks,
} from './article-parse.mjs';

const root = new URL('../', import.meta.url);
const AGENT = 'ChampionsCompanion/0.2 (+https://github.com/Verebell)';
const PAUSE = 1000;
// b.hatena.ne.jp의 robots.txt가 Crawl-delay: 5를 요구한다. 검색은 그쪽으로만
// 나가므로 본문 요청보다 느리게 돈다.
const FEED_PAUSE = 5000;
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
// 3이라 그대로 두면 북마크가 적은 개인 구축기사가 거의 전부 빠진다. 다만 누군가
// 북마크한 글만 들어 있어 재현율이 낮다. M-5 실측에서 300건 중 21건만 보였다.
const feedUrl = query =>
  `https://b.hatena.ne.jp/q/${encodeURIComponent(query)}?mode=rss&target=text&users=1&sort=recent`;

// 구글 색인은 북마크 여부와 무관해 재현율이 훨씬 높다. 키가 없으면 이 채널만
// 건너뛰고 하테나로 계속 돈다.
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE = process.env.GOOGLE_CSE_ID;
const googleUrl = (query, start) =>
  `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CSE}` +
  `&q=${encodeURIComponent(query)}&num=10&start=${start}`;

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
let forbidden = 0;
const take = link => {
  if (!link.url || known.has(link.url) || found.has(link.url)) return;
  if (!isFetchable(link.url)) {
    forbidden++;
    return;
  }
  if (looksRelevant(link.title)) found.set(link.url, link);
};

const queries = searchQueries({ season });
const channels = [];

if (GOOGLE_KEY && GOOGLE_CSE) {
  let hits = 0;
  for (const query of queries) {
    // 무료 한도가 하루 100건이라 쿼리당 두 쪽(20건)까지만 본다.
    for (const start of [1, 11]) {
      try {
        const links = googleLinks(await fetchText(googleUrl(query, start)));
        links.forEach(take);
        hits += links.length;
        if (links.length < 10) break;
      } catch (error) {
        console.error(`구글 검색 실패 (${query}): ${error.message}`);
        break;
      }
      await wait(PAUSE);
    }
  }
  channels.push(`구글 ${queries.length}쿼리 ${hits}건`);
} else {
  channels.push('구글 건너뜀 (GOOGLE_API_KEY, GOOGLE_CSE_ID 없음)');
}

let feeds = 0;
for (const query of queries) {
  try {
    rssLinks(await fetchText(feedUrl(query))).forEach(take);
    feeds++;
  } catch (error) {
    console.error(`하테나 검색 실패 (${query}): ${error.message}`);
  }
  await wait(FEED_PAUSE);
}
channels.push(`하테나 ${feeds}쿼리`);

console.log(channels.join(' | '));
console.log(`후보 ${found.size}건` + (forbidden ? `, 수집 금지 호스트 ${forbidden}건 제외` : ''));

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
