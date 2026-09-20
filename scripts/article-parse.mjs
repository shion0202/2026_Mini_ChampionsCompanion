// 빌드 도구. 네트워크를 쓰지 않는 순수 함수만 둔다. 파서를 고칠 때 원문을 다시
// 긁지 않으려는 것이고, 고정 픽스처로 검증하기 위해서다.
import { toId } from '../src/data.js';

// 전각 Ｙ와 Ｍ－５ 같은 표기가 섞이므로 인덱스와 본문 양쪽을 같은 규칙으로 편다.
export const normalize = value => String(value).normalize('NFKC');

const REGION_PREFIX = { Alola: 'アローラ', Galar: 'ガラル', Hisui: 'ヒスイ', Paldea: 'パルデア' };

// 일본 커뮤니티는 도구를 거의 줄여 쓴다. 정식 명칭만으로는 본문에서 놓친다.
// ponytail: 손으로 적은 목록이다. 수집 결과에 빠진 도구가 보이면 여기에 더한다.
const ITEM_ALIASES = {
  スカーフ: 'choicescarf',
  ハチマキ: 'choiceband',
  メガネ: 'choicespecs',
  タスキ: 'focussash',
  ゴツメ: 'rockyhelmet',
  チョッキ: 'assaultvest',
  オボン: 'sitrusberry',
  ラム: 'lumberry',
  弱点保険: 'weaknesspolicy',
  残飯: 'leftovers',
  命の珠: 'lifeorb',
  気合の襷: 'focussash',
  拘りスカーフ: 'choicescarf',
  拘りハチマキ: 'choiceband',
  拘りメガネ: 'choicespecs',
};

// 긴 이름이 먼저 나와야 メガリザードンY가 リザードン으로 잘리지 않는다.
const byLength = entries =>
  new Map([...entries].sort(([a], [b]) => b.length - a.length || a.localeCompare(b)));

export function buildIndex(reference, ko) {
  const japanese = ko.japanese.pokemon;
  const pokemon = new Map();
  const put = (name, key) => {
    const folded = normalize(name);
    if (folded && !pokemon.has(folded)) pokemon.set(folded, key);
  };
  for (const [key, name] of Object.entries(japanese)) put(name, key);

  const baseOf = new Map();
  for (const [key, species] of Object.entries(reference.species)) {
    const base = toId(species.baseSpecies ?? species.name);
    baseOf.set(key, reference.species[base] ? base : key);
    const baseName = japanese[base];
    if (!baseName) continue;
    // forme은 'Mega', 'Mega-Y', 'Alola' 같은 값이다. 다만 폼이 나뉜 종족은
    // 'M-Mega', 'Curly-Mega'처럼 메가가 뒤에 붙으므로, 꼬리표가 뒤에 있는
    // 쪽만 이름에 붙이고 나머지는 メガ+기본명으로 둔다.
    if (/Mega/.test(species.forme))
      put(`メガ${baseName}${/^Mega-(.)$/.exec(species.forme)?.[1] ?? ''}`, key);
    const region = REGION_PREFIX[species.forme];
    if (region) put(`${region}${baseName}`, key);
  }

  const item = new Map();
  const formStone = new Map();
  for (const [key, record] of Object.entries(reference.held_item)) {
    if (record.japanese) {
      const folded = normalize(record.japanese);
      if (!item.has(folded)) item.set(folded, key);
    }
    if (record.megaStone) formStone.set(record.megaStone, key);
  }
  for (const [alias, key] of Object.entries(ITEM_ALIASES)) {
    const folded = normalize(alias);
    if (reference.held_item[key] && !item.has(folded)) item.set(folded, key);
  }

  return {
    pokemon: byLength(pokemon),
    item: byLength(item),
    champions: new Set(
      Object.entries(reference.species)
        .filter(([, species]) => species.learnset)
        .map(([key]) => key),
    ),
    formStone,
    baseOf,
  };
}

// 아이콘과 아바타는 본문 이미지가 아니다. 측정한 기사에서 첫 이미지가 블로그
// 아이콘이었고 실제 팀 이미지는 그다음이었다.
const DECORATION = /icon|avatar|profile|square|emoji|badge|blank|spacer/i;

export function parseTitle(title) {
  const text = normalize(title);
  // MCS는 월간 챌린지다. MCS26.07의 숫자를 시즌으로 읽지 않도록 먼저 지운다.
  const monthly = /MCS|月間/.test(text);
  const seasonal = text.replace(/MCS\s*\d+(\.\d+)?/g, ' ');
  // 最終이 붙은 순위를 가장 믿는다. 그게 없으면 시즌 표기 바로 뒤의 N位만 받되
  // 세 자리까지로 제한한다. レート2579나 2538/2515 같은 네 자리는 순위가 아니라
  // 레이팅이다. 순위 인증은 일본어 커뮤니티 밖에도 있어 한국어 표기도 읽는다.
  const rank =
    seasonal.match(/最終\s*(\d+)\s*位/) ??
    text.match(/最終\s*(\d+)\s*位/) ??
    text.match(/최종\s*(\d+)\s*위/) ??
    seasonal.match(/[MS]\s*-?\s*\d+\s*[:：]\s*(\d{1,3})\s*位/);
  // シーズン 뒤, 하이픈이 붙은 M-숫자, 구분자 뒤의 S숫자 순으로 본다. 하이픈이
  // 있으면 어디에 있든 시즌이지만(チャンピオンズM-3처럼 붙여 쓴다), 없으면
  // 구분자 뒤에서만 받는다. レギュM-B는 숫자가 없어 걸리지 않고 MCS의 연월은
  // 위에서 지웠다.
  const season =
    seasonal.match(/シーズン\s*(?:[MS]\s*-?\s*)?(\d+)/) ??
    seasonal.match(/[MS]\s*-\s*(\d+)(?![.\d])/) ??
    seasonal.match(/(?:^|[【\s／/|])[MS]\s*(\d+)(?![.\d])/);
  const format = /ダブル/.test(text) ? 'Doubles' : /シングル/.test(text) ? 'Singles' : null;
  return {
    rank: rank ? Number(rank[1]) : null,
    season: season ? `M${Number(season[1])}` : null,
    format,
    monthly,
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = value =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (whole, name) => ENTITIES[name] ?? whole);
const flatten = value =>
  normalize(decode(value.replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();

export function readPage(html) {
  const meta = name =>
    html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    )?.[1] ?? null;
  const body = html.replace(/<(script|style)\b[^]*?<\/\1>/gi, ' ');
  const text = flatten(body);
  const images = [...body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(url => /^https?:/.test(url) && !DECORATION.test(url))
    .slice(0, 3);
  return {
    title: meta('og:title') ?? flatten(html.match(/<title[^>]*>([^]*?)<\/title>/i)?.[1] ?? ''),
    siteName: meta('og:site_name'),
    publishedAt: (meta('article:published_time') ?? '').slice(0, 10) || null,
    text,
    images,
    excerpt: text.slice(0, 300),
  };
}

// 후보를 지우는 근거가 아니라 낮추는 근거다. 본문이 검토 과정을 길게 쓰는 만큼
// 여기 걸렸다고 버리면 실제 채용을 놓친다.
const NEGATIVE = ['見送り', '不採用', '候補', '相手', '過去', '没'];
const NEAR = 40;
// 텍스트만으로는 실제 멤버와 본문에 자주 나오는 상대를 가를 수 없다. 점수를
// 손보는 대신 그물을 넓혀 멤버를 떨어뜨리지 않는 쪽을 택한다.
const LIMIT = 16;
const EXCERPT = 50;

// 긴 이름부터 찾고 찾은 자리를 덮어 メガリザードンY가 リザードン으로 두 번 세지
// 않게 한다. 자리를 지우지 않고 같은 길이로 덮어 위치를 유지한다.
function scan(text, names) {
  let rest = text;
  const found = [];
  for (const name of names) {
    const at = [];
    for (;;) {
      const index = rest.indexOf(name);
      if (index < 0) break;
      at.push(index);
      rest = rest.slice(0, index) + '\u0001'.repeat(name.length) + rest.slice(index + name.length);
    }
    if (at.length) found.push({ name, at });
  }
  return found;
}

export function digest(page, index) {
  const text = normalize(page.text);
  const items = scan(text, [...index.item.keys()]).map(hit => ({
    key: index.item.get(hit.name),
    at: hit.at,
  }));
  const mons = scan(text, [...index.pokemon.keys()]);

  const merged = new Map();
  for (const hit of mons) {
    const key = index.pokemon.get(hit.name);
    const base = index.baseOf.get(key) ?? key;
    const entry = merged.get(base) ?? {
      base,
      forms: [],
      items: [],
      hits: 0,
      firstIndex: text.length,
      negative: 0,
      champions: index.champions.has(base),
      excerpts: [],
    };
    if (key !== base && !entry.forms.includes(key)) entry.forms.push(key);
    entry.hits += hit.at.length;
    entry.firstIndex = Math.min(entry.firstIndex, hit.at[0]);
    for (const at of hit.at) {
      for (const item of items)
        if (item.at.some(other => Math.abs(other - at) <= NEAR) && !entry.items.includes(item.key))
          entry.items.push(item.key);
      const window = text.slice(Math.max(0, at - EXCERPT), at + hit.name.length + EXCERPT);
      if (NEGATIVE.some(word => window.includes(word))) entry.negative++;
      if (entry.excerpts.length < 1) entry.excerpts.push(window);
    }
    merged.set(base, entry);
  }

  for (const entry of merged.values()) {
    // 점수는 본문에서 실제로 찾은 도구로만 매긴다. 아래에서 채우는 메가스톤은
    // 폼에서 되짚은 파생값이라 근거가 아니고, 이것까지 세면 구축 경위에 환경
    // 상위 메가로 이름만 오른 포켓몬이 실제 멤버를 밀어낸다.
    entry.score =
      entry.hits * 2 +
      entry.items.length * 6 +
      entry.forms.length * 3 -
      entry.negative * 5 -
      (entry.champions ? 0 : 40);
    // 본문이 メガルカリオ라고만 쓰고 ルカリオナイト를 안 써도 도구가 확정된다.
    for (const form of entry.forms) {
      const stone = index.formStone.get(form);
      if (stone && !entry.items.includes(stone)) entry.items.push(stone);
    }
  }

  const candidates = [...merged.values()]
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex)
    .slice(0, LIMIT);
  const flags = [];
  if (candidates.filter(c => c.champions).length < 6) flags.push('few-candidates');
  if (!page.images?.length) flags.push('no-image');
  if (candidates.filter(c => c.items.length).length < 6) flags.push('items-incomplete');
  return { candidates, flags };
}

// チャンピオンズ만으로는 포켓몬 외 결과가 섞이지만 종족 필터와 순위 파싱이
// 걸러낸다. 앞의 두 개는 공백만 다르다. 하테나가 복합어를 어떻게 쪼개는지
// 확인하는 비용보다 둘 다 던지는 비용이 싸다.
export const GAME_TERMS = ['ポケモンチャンピオンズ', 'ポケモン チャンピオンズ', 'ポケチャン'];

// 형식은 검색어에 넣지 않는다. 측정하니 シングル을 더하는 것만으로 하테나의 AND
// 검색이 고유 URL을 44건에서 5건으로 깎았다. 구축기사 제목이 형식을 밝히지 않는
// 경우가 흔하기 때문이다. 형식은 받아온 뒤 제목으로 거른다.
export function searchQueries({ season }) {
  const number = Number(String(season).replace(/[^0-9]/g, ''));
  const queries = [];
  for (const term of GAME_TERMS)
    for (const label of [`M-${number}`, `S${number}`]) queries.push(`${term} ${label} 最終`);
  return [...new Set(queries)];
}

// 블로그 첫 페이지는 기사가 아니다. 포켓몬 이름이 잔뜩 있어 후보 수 검사를
// 통과해 버리므로 주소로 먼저 거른다.
export const looksLikeArticle = url => {
  try {
    return new URL(url).pathname.replace(/\/+$/, '').length > 0;
  } catch {
    return false;
  }
};

export function rssLinks(body) {
  return [...body.matchAll(/<item\s[^]*?<\/item>/g)].map(match => {
    const item = match[0];
    const field = tag => item.match(new RegExp(`<${tag}[^>]*>([^]*?)</${tag}>`))?.[1] ?? null;
    const date = field('dc:date');
    return {
      title: flatten(field('title') ?? ''),
      url: (field('link') ?? '').trim(),
      date: date ? date.slice(0, 10) : null,
    };
  });
}

// 競馬의 チャンピオンズカップ와 最終予想이 같은 검색어에 걸린다. 측정한 회차에서
// 고유 URL 44건 중 35건이 경마 예상 글이었다. 최종 N위나 포켓몬 표기가 제목에
// 없으면 받아오지 않는다. 받아오고 나서 거르면 요청과 시간만 버린다.
export const looksRelevant = title => {
  const text = normalize(title);
  // 순위를 읽어내는 규칙은 parseTitle 하나로 둔다. 여기서 정규식을 다시 쓰면
  // 【M-5:36位】처럼 最終이 없는 표기를 한쪽만 알아보는 일이 생긴다.
  return parseTitle(text).rank !== null || /ポケモン|ポケチャン|構築|포켓몬|구축/.test(text);
};

// robots.txt가 AI 목적 수집을 금지한 호스트다. 검색 결과에는 섞여 들어오므로
// 기억에 맡기지 않고 여기서 막는다. 근거는 각 사이트의 robots.txt다.
//   blog.naver.com / m.blog.naver.com — RAG 목적 수집 금지, ClaudeBot 지정
//   cafe.naver.com                    — User-agent: * 에 Disallow: /
//   champs.pokedb.tokyo               — ClaudeBot, Claude-SearchBot 지정
// 포케DB 목록은 사람이 직접 보고 주소를 넘기는 쪽으로 쓴다.
const FORBIDDEN_HOSTS = [
  'blog.naver.com',
  'm.blog.naver.com',
  'cafe.naver.com',
  'champs.pokedb.tokyo',
];

export const isFetchable = url => {
  if (!looksLikeArticle(url)) return false;
  const host = new URL(url).host.replace(/^www\./, '');
  return !FORBIDDEN_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`));
};

export function googleLinks(body) {
  const payload = JSON.parse(body);
  if (payload.error) throw Error(`${payload.error.code}: ${payload.error.message}`);
  return (payload.items ?? []).map(item => ({
    title: flatten(item.title ?? ''),
    url: (item.link ?? '').trim(),
    date: null,
  }));
}
