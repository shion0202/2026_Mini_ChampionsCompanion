import { ApiClient } from './api.js';
import {
  normalizeIndex,
  formatDate,
  percentageText,
  CATEGORY_LABELS,
  SEASON_REGULATIONS,
  toId,
} from './data.js';
import { createLocale, TYPE_LABELS, STAT_NAMES } from './locale.js';
import { selectRanking } from './reference.js';
import { MOVE_TRAITS } from './move-traits.js';
import { filterValues, filterSummary } from './filters.js';
import { megaSprite, itemArtwork } from './images.js';
import {
  renderReference,
  renderLearnsetShell,
  renderLearnsetRows,
  renderEffect,
  renderSpreads,
  effectButton,
  FILTER_ICON,
  percentClass,
} from './reference-view.js';
const DETAIL_LABELS = { overview: '기본 정보', ...CATEGORY_LABELS, learnset: '배우는 기술' };

const $ = id => document.getElementById(id);
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const readPreference = (key, fallback) => {
  try {
    return JSON.parse(storage?.getItem(`champions:${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
};
const savePreference = (key, value) => {
  try {
    storage?.setItem(`champions:${key}`, JSON.stringify(value));
  } catch {
    /* Session-only preferences remain usable. */
  }
};
const client = new ApiClient({ storage });
const storedFavorites = readPreference('favorites', []);
const favorites = new Set(
  Array.isArray(storedFavorites) ? storedFavorites.filter(x => typeof x === 'string') : [],
);
const state = {
  format: readPreference('format', 'Singles') === 'Doubles' ? 'Doubles' : 'Singles',
  season: readPreference('season', ''),
  index: null,
  snapshot: null,
  locale: null,
  list: [],
  selected: null,
  category: 'overview',
  query: '',
  favoriteOnly: false,
  limit: 30,
  loading: false,
  requestId: 0,
  stale: false,
  fetchedAt: null,
  listScroll: 0,
};
Object.assign(state, {
  sort: 'rank',
  reverse: false,
  generation: [],
  type: [],
  gimmick: [],
  rankModes: {},
  reference: null,
  refError: false,
  form: null,
  statMode: 'base',
  spreadMode: readPreference('spreadMode', 'grouped'),
  learnQuery: '',
  learnType: [],
  learnCategory: [],
  learnTrait: [],
  learnModes: {},
});
const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const fmtTime = value => {
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
let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 4000);
}
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
}
const typeBadges = types =>
  (types ?? [])
    .map(
      type =>
        `<span class="type-badge type-${esc(toId(type))}">${esc(TYPE_LABELS[type] ?? type)}</span>`,
    )
    .join('');
const portrait = (entry, className = '') =>
  entry.sprite
    ? `<img class="portrait ${className}" src="${esc(entry.sprite)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<span class="no-portrait" aria-hidden="true">◇</span>';

function controls() {
  document
    .querySelectorAll('[data-format]')
    .forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.format === state.format)),
    );
  if (state.index) {
    $('season').innerHTML = state.index.seasons
      .map(
        s =>
          `<option value="${s.season}">${s.season === state.index.seasons[0].season ? '[최신] ' : ''}${s.season.replace('M', 'M-')}${SEASON_REGULATIONS[s.season] ? ` (${SEASON_REGULATIONS[s.season]})` : ''}</option>`,
      )
      .join('');
    $('season').value = state.season;
    $('season').disabled = false;
  }
  $('refresh').disabled = state.loading;
  $('refresh').classList.toggle('is-loading', state.loading);
}

function sourceStatus() {
  if (!state.snapshot) {
    $('source-status').textContent = state.loading ? '통계를 불러오는 중' : '자료 없음';
    $('current-source-times').textContent = '';
    return;
  }
  $('source-status').innerHTML =
    `<button class="source-chip" id="source-info"><span class="status-dot ${state.stale ? 'stale' : ''}"></span>자료 ${formatDate(state.snapshot.date)}<span class="source-kind">${state.stale ? '보관 자료' : ''}</span><span aria-hidden="true">ⓘ</span></button>`;
  $('current-source-times').textContent =
    `자료 날짜: ${formatDate(state.snapshot.date)}\nAPI 생성: ${fmtTime(state.snapshot.generatedAt)}\n기기 조회: ${fmtTime(state.fetchedAt)}`;
  $('source-info').onclick = () => $('about-dialog').showModal();
}

function renderList() {
  const visible = selectRanking(state.list, { ...state, favorites });
  $('reverse-sort').setAttribute('aria-pressed', String(state.reverse));
  $('reverse-sort').textContent = state.reverse ? '↓ 내림차순' : '↑ 오름차순';
  document.querySelector('.list-filter>span').textContent =
    `${{ rank: '사용 순위', name: '이름', dex: '도감 번호' }[state.sort]} (${state.reverse ? '내림차순' : '오름차순'})`;
  const activeFilters = [
    filterSummary(state.generation, GENERATION_LABELS, state.rankModes.generation),
    filterSummary(state.type, TYPE_LABELS, state.rankModes.type),
    filterSummary(state.gimmick, GIMMICK_LABELS, state.rankModes.gimmick),
    state.favoriteOnly ? '즐겨찾기' : '',
  ].filter(Boolean);
  $('ranking-filter').innerHTML =
    FILTER_ICON +
    (activeFilters.length ? `<span class="filter-badge">${activeFilters.length}</span>` : '');
  $('ranking-filter').setAttribute(
    'aria-label',
    `랭킹 필터${activeFilters.length ? ` (${activeFilters.length}개 적용)` : ''}`,
  );
  $('ranking-filter-summary').textContent = activeFilters.join(' / ');
  $('ranking-filter-summary').hidden = !activeFilters.length;
  $('count').textContent = `${visible.length}마리`;
  $('favorites-filter').setAttribute('aria-pressed', String(state.favoriteOnly));
  $('favorites-filter').textContent = state.favoriteOnly ? '★ 즐겨찾기' : '☆ 즐겨찾기';
  $('load-more').hidden = visible.length <= state.limit;
  if (!visible.length) {
    $('ranking').innerHTML =
      `<div class="empty-state"><span class="empty-symbol">${state.favoriteOnly ? '☆' : '⌕'}</span><h3>조건에 맞는 포켓몬이 없어요</h3><p>검색어와 적용한 필터를 확인해 주세요.</p><button id="reset-filters" class="text-button">필터 초기화</button></div>`;
    return;
  }
  $('ranking').innerHTML = visible
    .slice(0, state.limit)
    .map(
      p => `<div class="pokemon-row ${state.selected === p.id ? 'selected' : ''}">
    <button class="pokemon-select" data-pokemon="${p.id}" aria-label="${esc(p.label)} ${p.rank}위 통계 보기" ${state.selected === p.id ? 'aria-current="true"' : ''}>
      <span class="rank ${p.rank <= 3 ? 'rank-top' : ''}" aria-label="사용 순위 ${p.rank}위">${p.rank.toString().padStart(2, '0')}</span>
      <span class="portrait-wrap">${portrait(p)}</span><span class="pokemon-info">${state.sort === 'dex' ? `<span class="dex-number">No.${p.dex ? String(p.dex).padStart(3, '0') : '—'}</span>` : ''}<strong>${esc(p.label)}</strong><span class="type-list">${typeBadges(p.types)}</span></span>
    </button>
    <button class="favorite-button" data-favorite="${p.id}" aria-label="${esc(p.label)} 즐겨찾기" aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id) ? '★' : '☆'}</button>
  </div>`,
    )
    .join('');
  $('load-more').textContent =
    `더 보기 (${Math.min(state.limit, visible.length)} / ${visible.length})`;
}

function selectedEntry() {
  return state.list.find(p => p.id === state.selected);
}
function renderHero() {
  const p = selectedEntry(),
    container = document.querySelector('.pokemon-hero');
  if (!p || !container) return;
  const base = state.reference?.species[p.id];
  const mega =
    state.category === 'overview' && base?.megas.includes(state.form)
      ? state.reference.species[state.form]
      : null;
  const shown = mega
    ? { ...p, ...mega, ...state.locale.pokemon(mega.name), sprite: megaSprite(mega.name) }
    : p;
  const key = `${shown.name}:${favorites.has(p.id)}`;
  if (container.dataset.shown === key) return;
  container.dataset.shown = key;
  container.innerHTML = `<div class="hero-copy"><span class="rank-pill">#${p.rank} <span>사용 순위</span></span><h2 tabindex="-1" id="pokemon-title">${esc(shown.label)}</h2><p class="english-name"><span lang="en">${esc(shown.name)}</span>${p.dex ? ` <span>№ ${String(p.dex).padStart(3, '0')}</span>` : ''}</p>${state.locale.pokemonJapanese(shown.name) ? `<p class="japanese-name" lang="ja">${esc(state.locale.pokemonJapanese(shown.name))}</p>` : ''}<div class="type-list">${typeBadges(shown.types)}</div></div><div class="hero-art">${portrait(shown, 'hero-portrait')}<span class="hero-image-fallback" hidden>이미지 미제공</span></div><button class="favorite-button hero-favorite" data-favorite="${p.id}" aria-label="${esc(p.label)} 즐겨찾기" aria-pressed="${favorites.has(p.id)}">${favorites.has(p.id) ? '★' : '☆'}</button>`;
}
function renderDetail() {
  const p = selectedEntry();
  if (!p) {
    $('detail').innerHTML =
      `<div class="detail-placeholder"><div class="placeholder-mark" aria-hidden="true">↗</div><p class="eyebrow">BATTLE INSIGHTS</p><h2>다음 배틀을 위한 한 수</h2><p>포켓몬을 선택하면 기술과 도구,<br>함께 쓰는 포켓몬을 확인할 수 있어요.</p><div class="placeholder-tags"><span>기술</span><span>도구</span><span>같은 팀</span></div></div>`;
    return;
  }
  $('detail').innerHTML = `
    <div class="detail-mobile-nav"><div class="detail-navigation"><button id="previous-pokemon" class="text-button" ${history.state?.previousPokemon && state.list.some(p => p.id === history.state.previousPokemon) ? '' : 'hidden'}>← 이전</button><button id="back" class="text-button">랭킹으로</button></div><span>${state.format === 'Singles' ? '싱글배틀' : '더블배틀'} (${state.season.replace('M', 'M-')})</span></div>
    <div class="pokemon-hero"></div>
    <div class="detail-tabs" role="tablist" aria-label="통계와 도감 항목">${Object.entries(
      DETAIL_LABELS,
    )
      .map(
        ([category, label]) =>
          `<button role="tab" id="tab-${category}" data-category="${category}" aria-controls="category-content" aria-selected="${state.category === category}" tabindex="${state.category === category ? 0 : -1}">${label}</button>`,
      )
      .join('')}</div>
    <div id="category-content" class="category-content" role="tabpanel" aria-labelledby="tab-${state.category}" tabindex="0"></div>
    <div class="detail-source"><span>자료 날짜 <strong>${formatDate(state.snapshot.date)}</strong></span><details><summary>자료 시각 자세히</summary><p>자료: ${state.season.replace('M', 'M-')} / ${state.format === 'Singles' ? '싱글' : '더블'} / ${formatDate(state.snapshot.date)} (제공처 표기, 시간대 미제공)</p><p>API 생성: ${fmtTime(state.snapshot.generatedAt)}</p><p>기기 조회: ${fmtTime(state.fetchedAt)}</p></details></div>`;
  $('back').onclick = () => goToRanking();
  $('previous-pokemon').onclick = () => history.back();
  renderCategory();
}

function renderCategory() {
  const p = selectedEntry();
  if (!p) return;
  const category = state.category;
  renderHero();
  document.querySelectorAll('[data-category]').forEach(button => {
    const selected = button.dataset.category === category;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('category-content').setAttribute('aria-labelledby', `tab-${category}`);
  if (category === 'overview' || category === 'learnset') {
    if (!state.reference) {
      $('category-content').innerHTML =
        `<div class="empty-state">${state.refError ? '도감 자료를 불러오지 못했습니다.<br><button class="text-button" data-ref-retry>다시 시도</button>' : '도감 자료를 불러오는 중입니다.'}</div>`;
      return;
    }
    $('category-content').innerHTML =
      category === 'overview'
        ? renderReference(state.reference, state.locale, p, state.form, state.statMode)
        : renderLearnsetShell(
            state.reference,
            p,
            state.learnQuery,
            state.learnType,
            state.learnCategory,
            state.learnTrait,
            state.learnModes,
          );
    if (category === 'learnset') updateLearnset();
    return;
  }
  const rows =
    category === 'stat_points'
      ? p.categories[category].filter(r => r.rank <= 20)
      : p.categories[category];
  const tips = {
    move: '여러 기술을 동시에 채용하므로 합계가 100%를 넘을 수 있습니다.',
    held_item: '제공처가 공개한 상위 도구의 채용률입니다.',
    teammate: '함께 사용한 포켓몬의 채용률 순위입니다.',
    stat_alignment: '능력 보정의 개별 채용률입니다.',
    stat_points: 'HP, 공격, 방어, 특수공격, 특수방어, 스피드 순서입니다.',
    ability: '제공처가 집계한 특성별 채용률입니다.',
  };
  const header = `<div class="category-heading"><h3>${CATEGORY_LABELS[category]}</h3><span>${rows.length ? `상위 ${rows.length}${category === 'teammate' ? '마리' : '개'}` : '자료 없음'}</span></div>`;
  if (!rows.length) {
    $('category-content').innerHTML =
      header + '<div class="empty-state"><p>이 자료에는 해당 통계가 제공되지 않습니다.</p></div>';
    return;
  }
  if (category === 'stat_points') {
    $('category-content').innerHTML = header + renderSpreads(rows, state.spreadMode);
    return;
  }
  $('category-content').innerHTML =
    header +
    '<div class="stat-rows">' +
    rows
      .map(r => {
        const teammate = category === 'teammate';
        const target = teammate ? state.list.find(entry => entry.name === r.name) : null;
        const label =
          state.reference?.[category]?.[toId(r.name)]?.label ??
          state.locale.label(category, r.name);
        const sub =
          category === 'stat_alignment'
            ? `<small class="stat-adjust">${r.up ? `<span class="stat-up">${esc(STAT_NAMES[r.up] ?? r.up)} ↑</span>` : '<span>보정 없음</span>'}${r.down ? `<span class="stat-down">${esc(STAT_NAMES[r.down] ?? r.down)} ↓</span>` : ''}</small>`
            : '';
        const inner = `<span class="stat-rank">${r.rank}</span>${teammate && target ? `<span class="team-portrait">${portrait(target)}</span>` : ''}${category === 'held_item' ? itemArtwork(r.name) : ''}<span class="stat-name"><strong>${['move', 'held_item', 'ability'].includes(category) ? effectButton(category, toId(r.name), label) : esc(label)}</strong>${sub}${teammate && !target ? '<small>이 시즌 목록에 없음</small>' : ''}</span>${teammate ? `<span class="row-arrow">${target ? '↗' : '—'}</span>` : `<span class="stat-percent${percentClass(r.percent)}">${percentageText(r.percent)}</span>`}`;
        return target
          ? `<button class="stat-row teammate-row" data-pokemon="${target.id}" aria-label="${esc(label)} 통계 보기">${inner}</button>`
          : `<div class="stat-row"><span class="stat-bar" style="width:${r.percent ?? 0}%" aria-hidden="true"></span>${inner}</div>`;
      })
      .join('') +
    `</div><p class="category-tip">${tips[category]}</p>`;
}

function updateLearnset() {
  const p = selectedEntry();
  if (!p || !$('learnset-rows') || !state.reference) return;
  const result = renderLearnsetRows(
    state.reference,
    state.locale,
    p,
    state.learnQuery,
    state.learnType,
    state.learnCategory,
    state.learnTrait,
    state.learnModes,
  );
  $('learnset-rows').innerHTML = result.html;
  $('learnset-count').textContent = `${result.count}개`;
}
async function loadReference() {
  state.refError = false;
  try {
    const response = await fetch('./public/data/reference.json');
    if (!response.ok) throw Error('Reference unavailable');
    state.reference = await response.json();
  } catch {
    state.refError = true;
  }
  if (!state.loading && state.list.length) renderList();
  if ($('gimmick-filter')) {
    $('gimmick-filter').querySelector('fieldset').disabled = !state.reference;
    updateGroupSummary($('gimmick-filter'));
  }
  if (selectedEntry()) renderCategory();
}

function selectPokemon(id, { navigate = true, preserveCategory = false } = {}) {
  if (!state.list.some(p => p.id === id)) return;
  if (!document.body.classList.contains('detail-open')) state.listScroll = window.scrollY;
  const previousPokemon = state.selected;
  state.selected = id;
  if (!preserveCategory) {
    state.category = 'overview';
    state.form = null;
    state.learnQuery = '';
    state.learnType = [];
    state.learnCategory = [];
    state.learnTrait = [];
    state.learnModes = {};
  }
  if (navigate && previousPokemon !== id)
    history.pushState({ pokemon: id, previousPokemon }, '', `#pokemon=${id}`);
  document.body.classList.add('detail-open');
  renderList();
  renderDetail();
  if (matchMedia('(max-width: 760px)').matches) {
    window.scrollTo(0, 0);
    $('pokemon-title')?.focus({ preventScroll: true });
  }
}
function clearSelection() {
  state.selected = null;
  document.body.classList.remove('detail-open');
  renderList();
  renderDetail();
}
function goToRanking({ top = false } = {}) {
  if (state.selected || location.hash)
    history.pushState(null, '', location.pathname + location.search);
  clearSelection();
  window.scrollTo(0, top ? 0 : state.listScroll);
}

async function load(force = false) {
  const requestId = ++state.requestId;
  state.loading = true;
  state.snapshot = null;
  state.list = [];
  controls();
  sourceStatus();
  notice('');
  $('ranking').innerHTML =
    '<div class="empty-state"><span class="loading-ring"></span><p>통계를 불러오는 중</p></div>';
  $('count').textContent = '—';
  $('load-more').hidden = true;
  $('detail').innerHTML =
    '<div class="empty-state"><span class="loading-ring"></span><p>선택한 시즌의 자료를 확인하고 있어요.</p></div>';
  try {
    if (!state.locale) {
      const response = await fetch('./public/data/ko.json');
      if (!response.ok) throw Error('한국어 명칭을 불러오지 못했습니다.');
      state.locale = createLocale(await response.json());
    }
    let indexResult;
    try {
      indexResult = await client.get('/data/meta/index.json', normalizeIndex, { force });
    } catch (error) {
      if (!state.index || !client.previousSnapshot({ season: state.season, format: state.format }))
        throw error;
      indexResult = { data: state.index, stale: true };
    }
    if (requestId !== state.requestId) return;
    state.index = indexResult.data;
    if (!state.index.seasons.some(s => s.season === state.season))
      state.season = state.index.seasons[0].season;
    const season = state.index.seasons.find(s => s.season === state.season);
    if (!season.formats.includes(state.format))
      throw Error('선택한 시즌의 배틀 형식 자료가 제공되지 않습니다.');
    const context = { season: state.season, date: season.dates[0], format: state.format };
    const result = await client.getSnapshot(context, { force });
    if (requestId !== state.requestId) return;
    state.snapshot = result.data;
    state.stale = result.stale || indexResult.stale || !navigator.onLine;
    state.fetchedAt = result.fetchedAt;
    state.list = state.snapshot.pokemon.map(p => ({
      ...state.index.pokemon[p.name],
      ...p,
      ...state.locale.pokemon(p.name),
    }));
    state.limit = 30;
    savePreference('season', state.season);
    savePreference('format', state.format);
    if (state.stale)
      notice(
        `새 자료를 확인하지 못해 ${formatDate(state.snapshot.date)}의 이전 통계를 표시합니다. 표시된 날짜와 시각은 해당 이전 자료 기준입니다.`,
      );
    const fromUrl = new URLSearchParams(location.hash.slice(1)).get('pokemon');
    const selected = state.selected ?? fromUrl;
    if (selected && state.list.some(p => p.id === selected))
      selectPokemon(selected, { navigate: false, preserveCategory: true });
    else {
      clearSelection();
      if (selected) {
        history.replaceState(null, '', location.pathname + location.search);
        notice('선택한 포켓몬은 이 시즌의 통계 목록에 없습니다.');
      }
    }
    if (force)
      toast(
        state.stale
          ? '갱신하지 못했습니다. 보관 자료를 유지합니다.'
          : `자료를 확인했습니다 (${formatDate(state.snapshot.date)})`,
      );
  } catch (error) {
    if (requestId !== state.requestId) return;
    const message =
      error.name === 'TimeoutError' ? '통계 서버의 응답이 늦어지고 있습니다.' : error.message;
    $('ranking').innerHTML =
      `<div class="empty-state error-state"><span class="empty-symbol">↻</span><h3>통계를 불러오지 못했어요</h3><p>네트워크 연결과 통계 제공처 상태를 확인해 주세요.</p><p class="error-detail">${esc(message)}</p><button id="retry" class="primary-button">다시 시도</button></div>`;
    $('retry').onclick = () => load(true);
    $('detail').innerHTML =
      '<div class="detail-placeholder"><h2>자료를 기다리고 있어요</h2><p>조회가 완료되면 통계를 확인할 수 있습니다.</p></div>';
    document.body.classList.remove('detail-open');
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      controls();
      sourceStatus();
    }
  }
}

$('search').addEventListener('input', event => {
  state.query = event.target.value;
  state.limit = 30;
  if (!state.loading) renderList();
});
$('favorites-filter').onclick = () => {
  state.favoriteOnly = !state.favoriteOnly;
  state.limit = 30;
  if (!state.loading) renderList();
};
$('load-more').onclick = () => {
  state.limit += 30;
  renderList();
};
$('season').onchange = event => {
  state.season = event.target.value;
  load();
};
$('refresh').onclick = () => load(true);
const regions = [
  '관동',
  '성도',
  '호연',
  '신오',
  '하나',
  '칼로스',
  '알로라',
  '가라르·히스이',
  '팔데아',
];
const GENERATION_LABELS = Object.fromEntries(
  regions.map((_, i) => [String(i + 1), `${i + 1}세대`]),
);
const GIMMICK_LABELS = { none: '기믹 없음', mega: '메가진화' };
const MOVE_CATEGORIES = { Physical: '물리', Special: '특수', Status: '변화' };
let filterKind = 'ranking';
function filterGroup(id, key, title, options, current, mode = 'or', disabled = false) {
  const values = filterValues(current);
  const summary = disabled
    ? state.refError
      ? '정보 불러오기 실패'
      : '불러오는 중'
    : filterSummary(values, options, mode) || '전체';
  return `<details id="${id}" class="filter-group" data-filter-group="${key}"><summary><strong>${title}</strong><span data-group-summary>${esc(summary)}</span></summary><fieldset aria-label="${title}" ${disabled ? 'disabled' : ''}><div class="filter-mode" role="group" aria-label="${title} 조건 결합">${[
    ['or', '하나라도 (OR)'],
    ['and', '모두 (AND)'],
  ]
    .map(
      ([value, label]) =>
        `<label><input type="radio" name="${id}-mode" value="${value}" ${mode === value ? 'checked' : ''}><span>${label}</span></label>`,
    )
    .join('')}</div><div class="filter-choices">${Object.entries(options)
    .map(
      ([value, label]) =>
        `<label><input type="checkbox" data-choice value="${value}" data-label="${esc(label)}" ${values.includes(value) ? 'checked' : ''}><span>${esc(label)}</span></label>`,
    )
    .join(
      '',
    )}</div><button type="button" class="filter-group-clear" data-clear-group>선택 해제</button></fieldset></details>`;
}
function groupValues(group) {
  return [...group.querySelectorAll('[data-choice]:checked')].map(input => input.value);
}
function groupMode(group) {
  return group.querySelector('input[type=radio]:checked')?.value ?? 'or';
}
function updateGroupSummary(group) {
  const labels = Object.fromEntries(
    [...group.querySelectorAll('[data-choice]')].map(input => [input.value, input.dataset.label]),
  );
  group.querySelector('[data-group-summary]').textContent = group.querySelector('fieldset').disabled
    ? state.refError
      ? '정보 불러오기 실패'
      : '불러오는 중'
    : filterSummary(groupValues(group), labels, groupMode(group)) || '전체';
}
function openFilters(kind) {
  filterKind = kind;
  const ranking = kind === 'ranking';
  $('filter-title').textContent = ranking ? '랭킹 필터' : '배우는 기술 필터';
  const help =
    '<p class="category-tip filter-help">항목을 펼쳐 여러 값을 선택하세요. 항목 안에서는 AND/OR를 선택하고, 서로 다른 항목의 조건은 모두 만족해야 합니다.</p>';
  $('filter-fields').innerHTML =
    help +
    (ranking
      ? filterGroup(
          'generation-filter',
          'generation',
          '세대',
          Object.fromEntries(regions.map((name, i) => [String(i + 1), `${i + 1}세대 (${name})`])),
          state.generation,
          state.rankModes.generation,
        ) +
        filterGroup('type-filter', 'type', '타입', TYPE_LABELS, state.type, state.rankModes.type) +
        filterGroup(
          'gimmick-filter',
          'gimmick',
          '기믹',
          GIMMICK_LABELS,
          state.gimmick,
          state.rankModes.gimmick,
          !state.reference,
        ) +
        `<div class="filter-footer-note"><label class="filter-checkbox"><input id="filter-favorite" type="checkbox" name="favorite" ${state.favoriteOnly ? 'checked' : ''}>즐겨찾기만 보기</label><p class="category-tip">세대는 원종이 처음 등장한 세대를 기준으로 합니다.<br>타입은 메가진화 전의 폼을 기준으로 합니다.</p></div>`
      : filterGroup(
          'learnset-type',
          'type',
          '타입',
          TYPE_LABELS,
          state.learnType,
          state.learnModes.type,
        ) +
        filterGroup(
          'learnset-category',
          'category',
          '분류',
          MOVE_CATEGORIES,
          state.learnCategory,
          state.learnModes.category,
        ) +
        filterGroup(
          'learnset-trait',
          'trait',
          '기술 성질',
          MOVE_TRAITS,
          state.learnTrait,
          state.learnModes.trait,
        ));
  $('filter-dialog').showModal();
}
$('ranking-filter').onclick = () => openFilters('ranking');
$('close-filter').onclick = () => $('filter-dialog').close();
$('filter-fields').addEventListener('change', event => {
  const group = event.target.closest('[data-filter-group]');
  if (group) updateGroupSummary(group);
});
$('filter-fields').addEventListener('click', event => {
  if (!event.target.closest('[data-clear-group]')) return;
  const group = event.target.closest('[data-filter-group]');
  group.querySelectorAll('[data-choice]').forEach(input => (input.checked = false));
  updateGroupSummary(group);
});
$('clear-filter').onclick = () => {
  $('filter-fields')
    .querySelectorAll('input[type=checkbox]')
    .forEach(input => (input.checked = false));
  $('filter-fields')
    .querySelectorAll('input[type=radio]')
    .forEach(input => (input.checked = input.value === 'or'));
  $('filter-fields').querySelectorAll('[data-filter-group]').forEach(updateGroupSummary);
};
$('filter-form').onsubmit = event => {
  event.preventDefault();
  const groups = [...$('filter-fields').querySelectorAll('[data-filter-group]')];
  const values = Object.fromEntries(groups.map(g => [g.dataset.filterGroup, groupValues(g)]));
  const modes = Object.fromEntries(groups.map(g => [g.dataset.filterGroup, groupMode(g)]));
  if (filterKind === 'ranking') {
    state.generation = values.generation;
    state.type = values.type;
    state.gimmick = values.gimmick;
    state.rankModes = modes;
    state.favoriteOnly = $('filter-favorite').checked;
    state.limit = 30;
    if (!state.loading) renderList();
  } else {
    state.learnType = values.type;
    state.learnCategory = values.category;
    state.learnTrait = values.trait;
    state.learnModes = modes;
    renderCategory();
  }
  $('filter-dialog').close();
  (filterKind === 'ranking' ? $('ranking-filter') : $('learnset-filter'))?.focus({
    preventScroll: true,
  });
};

$('sort').onchange = event => {
  state.sort = event.target.value;
  state.limit = 30;
  if (!state.loading) renderList();
};
$('reverse-sort').onclick = () => {
  state.reverse = !state.reverse;
  if (!state.loading) renderList();
};
document.addEventListener('input', event => {
  if (event.target.id === 'learnset-search') {
    state.learnQuery = event.target.value;
    updateLearnset();
  }
});
$('close-effect').onclick = () => $('effect-dialog').close();
document.querySelectorAll('[data-format]').forEach(button => {
  button.onclick = () => {
    if (state.format !== button.dataset.format) {
      state.format = button.dataset.format;
      load();
    }
  };
});
document.addEventListener('click', event => {
  if (event.target.closest('#learnset-filter')) {
    openFilters('learnset');
    return;
  }
  const effect = event.target.closest('[data-effect-type]');
  if (effect) {
    const result = renderEffect(
      state.reference,
      state.locale,
      effect.dataset.effectType,
      effect.dataset.effectId,
    );
    $('effect-heading').innerHTML =
      result.heading ?? `<h2 id="effect-title">${esc(result.title)}</h2>`;
    $('effect-body').innerHTML = !state.reference
      ? '<p>도감 자료를 아직 불러오지 못했습니다. 기본 정보 탭에서 다시 시도해 주세요.</p>'
      : result.html;
    $('effect-dialog').showModal();
    return;
  }
  const form = event.target.closest('[data-form]');
  if (form) {
    state.form = form.dataset.form;
    renderCategory();
    return;
  }
  const statMode = event.target.closest('[data-stat-mode]');
  if (statMode) {
    state.statMode = statMode.dataset.statMode;
    renderCategory();
    return;
  }
  const spreadMode = event.target.closest('[data-spread-mode]');
  if (spreadMode) {
    state.spreadMode = spreadMode.dataset.spreadMode;
    savePreference('spreadMode', state.spreadMode);
    renderCategory();
    return;
  }
  if (event.target.closest('[data-ref-retry]')) {
    loadReference();
    renderCategory();
    return;
  }
  if (event.target.closest('#reset-filters')) {
    state.query = '';
    state.type = [];
    state.generation = [];
    state.gimmick = [];
    state.rankModes = {};
    state.favoriteOnly = false;
    $('search').value = '';
    renderList();
    return;
  }
  const pokemon = event.target.closest('[data-pokemon]');
  if (pokemon && !state.loading) {
    selectPokemon(pokemon.dataset.pokemon);
    return;
  }
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) {
    const id = favorite.dataset.favorite;
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    savePreference('favorites', [...favorites]);
    renderList();
    renderDetail();
    return;
  }
  const category = event.target.closest('[data-category]');
  if (category) {
    state.category = category.dataset.category;
    renderCategory();
  }
});
document.addEventListener('keydown', event => {
  if (
    event.key === '/' &&
    !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) &&
    !document.body.classList.contains('detail-open')
  ) {
    event.preventDefault();
    $('search').focus();
  }
  const tab = event.target.closest('[data-category]');
  if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const keys = Object.keys(DETAIL_LABELS);
    const i = keys.indexOf(state.category);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? keys.length - 1
          : (i + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    state.category = keys[next];
    renderCategory();
    $(`tab-${state.category}`).focus();
  }
});
document.addEventListener(
  'error',
  event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains('portrait')) {
      img.classList.add('image-missing');
      const fallback = img.parentElement.querySelector('.hero-image-fallback');
      if (fallback) fallback.hidden = false;
    }
    if (img.classList.contains('item-image')) {
      img.hidden = true;
      img.parentElement.querySelector('.item-fallback').hidden = false;
    }
  },
  true,
);
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.hash.slice(1)).get('pokemon');
  if (id && state.list.some(p => p.id === id)) selectPokemon(id, { navigate: false });
  else {
    clearSelection();
    window.scrollTo(0, state.listScroll);
  }
});
document.querySelector('.brand').onclick = event => {
  event.preventDefault();
  goToRanking({ top: true });
};
$('about').onclick = () => $('about-dialog').showModal();
$('close-about').onclick = () => $('about-dialog').close();
$('about-dialog').addEventListener('click', event => {
  if (event.target === $('about-dialog')) {
    const rect = $('about-dialog').getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      $('about-dialog').close();
  }
});
window.addEventListener('offline', () =>
  notice('오프라인입니다. 현재 불러온 통계는 계속 확인할 수 있습니다.'),
);
window.addEventListener('online', () =>
  toast('네트워크에 연결됐습니다. 새로고침으로 자료를 확인할 수 있어요.'),
);
let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('install').hidden = false;
});
$('install').onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    $('install').hidden = true;
  }
};
window.addEventListener('appinstalled', () => {
  $('install').hidden = true;
});
if ('serviceWorker' in navigator && window.isSecureContext)
  navigator.serviceWorker.register('./sw.js').catch(() => {});
load();
loadReference();
