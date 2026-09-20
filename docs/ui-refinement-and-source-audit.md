# 화면 개선 및 출처 조사 (2026-09-20)

## 이번 반영

- 시즌 선택에 확인된 레귤레이션을 괄호로 표시한다. M1/M2는 M-A, M3/M4/M5는 M-B, M6는 M-C. 미래 시즌을 번호로 추정하지 않는다.
- 헤더 순서는 앱 설치, 테마, 안내, 새로고침. 테마 폭을 넓히고 새로고침을 가운데 정렬한 SVG로 변경했다. 480px 이하에서는 브랜드 글자를 생략해 터치 영역을 확보한다. 설치 버튼은 설치 가능한 환경에서만 표시한다.
- 랭킹은 정렬 선택, 44px 높이의 작은 방향 버튼, 필터 버튼 한 줄이다. 세대/타입/즐겨찾기는 팝업에서 적용한다. 닫기와 Escape는 변경을 취소하고 초기화는 팝업의 선택만 비우며 적용 후 반영한다. 적용한 조건 수와 요약을 목록에 표시한다.
- 배우는 기술도 검색과 필터 버튼만 남겼다. 타입/물리·특수·변화는 같은 팝업 구조를 사용한다. 위력 범위, 명중률, 베기/구슬 등의 새 필터는 이번 범위에 포함하지 않는다.
- 모바일 도구 모음과 상세 패널 사이 간격을 확보했다. 메가 폼에서도 ‘사용 순위’를 유지한다. 기본 정보는 신체 정보, 특성, 능력치, 방어상성의 경계에만 구분선을 둔다.
- 타입 기준 배율과 타입별 특성 적용 배율을 같은 카드에 표시한다. 관련 특성이 없으면 추가 행 자체가 없다. 멀티스케일, 물리/특수 구분, 접촉 등 전 타입/기술 조건 보정은 화면에서 제외했다. 날씨와 개별 기술 예외를 계산하지 않는다.
- 약점/반감은 타입 기준 배율의 내림차순이다. 기본 1배이지만 특성으로 바뀌는 항목은 접힌 1배 목록에 숨기지 않고 관련 그룹에 표시한다. 특성 이름을 누르면 효과 팝업을 연다.
- ‘1배 상성 보기’, ‘합산/원본’으로 변경했다. 개별 배분은 주요 투자 대문자와 소량 조정 소문자로 표현한다. 기준은 min(16, 최대 투자량×0.75)이며 양수만 표기한다. H20/C19/S20은 HCS, H22/B11/C1/S32는 HS + bc다. 같은 32포인트 능력치 집합만 합산하는 기존 규칙은 유지한다.
- 10% 이상 비율은 색, 굵기, 배경으로 강조한다. 0%와 미제공 비율은 강조하지 않는다.
- 요청한 문구를 삭제/축약하고 반복 출처 링크를 안내 팝업으로 모았다. 자료 날짜, API 생성 및 실제 기기 조회 시각은 유지한다.

## 시즌 근거

- [M1 공식 공지](https://champions-news.pokemon-home.com/en/page/746.html)
- [M2 공식 공지](https://champions-news.pokemon-home.com/en/page/760.html)
- [M3 공식 소개](https://www.pokemon.com/uk/news/regulation-set-m-b-kicks-off-a-new-ranked-battles-season-and-battle-pass-in-pokemon-champions)
- [M4 공식 공지](https://champions-news.pokemon-home.com/en/page/795.html)
- [M5 공식 공지](https://champions-news.pokemon-home.com/en/page/803.html)
- [M6 공식 공지](https://champions-news.pokemon-home.com/en/page/822.html)

## 이미지 조사 결과

현재 앱의 메가 이미지는 Showdown gen5 스타일, 도구는 PokéAPI 기본 이미지다. 챔피언스 전용 이미지가 아니므로 사용자가 지적한 차이가 있다. 이번에는 대체 자료를 조사했으며 이미지 연결은 변경하지 않았다.

- [PokéAPI 이미지 저장소](https://github.com/PokeAPI/sprites)의 `sprites/pokemon/versions/generation-ix/champions`에 353개 일반색 PNG와 shiny 디렉터리가 있다. 최근 반영 커밋 `2ecb4eeacd5a1718621fc30f12772e3f60d830b9`은 Regulation M-C 이미지 추가다. 일반 gen5 스타일보다 챔피언스 화면에 맞는 후보이나, PokéAPI는 포켓몬 공식 운영사의 이미지 API가 아니다. 모든 앱 폼의 ID 대응과 이미지 일치 검증은 아직 하지 않았다.
- 현재 통계 제공처의 공개 프런트엔드는 `pokemon_champions_assets/items/{영문 이름}.png`를 사용한다. Salamencite와 Life Orb는 HTTP 200과 PNG 응답을 확인했다. 기존 PokéAPI 기본 도구 이미지의 대체 후보이나, 모든 도구의 수록 여부와 인게임 일치 여부는 전수 검증하지 않았다.
- 같은 제공처의 `pokemon/Salamence-Mega.png`, `pokemon/Dragonite-Mega.png`는 404였다. 기본 포켓몬과 같은 URL 규칙으로 모든 메가 이미지를 얻을 수 있다고 가정하면 안 된다.
- 공식 웹사이트와 공개 배틀 규칙 페이지에서 재사용 가능한 범용 이미지 API는 확인하지 못했다. 공식 게임에 쓰인 자산과 공식 운영사가 외부 개발자용으로 배포하는 API는 구분한다.

## 배우는 기술의 신뢰도

현재 데이터는 일반 세대의 Showdown 기술표가 아닌 [Champions 전용 learnsets](https://github.com/smogon/pokemon-showdown/blob/2ddfa0476f8207e12e204b1c69f7c7683b17633c/data/mods/champions/learnsets.ts)를 사용한다. 게임에서 사용 가능한 기술 플래그와 일부 폼의 보완에는 [Project Pokémon champout](https://github.com/projectpokemon/champout/tree/50e7233b78c3b81df29563f9695386c28e77fc95/masterdata)을 사용한다. 두 출처 모두 비공식이며 버전을 고정해 변경을 추적한다.

이번 일회성 대조는 현재 수록된 기술 목록 371개 폼을 대상으로 했다. 전국번호, 여섯 종족값, 몸무게가 일치하는 게임 personal 행을 찾고, 대응 행들의 사용 가능한 기술 목록이 모두 같은 경우에만 비교했다. **361개 폼이 대응되었고 361개 모두 기술 목록이 일치했다.** 이 중 일부는 원래 champout에서 보완한 목록이므로 전부 독립적인 교차 검증이라고 해석하면 안 된다.

남은 10개는 히트/워시/프로스트/스핀/커트 로토무, 수컷/암컷 냐오닉스, 스트린더 두 폼, 모르페코다. 위의 보수적 매칭으로 대응을 확정할 수 없어 미검증으로 남겼으며 오류로 판정한 것은 아니다. 이 결과는 해당 고정 버전의 기술 목록 비교이고, 최신 인게임 전수 검증이나 시즌별 출전 허용 검증을 의미하지 않는다. 검사 원본과 결과는 개발용 `.cache/research-*`, `.cache/learnset-audit.json`에 임시 저장했다.
