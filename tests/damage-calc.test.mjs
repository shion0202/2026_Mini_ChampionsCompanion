// 데미지 계산. 기대값은 @smogon/calc(Showdown 9세대 계산기)로 같은 조건을 계산한 결과다.
// 저장소 밖에서 @smogon/calc와 무작위 상황 약 17,000건을 견주어 난수 16개가 모두 같음을
// 확인했다(docs/damage-calc.md). 여기에는 대표 상황만 고정해 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  damageRolls,
  koChance,
  koTable,
  koVerdict,
  damageSummary,
  defaultHits,
  effectivenessOf,
  hpStat,
  stat,
} from '../src/damage-calc.js';

const reference = JSON.parse(
  await readFile(new URL('../public/data/reference.json', import.meta.url)),
);

// 능력 포인트 {atk: 31}처럼 준 것 말고는 0이다. 성격은 모두 무보정이다.
const FIXTURES = [
  {
    name: '한카리아스 지진 → 보만다(비행 무효)',
    a: 'garchomp',
    d: 'salamence',
    m: 'earthquake',
    aPts: { atk: 31 },
    dPts: { hp: 31 },
    rolls: [0],
  },
  {
    name: '한카리아스 구애머리띠 역린 → 망나뇽',
    a: 'garchomp',
    d: 'dragonite',
    m: 'outrage',
    aPts: { atk: 31 },
    aIt: 'choiceband',
    dPts: { hp: 31, def: 10 },
    rolls: [294, 296, 300, 306, 308, 312, 314, 318, 320, 326, 330, 332, 336, 338, 342, 348],
  },
  {
    name: '급소 + 공격 -2 랭크 무시',
    a: 'garchomp',
    d: 'dragonite',
    m: 'dragonclaw',
    aPts: { atk: 20 },
    aStage: -2,
    crit: true,
    rolls: [204, 206, 210, 212, 216, 216, 218, 222, 224, 228, 228, 230, 234, 236, 240, 242],
  },
  {
    name: '쾌청 화염방사 생명의구슬 → 반감 열매',
    a: 'charizard',
    d: 'ferrothorn',
    m: 'flamethrower',
    aPts: { spa: 31 },
    aIt: 'lifeorb',
    dIt: 'occaberry',
    weather: 'sun',
    rolls: [237, 237, 242, 244, 250, 250, 252, 257, 257, 260, 265, 268, 268, 273, 276, 281],
  },
  {
    name: '더블 전체기 + 리플렉터',
    a: 'garchomp',
    d: 'gyarados',
    m: 'rockslide',
    aPts: { atk: 31 },
    doubles: true,
    reflect: true,
    rolls: [52, 52, 53, 53, 53, 55, 55, 56, 56, 57, 57, 59, 59, 60, 60, 61],
  },
  {
    name: '화상 물리 + 멀티스케일',
    a: 'tyranitar',
    d: 'dragonite',
    m: 'stoneedge',
    aPts: { atk: 31 },
    burn: true,
    dAb: 'multiscale',
    rolls: [45, 45, 46, 47, 48, 48, 48, 49, 49, 50, 51, 51, 51, 52, 53, 54],
  },
  {
    name: '테크니션 불릿펀치 + 적응력 아님',
    a: 'scizor',
    d: 'gardevoir',
    m: 'bulletpunch',
    aPts: { atk: 31 },
    aAb: 'technician',
    rolls: [146, 146, 150, 152, 152, 156, 156, 158, 158, 162, 164, 164, 168, 168, 170, 174],
  },
  {
    name: '돌격조끼 + 모래바람 바위 특방',
    a: 'gardevoir',
    d: 'tyranitar',
    m: 'moonblast',
    aPts: { spa: 31 },
    dIt: 'assaultvest',
    weather: 'sand',
    dPts: { spd: 31, hp: 31 },
    rolls: [56, 56, 60, 60, 60, 60, 60, 62, 62, 62, 62, 66, 66, 66, 66, 68],
  },
];

const side = (pokemon, points = {}, extra = {}) => ({ pokemon, points, nature: {}, ...extra });
const run = c =>
  damageRolls({
    reference,
    attacker: side(c.a, c.aPts, {
      ability: c.aAb ?? '',
      item: c.aIt ?? '',
      stages: { atk: c.aStage ?? 0 },
      status: c.burn ? 'brn' : '',
    }),
    defender: side(c.d, c.dPts, {
      ability: c.dAb ?? '',
      item: c.dIt ?? '',
      hpPercent: 100,
      reflect: !!c.reflect,
    }),
    field: {
      format: c.doubles ? 'doubles' : 'singles',
      weather: c.weather ?? '',
      terrain: '',
      spread: !!c.doubles,
    },
    move: { ...reference.move[c.m], id: c.m },
    crit: !!c.crit,
  });

for (const c of FIXTURES)
  test(`matches Showdown: ${c.name}`, () => {
    const result = run(c);
    assert.deepEqual(result.immune ? [0] : result.rolls, c.rolls);
  });

test('stats follow the Champions stat points at level 50', () => {
  assert.equal(hpStat(108, 32), 215);
  assert.equal(stat(130, 32, 11), 200);
  assert.equal(stat(130, 0, 9), 135);
});

test('special move rules', () => {
  const base = {
    reference,
    attacker: side('garchomp', { atk: 32 }),
    defender: side('dragonite', {}, { hpPercent: 100 }),
    field: { format: 'singles', weather: '', terrain: '' },
  };
  const move = id => ({ ...reference.move[id], id });
  // 항상 급소
  assert.equal(damageRolls({ ...base, move: move('stormthrow') }).crit, true);
  // 사이코필드의 선제기는 땅에 붙은 상대에게 막힌다. 비행 타입이면 맞는다.
  const psychic = { ...base, field: { ...base.field, terrain: 'psychic' } };
  assert.equal(
    damageRolls({ ...psychic, defender: side('garchomp'), move: move('aquajet') }).blocked,
    true,
  );
  assert.ok(damageRolls({ ...psychic, move: move('aquajet') }).rolls);
  // 아이언롤러는 필드가 없으면 실패한다.
  assert.equal(damageRolls({ ...base, move: move('steelroller') }).blocked, true);
  // 프리즈드라이는 물 타입에 효과가 굉장하다.
  assert.equal(effectivenessOf(reference.types, 'Ice', ['Water'], 'freezedry'), 2);
  assert.equal(effectivenessOf(reference.types, 'Ice', ['Water', 'Ground'], 'freezedry'), 4);
  // 깨트리기는 벽을 받지 않는다.
  const walled = { ...base, defender: side('dragonite', {}, { hpPercent: 100, reflect: true }) };
  assert.deepEqual(
    damageRolls({ ...walled, move: move('brickbreak') }).rolls,
    damageRolls({ ...base, move: move('brickbreak') }).rolls,
  );
  // 변화 기술과 위력 없는 기술
  assert.equal(damageRolls({ ...base, move: move('swordsdance') }).status, true);
});

test('multi-hit moves default to their hit count, skill link hits five times', () => {
  const move = id => ({ ...reference.move[id], id });
  assert.equal(defaultHits(move('dragondarts'), ''), 2);
  assert.equal(defaultHits(move('bulletseed'), ''), 2);
  assert.equal(defaultHits(move('bulletseed'), 'skilllink'), 5);
  assert.equal(defaultHits(move('earthquake'), ''), 1);
});

test('KO chances add independent rolls over several turns', () => {
  const rolls = Array.from({ length: 16 }, (_, i) => 40 + i); // 40~55
  assert.deepEqual(koChance(rolls, 1, 40), { turns: 1, chance: 1 });
  assert.deepEqual(koChance(rolls, 1, 55), { turns: 1, chance: 1 / 16 });
  assert.deepEqual(koChance(rolls, 1, 100).turns, 2);
  assert.equal(koChance(rolls, 1, 80).chance, 1, '두 번이면 확정');
  assert.equal(koChance(rolls, 2, 100).turns, 1, '두 번 때리는 기술은 한 번에 합한다');
  assert.equal(koChance(rolls, 1, 1000).turns, null, '네 번으로도 못 쓰러뜨린다');
  const two = koChance(rolls, 1, 100);
  assert.ok(two.chance > 0 && two.chance < 1);
});

test('KO table and the one-line verdict', () => {
  const rolls = Array.from({ length: 16 }, (_, i) => 40 + i); // 40~55
  const table = koTable(rolls, 1, 100);
  assert.deepEqual(
    table.map(r => r.turns),
    [1, 2, 3, 4],
  );
  assert.equal(table[0].chance, 0);
  assert.ok(table[1].chance > 0 && table[1].chance < 1);
  assert.equal(table[2].chance, 1);
  assert.deepEqual(koVerdict(table), { text: '난수 2타', turns: 2, chance: table[1].chance });
  assert.equal(koVerdict(koTable(rolls, 1, 40)).text, '확정 1타');
  assert.equal(koVerdict(koTable(rolls, 1, 1000)).text, '5타 이상 필요');
});

test('the summary gives range, percent of max HP, KO table, power and bulk', () => {
  const summary = damageSummary({
    reference,
    attacker: side('garchomp', { atk: 31 }, { item: 'choiceband' }),
    defender: side('dragonite', { hp: 31, def: 10 }, { hpPercent: 100 }),
    field: { format: 'singles', weather: '', terrain: '' },
    move: { ...reference.move.outrage, id: 'outrage' },
  });
  assert.equal(summary.min, 294);
  assert.equal(summary.max, 348);
  assert.equal(summary.hpMax, 91 + 31 + 75);
  assert.equal(summary.verdict.text, '확정 1타');
  assert.ok(summary.maxPercent > 100);
  assert.equal(summary.power, summary.attackStat * summary.basePower * 1.5);
  const halfHp = damageSummary({
    reference,
    attacker: side('garchomp'),
    defender: side('dragonite', {}, { hpPercent: 50 }),
    field: { format: 'singles', weather: '', terrain: '' },
    move: { ...reference.move.earthquake, id: 'earthquake' },
  });
  assert.equal(halfHp.reason, '효과가 없습니다.');
  assert.equal(halfHp.hpNow, Math.floor(halfHp.hpMax / 2));
});
