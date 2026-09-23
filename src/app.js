import { ApiClient } from './api.js';
import {
  normalizeIndex,
  formatDate,
  CATEGORY_LABELS,
  SEASON_REGULATIONS,
  matchesQuery,
  withWa,
  toId,
} from './data.js';
import { createLocale, TYPE_LABELS } from './locale.js';
import { selectRanking } from './reference.js';
import { MOVE_TRAITS } from './move-traits.js';
import { filterValues, filterSummary, matchesFilter } from './filters.js';
import { megaSprite } from './images.js';
import { reviewedArticles, selectArticles } from './articles.js';
import { articleControls, articleSeasonLabel, renderArticleCards } from './articles-view.js';
import { renderTypeDefense, renderTypeMatrix, toggleDefenseType } from './type-chart-view.js';
import { speedRows, battleSpeedRows } from './speed.js';
import { renderSpeedRows, renderSpeedLines } from './speed-view.js';
import {
  readDoc,
  writeDoc,
  toJson,
  fromJson,
  mergeDocs,
  searchSamples,
  searchParties,
  sortBuilds,
  filterSamples,
  filterParties,
  SAMPLE_SORTS,
  PARTY_SORTS,
  SORT_DESCENDS,
  emptySample,
  emptyParty,
  setPoint,
  readDrafts,
  writeDrafts,
  draftKey,
  pruneDrafts,
  speciesOptions,
  speciesSprite,
  itemOptions,
  keepsItem,
  moveOptions,
  setMove,
  addAltMove,
  removeAltMove,
  validateSample,
  validateParty,
  partiesUsing,
  deleteSample,
} from './builds.js';
import {
  sampleList,
  partyList,
  sampleEditor,
  partyEditor,
  pickerRows,
  comboRows,
  comboOptions,
} from './builds-view.js';
import {
  renderReference,
  renderLearnsetShell,
  renderLearnsetRows,
  renderEffect,
  renderSpreads,
  selectMoves,
  moveTable,
  CATEGORY_NAMES,
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
  builds: readDoc(storage),
  buildsTab: 'sample',
  buildsQuery: '',
  buildsSort: { key: 'updated', desc: true },
  buildsType: [],
  buildsGeneration: [],
  buildsModes: { type: 'or', generation: 'or' },
  buildsEditing: null,
  buildsDrafts: {},
  buildsErrors: [],
  buildsResumed: false,
  buildsReturn: null,
  buildsCombo: null,
  speed: { mode: 'base', query: '', type: '', includeMega: true, ascending: false },
  speedLimit: 80,
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
    speed: 'speed',
    builds: 'builds',
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

function renderSpeed() {
  if (state.page !== 'speed') return;
  document
    .querySelectorAll('[data-speed-mode]')
    .forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.speedMode === state.speed.mode)),
    );
  const battle = state.speed.mode === 'battle';
  $('speed-actual-help').hidden = state.speed.mode !== 'actual';
  $('speed-battle-help').hidden = !battle;
  $('speed-more').hidden = true;
  if (!state.reference || !state.locale) {
    $('speed-count').textContent = '';
    $('speed-rows').innerHTML = !state.reference
      ? referenceStatus(state.refError)
      : '<div class="empty-state"><p>한국어 명칭을 불러오는 중입니다.</p><button class="text-button" data-speed-retry>다시 시도</button></div>';
    return;
  }
  // 실전 라인만 통계가 필요하다. 종족값별과 실수치 비교는 도감만으로 그려진다.
  if (battle && !state.snapshot) {
    $('speed-count').textContent = '';
    $('speed-rows').innerHTML =
      '<div class="empty-state"><p>실전 스피드 라인은 사용률 통계가 필요합니다.</p>' +
      '<button class="text-button" data-speed-retry>다시 시도</button></div>';
    return;
  }
  const rows = battle
    ? battleSpeedRows(
        state.reference,
        state.locale,
        state.snapshot.pokemon,
        state.speed,
        state.index,
      )
    : speedRows(state.reference, state.locale, state.speed, state.index);
  $('speed-count').textContent =
    `${rows.length}개 항목 중 ${Math.min(rows.length, state.speedLimit)}개 표시`;
  const shown = rows.slice(0, state.speedLimit);
  $('speed-rows').innerHTML = battle
    ? renderSpeedLines(shown)
    : renderSpeedRows(shown, state.speed);
  $('speed-more').hidden = rows.length <= state.speedLimit;
}

const SPEED_MODES = ['base', 'actual', 'battle'];

function openSpeed(mode = 'base', { navigate = true } = {}) {
  state.speed.mode = SPEED_MODES.includes(mode) ? mode : 'base';
  showPage('speed');
  if (navigate) history.pushState({ speed: state.speed.mode }, '', `#speed=${state.speed.mode}`);
  renderSpeed();
  window.scrollTo(0, 0);
}

const BUILDS_TABS = ['sample', 'party'];

function buildsSave() {
  if (!writeDoc(storage, state.builds)) {
    $('builds-status').textContent =
      '브라우저 저장 공간에 쓰지 못했습니다. 저장 공간이 가득 찼거나 막혀 있습니다.';
    return false;
  }
  return true;
}

// 고치는 중에는 목록 검색과 JSON 버튼이 할 일이 없어 자리만 차지하고, 샘플·파티
// 탭은 눌러도 아무 일도 일어나지 않으면서 눌리는 척한다. 편집기는 renderBuilds를
// 거치지 않는 경로로도 그려지므로 두 곳이 같은 함수를 부른다.
function renderBuildsChrome(editing) {
  $('builds-controls').hidden = !!editing;
  document.querySelectorAll('[data-builds-tab]').forEach(button => (button.disabled = !!editing));
}

const SORT_LABELS = { updated: '최신순', name: '이름순', dex: '도감 번호순' };
// 파티는 포켓몬이 여섯이라 도감번호로 줄 세울 수 없다. 탭마다 고를 수 있는 것이
// 다르므로 목록을 그릴 때 다시 만든다. 파티에서 도감번호순이 남아 있으면 이름순으로
// 내린다.
function renderBuildsSort() {
  const keys = state.buildsTab === 'sample' ? SAMPLE_SORTS : PARTY_SORTS;
  if (!keys.includes(state.buildsSort.key))
    state.buildsSort = { key: 'name', desc: SORT_DESCENDS.name };
  const select = $('builds-sort');
  const wanted = keys.map(key => `<option value="${key}">${SORT_LABELS[key]}</option>`).join('');
  if (select.innerHTML !== wanted) select.innerHTML = wanted;
  select.value = state.buildsSort.key;
  // 랭킹의 방향 단추와 같은 글을 쓴다. 화살표만으로는 무엇이 위인지 읽히지 않는다.
  const order = $('builds-order');
  order.textContent = state.buildsSort.desc ? '↓ 내림차순' : '↑ 오름차순';
  order.setAttribute('aria-pressed', String(state.buildsSort.desc));
}

function renderBuilds() {
  if (state.page !== 'builds') return;
  document
    .querySelectorAll('[data-builds-tab]')
    .forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.buildsTab === state.buildsTab)),
    );
  renderBuildsChrome(state.buildsEditing);
  if (!state.locale) {
    $('builds-rows').innerHTML = loadingState('한국어 명칭을 불러오는 중입니다.');
    return;
  }
  if (state.buildsEditing) return renderBuildsEditor();
  renderBuildsSort();
  const { samples, parties } = state.builds;
  const picked = {
    type: state.buildsType,
    generation: state.buildsGeneration,
    modes: state.buildsModes,
  };
  const sorted = list => sortBuilds(list, state.buildsSort, state.reference);
  // 랭킹과 같은 방식으로 무엇이 걸려 있는지 단추와 줄에 함께 보여준다.
  const summaries = activeFilters(
    {
      generation: state.buildsGeneration,
      type: state.buildsType,
      rankModes: state.buildsModes,
    },
    { generation: GENERATION_LABELS, type: TYPE_LABELS },
  );
  $('builds-filter').innerHTML = rankingFilterButton(summaries.length);
  $('builds-filter').setAttribute(
    'aria-label',
    `내 샘플 필터${summaries.length ? ` (${summaries.length}개 적용)` : ''}`,
  );
  $('builds-filter-summary').textContent = summaries.join(' / ');
  $('builds-filter-summary').hidden = !summaries.length;
  $('builds-rows').innerHTML =
    state.buildsTab === 'sample'
      ? sampleList(
          sorted(
            filterSamples(
              searchSamples(samples, state.buildsQuery, state.reference, state.locale),
              picked,
              state.reference,
            ),
          ),
          state.locale,
          state.reference,
          state.index,
        )
      : partyList(
          sorted(
            filterParties(
              searchParties(parties, state.buildsQuery),
              samples,
              picked,
              state.reference,
            ),
          ),
          samples,
          state.locale,
        );
}

function openBuilds(tab = 'sample', { navigate = true } = {}) {
  state.buildsReturn = null;
  state.buildsTab = BUILDS_TABS.includes(tab) ? tab : 'sample';
  showPage('builds');
  if (navigate) history.pushState({ builds: state.buildsTab }, '', `#builds=${state.buildsTab}`);
  renderBuilds();
  window.scrollTo(0, 0);
}

function saveDraft() {
  const editing = state.buildsEditing;
  if (!editing) return;
  state.buildsDrafts = {
    ...state.buildsDrafts,
    [draftKey(editing.kind, editing.id)]: editing.draft,
  };
  writeDrafts(storage, state.buildsDrafts);
}

function dropDraft(kind, id) {
  const { [draftKey(kind, id)]: _removed, ...rest } = state.buildsDrafts;
  state.buildsDrafts = rest;
  writeDrafts(storage, state.buildsDrafts);
}

function renderBuildsEditor() {
  const editing = state.buildsEditing;
  // 편집기는 openBuildsEditor에서 바로 불리기도 한다.
  if (state.page === 'builds') renderBuildsChrome(editing);
  if (!editing || state.page !== 'builds' || !state.locale || !state.reference) return;
  const shared = {
    locale: state.locale,
    reference: state.reference,
    index: state.index,
    combos: state.buildsCombo,
    existing: editing.id !== null,
    resumed: state.buildsResumed,
    errors: state.buildsErrors,
  };
  $('builds-rows').innerHTML =
    editing.kind === 'sample'
      ? sampleEditor(editing.draft, shared)
      : partyEditor(editing.draft, state.builds.samples, shared);
}

// from은 파티 편집기에서 구성원 샘플로 건너뛸 때만 넘어온다. 다른 모든 경로는
// null로 덮어써서, 뒤로 가기로 파티에 돌아온 뒤 목록으로를 눌렀을 때 그 파티를
// 다시 열어버리지 않게 한다.
function openBuildsEditor(kind, id, { navigate = true, from = null } = {}) {
  const list = kind === 'sample' ? state.builds.samples : state.builds.parties;
  const saved = id === null ? null : (list.find(x => x.id === id) ?? null);
  // 주소로 들어왔는데 그 id가 없으면 목록으로 돌려보낸다.
  if (id !== null && !saved) {
    openBuilds(kind, { navigate });
    return;
  }
  const kept = state.buildsDrafts[draftKey(kind, id)];
  const base = saved ?? (kind === 'sample' ? emptySample() : emptyParty());
  state.buildsResumed = !!kept;
  state.buildsErrors = [];
  state.buildsEditing = { kind, id, draft: kept ?? base };
  state.buildsReturn = from;
  state.buildsTab = kind;
  showPage('builds');
  if (navigate)
    history.pushState(
      { builds: kind, edit: id ?? 'new' },
      '',
      `#builds=${kind}&edit=${id ?? 'new'}`,
    );
  renderBuildsEditor();
  window.scrollTo(0, 0);
}

const PICKER_TITLES = {
  species: '포켓몬 선택',
  item: '도구 선택',
  move: '기술 선택',
  member: '샘플 선택',
};

// 네 가지가 같은 창을 쓴다. 무엇을 고르는 중인지와 어디에 넣을지를 들고 있는다.
let picker = null;

// 도감 화면과 같은 규칙이다(app-view.js). reference가 기술·도구 모두의 한국어
// 이름을 갖고 있고 ko.json은 일부가 비어 있으므로 reference를 먼저 본다.
const buildLabel = (category, name) =>
  state.reference?.[category]?.[toId(name)]?.label ?? state.locale.label(category, name);

// 화면에 보이는 것은 한국어 이름이므로 그 순서로 정렬한다. 영문 순서는 읽는
// 사람에게 아무 규칙이 아니다. 포켓몬만 도감 번호순을 지킨다.
const byLabel = (a, b) => a.label.localeCompare(b.label, 'ko');

function pickerSource() {
  const draft = state.buildsEditing?.draft;
  if (!picker || !draft) return [];
  if (picker.kind === 'species')
    // reference.species는 id(예: charizard)로 찾는다. name(예: Charizard)을 값으로
    // 쓰면 특성·기술 목록과 표시 이름이 전부 어긋난다. name은 영문 검색용으로만 남긴다.
    return speciesOptions(state.reference, state.locale, '', state.index).map(row => ({
      value: row.id,
      label: row.label,
      sub: row.types.map(t => TYPE_LABELS[t] ?? t).join(' · '),
      dex: row.dex,
      name: row.name,
      sprite: row.sprite,
    }));
  if (picker.kind === 'item')
    // 고른 포켓몬이 쓸 수 있는 메가스톤만 목록에 남는다.
    return itemOptions(state.reference, draft.pokemon)
      .map(name => ({
        value: name,
        label: buildLabel('held_item', name),
        sub: '',
        name,
        art: 'item',
      }))
      .sort(byLabel);
  if (picker.kind === 'move') {
    // learnset은 id(aerialace)를 담고 도감 전체는 이름(Aerial Ace)을 담는다. 저장은
    // 영문 이름으로 하므로 id를 이름으로 바꾼다. 둘을 섞으면 같은 기술이 고른 경로에
    // 따라 다르게 저장되고, 후보와의 맞바꿈과 중복 검사가 조용히 어긋난다.
    const learnable = moveOptions(state.reference, draft.pokemon);
    const names = learnable
      ? learnable.map(id => state.reference.move[id]?.name ?? id)
      : // 여기까지 오는 폼은 현재 없다. 그래도 도감 전체를 그대로 내주지는 않는다.
        // champions가 거짓인 기술 323개는 이 작품에 없으므로 고를 수 없어야 한다.
        Object.values(state.reference.move)
          .filter(m => m.champions)
          .map(m => m.name);
    // 타입과 분류를 줄에 함께 적는다. 무엇을 쓸지 고민하는 자리라 이름만으로는
    // 고를 수가 없다. 걸러내는 일도 이 값으로 한다.
    return names
      .map(name => {
        const move = state.reference.move[toId(name)] ?? {};
        return {
          value: name,
          label: buildLabel('move', name),
          sub: [
            TYPE_LABELS[move.type] ?? move.type,
            CATEGORY_NAMES[move.category],
            move.power ? `위력 ${move.power}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          name,
          type: move.type ?? '',
          category: move.category ?? '',
          traits: move.traits ?? [],
        };
      })
      .sort(byLabel);
  }
  return state.builds.samples.map(s => ({
    value: s.id,
    label: s.name,
    sub: s.pokemon
      ? state.locale.pokemon(state.reference?.species?.[s.pokemon]?.name ?? s.pokemon).label
      : '',
    name: s.name,
    sprite: speciesSprite(state.reference, state.index, s.pokemon),
  }));
}

// 기술은 수가 많아 이름만으로는 찾기 어렵다. 도감의 기술 거르개와 같은 세 가지로
// 좁히고, 생김새도 그쪽 것(filterGroup)을 그대로 쓴다. 나머지 고르기에는 거를 것이
// 없어 이 값들이 늘 비어 있고 matchesFilter를 그냥 통과한다.
// 도감의 기술 거르개와 같은 창을 띄운다. 창 위에 창을 겹치는 일은 되도록 피하지만,
// 고르기 창 안에 아코디언 셋을 늘어놓으면 정작 고를 목록이 밀려난다.
function renderPickerFilterButton() {
  const summaries = [
    filterSummary(picker.type, TYPE_LABELS, picker.modes.type),
    filterSummary(picker.category, MOVE_CATEGORIES, picker.modes.category),
    filterSummary(picker.trait, MOVE_TRAITS, picker.modes.trait),
  ].filter(Boolean);
  $('picker-filter').innerHTML = rankingFilterButton(summaries.length);
  $('picker-filter').setAttribute(
    'aria-label',
    `기술 필터${summaries.length ? ` (${summaries.length}개 적용)` : ''}`,
  );
  $('picker-filter-summary').textContent = summaries.join(' / ') || '전체';
}

function renderPicker() {
  const rows = pickerSource().filter(
    row =>
      matchesQuery(row, picker.query) &&
      matchesFilter(picker.type, t => row.type === t, picker.modes.type) &&
      matchesFilter(picker.category, c => row.category === c, picker.modes.category) &&
      matchesFilter(picker.trait, t => (row.traits ?? []).includes(t), picker.modes.trait),
  );
  $('picker-rows').innerHTML = pickerRows(rows, picker.limit);
  $('picker-more').hidden = rows.length <= picker.limit;
}

function openPicker(kind, slot = null) {
  const draft = state.buildsEditing?.draft;
  if (!draft) return;
  if (kind === 'move' && !draft.pokemon) {
    toast('먼저 포켓몬을 선택하세요.');
    return;
  }
  picker = {
    kind,
    slot,
    query: '',
    limit: 50,
    type: [],
    category: [],
    trait: [],
    modes: { type: 'or', category: 'or', trait: 'or' },
  };
  $('picker-title').textContent = PICKER_TITLES[kind];
  $('picker-search').value = '';
  $('picker-filters').hidden = kind !== 'move';
  renderPickerFilterButton();
  const missing = kind === 'move' && moveOptions(state.reference, draft.pokemon) === null;
  $('picker-help').hidden = !missing;
  if (missing)
    $('picker-help').textContent =
      '이 폼의 배우는 기술 자료가 없어 도감 전체에서 고릅니다. 실제로 배우는지는 확인되지 않습니다.';
  renderPicker();
  $('picker-dialog').showModal();
}

function applyPicked(value) {
  const editing = state.buildsEditing;
  if (!editing || !picker) return;
  const draft = editing.draft;
  if (picker.kind === 'species')
    // 포켓몬이 바뀌면 그 포켓몬의 것이 아닌 특성과 메가스톤이 남는다. 둘은 고를
    // 수 없는 값이 되므로 비운다. 기술은 사용자가 고른 것이므로 임의로 지우지 않는다.
    editing.draft = {
      ...draft,
      pokemon: value,
      ability: null,
      item: keepsItem(state.reference, value, draft.item) ? draft.item : null,
    };
  else if (picker.kind === 'item') editing.draft = { ...draft, item: value };
  else if (picker.kind === 'member')
    editing.draft = {
      ...draft,
      members: draft.members.map((m, i) => (i === picker.slot ? value : m)),
    };
  else if (picker.slot === 'alt') editing.draft = addAltMove(draft, value);
  else {
    const fromAlt = draft.altMoves.includes(value);
    const fromSlot = draft.moves.some((m, i) => i !== picker.slot && m === value);
    const previous = draft.moves[picker.slot];
    editing.draft = setMove(draft, picker.slot, value);
    // 자리를 맞바꾼 것은 화면만 보고는 알 수 없다. 빈 칸을 채운 것은 바꾼 것이 아니다.
    if (fromSlot || (fromAlt && previous))
      toast(`${withWa(buildLabel('move', value))} 자리를 바꿨습니다.`);
  }
  picker = null;
  $('picker-dialog').close();
  saveDraft();
  renderBuildsEditor();
}

function commitBuild() {
  const editing = state.buildsEditing;
  if (!editing) return;
  const { kind, id, draft } = editing;
  const errors =
    kind === 'sample' ? validateSample(draft) : validateParty(draft, state.builds.samples);
  state.buildsErrors = errors;
  if (errors.length) {
    renderBuildsEditor();
    return;
  }
  const saved = { ...draft, updatedAt: Date.now() };
  const list = kind === 'sample' ? 'samples' : 'parties';
  const previous = state.builds;
  state.builds = {
    ...previous,
    [list]:
      id === null ? [...previous[list], saved] : previous[list].map(x => (x.id === id ? saved : x)),
  };
  // 쓰지 못했으면 되돌린다. 목록에 보이는데 새로고침하면 사라지는 상태를 만들지
  // 않는다. buildsSave가 이미 실패를 알렸다.
  if (!buildsSave()) {
    state.builds = previous;
    return;
  }
  dropDraft(kind, id);
  toast('저장했습니다.');
  closeBuildsEditor();
}

let confirmAction = null;

// 삭제 말고도 되돌릴 수 없는 일이 생겼으므로 제목과 단추 글자를 받는다. 창에
// '삭제'가 박혀 있으면 초기화를 묻는 자리에서 무엇을 누르는지 어긋난다.
function askConfirm(message, action, label = '삭제') {
  $('confirm-body').textContent = message;
  $('confirm-title').textContent = label;
  $('accept-confirm').textContent = label;
  $('close-confirm').setAttribute('aria-label', `${label} 취소`);
  confirmAction = action;
  $('confirm-dialog').showModal();
}

// 쓰던 것을 버리고 빈 값에서 다시 시작한다. id는 남겨야 저장했던 샘플을 새 샘플로
// 만들어버리지 않는다. 되돌릴 수 없으므로 삭제와 같이 한 번 묻는다.
function resetBuild() {
  const editing = state.buildsEditing;
  if (!editing) return;
  askConfirm(
    '작성 중인 내용을 모두 지우고 처음 상태로 되돌립니다.',
    () => {
      const empty = editing.kind === 'sample' ? emptySample() : emptyParty();
      editing.draft = { ...empty, id: editing.draft.id };
      state.buildsErrors = [];
      state.buildsCombo = null;
      saveDraft();
      renderBuildsEditor();
    },
    '초기화',
  );
}

function removeBuild() {
  const editing = state.buildsEditing;
  if (!editing || editing.id === null) return;
  const { kind, id } = editing;
  const used = kind === 'sample' ? partiesUsing(state.builds, id).length : 0;
  // 지우는 것은 저장된 쪽이다. 초안의 이름이 비어 있어도 빈 따옴표를 보이지 않는다.
  const list = kind === 'sample' ? state.builds.samples : state.builds.parties;
  const name =
    editing.draft.name.trim() || list.find(x => x.id === id)?.name?.trim() || '이름 없음';
  const message =
    kind === 'sample'
      ? `‘${name}’을 삭제합니다.` +
        (used ? ` 이 샘플을 쓰는 파티 ${used}개가 영향을 받습니다.` : '')
      : `‘${name}’을 삭제합니다.`;
  askConfirm(message, () => {
    const previous = state.builds;
    state.builds =
      kind === 'sample'
        ? deleteSample(previous, id)
        : { ...previous, parties: previous.parties.filter(p => p.id !== id) };
    if (!buildsSave()) {
      state.builds = previous;
      return;
    }
    dropDraft(kind, id);
    toast('삭제했습니다.');
    closeBuildsEditor();
  });
}

function closeBuildsEditor({ navigate = true } = {}) {
  const back = state.buildsReturn;
  state.buildsEditing = null;
  state.buildsErrors = [];
  state.buildsResumed = false;
  // 파티에서 건너온 샘플이면 목록이 아니라 그 파티로 돌아간다. 파티의 초안은
  // 남아 있으므로 고치던 내용 그대로에 방금 저장한 샘플이 반영돼 보인다. 아직
  // 저장하지 않은 파티는 id가 없으므로 'new'로 구분한다. 그 사이 파티가 사라졌으면
  // openBuildsEditor가 스스로 목록으로 돌려보낸다.
  if (back !== null) openBuildsEditor('party', back === 'new' ? null : back, { navigate });
  else openBuilds(state.buildsTab, { navigate });
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
  renderSpeed();
  renderBuilds();
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
      renderSpeed();
      renderBuilds();
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
  // The learnset, the move index and the move picker filter on the same three properties.
  const moveGroups = (prefix, type, category, trait, modes) =>
    group(`${prefix}-type`, 'type', '타입', TYPE_LABELS, type, modes.type) +
    group(`${prefix}-category`, 'category', '분류', MOVE_CATEGORIES, category, modes.category) +
    group(`${prefix}-trait`, 'trait', '기술 성질', MOVE_TRAITS, trait, modes.trait);
  // 고르기 창 위에 겹쳐 띄운다. 창 위에 창은 되도록 피하지만, 고르기 창 안에
  // 아코디언 셋을 늘어놓으면 정작 고를 목록이 밀려난다.
  if (kind === 'picker') {
    $('filter-title').textContent = '기술 필터';
    $('filter-fields').innerHTML = moveGroups(
      'picker',
      picker.type,
      picker.category,
      picker.trait,
      picker.modes,
    );
    $('filter-dialog').showModal();
    return;
  }
  if (kind === 'builds') {
    $('filter-title').textContent = state.buildsTab === 'sample' ? '샘플 필터' : '파티 필터';
    $('filter-fields').innerHTML =
      group(
        'builds-generation',
        'generation',
        '세대',
        Object.fromEntries(regions.map((name, i) => [String(i + 1), `${i + 1}세대 (${name})`])),
        state.buildsGeneration,
        state.buildsModes.generation,
      ) +
      group('builds-type', 'type', '타입', TYPE_LABELS, state.buildsType, state.buildsModes.type);
    $('filter-dialog').showModal();
    return;
  }
  $('filter-title').textContent = ranking ? '랭킹 필터' : dex ? '도감 필터' : '배우는 기술 필터';
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
$('builds-filter').onclick = () => openFilters('builds');
$('ranking-link').onclick = () => goToRanking({ top: true });
$('speed-link').onclick = () => {
  if (state.page !== 'speed') openSpeed(state.speed.mode);
};
$('builds-link').onclick = () => {
  if (state.page !== 'builds') openBuilds(state.buildsTab);
};
$('builds-search').addEventListener('input', event => {
  state.buildsQuery = event.target.value;
  renderBuilds();
});
// 기준을 바꾸면 그 기준에 어울리는 방향에서 시작한다. 이름순을 골랐는데 ㅎ부터
// 나오면 고른 사람이 바란 것이 아니다. 방향은 그 다음에 단추로 뒤집는다.
$('builds-sort').addEventListener('change', event => {
  const key = event.target.value;
  state.buildsSort = { key, desc: SORT_DESCENDS[key] };
  renderBuilds();
});
$('builds-order').addEventListener('click', () => {
  state.buildsSort = { ...state.buildsSort, desc: !state.buildsSort.desc };
  renderBuilds();
});
$('builds-rows').addEventListener('click', event => {
  const newBuild = event.target.closest('[data-builds-new]');
  if (newBuild) {
    openBuildsEditor(newBuild.dataset.buildsNew, null);
    return;
  }
  const openSample = event.target.closest('[data-builds-sample]');
  if (openSample) {
    openBuildsEditor('sample', openSample.dataset.buildsSample);
    return;
  }
  const openParty = event.target.closest('[data-builds-party]');
  if (openParty) {
    openBuildsEditor('party', openParty.dataset.buildsParty);
    return;
  }
  if (event.target.closest('[data-builds-species]')) return openPicker('species');
  if (event.target.closest('[data-builds-item]')) return openPicker('item');
  if (event.target.closest('[data-builds-alt-add]')) return openPicker('move', 'alt');
  const moveSlot = event.target.closest('[data-builds-move]');
  if (moveSlot) return openPicker('move', Number(moveSlot.dataset.buildsMove));
  // 구성원의 샘플을 그 자리에서 고치러 간다. 저장하거나 목록으로를 누르면 이
  // 파티로 돌아온다. 건너뛰기 전에 파티의 초안을 남겨야 고치던 내용이 살아남는다.
  const memberEdit = event.target.closest('[data-builds-member-edit]');
  if (memberEdit && state.buildsEditing) {
    const editing = state.buildsEditing;
    saveDraft();
    return openBuildsEditor('sample', memberEdit.dataset.buildsMemberEdit, {
      from: editing.id ?? 'new',
    });
  }
  const memberSlot = event.target.closest('[data-builds-member]');
  if (memberSlot) return openPicker('member', Number(memberSlot.dataset.buildsMember));
  const altRemove = event.target.closest('[data-builds-alt-remove]');
  if (altRemove) {
    state.buildsEditing.draft = removeAltMove(
      state.buildsEditing.draft,
      altRemove.dataset.buildsAltRemove,
    );
    saveDraft();
    renderBuildsEditor();
    return;
  }
  // 32와 0은 가장 자주 쓰는 값이다. setPoint가 범위를 이미 보므로 그대로 넘긴다.
  const toMax = event.target.closest('[data-builds-point-max]');
  const toZero = event.target.closest('[data-builds-point-zero]');
  if ((toMax || toZero) && state.buildsEditing) {
    const at = Number((toMax ?? toZero).dataset[toMax ? 'buildsPointMax' : 'buildsPointZero']);
    state.buildsEditing.draft = setPoint(state.buildsEditing.draft, at, toMax ? '32' : '0');
    saveDraft();
    renderBuildsEditor();
    return;
  }
  const comboOpen = event.target.closest('[data-builds-combo-open]');
  if (comboOpen) {
    const field = comboOpen.dataset.buildsComboOpen;
    // 같은 것을 다시 누르면 접는다. 다른 것을 누르면 그쪽만 펼친다.
    state.buildsCombo = state.buildsCombo?.field === field ? null : { field, query: '' };
    renderBuildsEditor();
    $('builds-rows').querySelector('[data-builds-combo-search]')?.focus();
    return;
  }
  const picked = event.target.closest('[data-builds-combo-value]');
  if (picked && state.buildsCombo) {
    const field = state.buildsCombo.field;
    state.buildsEditing.draft = {
      ...state.buildsEditing.draft,
      [field]: picked.dataset.buildsComboValue,
    };
    state.buildsCombo = null;
    saveDraft();
    renderBuildsEditor();
    return;
  }
  if (event.target.closest('[data-builds-cancel]')) closeBuildsEditor();
  if (event.target.closest('[data-builds-reset]')) return resetBuild();
  if (event.target.closest('[data-builds-delete]')) return removeBuild();
});

// 검색은 목록만 바꾼다. 편집기를 통째로 다시 그리면 글자마다 커서가 끝으로 튄다.
$('builds-rows').addEventListener('input', event => {
  const search = event.target.closest('[data-builds-combo-search]');
  if (!search || !state.buildsCombo || !state.buildsEditing) return;
  state.buildsCombo = { ...state.buildsCombo, query: search.value };
  const list = $('builds-rows').querySelector('[data-builds-combo-list]');
  if (list)
    list.innerHTML = comboRows(
      comboOptions(state.buildsCombo.field, {
        reference: state.reference,
        locale: state.locale,
        pokemon: state.buildsEditing.draft.pokemon,
      }),
      search.value,
    );
});

// 바깥을 누르거나 Escape를 누르면 접는다. 펼친 채로 두면 아래 내용을 가린다.
document.addEventListener('click', event => {
  if (!state.buildsCombo) return;
  if (event.target.closest('[data-builds-combo]')) return;
  state.buildsCombo = null;
  renderBuildsEditor();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !state.buildsCombo) return;
  state.buildsCombo = null;
  renderBuildsEditor();
});
$('builds-new').onclick = () => openBuildsEditor(state.buildsTab, null);

// 이름과 설명은 입력할 때마다 초안에 담는다. 다시 그리면 커서가 튀므로 그리지 않는다.
$('builds-rows').addEventListener('input', event => {
  const field = event.target.closest('[data-builds-field]');
  if (!field || !state.buildsEditing) return;
  const name = field.dataset.buildsField;
  if (name !== 'name' && name !== 'note') return;
  state.buildsEditing.draft = { ...state.buildsEditing.draft, [name]: field.value };
  saveDraft();
});

// 포인트와 목록 선택은 값이 정해진 뒤에 다시 그린다.
$('builds-rows').addEventListener('change', event => {
  if (!state.buildsEditing) return;
  const point = event.target.closest('[data-builds-point]');
  if (point) {
    state.buildsEditing.draft = setPoint(
      state.buildsEditing.draft,
      Number(point.dataset.buildsPoint),
      point.value,
    );
    saveDraft();
    renderBuildsEditor();
    return;
  }
  const field = event.target.closest('[data-builds-field]');
  if (!field) return;
  const name = field.dataset.buildsField;
  if (name !== 'ability' && name !== 'nature') return;
  state.buildsEditing.draft = { ...state.buildsEditing.draft, [name]: field.value || null };
  saveDraft();
  renderBuildsEditor();
});

$('builds-rows').addEventListener('submit', event => {
  event.preventDefault();
  commitBuild();
});
document.querySelectorAll('[data-builds-tab]').forEach(button =>
  button.addEventListener('click', () => {
    openBuilds(button.dataset.buildsTab);
  }),
);
$('builds-export').addEventListener('click', () => {
  const blob = new Blob([toJson(state.builds)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `champions-builds-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});
$('builds-import').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const { doc, skipped, error } = fromJson(await file.text());
  if (error) {
    $('builds-status').textContent = error;
    return;
  }
  // 덮어쓰지 않고 합친다. 이 기기에 있던 것을 지우면 되돌릴 수 없다.
  const previous = state.builds;
  state.builds = mergeDocs(previous, doc);
  if (buildsSave()) {
    $('builds-status').textContent =
      `샘플 ${doc.samples.length}개, 파티 ${doc.parties.length}개를 가져왔습니다.` +
      (skipped ? ` 형식을 확인할 수 없는 ${skipped}개는 제외했습니다.` : '');
    const touched = new Set([...doc.samples, ...doc.parties].map(x => x.id));
    // 가져온 항목의 초안은 가져오기 이전 것이라 더 오래됐다. 남겨두면 이어서
    // 고치다 저장할 때 방금 가져온 내용을 덮어쓴다.
    state.buildsDrafts = Object.fromEntries(
      Object.entries(state.buildsDrafts).filter(([key]) => !touched.has(key)),
    );
    writeDrafts(storage, state.buildsDrafts);
    if (state.buildsEditing) closeBuildsEditor();
  }
  // 저장하지 못했으면 화면도 되돌린다. 목록에 보이는데 새로고침하면 사라지는
  // 상태가 저장 실패 자체보다 나쁘다. buildsSave가 이미 실패를 알렸다.
  else state.builds = previous;
  renderBuilds();
});
$('speed-type').innerHTML += Object.entries(TYPE_LABELS)
  .map(([type, label]) => `<option value="${type}">${label}</option>`)
  .join('');
$('speed').addEventListener('click', event => {
  const mode = event.target.closest('[data-speed-mode]');
  if (mode) {
    state.speed.mode = mode.dataset.speedMode;
    state.speedLimit = 80;
    history.replaceState({ speed: state.speed.mode }, '', `#speed=${state.speed.mode}`);
    renderSpeed();
  }
  if (event.target.closest('[data-speed-retry]')) load();
});
$('speed-controls').addEventListener('input', () => {
  Object.assign(state.speed, {
    query: $('speed-search').value,
    type: $('speed-type').value,
    includeMega: $('speed-mega').checked,
    ascending: $('speed-order').value === 'asc',
  });
  state.speedLimit = 80;
  renderSpeed();
});
$('speed-more').onclick = () => {
  state.speedLimit += 80;
  renderSpeed();
};
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
  if (filterKind === 'picker') {
    Object.assign(picker, {
      type: values.type,
      category: values.category,
      trait: values.trait,
      modes,
      limit: 50,
    });
    renderPickerFilterButton();
    renderPicker();
  } else if (filterKind === 'builds') {
    state.buildsType = values.type;
    state.buildsGeneration = values.generation;
    state.buildsModes = modes;
    renderBuilds();
  } else if (filterKind === 'ranking') {
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
    ({
      ranking: $('ranking-filter'),
      dex: $('dex-filter'),
      builds: $('builds-filter'),
      picker: $('picker-filter'),
    })[filterKind] ?? $('learnset-filter')
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
$('close-confirm').onclick = () => $('confirm-dialog').close();
$('cancel-confirm').onclick = () => $('confirm-dialog').close();
$('accept-confirm').onclick = () => {
  const action = confirmAction;
  $('confirm-dialog').close();
  action?.();
};
$('confirm-dialog').addEventListener('close', () => {
  confirmAction = null;
});
$('close-picker').onclick = () => {
  picker = null;
  $('picker-dialog').close();
};
$('picker-search').addEventListener('input', event => {
  if (!picker) return;
  picker.query = event.target.value;
  picker.limit = 50;
  renderPicker();
});
$('picker-more').addEventListener('click', () => {
  if (!picker) return;
  picker.limit += 50;
  renderPicker();
});
$('picker-filter').onclick = () => openFilters('picker');
$('picker-rows').addEventListener('click', event => {
  const row = event.target.closest('[data-picker-value]');
  if (row) applyPicked(row.dataset.pickerValue);
});
// Escape로 닫아도 고르는 중이라는 상태가 남지 않게 한다.
$('picker-dialog').addEventListener('close', () => {
  picker = null;
});
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
  if (params.has('speed')) {
    openSpeed(params.get('speed'), { navigate: false });
    return;
  }
  if (params.has('articles')) {
    openArticles({ navigate: false });
    return;
  }
  if (params.has('types')) {
    openTypeChart(params.get('types'), { navigate: false });
    return;
  }
  if (params.has('builds')) {
    const edit = params.get('edit');
    if (edit)
      openBuildsEditor(params.get('builds'), edit === 'new' ? null : edit, { navigate: false });
    else {
      state.buildsEditing = null;
      openBuilds(params.get('builds'), { navigate: false });
    }
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
// 지워진 샘플의 초안은 돌아갈 곳이 없다. 열 때 한 번 털어낸다.
state.buildsDrafts = pruneDrafts(readDrafts(storage), state.builds);
writeDrafts(storage, state.buildsDrafts);
load();
loadReference();
loadArticles();
// Opening a shared #dex link lands on the index rather than the ranking.
const startupDex = new URLSearchParams(location.hash.slice(1)).get('dex');
if (startupDex) openDex(startupDex, { navigate: false });
const startupTypes = new URLSearchParams(location.hash.slice(1)).get('types');
if (startupTypes !== null) openTypeChart(startupTypes, { navigate: false });
if (new URLSearchParams(location.hash.slice(1)).has('articles')) openArticles({ navigate: false });
const startupSpeed = new URLSearchParams(location.hash.slice(1)).get('speed');
if (startupSpeed !== null) openSpeed(startupSpeed, { navigate: false });
const startupBuilds = new URLSearchParams(location.hash.slice(1)).get('builds');
if (startupBuilds !== null) {
  const startupEdit = new URLSearchParams(location.hash.slice(1)).get('edit');
  if (startupEdit)
    openBuildsEditor(startupBuilds, startupEdit === 'new' ? null : startupEdit, {
      navigate: false,
    });
  else openBuilds(startupBuilds, { navigate: false });
}
