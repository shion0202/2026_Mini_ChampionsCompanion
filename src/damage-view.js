// 데미지 계산기 화면. 문자열만 만든다. 배선은 app.js가 한다.
// 입력은 스피드 계산기(calc-view.js)와 같은 틀이고, 결과는 요약 → 결정력·내구력 →
// 1회 타격(범위·결과·KO 정보·난수) 순서다.
import { esc } from './html.js';
import { portrait, typeBadges } from './app-view.js';
import { speciesSprite } from './images.js';
import { TYPE_LABELS } from './locale.js';
import { CATEGORY_NAMES } from './reference-view.js';
import { WEATHERS, TERRAINS, STATUSES, NATURE_FACTORS } from './speed-calc.js';
import { MOVE_STATS } from './damage-calc.js';

// 조사를 이름에 붙여 만들지 않는다. ‘방어으로’처럼 틀린다.
const TAKEN_WITH = { def: '방어로 계산', spd: '특수방어로 계산' };
export const STAT_NAMES_KO = {
  hp: 'HP',
  atk: '공격',
  def: '방어',
  spa: '특수공격',
  spd: '특수방어',
};
const NATURE_LABELS = { 9: '×0.9', 10: '×1.0', 11: '×1.1' };
const PINCH = ['overgrow', 'blaze', 'torrent', 'swarm'];

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
    `<div class="calc-line"><span>실수치</span><strong>${actual ?? '—'}</strong></div>`
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
    `<div class="calc-line"><span>랭크 적용</span><strong>${staged ?? '—'}</strong></div>` +
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
    `<fieldset class="calc-group"><legend>특성 · 도구</legend><div class="calc-grid">` +
    abilitySelect(side, reference) +
    itemPick(side, reference) +
    `</div>` +
    `${PINCH.includes(side.ability) ? check('pinch', side.pinch, 'HP 1/3 이하') : ''}` +
    `</fieldset>` +
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

function defenderPanel(state, context) {
  const { reference, index, speciesLabel, stats, keys } = context;
  const side = state.defender;
  const doubles = state.format === 'doubles';
  const defenseTitle = `${STAT_NAMES_KO[keys.defense]} 수치`;
  return (
    `<section class="calc-side" data-dmg-side="defender">` +
    head('방어 측', reference, index, side.pokemon, speciesLabel) +
    picks(side, reference, speciesLabel) +
    `<fieldset class="calc-group"><legend>HP 수치</legend>` +
    statBlock('HP', side, 'hp', stats.hp) +
    // 남은 HP는 %와 실제 값을 함께 보인다. 옮기는 동안 app.js가 글자만 고친다(data-hp-max).
    `<div class="calc-line"><span>남은 HP</span>` +
    `<input type="range" min="1" max="100" step="1" value="${side.hpPercent}" data-dmg-number="hpPercent" aria-label="남은 HP 비율">` +
    `<strong data-dmg-out="hpPercent" data-hp-max="${stats.hp ?? ''}">${hpText(side.hpPercent, stats.hp)}</strong></div>` +
    `</fieldset>` +
    `<fieldset class="calc-group"><legend>${esc(defenseTitle)}</legend>` +
    statBlock(STAT_NAMES_KO[keys.defense], side, keys.defense, stats.defense) +
    `</fieldset>` +
    rankGroup(STAT_NAMES_KO[keys.defense], side, keys.defense, stats.staged) +
    (keys.fromDefender
      ? `<fieldset class="calc-group"><legend>공격 수치 (속임수)</legend>${statBlock('공격', side, 'atk', stats.foul)}</fieldset>` +
        rankGroup('공격', side, 'atk', stats.foulStaged)
      : '') +
    `<fieldset class="calc-group"><legend>특성 · 도구</legend><div class="calc-grid">` +
    abilitySelect(side, reference) +
    itemPick(side, reference) +
    `</div></fieldset>` +
    // 방어 측 상태이상은 병상첨병·베놈쇼크 같은 기술과 이상한비늘이 본다.
    `<fieldset class="calc-group"><legend>상태 · 벽 · 부가효과</legend>` +
    `<label class="calc-field">상태이상<select data-dmg-field="status">${options(Object.entries(STATUSES), side.status ?? '')}</select></label>` +
    check('reflect', side.reflect, '리플렉터') +
    check('lightScreen', side.lightScreen, '빛의장막') +
    check('auroraVeil', side.auroraVeil, '오로라베일') +
    `${doubles ? check('friendGuard', side.friendGuard, '프렌드가드 (×0.75)') : ''}` +
    `</fieldset>` +
    `</section>`
  );
}

const percent = value => `${value.toFixed(1)}%`;

// 남은 HP: ‘100% · 197/197’. 최대 HP를 모르면 %만.
export const hpText = (pct, hpMax) =>
  hpMax ? `${pct}% · ${Math.max(1, Math.floor((hpMax * pct) / 100))}/${hpMax}` : `${pct}%`;

// 결과. 요약 → 결정력·내구력 → 1회 타격.
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
  const head =
    `<div class="dmg-summary">` +
    person('attacker', attacker.pokemon) +
    // 이름표와 값을 한 묶음으로 두고 묶음 사이를 띄운다. 모두 같은 간격이면 어느 값이
    // 어느 이름표의 것인지 흐려진다.
    `<div class="dmg-move">` +
    `<div class="dmg-stat"><strong>${esc(move.label)}</strong>${typeBadges([move.type])}</div>` +
    `<div class="dmg-stat"><small>기술 위력</small><b>${summary?.basePower ?? (attacker.power || move.power || '—')}</b></div>` +
    `<div class="dmg-stat"><small>타입 상성</small><b>${summary?.effectiveness ?? '—'}×</b></div>` +
    `<p class="dmg-verdict">${esc(verdictText)}</p></div>` +
    person('defender', defender.pokemon) +
    `</div>`;
  if (!summary || summary.reason) return `<div class="dmg-result">${head}</div>`;
  const hits = summary.hits;
  const power =
    `<div class="dmg-card">` +
    `<div class="dmg-row"><span>공격 측 결정력</span><strong>${summary.power.toLocaleString()}</strong></div>` +
    `<small class="dmg-sub">${STAT_NAMES_KO[context.keys.attack]} 실수치 ${summary.attackStat} × 위력 ${summary.basePower}${summary.stab !== 1 ? ` × 자속 보정 ${summary.stab}` : ''}${hits > 1 ? ` · 타격당, ${hits}회` : ''}</small>` +
    `<div class="dmg-row"><span>방어 측 ${STAT_NAMES_KO[context.keys.defense]} 내구력</span><strong>${summary.bulk.toLocaleString()}</strong></div>` +
    `<small class="dmg-sub">물리 내구력 ${summary.bulks.def.toLocaleString()} · 특수 내구력 ${summary.bulks.spd.toLocaleString()} · HP ${summary.hpNow}/${summary.hpMax}</small>` +
    `</div>`;
  const ko = summary.table
    .map(row => {
      const text = row.chance >= 1 ? '확정' : row.chance > 0 ? percent(row.chance * 100) : '불가';
      return `<span class="dmg-chip${row.chance >= 1 ? ' is-sure' : row.chance > 0 ? ' is-maybe' : ''}">${row.turns}타 ${text}</span>`;
    })
    .join('');
  // 난수 16개는 데미지 범위 아래 ‘상세 보기’를 눌러야 보인다.
  const rolls = summary.rolls.map(r => `<span class="dmg-chip">${r}</span>`).join('');
  const detail =
    `<div class="dmg-card">` +
    `<div class="dmg-row"><span>${hits > 1 ? `1회 공격 (${hits}타)` : '1회 공격'}</span><small>${TAKEN_WITH[context.keys.defense]}</small></div>` +
    `<div class="dmg-row"><span>데미지 범위</span><strong>${summary.min} ~ ${summary.max} (${percent(summary.minPercent)} ~ ${percent(summary.maxPercent)})</strong></div>` +
    `<details class="dmg-rolls"${state.rollsOpen ? ' open' : ''}><summary>상세 보기</summary>` +
    `<small>난수 데미지${hits > 1 ? ' (1타당)' : ''}</small><div class="dmg-chips">${rolls}</div></details>` +
    `<div class="dmg-row"><span>결과</span><strong>${esc(verdictText)}</strong></div>` +
    `<div class="dmg-row"><span>1타 확률</span><strong>${percent((summary.table[0]?.chance ?? 0) * 100)}</strong></div>` +
    `<div class="dmg-box"><small>KO 정보</small><div class="dmg-chips">${ko}</div></div>` +
    `</div>`;
  return `<div class="dmg-result">${head}${power}${detail}</div>`;
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
    `<div data-dmg-result>${result}</div>` +
    `<div class="calc-sides">` +
    attackerPanel(state, { ...context, stats: context.attackerStats }) +
    defenderPanel(state, { ...context, stats: context.defenderStats }) +
    `</div>` +
    `<div data-dmg-result>${result}</div>` +
    `<p class="speed-help">Showdown과 같은 순서로 계산합니다. 위력이 상황에 따라 바뀌는 기술(파워트립, 웨더볼 등)은 위력을 직접 넣어 주세요. 결정력은 공격 실수치 × 위력 × 자속 보정, 내구력은 HP × 방어 ÷ 0.411입니다.</p>`
  );
}
