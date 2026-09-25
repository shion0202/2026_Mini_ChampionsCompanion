// 네트워크를 쓰지 않는 파서만 다룬다. 수집 CLI는 scripts/collect-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildIndex,
  digest,
  googleLinks,
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

test('readPage drops the blog icon and keeps at most three content images', () => {
  assert.equal(page.images.length, 3);
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
