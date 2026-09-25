import { ApiClient } from './api.js';
import {
  normalizeIndex,
  formatDate,
  CATEGORY_LABELS,
  SEASON_REGULATIONS,
  SOURCE,
  matchesQuery,
  withWa,
  toId,
} from './data.js';
import { createLocale, TYPE_LABELS } from './locale.js';
import { selectRanking } from './reference.js';
import { MOVE_TRAITS } from './move-traits.js';
import { pruneItems } from './item-exclusions.js';
import {
  TREND_SCOPES,
  TREND_LIMIT,
  trendPoints,
  previousFinal,
  dropCarryOver,
  rankSeries,
  rankOf,
  createTrendStore,
} from './trends.js';
import { rankChart, pokemonTrendView } from './trends-view.js';
import { emptySide, finalSpeed, compareSpeed, sideFromSample } from './speed-calc.js';
import {
  speedCalcView,
  speedVerdict,
  abilityChoices,
  itemChoices,
  effectText,
} from './calc-view.js';
import {
  damageSummary,
  defaultHits,
  emptyDamage,
  damageSideFromSample,
  stat as damageStat,
  stageStat,
  hpStat,
  grounded,
  isSpreadMove,
  powerOf as damagePower,
  hitRange,
  itemPowerOf,
} from './damage-calc.js';
import {
  damageCalcView,
  damageResult,
  statKeys,
  hpText,
  conditionsOf,
  powerBox,
  bulkBox,
} from './damage-view.js';
import { NFE_SPECIES, FLING_POWER } from './damage-catalog.js';
import { filterValues, filterSummary, matchesFilter } from './filters.js';
import { reviewedArticles, selectArticles } from './articles.js';
import { articleControls, articleSeasonLabel, renderArticleCards } from './articles-view.js';
import { renderTypeDefense, renderTypeMatrix, toggleDefenseType } from './type-chart-view.js';
import { speedRows, battleSpeedRows } from './speed.js';
import { renderSpeedRows, renderSpeedLines } from './speed-view.js';
import {
  readDoc,
  writeDoc,
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
  setSpecies,
  moveOptions,
  setMove,
  addAltMove,
  removeAltMove,
  dragMove,
  validateSample,
  validateParty,
  partiesUsing,
  deleteSample,
  docFromServer,
  joinDocs,
  shareSnapshot,
  readShare,
  mergeThreeWay,
  sameItems,
  natureAdjust,
} from './builds.js';
import {
  newSyncCode,
  normalizeCode,
  formatCode,
  pullDoc,
  pushDoc,
  planOnOpen,
  createUploader,
  readSync,
  writeSync,
  createShare,
  pullShare,
  shareLink,
  readBase,
  writeBase,
} from './sync.js';
import {
  sampleList,
  partyList,
  sampleEditor,
  partyEditor,
  pickerRows,
  comboRows,
  comboOptions,
  syncText,
  syncActions,
  conflictList,
  shareView,
  moveMeta,
  moveEffect,
  shareTitle,
  fmtDay,
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
// 상세 탭 순서. 기술·특성·도구를 먼저 보고 능력 보정·포인트가 뒤따른다. 파티를
// 짜는 데 쓰는 같은 팀과 참고 자료는 뒤에 둔다.
const DETAIL_ORDER = [
  'overview',
  'move',
  'ability',
  'held_item',
  'stat_alignment',
  'stat_points',
  'teammate',
  'learnset',
  'articles',
  'trend',
];
const DETAIL_LABELS = Object.fromEntries(
  DETAIL_ORDER.map(key => [
    key,
    { overview: '기본 정보', learnset: '배우는 기술', articles: '구축 기사', trend: '사용률 추이' }[
      key
    ] ?? CATEGORY_LABELS[key],
  ]),
);

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
  // null이면 이 기기에만 저장한다. dirty는 올리지 못한 변경이 남았다는 표시다.
  sync: readSync(storage),
  syncStatus: 'off',
  // 사람이 골라야 하는 충돌. { remote, conflicts }. 없으면 null.
  syncConflict: null,
  // 사용률 추이. focus는 강조한 포켓몬 이름이다.
  trends: { scope: 'current', format: null, focus: null },
  // 계산기. 스피드 계산기의 양쪽 칸과 둘이 함께 쓰는 날씨·필드.
  calc: {
    tab: 'damage',
    mine: emptySide(),
    theirs: emptySide(),
    field: { weather: '', terrain: '' },
    damage: emptyDamage(),
  },
  // 링크로 연 공유. { id, status, data }. 메뉴에는 없고 #share=<id>로만 연다.
  share: null,
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
    ? {
        ...p,
        ...mega,
        ...state.locale.pokemon(mega.name),
        sprite: speciesSprite(state.reference, state.index, state.form),
      }
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
  if (category === 'trend') return renderPokemonTrend(p);
  if (category === 'articles') {
    const filters = { season: state.season, format: state.format, pokemon: p.id };
    $('category-content').innerHTML =
      `<div class="category-heading"><h3>구축 기사</h3></div>
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
    calc: 'calc',
    trends: 'trends',
    speed: 'speed',
    builds: 'builds',
    shared: 'shared',
  })) {
    $(panel).hidden = page !== key;
    // 공유 화면은 메뉴에 없다. 링크로 열었을 때만 보인다.
    $(`${key}-link`)?.setAttribute('aria-pressed', String(page === key));
  }
  $('toolbar').hidden = page !== 'ranking';
  $('notice').hidden = page !== 'ranking' || !$('notice').textContent;
}

function articleContent(filters) {
  if (state.articleError)
    return '<div class="empty-state"><p>구축 기사를 불러오지 못했습니다.</p><button class="text-button" data-retry-articles>다시 시도</button></div>';
  if (!state.articleData) return loadingState('구축 기사를 불러오는 중');
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

// 동기화. 이 기기에 먼저 쓰고 서버는 뒤따른다(docs/builds-and-sync.md).
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const syncFetch = (url, init) => fetch(url, init);
// 올린 문서. 올리기가 성공하면 이것이 서버와 맞춘 기준본이 된다. 올리는 사이
// 새로 고친 state.builds가 아니라 실제로 보낸 것이어야 한다.
let syncSent = null;
const uploader = createUploader({
  push: () => {
    syncSent = state.builds;
    return pushDoc(syncFetch, state.sync.code, syncSent, syncSent.version);
  },
  wait,
  onState: syncState,
});

// 단추는 목록 위 단추 줄 안에 있어 편집 중에는 그 줄과 함께 숨는다. 상태 문장도
// 편집 중에는 할 일이 없으므로 같이 숨긴다.
function renderSyncBar() {
  const text = $('builds-sync-status');
  text.hidden = !!state.buildsEditing;
  text.textContent = syncText(state.sync, state.syncStatus);
  $('builds-sync').innerHTML = syncActions(state.sync, state.syncStatus);
}

// 올리기 결과를 반영한다. 성공하면 서버가 준 버전을 로컬 문서에 적고, 올리는 사이
// 새 변경이 없었을 때만 dirty를 푼다. 실패하면 dirty를 남겨 다음 기회에 다시 보낸다.
function syncState(status, result) {
  state.syncStatus = status;
  if (status === 'ok' && Number.isInteger(result?.version)) {
    state.builds = { ...state.builds, version: result.version };
    writeDoc(storage, state.builds);
    writeBase(storage, syncSent);
  }
  if (state.sync && status !== 'uploading') {
    state.sync = { ...state.sync, dirty: status === 'ok' ? uploader.pending() : true };
    writeSync(storage, state.sync);
  }
  renderSyncBar();
  // 올리다 보니 다른 기기가 먼저 올렸다. 받아서 항목별로 맞춰 본다.
  if (status === 'conflict') resolveConflict();
}

// 서버와 달라졌을 때. 기준본과 견주어 이 기기만, 또는 서버만 바꾼 항목은 저절로
// 합치고, 같은 항목을 양쪽에서 다르게 바꿨을 때만 팝업으로 묻는다.
async function resolveConflict(server = null) {
  if (!state.sync) return;
  server ??= await pullDoc(syncFetch, state.sync.code);
  if (server.status !== 'ok') {
    state.syncStatus = server.status;
    return renderSyncBar();
  }
  const remote = docFromServer(server.doc, server.version);
  const { doc, conflicts } = mergeThreeWay(readBase(storage), state.builds, remote);
  if (!conflicts.length) return settleSync(doc, remote);
  state.syncConflict = { remote, conflicts };
  state.syncStatus = 'conflict';
  state.sync = { ...state.sync, dirty: true };
  writeSync(storage, state.sync);
  renderSyncBar();
  openConflictDialog();
}

// 합친 문서를 이 기기에 쓰고, 서버와 다르면 올린다. 합친 결과는 서버 버전 위에
// 올라가므로 기준본은 받은 서버 문서다.
function settleSync(doc, remote) {
  state.syncConflict = null;
  state.builds = { ...doc, version: remote.version };
  writeDoc(storage, state.builds);
  state.buildsDrafts = pruneDrafts(state.buildsDrafts, state.builds);
  writeDrafts(storage, state.buildsDrafts);
  writeBase(storage, remote);
  const ahead = !sameItems(state.builds, remote);
  state.sync = { ...state.sync, dirty: ahead };
  writeSync(storage, state.sync);
  // 올릴 것이 남았으면 다 올린 뒤에야 ‘동기화됩니다’가 맞다.
  state.syncStatus = ahead ? 'uploading' : 'ok';
  renderSyncBar();
  renderBuilds();
  if (ahead) uploader.request();
}

function openConflictDialog() {
  const pending = state.syncConflict;
  if (!pending) return;
  $('sync-dialog-list').innerHTML = conflictList(pending.conflicts);
  if (!$('sync-dialog').open) $('sync-dialog').showModal();
}

function chooseConflict(side) {
  const pending = state.syncConflict;
  $('sync-dialog').close();
  if (!pending) return;
  const { doc } = mergeThreeWay(readBase(storage), state.builds, pending.remote, side);
  settleSync(doc, pending.remote);
}

// 서버 것을 그대로 받는다. 지워진 항목의 초안은 돌아갈 곳이 없으므로 털어낸다.
function adoptServer(server) {
  state.builds = docFromServer(server.doc, server.version);
  writeDoc(storage, state.builds);
  state.buildsDrafts = pruneDrafts(state.buildsDrafts, state.builds);
  writeDrafts(storage, state.buildsDrafts);
  writeBase(storage, state.builds);
  state.sync = { ...state.sync, dirty: false };
  writeSync(storage, state.sync);
  state.syncStatus = 'ok';
  renderSyncBar();
  renderBuilds();
}

// 받기가 실패하면 dirty를 건드리지 않는다. 올린 적 없는 변경이 생긴 것이 아니다.
async function syncOnOpen() {
  if (!state.sync) return;
  state.syncStatus = 'checking';
  renderSyncBar();
  const server = await pullDoc(syncFetch, state.sync.code);
  if (server.status !== 'ok') {
    state.syncStatus = server.status;
    return renderSyncBar();
  }
  const plan = planOnOpen({
    based: state.builds.version,
    dirty: state.sync.dirty,
    server: server.version,
  });
  if (plan === 'pull') return adoptServer(server);
  if (plan === 'conflict') return resolveConflict(server);
  if (plan === 'push') {
    state.builds = { ...state.builds, version: server.version };
    return uploader.request();
  }
  // 서버와 같다. 기준본이 없던 기기(이 기능 전의 기기)도 여기서 기준본을 얻는다.
  writeBase(storage, docFromServer(server.doc, server.version));
  state.syncStatus = 'ok';
  renderSyncBar();
}

function showSyncCode() {
  const text = formatCode(state.sync.code);
  $('builds-status').textContent =
    `동기화 코드: ${text} — 다른 기기의 ‘코드로 연결’에 입력하세요. ` +
    '이 코드를 가진 사람은 샘플을 모두 보고 고칠 수 있습니다.';
  navigator.clipboard?.writeText(text).then(
    () => toast('코드를 복사했습니다.'),
    () => {},
  );
}

// 켠 뒤에는 코드를 화면에 띄우지 않고 클립보드로만 옮긴다. 클립보드를 쓸 수 없는
// 환경(권한 거부, 보안 연결이 아닌 주소)에서는 옮겨 적을 수 있게 화면에 보인다.
async function copySyncCode() {
  try {
    await navigator.clipboard.writeText(formatCode(state.sync.code));
    toast('동기화 코드를 복사했습니다. 다른 기기의 ‘코드로 연결’에 붙여 넣으세요.');
  } catch {
    showSyncCode();
  }
}

// 공유 링크. 편집 중인 초안이 아니라 저장된 내용을 스냅샷으로 올린다. 링크를 받은
// 사람이 보는 것은 저장 단추를 누른 그 상태다.
async function shareBuild() {
  const editing = state.buildsEditing;
  if (!editing?.id || !state.sync) return;
  const snapshot = shareSnapshot(state.builds, editing.kind, editing.id);
  if (!snapshot) return;
  const result = await createShare(syncFetch, state.sync.code, snapshot);
  if (result.status !== 'ok') {
    $('builds-status').textContent =
      result.status === 'notSynced'
        ? '아직 서버에 올라가지 않았습니다. 동기화가 끝난 뒤 다시 시도하세요.'
        : result.status === 'offline'
          ? '연결이 없어 공유 링크를 만들지 못했습니다.'
          : '공유 링크를 만들지 못했습니다. 잠시 뒤 다시 시도하세요.';
    return;
  }
  const link = shareLink(location, result.id);
  const until = `${fmtDay(result.expiresAt)}까지 열 수 있습니다.`;
  try {
    await navigator.clipboard.writeText(link);
    toast(`저장된 내용으로 공유 링크를 복사했습니다. ${until}`);
  } catch {
    $('builds-status').textContent = `공유 링크: ${link} — ${until}`;
  }
}

function renderShare() {
  if (state.page !== 'shared' || !state.share) return;
  const { status, data } = state.share;
  // 이름을 한국어로 보여야 하므로 도감과 한국어 명칭을 기다린다.
  const waiting = data && !(state.locale && state.reference);
  $('shared-title').textContent = shareTitle(waiting ? null : data);
  $('shared-body').innerHTML = shareView(waiting ? 'loading' : status, waiting ? null : data, {
    reference: state.reference,
    locale: state.locale,
    index: state.index,
  });
}

async function openShare(id, { navigate = true } = {}) {
  state.share = { id, status: 'loading', data: null };
  showPage('shared');
  if (navigate) history.pushState({ share: id }, '', `#share=${encodeURIComponent(id)}`);
  renderShare();
  window.scrollTo(0, 0);
  const result = await pullShare(syncFetch, id);
  // 불러오는 사이 다른 링크를 열었으면 늦게 온 결과를 버린다.
  if (state.share?.id !== id) return;
  const data = result.status === 'ok' ? readShare(result.share) : null;
  state.share = { id, status: result.status === 'ok' && !data ? 'error' : result.status, data };
  renderShare();
}

function buildsSave() {
  if (!writeDoc(storage, state.builds)) {
    $('builds-status').textContent =
      '브라우저 저장 공간에 쓰지 못했습니다. 저장 공간이 가득 찼거나 막혀 있습니다.';
    return false;
  }
  // 로컬 저장이 성공한 뒤에만 올린다. 올리지 못해도 저장은 성립한다.
  if (state.sync) {
    state.sync = { ...state.sync, dirty: true };
    writeSync(storage, state.sync);
    uploader.request();
  }
  return true;
}

// 고치는 중에는 목록 검색과 JSON 버튼이 할 일이 없어 자리만 차지하고, 샘플·파티
// 탭은 눌러도 아무 일도 일어나지 않으면서 눌리는 척한다. 편집기는 renderBuilds를
// 거치지 않는 경로로도 그려지므로 두 곳이 같은 함수를 부른다.
function renderBuildsChrome(editing) {
  renderSyncBar();
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
    shareable: editing.id !== null && !!state.sync,
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

// 고르는 자리. 계산기에서 연 창이면 그 쪽(mine·theirs)의 포켓몬을 초안처럼 쓴다.
// 계산기 쪽 대상. { page: 'speed' | 'damage', side }.
const calcSide = target =>
  target.page === 'damage' ? state.calc.damage[target.side] : state.calc[target.side];
const pickerDraft = () =>
  picker?.calc ? { pokemon: calcSide(picker.calc).pokemon } : state.buildsEditing?.draft;

function pickerSource() {
  const draft = pickerDraft();
  if (!picker || !draft) return [];
  if (picker.kind === 'species')
    // reference.species는 id(예: charizard)로 찾는다. name(예: Charizard)을 값으로
    // 쓰면 특성·기술 목록과 표시 이름이 전부 어긋난다. name은 영문 검색용으로만 남긴다.
    // 계산기에서는 스피드 종족값을 함께 적는다.
    return speciesOptions(state.reference, state.locale, '', state.index).map(row => ({
      value: row.id,
      label: row.label,
      sub: [
        row.types.map(t => TYPE_LABELS[t] ?? t).join(' · '),
        picker.calc?.page === 'speed'
          ? `스피드 ${state.reference.species[row.id]?.stats?.spe ?? '—'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
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
        // 기술과 같이 효과를 보인다. 무엇을 지닐지 고민하는 자리다.
        effect: moveEffect(state.reference.held_item[toId(name)]),
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
    // 타입·분류·위력·명중·PP를 줄에 함께 적고, 성질과 효과를 그 아래 둔다. 무엇을
    // 쓸지 고민하는 자리라 이름만으로는 고를 수가 없다. 걸러내는 일도 이 값으로 한다.
    return names
      .map(name => {
        const move = state.reference.move[toId(name)] ?? {};
        return {
          value: name,
          label: buildLabel('move', name),
          sub: [TYPE_LABELS[move.type] ?? move.type, moveMeta(move, { pp: true })]
            .filter(Boolean)
            .join(' · '),
          // 성질과 효과는 있을 때만 적는다.
          chips: (move.traits ?? []).map(t => MOVE_TRAITS[t] ?? t),
          effect: moveEffect(move),
          name,
          type: move.type ?? '',
          category: move.category ?? '',
          traits: move.traits ?? [],
        };
      })
      .sort(byLabel);
  }
  // 계산기는 포켓몬을 고른 샘플만 쓸 수 있다.
  return state.builds.samples
    .filter(s => !picker.calc || s.pokemon)
    .map(s => ({
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

function openPicker(kind, slot = null, calc = null) {
  const draft = calc ? { pokemon: calcSide(calc).pokemon } : state.buildsEditing?.draft;
  if (!draft) return;
  if (kind === 'move' && !draft.pokemon) {
    toast('먼저 포켓몬을 선택하세요.');
    return;
  }
  picker = {
    kind,
    slot,
    calc,
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
  if (picker?.calc?.page === 'damage') {
    const { side } = picker.calc;
    const current = state.calc.damage[side];
    const sample = state.builds.samples.find(s => s.id === value);
    const next =
      picker.kind === 'member'
        ? sample
          ? damageSideFromSample(sample, side, natureAdjust)
          : current
        : picker.kind === 'species'
          ? { ...current, pokemon: value }
          : picker.kind === 'item'
            ? { ...current, item: toId(value) }
            : { ...current, move: toId(value), power: 0, hits: null, spread: null };
    // 포켓몬이 바뀌면 그 포켓몬이 가질 수 없는 특성은 비운다.
    const own = (state.reference.species[next.pokemon]?.abilities ?? []).map(toId);
    if (next.ability && !own.includes(next.ability)) next.ability = '';
    state.calc.damage[side] = next;
    picker = null;
    $('picker-dialog').close();
    return renderCalc();
  }
  if (picker?.calc) {
    const key = picker.calc.side;
    const sample = state.builds.samples.find(s => s.id === value);
    state.calc[key] =
      picker.kind === 'member'
        ? fitCalcSide(sample ? sideFromSample(sample, natureAdjust) : state.calc[key])
        : fitCalcSide({ ...state.calc[key], pokemon: value });
    picker = null;
    $('picker-dialog').close();
    return renderCalc();
  }
  const editing = state.buildsEditing;
  if (!editing || !picker) return;
  const draft = editing.draft;
  if (picker.kind === 'species') {
    // 비우는 규칙은 setSpecies에 있다. 지워지는 것이 적지 않으므로 알린다.
    editing.draft = setSpecies(draft, value, state.reference);
    if (draft.pokemon !== value && (draft.moves.some(Boolean) || draft.altMoves.length))
      toast('포켓몬이 바뀌어 기술을 비웠습니다.');
  } else if (picker.kind === 'item') editing.draft = { ...draft, item: value };
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
  // 검색창에 초점을 두지 않는다. 모바일에서 키보드가 올라와 화면을 가리고, 다른
  // 탭도 들어갈 때 초점을 옮기지 않는다.
}
function closeDex() {
  showPage('ranking');
}
async function loadReference() {
  state.refError = false;
  try {
    const response = await fetch('./public/data/reference.json');
    if (!response.ok) throw Error('Reference unavailable');
    // 배틀에서 쓸 수 없는 도구(Z 크리스탈, 진화 도구 등)는 불러오면서 뺀다.
    state.reference = pruneItems(await response.json());
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
  renderShare();
  renderCalc();
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
  // 상세 탭을 바꿀 때처럼 스크롤을 건드리지 않는다. 좁은 화면은 목록 자리에 상세가
  // 들어와 보던 위치가 다른 내용이 되므로 그때만 위로 올린다.
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
      renderShare();
      renderCalc();
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
    renderTrends();
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

// 상단 메뉴를 마우스로 끌어 옆으로 넘긴다. 터치는 브라우저가 이미 해 주므로 마우스만
// 다룬다. 조금만 움직여도 끌기로 치면 누르려던 탭이 안 눌리므로 몇 픽셀은 봐준다.
// 끌고 나서 뗀 자리의 탭이 눌리지 않도록 그 한 번의 클릭은 삼킨다.
{
  const nav = document.querySelector('.category-nav');
  let press = null;
  let dragged = false;
  nav.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    press = { x: event.clientX, left: nav.scrollLeft, id: event.pointerId };
    dragged = false;
  });
  nav.addEventListener('pointermove', event => {
    if (!press || event.pointerId !== press.id) return;
    const moved = event.clientX - press.x;
    if (!dragged && Math.abs(moved) < 6) return;
    if (!dragged) {
      dragged = true;
      nav.setPointerCapture(press.id);
      nav.classList.add('is-dragging');
    }
    nav.scrollLeft = press.left - moved;
  });
  const release = () => {
    press = null;
    nav.classList.remove('is-dragging');
    // 클릭은 떼는 순간 바로 뒤따른다. 그 뒤에도 표시가 남으면 다음 정상 클릭까지
    // 삼키므로 한 박자 뒤에 푼다.
    if (dragged) setTimeout(() => (dragged = false));
  };
  nav.addEventListener('pointerup', release);
  nav.addEventListener('pointercancel', release);
  nav.addEventListener(
    'click',
    event => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

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
  if (event.target.closest('[data-builds-share]')) return shareBuild();
});

// 기술 끌어서 놓기. 폰이 주 사용처라 HTML 기본 드래그(마우스 전용) 대신 포인터
// 이벤트로 만든다. 손잡이만 잡을 수 있고(touch-action: none), 놓을 자리는 손가락 아래
// 요소로 찾는다. 무엇이 어떻게 바뀌는지는 builds.js의 dragMove가 정한다.
let moveDrag = null;

function moveDropTarget(x, y) {
  const under = document.elementFromPoint(x, y);
  const row = under?.closest('#builds-rows [data-drag-list]');
  if (row) return { el: row, list: row.dataset.dragList, index: Number(row.dataset.dragIndex) };
  const zone = under?.closest('#builds-rows [data-drag-zone]');
  if (zone)
    return {
      el: zone,
      list: zone.dataset.dragZone,
      index: state.buildsEditing.draft.altMoves.length,
    };
  return null;
}

function endMoveDrag(apply) {
  const drag = moveDrag;
  if (!drag) return;
  moveDrag = null;
  drag.row.classList.remove('is-dragging');
  drag.target?.el.classList.remove('is-drop-target');
  document.body.classList.remove('is-dragging-move');
  if (!apply || !drag.target || !state.buildsEditing) return;
  const draft = state.buildsEditing.draft;
  const next = dragMove(draft, drag.from, drag.target);
  if (next === draft) return;
  state.buildsEditing.draft = next;
  saveDraft();
  renderBuildsEditor();
}

$('builds-rows').addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle || !state.buildsEditing || event.button !== 0) return;
  const row = handle.closest('[data-drag-list]');
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  moveDrag = {
    row,
    from: { list: row.dataset.dragList, index: Number(row.dataset.dragIndex) },
    target: null,
  };
  row.classList.add('is-dragging');
  document.body.classList.add('is-dragging-move');
});
$('builds-rows').addEventListener('pointermove', event => {
  if (!moveDrag) return;
  const target = moveDropTarget(event.clientX, event.clientY);
  if (target?.el !== moveDrag.target?.el) {
    moveDrag.target?.el.classList.remove('is-drop-target');
    if (target && target.el !== moveDrag.row) target.el.classList.add('is-drop-target');
  }
  moveDrag.target = target;
  // 손잡이를 잡고 있으면 화면이 스크롤되지 않는다. 가장자리에 닿으면 앱이 대신 민다.
  const edge = 72;
  if (event.clientY < edge) window.scrollBy(0, -12);
  else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
});
$('builds-rows').addEventListener('pointerup', () => endMoveDrag(true));
$('builds-rows').addEventListener('pointercancel', () => endMoveDrag(false));

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
$('shared-body').addEventListener('click', event => {
  if (event.target.closest('[data-share-home]')) return goToRanking({ top: true });
  if (event.target.closest('[data-share-retry]') && state.share)
    openShare(state.share.id, { navigate: false });
});
// 충돌 팝업. 닫으면(× 또는 Esc) 고르지 않은 채로 두고, 동기화 줄의 ‘충돌 해결’로
// 다시 연다. 올리기는 고를 때까지 멈춘다.
$('sync-dialog').addEventListener('click', event => {
  const side = event.target.closest('[data-sync-choose]')?.dataset.syncChoose;
  if (side) return chooseConflict(side);
  if (event.target.closest('#close-sync-dialog')) $('sync-dialog').close();
});
$('builds-sync').addEventListener('click', async event => {
  const action = event.target.closest('[data-sync]')?.dataset.sync;
  if (!action) return;
  if (action === 'enable') {
    // 새 코드는 서버에 아무것도 없으므로 버전 0에서 올린다.
    state.sync = { code: newSyncCode(), dirty: true };
    writeSync(storage, state.sync);
    writeBase(storage, null);
    state.builds = { ...state.builds, version: 0 };
    writeDoc(storage, state.builds);
    uploader.request();
    return showSyncCode();
  }
  if (action === 'join') {
    const typed = prompt('다른 기기에서 ‘코드 복사’로 얻은 동기화 코드를 입력하세요.');
    if (typed === null) return;
    const code = normalizeCode(typed);
    if (!code) {
      $('builds-status').textContent = '동기화 코드가 올바르지 않습니다. 20자를 그대로 입력하세요.';
      return;
    }
    const server = await pullDoc(syncFetch, code);
    if (server.status !== 'ok') {
      $('builds-status').textContent =
        '서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.';
      return;
    }
    // 이 기기 것을 버리지 않고 합친다. 같은 항목은 나중에 저장한 쪽을 남긴다.
    const previous = { builds: state.builds, sync: state.sync };
    const remote = docFromServer(server.doc, server.version);
    state.builds = joinDocs(state.builds, remote);
    state.sync = { code, dirty: true };
    writeSync(storage, state.sync);
    // 합친 결과는 서버 문서 위에 이 기기 것을 얹은 것이다. 기준본은 서버 문서다.
    if (buildsSave()) writeBase(storage, remote);
    else {
      state.builds = previous.builds;
      state.sync = previous.sync;
      writeSync(storage, previous.sync);
    }
    return renderBuilds();
  }
  if (action === 'copy') return copySyncCode();
  if (action === 'off')
    return askConfirm(
      '이 기기의 동기화를 끕니다. 서버와 다른 기기의 자료는 그대로 남습니다. ' +
        '다시 켜려면 코드가 필요하니 먼저 적어 두세요.',
      () => {
        state.sync = null;
        state.syncConflict = null;
        writeSync(storage, null);
        writeBase(storage, null);
        state.syncStatus = 'off';
        renderSyncBar();
      },
      '끄기',
    );
  if (action === 'resolve') {
    if (state.syncConflict) return openConflictDialog();
    return resolveConflict();
  }
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
// 사용률 추이. 날짜별 스냅샷에서 순위만 뽑아 견준다(trends.js). 받은 자료는
// 메모리에만 둔다. 제공처 규칙상 영구 보관은 하지 않는다.
const trendStore = createTrendStore(path =>
  fetch(SOURCE + path, { credentials: 'omit', signal: AbortSignal.timeout(20000) }).then(r =>
    r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
  ),
);
let trendRequest = 0;
const trendFormat = () => state.trends.format ?? state.format;

function openTrends(scope = state.trends.scope, { navigate = true } = {}) {
  state.trends.scope = TREND_SCOPES[scope] ? scope : 'current';
  showPage('trends');
  if (navigate)
    history.pushState({ trends: state.trends.scope }, '', `#trends=${state.trends.scope}`);
  renderTrends();
  window.scrollTo(0, 0);
}

async function renderTrends() {
  if (state.page !== 'trends') return;
  const { scope, focus } = state.trends;
  const format = trendFormat();
  document
    .querySelectorAll('[data-trend-scope]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.trendScope === scope)));
  document
    .querySelectorAll('[data-trend-format]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.trendFormat === format)));
  if (!state.index || !state.locale) {
    $('trends-status').textContent = '';
    $('trends-chart').innerHTML = loadingState('시즌 목록을 불러오는 중입니다.');
    return;
  }
  const request = ++trendRequest;
  let done = 0;
  let total = trendPoints(state.index.seasons, scope).length;
  const progress = () =>
    ($('trends-status').textContent = `자료를 불러오는 중입니다 (${done}/${total})`);
  progress();
  $('trends-chart').innerHTML = loadingState('날짜별 순위를 모으는 중입니다.');
  const { points, positions } = await trendData(scope, format, () => {
    done++;
    if (request === trendRequest) progress();
  });
  if (request !== trendRequest || state.page !== 'trends') return;
  const missing = positions.filter(p => !p).length;
  $('trends-status').textContent =
    `${points.length}개 시점 · ${format === 'Singles' ? '싱글' : '더블'}` +
    (missing ? ` · ${missing}개 시점을 불러오지 못해 비워 두었습니다` : '');
  $('trends-chart').innerHTML = rankChart(points, rankSeries(positions, TREND_LIMIT), {
    label: name => state.locale.pokemon(name).label,
    sprite: name => state.index.pokemon[name]?.sprite ?? null,
    limit: TREND_LIMIT,
    // 테두리 안쪽 폭만큼 열 간격을 늘려 왼쪽 끝에서 오른쪽 끝까지 채운다.
    width: $('trends-chart').clientWidth - 2,
  });
  if (focus) focusTrend(focus);
}

// 한 기간의 시점과 순위. 현재 시즌은 이전 시즌 최종일을 그대로 둔 첫날을 뺀다.
async function trendData(scope, format, onEach = () => {}) {
  const points = trendPoints(state.index.seasons, scope);
  const positions = await Promise.all(
    points.map(point => trendStore.get(point, format).finally(onEach)),
  );
  if (scope !== 'current') return { points, positions };
  const previous = previousFinal(state.index.seasons);
  const before = previous ? await trendStore.get(previous, format) : null;
  const trimmed = dropCarryOver(points, positions, before);
  return { points: trimmed.points, positions: trimmed.positionsList };
}

// 폭이 바뀌면 열 간격을 다시 맞춘다. 받은 자료는 메모리에 있어 다시 받지 않는다.
let trendResize = null;
window.addEventListener('resize', () => {
  if (state.page !== 'trends') return;
  clearTimeout(trendResize);
  trendResize = setTimeout(renderTrends, 200);
});

// 한 포켓몬만 강조한다. 다시 그리지 않고 표시만 바꾼다.
function focusTrend(name) {
  state.trends.focus = name;
  const svg = $('trends-chart').querySelector('svg');
  if (!svg) return;
  svg.classList.toggle('is-focused', !!name);
  svg.querySelectorAll('.trend-line').forEach(line => {
    const on = line.dataset.trend === name;
    line.classList.toggle('is-on', on);
    // 강조한 줄을 맨 위에 그린다. SVG는 나중에 온 것이 위에 보인다.
    if (on) line.parentNode.append(line);
  });
}

// 랭킹 상세의 ‘추이’ 탭. 세 기간을 차례로 받아 채운다.
async function renderPokemonTrend(p) {
  const format = state.format;
  const scopes = Object.keys(TREND_SCOPES).map(scope => ({
    scope,
    title: TREND_SCOPES[scope],
    points: state.index ? trendPoints(state.index.seasons, scope) : [],
    ranks: null,
  }));
  const draw = () => {
    if (state.category !== 'trend' || selectedEntry()?.name !== p.name) return;
    $('category-content').innerHTML = pokemonTrendView(scopes);
  };
  draw();
  if (!state.index) return;
  for (const section of scopes) {
    const { points, positions } = await trendData(section.scope, format);
    section.points = points;
    section.ranks = rankOf(positions, p.name);
    draw();
  }
}

$('trends-link').onclick = () => {
  if (state.page !== 'trends') openTrends();
};
document
  .querySelectorAll('[data-trend-scope]')
  .forEach(button => button.addEventListener('click', () => openTrends(button.dataset.trendScope)));
document.querySelectorAll('[data-trend-format]').forEach(button =>
  button.addEventListener('click', () => {
    state.trends.format = button.dataset.trendFormat;
    renderTrends();
  }),
);
$('trends-chart').addEventListener('click', event => {
  const line = event.target.closest('[data-trend]');
  focusTrend(!line || line.dataset.trend === state.trends.focus ? null : line.dataset.trend);
});

// 계산기. 스피드 계산기는 계산을 speed-calc.js에, 마크업을 calc-view.js에 둔다.
const CALC_TABS = ['speed', 'damage'];

function openCalc(tab = 'damage', { navigate = true } = {}) {
  state.calc.tab = CALC_TABS.includes(tab) ? tab : 'damage';
  showPage('calc');
  if (navigate) history.pushState({ calc: state.calc.tab }, '', `#calc=${state.calc.tab}`);
  renderCalc();
  window.scrollTo(0, 0);
}

const calcBase = pokemon => state.reference?.species?.[pokemon]?.stats?.spe;
const calcSpeciesLabel = id => state.locale.pokemon(state.reference.species[id]?.name ?? id).label;

function calcResults() {
  const { mine, theirs, field } = state.calc;
  const results = {
    mine: mine.pokemon ? finalSpeed(mine, field, calcBase(mine.pokemon)) : null,
    theirs: theirs.pokemon ? finalSpeed(theirs, field, calcBase(theirs.pokemon)) : null,
  };
  const order =
    results.mine && results.theirs ? compareSpeed(results.mine.speed, results.theirs.speed) : null;
  return { results, order };
}

function renderCalc() {
  if (state.page !== 'calc') return;
  document
    .querySelectorAll('[data-calc-tab]')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.calcTab === state.calc.tab)));
  if (!state.reference || !state.locale) {
    $('calc-body').innerHTML = loadingState('도감과 한국어 명칭을 불러오는 중입니다.');
    return;
  }
  if (state.calc.tab === 'damage') return renderDamage();
  const { results, order } = calcResults();
  $('calc-body').innerHTML = speedCalcView(state.calc, results, order, {
    reference: state.reference,
    locale: state.locale,
    index: state.index,
    speciesLabel: calcSpeciesLabel,
  });
}

// 숫자를 칠 때마다 전체를 다시 그리면 커서가 튄다. 결과 칸만 고친다.
function renderCalcOutputs() {
  const { results, order } = calcResults();
  const verdict = speedVerdict(results.mine, results.theirs, order);
  $('calc-body')
    .querySelectorAll('[data-calc-verdict]')
    .forEach(box => (box.innerHTML = verdict));
  for (const key of ['mine', 'theirs']) {
    const panel = $('calc-body').querySelector(`[data-calc-side="${key}"]`);
    const result = results[key];
    const out = name => panel.querySelector(`[data-calc-out="${name}"]`);
    out('stat').textContent = result?.stat ?? '—';
    out('staged').textContent = result?.staged ?? '—';
    out('final').textContent = result?.speed ?? '—';
    out('effects').textContent = result ? effectText(state.reference, result) : '';
  }
}

// 포켓몬을 바꾸면 그 포켓몬이 가질 수 없는 특성과 도구를 비운다.
function fitCalcSide(side) {
  const next = { ...side };
  if (next.ability && !abilityChoices(state.reference, next.pokemon).includes(next.ability))
    next.ability = '';
  if (next.item && !itemChoices(next.pokemon).includes(next.item)) next.item = '';
  return next;
}

$('calc-link').onclick = () => {
  if (state.page !== 'calc') openCalc(state.calc.tab);
};
document
  .querySelectorAll('[data-calc-tab]')
  .forEach(button => button.addEventListener('click', () => openCalc(button.dataset.calcTab)));
$('calc-body').addEventListener('click', event => {
  const target = event.target;
  if (target.closest('[data-calc-swap]')) {
    const { mine, theirs } = state.calc;
    state.calc = { ...state.calc, mine: theirs, theirs: mine };
    return renderCalc();
  }
  if (target.closest('[data-calc-reset]')) {
    state.calc = {
      ...state.calc,
      mine: emptySide(),
      theirs: emptySide(),
      field: { weather: '', terrain: '' },
    };
    return renderCalc();
  }
  const key = target.closest('[data-calc-side]')?.dataset.calcSide;
  if (!key) return;
  const pick = target.closest('[data-calc-pick]');
  if (pick) {
    if (pick.dataset.calcPick === 'member' && !state.builds.samples.some(s => s.pokemon))
      return toast('샘플이 없습니다.');
    return openPicker(pick.dataset.calcPick, null, { page: 'speed', side: key });
  }
  const side = state.calc[key];
  const points = target.closest('[data-calc-points]');
  const nature = target.closest('[data-calc-nature]');
  const stage = target.closest('[data-calc-stage]');
  if (points) state.calc[key] = { ...side, points: Number(points.dataset.calcPoints) };
  else if (nature) state.calc[key] = { ...side, nature: Number(nature.dataset.calcNature) };
  else if (stage)
    state.calc[key] = {
      ...side,
      stage: Math.max(-6, Math.min(6, side.stage + Number(stage.dataset.calcStage))),
    };
  else return;
  renderCalc();
});
// 데미지 계산기. 계산은 damage-calc.js, 마크업은 damage-view.js다.
function damageContext() {
  const dmg = state.calc.damage;
  const { attacker, defender } = dmg;
  const rawMove = attacker.move ? state.reference.move[attacker.move] : null;
  const move = rawMove ? { ...rawMove, id: attacker.move } : null;
  const species = id => state.reference.species[id];
  const actual = (side, key) =>
    species(side.pokemon)
      ? damageStat(
          species(side.pokemon).stats[key],
          side.points?.[key] ?? 0,
          side.nature?.[key] ?? 10,
        )
      : null;
  // 랭크를 곱한 값. 실수치 칸과 따로 보인다.
  const staged = (side, key) => {
    const value = actual(side, key);
    return value === null ? null : stageStat(value, side.stages?.[key] ?? 0);
  };
  // 전체기인지는 기술로 정한다. 칸을 직접 바꿨으면 그것을 따른다.
  const attackerSpecies = species(attacker.pokemon);
  const spread =
    attacker.spread ??
    isSpreadMove(move, dmg.field, attackerSpecies ? grounded(attackerSpecies, attacker) : true);
  const conditions = conditionsOf(move?.id, attacker.ability, attacker.pokemon, attacker.item);
  const input = move && {
    reference: state.reference,
    attacker,
    defender: { ...defender, nfe: NFE_SPECIES.has(defender.pokemon) },
    field: { ...dmg.field, format: dmg.format, spread },
    move,
    crit: attacker.crit,
  };
  const summary = input && attacker.pokemon && defender.pokemon ? damageSummary(input) : null;
  // 쓰는 능력치는 계산이 정한 분류를 따른다(셸사이드암은 물리가 될 수 있다).
  const keys = statKeys(move, summary?.category ?? move?.category);
  // 방어 측을 고르기 전(또는 효과가 없을 때)에도 결정력은 보인다. 도구·특성 배율은 뺀 값이다.
  const quickAttack = keys.fromDefender ? null : staged(attacker, keys.attack);
  // 내던지기는 지닌 도구의 위력이다.
  const quickBase =
    attacker.power || (move?.id === 'fling' ? FLING_POWER[attacker.item] : move?.power) || 0;
  const quickStab = attackerSpecies?.types.includes(move?.type)
    ? attacker.ability === 'adaptability'
      ? 2
      : 1.5
    : 1;
  // 급소와 타수도 넣는다. 트리플악셀은 타격마다 20·40·60이다.
  const quickHits = attacker.hits || (move ? defaultHits(move, attacker.ability) : 1);
  const quickPowers =
    move?.id === 'tripleaxel' && !attacker.power
      ? Array.from({ length: quickHits }, (_, i) => 20 * (i + 1))
      : Array(quickHits).fill(quickBase);
  const quickInput = {
    attackStat: quickAttack,
    basePower: quickBase,
    hitPowers: quickPowers,
    stab: quickStab,
    crit: !!attacker.crit,
    parentalBond: false,
    itemPower: itemPowerOf(attacker),
  };
  const quickPower =
    quickAttack && quickBase ? { ...quickInput, power: damagePower(quickInput) } : null;
  // 두 쪽의 모든 능력치(실수치·랭크 적용). 화면이 고른 칸의 값을 꺼내 쓴다.
  const allStats = side =>
    Object.fromEntries(
      ['atk', 'def', 'spa', 'spd', 'spe'].map(key => [
        key,
        { actual: actual(side, key), staged: staged(side, key) },
      ]),
    );
  const hpOf = side =>
    species(side.pokemon) ? hpStat(species(side.pokemon).stats.hp, side.points?.hp ?? 0) : null;
  return {
    quickPower,
    keys,
    spread,
    conditions,
    summary,
    // 부자유친은 한 번 때리는 기술을 두 번 때린다. 계산이 정한 타수를 보인다.
    defaultHits: summary?.hits ?? (move ? defaultHits(move, attacker.ability) : 1),
    hitRange: hitRange(move),
    attackerStats: { all: allStats(attacker), hp: hpOf(attacker) },
    defenderStats: { all: allStats(defender), hp: hpOf(defender) },
  };
}

const damageViewContext = context => ({
  ...context,
  reference: state.reference,
  index: state.index,
  speciesLabel: calcSpeciesLabel,
});

function renderDamage() {
  const context = damageContext();
  $('calc-body').innerHTML = damageCalcView(
    state.calc.damage,
    context.summary,
    damageViewContext(context),
  );
}

// 숫자를 칠 때는 결과만 고친다. 입력 칸을 다시 그리면 커서가 튄다.
function renderDamageResult() {
  const context = damageContext();
  const html = damageResult(context.summary, {
    ...damageViewContext(context),
    state: state.calc.damage,
  });
  $('calc-body')
    .querySelectorAll('[data-dmg-result]')
    .forEach(box => (box.innerHTML = html));
  // 칸 옆의 실수치·랭크 적용 값도 제자리에서 고친다.
  $('calc-body')
    .querySelectorAll('[data-dmg-stat], [data-dmg-staged]')
    .forEach(out => {
      const side = state.calc.damage[out.closest('[data-dmg-side]')?.dataset.dmgSide];
      const key = out.dataset.dmgStat ?? out.dataset.dmgStaged;
      const species = side && state.reference.species[side.pokemon];
      if (!species) return;
      const value =
        key === 'hp'
          ? hpStat(species.stats.hp, side.points?.hp ?? 0)
          : damageStat(species.stats[key], side.points?.[key] ?? 0, side.nature?.[key] ?? 10);
      out.textContent = out.dataset.dmgStat ? value : stageStat(value, side.stages?.[key] ?? 0);
    });
  // HP 능력 포인트가 바뀌면 남은 HP 글자의 최대 HP도 바뀐다.
  for (const [key, stats] of [
    ['attacker', context.attackerStats],
    ['defender', context.defenderStats],
  ]) {
    const out = $('calc-body').querySelector(`[data-dmg-side="${key}"] [data-dmg-out="hpPercent"]`);
    if (out) {
      out.dataset.hpMax = stats.hp ?? '';
      out.textContent = hpText(state.calc.damage[key].hpPercent ?? 100, stats.hp);
    }
  }
  // 결정력·내구력 칸도 같은 값으로 고친다.
  const view = damageViewContext(context);
  const power = $('calc-body').querySelector('[data-dmg-quick="power"]');
  if (power)
    power.innerHTML = powerBox(context.summary, {
      ...view,
      state: state.calc.damage,
      stats: context.attackerStats,
    });
  const bulk = $('calc-body').querySelector('[data-dmg-quick="bulk"]');
  if (bulk) bulk.innerHTML = bulkBox({ ...view, stats: context.defenderStats });
}

const clampNumber = (value, low, high) => Math.min(high, Math.max(low, value));
// 칸 이름 → 넣을 값. undefined면 무시한다(잘못 친 중간값).
const DAMAGE_NUMBERS = {
  power: text => (text.trim() === '' ? 0 : +text >= 0 ? Math.floor(+text) : undefined),
  hits: text =>
    text.trim() === ''
      ? null
      : Number.isInteger(+text) && +text >= 1
        ? Math.min(10, +text)
        : undefined,
  hpPercent: text => (Number.isFinite(+text) ? clampNumber(Math.round(+text), 1, 100) : undefined),
  timesHit: text => countValue(text, 6),
  fainted: text => countValue(text, 5),
  boostTotal: text => countValue(text, 42),
  stockpile: text => countValue(text, 3),
  damageTaken: text => countValue(text, 9999),
  metronome: text => countValue(text, 6, 1),
  toxicTurn: text => countValue(text, 15, 1),
  helmetHits: text => countValue(text, 9),
  roughSkinHits: text => countValue(text, 9),
};
// 세는 칸(맞은 횟수 등). 비우면 0.
function countValue(text, max, min = 0) {
  if (text.trim() === '') return min;
  const value = Number(text);
  return Number.isInteger(value) && value >= min ? Math.min(max, value) : undefined;
}

// 숫자 칸 하나를 상태에 넣는다. 숫자 칸이 아니면 false.
function damageInput(target, commit) {
  const sideKey = target.closest('[data-dmg-side]')?.dataset.dmgSide;
  if (!sideKey) return false;
  const side = state.calc.damage[sideKey];
  if (target.dataset.dmgPoints) {
    const key = target.dataset.dmgPoints;
    const value = Number(target.value);
    if (!commit && !(Number.isInteger(value) && value >= 0 && value <= 32)) return true;
    const points = clampNumber(Math.round(value) || 0, 0, 32);
    state.calc.damage[sideKey] = { ...side, points: { ...side.points, [key]: points } };
    if (commit) target.value = points;
    return true;
  }
  const field = target.dataset.dmgNumber;
  if (!DAMAGE_NUMBERS[field]) return false;
  const value = DAMAGE_NUMBERS[field](target.value);
  if (value === undefined) return true;
  state.calc.damage[sideKey] = { ...side, [field]: value };
  // 막대 옆의 글자는 옮기는 동안 제자리에서 고친다.
  const out = target.closest('.calc-line')?.querySelector(`[data-dmg-out="${field}"]`);
  if (out && field === 'hpPercent') out.textContent = hpText(value, Number(out.dataset.hpMax) || 0);
  if (out && field === 'hits') out.textContent = `${value}타`;
  return true;
}

// ‘상세 보기’를 열어 두면 다시 그려도 열린 채로 둔다. toggle은 거품이 없어 잡아서 듣는다.
$('calc-body').addEventListener(
  'toggle',
  event => {
    if (event.target.matches?.('.dmg-rolls')) state.calc.damage.rollsOpen = event.target.open;
  },
  true,
);
$('calc-body').addEventListener('input', event => {
  if (state.calc.tab !== 'damage') return;
  if (damageInput(event.target, false)) renderDamageResult();
});
$('calc-body').addEventListener('change', event => {
  if (state.calc.tab !== 'damage') return;
  const target = event.target;
  // 숫자 칸은 벗어날 때 실수치까지 다시 그린다. 다만 다른 단추를 누르는 순간에 오는
  // change라 전체를 다시 그리면 그 클릭이 사라진다. 결과만 고치고 실수치는 제자리에서 둔다.
  if (damageInput(target, true)) return renderDamageResult();
  const field = target.dataset.dmgField;
  if (!field) return;
  const dmg = state.calc.damage;
  const sideKey = target.closest('[data-dmg-side]')?.dataset.dmgSide;
  if (field === 'weather' || field === 'terrain')
    dmg.field = { ...dmg.field, [field]: target.value };
  else if (sideKey && target.type === 'checkbox')
    dmg[sideKey] = { ...dmg[sideKey], [field]: target.checked };
  else if (sideKey && field === 'spikes') dmg[sideKey] = { ...dmg[sideKey], spikes: +target.value };
  else if (sideKey) dmg[sideKey] = { ...dmg[sideKey], [field]: target.value };
  renderDamage();
});
$('calc-body').addEventListener('click', event => {
  if (state.calc.tab !== 'damage') return;
  const target = event.target;
  const dmg = state.calc.damage;
  const format = target.closest('[data-dmg-format]');
  if (format) {
    dmg.format = format.dataset.dmgFormat;
    return renderDamage();
  }
  // 교체: 두 쪽의 포켓몬·특성·도구를 맞바꾼다. 기술은 새 공격 측 것이 아니므로 비운다.
  if (target.closest('[data-dmg-swap]')) {
    const { attacker, defender } = dmg;
    dmg.attacker = {
      ...attacker,
      pokemon: defender.pokemon,
      ability: defender.ability,
      item: defender.item,
      move: null,
      power: 0,
      hits: null,
    };
    dmg.defender = {
      ...defender,
      pokemon: attacker.pokemon,
      ability: attacker.ability,
      item: attacker.item,
    };
    return renderDamage();
  }
  if (target.closest('[data-dmg-reset]')) {
    state.calc.damage = { ...emptyDamage(), format: dmg.format };
    return renderDamage();
  }
  const sideKey = target.closest('[data-dmg-side]')?.dataset.dmgSide;
  if (!sideKey) return;
  const side = dmg[sideKey];
  const pick = target.closest('[data-dmg-pick]');
  if (pick) {
    const kind = pick.dataset.dmgPick;
    if (kind === 'member' && !state.builds.samples.some(s => s.pokemon))
      return toast('샘플이 없습니다.');
    return openPicker(kind, null, { page: 'damage', side: sideKey });
  }
  // 입력할 능력 고르기. 공격 측은 셸사이드암의 공격·특수공격, 방어 측은 방어·특수방어.
  const statView = target.closest('[data-dmg-stat-view]');
  if (statView) {
    const field = sideKey === 'attacker' ? 'attackView' : 'defenseView';
    dmg[sideKey] = { ...side, [field]: statView.dataset.dmgStatView };
    return renderDamage();
  }
  if (target.closest('[data-dmg-clear]')) {
    dmg[sideKey] = { ...side, item: '' };
    return renderDamage();
  }
  const button = target.closest('[data-dmg-set-points], [data-dmg-nature], [data-dmg-stage]');
  if (!button) return;
  const [attr, raw] = Object.entries(button.dataset).find(([k]) =>
    ['dmgSetPoints', 'dmgNature', 'dmgStage'].includes(k),
  );
  const [key, text] = raw.split(':');
  const value = Number(text);
  if (attr === 'dmgSetPoints') dmg[sideKey] = { ...side, points: { ...side.points, [key]: value } };
  else if (attr === 'dmgNature')
    dmg[sideKey] = { ...side, nature: { ...side.nature, [key]: value } };
  else
    dmg[sideKey] = {
      ...side,
      stages: { ...side.stages, [key]: clampNumber((side.stages?.[key] ?? 0) + value, -6, 6) },
    };
  renderDamage();
});

// 숫자 칸. 칠 때마다 결과만 고친다. 전체를 다시 그리면 커서가 튄다.
const calcNumber = {
  points: text => {
    const value = Number(text);
    return Number.isInteger(value) && value >= 0 && value <= 32 ? value : null;
  },
  multiplier: text => {
    const value = Number(text);
    return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
  },
};
$('calc-body').addEventListener('input', event => {
  const field = event.target.dataset?.calcField;
  const key = event.target.closest('[data-calc-side]')?.dataset.calcSide;
  if (!key || !calcNumber[field]) return;
  const value = calcNumber[field](event.target.value);
  if (value === null) return;
  state.calc[key] = { ...state.calc[key], [field]: value };
  renderCalcOutputs();
});
$('calc-body').addEventListener('change', event => {
  const target = event.target;
  const key = target.closest('[data-calc-side]')?.dataset.calcSide;
  if (!key) return;
  const field = target.dataset.calcField;
  const side = state.calc[key];
  if (calcNumber[field]) {
    // 칸을 벗어날 때 범위를 맞춘다. 다시 그리지 않는다. 이 change는 다른 단추를 누르는
    // 순간에 오므로, 다시 그리면 누른 단추가 사라져 그 클릭이 먹히지 않는다.
    const value =
      field === 'points'
        ? Math.max(0, Math.min(32, Math.round(Number(target.value) || 0)))
        : (calcNumber.multiplier(target.value) ?? 1);
    state.calc[key] = { ...side, [field]: value };
    target.value = value;
    return renderCalcOutputs();
  }
  if (field === 'weather' || field === 'terrain')
    state.calc.field = { ...state.calc.field, [field]: target.value };
  else if (field === 'abilityOn' || field === 'tailwind')
    state.calc[key] = { ...side, [field]: target.checked };
  else if (['ability', 'item', 'status'].includes(field))
    state.calc[key] = { ...side, [field]: target.value };
  else return;
  renderCalc();
});
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
  if (params.has('share')) {
    openShare(params.get('share'), { navigate: false });
    return;
  }
  if (params.has('speed')) {
    openSpeed(params.get('speed'), { navigate: false });
    return;
  }
  if (params.has('trends')) {
    openTrends(params.get('trends'), { navigate: false });
    return;
  }
  if (params.has('calc')) {
    openCalc(params.get('calc'), { navigate: false });
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
// 연결이 돌아오면 올리지 못한 변경을 다시 보낸다. 충돌은 사람이 고를 때까지 둔다.
window.addEventListener('online', () => {
  if (state.sync?.dirty && state.syncStatus !== 'conflict') uploader.request();
});
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
syncOnOpen();
// Opening a shared #dex link lands on the index rather than the ranking.
const startupDex = new URLSearchParams(location.hash.slice(1)).get('dex');
if (startupDex) openDex(startupDex, { navigate: false });
const startupTypes = new URLSearchParams(location.hash.slice(1)).get('types');
if (startupTypes !== null) openTypeChart(startupTypes, { navigate: false });
if (new URLSearchParams(location.hash.slice(1)).has('articles')) openArticles({ navigate: false });
const startupTrends = new URLSearchParams(location.hash.slice(1)).get('trends');
if (startupTrends !== null) openTrends(startupTrends, { navigate: false });
const startupCalc = new URLSearchParams(location.hash.slice(1)).get('calc');
if (startupCalc !== null) openCalc(startupCalc, { navigate: false });
const startupSpeed = new URLSearchParams(location.hash.slice(1)).get('speed');
if (startupSpeed !== null) openSpeed(startupSpeed, { navigate: false });
const startupShare = new URLSearchParams(location.hash.slice(1)).get('share');
if (startupShare) openShare(startupShare, { navigate: false });
const startupBuilds = new URLSearchParams(location.hash.slice(1)).get('builds');
if (startupBuilds !== null) {
  const startupEdit = new URLSearchParams(location.hash.slice(1)).get('edit');
  if (startupEdit)
    openBuildsEditor(startupBuilds, startupEdit === 'new' ? null : startupEdit, {
      navigate: false,
    });
  else openBuilds(startupBuilds, { navigate: false });
}
