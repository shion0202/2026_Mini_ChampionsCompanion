# 내 샘플 — 인수인계

`docs/builds-and-sync.md`가 설계이고 이 문서는 **지금 어디까지 왔고 다음에 무엇을
하면 되는지**만 적는다. 다른 대화에서 이어받을 때 이 문서부터 읽는다.

## 지금 상태

| 단계 | 상태 |
| --- | --- |
| 1 로컬 저장 | 완료 |
| 2 배포 | **완료** — https://2026-mini-championscompanion.pages.dev/ |
| 2 APK | **완료** — 실제 폰에서 주소창 없이 열림 |
| 3 동기화 | **완료** |
| 4 공유 링크 | **완료** |

배포는 Cloudflare Pages가 GitHub 저장소를 받아 `npm run build`로 `dist/`를 만든다.
`main`에 올리면 다시 배포된다. 실제 폰에서 오프라인으로 열리는 것까지 확인했다
(새 통계는 못 받아도 저장해 둔 통계로 연다).

## 2단계 APK

Bubblewrap으로 만들었다. 패키지 이름은 `io.github.shion0202.champions`다. 프로젝트와
서명 키는 저장소 **밖**의 `Documents/champions-apk`에 있다. 키와 비밀번호는 대화에
붙여넣지 않는다.

`.well-known/assetlinks.json`의 지문은 서명된 APK의 공개 인증서에서
`apksigner verify --print-certs`로 꺼냈다. Bubblewrap `build`는 설정에 지문이
등록되지 않으면 이 파일을 만들지 않는다. Google Digital Asset Links 검증을 통과한다.

같은 `android.keystore`로 다시 빌드하면 지문이 같아 이 파일을 고치지 않는다. 키를
새로 만들면 지문이 바뀐다. 앱 내용은 사이트 배포로 바뀌므로 APK를 다시 만들 일은
거의 없다.

## 3단계 동기화

`functions/api/[[path]].js`가 `/api/doc`을, `src/sync.js`가 앱 쪽 판단을 맡는다.
KV 바인딩 `BUILDS`(네임스페이스 `champions-builds`)가 Production과 Preview에 모두
있어야 한다. 없으면 서버가 503 `storage not bound`를 돌려준다.

Functions는 로컬 `npm run dev`에서 돌지 않는다. 서버 판단은
`tests/sync-server.test.mjs`가 가짜 KV로 검사하고, 실제 동작은 브랜치를 올려 만든
미리보기 배포에서 본다.

무료 플랜 한도를 2026-09-25에 현재 문서로 다시 확인했다.

| 항목 | 무료 플랜 |
| --- | --- |
| KV 읽기 | 하루 10만 회 |
| KV 쓰기 | 하루 1,000회 |
| 같은 키에 쓰기 | **초당 1회** |
| Functions 요청 | Workers와 합쳐 하루 10만 회. 정적 파일은 세지 않는다 |
| 값 하나 | 최대 25 MiB |

설계에 없던 것은 **같은 키에 초당 1회**다. 문서를 `doc:<코드>` 하나에 통째로
두므로 1초 안에 두 번 저장하면 두 번째가 거절된다. 그래서 앱은 연속 저장을 모아
한 번에 하나만 보내고(`createUploader`), 거절되면 몇 번 다시 보낸다.

## 4단계 공유 링크

같은 `functions/api/[[path]].js`가 `/api/share`를 맡고, KV 키는 `share:<id>`다.
Cloudflare 쪽 설정은 3단계의 `BUILDS` 바인딩 그대로다. 스냅샷은
`src/builds.js`의 `shareSnapshot`·`readShare`, 통신은 `src/sync.js`의
`createShare`·`pullShare`, 화면은 `src/builds-view.js`의 `shareView`가 만든다.
기한은 서버의 `SHARE_DAYS` 한 곳에서 바꾼다. 규칙은 `docs/builds-and-sync.md`의
`저장과 동기화` 끝 문단에 있다.

## 미룬 것

- **드래그로 기술 순서 바꾸기** — 로드맵(2~4단계) 뒤에 한다. 지금은 같은 기술을
  다시 골라 자리를 맞바꾸는 방식으로 순서를 바꿀 수 있다.

폴더 기능은 당분간 고려하지 않는다. 필요해지면 그때 요청이 온다.

## 알고 있는 구멍

- **`scripts/verify-builds-browser.mjs`는 한 번도 실행된 적이 없다.** Playwright가
  없어서다. `docs/verification.md`에 그렇게 적혀 있다. 브라우저 확인은 전부 손으로
  했다. 이 스크립트를 살릴 거라면 Playwright를 먼저 넣어야 한다.
- 샘플·파티 화면의 브라우저 동작(고르기 창, 초안 복구, 뒤로 가기)은 자동 회귀
  검사가 없다. 순수 함수는 `tests/builds.test.mjs`가, 마크업은
  `tests/builds-view.test.mjs`의 스냅샷이 잡지만 **이벤트 배선은 아무도 안 잡는다.**
  실제로 이 구멍 때문에 놓친 버그가 있었다(`type`을 빼먹은 단추가 폼을 보내
  편집기가 닫히던 것). 그 뒤로 마크업 쪽에 보호 테스트를 하나 넣어 뒀다.

## 코드를 건드릴 때 알아야 할 것

설계 문서에 흩어져 있지만 틀리기 쉬워서 다시 적는다.

- `src/builds.js`와 `src/builds-view.js`는 **DOM을 쓰지 않는다.** 상태 보관과
  이벤트 배선은 `src/app.js` 혼자 한다.
- 저장하는 값의 종류가 섞여 있다. `pokemon`과 `nature`는 **id**(`charizard`,
  `adamant`)이고 `item`·`ability`·`moves`·`altMoves`는 **영문 이름**(`Choice Scarf`,
  `Dragon Claw`)이다. `learnset`은 id를 담고 도감 전체 목록은 이름을 담는다.
  이 둘을 섞어서 기술 맞바꿈이 통째로 죽은 적이 있다.
- 한국어 이름은 `reference[category][toId(name)].label`을 **먼저** 본다.
  `locale.label()`은 ko.json이 비어 있는 항목이 있어 뒷받침으로만 쓴다.
- 포켓몬 그림은 `images.js`의 `speciesSprite` 한 곳에서 찾는다. 인덱스에 없는
  폼은 사이트 별칭으로, 그래도 없으면 같은 종족의 다른 폼 그림으로 채운다.
- 메가 판정은 `data.js`의 `isMegaForme`를 쓴다. `forme.startsWith('Mega')`는
  `M-Mega`처럼 성별이 앞에 붙는 메가냐오닉스를 놓친다.
- 새 조작을 만들 때 모양을 새로 짜지 말고 이미 있는 것을 부른다. 정렬 줄은
  `.ranking-controls`, 거르개는 `filterGroup`과 `#filter-dialog`, 도구 그림은
  `itemArtwork`, 포켓몬 그림은 `portrait`다.
