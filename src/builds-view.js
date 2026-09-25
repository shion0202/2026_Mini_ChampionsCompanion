// 샘플과 파티 화면의 마크업. app-view.js와 같이 문자열만 만들고 DOM을 만지지
// 않으므로 브라우저 없이 스냅샷으로 비교한다.
import { esc } from './html.js';
import { toId, STAT_LABELS, matchesQuery } from './data.js';
import { portrait, typeBadges } from './app-view.js';
import { itemArtwork } from './images.js';
import { NATURES, natureAdjust, abilityOptions, speciesSprite, actualStats } from './builds.js';
import { STAT_NAMES } from './locale.js';
import { CATEGORY_NAMES } from './reference-view.js';

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

// 수정일. 저장할 때마다 updatedAt을 덮어쓰므로 한 번도 고치지 않았으면 이 값이
// 곧 작성일이다. 따로 작성일을 둘 이유가 없다. 시각까지는 필요 없어 날짜만 적는다.
export const fmtDay = ms =>
  ms
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date(ms))
        .replace(/\s/g, '')
        .replace(/\.$/, '')
    : '저장 안 함';

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
// 공유는 저장한 것만, 동기화를 켠 기기에서만 한다(shareable).
const editorActions = (existing, errors, shareable = false, shareLabel = '샘플 공유') =>
  errorList(errors) +
  `<div class="builds-actions">` +
  `<button type="submit" class="primary-button" data-builds-save>저장</button>` +
  `<button type="button" class="text-button" data-builds-reset>초기화</button>` +
  `${existing ? '<button type="button" class="text-button builds-delete" data-builds-delete>삭제</button>' : ''}` +
  `${shareable ? `<button type="button" class="text-button" data-builds-share>${shareLabel}</button>` : ''}` +
  `<button type="button" class="text-button" data-builds-cancel>목록으로</button>` +
  `</div>`;

// 긴 편집기에서는 아래의 목록으로까지 내려가야 나갈 수 있었다. 랭킹 상세와 같은
// 자리, 같은 모양으로 위에도 둔다. data-builds-cancel이라 아래 것과 같이 움직인다.
const backToList =
  `<div class="builds-nav">` +
  `<button type="button" class="text-button" data-builds-cancel>← 목록으로</button></div>`;

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
        `<small class="builds-sub">${esc(speciesLabel(locale, reference, s.pokemon))}</small>` +
        `</span><small class="builds-day">${fmtDay(s.updatedAt)}</small></button></li>`,
    )
    .join('')}</ul>`;
}

export function partyList(parties, samples, locale) {
  if (!parties.length) return empty('저장한 파티가 없습니다.', 'party', '파티 만들기');
  const names = new Map(samples.map(s => [s.id, s.name]));
  return `<ul class="builds-list">${parties
    .map(p => {
      const filled = p.members.filter(Boolean);
      const shown = filled.map(id => names.get(id) ?? '존재하지 않는 샘플').join(', ');
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
// 기술의 수치를 한 줄로. 선택 창은 PP까지, 편집기 칸은 분류·위력·명중만 적는다.
// 위력이 없는 기술은 위력을 적지 않는다. 명중이 ‘반드시 맞음’인 변화 기술은 대개
// 자신이나 필드에 거는 것이라 명중을 적지 않고, 공격 기술이면 ‘필중’으로 적는다.
export function moveMeta(move, { pp = false } = {}) {
  if (!move) return '';
  const accuracy =
    move.accuracy === true
      ? move.category === 'Status'
        ? null
        : '필중'
      : Number.isFinite(move.accuracy)
        ? `명중 ${move.accuracy}`
        : null;
  return [
    CATEGORY_NAMES[move.category],
    move.power ? `위력 ${move.power}` : null,
    accuracy,
    pp && move.pp ? `PP ${move.pp}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// 효과 설명. 게임 문구의 줄바꿈은 칸 너비에 맞춘 것이라 띄어쓰기로 잇는다. 추가
// 효과가 없다는 문구는 효과가 없는 것으로 본다.
export const moveEffect = move =>
  move?.effect && move.effect !== '별도의 추가 효과가 없습니다.'
    ? move.effect.replace(/\s*\n\s*/g, ' ')
    : '';

const moveTypeBadge = (reference, move) => {
  const type = reference?.move?.[toId(move)]?.type;
  return type ? typeBadges([type]) : '';
};

// 채용·후보 칸의 기술. 이름 옆에 타입 배지와 분류·위력·명중을 둔다.
const moveFace = (reference, locale, move) =>
  `<span class="builds-move-name">${esc(refLabel(reference, locale, 'move', move))}</span>` +
  `<span class="builds-move-meta">${moveTypeBadge(reference, move)}` +
  `<small>${esc(moveMeta(reference?.move?.[toId(move)]))}</small></span>`;

// 끌기 손잡이. 손가락으로 잡기 쉽게 줄 왼쪽 끝에 둔다. 빈 칸은 끌 것이 없어 손잡이
// 대신 같은 너비의 빈자리를 둔다. 놓을 자리는 li의 data-drag-list·index가 알린다.
const grip = draggable =>
  draggable
    ? '<span class="builds-grip" data-drag-handle aria-hidden="true">⠿</span>'
    : '<span class="builds-grip" aria-hidden="true"></span>';

const moveSlot = (reference, locale) => (move, slot) =>
  `<li data-drag-list="moves" data-drag-index="${slot}">${grip(!!move)}` +
  `<span class="builds-slot">${slot + 1}</span>` +
  `<button type="button" class="builds-pick builds-move" data-builds-move="${slot}">` +
  `${move ? moveFace(reference, locale, move) : '기술 선택'}` +
  `</button></li>`;

// 후보도 채용 기술과 같은 칸으로 보여야 한눈에 견준다. 빼기는 글자 대신 ×로.
const altRow = (reference, locale) => (move, at) =>
  `<li data-drag-list="alts" data-drag-index="${at}">${grip(true)}` +
  `<span class="builds-pick builds-move builds-alt-name">${moveFace(reference, locale, move)}</span>` +
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

// 파티를 보는 까닭이 여기 있다. 어느 샘플을 넣었는지만으로는 그 자리가 무엇을
// 하는지 알 수 없어, 도구·특성·보정·포인트·기술을 자리에서 펼쳐 본다. 여닫는 일은
// <details>가 한다. 직접 상태를 들고 있을 이유가 없다.
// 한 줄에 하나씩, 이름표와 값만 둔다. 여기는 고치는 곳이 아니라 훑어보는 곳이라
// 칸이나 배지로 나눌 이유가 없다. 능력 포인트는 H2 A32 S32처럼 줄여 적는다.
const STAT_SHORT = ['H', 'A', 'B', 'C', 'D', 'S'];
const memberFacts = (sample, reference, locale, { moves: withMoves = true } = {}) => {
  const spent = sample.points
    .map((p, i) => (p ? `${STAT_SHORT[i]}${p}` : null))
    .filter(Boolean)
    .join(' ');
  const moves = sample.moves
    .filter(Boolean)
    .map(m => refLabel(reference, locale, 'move', m))
    .join(' / ');
  const facts = [
    ['도구', sample.item ? refLabel(reference, locale, 'held_item', sample.item) : '없음'],
    ['특성', sample.ability ? refLabel(reference, locale, 'ability', sample.ability) : '없음'],
    ['능력 보정', sample.nature ? natureLabel(locale, sample.nature) : '없음'],
    ['능력 포인트', spent || '없음'],
    ...(withMoves ? [['기술', moves || '없음']] : []),
  ];
  return (
    `<dl class="builds-member-facts">` +
    facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') +
    `</dl>`
  );
};

const memberRow = (byId, reference, locale, index) => (id, slot) => {
  const sample = id ? byId.get(id) : null;
  const name = sample ? sample.name : id ? '존재하지 않는 샘플' : '빈 자리';
  const species = sample ? speciesLabel(locale, reference, sample.pokemon) : '';
  return (
    `<li class="builds-member"><div class="builds-member-head">` +
    `<span class="builds-slot">${slot + 1}</span>` +
    `<button type="button" class="builds-pick builds-member-pick" data-builds-member="${slot}">` +
    `${portrait({ sprite: speciesSprite(reference, index, sample?.pokemon ?? null) }, 'builds-portrait')}` +
    `<span class="builds-text"><span class="builds-name">${esc(name)}</span>` +
    `${species ? `<small class="builds-sub">${esc(species)}</small>` : ''}</span></button>` +
    `${
      sample
        ? `<button type="button" class="icon-button builds-member-edit"` +
          ` data-builds-member-edit="${esc(sample.id)}"` +
          ` aria-label="${esc(sample.name)} 샘플 편집">✎</button>`
        : ''
    }` +
    `</div>` +
    `${sample ? `<details class="builds-member-more"><summary>상세</summary>${memberFacts(sample, reference, locale)}</details>` : ''}` +
    `</li>`
  );
};

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
    shareable = false,
  },
) {
  const total = sample.points.reduce((a, b) => a + b, 0);
  const actual = actualStats(reference, sample.pokemon, sample.points, sample.nature);
  const forField = { reference, locale, pokemon: sample.pokemon };
  const abilities = comboOptions('ability', forField);
  return (
    `<form class="builds-editor" data-builds-form="sample">` +
    backToList +
    `${resumeNote(resumed)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(sample.name)}" data-builds-field="name" placeholder="샘플명 (예: 스카프 한카리아스)"></label>` +
    `<p class="builds-day-line">수정일 ${fmtDay(sample.updatedAt)}</p>` +
    `<div class="builds-hero">` +
    `${portrait({ sprite: speciesSprite(reference, index, sample.pokemon) }, 'builds-hero-art')}` +
    `<button type="button" class="builds-pick builds-species" data-builds-species>` +
    `${esc(speciesLabel(locale, reference, sample.pokemon))}</button></div>` +
    // 도구는 창을 띄워 고른다. 자리에서 펼치는 목록은 좁아서 무엇이 있는지
    // 훑어볼 수가 없다. 고르는 일이 곧 무엇을 쓸지 고민하는 일이라 넓어야 한다.
    `<div class="builds-combo"><span class="builds-combo-label">도구</span>` +
    `<button type="button" class="builds-pick" data-builds-item>` +
    `${sample.item ? esc(refLabel(reference, locale, 'held_item', sample.item)) : '도구 선택'}` +
    `</button></div>` +
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
    // 후보 칸 전체가 놓을 자리다. 기술 위가 아닌 곳에 놓으면 후보 끝으로 간다.
    `<fieldset class="builds-alts" data-drag-zone="alts"><legend>후보 기술</legend>` +
    `<ul>${sample.altMoves.map(altRow(reference, locale)).join('')}</ul>` +
    `<button type="button" class="text-button" data-builds-alt-add>후보 기술 추가</button></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="보정과 포인트의 의도, 기술의 의도, 후보 기술인 이유 등">${esc(sample.note)}</textarea></label>` +
    `${editorActions(existing, errors, shareable, '샘플 공유')}` +
    `</form>`
  );
}

export function partyEditor(
  party,
  samples,
  {
    locale,
    reference = null,
    index = null,
    existing = false,
    resumed = false,
    errors = [],
    shareable = false,
  },
) {
  const byId = new Map(samples.map(s => [s.id, s]));
  return (
    `<form class="builds-editor" data-builds-form="party">` +
    backToList +
    `${resumeNote(resumed)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(party.name)}" data-builds-field="name" placeholder="파티명"></label>` +
    `<fieldset class="builds-members"><legend>구성</legend><ul>${party.members
      .map(memberRow(byId, reference, locale, index))
      .join('')}</ul></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="특정 포켓몬을 파티에 채용한 이유 등">${esc(party.note)}</textarea></label>` +
    `${editorActions(existing, errors, shareable, '파티 공유')}` +
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
        // 도구는 도감 목록과 같은 그림을 쓴다(itemArtwork). 포켓몬은 랭킹과 같은
        // portrait다. 둘 다 이미 있는 것을 그대로 부른다.
        `${row.art === 'item' ? itemArtwork(row.name) : 'sprite' in row ? portrait({ sprite: row.sprite }, 'picker-portrait') : ''}` +
        `<span class="picker-text">` +
        `<span class="picker-name">${esc(row.label)}</span>` +
        `${row.sub ? `<small class="picker-sub">${esc(row.sub)}</small>` : ''}` +
        // 성질은 둘째 줄과 같은 글꼴로 · 를 사이에 두고 잇는다.
        `${row.chips?.length ? `<small class="picker-sub picker-traits">${esc(row.chips.join(' · '))}</small>` : ''}` +
        `${row.effect ? `<small class="picker-effect">${esc(row.effect)}</small>` : ''}` +
        `</span></button></li>`,
    )
    .join('')}</ul>`;
}

// 동기화. 단추는 목록 위 단추 줄(새로 만들기 옆)에, 상태 문장은 그 아래 한 줄에
// 둔다. 코드는 여기 그리지 않는다. 코드를 가진 사람이 문서 전체 권한을 가지므로
// ‘코드 복사’로 클립보드에만 옮긴다.
const SYNC_TEXT = {
  off: '이 기기에만 저장합니다.',
  checking: '서버와 맞추는 중…',
  uploading: '올리는 중…',
  ok: '다른 기기와 동기화됩니다.',
  offline: '연결이 없어 올리지 못했습니다. 연결되면 다시 올립니다.',
  retry: '서버가 바빠 올리지 못했습니다. 다음 저장이나 다음 실행 때 다시 올립니다.',
  error: '서버가 받지 않았습니다. 저장 내용이 너무 크거나 형식이 맞지 않습니다.',
  conflict: '다른 기기에서 바뀌었습니다. 어느 쪽을 남길지 선택하세요.',
};
const syncButton = (action, label) =>
  `<button type="button" class="text-button" data-sync="${action}">${label}</button>`;

export const syncText = (sync, status) =>
  sync ? (SYNC_TEXT[status] ?? SYNC_TEXT.ok) : SYNC_TEXT.off;

export function syncActions(sync, status) {
  if (!sync) return syncButton('enable', '동기화 켜기') + syncButton('join', '코드로 연결');
  // 충돌은 팝업에서 고른다. 팝업을 닫았으면 이 단추로 다시 연다.
  return status === 'conflict'
    ? syncButton('resolve', '충돌 해결') + syncButton('copy', '코드 복사')
    : syncButton('copy', '코드 복사') + syncButton('off', '끄기');
}

// 충돌 팝업의 목록. 어느 항목을 양쪽에서 어떻게 바꿨는지 보여 고를 수 있게 한다.
// 이름은 남아 있는 쪽에서 가져온다(한쪽이 지웠으면 다른 쪽 이름).
export function conflictList(conflicts) {
  const did = item => (item ? '수정' : '삭제');
  return `<ul class="sync-conflicts">${conflicts
    .map(c => {
      const name = (c.local ?? c.server)?.name || '이름 없음';
      return (
        `<li><strong>${c.kind === 'sample' ? '샘플' : '파티'} · ${esc(name)}</strong>` +
        `<small>이 기기: ${did(c.local)} / 서버: ${did(c.server)}</small></li>`
      );
    })
    .join('')}</ul>`;
}

// 공유 화면. 링크로 받은 스냅샷을 보기만 한다. 고치는 단추도, 내 목록으로 가져오는
// 단추도 두지 않는다. 편집기와 같은 정보를 같은 이름표로 보여 주되 칸 대신 글로 둔다.
const shareMoves = (reference, locale, moves) =>
  `<ul class="share-moves">${moves
    .map(
      m => `<li>${esc(refLabel(reference, locale, 'move', m))}${moveTypeBadge(reference, m)}</li>`,
    )
    .join('')}</ul>`;

const shareNote = note => (note?.trim() ? `<p class="share-note">${esc(note)}</p>` : '');

function sampleSheet(sample, { reference, locale, index }) {
  const actual = actualStats(reference, sample.pokemon, sample.points, sample.nature);
  const moves = sample.moves.filter(Boolean);
  return (
    `<div class="builds-hero">` +
    `${portrait({ sprite: speciesSprite(reference, index, sample.pokemon) }, 'builds-hero-art')}` +
    `<div class="share-heading"><h3 class="share-name">${esc(sample.name)}</h3>` +
    `<small class="builds-sub">${esc(speciesLabel(locale, reference, sample.pokemon))}</small></div></div>` +
    memberFacts(sample, reference, locale, { moves: false }) +
    `${
      actual
        ? `<p class="builds-actual-head">실수치</p>` +
          `<div class="builds-actual-grid">${actual.map((v, i) => actualCard(i, v)).join('')}</div>` +
          `<div class="builds-bulk">` +
          `<div class="builds-actual"><small>물리 내구력</small><strong>${bulk(actual, 2)}</strong></div>` +
          `<div class="builds-actual"><small>특수 내구력</small><strong>${bulk(actual, 4)}</strong></div>` +
          `</div>`
        : ''
    }` +
    `<h4 class="share-label">채용 기술</h4>` +
    `${moves.length ? shareMoves(reference, locale, moves) : '<p class="share-none">없음</p>'}` +
    `${sample.altMoves.length ? `<h4 class="share-label">후보 기술</h4>${shareMoves(reference, locale, sample.altMoves)}` : ''}` +
    `${sample.note?.trim() ? `<h4 class="share-label">설명</h4>${shareNote(sample.note)}` : ''}`
  );
}

function partySheet(party, samples, { reference, locale, index }) {
  const byId = new Map(samples.map(s => [s.id, s]));
  const member = (id, slot) => {
    const sample = id ? byId.get(id) : null;
    return (
      `<li class="builds-member"><div class="builds-member-head">` +
      `<span class="builds-slot">${slot + 1}</span>` +
      `<span class="share-member">` +
      `${portrait({ sprite: speciesSprite(reference, index, sample?.pokemon ?? null) }, 'builds-portrait')}` +
      `<span class="builds-text"><span class="builds-name">${esc(sample ? sample.name : '빈 자리')}</span>` +
      `${sample ? `<small class="builds-sub">${esc(speciesLabel(locale, reference, sample.pokemon))}</small>` : ''}` +
      `</span></span></div>` +
      `${
        sample
          ? `<details class="builds-member-more" open><summary>상세</summary>` +
            `${memberFacts(sample, reference, locale)}${shareNote(sample.note)}</details>`
          : ''
      }` +
      `</li>`
    );
  };
  return (
    `<h3 class="share-name">${esc(party.name)}</h3>` +
    shareNote(party.note) +
    `<ul class="share-members">${party.members.map(member).join('')}</ul>`
  );
}

const SHARE_TEXT = {
  loading: '공유받은 내용을 불러오는 중입니다.',
  missing: '기간이 만료되었거나 없는 링크입니다.',
  offline: '연결이 없어 불러오지 못했습니다.',
  retry: '서버가 바빠 불러오지 못했습니다.',
  error: '공유받은 내용을 읽을 수 없습니다.',
};
const shareHome = '<button type="button" class="text-button" data-share-home>앱 둘러보기</button>';

// share가 null이면 상태 문장만 보인다. 연결 문제는 다시 시도할 수 있게 한다.
// 제목(공유받은 샘플·파티)은 app.js가 패널 머리에 단다.
export const shareTitle = share =>
  share?.kind === 'party' ? '공유받은 파티' : share ? '공유받은 샘플' : '공유';
export function shareView(status, share, options) {
  if (!share)
    return (
      `<div class="empty-state"><p>${SHARE_TEXT[status] ?? SHARE_TEXT.error}</p>` +
      `${['offline', 'retry'].includes(status) ? '<button type="button" class="text-button" data-share-retry>다시 시도</button>' : ''}` +
      `${status === 'loading' ? '' : shareHome}</div>`
    );
  const sheet =
    share.kind === 'sample'
      ? sampleSheet(share.sample, options)
      : partySheet(share.party, share.samples, options);
  return (
    `<article class="share-sheet">${sheet}</article>` +
    `<p class="share-expiry">` +
    `${share.expiresAt ? `${fmtDay(share.expiresAt)}까지 열 수 있는 링크입니다. ` : ''}` +
    `보낸 사람이 나중에 고쳐도 이 화면은 바뀌지 않습니다.</p>` +
    `<div class="share-actions">${shareHome}</div>`
  );
}
