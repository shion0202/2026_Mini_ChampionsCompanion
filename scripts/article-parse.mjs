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
    // ヒスイゾロアーク와 ゾロアーク(ヒスイ) 둘 다 쓴다. 괄호 쪽을 모르면 기본 폼으로 읽혀
    // 히스이 통일 파티가 통째로 틀렸다(M-5 499위).
    if (region) {
      put(`${region}${baseName}`, key);
      put(`${baseName}(${region})`, key);
    }
  }
  // 성별·폼 괄호 표기(イダイトウ(♀) 등). 괄호 없이 イダイトウ♀로도 쓴다.
  for (const [name, key] of Object.entries(POKESOL_FORMS)) {
    if (!reference.species[key]) continue;
    put(name, key);
    put(name.replace(/\(([♂♀])\)$/, '$1'), key);
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
  // 最終 없이 N位만 쓴 제목도 많다(【M-5 53位】, (494位), 世界207位). 숫자 앞이 숫자나
  // 점이면 레이팅의 일부(2307.557位)라 받지 않고, 最高N位는 최고 순위라 뺀다. 월간 챌린지
  // 제목에서는 이 규칙을 쓰지 않는다. 월간 순위일 수 있다.
  const rank =
    seasonal.match(/最終\s*(\d+)\s*位/) ??
    text.match(/最終\s*(\d+)\s*位/) ??
    text.match(/최종\s*(\d+)\s*위/) ??
    seasonal.match(/[MS]\s*-?\s*\d+\s*[:：]\s*(\d{1,3})\s*位/) ??
    (monthly ? null : seasonal.match(/(?<!最高\s*(?:順位)?\s*)(?<![\d.])(\d{1,4})\s*位/));
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

// 오래된 일본 블로그(livedoor, FC2 등)는 EUC-JP나 Shift_JIS로 쓴다. 모두 UTF-8로 읽으면
// 글자가 깨져 포켓몬 이름을 하나도 찾지 못한다. 응답 헤더, 없으면 문서 앞부분의
// meta charset을 보고 푼다.
const CHARSETS = {
  'x-sjis': 'shift_jis',
  sjis: 'shift_jis',
  'shift-jis': 'shift_jis',
  'windows-31j': 'shift_jis',
  cp932: 'shift_jis',
  'x-euc-jp': 'euc-jp',
  eucjp: 'euc-jp',
};
export function charsetOf(bytes, contentType = '') {
  const head = Buffer.from(bytes.slice(0, 4096)).toString('latin1');
  const label = (
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8'
  ).toLowerCase();
  return CHARSETS[label] ?? label;
}
export function decodeHtml(bytes, contentType = '') {
  try {
    return new TextDecoder(charsetOf(bytes, contentType)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
// 예전에 UTF-8로 잘못 읽어 캐시한 문서를 알아본다. 깨진 글자(U+FFFD)가 많으면 다시 받는다.
export const looksGarbled = text => (text.match(/\uFFFD/g)?.length ?? 0) > 20;

export function readPage(html) {
  const meta = name =>
    html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    )?.[1] ?? null;
  const body = html.replace(/<(script|style)\b[^]*?<\/\1>/gi, ' ');
  const text = flatten(body);
  // 요즘 블로그는 이미지를 늦게 불러와 src에 빈 자리표시(data: URI, 1px gif)만 두고
  // 실제 주소를 data-src나 srcset에 둔다. src만 보면 팀 이미지를 놓친다. og:image는
  // 작성자가 고른 대표 이미지라 팀 이미지인 경우가 많아 끝에 더한다.
  const images = [
    ...[...body.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => {
      const attr = name => tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'i'))?.[1];
      const srcset = attr('data-srcset') ?? attr('srcset');
      return (
        attr('data-src') ??
        attr('data-original') ??
        attr('data-lazy-src') ??
        srcset?.trim().split(/\s+/)[0] ??
        attr('src')
      );
    }),
    meta('og:image'),
  ]
    .map(url => url && decode(url))
    .filter(url => url && /^https?:/.test(url) && !DECORATION.test(url))
    .filter((url, at, all) => all.indexOf(url) === at)
    .slice(0, 5);
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
    length: hit.name.length,
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
      nearest: [],
      hits: 0,
      firstIndex: text.length,
      negative: 0,
      champions: index.champions.has(base),
      excerpts: [],
    };
    if (key !== base && !entry.forms.includes(key)) entry.forms.push(key);
    // 폼마다 [나온 횟수, 바로 뒤에 @가 붙은 횟수]. 개별 해설 제목(ゾロアーク(ヒスイ)@タスキ)은
    // 폼을 밝히고 본문은 줄여 쓰므로, 검토 화면은 @ 붙은 쪽을 먼저 보고 폼을 고른다.
    const heads = hit.at.filter(at => /^\s*@/.test(text.slice(at + hit.name.length))).length;
    const [count = 0, headCount = 0] = entry.keyHits?.[key] ?? [];
    entry.keyHits = { ...entry.keyHits, [key]: [count + hit.at.length, headCount + heads] };
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

  // items는 근처(±40자)의 도구를 모두 담아 점수에 쓴다. 본문이 촘촘하면 한 도구가
  // 여러 포켓몬에 붙으므로, 검토 화면이 미리 채울 도구는 따로 고른다. 도구 표기마다
  // 가장 가까운 포켓몬 하나에만 붙인다. 'ガブリアス@スカーフ'처럼 도구는 보통 이름 뒤에
  // 오므로 앞에 있는 도구는 조금 멀게 본다.
  const places = mons.flatMap(hit => {
    const key = index.pokemon.get(hit.name);
    const base = index.baseOf.get(key) ?? key;
    return hit.at.map(at => ({ base, at, end: at + hit.name.length }));
  });
  for (const item of items)
    for (const at of item.at) {
      let best = null;
      let bestDistance = NEAR;
      for (const place of places) {
        const distance =
          at >= place.end ? at - place.end : (place.at - (at + item.length)) * 1.5 + 1;
        if (distance >= 0 && distance <= bestDistance) {
          if (distance === bestDistance && best) continue;
          best = place;
          bestDistance = distance;
        }
      }
      const entry = best && merged.get(best.base);
      if (entry && !entry.nearest.includes(item.key)) entry.nearest.push(item.key);
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

// 챔피언스 랭크배틀 M-1이 시작한 날. 이보다 먼저 쓴 글은 챔피언스 기사일 수 없다.
export const CHAMPIONS_START = '2026-04-08';

// 작성자 피드와 검색에는 같은 블로그의 지난 게임 기사가 섞인다. 소드실드의 'S5'나
// SV의 '시즌 20'도 제목 파싱으로는 시즌처럼 읽히므로 게임을 따로 가린다.
const CHAMPIONS_TERMS =
  /チャンピオンズ|ポケチャン|Champions|챔피언스|レギュ(?:レーション)?\s*M|M-[A-Z](?![a-z])|シーズン\s*M|M-\d/i;
const OTHER_GAME_TERMS =
  /剣盾|ソードシールド|ソード・シールド|SWSH|スカーレット|バイオレット|スカバイ|(?<![A-Za-z])SV(?![A-Za-z])|テラスタル|テラスタイプ|ダイマックス|竜王戦|JCS|WCS\s*20(?:1\d|2[0-5])|シリーズ\s*\d+/i;

export function gameCheck(text, publishedAt) {
  const folded = normalize(text ?? '');
  const flags = [];
  if (publishedAt && publishedAt < CHAMPIONS_START) flags.push('before-champions');
  const champions = CHAMPIONS_TERMS.test(folded);
  if (!champions) flags.push(OTHER_GAME_TERMS.test(folded) ? 'other-game' : 'no-champions-mention');
  return flags;
}

// チャンピオンズ만으로는 포켓몬 외 결과가 섞이지만 종족 필터와 순위 파싱이
// 걸러낸다. 앞의 두 개는 공백만 다르다. 하테나가 복합어를 어떻게 쪼개는지
// 확인하는 비용보다 둘 다 던지는 비용이 싸다.
export const GAME_TERMS = ['ポケモンチャンピオンズ', 'ポケモン チャンピオンズ', 'ポケチャン'];

// 형식은 검색어에 넣지 않는다. 측정하니 シングル을 더하는 것만으로 하테나의 AND
// 검색이 고유 URL을 44건에서 5건으로 깎았다. 구축 기사 제목이 형식을 밝히지 않는
// 경우가 흔하기 때문이다. 형식은 받아온 뒤 제목으로 거른다.
export function searchQueries({ season }) {
  const number = Number(String(season).replace(/[^0-9]/g, ''));
  const queries = [];
  for (const term of GAME_TERMS)
    for (const label of [`M-${number}`, `S${number}`]) queries.push(`${term} ${label} 最終`);
  return [...new Set(queries)];
}

// 같은 기사를 가리키는 주소를 하나로 본다. 포케DB 목록은 http, 작성자 피드는 https처럼
// 같은 글이 스킴이나 www., 끝의 / 만 다르게 들어온다. 비교에만 쓰고 기록은 원래 주소로 한다.
export function articleKey(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.host.replace(/^www\./, '').toLowerCase()}${path}${url.search}`;
  } catch {
    return String(value);
  }
}

// 블로그 첫 페이지는 기사가 아니다. 포켓몬 이름이 잔뜩 있어 후보 수 검사를
// 통과해 버리므로 주소로 먼저 거른다.
// 블로그 아이디가 경로에 들어가는 서비스는 첫 페이지도 경로가 있다(blog.livedoor.jp/forpoke/,
// note.com/someone). 첫 페이지에는 최신 글이 통째로 떠 있어 후보가 완벽하게 잡히지만, 새 글이
// 올라오면 다른 글이 된다. 이런 서비스는 기사 주소 형식일 때만 기사로 본다.
const PATH_BLOG_HOSTS =
  /^(blog\.livedoor\.jp|note\.com|ameblo\.jp|pokesol\.app)$|(^|\.)(hatenablog\.(com|jp)|hateblo\.jp|hatenadiary\.(com|jp|org))$/;
export const isBlogTop = url => {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.replace(/\/+$/, '')) return true;
    return PATH_BLOG_HOSTS.test(parsed.host.replace(/^www\./, '')) && !isBlogPost(url);
  } catch {
    return false;
  }
};
export const looksLikeArticle = url => {
  try {
    new URL(url);
  } catch {
    return false;
  }
  return !isBlogTop(url);
};

const feedDate = value => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
  // RSS 2.0의 pubDate는 RFC 822 꼴이다. 시간대를 지키려고 문자열을 자르지 않고 읽는다.
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const cdata = value => value.replace(/^\s*<!\[CDATA\[([^]*?)\]\]>\s*$/, '$1');

// 하테나 북마크 검색(RSS 1.0), 블로그 RSS 2.0, Atom을 한 함수로 읽는다. 작성자
// 블로그의 피드가 서비스마다 형식이 달라서다. channel의 link는 항목이 아니다.
export function feedLinks(body) {
  const blocks = [...body.matchAll(/<(item|entry)\b[^>]*>[^]*?<\/\1>/g)];
  return blocks.map(([block, kind]) => {
    const field = tag =>
      block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^]*?)</${tag}>`))?.[1] ?? null;
    const url =
      kind === 'entry'
        ? (block.match(/<link\b(?=[^>]*rel=["']alternate["'])[^>]*href=["']([^"']+)["']/)?.[1] ??
          block.match(/<link\b[^>]*href=["']([^"']+)["']/)?.[1] ??
          '')
        : cdata(field('link') ?? '');
    return {
      title: flatten(cdata(field('title') ?? '')),
      url: decode(url.trim()),
      date: feedDate(
        field('dc:date') ?? field('pubDate') ?? field('published') ?? field('updated'),
      ),
    };
  });
}
export const rssLinks = feedLinks;

// 작성자는 시즌마다 같은 블로그에 쓴다. 한 번 등록한 기사의 주소에서 그 블로그의
// 피드를 되짚어 다음 시즌 기사를 검색 없이 찾는다. 피드 주소가 정해진 서비스만 다루고
// 나머지는 null을 돌려준다. pokesol은 공개된 작성자 피드를 찾지 못했다.
export function feedUrlFor(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.host;
  if (/(^|\.)(hatenablog\.(com|jp)|hateblo\.jp|hatenadiary\.(com|jp|org))$/.test(host))
    return `${url.origin}/feed`;
  if (host === 'note.com') {
    const user = url.pathname.match(/^\/([^/]+)\/n\//)?.[1];
    return user ? `https://note.com/${user}/rss` : null;
  }
  if (host === 'ameblo.jp') {
    const user = url.pathname.match(/^\/([^/]+)\//)?.[1];
    return user ? `https://rssblog.ameba.jp/${user}/rss20.xml` : null;
  }
  if (host === 'blog.livedoor.jp') {
    const user = url.pathname.match(/^\/([^/]+)/)?.[1];
    return user ? `${url.origin}/${user}/index.rdf` : null;
  }
  if (/\.blog\.fc2\.com$/.test(host)) return `${url.origin}/?xml`;
  if (/\.(livedoor\.blog|blog\.jp|seesaa\.net)$/.test(host)) return `${url.origin}/index.rdf`;
  return null;
}

// 개인 구축 기사가 올라가는 곳이다. 목록 페이지에서 링크를 거둘 때 사이트 안내
// 링크와 기사를 가르는 데 쓴다. 이 패턴 밖이라도 링크 문구에 최종 순위가 있으면 받는다.
const BLOG_POST = [
  /(^|\.)(hatenablog\.(com|jp)|hateblo\.jp|hatenadiary\.(com|jp|org))\/entry\//,
  /^note\.com\/[^/]+\/n\//,
  /^pokesol\.app\/u\/[^/]+\/articles\//,
  /^ameblo\.jp\/[^/]+\/entry-/,
  /\.blog\.fc2\.com\/blog-entry-/,
  /\.(livedoor\.blog|blog\.jp)\/archives\//,
  /^blog\.livedoor\.jp\/[^/]+\/archives\//,
  /\.seesaa\.net\/article\//,
  // 아래는 기사로 알아보되 받지는 않는 곳이다. 검토 목록으로 간다(humanOnly, robots.txt).
  /^(m\.)?blog\.naver\.com\/[^/]+\/\d+/,
  /^(m\.)?cafe\.naver\.com\/(ca-fe\/web\/cafes\/[^/]+\/articles\/\d+|[^/]+\/\d+)/,
  /^yakkun\.com\/bbs\/party\/n\d+/,
  /^(mobile\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/,
  /^((www|m)\.)?youtube\.com\/(watch$|shorts\/|live\/)|^youtu\.be\/./,
];

// X 게시물은 로그인 없이 본문이 나오지 않아 수집기가 읽을 수 없다. 받지 않고 사람이
// 검토할 목록으로 보낸다. 계정 프로필이나 영상처럼 기사가 아닌 링크는 리드가 아니다.
// 유튜브 영상도 같다. 팀은 영상 속에만 있어 본문과 이미지로 대조할 수 없다.
const YOUTUBE_VIDEO = /^((www|m)\.)?youtube\.com\/(watch$|shorts\/|live\/)|^youtu\.be\/./;
const X_POST = /^(www\.|mobile\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/;
const NOT_ARTICLE_HOST =
  /^(www\.|mobile\.|m\.)?(x|twitter|youtube|youtu|twitch|discord|instagram|tiktok)\.(com|be|tv|gg)$/;

// SNS 프로필, 채널, 재생목록처럼 기사가 될 수 없는 링크. 사람이 붙여 넣은 목록에서도 뺀다.
export const isNonArticle = value => {
  try {
    return NOT_ARTICLE_HOST.test(new URL(value).host) && !isBlogPost(value);
  } catch {
    return true;
  }
};

export function humanOnly(value) {
  try {
    const url = new URL(value);
    if (X_POST.test(url.host + url.pathname)) return 'X 게시물';
    if (YOUTUBE_VIDEO.test(url.host + url.pathname)) return 'YouTube 영상';
  } catch {
    return null;
  }
  return isFetchable(value) ? null : '수집 금지 호스트';
}
export const isBlogPost = value => {
  try {
    const url = new URL(value);
    return BLOG_POST.some(pattern => pattern.test(url.host + url.pathname));
  } catch {
    return false;
  }
};

const SCRIPTS = /<(script|style)\b[^]*?<\/\1>/gi;
// si는 유튜브 공유 링크의 추적 값이다. 영상 주소(v)와 시각(t)은 남긴다.
const TRACKING = /^(utm_|fbclid$|gclid$|ref$|ref_src$|si$)/;
const cleanUrl = (value, base) => {
  try {
    const url = new URL(decode(value.trim()), base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (TRACKING.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
};

// 사람이 넘긴 주소 목록이나 기사 모음 페이지에서 링크를 꺼낸다. HTML이면 a 태그의
// 문구와 앞뒤 글을, 일반 텍스트면 줄에 적힌 나머지 글을 순위 힌트로 함께 넘긴다.
// 같은 주소는 한 번만 돌려준다.
// 저장한 목록 페이지의 원래 주소. 이것을 알아야 그 사이트 자체의 링크(메뉴, 포켓몬
// 페이지)를 버리고 상대 주소를 풀 수 있다. 브라우저 저장본은 canonical, og:url, 또는
// 'saved from url' 주석을 남긴다.
export function pageUrlOf(body) {
  const found =
    body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    body.match(/<meta\b[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    body.match(/<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i)?.[1];
  try {
    return found ? new URL(decode(found)).href : undefined;
  } catch {
    return undefined;
  }
}

// 순위만 적힌 칸(84位, 23위)을 읽는다. 最終이 없어 parseTitle은 받지 않는 표기다.
const lastRank = text => {
  const all = [...normalize(text).matchAll(/(\d{1,5})\s*[位위]/g)];
  return all.length ? Number(all.at(-1)[1]) : null;
};

export function extractLinks(body, base = pageUrlOf(body)) {
  const found = new Map();
  // lead는 링크 앞(직전 기사 링크 뒤부터)의 글이다. 카드의 순위·작성자가 여기 있다.
  const add = (href, title, context, rankHint = null, lead = '') => {
    const url = cleanUrl(href, base);
    if (!url || found.has(url)) return;
    found.set(url, {
      url,
      title: flatten(title),
      context: flatten(context),
      rankHint,
      lead: flatten(lead).slice(-160),
    });
  };
  const anchors = [...body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([^]*?)<\/a>/gi)];
  if (anchors.length) {
    // 순위는 보통 같은 표 행이나 목록 항목에 링크와 함께 있다. 앞뒤 글을 같은 블록
    // 안에서만 잘라야 옆 행의 순위가 메뉴 링크에 붙지 않는다.
    const BLOCK_START = /<(tr|li|p|h\d|div|dt|dd|nav|section|article)\b[^>]*>|<br\s*\/?>/gi;
    const BLOCK_END = /<\/(tr|li|p|h\d|div|dd|nav|section|article)>|<br\s*\/?>/i;
    // 카드형 목록은 순위를 윗줄에, 기사 링크를 아랫줄의 다른 블록에 둔다. 그래서 직전
    // 기사 링크가 끝난 뒤부터 이 링크 앞까지의 글에서 가장 가까운 순위를 따로 읽는다.
    // 카드마다 기사 링크가 하나씩 있으므로 옆 카드의 순위가 넘어오지 않는다.
    let segment = 0;
    for (const match of anchors) {
      const before = body.slice(Math.max(0, match.index - 300), match.index);
      const starts = [...before.matchAll(BLOCK_START)];
      const head = starts.length ? before.slice(starts.at(-1).index) : before;
      const after = body.slice(match.index + match[0].length, match.index + match[0].length + 300);
      const end = after.search(BLOCK_END);
      const lead = flatten(body.slice(segment, match.index).replace(SCRIPTS, ' '));
      add(
        match[1],
        match[2],
        `${head} ${end < 0 ? after : after.slice(0, end)}`,
        lastRank(lead),
        lead,
      );
      const url = cleanUrl(match[1], base);
      if (url && isBlogPost(url)) segment = match.index + match[0].length;
    }
    return [...found.values()];
  }
  for (const line of body.split(/\r?\n/))
    for (const match of line.matchAll(/https?:\/\/[^\s"'<>]+/g))
      add(
        match[0],
        '',
        line.replace(match[0], ' '),
        lastRank(line.replace(match[0], ' ')),
        line.replace(match[0], ' '),
      );
  return [...found.values()];
}

// 목록 페이지의 수백 개 링크 중 기사로 보이는 것만 남긴다. 같은 사이트 안의 링크는
// 메뉴와 다른 공략 글이므로 버린다.
export const isLeadLink = (link, pageUrl) => {
  if (!looksLikeArticle(link.url)) return false;
  let url;
  try {
    url = new URL(link.url);
    if (pageUrl && url.host === new URL(pageUrl).host) return false;
  } catch {
    return false;
  }
  if (isBlogPost(link.url)) return true;
  if (isNonArticle(link.url)) return false;
  return parseTitle(`${link.title} ${link.context}`).rank !== null || link.rankHint != null;
};

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

// 위 목록은 이미 알고 있는 곳이다. 목록 페이지와 작성자 피드로 처음 보는 호스트가
// 계속 들어오므로 robots.txt를 받아 같은 기준을 코드로 적용한다.
// 수집 결과는 3단계에서 AI가 읽으므로 AI 크롤러와 사용자 요청형 AI 에이전트를
// 막은 곳은 받지 않는다. 학습 전용 표기(GPTBot, Google-Extended)는 이 용도와
// 무관해 보지 않는다. 우리 User-Agent가 막힌 곳도 물론 받지 않는다.
export const ROBOT_AGENTS = [
  'championscompanion',
  'claudebot',
  'claude-user',
  'claude-searchbot',
  'chatgpt-user',
  'perplexity-user',
];

// 규칙과 주소를 같은 형태로 비교하려고 퍼센트 인코딩을 양쪽 모두 푼다.
const safeDecode = value => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};

function robotsGroups(robots) {
  const groups = [];
  let current = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const [, field, value] = match;
    const key = field.toLowerCase();
    if (key === 'user-agent') {
      // 규칙 없이 이어진 user-agent 줄은 한 묶음이다.
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ allow: key === 'allow', path: safeDecode(value) });
    }
  }
  return groups;
}

// *는 아무 글자, 끝의 $는 경로 끝이다. 빈 Disallow는 아무것도 막지 않는다.
const ruleMatches = (rule, path) => {
  if (!rule.path) return false;
  const anchored = rule.path.endsWith('$');
  const pattern = (anchored ? rule.path.slice(0, -1) : rule.path)
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
};

// RFC 9309: 이름이 맞는 묶음이 있으면 그것만, 없으면 *를 본다. 가장 긴 규칙이
// 이기고 길이가 같으면 Allow가 이긴다. 넘긴 에이전트 중 하나라도 막히면 거부한다.
export function robotsAllows(robots, value, agents = ROBOT_AGENTS) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const path = safeDecode(url.pathname + url.search);
  const groups = robotsGroups(robots ?? '');
  return agents.every(agent => {
    const named = groups.filter(group =>
      group.agents.some(name => name !== '*' && agent.includes(name)),
    );
    const rules = (
      named.length ? named : groups.filter(group => group.agents.includes('*'))
    ).flatMap(group => group.rules);
    const hit = rules
      .filter(rule => ruleMatches(rule, path))
      .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
    return !hit || hit.allow;
  });
}

export function googleLinks(body) {
  const payload = JSON.parse(body);
  if (payload.error) throw Error(`${payload.error.code}: ${payload.error.message}`);
  return (payload.items ?? []).map(item => ({
    title: flatten(item.title ?? ''),
    url: (item.link ?? '').trim(),
    date: null,
  }));
}

// 포케솔(pokesol.app) 기사는 본문과 포켓몬·도구 표를 페이지 안의 React Router 데이터
// (turbo-stream)로 싣는다. 작성자가 본문에 넣은 포켓몬 카드에 포켓몬·도구 번호가 있어서
// 팀 이미지를 보지 않고 여섯 칸을 읽는다. 측정: M-5 10건이 사람이 확정한 기록과 120칸 일치.
// turbo-stream은 값을 평평한 배열에 두고, 객체의 키 "_n"과 값 n이 그 배열의 번호다.
// 음수는 null·undefined 같은 상수이고, ["D", 값] 같은 배열은 날짜 등 특수 값이다.
export function pokesolData(html) {
  const chunks = [...String(html).matchAll(/enqueue\(("(?:[^"\\]|\\.)*")\)/g)];
  if (!chunks.length) return null;
  let values;
  try {
    values = JSON.parse(
      chunks
        .map(([, chunk]) => JSON.parse(chunk))
        .join('')
        .split('\n')[0],
    );
  } catch {
    return null;
  }
  const memo = new Map();
  const hydrate = index => {
    if (typeof index !== 'number' || index < 0) return null;
    if (memo.has(index)) return memo.get(index);
    const value = values[index];
    if (Array.isArray(value)) {
      if (typeof value[0] === 'string') return value[1] ?? null;
      const out = [];
      memo.set(index, out);
      for (const item of value) out.push(hydrate(item));
      return out;
    }
    if (value && typeof value === 'object') {
      const out = {};
      memo.set(index, out);
      for (const [key, item] of Object.entries(value))
        out[values[Number(key.slice(1))]] = hydrate(item);
      return out;
    }
    return value;
  };
  const routes = Object.values(hydrate(0)?.loaderData ?? {});
  return routes.find(route => route?.article && route?.masterData) ?? null;
}

// 포케솔은 폼을 괄호로 적는다. 지역 폼은 buildIndex의 ヒスイダイケンキ 꼴로 바꿔 찾고,
// 나머지는 챔피언스에 나오는 것만 적는다. 없는 폼은 비워서 사람이 채운다.
export const POKESOL_FORMS = {
  'イダイトウ(♂)': 'basculegion',
  'イダイトウ(♀)': 'basculegionf',
  'ギルガルド(盾)': 'aegislash',
  'ギルガルド(剣)': 'aegislashblade',
  'ロトム(炎)': 'rotomheat',
  'ロトム(水)': 'rotomwash',
  'ロトム(氷)': 'rotomfrost',
  'ロトム(飛)': 'rotomfan',
  'ロトム(草)': 'rotommow',
  'ニャオニクス(♂)': 'meowstic',
  'ニャオニクス(♀)': 'meowsticf',
  'メガニャオニクス♂': 'meowsticmmega',
  'メガニャオニクス♀': 'meowsticfmega',
  'イエッサン(♂)': 'indeedee',
  'イエッサン(♀)': 'indeedeef',
  'ルガルガン(真昼)': 'lycanroc',
  'ルガルガン(真夜中)': 'lycanrocmidnight',
  'ルガルガン(黄昏)': 'lycanrocdusk',
  'ストリンダー(ハイ)': 'toxtricity',
  'ストリンダー(ロー)': 'toxtricitylowkey',
  'ケンタロス(パルデア闘)': 'taurospaldeacombat',
  'ケンタロス(パルデア炎)': 'taurospaldeablaze',
  'ケンタロス(パルデア水)': 'taurospaldeaaqua',
  'ポワルン(炎)': 'castformsunny',
  'ポワルン(水)': 'castformrainy',
  'ポワルン(氷)': 'castformsnowy',
  'パンプジン(中)': 'gourgeist',
  'パンプジン(小)': 'gourgeistsmall',
  'パンプジン(大)': 'gourgeistlarge',
  'パンプジン(ギガ)': 'gourgeistsuper',
  'イルカマン(変身)': 'palafinhero',
  'フラエッテ(永遠)': 'floetteeternal',
};

export function pokesolPokemon(name, index) {
  const folded = normalize(name);
  const regional = /^(.+)\((アローラ|ガラル|ヒスイ|パルデア)\)$/.exec(folded);
  return (
    index.pokemon.get(folded) ??
    POKESOL_FORMS[folded] ??
    (regional && index.pokemon.get(`${regional[2]}${regional[1]}`)) ??
    ''
  );
}

// 카드 순서대로 돌려준다. 이름을 키로 못 바꾸면 ''다. 카드에 도구가 없으면 입력하지 않은
// 것일 수 있어 없음(null)이 아니라 모름('')으로 둔다(articles.md 4번).
export function pokesolTeam(route, index) {
  const { article, masterData } = route;
  const names = new Map(masterData.pokemons.map(pokemon => [pokemon.id, pokemon.name]));
  const items = new Map(masterData.items.map(item => [item.id, item.name]));
  const cards = [
    ...String(article.body ?? '').matchAll(/<div data-type="pokemon-card"([^>]*)>/g),
  ].map(([, attrs]) => {
    const attr = key => new RegExp(`${key}="([^"]*)"`).exec(attrs)?.[1] ?? '';
    const name = names.get(Number(attr('data-pokemon-id'))) ?? '';
    const itemName = attr('data-item-id') ? (items.get(Number(attr('data-item-id'))) ?? '') : '';
    const pokemon = name ? pokesolPokemon(name, index) : '';
    const item = itemName ? (index.item.get(normalize(itemName)) ?? '') : '';
    // 카드가 일반 폼이어도 메가스톤을 들었으면 메가 폼으로 기록한다(ゲッコウガ@ゲッコウガナイト).
    const mega = [...index.formStone].find(
      ([form, stone]) => item && stone === item && index.baseOf.get(form) === pokemon,
    )?.[0];
    return { name, itemName, pokemon: mega ?? pokemon, item };
  });
  return {
    author: article.author?.displayName ?? '',
    title: article.title ?? '',
    battleFormat: article.battleFormat ?? '',
    season: article.season ?? '',
    cards,
  };
}
