// 데미지 계산기의 계산. DOM 없이 값만 다루므로 node --test로 검사한다.
// 순서와 반올림은 Showdown 9세대(sim/battle-actions.ts의 getDamage·modifyDamage)를 따른다.
// 레벨 50 고정, 능력치는 챔피언스의 능력 포인트(0~32)로 계산한다. 설계는 docs/damage-calc.md.

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
  x1_2: 4915,
  x1_3: 5325,
  lifeOrb: 5324,
  x1_5: 6144,
  x2: 8192,
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
// 필드가 없으면 실패하는 기술
export const NEEDS_TERRAIN = new Set(['steelroller']);
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
};
export const defaultHits = (move, ability) =>
  FIXED_HITS[move.id] ??
  ((move.traits ?? []).includes('multihit') ? (ability === 'skilllink' ? 5 : 2) : 1);

// ── 특성·도구 ─────────────────────────────────────────────────────
// 1단계에서 다루는 것만 둔다. 없는 것은 계산에 영향을 주지 않는다.
// 위력에 거는 배율(onBasePower)
export function basePowerMods(ctx) {
  const { move, attacker, field } = ctx;
  const mods = [];
  const a = attacker.ability;
  const traits = move.traits ?? [];
  if (a === 'technician' && ctx.basePower <= 60) mods.push(MOD.x1_5);
  if (a === 'toughclaws' && traits.includes('contact')) mods.push(MOD.x1_3);
  if (a === 'ironfist' && traits.includes('punch')) mods.push(MOD.x1_2);
  if (a === 'strongjaw' && traits.includes('bite')) mods.push(MOD.x1_5);
  if (a === 'sharpness' && traits.includes('slicing')) mods.push(MOD.x1_5);
  if (a === 'megalauncher' && traits.includes('pulse')) mods.push(MOD.x1_5);
  if (a === 'reckless' && (traits.includes('recoil') || CRASH_MOVES.has(move.id)))
    mods.push(MOD.x1_2);
  if (a === 'punkrock' && traits.includes('sound')) mods.push(MOD.x1_3);
  if (TYPE_BOOST_ITEMS[attacker.item] === move.type) mods.push(MOD.x1_2);
  if (attacker.charge && move.type === 'Electric') mods.push(MOD.x2);
  if (field.format === 'doubles' && attacker.helpingHand) mods.push(MOD.x1_5);
  // 필드. 땅에 붙어 있는지는 1단계에서 묻지 않고 붙어 있다고 본다.
  const terrainType = { electric: 'Electric', grassy: 'Grass', psychic: 'Psychic' }[field.terrain];
  if (terrainType && move.type === terrainType) mods.push(MOD.x1_3);
  if (field.terrain === 'misty' && move.type === 'Dragon') mods.push(MOD.x0_5);
  if (field.terrain === 'grassy' && ['earthquake', 'bulldoze'].includes(move.id))
    mods.push(MOD.x0_5);
  return mods;
}

// 공격 능력치에 거는 배율(onModifyAtk/SpA)
export function attackMods(ctx) {
  const { attacker, field, physical } = ctx;
  const mods = [];
  const a = attacker.ability;
  if (physical && (a === 'hugepower' || a === 'purepower')) mods.push(MOD.x2);
  if (physical && a === 'guts' && attacker.status) mods.push(MOD.x1_5);
  if (!physical && a === 'solarpower' && field.weather === 'sun') mods.push(MOD.x1_5);
  if (physical && attacker.item === 'choiceband') mods.push(MOD.x1_5);
  if (!physical && attacker.item === 'choicespecs') mods.push(MOD.x1_5);
  if (attacker.pinch) {
    const pinch = { overgrow: 'Grass', blaze: 'Fire', torrent: 'Water', swarm: 'Bug' }[a];
    if (pinch === ctx.move.type) mods.push(MOD.x1_5);
  }
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
  return { mods, weather: weatherDefense(field.weather, defenderTypes, usesDef) };
}
// 날씨로 오르는 방어는 다른 배율과 잇지 않고 능력치에 먼저 적용한다(Showdown과 같다).
const weatherDefense = (weather, types, usesDef) =>
  (weather === 'sand' && !usesDef && types.includes('Rock')) ||
  (weather === 'snow' && usesDef && types.includes('Ice'))
    ? MOD.x1_5
    : 0;

// 마지막 배율(onModifyDamage)
export function finalMods(ctx) {
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
  if (defender.ability === 'multiscale' || defender.ability === 'shadowshield')
    if (defender.hpPercent >= 100) mods.push(MOD.x0_5);
  if (['filter', 'solidrock', 'prismarmor'].includes(defender.ability) && effectiveness > 1)
    mods.push(MOD.x0_75);
  if (defender.ability === 'fluffy') {
    if ((move.traits ?? []).includes('contact')) mods.push(MOD.x0_5);
    if (move.type === 'Fire') mods.push(MOD.x2);
  }
  if (defender.ability === 'icescales' && !physical) mods.push(MOD.x0_5);
  if (doubles && defender.friendGuard) mods.push(MOD.x0_75);
  if (attacker.item === 'expertbelt' && effectiveness > 1) mods.push(MOD.x1_2);
  if (attacker.item === 'lifeorb') mods.push(MOD.lifeOrb);
  // 반감 열매. 노말은 치리열매(chilanberry)가 효과가 평범해도 발동한다.
  const berry = RESIST_BERRIES[defender.item];
  if (berry === move.type && (effectiveness > 1 || berry === 'Normal')) mods.push(MOD.x0_5);
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

// 땅에 붙어 있는가. 1단계는 비행 타입과 부유만 본다(풍선·전자부유 등은 2단계).
const grounded = (species, ability) => !species.types.includes('Flying') && ability !== 'levitate';

// ── 한 번의 계산 ───────────────────────────────────────────────────
// 반환: { rolls: 16개 데미지, effectiveness, stab, ... } 또는 { immune: true }
export function damageRolls(input) {
  const { reference, attacker, defender, field, move: rawMove } = input;
  const attackerSpecies = reference.species[attacker.pokemon];
  const defenderSpecies = reference.species[defender.pokemon];
  if (!attackerSpecies || !defenderSpecies || !rawMove) return null;
  const move = { ...rawMove, type: attacker.moveType || rawMove.type };
  const physical = move.category === 'Physical';
  if (move.category === 'Status') return { status: true };
  const special = MOVE_STATS[move.id] ?? {};
  const usesDef = special.defense ? special.defense === 'def' : physical;
  const attackerTypes = attackerSpecies.types;
  const defenderTypes = defenderSpecies.types;
  const effectiveness = effectivenessOf(reference.types, move.type, defenderTypes, move.id);
  if (effectiveness === 0) return { immune: true, effectiveness };
  // 사이코필드에서는 땅에 붙은 상대에게 선제기가 막힌다.
  if (
    field.terrain === 'psychic' &&
    move.priority > 0 &&
    grounded(defenderSpecies, defender.ability)
  )
    return { blocked: true, effectiveness };
  if (NEEDS_TERRAIN.has(move.id) && !field.terrain) return { blocked: true, effectiveness };
  const crit = !!input.crit || ALWAYS_CRIT.has(move.id);

  // 위력
  let basePower = attacker.power > 0 ? attacker.power : move.power;
  if (!basePower) return { noPower: true };
  const ctx = {
    move,
    attacker,
    defender,
    field,
    physical,
    usesDef,
    defenderTypes,
    crit,
    effectiveness,
  };
  ctx.basePower = basePower;
  basePower = Math.max(1, applyMod(basePower, chainAll(basePowerMods(ctx))));

  // 공격 능력치. 급소는 공격 측의 불리한 랭크와 방어 측의 유리한 랭크를 무시한다.
  const attackKey = special.attack ?? (physical ? 'atk' : 'spa');
  const source = special.attackFrom === 'defender' ? defender : attacker;
  const sourceSpecies = special.attackFrom === 'defender' ? defenderSpecies : attackerSpecies;
  let attackStat = stat(
    sourceSpecies.stats[attackKey],
    source.points?.[attackKey] ?? 0,
    source.nature?.[attackKey] ?? 10,
  );
  let attackStage = source.stages?.[attackKey] ?? 0;
  if (crit && attackStage < 0) attackStage = 0;
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
  if ((crit && defenseStage > 0) || IGNORE_DEFENSE_STAGES.has(move.id)) defenseStage = 0;
  defenseStat = stageStat(defenseStat, defenseStage);
  const { mods: defMods, weather } = defenseMods(ctx);
  if (weather) defenseStat = applyMod(defenseStat, weather);
  defenseStat = Math.max(1, applyMod(defenseStat, chainAll(defMods)));

  // 기본 데미지: floor(floor(floor(2×50/5+2) × 위력 × 공격 / 방어) / 50) + 2
  let base = Math.floor(Math.floor((22 * basePower * attackStat) / defenseStat) / 50) + 2;
  if (field.format === 'doubles' && field.spread) base = applyMod(base, MOD.x0_75);
  const weatherMod = weatherDamage(field.weather, move.type);
  if (weatherMod) base = applyMod(base, weatherMod);
  if (crit) base = Math.floor(base * 1.5);

  const stab = attackerTypes.includes(move.type)
    ? attacker.ability === 'adaptability'
      ? 2
      : 1.5
    : 1;
  const burned =
    attacker.status === 'brn' && physical && attacker.ability !== 'guts' && move.id !== 'facade';
  const final = chainAll(finalMods(ctx));
  const rolls = [];
  for (let r = 85; r <= 100; r++) {
    let d = Math.floor((base * r) / 100);
    if (stab !== 1) d = applyMod(d, toMod(stab));
    // 상성은 배율이 아니라 2배·절반을 되풀이한다.
    for (let m = effectiveness; m > 1; m /= 2) d = d * 2;
    for (let m = effectiveness; m < 1; m *= 2) d = Math.floor(d / 2);
    if (burned) d = applyMod(d, MOD.x0_5);
    d = applyMod(d, final);
    rolls.push(Math.max(1, d));
  }
  const hits = Math.max(1, Math.floor(attacker.hits ?? defaultHits(move, attacker.ability)));
  return { rolls, hits, effectiveness, stab, basePower, attackStat, defenseStat, crit };
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

// ── 몇 번에 쓰러지는가 ─────────────────────────────────────────────
// 한 번 공격 = 타수만큼 따로 굴린 데미지의 합. 난수 16개가 같은 확률이다.
// n번 공격한 합이 남은 HP 이상일 확률을 1~maxTurns까지 구해 처음으로 0보다 큰 것을 돌려준다.
export function koChance(rolls, hits, hp, maxTurns = 4) {
  if (!rolls?.length || hp <= 0) return null;
  const once = convolveTimes(distribution(rolls), hits);
  let total = new Map([[0, 1]]);
  for (let n = 1; n <= maxTurns; n++) {
    total = convolve(total, once);
    let chance = 0;
    for (const [damage, p] of total) if (damage >= hp) chance += p;
    if (chance > 0) return { turns: n, chance: Math.min(1, chance) };
  }
  return { turns: null, chance: 0 };
}
const distribution = rolls => {
  const map = new Map();
  for (const r of rolls) map.set(r, (map.get(r) ?? 0) + 1 / rolls.length);
  return map;
};
function convolve(a, b) {
  const out = new Map();
  for (const [x, p] of a) for (const [y, q] of b) out.set(x + y, (out.get(x + y) ?? 0) + p * q);
  return out;
}
const convolveTimes = (dist, times) => {
  let out = dist;
  for (let i = 1; i < times; i++) out = convolve(out, dist);
  return out;
};
