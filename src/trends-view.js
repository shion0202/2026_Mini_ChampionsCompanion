// 사용률 추이 그래프. SVG 문자열만 만든다. 배선은 app.js가 한다.
import { esc } from './html.js';

// 줄마다 다른 색. 황금각으로 색상환을 돌면 이웃한 줄끼리 색이 멀어진다.
export const lineColor = i => `hsl(${Math.round((i * 137.508) % 360)} 68% 50%)`;

const ROW = 30;
const TOP = 16;
const SIDE = 78;
const ICON = 26;
const MIN_COL = 46;

// 이어진 구간마다 선을 끊어 그린다. 순위 밖(null)이면 선이 끊긴다. 작은 그래프가 쓴다.
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

const icon = (sprite, color, cx, cy, size = ICON) =>
  sprite
    ? `<image href="${esc(sprite)}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" />`
    : `<circle cx="${cx}" cy="${cy}" r="6" fill="${color}" />`;

// 선의 꼭짓점. 한계 안이면 그 순위다. 한계 밖(outside)에서 들어오거나 나가는 선은 그래프
// 아래(below)로 빠지는데, 열 한가운데가 아니라 두 열 사이 중간에서 빠진다. 한 열로
// 모이면 들고 나는 선들이 한 점에 뭉친다. 한계 밖끼리는 잇지 않는다.
function linePath(s, x, y, below) {
  const commands = [];
  let open = false;
  for (let i = 1; i < s.ranks.length; i++) {
    const [was, now] = [s.ranks[i - 1], s.ranks[i]];
    const middle = (x(i - 1) + x(i)) / 2;
    const from =
      was !== null
        ? [x(i - 1), y(was)]
        : s.outside?.[i - 1] && now !== null
          ? [middle, below]
          : null;
    const to =
      now !== null ? [x(i), y(now)] : s.outside?.[i] && was !== null ? [middle, below] : null;
    if (!from || !to) {
      open = false;
      continue;
    }
    if (!open || was === null) commands.push(`M${from[0]},${from[1]}`);
    commands.push(`L${to[0]},${to[1]}`);
    // 아래로 빠진 선은 거기서 끝난다. 다음 구간은 새로 시작한다.
    open = now !== null;
  }
  return commands.join(' ');
}

// 순위표 그래프. 위가 1위다. 양 끝에 순위 번호와 그 순위의 포켓몬 그림을 두고, 중간에
// 처음 들어온 포켓몬도 그 자리에 그림을 둔다. 100위 밖에서 들어온 선은 그래프 아래에서
// 올라오고, 처음 나온 포켓몬은 점에서 시작한다. 폭(width)이 주어지면 열 간격을 늘려
// 왼쪽 끝에서 오른쪽 끝까지 채운다. 선이나 그림을 누르면 그 포켓몬만 강조한다
// (app.js가 data-trend로 찾는다).
export function rankChart(points, series, { label, sprite, limit, width: available = 0 }) {
  if (!points.length || !series.length)
    return '<div class="empty-state"><p>그릴 자료가 없습니다.</p></div>';
  const n = points.length;
  const col = n > 1 ? Math.max(MIN_COL, (available - SIDE * 2) / (n - 1)) : 0;
  const width = n > 1 ? SIDE * 2 + col * (n - 1) : Math.max(available, SIDE * 2 + MIN_COL);
  const below = TOP + ROW * limit;
  const height = below + 56;
  const x = i => (n === 1 ? width / 2 : SIDE + i * col);
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
          `<line class="trend-grid" x1="${x(0)}" x2="${x(n - 1)}" y1="${y(r)}" y2="${y(r)}" />` +
          `<text class="trend-rank" x="8" y="${y(r) + 4}">${r}</text>` +
          `<text class="trend-rank" x="${width - 8}" y="${y(r) + 4}" text-anchor="end">${r}</text>`,
      )
      .join('') +
    // 100위 아래는 순위 밖이다. 들어오고 나가는 선이 이 띠를 지난다.
    `<text class="trend-rank" x="8" y="${below + 4}">밖</text>` +
    `<text class="trend-rank" x="${width - 8}" y="${below + 4}" text-anchor="end">밖</text>`;
  const rotate = n > 8 && col < 70;
  const labelY = below + 30;
  const xLabels = points
    .map(
      (p, i) =>
        `<text class="trend-x" x="${x(i)}" y="${labelY}" text-anchor="${rotate ? 'end' : 'middle'}"` +
        `${rotate ? ` transform="rotate(-45 ${x(i)} ${labelY})"` : ''}>${esc(p.label)}</text>`,
    )
    .join('');
  const lines = [];
  const icons = [];
  series.forEach((s, index) => {
    const color = lineColor(index);
    const art = sprite(s.name);
    const title = `<title>${esc(label(s.name))}</title>`;
    const marks = [];
    s.ranks.forEach((rank, i) => {
      if (rank === null) return;
      const entering = i > 0 && s.ranks[i - 1] === null;
      const alone =
        (i === 0 || s.ranks[i - 1] === null) && (i === n - 1 || s.ranks[i + 1] === null);
      // 처음 나온 포켓몬은 점에서 시작한다. 이어질 선이 없는 외톨이 점도 찍는다.
      if (
        (entering && !s.outside?.[i - 1]) ||
        (alone && !s.outside?.[i - 1] && !s.outside?.[i + 1])
      )
        marks.push(`<circle cx="${x(i)}" cy="${y(rank)}" r="3.5" fill="${color}" />`);
      if (i === 0) marks.push(icon(art, color, SIDE - 20, y(rank)));
      else if (i === n - 1 && n > 1) marks.push(icon(art, color, x(i) + 20, y(rank)));
      // 중간에 들어온 포켓몬은 들어온 자리에 그림을 둔다. 누구인지 알 수 있게.
      if (entering && i !== n - 1) marks.push(icon(art, color, x(i), y(rank) - ICON / 2 - 2, 22));
    });
    lines.push(
      `<g class="trend-line" data-trend="${esc(s.name)}" style="--line:${color}">${title}` +
        `<path d="${linePath(s, x, y, below)}" stroke="${color}" /></g>`,
    );
    // 그림은 모든 선 위에 그린다. 선 아래에 묻히면 누구인지 보이지 않는다.
    icons.push(
      `<g class="trend-line trend-icons" data-trend="${esc(s.name)}">${title}${marks.join('')}</g>`,
    );
  });
  return (
    `<div class="trend-chart-wrap"><svg class="trend-chart" width="${width}" height="${height}"` +
    ` viewBox="0 0 ${width} ${height}" role="img" aria-label="포켓몬 순위 추이">` +
    `${grid}${lines.join('')}${icons.join('')}${xLabels}</svg></div>`
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
