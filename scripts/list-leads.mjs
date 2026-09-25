// 사람이 저장한 목록 페이지(또는 주소 목록)에서 수집기가 무엇을 리드로 쓰고 무엇을
// 버리는지 보인다. 네트워크를 쓰지 않는다. robots.txt 판정은 수집 때 한다.
// 사용: node scripts/list-leads.mjs leads/pokedb-mb01.html [...]
import { readFile } from 'node:fs/promises';
import { extractLinks, humanOnly, isLeadLink, pageUrlOf, parseTitle } from './article-parse.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용: node scripts/list-leads.mjs leads/목록.html [...]');
  process.exit(1);
}

for (const file of files) {
  const body = await readFile(file, 'utf8');
  const html = /<a\b/i.test(body);
  const base = html ? pageUrlOf(body) : undefined;
  const links = extractLinks(body, base);
  const kept = links.filter(link => !html || isLeadLink(link, base));
  const dropped = links.filter(link => !kept.includes(link));
  console.log(`\n원래 페이지: ${base ?? '알 수 없음 (그 사이트 자체 링크가 섞일 수 있다)'}`);
  console.log(`${file}: 링크 ${links.length}건, 리드 ${kept.length}건, 버림 ${dropped.length}건`);
  // 사람 검토로 갈 것은 표시한다. robots.txt 판정은 네트워크가 필요해 수집 때 한다.
  console.log('\n[리드] 순위 힌트 / 주소 / 사람 검토 이유');
  for (const link of kept) {
    const rank = parseTitle(`${link.title} ${link.context}`).rank ?? link.rankHint;
    const reason = humanOnly(link.url);
    console.log(
      `  ${rank == null ? '   -' : String(rank).padStart(4)}위  ${link.url}${reason ? `  [${reason}]` : ''}`,
    );
  }
  // 버린 링크에 파티 기사가 섞여 있으면 추출 규칙을 고쳐야 한다.
  console.log('\n[버림]');
  for (const link of dropped) console.log(`  ${link.url}  ${link.title.slice(0, 40)}`);
}
