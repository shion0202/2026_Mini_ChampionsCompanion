import { esc } from './html.js';
import { SEASON_REGULATIONS } from './data.js';
import { megaSprite, itemArtwork } from './images.js';

export const articleSeasonLabel = season =>
  `${season.replace(/^M/, 'M-')}${SEASON_REGULATIONS[season] ? ` (${SEASON_REGULATIONS[season]})` : ''}`;

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
    <label>배틀 형식<select id="article-format"><option value="Singles"${filters.format === 'Singles' ? ' selected' : ''}>싱글배틀</option><option value="Doubles"${filters.format === 'Doubles' ? ' selected' : ''}>더블배틀</option></select></label>
    <label class="article-search-label">검색<input id="article-search" type="search" value="${esc(filters.query)}" placeholder="포켓몬, 작성자, 기사 제목" autocomplete="off"></label>
  </div>`;
}

export function renderArticleCards(articles, reference, locale, pokemon = '') {
  if (!articles.length)
    return '<div class="empty-state"><p>이 조건으로 확인한 구축기사가 없습니다.</p><p class="muted">아직 수록하지 않은 기사가 있을 수 있습니다.</p></div>';
  return `<div class="article-list">${articles
    .map(
      a => `<article class="team-article">
    <header class="article-meta"><strong class="article-rank">최종 ${a.rank}위</strong><strong>${esc(a.author)}</strong><span>${esc(articleSeasonLabel(a.season))} / ${a.format === 'Singles' ? '싱글배틀' : '더블배틀'}</span></header>
    <ul class="article-party">${a.team
      .map(member => {
        const species = reference.species[member.pokemon];
        const name = locale.pokemon(species.name).label;
        const isMega = species.forme.startsWith('Mega');
        const sprite = isMega
          ? megaSprite(species.name)
          : species.forme
            ? null
            : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${species.dex}.png`;
        const item = reference.held_item[member.item];
        const itemName = item?.label || (item && locale.label('held_item', item.name));
        const selected =
          pokemon === member.pokemon ||
          (isMega && reference.species[pokemon]?.name === species.baseSpecies);
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
