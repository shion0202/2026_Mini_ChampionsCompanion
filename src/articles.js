import { isMegaForme, toId } from './data.js';

const text = value => typeof value === 'string' && value.trim().length > 0;
function publicUrl(value) {
  try {
    const url = new URL(value);
    // 오래된 블로그(livedoor 등)는 http 주소만 있다. 원문 링크로만 쓰므로 http도 받되
    // javascript: 같은 다른 스킴과 계정이 박힌 주소는 막는다.
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

// Review is editorial: an image alone cannot prove whose final team it is.
// Keep pending/rejected candidates out of the public list even if otherwise valid.
export function reviewedArticles(data, reference) {
  if (!Array.isArray(data?.articles)) throw Error('Invalid article catalog');
  return data.articles.filter(
    a =>
      a &&
      text(a.id) &&
      text(a.author) &&
      text(a.title) &&
      publicUrl(a.url) &&
      /^M\d+$/.test(a.season) &&
      ['Singles', 'Doubles'].includes(a.format) &&
      // 원문이 최종 순위를 밝히지 않은 기사는 rank: null이다. 빠진 값(undefined)은 받지 않는다.
      (a.rank === null || (Number.isInteger(a.rank) && a.rank > 0)) &&
      a.review?.status === 'reviewed' &&
      text(a.review.checkedAt) &&
      text(a.review.teamEvidence) &&
      text(a.review.rankEvidence) &&
      Array.isArray(a.team) &&
      a.team.length === 6 &&
      new Set(a.team.map(m => m?.pokemon)).size === 6 &&
      a.team.every(
        m => reference.species[m?.pokemon] && (m.item === null || reference.held_item[m.item]),
      ),
  );
}

export function usesPokemon(article, id, reference) {
  return article.team.some(member => {
    if (member.pokemon === id) return true;
    const species = reference.species[member.pokemon];
    return isMegaForme(species?.forme) && toId(species.baseSpecies) === id;
  });
}

// 상세 탭은 포켓몬 하나(pokemon)를, 기사 화면은 여러 마리(pokemons)를 넘긴다.
// 여러 마리는 모두 채용한 파티만 남긴다.
export const selectedPokemon = filters => [
  ...new Set([...(filters.pokemons ?? []), filters.pokemon].filter(Boolean)),
];

// 순위 없는 기사는 같은 시즌의 맨 뒤에 두고, 순위 범위로 좁히면 빠진다.
const rankOf = article => article.rank ?? Number.MAX_SAFE_INTEGER;
const bySeasonThenRank = (a, b) =>
  Number(b.season.slice(1)) - Number(a.season.slice(1)) ||
  rankOf(a) - rankOf(b) ||
  a.id.localeCompare(b.id);
const SORTS = {
  rank: bySeasonThenRank,
  recent: (a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || bySeasonThenRank(a, b),
};

export function selectArticles(articles, filters, reference, locale) {
  // 공백으로 나눈 낱말을 모두 포함해야 한다. '한카리아스 팬텀'은 둘 다 있는 파티다.
  const words = (filters.query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const pokemon = selectedPokemon(filters);
  const maxRank = Number(filters.maxRank) || Infinity;
  return articles
    .filter(a => {
      if (filters.season && a.season !== filters.season) return false;
      if (filters.format && a.format !== filters.format) return false;
      if (rankOf(a) > maxRank) return false;
      if (!pokemon.every(id => usesPokemon(a, id, reference))) return false;
      if (!words.length) return true;
      const names = a.team.flatMap(m => {
        const name = reference.species[m.pokemon].name;
        return [name, locale.pokemon(name).label, locale.pokemonJapanese(name)];
      });
      const haystack = [a.author, a.title, ...names].join(' ').toLocaleLowerCase();
      return words.every(word => haystack.includes(word));
    })
    .sort(SORTS[filters.sort] ?? SORTS.rank);
}

// 목록에 든 파티에서 포켓몬별 채용 수를 센다. 메가는 기본 종족으로 묶는다. 필터가
// 기본 종족으로 찾을 때 메가까지 포함하므로 같은 단위로 세야 누른 뒤 건수가 맞는다.
// 이미 고른 포켓몬은 빼서 '함께 채용된 포켓몬'으로 읽히게 한다.
export function articleUsage(articles, reference, exclude = []) {
  const counts = new Map();
  for (const article of articles)
    for (const id of new Set(article.team.map(m => usageKey(m.pokemon, reference))))
      if (!exclude.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([pokemon, count]) => ({ pokemon, count }))
    .sort((a, b) => b.count - a.count || a.pokemon.localeCompare(b.pokemon));
}

function usageKey(id, reference) {
  const species = reference.species[id];
  if (!isMegaForme(species?.forme)) return id;
  const base = toId(species.baseSpecies);
  return reference.species[base] ? base : id;
}
