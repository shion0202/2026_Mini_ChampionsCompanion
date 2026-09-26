# 구축 기사 — 인수인계

다른 대화(로컬 Claude Code 등)에서 이어받을 때 **이 문서부터** 읽는다. 지금 어디까지 왔고
다음에 무엇을 하면 되는지만 적는다. 설계와 근거는 아래 문서에 있다.

| 문서 | 내용 |
| --- | --- |
| [articles.md](articles.md) | 등록 기준(무엇을 공개하는가). 앱의 조회 규칙 |
| [article-collection.md](article-collection.md) | 수집기 설계: 리드 채널, robots.txt, 게임 거르기, 첫 페이지, 인코딩 |
| [article-judging.md](article-judging.md) | 검토 화면 사용법과 **AI 제안** 절차 |
| [battle-tools-plan.md](battle-tools-plan.md) | 남은 기능(배틀 어시스트·엔트리 픽·파티 상성/추천) 설계. 아직 구현 전 |

## 지금 상태 (2026-09-27)

- 작업 브랜치 `claude/hopeful-cori-ip4m35`. **main에 아직 합치지 않았다.** 배포(Cloudflare
  Pages)는 main 기준이므로 앱의 기사 목록 개선도 합쳐야 보인다.
- 앱: 구축 기사 화면에 여러 포켓몬 AND 필터, 낱말 AND 검색, 최종 순위 범위, 최근 게시순,
  "채용이 많은/함께 채용된 포켓몬" 집계가 들어갔다. 원문 주소는 http도 받는다.
- 수집: M-5 싱글은 포케DB 목록 `leads/pokedb-mb01~07.html`(사람이 저장, 커밋 안 함)과 작성자
  피드로 큐를 모았다. 큐는 `.cache/article-queue-m5.json`.
- 검토: 검토 화면으로 공개한 기록은 **사용자 PC의 `public/data/articles.json`에만 있을 수
  있다.** 이어서 작업하기 전에 `git status`로 확인하고 커밋한다.
- 제안: 포케솔 기사는 본문의 포켓몬 카드 데이터로 `npm run propose`가 제안을 쓴다(이미지 안 봄).
  포케솔 70건은 사람이 모두 확인했다. 카드가 없어 `unsure`였던 것은 대부분 틀려 사람이 고쳤다.
- 2026-09-27: 공개 기록 105건. 재검토 6건도 다시 확정했다. 큐에는 약 100건이 남았다.
  사람이 고친 것: 88위(블로그 첫 페이지 주소에서 옮기며 예전 파티가 남아 있었다. 옮기기가
  화면의 값을 버리던 버그를 고쳤다), 499위 히스이 파티(`ゾロアーク(ヒスイ)` 괄호 표기를 몰라
  기본 폼으로 채웠다. 고쳤다), 순위(제목의 `N位`를 못 읽었다. 고쳤다).
- 순위 없음: 원문에 최종 순위가 없는 기사는 검토 화면의 [순위 없음]으로 `rank: null`을 쓴다.
- 남은 큐를 새 규칙(괄호 폼·`@` 제목·순위)으로 다시 판단하려면 1단계를
  `--no-search --no-feeds`로 한 번 돌린다. 원문은 캐시를 쓰고, 캐시에 없는 이미지만 받는다.
  돌리지 않아도 검토 화면은 제목에서 순위를 다시 읽는다.

## 흐름

| 단계 | 누가 | 명령 / 파일 | 결과 |
| --- | --- | --- | --- |
| 1 수집 | 수집기 | `npm run articles -- --season M5 --format singles --urls leads\\pokedb-mb01.html ... --no-search` | `.cache/article-queue-m5.json`, 원문·이미지 캐시 `.cache/articles/`, 사람 검토 목록 `leads/review-m5.txt` |
| 2 제안 | 스크립트 → 로컬 AI | `npm run propose -- --season M5`(포케솔), 나머지는 [article-judging.md](article-judging.md) "AI 제안" | `.cache/article-proposals-m5.json` |
| 3 검토 | 사람 | `npm run review -- --season M5` → <http://localhost:4180> | `public/data/articles.json`(추가), `scripts/article-skip.json`(제외) |
| 4 공개 | 사람 | `node --test tests/articles.test.mjs` → 커밋 → main 병합 | 배포된 앱에 표시 |

보조 명령:

- `npm run leads -- leads\\파일.html`: 저장한 목록 페이지에서 어떤 링크를 쓰고 버리는지(네트워크 없음)
- 작성자 피드까지 다시 찾기: 1단계를 `--urls` 없이 `--no-search`로 한 번 더

## 파일

| 경로 | 커밋 | 내용 |
| --- | --- | --- |
| `public/data/articles.json` | O | 공개 기록. `reviewed`만 앱에 보인다 |
| `scripts/article-skip.json` | O | 제외한 주소와 이유. 수집기가 다시 올리지 않는다 |
| `scripts/article-feeds.json` | O | 따로 볼 작성자 피드(비어 있음) |
| `leads/` | X (gitignore) | 사람이 저장한 목록 페이지, `review-<시즌>.txt`(사람이 직접 볼 기사) |
| `.cache/` | X (gitignore) | 큐, 제안, 원문·이미지 캐시 |
| `scripts/collect-articles.mjs` | O | 수집기 CLI |
| `scripts/propose-articles.mjs` | O | 포케솔 AI 제안 CLI(캐시만 읽음) |
| `scripts/article-parse.mjs` | O | 수집 판단(순수 함수). 테스트 `tests/article-parse.test.mjs` |
| `scripts/review-articles.mjs`, `scripts/review-page.html` | O | 검토 화면 서버·화면 |
| `scripts/article-review.mjs` | O | 검토 판단(순수 함수). 테스트 `tests/article-review.test.mjs` |

## 정해 둔 것 (다시 논의하지 않아도 되는 것)

- **robots.txt로 AI 수집을 막은 곳은 받지 않는다.** 네이버 블로그·카페, 포케DB, 야쿤 등.
  주소 목록으로 넘겨도 같다. 이런 기사, X 게시물, YouTube 영상, 받기 실패, 블로그 첫 페이지는
  `leads/review-<시즌>.txt`에 쌓이고 사람이 원문을 보고 직접 기록한다.
- **포케DB 카드의 팀 자료는 쓰지 않는다.** 링크(원문 주소)와 옆 글(순위, 이름)만 쓴다.
- **도구를 모르면 없음(`null`)으로 바꾸지 않는다.** 모르는 칸이 있으면 추가되지 않는다.
- AI는 `articles.json`을 고치지 않는다. 제안 파일만 쓰고 공개는 사람이 한다.
- 원문 사이트에 AI가 직접 접속하지 않는다. `.cache`만 본다.
- 구글 Custom Search는 신규 가입이 닫혔고 2027-01-01에 끝난다. 하테나 검색은 재현율이 낮다.
  포케DB 목록을 사람이 저장해 넘기는 쪽이 주 경로다.

## 다음 할 일 (순서대로)

1. 이미 확정한 105건이 앱에서 잘 보이는지 사람이 확인하고 커밋한다(2026-09-27 진행 중).
2. **note(50건)·하테나 등 블로그(약 80건)에 AI 제안을 쓴다.** 먼저 10건으로 사본의
   `포켓몬@도구` 줄만 읽어 되는지 보고, 모자란 것만 이미지를 본다.
   절차는 [article-judging.md](article-judging.md).
3. `leads/review-m5.txt`의 기사(네이버·야쿤·X·YouTube 등)는 사람이 원문을 보고 직접 넣는다.
   검토 화면에서 새 기사를 만드는 기능은 없으므로 `articles.json`에 손으로 쓰거나 AI에게
   사실(여섯 마리·도구·순위)을 불러 주고 기록을 만들게 한다.
4. 이 브랜치를 main에 합친다(PR). 배포된 앱에서 기사 화면을 확인한다.
5. (선택) 적중 측정: 제안과 확정 기록을 비교해 칸별 적중률을 출력하는 스크립트. 제안
   절차를 고칠 때 근거가 된다. 지금은 대화에서 한 줄 명령으로 셌다.
6. 다른 시즌(M-4 등)과 더블. 포케DB 목록 저장 → 1~4 반복.
7. 남은 기능: [battle-tools-plan.md](battle-tools-plan.md). 추천 순서는 공통 대면 계산 →
   파티 상성 확인 → 배틀 어시스트 → 엔트리 픽 → 빈자리 추천.

## 알아 둘 것

- 검토 서버는 화면 파일을 열 때마다 읽는다. 서버 코드(`review-articles.mjs`, `article-review.mjs`)를
  고쳤으면 서버를 다시 켠다.
- 수집기는 돌 때마다 이전 큐 전체를 캐시로 다시 판단한다. 규칙을 고친 뒤 한 번 돌리면 큐가
  새 규칙으로 정리된다(원문은 다시 받지 않는다).
- `.prettierrc`가 `endOfLine: "crlf"`다. 저장소 파일은 LF라서 Linux에서 `npm run format`을
  돌리면 모든 파일이 바뀐다. Windows에서는 Git 줄바꿈 변환 때문에 문제가 없을 수 있다.
  클라우드 세션에서는 `npx prettier --write --end-of-line lf <파일>`로 고친 파일만 맞췄다.
- 테스트: `npm test`(2026-09-27 기준 461개 통과). 조회 규칙 테스트는 `articles.json`의 처음
  두 기록(シグマ, rebo®)만 쓴다. 기록이 늘어도 기대값이 바뀌지 않게 하려는 것이다.

## 새 대화 시작용 문장

로컬 Claude Code에 붙여 넣는다.

> docs/articles-handoff.md를 읽고 이어서 작업하자. 먼저 git status로 내 로컬 변경을 확인하고,
> docs/article-judging.md의 "AI 제안" 절차대로 .cache/article-queue-m5.json의 포케솔이 아닌
> 기사 앞에서 10건의 제안을 .cache/article-proposals-m5.json에 써 줘. 이미지보다 사본의
> `포켓몬@도구` 줄을 먼저 봐. 원문 사이트에는 접속하지 말고 .cache만 봐.
