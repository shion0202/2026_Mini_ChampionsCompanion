// 검토 화면의 판단 부분. 서버와 화면은 scripts/review-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  articleId,
  authorFromUrl,
  buildRecord,
  formatArticles,
  itemOptions,
  prefill,
  putArticle,
  reviewList,
  speciesOptions,
} from '../scripts/article-review.mjs';
import { createLocale } from '../src/locale.js';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [data, reference, ko] = await Promise.all(['articles', 'reference', 'ko'].map(read));
const locale = createLocale(ko);

// 수집기 큐 항목 모양. 후보는 점수순이고 firstIndex는 본문 위치다.
const entry = {
  url: 'https://someone.hatenablog.com/entry/2026/09/12/1',
  title: '【M-5 最終84位】メガバシャーモ軸',
  siteName: '人生ブログ',
  rank: 84,
  season: 'M5',
  format: null,
  publishedAt: '2026-09-12',
  images: ['https://cdn.example/icon-less.png', 'https://cdn.example/team.png'],
  imageFiles: [null, '.cache/articles/abc.png'],
  flags: ['rank-from-hint'],
  candidates: [
    {
      base: 'garchomp',
      forms: [],
      items: ['choicescarf', 'lifeorb'],
      nearest: ['choicescarf'],
      champions: true,
      firstIndex: 50,
    },
    {
      base: 'blaziken',
      forms: ['blazikenmega'],
      items: ['choicescarf'],
      nearest: [],
      champions: true,
      firstIndex: 10,
    },
    {
      base: 'primarina',
      forms: [],
      items: ['choicescarf', 'sitrusberry'],
      nearest: ['sitrusberry'],
      champions: true,
      firstIndex: 90,
    },
    { base: 'mewtwo', forms: [], items: [], nearest: [], champions: false, firstIndex: 5 },
    {
      base: 'corviknight',
      forms: [],
      items: ['leftovers'],
      nearest: ['leftovers'],
      champions: true,
      firstIndex: 70,
    },
    {
      base: 'mimikyu',
      forms: [],
      items: ['choicescarf', 'lifeorb'],
      nearest: [],
      champions: true,
      firstIndex: 120,
    },
    { base: 'scizor', forms: [], items: [], nearest: [], champions: true, firstIndex: 130 },
  ],
};

test('prefill takes six Champions candidates in article order, megas with their stone', () => {
  const form = prefill(entry, reference);
  assert.deepEqual(
    form.team.map(member => [member.pokemon, member.item]),
    [
      ['blazikenmega', 'blazikenite'],
      ['garchomp', 'choicescarf'],
      ['corviknight', 'leftovers'],
      ['primarina', 'sitrusberry'],
      ['mimikyu', 'lifeorb'],
      ['scizor', ''],
    ],
    '가장 가까운 도구를 먼저, 한 도구는 한 번만, 모르면 빈칸',
  );
  assert.equal(form.teamImage, 'https://cdn.example/team.png', '받아 둔 첫 이미지');
  assert.equal(form.author, 'someone');
  assert.match(form.rankEvidence, /목록/);
});

test('the author guess comes from the address, not the service name', () => {
  assert.equal(authorFromUrl('https://note.com/sazanami_373/n/nf8906dd66238'), 'sazanami_373');
  assert.equal(authorFromUrl('https://pokesol.app/u/sigma573/articles/bbe27'), 'sigma573');
  assert.equal(authorFromUrl('https://reboiona.hatenablog.com/entry/2026/09/10/1'), 'reboiona');
  assert.equal(authorFromUrl('https://example.com/a'), null);
});

const confirmed = () => {
  const form = prefill(entry, reference);
  form.team[5].item = 'focussash';
  form.author = 'TwistServe';
  return form;
};

test('a confirmed form becomes a published record that passes the app check', () => {
  const { record, error } = buildRecord(confirmed(), data, reference, '2026-09-26');
  assert.equal(error, undefined);
  assert.equal(record.id, 'm5-singles-twistserve');
  assert.equal(record.review.status, 'reviewed');
  assert.equal(record.review.teamImage, 'https://cdn.example/team.png');
  assert.equal(record.rank, 84);
  const next = putArticle(data, record, '2026-09-26');
  assert.equal(next.articles.length, data.articles.length + 1);
  assert.equal(next.updatedAt, '2026-09-26');
  assert.equal(
    buildRecord(confirmed(), data, reference, '2026-09-26', 'pending').record.review.status,
    'pending',
  );
});

test('an unknown item is never turned into none, and mistakes are named', () => {
  const unknown = prefill(entry, reference);
  unknown.author = 'x';
  assert.match(buildRecord(unknown, data, reference, 'd').error, /도구를 모르는 칸/);

  const old = confirmed();
  old.url = 'http://blog.livedoor.jp/someone/archives/1.html';
  assert.equal(
    buildRecord(old, data, reference, 'd').error,
    undefined,
    '오래된 블로그의 http 주소',
  );

  const none = confirmed();
  none.team[5].item = null;
  assert.equal(
    buildRecord(none, data, reference, 'd').record.team[5].item,
    null,
    '없음은 확인한 값',
  );

  const cases = [
    [form => (form.url = 'javascript:alert(1)'), /원문 주소/],
    [form => (form.team[1].pokemon = 'blazikenmega'), /두 번/],
    [form => (form.team[2].pokemon = '한카리아스'), /3번 포켓몬/],
    [form => (form.team[2].item = '구애스카프'), /3번 도구/],
    [form => (form.rank = ''), /순위/],
    [form => (form.author = ' '), /작성자/],
    [form => (form.teamImage = ''), /팀 이미지/],
  ];
  for (const [change, message] of cases) {
    const form = confirmed();
    change(form);
    assert.match(buildRecord(form, data, reference, 'd').error, message);
  }
});

test('ids stay unique and an existing record keeps its id when re-saved', () => {
  const ids = new Set(['m5-singles-rebo']);
  assert.equal(
    articleId({ season: 'M5', format: 'Singles', author: 'rebo®', rank: 2, url: '' }, ids),
    'm5-singles-rebo-2',
  );
  assert.equal(
    articleId(
      {
        season: 'M5',
        format: 'Singles',
        author: 'ちゃぼまつ',
        rank: 19,
        url: 'https://note.com/chabo/n/n1',
      },
      ids,
    ),
    'm5-singles-chabo',
    '일본어 이름은 주소의 아이디로',
  );
  const rebo = data.articles.find(article => article.id === 'm5-singles-rebo');
  const form = {
    ...prefill({ ...entry, url: rebo.url }, reference),
    ...confirmed(),
    url: rebo.url,
  };
  assert.equal(buildRecord(form, data, reference, 'd').record.id, 'm5-singles-rebo');
});

test('the file is written back in the same shape it was read', async () => {
  const raw = await readFile(new URL('../public/data/articles.json', import.meta.url), 'utf8');
  assert.equal(formatArticles(JSON.parse(raw)), raw.replace(/\r\n/g, '\n'));
});

test('the review list puts pending records first and hides what is done', () => {
  const pending = {
    ...data.articles[0],
    url: 'https://p.example/1',
    id: 'p',
    review: { ...data.articles[0].review, status: 'pending' },
  };
  const list = reviewList(
    {
      entries: [
        entry,
        { ...entry, url: data.articles[1].url },
        { ...entry, url: 'https://skip.example/1' },
      ],
    },
    { ...data, articles: [...data.articles, pending] },
    { skipped: [{ url: 'https://skip.example/1' }] },
    reference,
  );
  assert.deepEqual(
    list.map(row => [row.kind, row.form.url]),
    [
      ['pending', 'https://p.example/1'],
      ['queue', entry.url],
    ],
  );
});

test('pickers offer Champions Pokemon and items by Korean name, without clashes', () => {
  const species = speciesOptions(reference, locale);
  const items = itemOptions(reference, locale);
  assert.ok(species.some(row => row.key === 'garchomp' && row.label === '한카리아스'));
  assert.ok(species.some(row => row.key === 'charizardmegay'));
  assert.ok(items.some(row => row.key === 'choicescarf' && row.label === '구애스카프'));
  assert.equal(new Set(species.map(row => row.label)).size, species.length);
  assert.equal(new Set(items.map(row => row.label)).size, items.length);
});
