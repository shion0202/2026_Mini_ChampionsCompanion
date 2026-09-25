// 데미지 계산기 화면. 문자열만 만든다. 배선은 app.js가 한다.
// 입력은 스피드 계산기(calc-view.js)와 같은 틀이고, 결과는 요약 → 결정력·내구력 →
// 1회 타격(범위·결과·KO 정보·난수) 순서다.
import { esc } from './html.js';
import { portrait, typeBadges } from './app-view.js';
import { speciesSprite } from './images.js';
import { TYPE_LABELS } from './locale.js';
import { CATEGORY_NAMES } from './reference-view.js';
import { WEATHERS, TERRAINS, NATURE_FACTORS } from './speed-calc.js';
import {
  MOVE_STATS,
  MOVE_CONDITIONS,
  ABILITY_CONDITIONS,
  FIXED_DAMAGE_MOVES,
  ITEM_CONDITIONS,
} from './damage-calc.js';

// 조사를 이름에 붙여 만들지 않는다. ‘방어으로’처럼 틀린다.
const TAKEN_WITH = { def: '방어로 계산', spd: '특수방어로 계산' };
export const STAT_NAMES_KO = {
  hp: 'HP',
  atk: '공격',
  def: '방어',
  spa: '특수공격',
  spd: '특수방어',
  spe: '스피드',
};
const NATURE_LABELS = { 9: '×0.9', 10: '×1.0', 11: '×1.1' };

// 기술·특성의 조건 칸 이름. 켜는 것은 체크, 세는 것은 숫자 칸이다.
const TOGGLE_LABELS = {
  movesLast: '상대보다 늦게 행동',
  wasHit: '이번 턴에 상대에게 공격받음',
  targetHurt: '상대가 이번 턴에 이미 데미지를 받음',
  lastFailed: '직전에 쓴 기술이 실패함',
  statsLowered: '이번 턴에 능력이 떨어짐',
  allyRound: '아군이 먼저 돌림노래를 씀',
  fickle: '위력 두 배가 발동함 (30%)',
  targetSwitched: '상대가 이번 턴에 교체해 나옴',
  hangry: '배고픈 모습 (악 타입)',
  flashFire: '타오르는불꽃 발동 (불꽃 기술 ×1.5)',
  plusMinus: '아군이 플러스·마이너스 (특수 기술 ×1.5)',
  throughProtect: '방어를 뚫음 (접촉 기술, 데미지 1/4)',
};
const COUNT_FIELDS = {
  timesHit: { label: '공격받은 횟수', max: 6 },
  fainted: { label: '쓰러진 아군 수', max: 5 },
  boostTotal: { label: '올라간 랭크 합계', max: 42 },
  stockpile: { label: '비축하기 횟수', max: 3 },
  damageTaken: { label: '받은 데미지', max: 9999 },
  metronome: { label: '메트로놈 연속 사용 (N번째)', min: 1, max: 6 },
};
// 상태이상. 데미지 계산기는 독과 맹독을 나눈다(턴 종료 데미지가 다르다).
const DAMAGE_STATUSES = [
  ['', '없음'],
  ['par', '마비'],
  ['brn', '화상'],
  ['psn', '독'],
  ['tox', '맹독'],
  ['slp', '잠듦'],
  ['frz', '얼음'],
];
const SPIKES = [
  ['0', '없음'],
  ['1', '1중첩'],
  ['2', '2중첩'],
  ['3', '3중첩'],
];

// 고르는 조건. 투쟁심은 상대와의 성별을 묻는다.
const CHOICE_FIELDS = {
  rivalry: {
    label: '상대와 성별',
    options: [
      ['', '성별 없음 (보정 없음)'],
      ['same', '같음 (×1.25)'],
      ['different', '다름 (×0.75)'],
    ],
  },
};

// 이 기술과 특성이 묻는 조건. 둘이 같은 것을 물으면 한 번만 보인다. species가 붙은 조건은
// 그 포켓몬일 때만 묻는다(오라휠의 배고픈 모습은 모르페코만).
export function conditionsOf(moveId, ability, pokemon = '', item = '') {
  const list = [MOVE_CONDITIONS[moveId], ABILITY_CONDITIONS[ability], ITEM_CONDITIONS[item]].filter(
    c => c && (!c.species || String(pokemon).startsWith(c.species)),
  );
  return {
    toggles: [...new Set(list.map(c => c.toggle).filter(Boolean))],
    counts: [...new Set(list.map(c => c.count).filter(Boolean))],
    choices: [...new Set(list.map(c => c.choice).filter(Boolean))],
    hp: list.some(c => c.hp),
    speed: list.some(c => c.speed),
    weight: list.find(c => c.weight)?.weight ?? null,
  };
}

// 기술에 따라 쓰는 능력치. 기술을 고르지 않았으면 물리로 본다. category는 계산이 정한
// 분류다(셸사이드암은 물리가 될 수 있다).
export function statKeys(move, category = move?.category) {
  const special = MOVE_STATS[move?.id] ?? {};
  const physical = category !== 'Special';
  return {
    attack: special.attack ?? (physical ? 'atk' : 'spa'),
    defense: special.defense ?? (physical ? 'def' : 'spd'),
    fromDefender: special.attackFrom === 'defender',
  };
}

const options = (entries, selected) =>
  entries
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`,
    )
    .join('');

const check = (field, on, label) =>
  `<label class="calc-check"><input type="checkbox" data-dmg-field="${field}"${on ? ' checked' : ''}>${esc(label)}</label>`;

// 능력 포인트·성격·실수치 한 벌. key는 atk·spa·def·spd, hp는 성격이 없다. 랭크는 실수치를
// 바꾸지 않으므로 따로 둔다(rankGroup).
function statBlock(title, side, key, actual) {
  const points = side.points?.[key] ?? 0;
  const nature = side.nature?.[key] ?? 10;
  const hp = key === 'hp';
  return (
    `<div class="calc-line"><span>능력 포인트</span>` +
    `<input type="number" min="0" max="32" step="1" value="${points}" data-dmg-points="${key}" aria-label="${esc(title)} 능력 포인트">` +
    `<button type="button" class="calc-step" data-dmg-set-points="${key}:0">0</button>` +
    `<button type="button" class="calc-step" data-dmg-set-points="${key}:32">최대</button></div>` +
    (hp
      ? ''
      : `<div class="calc-line"><span>성격 (능력 보정)</span><div class="calc-choices" role="group" aria-label="${esc(title)} 성격">` +
        NATURE_FACTORS.map(
          n =>
            `<button type="button" data-dmg-nature="${key}:${n}" aria-pressed="${nature === n}">${NATURE_LABELS[n]}</button>`,
        ).join('') +
        `</div></div>`) +
    `<div class="calc-line"><span>실수치</span><strong data-dmg-stat="${key}">${actual ?? '—'}</strong></div>`
  );
}

// 랭크와, 랭크를 곱한 값. 스피드 계산기와 같은 모양이다.
const rankLines = (title, side, key, staged) => {
  const stage = side.stages?.[key] ?? 0;
  return (
    `<div class="calc-line"><span>랭크</span>` +
    `<button type="button" class="calc-step" data-dmg-stage="${key}:-1" aria-label="${esc(title)} 랭크 내리기">−</button>` +
    `<output class="calc-stage">${stage > 0 ? '+' : ''}${stage}</output>` +
    `<button type="button" class="calc-step" data-dmg-stage="${key}:1" aria-label="${esc(title)} 랭크 올리기">+</button></div>` +
    `<div class="calc-line"><span>랭크 적용</span><strong data-dmg-staged="${key}">${staged ?? '—'}</strong></div>`
  );
};
const rankGroup = (title, side, key, staged) =>
  `<fieldset class="calc-group"><legend>${esc(title)} 랭크</legend>${rankLines(title, side, key, staged)}</fieldset>`;

// 두 능력치 가운데 입력할 쪽을 고르는 단추(방어·특수방어, 셸사이드암의 공격·특수공격).
const statChooser = (keys, shown, label) =>
  `<div class="calc-line"><span>입력할 능력</span><div class="calc-choices" role="group" aria-label="${esc(label)}">` +
  keys
    .map(
      key =>
        `<button type="button" data-dmg-stat-view="${key}" aria-pressed="${shown === key}">${STAT_NAMES_KO[key]}</button>`,
    )
    .join('') +
  `</div></div>`;

const head = (title, reference, index, pokemon, speciesLabel) => {
  const species = reference.species[pokemon];
  return (
    `<div class="calc-side-head">` +
    `${portrait({ sprite: speciesSprite(reference, index, pokemon) }, 'calc-portrait')}` +
    `<div><h3>${title}</h3>` +
    `<small>${species ? `${esc(speciesLabel(pokemon))} · ${species.types.map(t => TYPE_LABELS[t] ?? t).join(' · ')}` : '포켓몬을 선택하세요'}</small></div></div>`
  );
};

const picks = (side, reference, speciesLabel) =>
  `<div class="calc-picks">` +
  `<button type="button" class="builds-pick" data-dmg-pick="member">샘플 불러오기</button>` +
  `<button type="button" class="builds-pick" data-dmg-pick="species">${reference.species[side.pokemon] ? esc(speciesLabel(side.pokemon)) : '포켓몬 선택'}</button>` +
  `</div>`;

// 특성은 그 포켓몬이 가질 수 있는 것을 모두 보인다. 계산에 영향이 없는 것도 선택할 수 있다.
const abilitySelect = (side, reference) => {
  const own = reference.species[side.pokemon]?.abilities ?? [];
  const ids = own.map(name => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return (
    `<label class="calc-field">특성<select data-dmg-field="ability"${ids.length ? '' : ' disabled'}>` +
    options(
      [
        ['', ids.length ? '없음' : '포켓몬을 선택하세요'],
        ...ids.map(id => [id, reference.ability[id]?.label ?? id]),
      ],
      side.ability,
    ) +
    `</select></label>`
  );
};

// 특성 · 도구 칸. 도구 비우기는 도구 칸 바로 옆, 칸 높이의 가운데에 붙인다.
const abilityItemGroup = (side, reference) =>
  `<fieldset class="calc-group"><legend>특성 · 도구</legend><div class="calc-grid">` +
  abilitySelect(side, reference) +
  `<div class="calc-item">` +
  `<label class="calc-field">도구<button type="button" class="builds-pick" data-dmg-pick="item">` +
  `${side.item ? esc(reference.held_item[side.item]?.label ?? side.item) : '도구 선택'}</button></label>` +
  `${side.item ? '<button type="button" class="text-button calc-clear" data-dmg-clear="item">도구 비우기</button>' : ''}` +
  `</div></div></fieldset>`;

// 타수. 최소~최대가 있는 연속기는 막대로 고르고, 나머지는 숫자 칸이다.
function hitsLine(side, context) {
  const range = context.hitRange;
  if (!range)
    return (
      `<div class="calc-line"><span>타수</span>` +
      `<input type="number" min="1" max="10" step="1" value="${side.hits ?? ''}" placeholder="${context.defaultHits}" data-dmg-number="hits" aria-label="타수"></div>`
    );
  const value = Math.min(range[1], Math.max(range[0], side.hits ?? context.defaultHits));
  return (
    `<div class="calc-line"><span>타수</span>` +
    `<input type="range" min="${range[0]}" max="${range[1]}" step="1" value="${value}" data-dmg-number="hits" aria-label="타수">` +
    `<strong data-dmg-out="hits">${value}타</strong></div>`
  );
}

function attackerPanel(state, context) {
  const { reference, index, speciesLabel, stats, keys } = context;
  const side = state.attacker;
  const move = side.move ? reference.move[side.move] : null;
  const doubles = state.format === 'doubles';
  // 셸사이드암은 공격·특수공격을 모두 보므로 입력할 쪽을 고른다.
  const both = side.move === 'shellsidearm';
  // 고정 데미지 기술은 공격 능력치를 보지 않으므로 칸을 두지 않는다.
  const fixed = FIXED_DAMAGE_MOVES.has(side.move);
  const shown = both ? (side.attackView ?? keys.attack) : keys.attack;
  const attackTitle = keys.fromDefender
    ? '공격 수치 (속임수: 상대의 공격 수치를 사용합니다)'
    : both
      ? '공격 · 특수공격 수치'
      : `${STAT_NAMES_KO[keys.attack]} 수치`;
  // 공격(특수공격) 수치와 랭크. 속임수면 방어 측의 공격을 쓴다고 알린다.
  const attackGroups = () =>
    `<fieldset class="calc-group"><legend>${esc(attackTitle)}</legend>` +
    (keys.fromDefender
      ? '<p class="calc-note">방어 측의 공격 능력 포인트·성격·랭크를 사용합니다.</p>'
      : (both ? statChooser(['atk', 'spa'], shown, '입력할 공격 능력') : '') +
        statBlock(STAT_NAMES_KO[shown], side, shown, stats.all[shown]?.actual) +
        (both && shown !== keys.attack
          ? `<p class="calc-note">선택한 기술은 ${STAT_NAMES_KO[keys.attack]}으로 계산합니다.</p>`
          : '')) +
    `</fieldset>` +
    (keys.fromDefender
      ? ''
      : rankGroup(STAT_NAMES_KO[shown], side, shown, stats.all[shown]?.staged));
  return (
    `<section class="calc-side" data-dmg-side="attacker">` +
    head('공격 측', reference, index, side.pokemon, speciesLabel) +
    picks(side, reference, speciesLabel) +
    `<div data-dmg-quick="power">${powerBox(context.summary, { ...context, state })}</div>` +
    `<fieldset class="calc-group"><legend>기술</legend>` +
    // 내 샘플의 기술 칸처럼 이름은 왼쪽, 타입·분류·위력은 오른쪽에 둔다.
    `<button type="button" class="builds-pick builds-move dmg-move-pick" data-dmg-pick="move">` +
    `${
      move
        ? `<span class="builds-move-name">${esc(move.label)}</span>` +
          `<span class="builds-move-meta">${typeBadges([move.type])}<small>${CATEGORY_NAMES[move.category]} · 위력 ${move.power || '—'}</small></span>`
        : '기술 선택'
    }</button>` +
    `<div class="calc-line"><span>위력</span>` +
    `<input type="number" min="0" step="1" value="${side.power || ''}" placeholder="${move?.power || '직접 입력'}" data-dmg-number="power" aria-label="위력 직접 입력">` +
    `<small class="calc-note">비우면 기술 위력</small></div>` +
    hitsLine(side, context) +
    check('crit', side.crit, '급소') +
    `${doubles ? check('spread', context.spread, '전체기 (×0.75)') : ''}` +
    `</fieldset>` +
    // 기술·특성이 묻는 칸은 기술 칸 바로 아래에, 테두리 색을 달리해 둔다.
    conditionGroup(side, context.conditions, stats) +
    speedGroup(side, context.conditions, stats) +
    (fixed ? '' : attackGroups()) +
    abilityItemGroup(side, reference) +
    `<fieldset class="calc-group"><legend>상태 · 날씨 · 필드</legend><div class="calc-grid">` +
    `<label class="calc-field">상태이상<select data-dmg-field="status">${options(DAMAGE_STATUSES, side.status)}</select></label>` +
    `<label class="calc-field">날씨<select data-dmg-field="weather">${options(Object.entries(WEATHERS), state.field.weather)}</select></label>` +
    `<label class="calc-field">필드<select data-dmg-field="terrain">${options(Object.entries(TERRAINS), state.field.terrain)}</select></label>` +
    `</div>` +
    check('charge', side.charge, '충전 (전기 기술 ×2)') +
    `${doubles ? check('helpingHand', side.helpingHand, '도우미 (×1.5)') : ''}` +
    `</fieldset>` +
    `</section>`
  );
}

// 기술·특성이 묻는 조건(대가의 행동 순서, 분노의주먹의 맞은 횟수, 분화·목숨걸기의 HP 등).
// 묻는 것이 없으면 칸을 두지 않는다.
function conditionGroup(side, conditions, stats) {
  const { toggles, counts, choices, hp } = conditions;
  if (!toggles.length && !counts.length && !choices.length && !hp) return '';
  return (
    `<fieldset class="calc-group is-conditional"><legend>위력 조건</legend>` +
    (hp
      ? statBlock('HP', side, 'hp', stats.hp) + hpSlider(side, stats.hp, '공격 측 남은 HP 비율')
      : '') +
    counts
      .map(
        key =>
          `<div class="calc-line"><span>${COUNT_FIELDS[key].label}</span>` +
          `<input type="number" min="${COUNT_FIELDS[key].min ?? 0}" max="${COUNT_FIELDS[key].max}" step="1" value="${side[key] ?? COUNT_FIELDS[key].min ?? 0}" data-dmg-number="${key}" aria-label="${COUNT_FIELDS[key].label}"></div>`,
      )
      .join('') +
    choices
      .map(
        key =>
          `<label class="calc-field">${CHOICE_FIELDS[key].label}<select data-dmg-field="${key}">${options(CHOICE_FIELDS[key].options, side[key] ?? '')}</select></label>`,
      )
      .join('') +
    toggles.map(key => check(key, side[key], TOGGLE_LABELS[key])).join('') +
    `</fieldset>`
  );
}

// 자이로볼·일렉트릭볼은 두 쪽 스피드로 위력이 정해진다. 그때만 보인다.
const speedGroup = (side, conditions, stats) =>
  conditions.speed
    ? `<fieldset class="calc-group is-conditional"><legend>스피드 수치</legend>` +
      statBlock('스피드', side, 'spe', stats.all.spe?.actual) +
      rankLines('스피드', side, 'spe', stats.all.spe?.staged) +
      `</fieldset>`
    : '';

function defenderPanel(state, context) {
  const { reference, index, speciesLabel, stats, keys } = context;
  const side = state.defender;
  const doubles = state.format === 'doubles';
  // 방어·특수방어는 기술과 따로 골라 입력한다. 계산은 늘 기술이 쓰는 쪽으로 한다.
  const view = side.defenseView ?? keys.defense;
  const name = STAT_NAMES_KO[view];
  return (
    `<section class="calc-side" data-dmg-side="defender">` +
    head('방어 측', reference, index, side.pokemon, speciesLabel) +
    picks(side, reference, speciesLabel) +
    `<div data-dmg-quick="bulk">${bulkBox(context)}</div>` +
    // 기술이 방어 측 값을 묻는 칸은 내구력 칸과 HP 칸 사이에 둔다.
    speedGroup(side, context.conditions, stats) +
    `<fieldset class="calc-group"><legend>HP 수치</legend>` +
    statBlock('HP', side, 'hp', stats.hp) +
    hpSlider(side, stats.hp, '방어 측 남은 HP 비율') +
    `</fieldset>` +
    `<fieldset class="calc-group"><legend>방어 · 특수방어 수치</legend>` +
    statChooser(['def', 'spd'], view, '입력할 방어 능력') +
    statBlock(name, side, view, stats.all[view]?.actual) +
    (view === keys.defense
      ? ''
      : `<p class="calc-note">선택한 기술은 ${TAKEN_WITH[keys.defense]}합니다.</p>`) +
    `</fieldset>` +
    rankGroup(name, side, view, stats.all[view]?.staged) +
    (keys.fromDefender
      ? `<fieldset class="calc-group"><legend>공격 수치 (속임수)</legend>${statBlock('공격', side, 'atk', stats.all.atk?.actual)}</fieldset>` +
        rankGroup('공격', side, 'atk', stats.all.atk?.staged)
      : '') +
    abilityItemGroup(side, reference) +
    // 방어 측 상태이상은 병상첨병·베놈쇼크 같은 기술과 이상한비늘이 본다.
    // 설치 기술은 교체해 나올 때 받으므로 남은 HP에서 먼저 뺀다.
    // 날씨·필드는 공격 측 칸과 같은 값이다. 좁은 화면에서 두 칸이 세로로 쌓여도 고칠 수 있다.
    `<fieldset class="calc-group"><legend>상태 · 날씨 · 필드</legend><div class="calc-grid">` +
    `<label class="calc-field">상태이상<select data-dmg-field="status">${options(DAMAGE_STATUSES, side.status ?? '')}</select></label>` +
    `<label class="calc-field">날씨<select data-dmg-field="weather">${options(Object.entries(WEATHERS), state.field.weather)}</select></label>` +
    `<label class="calc-field">필드<select data-dmg-field="terrain">${options(Object.entries(TERRAINS), state.field.terrain)}</select></label>` +
    `</div></fieldset>` +
    // 턴 종료 데미지. 공격 데미지와 따로 보인다(결과의 ‘턴 종료 포함’).
    `<fieldset class="calc-group"><legend>턴 종료 데미지</legend>` +
    (side.status === 'tox'
      ? `<div class="calc-line"><span>맹독 (N턴째)</span><input type="number" min="1" max="15" step="1" value="${side.toxicTurn ?? 1}" data-dmg-number="toxicTurn" aria-label="맹독 경과 턴"></div>`
      : '') +
    // 회복을 위에, 데미지를 아래에 묶는다.
    `<div class="calc-subgroup">` +
    check('seededFoe', side.seededFoe, '공격 측에 씨뿌리기를 심음') +
    check('aquaRing', side.aquaRing, '아쿠아링') +
    check('ingrain', side.ingrain, '뿌리박기') +
    `</div><div class="calc-subgroup">` +
    check('bound', side.bound, '바인드 (김밥말이 등)') +
    check('leechSeed', side.leechSeed, '씨뿌리기를 맞음') +
    check('saltCure', side.saltCure, '소금절이') +
    `</div>` +
    `<p class="calc-note">상태이상, 날씨, 그래스필드, 먹다남은음식·검은진흙, 큰뿌리, 공격 측의 조임밴드·해감액은 선택한 값을 자동 반영합니다.</p>` +
    `</fieldset>` +
    // 벽 → 설치 기술 → 반동 순서로 묶는다. 압정뿌리기는 스텔스록 줄과 모양을 맞춰 단추로 고른다.
    `<fieldset class="calc-group"><legend>벽 · 설치 기술 · 반동</legend>` +
    `<div class="calc-subgroup">` +
    check('reflect', side.reflect, '리플렉터') +
    check('lightScreen', side.lightScreen, '빛의장막') +
    check('auroraVeil', side.auroraVeil, '오로라베일') +
    `${doubles ? check('friendGuard', side.friendGuard, '프렌드가드 (×0.75)') : ''}` +
    `</div><div class="calc-subgroup">` +
    `<div class="calc-line"><span>압정뿌리기</span><div class="calc-choices" role="group" aria-label="압정뿌리기">` +
    SPIKES.map(
      ([value, label]) =>
        `<button type="button" data-dmg-spikes="${value}" aria-pressed="${String(side.spikes ?? 0) === value}">${label}</button>`,
    ).join('') +
    `</div></div>` +
    check('stealthRock', side.stealthRock, '스텔스록') +
    `</div><div class="calc-subgroup">` +
    `<div class="calc-line is-wide"><span>울퉁불퉁멧을 받은 횟수 (1/6)</span><input type="number" min="0" max="9" step="1" value="${side.helmetHits ?? 0}" data-dmg-number="helmetHits" aria-label="울퉁불퉁멧을 받은 횟수"></div>` +
    `<div class="calc-line is-wide"><span>까칠한피부·철가시를 받은 횟수 (1/8)</span><input type="number" min="0" max="9" step="1" value="${side.roughSkinHits ?? 0}" data-dmg-number="roughSkinHits" aria-label="까칠한피부·철가시를 받은 횟수"></div>` +
    `</div>` +
    `</fieldset>` +
    `</section>`
  );
}

const percent = value => `${value.toFixed(1)}%`;

// 남은 HP 칸. %와 실제 값을 함께 보인다. 옮기는 동안 app.js가 글자만 고친다(data-hp-max).
const hpSlider = (side, hpMax, label) =>
  `<div class="calc-line"><span>남은 HP</span>` +
  `<input type="range" min="1" max="100" step="1" value="${side.hpPercent ?? 100}" data-dmg-number="hpPercent" aria-label="${esc(label)}">` +
  `<strong data-dmg-out="hpPercent" data-hp-max="${hpMax ?? ''}">${hpText(side.hpPercent ?? 100, hpMax)}</strong></div>`;

// 남은 HP: ‘100% · 197/197’. 최대 HP를 모르면 %만.
export const hpText = (pct, hpMax) =>
  hpMax ? `${pct}% · ${Math.max(1, Math.floor((hpMax * pct) / 100))}/${hpMax}` : `${pct}%`;

// 결과. 요약 → 1회 타격. 결정력·내구력은 두 쪽 칸 위에 따로 둔다(powerBox, bulkBox).
export function damageResult(summary, context) {
  const { reference, index, state, speciesLabel } = context;
  const { attacker, defender } = state;
  if (!attacker.pokemon || !defender.pokemon || !attacker.move)
    return '<div class="calc-verdict"><p class="calc-verdict-text">공격 측 포켓몬과 기술, 방어 측 포켓몬을 선택하면 데미지를 확인할 수 있습니다.</p></div>';
  const move = reference.move[attacker.move];
  const person = (key, pokemon) =>
    `<div class="dmg-person"><small>${key === 'attacker' ? '공격 측' : '방어 측'}</small>` +
    `${portrait({ sprite: speciesSprite(reference, index, pokemon) }, 'dmg-portrait')}` +
    `<strong>${esc(speciesLabel(pokemon))}</strong>${typeBadges(reference.species[pokemon].types)}</div>`;
  const verdictText = summary?.reason
    ? summary.reason
    : summary.verdict.chance < 1 && summary.verdict.turns
      ? `${summary.verdict.text} (${percent(summary.verdict.chance * 100)})`
      : summary.verdict.text;
  // 웨더볼·스킨 특성처럼 타입이 바뀌면 바뀐 타입을, 트리플악셀은 타격마다의 위력을 보인다.
  const power = summary?.fixed
    ? '고정'
    : (summary?.basePowers?.join(' · ') ??
      summary?.basePower ??
      (attacker.power || move.power || '—'));
  const head =
    `<div class="dmg-summary">` +
    person('attacker', attacker.pokemon) +
    // 이름표와 값을 한 묶음으로 두고 묶음 사이를 띄운다. 모두 같은 간격이면 어느 값이
    // 어느 이름표의 것인지 흐려진다.
    `<div class="dmg-move">` +
    `<div class="dmg-stat"><strong>${esc(move.label)}</strong>${typeBadges([summary?.moveType ?? move.type])}</div>` +
    `<div class="dmg-stat"><small>기술 위력</small><b>${power}</b></div>` +
    `<div class="dmg-stat"><small>타입 상성</small><b>${summary?.effectiveness ?? '—'}×</b></div>` +
    `<p class="dmg-verdict">${esc(verdictText)}</p></div>` +
    person('defender', defender.pokemon) +
    `</div>`;
  if (!summary || summary.reason) return `<div class="dmg-result">${head}</div>`;
  const hits = summary.hits;
  const ko = koChips(summary.table);
  // 난수 16개는 데미지 범위 아래 ‘상세 보기’를 눌러야 보인다. 타격마다 다르면(부자유친,
  // 트리플악셀, 멀티스케일) 타격마다 한 줄씩.
  const chips = rolls => rolls.map(r => `<span class="dmg-chip">${r}</span>`).join('');
  const same = summary.flow.every(rolls => rolls.join() === summary.flow[0].join());
  const rolls = same
    ? `<small>난수 데미지${hits > 1 ? ' (1타당)' : ''}</small><div class="dmg-chips">${chips(summary.flow[0])}</div>`
    : summary.flow
        .map(
          (r, i) =>
            `<small>난수 데미지 (${i + 1}타째)</small><div class="dmg-chips">${chips(r)}</div>`,
        )
        .join('');
  // 턴 종료 데미지는 공격 데미지와 따로 보인다. 포함한 KO 정보를 한 줄 더 둔다.
  const residualText = summary.residual
    .map(e => `${e.label} ${e.amount > 0 ? '+' : '−'}${Math.abs(e.amount)}`)
    .join(' · ');
  const residualNet = summary.residual.reduce((sum, e) => sum + e.amount, 0);
  const residualBlock = summary.residualTable
    ? `<div class="dmg-row dmg-residual"><span>턴 종료</span><strong>${esc(residualText)}</strong></div>` +
      `<small class="dmg-sub dmg-sub-end">1턴째 합계 ${residualNet > 0 ? '+' : residualNet < 0 ? '−' : ''}${Math.abs(residualNet)} (최대 HP의 ${percent((Math.abs(residualNet) / summary.hpMax) * 100)})</small>` +
      // 1회 공격에 1턴째 턴 종료 데미지를 더한 범위(회복이 더 크면 줄어든다).
      `<div class="dmg-row"><span>데미지 범위 (턴 종료 포함)</span><strong>${summary.min - residualNet} ~ ${summary.max - residualNet} (${percent(((summary.min - residualNet) / summary.hpMax) * 100)} ~ ${percent(((summary.max - residualNet) / summary.hpMax) * 100)})</strong></div>` +
      `<div class="dmg-box is-residual"><small>KO 정보 (턴 종료 데미지 포함) · ${esc(summary.residualVerdict.chance < 1 && summary.residualVerdict.turns ? `${summary.residualVerdict.text} (${percent(summary.residualVerdict.chance * 100)})` : summary.residualVerdict.text)}</small>` +
      `<div class="dmg-chips">${koChips(summary.residualTable)}</div></div>`
    : '';
  const notes = [
    summary.hazard
      ? `설치 기술·반동으로 ${summary.hazard} 데미지를 먼저 받습니다 (남은 HP ${summary.hpStart}/${summary.hpMax}).`
      : '',
    summary.endure ? '기합의띠·옹골참: HP가 가득일 때 한 번은 HP 1로 버팁니다.' : '',
    summary.disguise ? '탈: 첫 공격을 막고 최대 HP의 1/8만 받습니다.' : '',
  ]
    .filter(Boolean)
    .map(text => `<p class="calc-note">${esc(text)}</p>`)
    .join('');
  const noteBlock = notes ? `<div class="dmg-notes">${notes}</div>` : '';
  const detail =
    `<div class="dmg-card">` +
    `<div class="dmg-row"><span>${hits > 1 ? `1회 공격 (${hits}타)` : '1회 공격'}</span><small>${TAKEN_WITH[context.keys.defense]}</small></div>` +
    `<div class="dmg-row"><span>데미지 범위</span><strong>${summary.min} ~ ${summary.max} (${percent(summary.minPercent)} ~ ${percent(summary.maxPercent)})</strong></div>` +
    `<details class="dmg-rolls"${state.rollsOpen ? ' open' : ''}><summary>상세 보기</summary>${rolls}</details>` +
    `<div class="dmg-row"><span>결과</span><strong>${esc(verdictText)}</strong></div>` +
    `<div class="dmg-row"><span>1타 확률</span><strong>${percent((summary.table[0]?.chance ?? 0) * 100)}</strong></div>` +
    `<div class="dmg-box"><small>KO 정보 (공격만)</small><div class="dmg-chips">${ko}</div></div>` +
    residualBlock +
    noteBlock +
    `</div>`;
  return `<div class="dmg-result">${head}${detail}</div>`;
}

// KO 칩. 확정이면 청록, 난수면 주황, 불가면 색 없음.
const koChips = table =>
  table
    .map(row => {
      const text = row.chance >= 1 ? '확정' : row.chance > 0 ? percent(row.chance * 100) : '불가';
      return `<span class="dmg-chip${row.chance >= 1 ? ' is-sure' : row.chance > 0 ? ' is-maybe' : ''}">${row.turns}타 ${text}</span>`;
    })
    .join('');

// 결정력 칸. 기술 칸 위에 두고, 값을 바꾸면 바로 고친다(app.js의 renderDamageResult).
// 방어 측을 고르지 않았어도 공격 실수치 × 위력 × 자속 보정으로 보인다(quickPower).
// 효과가 없거나 실패해도 넣은 값대로의 결정력을 보인다.
export function powerBox(summary, context) {
  if (summary?.fixed)
    return (
      `<div class="dmg-quick"><span>결정력</span><strong>고정 ${summary.fixed}</strong>` +
      `<small>능력치와 배율을 받지 않는 기술입니다.</small></div>`
    );
  const quick = summary?.power != null ? summary : context.quickPower;
  if (!quick)
    return `<div class="dmg-quick"><span>결정력</span><strong>—</strong><small>${
      context.state?.attacker?.move && context.state?.attacker?.pokemon
        ? '위력이 정해지면 보입니다.'
        : '포켓몬과 기술을 선택하면 보입니다.'
    }</small></div>`;
  // 위력을 정한 값(스피드·몸무게)을 위력 바로 뒤 괄호에 둔다.
  const kg = hg => `${hg / 10}kg`;
  const basis = summary?.speeds
    ? ` (스피드 ${summary.speeds.attacker} 대 ${summary.speeds.defender})`
    : summary?.weights
      ? context.conditions?.weight === 'defender'
        ? ` (몸무게 ${kg(summary.weights.defender)})`
        : ` (몸무게 ${kg(summary.weights.attacker)} 대 ${kg(summary.weights.defender)})`
      : '';
  // 위력이 타격마다 다르면(트리플악셀) 모두, 같으면 한 번 쓰고 타수를 곱한다.
  const powers = quick.hitPowers ?? [quick.basePower];
  const varies = powers.some(bp => bp !== powers[0]);
  const hits = powers.length;
  const formula =
    `${STAT_NAMES_KO[context.keys.attack]} ${quick.attackStat} × 위력 ${varies ? powers.join('+') : powers[0]}${basis}` +
    `${quick.stab !== 1 ? ` × 자속 보정 ${quick.stab}` : ''}` +
    `${quick.crit ? ' × 급소 1.5' : ''}` +
    `${hits > 1 && !varies ? ` × ${hits}타` : ''}` +
    `${quick.parentalBond ? ' (두 번째 타격 1/4)' : ''}` +
    // 마지막에 곱하는 도구는 곱으로, 위력·공격에 이미 들어간 도구는 ‘반영’으로 알린다.
    `${quick.itemPower ? ` × ${itemLabel(context.reference, quick.itemPower.id)} ${Math.round(quick.itemPower.factor * 10) / 10}` : ''}` +
    `${quick.itemFolded ? ` (${itemLabel(context.reference, quick.itemFolded)} 반영)` : ''}` +
    `${quick.throughProtect ? ' × 방어 뚫음 0.25' : ''}`;
  return (
    `<div class="dmg-quick"><span>결정력</span><strong>${quick.power.toLocaleString()}</strong>` +
    `<small>${formula}</small></div>`
  );
}

const itemLabel = (reference, id) => esc(reference?.held_item?.[id]?.label ?? id);

// 내구력 칸. HP 칸 위에 두고, 물리·특수를 함께 보인다. 기술이 쓰는 쪽을 굵게 한다.
// HP × 방어(랭크 포함) ÷ 0.411. 도구·특성의 배율은 넣지 않는다.
export function bulkBox(context) {
  const { stats, keys } = context;
  if (!stats.hp)
    return `<div class="dmg-quick"><span>내구력</span><strong>—</strong><small>포켓몬을 선택하면 보입니다.</small></div>`;
  const bulk = key => Math.floor((stats.hp * stats.all[key].staged) / 0.411);
  const part = (key, label) =>
    `<div class="dmg-quick-part${keys.defense === key ? ' is-used' : ''}"><span>${label}</span><strong>${bulk(key).toLocaleString()}</strong></div>`;
  return (
    `<div class="dmg-quick"><span>내구력</span>` +
    `<div class="dmg-quick-pair">${part('def', '물리')}${part('spd', '특수')}</div>` +
    `<small>HP ${stats.hp} × 방어·특수방어 (랭크 포함) ÷ 0.411</small></div>`
  );
}

export function damageCalcView(state, summary, context) {
  const result = damageResult(summary, { ...context, state });
  return (
    `<div class="calc-actions">` +
    `<div class="segmented" role="group" aria-label="배틀 형식">` +
    `<button type="button" data-dmg-format="singles" aria-pressed="${state.format === 'singles'}">싱글</button>` +
    `<button type="button" data-dmg-format="doubles" aria-pressed="${state.format === 'doubles'}">더블</button></div>` +
    `<button type="button" class="text-button" data-dmg-swap>교체</button>` +
    `<button type="button" class="text-button" data-dmg-reset>초기화</button></div>` +
    // 값을 바꾸면 바로 계산되므로 결과는 입력 칸 아래 한 곳에만 둔다.
    `<div class="calc-sides">` +
    attackerPanel(state, { ...context, summary, stats: context.attackerStats }) +
    defenderPanel(state, { ...context, summary, stats: context.defenderStats }) +
    `</div>` +
    `<div data-dmg-result>${result}</div>` +
    `<p class="speed-help">Showdown과 같은 순서로 계산합니다. 위력이 상황에 따라 바뀌는 기술과 특성은 ‘위력 조건’ 칸이 나타나고, 위력을 직접 넣으면 그 값을 사용합니다. 결정력은 공격 실수치 × 위력 × 자속 보정, 내구력은 HP × 방어 ÷ 0.411입니다.</p>`
  );
}
