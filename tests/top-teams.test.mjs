import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildNames, convertFile } from '../scripts/update-top-teams.mjs';
import {
  memberBase,
  pickTopTeamSeason,
  teamsWith,
  topTeamSeasons,
  topTeamUsage,
} from '../src/top-teams.js';
import { renderTopTeams } from '../src/top-teams-view.js';
import { createLocale } from '../src/locale.js';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [reference, ko, published] = await Promise.all(['reference', 'ko', 'top-teams'].map(read));
const names = buildNames(reference, ko);
const locale = createLocale(ko);

// 포케DB 공개 JSON 모양. 폼은 이름으로, 메가는 기본 포켓몬 + 메가스톤으로 온다.
const member = (pokemon, form, item) => ({ id: '', pokemon, form, item });
const pokedb = {
  season: 'M-5',
  season_number: 5,
  rule: 'シングル',
  updated_at: '2026-09-21 20:24:28',
  teams: [
    {
      rank: 1,
      rating_value: 2626.829,
      team: [
        member('ガブリアス', '', 'オボンのみ'),
        member('ゲンガー', '', 'ゲンガナイト'),
        member('ダイケンキ', 'ヒスイのすがた', 'くろいメガネ'),
        member('フラエッテ', 'えいえんのはな', 'フラエッテナイト'),
        member('ロトム', 'ウォッシュロトム', '持ち物なし'),
        member('イダイトウ', 'メスのすがた', ''),
      ],
    },
    {
      rank: 2,
      rating_value: 2600.5,
      team: [
        member('ビビヨン', 'ファンシーなもよう', 'きあいのタスキ'),
        member('ビビヨン', 'こおりのもよう', 'きあいのタスキ'),
        member('ギルガルド', 'シールドフォルム', 'たべのこし'),
        member('イダイトウ', 'オスのすがた', 'こだわりスカーフ'),
        member('', '', ''),
        member('ナゾノクサ', 'ふしぎなすがた', 'ぎんのこな'),
      ],
    },
  ],
};

test('pokedb teams become app keys; megas, forms, no item and unknown stay distinct', () => {
  const result = convertFile(pokedb, reference, names);
  assert.equal(result.season, 'M5');
  assert.equal(result.format, 'Singles');
  assert.deepEqual(result.teams[0], {
    rank: 1,
    rating: 2626.829,
    team: [
      ['garchomp', 'sitrusberry'],
      ['gengarmega', 'gengarite'],
      ['samurotthisui', 'blackglasses'],
      ['floettemega', 'floettite'],
      ['rotomwash', null],
      ['basculegionf', ''],
    ],
  });
  assert.deepEqual(
    result.teams[1].team.slice(0, 5),
    [
      ['vivillonfancy', 'focussash'],
      ['vivillon', 'focussash'],
      ['aegislash', 'leftovers'],
      ['basculegion', 'choicescarf'],
      ['', ''],
    ],
    '랭킹에 따로 있는 팬시 무늬만 폼으로 두고, 빈 칸은 공개하지 않은 칸이다',
  );
  assert.ok(
    result.unknown.has('포켓몬 ナゾノクサ ふしぎなすがた'),
    '모르는 폼은 조용히 넘기지 않고 알린다',
  );
  assert.equal(result.teams[1].team[5][0], '');
});

test('the published file uses only known keys', () => {
  for (const [season, formats] of Object.entries(published.seasons))
    for (const [format, { teams }] of Object.entries(formats))
      for (const { rank, team } of teams) {
        assert.equal(team.length, 6, `${season} ${format} ${rank}`);
        for (const [pokemon, item] of team) {
          assert.ok(pokemon === '' || reference.species[pokemon], `${season} ${rank} ${pokemon}`);
          assert.ok(item === null || item === '' || reference.held_item[item], `${rank} ${item}`);
        }
      }
});

test('a season in progress falls back to the latest finished one and says so', () => {
  const data = convertFile(pokedb, reference, names);
  const file = { seasons: { M5: { Singles: data }, M4: { Singles: data } } };
  assert.deepEqual(topTeamSeasons(file, 'Singles'), ['M5', 'M4']);
  assert.deepEqual(pickTopTeamSeason(file, 'Singles', 'M4'), { season: 'M4', substituted: false });
  assert.deepEqual(pickTopTeamSeason(file, 'Singles', 'M6'), { season: 'M5', substituted: true });
  assert.deepEqual(pickTopTeamSeason(file, 'Doubles', 'M6'), { season: null, substituted: false });
});

test('a pokemon matches its megas, and usage counts its items and teammates', () => {
  assert.equal(
    memberBase('floettemega', reference),
    'floetteeternal',
    'megas 목록으로 주인을 찾는다',
  );
  assert.equal(memberBase('charizardmegay', reference), 'charizard');
  const { teams } = convertFile(pokedb, reference, names);
  assert.equal(teamsWith(teams, 'gengar', reference).length, 1);
  assert.equal(teamsWith(teams, 'basculegion', reference).length, 1, '암컷은 다른 폼이다');
  const usage = topTeamUsage(teams, 'floetteeternal', reference);
  assert.deepEqual(usage.items, [{ id: 'floettite', count: 1 }]);
  assert.ok(
    usage.mates.some(row => row.id === 'gengar'),
    '메가는 주인 종으로 센다',
  );
});

test('the tab shows the fallback note, hidden members, item states and the source', () => {
  const data = convertFile(pokedb, reference, names);
  const state = {
    data: {
      source: { name: 'ソース<script>', url: 'https://champs.pokedb.tokyo/' },
      seasons: { M5: { Singles: data } },
    },
    season: 'M5',
    substituted: true,
    wanted: 'M6',
    seasons: ['M5'],
    format: 'Singles',
    limit: 1,
  };
  const markup = renderTopTeams(state, 'garchomp', reference, locale);
  assert.match(markup, /M-6[^<]*진행 중/);
  assert.match(markup, /2개 파티 중 <strong>1개<\/strong>/);
  assert.match(markup, /도구 없음/);
  assert.match(markup, /도구 미공개/);
  assert.ok(markup.includes('ソース&lt;script&gt;'), '출처 이름을 이스케이프한다');
  assert.ok(markup.includes('top-team-selected'));
  const two = renderTopTeams({ ...state, limit: 1 }, 'basculegion', reference, locale);
  assert.match(two, /비공개/);
  assert.equal(
    renderTopTeams({ ...state, limit: 5 }, 'pikachu', reference, locale).includes(
      '채용한 기록이 없습니다',
    ),
    true,
  );
});
