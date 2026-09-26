import { esc } from './html.js';
import { SEASON_REGULATIONS, isMegaForme } from './data.js';
import { megaSprite, itemArtwork } from './images.js';

export const articleSeasonLabel = season =>
  `${season.replace(/^M/, 'M-')}${SEASON_REGULATIONS[season] ? ` (${SEASON_REGULATIONS[season]})` : ''}`;

const RANK_LIMITS = [
  ['', '전체 순위'],
  ['10', '10위 이내'],
  ['50', '50위 이내'],
  ['100', '100위 이내'],
  ['1000', '1000위 이내'],
];

export function articleControls(articles, filters) {
  const seasons = [
    ...new Set([...Object.keys(SEASON_REGULATIONS), ...articles.map(a => a.season)]),
  ].sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  return `<div class="article-controls">
    <label>시즌<select id="article-season"><option value="">전체 시즌</option>${seasons
      .map(
        season =>
          `<option value="${esc(season)}"${filters.season === season ? ' selected' : ''}>${esc(articleSeasonLabel(season))}</option>`,
      )
      .join('')}</select></label>
    <label>배틀 형식<select id="article-format"><option value="">전체 형식</option><option value="Singles"${filters.format === 'Singles' ? ' selected' : ''}>싱글배틀</option><option value="Doubles"${filters.format === 'Doubles' ? ' selected' : ''}>더블배틀</option></select></label>
    <label>최종 순위<select id="article-rank">${RANK_LIMITS.map(
      ([value, label]) =>
        `<option value="${value}"${String(filters.maxRank ?? '') === value ? ' selected' : ''}>${label}</option>`,
    ).join('')}</select></label>
    <label>정렬<select id="article-sort"><option value="rank"${filters.sort !== 'recent' ? ' selected' : ''}>최종 순위순</option><option value="recent"${filters.sort === 'recent' ? ' selected' : ''}>최근 게시순</option></select></label>
    <label class="article-search-label">검색<input id="article-search" type="search" value="${esc(filters.query)}" placeholder="포켓몬, 작성자, 기사 제목 (띄어 쓰면 모두 포함)" autocomplete="off"></label>
  </div>`;
}

const pokemonLabel = (id, reference, locale) => {
  const species = reference.species[id];
  return species ? locale.pokemon(species.name).label : id;
};

// 고른 포켓몬을 칩으로 보이고 하나씩 뺄 수 있게 한다.
export function renderSelectedPokemon(ids, reference, locale) {
  if (!ids.length) return '';
  return `<span>채용 파티:</span>${ids
    .map(
      id =>
        `<button class="article-chip article-chip-selected" data-article-remove-pokemon="${esc(id)}" aria-label="${esc(pokemonLabel(id, reference, locale))} 조건 빼기">${esc(pokemonLabel(id, reference, locale))} ✕</button>`,
    )
    .join(
      '',
    )}${ids.length > 1 ? '<button class="text-button" id="clear-article-pokemon">모두 해제</button>' : ''}`;
}

// 목록의 파티에서 많이 쓰인 포켓몬. 누르면 그 포켓몬을 조건에 더한다. 조건이 있을 때는
// 고른 포켓몬과 함께 쓰인 포켓몬이 된다.
export function renderArticleUsage(usage, total, reference, locale, selected = []) {
  if (!usage.length || total < 2) return '';
  return `<section class="article-usage" aria-label="채용 집계"><h3>${selected.length ? '함께 채용된 포켓몬' : '채용이 많은 포켓몬'} <span class="muted">(${total}개 파티 중)</span></h3><div class="article-usage-list">${usage
    .slice(0, 12)
    .map(
      ({ pokemon, count }) =>
        `<button class="article-chip" data-article-add-pokemon="${esc(pokemon)}">${esc(pokemonLabel(pokemon, reference, locale))} <span class="muted">${count}</span></button>`,
    )
    .join('')}</div></section>`;
}

export function renderArticleCards(articles, reference, locale, pokemon = []) {
  const picked = [pokemon].flat().filter(Boolean);
  if (!articles.length)
    return '<div class="empty-state"><p>이 조건으로 확인한 구축 기사가 없습니다.</p><p class="muted">아직 수록하지 않은 기사가 있을 수 있습니다.</p></div>';
  return `<div class="article-list">${articles
    .map(
      a => `<article class="team-article">
    <header class="article-meta"><strong class="article-rank">${a.rank === null ? '순위 미공개' : `최종 ${a.rank}위`}</strong><strong>${esc(a.author)}</strong><span>${esc(articleSeasonLabel(a.season))} / ${a.format === 'Singles' ? '싱글배틀' : '더블배틀'}${a.publishedAt ? ` / <time datetime="${esc(a.publishedAt)}">${esc(a.publishedAt)}</time>` : ''}</span></header>
    <ul class="article-party">${a.team
      .map(member => {
        const species = reference.species[member.pokemon];
        const name = locale.pokemon(species.name).label;
        const isMega = isMegaForme(species.forme);
        const sprite = isMega
          ? megaSprite(species.name)
          : species.forme
            ? null
            : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${species.dex}.png`;
        const item = reference.held_item[member.item];
        const itemName = item?.label || (item && locale.label('held_item', item.name));
        const selected = picked.some(
          id =>
            id === member.pokemon ||
            (isMega && reference.species[id]?.name === species.baseSpecies),
        );
        return `<li${selected ? ' class="article-member-selected"' : ''}>
        <span class="article-pokemon-art">${sprite ? `<img class="article-pokemon-image" src="${esc(sprite)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="article-image-fallback" aria-label="포켓몬 이미지 미제공"${sprite ? ' hidden' : ''}>◇</span></span>
        <strong>${esc(name)}</strong>
        ${item ? `<button class="article-item effect-link" data-effect-type="held_item" data-effect-id="${esc(member.item)}" aria-label="${esc(itemName)} 효과 보기">${itemArtwork(item.name)}<span>${esc(itemName)}</span></button>` : '<span class="muted">도구 없음</span>'}
      </li>`;
      })
      .join('')}</ul>
    <footer class="article-footer"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><span lang="ja">${esc(a.title)}</span><span class="article-open-label">원문 보기 ↗</span></a></footer>
  </article>`,
    )
    .join('')}</div>`;
}
