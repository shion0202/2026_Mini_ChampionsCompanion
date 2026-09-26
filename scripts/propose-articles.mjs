// 빌드 도구. 수집 큐의 포케솔 기사에서 AI 제안을 쓴다. 원문 사이트에 접속하지 않고
// 수집기가 받아 둔 .cache/articles/ 사본만 본다. 판단은 article-parse.mjs가 한다.
// 사용: node scripts/propose-articles.mjs --season M5 [--limit 10]
// 포케솔이 아닌 기사와 카드가 여섯 장이 아닌 기사는 로컬 AI·사람이 본다(article-judging.md).
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { articleKey, buildIndex, pokesolData, pokesolTeam } from './article-parse.mjs';

const root = new URL('../', import.meta.url);
const arg = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const season = (arg('season') ?? 'M5').toUpperCase();
const limit = Number(arg('limit') ?? Infinity);
const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(new URL(path, root), 'utf8'));
  } catch (error) {
    if (fallback !== undefined && error.code === 'ENOENT') return fallback;
    throw error;
  }
};

const [queue, data, skip, reference, ko] = await Promise.all([
  readJson(`.cache/article-queue-${season.toLowerCase()}.json`),
  readJson('public/data/articles.json'),
  readJson('scripts/article-skip.json'),
  readJson('public/data/reference.json'),
  readJson('public/data/ko.json'),
]);
const outPath = `.cache/article-proposals-${season.toLowerCase()}.json`;
const out = await readJson(outPath, { proposals: [] });
const index = buildIndex(reference, ko);
// pending 기록은 다시 볼 기록이라 제안을 쓴다. 검토 화면이 기록과 제안의 다른 칸을 알린다.
const reviewed = data.articles.filter(article => article.review?.status !== 'pending');
const done = new Set(
  [...reviewed, ...skip.skipped, ...out.proposals].map(record => articleKey(record.url)),
);

// 포케솔의 시즌은 'm-5', 형식은 'single'/'double'이다.
const FORMATS = { single: 'Singles', double: 'Doubles' };
const pending = queue.entries.filter(
  entry => /^https?:\/\/pokesol\.app\//.test(entry.url) && !done.has(articleKey(entry.url)),
);
let written = 0;
for (const entry of pending) {
  if (written >= limit) break;
  const file = `.cache/articles/${createHash('sha1').update(entry.url).digest('hex')}.html`;
  const html = await readFile(new URL(file, root), 'utf8').catch(() => null);
  const route = html && pokesolData(html);
  if (!route) {
    console.log(`건너뜀(사본·데이터 없음) ${entry.url}`);
    continue;
  }
  const { author, battleFormat, season: sourceSeason, cards } = pokesolTeam(route, index);
  const notes = [`포케솔 본문의 포켓몬 카드 ${cards.length}장에서 읽음. 이미지는 보지 않았다.`];
  let verdict = 'party';
  if (cards.length !== 6) {
    verdict = 'unsure';
    notes.push(
      cards.length
        ? `카드가 ${cards.length}장이라 최종 여섯 마리를 본문에서 골라야 한다: ${cards.map(card => card.name).join(', ')}`
        : '포켓몬 카드가 없다. 팀 이미지로 판정해야 한다.',
    );
  }
  const seasonMatch = sourceSeason.replace('-', '').toUpperCase() === season;
  if (!seasonMatch) {
    verdict = 'unsure';
    notes.push(`기사 설정 시즌이 ${sourceSeason || '없음'}이다.`);
  }
  const blanks = cards.filter(card => !card.pokemon || !card.item);
  if (blanks.length && cards.length === 6)
    notes.push(
      `키로 못 바꿔 비운 칸: ${blanks.map(card => `${card.name || '?'}@${card.itemName || '?'}`).join(', ')}`,
    );
  const proposal = {
    url: entry.url,
    verdict,
    author,
    rank: entry.rank,
    season,
    format: FORMATS[battleFormat] ?? '',
    ...(verdict === 'party'
      ? {
          team: cards.map(({ pokemon, item }) => ({ pokemon, item })),
          teamEvidence:
            '원문 본문에 작성자가 넣은 포켓몬 카드(포켓몬·도구 데이터)에서 여섯 마리와 도구를 확인.',
        }
      : {}),
    note: notes.join(' '),
  };
  out.proposals = out.proposals
    .filter(old => articleKey(old.url) !== articleKey(entry.url))
    .concat(proposal);
  written += 1;
  console.log(
    [entry.rank ?? '-', author, verdict, `빈칸 ${verdict === 'party' ? blanks.length : '-'}`].join(
      ' | ',
    ),
  );
}
await writeFile(new URL(outPath, root), `${JSON.stringify(out, null, 2)}\n`);
console.log(`제안 ${written}건을 ${outPath}에 썼다. 남은 포케솔 ${pending.length - written}건.`);
