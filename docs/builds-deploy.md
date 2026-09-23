# 2단계 — 배포와 APK 실행 절차

설계는 `docs/builds-and-sync.md`의 `배포와 APK` 절에 있다. 이 문서는 **무엇을 어떤
순서로 누르고 무엇으로 확인하는지**만 적는다. 1단계 상태는
`docs/builds-handoff.md`에 있다.

이 단계를 끝내야 처음 요구였던 “PC가 꺼져 있어도 모바일에서 열린다”가 실제로
된다. 서비스 워커가 HTTPS를 요구하므로 배포를 건너뛸 수 없다.

## 시작 전 상태 (확인 완료)

배포 전에 코드에서 막힐 것이 있는지 미리 봤다. 다음은 확인한 결과다.

| 확인한 것 | 결과 |
| --- | --- |
| `manifest.webmanifest` 설치 기준 | 이름·short_name·`display: standalone`·192/512 아이콘 모두 있음 |
| 아이콘 파일 실재 | `public/icons/`에 세 개 모두 있음 |
| `sw.js` 사전 캐시 목록 | 실제 파일과 일치. 빠진 파일도, 없는 파일을 가리키는 항목도 없음 |
| 통계 API의 CORS | `Access-Control-Allow-Origin: *`. 어느 도메인에서 열어도 막히지 않음 |
| 혼합 콘텐츠 | `http://` 참조 없음. HTTPS에서 차단될 자원 없음 |
| 서비스 워커 등록 | `window.isSecureContext` 뒤에 있어 로컬에서도 안전하게 건너뜀 |

코드 쪽에 추가로 손볼 것은 없다. 남은 것은 전부 바깥 작업이다.

## 무엇을 누가 하는가

서명 키 생성, 계정 만들기, 기기 설치는 **사람이 해야 한다.** 키와 자격 증명은
대화에 붙여넣지 않는다. 지문(SHA-256)은 비밀이 아니므로 공유해도 된다.

## 1. Cloudflare Pages 배포

저장소를 연결하고 아래를 넣는다.

| 항목 | 값 |
| --- | --- |
| 빌드 명령 | `npm run build` |
| 출력 디렉터리 | `dist` |
| 루트 디렉터리 | (비움) |

`dist`로 정한 이유는 저장소 루트를 그대로 서빙하면 `docs/`, `tests/`, `scripts/`가
함께 공개되기 때문이다. `scripts/build.mjs`는 앱 파일과 함께 `_headers`, 그리고
있으면 `.well-known`도 `dist/`로 복사한다. 무엇이 복사됐는지 빌드 로그에 찍힌다.

`_headers`는 `sw.js`와 `index.html`을 `no-cache`로 둔다. 이게 없으면 사이트를 새로
배포해도 기기에서 옛 앱이 계속 열린다.

확인:

- 배포된 주소를 열어 랭킹이 보이는가
- 개발자 도구 Application에 서비스 워커가 activated로 있는가
- 비행기 모드로 바꾸고 새로 고쳐도 앱 껍데기가 열리는가

## 2. 서명 키와 `.well-known/assetlinks.json`

Bubblewrap이 키를 만들고 지문을 알려준다. 이미 키가 있으면 지문만 꺼낸다.

```bash
keytool -list -v -keystore <키스토어 경로> -alias <별칭>
```

출력에서 `SHA256:` 줄을 쓴다. 그 값으로 저장소 루트에 파일을 만든다.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "<Bubblewrap에 넣은 패키지 이름>",
      "sha256_cert_fingerprints": ["<SHA256: 뒤의 값>"]
    }
  }
]
```

경로는 `.well-known/assetlinks.json`이다. 커밋하면 다음 배포부터 함께 올라간다.

**지문을 얻기 전에는 이 파일을 미리 만들지 않는다.** 값이 틀린 파일은 없는 것과
같은 결과(주소창이 보임)를 내면서 원인만 가린다.

확인:

```bash
curl -s https://<배포 도메인>/.well-known/assetlinks.json
```

JSON이 그대로 나오고 `content-type`이 `application/json`이어야 한다.

## 3. Bubblewrap으로 APK

```bash
npx @bubblewrap/cli init --manifest https://<배포 도메인>/manifest.webmanifest
npx @bubblewrap/cli build
```

`init`이 묻는 것 중 중요한 둘은 패키지 이름과 키스토어다. 패키지 이름은 2번의
`package_name`과 **글자 그대로 같아야 한다.**

확인은 실제 기기에서만 된다.

- 기기에서 ‘알 수 없는 출처’ 설치를 허용한다
- 앱을 열었을 때 **주소창이 보이지 않아야 한다.** 보이면 assetlinks 검증이 실패한
  것이다. 패키지 이름과 지문을 다시 맞춘다
- 비행기 모드에서 열리는가 (첫 실행은 연결이 필요하고 그 뒤부터 캐시로 열린다)

## 그 뒤

앱을 고쳐도 APK를 다시 만들지 않는다. 사이트를 배포하면 반영된다. 키 관리와
재설치 부담이 없는 것이 TWA를 고른 이유다.

## 이 단계에서 다루지 않는 것

- 3단계 동기화(Functions와 KV)와 4단계 공유 링크는 배포가 선 뒤에 한다.
- `public/data/showdown-license.txt`는 `index.html`에서 링크로만 걸려 있고 사전
  캐시 목록에 없다. 연결이 없을 때 이 링크만 열리지 않는다. 화면 동작에는 영향이
  없어 그대로 둔다.
