// 빌드 도구. 도감·계산기·내 샘플이 쓰는 reference.json이 낡았는지 매일 살피고, 새로 알아낸
// 것만 디스코드 웹훅으로 알린다. reference.json은 원본(Showdown, champout)의 버전을 고정해
// 만들기 때문에 새 레귤레이션을 저절로 따라가지 않는다. 대전 규칙 변경이 섞여 들어오므로
// 자동으로 바꾸지 않고 사람에게 알린다. 갱신 방법은 README의 '레귤레이션이 바뀌면'.
// - `node scripts/watch-upstream.mjs`: 살피고 알린다. 웹훅 주소는 환경 변수 DISCORD_WEBHOOK_URL.
// - `node scripts/watch-upstream.mjs --message "문장"`: 그 문장만 보낸다(다른 작업의 실패 알림).
// 보낸 알림은 scripts/watch-state.json에 남겨 같은 알림을 되풀이하지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SEASON_REGULATIONS, SOURCE, toId } from '../src/data.js';

// 라인업·배우는 기술·도구 파일만 본다. moves.ts·abilities.ts에는 대전 동작 수정(저주,
// 비상탈출 등)이 거의 매주 들어와 알리면 소음이 된다. 레귤레이션이 바뀌면 기술·특성 수치도
// 이 세 파일과 함께 바뀌므로 여기서 잡힌다.
export const SHOWDOWN_FILES = [
  'data/mods/champions/learnsets.ts',
  'data/mods/champions/formats-data.ts',
  'data/mods/champions/items.ts',
];
const seasonNumber = season => Number(season.slice(1));
const list = (values, limit = 15) =>
  values.length > limit
    ? `${values.slice(0, limit).join(', ')} 외 ${values.length - limit}개`
    : values.join(', ');

// 최신 랭킹에 reference.json이 모르는 포켓몬·기술·도구가 있는지. 지금 자료가 맞으면 0건이다.
export function findStale(reference, index, snapshot) {
  const moveKey = new Map(Object.entries(reference.move).map(([key, move]) => [move.name, key]));
  const itemKey = new Map(
    Object.entries(reference.held_item).map(([key, item]) => [item.name, key]),
  );
  const missing = [];
  const items = new Set();
  const moves = [];
  for (const [name, entry] of Object.entries(snapshot.pokemon ?? {})) {
    const species = reference.species[toId(name)];
    const learnset =
      species?.learnset ?? reference.species[toId(index.pokemon?.[name]?.learnset ?? '')]?.learnset;
    if (!species || !learnset) {
      missing.push(name);
      continue;
    }
    for (const [move] of entry.move ?? [])
      if (!learnset.includes(moveKey.get(move) ?? toId(move))) moves.push(`${name}: ${move}`);
    for (const [item] of entry.held_item ?? []) {
      const record = reference.held_item[itemKey.get(item) ?? toId(item)];
      if (!record || record.champions === false) items.add(item);
    }
  }
  return { missing, items: [...items], moves };
}

// 알릴 것을 { key, text }로 모은다. key가 같으면 한 번만 알린다.
export function findIssues({ reference, index, snapshots, regulations, upstream }) {
  const issues = [];
  const latest = [...index.seasons].sort(
    (a, b) => seasonNumber(b.season) - seasonNumber(a.season),
  )[0];
  const season = latest?.season;
  if (season && !regulations[season])
    issues.push({
      key: `regulation:${season}`,
      text: `새 시즌 ${season}이 시작됐습니다. src/data.js의 SEASON_REGULATIONS에 레귤레이션을 적어 주세요. 레귤레이션이 바뀌었다면 도감 자료도 갱신해야 합니다.`,
    });
  for (const [format, snapshot] of Object.entries(snapshots)) {
    const { missing, items, moves } = findStale(reference, index, snapshot);
    const where = `${season} ${format === 'Doubles' ? '더블' : '싱글'} 랭킹`;
    if (missing.length)
      issues.push({
        key: `missing:${season}`,
        text: `${where}에 도감에 없는 포켓몬이 있습니다: ${list(missing)}`,
      });
    if (moves.length)
      issues.push({
        key: `moves:${season}`,
        text: `${where}에서 앱이 배울 수 없다고 보는 기술을 쓰고 있습니다: ${list(moves)}`,
      });
    if (items.length)
      issues.push({
        key: `items:${season}`,
        text: `${where}에서 앱이 챔피언스에 없다고 보는 도구를 쓰고 있습니다: ${list(items)}`,
      });
  }
  if (upstream.showdown.length)
    issues.push({
      key: `showdown:${upstream.showdown[0].sha}`,
      text: `Showdown 챔피언스 자료가 바뀌었습니다(고정 버전 이후 ${upstream.showdown.length}건):\n${upstream.showdown
        .slice(0, 5)
        .map(c => `- ${c.date} ${c.message}`)
        .join('\n')}`,
    });
  if (upstream.champout.length)
    issues.push({
      key: `champout:${upstream.champout[0].sha}`,
      text: `champout(게임 데이터)이 바뀌었습니다(고정 버전 이후 ${upstream.champout.length}건):\n${upstream.champout
        .slice(0, 5)
        .map(c => `- ${c.date} ${c.message}`)
        .join('\n')}`,
    });
  // 같은 key가 싱글·더블에서 둘 다 나오면 하나로 합친다.
  const merged = new Map();
  for (const issue of issues)
    merged.set(
      issue.key,
      merged.has(issue.key)
        ? { ...issue, text: `${merged.get(issue.key).text}\n${issue.text}` }
        : issue,
    );
  return [...merged.values()];
}

async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.json();
}

// 고정한 커밋 이후에 바뀐 커밋. GitHub API는 Actions의 GITHUB_TOKEN이 있으면 그것으로 부른다.
async function commitsSince(repo, pinned, paths) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'ChampionsCompanion',
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
  const base = `https://api.github.com/repos/${repo}`;
  const since = (await json(`${base}/commits/${pinned}`, headers)).commit.committer.date;
  const seen = new Map();
  for (const path of paths) {
    const query = `since=${since}&per_page=30${path ? `&path=${encodeURIComponent(path)}` : ''}`;
    for (const commit of await json(`${base}/commits?${query}`, headers))
      if (commit.sha !== pinned)
        seen.set(commit.sha, {
          sha: commit.sha.slice(0, 10),
          date: commit.commit.committer.date.slice(0, 10),
          message: commit.commit.message.split('\n')[0],
        });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// 디스코드는 한 메시지에 2000자까지 받는다.
export async function notify(text) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log(`DISCORD_WEBHOOK_URL이 없어 보내지 않았다:\n${text}`);
    return false;
  }
  const content = text.length > 1900 ? `${text.slice(0, 1900)}\n…` : text;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '챔피언스 컴패니언', content }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw Error(`디스코드 웹훅 응답 ${response.status}`);
  return true;
}

async function main(args) {
  const at = args.indexOf('--message');
  if (at !== -1) {
    await notify(args[at + 1] ?? '');
    return;
  }
  const root = new URL('../', import.meta.url);
  const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [reference, state, script] = await Promise.all([
    read('public/data/reference.json'),
    read('scripts/watch-state.json').catch(() => ({ notified: {} })),
    readFile(new URL('scripts/update-reference.mjs', root), 'utf8'),
  ]);
  const pinned = name => new RegExp(`const ${name} = '([0-9a-f]{40})'`).exec(script)[1];
  const index = await json(`${SOURCE}/data/meta/index.json`);
  const latest = [...index.seasons].sort(
    (a, b) => seasonNumber(b.season) - seasonNumber(a.season),
  )[0];
  const snapshots = {};
  for (const format of latest.formats)
    snapshots[format] = await json(
      `${SOURCE}/data/meta/${latest.season}/${latest.dates[0]}/${format}.json`,
    );
  const upstream = {
    showdown: await commitsSince('smogon/pokemon-showdown', pinned('SHOWDOWN'), SHOWDOWN_FILES),
    champout: await commitsSince('projectpokemon/champout', pinned('CHAMPOUT'), ['']),
  };
  const issues = findIssues({
    reference,
    index,
    snapshots,
    regulations: SEASON_REGULATIONS,
    upstream,
  });
  const fresh = issues.filter(issue => !state.notified[issue.key]);
  console.log(`살핀 결과 ${issues.length}건, 새로 알릴 것 ${fresh.length}건.`);
  if (!fresh.length) return;
  const text = [
    '**도감·계산기 자료 갱신이 필요해 보입니다**',
    ...fresh.map(issue => `• ${issue.text}`),
    '갱신 방법: README의 ‘레귤레이션이 바뀌면’ (https://github.com/shion0202/2026_Mini_ChampionsCompanion#레귤레이션이-바뀌면)',
  ].join('\n');
  if (!(await notify(text))) return;
  const today = new Date().toISOString().slice(0, 10);
  for (const issue of fresh) state.notified[issue.key] = today;
  await writeFile(new URL('scripts/watch-state.json', root), `${JSON.stringify(state, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  await main(process.argv.slice(2));
