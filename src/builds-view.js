// 샘플과 파티 화면의 마크업. app-view.js와 같이 문자열만 만들고 DOM을 만지지
// 않으므로 브라우저 없이 스냅샷으로 비교한다.
import { esc } from './html.js';
import { spreadLabel, POINT_LETTERS } from './reference.js';
import { NATURES, natureAdjust, abilityOptions } from './builds.js';
import { STAT_NAMES } from './locale.js';

// 명사를 조사가 붙은 문장에 끼워넣지 않는다. '샘플이'는 맞지만 '파티이'는 틀린다.
// 다른 뷰 모듈도 맥락마다 문장을 통으로 적는다.
const empty = (message, action, label) =>
  `<div class="empty-state"><p>${message}</p>` +
  `<button class="text-button" data-builds-new="${action}">${label}</button></div>`;

const speciesLabel = (locale, reference, id) => {
  const species = reference?.species?.[id];
  return species ? locale.pokemon(species.name).label : (id ?? '포켓몬 미선택');
};

// 성격은 한국어 이름과 보정을 함께 보여준다. 이름만으로는 무엇이 오르내리는지
// 바로 읽히지 않는다.
const natureLabel = (locale, id) => {
  if (!id) return '보정 미선택';
  const [up, down] = natureAdjust(id);
  const name = locale.label('stat_alignment', id);
  if (!up) return `${name} (보정 없음)`;
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

// 성격은 한국어 이름순으로 고른다. 저장은 id로 한다.
const natureChoices = locale =>
  Object.keys(NATURES)
    .map(id => ({ value: id, label: natureLabel(locale, id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));

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

const moveSlot = (move, slot) =>
  `<li><span class="builds-slot">${slot + 1}</span>` +
  `<button class="builds-pick" data-builds-move="${slot}">` +
  `${move ? esc(move) : '기술 고르기'}</button></li>`;

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
    label: locale.label('ability', name),
  }));
  return (
    `<form class="builds-editor" data-builds-form="sample">` +
    `${resumeNote(resumed)}${errorList(errors)}` +
    `<label class="builds-field">이름<input type="text" value="${esc(sample.name)}" data-builds-field="name" placeholder="예: 스카프 보만다"></label>` +
    `<button type="button" class="builds-pick builds-species" data-builds-species>` +
    `${esc(speciesLabel(locale, reference, sample.pokemon))}</button>` +
    `<button type="button" class="builds-pick" data-builds-item>` +
    `${sample.item ? esc(locale.label('held_item', sample.item)) : '도구 고르기'}</button>` +
    `<label class="builds-field">특성<select data-builds-field="ability"${abilities.length ? '' : ' disabled'}>` +
    `${choices(abilities, sample.ability, abilities.length ? '특성 고르기' : '먼저 포켓몬을 고르세요')}` +
    `</select></label>` +
    `<label class="builds-field">능력 보정<select data-builds-field="nature">` +
    `${choices(natureChoices(locale), sample.nature, '보정 고르기')}` +
    `</select></label>` +
    `<fieldset class="builds-points"><legend>능력 포인트 <small>합계 ${total} / 66</small></legend>` +
    `${sample.points.map(pointRow).join('')}</fieldset>` +
    `<fieldset class="builds-moves"><legend>채용 기술</legend>` +
    `<ul>${sample.moves.map(moveSlot).join('')}</ul></fieldset>` +
    `<fieldset class="builds-alts"><legend>후보 기술</legend>` +
    `<ul>${sample.altMoves
      .map(
        m =>
          `<li><span>${esc(m)}</span>` +
          `<button type="button" class="text-button" data-builds-alt-remove="${esc(m)}">빼기</button></li>`,
      )
      .join('')}</ul>` +
    `<button type="button" class="text-button" data-builds-alt-add>후보 더하기</button></fieldset>` +
    `<label class="builds-field">설명<textarea rows="5" data-builds-field="note" placeholder="보정과 포인트의 의도, 기술의 의도, 후보 기술인 이유">${esc(sample.note)}</textarea></label>` +
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
