// 스피드 계산기의 계산. DOM 없이 값만 다루므로 node --test로 검사한다.
// 계산 순서와 반올림은 Showdown(sim/pokemon.ts의 getStat, conditions.ts의 마비)을 따른다.
//   1. 실수치 = 내림((종족값 + 능력 포인트 + 20) × 성격 보정)   (레벨 50, 개체값 고정)
//   2. 랭크를 곱한다(+면 (2+n)/2, -면 2/(2-n), 내림).
//   3. 특성·도구·순풍 배율을 4096 기준 고정소수로 이어 곱한 뒤 한 번에 적용한다.
//   4. 마비면 절반(내림). 속보는 마비의 감소를 받지 않는다.
//   5. 사람이 넣은 배수를 마지막에 곱하고 내린다. 예상하지 못한 배율을 직접 넣는 칸이다.

// 스피드를 바꾸는 특성. 랭크를 올리는 특성(가속, 전기엔진 등)은 랭크 칸으로 다룬다.
// weather·terrain은 그 날씨·필드일 때, status는 상태이상일 때, toggle은 사람이 켤 때
// 발동한다. highest는 스피드가 가장 높은 능력치여야 한다는 조건이다.
export const SPEED_ABILITIES = {
  chlorophyll: { factor: 2, weather: 'sun' },
  swiftswim: { factor: 2, weather: 'rain' },
  sandrush: { factor: 2, weather: 'sand' },
  slushrush: { factor: 2, weather: 'snow' },
  surgesurfer: { factor: 2, terrain: 'electric' },
  quickfeet: { factor: 1.5, status: true },
  unburden: { factor: 2, toggle: '도구를 잃은 뒤' },
  slowstart: { factor: 0.5, toggle: '나온 뒤 5턴 동안' },
  protosynthesis: { factor: 1.5, weather: 'sun', booster: true, highest: true },
  quarkdrive: { factor: 1.5, terrain: 'electric', booster: true, highest: true },
};

// 스피드를 바꾸는 도구. 부스트에너지는 그 자체로는 배율이 없고 고대활성·쿼크차지를
// 날씨·필드 없이 발동시킨다. 스피드파우더는 메타몽만 받는다.
export const SPEED_ITEMS = {
  choicescarf: { factor: 1.5 },
  ironball: { factor: 0.5 },
  machobrace: { factor: 0.5 },
  poweranklet: { factor: 0.5 },
  powerband: { factor: 0.5 },
  powerbelt: { factor: 0.5 },
  powerbracer: { factor: 0.5 },
  powerlens: { factor: 0.5 },
  powerweight: { factor: 0.5 },
  quickpowder: { factor: 2, species: 'ditto' },
  boosterenergy: { factor: 1 },
};

export const WEATHERS = { '': '없음', sun: '쾌청', rain: '비', sand: '모래바람', snow: '눈' };
export const TERRAINS = {
  '': '없음',
  electric: '일렉트릭필드',
  grassy: '그래스필드',
  misty: '미스트필드',
  psychic: '사이코필드',
};
export const STATUSES = {
  '': '없음',
  par: '마비',
  brn: '화상',
  psn: '독',
  slp: '잠듦',
  frz: '얼음',
};
export const NATURE_FACTORS = [9, 10, 11];

export const emptySide = () => ({
  pokemon: null,
  points: 32,
  nature: 10,
  stage: 0,
  ability: '',
  item: '',
  abilityOn: true,
  status: '',
  tailwind: false,
  multiplier: 1,
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// 레벨 50, 개체값 31 고정. 성격은 9·10·11(0.9·1.0·1.1배)을 정수로 받아 소수 오차를 피한다.
export const rawSpeed = (base, points, nature = 10) =>
  Math.floor(((base + clamp(points, 0, 32) + 20) * nature) / 10);

export function stageSpeed(stat, stage) {
  const n = clamp(stage, -6, 6);
  return n >= 0 ? Math.floor((stat * (2 + n)) / 2) : Math.floor((stat * 2) / (2 - n));
}

// 이 쪽에서 실제로 걸리는 배율. 화면에 근거로 보인다.
export function speedEffects(side, field) {
  const effects = [];
  const ability = SPEED_ABILITIES[side.ability];
  const item = SPEED_ITEMS[side.item];
  if (ability) {
    const byField =
      (ability.weather && field.weather === ability.weather) ||
      (ability.terrain && field.terrain === ability.terrain) ||
      (ability.booster && side.item === 'boosterenergy');
    const active = ability.status
      ? !!side.status
      : ability.toggle
        ? side.abilityOn
        : ability.highest
          ? byField && side.abilityOn
          : byField;
    if (active) effects.push({ kind: 'ability', id: side.ability, factor: ability.factor });
  }
  if (item && item.factor !== 1 && (!item.species || item.species === side.pokemon))
    effects.push({ kind: 'item', id: side.item, factor: item.factor });
  if (side.tailwind) effects.push({ kind: 'move', id: 'tailwind', factor: 2 });
  return effects;
}

// 4096 기준 고정소수. chainModify는 반올림하며 잇고, 적용은 절반을 내리는 반올림이다.
const chain = (a, b) => Math.floor((a * Math.round(b * 4096) + 2048) / 4096);
const applyModifier = (value, modifier) => Math.floor((value * modifier + 2047) / 4096);

export function finalSpeed(side, field, base) {
  if (!Number.isFinite(base)) return null;
  const stat = rawSpeed(base, side.points, side.nature);
  const staged = stageSpeed(stat, side.stage);
  const effects = speedEffects(side, field);
  const modifier = effects.reduce((m, e) => chain(m, e.factor), 4096);
  let speed = applyModifier(staged, modifier);
  const paralyzed = side.status === 'par' && side.ability !== 'quickfeet';
  if (paralyzed) speed = Math.floor(speed / 2);
  // 0.29 × 100이 28.999…가 되는 부동소수 오차를 내림 전에 걷어낸다.
  const multiplier = Number.isFinite(side.multiplier) && side.multiplier >= 0 ? side.multiplier : 1;
  if (multiplier !== 1) speed = Math.floor(speed * multiplier + 1e-9);
  return { stat, staged, effects, paralyzed, multiplier, speed };
}

// 누가 먼저 움직이는가. 같으면 매 턴 무작위다.
export const compareSpeed = (mine, theirs) =>
  mine === theirs ? 'tie' : mine > theirs ? 'faster' : 'slower';

// 샘플에서 계산기 칸으로. 스피드와 관계없는 도구·특성은 가져오지 않는다.
export function sideFromSample(sample, natureAdjust) {
  const [up, down] = natureAdjust(sample.nature);
  return {
    ...emptySide(),
    pokemon: sample.pokemon,
    points: sample.points?.[5] ?? 0,
    nature: up === 'Speed' ? 11 : down === 'Speed' ? 9 : 10,
    ability: SPEED_ABILITIES[toKey(sample.ability)] ? toKey(sample.ability) : '',
    item: SPEED_ITEMS[toKey(sample.item)] ? toKey(sample.item) : '',
  };
}
const toKey = name =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
