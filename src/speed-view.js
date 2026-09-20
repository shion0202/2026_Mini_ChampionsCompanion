import { esc } from './html.js';
import { portrait } from './app-view.js';
import { SPEED_PRESETS, speedGroups } from './speed.js';

const EMPTY = '<div class="empty-state"><p>조건에 맞는 포켓몬이 없습니다.</p></div>';

// 이름만 있으면 어떤 폼인지 바로 안 보인다. 랭킹과 같은 이미지를 쓴다.
const named = row => `${portrait(row, 'speed-portrait')}<span>${esc(row.label)}</span>`;

export function renderSpeedRows(rows, { mode = 'base' } = {}) {
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
  // 네 열은 모두 같은 종족값에서 나오므로 어느 열을 기준으로 정렬해도 순서가
  // 같다. 그래서 기준 열을 고르는 장치를 두지 않는다.
  // 표 위의 ‘N개 항목 표시’가 이미 무엇을 보고 있는지 알려주므로 설명을 더 두지
  // 않는다. 표 자체는 화면의 제목과 모드 버튼으로 맥락이 잡힌다.
  return `<div class="speed-table-wrap"><table class="speed-table">
    <thead><tr><th scope="col">포켓몬</th>${SPEED_PRESETS.map(
      p => `<th scope="col">${p.label}</th>`,
    ).join('')}</tr></thead>
    <tbody>${rows
      .map(
        row =>
          `<tr><th scope="row"><span class="speed-mon">${named(row)}</span><small>${row.base}족</small></th>${row.values
            .map(value => `<td>${value}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

// 실전 스피드 라인. 왼쪽에 실수치, 오른쪽에 그 값이 나오는 조건을 적는다.
// 상위 15위이며 스피드 종족값 70 이상인 줄만 색을 달리해 환경 기준선을 표시한다.
const speedEntry = line => {
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
    `<li class="speed-line">` +
    `<p class="speed-line-head">` +
    `<span class="speed-preset">${esc(line.preset)}</span>` +
    `<span class="speed-base">${line.base}족</span>${effect}</p>` +
    `<div class="speed-mon">${named(line)}${via}</div>` +
    `</li>`
  );
};

export function renderSpeedLines(lines) {
  if (!lines.length) return EMPTY;
  // 같은 실수치는 한 줄에 묶는다. 같은 스피드라는 사실이 이 화면에서 읽어내야 할
  // 것이라, 같은 숫자를 여러 번 적으면 오히려 서로 다른 값처럼 보인다.
  return `<ol class="speed-lines">${speedGroups(lines, 'value')
    .map(
      group =>
        `<li class="speed-group${group.rows.some(row => row.prominent) ? ' speed-prominent' : ''}">` +
        `<span class="speed-value">${group.value}</span>` +
        `<ul class="speed-group-items">${group.rows.map(speedEntry).join('')}</ul>` +
        `</li>`,
    )
    .join('')}</ol>`;
}
