// 목록과 편집 화면의 마크업. app-view.test.mjs와 같은 스냅샷 방식이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocale } from '../src/locale.js';
import { emptySample, emptyParty } from '../src/builds.js';
import { sampleList, partyList, sampleEditor, partyEditor } from '../src/builds-view.js';

const read = file =>
  readFile(new URL(`../public/data/${file}.json`, import.meta.url)).then(JSON.parse);
const [reference, ko] = await Promise.all(['reference', 'ko'].map(read));
const locale = createLocale(ko);

const sample = {
  ...emptySample(),
  id: 'aaaaaaaaaaaaaaaa',
  name: '물리형 보만다',
  note: '스카프로 선공을 잡는다.\n후보는 "상성 보완역"이라 <4번째>와 자유롭게 바꾼다.',
  pokemon: 'salamence',
  item: 'Choice Scarf',
  ability: 'Intimidate',
  nature: 'adamant',
  points: [0, 32, 0, 0, 2, 32],
  moves: ['Dragon Claw', 'Earthquake', 'Dragon Dance', 'Roost'],
  altMoves: ['Fire Fang', 'Crunch'],
};
const party = {
  ...emptyParty(),
  id: 'p1p1p1p1p1p1p1p1',
  name: '스카프 선공 구축',
  note: '선공을 잡고 굳히는 구성이다.',
  members: ['aaaaaaaaaaaaaaaa', null, null, null, null, null],
};

test('빈 목록은 무엇을 하면 되는지 알린다', t => {
  t.assert.snapshot([sampleList([], locale, reference), partyList([], [], locale)]);
});

test('샘플 목록은 이름, 포켓몬, 배분 요약을 보여준다', t => {
  t.assert.snapshot(sampleList([sample], locale, reference));
});

test('도감 자료가 없으면 포켓몬 이름 대신 저장된 id가 나온다', t => {
  t.assert.snapshot(sampleList([sample], locale, null));
});

test('파티 목록은 채운 자리 수를 보여준다', t => {
  t.assert.snapshot(partyList([party], [sample], locale));
});

test('샘플 편집 화면은 채용 기술과 후보 기술을 나눠 보여준다', t => {
  t.assert.snapshot(sampleEditor(sample, { reference, locale }));
});

test('빈 샘플 편집 화면은 통계 값을 미리 채우지 않는다', t => {
  const html = sampleEditor({ ...emptySample(), id: 'bbbbbbbbbbbbbbbb' }, { reference, locale });
  assert.equal(html.includes('Dragon Claw'), false);
  t.assert.snapshot(html);
});

test('파티 편집 화면은 빈 자리를 빈 자리로 보여준다', t => {
  t.assert.snapshot(partyEditor(party, [sample], { locale }));
});

test('설명의 따옴표와 꺾쇠는 이스케이프된다', () => {
  const html = sampleEditor(sample, { reference, locale });
  assert.ok(html.includes('&lt;4번째&gt;'));
  assert.ok(html.includes('&quot;상성 보완역&quot;'));
  assert.equal(html.includes('<4번째>'), false);
});

test('편집 화면은 지닌 도구를 한국어로 보여준다', () => {
  const html = sampleEditor(sample, { reference, locale });
  assert.ok(html.includes('구애스카프'));
  assert.ok(html.includes('data-builds-item'));
});

test('도구가 없으면 고르라고 안내한다', () => {
  const html = sampleEditor({ ...emptySample(), id: 'cccccccccccccccc' }, { reference, locale });
  assert.ok(html.includes('도구 고르기'));
  assert.equal(html.includes('구애스카프'), false);
});

test('특성과 성격은 창이 아니라 목록에서 고른다', () => {
  const html = sampleEditor(sample, { reference, locale });
  // 보만다의 특성은 위협과 자기과신 둘이다.
  assert.ok(html.includes('<select data-builds-field="ability"'));
  assert.ok(html.includes('위협'));
  assert.ok(html.includes('자기과신'));
  assert.ok(html.includes('<select data-builds-field="nature"'));
  assert.ok(html.includes('고집'));
  // 더 이상 버튼이 아니다.
  assert.equal(html.includes('data-builds-ability>'), false);
  assert.equal(html.includes('data-builds-nature>'), false);
});

test('고른 특성과 성격에 selected가 붙는다', () => {
  const html = sampleEditor(sample, { reference, locale });
  assert.ok(html.includes('value="Intimidate" selected'));
  assert.ok(html.includes('value="adamant" selected'));
});

test('포켓몬을 고르지 않으면 특성 목록이 비어 있다', () => {
  const html = sampleEditor({ ...emptySample(), id: 'dddddddddddddddd' }, { reference, locale });
  assert.ok(html.includes('먼저 포켓몬을 고르세요'));
});

test('저장한 적 있는 샘플에만 삭제 버튼이 있다', () => {
  assert.ok(
    sampleEditor(sample, { reference, locale, existing: true }).includes('data-builds-delete'),
  );
  assert.equal(
    sampleEditor(sample, { reference, locale, existing: false }).includes('data-builds-delete'),
    false,
  );
});

test('저장을 막은 이유를 모두 보여준다', () => {
  const html = sampleEditor(sample, {
    reference,
    locale,
    errors: ['이름을 입력하세요.', '포켓몬을 고르세요.'],
  });
  assert.ok(html.includes('이름을 입력하세요.'));
  assert.ok(html.includes('포켓몬을 고르세요.'));
  assert.equal(html.includes('data-builds-errors hidden'), false);
});

test('오류가 없으면 오류 자리를 숨긴다', () => {
  assert.ok(sampleEditor(sample, { reference, locale }).includes('data-builds-errors hidden'));
});

test('초안을 이어서 고칠 때만 안내한다', () => {
  assert.ok(
    sampleEditor(sample, { reference, locale, resumed: true }).includes('이어서 고치는 중'),
  );
  assert.equal(sampleEditor(sample, { reference, locale }).includes('이어서 고치는 중'), false);
});

test('파티 편집기도 같은 인자 모양을 쓴다', t => {
  t.assert.snapshot(
    partyEditor(party, [sample], { locale, existing: true, errors: ['이름을 입력하세요.'] }),
  );
});
