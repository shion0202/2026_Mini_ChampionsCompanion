// 검토 화면의 판단 부분. 서버와 화면은 scripts/review-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { articleKey } from '../scripts/article-parse.mjs';
import {
  applyProposal,
  compareProposal,
  articleId,
  blogKey,
  authorFromUrl,
  buildRecord,
  formatArticles,
  itemOptions,
  moveArticle,
  prefill,
  putArticle,
  reviewList,
  speciesOptions,
} from '../scripts/article-review.mjs';
import { createLocale } from '../src/locale.js';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [file, reference, ko] = await Promise.all(['articles', 'reference', 'ko'].map(read));
// 파일의 기록을 모두 공개 기록으로 본다. 다시 검토하느라 pending인 기록이 있어도 검토 규칙
// 테스트의 기대값이 흔들리지 않게 한다. pending 동작은 테스트마다 따로 만든다.
const data = {
  ...file,
  articles: file.articles.map(a => ({ ...a, review: { ...a.review, status: 'reviewed' } })),
};
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

test('the same article under http and https, www or a trailing slash is one article', () => {
  const key = articleKey('http://blog.livedoor.jp/someone/archives/123.html');
  assert.equal(articleKey('https://blog.livedoor.jp/someone/archives/123.html'), key);
  assert.equal(articleKey('https://www.blog.livedoor.jp/someone/archives/123.html/'), key);
  assert.notEqual(articleKey('https://blog.livedoor.jp/someone/archives/124.html'), key);

  const http = { ...entry, url: 'http://someone.hatenablog.com/entry/2026/09/12/1' };
  const list = reviewList({ entries: [entry, http] }, data, { skipped: [] }, reference);
  assert.equal(list.filter(row => row.kind === 'queue').length, 1, '큐에 두 번 있어도 한 번만');
  const recorded = {
    ...data,
    articles: [...data.articles, { ...data.articles[0], url: http.url }],
  };
  assert.equal(
    reviewList({ entries: [entry] }, recorded, { skipped: [] }, reference).length,
    0,
    '스킴만 다른 주소로 이미 기록했으면 다시 나오지 않는다',
  );
});

test('another article from an already recorded blog is flagged, not hidden', () => {
  assert.equal(blogKey('https://note.com/a/n/n1'), blogKey('https://note.com/a/n/n2'));
  assert.notEqual(blogKey('https://note.com/a/n/n1'), blogKey('https://note.com/b/n/n1'));
  assert.equal(
    blogKey('http://blog.livedoor.jp/someone/archives/1.html'),
    'blog.livedoor.jp/someone',
  );
  const rebo = data.articles.find(article => article.id === 'm5-singles-rebo');
  const next = { ...entry, url: 'https://reboiona.hatenablog.com/entry/2026/10/01/1' };
  const [row] = reviewList({ entries: [next] }, data, { skipped: [] }, reference);
  assert.deepEqual(
    row.sameBlog.map(article => article.id),
    [rebo.id],
  );
});

test('a record saved under a blog front page can be moved to the real article address', () => {
  // 실제 파일에는 이 기사가 이미 옮겨져 있으니, 처음 두 기록만 두고 시험한다.
  const base = data.articles.filter(a => ['m5-singles-sigma', 'm5-singles-rebo'].includes(a.id));
  const top = { ...base[0], id: 'm5-singles-forpoke', url: 'http://blog.livedoor.jp/forpoke/' };
  const withTop = { ...data, articles: [...base, top] };
  const article = { ...entry, url: 'http://blog.livedoor.jp/forpoke/archives/97752131.html' };
  const [row] = reviewList({ entries: [article] }, withTop, { skipped: [] }, reference);
  assert.deepEqual(
    row.sameBlog.map(a => [a.id, a.top]),
    [['m5-singles-forpoke', true]],
  );
  const moved = moveArticle(withTop, top.url, article.url, '2026-09-26');
  assert.equal(moved.id, 'm5-singles-forpoke');
  assert.equal(moved.data.articles.at(-1).url, article.url);
  assert.equal(
    reviewList({ entries: [article] }, moved.data, { skipped: [] }, reference).length,
    0,
    '옮긴 뒤에는 같은 글이 다시 나오지 않는다',
  );
  assert.match(moveArticle(withTop, 'https://none.example/', article.url, 'd').error, /찾지 못/);
  assert.match(moveArticle(withTop, top.url, base[0].url, 'd').error, /이미 기록/);
});

test('an AI proposal from the team image overrides the text guess, blanks stay unknown', () => {
  const proposals = {
    proposals: [
      {
        url: entry.url.replace('https:', 'http:'),
        verdict: 'party',
        author: 'TwistServe',
        teamImage: 'https://cdn.example/team.png',
        team: [
          { pokemon: 'blazikenmega', item: 'blazikenite' },
          { pokemon: 'corviknight', item: 'leftovers' },
          { pokemon: 'garchomp', item: '' },
          { pokemon: 'primarina', item: null },
        ],
        note: '결과 화면 이미지에서 도구 확인',
      },
    ],
  };
  const [row] = reviewList({ entries: [entry] }, data, { skipped: [] }, reference, {}, proposals);
  assert.equal(row.form.author, 'TwistServe');
  assert.equal(row.form.proposal.verdict, 'party');
  assert.deepEqual(
    row.form.team.map(member => [member.pokemon, member.item]),
    [
      ['blazikenmega', 'blazikenite'],
      ['corviknight', 'leftovers'],
      ['garchomp', ''],
      ['primarina', null],
      ['', ''],
      ['', ''],
    ],
  );
  assert.equal(row.form.rank, 84, '제안에 없는 칸은 본문 추측을 둔다');
  assert.equal(applyProposal({ author: 'a' }, undefined).author, 'a');
});

test('a record reopened as pending keeps its values and lists where the proposal differs', () => {
  const record = {
    ...data.articles[0],
    url: entry.url,
    review: { ...data.articles[0].review, status: 'pending' },
  };
  const team = record.team.map(member => ({ ...member }));
  team[2] = { pokemon: 'basculegionf', item: team[2].item };
  team[4] = { pokemon: '', item: '' };
  const proposals = {
    proposals: [{ url: entry.url, verdict: 'party', team, note: '카드에서 읽음.' }],
  };
  const [row] = reviewList(
    { entries: [entry] },
    { ...data, articles: [record] },
    { skipped: [] },
    reference,
    {},
    proposals,
  );
  assert.equal(row.kind, 'pending');
  assert.equal(row.entry, entry, '큐의 같은 글을 붙여 받아 둔 이미지를 보여 준다');
  assert.deepEqual(
    row.form.team.map(member => member.pokemon),
    record.team.map(member => member.pokemon),
    '기록 값을 제안으로 덮지 않는다',
  );
  assert.equal(
    row.form.proposal.note,
    `기록과 다른 칸: 3번 포켓몬 ${record.team[2].pokemon} → 제안 basculegionf. 카드에서 읽음.`,
    '제안이 비운 칸은 다르다고 하지 않는다',
  );
  assert.equal(
    compareProposal(row.form, {
      verdict: 'party',
      team: record.team,
      author: '鮫島フウロ',
      rank: record.rank,
    }).note,
    `기록과 제안의 여섯 칸이 같다. 작성자 ${record.author} → 제안 鮫島フウロ.`,
  );
});

test('a record can say the article has no rank, which differs from an unknown rank', () => {
  const none = buildRecord({ ...confirmed(), rank: null }, data, reference, '2026-09-27');
  assert.equal(none.error, undefined);
  assert.equal(none.record.rank, null);
  assert.match(buildRecord({ ...confirmed(), rank: '' }, data, reference, 'd').error, /순위 없음/);
});

test('moving a front-page record saves the values fixed on screen, not the old team', () => {
  const top = {
    ...data.articles[0],
    id: 'm5-singles-forpoke',
    url: 'http://blog.livedoor.jp/forpoke/',
  };
  const withTop = { ...data, articles: [top] };
  const form = { ...confirmed(), url: 'http://blog.livedoor.jp/forpoke/archives/97752131.html' };
  const moved = moveArticle(withTop, top.url, form.url, '2026-09-27', { form, reference });
  assert.equal(moved.id, 'm5-singles-forpoke', 'id는 기록 것을 둔다');
  assert.equal(moved.data.articles.length, 1);
  assert.equal(moved.data.articles[0].url, form.url);
  assert.deepEqual(
    moved.data.articles[0].team,
    buildRecord(form, data, reference, 'd').record.team,
  );
  const broken = { ...form, teamImage: '' };
  assert.match(
    moveArticle(withTop, top.url, form.url, 'd', { form: broken, reference }).error,
    /옮기지 않았습니다/,
  );
});

test('prefill picks the form written as a name@item header, else the base', () => {
  const candidate = (base, keyHits) => ({ base, forms: [], items: [], champions: true, keyHits });
  const { team } = prefill(
    {
      url: 'https://x.example/1',
      candidates: [
        candidate('zoroark', { zoroarkhisui: [1, 1], zoroark: [5, 0] }),
        candidate('basculegion', { basculegionf: [2, 0], basculegion: [3, 1] }),
        candidate('garchomp', undefined),
      ],
    },
    reference,
  );
  assert.deepEqual(
    team.slice(0, 3).map(member => member.pokemon),
    ['zoroarkhisui', 'basculegion', 'garchomp'],
  );
  assert.equal(
    prefill(
      { url: 'https://x.example/2', title: '【チャンピオンズM-5 53位】', candidates: [] },
      reference,
    ).rank,
    53,
    '큐에 순위가 없으면 제목을 새 규칙으로 다시 읽는다',
  );
});
