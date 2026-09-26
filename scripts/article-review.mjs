// 검토 화면(scripts/review-articles.mjs)의 판단 부분. 네트워크와 파일을 쓰지 않는
// 순수 함수만 두어 테스트로 고정한다.
import { reviewedArticles } from '../src/articles.js';
import { articleKey, isBlogTop } from './article-parse.mjs';

// 챔피언스에 나오는 포켓몬(기술 목록이 있는 것)만 고를 수 있게 한다. 이름이 겹치면
// 키를 붙여 구분한다. 입력 칸은 한국어 이름을 받고 키로 바꾼다.
function uniqueLabels(rows) {
  const count = new Map();
  for (const row of rows) count.set(row.label, (count.get(row.label) ?? 0) + 1);
  return rows
    .map(row => (count.get(row.label) > 1 ? { ...row, label: `${row.label} (${row.key})` } : row))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

export const speciesOptions = (reference, locale) =>
  uniqueLabels(
    Object.entries(reference.species)
      .filter(([, species]) => species.learnset)
      .map(([key, species]) => ({ key, label: locale.pokemon(species.name).label })),
  );

export const itemOptions = (reference, locale) =>
  uniqueLabels(
    Object.entries(reference.held_item)
      .filter(([, item]) => item.champions)
      .map(([key, item]) => ({
        key,
        label: item.label || locale.label('held_item', item.name),
      })),
  );

// 주소에서 작성자 아이디를 읽는다. og:site_name은 'note（ノート）'처럼 서비스 이름인
// 경우가 많아 작성자로 쓰지 못한다. 확정은 사람이 한다.
export function authorFromUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.split('/').filter(Boolean);
    if (url.host === 'note.com' || url.host === 'ameblo.jp') return path[0] ?? null;
    if (url.host === 'pokesol.app' && path[0] === 'u') return path[1] ?? null;
    const sub = url.host.match(/^([^.]+)\.(hatenablog\.(com|jp)|hateblo\.jp|hatenadiary\.\w+)$/);
    return sub ? sub[1] : null;
  } catch {
    return null;
  }
}

// 큐 항목으로 여섯 칸을 미리 채운다. 후보는 이미 점수순이다. 도구는 근처에서 찾은 것
// 중 아직 쓰지 않은 것을 앞에서부터 준다(같은 도구는 한 파티에 하나). 메가는 폼과
// 메가스톤이 정해진다. 틀린 칸은 사람이 이미지를 보고 고친다.
// 제목이 시즌·형식을 밝히지 않았으면 검토 중인 시즌과 싱글로 둔다. 화면에서 바꾼다.
export function prefill(entry, reference, defaults = {}) {
  const used = new Set();
  // 여섯 칸은 본문에 처음 나온 순서로 둔다. 개별 해설 순서와 맞아 대조하기 쉽다.
  const team = entry.candidates
    .filter(candidate => candidate.champions)
    .slice(0, 6)
    .sort((a, b) => (a.firstIndex ?? 0) - (b.firstIndex ?? 0))
    .map(candidate => {
      const mega = candidate.forms.find(form => /Mega/.test(reference.species[form]?.forme ?? ''));
      const pokemon = mega ?? candidate.base;
      const stone = mega
        ? Object.entries(reference.held_item).find(([, item]) => item.megaStone === mega)?.[0]
        : null;
      const item =
        stone ??
        [...(candidate.nearest ?? []), ...candidate.items].find(
          key => !used.has(key) && !reference.held_item[key]?.megaStone,
        ) ??
        '';
      if (item) used.add(item);
      return { pokemon, item };
    });
  while (team.length < 6) team.push({ pokemon: '', item: '' });
  const images = entry.images ?? [];
  return {
    url: entry.url,
    title: entry.title ?? '',
    author: authorFromUrl(entry.url) ?? entry.siteName ?? '',
    rank: entry.rank ?? '',
    season: entry.season ?? defaults.season ?? '',
    format: entry.format ?? defaults.format ?? 'Singles',
    publishedAt: entry.publishedAt ?? '',
    teamImage: images[entry.imageFiles?.findIndex(Boolean) ?? 0] ?? images[0] ?? '',
    team,
    teamEvidence: '검토 화면에서 작성자의 팀 이미지와 본문 후보를 대조해 여섯 마리와 도구를 확인.',
    rankEvidence: entry.flags?.includes('rank-from-hint')
      ? '기사 목록의 순위 표기와 원문의 시즌·최종 순위 서술을 대조.'
      : '제목의 최종 순위 표기와 원문의 시즌 서술을 대조.',
  };
}

// 이미 기록된 pending 기사를 같은 양식으로 연다.
export const fromRecord = record => ({
  url: record.url,
  title: record.title,
  author: record.author,
  rank: record.rank,
  season: record.season,
  format: record.format,
  publishedAt: record.publishedAt ?? '',
  teamImage: record.review?.teamImage ?? '',
  team: record.team.map(member => ({ pokemon: member.pokemon, item: member.item ?? null })),
  teamEvidence: record.review?.teamEvidence ?? '',
  rankEvidence: record.review?.rankEvidence ?? '',
});

const slug = value =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

export function articleId(form, ids) {
  const head = `${form.season.toLowerCase()}-${form.format.toLowerCase()}`;
  const who = slug(form.author) || slug(authorFromUrl(form.url)) || `r${form.rank}`;
  let id = `${head}-${who}`;
  if (ids.has(id)) id = `${id}-${form.rank}`;
  for (let n = 2; ids.has(id); n++) id = `${head}-${who}-${form.rank}-${n}`;
  return id;
}

// 양식을 articles.json 기록으로 바꾸고 앱과 같은 검사를 돌린다. 오류가 있으면
// { error }를 돌려주고 파일에 쓰지 않는다.
export function buildRecord(form, data, reference, today, status = 'reviewed') {
  const existing = data.articles.find(article => articleKey(article.url) === articleKey(form.url));
  const ids = new Set(data.articles.filter(a => a !== existing).map(a => a.id));
  const record = {
    id: existing?.id ?? articleId(form, ids),
    season: form.season,
    format: form.format,
    rank: Number(form.rank),
    author: String(form.author ?? '').trim(),
    title: String(form.title ?? '').trim(),
    url: form.url,
    ...(form.publishedAt ? { publishedAt: form.publishedAt } : {}),
    team: form.team.map(member => ({
      pokemon: member.pokemon,
      item: member.item === '' || member.item === undefined ? undefined : member.item,
    })),
    review: {
      status,
      checkedAt: today,
      ...(form.teamImage ? { teamImage: form.teamImage } : {}),
      teamEvidence: String(form.teamEvidence ?? '').trim(),
      rankEvidence: String(form.rankEvidence ?? '').trim(),
    },
  };
  // 도구 칸을 비운 것은 '모름'이다. 없음(null)으로 바꾸지 않는다(articles.md 4번).
  if (record.team.some(member => member.item === undefined))
    return { error: '도구를 모르는 칸이 있습니다. 모르면 추가하지 말고 건너뛰세요.' };
  if (!/^https?:\/\//.test(record.review.teamImage ?? ''))
    return { error: '팀 이미지를 하나 골라 주세요.' };
  const problem = problems(record, reference)[0];
  if (problem) return { error: problem };
  // 앱이 공개할 때 쓰는 검사와 같다. 위 목록이 놓친 것이 있어도 여기서 막는다.
  const check = { ...record, review: { ...record.review, status: 'reviewed' } };
  if (!reviewedArticles({ articles: [check] }, reference).length)
    return { error: '앱의 형식 검사를 통과하지 못했습니다.' };
  return { record };
}

// 무엇이 틀렸는지 사람이 알 수 있게 하나씩 짚는다.
export function problems(record, reference) {
  const list = [];
  let url = null;
  try {
    url = new URL(record.url);
  } catch {
    // 아래에서 알린다.
  }
  if (!['https:', 'http:'].includes(url?.protocol)) list.push('원문 주소가 올바르지 않습니다.');
  if (!/^M\d+$/.test(record.season)) list.push('시즌은 M5처럼 적어 주세요.');
  if (!['Singles', 'Doubles'].includes(record.format)) list.push('형식을 골라 주세요.');
  if (!Number.isInteger(record.rank) || record.rank < 1)
    list.push('최종 순위를 숫자로 적어 주세요.');
  if (!record.author) list.push('작성자를 적어 주세요.');
  if (!record.title) list.push('제목을 적어 주세요.');
  if (!record.review.teamEvidence || !record.review.rankEvidence)
    list.push('근거 문장을 채워 주세요.');
  record.team.forEach((member, i) => {
    if (!reference.species[member.pokemon]) list.push(`${i + 1}번 포켓몬을 목록에서 골라 주세요.`);
    if (member.item !== null && !reference.held_item[member.item])
      list.push(`${i + 1}번 도구를 목록에서 골라 주세요.`);
  });
  if (new Set(record.team.map(member => member.pokemon)).size !== 6)
    list.push('같은 포켓몬이 두 번 들어 있습니다.');
  return list;
}

export function putArticle(data, record, today) {
  const rest = data.articles.filter(article => articleKey(article.url) !== articleKey(record.url));
  return { ...data, updatedAt: today, articles: [...rest, record] };
}

// 기존 파일과 같은 모양으로 쓴다. 파티 한 칸은 한 줄이다.
export const formatArticles = data =>
  JSON.stringify(data, null, 2).replace(
    /\{\n\s+"pokemon": ("[^"]*"),\n\s+"item": ("[^"]*"|null)\n\s+\}/g,
    '{ "pokemon": $1, "item": $2 }',
  ) + '\n';

// 검토할 목록: 먼저 pending 기록, 그다음 큐. 이미 기록했거나 제외한 주소는 뺀다.
export function reviewList(queue, data, skip, reference, defaults = {}) {
  const pending = data.articles
    .filter(article => article.review?.status === 'pending')
    .map(article => ({ kind: 'pending', entry: null, form: fromRecord(article) }));
  // 같은 글이 주소만 달리 두 번 들어와도 한 번만 보인다.
  const done = new Set(
    [...data.articles.map(a => a.url), ...skip.skipped.map(s => s.url)].map(articleKey),
  );
  const queued = [];
  for (const entry of queue.entries) {
    const key = articleKey(entry.url);
    if (done.has(key)) continue;
    done.add(key);
    queued.push({ kind: 'queue', entry, form: prefill(entry, reference, defaults) });
  }
  return [...pending, ...queued].map(row => ({ ...row, sameBlog: sameBlog(row.form.url, data) }));
}

// 한 블로그를 가리키는 열쇠. note·아메바·pokesol·livedoor는 경로의 작성자까지, 하테나 등은
// 호스트다. 같은 블로그의 기사가 이미 기록되어 있으면 검토 화면이 알린다(다른 시즌이나
// 더블일 수 있어 막지는 않는다).
export function blogKey(value) {
  try {
    const url = new URL(value);
    const host = url.host.replace(/^www\./, '');
    const first = url.pathname.split('/').filter(Boolean);
    if (['note.com', 'ameblo.jp', 'blog.livedoor.jp'].includes(host))
      return `${host}/${first[0] ?? ''}`;
    if (host === 'pokesol.app' && first[0] === 'u') return `${host}/u/${first[1] ?? ''}`;
    return host;
  } catch {
    return String(value);
  }
}

const sameBlog = (url, data) =>
  data.articles
    .filter(a => blogKey(a.url) === blogKey(url) && articleKey(a.url) !== articleKey(url))
    .map(a => ({
      id: a.id,
      season: a.season,
      format: a.format,
      rank: a.rank,
      title: a.title,
      url: a.url,
      status: a.review?.status,
      // 블로그 첫 페이지 주소로 기록된 것. 검토 화면이 지금 기사 주소로 옮기자고 제안한다.
      top: isBlogTop(a.url),
    }));

// 기록의 주소만 바꾼다. 첫 페이지 주소로 잘못 기록한 기사를 실제 기사 주소로 옮길 때 쓴다.
export function moveArticle(data, from, to, today) {
  const record = data.articles.find(article => article.url === from);
  if (!record) return { error: '옮길 기록을 찾지 못했습니다.' };
  if (
    data.articles.some(article => article !== record && articleKey(article.url) === articleKey(to))
  )
    return { error: '옮길 주소로 이미 기록이 있습니다.' };
  return {
    data: {
      ...data,
      updatedAt: today,
      articles: data.articles.map(article =>
        article === record ? { ...article, url: to } : article,
      ),
    },
    id: record.id,
  };
}
