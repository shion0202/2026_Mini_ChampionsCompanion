// 샘플과 파티 화면의 마크업. app-view.js와 같이 문자열만 만들고 DOM을 만지지
// 않으므로 브라우저 없이 스냅샷으로 비교한다.
import { esc } from './html.js';
import { toId } from './data.js';
import { spreadLabel, POINT_LETTERS } from './reference.js';
import { NATURES, natureAdjust, abilityOptions } from './builds.js';
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

// 후보가 적은 항목은 창을 열지 않고 목록에서 고른다. 모바일에서는 OS 선택기가
// 떠서 가장 빠르고, 우리가 만들 코드가 거의 없다.
const choices = (items, selected, placeholder) =>
  `<option value="">${placeholder}</option>` +
  items
    .map(
      o =>
        `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>` +
        `${esc(o.label)}</option>`,
    )
    .join('');

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

const editorActions = existing =>
  `<div class="builds-actions">` +
  `<button type="submit" class="primary-button" data-builds-save>저장</button>` +
  `<button type="button" class="text-button" data-builds-cancel>목록으로</button>` +
  `${existing ? '<button type="button" class="text-button builds-delete" data-builds-delete>삭제</button>' : ''}` +
  `</div>`;

const resumeNote = resumed =>
  resumed
    ? '<p class="builds-resume">이어서 고치는 중입니다. 저장하지 않은 내용이 남아 있었습니다.</p>'
    : '';

// reference가 null이면 포켓몬 이름 자리에 저장된 id가 나온다. 도감을 아직
// 불러오지 않은 상태에서도 목록은 떠야 한다.
export function sampleList(samples, locale, reference = null) {
  if (!samples.length) return empty('저장한 샘플이 없습니다.', 'sample', '샘플 만들기');
  return `<ul class="builds-list">${samples
    .map(
      s =>
        `<li class="builds-row"><button class="builds-open" data-builds-sample="${esc(s.id)}">` +
        `<span class="builds-name">${esc(s.name)}</span>` +
        `<small class="builds-sub">${esc(speciesLabel(locale, reference, s.pokemon))}` +
        ` · ${esc(spreadLabel(s.points))}</small>` +
        `</button></li>`,
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
// 영문이 그대로 화면에 나온다.
const moveSlot = (reference, locale) => (move, slot) =>
  `<li><span class="builds-slot">${slot + 1}</span>` +
  `<button class="builds-pick" data-builds-move="${slot}">` +
  `${move ? esc(refLabel(reference, locale, 'move', move)) : '기술 선택'}</button></li>`;

const pointRow = (value, index) =>
  `<label class="builds-point"><span>${POINT_LETTERS[index]}</span>` +
  `<input type="number" min="0" max="32" step="1" value="${value}" data-builds-point="${index}"></label>`;

export function sampleEditor(
  sample,
  { reference, locale, existing = false, resumed = false, errors = [] },
) {
  const total = sample.points.reduce((a, b) => a + b, 0);
  const abilities = abilityOptions(reference, sample.pokemon).map(name => ({
    value: name,
    label: refLabel(reference, locale, 'ability', name),
  }));
  return (
    `<form class="builds-editor" data-builds-form="sample">` +
    `${resumeNote(resumed)}${errorList(errors)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(sample.name)}" data-builds-field="name" placeholder="샘플명 (예: 스카프 한카리아스)"></label>` +
    `<button type="button" class="builds-pick builds-species" data-builds-species>` +
    `${esc(speciesLabel(locale, reference, sample.pokemon))}</button>` +
    `<button type="button" class="builds-pick" data-builds-item>` +
    `${sample.item ? esc(refLabel(reference, locale, 'held_item', sample.item)) : '도구 선택'}</button>` +
    `<label class="builds-field">특성<select data-builds-field="ability"${abilities.length ? '' : ' disabled'}>` +
    `${choices(abilities, sample.ability, abilities.length ? '특성 선택' : '먼저 포켓몬을 선택하세요')}` +
    `</select></label>` +
    `<label class="builds-field">능력 보정<select data-builds-field="nature">` +
    `${choices(natureChoices(locale), sample.nature, '능력 보정 선택')}` +
    `</select></label>` +
    `<fieldset class="builds-points"><legend>능력 포인트 <small>합계 ${total} / 66</small></legend>` +
    `${sample.points.map(pointRow).join('')}</fieldset>` +
    `<fieldset class="builds-moves"><legend>채용 기술</legend>` +
    `<ul>${sample.moves.map(moveSlot(reference, locale)).join('')}</ul></fieldset>` +
    `<fieldset class="builds-alts"><legend>후보 기술</legend>` +
    `<ul>${sample.altMoves
      .map(
        m =>
          `<li><span class="builds-alt-name">${esc(refLabel(reference, locale, 'move', m))}</span>` +
          `<button type="button" class="text-button" data-builds-alt-remove="${esc(m)}">빼기</button></li>`,
      )
      .join('')}</ul>` +
    `<button type="button" class="text-button" data-builds-alt-add>후보 기술 추가</button></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="보정과 포인트의 의도, 기술의 의도, 후보 기술인 이유 등">${esc(sample.note)}</textarea></label>` +
    `${editorActions(existing)}` +
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
    `${resumeNote(resumed)}${errorList(errors)}` +
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
    `${editorActions(existing)}` +
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
        `<span class="picker-name">${esc(row.label)}</span>` +
        `${row.sub ? `<small class="picker-sub">${esc(row.sub)}</small>` : ''}` +
        `</button></li>`,
    )
    .join('')}</ul>`;
}
