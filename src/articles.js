import { isMegaForme, toId } from './data.js';

const text = value => typeof value === 'string' && value.trim().length > 0;
function publicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
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
      Number.isInteger(a.rank) &&
      a.rank > 0 &&
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

export function selectArticles(articles, filters, reference, locale) {
  const query = (filters.query ?? '').trim().toLocaleLowerCase();
  return articles
    .filter(a => {
      if (filters.season && a.season !== filters.season) return false;
      if (filters.format && a.format !== filters.format) return false;
      if (filters.pokemon && !usesPokemon(a, filters.pokemon, reference)) return false;
      if (!query) return true;
      const names = a.team.flatMap(m => {
        const name = reference.species[m.pokemon].name;
        return [name, locale.pokemon(name).label, locale.pokemonJapanese(name)];
      });
      return [a.author, a.title, ...names].join(' ').toLocaleLowerCase().includes(query);
    })
    .sort(
      (a, b) =>
        Number(b.season.slice(1)) - Number(a.season.slice(1)) ||
        a.rank - b.rank ||
        a.id.localeCompare(b.id),
    );
}
