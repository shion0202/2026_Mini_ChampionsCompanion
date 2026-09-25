// 사용률 추이 그래프. SVG 문자열만 만든다. 배선은 app.js가 한다.
import { esc } from './html.js';

// 줄마다 다른 색. 황금각으로 색상환을 돌면 이웃한 줄끼리 색이 멀어진다.
export const lineColor = i => `hsl(${Math.round((i * 137.508) % 360)} 68% 50%)`;

const ROW = 30;
const TOP = 16;
const BOTTOM = 52;
const SIDE = 78;
const ICON = 26;

// 이어진 구간마다 선을 끊어 그린다. 순위 밖(null)이면 선이 끊긴다.
function segments(ranks, x, y) {
  const parts = [];
  let current = [];
  ranks.forEach((rank, i) => {
    if (rank === null) {
      if (current.length) parts.push(current);
      current = [];
    } else current.push([x(i), y(rank)]);
  });
  if (current.length) parts.push(current);
  return parts;
}

const endIcon = (sprite, color, cx, cy) =>
  sprite
    ? `<image href="${esc(sprite)}" x="${cx - ICON / 2}" y="${cy - ICON / 2}" width="${ICON}" height="${ICON}" />`
    : `<circle cx="${cx}" cy="${cy}" r="6" fill="${color}" />`;

// 순위표 그래프. 위가 1위다. 양 끝에 순위 번호와 그 순위의 포켓몬 그림을 둔다.
// 줄이나 그림을 누르면 그 포켓몬만 강조한다(app.js가 data-trend로 찾는다).
export function rankChart(points, series, { label, sprite, limit }) {
  if (!points.length || !series.length)
    return '<div class="empty-state"><p>그릴 자료가 없습니다.</p></div>';
  const n = points.length;
  const col = n <= 8 ? 110 : 46;
  const width = SIDE * 2 + col * Math.max(n - 1, 1);
  const height = TOP + ROW * (limit - 1) + BOTTOM;
  const x = i => SIDE + (n === 1 ? col / 2 : i * col);
  const y = rank => TOP + (rank - 1) * ROW;
  const ranks = Array.from({ length: limit }, (_, i) => i + 1);
  const grid =
    points
      .map(
        (_, i) =>
          `<line class="trend-grid" x1="${x(i)}" x2="${x(i)}" y1="${TOP}" y2="${y(limit)}" />`,
      )
      .join('') +
    ranks
      .map(
        r =>
          `<line class="trend-grid" x1="${SIDE}" x2="${x(n - 1)}" y1="${y(r)}" y2="${y(r)}" />` +
          `<text class="trend-rank" x="8" y="${y(r) + 4}">${r}</text>` +
          `<text class="trend-rank" x="${width - 8}" y="${y(r) + 4}" text-anchor="end">${r}</text>`,
      )
      .join('');
  const rotate = n > 8;
  const xLabels = points
    .map(
      (p, i) =>
        `<text class="trend-x" x="${x(i)}" y="${y(limit) + 22}" text-anchor="${rotate ? 'end' : 'middle'}"` +
        `${rotate ? ` transform="rotate(-45 ${x(i)} ${y(limit) + 22})"` : ''}>${esc(p.label)}</text>`,
    )
    .join('');
  const lines = series
    .map((s, i) => {
      const color = lineColor(i);
      const parts = segments(s.ranks, x, y);
      const paths = parts
        .map(part =>
          part.length === 1
            ? `<circle cx="${part[0][0]}" cy="${part[0][1]}" r="3.5" fill="${color}" />`
            : `<polyline points="${part.map(([px, py]) => `${px},${py}`).join(' ')}" stroke="${color}" />`,
        )
        .join('');
      const first = s.ranks[0];
      const last = s.ranks[n - 1];
      const art = sprite(s.name);
      const icons =
        (first !== null ? endIcon(art, color, SIDE - 20, y(first)) : '') +
        (last !== null && n > 1 ? endIcon(art, color, x(n - 1) + 20, y(last)) : '');
      return (
        `<g class="trend-line" data-trend="${esc(s.name)}" style="--line:${color}">` +
        `<title>${esc(label(s.name))}</title>${paths}${icons}</g>`
      );
    })
    .join('');
  return (
    `<div class="trend-chart-wrap"><svg class="trend-chart" width="${width}" height="${height}"` +
    ` viewBox="0 0 ${width} ${height}" role="img" aria-label="포켓몬 순위 추이">` +
    `${grid}${lines}${xLabels}</svg></div>`
  );
}

// 포켓몬 하나의 순위 추이. 순위가 좋을수록 위다. 점마다 순위를 적고, 순위에
// 없던 때는 ‘순위 밖’으로 적는다.
export function miniRankChart(points, ranks) {
  const known = ranks.filter(r => r !== null);
  if (!known.length) return '<p class="trend-none">이 기간에는 순위 기록이 없습니다.</p>';
  const width = 320;
  const height = 150;
  const pad = { left: 24, right: 24, top: 24, bottom: 34 };
  const low = Math.min(...known);
  const high = Math.max(...known);
  const span = Math.max(high - low, 1);
  const n = points.length;
  const x = i => (n === 1 ? width / 2 : pad.left + (i * (width - pad.left - pad.right)) / (n - 1));
  const y = rank =>
    known.length === 1 || high === low
      ? (pad.top + height - pad.bottom) / 2
      : pad.top + ((rank - low) * (height - pad.top - pad.bottom)) / span;
  const parts = segments(ranks, x, y);
  const lines = parts
    .filter(part => part.length > 1)
    .map(part => `<polyline points="${part.map(([px, py]) => `${px},${py}`).join(' ')}" />`)
    .join('');
  // 점이 많으면(현재 시즌) 순위 글자가 겹친다. 처음·끝과, 최고·최저 순위가 처음
  // 나온 곳만 적는다. 순위가 줄곧 같으면 모든 점이 최고라 전부 적게 된다.
  const firstAt = rank => ranks.indexOf(rank);
  const best = firstAt(Math.min(...known));
  const worst = firstAt(Math.max(...known));
  const lastKnown = ranks.findLastIndex(r => r !== null);
  const labelled = (rank, i) =>
    n <= 8 ||
    i === ranks.findIndex(r => r !== null) ||
    i === lastKnown ||
    i === best ||
    i === worst;
  const dots = ranks
    .map((rank, i) =>
      rank === null
        ? `<text class="trend-out" x="${x(i)}" y="${height - pad.bottom - 2}" text-anchor="middle">순위 밖</text>`
        : `<circle cx="${x(i)}" cy="${y(rank)}" r="3.5" />` +
          (labelled(rank, i)
            ? `<text class="trend-value" x="${x(i)}" y="${y(rank) - 8}" text-anchor="middle">${rank}위</text>`
            : ''),
    )
    .join('');
  const every = n > 8 ? Math.ceil(n / 6) : 1;
  const xLabels = points
    .map((p, i) =>
      i % every === 0 || i === n - 1
        ? `<text class="trend-x" x="${x(i)}" y="${height - 10}" text-anchor="middle">${esc(p.label)}</text>`
        : '',
    )
    .join('');
  return (
    `<svg class="trend-mini" viewBox="0 0 ${width} ${height}" role="img" aria-label="순위 추이">` +
    `${lines}${dots}${xLabels}</svg>`
  );
}

// 랭킹 상세의 ‘추이’ 탭. sections는 [{ scope, title, points, ranks | null(불러오는 중) }].
export const pokemonTrendView = sections =>
  `<div class="category-heading"><h3>순위 추이</h3></div>` +
  sections
    .map(
      s =>
        `<section class="trend-section"><h4>${esc(s.title)}</h4>` +
        `${
          s.ranks === null
            ? '<p class="trend-none">불러오는 중입니다.</p>'
            : s.points.length
              ? miniRankChart(s.points, s.ranks)
              : '<p class="trend-none">자료가 없습니다.</p>'
        }</section>`,
    )
    .join('') +
  `<p class="category-tip">레귤레이션은 마지막 시즌의 최종일, 시즌은 최종일 순위입니다. 통계는 순위만 제공하며 사용률 %는 없습니다.</p>`;
