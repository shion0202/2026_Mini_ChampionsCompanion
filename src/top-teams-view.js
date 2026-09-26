// 포켓몬 상세의 '상위 파티' 탭. 포케DB 공개 데이터에서 이 포켓몬을 쓴 최종 상위 파티를 그린다.
import { esc } from './html.js';
import { SEASON_REGULATIONS, isMegaForme } from './data.js';
import { megaSprite, itemArtwork } from './images.js';
import { memberBase, teamsWith, topTeamUsage } from './top-teams.js';

export const TOP_TEAMS_PAGE = 20;

const seasonLabel = season =>
  `${season.replace(/^M/, 'M-')}${SEASON_REGULATIONS[season] ? ` (${SEASON_REGULATIONS[season]})` : ''}`;
const formatLabel = format => (format === 'Doubles' ? '더블배틀' : '싱글배틀');

const pokemonName = (id, reference, locale) => {
  const species = reference.species[id];
  return species ? locale.pokemon(species.name).label : id;
};
const itemName = (id, reference, locale) => {
  const item = reference.held_item[id];
  return item ? item.label || locale.label('held_item', item.name) : id;
};

function member([id, item], pokemon, reference, locale) {
  if (!id)
    return `<li><span class="top-team-art"><span class="top-team-fallback" aria-hidden="true">?</span></span><strong class="muted">비공개</strong></li>`;
  const species = reference.species[id];
  const isMega = isMegaForme(species.forme);
  const sprite = isMega
    ? megaSprite(species.name)
    : species.forme
      ? null
      : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${species.dex}.png`;
  const selected = memberBase(id, reference) === pokemon;
  const held =
    item === null
      ? '<span class="muted">도구 없음</span>'
      : !item
        ? '<span class="muted">도구 미공개</span>'
        : `<button class="top-team-item effect-link" data-effect-type="held_item" data-effect-id="${esc(item)}" aria-label="${esc(itemName(item, reference, locale))} 효과 보기">${itemArtwork(reference.held_item[item].name)}<span>${esc(itemName(item, reference, locale))}</span></button>`;
  return `<li${selected ? ' class="top-team-selected"' : ''}>
    <span class="top-team-art">${sprite ? `<img class="top-team-image" src="${esc(sprite)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="top-team-fallback" aria-label="포켓몬 이미지 미제공"${sprite ? ' hidden' : ''}>◇</span></span>
    <strong>${esc(pokemonName(id, reference, locale))}</strong>
    ${held}
  </li>`;
}

function usage(title, rows, label, total) {
  if (!rows.length) return '';
  return `<section class="top-team-usage"><h4>${title}</h4><div class="top-team-chips">${rows
    .map(
      row =>
        `<span class="top-team-chip">${esc(label(row.id))} <span class="muted">${row.count}/${total}</span></span>`,
    )
    .join('')}</div></section>`;
}

// state: { data, error, season, substituted, wanted, seasons, format, limit }
export function renderTopTeams(state, pokemon, reference, locale) {
  const source = state.data?.source;
  const credit = source
    ? `<p class="top-team-source">자료: <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" lang="ja">${esc(source.name)}</a> 공개 데이터. 구축 기사 원문도 이 사이트에서 볼 수 있습니다 ↗</p>`
    : '';
  const heading = `<div class="category-heading"><h3>상위 파티</h3></div>`;
  if (!state.season)
    return `${heading}<div class="empty-state"><p>${formatLabel(state.format)} 상위 파티 자료가 없습니다.</p></div>${credit}`;
  const all = state.data.seasons[state.season][state.format];
  const teams = teamsWith(all.teams, pokemon, reference);
  const select = `<label class="top-team-season">시즌<select id="top-team-season">${state.seasons
    .map(
      season =>
        `<option value="${esc(season)}"${season === state.season ? ' selected' : ''}>${esc(seasonLabel(season))}</option>`,
    )
    .join('')}</select></label>`;
  const note = state.substituted
    ? `<p class="top-team-note">${esc(seasonLabel(state.wanted))} 시즌은 진행 중이라 최종 순위 파티가 아직 없습니다. 끝난 시즌 중 가장 최근인 ${esc(seasonLabel(state.season))} 시즌을 보여 줍니다.</p>`
    : '';
  const tip = `<p class="category-tip">${esc(seasonLabel(state.season))} ${formatLabel(state.format)} 최종 순위 상위 ${all.teams.length}개 파티 중 <strong>${teams.length}개</strong>가 채용했습니다. 구축 기사가 확인된 파티만 모은 자료라 전체 랭커 목록은 아닙니다.</p>`;
  if (!teams.length)
    return `${heading}${select}${note}${tip}<div class="empty-state"><p>이 시즌 상위 파티에서 채용한 기록이 없습니다.</p></div>${credit}`;
  const { items, mates } = topTeamUsage(teams, pokemon, reference);
  const itemLabel = id =>
    id === 'none' ? '도구 없음' : id === 'unknown' ? '미공개' : itemName(id, reference, locale);
  const shown = teams.slice(0, state.limit);
  return `${heading}${select}${note}${tip}
    ${usage('지닌 도구', items, itemLabel, teams.length)}
    ${usage('함께 채용된 포켓몬', mates.slice(0, 12), id => pokemonName(id, reference, locale), teams.length)}
    <div class="top-team-list">${shown
      .map(
        ({ rank, rating, team }) => `<article class="top-team">
      <header class="top-team-meta"><strong class="top-team-rank">최종 ${rank}위</strong><span>레이트 ${rating.toFixed(3)}</span></header>
      <ul class="top-team-party">${team.map(entry => member(entry, pokemon, reference, locale)).join('')}</ul>
    </article>`,
      )
      .join('')}</div>
    ${teams.length > shown.length ? `<button class="load-more" data-top-teams-more>파티 더 보기 (${shown.length}/${teams.length})</button>` : ''}
    ${credit}`;
}
