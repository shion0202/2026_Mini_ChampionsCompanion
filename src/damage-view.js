// 데미지 계산기 화면. 문자열만 만든다. 배선은 app.js가 한다.
// 입력은 스피드 계산기(calc-view.js)와 같은 틀이고, 결과는 요약 → 결정력·내구력 →
// 1회 타격(범위·결과·KO 정보·난수) 순서다.
import { esc } from './html.js';
import { portrait, typeBadges } from './app-view.js';
import { speciesSprite } from './images.js';
import { TYPE_LABELS } from './locale.js';
import { CATEGORY_NAMES } from './reference-view.js';
import { WEATHERS, TERRAINS, STATUSES, NATURE_FACTORS } from './speed-calc.js';
import { MOVE_STATS, MOVE_CONDITIONS, ABILITY_CONDITIONS } from './damage-calc.js';

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
};
const COUNT_FIELDS = {
  timesHit: { label: '공격받은 횟수', max: 6 },
  fainted: { label: '쓰러진 아군 수', max: 5 },
  boostTotal: { label: '올라간 랭크 합계', max: 42 },
};
const SPIKES = [
  ['0', '없음'],
  ['1', '1겹'],
  ['2', '2겹'],
  ['3', '3겹'],
];

// 이 기술과 특성이 묻는 조건. 둘이 같은 것을 물으면 한 번만 보인다.
export function conditionsOf(moveId, ability) {
  const list = [MOVE_CONDITIONS[moveId], ABILITY_CONDITIONS[ability]].filter(Boolean);
  return {
    toggles: [...new Set(list.map(c => c.toggle).filter(Boolean))],
    counts: [...new Set(list.map(c => c.count).filter(Boolean))],
    hp: list.some(c => c.hp),
    speed: list.some(c => c.speed),
    weight: list.some(c => c.weight),
  };
}

// 기술에 따라 쓰는 능력치. 기술을 고르지 않았으면 물리로 본다.
export function statKeys(move) {
  const special = MOVE_STATS[move?.id] ?? {};
  const physical = move?.category !== 'Special';
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
function rankGroup(title, side, key, staged) {
  const stage = side.stages?.[key] ?? 0;
  return (
    `<fieldset class="calc-group"><legend>${esc(title)} 랭크</legend>` +
    `<div class="calc-line"><span>랭크</span>` +
    `<button type="button" class="calc-step" data-dmg-stage="${key}:-1" aria-label="${esc(title)} 랭크 내리기">−</button>` +
    `<output class="calc-stage">${stage > 0 ? '+' : ''}${stage}</output>` +
    `<button type="button" class="calc-step" data-dmg-stage="${key}:1" aria-label="${esc(title)} 랭크 올리기">+</button></div>` +
    `<div class="calc-line"><span>랭크 적용</span><strong data-dmg-staged="${key}">${staged ?? '—'}</strong></div>` +
    `</fieldset>`
  );
}

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

const itemPick = (side, reference) =>
  `<label class="calc-field">도구<button type="button" class="builds-pick" data-dmg-pick="item">` +
  `${side.item ? esc(reference.held_item[side.item]?.label ?? side.item) : '도구 선택'}</button></label>` +
  `${side.item ? '<button type="button" class="text-button calc-clear" data-dmg-clear="item">도구 비우기</button>' : ''}`;

function attackerPanel(state, context) {
  const { reference, index, speciesLabel, stats } = context;
  const side = state.attacker;
  const move = side.move ? reference.move[side.move] : null;
  const keys = statKeys(move ? { ...move, id: side.move } : null);
  const doubles = state.format === 'doubles';
  const attackTitle = keys.fromDefender
    ? '공격 수치 (속임수: 상대의 공격을 씁니다)'
    : `${STAT_NAMES_KO[keys.attack]} 수치`;
  return (
    `<section class="calc-side" data-dmg-side="attacker">` +
    head('공격 측', reference, index, side.pokemon, speciesLabel) +
    picks(side, reference, speciesLabel) +
    `<div data-dmg-quick="power">${powerBox(context.summary, context)}</div>` +
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
    `<div class="calc-line"><span>타수</span>` +
    `<input type="number" min="1" max="10" step="1" value="${side.hits ?? ''}" placeholder="${context.defaultHits}" data-dmg-number="hits" aria-label="타수"></div>` +
    check('crit', side.crit, '급소') +
    `${doubles ? check('spread', context.spread, '전체기 (×0.75)') : ''}` +
    `</fieldset>` +
    `<fieldset class="calc-group"><legend>${esc(attackTitle)}</legend>` +
    (keys.fromDefender
      ? '<p class="calc-note">방어 측의 공격 능력 포인트·성격·랭크를 씁니다.</p>'
      : statBlock(STAT_NAMES_KO[keys.attack], side, keys.attack, stats.attack)) +
    `</fieldset>` +
    (keys.fromDefender
      ? ''
      : rankGroup(STAT_NAMES_KO[keys.attack], side, keys.attack, stats.staged)) +
    speedGroups(side, context.conditions, stats) +
    `<fieldset class="calc-group"><legend>특성 · 도구</legend><div class="calc-grid">` +
    abilitySelect(side, reference) +
    itemPick(side, reference) +
    `</div></fieldset>` +
    conditionGroup(side, context.conditions, stats.hp) +
    `<fieldset class="calc-group"><legend>상태 · 날씨 · 필드</legend><div class="calc-grid">` +
    `<label class="calc-field">상태이상<select data-dmg-field="status">${options(Object.entries(STATUSES), side.status)}</select></label>` +
    `<label class="calc-field">날씨<select data-dmg-field="weather">${options(Object.entries(WEATHERS), state.field.weather)}</select></label>` +
    `<label class="calc-field">필드<select data-dmg-field="terrain">${options(Object.entries(TERRAINS), state.field.terrain)}</select></label>` +
    `</div>` +
    check('charge', side.charge, '충전 (전기 기술 ×2)') +
    `${doubles ? check('helpingHand', side.helpingHand, '도우미 (×1.5)') : ''}` +
    `</fieldset>` +
    `</section>`
  );
}

// 기술·특성이 묻는 조건(대가의 행동 순서, 분노의주먹의 맞은 횟수, 분화의 남은 HP 등).
// 묻는 것이 없으면 칸을 두지 않는다.
function conditionGroup(side, conditions, hpMax) {
  const { toggles, counts, hp } = conditions;
  if (!toggles.length && !counts.length && !hp) return '';
  return (
    `<fieldset class="calc-group"><legend>위력 조건</legend>` +
    (hp ? hpSlider(side, hpMax, '공격 측 남은 HP 비율') : '') +
    counts
      .map(
        key =>
          `<div class="calc-line"><span>${COUNT_FIELDS[key].label}</span>` +
          `<input type="number" min="0" max="${COUNT_FIELDS[key].max}" step="1" value="${side[key] ?? 0}" data-dmg-number="${key}" aria-label="${COUNT_FIELDS[key].label}"></div>`,
      )
      .join('') +
    toggles.map(key => check(key, side[key], TOGGLE_LABELS[key])).join('') +
    `</fieldset>`
  );
}

// 자이로볼·일렉트릭볼은 두 쪽 스피드로 위력이 정해진다. 그때만 보인다.
const speedGroups = (side, conditions, stats) =>
  conditions.speed
    ? `<fieldset class="calc-group"><legend>스피드 수치</legend>${statBlock('스피드', side, 'spe', stats.speed)}</fieldset>` +
      rankGroup('스피드', side, 'spe', stats.speedStaged)
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
    `<fieldset class="calc-group"><legend>HP 수치</legend>` +
    statBlock('HP', side, 'hp', stats.hp) +
    hpSlider(side, stats.hp, '방어 측 남은 HP 비율') +
    `</fieldset>` +
    `<fieldset class="calc-group"><legend>방어 수치</legend>` +
    `<div class="calc-line"><span>입력할 능력</span><div class="calc-choices" role="group" aria-label="입력할 방어 능력">` +
    ['def', 'spd']
      .map(
        key =>
          `<button type="button" data-dmg-defense-view="${key}" aria-pressed="${view === key}">${STAT_NAMES_KO[key]}</button>`,
      )
      .join('') +
    `</div></div>` +
    statBlock(name, side, view, stats.defenses[view].actual) +
    (view === keys.defense
      ? ''
      : `<p class="calc-note">지금 기술은 ${TAKEN_WITH[keys.defense]}합니다.</p>`) +
    `</fieldset>` +
    rankGroup(name, side, view, stats.defenses[view].staged) +
    (keys.fromDefender
      ? `<fieldset class="calc-group"><legend>공격 수치 (속임수)</legend>${statBlock('공격', side, 'atk', stats.foul)}</fieldset>` +
        rankGroup('공격', side, 'atk', stats.foulStaged)
      : '') +
    speedGroups(side, context.conditions, stats) +
    `<fieldset class="calc-group"><legend>특성 · 도구</legend><div class="calc-grid">` +
    abilitySelect(side, reference) +
    itemPick(side, reference) +
    `</div></fieldset>` +
    // 방어 측 상태이상은 병상첨병·베놈쇼크 같은 기술과 이상한비늘이 본다.
    // 설치 기술은 교체해 나올 때 받으므로 남은 HP에서 먼저 뺀다.
    `<fieldset class="calc-group"><legend>상태 · 벽 · 설치 기술</legend><div class="calc-grid">` +
    `<label class="calc-field">상태이상<select data-dmg-field="status">${options(Object.entries(STATUSES), side.status ?? '')}</select></label>` +
    `<label class="calc-field">압정뿌리기<select data-dmg-field="spikes">${options(SPIKES, String(side.spikes ?? 0))}</select></label>` +
    `</div>` +
    check('stealthRock', side.stealthRock, '스텔스록') +
    check('reflect', side.reflect, '리플렉터') +
    check('lightScreen', side.lightScreen, '빛의장막') +
    check('auroraVeil', side.auroraVeil, '오로라베일') +
    `${doubles ? check('friendGuard', side.friendGuard, '프렌드가드 (×0.75)') : ''}` +
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
  const ko = summary.table
    .map(row => {
      const text = row.chance >= 1 ? '확정' : row.chance > 0 ? percent(row.chance * 100) : '불가';
      return `<span class="dmg-chip${row.chance >= 1 ? ' is-sure' : row.chance > 0 ? ' is-maybe' : ''}">${row.turns}타 ${text}</span>`;
    })
    .join('');
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
  const notes = [
    summary.hazard
      ? `설치 기술로 ${summary.hazard} 데미지를 먼저 받습니다 (남은 HP ${summary.hpStart}/${summary.hpMax}).`
      : '',
    summary.endure ? '기합의띠·옹골참: HP가 가득일 때 한 번은 HP 1로 버팁니다.' : '',
    summary.disguise ? '탈: 첫 공격을 막고 최대 HP의 1/8만 받습니다.' : '',
  ]
    .filter(Boolean)
    .map(text => `<p class="calc-note">${esc(text)}</p>`)
    .join('');
  const detail =
    `<div class="dmg-card">` +
    `<div class="dmg-row"><span>${hits > 1 ? `1회 공격 (${hits}타)` : '1회 공격'}</span><small>${TAKEN_WITH[context.keys.defense]}</small></div>` +
    `<div class="dmg-row"><span>데미지 범위</span><strong>${summary.min} ~ ${summary.max} (${percent(summary.minPercent)} ~ ${percent(summary.maxPercent)})</strong></div>` +
    `<details class="dmg-rolls"${state.rollsOpen ? ' open' : ''}><summary>상세 보기</summary>${rolls}</details>` +
    `<div class="dmg-row"><span>결과</span><strong>${esc(verdictText)}</strong></div>` +
    `<div class="dmg-row"><span>1타 확률</span><strong>${percent((summary.table[0]?.chance ?? 0) * 100)}</strong></div>` +
    `<div class="dmg-box"><small>KO 정보</small><div class="dmg-chips">${ko}</div></div>` +
    notes +
    `</div>`;
  return `<div class="dmg-result">${head}${detail}</div>`;
}

// 결정력 칸. 기술 칸 위에 두고, 값을 바꾸면 바로 고친다(app.js의 renderDamageResult).
// 방어 측을 고르지 않았어도 공격 실수치 × 위력 × 자속 보정으로 보인다(quickPower).
export function powerBox(summary, context) {
  if (summary?.fixed)
    return (
      `<div class="dmg-quick"><span>결정력</span><strong>고정 ${summary.fixed}</strong>` +
      `<small>능력치와 배율을 받지 않는 기술입니다.</small></div>`
    );
  const quick = summary?.power != null ? summary : context.quickPower;
  if (!quick)
    return `<div class="dmg-quick"><span>결정력</span><strong>—</strong><small>포켓몬과 기술을 선택하면 보입니다.</small></div>`;
  const hits = summary?.hits ?? 1;
  // 위력을 정한 값(스피드·무게)도 함께 보인다.
  const basis = summary?.speeds
    ? ` · 스피드 ${summary.speeds.attacker} 대 ${summary.speeds.defender}`
    : summary?.weights
      ? ` · 무게 ${summary.weights.attacker / 10}kg 대 ${summary.weights.defender / 10}kg`
      : '';
  return (
    `<div class="dmg-quick"><span>결정력</span><strong>${quick.power.toLocaleString()}</strong>` +
    `<small>${STAT_NAMES_KO[context.keys.attack]} ${quick.attackStat} × 위력 ${quick.basePower}` +
    `${quick.stab !== 1 ? ` × 자속 보정 ${quick.stab}` : ''}${hits > 1 ? ` · 타격당, ${hits}회` : ''}${basis}</small></div>`
  );
}

// 내구력 칸. HP 칸 위에 두고, 물리·특수를 함께 보인다. 기술이 쓰는 쪽을 굵게 한다.
// HP × 방어(랭크 포함) ÷ 0.411. 도구·특성의 배율은 넣지 않는다.
export function bulkBox(context) {
  const { stats, keys } = context;
  if (!stats.hp)
    return `<div class="dmg-quick"><span>내구력</span><strong>—</strong><small>포켓몬을 선택하면 보입니다.</small></div>`;
  const bulk = key => Math.floor((stats.hp * stats.defenses[key].staged) / 0.411);
  const part = (key, label) =>
    `<div class="dmg-quick-part${keys.defense === key ? ' is-used' : ''}"><span>${label}</span><strong>${bulk(key).toLocaleString()}</strong></div>`;
  return (
    `<div class="dmg-quick"><span>내구력</span>` +
    `<div class="dmg-quick-pair">${part('def', '물리')}${part('spd', '특수')}</div>` +
    `<small>HP ${stats.hp} × 방어·특수방어(랭크 포함) ÷ 0.411</small></div>`
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
    `<p class="speed-help">Showdown과 같은 순서로 계산합니다. 위력이 상황에 따라 바뀌는 기술과 특성은 ‘위력 조건’ 칸이 나타나고, 위력을 직접 넣으면 그 값을 씁니다. 결정력은 공격 실수치 × 위력 × 자속 보정, 내구력은 HP × 방어 ÷ 0.411입니다.</p>`
  );
}
