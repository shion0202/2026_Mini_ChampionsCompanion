# 구축 기사 판정 절차 (3단계)

판정은 **검토 화면에서 사람이 한다.** 로컬 AI는 팀 이미지를 보고 제안 파일만 쓰고(아래
`AI 제안`), 검토 화면이 그 제안을 미리 채운다. 등록 기준은 [articles.md](articles.md)가 정한다.

## 검토 화면 (기본)

```
npm run review -- --season M5
```

브라우저로 <http://localhost:4180>을 연다. 이 컴퓨터에서만 열린다. 종료는 Ctrl+C.

- 기사를 하나씩 띄운다. 이미 기록된 `pending`이 먼저, 그다음 큐(사람이 고른 주소 먼저,
  순위순)다. 기록했거나 제외한 주소는 나오지 않는다.
- 왼쪽: 수집기가 받아 둔 팀 이미지. 팀이 보이는 이미지를 눌러 고른다(`teamImage`).
  받은 이미지가 없으면 원문(↗)을 열어 보고 이미지 주소를 붙여 넣는다.
- 오른쪽: 작성자·순위·시즌·형식·제목과 여섯 칸이 미리 채워져 있다. 여섯 칸은 본문 후보
  중 챔피언스 포켓몬 상위 여섯을 본문 순서로, 도구는 가장 가까이 적힌 것을 넣은 것이다.
  이미지와 다른 칸만 고친다. 아래 후보 칩을 누르면 선택한 칸에 들어가고, 메가를 넣으면
  메가스톤이 채워진다. `목록:`은 포케DB 카드처럼 링크 옆에 있던 글(순위, 작성자)이다.
- 작성자는 주소의 아이디로 채워 둔다. 기사에 적힌 이름으로 고친다.
- 같은 글은 한 번만 나온다. 주소가 `http`/`https`, `www.`, 끝의 `/`만 다르면 같은 글로 본다
  (포케DB 목록과 작성자 피드가 같은 글을 다른 주소로 가져온다). 같은 블로그의 다른 기사가
  이미 기록되어 있으면 주황 안내가 뜬다. 다른 시즌·더블 기사일 수 있어 막지는 않는다.
  같은 글이면 [제외]에서 `이미 등록한 기사와 같은 글`을 고른다.
  이미 기록된 쪽이 블로그 첫 페이지 주소(`blog.livedoor.jp/아이디/`, `note.com/아이디`)면
  **[이 기록을 지금 기사 주소로 옮기기]**가 나온다. 누르면 그 기록의 주소가 지금 기사 주소로
  바뀌고 이 기사는 목록에서 빠진다. 첫 페이지는 최신 글을 보여 줄 뿐이라 새 글이 올라오면
  다른 글이 되기 때문이다.
- 원문이 열리지 않으면(인증서 경고, 삭제) 제목 옆 **사본 보기**로 수집기가 받아 둔 사본을
  연다. 스크립트는 돌지 않고, 이미지는 원래 주소에서 불러온다. 사본은 이 컴퓨터의
  `.cache/`에만 있다.
- 도구를 모르면 칸을 비운다. 빈칸이 있으면 추가되지 않는다(모름을 없음으로 바꾸지 않는다,
  [articles.md](articles.md) 4번). 도구가 없음이 확인되면 `도구 없음`을 고른다.

단추:

| 단추 | 결과 |
| --- | --- |
| 추가 (공개) | `articles.json`에 `reviewed`로 기록. 앱에 바로 보인다 |
| pending으로 추가 | 나중에 다시 볼 기록. 검토 화면 맨 앞에 다시 나온다 |
| 제외 | 이유와 함께 `scripts/article-skip.json`에. 다시 큐에 오르지 않는다 |
| 건너뛰기 | 아무것도 쓰지 않고 다음으로 |

저장 전에 앱과 같은 형식 검사를 돌리고, 틀린 곳(주소가 https가 아님, 같은 포켓몬 두 번,
목록에 없는 이름 등)을 알려 준다. 끝나면 `node --test tests/articles.test.mjs`를 돌리고
`articles.json`과 `article-skip.json`을 커밋한다.

## AI 제안 (로컬 AI, 선택)

본문 글자로 여섯 마리를 추측하면 거의 모든 파티를 고쳐야 했다. 기사 본문에는 구축 경위와
상대 포켓몬이 섞이고, 도구는 결과 화면 이미지에만 있는 일이 많기 때문이다. 그래서 **로컬
AI(Claude Code 등)가 팀 이미지를 보고 제안 파일을 쓰고**, 검토 화면이 그 제안을 미리
채운다. 기록과 공개는 여전히 사람이 검토 화면에서 한다. AI는 `articles.json`을 고치지 않는다.

요청 예:

> docs/article-judging.md의 "AI 제안" 절차대로 .cache/article-queue-m5.json 앞에서 10건의
> 제안을 .cache/article-proposals-m5.json에 써 줘

### 포케솔은 스크립트가 먼저 쓴다

```
npm run propose -- --season M5 [--limit 10]
```

포케솔(pokesol.app) 기사는 본문에 작성자가 넣은 포켓몬 카드(포켓몬·도구 번호)와 이름 표가
페이지 데이터에 들어 있다. 스크립트가 받아 둔 사본만 읽어 제안을 쓴다. 이미지를 보지 않으니
토큰이 들지 않는다. M-5에서 사람이 확정한 13건과 156칸 중 155칸이 일치했다(나머지 1칸은
카드가 イダイトウ(♀)인데 기록이 수컷).

- 카드가 여섯 장이 아니거나(0장, 1~2장, 예전 멤버까지 7장) 기사 설정 시즌이 다르면
  `unsure`로 쓰고 이유를 `note`에 남긴다. 이 기사만 로컬 AI가 본문 글자를 읽어 고친다.
  본문의 `포켓몬@도구` 줄, "~에서 교대" 같은 경위를 보고, 그래도 모르면 이미지를 본다.
- 이미 제안이 있는 주소는 건너뛴다. 다시 쓰려면 제안 파일에서 그 항목을 지운다.
- 폼 이름 표(`POKESOL_FORMS`)는 `scripts/article-parse.mjs`에 있다. 비운 칸에 폼 이름이
  보이면 거기에 더한다.

포케솔이 아닌 기사(note, 하테나 등)는 아래 절차대로 로컬 AI가 쓴다. 이미지보다 먼저
사본의 `@`·`持ち物` 줄을 찾아 보면 이미지를 열지 않아도 되는 일이 많다.

### 입력

- `.cache/article-queue-<시즌>.json`의 `entries[]`: `url`, `title`, `rank`(목록·제목에서 읽은
  순위), `leadText`(포케DB 카드 글), `images[]`(원래 주소)와 같은 순서의 `imageFiles[]`
  (받아 둔 파일, 없으면 null), `candidates[]`(본문 후보, 참고용), `flags`.
- 원문 사본: `.cache/articles/<주소의 sha1>.html`. UTF-8로 풀어 둔 것이다.
- 이미 처리한 주소는 건너뛴다: `public/data/articles.json`의 `url`, `scripts/article-skip.json`의
  `skipped[].url`, 이미 제안 파일에 있는 `url`.

### 원칙

- **원문 사이트에 접속하지 않는다.** `.cache`의 파일만 본다. 수집기가 robots.txt로 거른 범위를
  벗어나지 않기 위해서다.
- 팀 이미지가 근거다. 인게임 화면은 둘이 흔하다.
  - 스테이터스 화면: 여섯 마리 이름이 글자로 있고 능력치가 보인다. 도구는 없다.
  - 결과(시즌 성적) 화면: 순위·레이트, 오른쪽에 여섯 마리와 **도구 아이콘**이 있다.
  - 작성자가 만든 파티 이미지: 이름·도구·기술이 적혀 있다.
  트레이너 카드의 다른 팀, 상대 파티, 과거 시즌 화면은 쓰지 않는다. 이미지의 별명을 종
  이름으로 읽지 않는다.
- **모르는 칸은 비운다(`""`).** 추측으로 채우지 않는다. 사람이 이미지를 보고 채운다. 도구가
  없음이 확인된 경우만 `null`.
- 이미지가 부족하면 원문 사본에서 필요한 부분(개별 해설의 `持ち物`, `@` 표기)만 찾아 본다.
- 결과 화면의 시즌·배틀 룰·순위가 보이면 그것으로 시즌·형식·순위를 확인한다.

### 키 찾기

키는 `public/data/reference.json`의 키다. 메가는 최종 메가 폼 키(`charizardmegay`)와
메가스톤(`charizarditey`)을 쓴다.

```
node -e "const r=require('./public/data/reference.json');console.log(Object.keys(r.species).filter(k=>k.includes('garchomp')))"
node -e "const r=require('./public/data/reference.json');console.log(Object.entries(r.held_item).filter(([k,v])=>v.japanese?.includes('スカーフ')).map(([k])=>k))"
node -e "const r=require('./public/data/reference.json');const ko=require('./public/data/ko.json');console.log(Object.entries(ko.japanese.pokemon).filter(([k,v])=>v.includes('バシャーモ')))"
```

### 출력

`.cache/article-proposals-<시즌>.json`. 있으면 끝에 더하고, 같은 `url`은 새 것으로 바꾼다.

```json
{
  "proposals": [
    {
      "url": "큐의 url 그대로",
      "verdict": "party",
      "author": "기사·카드에 적힌 작성자 이름",
      "rank": 88,
      "season": "M5",
      "format": "Singles",
      "teamImage": "판정에 쓴 이미지의 원래 주소(images[] 중 하나)",
      "team": [
        { "pokemon": "sceptile", "item": "" },
        { "pokemon": "hippowdon", "item": "rockyhelmet" }
      ],
      "note": "결과 화면 이미지에서 여섯 마리와 도구 확인. 1번 도구 아이콘이 흐려 비움."
    }
  ]
}
```

- `verdict`: `party`(파티를 읽음), `not-party`(파티 기사가 아님, 다른 시즌·게임, 최종 파티
  미공개), `unsure`(판단 불가). `not-party`·`unsure`는 `team` 없이 `note`에 이유만 적는다.
- `team`은 이미지 순서대로 여섯 칸. 모르는 포켓몬·도구는 `""`.
- 쓴 뒤 `node -e "JSON.parse(require('fs').readFileSync('.cache/article-proposals-m5.json','utf8'))"`로
  JSON이 깨지지 않았는지 확인한다.

### 보고

기사마다 순위·작성자·verdict·비운 칸 수를 표로 짧게 보고한다. 사람은 `npm run review`를 열어
제안이 채워진 화면(주황 `AI 제안` 표시와 `AI 메모`)을 보고 확정한다.
