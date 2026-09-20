import { TYPE_LABELS } from './locale.js';
import { defenseChart } from './reference.js';

const TYPES = Object.keys(TYPE_LABELS);
const validTypes = values => [...new Set(values)].filter(type => TYPES.includes(type)).slice(0, 2);
const badge = type =>
  `<span class="type-badge type-${type.toLowerCase()}">${TYPE_LABELS[type]}</span>`;

export function toggleDefenseType(selected, type) {
  const values = validTypes(selected);
  if (!TYPES.includes(type)) return values;
  if (values.includes(type)) return values.filter(value => value !== type);
  return values.length < 2 ? [...values, type] : values;
}

export function defenseRows(selected, chart) {
  const values = validTypes(selected);
  if (!values.length) return [];
  const multipliers = defenseChart(values, chart);
  return TYPES.map(type => ({ type, value: multipliers[type] })).sort((a, b) => b.value - a.value);
}

export function renderTypeDefense(selected, chart) {
  const values = validTypes(selected);
  const buttons = TYPES.map(type => {
    const chosen = values.includes(type);
    return (
      `<button type="button" data-defense-type="${type}" aria-pressed="${chosen}"` +
      ` aria-label="${TYPE_LABELS[type]} 타입${chosen ? ' 선택 해제' : ' 선택'}"${!chosen && values.length === 2 ? ' disabled' : ''}>` +
      `${badge(type)}<span class="type-selection-mark" aria-hidden="true">${chosen ? '✓' : '+'}</span></button>`
    );
  }).join('');
  const rows = defenseRows(values, chart);
  const group = (title, matches) =>
    `<section class="type-defense-group"><h3>${title}</h3><div class="matchup-group">` +
    (rows
      .filter(matches)
      .map(
        ({ type, value }) =>
          `<div class="matchup"><div class="matchup-base">${badge(type)}<b>×${value}</b></div></div>`,
      )
      .join('') || '<span class="muted">없음</span>') +
    '</div></section>';
  return (
    `<div class="type-picker-heading"><h3>방어 타입 선택 <span class="muted">${values.length}/2</span></h3>` +
    `<button class="text-button" data-clear-defense${values.length ? '' : ' disabled'}>초기화</button></div>` +
    '<p class="type-picker-help">타입을 1개 또는 2개 선택하세요. 선택한 타입을 다시 누르면 해제됩니다.</p>' +
    `<div class="type-picker" role="group" aria-label="방어 타입 (최대 2개)">${buttons}</div>` +
    `<div class="type-defense-result" aria-live="polite">${
      values.length
        ? `<div class="selected-defense-types">${values.map(badge).join('<span aria-hidden="true">+</span>')}<span>방어 상성</span></div>` +
          group('약점', row => row.value > 1) +
          group('반감', row => row.value > 0 && row.value < 1) +
          group('무효', row => row.value === 0) +
          `<details class="neutral-types"><summary>1배 상성 보기 (${rows.filter(row => row.value === 1).length}종)</summary>${group('1배', row => row.value === 1)}</details>`
        : '<div class="empty-state">방어 타입을 선택하면 받는 데미지의 배율을 확인할 수 있습니다.</div>'
    }</div>`
  );
}

export function renderTypeMatrix(chart) {
  const row = attack =>
    `<tr><th scope="row">${badge(attack)}</th>` +
    TYPES.map(defense => {
      const value = chart[defense][attack];
      const tone = value > 1 ? 'weak' : value === 0 ? 'immune' : value < 1 ? 'resist' : 'neutral';
      return `<td class="type-cell-${tone}" aria-label="${TYPE_LABELS[attack]} 공격 → ${TYPE_LABELS[defense]} 방어: ${value}배">×${value}</td>`;
    }).join('') +
    '</tr>';
  return (
    '<p class="type-picker-help">세로는 공격 타입, 가로는 방어 타입입니다. 표를 좌우로 밀어 모든 타입을 확인하세요.</p>' +
    '<div class="type-matrix-scroll" tabindex="0" role="region" aria-label="18종 타입 상성표 (가로·세로 스크롤)">' +
    '<table class="type-matrix"><caption>단일 타입 상성표. 행은 공격, 열은 방어, 값은 데미지 배율입니다.</caption>' +
    '<thead><tr><th scope="col" class="type-matrix-corner">방어 →<br>공격 ↓</th>' +
    TYPES.map(type => `<th scope="col">${badge(type)}</th>`).join('') +
    '</tr></thead><tbody>' +
    TYPES.map(row).join('') +
    '</tbody></table></div>'
  );
}
