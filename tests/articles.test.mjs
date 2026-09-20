import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reviewedArticles, selectArticles, usesPokemon } from '../src/articles.js';
import { renderArticleCards } from '../src/articles-view.js';
import { createLocale } from '../src/locale.js';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [data, reference, ko] = await Promise.all(['articles', 'reference', 'ko'].map(read));
const locale = createLocale(ko);

test('published teams have six valid members, item records and review evidence', () => {
  assert.equal(reviewedArticles(data, reference).length, data.articles.length);
  assert.equal(new Set(data.articles.map(a => a.id)).size, data.articles.length);
  for (const article of data.articles) {
    assert.ok(article.review.teamImage.startsWith('https://'));
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
  const rows = reviewedArticles(data, reference).reverse();
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
  assert.ok(renderArticleCards([], reference, locale).includes('확인한 구축기사가 없습니다'));
});
