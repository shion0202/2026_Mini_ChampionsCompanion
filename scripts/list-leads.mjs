// 사람이 저장한 목록 페이지(또는 주소 목록)에서 수집기가 무엇을 리드로 쓰고 무엇을
// 버리는지 보인다. 네트워크를 쓰지 않는다. robots.txt 판정은 수집 때 한다.
// 사용: node scripts/list-leads.mjs leads/pokedb-mb01.html [...]
import { readFile } from 'node:fs/promises';
import { extractLinks, isLeadLink, parseTitle } from './article-parse.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용: node scripts/list-leads.mjs leads/목록.html [...]');
  process.exit(1);
}

for (const file of files) {
  const body = await readFile(file, 'utf8');
  const html = /<a\b/i.test(body);
  const links = extractLinks(body);
  const kept = links.filter(link => !html || isLeadLink(link));
  const dropped = links.filter(link => !kept.includes(link));
  console.log(`\n${file}: 링크 ${links.length}건, 리드 ${kept.length}건, 버림 ${dropped.length}건`);
  console.log('\n[리드] 순위 힌트 / 주소');
  for (const link of kept) {
    const rank = parseTitle(`${link.title} ${link.context}`).rank;
    console.log(`  ${rank === null ? '   -' : String(rank).padStart(4)}위  ${link.url}`);
  }
  // 버린 링크에 파티 기사가 섞여 있으면 추출 규칙을 고쳐야 한다.
  console.log('\n[버림]');
  for (const link of dropped) console.log(`  ${link.url}  ${link.title.slice(0, 40)}`);
}
