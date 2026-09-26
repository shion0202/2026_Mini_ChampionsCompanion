// 빌드 도구. 포켓몬 배틀 데이터베이스 챔피언스(포케DB)가 공개한 상위 구축 데이터를
// 앱이 읽을 public/data/top-teams.json으로 바꾼다. 받은 시즌만 바꾸고 나머지는 둔다.
// - `npm run top-teams`: .cache/pokedb/에 사람이 받아 둔 파일을 바꾼다(네트워크 없음).
// - `npm run top-teams -- --fetch`: 끝난 시즌 중 받을 차례인 것만 받아서 바꾼다.
//   GitHub Actions(.github/workflows/daily.yml, 매일 자료 점검)가 매일 돌린다.
// 포케DB는 사용자 기기에서 직접 받지 말고 한 번 받아 두고 쓰라고 안내한다. 그래서 앱은
// 우리 사이트의 사본만 읽는다.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// 포케DB는 폼을 이름으로 적는다(ID의 폼 번호는 종마다 뜻이 달라 쓰지 않는다).
// 기본 폼 이름(オスのすがた, シールドフォルム 등)은 키에 아무것도 붙이지 않는다.
const REGIONS = { アローラ: 'alola', ガラル: 'galar', ヒスイ: 'hisui' };
export const FORMS = {
  'パルデアのすがた・コンバットしゅ': 'taurospaldeacombat',
  'パルデアのすがた・ブレイズしゅ': 'taurospaldeablaze',
  'パルデアのすがた・ウォーターしゅ': 'taurospaldeaaqua',
  ヒートロトム: 'rotomheat',
  ウォッシュロトム: 'rotomwash',
  フロストロトム: 'rotomfrost',
  スピンロトム: 'rotomfan',
  カットロトム: 'rotommow',
  えいえんのはな: 'floetteeternal',
  // 랭킹에 따로 있는 무늬만 적는다. 나머지 무늬는 겉모습만 달라 기본 키다.
  ファンシーなもよう: 'vivillonfancy',
  メスのすがた: 'f',
  こだましゅ: 'gourgeistsmall',
  おおだましゅ: 'gourgeistlarge',
  ギガだましゅ: 'gourgeistsuper',
  まよなかのすがた: 'lycanrocmidnight',
  たそがれのすがた: 'lycanrocdusk',
  '４ひきかぞく': 'mausholdfour',
  マイティフォルム: 'palafinhero',
  ブレードフォルム: 'aegislashblade',
};
const BASE_FORMS = new Set([
  'オスのすがた',
  'シールドフォルム',
  'ばけたすがた',
  'がんさくフォルム',
  'まんぷくもよう',
  'ナイーブフォルム',
  'ボンサクのすがた',
  'まひるのすがた',
  '３びきかぞく',
  'ふつうのすがた',
]);
// ビビヨン의 무늬는 겉모습만 달라 기본 키로 둔다.
const COSMETIC = /もよう$/;

export function buildNames(reference, ko) {
  const pokemon = new Map(Object.entries(ko.japanese.pokemon).map(([key, name]) => [name, key]));
  const item = new Map(
    Object.entries(reference.held_item)
      .filter(([, record]) => record.japanese)
      .map(([key, record]) => [record.japanese.normalize('NFKC'), key]),
  );
  // 메가스톤 → 그 메가 폼. 포케DB는 메가를 기본 포켓몬 + 메가스톤으로 적는다.
  const stone = new Map(
    Object.entries(reference.held_item)
      .filter(([, record]) => record.megaStone)
      .map(([key, record]) => [key, record.megaStone]),
  );
  return { pokemon, item, stone };
}

function speciesKey(member, names, reference) {
  const base = names.pokemon.get(member.pokemon);
  if (!base) return null;
  const form = member.form ?? '';
  const region = /^(アローラ|ガラル|ヒスイ)のすがた$/.exec(form)?.[1];
  const key = region ? base + REGIONS[region] : FORMS[form];
  if (!key) return !form || BASE_FORMS.has(form) || COSMETIC.test(form) ? base : null;
  const full = key === 'f' ? `${base}f` : key;
  return reference.species[full] ? full : null;
}

// 포켓몬 ''은 공개하지 않은 칸, 도구 ''은 모름, null은 도구 없음이다.
export function convertFile(data, reference, names) {
  const unknown = new Set();
  const teams = data.teams.map(({ rank, rating_value: rating, team }) => ({
    rank,
    rating,
    team: team.map(member => {
      let pokemon = '';
      if (member.pokemon) {
        pokemon = speciesKey(member, names, reference) ?? '';
        if (!pokemon) unknown.add(`포켓몬 ${member.pokemon} ${member.form}`.trim());
      }
      let item = '';
      if (member.item === '持ち物なし') item = null;
      else if (member.item) {
        item = names.item.get(member.item.normalize('NFKC')) ?? '';
        if (!item) unknown.add(`도구 ${member.item}`);
      }
      // 그 포켓몬의 메가스톤일 때만 메가 폼으로 쓴다(フラエッテ(えいえん)+フラエッテナイト).
      const mega = item && names.stone.get(item);
      if (mega && reference.species[pokemon]?.megas?.includes(mega)) pokemon = mega;
      return [pokemon, item];
    }),
  }));
  return {
    season: `M${data.season_number}`,
    format: data.rule === 'ダブル' ? 'Doubles' : 'Singles',
    updatedAt: data.updated_at,
    teams,
    unknown,
  };
}

// 자동 받기(--fetch). 시즌이 끝난 뒤 며칠째에 받을지 정한다. 포케DB는 시즌이 끝난 뒤
// 7일 동안 X에서 기사를 모으고, 그 뒤에도 손으로 더한다(M-4는 끝나고 41일, M-3은 68일에
// 마지막으로 바뀌었다). 그래서 3일째에 먼저 받아 빨리 보이고, X 수집이 끝난 10일째,
// 늦게 더한 것까지 30일째에 다시 받는다. 창마다 한 번만 받는다. 매일 돌아도 받을 차례가
// 아니면 포케DB에 요청하지 않는다.
export const FETCH_DAYS = [3, 10, 30];
// 끝나고 이만큼 지나도 한 번도 못 받은 시즌은 더 시도하지 않는다(공개하지 않은 시즌).
const GIVE_UP_DAYS = 60;
const DAY = 86_400_000;
const INDEX = 'https://championsbattledata.com/data/meta/index.json';
const AGENT =
  'ChampionsCompanion (+https://2026-mini-championscompanion.pages.dev/; https://github.com/shion0202/2026_Mini_ChampionsCompanion)';
const endOf = dates =>
  Math.max(
    ...dates.map(value => {
      const [day, month, year] = value.split('_').map(Number);
      return Date.UTC(year, month - 1, day);
    }),
  );

// 시즌 목록(championsbattledata index)에서 끝난 시즌 중 지금 받을 차례인 것을 고른다.
// 가장 최근 시즌은 진행 중이라 뺀다. 끝난 시즌은 마지막 날짜 하나만 남는다.
// fetched는 { M5: { at: ['2026-09-27'] } }. 창이 지난 뒤에 받은 기록이 있으면 받지 않는다.
export function dueSeasons(seasons, fetched, now, days = FETCH_DAYS) {
  const finished = seasons
    .filter(({ season }) => /^M\d+$/.test(season))
    .sort((a, b) => Number(b.season.slice(1)) - Number(a.season.slice(1)))
    .slice(1);
  return finished.flatMap(({ season, dates }) => {
    const end = endOf(dates);
    const at = fetched[season]?.at ?? [];
    if (!at.length && now > end + GIVE_UP_DAYS * DAY) return [];
    const window = days.filter(day => now >= end + day * DAY).at(-1);
    if (window === undefined) return [];
    return at.some(date => Date.parse(date) >= end + window * DAY) ? [] : [season];
  });
}

// ETag를 보내 바뀌지 않았으면 304로 끝낸다. 404는 아직 공개하지 않은 것이다.
async function download(number, rule, etag) {
  const url = `https://champs.pokedb.tokyo/opendata/s${number}_${rule}_ranked_teams.json`;
  const response = await fetch(url, {
    headers: { 'user-agent': AGENT, ...(etag ? { 'if-none-match': etag } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 304) return { status: 'same' };
  if (response.status === 404) return { status: 'missing' };
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return { status: 'new', text: await response.text(), etag: response.headers.get('etag') };
}

async function main(args) {
  const root = new URL('../', import.meta.url);
  const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [reference, ko, existing] = await Promise.all([
    read('public/data/reference.json'),
    read('public/data/ko.json'),
    read('public/data/top-teams.json').catch(() => ({ seasons: {} })),
  ]);
  const names = buildNames(reference, ko);
  const fetched = existing.fetched ?? {};
  const dir = new URL('.cache/pokedb/', root);
  await mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const files = [];
  if (args.includes('--fetch')) {
    const response = await fetch(INDEX, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error(`${response.status}: ${INDEX}`);
    const due = dueSeasons((await response.json()).seasons, fetched, Date.now());
    if (!due.length) return console.log('받을 차례인 시즌이 없다.');
    for (const season of due) {
      const number = season.slice(1);
      const record = { at: [], etag: {}, ...fetched[season] };
      let received = false;
      for (const rule of ['single', 'double']) {
        const result = await download(number, rule, record.etag[rule]);
        console.log(`${season} ${rule}: ${result.status}`);
        if (result.status === 'missing') continue;
        received = true;
        if (result.status === 'new') {
          const name = `s${number}_${rule}_ranked_teams.json`;
          await writeFile(new URL(name, dir), result.text);
          files.push({ name, text: result.text });
          record.etag = { ...record.etag, [rule]: result.etag };
        }
        // 한 파일씩 쉬어 간다. 포케DB는 과한 부하를 삼가 달라고 한다.
        await new Promise(resolve => setTimeout(resolve, 2_000));
      }
      // 둘 다 없으면 아직 공개 전이다. 기록하지 않고 다음 날 다시 본다.
      if (received) fetched[season] = { ...record, at: [...record.at, today] };
    }
  } else {
    // 사람이 받아 둔 파일. 받은 날은 파일을 저장한 날로 본다.
    const local = (await readdir(dir)).filter(name =>
      /^s\d+_(single|double)_ranked_teams\.json$/.test(name),
    );
    if (!local.length)
      throw Error('.cache/pokedb/에 s{시즌}_{single|double}_ranked_teams.json을 받아 두세요.');
    for (const name of local.sort()) {
      const file = new URL(name, dir);
      const date = (await stat(file)).mtime.toISOString().slice(0, 10);
      const season = `M${/^s(\d+)/.exec(name)[1]}`;
      const record = { at: [], etag: {}, ...fetched[season] };
      if (!record.at.includes(date)) fetched[season] = { ...record, at: [...record.at, date] };
      files.push({ name, text: await readFile(file, 'utf8') });
    }
  }
  // 받은 시즌만 바꾸고 나머지는 둔다.
  const seasons = { ...existing.seasons };
  const unknown = new Set();
  for (const { name, text } of files) {
    const result = convertFile(JSON.parse(text), reference, names);
    result.unknown.forEach(value => unknown.add(value));
    seasons[result.season] = {
      ...seasons[result.season],
      [result.format]: { updatedAt: result.updatedAt, teams: result.teams },
    };
    console.log(`${name}: ${result.season} ${result.format} ${result.teams.length}팀`);
  }
  // 모르는 이름을 조용히 빈칸으로 두지 않는다. 표에 더한 뒤 다시 돌린다.
  // 자동 받기에서는 이 실패로 작업이 멈추고 GitHub가 저장소 주인에게 알린다.
  if (unknown.size) {
    console.error(`키로 바꾸지 못한 이름 ${unknown.size}개:\n${[...unknown].join('\n')}`);
    process.exitCode = 1;
    return;
  }
  const out = {
    source: {
      name: 'ポケモンバトルデータベース チャンピオンズ',
      url: 'https://champs.pokedb.tokyo/',
    },
    fetched: Object.fromEntries(
      Object.entries(fetched).sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1))),
    ),
    seasons: Object.fromEntries(
      Object.entries(seasons).sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1))),
    ),
  };
  // 파티 한 팀은 한 줄로 쓴다. 파일이 커도 차이를 읽을 수 있게.
  const body = JSON.stringify(out, null, 1).replace(
    /\{\s*"rank": (\d+),\s*"rating": ([\d.]+),\s*"team": \[([^{}]*?)\]\s*\}/g,
    (_, rank, rating, team) =>
      `{ "rank": ${rank}, "rating": ${rating}, "team": ${JSON.stringify(JSON.parse(`[${team}]`))} }`,
  );
  await writeFile(new URL('public/data/top-teams.json', root), `${body}\n`);
  console.log('public/data/top-teams.json을 썼다.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  await main(process.argv.slice(2));
