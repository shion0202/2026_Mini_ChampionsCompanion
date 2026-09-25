// 데미지 계산기의 계산. DOM 없이 값만 다루므로 node --test로 검사한다.
// 순서와 반올림은 Showdown 9세대(sim/battle-actions.ts의 getDamage·modifyDamage)를 따른다.
// 레벨 50 고정, 능력치는 챔피언스의 능력 포인트(0~32)로 계산한다. 설계는 docs/damage-calc.md.
import {
  BREAKABLE_ABILITIES,
  NO_PARENTAL_BOND,
  SHEER_FORCE_MOVES,
  SPREAD_MOVES,
} from './damage-catalog.js';
import { SPEED_ABILITIES, finalSpeed } from './speed-calc.js';

// ── 4096 기준 고정소수 ─────────────────────────────────────────────
// 배율은 모두 4096분의 정수로 다룬다(1.5배 = 6144).
// chain: 배율을 이어 곱할 때 반올림한다. applyMod: 값에 적용할 때 절반을 내린다.
const toMod = factor => Math.round(factor * 4096);
export const chain = (a, b) => Math.floor((a * b + 2048) / 4096);
export const applyMod = (value, mods) => Math.floor((value * mods + 2047) / 4096);
const chainAll = mods => mods.reduce(chain, 4096);

// Showdown이 배율을 소수가 아니라 4096분의 수로 적는 것들. 1.3을 그대로 4096배 하면
// 5325가 아니라 5324.8이 반올림돼 5325가 되지만, 생명의구슬은 5324로 정해져 있다.
export const MOD = {
  x1_1: 4505,
  punchingGlove: 4506,
  x1_2: 4915,
  x1_25: 5120,
  x1_3: 5325,
  lifeOrb: 5324,
  aura: 5448,
  x1_5: 6144,
  x2: 8192,
  x0_25: 1024,
  x0_5: 2048,
  x0_75: 3072,
  screenDoubles: 2732,
};

// ── 능력치 ────────────────────────────────────────────────────────
export const hpStat = (base, points) => base + clamp(points, 0, 32) + 75;
export const stat = (base, points, nature = 10) =>
  Math.floor(((base + clamp(points, 0, 32) + 20) * nature) / 10);
export function stageStat(value, stage) {
  const n = clamp(stage, -6, 6);
  return n >= 0 ? Math.floor((value * (2 + n)) / 2) : Math.floor((value * 2) / (2 - n));
}
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
// 남은 HP 비율(1~100)을 실제 HP로. 1은 남긴다.
export const hpFromPercent = (hpMax, percent) =>
  Math.max(1, Math.floor((hpMax * clamp(percent ?? 100, 1, 100)) / 100));

// ── 기술의 예외 ───────────────────────────────────────────────────
// 공격·방어에 쓰는 능력치가 기술 분류와 다른 것.
export const MOVE_STATS = {
  psyshock: { defense: 'def' },
  psystrike: { defense: 'def' },
  secretsword: { defense: 'def' },
  bodypress: { attack: 'def' },
  foulplay: { attack: 'atk', attackFrom: 'defender' },
};

// 항상 급소에 맞는 기술
export const ALWAYS_CRIT = new Set([
  'flowertrick',
  'frostbreath',
  'stormthrow',
  'wickedblow',
  'surgingstrikes',
]);
// 상대의 방어 랭크를 무시하는 기술
export const IGNORE_DEFENSE_STAGES = new Set(['sacredsword', 'darkestlariat', 'chipaway']);
// 빗나가면 자신이 다치는 기술. 이판사판이 반동기처럼 강화한다.
export const CRASH_MOVES = new Set(['highjumpkick', 'jumpkick', 'supercellslam', 'axekick']);
// 벽을 깨고 때리는 기술. 리플렉터·빛의장막·오로라베일을 받지 않는다.
export const BREAKS_SCREENS = new Set(['brickbreak', 'psychicfangs', 'ragingbull']);
// 상대가 상태이상이면 위력이 두 배인 기술
export const STATUS_DOUBLES = new Set(['hex', 'infernalparade']);
// 필드가 없으면 실패하는 기술
export const NEEDS_TERRAIN = new Set(['steelroller']);
// 레벨만큼 데미지를 주는 기술(레벨 50)
export const LEVEL_DAMAGE = new Set(['seismictoss', 'nightshade']);
// 맞으면 쓰러뜨리는 기술(일격필살)
export const OHKO_MOVES = new Set(['fissure', 'guillotine', 'horndrill', 'sheercold']);
// 타수가 정해진 연속기. 나머지 연속기(multihit)는 2~5회라 2회로 두고, 스킬링크면 5회다.
export const FIXED_HITS = {
  doublehit: 2,
  dualwingbeat: 2,
  dragondarts: 2,
  twinbeam: 2,
  bonemerang: 2,
  doublekick: 2,
  dualchop: 2,
  geargrind: 2,
  tachyoncutter: 2,
  tripledive: 3,
  surgingstrikes: 3,
  tripleaxel: 3,
  populationbomb: 10,
};
const isMultiHit = move => !!FIXED_HITS[move.id] || (move.traits ?? []).includes('multihit');
export const defaultHits = (move, ability) =>
  FIXED_HITS[move.id] ?? (isMultiHit(move) ? (ability === 'skilllink' ? 5 : 2) : 1);

// 기술 위력이 상황에 따라 바뀌는 기술과 그 조건. 화면은 이 표로 입력 칸을 보인다.
//  toggle  사람이 켜는 조건(attacker[키])   count  세는 값(attacker[키])
//  hp      공격 측 남은 HP   speed  두 쪽 스피드   weight  두 쪽 무게(자동)
export const MOVE_CONDITIONS = {
  payback: { toggle: 'movesLast' },
  avalanche: { toggle: 'wasHit' },
  assurance: { toggle: 'targetHurt' },
  stompingtantrum: { toggle: 'lastFailed' },
  temperflare: { toggle: 'lastFailed' },
  lashout: { toggle: 'statsLowered' },
  round: { toggle: 'allyRound' },
  ficklebeam: { toggle: 'fickle' },
  ragefist: { count: 'timesHit' },
  lastrespects: { count: 'fainted' },
  powertrip: { count: 'boostTotal' },
  storedpower: { count: 'boostTotal' },
  eruption: { hp: true },
  waterspout: { hp: true },
  flail: { hp: true },
  reversal: { hp: true },
  gyroball: { speed: true },
  electroball: { speed: true },
  heavyslam: { weight: true },
  heatcrash: { weight: true },
  lowkick: { weight: true },
  grassknot: { weight: true },
};
// 특성의 조건. 위와 같은 모양이다.
export const ABILITY_CONDITIONS = {
  analytic: { toggle: 'movesLast' },
  stakeout: { toggle: 'targetSwitched' },
  supremeoverlord: { count: 'fainted' },
  overgrow: { hp: true },
  blaze: { hp: true },
  torrent: { hp: true },
  swarm: { hp: true },
  defeatist: { hp: true },
};

// ── 특성·도구 ─────────────────────────────────────────────────────
// 노말 기술의 타입을 바꾸고 위력을 1.2배로 올리는 특성
export const TYPE_CHANGERS = {
  aerilate: 'Flying',
  pixilate: 'Fairy',
  refrigerate: 'Ice',
  galvanize: 'Electric',
  dragonize: 'Dragon',
};
// 타입을 바꾸는 특성이 손대지 않는 기술(스스로 타입을 정한다)
const NO_TYPE_CHANGE = new Set([
  'judgment',
  'multiattack',
  'naturalgift',
  'revelationdance',
  'technoblast',
  'terrainpulse',
  'weatherball',
]);
// 방어 측 특성으로 막히는 타입과 기술 성질
const ABILITY_IMMUNE_TYPES = {
  flashfire: 'Fire',
  wellbakedbody: 'Fire',
  waterabsorb: 'Water',
  stormdrain: 'Water',
  dryskin: 'Water',
  voltabsorb: 'Electric',
  lightningrod: 'Electric',
  motordrive: 'Electric',
  sapsipper: 'Grass',
  eartheater: 'Ground',
};
const ABILITY_IMMUNE_TRAITS = { bulletproof: 'bullet', soundproof: 'sound', windrider: 'wind' };
// 방어 측 특성을 무시하고 때리는 특성
const MOLD_BREAKERS = new Set(['moldbreaker', 'teravolt', 'turboblaze']);
// 날씨를 없애는 특성
const WEATHER_SUPPRESSORS = new Set(['cloudnine', 'airlock']);
// 대장의징표. 쓰러진 아군 수(최대 5)에 따라 위력이 오른다.
const OVERLORD = [4096, 4506, 4915, 5325, 5734, 6144];

// 위력에 거는 배율(onBasePower). 순서는 검산 기준(@smogon/calc)과 같게 둔다.
export function basePowerMods(ctx) {
  const { move, attacker, defender, field, attackerGrounded, defenderGrounded } = ctx;
  const mods = [];
  const a = attacker.ability;
  const traits = move.traits ?? [];
  const poisoned = ['psn', 'tox'].includes(defender.status);
  // 기술 자체의 배율. 객기는 잠듦이면 오르지 않는다.
  if (
    (move.id === 'facade' && attacker.status && attacker.status !== 'slp') ||
    (['venoshock', 'barbbarrage'].includes(move.id) && poisoned) ||
    (move.id === 'lashout' && attacker.statsLowered) ||
    (move.id === 'ficklebeam' && attacker.fickle)
  )
    mods.push(MOD.x2);
  if (move.id === 'expandingforce' && field.terrain === 'psychic' && attackerGrounded)
    mods.push(MOD.x1_5);
  if (
    (move.id === 'knockoff' && ctx.knockable) ||
    (move.id === 'mistyexplosion' && field.terrain === 'misty' && attackerGrounded)
  )
    mods.push(MOD.x1_5);
  if (
    ['solarbeam', 'solarblade'].includes(move.id) &&
    ['rain', 'sand', 'snow'].includes(ctx.moveWeather)
  )
    mods.push(MOD.x0_5);
  if (field.format === 'doubles' && attacker.helpingHand) mods.push(MOD.x1_5);
  // 필드. 공격 측이 땅에 붙어 있어야 오르고, 미스트필드는 땅에 붙은 상대에게 드래곤을 줄인다.
  const terrainType = { electric: 'Electric', grassy: 'Grass', psychic: 'Psychic' }[field.terrain];
  if (terrainType && move.type === terrainType && attackerGrounded) mods.push(MOD.x1_3);
  if (
    defenderGrounded &&
    ((field.terrain === 'misty' && move.type === 'Dragon') ||
      (field.terrain === 'grassy' && ['earthquake', 'bulldoze'].includes(move.id)))
  )
    mods.push(MOD.x0_5);
  if (
    (a === 'technician' && ctx.basePower <= 60) ||
    (a === 'megalauncher' && traits.includes('pulse')) ||
    (a === 'strongjaw' && traits.includes('bite')) ||
    (a === 'sharpness' && traits.includes('slicing'))
  )
    mods.push(MOD.x1_5);
  if (attacker.charge && move.type === 'Electric') mods.push(MOD.x2);
  // 페어리오라·다크오라는 어느 쪽이 가져도 걸린다. 오라브레이크가 있으면 오히려 줄인다.
  const aura = { Fairy: 'fairyaura', Dark: 'darkaura' }[move.type];
  if (aura && [a, defender.ability].includes(aura))
    mods.push([a, defender.ability].includes('aurabreak') ? MOD.x0_75 : MOD.aura);
  if (
    (a === 'sheerforce' && SHEER_FORCE_MOVES.has(move.id)) ||
    (a === 'sandforce' &&
      field.weather === 'sand' &&
      ['Rock', 'Ground', 'Steel'].includes(move.type)) ||
    (a === 'analytic' && attacker.movesLast) ||
    (a === 'toughclaws' && ctx.contact) ||
    (a === 'punkrock' && traits.includes('sound'))
  )
    mods.push(MOD.x1_3);
  if (move.typeChanged) mods.push(MOD.x1_2);
  if (
    (a === 'reckless' && (traits.includes('recoil') || CRASH_MOVES.has(move.id))) ||
    (a === 'ironfist' && traits.includes('punch'))
  )
    mods.push(MOD.x1_2);
  if (
    (a === 'toxicboost' && ctx.physical && ['psn', 'tox'].includes(attacker.status)) ||
    (a === 'flareboost' && !ctx.physical && attacker.status === 'brn')
  )
    mods.push(MOD.x1_5);
  if (defender.ability === 'dryskin' && move.type === 'Fire') mods.push(MOD.x1_25);
  if (a === 'supremeoverlord' && attacker.fainted > 0)
    mods.push(OVERLORD[Math.min(5, attacker.fainted)]);
  if (TYPE_BOOST_ITEMS[attacker.item] === move.type) mods.push(MOD.x1_2);
  else if (
    (attacker.item === 'muscleband' && ctx.physical) ||
    (attacker.item === 'wiseglasses' && !ctx.physical)
  )
    mods.push(MOD.x1_1);
  if (attacker.item === 'punchingglove' && traits.includes('punch')) mods.push(MOD.punchingGlove);
  return mods;
}

// 공격 능력치에 거는 배율(onModifyAtk/SpA). 방어 측 특성이 줄이는 것(onSourceModifyAtk)도 여기다.
export function attackMods(ctx) {
  const { attacker, defender, field, physical, move } = ctx;
  const mods = [];
  const a = attacker.ability;
  const type = move.type;
  if (physical && (a === 'hugepower' || a === 'purepower')) mods.push(MOD.x2);
  if (physical && a === 'guts' && attacker.status) mods.push(MOD.x1_5);
  if (!physical && a === 'solarpower' && field.weather === 'sun') mods.push(MOD.x1_5);
  if (physical && a === 'gorillatactics') mods.push(MOD.x1_5);
  const pinch = { overgrow: 'Grass', blaze: 'Fire', torrent: 'Water', swarm: 'Bug' }[a];
  if (pinch === type && ctx.attackerHp <= ctx.attackerHpMax / 3) mods.push(MOD.x1_5);
  if (a === 'defeatist' && ctx.attackerHp <= ctx.attackerHpMax / 2) mods.push(MOD.x0_5);
  if (
    (a === 'firemane' && type === 'Fire') ||
    (a === 'dragonsmaw' && type === 'Dragon') ||
    (a === 'rockypayload' && type === 'Rock') ||
    (a === 'steelworker' && type === 'Steel')
  )
    mods.push(MOD.x1_5);
  if (a === 'transistor' && type === 'Electric') mods.push(MOD.x1_3);
  if ((a === 'waterbubble' && type === 'Water') || (a === 'stakeout' && attacker.targetSwitched))
    mods.push(MOD.x2);
  const d = defender.ability;
  if (
    (d === 'thickfat' && (type === 'Fire' || type === 'Ice')) ||
    (d === 'waterbubble' && type === 'Fire') ||
    (d === 'purifyingsalt' && type === 'Ghost') ||
    (d === 'heatproof' && type === 'Fire')
  )
    mods.push(MOD.x0_5);
  if (physical && attacker.item === 'choiceband') mods.push(MOD.x1_5);
  if (!physical && attacker.item === 'choicespecs') mods.push(MOD.x1_5);
  if (attacker.item === 'lightball' && ctx.attackerSpecies.baseSpecies === 'Pikachu')
    mods.push(MOD.x2);
  return mods;
}

// 방어 능력치에 거는 배율(onModifyDef/SpD)
export function defenseMods(ctx) {
  const { defender, field, usesDef, defenderTypes } = ctx;
  const mods = [];
  if (!usesDef && defender.item === 'assaultvest') mods.push(MOD.x1_5);
  // 진화의휘석은 아직 진화할 수 있는 포켓몬만 받는다(nfe).
  if (defender.item === 'eviolite' && defender.nfe) mods.push(MOD.x1_5);
  if (usesDef && defender.ability === 'furcoat') mods.push(MOD.x2);
  if (usesDef && defender.ability === 'marvelscale' && defender.status) mods.push(MOD.x1_5);
  if (usesDef && defender.ability === 'grasspelt' && field.terrain === 'grassy')
    mods.push(MOD.x1_5);
  return { mods, weather: weatherDefense(field.weather, defenderTypes, usesDef) };
}
// 날씨로 오르는 방어는 다른 배율과 잇지 않고 능력치에 먼저 적용한다(Showdown과 같다).
const weatherDefense = (weather, types, usesDef) =>
  (weather === 'sand' && !usesDef && types.includes('Rock')) ||
  (weather === 'snow' && usesDef && types.includes('Ice'))
    ? MOD.x1_5
    : 0;

// 마지막 배율(onModifyDamage). full은 방어 측 HP가 가득인지(멀티스케일),
// fresh는 싸움의 첫 타격인지(반감 열매는 한 번 먹으면 없다)다.
export function finalMods(ctx, full = true, fresh = true) {
  const { attacker, defender, field, move, effectiveness, crit, physical } = ctx;
  const mods = [];
  const doubles = field.format === 'doubles';
  // 벽. 급소면 무시한다. 오로라베일은 리플렉터·빛의장막과 겹치지 않는다.
  const wall = physical ? defender.reflect : defender.lightScreen;
  if (
    !crit &&
    attacker.ability !== 'infiltrator' &&
    !BREAKS_SCREENS.has(move.id) &&
    (wall || defender.auroraVeil)
  )
    mods.push(doubles ? MOD.screenDoubles : MOD.x0_5);
  if (attacker.ability === 'sniper' && crit) mods.push(MOD.x1_5);
  if (attacker.ability === 'tintedlens' && effectiveness < 1) mods.push(MOD.x2);
  if (full && ['multiscale', 'shadowshield'].includes(defender.ability)) mods.push(MOD.x0_5);
  if (defender.ability === 'fluffy' && ctx.contact) mods.push(MOD.x0_5);
  else if (defender.ability === 'punkrock' && (move.traits ?? []).includes('sound'))
    mods.push(MOD.x0_5);
  if (['filter', 'solidrock', 'prismarmor'].includes(defender.ability) && effectiveness > 1)
    mods.push(MOD.x0_75);
  if (defender.ability === 'icescales' && !physical) mods.push(MOD.x0_5);
  if (doubles && defender.friendGuard) mods.push(MOD.x0_75);
  if (defender.ability === 'fluffy' && move.type === 'Fire') mods.push(MOD.x2);
  if (attacker.item === 'expertbelt' && effectiveness > 1) mods.push(MOD.x1_2);
  if (attacker.item === 'lifeorb') mods.push(MOD.lifeOrb);
  // 반감 열매. 노말은 치리열매(chilanberry)가 효과가 평범해도 발동한다. 숙성은 한 번 더 줄인다.
  const berry = RESIST_BERRIES[defender.item];
  if (fresh && berry === move.type && (effectiveness > 1 || berry === 'Normal'))
    mods.push(defender.ability === 'ripen' ? MOD.x0_25 : MOD.x0_5);
  return mods;
}

export const TYPE_BOOST_ITEMS = {
  silkscarf: 'Normal',
  blackbelt: 'Fighting',
  sharpbeak: 'Flying',
  poisonbarb: 'Poison',
  softsand: 'Ground',
  hardstone: 'Rock',
  silverpowder: 'Bug',
  spelltag: 'Ghost',
  metalcoat: 'Steel',
  charcoal: 'Fire',
  mysticwater: 'Water',
  miracleseed: 'Grass',
  magnet: 'Electric',
  twistedspoon: 'Psychic',
  nevermeltice: 'Ice',
  dragonfang: 'Dragon',
  blackglasses: 'Dark',
  fairyfeather: 'Fairy',
  flameplate: 'Fire',
  splashplate: 'Water',
  zapplate: 'Electric',
  meadowplate: 'Grass',
  icicleplate: 'Ice',
  fistplate: 'Fighting',
  toxicplate: 'Poison',
  earthplate: 'Ground',
  skyplate: 'Flying',
  mindplate: 'Psychic',
  insectplate: 'Bug',
  stoneplate: 'Rock',
  spookyplate: 'Ghost',
  dracoplate: 'Dragon',
  dreadplate: 'Dark',
  ironplate: 'Steel',
  pixieplate: 'Fairy',
  seaincense: 'Water',
  waveincense: 'Water',
  roseincense: 'Grass',
  rockincense: 'Rock',
  oddincense: 'Psychic',
};

export const RESIST_BERRIES = {
  occaberry: 'Fire',
  passhoberry: 'Water',
  wacanberry: 'Electric',
  rindoberry: 'Grass',
  yacheberry: 'Ice',
  chopleberry: 'Fighting',
  kebiaberry: 'Poison',
  shucaberry: 'Ground',
  cobaberry: 'Flying',
  payapaberry: 'Psychic',
  tangaberry: 'Bug',
  chartiberry: 'Rock',
  kasibberry: 'Ghost',
  habanberry: 'Dragon',
  colburberry: 'Dark',
  babiriberry: 'Steel',
  roseliberry: 'Fairy',
  chilanberry: 'Normal',
};

// ── 상성 ──────────────────────────────────────────────────────────
// chart[방어 타입][공격 타입] = 배율. 두 타입의 배율을 곱한다.
// 프리즈드라이는 물 타입에 효과가 굉장하다.
export const effectivenessOf = (chart, moveType, defenderTypes, moveId = '') =>
  defenderTypes.reduce(
    (m, t) => m * (moveId === 'freezedry' && t === 'Water' ? 2 : (chart?.[t]?.[moveType] ?? 1)),
    1,
  );

// 기술 하나의 상성. 무효를 넘는 경우(배짱·쇠구슬)와 플라잉프레스를 더한다.
function moveEffectiveness(chart, move, types, attacker, defenderGrounded) {
  let m = 1;
  for (const t of types) {
    let factor = move.id === 'freezedry' && t === 'Water' ? 2 : (chart?.[t]?.[move.type] ?? 1);
    if (factor === 0) {
      // 쇠구슬로 땅에 붙은 비행 타입에게 땅 기술은 보통으로 맞는다.
      if (move.type === 'Ground' && defenderGrounded) factor = 1;
      // 배짱은 노말·격투 기술로 고스트를 칠 수 있다.
      if (
        t === 'Ghost' &&
        ['Normal', 'Fighting'].includes(move.type) &&
        ['scrappy', 'mindseye'].includes(attacker.ability)
      )
        factor = 1;
    }
    m *= factor;
  }
  if (move.id === 'flyingpress') m *= effectivenessOf(chart, 'Flying', types);
  // 부유·전자부유·풍선은 땅 기술을 받지 않는다.
  if (move.type === 'Ground' && !defenderGrounded) m = 0;
  return m;
}

// 땅에 붙어 있는가(Showdown의 isGrounded). 쇠구슬이 먼저, 다음이 비행 타입·부유·풍선.
export function grounded(species, side) {
  if (side.item === 'ironball') return true;
  if (species.types.includes('Flying')) return false;
  if (side.ability === 'levitate' || side.ability === 'eelevate') return false;
  return side.item !== 'airballoon';
}

// 무게(100g 단위). 헤비메탈은 두 배, 라이트메탈은 절반.
export function weightOf(species, ability) {
  let hg = Math.round((species.weight ?? 0) * 10);
  if (ability === 'heavymetal') hg *= 2;
  else if (ability === 'lightmetal') hg = Math.trunc(hg / 2);
  return Math.max(1, hg);
}

// 자이로볼·일렉트릭볼이 보는 스피드. 스피드 계산기와 같은 식이다.
export function speedOf(side, species, field) {
  const ability = SPEED_ABILITIES[side.ability];
  return finalSpeed(
    {
      points: side.points?.spe ?? 0,
      nature: side.nature?.spe ?? 10,
      stage: side.stages?.spe ?? 0,
      ability: side.ability,
      item: side.item,
      abilityOn: !ability?.toggle,
      status: side.status,
      tailwind: false,
      multiplier: 1,
    },
    field,
    species.stats.spe,
  ).speed;
}

// ── 기술을 정한다 ─────────────────────────────────────────────────
// 타입·분류·기본 위력이 날씨·필드·특성으로 바뀐다. 사람이 위력을 넣었으면 위력은 그것이다.
function resolveMove(raw, env) {
  const { attacker, moveWeather, field, attackerGrounded } = env;
  let type = raw.type;
  let power = raw.power;
  let typeChanged = false;
  if (raw.id === 'weatherball' && moveWeather) {
    type = { sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice' }[moveWeather];
    power *= 2;
  }
  if (raw.id === 'terrainpulse' && field.terrain && attackerGrounded) {
    type = { electric: 'Electric', grassy: 'Grass', misty: 'Fairy', psychic: 'Psychic' }[
      field.terrain
    ];
    power *= 2;
  }
  if (raw.id === 'ragingbull')
    type =
      {
        taurospaldeacombat: 'Fighting',
        taurospaldeablaze: 'Fire',
        taurospaldeaaqua: 'Water',
      }[attacker.pokemon] ?? type;
  if (raw.id === 'aurawheel' && attacker.pokemon === 'morpekohangry') type = 'Dark';
  const a = attacker.ability;
  if (!NO_TYPE_CHANGE.has(raw.id)) {
    if (a === 'normalize') {
      type = 'Normal';
      typeChanged = true;
    } else if (TYPE_CHANGERS[a] && type === 'Normal') {
      type = TYPE_CHANGERS[a];
      typeChanged = true;
    }
  }
  if (a === 'liquidvoice' && (raw.traits ?? []).includes('sound')) type = 'Water';
  if (attacker.moveType) type = attacker.moveType;
  return { ...raw, type, power, typeChanged };
}

// 셸사이드암. 물리로 쳤을 때가 더 아프면 물리 기술이 된다. 같으면 Showdown은 무작위라
// 내림하기 전의 비율로 정한다(@smogon/calc와 같다).
function shellSideArmCategory(attack, defense) {
  const hit = (a, d) => Math.floor(Math.floor(Math.floor(22 * 90 * a) / d) / 50);
  const physical = hit(attack.atk, defense.def);
  const special = hit(attack.spa, defense.spd);
  if (physical !== special) return physical > special ? 'Physical' : 'Special';
  return attack.atk / defense.def > attack.spa / defense.spd ? 'Physical' : 'Special';
}

// 위력이 상황으로 정해지는 기술(basePowerCallback). hit는 몇 번째 타격인지(트리플악셀).
// null이면 위력을 정할 수 없다(사람이 넣어야 한다).
function variablePower(move, env, hit) {
  const { attacker, defender } = env;
  const bp = move.power;
  switch (move.id) {
    case 'hex':
    case 'infernalparade':
      return defender.status ? bp * 2 : bp;
    case 'acrobatics':
      return attacker.item ? bp : bp * 2;
    case 'eruption':
    case 'waterspout':
      return Math.max(1, Math.floor((bp * env.attackerHp) / env.attackerHpMax));
    case 'flail':
    case 'reversal': {
      const ratio = Math.max(Math.floor((env.attackerHp * 48) / env.attackerHpMax), 1);
      return ratio < 2
        ? 200
        : ratio < 5
          ? 150
          : ratio < 10
            ? 100
            : ratio < 17
              ? 80
              : ratio < 33
                ? 40
                : 20;
    }
    case 'gyroball':
      return Math.min(150, Math.floor((25 * env.speeds.defender) / env.speeds.attacker) + 1);
    case 'electroball':
      return [40, 60, 80, 120, 150][
        Math.min(4, Math.floor(env.speeds.attacker / env.speeds.defender))
      ];
    case 'heavyslam':
    case 'heatcrash': {
      const { attacker: mine, defender: theirs } = env.weights;
      return mine >= theirs * 5
        ? 120
        : mine >= theirs * 4
          ? 100
          : mine >= theirs * 3
            ? 80
            : mine >= theirs * 2
              ? 60
              : 40;
    }
    case 'lowkick':
    case 'grassknot': {
      const w = env.weights.defender;
      return w >= 2000 ? 120 : w >= 1000 ? 100 : w >= 500 ? 80 : w >= 250 ? 60 : w >= 100 ? 40 : 20;
    }
    case 'hardpress':
      return (
        Math.floor(
          Math.floor(
            (100 * (100 * Math.floor((env.defenderHp * 4096) / env.defenderHpMax)) + 2047) / 4096,
          ) / 100,
        ) || 1
      );
    case 'ragefist':
      return Math.min(350, 50 + 50 * clamp(attacker.timesHit ?? 0, 0, 6));
    case 'lastrespects':
      return 50 + 50 * clamp(attacker.fainted ?? 0, 0, 5);
    case 'powertrip':
    case 'storedpower':
      return bp + 20 * clamp(attacker.boostTotal ?? 0, 0, 42);
    case 'risingvoltage':
      return env.field.terrain === 'electric' && env.defenderGrounded ? bp * 2 : bp;
    case 'payback':
      return attacker.movesLast ? bp * 2 : bp;
    case 'avalanche':
      return attacker.wasHit ? bp * 2 : bp;
    case 'assurance':
      return attacker.targetHurt ? bp * 2 : bp;
    case 'stompingtantrum':
    case 'temperflare':
      return attacker.lastFailed ? bp * 2 : bp;
    case 'round':
      return attacker.allyRound ? bp * 2 : bp;
    case 'tripleaxel':
      return 20 * hit;
    default:
      return bp || null;
  }
}

// ── 한 번의 계산 ───────────────────────────────────────────────────
// 반환: { rolls: 첫 타격의 데미지 16개, rollsAt(타격, 가득, 첫 타격), hits, effectiveness, ... }
// 또는 { immune } · { blocked } · { status } · { noPower } · { ohko }
export function damageRolls(input) {
  const { reference, move: rawMove } = input;
  const attackerSpecies = reference.species[input.attacker.pokemon];
  const defenderSpecies = reference.species[input.defender.pokemon];
  if (!attackerSpecies || !defenderSpecies || !rawMove) return null;
  if (rawMove.category === 'Status') return { status: true };
  const attacker = input.attacker;
  // 틀깨기류는 방어 측 특성 가운데 막을 수 있는 것을 없는 셈 친다.
  const defender =
    MOLD_BREAKERS.has(attacker.ability) && BREAKABLE_ABILITIES.has(input.defender.ability)
      ? { ...input.defender, ability: '' }
      : input.defender;
  const suppressed = [attacker.ability, defender.ability].some(a => WEATHER_SUPPRESSORS.has(a));
  const field = { ...input.field, weather: suppressed ? '' : (input.field.weather ?? '') };
  // 메가솔라는 자신의 기술에 늘 쾌청을 적용한다(날씨 배율·웨더볼·솔라빔).
  const moveWeather = attacker.ability === 'megasol' ? 'sun' : field.weather;
  const attackerGrounded = grounded(attackerSpecies, attacker);
  const defenderGrounded = grounded(defenderSpecies, defender);
  const attackerHpMax = hpStat(attackerSpecies.stats.hp, attacker.points?.hp ?? 0);
  const defenderHpMax = hpStat(defenderSpecies.stats.hp, defender.points?.hp ?? 0);
  const env = {
    attacker,
    defender,
    field,
    moveWeather,
    attackerGrounded,
    defenderGrounded,
    attackerHpMax,
    attackerHp: hpFromPercent(attackerHpMax, attacker.hpPercent),
    defenderHpMax,
    defenderHp: hpFromPercent(defenderHpMax, defender.hpPercent),
  };
  const move = resolveMove(rawMove, env);
  // 도감의 배열을 건드리지 않도록 복사해 둔다(셸사이드암이 접촉을 더한다).
  const traits = [...(move.traits ?? [])];
  move.traits = traits;

  // 쓰는 능력치. 셸사이드암은 두 쪽 능력치를 견줘 분류를 정한다.
  const statOf = (side, species, key) =>
    stageStat(
      stat(species.stats[key], side.points?.[key] ?? 0, side.nature?.[key] ?? 10),
      side.stages?.[key] ?? 0,
    );
  if (move.id === 'shellsidearm') {
    const mine = key => statOf(attacker, attackerSpecies, key);
    const theirs = key => statOf(defender, defenderSpecies, key);
    move.category = shellSideArmCategory(
      { atk: mine('atk'), spa: mine('spa') },
      { def: theirs('def'), spd: theirs('spd') },
    );
    if (move.category === 'Physical') traits.push('contact');
  }
  const physical = move.category === 'Physical';
  // 펀치글러브를 끼면 펀치 기술이 접촉하지 않는다.
  const contact =
    traits.includes('contact') && !(attacker.item === 'punchingglove' && traits.includes('punch'));
  const special = MOVE_STATS[move.id] ?? {};
  const usesDef = special.defense ? special.defense === 'def' : physical;
  const attackerTypes = attackerSpecies.types;
  const defenderTypes = defenderSpecies.types;
  const effectiveness = moveEffectiveness(
    reference.types,
    move,
    defenderTypes,
    attacker,
    defenderGrounded,
  );
  const base = { effectiveness, moveType: move.type, category: move.category };
  if (effectiveness === 0) return { ...base, immune: true };
  // 특성으로 막히는 기술(타오르는불꽃·저수·피뢰침·방탄·방음 등). 불가사의부적은 약점만 맞는다.
  const d = defender.ability;
  if (
    ABILITY_IMMUNE_TYPES[d] === move.type ||
    traits.includes(ABILITY_IMMUNE_TRAITS[d]) ||
    (d === 'wonderguard' && effectiveness <= 1)
  )
    return { ...base, immune: true, byAbility: d };
  // 사이코필드에서는 땅에 붙은 상대에게 선제기가 막힌다.
  if (field.terrain === 'psychic' && move.priority > 0 && defenderGrounded)
    return { ...base, blocked: true };
  if (NEEDS_TERRAIN.has(move.id) && !field.terrain) return { ...base, blocked: true };
  // 폴터가이스트는 도구가 없는 상대에게 실패한다.
  if (move.id === 'poltergeist' && !defender.item) return { ...base, blocked: true };
  if (OHKO_MOVES.has(move.id)) return { ...base, ohko: true, sturdy: d === 'sturdy' };

  const hits = attacker.hits > 0 ? Math.floor(attacker.hits) : defaultHits(move, attacker.ability);
  const spreadHit = field.format === 'doubles' && !!field.spread;
  // 부자유친. 한 번 때리는 기술을 두 번 때리고, 두 번째는 1/4이다.
  const parentalBond =
    attacker.ability === 'parentalbond' &&
    hits === 1 &&
    !isMultiHit(move) &&
    !spreadHit &&
    !NO_PARENTAL_BOND.has(move.id);
  const hitCount = parentalBond ? 2 : hits;

  // 고정 데미지(지구던지기·나이트헤드). 배율을 받지 않는다.
  if (LEVEL_DAMAGE.has(move.id) || move.id === 'superfang' || move.id === 'finalgambit') {
    const fixed =
      move.id === 'superfang'
        ? Math.max(1, Math.floor(env.defenderHp / 2))
        : move.id === 'finalgambit'
          ? env.attackerHp
          : 50;
    const rolls = Array(16).fill(fixed);
    return { ...base, fixed, rolls, hits: hitCount, rollsAt: () => rolls, crit: false };
  }

  const crit =
    (!!input.crit || ALWAYS_CRIT.has(move.id)) && !['shellarmor', 'battlearmor'].includes(d);
  const speedsNeeded = MOVE_CONDITIONS[move.id]?.speed;
  env.speeds = speedsNeeded && {
    attacker: speedOf(attacker, attackerSpecies, field),
    defender: speedOf(defender, defenderSpecies, field),
  };
  env.weights = MOVE_CONDITIONS[move.id]?.weight && {
    attacker: weightOf(attackerSpecies, attacker.ability),
    defender: weightOf(defenderSpecies, defender.ability),
  };

  // 탁쳐서떨구기는 떨굴 수 있는 도구가 있으면 1.5배. 자기 메가스톤은 떨굴 수 없다.
  const heldItem = reference.held_item?.[defender.item];
  const knockable =
    !!defender.item &&
    !(
      heldItem?.megaStone &&
      reference.species[heldItem.megaStone]?.baseSpecies === defenderSpecies.baseSpecies
    );

  // 공격 능력치. 급소는 공격 측의 불리한 랭크와 방어 측의 유리한 랭크를 무시한다.
  // 천진은 상대의 랭크를 보지 않는다.
  const attackKey = special.attack ?? (physical ? 'atk' : 'spa');
  const source = special.attackFrom === 'defender' ? defender : attacker;
  const sourceSpecies = special.attackFrom === 'defender' ? defenderSpecies : attackerSpecies;
  const ctx = {
    move,
    attacker,
    defender,
    field,
    moveWeather,
    physical,
    usesDef,
    contact,
    defenderTypes,
    crit,
    effectiveness,
    attackerGrounded,
    defenderGrounded,
    attackerSpecies,
    attackerHp: env.attackerHp,
    attackerHpMax,
    knockable,
  };
  let attackStat = stat(
    sourceSpecies.stats[attackKey],
    source.points?.[attackKey] ?? 0,
    source.nature?.[attackKey] ?? 10,
  );
  let attackStage = source.stages?.[attackKey] ?? 0;
  if (crit && attackStage < 0) attackStage = 0;
  if (d === 'unaware') attackStage = 0;
  attackStat = stageStat(attackStat, attackStage);
  // 의욕은 다른 배율과 잇지 않고 먼저 곱한다(Showdown의 this.modify).
  if (physical && attacker.ability === 'hustle') attackStat = applyMod(attackStat, MOD.x1_5);
  attackStat = applyMod(attackStat, chainAll(attackMods(ctx)));

  // 방어 능력치
  const defenseKey = usesDef ? 'def' : 'spd';
  let defenseStat = stat(
    defenderSpecies.stats[defenseKey],
    defender.points?.[defenseKey] ?? 0,
    defender.nature?.[defenseKey] ?? 10,
  );
  let defenseStage = defender.stages?.[defenseKey] ?? 0;
  if (
    (crit && defenseStage > 0) ||
    IGNORE_DEFENSE_STAGES.has(move.id) ||
    attacker.ability === 'unaware'
  )
    defenseStage = 0;
  defenseStat = stageStat(defenseStat, defenseStage);
  const { mods: defMods, weather } = defenseMods(ctx);
  if (weather) defenseStat = applyMod(defenseStat, weather);
  defenseStat = Math.max(1, applyMod(defenseStat, chainAll(defMods)));

  // 위력. 사람이 넣었으면 그대로, 아니면 기술의 조건으로 정한 뒤 배율을 잇는다.
  const powerOf = (hit, fresh) => {
    const raw = attacker.power > 0 ? attacker.power : variablePower(move, env, hit);
    if (!raw) return null;
    const floored = Math.max(1, Math.floor(raw));
    return Math.max(
      1,
      applyMod(
        floored,
        chainAll(basePowerMods({ ...ctx, basePower: floored, knockable: knockable && fresh })),
      ),
    );
  };
  const basePower = powerOf(1, true);
  if (!basePower) return { ...base, noPower: true };

  const stab =
    attackerTypes.includes(move.type) || ['protean', 'libero'].includes(attacker.ability)
      ? attacker.ability === 'adaptability' && attackerTypes.includes(move.type)
        ? 2
        : 1.5
      : 1;
  const burned =
    attacker.status === 'brn' && physical && attacker.ability !== 'guts' && move.id !== 'facade';
  const weatherMod = weatherDamage(moveWeather, move.type);

  // 타격 하나의 난수 16개. hit는 1부터, full은 방어 측 HP가 가득인지, fresh는 싸움의 첫 타격인지.
  const cache = new Map();
  const rollsAt = (hit, full, fresh) => {
    const key = `${hit}|${full}|${fresh}`;
    if (cache.has(key)) return cache.get(key);
    // 부자유친의 두 번째 타격은 첫 타격 뒤라 떨굴 도구도 먹을 열매도 이미 없다.
    const first = fresh && hit === 1;
    const power = hit === 1 && first ? basePower : powerOf(hit, first);
    let dmg = Math.floor(Math.floor((22 * power * attackStat) / defenseStat) / 50) + 2;
    if (spreadHit) dmg = applyMod(dmg, MOD.x0_75);
    else if (parentalBond && hit > 1) dmg = applyMod(dmg, MOD.x0_25);
    if (weatherMod) dmg = applyMod(dmg, weatherMod);
    if (crit) dmg = Math.floor(dmg * 1.5);
    const final = chainAll(finalMods(ctx, full, first));
    const rolls = [];
    for (let r = 85; r <= 100; r++) {
      let x = Math.floor((dmg * r) / 100);
      if (stab !== 1) x = applyMod(x, toMod(stab));
      // 상성은 배율이 아니라 2배·절반을 되풀이한다.
      for (let m = effectiveness; m > 1; m /= 2) x = x * 2;
      for (let m = effectiveness; m < 1; m *= 2) x = Math.floor(x / 2);
      if (burned) x = applyMod(x, MOD.x0_5);
      x = applyMod(x, final);
      rolls.push(Math.max(1, x));
    }
    cache.set(key, rolls);
    return rolls;
  };
  const full = env.defenderHp >= defenderHpMax;
  return {
    ...base,
    rolls: rollsAt(1, full, true),
    rollsAt,
    hits: hitCount,
    parentalBond,
    stab,
    basePower,
    // 트리플악셀처럼 타격마다 위력이 다르면 모두 보인다.
    basePowers:
      move.id === 'tripleaxel' && !(attacker.power > 0)
        ? Array.from({ length: hitCount }, (_, i) => powerOf(i + 1, false))
        : null,
    attackStat,
    defenseStat,
    crit,
    speeds: env.speeds || null,
    weights: env.weights || null,
    attackerHp: env.attackerHp,
    attackerHpMax,
  };
}

const weatherDamage = (weather, type) =>
  weather === 'sun'
    ? type === 'Fire'
      ? MOD.x1_5
      : type === 'Water'
        ? MOD.x0_5
        : 0
    : weather === 'rain'
      ? type === 'Water'
        ? MOD.x1_5
        : type === 'Fire'
          ? MOD.x0_5
          : 0
      : 0;

// ── 설치 기술 ─────────────────────────────────────────────────────
// 교체해 나올 때 받는 데미지. 스텔스록은 바위 상성 × 최대 HP/8, 압정뿌리기는 1·2·3겹에
// 1/8·1/6·1/4(땅에 붙은 포켓몬만). 매직가드는 받지 않는다.
export function hazardDamage(defender, species, chart, hpMax) {
  if (defender.ability === 'magicguard') return 0;
  let total = 0;
  if (defender.stealthRock)
    total += Math.max(1, Math.floor((hpMax * effectivenessOf(chart, 'Rock', species.types)) / 8));
  const layers = clamp(defender.spikes ?? 0, 0, 3);
  if (layers && grounded(species, defender))
    total += Math.max(1, Math.floor(([0, 3, 4, 6][layers] * hpMax) / 24));
  return total;
}

// ── 결과 묶음 ─────────────────────────────────────────────────────
// 화면이 쓰는 값을 한꺼번에 만든다. 계산할 수 없으면 null, 데미지가 없으면 reason을 준다.
//  결정력 = 공격 실수치(보정 후) × 위력(보정 후) × 자속
//  내구력 = HP × 방어(보정 후) ÷ 0.411  (내 샘플의 내구력과 같은 식)
export function damageSummary(input) {
  const result = damageRolls(input);
  if (!result) return null;
  const { reference, defender } = input;
  const species = reference.species[defender.pokemon];
  const hpMax = hpStat(species.stats.hp, defender.points?.hp ?? 0);
  const hpNow = hpFromPercent(hpMax, defender.hpPercent);
  const hazard = hazardDamage(defender, species, reference.types, hpMax);
  const hpStart = hpNow - hazard;
  const common = { hpMax, hpNow, hazard, hpStart, effectiveness: result.effectiveness };
  if (result.status) return { reason: '변화 기술은 데미지가 없습니다.', ...common };
  if (result.noPower)
    return { reason: '위력이 정해지지 않은 기술입니다. 위력을 직접 넣어 주세요.', ...common };
  if (result.immune) return { reason: '효과가 없습니다.', ...common, effectiveness: 0 };
  if (result.blocked) return { reason: '기술이 실패합니다.', ...common };
  if (result.ohko)
    return {
      reason: result.sturdy
        ? '옹골참이라 일격필살 기술이 통하지 않습니다.'
        : '일격필살 기술입니다. 맞으면 쓰러집니다.',
      ...common,
    };
  if (hpStart <= 0) return { reason: '설치 기술만으로 쓰러집니다.', ...common };
  const { hits, rollsAt } = result;
  // 1회 공격의 흐름. 첫 타격만 방어 측 HP가 가득일 수 있다.
  const full = hpStart >= hpMax;
  const flow = Array.from({ length: hits }, (_, i) => rollsAt(i + 1, i === 0 ? full : false, true));
  const min = flow.reduce((sum, rolls) => sum + rolls[0], 0);
  const max = flow.reduce((sum, rolls) => sum + rolls[15], 0);
  const d = defender.ability;
  const breaker = ['moldbreaker', 'teravolt', 'turboblaze'].includes(input.attacker.ability);
  // 기합의띠·옹골참은 HP가 가득일 때 한 번 버틴다. 탈은 첫 타격을 막고 1/8을 받는다.
  const endure = full && (defender.item === 'focussash' || (d === 'sturdy' && !breaker));
  const disguise = d === 'disguise' && !breaker && !String(defender.pokemon).endsWith('busted');
  const table = koOdds({ hits, rollsAt, hp: hpStart, maxHp: hpMax, endure, disguise });
  const bulkOf = key => {
    const value = stat(
      species.stats[key],
      defender.points?.[key] ?? 0,
      defender.nature?.[key] ?? 10,
    );
    return Math.floor((hpMax * value) / 0.411);
  };
  return {
    ...result,
    ...common,
    rolls: flow[0],
    flow,
    endure,
    disguise,
    min,
    max,
    minPercent: (min / hpMax) * 100,
    maxPercent: (max / hpMax) * 100,
    table,
    verdict: koVerdict(table),
    power: result.fixed ? null : Math.floor(result.attackStat * result.basePower * result.stab),
    bulk: result.fixed ? null : Math.floor((hpMax * result.defenseStat) / 0.411),
    bulks: { def: bulkOf('def'), spd: bulkOf('spd') },
  };
}

// ── 몇 번에 쓰러지는가 ─────────────────────────────────────────────
// 남은 HP의 분포를 타격마다 넘긴다. 난수 16개가 같은 확률이다. 타격의 데미지는 그때 방어
// 측 HP가 가득인지(멀티스케일)와 싸움의 첫 타격인지(반감 열매)에 따라 다르다.
//  endure    HP가 가득일 때 쓰러질 데미지를 1 남기고 버틴다(기합의띠·옹골참).
//  disguise  첫 타격을 막고 최대 HP의 1/8을 받는다(탈).
// 반환: 1~maxTurns번 공격했을 때 각각 쓰러뜨렸을 확률.
export function koOdds({ hits, rollsAt, hp, maxHp = Infinity, endure, disguise, maxTurns = 4 }) {
  if (!hits || hp <= 0) return [];
  const dist = new Map();
  const distOf = (hit, full, fresh) => {
    const key = `${hit}|${full}|${fresh}`;
    if (!dist.has(key)) dist.set(key, distribution(rollsAt(hit, full, fresh)));
    return dist.get(key);
  };
  let states = new Map([[stateKey(hp, !!disguise), 1]]);
  let fainted = 0;
  const table = [];
  for (let turn = 1; turn <= maxTurns; turn++) {
    for (let hit = 1; hit <= hits; hit++) {
      const next = new Map();
      const add = (h, masked, p) => {
        if (h <= 0) fainted += p;
        else next.set(stateKey(h, masked), (next.get(stateKey(h, masked)) ?? 0) + p);
      };
      for (const [key, p] of states) {
        const [h, masked] = parseState(key);
        if (masked) {
          add(h - Math.max(1, Math.floor(maxHp / 8)), false, p);
          continue;
        }
        const isFull = h >= maxHp;
        for (const [damage, q] of distOf(hit, isFull, turn === 1)) {
          let left = h - damage;
          if (left <= 0 && endure && isFull) left = 1;
          add(left, false, p * q);
        }
      }
      states = next;
    }
    // 살아남는 경우가 없으면 부동소수 오차 없이 확정이다.
    table.push({ turns: turn, chance: states.size ? Math.min(fainted, 1) : 1 });
  }
  return table;
}
const stateKey = (hp, masked) => hp * 2 + (masked ? 1 : 0);
const parseState = key => [Math.floor(key / 2), key % 2 === 1];

// 같은 난수로 hits번 때리는 단순한 경우. 테스트와 예전 호출을 위해 둔다.
export const koTable = (rolls, hits, hp, maxTurns = 4) =>
  rolls?.length ? koOdds({ hits, rollsAt: () => rolls, hp, maxTurns }) : [];
export function koChance(rolls, hits, hp, maxTurns = 4) {
  if (!rolls?.length || hp <= 0) return null;
  const hit = koTable(rolls, hits, hp, maxTurns).find(row => row.chance > 0);
  return hit ? { turns: hit.turns, chance: hit.chance } : { turns: null, chance: 0 };
}

// 결과 한 줄. 확정 n타 / 난수 n타(확률) / n타 이상 필요.
export function koVerdict(table) {
  const hit = table.find(row => row.chance > 0);
  if (!hit) return { text: `${table.length + 1}타 이상 필요`, turns: null, chance: 0 };
  return hit.chance >= 1
    ? { text: `확정 ${hit.turns}타`, turns: hit.turns, chance: 1 }
    : { text: `난수 ${hit.turns}타`, turns: hit.turns, chance: hit.chance };
}

const distribution = rolls => {
  const map = new Map();
  for (const r of rolls) map.set(r, (map.get(r) ?? 0) + 1 / rolls.length);
  return map;
};

// 더블에서 여럿을 치는가. 사이코필드의 와이드포스는 땅에 붙은 사용자가 쓰면 전체기가 된다.
export function isSpreadMove(move, field, attackerGrounded) {
  if (!move) return false;
  if (move.id === 'expandingforce') return field.terrain === 'psychic' && attackerGrounded;
  return SPREAD_MOVES.has(move.id);
}

// ── 화면 상태 ─────────────────────────────────────────────────────
export const emptyAttacker = () => ({
  pokemon: null,
  move: null,
  power: 0,
  hits: null,
  crit: false,
  spread: null,
  points: { atk: 32, spa: 32, def: 0 },
  nature: {},
  stages: {},
  ability: '',
  item: '',
  status: '',
  hpPercent: 100,
  charge: false,
  helpingHand: false,
});
export const emptyDefender = () => ({
  pokemon: null,
  points: { hp: 0, def: 0, spd: 0, atk: 0 },
  nature: {},
  stages: {},
  ability: '',
  item: '',
  status: '',
  hpPercent: 100,
  reflect: false,
  lightScreen: false,
  auroraVeil: false,
  friendGuard: false,
  stealthRock: false,
  spikes: 0,
});
export const emptyDamage = () => ({
  format: 'singles',
  attacker: emptyAttacker(),
  defender: emptyDefender(),
  field: { weather: '', terrain: '' },
});

const toKey = name =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const POINT_INDEX = { hp: 0, atk: 1, def: 2, spa: 3, spd: 4, spe: 5 };
const NATURE_NAMES = {
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
};

// 샘플에서 계산기 한쪽으로. 공격 측은 첫 번째 채용 기술을 함께 가져온다.
export function damageSideFromSample(sample, role, natureAdjust) {
  const [up, down] = natureAdjust(sample.nature);
  const points = {};
  const nature = {};
  for (const key of Object.keys(POINT_INDEX)) {
    points[key] = sample.points?.[POINT_INDEX[key]] ?? 0;
    if (key !== 'hp')
      nature[key] = up === NATURE_NAMES[key] ? 11 : down === NATURE_NAMES[key] ? 9 : 10;
  }
  const common = {
    pokemon: sample.pokemon,
    points,
    nature,
    ability: toKey(sample.ability),
    item: toKey(sample.item),
  };
  if (role === 'defender') return { ...emptyDefender(), ...common };
  const move = sample.moves?.find(Boolean);
  return { ...emptyAttacker(), ...common, move: move ? toKey(move) : null };
}
