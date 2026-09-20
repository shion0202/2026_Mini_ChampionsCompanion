import { esc } from './html.js';
import { portrait } from './app-view.js';
import { SPEED_PRESETS, speedGroups } from './speed.js';

const EMPTY = '<div class="empty-state"><p>조건에 맞는 포켓몬이 없습니다.</p></div>';

// 이름만 있으면 어떤 폼인지 바로 안 보인다. 랭킹과 같은 이미지를 쓴다.
const named = row => `${portrait(row, 'speed-portrait')}<span>${esc(row.label)}</span>`;

export function renderSpeedRows(rows, { mode = 'base', preset = 0, ascending = false } = {}) {
  if (!rows.length) return EMPTY;
  if (mode === 'base')
    return `<div class="speed-tiers">${speedGroups(rows)
      .map(
        group =>
          `<section class="speed-tier"><h3>${group.value}<span>족</span></h3><ul>${group.rows
            .map(row => `<li class="speed-mon">${named(row)}</li>`)
            .join('')}</ul></section>`,
      )
      .join('')}</div>`;
  return `<div class="speed-table-wrap"><table class="speed-table">
    <caption>Lv.50 스피드 실수치 비교</caption>
    <thead><tr><th scope="col">포켓몬</th>${SPEED_PRESETS.map(
      (p, i) =>
        `<th scope="col"${i === preset ? ` class="speed-selected" aria-sort="${ascending ? 'ascending' : 'descending'}"` : ''}>${p.label}</th>`,
    ).join('')}</tr></thead>
    <tbody>${rows
      .map(
        row =>
          `<tr><th scope="row"><span class="speed-mon">${named(row)}</span><small>${row.base}족</small></th>${row.values
            .map((value, i) => `<td${i === preset ? ' class="speed-selected"' : ''}>${value}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

// 실전 스피드 라인. 왼쪽에 실수치, 오른쪽에 그 값이 나오는 조건을 적는다.
// 상위 15위이며 스피드 종족값 70 이상인 줄만 색을 달리해 환경 기준선을 표시한다.
export function renderSpeedLines(lines) {
  if (!lines.length) return EMPTY;
  return `<ol class="speed-lines">${lines
    .map(line => {
      const percent =
        line.percent === null ? '' : ` <small class="speed-percent">${line.percent}%</small>`;
      const effect = line.effect
        ? `<span class="speed-effect">${esc(line.effect)}</span>`
        : '<span class="speed-effect speed-plain">효과 미적용</span>';
      const via = line.effectName
        ? `<small class="speed-via">${esc(line.effectName)}` +
          `${line.effectNote ? ` · ${esc(line.effectNote)}` : ''}${percent}</small>`
        : '';
      return (
        `<li class="speed-line${line.prominent ? ' speed-prominent' : ''}">` +
        `<span class="speed-value">${line.value}</span>` +
        `<div class="speed-line-body">` +
        `<p class="speed-line-head">` +
        `<span class="speed-preset">${esc(line.preset)}</span>` +
        `<span class="speed-base">${line.base}족</span>${effect}</p>` +
        `<div class="speed-mon">${named(line)}${via}</div>` +
        `</div></li>`
      );
    })
    .join('')}</ol>`;
}
