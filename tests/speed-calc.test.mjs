// 스피드 계산기의 계산. 값은 Showdown의 같은 계산과 손으로 맞춰 본 것이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rawSpeed,
  stageSpeed,
  speedEffects,
  finalSpeed,
  compareSpeed,
  emptySide,
  sideFromSample,
  SPEED_ABILITIES,
  SPEED_ITEMS,
} from '../src/speed-calc.js';
import { natureAdjust } from '../src/builds.js';
import { statRanges } from '../src/reference.js';

const side = extra => ({ ...emptySide(), ...extra });
const calm = { weather: '', terrain: '' };

test('raw speed matches the stat table for every nature and investment', () => {
  for (const base of [5, 48, 100, 142, 200]) {
    const [fastest, invested, neutral, slowest] = statRanges({
      hp: 1,
      spe: base,
      atk: 1,
      def: 1,
      spa: 1,
      spd: 1,
    }).spe;
    assert.equal(rawSpeed(base, 32, 11), fastest);
    assert.equal(rawSpeed(base, 32, 10), invested);
    assert.equal(rawSpeed(base, 0, 10), neutral);
    assert.equal(rawSpeed(base, 0, 9), slowest);
  }
  assert.equal(rawSpeed(100, 99, 10), rawSpeed(100, 32, 10), '포인트는 32를 넘지 않는다');
});

test('stages multiply up by (2+n)/2 and down by 2/(2-n)', () => {
  assert.equal(stageSpeed(167, 1), 250);
  assert.equal(stageSpeed(167, 2), 334);
  assert.equal(stageSpeed(167, -1), 111);
  assert.equal(stageSpeed(167, -6), 41);
  assert.equal(stageSpeed(167, 9), stageSpeed(167, 6));
});

test('modifiers chain in 4096ths and round half down', () => {
  // 보만다 최속 167. 스카프 250.5는 250으로 내린다.
  const scarf = finalSpeed(side({ points: 32, nature: 11, item: 'choicescarf' }), calm, 100);
  assert.equal(scarf.stat, 167);
  assert.equal(scarf.speed, 250);
  // 스카프 × 순풍은 3배 한 번으로 적용한다. 따로 반올림하면 500이 된다.
  const both = finalSpeed(
    side({ points: 32, nature: 11, item: 'choicescarf', tailwind: true }),
    calm,
    100,
  );
  assert.equal(both.speed, 501);
  assert.deepEqual(
    both.effects.map(e => e.id),
    ['choicescarf', 'tailwind'],
  );
});

test('paralysis halves last, and quick feet ignores it while boosting', () => {
  const par = finalSpeed(side({ points: 32, nature: 10, status: 'par' }), calm, 100);
  assert.equal(par.speed, Math.floor(152 / 2));
  assert.equal(par.paralyzed, true);
  const feet = finalSpeed(
    side({ points: 32, nature: 10, status: 'par', ability: 'quickfeet' }),
    calm,
    100,
  );
  assert.equal(feet.paralyzed, false);
  assert.equal(feet.speed, 228);
  const noStatus = finalSpeed(side({ points: 32, ability: 'quickfeet' }), calm, 100);
  assert.equal(noStatus.speed, 152, '상태이상이 없으면 속보는 발동하지 않는다');
});

test('weather and terrain abilities need their weather or terrain', () => {
  const swim = side({ ability: 'swiftswim' });
  assert.equal(speedEffects(swim, calm).length, 0);
  assert.equal(speedEffects(swim, { weather: 'rain', terrain: '' })[0].factor, 2);
  assert.equal(speedEffects(swim, { weather: 'sun', terrain: '' }).length, 0);
  const surf = side({ ability: 'surgesurfer' });
  assert.equal(speedEffects(surf, { weather: '', terrain: 'electric' }).length, 1);
});

test('protosynthesis needs sun or booster energy, and speed as the highest stat', () => {
  const proto = side({ ability: 'protosynthesis' });
  assert.equal(speedEffects(proto, calm).length, 0);
  assert.equal(speedEffects(proto, { weather: 'sun', terrain: '' })[0].factor, 1.5);
  assert.equal(speedEffects({ ...proto, item: 'boosterenergy' }, calm)[0].factor, 1.5);
  assert.equal(
    speedEffects({ ...proto, abilityOn: false }, { weather: 'sun', terrain: '' }).length,
    0,
  );
  assert.equal(
    speedEffects({ ...proto, item: 'boosterenergy' }, calm).some(e => e.kind === 'item'),
    false,
    '부스트에너지 자체는 배율이 없다',
  );
});

test('toggled abilities and species-bound items', () => {
  assert.equal(speedEffects(side({ ability: 'unburden' }), calm)[0].factor, 2);
  assert.equal(speedEffects(side({ ability: 'unburden', abilityOn: false }), calm).length, 0);
  assert.equal(speedEffects(side({ ability: 'slowstart' }), calm)[0].factor, 0.5);
  assert.equal(speedEffects(side({ item: 'quickpowder', pokemon: 'salamence' }), calm).length, 0);
  assert.equal(speedEffects(side({ item: 'quickpowder', pokemon: 'ditto' }), calm)[0].factor, 2);
  assert.equal(speedEffects(side({ item: 'ironball' }), calm)[0].factor, 0.5);
});

test('who moves first', () => {
  assert.equal(compareSpeed(200, 150), 'faster');
  assert.equal(compareSpeed(150, 200), 'slower');
  assert.equal(compareSpeed(150, 150), 'tie');
});

test('a sample brings its pokemon, speed points, nature and only speed-relevant choices', () => {
  const scarf = sideFromSample(
    {
      pokemon: 'salamence',
      points: [0, 32, 0, 0, 2, 32],
      nature: 'jolly',
      item: 'Choice Scarf',
      ability: 'Intimidate',
    },
    natureAdjust,
  );
  assert.deepEqual(
    [scarf.pokemon, scarf.points, scarf.nature, scarf.item, scarf.ability],
    ['salamence', 32, 11, 'choicescarf', ''],
  );
  const slow = sideFromSample(
    {
      pokemon: 'x',
      points: [0, 0, 0, 0, 0, 0],
      nature: 'brave',
      item: 'Life Orb',
      ability: 'Swift Swim',
    },
    natureAdjust,
  );
  assert.deepEqual([slow.nature, slow.item, slow.ability], [9, '', 'swiftswim']);
});

test('every listed ability and item exists in the reference data', async () => {
  const { readFile } = await import('node:fs/promises');
  const reference = JSON.parse(
    await readFile(new URL('../public/data/reference.json', import.meta.url)),
  );
  for (const id of Object.keys(SPEED_ABILITIES)) assert.ok(reference.ability[id], id);
  for (const id of Object.keys(SPEED_ITEMS)) assert.ok(reference.held_item[id], id);
});
