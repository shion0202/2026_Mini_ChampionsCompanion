// 데미지 계산. 기대값은 @smogon/calc(Showdown 9세대 계산기)로 같은 조건을 계산한 결과다.
// 저장소 밖에서 @smogon/calc와 무작위 상황 약 17,000건(1단계)과 약 30,000건(2단계)을 견주어 난수 16개가 모두 같음을
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
  grounded,
  hazardDamage,
  koOdds,
  powerOf,
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

test('hex, venoshock and facade double with the right status', () => {
  const run = (id, attackerStatus, defenderStatus) =>
    damageRolls({
      reference,
      attacker: side('gengar', {}, { status: attackerStatus }),
      defender: side('garchomp', {}, { status: defenderStatus, hpPercent: 100 }),
      field: { format: 'singles', weather: '', terrain: '' },
      move: { ...reference.move[id], id },
    }).basePower;
  assert.equal(run('hex', '', ''), 65);
  assert.equal(run('hex', '', 'par'), 130);
  assert.equal(run('venoshock', '', 'par'), 65);
  assert.equal(run('venoshock', '', 'psn'), 130);
  assert.equal(run('facade', 'brn', ''), 140);
  assert.equal(run('facade', 'slp', ''), 70, '잠듦이면 오르지 않는다');
});

// ── 2단계: 타입을 바꾸는 특성, 위력이 바뀌는 기술, 땅에 붙어 있는지, 타격마다 다른 데미지 ──
// 기대값은 같은 조건의 @smogon/calc 결과다. hits는 타격마다의 난수다.
const run2 = c =>
  damageRolls({
    reference,
    attacker: side(c.a, c.A?.pts ?? {}, {
      ability: c.A?.ab ?? '',
      item: c.A?.it ?? '',
      hpPercent: c.A?.hpPercent ?? 100,
    }),
    defender: side(c.d, c.D?.pts ?? {}, {
      ability: c.D?.ab ?? '',
      item: c.D?.it ?? '',
      hpPercent: 100,
    }),
    field: { format: 'singles', weather: c.w ?? '', terrain: c.t ?? '' },
    move: { ...reference.move[c.m], id: c.m },
  });
const perHit = result =>
  Array.from({ length: result.hits }, (_, i) => result.rollsAt(i + 1, i === 0, true));
const FIXTURES2 = [
  {
    name: '메가솔라 웨더볼은 비에서도 쾌청 불꽃 100',
    a: 'charizardmegay',
    d: 'garchomp',
    m: 'weatherball',
    A: { ab: 'megasol', pts: { spa: 32 } },
    w: 'rain',
    hits: [[85, 87, 87, 88, 90, 90, 91, 93, 93, 94, 96, 96, 97, 99, 99, 101]],
  },
  {
    name: '페어리스킨 하이퍼보이스',
    a: 'sylveon',
    d: 'garchomp',
    m: 'hypervoice',
    A: { ab: 'pixilate', pts: { spa: 32 } },
    hits: [[188, 192, 194, 198, 198, 200, 204, 206, 206, 210, 212, 216, 216, 218, 222, 224]],
  },
  {
    name: '탁쳐서떨구기 → 도구를 가진 상대',
    a: 'weavile',
    d: 'gengar',
    m: 'knockoff',
    A: { pts: { atk: 32 } },
    D: { it: 'leftovers' },
    hits: [[236, 236, 240, 242, 246, 248, 252, 254, 258, 260, 264, 266, 270, 272, 276, 278]],
  },
  {
    name: '분화, 남은 HP 절반',
    a: 'typhlosion',
    d: 'garchomp',
    m: 'eruption',
    A: { pts: { spa: 32, hp: 32 }, hpPercent: 50 },
    hits: [[32, 32, 33, 33, 33, 33, 34, 34, 35, 35, 36, 36, 36, 36, 37, 38]],
  },
  {
    name: '로킥 → 헤비메탈 보스로라',
    a: 'lucario',
    d: 'aggron',
    m: 'lowkick',
    A: { pts: { atk: 32 } },
    D: { ab: 'heavymetal' },
    hits: [[220, 220, 228, 228, 232, 232, 240, 240, 240, 244, 244, 252, 252, 256, 256, 264]],
  },
  {
    name: '부자유친 이판사판태클, 두 번째는 1/4',
    a: 'kangaskhanmega',
    d: 'garchomp',
    m: 'doubleedge',
    A: { ab: 'parentalbond', pts: { atk: 32 } },
    hits: [
      [105, 106, 108, 109, 109, 111, 112, 114, 115, 117, 117, 118, 120, 121, 123, 124],
      [25, 27, 27, 27, 27, 27, 28, 28, 28, 28, 28, 30, 30, 30, 30, 31],
    ],
  },
  {
    name: '트리플악셀 20·40·60',
    a: 'weavile',
    d: 'garchomp',
    m: 'tripleaxel',
    A: { pts: { atk: 32 } },
    hits: [
      [72, 72, 76, 76, 76, 76, 76, 76, 76, 84, 84, 84, 84, 84, 84, 88],
      [136, 144, 144, 144, 144, 148, 148, 148, 156, 156, 156, 156, 160, 160, 160, 168],
      [204, 208, 208, 216, 216, 216, 220, 220, 228, 228, 228, 232, 232, 240, 240, 244],
    ],
  },
  {
    name: '두꺼운지방 → 불꽃 공격 절반',
    a: 'charizard',
    d: 'snorlax',
    m: 'flamethrower',
    A: { pts: { spa: 32 } },
    D: { ab: 'thickfat' },
    hits: [[33, 33, 33, 33, 34, 34, 34, 34, 36, 36, 36, 36, 37, 37, 37, 39]],
  },
  {
    name: '일렉트릭필드, 땅에 붙은 공격 측',
    a: 'rotomwash',
    d: 'gyarados',
    m: 'thunderbolt',
    A: { pts: { spa: 32 } },
    t: 'electric',
    hits: [[348, 352, 360, 360, 364, 372, 372, 376, 384, 384, 388, 396, 396, 400, 408, 412]],
  },
  {
    name: '일렉트릭필드, 풍선으로 뜬 공격 측은 필드 보정 없음',
    a: 'rotomwash',
    d: 'gyarados',
    m: 'thunderbolt',
    A: { pts: { spa: 32 }, it: 'airballoon' },
    t: 'electric',
    hits: [[268, 268, 276, 276, 280, 280, 288, 288, 292, 292, 300, 300, 304, 304, 312, 316]],
  },
];
for (const c of FIXTURES2)
  test(`matches Showdown: ${c.name}`, () => assert.deepEqual(perHit(run2(c)), c.hits));

test('grounded: iron ball grounds, levitate and air balloon lift', () => {
  const g = (id, extra = {}) =>
    grounded(reference.species[id], { ability: '', item: '', ...extra });
  assert.equal(g('garchomp'), true);
  assert.equal(g('dragonite'), false);
  assert.equal(g('dragonite', { item: 'ironball' }), true);
  assert.equal(g('gengar', { ability: 'levitate' }), false);
  assert.equal(g('garchomp', { item: 'airballoon' }), false);
  const quake = (d, extra) =>
    run2({ a: 'garchomp', d, m: 'earthquake', D: extra, A: { pts: { atk: 32 } } });
  assert.equal(quake('garchomp', { it: 'airballoon' }).immune, true);
  assert.ok(
    quake('dragonite', { it: 'ironball' }).rolls,
    '쇠구슬을 단 비행 타입은 땅 기술을 맞는다',
  );
  assert.equal(
    run2({
      a: 'garchomp',
      d: 'gengar',
      m: 'earthquake',
      D: { ab: 'levitate' },
      A: { ab: 'moldbreaker' },
    }).immune,
    undefined,
    '틀깨기는 부유를 무시한다',
  );
});

test('abilities that block a type or a move trait', () => {
  const blocked = (m, ab) => run2({ a: 'charizard', d: 'garchomp', m, D: { ab } }).immune;
  assert.equal(blocked('flamethrower', 'flashfire'), true);
  assert.equal(blocked('flamethrower', ''), undefined);
  assert.equal(
    run2({ a: 'gengar', d: 'garchomp', m: 'shadowball', D: { ab: 'bulletproof' } }).immune,
    true,
  );
  assert.equal(run2({ a: 'gengar', d: 'dragonite', m: 'shadowball', D: {} }).immune, undefined);
});

test('variable power from speed, counts and toggles', () => {
  const input = (m, attacker = {}, defender = {}) => ({
    reference,
    attacker: side('blastoise', { atk: 32 }, { hpPercent: 100, ...attacker }),
    defender: side('garchomp', {}, { hpPercent: 100, ...defender }),
    field: { format: 'singles', weather: '', terrain: '' },
    move: { ...reference.move[m], id: m },
  });
  const slow = damageRolls(input('gyroball'));
  // 거북왕 스피드 98, 한카리아스 122 → floor(25 × 122 / 98) + 1 = 32
  assert.equal(slow.basePower, 32);
  assert.deepEqual(slow.speeds, { attacker: 98, defender: 122 });
  assert.equal(damageRolls(input('payback')).basePower, 50);
  assert.equal(damageRolls(input('payback', { movesLast: true })).basePower, 100);
  assert.equal(
    damageRolls({
      ...input('ragefist', { timesHit: 3 }),
      attacker: side('annihilape', {}, { timesHit: 3 }),
    })?.basePower,
    200,
  );
  assert.equal(damageRolls(input('seismictoss')).fixed, 50);
  assert.equal(damageRolls({ ...input('poltergeist'), attacker: side('gengar') }).blocked, true);
});

test('KO: sash and sturdy endure from full HP, disguise takes the first hit', () => {
  const rolls = Array(16).fill(300);
  const table = (opts, hits = 1) =>
    koOdds({ hits, rollsAt: () => rolls, hp: 100, maxHp: 100, ...opts });
  assert.equal(table({})[0].chance, 1);
  assert.equal(table({ endure: true })[0].chance, 0, '한 번은 버틴다');
  assert.equal(table({ endure: true })[1].chance, 1);
  assert.equal(table({ endure: true }, 2)[0].chance, 1, '연속기는 두 번째 타격이 쓰러뜨린다');
  assert.equal(table({ disguise: true })[0].chance, 0);
  assert.equal(table({ disguise: true })[1].chance, 1);
});

test('hazards come off the HP first and break multiscale', () => {
  const summary = extra =>
    damageSummary({
      reference,
      attacker: side('garchomp', { atk: 32 }),
      defender: side('dragonite', {}, { hpPercent: 100, ability: 'multiscale', ...extra }),
      field: { format: 'singles', weather: '', terrain: '' },
      move: { ...reference.move.stoneedge, id: 'stoneedge' },
    });
  const clean = summary({});
  const rocks = summary({ stealthRock: true });
  // 망나뇽은 바위 2배 → 최대 HP의 1/4
  assert.equal(rocks.hazard, Math.floor(rocks.hpMax / 4));
  assert.equal(rocks.hpStart, rocks.hpMax - rocks.hazard);
  assert.ok(rocks.max > clean.max, '설치 기술로 HP가 줄면 멀티스케일이 풀린다');
  assert.equal(hazardDamage({ spikes: 3 }, reference.species.dragonite, reference.types, 100), 0);
  assert.equal(hazardDamage({ spikes: 3 }, reference.species.garchomp, reference.types, 100), 25);
  assert.equal(
    hazardDamage(
      { spikes: 3, ability: 'magicguard' },
      reference.species.garchomp,
      reference.types,
      100,
    ),
    0,
  );
});

test('a resist berry and multiscale apply only to the first hit', () => {
  const result = run2({
    a: 'weavile',
    d: 'dragonite',
    m: 'iceshard',
    A: { pts: { atk: 32 } },
    D: { it: 'yacheberry', ab: 'multiscale' },
  });
  const first = result.rollsAt(1, true, true);
  const later = result.rollsAt(1, false, false);
  assert.ok(later[0] >= first[0] * 3, '열매(1/2)와 멀티스케일(1/2)이 모두 빠진다');
});

test('power adds every hit and the critical hit', () => {
  const summary = extra =>
    damageSummary({
      reference,
      attacker: side('weavile', { atk: 32 }, extra),
      defender: side('garchomp', {}, { hpPercent: 100 }),
      field: { format: 'singles', weather: '', terrain: '' },
      move: { ...reference.move.tripleaxel, id: 'tripleaxel' },
      crit: !!extra.crit,
    });
  const plain = summary({});
  // 트리플악셀: 20 + 40 + 60을 모두 더한다(포푸니크는 얼음이라 자속 1.5).
  assert.equal(plain.power, plain.attackStat * 120 * 1.5);
  assert.equal(summary({ crit: true }).power, Math.floor(plain.attackStat * 120 * 1.5 * 1.5));
  assert.equal(
    powerOf({ attackStat: 100, hitPowers: [80, 80], stab: 1.5, crit: false, parentalBond: true }),
    Math.floor(100 * 80 * 1.5 * 1.25),
    '부자유친의 두 번째 타격은 1/4',
  );
});

test('fixed damage, fling, spit up and power without damage', () => {
  const summary = (attacker, move, extra = {}, defender = {}) =>
    damageSummary({
      reference,
      attacker: side(attacker, { atk: 32 }, { hpPercent: 100, ...extra }),
      defender: side('garchomp', {}, { hpPercent: 100, ...defender }),
      field: { format: 'singles', weather: '', terrain: '' },
      move: { ...reference.move[move], id: move },
    });
  assert.equal(summary('machamp', 'counter', { damageTaken: 80 }).fixed, 160);
  assert.equal(
    summary('machamp', 'counter').reason,
    '기술이 실패합니다.',
    '받은 데미지가 없으면 실패',
  );
  assert.equal(summary('lucario', 'metalburst', { damageTaken: 81 }).fixed, 121);
  const gambit = summary('staraptor', 'finalgambit', { hpPercent: 50 });
  assert.equal(gambit.fixed, Math.floor(gambit.attackerHpMax / 2));
  // 죽기살기: 상대 남은 HP − 내 남은 HP. 내가 더 많으면 실패한다.
  assert.equal(summary('pikachu', 'endeavor', { hpPercent: 1 }).fixed > 0, true);
  assert.equal(summary('pikachu', 'endeavor', {}, { hpPercent: 1 }).reason, '기술이 실패합니다.');
  assert.equal(summary('charizard', 'fling', { item: 'ironball' }).basePower, 130);
  assert.equal(summary('charizard', 'fling').reason, '기술이 실패합니다.');
  assert.equal(summary('arbok', 'spitup', { stockpile: 3 }).basePower, 300);
  assert.equal(summary('morpeko', 'aurawheel', { hangry: true }).moveType, 'Dark');
  // 효과가 없어도 결정력은 보인다.
  const immune = summary('garchomp', 'earthquake', {}, { item: 'airballoon' });
  assert.equal(immune.reason, '효과가 없습니다.');
  assert.ok(immune.power > 0);
});
