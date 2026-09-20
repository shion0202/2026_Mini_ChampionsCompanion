// 네트워크를 쓰지 않는 파서만 다룬다. 수집 CLI는 scripts/collect-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildIndex, digest, normalize, parseTitle, readPage } from '../scripts/article-parse.mjs';

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
