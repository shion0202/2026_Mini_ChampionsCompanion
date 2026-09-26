import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { articleUsage, reviewedArticles, selectArticles, usesPokemon } from '../src/articles.js';
import { renderArticleCards, renderArticleUsage } from '../src/articles-view.js';
import { createLocale } from '../src/locale.js';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [data, reference, ko] = await Promise.all(['articles', 'reference', 'ko'].map(read));
const locale = createLocale(ko);
// 조회 규칙 테스트는 처음 두 기록(シグマ 1위, rebo® 2위)으로만 센다. 기록이 늘어도
// 기대값이 흔들리지 않게 한다. 형식 검사는 파일 전체를 본다.
const sample = {
  articles: data.articles.filter(a => ['m5-singles-sigma', 'm5-singles-rebo'].includes(a.id)),
};

// pending 기록이 파일에 있어도 된다. 형식은 공개 기록과 같아야 하고 다른 것은
// status 하나뿐이어야 한다. 수집 자동화가 넣는 기록이 이 모양이다.
test('every record is well formed, whether or not it is published yet', () => {
  const forced = data.articles.map(article => ({
    ...article,
    review: { ...article.review, status: 'reviewed' },
  }));
  assert.equal(reviewedArticles({ articles: forced }, reference).length, data.articles.length);
});

test('a pending record stays out of the list but does not break the file', () => {
  const pending = {
    ...data.articles[0],
    id: 'pending-sample',
    review: { ...data.articles[0].review, status: 'pending' },
  };
  const published = reviewedArticles({ articles: [...data.articles, pending] }, reference);
  assert.ok(!published.some(article => article.id === 'pending-sample'));
  assert.equal(published.length, data.articles.length);
});

test('published teams have six valid members, item records and review evidence', () => {
  assert.equal(new Set(data.articles.map(a => a.id)).size, data.articles.length);
  for (const article of data.articles) {
    assert.match(article.review.teamImage, /^https?:\/\//);
    assert.ok(article.review.teamEvidence);
    assert.ok(article.review.rankEvidence);
  }
  const rebo = data.articles.find(a => a.id.endsWith('rebo'));
  assert.equal(rebo.team.find(m => m.pokemon === 'garchomp').item, 'choicescarf');
  assert.ok(!rebo.team.some(m => m.pokemon === 'corviknight'));
  const sigma = data.articles.find(a => a.id.endsWith('sigma'));
  assert.ok(!sigma.team.some(m => ['delphoxmega', 'houndoommega'].includes(m.pokemon)));
});

test('drafts, ambiguous, incomplete and unsafe records are never published', () => {
  const base = data.articles[0];
  const invalid = [
    { ...base, review: { ...base.review, status: 'pending' } },
    { ...base, review: { ...base.review, teamEvidence: '' } },
    { ...base, team: base.team.slice(0, 5) },
    { ...base, team: Array(6).fill(base.team[0]) },
    { ...base, team: [...base.team.slice(0, 5), { pokemon: 'notknown', item: 'leftovers' }] },
    { ...base, url: 'javascript:alert(1)' },
    { ...base, rank: 0 },
  ];
  assert.deepEqual(reviewedArticles({ articles: invalid }, reference), []);
  assert.throws(() => reviewedArticles({}, reference));
});

test('filters preserve season/format, rank order and exact forms except Mega base matching', () => {
  const rows = reviewedArticles(sample, reference).reverse();
  assert.deepEqual(
    selectArticles(rows, { season: 'M5', format: 'Singles' }, reference, locale).map(a => a.rank),
    [1, 2],
  );
  assert.equal(selectArticles(rows, { season: 'M6' }, reference, locale).length, 0);
  assert.equal(selectArticles(rows, { format: 'Doubles' }, reference, locale).length, 0);
  assert.equal(selectArticles(rows, { pokemon: 'gengar' }, reference, locale).length, 1);
  assert.equal(selectArticles(rows, { query: '메가리자몽' }, reference, locale).length, 1);
  assert.equal(selectArticles(rows, { query: 'rebo' }, reference, locale).length, 1);
  assert.ok(usesPokemon(rows[0], 'charizard', reference));
  assert.ok(!usesPokemon(rows[0], 'charizardmegax', reference));
  assert.ok(!usesPokemon({ team: [{ pokemon: 'ninetalesalola' }] }, 'ninetales', reference));
});

test('cards escape external text, retain item details and mark original links', () => {
  const markup = renderArticleCards(
    [{ ...data.articles[0], author: '<img onerror=x>' }],
    reference,
    locale,
  );
  assert.ok(markup.includes('&lt;img onerror=x&gt;'));
  assert.ok(markup.includes('noopener noreferrer'));
  assert.ok(markup.includes('메가화염레오'));
  assert.ok(markup.includes('화염레오나이트'));
  assert.ok(markup.includes('data-effect-type="held_item"'));
  assert.ok(renderArticleCards([], reference, locale).includes('확인한 구축 기사가 없습니다'));
});

test('several picked Pokemon keep only the parties that use all of them', () => {
  const rows = reviewedArticles(sample, reference);
  const pick = pokemons => selectArticles(rows, { pokemons }, reference, locale).map(a => a.author);
  assert.deepEqual(pick(['garchomp', 'primarina']), ['シグマ', 'rebo®']);
  assert.deepEqual(pick(['garchomp', 'lucario']), ['rebo®'], '메가루카리오도 루카리오로 찾는다');
  assert.deepEqual(pick(['gengar', 'lucario']), []);
  // 상세 탭이 넘기는 pokemon 하나와 함께 써도 같은 규칙이다.
  assert.deepEqual(
    selectArticles(rows, { pokemon: 'gengar', pokemons: ['garchomp'] }, reference, locale).map(
      a => a.author,
    ),
    ['シグマ'],
  );
});

test('search words must all match, and the rank limit and sort apply', () => {
  const rows = reviewedArticles(sample, reference);
  const authors = filters => selectArticles(rows, filters, reference, locale).map(a => a.author);
  assert.deepEqual(authors({ query: '한카리아스 팬텀' }), ['シグマ']);
  assert.deepEqual(authors({ query: '  한카리아스   누리레느 ' }), ['シグマ', 'rebo®']);
  assert.deepEqual(authors({ maxRank: '1' }), ['シグマ']);
  assert.deepEqual(authors({ maxRank: '' }), ['シグマ', 'rebo®']);
  assert.deepEqual(authors({ sort: 'recent' }), ['シグマ', 'rebo®']);
  const older = rows.map(a => (a.author === 'シグマ' ? { ...a, publishedAt: '2026-09-01' } : a));
  assert.deepEqual(
    selectArticles(older, { sort: 'recent' }, reference, locale).map(a => a.author),
    ['rebo®', 'シグマ'],
  );
});

test('usage counts megas under their base and leaves out what is already picked', () => {
  const rows = reviewedArticles(sample, reference);
  const usage = articleUsage(rows, reference);
  assert.deepEqual(usage.slice(0, 2), [
    { pokemon: 'garchomp', count: 2 },
    { pokemon: 'primarina', count: 2 },
  ]);
  assert.ok(
    usage.some(row => row.pokemon === 'lucario'),
    '메가루카리오는 루카리오로 센다',
  );
  assert.ok(!usage.some(row => row.pokemon === 'lucariomega'));
  assert.ok(!articleUsage(rows, reference, ['garchomp']).some(row => row.pokemon === 'garchomp'));
  const markup = renderArticleUsage(usage, rows.length, reference, locale, ['garchomp']);
  assert.ok(markup.includes('함께 채용된 포켓몬'));
  assert.ok(markup.includes('data-article-add-pokemon="primarina"'));
  assert.equal(
    renderArticleUsage(usage, 1, reference, locale),
    '',
    '파티 하나로는 집계하지 않는다',
  );
});
