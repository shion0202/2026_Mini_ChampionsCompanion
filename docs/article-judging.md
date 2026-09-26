# 구축 기사 판정 절차 (3단계)

수집기(`npm run articles`)가 쌓은 큐를 AI 코딩 도구(Claude Code, GPT 계열 등)가 판정하는 절차다. 등록 기준은
[articles.md](articles.md)가 정하고, 이 문서는 **그 기준을 큐에 적용하는 순서**만 적는다.
판정 결과는 모두 `pending`이다. 공개(`reviewed`)는 사람이 한다.

요청 예:

> docs/article-judging.md 절차대로 .cache/article-queue-m5.json에서 순위가 높은 5건을 판정해 줘

## 입력

- `.cache/article-queue-<시즌>.json`의 `entries[]`. 기사마다 제목 파싱 결과(`rank`,
  `season`, `format`), 후보 포켓몬 최대 16마리(`candidates[]`: 기본 종족 키 `base`, 본문에서
  찾은 폼 `forms`, 근처 도구 `items`, 발췌 `excerpts`), `flags`, 이미지 주소 `images[]`와
  같은 순서의 캐시 파일 `imageFiles[]`가 있다.
- 원문 HTML은 `.cache/articles/<주소의 sha1>.html`에 있다.

## 원칙

- **원문 전문을 읽지 않는다.** 큐의 후보·발췌와 팀 이미지로 판단하고, 부족할 때만 캐시
  HTML에서 필요한 이름 주변을 검색해 짧게 본다.
- 팀 이미지가 판정의 중심이다. 본문에는 도구가 빠지는 일이 흔하다(메가스톤, 스카프).
- 모르는 것은 채우지 않는다. 확신이 없으면 3-3으로 넘긴다.
- **원문 사이트에 접속하지 않는다.** `.cache`에 있는 파일만 쓴다. 수집기가 robots.txt로
  거른 범위를 벗어나지 않기 위해서다. 이미지를 볼 수 없는 도구라면 모두 3-3으로 넘긴다.

## 순서

한 번에 요청받은 건수만 처리한다. **큐의 앞에서부터** 처리한다. 수집기가 사람이 고른
주소(`source`가 `manual`·`index`, 포케DB 목록 등)를 앞에, 그 안에서 순위순으로 정렬해 둔다.
검색·피드(`feed`, `hatena`)에서 온 기사는 다른 게임 기사가 섞일 수 있어 뒤에 둔다.

게임 플래그: `before-champions`(M-1 시작 2026-04-08 이전 글), `other-game`(소드실드·SV
표기만 있음)은 사람이 고른 주소에만 남는다. 둘 중 하나가 있으면 3-2로 넘기기 전에 한 번
더 본다. `no-champions-mention`은 챔피언스 표기가 없다는 뜻일 뿐이라 이미지로 판단한다.

### 1. 이미지 확인

`imageFiles` 중 null이 아닌 이미지 파일을 열어 본다. 인게임 팀 화면(여섯 마리와 도구 아이콘)이나
작성자가 만든 파티 이미지를 찾는다. 트레이너 카드, 상대 파티, 과거 시즌 파티, 교체 전
구성은 쓰지 않는다([articles.md](articles.md) 2·3번). 이미지 속 별명을 종 이름으로 읽지 않는다.

`image-not-cached` 플래그가 있거나 쓸 만한 이미지가 없으면 후보 발췌와 본문 검색만으로
판단하되, 도구 여섯 개가 모두 확인되지 않으면 3-3으로 넘긴다.

### 2. 대조

- 여섯 마리: 이미지와 후보 목록(`candidates[].base`, `forms`)을 맞춘다. 후보에 없는
  포켓몬이 이미지에 있으면 캐시 HTML에서 그 이름을 검색해 확인한다.
- 메가: 최종 메가 폼 키를 쓴다(`charizardmegay`, `lucariomega`). 메가스톤은 폼에서 정해진다.
- 도구: 이미지 아이콘과 `candidates[].items`를 맞춘다. 없음이 **확인된 경우만** `null`.
- 순위: 제목의 `最終N位`, 또는 `rank-from-hint`면 목록 페이지에서 읽은 순위다. 본문
  도입부·마무리에서 시즌 최종 순위인지 확인한다. 최고 순위, 중간 순위, 월간 챌린지
  (`monthly-challenge`) 순위는 쓰지 않는다.
- 시즌·형식: `season-missing`, `format-missing`이면 본문(시즌 표기, 싱글/더블, 선출 3/4)으로 정한다.

키는 `public/data/reference.json`의 키다. 찾을 때:

```
node -e "const r=require('./public/data/reference.json');console.log(Object.keys(r.species).filter(k=>k.includes('garchomp')))"
node -e "const r=require('./public/data/reference.json');console.log(Object.entries(r.held_item).filter(([k,v])=>v.japanese?.includes('スカーフ')).map(([k])=>k))"
```

### 3. 기록

판정마다 셋 중 하나로 끝낸다.

**3-1 파티 확정 → `public/data/articles.json`의 `articles` 끝에 추가**

```json
{
  "id": "m5-singles-twistserve",
  "season": "M5",
  "format": "Singles",
  "rank": 84,
  "author": "TwistServe",
  "title": "【最終84位 M-5 メガバシャーモ軸】",
  "url": "https://…",
  "publishedAt": "2026-09-12",
  "team": [{ "pokemon": "blazikenmega", "item": "blazikenite" }, "… 여섯 마리"],
  "review": {
    "status": "pending",
    "checkedAt": "오늘 날짜",
    "teamImage": "https://… (판정에 쓴 이미지의 원래 주소, images[]에서)",
    "teamEvidence": "무엇과 무엇을 대조했고 무엇을 제외했는지 한두 문장, 자체 문장",
    "rankEvidence": "순위를 어디서 확인했는지 한 문장"
  }
}
```

- `id`는 `<시즌 소문자>-<형식 소문자>-<작성자 슬러그>`. 이미 있으면 뒤에 `-<순위>`.
- `author`는 블로그 이름(`siteName`)이 아니라 작성자 이름이다. `excerpt`나 본문 서명에서 읽는다.
- `title`은 원문 제목 그대로, 근거 문장은 원문을 옮기지 않고 한국어로 새로 쓴다.
- `updatedAt`을 오늘 날짜로 바꾼다.

**3-2 파티 기사가 아님 → `scripts/article-skip.json`의 `skipped`에 추가**

```json
{ "url": "https://…", "reason": "시즌 중간 기록, 최종 파티 아님", "checkedAt": "오늘 날짜" }
```

파티 기사가 아닌 글, 다른 시즌·형식, 월간 챌린지 성적만 있는 글, 최종 파티를 공개하지
않은 글. 수집기는 이 주소를 다시 큐에 올리지 않는다.

**3-3 판단 불가 → 사람 검토 목록으로**

`leads/review-<시즌>.txt`에 한 줄 추가(`순위<탭>판정 보류<탭>주소<탭>이유`)하고, 같은
주소를 3-2처럼 `article-skip.json`에도 넣는다(`reason`은 `사람 검토로 넘김: …`).
이미지가 없음, 본문과 이미지가 충돌, 도구 일부를 알 수 없음 같은 경우다.

### 4. 검증과 보고

```
node --test tests/articles.test.mjs
```

통과하지 않으면 고친다. 끝나면 사람에게 표로 보고한다: 기사마다 순위·작성자·결과(추가/
제외/보류)·한 줄 이유. 추가한 기사는 여섯 마리와 도구를 한국어 이름으로 함께 적는다.

## 사람이 하는 일

보고를 보고 원문 링크를 열어 맞는지 확인한 뒤 `review.status`를 `reviewed`로 바꾼다
([articles.md](articles.md) 6번). 앱에는 `reviewed`만 보인다. 틀린 기록은 고치거나 지운다.
