// 빌드 도구. 기사 주소(리드)를 모으고, 받아오고, 캐시하고, 큐를 쓴다. 판단은
// article-parse.mjs가 한다.
// 사용: node scripts/collect-articles.mjs --season M5 [--format singles]
//        [--urls 주소목록.txt ...] [--from 목록페이지주소 ...] [--no-search] [--no-feeds]
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  buildIndex,
  readPage,
  digest,
  articleKey,
  decodeHtml,
  looksGarbled,
  gameCheck,
  parseTitle,
  looksRelevant,
  searchQueries,
  feedLinks,
  feedUrlFor,
  extractLinks,
  isLeadLink,
  humanOnly,
  isNonArticle,
  looksLikeArticle,
  pageUrlOf,
  robotsAllows,
  googleLinks,
} from './article-parse.mjs';

const root = new URL('../', import.meta.url);
const AGENT = 'ChampionsCompanion/0.2 (+https://github.com/Verebell)';
const PAUSE = 1000;
// b.hatena.ne.jp의 robots.txt가 Crawl-delay: 5를 요구한다. 검색은 그쪽으로만
// 나가므로 본문 요청보다 느리게 돈다.
const FEED_PAUSE = 5000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const args = process.argv.slice(2);
const argument = name => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? null : args[at + 1];
};
const every = name => args.flatMap((value, at) => (args[at - 1] === `--${name}` ? [value] : []));
const season = argument('season');
if (!season) {
  console.error(
    '사용: node scripts/collect-articles.mjs --season M5 [--format singles|doubles]\n' +
      '      [--urls 주소목록.txt] [--from 목록페이지주소] [--no-search] [--no-feeds]',
  );
  process.exit(1);
}
const format = argument('format');
const wanted = format ? (format.toLowerCase().startsWith('d') ? 'Doubles' : 'Singles') : null;
const useSearch = !args.includes('--no-search');
const useFeeds = !args.includes('--no-feeds');

// 하테나 북마크는 note, pokesol, fc2, 개인 도메인 기사를 모두 색인한다. users 기본값이
// 3이라 그대로 두면 북마크가 적은 개인 구축 기사가 거의 전부 빠진다. 다만 누군가
// 북마크한 글만 들어 있어 재현율이 낮다. M-5 실측에서 300건 중 21건만 보였다.
const feedUrl = query =>
  `https://b.hatena.ne.jp/q/${encodeURIComponent(query)}?mode=rss&target=text&users=1&sort=recent`;

// 구글 Custom Search는 2025년에 새 가입을 닫았고 2027-01-01에 끝난다. 기존 키가
// 있는 사람만 쓰도록 남겨 둔다. 키가 없으면 이 채널만 건너뛴다.
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
  if (!response.ok)
    throw Object.assign(Error(`${response.status}: ${url}`), { status: response.status });
  return response.text();
}

// 처음 보는 호스트가 목록 페이지와 피드로 계속 들어온다. 호스트마다 robots.txt를
// 한 번 받아 둔다. 4xx는 파일이 없다는 뜻이라 허용하고, 받지 못한 경우(5xx, 시간
// 초과)는 판단할 수 없으므로 받지 않는다.
const robotsCache = new Map();
async function allowed(url) {
  if (humanOnly(url)) return false;
  const origin = new URL(url).origin;
  if (!robotsCache.has(origin))
    robotsCache.set(
      origin,
      fetchText(`${origin}/robots.txt`).catch(error =>
        error.status >= 400 && error.status < 500 ? '' : null,
      ),
    );
  const robots = await robotsCache.get(origin);
  return robots !== null && robotsAllows(robots, url);
}

const cacheDir = new URL('.cache/articles/', root);
await mkdir(cacheDir, { recursive: true });
const cachePath = url => new URL(`${createHash('sha1').update(url).digest('hex')}.html`, cacheDir);

// 판정은 팀 이미지를 보고 한다. 판정하는 세션이 따로 받지 않도록 본문 이미지를 캐시에
// 둔다. robots.txt를 같은 기준으로 보고, 이미지가 아니거나 너무 크면 받지 않는다.
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const IMAGE_LIMIT = 5 * 1024 * 1024;
async function cacheImage(url) {
  const name = createHash('sha1').update(url).digest('hex');
  const cached = (await readdir(cacheDir)).find(
    file => file.startsWith(`${name}.`) && !file.endsWith('.html'),
  );
  if (cached) return `.cache/articles/${cached}`;
  if (!(await allowed(url))) return null;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': AGENT },
      signal: AbortSignal.timeout(30000),
    });
    const type = response.headers.get('content-type')?.split(';')[0].trim();
    const body = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !IMAGE_TYPES[type] || body.length > IMAGE_LIMIT) return null;
    const file = `${name}.${IMAGE_TYPES[type]}`;
    await writeFile(new URL(file, cacheDir), body);
    await wait(PAUSE);
    return `.cache/articles/${file}`;
  } catch {
    return null;
  }
}

async function fetchArticle(url) {
  const path = cachePath(url);
  const cached = await readFile(path, 'utf8').catch(() => null);
  if (cached !== null && !looksGarbled(cached)) return cached;
  const response = await fetch(url, {
    headers: { 'user-agent': AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  // 캐시는 UTF-8로 풀어 둔다. 검토 화면과 파서가 인코딩을 다시 따지지 않게 한다.
  const html = decodeHtml(
    new Uint8Array(await response.arrayBuffer()),
    response.headers.get('content-type') ?? '',
  );
  await writeFile(path, html);
  await wait(PAUSE);
  return html;
}

const readJson = (path, fallback) =>
  readFile(new URL(path, root), 'utf8')
    .then(JSON.parse)
    .catch(error => {
      if (fallback !== undefined && error.code === 'ENOENT') return fallback;
      throw error;
    });
// 큐는 시즌마다 따로 둔다. 한 파일에 합치면 지난 시즌 후보가 이번 판정에 섞인다.
const queueName = `article-queue-${season.toLowerCase()}.json`;
// 작성자 피드는 시즌과 무관하다. 지난 시즌 큐(시즌 없는 옛 이름 포함)의 기사도 모두
// 피드를 되짚는 데 쓴다.
const queueNames = (await readdir(new URL('.cache/', root))).filter(name =>
  /^article-queue(-[a-z0-9]+)?\.json$/.test(name),
);
const [reference, ko, existing, feedList, skipList, queues] = await Promise.all([
  readJson('public/data/reference.json'),
  readJson('public/data/ko.json'),
  readJson('public/data/articles.json'),
  readJson('scripts/article-feeds.json', { feeds: [] }),
  readJson('scripts/article-skip.json', { skipped: [] }),
  Promise.all(queueNames.map(name => readJson(`.cache/${name}`))),
]);
const previous = queues[queueNames.indexOf(queueName)] ?? { entries: [] };
const index = buildIndex(reference, ko);
// 등록한 기사와 판정에서 파티 기사가 아니라고 본 주소는 다시 큐에 올리지 않는다.
// 주소는 articleKey로 비교한다(http/https, www., 끝의 /가 달라도 같은 글).
const known = new Set(
  [
    ...existing.articles.map(article => article.url),
    ...skipList.skipped.map(entry => entry.url),
  ].map(articleKey),
);

// 리드: 아직 받지 않은 기사 주소. source는 어디서 왔는지, manual은 사람이 고른
// 주소라 제목 검사를 건너뛴다는 뜻이다.
const found = new Map();
const counts = {};
const take = (link, source, manual = false) => {
  if (!link.url || isNonArticle(link.url)) return;
  const key = articleKey(link.url);
  if (known.has(key) || found.has(key)) return;
  const hint = `${link.title ?? ''} ${link.context ?? ''}`;
  if (!manual) {
    if (!looksRelevant(hint)) return;
    // 받아오기 전에 제목이 밝힌 시즌이 다르면 버린다. 작성자 피드에는 지난 시즌
    // 기사가 함께 있다.
    const titled = parseTitle(hint).season;
    if (titled && titled !== season.toUpperCase()) return;
  }
  found.set(key, { ...link, source });
  counts[source] = (counts[source] ?? 0) + 1;
};
const channels = [];

// 1. 사람이 넘긴 주소. 포케DB 목록처럼 AI 수집을 막은 곳에서 사람이 직접 본 주소나,
// 저장한 목록 페이지 HTML을 받는다. 텍스트면 모든 주소를, HTML이면 기사처럼 보이는
// 링크만 쓴다.
for (const file of every('urls')) {
  const body = await readFile(file, 'utf8');
  const html = /<a\b/i.test(body);
  const base = html ? pageUrlOf(body) : undefined;
  const links = extractLinks(body, base);
  links.filter(link => !html || isLeadLink(link, base)).forEach(link => take(link, 'manual', true));
  channels.push(`주소 목록 ${file} ${links.length}건`);
}

// 2. 기사 모음 페이지. 공략 사이트의 상위 구축 모음처럼 원문 링크를 모아 둔 곳에서
// 링크만 거둔다. 그 페이지의 본문은 큐에 넣지 않는다.
for (const page of every('from')) {
  try {
    if (!(await allowed(page))) {
      console.error(`목록 페이지 건너뜀 (robots.txt): ${page}`);
      continue;
    }
    const links = extractLinks(await fetchText(page), page).filter(link => isLeadLink(link, page));
    links.forEach(link => take(link, 'index', true));
    channels.push(`목록 ${new URL(page).host} ${links.length}건`);
  } catch (error) {
    console.error(`목록 페이지 실패 (${page}): ${error.message}`);
  }
  await wait(PAUSE);
}

// 3. 작성자 피드. 등록했거나 큐에 올랐던 기사의 블로그와 article-feeds.json에 적은
// 피드를 본다. 상위 랭커는 시즌마다 같은 곳에 쓰므로 검색보다 확실하다.
if (useFeeds) {
  const feeds = new Set(
    [
      ...existing.articles.map(article => feedUrlFor(article.url)),
      ...queues.flatMap(queue => queue.entries.map(entry => feedUrlFor(entry.url))),
      ...feedList.feeds.map(value => feedUrlFor(value) ?? value),
    ].filter(Boolean),
  );
  let read = 0;
  for (const feed of feeds) {
    try {
      if (!(await allowed(feed))) continue;
      feedLinks(await fetchText(feed)).forEach(link => take(link, 'feed'));
      read++;
    } catch (error) {
      console.error(`피드 실패 (${feed}): ${error.message}`);
    }
    await wait(PAUSE);
  }
  channels.push(`작성자 피드 ${read}/${feeds.size}`);
}

// 4. 검색. 구글(키가 있을 때)과 하테나 북마크.
if (useSearch) {
  const queries = searchQueries({ season });
  if (GOOGLE_KEY && GOOGLE_CSE) {
    let hits = 0;
    for (const query of queries) {
      // 무료 한도가 하루 100건이라 쿼리당 두 쪽(20건)까지만 본다.
      for (const start of [1, 11]) {
        try {
          const links = googleLinks(await fetchText(googleUrl(query, start)));
          links.forEach(link => take(link, 'google'));
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
      feedLinks(await fetchText(feedUrl(query))).forEach(link => take(link, 'hatena'));
      feeds++;
    } catch (error) {
      console.error(`하테나 검색 실패 (${query}): ${error.message}`);
    }
    await wait(FEED_PAUSE);
  }
  channels.push(`하테나 ${feeds}쿼리`);
}

// 이전 큐도 이번 규칙으로 다시 판단한다. 원문과 이미지는 캐시에서 읽으므로 요청이
// 거의 없고, 규칙을 고친 뒤 돌리면 이미 쌓인 오탐도 빠진다.
let requeued = 0;
for (const entry of previous.entries) {
  const key = articleKey(entry.url);
  if (known.has(key) || found.has(key)) continue;
  found.set(key, {
    url: entry.url,
    title: entry.title,
    date: entry.publishedAt,
    context: entry.leadText ?? '',
    lead: entry.leadText ?? '',
    rankHint: entry.rankHint ?? null,
    source: entry.source ?? 'manual',
  });
  requeued++;
}
if (requeued) channels.push(`이전 큐 ${requeued}건 다시 판단`);

console.log(channels.join(' | '));
console.log(
  `후보 ${found.size}건 (` +
    Object.entries(counts)
      .map(([source, count]) => `${source} ${count}`)
      .join(', ') +
    ')',
);

const slug = value =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

// 사람이 직접 봐야 하는 기사. 수집기가 받지 않는(받을 수 없는) 곳이라 판정 큐 대신
// leads/review-<시즌>.txt에 남긴다. 파일은 누적되고 같은 주소는 한 번만 적는다.
const reviewPath = new URL(`leads/review-${season.toLowerCase()}.txt`, root);
const reviewLines = await readFile(reviewPath, 'utf8')
  .then(body => body.split(/\r?\n/).filter(Boolean))
  .catch(() => ['# 순위\t이유\t주소\t제목·메모 — 사람이 원문을 보고 파티를 확인할 기사']);
const reviewed = new Set(reviewLines.map(line => line.split('\t')[2]).filter(Boolean));
let reviewAdded = 0;
const toReview = (url, link, reason) => {
  if (reviewed.has(url)) return;
  reviewed.add(url);
  const rank =
    parseTitle(`${link.title ?? ''} ${link.context ?? ''}`).rank ?? link.rankHint ?? null;
  const memo = (link.title || link.context || '').replace(/\s+/g, ' ').slice(0, 80);
  reviewLines.push([rank === null ? '-' : `${rank}위`, reason, url, memo].join('\t'));
  reviewAdded++;
};

const entries = [];
// 왜 걸렀는지 세어 둔다. 한 건도 안 남을 때 검색어 탓인지 필터 탓인지 알아야 한다.
const skipped = {
  'X 게시물': 0,
  'YouTube 영상': 0,
  '수집 금지 호스트': 0,
  'robots.txt': 0,
  fetch: 0,
  'not-an-article': 0,
  'other-game': 0,
  season: 0,
  format: 0,
};
for (const link of found.values()) {
  const url = link.url;
  if (!looksLikeArticle(url)) {
    skipped['not-an-article']++;
    continue;
  }
  const reason = humanOnly(url) ?? ((await allowed(url)) ? null : 'robots.txt');
  if (reason) {
    toReview(url, link, reason);
    skipped[reason]++;
    continue;
  }
  let html;
  try {
    html = await fetchArticle(url);
  } catch (error) {
    console.error(`본문 실패 (${url}): ${error.message}`);
    // 일시적인 실패일 수 있다. 다시 돌려도 안 되면 사람이 본다.
    toReview(url, link, '받기 실패');
    skipped.fetch++;
    continue;
  }
  const page = readPage(html);
  const imageFiles = [];
  for (const image of page.images) imageFiles.push(await cacheImage(image));
  // 사람이 넘긴 주소는 제목이 아니라 옆에 적은 힌트에 순위가 있을 수 있다.
  const title = parseTitle(page.title || link.title);
  const hint = parseTitle(`${link.title ?? ''} ${link.context ?? ''}`);
  const rank = title.rank ?? hint.rank ?? link.rankHint ?? null;
  const titledSeason = title.season ?? hint.season;
  const titledFormat = title.format ?? hint.format;
  const { candidates, flags } = digest(page, index);
  // 작성자 피드와 검색은 같은 블로그의 지난 게임 기사(소드실드 S5, SV 시즌 20, 대회
  // 후기)를 섞어 온다. 챔피언스 이전에 쓴 글이나 다른 게임 기사는 버린다. 사람이 고른
  // 주소(포케DB 목록 등)는 챔피언스 목록에서 왔으므로 버리지 않고 플래그만 단다.
  const game = gameCheck(`${page.title} ${page.text}`, page.publishedAt ?? link.date);
  const picked = link.source === 'manual' || link.source === 'index';
  if (!picked && (game.includes('before-champions') || game.includes('other-game'))) {
    skipped['other-game']++;
    continue;
  }
  // 제목에 최종 순위가 없으면 구축 기사가 아닐 확률이 높다. 챔피언스 후보가 여섯
  // 미만인 글까지 큐에 넣으면 판정 비용만 늘어난다.
  if (rank === null && candidates.filter(c => c.champions).length < 6) {
    skipped['not-an-article']++;
    continue;
  }
  // 제목이 밝힌 시즌과 형식이 요청과 다르면 거른다. 밝히지 않은 글은 통과시켜
  // 3단계가 본문과 이미지로 판단하게 둔다.
  if (titledSeason && titledSeason !== season.toUpperCase()) {
    skipped.season++;
    continue;
  }
  if (wanted && titledFormat && titledFormat !== wanted) {
    skipped.format++;
    continue;
  }
  entries.push({
    url,
    source: link.source,
    id: [
      String(titledSeason ?? season).toLowerCase(),
      (titledFormat ?? wanted ?? '').toLowerCase(),
      slug(page.siteName),
    ]
      .filter(Boolean)
      .join('-'),
    title: page.title || link.title,
    author: null,
    siteName: page.siteName,
    publishedAt: page.publishedAt ?? link.date ?? null,
    rank,
    rankHint: link.rankHint ?? null,
    // 목록 페이지에서 링크 옆에 있던 글(순위, 작성자). 검토 화면에 보인다.
    leadText: (link.lead || link.context || '').slice(0, 160),
    season: titledSeason,
    format: titledFormat,
    monthly: title.monthly || hint.monthly,
    images: page.images,
    // images와 같은 순서. 받지 못한 이미지는 null이다.
    imageFiles,
    excerpt: page.excerpt,
    candidates,
    flags: [
      ...flags,
      ...game,
      ...(page.images.length && !imageFiles.some(Boolean) ? ['image-not-cached'] : []),
      ...(rank === null ? ['rank-missing'] : []),
      ...(title.rank === null && rank !== null ? ['rank-from-hint'] : []),
      ...(titledSeason === null ? ['season-missing'] : []),
      ...(titledFormat === null ? ['format-missing'] : []),
      ...(title.monthly || hint.monthly ? ['monthly-challenge'] : []),
    ],
  });
}

// 큐는 여러 번에 나눠 채운다(검색 한 번, 주소 목록 한 번). 이전 큐는 위에서 다시
// 판단했으므로 이번 결과가 곧 큐다. articles.json과 제외 목록에 든 주소는 빠진다.
// 판정은 사람이 고른 주소(포케DB 목록 등)부터, 그 안에서 순위순으로 한다.
const trust = entry => (entry.source === 'manual' || entry.source === 'index' ? 0 : 1);
entries.sort((a, b) => trust(a) - trust(b) || (a.rank ?? Infinity) - (b.rank ?? Infinity));
const out = new URL(`.cache/${queueName}`, root);
await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
console.log(`${queueName}: ${entries.length}건 (이전 ${previous.entries.length}건)`);
console.log(
  '거른 것: ' +
    (Object.entries(skipped)
      .filter(([, count]) => count)
      .map(([reason, count]) => `${reason} ${count}`)
      .join(', ') || '없음'),
);
console.log(`플래그가 붙은 건: ${entries.filter(e => e.flags.length).length}`);
if (reviewAdded) {
  await mkdir(new URL('leads/', root), { recursive: true });
  await writeFile(reviewPath, reviewLines.join('\n') + '\n');
}
console.log(
  `사람 검토 목록 leads/review-${season.toLowerCase()}.txt: 새로 ${reviewAdded}건, 전체 ${reviewLines.length - 1}건`,
);
