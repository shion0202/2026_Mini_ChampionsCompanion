// 빌드 도구. 포켓몬 배틀 데이터베이스 챔피언스(포케DB)가 공개한 상위 구축 데이터를
// 앱이 읽을 public/data/top-teams.json으로 바꾼다. 네트워크를 쓰지 않는다.
// 사람이 https://champs.pokedb.tokyo/opendata/s{시즌}_{single|double}_ranked_teams.json 을
// .cache/pokedb/에 받아 두고 `npm run top-teams`를 돌린다. 포케DB는 사용자 기기에서 직접
// 받지 말고 한 번 받아 두고 쓰라고 안내한다. 그래서 앱은 우리 사이트의 사본만 읽는다.
import { readdir, readFile, writeFile } from 'node:fs/promises';
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

async function main() {
  const root = new URL('../', import.meta.url);
  const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [reference, ko] = await Promise.all([
    read('public/data/reference.json'),
    read('public/data/ko.json'),
  ]);
  const names = buildNames(reference, ko);
  const dir = new URL('.cache/pokedb/', root);
  const files = (await readdir(dir)).filter(name =>
    /^s\d+_(single|double)_ranked_teams\.json$/.test(name),
  );
  if (!files.length)
    throw Error('.cache/pokedb/에 s{시즌}_{single|double}_ranked_teams.json을 받아 두세요.');
  const seasons = {};
  const unknown = new Set();
  for (const name of files.sort()) {
    const result = convertFile(
      JSON.parse(await readFile(new URL(name, dir), 'utf8')),
      reference,
      names,
    );
    result.unknown.forEach(value => unknown.add(value));
    seasons[result.season] ??= {};
    seasons[result.season][result.format] = { updatedAt: result.updatedAt, teams: result.teams };
    console.log(`${name}: ${result.season} ${result.format} ${result.teams.length}팀`);
  }
  // 모르는 이름을 조용히 빈칸으로 두지 않는다. 표에 더한 뒤 다시 돌린다.
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
    seasons,
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
