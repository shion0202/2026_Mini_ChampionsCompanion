import { ApiClient } from './api.js';
import { normalizeIndex, formatDate, CATEGORY_LABELS, SEASON_REGULATIONS } from './data.js';
import { createLocale, TYPE_LABELS } from './locale.js';
import { selectRanking } from './reference.js';
import { MOVE_TRAITS } from './move-traits.js';
import { filterValues, filterSummary } from './filters.js';
import { megaSprite } from './images.js';
import { reviewedArticles, selectArticles } from './articles.js';
import { articleControls, articleSeasonLabel, renderArticleCards } from './articles-view.js';
import { renderTypeDefense, renderTypeMatrix, toggleDefenseType } from './type-chart-view.js';
import {
  renderReference,
  renderLearnsetShell,
  renderLearnsetRows,
  renderEffect,
  renderSpreads,
  selectMoves,
  moveTable,
} from './reference-view.js';
import {
  esc,
  seasonOptions,
  sourceChip,
  sourceTimes,
  rankingFilterButton,
  loadingState,
  errorState,
  rankingEmpty,
  rankingRows,
  heroMarkup,
  detailPlaceholder,
  detailWaiting,
  detailShell,
  referenceStatus,
  categoryHeader,
  categoryEmpty,
  statRows,
  groupSummary,
  filterGroup,
  filterHelp,
  rankingFilterFooter,
  DEX_KINDS,
  dexKindSwitch,
  dexEmpty,
  dexList,
} from './app-view.js';
import {
  dexEntries,
  preferences,
  resolveSeason,
  resolveContext,
  buildList,
  loadMessages,
  selectionReset,
  sortLabel,
  activeFilters,
} from './app-state.js';
const DETAIL_LABELS = {
  overview: '기본 정보',
  ...CATEGORY_LABELS,
  learnset: '배우는 기술',
  articles: '구축기사',
};

const $ = id => document.getElementById(id);
history.scrollRestoration = 'manual';
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const savePreference = (key, value) => {
  try {
    storage?.setItem(`champions:${key}`, JSON.stringify(value));
  } catch {
    /* Session-only preferences remain usable. */
  }
};
const client = new ApiClient({ storage });
const saved = preferences(storage);
const favorites = saved.favorites;
const state = {
  page: 'ranking',
  articleData: null,
  articleError: false,
  articleFilters: { season: null, format: 'Singles', query: '', pokemon: '' },
  typeChartMode: 'defense',
  defenseTypes: [],
  format: saved.format,
  season: saved.season,
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
  spreadMode: saved.spreadMode,
  learnQuery: '',
  learnType: [],
  learnCategory: [],
  learnTrait: [],
  learnModes: {},
  dex: null,
  dexQuery: '',
  dexSearchMode: 'name',
  dexAvailability: '',
  dexType: [],
  dexCategory: [],
  dexTrait: [],
  dexModes: {},
  dexLimit: 50,
});
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
  $('notice').hidden = state.page !== 'ranking' || !text;
}
function controls() {
  document
    .querySelectorAll('[data-format]')
    .forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.format === state.format)),
    );
  if (state.index) {
    $('season').innerHTML = seasonOptions(state.index.seasons, SEASON_REGULATIONS);
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
  $('source-status').innerHTML = sourceChip({ stale: state.stale, date: state.snapshot.date });
  $('current-source-times').textContent = sourceTimes({
    date: state.snapshot.date,
    generatedAt: state.snapshot.generatedAt,
    fetchedAt: state.fetchedAt,
  });
  $('source-info').onclick = () => $('about-dialog').showModal();
}

function renderList() {
  const visible = selectRanking(state.list, { ...state, favorites });
  $('reverse-sort').setAttribute('aria-pressed', String(state.reverse));
  $('reverse-sort').textContent = state.reverse ? '↓ 내림차순' : '↑ 오름차순';
  document.querySelector('.list-filter>span').textContent = sortLabel(state.sort, state.reverse);
  const summaries = activeFilters(state, {
    generation: GENERATION_LABELS,
    type: TYPE_LABELS,
    gimmick: GIMMICK_LABELS,
  });
  $('ranking-filter').innerHTML = rankingFilterButton(summaries.length);
  $('ranking-filter').setAttribute(
    'aria-label',
    `랭킹 필터${summaries.length ? ` (${summaries.length}개 적용)` : ''}`,
  );
  $('ranking-filter-summary').textContent = summaries.join(' / ');
  $('ranking-filter-summary').hidden = !summaries.length;
  $('count').textContent = `${visible.length}마리`;
  $('favorites-filter').setAttribute('aria-pressed', String(state.favoriteOnly));
  $('favorites-filter').textContent = state.favoriteOnly ? '★ 즐겨찾기' : '☆ 즐겨찾기';
  $('load-more').hidden = visible.length <= state.limit;
  if (!visible.length) {
    $('ranking').innerHTML = rankingEmpty(state.favoriteOnly);
    return;
  }
  $('ranking').innerHTML = rankingRows(visible.slice(0, state.limit), {
    selected: state.selected,
    sort: state.sort,
    favorites,
  });
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
  container.innerHTML = heroMarkup({
    entry: p,
    shown,
    japanese: state.locale.pokemonJapanese(shown.name),
    isFavorite: favorites.has(p.id),
  });
}
function renderDetail() {
  const p = selectedEntry();
  if (!p) {
    $('detail').innerHTML = detailPlaceholder();
    return;
  }
  $('detail').innerHTML = detailShell({
    hasPrevious:
      history.state?.previousPokemon &&
      state.list.some(entry => entry.id === history.state.previousPokemon),
    format: state.format,
    season: state.season,
    labels: DETAIL_LABELS,
    category: state.category,
    date: state.snapshot.date,
    generatedAt: state.snapshot.generatedAt,
    fetchedAt: state.fetchedAt,
  });
  $('back').onclick = () => goToRanking();
  $('previous-pokemon').onclick = () => history.back();
  renderCategory();
}

// Tabs hold content of very different heights, so after a swap the page can sit
// anywhere against the new panel: a short tab leaves the reader below it, a tall
// one above. Pull the tab strip back under the header when it has drifted out of
// reach, and leave the view alone when it is already in place so reading from the
// top of the detail does not jump.
const detailTabOffset = () => {
  const tabs = document.querySelector('.detail-tabs');
  const header = document.querySelector('.header');
  if (!tabs || !header) return null;
  return tabs.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
};
// Whether the reader has scrolled past the top of the detail. Asked before the
// swap, because afterwards the new content's height has already moved everything.
// Measured on the panel rather than the tab strip: once the strip is pinned its
// own offset is zero, and a test against that would skip every later switch.
const readingDetail = () => {
  const panel = $('detail');
  const header = document.querySelector('.header');
  if (!panel || !header) return false;
  return panel.getBoundingClientRect().top < header.getBoundingClientRect().bottom;
};
// Put the tab strip back under the header. A short tab may not leave enough page
// to scroll that far, and the browser clamps; the result is still the same place
// every time, which is what makes the tabs usable one after another.
function pinDetailTabs() {
  const offset = detailTabOffset();
  if (offset !== null) window.scrollTo(0, Math.max(0, window.scrollY + offset));
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
  if (category === 'articles') {
    const filters = { season: state.season, format: state.format, pokemon: p.id };
    $('category-content').innerHTML =
      `<div class="category-heading"><h3>구축기사</h3></div>
      <p class="category-tip">${esc(articleSeasonLabel(state.season))} / ${state.format === 'Singles' ? '싱글배틀' : '더블배틀'} 기준입니다.</p>` +
      articleContent(filters) +
      `<button class="load-more" data-article-pokemon="${esc(p.id)}">이 포켓몬의 다른 시즌 기사 보기</button>`;
    return;
  }
  if (category === 'overview' || category === 'learnset') {
    if (!state.reference) {
      $('category-content').innerHTML = referenceStatus(state.refError);
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
  const header = categoryHeader(category, rows);
  if (!rows.length) {
    $('category-content').innerHTML = header + categoryEmpty();
    return;
  }
  if (category === 'stat_points') {
    $('category-content').innerHTML = header + renderSpreads(rows, state.spreadMode);
    return;
  }
  $('category-content').innerHTML =
    header +
    statRows(rows, {
      category,
      locale: state.locale,
      reference: state.reference,
      list: state.list,
    });
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

function dexVisible() {
  if (!state.reference || !state.locale) return [];
  const query = state.dexSearchMode === 'name' ? state.dexQuery : '';
  const entries =
    state.dex !== 'move'
      ? dexEntries(state.reference, state.locale, state.dex, query)
      : selectMoves(state.reference, state.locale, Object.keys(state.reference.move), {
          query,
          type: state.dexType,
          category: state.dexCategory,
          trait: state.dexTrait,
          modes: state.dexModes,
        });
  return entries.filter(
    entry =>
      (!state.dexAvailability || String(entry.champions) === state.dexAvailability) &&
      (state.dexSearchMode !== 'effect' || (entry.effect ?? '').includes(state.dexQuery.trim())),
  );
}
function renderDex() {
  if (!state.dex) return;
  $('dex-kinds').innerHTML = dexKindSwitch(state.dex);
  const moves = state.dex === 'move';
  $('dex-filter').hidden = false;
  const summaries = moves
    ? [
        filterSummary(state.dexType, TYPE_LABELS, state.dexModes.type),
        filterSummary(state.dexCategory, MOVE_CATEGORIES, state.dexModes.category),
        filterSummary(state.dexTrait, MOVE_TRAITS, state.dexModes.trait),
      ].filter(Boolean)
    : [];
  if (state.dexAvailability) summaries.unshift(AVAILABILITY_LABELS[state.dexAvailability]);
  $('dex-filter').innerHTML = rankingFilterButton(summaries.length);
  $('dex-filter').setAttribute(
    'aria-label',
    `도감 필터${summaries.length ? ` (${summaries.length}개 적용)` : ''}`,
  );
  $('dex-filter-summary').textContent = summaries.join(' / ');
  $('dex-filter-summary').hidden = !summaries.length;
  if (!state.reference || !state.locale) {
    $('dex-count').textContent = '—';
    $('dex-more').hidden = true;
    // The Korean dictionary arrives with the ranking; the dex waits for both.
    $('dex-rows').innerHTML = state.reference
      ? loadingState('도감을 불러오는 중')
      : referenceStatus(state.refError);
    return;
  }
  const entries = dexVisible();
  $('dex-count').textContent = `${entries.length}개`;
  $('dex-more').hidden = entries.length <= state.dexLimit;
  $('dex-more').textContent =
    `더 보기 (${Math.min(state.dexLimit, entries.length)} / ${entries.length})`;
  if (!entries.length) {
    $('dex-rows').innerHTML = dexEmpty(state.dex);
    return;
  }
  const shown = entries.slice(0, state.dexLimit);
  $('dex-rows').innerHTML = moves
    ? moveTable(state.reference, state.locale, shown)
    : dexList(shown, state.dex);
}
function showPage(page) {
  state.page = page;
  if (page !== 'dex') state.dex = null;
  for (const [key, panel] of Object.entries({
    ranking: 'workspace',
    dex: 'dex',
    types: 'type-chart',
    articles: 'articles',
  })) {
    $(panel).hidden = page !== key;
    $(`${key}-link`).setAttribute('aria-pressed', String(page === key));
  }
  $('toolbar').hidden = page !== 'ranking';
  $('notice').hidden = page !== 'ranking' || !$('notice').textContent;
}

function articleContent(filters) {
  if (state.articleError)
    return '<div class="empty-state"><p>구축기사를 불러오지 못했습니다.</p><button class="text-button" data-retry-articles>다시 시도</button></div>';
  if (!state.articleData) return loadingState('구축기사를 불러오는 중');
  if (!state.reference) return referenceStatus(state.refError);
  if (!state.locale)
    return '<div class="empty-state"><p>한국어 명칭을 준비하고 있습니다.</p><button class="text-button" data-retry-articles>다시 시도</button></div>';
  const rows = selectArticles(
    reviewedArticles(state.articleData, state.reference),
    filters,
    state.reference,
    state.locale,
  );
  return (
    `<p class="article-count" role="status">${rows.length}건${filters.season ? ' (최종 순위순)' : ' (최근 시즌부터, 최종 순위순)'}</p>` +
    renderArticleCards(rows, state.reference, state.locale, filters.pokemon)
  );
}

function renderArticles() {
  if (state.page !== 'articles') return;
  const filters = state.articleFilters;
  $('article-controls').innerHTML = articleControls(state.articleData?.articles ?? [], filters);
  const species = state.reference?.species[filters.pokemon];
  $('article-pokemon-filter').innerHTML = species
    ? `<span>${esc(state.locale?.pokemon(species.name).label ?? species.name)} 채용 파티</span><button class="text-button" id="clear-article-pokemon">선택 해제</button>`
    : '';
  $('article-pokemon-filter').hidden = !species;
  $('article-rows').innerHTML = articleContent(filters);
}

function openArticles({ navigate = true } = {}) {
  showPage('articles');
  if (navigate) history.pushState({ articles: true }, '', '#articles');
  renderArticles();
  window.scrollTo(0, 0);
}

async function loadArticles() {
  state.articleError = false;
  try {
    const response = await fetch('./public/data/articles.json');
    if (!response.ok) throw Error('Articles unavailable');
    const data = await response.json();
    if (!Array.isArray(data.articles)) throw Error('Invalid articles');
    state.articleData = data;
    if (state.articleFilters.season === null) {
      state.articleFilters.season =
        data.articles
          .filter(a => a.review?.status === 'reviewed')
          .map(a => a.season)
          .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0] ?? '';
    }
  } catch {
    state.articleError = true;
  }
  renderArticles();
  if (state.category === 'articles' && selectedEntry()) renderCategory();
}

function renderTypeChart() {
  if (state.page !== 'types') return;
  document
    .querySelectorAll('[data-type-chart-mode]')
    .forEach(button =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.typeChartMode === state.typeChartMode),
      ),
    );
  $('type-chart-content').innerHTML = !state.reference
    ? referenceStatus(state.refError)
    : state.typeChartMode === 'matrix'
      ? renderTypeMatrix(state.reference.types)
      : renderTypeDefense(state.defenseTypes, state.reference.types);
}
function openTypeChart(mode = 'defense', { navigate = true } = {}) {
  state.typeChartMode = mode === 'matrix' ? 'matrix' : 'defense';
  showPage('types');
  if (navigate)
    history.pushState({ types: state.typeChartMode }, '', `#types=${state.typeChartMode}`);
  renderTypeChart();
  window.scrollTo(0, 0);
}
function openDex(kind, { navigate = true } = {}) {
  state.dex = kind in DEX_KINDS ? kind : 'move';
  state.dexLimit = 50;
  if (navigate) history.pushState({ dex: state.dex }, '', `#dex=${state.dex}`);
  showPage('dex');
  renderDex();
  window.scrollTo(0, 0);
  $('dex-search').focus({ preventScroll: true });
}
function closeDex() {
  showPage('ranking');
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
  if (state.dex) renderDex();
  renderArticles();
  renderTypeChart();
  if (selectedEntry()) renderCategory();
}

function selectPokemon(id, { navigate = true, preserveCategory = false } = {}) {
  if (!state.list.some(p => p.id === id)) return;
  if (!document.body.classList.contains('detail-open')) state.listScroll = window.scrollY;
  const previousPokemon = state.selected;
  state.selected = id;
  if (!preserveCategory) Object.assign(state, selectionReset());
  if (navigate && previousPokemon !== id)
    history.pushState({ pokemon: id, previousPokemon }, '', `#pokemon=${id}`);
  document.body.classList.add('detail-open');
  renderList();
  renderDetail();
  if (state.page === 'ranking' && !preserveCategory) window.scrollTo(0, 0);
  if (state.page === 'ranking' && matchMedia('(max-width: 760px)').matches) {
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
  if (state.selected || state.dex || location.hash)
    history.pushState(null, '', location.pathname + location.search);
  showPage('ranking');
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
  $('ranking').innerHTML = loadingState('통계를 불러오는 중');
  $('count').textContent = '—';
  $('load-more').hidden = true;
  $('detail').innerHTML = loadingState('선택한 시즌의 자료를 확인하고 있어요.');
  try {
    if (!state.locale) {
      const response = await fetch('./public/data/ko.json');
      if (!response.ok) throw Error('한국어 명칭을 불러오지 못했습니다.');
      state.locale = createLocale(await response.json());
      if (state.dex) renderDex();
      renderArticles();
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
    state.season = resolveSeason(state.index, state.season);
    const context = resolveContext(state.index, state);
    const result = await client.getSnapshot(context, { force });
    if (requestId !== state.requestId) return;
    state.snapshot = result.data;
    state.stale = result.stale || indexResult.stale || !navigator.onLine;
    state.fetchedAt = result.fetchedAt;
    state.list = buildList(state.index, state.snapshot, state.locale);
    state.limit = 30;
    savePreference('season', state.season);
    savePreference('format', state.format);
    // A stale read and a partial read can both apply; neither is trimmed silently.
    notice(
      loadMessages({
        stale: state.stale,
        date: state.snapshot.date,
        skipped: state.snapshot.skipped?.length ?? 0,
      }),
    );
    const fromUrl = new URLSearchParams(location.hash.slice(1)).get('pokemon');
    const selected = state.selected ?? fromUrl;
    if (selected && state.list.some(p => p.id === selected))
      selectPokemon(selected, { navigate: false, preserveCategory: true });
    else {
      clearSelection();
      if (selected && state.page === 'ranking') {
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
    $('ranking').innerHTML = errorState(message);
    $('retry').onclick = () => load(true);
    $('detail').innerHTML = detailWaiting();
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
const AVAILABILITY_LABELS = { true: '챔피언스 수록', false: '챔피언스 미수록' };
let filterKind = 'ranking';
// Binds the pure markup builder to the current state.
function group(id, key, title, options, current, mode = 'or', disabled = false) {
  const values = filterValues(current);
  const summary = groupSummary({ disabled, refError: state.refError, values, options, mode });
  return filterGroup(id, key, title, options, values, mode, disabled, summary);
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
  group.querySelector('[data-group-summary]').textContent = groupSummary({
    disabled: group.querySelector('fieldset').disabled,
    refError: state.refError,
    values: groupValues(group),
    options: labels,
    mode: groupMode(group),
  });
}
function openFilters(kind) {
  filterKind = kind;
  const ranking = kind === 'ranking';
  const dex = kind === 'dex';
  $('filter-title').textContent = ranking ? '랭킹 필터' : dex ? '도감 필터' : '배우는 기술 필터';
  // The learnset and the move index filter on the same three properties.
  const moveGroups = (prefix, type, category, trait, modes) =>
    group(`${prefix}-type`, 'type', '타입', TYPE_LABELS, type, modes.type) +
    group(`${prefix}-category`, 'category', '분류', MOVE_CATEGORIES, category, modes.category) +
    group(`${prefix}-trait`, 'trait', '기술 성질', MOVE_TRAITS, trait, modes.trait);
  $('filter-fields').innerHTML =
    (dex && state.dex !== 'move'
      ? '<p class="category-tip filter-help">앱에 수록된 게임 데이터 기준입니다. 시즌별 허용 여부와는 다릅니다.</p>'
      : filterHelp()) +
    (ranking
      ? group(
          'generation-filter',
          'generation',
          '세대',
          Object.fromEntries(regions.map((name, i) => [String(i + 1), `${i + 1}세대 (${name})`])),
          state.generation,
          state.rankModes.generation,
        ) +
        group('type-filter', 'type', '타입', TYPE_LABELS, state.type, state.rankModes.type) +
        group(
          'gimmick-filter',
          'gimmick',
          '기믹',
          GIMMICK_LABELS,
          state.gimmick,
          state.rankModes.gimmick,
          !state.reference,
        ) +
        rankingFilterFooter(state.favoriteOnly)
      : dex
        ? `<label class="catalog-availability">챔피언스 수록 여부<select id="dex-availability"><option value="">전체</option>${Object.entries(
            AVAILABILITY_LABELS,
          )
            .map(
              ([value, label]) =>
                `<option value="${value}"${state.dexAvailability === value ? ' selected' : ''}>${label}</option>`,
            )
            .join('')}</select></label>` +
          (state.dex === 'move'
            ? moveGroups('dex', state.dexType, state.dexCategory, state.dexTrait, state.dexModes)
            : '')
        : moveGroups(
            'learnset',
            state.learnType,
            state.learnCategory,
            state.learnTrait,
            state.learnModes,
          ));
  $('filter-dialog').showModal();
}
$('ranking-filter').onclick = () => openFilters('ranking');
$('ranking-link').onclick = () => goToRanking({ top: true });
$('articles-link').onclick = () => {
  if (state.page !== 'articles') openArticles();
};
$('articles').addEventListener('change', event => {
  if (event.target.id === 'article-season') state.articleFilters.season = event.target.value;
  if (event.target.id === 'article-format') state.articleFilters.format = event.target.value;
  $('article-rows').innerHTML = articleContent(state.articleFilters);
});
$('articles').addEventListener('input', event => {
  if (event.target.id !== 'article-search') return;
  state.articleFilters.query = event.target.value;
  $('article-rows').innerHTML = articleContent(state.articleFilters);
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-retry-articles]')) {
    loadArticles();
    if (!state.locale) load();
    return;
  }
  const button = event.target.closest('[data-article-pokemon]');
  if (button) {
    state.articleFilters = {
      season: '',
      format: state.format,
      query: '',
      pokemon: button.dataset.articlePokemon,
    };
    openArticles();
  }
  if (event.target.closest('#clear-article-pokemon')) {
    state.articleFilters.pokemon = '';
    renderArticles();
  }
});
$('types-link').onclick = () => {
  if (state.page !== 'types') openTypeChart();
};
$('type-chart').addEventListener('click', event => {
  const mode = event.target.closest('[data-type-chart-mode]');
  if (mode) {
    state.typeChartMode = mode.dataset.typeChartMode;
    history.replaceState({ types: state.typeChartMode }, '', `#types=${state.typeChartMode}`);
    renderTypeChart();
    return;
  }
  const type = event.target.closest('[data-defense-type]');
  if (type && !type.disabled) {
    state.defenseTypes = toggleDefenseType(state.defenseTypes, type.dataset.defenseType);
    renderTypeChart();
    document
      .querySelector(`[data-defense-type="${type.dataset.defenseType}"]`)
      ?.focus({ preventScroll: true });
  } else if (event.target.closest('[data-clear-defense]')) {
    state.defenseTypes = [];
    renderTypeChart();
    document.querySelector('[data-defense-type]')?.focus({ preventScroll: true });
  }
});
$('dex-link').onclick = () => {
  if (!state.dex) openDex('move');
};
$('dex-search-mode').onchange = event => {
  state.dexSearchMode = event.target.value;
  $('dex-search').placeholder =
    state.dexSearchMode === 'effect'
      ? '효과 설명 검색 (예: 스피드, 회복)'
      : '이름, 초성, 영문 검색';
  state.dexLimit = 50;
  renderDex();
};
$('dex-filter').onclick = () => openFilters('dex');
$('dex-search').addEventListener('input', event => {
  state.dexQuery = event.target.value;
  state.dexLimit = 50;
  renderDex();
});
$('dex-more').onclick = () => {
  state.dexLimit += 50;
  renderDex();
};
$('dex-kinds').addEventListener('click', event => {
  const button = event.target.closest('[data-dex-kind]');
  if (!button || button.dataset.dexKind === state.dex) return;
  state.dex = button.dataset.dexKind;
  state.dexLimit = 50;
  history.replaceState({ dex: state.dex }, '', `#dex=${state.dex}`);
  renderDex();
});
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
  if ($('dex-availability')) $('dex-availability').value = '';
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
  } else if (filterKind === 'dex') {
    state.dexAvailability = $('dex-availability').value;
    if (state.dex === 'move') {
      state.dexType = values.type;
      state.dexCategory = values.category;
      state.dexTrait = values.trait;
      state.dexModes = modes;
    }
    state.dexLimit = 50;
    renderDex();
  } else {
    state.learnType = values.type;
    state.learnCategory = values.category;
    state.learnTrait = values.trait;
    state.learnModes = modes;
    renderCategory();
  }
  $('filter-dialog').close();
  (
    ({ ranking: $('ranking-filter'), dex: $('dex-filter') })[filterKind] ?? $('learnset-filter')
  )?.focus({ preventScroll: true });
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
    const pin = readingDetail();
    state.category = category.dataset.category;
    renderCategory();
    if (pin) pinDetailTabs();
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
    const pin = readingDetail();
    state.category = keys[next];
    renderCategory();
    if (pin) pinDetailTabs();
    $(`tab-${state.category}`).focus();
  }
});
document.addEventListener(
  'error',
  event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains('article-pokemon-image')) {
      img.hidden = true;
      img.parentElement.querySelector('.article-image-fallback').hidden = false;
    }
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
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('articles')) {
    openArticles({ navigate: false });
    return;
  }
  if (params.has('types')) {
    openTypeChart(params.get('types'), { navigate: false });
    return;
  }
  const dex = params.get('dex');
  if (dex) {
    openDex(dex, { navigate: false });
    return;
  }
  showPage('ranking');
  const id = params.get('pokemon');
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
loadArticles();
// Opening a shared #dex link lands on the index rather than the ranking.
const startupDex = new URLSearchParams(location.hash.slice(1)).get('dex');
if (startupDex) openDex(startupDex, { navigate: false });
const startupTypes = new URLSearchParams(location.hash.slice(1)).get('types');
if (startupTypes !== null) openTypeChart(startupTypes, { navigate: false });
if (new URLSearchParams(location.hash.slice(1)).has('articles')) openArticles({ navigate: false });
