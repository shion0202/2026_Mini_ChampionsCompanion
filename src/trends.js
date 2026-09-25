// 사용률 추이. 어느 날짜의 자료를 견줄지 정하고, 스냅샷에서 포켓몬 순위만 뽑는다.
// DOM도 fetch도 직접 만지지 않는다. 설계는 docs/trends.md에 있다.
import { SEASON_REGULATIONS } from './data.js';

export const TREND_SCOPES = { regulation: '레귤레이션별', season: '시즌별', current: '현재 시즌' };
// 환경 분석용 그래프라 100위까지만 그린다. 포켓몬 하나의 추이에는 한계를 두지 않는다.
export const TREND_LIMIT = 100;

const seasonNumber = season => Number(season.slice(1));
// 'DD_MM_YYYY' → '9/25'
export const dateLabel = key => {
  const [day, month] = key.split('_');
  return `${Number(month)}/${Number(day)}`;
};

// 견줄 자료 목록. seasons는 normalizeIndex가 만든 것(최신 시즌이 앞, 날짜도 최신이 앞)이다.
//  regulation  레귤레이션마다 그 마지막 시즌의 최종일. 진행 중이면 가장 최근 날짜다.
//              표(SEASON_REGULATIONS)에 없는 시즌은 추정하지 않고 뺀다.
//  season      시즌마다 최종일
//  current     진행 중인 시즌의 모든 날짜
export function trendPoints(seasons, scope) {
  if (!seasons?.length) return [];
  const ascending = [...seasons].sort((a, b) => seasonNumber(a.season) - seasonNumber(b.season));
  if (scope === 'current') {
    const current = ascending.at(-1);
    return [...current.dates]
      .reverse()
      .map(date => ({ season: current.season, date, label: dateLabel(date) }));
  }
  if (scope === 'season')
    return ascending.map(s => ({ season: s.season, date: s.dates[0], label: s.season }));
  const last = new Map();
  for (const s of ascending) {
    const regulation = SEASON_REGULATIONS[s.season];
    if (regulation) last.set(regulation, s);
  }
  return [...last].map(([regulation, s]) => ({
    season: s.season,
    date: s.dates[0],
    label: regulation,
  }));
}

// 스냅샷 원본에서 포켓몬 이름 → 순위. 나머지(기술 등)는 버린다. 모양이 틀리면 null.
export function positionsOf(raw) {
  if (!raw || typeof raw.pokemon !== 'object' || raw.pokemon === null) return null;
  const positions = new Map();
  for (const [name, entry] of Object.entries(raw.pokemon))
    if (Number.isInteger(entry?.position) && entry.position > 0)
      positions.set(name, entry.position);
  return positions;
}

// 그래프에 그릴 줄. 어느 한 시점이라도 limit 안에 든 포켓몬만 그린다. 순위는 그대로
// 두고(limit 밖이거나 자료가 없으면 null), 마지막 시점 순위로 정렬한다.
export function rankSeries(positionsList, limit = TREND_LIMIT) {
  const names = new Set();
  for (const positions of positionsList)
    for (const [name, rank] of positions ?? []) if (rank <= limit) names.add(name);
  const lastRank = series => {
    for (let i = series.ranks.length - 1; i >= 0; i--) if (series.ranks[i]) return series.ranks[i];
    return Infinity;
  };
  return [...names]
    .map(name => ({
      name,
      ranks: positionsList.map(positions => {
        const rank = positions?.get(name) ?? null;
        return rank !== null && rank <= limit ? rank : null;
      }),
    }))
    .sort(
      (a, b) =>
        (a.ranks.at(-1) ?? Infinity) - (b.ranks.at(-1) ?? Infinity) ||
        lastRank(a) - lastRank(b) ||
        a.name.localeCompare(b.name),
    );
}

// 포켓몬 하나의 순위. 한계 없이 실제 순위를, 순위에 없으면 null.
export const rankOf = (positionsList, name) =>
  positionsList.map(positions => positions?.get(name) ?? null);

// 받은 자료는 메모리에만 둔다. 제공처 규칙상 영구 보관(미러·아카이브)은 하지 않는다.
// 같은 자료를 두 번 받지 않도록 진행 중인 요청도 함께 기억한다.
export function createTrendStore(fetchJson) {
  const cache = new Map();
  return {
    get(point, format) {
      const key = `${point.season}/${point.date}/${format}`;
      if (!cache.has(key))
        cache.set(
          key,
          fetchJson(`/data/meta/${key}.json`)
            .then(positionsOf)
            .catch(() => {
              // 실패는 기억하지 않는다. 다음에 다시 받는다.
              cache.delete(key);
              return null;
            }),
        );
      return cache.get(key);
    },
  };
}
