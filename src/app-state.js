// Values derived from the app state, split out of app.js so the decisions can be
// checked without a browser. Nothing here touches the DOM; app.js still owns the
// state object, the rendering and the event wiring.
import { formatDate, matchesQuery } from './data.js';
import { filterSummary } from './filters.js';

// Reads what the browser kept for this device. A blocked or corrupt store must
// leave the app usable, so every failure falls back to the default.
export function preferences(storage) {
  const read = (key, fallback) => {
    try {
      return JSON.parse(storage?.getItem(`champions:${key}`)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const storedFavorites = read('favorites', []);
  return {
    read,
    format: read('format', 'Singles') === 'Doubles' ? 'Doubles' : 'Singles',
    season: read('season', ''),
    spreadMode: read('spreadMode', 'grouped'),
    favorites: new Set(
      Array.isArray(storedFavorites) ? storedFavorites.filter(x => typeof x === 'string') : [],
    ),
  };
}

// A season that is no longer published falls back to the newest one. Kept separate
// from resolveContext so app.js can store the choice before the format is checked.
export const resolveSeason = (index, season) =>
  index.seasons.some(s => s.season === season) ? season : index.seasons[0].season;

// Never silently substitutes another season or format: an unavailable pairing fails.
export function resolveContext(index, { season, format }) {
  const entry = index.seasons.find(s => s.season === season);
  if (!entry) throw Error('선택한 시즌의 자료가 제공되지 않습니다.');
  if (!entry.formats.includes(format))
    throw Error('선택한 시즌의 배틀 형식 자료가 제공되지 않습니다.');
  return { season, date: entry.dates[0], format };
}

// Ranking order comes from the snapshot; names and artwork from the index; the
// Korean label from the dictionary. Missing index entries leave the source name.
export const buildList = (index, snapshot, locale) =>
  snapshot.pokemon.map(p => ({ ...index.pokemon[p.name], ...p, ...locale.pokemon(p.name) }));

// Both conditions can hold at once, so the notices are joined rather than replaced.
export function loadMessages({ stale, date, skipped }) {
  const messages = [];
  if (stale)
    messages.push(
      `새 자료를 확인하지 못해 ${formatDate(date)}의 이전 통계를 표시합니다.` +
        ` 표시된 날짜와 시각은 해당 이전 자료 기준입니다.`,
    );
  if (skipped)
    messages.push(
      `자료 형식을 확인할 수 없는 ${skipped}마리를 목록에서 제외했습니다.` +
        ` 제외한 항목의 통계는 표시하지 않습니다.`,
    );
  return messages.join(' ');
}

// Moving to another Pokémon starts its detail view from the top, so the tab, the
// mega form and every learnset filter go back to their defaults.
export const selectionReset = () => ({
  category: 'overview',
  form: null,
  learnQuery: '',
  learnType: [],
  learnCategory: [],
  learnTrait: [],
  learnModes: {},
});

// Name, initial-consonant and English search over one reference category. Moves
// carry their own filters and go through selectMoves in reference-view.js instead.
export function dexEntries(reference, locale, kind, query) {
  const records = reference?.[kind] ?? {};
  return Object.entries(records)
    .map(([id, record]) => ({
      ...record,
      id,
      label: record.label || locale.label(kind, record.name ?? id),
    }))
    .filter(record => record.name && matchesQuery(record, query))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

const SORT_LABELS = { rank: '사용 순위', name: '이름', dex: '도감 번호' };
export const sortLabel = (sort, reverse) =>
  `${SORT_LABELS[sort]} (${reverse ? '내림차순' : '오름차순'})`;

export const activeFilters = (
  { generation, type, gimmick, favoriteOnly, rankModes = {} },
  labels,
) =>
  [
    filterSummary(generation, labels.generation, rankModes.generation),
    filterSummary(type, labels.type, rankModes.type),
    filterSummary(gimmick, labels.gimmick, rankModes.gimmick),
    favoriteOnly ? '즐겨찾기' : '',
  ].filter(Boolean);
