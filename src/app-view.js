// Markup for the ranking and detail screens. Every function here is pure: it takes
// what it needs and returns a string, so app.js keeps the DOM and event wiring and
// this layer can be snapshot-tested without a browser.
import { toId, percentageText, formatDate, CATEGORY_LABELS } from './data.js';
import { TYPE_LABELS, STAT_NAMES } from './locale.js';
import { itemArtwork } from './images.js';
import { filterSummary } from './filters.js';
import { effectButton, percentClass, FILTER_ICON } from './reference-view.js';
import { esc } from './html.js';

export { esc };

export const fmtTime = value => {
  if (value === null || value === undefined || value === '') return '제공되지 않음';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '제공되지 않음'
    : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date) + ' KST';
};

export const typeBadges = types =>
  (types ?? [])
    .map(
      type =>
        `<span class="type-badge type-${esc(toId(type))}">${esc(TYPE_LABELS[type] ?? type)}</span>`,
    )
    .join('');

export const portrait = (entry, className = '') =>
  entry.sprite
    ? `<img class="portrait ${className}" src="${esc(entry.sprite)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<span class="no-portrait" aria-hidden="true">◇</span>';

export const seasonOptions = (seasons, regulations) =>
  seasons
    .map(
      s =>
        `<option value="${s.season}">` +
        `${s.season === seasons[0].season ? '[최신] ' : ''}` +
        `${s.season.replace('M', 'M-')}` +
        `${regulations[s.season] ? ` (${regulations[s.season]})` : ''}</option>`,
    )
    .join('');

export const sourceChip = ({ stale, date }) =>
  `<button class="source-chip" id="source-info">` +
  `<span class="status-dot ${stale ? 'stale' : ''}"></span>` +
  `자료 ${formatDate(date)}` +
  `<span class="source-kind">${stale ? '보관 자료' : ''}</span>` +
  `<span aria-hidden="true">ⓘ</span></button>`;

export const sourceTimes = ({ date, generatedAt, fetchedAt }) =>
  `자료 날짜: ${formatDate(date)}\nAPI 생성: ${fmtTime(generatedAt)}\n기기 조회: ${fmtTime(fetchedAt)}`;

export const rankingFilterButton = count =>
  FILTER_ICON + (count ? `<span class="filter-badge">${count}</span>` : '');

export const loadingState = text =>
  `<div class="empty-state"><span class="loading-ring"></span><p>${text}</p></div>`;

export const errorState = message =>
  `<div class="empty-state error-state"><span class="empty-symbol">↻</span>` +
  `<h3>통계를 불러오지 못했어요</h3>` +
  `<p>네트워크 연결과 통계 제공처 상태를 확인해 주세요.</p>` +
  `<p class="error-detail">${esc(message)}</p>` +
  `<button id="retry" class="primary-button">다시 시도</button></div>`;

export const rankingEmpty = favoriteOnly =>
  `<div class="empty-state"><span class="empty-symbol">${favoriteOnly ? '☆' : '⌕'}</span>` +
  `<h3>조건에 맞는 포켓몬이 없습니다</h3>` +
  `<p>검색어와 적용한 필터를 확인해 주세요.</p>` +
  `<button id="reset-filters" class="text-button">필터 초기화</button></div>`;

export function rankingRows(visible, { selected, sort, favorites }) {
  const dexNumber = p =>
    sort === 'dex'
      ? `<span class="dex-number">No.${p.dex ? String(p.dex).padStart(3, '0') : '—'}</span>`
      : '';
  const pokemonInfo = p =>
    `<span class="pokemon-info">${dexNumber(p)}<strong>${esc(p.label)}</strong>` +
    `<span class="type-list">${typeBadges(p.types)}</span></span>`;
  return visible
    .map(
      p => `<div class="pokemon-row ${selected === p.id ? 'selected' : ''}">
    <button class="pokemon-select" data-pokemon="${p.id}" aria-label="${esc(p.label)} ${p.rank}위 통계 보기" ${selected === p.id ? 'aria-current="true"' : ''}>
      <span class="rank ${p.rank <= 6 ? 'rank-top' : ''}" aria-label="사용 순위 ${p.rank}위">${p.rank.toString().padStart(2, '0')}</span>
      <span class="portrait-wrap">${portrait(p)}</span>${pokemonInfo(p)}
    </button>
    <button class="favorite-button" data-favorite="${p.id}" aria-label="${esc(p.label)} 즐겨찾기" aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id) ? '★' : '☆'}</button>
  </div>`,
    )
    .join('');
}

export function heroMarkup({ entry, shown, japanese, isFavorite }) {
  const heroCopy =
    `<div class="hero-copy"><span class="rank-pill">#${entry.rank} <span>사용 순위</span></span>` +
    `<h2 tabindex="-1" id="pokemon-title">${esc(shown.label)}</h2>` +
    `<p class="english-name"><span lang="en">${esc(shown.name)}</span>` +
    `${entry.dex ? ` <span>№ ${String(entry.dex).padStart(3, '0')}</span>` : ''}</p>` +
    `${japanese ? `<p class="japanese-name" lang="ja">${esc(japanese)}</p>` : ''}` +
    `<div class="type-list">${typeBadges(shown.types)}</div></div>`;
  const heroArt =
    `<div class="hero-art">${portrait(shown, 'hero-portrait')}` +
    `<span class="hero-image-fallback" hidden>이미지 미제공</span></div>`;
  const heroFavorite =
    `<button class="favorite-button hero-favorite" data-favorite="${entry.id}"` +
    ` aria-label="${esc(entry.label)} 즐겨찾기" aria-pressed="${isFavorite}">` +
    `${isFavorite ? '★' : '☆'}</button>`;
  return heroCopy + heroArt + heroFavorite;
}

export const detailPlaceholder = () =>
  `<div class="detail-placeholder">` +
  `<div class="placeholder-mark" aria-hidden="true">↗</div>` +
  `<p class="eyebrow">BATTLE INSIGHTS</p><h2>다음 배틀을 위한 한 수</h2>` +
  `<p>포켓몬을 선택하면 기술과 도구,<br>함께 쓰는 포켓몬을 확인할 수 있어요.</p>` +
  `<div class="placeholder-tags"><span>기술</span><span>도구</span><span>같은 팀</span></div></div>`;

export const detailWaiting = () =>
  `<div class="detail-placeholder"><h2>자료를 기다리고 있어요</h2>` +
  `<p>조회가 완료되면 통계를 확인할 수 있습니다.</p></div>`;

export function detailShell({
  hasPrevious,
  format,
  season,
  labels,
  category,
  date,
  generatedAt,
  fetchedAt,
}) {
  const mobileNav =
    `<div class="detail-mobile-nav"><div class="detail-navigation">` +
    `<button id="previous-pokemon" class="text-button" ${hasPrevious ? '' : 'hidden'}>← 이전</button>` +
    `<button id="back" class="text-button">랭킹으로</button></div>` +
    `<span>${format === 'Singles' ? '싱글배틀' : '더블배틀'}` +
    ` (${season.replace('M', 'M-')})</span></div>`;
  const tab = ([key, label]) =>
    `<button role="tab" id="tab-${key}" data-category="${key}"` +
    ` aria-controls="category-content" aria-selected="${category === key}"` +
    ` tabindex="${category === key ? 0 : -1}">${label}</button>`;
  const detailSource =
    `<div class="detail-source">` +
    `<span>자료 날짜 <strong>${formatDate(date)}</strong></span>` +
    `<details><summary>자료 시각 자세히</summary>` +
    `<p>자료: ${season.replace('M', 'M-')} / ${format === 'Singles' ? '싱글' : '더블'}` +
    ` / ${formatDate(date)} (제공처 표기, 시간대 미제공)</p>` +
    `<p>API 생성: ${fmtTime(generatedAt)}</p>` +
    `<p>기기 조회: ${fmtTime(fetchedAt)}</p></details></div>`;
  return `
    ${mobileNav}
    <div class="pokemon-hero"></div>
    <div class="detail-tabs" role="tablist" aria-label="통계와 도감 항목">${Object.entries(labels)
      .map(tab)
      .join('')}</div>
    <div id="category-content" class="category-content" role="tabpanel" aria-labelledby="tab-${category}" tabindex="0"></div>
    ${detailSource}`;
}

export const referenceStatus = refError =>
  `<div class="empty-state">${
    refError
      ? '도감 자료를 불러오지 못했습니다.<br>' +
        '<button class="text-button" data-ref-retry>다시 시도</button>'
      : '도감 자료를 불러오는 중입니다.'
  }</div>`;

export const categoryHeader = (category, rows) => {
  const headerCount = rows.length
    ? `상위 ${rows.length}${category === 'teammate' ? '마리' : '개'}`
    : '자료 없음';
  return (
    `<div class="category-heading"><h3>${CATEGORY_LABELS[category]}</h3>` +
    `<span>${headerCount}</span></div>`
  );
};

export const categoryEmpty = () =>
  '<div class="empty-state"><p>이 자료에는 해당 통계가 제공되지 않습니다.</p></div>';

const CATEGORY_TIPS = {
  move: '여러 기술을 동시에 채용하므로 합계가 100%를 넘을 수 있습니다.',
  held_item: '제공처가 공개한 상위 도구의 채용률입니다.',
  teammate: '함께 사용한 포켓몬의 채용률 순위입니다.',
  stat_alignment: '능력 보정의 개별 채용률입니다.',
  stat_points: 'HP, 공격, 방어, 특수공격, 특수방어, 스피드 순서입니다.',
  ability: '제공처가 집계한 특성별 채용률입니다.',
};

export function statRows(rows, { category, locale, reference, list }) {
  const body = rows
    .map(r => {
      const teammate = category === 'teammate';
      const target = teammate ? list.find(entry => entry.name === r.name) : null;
      const label = reference?.[category]?.[toId(r.name)]?.label ?? locale.label(category, r.name);
      const up = r.up
        ? `<span class="stat-up">${esc(STAT_NAMES[r.up] ?? r.up)} ↑</span>`
        : '<span>보정 없음</span>';
      const down = r.down
        ? `<span class="stat-down">${esc(STAT_NAMES[r.down] ?? r.down)} ↓</span>`
        : '';
      const sub =
        category === 'stat_alignment' ? `<small class="stat-adjust">${up}${down}</small>` : '';
      const name = ['move', 'held_item', 'ability'].includes(category)
        ? effectButton(category, toId(r.name), label)
        : esc(label);
      const trailing = teammate
        ? `<span class="row-arrow">${target ? '↗' : '—'}</span>`
        : `<span class="stat-percent${percentClass(r.percent)}">${percentageText(r.percent)}</span>`;
      const inner =
        `<span class="stat-rank">${r.rank}</span>` +
        `${teammate && target ? `<span class="team-portrait">${portrait(target)}</span>` : ''}` +
        `${category === 'held_item' ? itemArtwork(r.name) : ''}` +
        `<span class="stat-name"><strong>${name}</strong>${sub}` +
        `${teammate && !target ? '<small>이 시즌 목록에 없음</small>' : ''}</span>` +
        trailing;
      return target
        ? `<button class="stat-row teammate-row" data-pokemon="${target.id}"` +
            ` aria-label="${esc(label)} 통계 보기">${inner}</button>`
        : `<div class="stat-row">` +
            `<span class="stat-bar" style="width:${r.percent ?? 0}%" aria-hidden="true"></span>` +
            `${inner}</div>`;
    })
    .join('');
  return `<div class="stat-rows">${body}</div><p class="category-tip">${CATEGORY_TIPS[category]}</p>`;
}

export const groupSummary = ({ disabled, refError, values, options, mode }) =>
  disabled
    ? refError
      ? '정보 불러오기 실패'
      : '불러오는 중'
    : filterSummary(values, options, mode) || '전체';

export function filterGroup(id, key, title, options, values, mode, disabled, summary) {
  const modes = [
    ['or', '하나라도 (OR)'],
    ['and', '모두 (AND)'],
  ]
    .map(
      ([value, label]) =>
        `<label><input type="radio" name="${id}-mode" value="${value}"` +
        ` ${mode === value ? 'checked' : ''}><span>${label}</span></label>`,
    )
    .join('');
  const choices = Object.entries(options)
    .map(
      ([value, label]) =>
        `<label><input type="checkbox" data-choice value="${value}" data-label="${esc(label)}"` +
        ` ${values.includes(value) ? 'checked' : ''}><span>${esc(label)}</span></label>`,
    )
    .join('');
  return (
    `<details id="${id}" class="filter-group" data-filter-group="${key}">` +
    `<summary><strong>${title}</strong>` +
    `<span data-group-summary>${esc(summary)}</span></summary>` +
    `<fieldset aria-label="${title}" ${disabled ? 'disabled' : ''}>` +
    `<div class="filter-mode" role="group" aria-label="${title} 조건 결합">${modes}</div>` +
    `<div class="filter-choices">${choices}</div>` +
    `<button type="button" class="filter-group-clear" data-clear-group>선택 해제</button>` +
    `</fieldset></details>`
  );
}

export const DEX_KINDS = { move: '기술', held_item: '도구', ability: '특성' };
// 조사를 이름에 붙여 만들지 않는다. ‘도구이’처럼 틀린다.
const DEX_SUBJECTS = { move: '기술이', held_item: '도구가', ability: '특성이' };

export const dexKindSwitch = kind =>
  `<div class="segmented" role="group" aria-label="도감 항목">` +
  Object.entries(DEX_KINDS)
    .map(
      ([key, label]) =>
        `<button data-dex-kind="${key}" aria-pressed="${kind === key}">${label}</button>`,
    )
    .join('') +
  `</div>`;

export const dexEmpty = kind =>
  `<div class="empty-state"><span class="empty-symbol">⌕</span>` +
  `<h3>조건에 맞는 ${DEX_SUBJECTS[kind]} 없습니다</h3>` +
  `<p>검색어와 적용한 필터를 확인해 주세요.</p></div>`;

// Rows reuse data-effect-type/data-effect-id, so the existing popup handler opens
// them without extra wiring. Moves are rendered by moveTable instead.
export function dexList(entries, kind) {
  const row = record =>
    `<button class="dex-row" data-effect-type="${esc(kind)}" data-effect-id="${esc(record.id)}"` +
    ` aria-label="${esc(record.label)} 효과 보기">` +
    `${kind === 'held_item' ? itemArtwork(record.name) : ''}` +
    `<span class="dex-name"><strong>${esc(record.label)}</strong>` +
    `</span>` +
    `<span class="dex-effect">${esc(record.effect ?? '효과 설명이 제공되지 않습니다.')}</span>` +
    `</button>`;
  return `<div class="dex-list">${entries.map(row).join('')}</div>`;
}

export const filterHelp = () =>
  '<p class="category-tip filter-help">항목을 펼쳐 여러 값을 선택하세요.' +
  ' 항목 안에서는 AND/OR를 선택하고, 서로 다른 항목의 조건은 모두 만족해야 합니다.</p>';

export const rankingFilterFooter = favoriteOnly =>
  `<div class="filter-footer-note"><label class="filter-checkbox">` +
  `<input id="filter-favorite" type="checkbox" name="favorite"` +
  ` ${favoriteOnly ? 'checked' : ''}>즐겨찾기만 보기</label>` +
  `<p class="category-tip">세대는 원종이 처음 등장한 세대를 기준으로 합니다.<br>` +
  `타입은 메가진화 전의 폼을 기준으로 합니다.</p></div>`;
