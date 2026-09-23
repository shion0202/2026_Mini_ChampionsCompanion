import { STAT_LABELS, percentageText, toId, matchesQuery } from './data.js';
import { TYPE_LABELS } from './locale.js';
import {
  STAT_KEYS,
  POINT_LETTERS,
  statRanges,
  defenseComparisons,
  groupSpreads,
} from './reference.js';
import { itemArtwork } from './images.js';
import { MOVE_TRAITS } from './move-traits.js';
import { matchesFilter, filterSummary } from './filters.js';
import { esc } from './html.js';
const label = (data, locale, kind, key) =>
  data[kind]?.[key]?.label || locale.label(kind, data[kind]?.[key]?.name ?? key);
const types = values =>
  values
    .map(t => `<span class="type-badge type-${toId(t)}">${TYPE_LABELS[t] ?? esc(t)}</span>`)
    .join('');
export const effectButton = (kind, id, name) =>
  `<button class="effect-link" data-effect-type="${esc(kind)}" data-effect-id="${esc(id)}"` +
  ` aria-label="${esc(name)} 효과 보기">${esc(name)}</button>`;
export const FILTER_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"' +
  ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>';
export const percentClass = value => (value !== null && value >= 10 ? ' percentage-prominent' : '');
export function renderReference(data, locale, pokemon, formId, mode) {
  const base = data.species[pokemon.id];
  if (!base) return '<div class="empty-state">이 포켓몬의 도감 자료가 아직 없습니다.</div>';
  const forms = [pokemon.id, ...base.megas.filter(id => data.species[id])];
  const selected = forms.includes(formId) ? formId : pokemon.id;
  const entry = data.species[selected];
  const name = locale.pokemon(entry.name).label;
  const comparisons = defenseComparisons(entry.types, data.types, entry.abilities);
  const ranges = statRanges(entry.stats);
  const groupFor = row =>
    row.value > 1
      ? 'weak'
      : row.value > 0 && row.value < 1
        ? 'resist'
        : row.value === 0
          ? 'immune'
          : row.alternatives.some(a => a.value > 1)
            ? 'weak'
            : row.alternatives.some(a => a.value > 0 && a.value < 1)
              ? 'resist'
              : row.alternatives.length
                ? 'immune'
                : 'neutral';
  const alternative = a =>
    `<div class="matchup-alternative" data-matchup-ability="${a.ability}">` +
    `${effectButton('ability', a.ability, label(data, locale, 'ability', a.ability))}` +
    `<b>×${a.value}</b></div>`;
  const matchups = group =>
    comparisons
      .filter(row => groupFor(row) === group)
      .map(
        ({ type, value, alternatives }) =>
          `<div class="matchup" data-matchup-type="${type}">` +
          `<div class="matchup-base">${types([type])}<b>×${value}</b></div>` +
          alternatives.map(alternative).join('') +
          `</div>`,
      )
      .join('') || '<span class="muted">없음</span>';
  const formSwitch =
    forms.length > 1
      ? `<div class="form-switch" role="group" aria-label="도감 폼">` +
        forms
          .map(
            id =>
              `<button data-form="${id}" aria-pressed="${selected === id}">` +
              `${esc(locale.pokemon(data.species[id].name).label)}</button>`,
          )
          .join('') +
        `</div>`
      : '';
  const dimension = (value, unit) =>
    `<strong>${value ?? '미제공'}${value === null ? '' : ` ${unit}`}</strong>`;
  const abilityButtons = entry.abilities
    .map(name => effectButton('ability', toId(name), label(data, locale, 'ability', toId(name))))
    .join('');
  const statToggle =
    `<div class="segmented" role="group" aria-label="능력치 표시">` +
    `<button data-stat-mode="base" aria-pressed="${mode !== 'actual'}">종족값</button>` +
    `<button data-stat-mode="actual" aria-pressed="${mode === 'actual'}">실수치</button></div>`;
  const actualStats =
    `<div class="spread-table-wrap"><table class="spread-table actual-stats">` +
    `<thead><tr><th>능력치</th><th>최대</th><th>+32</th><th>+0</th><th>최소</th></tr></thead><tbody>` +
    STAT_KEYS.map(
      (key, i) =>
        `<tr><th>${STAT_LABELS[i]}</th>${ranges[key].map(n => `<td>${n}</td>`).join('')}</tr>`,
    ).join('') +
    `</tbody></table></div>` +
    `<p class="category-tip">최대는 +32와 상승 보정, 최소는 +0과 하락 보정을 적용합니다.` +
    ` +32와 +0은 무보정입니다.<br>특성, 도구, 랭크 변화는 제외한 개별 능력치 범위입니다.</p>`;
  const baseStats =
    `<div class="base-stats">` +
    STAT_KEYS.map(
      (key, i) =>
        `<div><span>${STAT_LABELS[i]}</span><div class="base-stat-track">` +
        `<span style="width:${(entry.stats[key] / 255) * 100}%"></span>` +
        `<b>${entry.stats[key]}</b></div></div>`,
    ).join('') +
    `<div class="stat-total"><span>합계</span>` +
    `<strong>${Object.values(entry.stats).reduce((a, b) => a + b, 0)}</strong></div></div>`;
  const matchupGroups =
    `<div class="matchup-group"><h5>약점</h5>${matchups('weak')}</div>` +
    `<div class="matchup-group"><h5>반감</h5>${matchups('resist')}</div>` +
    `<div class="matchup-group"><h5>무효</h5>${matchups('immune')}</div>` +
    `<details class="neutral-types"><summary>1배 상성 보기</summary>` +
    `<div class="matchup-group">${matchups('neutral')}</div></details>`;
  return `<div class="category-heading"><h3>기본 정보</h3><span>배틀 도감</span></div>
    ${formSwitch}
    <section class="reference-block"><div class="reference-heading"><h4>${esc(name)}</h4><span class="type-list">${types(entry.types)}</span></div>
    <div class="dimensions"><span>키 ${dimension(entry.height, 'm')}</span><span>몸무게 ${dimension(entry.weight, 'kg')}</span></div>
    </section><section class="reference-block"><div class="reference-abilities"><h4>특성</h4>${abilityButtons}</div></section>
    <section class="reference-block"><div class="section-title"><h4>능력치</h4>${statToggle}</div>
    ${mode === 'actual' ? actualStats : baseStats}</section>
    <section class="reference-block"><h4 class="reference-section">방어상성</h4>
    ${comparisons.some(row => row.alternatives.length) ? '<p class="category-tip">특성으로 달라지는 배율은 타입 배율 아래에 함께 표시합니다.</p>' : ''}
    ${matchupGroups}</section>
    <p class="category-tip">폼 전환은 도감에서만 적용되며, 통계는 ${esc(pokemon.label)} 기준입니다.</p>`;
}
export const CATEGORY_NAMES = { Physical: '물리', Special: '특수', Status: '변화' };
// Borrowed descriptions name the game they came from. The keys are the version
// identifiers the build records; downloadable content is shown as its base game.
export const GAME_LABELS = {
  'x-y': 'X·Y',
  'omega-ruby-alpha-sapphire': '오메가루비·알파사파이어',
  'sun-moon': '썬·문',
  'ultra-sun-ultra-moon': '울트라썬·울트라문',
  'lets-go-pikachu-lets-go-eevee': '레츠고! 피카츄·이브이',
  'sword-shield': '소드·실드',
  'the-isle-of-armor': '소드·실드',
  'the-crown-tundra': '소드·실드',
  'brilliant-diamond-shining-pearl': '브릴리언트다이아몬드·샤이닝펄',
  'legends-arceus': '레전드 아르세우스',
  'scarlet-violet': '스칼렛·바이올렛',
  'the-teal-mask': '스칼렛·바이올렛',
  'the-indigo-disk': '스칼렛·바이올렛',
  'legends-za': '레전드 Z-A',
  'mega-dimension': '레전드 Z-A',
};
export function renderLearnsetShell(
  data,
  pokemon,
  query = '',
  type = '',
  category = '',
  trait = '',
  modes = {},
) {
  const entry = data.species[pokemon.id];
  if (!entry?.learnset)
    return (
      '<div class="empty-state"><h3>챔피언스 기술 목록 미제공</h3>' +
      '<p>현재 출처에 이 폼의 기술 목록이 없습니다. 다른 게임의 기술로 대체하지 않았습니다.</p></div>'
    );
  const summaries = [
    filterSummary(type, TYPE_LABELS, modes.type),
    filterSummary(category, CATEGORY_NAMES, modes.category),
    filterSummary(trait, MOVE_TRAITS, modes.trait),
  ].filter(Boolean);
  const count = summaries.length;
  const filterButton =
    `<button id="learnset-filter" class="filter-button"` +
    ` aria-label="배우는 기술 필터${count ? ` (${count}개 적용)` : ''}" aria-haspopup="dialog">` +
    `${FILTER_ICON}${count ? `<span class="filter-badge">${count}</span>` : ''}</button>`;
  return (
    `<div class="category-heading"><h3>배우는 기술</h3><span id="learnset-count"></span></div>` +
    `<div class="learnset-controls">` +
    `<input type="search" id="learnset-search" aria-label="배우는 기술 검색"` +
    ` placeholder="기술 이름, 초성 검색" value="${esc(query)}">` +
    `${filterButton}</div>` +
    `${count ? `<p class="active-filter-summary">${summaries.map(esc).join(' / ')}</p>` : ''}` +
    `<div id="learnset-rows"></div>`
  );
}
// Shared by a Pokemon's learnset and the standalone move index, so both lists
// filter, sort and render identically.
export function selectMoves(data, locale, ids, { query, type, category, trait = '', modes = {} }) {
  return ids
    .map(id => ({ id, ...data.move[id] }))
    .filter(
      m =>
        m.name &&
        matchesQuery({ name: m.name, label: label(data, locale, 'move', m.id) }, query) &&
        matchesFilter(type, t => m.type === t, modes.type) &&
        matchesFilter(category, c => m.category === c, modes.category) &&
        matchesFilter(trait, t => m.traits?.includes(t), modes.trait),
    )
    .sort((a, b) =>
      label(data, locale, 'move', a.id).localeCompare(label(data, locale, 'move', b.id), 'ko'),
    );
}
export function moveTable(data, locale, moves) {
  const moveRow = m =>
    `<tr><td>${effectButton('move', m.id, label(data, locale, 'move', m.id))}` +
    `<div>${types([m.type])}</div></td>` +
    `<td>${CATEGORY_NAMES[m.category]}</td><td>${m.power || '—'}</td>` +
    `<td>${m.accuracy === true ? '—' : m.accuracy}</td><td>${m.pp}</td></tr>`;
  return (
    `<div class="move-table-wrap"><table class="move-table"><thead><tr>` +
    `<th>기술 / 타입</th><th>분류</th><th>위력</th><th>명중</th><th>PP</th>` +
    `</tr></thead><tbody>${moves.map(moveRow).join('')}</tbody></table></div>`
  );
}
export function renderLearnsetRows(
  data,
  locale,
  pokemon,
  query,
  type,
  category,
  trait = '',
  modes = {},
) {
  const ids = data.species[pokemon.id]?.learnset ?? [];
  const moves = selectMoves(data, locale, ids, { query, type, category, trait, modes });
  return {
    count: moves.length,
    html: moves.length
      ? moveTable(data, locale, moves)
      : '<div class="empty-state">조건에 맞는 기술이 없습니다.</div>',
  };
}
export function renderEffect(data, locale, kind, key) {
  const record = data?.[kind]?.[key];
  if (!record)
    return {
      title: locale?.label(kind, key) ?? key,
      html: '<p>현재 데이터에 이 항목의 효과 설명이 없습니다.</p>',
    };
  const name = label(data, locale, kind, key);
  const metrics =
    kind === 'move'
      ? `<div class="effect-metrics">${types([record.type])}` +
        `<span>${CATEGORY_NAMES[record.category]}</span>` +
        `<span>위력 ${record.power || '—'}</span>` +
        `<span>명중 ${record.accuracy === true ? '필중' : record.accuracy + '%'}</span>` +
        `<span>PP ${record.pp}</span>` +
        `<span>우선도 ${record.priority > 0 ? '+' : ''}${record.priority}</span></div>`
      : '';
  const japanese = record.japanese || locale.japanese?.(kind, record.name);
  const effectVersion = GAME_LABELS[record.effectVersion] ?? record.effectVersion;
  const names = `<div class="effect-names"><span lang="en">${esc(record.name)}</span>${japanese ? `<span lang="ja">${esc(japanese)}</span>` : ''}</div>`;
  const traits =
    kind === 'move' && record.traits?.length
      ? `<div class="move-traits" aria-label="기술 성질">${record.traits.map(t => `<span>${esc(MOVE_TRAITS[t] ?? t)}</span>`).join('')}</div>`
      : '';
  const note = [
    record.champions === false ? '챔피언스 미수록 항목입니다.' : '',
    effectVersion ? `(다른 작품의 설명: ${effectVersion})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    title: name,
    heading: `${kind === 'held_item' ? `<div class="effect-item-art">${itemArtwork(record.name)}</div>` : ''}<h2 id="effect-title">${esc(name)}</h2>${names}`,
    html: `${metrics}${traits}<p class="effect-description">${esc(record.effect ?? '한국어 효과 설명을 아직 확보하지 못했습니다.')}</p>${note ? `<p class="category-tip">${esc(note)}</p>` : ''}`,
  };
}
export function renderSpreads(rows, mode) {
  rows = rows.filter(r => r.rank <= 20);
  const spreadRow = r =>
    `<tr><th>${r.rank}</th>` +
    r.points
      .map(n => `<td class="${n === 32 ? 'max-point' : n === 0 ? 'zero-point' : ''}">${n}</td>`)
      .join('') +
    `<td><span class="${percentClass(r.percent)}">${percentageText(r.percent)}</span></td></tr>`;
  const table = items =>
    `<div class="spread-table-wrap"><table class="spread-table"><thead><tr><th>순위</th>` +
    STAT_LABELS.map(s => `<th>${s}</th>`).join('') +
    `<th>채용률</th></tr></thead><tbody>` +
    items.map(spreadRow).join('') +
    `</tbody></table></div>`;
  const switches =
    `<div class="segmented spread-mode" role="group" aria-label="능력 포인트 표시">` +
    `<button data-spread-mode="grouped" aria-pressed="${mode === 'grouped'}">합산</button>` +
    `<button data-spread-mode="individual" aria-pressed="${mode !== 'grouped'}">원본</button></div>`;
  if (mode !== 'grouped')
    return (
      switches +
      table(rows) +
      '<p class="category-tip">HP, 공격, 방어, 특수공격, 특수방어, 스피드 순서입니다.</p>'
    );
  const pointTags = g => {
    if (g.rows.length === 1)
      return g.rows[0].points
        .map((value, i) => ({ letter: POINT_LETTERS[i], value }))
        .filter(p => p.value)
        .map(p => `<span>${p.letter} ${p.value}</span>`)
        .join('');
    // 합산한 묶음은 배분마다 값이 달라 한 숫자로 적을 수 없다. 실제 범위를 적는다.
    return g.major
      .split('')
      .map(letter => {
        const values = g.rows.map(r => r.points[POINT_LETTERS.indexOf(letter)]);
        const low = Math.min(...values);
        const high = Math.max(...values);
        return `<span>${letter} ${low === high ? low : `${low}~${high}`}</span>`;
      })
      .join('');
  };
  const group = g =>
    `<details><summary><strong>${g.label}</strong>` +
    `<span class="${percentClass(g.percent)}">${percentageText(g.percent)}</span>` +
    `<small>${g.rows.length > 1 ? `${g.rows.length}개 배분 합산` : '개별 배분'} — 상세 보기</small>` +
    `</summary><p class="point-tags">${pointTags(g)}</p>${table(g.rows)}</details>`;
  return (
    switches +
    `<div class="spread-groups">${groupSpreads(rows).map(group).join('')}</div>` +
    `<p class="category-tip grouping-rule">제공된 상위 배분 중 주요 투자 능력치가 같은 배분을 합산합니다.` +
    ` 10포인트 이상은 대문자로 주요 투자, 3~9포인트는 소문자로 소량 조정이며, 2포인트 이하는 이름에서 뺍니다.</p>`
  );
}
