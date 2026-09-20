// 네트워크를 쓰지 않는 파서만 다룬다. 수집 CLI는 scripts/collect-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildIndex, normalize } from '../scripts/article-parse.mjs';

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
