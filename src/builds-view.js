// 샘플과 파티 화면의 마크업. app-view.js와 같이 문자열만 만들고 DOM을 만지지
// 않으므로 브라우저 없이 스냅샷으로 비교한다.
import { esc } from './html.js';
import { toId, STAT_LABELS, matchesQuery } from './data.js';
import { portrait, typeBadges } from './app-view.js';
import { spreadLabel } from './reference.js';
import {
  NATURES,
  natureAdjust,
  abilityOptions,
  itemOptions,
  speciesSprite,
  actualStats,
} from './builds.js';
import { STAT_NAMES } from './locale.js';

// 도감 화면과 같은 규칙이다(app-view.js). reference가 기술·특성·도구 모두의
// 한국어 이름을 갖고 있고 ko.json은 일부가 비어 있으므로 reference를 먼저 본다.
// ko.json만 보면 메가스톤 45개 등이 영문으로 떨어진다.
const refLabel = (reference, locale, category, name) =>
  reference?.[category]?.[toId(name)]?.label ?? locale.label(category, name);

// 명사를 조사가 붙은 문장에 끼워넣지 않는다. '샘플이'는 맞지만 '파티이'는 틀린다.
// 다른 뷰 모듈도 맥락마다 문장을 통으로 적는다.
const empty = (message, action, label) =>
  `<div class="empty-state"><p>${message}</p>` +
  `<button class="text-button" data-builds-new="${action}">${label}</button></div>`;

const speciesLabel = (locale, reference, id) => {
  const species = reference?.species?.[id];
  return species ? locale.pokemon(species.name).label : (id ?? '포켓몬 선택');
};

// 성격은 한국어 이름과 보정을 함께 보여준다. 이름만으로는 무엇이 오르내리는지
// 바로 읽히지 않는다.
const natureLabel = (locale, id) => {
  if (!id) return '능력 보정 선택';
  const [up, down] = natureAdjust(id);
  const name = locale.label('stat_alignment', id);
  if (!up) return `${name} (무보정)`;
  return `${name} (${STAT_NAMES[up]} ↑ ${STAT_NAMES[down]} ↓)`;
};

// 성격은 보정을 기준으로 정렬한다. 가나다순이면 원하는 보정을 찾으려고 목록을
// 처음부터 훑어야 한다. 올리는 능력을 공격·방어·특공·특방·스피드 순으로 묶고
// 그 안에서 내리는 능력을 같은 순서로 둔다. 보정이 없는 성격은 맨 뒤로 보낸다.
// 저장은 id로 한다.
const ADJUST_ORDER = ['Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
const adjustRank = stat => {
  const at = ADJUST_ORDER.indexOf(stat);
  return at === -1 ? ADJUST_ORDER.length : at;
};
const natureChoices = locale =>
  Object.entries(NATURES)
    .map(([id, [up, down]]) => ({ value: id, label: natureLabel(locale, id), up, down }))
    .sort(
      (a, b) =>
        adjustRank(a.up) - adjustRank(b.up) ||
        adjustRank(a.down) - adjustRank(b.down) ||
        a.label.localeCompare(b.label, 'ko'),
    );

// 경고 상자는 이미 .notice가 있다. 라이트와 다크가 함께 정의돼 있으므로 새 색을
// 만들지 않고 그대로 쓴다.
const errorList = errors =>
  `<ul class="builds-errors notice" data-builds-errors${errors.length ? '' : ' hidden'}>` +
  `${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;

// 경고는 저장 단추 바로 위에 붙인다. 화면 맨 위에 두면 긴 편집기에서는 저장을
// 누른 자리에서 보이지 않는다.
const editorActions = (existing, errors) =>
  errorList(errors) +
  `<div class="builds-actions">` +
  `<button type="submit" class="primary-button" data-builds-save>저장</button>` +
  `<button type="button" class="text-button" data-builds-reset>초기화</button>` +
  `${existing ? '<button type="button" class="text-button builds-delete" data-builds-delete>삭제</button>' : ''}` +
  `<button type="button" class="text-button" data-builds-cancel>목록으로</button>` +
  `</div>`;

const resumeNote = resumed =>
  resumed
    ? '<p class="builds-resume">작성 중인 항목을 이어서 작성합니다. 저장하지 않은 내용이 남아 있었습니다.</p>'
    : '';

// reference가 null이면 포켓몬 이름 자리에 저장된 id가 나온다. 도감을 아직
// 불러오지 않은 상태에서도 목록은 떠야 한다.
export function sampleList(samples, locale, reference = null, index = null) {
  if (!samples.length) return empty('저장한 샘플이 없습니다.', 'sample', '샘플 만들기');
  return `<ul class="builds-list">${samples
    .map(
      s =>
        `<li class="builds-row"><button class="builds-open" data-builds-sample="${esc(s.id)}">` +
        `${portrait({ sprite: speciesSprite(reference, index, s.pokemon) }, 'builds-portrait')}` +
        `<span class="builds-text">` +
        `<span class="builds-name">${esc(s.name)}</span>` +
        `<small class="builds-sub">${esc(speciesLabel(locale, reference, s.pokemon))}` +
        ` · ${esc(spreadLabel(s.points))}</small>` +
        `</span></button></li>`,
    )
    .join('')}</ul>`;
}

export function partyList(parties, samples, locale) {
  if (!parties.length) return empty('저장한 파티가 없습니다.', 'party', '파티 만들기');
  const names = new Map(samples.map(s => [s.id, s.name]));
  return `<ul class="builds-list">${parties
    .map(p => {
      const filled = p.members.filter(Boolean);
      const shown = filled.map(id => names.get(id) ?? '없는 샘플').join(', ');
      return (
        `<li class="builds-row"><button class="builds-open" data-builds-party="${esc(p.id)}">` +
        `<span class="builds-name">${esc(p.name)}</span>` +
        `<small class="builds-sub">${filled.length}/6${shown ? ` · ${esc(shown)}` : ''}</small>` +
        `</button></li>`
      );
    })
    .join('')}</ul>`;
}

// 기술은 영문 이름으로 담고 한국어로 보여준다. locale을 받지 않으면 저장된
// 영문이 그대로 화면에 나온다. 타입은 랭킹·도감이 쓰는 배지를 그대로 쓴다.
// 이름 자체를 물들이면 읽기 어려워지므로 작은 배지로 구분만 준다.
const moveTypeBadge = (reference, move) => {
  const type = reference?.move?.[toId(move)]?.type;
  return type ? typeBadges([type]) : '';
};

const moveSlot = (reference, locale) => (move, slot) =>
  `<li><span class="builds-slot">${slot + 1}</span>` +
  `<button type="button" class="builds-pick builds-move" data-builds-move="${slot}">` +
  `${move ? `${esc(refLabel(reference, locale, 'move', move))}${moveTypeBadge(reference, move)}` : '기술 선택'}` +
  `</button></li>`;

// 후보도 채용 기술과 같은 칸으로 보여야 한눈에 견준다. 빼기는 글자 대신 ×로.
const altRow = (reference, locale) => move =>
  `<li><span class="builds-pick builds-move builds-alt-name">` +
  `${esc(refLabel(reference, locale, 'move', move))}${moveTypeBadge(reference, move)}</span>` +
  `<button type="button" class="icon-button builds-alt-remove"` +
  ` data-builds-alt-remove="${esc(move)}"` +
  ` aria-label="${esc(refLabel(reference, locale, 'move', move))} 후보에서 빼기">×</button></li>`;

// 도감 화면과 같은 능력 이름을 쓴다(STAT_LABELS). H·A·B 한 글자는 익숙한 사람만
// 읽는다. 값을 넣는 곳과 결과를 보는 곳을 나누어, 고치면서 실수치를 바로 본다.
// 32와 0은 가장 자주 쓰는 값이라 한 번에 가도록 단추를 둔다. 1씩 오르내리는 단추는
// 손가락으로 누르기에 너무 작아 두지 않는다. 그 사이 값은 칸에 직접 적는다.
const pointRow = (value, index) =>
  `<div class="builds-point">` +
  `<span class="builds-point-name">${STAT_LABELS[index]}</span>` +
  `<input type="number" min="0" max="32" step="1" value="${value}"` +
  ` data-builds-point="${index}" aria-label="${STAT_LABELS[index]} 능력 포인트">` +
  `<div class="builds-point-row">` +
  `<button type="button" class="builds-point-step" data-builds-point-max="${index}"` +
  ` aria-label="${STAT_LABELS[index]} 최대">최대</button>` +
  `<button type="button" class="builds-point-step" data-builds-point-zero="${index}"` +
  ` aria-label="${STAT_LABELS[index]} 0">0</button>` +
  `</div></div>`;

const actualCard = (index, value) =>
  `<div class="builds-actual"><small>${STAT_LABELS[index]}</small><strong>${value}</strong></div>`;

// 내구력은 HP와 방어(또는 특수방어)를 곱해 견디는 정도를 한 숫자로 나타낸 것이다.
// 0.411은 데미지 계산식에서 온 상수로, 다른 배치와 견주기 쉬우라고 나눈다.
export const bulk = (actual, defenseIndex) =>
  Math.floor((actual[0] * actual[defenseIndex]) / 0.411);

// 도구 166개와 성격 25개는 고를 때 찾을 수 있어야 한다. 네이티브 select는 검색이
// 안 되고, 모달 창은 편집기 위에 또 겹친다. 그래서 자리에서 펼쳐지는 목록을 둔다.
// ponytail: 직접 만든 목록이다. 브라우저가 검색되는 select를 주면 걷어낸다
export const comboRows = (options, query) => {
  const rows = options.filter(o => matchesQuery({ name: o.value, label: o.label }, query ?? ''));
  if (!rows.length) return '<li class="builds-combo-empty">찾는 항목이 없습니다.</li>';
  return rows
    .map(
      o =>
        `<li><button type="button" role="option" class="builds-combo-row"` +
        ` data-builds-combo-value="${esc(o.value)}">${esc(o.label)}</button></li>`,
    )
    .join('');
};

// 고를 수 있는 것들. 편집기가 그릴 때와 검색으로 목록만 다시 그릴 때가 같은
// 목록을 봐야 하므로 한 곳에서만 만든다.
export function comboOptions(field, { reference, locale, pokemon }) {
  if (field === 'ability')
    return abilityOptions(reference, pokemon).map(name => ({
      value: name,
      label: refLabel(reference, locale, 'ability', name),
    }));
  if (field === 'item')
    return itemOptions(reference)
      .map(name => ({ value: name, label: refLabel(reference, locale, 'held_item', name) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  return natureChoices(locale);
}

const combo = ({ field, label, valueLabel, options, open, query, search, disabled = false }) =>
  `<div class="builds-combo" data-builds-combo="${field}">` +
  `<span class="builds-combo-label">${label}</span>` +
  `<button type="button" class="builds-pick" data-builds-combo-open="${field}"` +
  ` aria-expanded="${open}" aria-haspopup="listbox"${disabled ? ' disabled' : ''}>` +
  `${esc(valueLabel)}</button>` +
  (open && !disabled
    ? `<div class="builds-combo-panel">` +
      `<div class="search-box"><span aria-hidden="true">⌕</span>` +
      `<input type="search" data-builds-combo-search value="${esc(query ?? '')}"` +
      ` placeholder="${esc(search)}" autocomplete="off" aria-label="${esc(search)}"></div>` +
      `<ul class="builds-combo-list" role="listbox" data-builds-combo-list>` +
      `${comboRows(options, query)}</ul></div>`
    : '') +
  `</div>`;

export function sampleEditor(
  sample,
  {
    reference,
    locale,
    index = null,
    combos = null,
    existing = false,
    resumed = false,
    errors = [],
  },
) {
  const total = sample.points.reduce((a, b) => a + b, 0);
  const actual = actualStats(reference, sample.pokemon, sample.points, sample.nature);
  const forField = { reference, locale, pokemon: sample.pokemon };
  const abilities = comboOptions('ability', forField);
  const items = comboOptions('item', forField);
  return (
    `<form class="builds-editor" data-builds-form="sample">` +
    `${resumeNote(resumed)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(sample.name)}" data-builds-field="name" placeholder="샘플명 (예: 스카프 한카리아스)"></label>` +
    `<div class="builds-hero">` +
    `${portrait({ sprite: speciesSprite(reference, index, sample.pokemon) }, 'builds-hero-art')}` +
    `<button type="button" class="builds-pick builds-species" data-builds-species>` +
    `${esc(speciesLabel(locale, reference, sample.pokemon))}</button></div>` +
    `${combo({
      field: 'item',
      label: '도구',
      valueLabel: sample.item ? refLabel(reference, locale, 'held_item', sample.item) : '도구 선택',
      options: items,
      open: combos?.field === 'item',
      query: combos?.query,
      search: '도구 검색',
    })}` +
    `${combo({
      field: 'ability',
      label: '특성',
      valueLabel: sample.ability
        ? refLabel(reference, locale, 'ability', sample.ability)
        : abilities.length
          ? '특성 선택'
          : '먼저 포켓몬을 선택하세요',
      options: abilities,
      open: combos?.field === 'ability',
      query: combos?.query,
      search: '특성 검색',
      disabled: !abilities.length,
    })}` +
    `${combo({
      field: 'nature',
      label: '능력 보정',
      valueLabel: natureLabel(locale, sample.nature),
      options: comboOptions('nature', forField),
      open: combos?.field === 'nature',
      query: combos?.query,
      search: '능력 보정 검색',
    })}` +
    `<fieldset class="builds-points"><legend>능력 포인트 ` +
    `<small class="builds-total ${total === 66 ? 'is-exact' : total > 66 ? 'is-over' : 'is-under'}">` +
    `합계 ${total} / 66</small></legend>` +
    `<div class="builds-point-grid">${sample.points.map(pointRow).join('')}</div>` +
    `<div class="builds-actuals">` +
    `${
      actual
        ? `<p class="builds-actual-head">실수치</p>` +
          `<div class="builds-actual-grid">${actual.map((v, i) => actualCard(i, v)).join('')}</div>` +
          `<div class="builds-bulk">` +
          `<div class="builds-actual"><small>물리 내구력</small><strong>${bulk(actual, 2)}</strong></div>` +
          `<div class="builds-actual"><small>특수 내구력</small><strong>${bulk(actual, 4)}</strong></div>` +
          `</div>`
        : '<p class="builds-resume">포켓몬을 선택하면 실수치를 함께 보여줍니다.</p>'
    }` +
    `</div></fieldset>` +
    `<fieldset class="builds-moves"><legend>채용 기술</legend>` +
    `<ul>${sample.moves.map(moveSlot(reference, locale)).join('')}</ul></fieldset>` +
    `<fieldset class="builds-alts"><legend>후보 기술</legend>` +
    `<ul>${sample.altMoves.map(altRow(reference, locale)).join('')}</ul>` +
    `<button type="button" class="text-button" data-builds-alt-add>후보 기술 추가</button></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="보정과 포인트의 의도, 기술의 의도, 후보 기술인 이유 등">${esc(sample.note)}</textarea></label>` +
    `${editorActions(existing, errors)}` +
    `</form>`
  );
}

export function partyEditor(
  party,
  samples,
  { locale, existing = false, resumed = false, errors = [] },
) {
  const names = new Map(samples.map(s => [s.id, s.name]));
  return (
    `<form class="builds-editor" data-builds-form="party">` +
    `${resumeNote(resumed)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(party.name)}" data-builds-field="name" placeholder="예: 스카프 선공 구축"></label>` +
    `<fieldset class="builds-members"><legend>구성</legend><ul>${party.members
      .map(
        (id, slot) =>
          `<li><span class="builds-slot">${slot + 1}</span>` +
          `<button type="button" class="builds-pick" data-builds-member="${slot}">` +
          `${id ? esc(names.get(id) ?? '없는 샘플') : '빈 자리'}</button></li>`,
      )
      .join('')}</ul></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="왜 이런 조합인지">${esc(party.note)}</textarea></label>` +
    `${editorActions(existing, errors)}` +
    `</form>`
  );
}

// 포켓몬·도구·기술·샘플이 같은 창을 돌려 쓴다. 자료를 행으로 바꾸는 일은 app.js가
// 하고 여기서는 그리기만 한다. 셋의 조작이 같으므로 창을 나누지 않는다.
export function pickerRows(rows, limit) {
  if (!rows.length) return '<div class="empty-state"><p>찾는 항목이 없습니다.</p></div>';
  return `<ul class="picker-list">${rows
    .slice(0, limit)
    .map(
      row =>
        `<li><button type="button" class="picker-row" data-picker-value="${esc(row.value)}">` +
        `${'sprite' in row ? portrait({ sprite: row.sprite }, 'picker-portrait') : ''}` +
        `<span class="picker-text">` +
        `<span class="picker-name">${esc(row.label)}</span>` +
        `${row.sub ? `<small class="picker-sub">${esc(row.sub)}</small>` : ''}` +
        `</span></button></li>`,
    )
    .join('')}</ul>`;
}
