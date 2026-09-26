// 네트워크를 쓰지 않는 파서만 다룬다. 수집 CLI는 scripts/collect-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildIndex,
  decodeHtml,
  digest,
  extractLinks,
  looksGarbled,
  feedLinks,
  gameCheck,
  feedUrlFor,
  googleLinks,
  humanOnly,
  isBlogPost,
  isNonArticle,
  pageUrlOf,
  isLeadLink,
  robotsAllows,
  isFetchable,
  normalize,
  parseTitle,
  readPage,
  looksLikeArticle,
  looksRelevant,
  rssLinks,
  searchQueries,
} from '../scripts/article-parse.mjs';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [reference, ko] = await Promise.all(['reference', 'ko'].map(read));
const index = buildIndex(reference, ko);

test('normalize folds the full-width forms that item names use', () => {
  assert.equal(normalize('リザードナイトＹ'), 'リザードナイトY');
  assert.equal(normalize('Ｍ－５'), 'M-5');
  assert.equal(normalize('ガブリアス'), 'ガブリアス');
});

test('the index reads base, mega and regional names', () => {
  assert.equal(index.pokemon.get('ガブリアス'), 'garchomp');
  assert.equal(index.pokemon.get('リザードン'), 'charizard');
  assert.equal(index.pokemon.get('メガリザードンY'), 'charizardmegay');
  assert.equal(index.pokemon.get('メガルカリオ'), 'lucariomega');
  assert.equal(index.pokemon.get('アローラキュウコン'), 'ninetalesalola');
  assert.equal(index.pokemon.get('ガラルヤドン'), 'slowpokegalar');
  // 폼이 나뉜 종족의 메가는 forme이 'M-Mega' 꼴이라 꼬리표를 붙이지 않는다.
  // 어차피 기본 종족으로 묶어 세므로 후보를 놓치지 않는다.
  assert.equal(index.pokemon.get('メガニャオニクス'), 'meowsticmmega');
});

test('longer names come first so a mega is never read as its base', () => {
  const names = [...index.pokemon.keys()];
  for (let i = 1; i < names.length; i++)
    assert.ok(names[i - 1].length >= names[i].length, `${names[i - 1]} 뒤에 ${names[i]}`);
});

test('the item index carries full names and the abbreviations articles use', () => {
  assert.equal(index.item.get('こだわりスカーフ'), 'choicescarf');
  assert.equal(index.item.get('スカーフ'), 'choicescarf');
  assert.equal(index.item.get('きあいのタスキ'), 'focussash');
  assert.equal(index.item.get('タスキ'), 'focussash');
  assert.equal(index.item.get('とつげきチョッキ'), 'assaultvest');
  assert.equal(index.item.get('リザードナイトY'), 'charizarditey');
});

test('mega forms map back to the stone that produces them', () => {
  assert.equal(index.formStone.get('charizardmegay'), 'charizarditey');
  assert.equal(index.formStone.get('lucariomega'), 'lucarionite');
  assert.equal(index.formStone.get('gengarmega'), 'gengarite');
});

test('every form resolves to its base species, and Champions membership is known', () => {
  assert.equal(index.baseOf.get('charizardmegay'), 'charizard');
  assert.equal(index.baseOf.get('ninetalesalola'), 'ninetales');
  assert.equal(index.baseOf.get('garchomp'), 'garchomp');
  assert.ok(index.champions.has('garchomp'));
  assert.ok(index.champions.size > 300);
});

test('titles give the final rank, season and format', () => {
  assert.deepEqual(parseTitle('【M-5】神速ルカリザスタン【最終2位】'), {
    rank: 2,
    season: 'M5',
    format: null,
    monthly: false,
  });
  assert.deepEqual(parseTitle('【S5最終1位】臥薪嘗胆アーマーガア'), {
    rank: 1,
    season: 'M5',
    format: null,
    monthly: false,
  });
  assert.deepEqual(
    parseTitle(
      '【ポケモンチャンピオンズ シーズンM-3シングル】ヤドヌメ構築【最終151位/レート2434】',
    ),
    { rank: 151, season: 'M3', format: 'Singles', monthly: false },
  );
  assert.deepEqual(parseTitle('【最終80位/レート2268】バンギラス【ランクダブル/M-A/M-2】'), {
    rank: 80,
    season: 'M2',
    format: 'Doubles',
    monthly: false,
  });
});

test('monthly challenge ranks are flagged, never taken as the season rank', () => {
  // docs/articles.md 1번: 월간 챌린지 성적을 랭크배틀 최종 순위로 넣지 않는다.
  const both = parseTitle('【シーズンM-4最終44位・MCS26.07最終13位】滅びゲンガースタン改');
  assert.equal(both.monthly, true);
  assert.equal(both.season, 'M4');
  const only = parseTitle('【MCS 2026.08 最終670位】メガメガニウム1メガ構築');
  assert.equal(only.monthly, true);
  assert.equal(only.season, null, 'MCS26.07의 숫자를 시즌으로 읽으면 안 된다');
});

test('a regulation label is not a season', () => {
  const parsed = parseTitle('【チャンピオンズダブル-レギュM-B】ライジングトリルフワン【S4-364位】');
  assert.equal(parsed.season, 'M4');
  assert.equal(parsed.format, 'Doubles');
});

test('a title with no final rank still parses instead of throwing', () => {
  assert.deepEqual(parseTitle('『ポケモンチャンピオンズ』ガラル御三家が解禁！'), {
    rank: null,
    season: null,
    format: null,
    monthly: false,
  });
});

const page = readPage(`<!doctype html><html><head>
<title>무시된다</title>
<meta property="og:title" content="【M-5】テスト構築【最終2位】 - 人生詰みサイクル">
<meta property="og:site_name" content="人生詰みサイクル">
<meta property="article:published_time" content="2026-09-10T08:48:18Z">
</head><body>
<script>var noise = '<p>ガブリアス</p>';</script>
<style>.x { color: red }</style>
<img src="https://cdn.image.st-hatena.com/image/square/aaa/custom_blog_icon/1.png">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143307.jpg">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143324.jpg">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143401.jpg">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143455.jpg">
<p>どうも、reboです。&amp;nbsp;ガブリアス&#12399;リザードナイトＹ</p>
</body></html>`);

test('readPage takes the meta, drops script and style, folds the text', () => {
  assert.equal(page.title, '【M-5】テスト構築【最終2位】 - 人生詰みサイクル');
  assert.equal(page.siteName, '人生詰みサイクル');
  assert.equal(page.publishedAt, '2026-09-10');
  assert.ok(page.text.includes('どうも、reboです。'));
  assert.ok(page.text.includes('リザードナイトY'), 'NFKC로 전각 Ｙ가 펴져야 한다');
  assert.ok(!page.text.includes('noise'), 'script 안의 내용이 본문에 섞이면 안 된다');
  assert.ok(!page.text.includes('color: red'));
  assert.ok(page.excerpt.length <= 300);
});

test('readPage drops the blog icon and keeps the content images in order', () => {
  assert.ok(page.images.length <= 5);
  assert.ok(!page.images.some(url => url.includes('custom_blog_icon')));
  assert.ok(page.images[0].endsWith('20260910143307.jpg'));
});

// 실제 기사의 문장 구조를 줄여 옮긴 픽스처다. 원문 전재가 아니다.
const article = {
  text: normalize(
    '構築経緯 1枠目に好きなポケモンであるメガルカリオを決定。' +
      'メタグロス、スターミーが環境上位だと思っていた。' +
      '一般ポケモンだとミミッキュ、ガブリアス、アシレーヌを採用。' +
      'ガブリアス こだわりスカーフ 最速。アシレーヌ オボンのみ。' +
      'メガリザードンY は特殊エース。ハッサム タスキ で締める。' +
      'アーマーガアは見送り。相手のカバルドンが重かった。',
  ),
  images: [],
  excerpt: '',
};

test('digest keeps every final member as a candidate', () => {
  const { candidates } = digest(article, index);
  const found = candidates.map(c => c.base);
  for (const key of ['lucario', 'garchomp', 'primarina', 'charizard', 'scizor', 'mimikyu'])
    assert.ok(found.includes(key), `${key}가 후보에서 빠졌다`);
});

test('digest folds a mega into its base species and records the form', () => {
  const { candidates } = digest(article, index);
  const charizard = candidates.find(c => c.base === 'charizard');
  assert.deepEqual(charizard.forms, ['charizardmegay']);
  // 본문에 リザードナイトY가 없어도 폼에서 스톤을 되짚어 도구가 채워진다.
  assert.ok(charizard.items.includes('charizarditey'));
  const lucario = candidates.find(c => c.base === 'lucario');
  assert.ok(lucario.items.includes('lucarionite'));
});

test('digest pairs the item written next to the name, abbreviations included', () => {
  const { candidates } = digest(article, index);
  assert.ok(candidates.find(c => c.base === 'garchomp').items.includes('choicescarf'));
  assert.ok(candidates.find(c => c.base === 'primarina').items.includes('sitrusberry'));
  assert.ok(candidates.find(c => c.base === 'scizor').items.includes('focussash'));
});

test('a name next to a rejection word is demoted, not dropped', () => {
  const { candidates } = digest(article, index);
  const corviknight = candidates.find(c => c.base === 'corviknight');
  assert.ok(corviknight, '見送り는 강등이지 삭제가 아니다');
  assert.ok(corviknight.negative > 0);
  const garchomp = candidates.find(c => c.base === 'garchomp');
  assert.ok(garchomp.score > corviknight.score);
});

test('digest carries a short excerpt per candidate so the reasoning is checkable', () => {
  const { candidates } = digest(article, index);
  const garchomp = candidates.find(c => c.base === 'garchomp');
  assert.ok(garchomp.excerpts.length >= 1);
  assert.ok(garchomp.excerpts.length <= 2);
  for (const excerpt of garchomp.excerpts) assert.ok(excerpt.length <= 130);
  assert.ok(garchomp.excerpts.some(e => e.includes('ガブリアス')));
});

test('a mega is never counted twice as its own base', () => {
  const { candidates } = digest({ ...article, text: normalize('メガリザードンY') }, index);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].base, 'charizard');
  assert.equal(candidates[0].hits, 1);
});

test('digest flags what it could not settle', () => {
  const { flags } = digest({ text: 'ガブリアス', images: [], excerpt: '' }, index);
  assert.ok(flags.includes('few-candidates'));
  assert.ok(flags.includes('no-image'));
});

test('queries pair every game term with the season in both notations', () => {
  const queries = searchQueries({ season: 'M5' });
  assert.equal(queries.length, 6);
  assert.ok(queries.every(q => q.includes('最終')));
  assert.ok(queries.some(q => q.includes('ポケモンチャンピオンズ') && q.includes('M-5')));
  assert.ok(queries.some(q => q.includes('ポケチャン')));
  assert.ok(queries.some(q => q.includes('S5')));
  assert.equal(new Set(queries).size, queries.length, '같은 검색어가 두 번 나가면 안 된다');
});

test('the format never enters the query, only the filter', () => {
  // 측정: 형식 토큰을 넣으면 하테나의 AND 검색이 고유 URL을 44건에서 5건으로
  // 깎는다. 구축 기사 제목이 싱글을 밝히지 않는 경우가 흔하기 때문이다.
  assert.ok(searchQueries({ season: 'M5' }).every(q => !/シングル|ダブル/.test(q)));
  assert.deepEqual(
    searchQueries({ season: 'M5', format: 'Singles' }),
    searchQueries({ season: 'M5' }),
  );
});

test('a blog index is not an article', () => {
  assert.equal(looksLikeArticle('https://syndr.hatenablog.com/'), false);
  assert.equal(looksLikeArticle('https://syndr.hatenablog.com'), false);
  assert.equal(looksLikeArticle('https://taka-poke.hatenablog.com/entry/2026/07/09/020617'), true);
  assert.equal(looksLikeArticle('https://pokesol.app/u/x/articles/abc'), true);
  assert.equal(looksLikeArticle('내용 없음'), false);
});

test('rssLinks reads the entries out of a Hatena bookmark feed', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://b.hatena.ne.jp/q/x"><title>검색</title><link>https://b.hatena.ne.jp/q/x</link></channel>
<item rdf:about="https://example.com/a">
<title>&#x3010;M-5&#x3011;&#x6700;&#x7D42;2&#x4F4D;</title>
<link>https://example.com/a</link>
<dc:date>2026-09-10T17:48:18+09:00</dc:date>
</item>
<item rdf:about="https://example.com/b">
<title>무관한 뉴스</title>
<link>https://example.com/b</link>
</item>
</rdf:RDF>`;
  const links = rssLinks(feed);
  assert.equal(links.length, 2, 'channel의 link를 item으로 세면 안 된다');
  assert.equal(links[0].url, 'https://example.com/a');
  assert.equal(links[0].title, '【M-5】最終2位');
  assert.equal(links[0].date, '2026-09-10');
  assert.equal(links[1].date, null);
});

test('horse racing shares the search words, so the title is filtered first', () => {
  // 측정: チャンピオンズ와 最終이 競馬의 チャンピオンズカップ・最終予想에 걸려
  // 고유 URL 44건 중 35건이 경마 예상 글이었다. 받아오기 전에 제목으로 거른다.
  assert.equal(looksRelevant('【2025チャンピオンズC最終予想】3連単3連複勝負馬券公開'), false);
  assert.equal(looksRelevant('最終予想 東海S - てきとーに競馬予想'), false);
  assert.equal(looksRelevant('ダイワメジャーとは [単語記事] - ニコニコ大百科'), false);
  assert.equal(looksRelevant('ASCII.jp - 記事アーカイブ'), false);

  assert.equal(looksRelevant('【M-5】神速ルカリザスタン【最終2位】'), true);
  assert.equal(looksRelevant('シーズンM-3シングル　最終35位:R2510'), true);
  assert.equal(
    looksRelevant('【ポケモンチャンピオンズ考察】ここ10年で私が過去最弱になった理由'),
    true,
  );
  assert.equal(looksRelevant('M-4シーズン使用構築❰シン・デスギャラクシー❱最終46位'), true);
});

test('the season is read even without a separator or a letter', () => {
  // 둘 다 실제 수집물에서 나온 제목이다.
  assert.equal(parseTitle('チャンピオンズM-3最終44位 R2505 復活ガブラッキー').season, 'M3');
  assert.equal(parseTitle('シーズン4使用構築　ギャラミミ積みリレー　最終25位').season, 'M4');
  assert.equal(parseTitle('獄炎乱舞リザYロップ　M-3最終2434　最終153位').season, 'M3');
});

// 실제 M-5 목록에서 가져온 제목들이다. 표기가 제각각이라 픽스처로 고정해 둔다.
test('real M-5 titles all yield a rank and the season', () => {
  const titles = [
    ['【S5最終1位】臥薪嘗胆アーマーガア', 1],
    ['【M-5】神速ルカリザスタン【最終2位】', 2],
    ['【M-5 最終5位】大空魔術', 5],
    ['【M-5最終10位、レート2579】力戦奮闘ルカリザスタン改　【ポケモンチャンピオンズ】', 10],
    ['【チャンピオンズM-5最終13位レート2570】呪いハッサムサイクル', 13],
    ['ポケモンチャンピオンズM-5シングル最終17位最終レート2549サイクルもどきギャラハッサム', 17],
    ['シーズン5 最終19位 構築記事', 19],
    ['M-5:2538/2515 【最終32位&46位】お願いサザングロス', 32],
    ['【M-5:36位】超越ロップアマガ', 36],
  ];
  for (const [title, rank] of titles) {
    const parsed = parseTitle(title);
    assert.equal(parsed.rank, rank, title);
    assert.equal(parsed.season, 'M5', title);
    assert.ok(looksRelevant(title), title);
  }
});

test('a Korean title from a Naver post is read too', () => {
  // 순위 인증은 일본어 커뮤니티 밖에도 있다. 시즌이 없으면 3단계가 본문으로 판단한다.
  const parsed = parseTitle('최종 23위, 2535점 메치트-엑자몽 대면구축');
  assert.equal(parsed.rank, 23);
  assert.equal(parsed.season, null);
  assert.ok(looksRelevant('최종 23위, 2535점 메치트-엑자몽 대면구축'));
  assert.ok(looksRelevant('메가루카리오 구축'));
});

test('a rating is never mistaken for a rank', () => {
  // レート나 점수는 네 자리다. 最終 없이 숫자만 있을 때는 세 자리까지만 받는다.
  assert.equal(parseTitle('M-5:2538/2515 お願いサザングロス').rank, null);
  assert.equal(parseTitle('【M-5】レート2579 力戦奮闘').rank, null);
});

test('hosts that forbid AI fetching are never queued', () => {
  // 셋 다 robots.txt에 근거가 있다. 네이버는 RAG 목적 수집을 금지하며 ClaudeBot을
  // 이름으로 적었고, 카페는 User-agent: *에 Disallow: /다. 포케DB도 ClaudeBot과
  // Claude-SearchBot을 막는다. 검색 결과에 섞여 들어오므로 코드로 거른다.
  assert.equal(isFetchable('https://blog.naver.com/someone/223456789'), false);
  assert.equal(isFetchable('https://m.blog.naver.com/someone/223456789'), false);
  assert.equal(isFetchable('https://cafe.naver.com/pokemon/12345'), false);
  assert.equal(isFetchable('https://champs.pokedb.tokyo/article/search'), false);

  assert.equal(isFetchable('https://reboiona.hatenablog.com/entry/2026/09/10/174818'), true);
  assert.equal(isFetchable('https://note.com/sazanami_373/n/nf8906dd66238'), true);
  assert.equal(isFetchable('https://pokesol.app/u/x/articles/abc'), true);
  assert.equal(isFetchable('내용 없음'), false);
});

test('googleLinks reads the custom search payload', () => {
  const payload = JSON.stringify({
    items: [
      {
        title: '【M-5】神速ルカリザスタン【最終2位】 - 人生詰みサイクル',
        link: 'https://reboiona.hatenablog.com/entry/2026/09/10/174818',
        snippet: 'どうも、reboです。',
      },
      { title: '무제', link: 'https://example.com/a' },
    ],
  });
  const links = googleLinks(payload);
  assert.equal(links.length, 2);
  assert.equal(links[0].url, 'https://reboiona.hatenablog.com/entry/2026/09/10/174818');
  assert.equal(links[0].title, '【M-5】神速ルカリザスタン【最終2位】 - 人生詰みサイクル');
  assert.equal(links[0].date, null);
  assert.deepEqual(googleLinks(JSON.stringify({})), [], '결과 없음은 오류가 아니다');
});

test('googleLinks surfaces the quota error instead of returning nothing', () => {
  const payload = JSON.stringify({ error: { code: 429, message: 'Quota exceeded' } });
  assert.throws(() => googleLinks(payload), /Quota exceeded/);
});

test('feedLinks reads RSS 2.0 and Atom as well as the Hatena bookmark feed', () => {
  const rss2 = `<rss version="2.0"><channel><title>블로그</title><link>https://note.com/x</link>
<item><title><![CDATA[【M-6】最終12位 ハッサム]]></title><link>https://note.com/x/n/n123</link>
<pubDate>Sun, 12 Oct 2026 23:30:00 +0900</pubDate></item></channel></rss>`;
  assert.deepEqual(feedLinks(rss2), [
    { title: '【M-6】最終12位 ハッサム', url: 'https://note.com/x/n/n123', date: '2026-10-12' },
  ]);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><link rel="alternate" href="https://a.hatenablog.com/"/>
<entry><title>シーズンM-6 最終3位</title><link rel="alternate" href="https://a.hatenablog.com/entry/2026/10/12/1"/>
<published>2026-10-12T10:00:00+09:00</published></entry></feed>`;
  const [entry] = feedLinks(atom);
  assert.equal(entry.url, 'https://a.hatenablog.com/entry/2026/10/12/1');
  assert.equal(entry.date, '2026-10-12');
});

test('feedUrlFor finds the author feed on services with a fixed feed address', () => {
  assert.equal(
    feedUrlFor('https://reboiona.hatenablog.com/entry/2026/09/10/174818'),
    'https://reboiona.hatenablog.com/feed',
  );
  assert.equal(
    feedUrlFor('https://note.com/sazanami_373/n/nf8906dd66238'),
    'https://note.com/sazanami_373/rss',
  );
  assert.equal(
    feedUrlFor('https://ameblo.jp/marron9339/entry-12975046373.html'),
    'https://rssblog.ameba.jp/marron9339/rss20.xml',
  );
  assert.equal(feedUrlFor('https://pokesol.app/u/sigma573/articles/bbe27ed18e7cccb3'), null);
  assert.equal(feedUrlFor('주소 아님'), null);
});

test('extractLinks takes pasted lines with their hint text, once per address', () => {
  const pasted = `https://note.com/a/n/n1 最終12位
https://note.com/a/n/n1?utm_source=x
https://b.hatenablog.com/entry/2026/10/01/1#top M-6 シングル`;
  const links = extractLinks(pasted);
  assert.equal(links.length, 2, '추적 인자와 해시를 떼면 같은 주소다');
  assert.equal(links[0].url, 'https://note.com/a/n/n1');
  assert.equal(links[0].context, '最終12位');
  assert.equal(links[1].url, 'https://b.hatenablog.com/entry/2026/10/01/1');
});

test('an index page yields the article links and drops its own navigation', () => {
  const page = `<nav><a href="/pokemon-champions/1">トップ</a><a href="https://x.com/share">共有</a></nav>
<table><tr><td>最終8位</td><td><a href="https://note.com/a/n/n1">構築記事</a></td></tr>
<tr><td><a href="https://someone.example/posts/2">【M-6最終40位】雨パ</a></td></tr>
<tr><td><a href="javascript:void(0)">x</a></td></tr></table>`;
  const base = 'https://guide.example/pokemon-champions/560474';
  const leads = extractLinks(page, base).filter(link => isLeadLink(link, base));
  assert.deepEqual(
    leads.map(link => link.url),
    ['https://note.com/a/n/n1', 'https://someone.example/posts/2'],
  );
  assert.match(leads[0].context, /最終8位/, '같은 행의 순위가 힌트로 붙는다');
  assert.ok(isBlogPost('https://pokesol.app/u/sigma573/articles/bbe27ed18e7cccb3'));
  assert.ok(!isBlogPost('https://note.com/sazanami_373'));
});

test('robotsAllows applies the named group over *, longest rule first', () => {
  const pokedb = `User-agent: *
Allow: /

User-agent: ClaudeBot
User-agent: Claude-SearchBot
Disallow: /`;
  assert.equal(robotsAllows(pokedb, 'https://champs.pokedb.tokyo/article/search'), false);

  const note = `User-agent: *
Disallow: /api/
Disallow: /search
Allow: /api/v2/oembed$`;
  assert.equal(robotsAllows(note, 'https://note.com/a/n/n1'), true);
  assert.equal(robotsAllows(note, 'https://note.com/search?q=x'), false);
  assert.equal(robotsAllows(note, 'https://note.com/api/v2/oembed'), true);
  assert.equal(robotsAllows(note, 'https://note.com/api/v2/oembed/x'), false);

  // 사용자 요청형 에이전트만 막은 곳도 받지 않는다.
  const yakkun = `User-agent: ChatGPT-User
Disallow: /`;
  assert.equal(robotsAllows(yakkun, 'https://yakkun.com/bbs/party/n1'), false);

  // 학습 전용 크롤러만 막은 곳은 이 용도와 무관하다.
  const trainingOnly = `User-agent: GPTBot
Disallow: /
User-agent: Google-Extended
Disallow: /`;
  assert.equal(robotsAllows(trainingOnly, 'https://blog.example/entry/1'), true);
  assert.equal(robotsAllows('', 'https://blog.example/entry/1'), true, 'robots.txt가 없으면 허용');
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', 'https://a.example/x.pdf'), false);
});

// 포케DB 카드처럼 순위는 윗줄, 기사 링크는 아랫줄의 다른 블록에 있는 목록이다.
// 제목에 最終이 없어도 카드의 순위를 읽어야 한다.
const CARDS = `<!-- saved from url=(0040)https://list.example/article/search?s=5 -->
<link rel="canonical" href="https://list.example/article/search?s=5">
<nav><a href="https://x.com/listsite">X</a><a href="/trainer">トレーナー</a></nav>
<div class="card"><div class="head"><span>シーズンM-5</span><span>23位</span> / 2500.1
<a href="https://x.com/kemi">kemi</a></div><div class="team"><a href="/pokemon/garchomp">ガブリアス</a></div>
<div class="foot"><a href="https://m.cafe.naver.com/ca-fe/web/cafes/kemipoke/articles/1514?art=abc&useCafeId=false">M-5 싱글 구축</a></div></div>
<div class="card"><div class="head"><span>47位</span> / 2480.0</div>
<div class="foot"><a href="https://someone.hatenablog.com/entry/2026/09/12/1">ガブリアス軸</a></div></div>
<div class="card"><div class="head"><span>52位</span></div><div class="foot">記事なし</div></div>
<div class="card"><div class="head"><span>53位</span></div>
<div class="foot"><a href="https://x.com/tw/status/1966">構築</a></div></div>
<div class="card"><div class="head"><span>84位</span></div>
<div class="foot"><a href="https://note.com/a/n/n84">【最終84位 M-5 メガバシャーモ軸】</a></div></div>
<footer><a href="/terms">利用規約</a></footer>`;

test('a saved list page names its own address, so its own links are dropped', () => {
  assert.equal(pageUrlOf(CARDS), 'https://list.example/article/search?s=5');
  assert.equal(pageUrlOf('<p>없음</p>'), undefined);
});

test('card lists pass the rank from the header row to the article link below it', () => {
  const base = pageUrlOf(CARDS);
  const leads = extractLinks(CARDS).filter(link => isLeadLink(link, base));
  assert.deepEqual(
    leads.map(link => [link.url.slice(0, 40), link.rankHint]),
    [
      ['https://m.cafe.naver.com/ca-fe/web/cafes', 23],
      ['https://someone.hatenablog.com/entry/202', 47],
      ['https://x.com/tw/status/1966', 53],
      ['https://note.com/a/n/n84', 84],
    ],
    '기사 없는 52위 카드의 순위가 다음 카드로 넘어가지 않고, 프로필·자체 링크는 버린다',
  );
});

test('X posts and blocked hosts go to people, never to the fetcher', () => {
  assert.equal(humanOnly('https://x.com/tw/status/1966'), 'X 게시물');
  assert.equal(humanOnly('https://twitter.com/tw/status/1966'), 'X 게시물');
  assert.equal(
    humanOnly('https://m.cafe.naver.com/ca-fe/web/cafes/kemipoke/articles/1514'),
    '수집 금지 호스트',
  );
  assert.equal(humanOnly('https://blog.naver.com/someone/223456789'), '수집 금지 호스트');
  assert.equal(humanOnly('https://note.com/a/n/n1'), null);
  assert.ok(isBlogPost('https://yakkun.com/bbs/party/n12345'));
  assert.ok(!isLeadLink({ url: 'https://x.com/kemi', title: 'kemi', context: '', rankHint: 23 }));
});

test('a pasted line gives its bare rank as a hint', () => {
  const [link] = extractLinks('https://x.com/tw/status/1 23位 싱글');
  assert.equal(link.rankHint, 23);
});

test('YouTube videos are leads for people; channels and playlists are not', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=abc123',
    'https://m.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://www.youtube.com/shorts/abc123',
    'https://www.youtube.com/live/abc123',
  ]) {
    assert.equal(humanOnly(url), 'YouTube 영상', url);
    assert.ok(isLeadLink({ url, title: '', context: '', rankHint: null }), url);
  }
  for (const url of [
    'https://www.youtube.com/@someone',
    'https://www.youtube.com/playlist?list=PL1',
    'https://www.youtube.com/channel/UC1',
  ])
    assert.ok(!isLeadLink({ url, title: '最終5位', context: '', rankHint: 5 }), url);
  assert.ok(isNonArticle('https://www.youtube.com/@someone'));
  assert.ok(isNonArticle('https://x.com/someone'));
  assert.ok(!isNonArticle('https://youtu.be/abc123'));
  assert.ok(!isNonArticle('https://note.com/a/n/n1'));
  const [link] = extractLinks('https://youtu.be/abc123?si=track&t=30 最終5位');
  assert.equal(link.url, 'https://youtu.be/abc123?t=30', '공유 추적 값만 뗀다');
});

test('older games that share the season words are told apart from Champions', () => {
  // 실제 오탐: 소드실드 S5, SV 시즌 20, 2022 竜王戦. 셋 다 제목으로는 시즌·순위가 읽힌다.
  assert.deepEqual(gameCheck('【剣盾S5最終1位】ドラパルト入りサイクル', '2020-05-02'), [
    'before-champions',
    'other-game',
  ]);
  assert.deepEqual(gameCheck('SVシーズン20 最終5位 テラスタル', '2024-08-01'), [
    'before-champions',
    'other-game',
  ]);
  assert.ok(gameCheck('ポケモン竜王戦2022 優勝構築', '2022-12-01').includes('before-champions'));
  // 날짜가 없어도 본문의 다른 게임 표기로 가린다.
  assert.deepEqual(gameCheck('ソードシールド S5 最終3位', null), ['other-game']);

  assert.deepEqual(
    gameCheck('【S5最終1位】臥薪嘗胆アーマーガア ポケモンチャンピオンズ', '2026-09-13'),
    [],
  );
  assert.deepEqual(gameCheck('【M-5】神速ルカリザスタン【最終2位】', '2026-09-10'), []);
  assert.deepEqual(
    gameCheck('レギュM-B 最終84位 SVから復帰', '2026-09-12'),
    [],
    '챔피언스 표기가 있으면 통과',
  );
  assert.deepEqual(gameCheck('最終84位 メガバシャーモ軸', '2026-09-12'), ['no-champions-mention']);
});

test('readPage finds lazily loaded images and the og:image', () => {
  const lazy =
    readPage(`<html><head><meta property="og:image" content="https://cdn.example/og.png"></head><body>
<img src="data:image/gif;base64,R0lGOD" data-src="https://cdn.example/team.png">
<img src="https://cdn.example/1px.gif" srcset="https://cdn.example/party-640.jpg 640w, https://cdn.example/party-1280.jpg 1280w">
<img src="https://cdn.example/profile_icon.png">
<img src="https://cdn.example/team.png"></body></html>`);
  assert.deepEqual(lazy.images, [
    'https://cdn.example/team.png',
    'https://cdn.example/party-640.jpg',
    'https://cdn.example/og.png',
  ]);
});

test('old Japanese blogs in EUC-JP or Shift_JIS are decoded, not garbled', () => {
  const eucjp = Uint8Array.from([
    ...Buffer.from(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=EUC-JP"></head><body>',
    ),
    0xa5,
    0xac,
    0xa5,
    0xd6,
    0xa5,
    0xea,
    0xa5,
    0xa2,
    0xa5,
    0xb9,
    ...Buffer.from('</body></html>'),
  ]);
  assert.match(decodeHtml(eucjp), /ガブリアス/);
  const sjis = Uint8Array.from([0x83, 0x4b, 0x83, 0x75]);
  assert.equal(decodeHtml(sjis, 'text/html; charset=Shift_JIS'), 'ガブ');
  assert.equal(decodeHtml(Buffer.from('ガブリアス')), 'ガブリアス', '표기가 없으면 UTF-8');
  assert.equal(
    decodeHtml(Buffer.from('x'), 'text/html; charset=nonsense'),
    'x',
    '모르는 표기도 던지지 않는다',
  );
  assert.ok(looksGarbled(new TextDecoder().decode(eucjp).repeat(10)));
  assert.ok(!looksGarbled('ガブリアス'.repeat(100)));
});
