// 목록과 편집 화면의 마크업. app-view.test.mjs와 같은 스냅샷 방식이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocale } from '../src/locale.js';
import { emptySample, emptyParty } from '../src/builds.js';
import {
  sampleList,
  partyList,
  sampleEditor,
  partyEditor,
  pickerRows,
  moveMeta,
  moveEffect,
  fmtDay,
  syncText,
  syncActions,
  conflictList,
  shareView,
  shareTitle,
} from '../src/builds-view.js';

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

test('샘플 목록은 이름과 포켓몬만 보여준다', t => {
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
  t.assert.snapshot(partyEditor(party, [sample], { locale, reference }));
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
  assert.ok(html.includes('도구 선택'));
  assert.equal(html.includes('구애스카프'), false);
});

test('특성과 성격은 펼치기 전에는 고른 값만 보여준다', () => {
  const html = sampleEditor(sample, { reference, locale });
  for (const field of ['ability', 'nature'])
    assert.ok(html.includes(`data-builds-combo-open="${field}"`), field);
  // 고른 값이 단추에 보인다.
  assert.ok(html.includes('구애스카프'));
  assert.ok(html.includes('위협'));
  assert.ok(html.includes('고집 (공격 ↑ 특수공격 ↓)'));
  // 접혀 있으면 목록도 검색창도 만들지 않는다.
  assert.equal(html.includes('data-builds-combo-list'), false);
  assert.equal(html.includes('data-builds-combo-search'), false);
  // 고르지 않은 특성은 아직 나오지 않는다.
  assert.equal(html.includes('자기과신'), false);
});

test('펼친 것만 검색창과 목록을 만든다', () => {
  const html = sampleEditor(sample, {
    reference,
    locale,
    combos: { field: 'ability', query: '' },
  });
  assert.ok(html.includes('data-builds-combo-search'));
  assert.ok(html.includes('data-builds-combo-value="Intimidate"'));
  assert.ok(html.includes('data-builds-combo-value="Moxie"'));
  assert.ok(html.includes('자기과신'));
  // 펼치지 않은 성격은 목록을 만들지 않는다.
  assert.equal(html.includes('data-builds-combo-value="jolly"'), false);
});

test('검색어는 목록을 좁힌다', () => {
  const html = sampleEditor(sample, {
    reference,
    locale,
    combos: { field: 'nature', query: '고집' },
  });
  assert.ok(html.includes('data-builds-combo-value="adamant"'));
  assert.equal(html.includes('data-builds-combo-value="jolly"'), false);
});

test('맞는 것이 없으면 목록 대신 알린다', () => {
  const html = sampleEditor(sample, {
    reference,
    locale,
    combos: { field: 'nature', query: '없는성격' },
  });
  assert.ok(html.includes('찾는 항목이 없습니다'));
});

test('포켓몬을 고르지 않으면 특성을 펼치지 못한다', () => {
  const html = sampleEditor(
    { ...emptySample(), id: 'eeeeeeeeeeeeeeee' },
    { reference, locale, combos: { field: 'ability', query: '' } },
  );
  assert.ok(
    html.includes(
      'data-builds-combo-open="ability" aria-expanded="true" aria-haspopup="listbox" disabled',
    ),
  );
  assert.equal(html.includes('data-builds-combo-search'), false);
});

test('포켓몬을 고르지 않으면 특성 목록이 비어 있다', () => {
  const html = sampleEditor({ ...emptySample(), id: 'dddddddddddddddd' }, { reference, locale });
  assert.ok(html.includes('먼저 포켓몬을 선택하세요'));
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
    errors: ['이름을 입력하세요.', '포켓몬을 선택하세요.'],
  });
  assert.ok(html.includes('이름을 입력하세요.'));
  assert.ok(html.includes('포켓몬을 선택하세요.'));
  assert.equal(html.includes('data-builds-errors hidden'), false);
});

test('오류가 없으면 오류 자리를 숨긴다', () => {
  assert.ok(sampleEditor(sample, { reference, locale }).includes('data-builds-errors hidden'));
});

test('초안을 이어서 고칠 때만 안내한다', () => {
  assert.ok(
    sampleEditor(sample, { reference, locale, resumed: true }).includes(
      '작성 중인 항목을 이어서 작성합니다',
    ),
  );
  assert.equal(
    sampleEditor(sample, { reference, locale }).includes('작성 중인 항목을 이어서 작성합니다'),
    false,
  );
});

// type을 빼먹은 단추는 폼을 보낸다. 기술 칸을 누르면 저장되고 목록으로 나가버렸다.
test('편집기 안에서 폼을 보내는 단추는 저장뿐이다', () => {
  for (const html of [
    sampleEditor(sample, { reference, locale, existing: true }),
    partyEditor(party, [sample], { locale, reference, existing: true }),
  ]) {
    const submits = [...html.matchAll(/<button(?![^>]*type="button")[^>]*>/g)].map(m => m[0]);
    assert.equal(submits.length, 1, submits.join('\n'));
    assert.ok(submits[0].includes('data-builds-save'));
  }
});

test('파티 편집기도 같은 인자 모양을 쓴다', t => {
  t.assert.snapshot(
    partyEditor(party, [sample], {
      locale,
      reference,
      existing: true,
      errors: ['이름을 입력하세요.'],
    }),
  );
});

const pickerFixture = [
  { value: 'Salamence', label: '보만다', sub: '드래곤 · 비행' },
  { value: 'Charizard', label: '리자몽', sub: '불꽃 · 비행' },
  { value: 'Dragonite', label: '망나뇽', sub: '드래곤 · 비행' },
];

test('고르기 창은 값과 한국어 이름과 부제를 보여준다', t => {
  t.assert.snapshot(pickerRows(pickerFixture, 10));
});

test('고르기 창은 한 번에 보여줄 수를 제한한다', () => {
  const html = pickerRows(pickerFixture, 2);
  assert.ok(html.includes('보만다'));
  assert.ok(html.includes('리자몽'));
  assert.equal(html.includes('망나뇽'), false);
});

test('부제가 없으면 자리를 만들지 않는다', () => {
  const html = pickerRows([{ value: 'A', label: '가', sub: '' }], 10);
  assert.equal(html.includes('picker-sub'), false);
});

test('찾는 것이 없으면 안내한다', () => {
  assert.ok(pickerRows([], 10).includes('찾는 항목이 없습니다'));
});

test('값과 이름을 이스케이프한다', () => {
  const html = pickerRows([{ value: '<v>', label: '<이름>', sub: '<부제>' }], 10);
  assert.ok(html.includes('&lt;이름&gt;'));
  assert.ok(html.includes('&lt;v&gt;'));
  assert.equal(html.includes('<이름>'), false);
});

test('수정일은 날짜만 적고, 저장한 적 없으면 그렇게 알린다', () => {
  // 한국 시간 고정이라 돌리는 기계의 시간대와 무관하다.
  assert.equal(fmtDay(Date.UTC(2026, 8, 24, 3)), '2026.09.24');
  assert.equal(fmtDay(0), '저장 안 함');
  const html = sampleList([{ ...sample, updatedAt: Date.UTC(2026, 8, 24, 3) }], locale, reference);
  assert.ok(html.includes('2026.09.24'));
  assert.ok(sampleEditor(sample, { reference, locale }).includes('수정일 저장 안 함'));
});

const synced = { code: 'ABCDEFGHJKMNPQRSTV01', dirty: false };
const syncBar = (sync, status) => `${syncText(sync, status)}|${syncActions(sync, status)}`;

test('sync bar: off, checking, synced, offline and conflict', t => {
  t.assert.snapshot(
    [
      syncBar(null, 'off'),
      syncBar(synced, 'checking'),
      syncBar(synced, 'ok'),
      syncBar(synced, 'offline'),
      syncBar(synced, 'conflict'),
    ].join('\n'),
  );
});

test('sync buttons never submit a form', () => {
  for (const [sync, status] of [
    [null, 'off'],
    [synced, 'ok'],
    [synced, 'conflict'],
  ]) {
    const buttons = syncActions(sync, status).match(/<button[^>]*>/g);
    assert.equal(buttons.length, 2, status);
    assert.ok(
      buttons.every(b => b.includes('type="button"')),
      status,
    );
  }
});

test('the sync bar never prints the code itself', () => {
  for (const status of ['ok', 'offline', 'conflict'])
    assert.ok(!syncBar(synced, status).includes('ABCD'), status);
});

test('sync offers turn on or join, copy or off, and a way back to the conflict popup', () => {
  const actions = (sync, status) =>
    [...syncActions(sync, status).matchAll(/data-sync="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(actions(null, 'off'), ['enable', 'join']);
  assert.deepEqual(actions(synced, 'ok'), ['copy', 'off']);
  assert.deepEqual(actions(synced, 'conflict'), ['resolve', 'copy']);
  assert.equal(syncText(null, 'ok'), '이 기기에만 저장합니다.', '꺼져 있으면 상태와 상관없다');
});

test('share button appears only on saved items of a synced device', () => {
  const has = html => html.includes('data-builds-share');
  assert.equal(has(sampleEditor(sample, { reference, locale, existing: true })), false);
  assert.equal(
    has(sampleEditor(sample, { reference, locale, existing: true, shareable: true })),
    true,
  );
  assert.equal(
    has(partyEditor(party, [sample], { reference, locale, existing: true, shareable: true })),
    true,
  );
  const button = sampleEditor(sample, { reference, locale, shareable: true }).match(
    /<button[^>]*data-builds-share[^>]*>/,
  )[0];
  assert.ok(button.includes('type="button"'), '편집기 폼을 보내지 않는다');
  assert.ok(
    button.endsWith('>') &&
      sampleEditor(sample, { reference, locale, shareable: true }).includes('>샘플 공유</button>'),
  );
  assert.ok(
    partyEditor(party, [sample], { reference, locale, shareable: true }).includes(
      '>파티 공유</button>',
    ),
  );
});

const at = Date.UTC(2026, 9, 25, 3);
test('a shared sample and party are shown read-only', t => {
  const opts = { reference, locale };
  const one = shareView('ok', { kind: 'sample', sample, expiresAt: at }, opts);
  const team = shareView('ok', { kind: 'party', party, samples: [sample], expiresAt: at }, opts);
  t.assert.snapshot([one, team].join('\n'));
  for (const html of [one, team]) {
    assert.ok(!/data-builds-|<input|<textarea|<select/.test(html), '고치는 조작이 없다');
    assert.ok(!html.includes('<4번째>'), '설명은 이스케이프한다');
    assert.ok(html.includes('2026.10.25까지'));
  }
});

test('share states say what happened and offer a retry only when it can help', () => {
  assert.ok(shareView('loading', null).includes('불러오는 중'));
  assert.ok(!shareView('missing', null).includes('data-share-retry'));
  assert.ok(shareView('missing', null).includes('<p>기간이 만료되었거나 없는 링크입니다.</p>'));
  assert.ok(shareView('offline', null).includes('data-share-retry'));
  assert.ok(shareView('missing', null).includes('data-share-home'));
  assert.equal(shareTitle(null), '공유');
  assert.equal(shareTitle({ kind: 'sample' }), '공유받은 샘플');
  assert.equal(shareTitle({ kind: 'party' }), '공유받은 파티');
});

test('move numbers: category, power, accuracy and PP only when they mean something', () => {
  const quake = reference.move.earthquake;
  assert.equal(moveMeta(quake), '물리 · 위력 100 · 명중 100');
  assert.equal(moveMeta(quake, { pp: true }), '물리 · 위력 100 · 명중 100 · PP 12');
  assert.equal(
    moveMeta({ category: 'Status', accuracy: true, pp: 20 }, { pp: true }),
    '변화 · PP 20',
  );
  assert.equal(
    moveMeta({ category: 'Special', power: 60, accuracy: true }),
    '특수 · 위력 60 · 필중',
  );
  assert.equal(moveMeta(undefined), '');
});

test('move effects drop the no-effect phrase and the game line breaks', () => {
  assert.equal(moveEffect({ effect: '별도의 추가 효과가 없습니다.' }), '');
  assert.equal(moveEffect({}), '');
  assert.equal(
    moveEffect({ effect: '4턴 동안\n상대를 기술봉인 상태로 만든다.' }),
    '4턴 동안 상대를 기술봉인 상태로 만든다.',
  );
});

test('picker rows show traits and effect only when given', () => {
  const html = pickerRows(
    [{ value: 'A', label: '가', sub: '물리', chips: ['접촉', '물기'], effect: '<효과>' }],
    5,
  );
  assert.ok(html.includes('<small class="picker-sub picker-traits">접촉 · 물기</small>'));
  assert.ok(html.includes('<small class="picker-effect">&lt;효과&gt;</small>'));
  const bare = pickerRows([{ value: 'A', label: '가', sub: '물리', chips: [], effect: '' }], 5);
  assert.ok(!bare.includes('picker-traits') && !bare.includes('picker-effect'));
});

test('the conflict list names each item and what each side did', () => {
  const html = conflictList([
    { kind: 'sample', id: 'a', local: { name: '<보만다>' }, server: { name: '보만다' } },
    { kind: 'party', id: 'p', local: { name: '파티' }, server: null },
  ]);
  assert.ok(html.includes('샘플 · &lt;보만다&gt;'));
  assert.ok(html.includes('이 기기: 수정 / 서버: 수정'));
  assert.ok(html.includes('파티 · 파티'));
  assert.ok(html.includes('이 기기: 수정 / 서버: 삭제'));
});

test('editor buttons read save, reset, delete, share, back to list', () => {
  const html = sampleEditor(sample, { reference, locale, existing: true, shareable: true });
  const order = [...html.matchAll(/data-builds-(save|reset|delete|share|cancel)>/g)].map(m => m[1]);
  // 위의 ‘← 목록으로’가 맨 앞에 하나 더 있다.
  assert.deepEqual(order, ['cancel', 'save', 'reset', 'delete', 'share', 'cancel']);
});
