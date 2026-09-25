// 계산기 화면의 마크업. 문자열만 만들고 DOM을 만지지 않는다. 배선은 app.js가 한다.
import { esc } from './html.js';
import { portrait } from './app-view.js';
import { speciesSprite } from './images.js';
import {
  SPEED_ABILITIES,
  SPEED_ITEMS,
  WEATHERS,
  TERRAINS,
  STATUSES,
  NATURE_FACTORS,
} from './speed-calc.js';

const SIDE_TITLES = { mine: '내 포켓몬', theirs: '상대 포켓몬' };
const NATURE_LABELS = { 9: '×0.9', 10: '×1.0', 11: '×1.1' };

// 이 작품에 아직 없는 특성·도구도 고를 수 있게 두되 표시한다.
const nameOf = (reference, kind, id) => {
  const record = reference?.[kind]?.[id];
  const label = record?.label ?? record?.name ?? id;
  return record?.champions === false ? `${label} (미수록)` : label;
};

const options = (entries, selected) =>
  entries
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`,
    )
    .join('');

// 포켓몬을 골랐으면 그 포켓몬이 가질 수 있는 특성 중 스피드를 바꾸는 것만 보인다.
// 고르지 않았으면 전부 보인다.
export function abilityChoices(reference, pokemon) {
  const species = reference?.species?.[pokemon];
  const own = species
    ? species.abilities.map(name => name.toLowerCase().replace(/[^a-z0-9]/g, ''))
    : Object.keys(SPEED_ABILITIES);
  return own.filter(id => SPEED_ABILITIES[id]);
}

export const itemChoices = pokemon =>
  Object.keys(SPEED_ITEMS).filter(
    id => !SPEED_ITEMS[id].species || !pokemon || SPEED_ITEMS[id].species === pokemon,
  );

// 특성이 켜고 끄는 조건을 가지면 그 조건을 칸으로 둔다.
const abilityToggle = ability => {
  const rule = SPEED_ABILITIES[ability];
  if (!rule) return null;
  if (rule.toggle) return rule.toggle;
  if (rule.highest) return '스피드가 가장 높은 능력치';
  return null;
};

// 결과 아래에 적는 근거. 배수가 1이면 적지 않는다.
const effectText = (reference, result) =>
  [
    ...result.effects.map(e => {
      const kind = e.kind === 'move' ? 'move' : e.kind === 'item' ? 'held_item' : 'ability';
      return `${nameOf(reference, kind, e.id)} ×${e.factor}`;
    }),
    ...(result.paralyzed ? ['마비 ×0.5'] : []),
    ...(result.multiplier !== 1 ? [`배수 ×${result.multiplier}`] : []),
  ].join(' · ');

const staged = result => (result ? result.staged : '—');

// 포켓몬과 샘플은 내 샘플과 같은 선택 창에서 고른다(app.js의 openPicker).
function sidePanel(key, side, result, { reference, index, field, speciesLabel }) {
  const species = reference.species[side.pokemon];
  const abilities = abilityChoices(reference, side.pokemon);
  const toggle = abilityToggle(side.ability);
  const title = SIDE_TITLES[key];
  return (
    `<section class="calc-side" data-calc-side="${key}">` +
    `<div class="calc-side-head">` +
    `${portrait({ sprite: speciesSprite(reference, index, side.pokemon) }, 'calc-portrait')}` +
    `<div><h3>${title}</h3>` +
    `<small>${species ? `${esc(speciesLabel(side.pokemon))} · 스피드 종족값 ${species.stats.spe}` : '포켓몬을 선택하세요'}</small></div></div>` +
    `<div class="calc-picks">` +
    `${key === 'mine' ? '<button type="button" class="builds-pick" data-calc-pick="member">샘플 불러오기</button>' : ''}` +
    `<button type="button" class="builds-pick" data-calc-pick="species">${species ? esc(speciesLabel(side.pokemon)) : '포켓몬 선택'}</button>` +
    `</div>` +
    `<fieldset class="calc-group"><legend>스피드 수치</legend>` +
    `<div class="calc-line"><span>능력 포인트</span>` +
    `<input type="number" min="0" max="32" step="1" value="${side.points}" data-calc-field="points" aria-label="${title} 스피드 능력 포인트">` +
    `<button type="button" class="calc-step" data-calc-points="0">0</button>` +
    `<button type="button" class="calc-step" data-calc-points="32">최대</button></div>` +
    `<div class="calc-line"><span>성격 (능력 보정)</span><div class="calc-choices" role="group" aria-label="${title} 성격 (능력 보정)">` +
    NATURE_FACTORS.map(
      n =>
        `<button type="button" data-calc-nature="${n}" aria-pressed="${side.nature === n}">${NATURE_LABELS[n]}</button>`,
    ).join('') +
    `</div></div>` +
    `<div class="calc-line"><span>실수치</span><strong data-calc-out="stat">${result?.stat ?? '—'}</strong></div>` +
    `</fieldset>` +
    // 랭크는 실수치 자체를 바꾸지 않는다. 따로 두고 랭크를 곱한 값을 곁에 보인다.
    `<fieldset class="calc-group"><legend>랭크</legend>` +
    `<div class="calc-line"><span>랭크</span>` +
    `<button type="button" class="calc-step" data-calc-stage="-1" aria-label="${title} 랭크 내리기">−</button>` +
    `<output class="calc-stage">${side.stage > 0 ? '+' : ''}${side.stage}</output>` +
    `<button type="button" class="calc-step" data-calc-stage="1" aria-label="${title} 랭크 올리기">+</button></div>` +
    `<div class="calc-line"><span>랭크 적용</span><strong data-calc-out="staged">${staged(result)}</strong></div>` +
    `</fieldset>` +
    `<fieldset class="calc-group"><legend>특성 · 도구</legend><div class="calc-grid">` +
    `<label class="calc-field">특성<select data-calc-field="ability"${abilities.length ? '' : ' disabled'}>` +
    options(
      [
        ['', abilities.length ? '없음' : '스피드 영향 없음'],
        ...abilities.map(id => [id, nameOf(reference, 'ability', id)]),
      ],
      side.ability,
    ) +
    `</select></label>` +
    `<label class="calc-field">도구<select data-calc-field="item">` +
    options(
      [
        ['', '없음'],
        ...itemChoices(side.pokemon).map(id => [id, nameOf(reference, 'held_item', id)]),
      ],
      side.item,
    ) +
    `</select></label></div>` +
    // 특성이 켜고 끄는 조건을 가지면 그 칸을 선택 칸들 아래에 둔다.
    `${toggle ? `<label class="calc-check"><input type="checkbox" data-calc-field="abilityOn"${side.abilityOn ? ' checked' : ''}>${esc(toggle)}</label>` : ''}` +
    `</fieldset>` +
    // 날씨와 필드는 양쪽이 같은 값을 공유한다. 어느 쪽에서 바꿔도 둘 다 바뀐다.
    `<fieldset class="calc-group"><legend>상태 · 날씨 · 필드</legend><div class="calc-grid">` +
    `<label class="calc-field">상태이상<select data-calc-field="status">${options(Object.entries(STATUSES), side.status)}</select></label>` +
    `<label class="calc-field">날씨<select data-calc-field="weather">${options(Object.entries(WEATHERS), field.weather)}</select></label>` +
    `<label class="calc-field">필드<select data-calc-field="terrain">${options(Object.entries(TERRAINS), field.terrain)}</select></label>` +
    `</div>` +
    `<label class="calc-check"><input type="checkbox" data-calc-field="tailwind"${side.tailwind ? ' checked' : ''}>순풍 (×2)</label>` +
    `</fieldset>` +
    // 예상하지 못한 배율이나 직접 계산하고 싶은 배율을 넣는다. 맨 마지막에 곱한다.
    `<fieldset class="calc-group"><legend>배수</legend>` +
    `<div class="calc-line"><span>배수</span>` +
    `<input type="number" min="0" step="0.1" value="${side.multiplier}" data-calc-field="multiplier" aria-label="${title} 배수"></div>` +
    `</fieldset>` +
    `<p class="calc-final"><span>최종 스피드</span><strong data-calc-out="final">${result?.speed ?? '—'}</strong>` +
    `<small data-calc-out="effects">${esc(result ? effectText(reference, result) : '')}</small></p>` +
    `</section>`
  );
}

const VERDICT = {
  faster: '내 포켓몬이 먼저 행동합니다.',
  slower: '상대 포켓몬이 먼저 행동합니다.',
  tie: '스피드가 같습니다. 매 턴 무작위로 정해집니다.',
};

export function speedVerdict(mine, theirs, order) {
  if (!mine || !theirs)
    return '<p class="calc-verdict-text">양쪽 포켓몬을 선택하면 누가 먼저 행동하는지 보여줍니다.</p>';
  return (
    `<div class="calc-verdict-speeds"><span>내 포켓몬 <strong>${mine.speed}</strong></span>` +
    `<span>상대 포켓몬 <strong>${theirs.speed}</strong></span></div>` +
    `<p class="calc-verdict-text is-${order}">${VERDICT[order]}</p>`
  );
}

// 결과는 위아래 두 곳에 같게 둔다. 폰에서는 두 칸이 세로로 쌓여 스크롤이 길다.
const verdictBox = (results, order) =>
  `<div class="calc-verdict" data-calc-verdict role="status">${speedVerdict(results.mine, results.theirs, order)}</div>`;

export function speedCalcView(state, results, order, context) {
  return (
    // 교체·초기화는 탭 바로 아래, 결과보다 위에 둔다.
    `<div class="calc-actions">` +
    `<button type="button" class="text-button" data-calc-swap>교체</button>` +
    `<button type="button" class="text-button" data-calc-reset>초기화</button></div>` +
    verdictBox(results, order) +
    `<div class="calc-sides">` +
    sidePanel('mine', state.mine, results.mine, { ...context, field: state.field }) +
    sidePanel('theirs', state.theirs, results.theirs, { ...context, field: state.field }) +
    `</div>` +
    verdictBox(results, order).replace('role="status"', '') +
    `<p class="speed-help">특성·도구·순풍의 배율은 한 번에 곱한 뒤 반올림하고, 마비는 그 뒤에 절반, 배수는 맨 마지막에 곱합니다.</p>`
  );
}

export { effectText };
