import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocale } from '../src/locale.js';
const data = JSON.parse(await readFile(new URL('../public/data/ko.json', import.meta.url), 'utf8'));
test('Korean labels connect source English identifiers to real names', () => {
  const locale = createLocale(data);
  assert.deepEqual(locale.pokemon('Salamence'), { label: '보만다', dex: 373 });
  assert.equal(locale.label('move', 'Double-Edge'), '이판사판태클');
  assert.equal(locale.label('held_item', 'Salamencite'), '보만다나이트');
});
test('regional and gender forms are not collapsed to a generic species', () => {
  const locale = createLocale(data);
  assert.equal(locale.pokemon('Raichu-Alola').label, '라이츄 (알로라)');
  assert.equal(locale.pokemon('Indeedee-F').label, '에써르 (암컷)');
  assert.equal(locale.pokemon('Tauros-Paldea-Combat').label, '켄타로스 (팔데아 · 컴뱃)');
  assert.notEqual(locale.pokemon('Indeedee-F').label, locale.pokemon('Indeedee').label);
});

test('Japanese species names preserve mega and regional forms', () => {
  const locale = createLocale(data);
  assert.equal(locale.pokemonJapanese('Salamence'), 'ボーマンダ');
  assert.equal(locale.pokemonJapanese('Salamence-Mega'), 'メガボーマンダ');
  assert.equal(locale.pokemonJapanese('Charizard-Mega-X'), 'メガリザードンX');
  assert.equal(locale.pokemonJapanese('Raichu-Alola'), 'ライチュウ (アローラ)');
  assert.equal(locale.pokemonJapanese('Unknown-New-Form'), '');
});
test('unknown data is preserved verbatim, not guessed or blanked', () => {
  const locale = createLocale(data);
  assert.equal(locale.label('move', 'New Move'), 'New Move');
  assert.equal(locale.pokemon('Unknown-New-Form').label, 'Unknown-New-Form');
});
test('mega names use the Korean prefix and preserve X/Y variants', () => {
  const locale = createLocale(data);
  assert.equal(locale.pokemon('Salamence-Mega').label, '메가보만다');
  assert.equal(locale.pokemon('Charizard-Mega-X').label, '메가리자몽X');
  assert.equal(locale.pokemon('Charizard-Mega-Y').label, '메가리자몽Y');
});
